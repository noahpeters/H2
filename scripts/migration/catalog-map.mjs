import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {saveJson} from './shopify-export.mjs';

// All identifiers remain strings. No numeric conversion, SKU decoding, or ID-prefix guessing.
export function parseDelimited(text, delimiter = ',') {
  text = text.replace(/^\uFEFF/, '');
  const rows = [],
    row = [];
  let field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else if (c === undefined) throw new Error('Unclosed quoted field');
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === delimiter || c === '\n' || c === undefined || c === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (c !== delimiter) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some((v) => v !== '')) rows.push(row.splice(0));
        else row.length = 0;
      }
    } else {
      if (closed || c === '"') throw new Error('Malformed quoted field');
      field += c;
    }
  }
  const headers =
    rows.shift()?.map((v, i) => (i === 0 ? v.replace(/^\uFEFF/, '') : v)) ?? [];
  if (new Set(headers).size !== headers.length)
    throw new Error('Duplicate column headers');
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(`Column count differs on record ${i + 2}`);
    return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
  });
}

export const usableSku = (value) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  !/^#(?:N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!|ERROR!)(?:$|\s)/.test(
    value,
  );

function money(value) {
  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.00001 ||
      !Number.isSafeInteger(Math.round(value * 100))
    )
      return null;
    return Math.round(value * 100);
  }
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value))
    return null;
  const [whole, fraction = ''] = value.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(n) ? n : null;
}

export function sheetVariations(snapshot) {
  if (snapshot.complete !== true || !Array.isArray(snapshot.sheets))
    throw new Error('A complete sheet-values snapshot is required');
  const rows = [];
  for (const sheet of snapshot.sheets) {
    const headerIndex = sheet.values.findIndex(
      (row) => row.includes('Variant SKU') && row.includes('VariantPrice'),
    );
    if (headerIndex < 0) continue;
    const headers = sheet.values[headerIndex];
    const styleCells = sheet.values
      .slice(0, headerIndex)
      .find((row) => row.includes('STYLE_CODE'));
    const styleCode = styleCells
      ? styleCells[styleCells.indexOf('STYLE_CODE') + 1]
      : null;
    if (
      new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
    )
      throw new Error(`Duplicate headers in ${sheet.name}`);
    sheet.values.slice(headerIndex + 1).forEach((values, i) => {
      if (!values.some((v) => v !== '' && v !== null)) return;
      const record = Object.fromEntries(
        headers.map((key, j) => [key, values[j] ?? null]),
      );
      const sku = record['Variant SKU'];
      if (typeof sku !== 'string' || !sku)
        throw new Error(
          `Missing text SKU: ${sheet.name}, row ${headerIndex + i + 2}`,
        );
      const priceCents = money(record.VariantPrice);
      rows.push({
        sku,
        handle: record.Handle,
        title: record.Title,
        priceCents,
        compareAtCents: money(record.CompareAtPrice),
        options: [1, 2, 3]
          .filter((n) => record[`Opt${n} Name`])
          .map((n) => ({
            name: record[`Opt${n} Name`],
            value: record[`Opt${n} Value`],
          })),
        table: {
          styleCode,
          seating: record.SeatingCapacity,
          extension: record.Extension,
          topStyle: record.TopStyle,
          species: record.Species,
          seatId: record.Seat_ID,
          extensionId: record.Ext_ID,
          topStyleId: record.Top_ID,
          speciesId: record.Species_ID,
        },
        source: {
          spreadsheetId: snapshot.spreadsheetId,
          sheet: sheet.name,
          row: headerIndex + i + 2,
        },
        issues: [
          ...(priceCents === null ? ['invalid_or_missing_price'] : []),
          ...(!usableSku(sku) ? ['invalid_sku'] : []),
        ],
      });
    });
  }
  return rows;
}

export function selectTableTabs(snapshot, requestedNames) {
  const names =
    requestedNames ??
    snapshot.sheets.filter((s) => /^STYLE_/.test(s.name)).map((s) => s.name);
  if (
    !names.length ||
    names.some((name) => !snapshot.sheets.some((s) => s.name === name))
  )
    throw new Error('No valid authoritative table tabs selected');
  return {
    ...snapshot,
    sheets: snapshot.sheets.filter((s) => names.includes(s.name)),
    selectedTabs: names,
  };
}

export function flattenProducts(products) {
  return products.flatMap((product) =>
    product.variants.map((v) => ({
      shopifyVariantId: v.id,
      shopifyProductId: product.id,
      sku: v.sku || null,
      handle: product.handle,
      title: product.title,
      variantTitle: v.title,
      productType: product.productType || null,
      selectedOptions: v.selectedOptions,
      priceCents: money(v.price?.amount ?? v.price),
      currency: v.price?.currencyCode ?? null,
      compareAtCents: money(v.compareAtPrice?.amount ?? v.compareAtPrice),
      availableForSale: v.availableForSale ?? null,
    })),
  );
}

function indexBy(rows, key) {
  const index = new Map();
  for (const row of rows) {
    const value = key(row);
    if (value !== null && value !== undefined && value !== '')
      index.set(value, [...(index.get(value) ?? []), row]);
  }
  return index;
}

