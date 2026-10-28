# H2 storefront cutover to Cabinitron

The From Trees Shopify storefront retains its own header, navigation, cart and other storefront features. H2's cabinet page embeds the business-scoped Cabinitron designer below that header only after the cloud-design migration receiver reports ready. Cabinitron's `embed=studio` mode removes its outer site navigation and fills the frame; designer tools remain available. Starter and brand navigation preserve embed mode.

## Cloud-saved designs

Only cloud-saved designs are carried forward. Browser-local drafts, browser history and edit-key storage are deliberately left in their original browser/origin. No storage bridge or browser credential transfer is implemented.

H2's rooms table remains an immutable source archive; other legacy service functions remain unchanged. Cabinitron has a server-configured source binding restricted to the From Trees business. Legacy designs appear in that business's Designs list even before they are opened. On opening or naming one, Cabinitron inserts its original slug, edit hash, exact serialized design, revision and timestamp atomically and records a source digest. Existing destination collisions are rejected without replacement. Once imported, later Cabinitron saves cannot be replaced by the older archive. Existing `/cabinet-configurator?design=SLUG` links pass the slug into the embedded designer. Sharing snapshots already stored as legacy rooms remain addressable.

The existing history mechanism records the imported current revision and later saves. Earlier overwritten legacy revisions cannot be reconstructed. Retained price-request snapshots and delivered share invitations keep their original retry result through the compatibility receiver. Original leads, analytics and catalog records remain in the archive; this change does not migrate the full legacy CRM/reporting database or alter Cabinitron pricing settings.

## Ordered automatic release

1. Approve and land the Cabinitron diff. Its normal automatic release applies the source-marker schema, configures the legacy read binding and named `H2Migration` service entrypoint, and permits the From Trees origins to frame the designer. Importing remains disabled until the source is frozen.
2. The H2 PR may then be merged by a human. Its existing GitHub Actions workflow verifies that the deployed Cabinitron receiver is available before running the H2 cutover migration.
3. The H2 cutover migration marks the source destination and prevents inserts, updates or deletes in legacy `rooms`. This also rejects writes by an old in-flight Worker instance rather than creating two authoritative writers.
4. The H2 rooms Worker deployment forwards authenticated room, sharing and price operations through the named Cabinitron service binding. The storefront page selects its iframe when the receiver reports the matching frozen source. No public HTTP endpoint bypasses verification; only the named service receives already-verified legacy requests. H2 continues sending legacy sharing emails, so the receiver does not send a duplicate.
5. Verify the production embedded page, an existing saved-design link, a save, all four views, sharing/price inquiry and the business Designs list. These are post-release checks, not claims established by local tests.

If the H2 deployment fails after freezing the source, keep the source frozen and repair/retry the versioned workflow. Do not manually unfreeze the archive or publish either Worker to compensate for a pipeline failure. Cabinitron import/receiver failures return a retryable error; source data is retained.

## Validation boundaries

Local tests cover exact imported bytes and identity/revision preservation, legacy edit ownership, tenant boundaries, archive readiness, collision refusal, source immutability, backward-compatible sharing/pricing, header/iframe behavior and query allowlisting. Visual evidence uses the actual H2 route/header and Cabinitron components with synthetic local data; it does not claim a production cutover, a hosted preview or a full Oxygen/Shopify runtime test. A read-only compatibility audit validates legacy design structure without printing or saving design payloads.
