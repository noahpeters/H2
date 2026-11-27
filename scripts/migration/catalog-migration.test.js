import {describe, expect, it} from 'vitest';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  collectPages,
  createShopifyClient,
  exportShopify,
  referencedIds,
  requirePrivateOutput,
} from './shopify-export.mjs';
import {
  mapChannel,
  parseDelimited,
  reconcileSheet,
  sheetVariations,
  selectTableTabs,
} from './catalog-map.mjs';

describe('read-only Shopify export', () => {
  it('collects nested connections beyond a single page without dropping records', async () => {
    const rows = await collectPages(async (after) => ({
      nodes: Array.from({length: after ? 7 : 100}, (_, i) => ({
        id: String(i + (after ? 100 : 0)),
      })),
      pageInfo: {hasNextPage: !after, endCursor: after ? 'done' : 'next'},
    }));
    expect(rows).toHaveLength(107);
    await expect(
      collectPages(async () => ({
        nodes: [{id: 'x'}],
        pageInfo: {hasNextPage: true, endCursor: 'same'},
      })),
    ).rejects.toThrow('repeated node');
  });

  it('does not treat missing connections or inaccessible references as empty success', async () => {
    await expect(collectPages(async () => null)).rejects.toThrow(
      'Missing connection',
    );
    expect(
      referencedIds({
        value: '["gid://shopify/Metaobject/12","gid://shopify/GenericFile/34"]',
      }),
    ).toEqual(['gid://shopify/Metaobject/12', 'gid://shopify/GenericFile/34']);
  });

  it('refuses mutations, non-Shopify hosts, HTTP errors, version fall-forward and GraphQL partial errors', async () => {
    expect(() =>
      createShopifyClient({domain: 'evil.invalid', token: 'private'}),
    ).toThrow('shop domain');
    const client = (response) =>
      createShopifyClient({
        domain: 'test.myshopify.com',
        token: 'private',
        fetchImpl: async () => response,
      });
    await expect(client(new Response('{}'))('mutation { x }')).rejects.toThrow(
      'Only GraphQL queries',
    );
    await expect(
      client(new Response('{}'))('query { x } mutation Bad { x }'),
    ).rejects.toThrow('Only GraphQL queries');
    await expect(
      client(new Response('{}', {status: 401}))('query { x }'),
    ).rejects.toThrow('HTTP 401');
    await expect(
      client(
        new Response('{}', {headers: {'x-shopify-api-version': '2099-01'}}),
      )('query { x }'),
    ).rejects.toThrow('API version');
    await expect(
      client(
        Response.json({data: {products: []}, errors: [{message: 'denied'}]}),
      )('query { x }'),
    ).rejects.toThrow('denied');
    await expect(
      requirePrivateOutput(join(process.cwd(), 'public', 'source.json')),
    ).rejects.toThrow('outside the repository');
  });

  it('archives cyclic references once, records inaccessible references, and retains failed manifests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'h2-export-test-'));
    const page = (nodes) => ({
      nodes,
      pageInfo: {hasNextPage: false, endCursor: null},
    });
    const objectId = 'gid://shopify/Metaobject/8';
    const fileId = 'gid://shopify/GenericFile/9';
    let referencesRead = 0;
    const client = async (query) => {
      if (query.includes(' shop {')) return {shop: {id: 'shop'}};
      if (query.includes(' products(first'))
        return {products: page([{id: 'product', handle: 'test'}])};
      if (query.includes(' variants(first'))
        return {node: {variants: page([{id: 'variant', sku: 'A'}])}};
      if (query.includes(' media(first')) return {node: {media: page([])}};
      if (query.includes('metafields(identifiers'))
        return {node: {metafields: [{value: objectId}]}};
      if (query.includes(' collections(')) return {collections: page([])};
      if (query.includes(' pages(')) return {pages: page([])};
      if (query.includes(' blogs(')) return {blogs: page([])};
      if (query.includes(' menu(')) return {menu: null};
      if (query.includes(' nodes(ids:')) {
        referencesRead++;
        return {
          nodes:
            referencesRead === 1
              ? [
                  {
                    id: objectId,
                    fields: [{value: JSON.stringify([objectId, fileId])}],
                  },
                ]
              : [null],
        };
      }
      throw new Error('Unexpected fixture query');
    };
    try {
      const manifest = await exportShopify({
        client,
        source: 'storefront',
        output: join(root, 'success'),
      });
      expect(manifest.unresolvedReferences).toEqual([fileId]);
      expect(referencesRead).toBe(2);
      expect(manifest.files['products.json'].records).toBe(1);
      expect(manifest.files['products.json'].sha256).toHaveLength(64);
      await expect(
        exportShopify({
          client: async () => {
            throw new Error('scope denied');
          },
          source: 'admin',
          output: join(root, 'failed'),
        }),
      ).rejects.toThrow('scope denied');
      const failed = JSON.parse(
        await readFile(join(root, 'failed/manifest.json'), 'utf8'),
      );
      expect(failed.status).toBe('failed');
      expect(failed.files).toEqual({});
      await expect(
        exportShopify({
          client,
          source: 'storefront',
          output: join(root, 'success'),
        }),
      ).rejects.toThrow();
    } finally {
      await rm(root, {recursive: true, force: true});
    }
  });
});