export function reconcileSheet(variations, sheetRows) {
  const bySku = indexBy(sheetRows, (r) => (usableSku(r.sku) ? r.sku : null));
  const result = variations.map((v) => {
    const candidates = usableSku(v.sku) ? (bySku.get(v.sku) ?? []) : [];
    const sourceRows = candidates.filter((r) => r.handle === v.handle);
    const matches = sourceRows.length ? sourceRows : candidates;
    const match = matches.length === 1 ? matches[0] : null;
    const issues = !usableSku(v.sku)
      ? [v.sku ? 'invalid_sku' : 'missing_sku']
      : [];
    if (candidates.length > 1) issues.push('duplicate_sheet_sku');
    if (match && match.handle !== v.handle) issues.push('handle_differs');
    if (match && match.priceCents !== v.priceCents)
      issues.push('price_differs');
    if (
      match &&
      JSON.stringify(match.options) !== JSON.stringify(v.selectedOptions)
    )
      issues.push('options_differ');
    return {
      ...v,
      sheetStatus: match
        ? 'matched'
        : matches.length
          ? 'ambiguous'
          : 'not_found',
      sheetRow: match,
      candidateSources: matches.map((r) => r.source),
      issues,
    };
  });
  return {
    variations: result,
    sheetRowsWithoutShopifySku: sheetRows.filter(
      (r) => !variations.some((v) => v.sku === r.sku),
    ),
    duplicateShopifySkus: [...indexBy(variations, (r) => r.sku)]
      .filter(([, rows]) => rows.length > 1)
      .map(([sku, rows]) => ({
        sku,
        variantIds: rows.map((r) => r.shopifyVariantId),
      })),
    duplicateSheetSkus: [...bySku]
      .filter(([, rows]) => rows.length > 1)
      .map(([sku, rows]) => ({sku, sources: rows.map((r) => r.source)})),
  };
}

function textId(value, name) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string')
    throw new Error(
      `${name} must be exported as text, not a spreadsheet number`,
    );
  return value;
}

export function mapChannel(variations, rows, {channel, accountId, sourceName}) {
  if (!['google', 'meta'].includes(channel))
    throw new Error('Expected google or meta channel');
  const bySku = indexBy(variations, (v) => (usableSku(v.sku) ? v.sku : null));
  const byId = indexBy(variations, (v) => v.shopifyVariantId.split('/').at(-1));
  const mappings = rows.map((raw, position) => {
    if (
      channel === 'meta' &&
      Object.hasOwn(raw, 'retailer_id') &&
      !raw.retailer_id
    )
      throw new Error(
        'Meta retailer_id is missing; Graph object ID is not the content ID',
      );
    const externalId = textId(
      channel === 'google'
        ? (raw.offerId ?? raw.id)
        : (raw.retailer_id ?? raw.id),
      'External product ID',
    );
    if (!externalId)
      throw new Error(`Missing ${channel} product ID on row ${position + 1}`);
    const sku = textId(raw.sku, 'SKU');
    const variantId = textId(
      raw.shopifyVariantId ?? raw.shopify_variant_id,
      'Shopify variant ID',
    );
    let linkVariant = null;
    if (raw.link || raw.linkUrl || raw.productUrl) {
      const url = new URL(raw.link ?? raw.linkUrl ?? raw.productUrl);
      // Only the explicit Shopify variant parameter is evidence, not a parsed external-ID suffix.
      linkVariant = url.searchParams.get('variant');
    }
    const signals = [
      [
        'explicit_variant_id',
        variantId ? (byId.get(variantId.split('/').at(-1)) ?? []) : null,
      ],
      [
        'landing_variant_id',
        linkVariant ? (byId.get(linkVariant) ?? []) : null,
      ],
      ['explicit_sku', sku ? (bySku.get(sku) ?? []) : null],
      ['external_id_equals_sku', bySku.get(externalId) ?? null],
    ].filter(([, matches]) => matches !== null);
    const evidence = signals.map(([method, matches]) => ({
      method,
      variantIds: matches.map((v) => v.shopifyVariantId),
    }));
    const positive = signals.filter(([, matches]) => matches.length);
    const intersection = positive.length
      ? positive[0][1].filter((v) =>
          positive.every(([, matches]) => matches.includes(v)),
        )
      : [];
    const issues = [];
    if (signals.some(([, matches]) => !matches.length))
      issues.push('unmatched_explicit_evidence');
    if (positive.length > 1 && !intersection.length)
      issues.push('conflicting_evidence');
    const scope = {
      accountId: accountId ?? null,
      feedLabel: raw.feedLabel ?? raw.feed_label ?? null,
      contentLanguage: raw.contentLanguage ?? raw.content_language ?? null,
      channel: raw.channel ?? null,
      dataSource: raw.dataSource ?? raw.data_source ?? null,
    };
    const completeScope =
      !!scope.accountId &&
      (channel === 'meta' || (!!scope.feedLabel && !!scope.contentLanguage));
    const match =
      intersection.length === 1 && !issues.length ? intersection[0] : null;
    return {
      channel,
      externalId,
      scope,
      groupId: raw.item_group_id ?? raw.itemGroupId ?? null,
      providerResourceName: raw.name ?? null,
      shopifyVariantId: match?.shopifyVariantId ?? null,
      sku: match?.sku ?? null,
      status: match
        ? completeScope
          ? 'verified_from_export'
          : 'matched_scope_incomplete'
        : intersection.length > 1
          ? 'ambiguous'
          : issues.length
            ? 'conflict'
            : 'unmatched',
      evidence,
      issues,
      source: {file: sourceName, row: position + 1},
      raw,
    };
  });
  for (const [, duplicates] of indexBy(mappings, (r) =>
    JSON.stringify([
      r.scope.accountId,
      r.scope.feedLabel,
      r.scope.contentLanguage,
      r.scope.channel,
      r.externalId,
    ]),
  )) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) {
      row.issues.push('duplicate_channel_identity');
      row.status = 'conflict';
      row.shopifyVariantId = null;
      row.sku = null;
    }
  }
  return mappings;
}

