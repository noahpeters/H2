import {createHash} from 'node:crypto';
import {mkdir, readFile, realpath, writeFile} from 'node:fs/promises';
import {basename, dirname, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {parse} from 'graphql';

export const API_VERSION = '2026-10';
const PAGE_INFO = 'pageInfo { hasNextPage endCursor }';
const IMAGE = 'url altText width height';
const CUSTOM_KEYS = [
  'specs',
  'option_ui',
  'line_item_field_set',
  'wood_color_palettes',
];
const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const IDENTIFIERS = CUSTOM_KEYS.map(
  (key) => `{namespace:"custom",key:"${key}"}`,
).join(',');
const METAFIELD = 'id namespace key type value';
const REFERENCES = `__typename
  ... on Metaobject { id type handle fields { key type value } }
  ... on MediaImage { id image { ${IMAGE} } }
  ... on GenericFile { id url mimeType }
  ... on Model3d { id sources { url mimeType format } }
  ... on Video { id sources { url mimeType format width height } }`;

export async function collectPages(fetchPage) {
  const nodes = [],
    cursors = new Set(),
    ids = new Set();
  let after = null;
  do {
    const page = await fetchPage(after);
    if (
      !Array.isArray(page?.nodes) ||
      typeof page.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error('Missing connection or pagination metadata');
    }
    for (const node of page.nodes) {
      if (!node?.id || ids.has(node.id))
        throw new Error('Missing or repeated node ID during export');
      ids.add(node.id);
      nodes.push(node);
    }
    if (!page.pageInfo.hasNextPage) return nodes;
    const cursor = page.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor) || !page.nodes.length)
      throw new Error('Pagination did not advance');
    cursors.add(cursor);
    after = cursor;
  } while (after !== null);
}

export function referencedIds(value) {
  return [
    ...new Set(
      JSON.stringify(value).match(
        /gid:\/\/shopify\/(?:Metaobject|MediaImage|GenericFile|Model3d|Video)\/\d+/g,
      ) ?? [],
    ),
  ];
}

