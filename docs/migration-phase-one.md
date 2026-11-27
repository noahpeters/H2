# Catalog export and identity reconciliation

Phase one reads Shopify and the table spreadsheet, archives the source, and prepares a product-ID crosswalk. It does not change the storefront, publish products, update prices, alter Google/Meta sources, or apply database migrations. Etsy integration and reproducing the spreadsheet pricing engine remain outside this phase.

## Product model

Use one simple sellable record per variation, with shared identity, title, type, SKU, price/currency, and publication state. Table-specific configuration belongs in a table detail table: style code, seating, extension, top style, species, and retained source option IDs. Other types can have their own detail tables. This keeps shared checkout/order/catalog references consistent without forcing every type into the same configuration columns.

[catalog-proposal.sql](../scripts/migration/catalog-proposal.sql) illustrates this structure. It is a design proposal, not an applied migration. The spreadsheet supplies existing variation SKUs and current price values; it remains the pricing engine. Capture its source revision and row/cell provenance. Do not replace existing IDs with spreadsheet row numbers or reverse-engineer configuration from SKU abbreviations when the row already names the options.

Keep Shopify's raw products, metafields, metaobjects, and presentation definitions as source evidence. They do not dictate the target database. Images, swatches, labels, and conditional personalization fields can be converted into the new type-specific UI later. Shopify IDs and Google/Meta catalog identities belong in external mapping records separate from our variation IDs.

## Private source files

Run from the repository using Node 22 or later and its existing dependencies. Use a new output directory outside the repository for every snapshot. Files are private, manifests record digests and scope, and prior snapshots are not overwritten. Never commit raw spreadsheets, source snapshots, access files, account IDs, or tokens. The access file is a private JSON object with `domain` and `token`, or use environment variables.

```sh
# Published storefront catalog/content and the custom options H2 uses.
node scripts/migration/shopify-export.mjs \
  --source storefront \
  --access-file /private/path/shopify-access.json \
  --output /private/path/new-storefront-snapshot

# Broader read-only export, when an appropriately scoped Admin token is available.
SHOPIFY_DOMAIN=your-shop.myshopify.com \
node scripts/migration/shopify-export.mjs \
  --source admin \
  --output /private/path/new-admin-snapshot
```

Supply `SHOPIFY_ADMIN_TOKEN` or `SHOPIFY_STOREFRONT_TOKEN` through the environment when not using an access file. Do not include tokens as command-line arguments. The client parses GraphQL operations and permits queries only. Requests do not follow redirects with credentials. HTTP failures, partial GraphQL errors, unexpected API versions, missing pagination, duplicate IDs, and non-advancing cursors stop the export. The failed manifest stays marked failed; do not use it as a complete source.

The exporter uses API version `2026-10`. It follows all product, variation, media, collection-member, page, blog-article, and Admin metafield pages. Referenced metaobjects and media/files are traversed by identity with cycle protection; reference-list IDs come from their complete raw values rather than a capped references query. It stores:

- Shop identity and available policies.
- Products and all visible variations, exact SKUs, prices, selected options, metadata, and media records.
- Collections and their product memberships.
- Pages, blogs/articles, and menu trees.
- Recursively referenced option, personalization, palette, image, video, model, and generic-file records.
- In Admin mode, accessible redirects, metaobject definitions, and all accessible metaobjects of those types.

Storefront mode sees only data published to that API channel. It exports `custom.specs`, `custom.option_ui`, `custom.line_item_field_set`, and `custom.wood_color_palettes`, plus their references. It cannot establish completeness for private/draft records, unexposed metadata, unused objects, or redirects. API version `2026-10` also exposes contact-information and other public policies that H2's older implementation reads through Admin. Admin mode still depends on the token's permissions and must be verified against the real account before treating it as the broader archive. Existing menu trees support Shopify's three item levels. Binary media is not downloaded: the archive retains URLs and media records for a later asset-copy step. No paginated read freezes Shopify against concurrent edits, so repeat/reconcile before cutover.

## Spreadsheet snapshot and reconciliation

Read the existing Google Sheet without editing it. A private sheet-values snapshot has this shape:

```json
{
  "spreadsheetId": "source-id",
  "url": "source-link",
  "capturedAt": "ISO timestamp",
  "complete": true,
  "sheets": [
    {
      "name": "STYLE_Example",
      "values": [
        ["Variant SKU", "VariantPrice", "Handle"],
        ["EXAMPLE-001", 1250, "example-table"]
      ]
    }
  ]
}
```

