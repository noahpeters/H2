# Shopify migration discovery and implementation plan

Date: November 7, 2026. Status: proposed implementation sequence; no storefront, payment, inventory, catalog-account, or production changes.

H2 can retain its React, React Router, TypeScript, Vite, and StyleX storefront while moving to Cloudflare Workers. Leaving Shopify also requires replacing its catalog, custom product definitions, cart, accounts, managed content, advertising catalog integrations, consent services, and operational commerce functions. Build a first-party website catalog and stock ledger, direct Stripe checkout, and Google and Meta catalog delivery. Integrating the independent Etsy shop into the website is a conceptual stretch goal after the migration; it is outside the implementation sequence and launch requirements.

## Evidence and boundaries

The source audit covers H2 `main` at `67d65a9d41a189ea9a577af96c312704e6badb1f`: application routes, shared components, loaders, GraphQL, server/bootstrap, build configuration, deployment workflows, and integration documentation. Source references below describe that revision, not verified production behavior. Cabinitron's payment implementation was inspected as a design reference; this does not establish its live configuration.

User-supplied November 7 screenshots establish the following account configuration:

| Channel | Observed source | Migration consequence |
| --- | --- | --- |
| Google online products | `Shopify App API`, source type `Merchant API` | Replace the Shopify-owned writer; this is not an existing scheduled file feed |
| Google local products | Separate `Local Feed Partnership` source | Inspect local destinations, linked locations, store codes, inventory, and pickup settings; online product submission alone is insufficient |
| Google website discovery | `from-trees.com` under `Found by Google`, daily refresh | Preserve crawlability and product identity; reconcile automatically discovered items against submitted offers |
| Meta | `Shopify` data source, type `Partner platform`, within the existing Shopify Product Catalog | Preserve the catalog and item identities where account ownership permits; replace the partner source deliberately |
| Etsy | Shop `fromtreesStudio`, with its own independent catalog and products; no Shopify integration | Consider integrating the shop itself into the website after migration; no Etsy product import or inventory synchronization is planned |

The earlier suggestion that the current Google/Meta catalogs use feed URLs is superseded by these screenshots. Their source counts do not establish a count of distinct physical products or SKUs. Online offers, local offers, variants, markets, and website-discovered items must be reconciled separately. The screenshots also establish pre-existing Google missing-price and logo issues; capture their affected item IDs before migration. The user separately confirmed that Etsy has its own products/catalog and does not integrate with Shopify. The intended stretch goal is integrating the Etsy shop itself into the website, not importing its products into the website catalog. Etsy remains independent throughout the migration.

No authenticated Shopify, Stripe, Merchant Center, or Commerce Manager configuration/export was retrieved during this audit. Etsy API discovery is deferred with the stretch goal. Account ownership, API permissions, complete inventory, product counts, outstanding obligations, exact external item IDs, and source-removal side effects remain discovery gates. Do not infer API readiness from dashboard access. Keep screenshots, credentials, account IDs, customer data, and commercial performance exports outside this public repository.

The current [AGENTS.md](../AGENTS.md) describes Shopify and Oxygen as authoritative, including product-feed sources. The user's migration request authorizes planning their replacement. Update those instructions in the first implementation PR to describe the staged transition; retain URL preservation, inquiry-only furniture configuration, human merge, and validation requirements.

## Shopify dependency audit