export function createShopifyClient({
  domain,
  token,
  source = 'storefront',
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  onResponse = () => {},
}) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain ?? ''))
    throw new Error('A myshopify.com shop domain is required');
  if (!['storefront', 'admin'].includes(source) || !token)
    throw new Error('Source and access token are required');
  const url = `https://${domain}/${source === 'admin' ? 'admin/api' : 'api'}/${API_VERSION}/graphql.json`;
  return async (query, variables = {}) => {
    // Export tooling is deliberately query-only, including when given an Admin key.
    const operations = parse(query).definitions.filter(
      (d) => d.kind === 'OperationDefinition',
    );
    if (!operations.length || operations.some((d) => d.operation !== 'query'))
      throw new Error('Only GraphQL queries are allowed');
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          [source === 'admin'
            ? 'X-Shopify-Access-Token'
            : 'X-Shopify-Storefront-Access-Token']: token,
        },
        body: JSON.stringify({query, variables}),
      });
      const version = response.headers.get('x-shopify-api-version');
      if (version && version !== API_VERSION)
        throw new Error(`Unexpected Shopify API version: ${version}`);
      if ([429, 502, 503, 504].includes(response.status)) {
        await sleep(
          Math.min(
            15000,
            Number(response.headers.get('retry-after') || 2 ** attempt) * 1000,
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new Error(`Shopify export HTTP ${response.status}`);
      const body = await response.json();
      if (body.errors?.length) {
        if (body.errors.every((e) => e.extensions?.code === 'THROTTLED')) {
          await sleep(Math.min(15000, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(
          `Shopify GraphQL: ${body.errors.map((e) => e.message).join('; ')}`,
        );
      }
      if (!body.data) throw new Error('Shopify returned no data');
      onResponse({query, variables, data: body.data, apiVersion: version});
      return body.data;
    }
    throw new Error('Shopify export retry limit reached');
  };
}

export async function saveJson(path, value) {
  await requirePrivateOutput(path);
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
}

export async function requirePrivateOutput(path) {
  // Resolve the existing parent to catch /tmp aliases and symlinks into the repo.
  // The private output parent must exist; the snapshot/file itself must be new.
  const target = resolve(
    await realpath(dirname(resolve(path))),
    basename(path),
  );
  const rel = relative(await realpath(REPOSITORY), target);
  if (!rel || !rel.startsWith('../'))
    throw new Error('Migration outputs must be outside the repository');
}

export async function exportShopify({client, source, output, log = () => {}}) {
  await requirePrivateOutput(output);
  await mkdir(output, {mode: 0o700}); // Refuse to mix snapshots or overwrite a prior export.
  const manifest = {
    format: 'h2-shopify-source-v1',
    startedAt: new Date().toISOString(),
    source,
    apiVersion: API_VERSION,
    status: 'incomplete',
    files: {},
    limitations:
      source === 'storefront'
        ? [
            'Only products and content published to this Storefront API channel are visible.',
            'Only the four custom metafields used by H2 are queried; other metafields and unreferenced metaobjects need Admin access.',
            'Draft/unpublished content, redirects, and private metafield definitions are not exported.',
            'Media URLs and reference records are archived; binary media is not downloaded by this command.',
            'A paginated read is not a transactionally frozen shop snapshot; repeat and reconcile before cutover.',
          ]
        : [
            'Records are limited to the access scopes and object visibility granted to the Admin token.',
            'Media URLs and reference records are archived; binary media is not downloaded by this command.',
            'A paginated read is not a transactionally frozen shop snapshot; repeat and reconcile before cutover.',
          ],
  };
  const writeManifest = () =>
    writeFile(
      resolve(output, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      {mode: 0o600},
    );
  await writeManifest();
  const save = async (name, value) => {
    const body = JSON.stringify(value, null, 2) + '\n';
    await writeFile(resolve(output, name), body, {mode: 0o600, flag: 'wx'});
    manifest.files[name] = {
      sha256: createHash('sha256').update(body).digest('hex'),
      records: Array.isArray(value) ? value.length : 1,
    };
    await writeManifest();
  };
  const root = (name, fields, args = '') =>
    collectPages(async (after) => {
      const data = await client(
        `query Export($after:String) { ${name}(first:100,after:$after${args}) { nodes { ${fields} } ${PAGE_INFO} } }`,
        {after},
      );
      return data[name];
    });
  const child = (ownerType, ownerId, name, fields) =>
    collectPages(async (after) => {
      const data = await client(
        `query Export($id:ID!,$after:String) { node(id:$id) { ... on ${ownerType} { ${name}(first:100,after:$after) { nodes { ${fields} } ${PAGE_INFO} } } } }`,
        {id: ownerId, after},
      );
      return data.node?.[name];
    });
  try {
    const shopFields =
      source === 'admin'
        ? 'id name primaryDomain { url } shopPolicies { id type title body url }'
        : 'id name description primaryDomain { url } privacyPolicy { id title body url } refundPolicy { id title body url } shippingPolicy { id title body url } termsOfService { id title body url } contactInformation { id title body url } legalNotice { id title body url } termsOfSale { id title body url }';
    await save(
      'shop.json',
      (await client(`query Export { shop { ${shopFields} } }`)).shop,
    );
    const products = await root(
      'products',
      `id handle title productType vendor tags description descriptionHtml createdAt updatedAt seo { title description } options { id name values }${source === 'admin' ? ' status' : ' availableForSale isGiftCard'}`,
    );
    for (const p of products) {
      p.variants = await child(
        'Product',
        p.id,
        'variants',
        source === 'admin'
          ? 'id title sku barcode price compareAtPrice selectedOptions { name value }'
          : `id title sku barcode availableForSale price { amount currencyCode } compareAtPrice { amount currencyCode } selectedOptions { name value } image { ${IMAGE} }`,
      );
      p.media = await child(
        'Product',
        p.id,
        'media',
        `id mediaContentType alt ... on MediaImage { image { ${IMAGE} } } ... on Model3d { sources { url mimeType format } } ... on Video { sources { url mimeType format width height } }`,
      );
      p.metafields =
        source === 'admin'
          ? await child('Product', p.id, 'metafields', METAFIELD)
          : (
              await client(
                `query Export($id:ID!) { node(id:$id) { ... on Product { metafields(identifiers:[${IDENTIFIERS}]) { ${METAFIELD} } } } }`,
                {id: p.id},
              )
            ).node.metafields.filter(Boolean);
      log({product: p.handle, variants: p.variants.length});
    }
    await save('products.json', products);
    const collections = await root(
      'collections',
      'id handle title description descriptionHtml updatedAt image { url altText width height } seo { title description }',
    );
    for (const c of collections)
      c.products = await child('Collection', c.id, 'products', 'id handle');
    await save('collections.json', collections);
    await save(
      'pages.json',
      await root(
        'pages',
        `id handle title body bodySummary createdAt updatedAt${source === 'admin' ? ' isPublished' : ' seo { title description }'}`,
      ),
    );
    const blogs = await root('blogs', 'id handle title');
    for (const b of blogs)
      b.articles = await child(
        'Blog',
        b.id,
        'articles',
        `id handle title ${source === 'admin' ? 'body summary' : 'contentHtml excerptHtml'} publishedAt image { url altText width height }`,
      );
    await save('blogs.json', blogs);
    const menus = [];
    const items = (depth) =>
      `id title url type${depth ? ` items { ${items(depth - 1)} }` : ''}`;
    if (source === 'admin') {
      menus.push(
        ...(await root('menus', `id handle title items { ${items(2)} }`)),
      );
      await save(
        'redirects.json',
        await root('urlRedirects', 'id path target'),
      );
      const definitions = await root(
        'metaobjectDefinitions',
        'id type name fieldDefinitions { key name type { name } required validations { name value } }',
      );
      await save('metaobject-definitions.json', definitions);
      const objects = [];
      for (const d of definitions)
        objects.push(
          ...(await root(
            'metaobjects',
            'id type handle fields { key type value }',
            `,type:${JSON.stringify(d.type)}`,
          )),
        );
      await save('all-metaobjects.json', objects);
      // Definitions and unused objects may own additional files or nested references.
      products.push(
        ...objects.map((o) => ({metadataOnly: true, fields: o.fields})),
      );
    } else {
      for (const handle of ['main-menu', 'footer'])
        menus.push({
          handle,
          menu: (
            await client(
              `query Export($handle:String!) { menu(handle:$handle) { id handle title items { ${items(2)} } } }`,
              {handle},
            )
          ).menu,
        });
      manifest.limitations.push(
        'Only main-menu and footer menu handles used by H2 are exported.',
      );
    }
    await save('menus.json', menus);
    const referenceMap = new Map(),
      pending = referencedIds(products);
    const missing = [];
    while (pending.length) {
      const batch = [...new Set(pending.splice(0, 50))].filter(
        (id) => !referenceMap.has(id),
      );
      if (!batch.length) continue;
      const data = await client(
        `query Export($ids:[ID!]!) { nodes(ids:$ids) { ${REFERENCES} } }`,
        {ids: batch},
      );
      batch.forEach((id, i) => {
        const node = data.nodes?.[i] ?? null;
        referenceMap.set(id, node);
        if (!node) missing.push(id);
        else
          pending.push(
            ...referencedIds(node).filter(
              (ref) => ref !== id && !referenceMap.has(ref),
            ),
          );
      });
    }
    await save(
      'references.json',
      [...referenceMap].map(([id, record]) => ({id, record})),
    );
    manifest.unresolvedReferences = missing;
    if (missing.length)
      manifest.limitations.push(
        'Some referenced objects are inaccessible; preserve unresolved IDs and obtain Admin scope before migration.',
      );
    manifest.status = 'complete_for_declared_scope';
    manifest.completedAt = new Date().toISOString();
    await writeManifest();
    return manifest;
  } catch (error) {
    manifest.status = 'failed';
    manifest.error = error.message;
    await writeManifest();
    throw error;
  }
}

async function main() {
  const {values} = parseArgs({
    options: {
      source: {type: 'string', default: 'storefront'},
      'access-file': {type: 'string'},
      output: {type: 'string'},
    },
  });
  if (!values.output)
    throw new Error(
      '--output must name a new private directory outside the repository',
    );
  const access = values['access-file']
    ? JSON.parse(await readFile(values['access-file'], 'utf8'))
    : {
        domain: process.env.SHOPIFY_DOMAIN,
        token:
          values.source === 'admin'
            ? process.env.SHOPIFY_ADMIN_TOKEN
            : process.env.SHOPIFY_STOREFRONT_TOKEN,
      };
  const client = createShopifyClient({...access, source: values.source});
  const manifest = await exportShopify({
    client,
    source: values.source,
    output: resolve(values.output),
    log: (v) => process.stdout.write(JSON.stringify(v) + '\n'),
  });
  process.stdout.write(
    JSON.stringify({
      status: manifest.status,
      files: manifest.files,
      unresolvedReferences: manifest.unresolvedReferences.length,
    }) + '\n',
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error) => {
    process.stderr.write(`Export failed: ${error.message}\n`);
    process.exitCode = 1;
  });