Snapshot every tab for source preservation. Only tabs named `STYLE_<table name>` are authoritative product sources, as specified by the operator; templates, copies, `rassouli`, `jow`, and the control panel are excluded from variation reconciliation. Headers are located by label rather than a fixed row. Use read-only unformatted values so prices retain numeric values and IDs remain strings. Preserve the source spreadsheet and formula logic there; this snapshot is a point-in-time input, not a new pricing engine or an automatic live price update.

```sh
node scripts/migration/catalog-map.mjs \
  --shopify /private/path/new-storefront-snapshot \
  --sheet /private/path/table-sheet-values.json \
  --output /private/path/new-reconciliation.json
```

The report compares exact variation SKUs, explicit options, handles, and current prices. It records missing/invalid SKUs, duplicate SKUs, conflicting sheet rows, price/option differences, and unmatched spreadsheet records. Spreadsheet errors such as `#N/A` are preserved in the raw source and rejected as join keys. It does not choose a copy tab, invent IDs for unkeyed products, or correct products in Shopify. The default source selection is the case-sensitive `STYLE_` prefix. An explicit `--sheet-tabs 'STYLE_A,STYLE_B'` can narrow an agreed set while retaining the full raw snapshot. Do not exclude tabs simply to make discrepancies disappear.

## Google and Meta identity evidence

Variant SKU equality is the expected candidate join key, not proof of current catalog identity. Actual Google and Meta item exports are needed to verify it. The report marks absent channel exports as `awaiting_actual_channel_export` with `records: null`; this is unverified coverage, not zero items.

Supported inputs are CSV/TSV files with exact text IDs, arrays of JSON records, Google API-shaped `{ "products": [...] }`, or Meta API-shaped `{ "data": [...] }`. Supply a consolidated full export, not the first page of an API response. Normalize exported column headings explicitly to these fields before use, preserving the original file and exact ID strings:

| Evidence        | Fields                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google identity | `offerId` (or an explicit exported `id`), `feedLabel`, `contentLanguage`, optional `channel`, `dataSource`, and provider resource `name`            |
| Meta identity   | `retailer_id` (or an explicit exported `id`), optional `item_group_id`                                                                              |
| Join evidence   | Explicit `sku`, `shopify_variant_id`/`shopifyVariantId`, and/or a product `link`/`linkUrl`/`productUrl` containing the original `variant` parameter |

For Meta API exports, retain `retailer_id` as the catalog content ID; the Graph object's numeric `id` is a different identity and must not replace it. Use `id` only for an export whose column explicitly means the catalog content/item ID. Google resource names, offer IDs, labels, language, and source scope remain separate fields.

```sh
node scripts/migration/catalog-map.mjs \
  --shopify /private/path/new-storefront-snapshot \
  --sheet /private/path/table-sheet-values.json \
  --google /private/path/google-items.json --google-account account-id \
  --meta /private/path/meta-items.json --meta-catalog catalog-id \
  --output /private/path/new-channel-reconciliation.json
```

The mapper accepts exact SKU equality, explicit Shopify variant IDs, or explicit landing-page variant parameters as evidence. It never strips a guessed Shopify prefix from an advertising ID. Duplicate/conflicting signals remain unresolved. IDs imported as JSON numbers are rejected to prevent precision loss. A match without required account/label/language scope is `matched_scope_incomplete`; it is not verified for migration. A `verified_from_export` row means the supplied export supports that mapping, not that remote catalog membership has been rechecked live or that the export covers every item.

Before cutover, obtain complete, current account exports; preserve their source scopes and timestamps; review unmatched/conflicting rows; compare expected item counts by online/local/discovered source; and archive actual Google/Meta processed-item IDs. Google local inventory still needs separate store/location evidence. No catalog publishing or producer disconnect belongs in phase one.

## Validation

`scripts/migration/catalog-migration.test.js` exercises pagination, failure handling, read-only operations, reference discovery, CSV identifiers, ambiguous SKUs, invalid formula/error IDs, contradictory evidence, and incomplete channel scope. Run it with `npx vitest run scripts/migration/catalog-migration.test.js`, then run the required `npm run verify` before submitting the implementation. Test and export results do not establish access to a missing provider or confirm production release.