| Dependency | Owning source | Current behavior and required replacement |
| --- | --- | --- |
| Request handling and context | [server.ts](../server.ts), [context.ts](../app/lib/context.ts), [routes.ts](../app/routes.ts) | Hydrogen/Oxygen handler, Storefront client, Customer Account client, cart, caching, locale, and route wrapper. Replace with Workers-compatible React Router context and explicit catalog/cart/content services. |
| Site-wide data | [root.tsx](../app/root.tsx) | Header/shop query is critical even on editorial routes with custom chrome. Footer, cart, and login state also come from Shopify. Removing only product-page queries would leave a site-wide dependency. |
| Build, generated types, deployment | [package.json](../package.json), [vite.config.ts](../vite.config.ts), [env.d.ts](../env.d.ts), [codegen.ts](../codegen.ts), [Oxygen workflow](../.github/workflows/oxygen-deployment-1000078196.yml) | Shopify CLI/build/codegen, Hydrogen and mini-Oxygen plugins, Shopify runtime types, generated Storefront/Customer Account types, and Oxygen deployment token. Replace with Workers/Vite/Wrangler, owned types, and reviewed Cloudflare deployment. |
| Rendering and security | [entry.server.tsx](../app/entry.server.tsx), [entry.client.tsx](../app/entry.client.tsx), [ProjectVerification.tsx](../app/studio/ProjectVerification.tsx) | Hydrogen CSP/nonce support and hydration provider; Shopify CDN and checkout origins. Preserve nonce handling, SSR, Turnstile, and Cabinitron framing while explicitly adding required Stripe origins. |
| Catalog and custom definitions | [product.server.ts](../app/lib/product.server.ts), [ProductForm.tsx](../app/components/ProductForm.tsx), [customization hook](../app/components/product/useProductCustomization.ts), [line-item fields](../app/lib/cart/lineItemFieldSet.ts), [presentation map](../app/lib/options/buildPresentationMap.ts), [palettes](../app/lib/options/woodColorPalettes.ts) | Shopify products, variants, SKU, availability, prices, compare-at prices, media/3D files, SEO, specifications, option UI, conditional personalization fields, and wood/finish palettes. Export nested references and validation rules, not just product CSV rows. |
| Product routes and selection | [product route](../app/routes/products.$handle.tsx), [cutting boards](../app/routes/cutting-boards.tsx), [variant pickers](../app/components/product/VariantOptionPickers.tsx) | Standard products and `/cutting-boards` share the `cutting-board` product loader. Selection uses named query parameters and Hydrogen variant helpers. Preserve links, invalid-combination behavior, selected images, and price/availability. Current query has `variants(first: 250)`; the migration exporter must paginate independently. |
| Collections and search | [all products](../app/routes/collections.all.tsx), [collection](../app/routes/collections.$handle.tsx), [collections](../app/routes/collections._index.tsx), [search](../app/routes/search.tsx) | Storefront pagination, collection membership, product results, content search, and predictive search. Start with indexed D1 lookup; retain result shapes and useful query parameters. |
| Cart and purchase shortcuts | [cart](../app/routes/cart.tsx), [permalinks](../app/routes/cart.$lines.tsx), [discount links](../app/routes/discount.$code.tsx), [CartSummary](../app/components/CartSummary.tsx), [AddToCartButton](../app/components/AddToCartButton.tsx), [BuyNowButton](../app/components/BuyNowButton.tsx) | Shopify cart creation/mutation, attributes, discounts, gift cards, buyer identity, checkout URL, Buy Now, and numeric variant-ID cart permalinks. Replace with first-party cart/quote/checkout; retain a legacy-ID resolver for existing external links. UI support does not prove issued gift-card balances or active discounts exist. |
| Customer accounts | [account layout](../app/routes/account.tsx), [account GraphQL](../app/graphql/customer-account), `app/routes/account*` | Shopify login/authorization/logout, profile, address CRUD, order search/history/detail. Decide account replacement and legacy order access before retirement. Stripe Customer objects are not storefront authentication or a complete order portal. |
| Pages, blogs, policies, menus | [pages](../app/routes/pages.$handle.tsx), [blogs](../app/routes/blogs._index.tsx), [policies](../app/routes/policies.$handle.tsx), [fragments](../app/lib/fragments.ts), [Header](../app/components/Header.tsx), [Footer](../app/components/Footer.tsx) | Storefront-managed content and navigation coexist with repository-managed studio pages. Export actual referenced content and rewrite embedded media/internal links. `SiteHero.tsx` supports metaobjects but is not currently imported by the home route; do not mistake an unused component for an active content dependency. |
| Admin API dependency | [contact-information policy](../app/routes/policies.contact-information.tsx) | This policy calls Shopify Admin GraphQL using `SHOPIFY_ADMIN_API_TOKEN` and `SHOPIFY_ADMIN_API_VERSION`. A Storefront-only audit would miss it. Move the policy into owned content. |
| Media and formatting | `ProductImage`, `ProductItem`, `ProductPrice`, galleries, search results, `SiteHero`, variant swatches | Hydrogen Image/Money/RichText/Pagination wrappers and Shopify CDN transforms. Replace wrappers and copy referenced images, generic files, and models to owned media storage with alt text, dimensions, and digests. Do not assume old CDN URLs survive store retirement. |
| Redirects and indexing | [server.ts](../server.ts), [redirect helper](../app/lib/redirect.ts), [robots](../app/routes/[robots.txt].tsx), [sitemap index](../app/routes/[sitemap.xml].tsx), [sitemap pages](../app/routes/sitemap.$type.$page[.xml].tsx), [custom sitemap](../app/routes/[sitemap.custom.xml].tsx) | Shopify-backed fallback redirects, localized handles, shop-ID robots rules, and Shopify-generated resource sitemaps. Export redirect records and generate sitemaps/robots from owned data; retain custom routes and historical domain redirects. |
| Consent, analytics, attribution | [GoogleTag](../app/components/GoogleTag.tsx), [MetaPixel](../app/components/MetaPixel.tsx), [PageAnalyticsView](../app/components/PageAnalyticsView.tsx), [metaAttribution](../app/lib/intake/metaAttribution.ts), product/collection/search routes | Hydrogen Analytics events/provider; Google tag `GT-TXBKGK45`; Meta pixel `4235923316621088`; Shopify privacy API/events. The first-party Meta component emits PageView and accepted Lead, not commerce events. Google component configures its tag but does not explicitly implement the ecommerce funnel. Audit Shopify/third-party event delivery before replacing it. |
| Shopify privacy proxy | [GraphQL proxy](../app/routes/api.$version.[graphql.json].tsx), [checkout domain](../app/lib/checkoutDomain.ts) | Same-origin proxy to the configured Shopify checkout domain. Replace privacy integration and remove the proxy after all consumers are retired. |

