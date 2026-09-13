# Cabinet configurator reporting

The private reporting UI lives in FTOPS at `/configurator`. The companion FTOPS change provides administrator-only access, date filters, activity totals, campaign/referrer breakdowns, read-only plan previews, and consenting leads. H2 continues to own the source records.

Apply `0008_analytics.sql` through the existing main-merge Cabinet rooms API GitHub Action. Set the optional `CABINET_ANALYTICS_READ_TOKEN` secret in the `cabinet-rooms-production` environment and the same secret in FTOPS. Use a newly generated value different from `CABINET_ROOMS_TOKEN`. The workflow sets `ANALYTICS_READ_TOKEN` on the cabinet Worker; the existing storefront write credential stays separate. Missing read credentials fail closed. The storefront's public proxy cannot reach the reporting paths.

Set FTOPS's `CABINET_ANALYTICS_URL` GitHub variable to the cabinet Worker's HTTPS origin. FTOPS connects server-to-server. No analytics key or write key reaches the dashboard browser. The read token can access only GET `/admin/dashboard` and GET `/admin/design?slug=…`; it cannot save or share rooms. These responses are no-store and never return raw saved-study data, edit hashes, or edit credentials.

## Collection and accuracy

First-party configurator sessions and visits are recorded independently of optional analytics consent. Third-party analytics retain separate consent controls. First-touch UTM source/medium/campaign or the external referring hostname is remembered per browser tab. A session expires after 30 minutes without activity. No full referrer URL, raw IP, or browser fingerprint is stored. Known bots are excluded at the same-origin visit endpoint. Rate limits and request-size limits continue to apply. There is no claim of complete visitor counts or bot elimination.

Business outcomes are recorded only after the existing successful operation. Deterministic event IDs prevent retries from inflating counts. Reporting failure does not prevent a save, estimate, or successful email share. Lead records continue to require contact consent independently of analytics consent. Reporting is best-effort, so blocked requests, or telemetry outages can reduce coverage.

Historical shares, price requests, and consenting leads use existing authoritative tables. Visits, creation counts, email acceptance, and attribution begin with the new tracking; the migration records its start time. A share record exists before email sending, so prepared shares and recorded provider-accepted emails remain separate metrics. Provider acceptance is not inbox delivery. New room copies count as designs; share snapshots and autosaves do not. The gallery uses last-updated time because older rooms have no reliable creation timestamp.

## Release verification

Use both repositories' GitHub Actions workflows. Confirm the private FTOPS page with actual administrator and non-administrator identities; verify read-token denial on room writes; then verify a tracked visit with campaign tags, a room save, a price request, and an explicitly authorized share against stored records. Test denied analytics consent separately from denied contact consent. Local tests use SQLite and mocked email/browser responses, not production data or real recipients.