const variation = (sku, id) => ({
  sku,
  shopifyVariantId: `gid://shopify/ProductVariant/${id}`,
  handle: 'table',
  priceCents: 12345,
  selectedOptions: [],
});

describe('variation and advertising identities', () => {
  it('uses only the authoritative STYLE_ tabs by default without changing the raw snapshot', () => {
    const source = {
      sheets: [
        'STYLE_Field',
        'STYLE_Corona',
        'rassouli',
        'Copy of STYLE_Corona',
        'Style_Template',
        'ControlPanel',
      ].map((name) => ({name, values: []})),
    };
    const selected = selectTableTabs(source);
    expect(selected.selectedTabs).toEqual(['STYLE_Field', 'STYLE_Corona']);
    expect(source.sheets).toHaveLength(6);
    expect(() => selectTableTabs(source, ['missing'])).toThrow('authoritative');
  });
  it('preserves text IDs, leading zeros, quotes, commas and multiline descriptions', () => {
    expect(
      parseDelimited(
        'id,sku,description\r\n001,0007,"Oak, \"\"wide\"\"\nTop"\r\n',
      ),
    ).toEqual([{id: '001', sku: '0007', description: 'Oak, "wide"\nTop'}]);
    expect(() => parseDelimited('id,id\na,b')).toThrow('Duplicate');
    expect(() => parseDelimited('id,sku\n"never closed')).toThrow('Unclosed');
  });

  it('uses actual SKU equality as evidence without inventing prefixed ID mappings', () => {
    const rows = mapChannel(
      [variation('0007', '1')],
      [{retailer_id: '0007'}, {retailer_id: 'shopify_US_99_1'}],
      {channel: 'meta', accountId: 'catalog', sourceName: 'source'},
    );
    expect(rows[0].status).toBe('verified_from_export');
    expect(rows[0].externalId).toBe('0007');
    expect(rows[1].status).toBe('unmatched');
    expect(rows[1].shopifyVariantId).toBeNull();
  });

  it('rejects ambiguous duplicate SKUs, contradictory evidence and numeric IDs', () => {
    const vars = [variation('same', '1'), variation('same', '2')];
    expect(
      mapChannel(vars, [{retailer_id: 'same'}], {channel: 'meta'})[0].status,
    ).toBe('ambiguous');
    expect(
      mapChannel(
        [variation('a', '1'), variation('b', '2')],
        [{id: 'a', shopify_variant_id: '2'}],
        {channel: 'meta'},
      )[0].status,
    ).toBe('conflict');
    expect(() => mapChannel(vars, [{id: 123}], {channel: 'google'})).toThrow(
      'as text',
    );
    expect(
      mapChannel([variation('#N/A', '3')], [{id: '#N/A'}], {channel: 'meta'})[0]
        .status,
    ).toBe('unmatched');
    expect(
      mapChannel(
        [variation('#N/A (No match.)', '3')],
        [{id: '#N/A (No match.)'}],
        {channel: 'meta'},
      )[0].status,
    ).toBe('unmatched');
  });

  it('preserves Google scope and distinguishes matching from complete verification', () => {
    const result = mapChannel(
      [variation('a', '1')],
      [
        {
          offerId: 'a',
          feedLabel: 'USD-OLD',
          contentLanguage: 'en',
          name: 'accounts/99/products/a',
        },
      ],
      {channel: 'google', sourceName: 'source'},
    );
    expect(result[0].status).toBe('matched_scope_incomplete');
    expect(result[0].scope.feedLabel).toBe('USD-OLD');
    expect(result[0].providerResourceName).toBe('accounts/99/products/a');
    const duplicates = mapChannel(
      [variation('a', '1')],
      [{retailer_id: 'a'}, {retailer_id: 'a'}],
      {channel: 'meta', accountId: 'catalog'},
    );
    expect(duplicates.map((r) => r.status)).toEqual(['conflict', 'conflict']);
    expect(duplicates.every((r) => r.shopifyVariantId === null)).toBe(true);
    expect(() =>
      mapChannel([variation('a', '1')], [{retailer_id: null, id: 'a'}], {
        channel: 'meta',
      }),
    ).toThrow('not the content ID');
  });

  it('locates sheet headers by label, retains provenance and reports stale prices and copy-tab collisions', () => {
    const values = [
      ['Configuration'],
      [],
      ['Variant SKU', 'VariantPrice', 'Handle'],
      ['0007', 123.45, 'table'],
    ];
    const rows = sheetVariations({
      complete: true,
      spreadsheetId: 'sheet',
      sheets: [
        {name: 'STYLE', values},
        {name: 'Copy', values},
      ],
    });
    expect(rows[0].priceCents).toBe(12345);
    expect(rows[0].source.row).toBe(4);
    const report = reconcileSheet([variation('0007', '1')], rows);
    expect(report.variations[0].sheetStatus).toBe('ambiguous');
    expect(report.duplicateSheetSkus).toHaveLength(1);
    expect(() => sheetVariations({complete: false, sheets: []})).toThrow(
      'complete',
    );
  });
});