### Dependencies to preserve through the move

The inquiry-only table configurator and repository-managed studio content are reusable. Keep the cabinet designer in Cabinitron, preserve existing saved-design/share links, tenant-scoped embedding and migration readiness behavior, and do not unfreeze or repurpose the legacy rooms archive. See [Cabinitron cutover](cabinitron-cutover.md).

Inquiry delivery currently calls Resend directly and then makes one bounded FTOPS attempt; it has no durable retry queue. Preserve its consent fields, submission identity, Turnstile verification, and success contract during the runtime port. New order delivery gets its own durable outbox; do not silently change existing inquiry semantics. See [website intake](website-intake-delivery.md) and [Meta inquiry attribution](meta-inquiry-attribution.md).

The CSP permits additional Google/Meta gateway origins, but an allowlist is not evidence of an active server-side event integration. Doodle consultation links, Tawk chat, BBB seals, analytics, and third-party scripts need an explicit keep/remove inventory. No app-owned product-feed route, Stripe checkout, or Etsy stock adapter was found in the audited source. Shopify-side apps/settings may supply storefront and Google/Meta delivery functions invisible to H2; Etsy remains a separate, unconnected catalog.

## Proposed architecture and ownership

Use server-rendered React Router on a Cloudflare storefront Worker, a commerce Worker/service boundary, D1, R2, Queues, and scheduled reconciliation. Start in this repository; separate operational jobs from page serving without creating a general multi-merchant platform. Verify the existing React Router version's Cloudflare compatibility in a small proof before any framework upgrade. [Cloudflare React Router guidance](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/).

| System | Authority |
| --- | --- |
| First-party catalog | Website product content migrated from Shopify, variants, option/validation definitions, prices, Google/Meta eligibility, and stable internal identity |
| First-party stock ledger | Website physical stock, auditable movements, checkout holds, returns, and adjustments |
| Stripe | Payment execution and payment/refund evidence in the From Trees merchant account |
| Website orders | Immutable purchased configuration, quoted totals, payment references, fulfillment and customer order access |
| Etsy | Independent shop, catalog, inventory, checkout, and orders; unchanged during this migration |
| Google and Meta | Processed catalog status/diagnostics; receive channel projections from the owned catalog |
| FTOPS | Agreed downstream operational/CRM handoff; no second stock authority unless a later explicit design makes it the sole authority |
| Cabinitron | Cabinet designs, estimates, and existing business workflows |