export async function readChannelFile(path, channel) {
  const text = await readFile(path, 'utf8');
  if (/\.(csv|tsv)$/i.test(path))
    return parseDelimited(text, /\.tsv$/i.test(path) ? '\t' : ',');
  const value = JSON.parse(text);
  const rows = Array.isArray(value) ? value : (value.products ?? value.data);
  if (!Array.isArray(rows))
    throw new Error(
      'Channel JSON must be an array or have a products/data array',
    );
  if (value.paging?.next || value.nextPageToken)
    throw new Error('Channel API export still has another page');
  if (
    channel === 'meta' &&
    !Array.isArray(value) &&
    value.data &&
    rows.some((r) => !r.retailer_id)
  )
    throw new Error(
      'Meta API records require retailer_id, not Graph object id',
    );
  return rows;
}

async function main() {
  const {values} = parseArgs({
    options: {
      shopify: {type: 'string'},
      sheet: {type: 'string'},
      'sheet-tabs': {type: 'string'},
      google: {type: 'string'},
      meta: {type: 'string'},
      'google-account': {type: 'string'},
      'meta-catalog': {type: 'string'},
      output: {type: 'string'},
    },
  });
  if (!values.shopify || !values.output)
    throw new Error(
      '--shopify snapshot directory and a new --output file are required',
    );
  const manifest = JSON.parse(
    await readFile(resolve(values.shopify, 'manifest.json'), 'utf8'),
  );
  if (manifest.status !== 'complete_for_declared_scope')
    throw new Error('Shopify export is incomplete');
  const productBytes = await readFile(resolve(values.shopify, 'products.json'));
  if (
    createHash('sha256').update(productBytes).digest('hex') !==
    manifest.files?.['products.json']?.sha256
  )
    throw new Error('Product snapshot digest differs from manifest');
  const products = JSON.parse(productBytes.toString('utf8'));
  const variations = flattenProducts(products);
  const sheetBytes = values.sheet ? await readFile(values.sheet) : null;
  const sourceSheet = sheetBytes
    ? JSON.parse(sheetBytes.toString('utf8'))
    : null;
  const sheet = sourceSheet
    ? selectTableTabs(sourceSheet, values['sheet-tabs']?.split(','))
    : null;
  const mappings = {};
  for (const channel of ['google', 'meta']) {
    mappings[channel] = values[channel]
      ? {
          status: 'provided',
          records: mapChannel(
            variations,
            await readChannelFile(values[channel], channel),
            {
              channel,
              accountId:
                values[
                  channel === 'google' ? 'google-account' : 'meta-catalog'
                ],
              sourceName: resolve(values[channel]),
            },
          ),
        }
      : {status: 'awaiting_actual_channel_export', records: null};
  }
  const report = {
    format: 'h2-catalog-reconciliation-v1',
    capturedAt: new Date().toISOString(),
    shopifyScope: manifest.source,
    spreadsheet: sheet
      ? {
          url: sheet.url,
          capturedAt: sheet.capturedAt,
          sha256: createHash('sha256').update(sheetBytes).digest('hex'),
          selectedTabs: sheet.selectedTabs,
        }
      : null,
    ...reconcileSheet(variations, sheet ? sheetVariations(sheet) : []),
    mappings,
  };
  await saveJson(resolve(values.output), report);
  process.stdout.write(
    JSON.stringify({
      variations: variations.length,
      sheetMatched: report.variations.filter((v) => v.sheetStatus === 'matched')
        .length,
      missingSkus: variations.filter((v) => !v.sku).length,
      duplicateShopifySkus: report.duplicateShopifySkus.length,
      duplicateSheetSkus: report.duplicateSheetSkus.length,
      channels: Object.fromEntries(
        Object.entries(mappings).map(([k, v]) => [k, v.status]),
      ),
    }) + '\n',
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    process.stderr.write(`Mapping failed: ${error.message}\n`);
    process.exitCode = 1;
  });
