# First-party website acquisition

H2 collects acquisition events for the current public storefront and inquiry pages. The Oxygen handler and same-origin browser endpoint send to the existing authenticated Cabinet Rooms Worker. The Worker acknowledges after committing to its H2-owned D1 database. FTOPS already reads H2-owned configurator data for reporting, and its website intake reconciles submissions that contain an email. Anonymous visitors stay in H2. The existing configurator operational analytics, Shopify analytics, Cloudflare beacon, Meta Pixel and Google Ads paths continue to run independently.

## Event meanings

- `arrival` is a successful HTML document response observed by Oxygen. It records the public landing URL with its query and fragment removed, referrer origin, time, and experience version. Known bots, browser prefetch/prerender, and other navigation requests have distinct labels. An activated prerender can subsequently produce a view. Cache-served requests outside Oxygen and unidentified bots can affect coverage.
- `view` is recorded when the browser renders a visible public route. It includes a visitor ID, session ID, occurrence time, path, and a document arrival ID when available. It records each touch separately with allowlisted UTM fields and campaign/ad identifiers. When Shopify permits marketing, `ad_attribution` records the Meta and Google click IDs and the associated view ID. A permission change can add this event without editing the original view.
- `inquiry_cta` and `configurator_cta` record activation of the existing links. `inquiry_accepted` records successful intake using the same submission ID as Meta lead and FTOPS receipts where applicable. FTOPS receives visitor and session IDs in `message.details.acquisition` under its existing `h2-inquiry-v1` contract. FTOPS may reconcile the inquiry later or place it in review. A browser event must have reached H2 to set the signed, short-lived session cookie used by inquiry requests.
- An arrival never carries visitor/session IDs, click IDs or arbitrary query values. The browser view links the arrival. Document responses carrying the arrival ID are private and non-cacheable to prevent shared caches reusing the ID. Referrers are reduced to origins. Account and admin routes, raw request bodies, form values, IPs, and user agents are excluded from acquisition rows. The Worker uses the existing rate limiter with a separate key prefix.

## Delivery and identity evidence

The browser persists first-party events when storage is available and retries with the original event ID. An acknowledgement loss cannot add a second row. The documented storefront transport timeout and bounded Oxygen retries keep telemetry from blocking an inquiry. Server observations can be lost during a sustained collector outage before the D1 commit. H2's existing direct FTOPS call retains its best-effort behavior. An FTOPS failure can leave an H2 inquiry event without CRM evidence.

The independent identity assertion and withdrawal tables support later joins without rewriting original events. An assertion records a workspace-scoped FTOPS contact or tenant-scoped Cabinitron portal subject, opaque evidence reference, time and trusted asserting actor. A withdrawal references the original assertion. A future authorized writer should require a reconciled FTOPS submission or authenticated portal evidence, check the workspace/tenant and record the actor. A click ID, unverified email match or inferred household is insufficient. The schema establishes the history contract. The authenticated writers and the FTOPS reporting reader are separate integration work.

## Configuration and validation

Acquisition is disabled unless Oxygen has the existing Cabinet Rooms credentials, `SESSION_SECRET`, `ACQUISITION_MODE`, and `ACQUISITION_VISITOR_TTL_SECONDS`. Apply `0011_acquisition.sql` through the existing Cabinet Rooms migration and deployment workflow before enabling the Oxygen setting.

- `ACQUISITION_MODE=coarse-arrivals` enables the collector. First-party arrivals, views and interactions are independent of Shopify analytics permission. Global Privacy Control and Do Not Track suppress this collector.
- Set `ACQUISITION_VISITOR_TTL_SECONDS` to the approved visitor lifetime. The collector reuses H2's 30-minute inactivity window for sessions. A browser opt-out signal clears the browser's IDs and pending events, and expires the signed cookie. Marketing revocation discards pending advertising attribution events.
- `ACQUISITION_EXPERIENCE_VERSION` defaults to `baseline-v1`. Set it before publishing a changed acquisition experience.
- Before production enablement, apply an approved purge schedule for raw event rows and agree how long to keep evidence associations. Migration update triggers protect retained rows from in-place edits and allow a privileged maintenance process to remove expired records.

Run `npm run verify`. The intake integration suite sends synthetic page and inquiry events through the actual Oxygen action and Worker into SQLite. It checks separate traffic categories, first-write deduplication, browser opt-out, marketing-gated click IDs, and the existing inquiry receipt and FTOPS wire contract.