Guest checkout is the proposed initial purchase mode. Preserve a secure path to legacy order history and decide whether full accounts are required before switching `/account`. Keep bespoke furniture inquiry-only; explicit fixed-price products remain purchasable. Use one currency initially only after confirming current sales requirements, not by silently dropping current markets.

### Minimum data contracts

These are proposed entities, not applied migrations:

| Entity group | Important fields and invariants |
| --- | --- |
| `products`, `variants`, `option_definitions`, `customization_schemas` | Stable IDs, unique handles, sales mode, selected-option map, integer minor-unit prices plus currency, versioned validation, lead times, publication and per-channel eligibility |
| `media`, `content`, `redirects`, `collection_memberships` | Owned object key, source URL/digest, alt text/dimensions, content revision, explicit redirect status and destination |
| `external_references`, `channel_offers` | Shopify product/variant GIDs, Google offer ID plus full channel/label/language/market scope, Meta retailer/content ID and group ID; do not derive legacy IDs from a guessed pattern |
| `stock_items`, `variant_stock_components` | Physical inventory identity separate from merchandising variants; several engraving/finish variants may consume the same board blank; quantity-per-unit supports sets/bundles |
| `inventory_movements`, `reservations` | Append-only movement origin, deduplication key, stock revision, reservation owner/state, provider session and expiry; no negative available-to-promise balance |
| `carts`, `checkout_quotes`, `orders`, `order_lines`, `payment_attempts`, `refunds`, `fulfillments` | Cart/config revision, expiring quote, immutable line/options/price snapshots, delivery/tax totals, distinct payment and fulfillment status, unique provider payment references |
| `provider_events`, `integration_outbox`, `channel_sync_state`, `catalog_snapshots` | Durable verified event receipt, unique effect keys, desired vs acknowledged revisions, retries/dead-letter handling, last successful reconciliation and feed publication |

Use short D1 transactions/batches with conditional writes and conflict checks for all lines/components together. Multi-line checkout must reserve everything or nothing; test rollback and contention under the actual Workers/D1 runtime. Avoid a non-atomic read-then-write stock check. Prove D1's transaction constraints with the intended implementation before adding a Durable Object coordinator; if needed, it must become the defined write coordinator rather than a competing ledger.

## Stripe checkout implementation

### Configuration and purchase contract

Use a direct secret key and webhook signing secret for the From Trees Stripe account, with isolated test/live configuration, pinned API version, approved payment methods, receipt settings, and domain/wallet verification. No Connect OAuth, `Stripe-Account` routing, merchant onboarding, application fees, or tenant payout machinery. Reuse Cabinitron's safe-retry and reconciliation patterns, not its connected-account model or subscription billing.

Prove embedded Checkout against required shipping rates, pickup, address validation, tax, wallets, and CSP before selecting its final UI. Use Stripe-hosted Checkout if the embedded mode cannot meet the agreed delivery contract. UI mode does not change first-party merchant ownership. Keep cards and eligible wallets as the initial limited-stock payment methods; delayed bank payments need a separately defined longer reservation policy.

Proposed endpoints: `/cart`, `POST /api/checkout/quote`, `POST /api/checkout/sessions`, `/checkout`, `POST /api/stripe/webhook`, and a customer-authorized `/orders/:reference` status page. An unguessable order reference alone is insufficient if it exposes customer details; use an expiring scoped access token or authenticated account. Apply origin/CSRF checks, rate limits, and no-store responses to cart/checkout mutations and private order data.

### Ordered checkout behavior

1. Resolve owned variant IDs or retained legacy IDs. Validate selected options, conditional required engraving/logo fields, lengths, stock components, quantities, eligibility, and current prices on the server. Client line attributes and prices are never authoritative.
2. Quote delivery/pickup, tax behavior, discounts, and total. Persist the catalog/configuration revision and an immutable order snapshot. If Stripe calculates final tax or shipping after collecting an address, distinguish the provisional quote from the final amount: retrieve the completed session, validate its items, discounts, eligible rate/address and tax configuration, and persist the final breakdown before fulfillment. Do not compare a provisional subtotal to a settled gross total. Determine the tax service/configuration with the operator; payment processing alone does not supply the business's tax setup or filing workflow.
3. Atomically create an attempt and reserve available website stock. A cart does not reserve stock. Use a stable request/attempt idempotency key; a changed quote/configuration must create a new attempt after safely closing the prior one.
4. Create a one-time Checkout Session using server-calculated amounts, quantities, delivery/tax configuration, and internal references. Disable customer quantity changes unless the server also revalidates and reserves them. Persist the returned session identity. Reuse a retryable attempt if the provider response is lost; never create another session merely because a request timed out.
5. Verify Stripe signatures against the raw body, persist the event before acknowledging it, and process effects idempotently. Match merchant environment, order/attempt, currency, and authoritative settled totals before marking paid. Session completion alone is not proof of settled payment for delayed methods. Unexpected totals or payments enter an exception queue.
6. Convert the reservation into a sale once; queue customer confirmation, staff notification, operational handoff, channel updates, and consent-permitted purchase measurement. Refreshing a return page does not create another order or fulfillment effect.
7. Release held stock only after establishing that the old checkout cannot still pay. A local timer or cancel-page visit is insufficient. Reconcile uncertain session creation, expiration, processing, and late events. If any delayed methods are later enabled, keep the reservation through processing until a terminal result.
8. Keep payment, fulfillment, cancellation, dispute, and refund state separate. Partial refunds do not automatically replenish stock. Restock requires an explicit unfulfilled cancellation or confirmed physical return; personalized items may be non-restockable.

Stripe requires webhook-backed fulfillment and warns that processing may run repeatedly or concurrently; implement one durable effect per payment. [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page). Align holds with supported session expiration behavior and verify the selected API/UI mode during implementation. [Limited inventory](https://docs.stripe.com/payments/checkout/managing-limited-inventory).

### Operational replacements required for launch

Define shipping zones/rates and excluded destinations, pickup details, production/dispatch estimates, carrier labels/tracking workflow, refund permissions, notification ownership, and exception handling. Inventory/ordering admin must support receiving stock, adjustments, returns, mapping errors, unpublished products, unfulfilled paid orders, and retrying failed integrations with an audit trail. Full shipping-label automation can follow a documented manual workflow.

Export active discounts and outstanding gift-card/store-credit balances before deciding the initial feature set. Stripe promotion codes are not a gift-card balance ledger. Import outstanding value with an explicit redemption ledger or retain a verified fulfillment path; do not invalidate customer obligations.

## Google and Meta catalog continuity

### Preserve identities before changing the producer

Export processed items and raw source inputs where available, plus source configuration, rules, supplemental sources, product sets, labels, country/language scope, and linked ad/commerce assets. Capture the exact external item/group IDs and their Shopify variant references. Preserve those IDs even when they contain a Shopify prefix. New products receive an owned, stable channel ID; they do not inherit unrelated legacy IDs.

For Google, preserve the full offer identity and scope, not only a SKU: offer ID, feed label, language, applicable channel/market, and data source. For Meta, preserve existing retailer/content IDs, group relationships, catalog/pixel association, product sets, and their rules. Do not assume one platform's IDs equal the other's. Website event adapters resolve IDs through the same mapping used by each catalog publisher.

Keep existing accounts and catalogs where possible. Partner-managed source ownership and disconnect behavior must be inspected before choosing in-place replacement versus a controlled source transfer. Never disconnect Shopify as a discovery step, and never delete/recreate a catalog to make an importer work. Google documents that competing sources can take ownership of the same product according to update ordering; avoid two active writers for the same offer. [Google source management](https://support.google.com/merchants/answer/13982673?hl=en).

### Google implementation

Prefer a direct Merchant API publisher for online products because that matches the observed source mechanism and supports incremental changes plus reconciliation. Establish the Google Cloud/developer registration and merchant authorization, then prove access to the intended source. If the Shopify-managed source cannot be used, plan a new controlled source with retained offer identities, rules, and targeting; do not assume partner ownership transfers automatically. [API source management](https://developers.google.com/merchant/api/guides/data-sources/api-sources).

Treat local products as a separate work package. Inspect linked Business Profile/store locations, store codes, source details, local eligibility, pickup settings, and real physical stock. If local listings are to remain, implement the required product/local inventory projection. If they are to retire, make that an explicit business decision. Website shipping availability and made-to-order capacity are not proof of in-store availability. [Google local inventory](https://developers.google.com/merchant/api/guides/inventories/add-local-inventory).

Keep website discovery working, and reconcile those items with the API catalog. Add server-rendered Product/ProductGroup and Offer structured data because the audited application contains no explicit Product/Offer JSON-LD. This absence does not establish how Google discovered its existing website items. Keep selected variant, price, currency, availability, delivery, and canonical links consistent across page, checkout, and channel projection. Resolve observed legacy `?variant=SHOPIFY_VARIANT_ID` links through the retained mapping as well as named-option parameters, and preserve tracking parameters; a catalog link must not silently render a different default variant. Use truthful brand/GTIN/MPN information; never invent identifiers for custom work. [Google product specification](https://support.google.com/merchants/answer/7052112?hl=en), [structured data](https://support.google.com/merchants/answer/6386198?hl=en_ALL).

### Meta implementation

The observed source is Shopify's partner integration. Proposed replacement: a validated scheduled feed in the existing catalog if permitted, with a direct Catalog API adapter as an alternative when source ownership, update latency, or account capabilities require it. Prove the transition with a controlled item before retiring the partner writer; confirm how disconnect affects items, shops, and tags. Meta's documentation was login/rate limited during discovery, so validate current field requirements and migration permissions in the authenticated account before implementation.

Keep feed endpoints channel-specific, for example `/feeds/meta.xml` and a diagnostic `/feeds/google.xml` export; a Google export is not automatically an active submission source. Share catalog projection logic, not a single assumed universal schema. Include stable variant/group identity, title, plain description, public variant URL, owned crawlable image, price/currency, sale rules, channel-valid availability, condition, product category, relevant identifiers, labels, and supported options. Treat exact field names, allowed values, local stock attributes, and schedules as adapter contracts tested against each platform.

### Publication and freshness

Generate from a consistent catalog/stock revision. Validate all records, IDs, URLs, selected-variant behavior, missing prices, and expected inclusion/exclusion before atomically publishing an R2 snapshot or queueing API updates. A failed build must not publish an empty catalog or delete everything. Keep the previous validated snapshot and alert on failures; if stock freshness exceeds an agreed limit, block affected scarce items and attempt conservative availability reduction rather than treating stale data as current. Remote catalog updates are asynchronous and may remain stale during an outage.

Use immutable object versions, a current pointer, appropriate cache headers, size/count checks, and monitoring of remote ingestion/diagnostics. Public feeds contain only public product data. Proposed initial operational targets: generate a new projection within 60 seconds of a committed price/stock change; dispatch eligible API changes within two minutes under normal conditions; request the fastest supported Meta fetch schedule and record its actual cadence; reconcile Google and Meta catalog status on an agreed schedule. These are implementation targets, not promises about when Google/Meta finish processing or an approved production schedule.

### Commerce events and consent

Replace Hydrogen/Shopify consent with an explicit first-party preference service before removing the Shopify API. Current Google behavior waits for Hydrogen analytics permission; current Meta attribution falls back to allowed when Shopify's privacy API is absent. Do not carry that accidental absence behavior into the replacement. Retain separate analytics/marketing choices and keep transactional emails independent of marketing opt-in.

Implement and verify view-item/ViewContent, add-to-cart/AddToCart, begin-checkout/InitiateCheckout, purchase/Purchase, and refund reporting where supported. Google item identifiers and Meta `content_ids` must resolve to the respective submitted catalog IDs. Use a stable order/transaction ID for Google and shared event name/event ID for Meta browser/server deduplication. Consent-permitted server events come from the payment/order record and durable outbox; their raw value/currency matches the settled order. Preserve valid attribution identifiers without inventing organic click IDs. Audit existing Shopify pixel/CAPI, tag destinations, and gateway delivery first so the transition does not double-count purchases or silently remove a working integration.

## Implementation sequence and acceptance gates

Each row is a proposed reviewable PR/work package. No production cutover is bundled into discovery.

| Package | Depends on | Scope | Acceptance gate |
| --- | --- | --- | --- |
| 1. Export and identity audit | Read-only platform access | Paginated Shopify catalog/custom definitions/media/content/redirect export; active obligations; Google/Meta processed-item and source exports; update migration instructions | Re-runnable source manifests and full per-channel ID mapping; no unresolved SKU collision for website launch products; identify Google online/local/discovered overlap and baseline issues |
| 2. Cloudflare runtime proof | 1 for representative fixtures | Workers/Vite/React Router handler, context, sessions/nonces, preview bindings, CI; Shopify adapter may remain temporarily in preview | SSR, route hydration, session receipt, Turnstile, inquiries, cabinet embed and saved links work; preview has no production writes |
| 3. Owned catalog and admin | 1, 2 | D1 schema/importer for Shopify data, owned DTOs, R2 media, custom definitions, collections, search, simple editing/publishing | Full export reconciles with owned records; pagination complete; the cutting-board options and a representative furniture product reproduce selection/price/media; invalid combinations rejected |
| 4. Website stock ledger | 1, 3 | Stock components, movements, checkout holds, adjustments, returns, production-capacity rules, guarded write transactions | Concurrent last-unit website checkouts cannot both reserve; multi-component rollback works; merchandising variants sharing a physical blank do not double-count stock |
| 5. Direct Stripe purchase slice | 2, 3, 4; shipping/tax decisions | Quote/session/return/webhook paths, test account, fulfillment outbox, minimal private order page | One complete test purchase, safe retry after lost session response, rejected price tampering, expiration reconciliation, duplicate/out-of-order events, partial refund and consent behavior |
| 6. Google publisher and local decision | 1, 3, 4 | Merchant API auth/source strategy, online projection, website discovery reconciliation, local inventory if retained, diagnostics | Exact existing offer IDs/scope resolve; accepted controlled update; local stock/location requirements proven or explicit retirement decision; no competing source writer |
| 7. Meta catalog replacement | 1, 3, 4 | Feed/API adapter, existing catalog access, source transition rehearsal, product-set/ID mapping | Controlled item accepted in intended catalog, exact content-ID matching, preserved asset/set links, proven disconnect procedure; no catalog deletion |
| 8. Content, accounts, SEO and consent | 2, 3 | Managed content/policies/menus, admin-policy removal, owned auth/order history, redirect map, JSON-LD/sitemaps/robots, consent and event adapters | No critical root Shopify query; legacy URLs and numeric cart links resolve; authorized history works; consent tests and feed/page/checkout equality pass |
| 9. Operations and cutover rehearsal | 5, 6, 7, 8 | Shipping/tracking/admin, email/FTOPS contract, monitoring, final import/delta strategy, rollback rehearsal | Paid order stays recoverable through worker/email/provider failures; gift-card/history obligations covered; full simulated switch and rollback without losing new orders |
| 10. Production cutover and retirement | Human release approval after 9 | Final Shopify checkout fence and reconciliation, domain traffic, controlled Google/Meta producer transfer, post-release verification | Actual purchase/refund, fulfillment, consent, catalog ingestion/IDs, and inquiry/Cabinitron paths verified; retire Shopify only after its remaining obligations are resolved |

Packages 6, 7, and 8 can progress independently after the website catalog and stock contracts are stable. Google and Meta continuity is a launch gate. No migration package depends on Etsy shop integration; it receives no migration work package and cannot delay launch or Shopify retirement.

## Cutover and rollback protocol

1. Run replacement importers/publishers in shadow mode. Do not write conflicting live offers or stock while Shopify remains authoritative. Record immutable source manifests, processed IDs, diagnostics, mappings, and time boundaries.
2. Rehearse how to fence old Shopify purchases, including still-open sessions, Buy Now/cart permalinks, Shop/other sales channels, and late payment/order events. Import/reconcile all outstanding orders and allocated stock. A DNS switch alone does not stop Shopify selling.
3. Apply the final import/delta and reconcile physical stock and obligations after old exposure is closed. Preserve opaque Shopify order/payment IDs and timestamps. Keep any unresolved units reserved/quarantined. Old browsers/carts must be revalidated against the owned catalog, not trusted as valid prices.
4. Switch storefront traffic and transfer each catalog writer in an ordered, reversible way using the same external IDs. Maintain domain verification, locations, redirect assets, and query parameters. Never leave Shopify and the new adapter continuously overwriting the same offers.
5. Verify an actual approved live purchase and refund, customer/staff email, fulfillment handoff, checkout retry, Google online/local status, Meta catalog matching, consent, indexing, saved-design links, and inquiry delivery. Record results without claiming platform processing is instantaneous.
6. If rollback is needed, first fence the new checkout and stop new inventory/catalog writes; reconcile new website/Stripe orders and all holds, then restore the chosen producer/traffic. Never restore an old database snapshot over new orders or re-enable both checkout systems against unreconciled stock. If reconciliation is uncertain, temporarily stop purchasing while keeping informational pages available.
7. Keep historical Shopify fulfillment/refund access until a verified archive and refund/dispute procedure cover remaining obligations. Remove Shopify tokens, apps, runtime/CDN dependencies, and source ownership only after those gates pass. Store retirement timing is a business decision, not a DNS task.

## Remaining discovery inputs

| Input | Why it is needed | Blocks |
| --- | --- | --- |
| Read-only Shopify export/Admin access and app/channel inventory | Actual nested product data, SKU coverage, stock policy/locations, content/assets, redirects, discounts, gift cards, outstanding orders, shipping/tax, Shopify checkout pixel/CAPI and active source writers | Final import schema, parity scope, fencing and retirement |
| Google source detail and processed product export; local program/location settings | Full source/offer identity, feed labels/language/channel, ownership, automatic discovery overlap, rules, diagnostics and physical-stock eligibility | Google source-transfer rehearsal and local inventory scope |
| Meta catalog/source detail, item export and asset ownership | Retailer/group IDs, catalog/shops/product sets, pixel association, disconnect side effects, available feed/API permissions | Meta replacement proof and conversion matching |
| Stripe account/test access and business delivery rules | Direct merchant account, embedded/hosted fit, tax/shipping/pickup, wallets, receipts, allowed methods, refunds | End-to-end purchase slice |
| Operator decisions | Shared physical blanks vs independent website SKUs, website stock and production-capacity rules, local pickup inventory, launch markets, legacy account experience, order management/FTOPS ownership | Final acceptance criteria |

Collect these through read-only exports and existing account connections where possible. Access/export gaps do not block the Cloudflare preview, owned type definitions, or synthetic catalog/payment/stock proofs, but they do block claims of complete account discovery and a safe production switch.

## Stretch goal after migration

Consider integrating the existing Etsy shop itself into the website while keeping its independent catalog, inventory, checkout, and orders on Etsy. The intended customer experience and technical approach remain conceptual and should be explored after the core migration is complete. A shop link, a shop presentation within the website, or an Etsy-supported integration may be evaluated then; none is selected or committed here.

Do not import Etsy products into the first-party website catalog. Etsy API authorization, listing/order imports, shared stock pools, inventory synchronization, stock allocation, and Etsy writes are outside the migration scope. Do not add schema, adapters, discovery prerequisites, cutover checks, or launch gates for those features. Any later shop integration should receive its own scope and review without displacing the Cloudflare move, Stripe checkout, Google/Meta catalog continuity, or existing website behavior.
