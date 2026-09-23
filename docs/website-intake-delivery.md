# Website inquiry delivery

H2 accepts a generic intake through its authenticated Cloudflare service and durably
stores it in D1 before reporting success. Each immutable event has independent Resend
and ftops delivery rows. The existing worker runs a one-minute scheduled drain; failures
in either destination cannot erase the inquiry or prevent the other delivery.

## Contracts

The ftops contract was inspected in noahpeters/ftops PR #11 at
`da4174af4cbf56da45da4d0a2a672f5cea852225`, particularly
`apps/api/src/routes/websiteIntake.ts` and `docs/website-intake.md`.
PR #11 was confirmed merged at 2026-09-23 06:10:35 UTC. Per the requested rollout
assumption, ftops deployment precedes this H2 release.

- `POST /website-intake/:integrationId`, `Authorization: Bearer <intakeToken>`.
- H2 sends `externalEventId` equal to its submission/request ID. ftops resolves the
  tenant from its integration credential; H2 sends no workspace, customer or contact ID,
  and never calls CRM CRUD endpoints.
- Only fields permitted by the strict ftops schema are sent. The schema has no UTM,
  configurator, disclosure-text or extensible metadata field. These values are preserved
  losslessly in its **message string as a JSON envelope** (`format: h2-inquiry-v1`),
  together with the original message and structured details. ftops does not automatically
  index these as first-class metadata columns. No schema extension is assumed.
- ftops consent is `granted` or `not_provided`, with disclosure version and the original
  server capture time. H2 never interprets an unchecked control as `revoked`.
- Unknown/unchecked marketing controls never change an existing preference.

Resend uses the documented REST Events API, `POST https://api.resend.com/events/send`.
The installed SDK predates this API, so the adapter uses worker-compatible `fetch` rather
than upgrading unrelated email behavior. Event: `inquiry.received`; top-level email:
**the sender/customer**. The payload has the 19 agreed flat fields plus `customer_email`, because the live
configured internal-notification template binds `event.customer_email`. The customer
address remains the top-level `email` too.
See https://resend.com/docs/api-reference/events/send-event.
The Resend Automation owns acknowledgement and internal inquiry-notification emails.

## Covered surfaces

| Surface | Action | source_path | source_kind | configurator_source |
| --- | --- | --- | --- | --- |
| General contact | `/contact` | `/contact` | `contact` | empty |
| Furniture landing, both placements | `/inquire/furniture` | same | `furniture` | empty |
| Cabinetry landing, both placements | `/inquire/cabinetry` | same | `cabinetry` | empty |
| Designer landing, both placements | `/inquire/designers` | same | `designers` | empty |
| Table study dialog | `/contact` | `/configurator` | `table_study` | `table` |
| Cabinet study dialog | `/contact` | `/cabinet-configurator` | `cabinet_study` | `cabinet` |
| Cabinet price request | `/api/cabinet-price` | `/cabinet-configurator` | `cabinet_price` | `cabinet` |
| Cabinet share sender | `/api/cabinet-share` | `/cabinet-configurator` | `cabinet_share` | `cabinet` |

Every actual intake form has optional, initially unchecked marketing consent, with the
same disclosure text and `website-inquiry-v1` version. The two landing placements share
consent state. The cabinet project-contact checkbox remains a separate permission;
phone is forwarded only when that permission is granted. The disclosure now explains
that the request itself is retained regardless of optional follow-up/marketing choices.
The sharing recipient is never enrolled or added to ftops. The existing idempotent
`emails.send()` invitation to that recipient remains; it is not the removed internal
inquiry notification.

Study summaries are retained independently of the editable message. Cabinet pricing
and sharing retain a design reference/revision, not private edit credentials. Room
snapshots/price-request records remain in the existing H2 room service; the intake
contract does not transfer a complete cabinet CAD document to ftops.

## Idempotency, failure isolation and limits

The event insert and both delivery rows are one atomic D1 statement via a trigger.
Identical retries reuse the original server timestamp, payload and states. Key order
is canonicalized for comparison. A changed payload with the same ID returns 409;
reload/reopen the form to begin a genuinely new inquiry. Forms keep their ID during
loader revalidation. Completed delivery rows are never automatically resent.

ftops network failures, 429 and 5xx responses retry with exponential delay, capped at
one hour, without an automatic attempt limit. The exact original payload is reused.
A 4xx contract/auth/conflict failure goes to `review`. Crashed ftops sends recover
from a two-minute lease and safely repeat using ftops's documented idempotency.

**Resend Events does not document idempotency guarantees.** The adapter supplies an
`Idempotency-Key`, but correctness does not assume it is honored. Durable atomic claims
prevent concurrent/known duplicates. Explicit 429 rejections retry. Ambiguous timeouts,
network failures, interrupted sends and other rejected/invalid receipts go to `review`
rather than risk sending a second acknowledgement. This is an explicit limitation:
exactly-once external side effects cannot be guaranteed after an ambiguous provider
response without provider deduplication. The full inquiry remains safely stored and
ftops proceeds independently. Operators must reconcile these cases with Resend logs.

A missing downstream credential leaves delivery pending and logs `not_configured`.
A failed D1 acceptance returns a form error, never a false success. A customer may see
success while delivery is pending; success means **received durably**, not delivered
into an email inbox. Normal dispatch starts on the next one-minute tick.

Evidence that exceeds ftops's 16,000-character message or 64-KiB request limit is
rejected before acceptance; nothing is silently truncated. User messages are limited
to 10,000 characters to leave space for metadata. Source UTM values retain the existing
200-character bounds.

## Required deployment configuration

| Location | Setting | Purpose |
| --- | --- | --- |
| Oxygen server environment | `CABINET_ROOMS_URL` | Existing H2 worker origin, now serving `/intake` too |
| Oxygen server secret | `CABINET_ROOMS_TOKEN` | Existing H2-to-worker integration credential |
| Oxygen | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Existing form verification |
| Oxygen | `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` | Still needed for design-sharing invitations |
| GitHub `cabinet-rooms-production` secret | `RESEND_API_KEY` | Worker Events API key for the configured automation |
| GitHub `cabinet-rooms-production` variable | `FTOPS_INTAKE_URL` | Exact HTTPS URL ending `/website-intake/<provisioned integration ID>` |
| GitHub `cabinet-rooms-production` secret | `FTOPS_INTAKE_TOKEN` | ftops website integration's `intakeToken` |
| GitHub/worker | Existing Cloudflare account/token, database ID and `CABINET_ROOMS_TOKEN` | Unchanged service deployment requirements |

The deployment action maps the three new provider settings to worker secrets with the
same names. The ftops URL and credential must be provisioned through ftops's website
integration setup; the selector is not a workspace ID. Edge access must admit this
server call to the exact intake route. Redirects are rejected to prevent credential
forwarding and avoid treating a login page as a receipt.

The production Oxygen workflow now calls the cabinet-service deployment first. That
workflow verifies provider settings and an enabled `inquiry.received` automation, applies migration `0009_intake_outbox.sql`, and
deploys the worker/cron before Oxygen publishes the new forms. Missing settings or no enabled matching automation block
production cutover. This read-only guard does not replace testing the intended
internal/customer recipient routing. Branch previews do not deploy the production worker; to test them
before merge, point Oxygen preview settings at a separately prepared test worker.
No infrastructure or credentials are provisioned merely by opening the PR.

`CONTACT_TO_EMAIL` is no longer needed for inquiry handling. Keep old Oxygen secrets
through the rollback window. Do not automatically fall back to direct notification
email on an uncertain event result: it can duplicate messages.

## Operations and rollback

Worker observability is enabled. `intake_delivery_failed` records only submission ID,
destination, reason and review status; it does not log contact details or credentials.
Each drain logs `intake_delivery_review_required` when held rows exist. Review these
logs and the outbox; no alert destination is configured by this PR.

Read backlog with authenticated Cloudflare administrative access:

```sql
SELECT event_id,destination,state,attempts,next_attempt,last_error,receipt
FROM intake_deliveries WHERE state != 'sent' ORDER BY next_attempt;
```

After correcting a rejected ftops credential/schema issue, reset its reviewed row to
`pending` with `next_attempt=0`, keeping the event ID/payload. For Resend, first inspect
provider logs/automation runs using `submission_id`: mark the row `sent` if accepted,
or reset to `pending` only when confirmed not accepted. Do not blindly replay unknown
outcomes. Stored inquiries and delivery state survive a worker restart.

Rollback the storefront to the previous release while leaving the additive migration
and this worker running to drain accepted events. Do not drop the outbox or mass-replay
rows. The previous storefront uses its retained direct-email secrets. New submissions
during that rollback use the old behavior; forward integration resumes after restoring
this release. Existing accepted events continue delivering from their original state.

## Reproducible tests

`npm run verify` runs the complete repository checks, including SQLite-backed tests
that traverse the real route actions, authenticated service, atomic inserts and both
provider adapters. All eight paths are exercised with `granted` and `not_provided`,
then retried with the same ID. Additional cases cover concurrent drains, conflicts,
crashed leases, lost ftops responses, ftops failure after Resend acceptance, Resend 429,
ambiguous Resend acceptance, invalid input, missing authorization and failed storage.

For browser testing on Node 22+:

```sh
node scripts/intake-e2e/server.mjs
```

Open `http://127.0.0.1:4179`. The harness renders the real routes/components and calls
real server actions and the real room/intake worker using a freshly migrated in-memory
SQLite database. Only Turnstile and external providers are doubled. It loads no `.env`,
binds loopback only, and rejects unknown server outbound requests. `GET /__drain` runs
the scheduled dispatcher; `/__status` exposes test-only receipts; `/__failure?destination=ftops`
or `resend` simulates an outage (empty destination clears it). Restarting clears all
local test records. These helpers are not in the deployed app or worker.

Live Resend automation execution, live ftops authentication/edge access and
production D1/cron remain deployment smoke tests. Local fixtures are not claimed to be
production provider records. No production email or CRM record was created during this
validation.

## Live readiness check (2026-09-23 UTC)

A read-only check using H2's existing Resend key confirmed event `inquiry.received`
(`01a0ccc2-ecaf-775e-833b-7653bb586322`) has all agreed fields plus `customer_email`.
The internal notification binds that extra field, so the H2 payload includes it.
Both automations currently report **draining**, not enabled:

- H2 — Internal inquiry notification: `01a0ccd1-74c7-71eb-9f7b-9221747970ee`.
- H2 — Inquiry notification and acknowledgement: `01a0cc92-4e5c-721d-bad6-7c2f7b1ed25c`.

Do not cut over until the intended automations are enabled and their customer/internal
recipient routing is verified with controlled test data. No Resend configuration was
changed and no live event was sent. Template execution/routing is not proven by the
read-only schema check.

H2 already has `RESEND_API_KEY` in its deployment environment; the existing key was
successfully used for the read-only Resend check above. The inspected GitHub repository
and `cabinet-rooms-production` setting lists did not list `RESEND_API_KEY`,
`FTOPS_INTAKE_URL`, or `FTOPS_INTAKE_TOKEN`. This does **not** establish that these are
absent from the deployed worker: its secret names could not be inspected because this
session lacks Cloudflare authentication. Worker secret presence is **UNVERIFIED**.

This PR's worker deployment and read-only readiness guard consume these settings from
the GitHub `cabinet-rooms-production` environment (repository secrets are also inherited).
Ensure that deployment job can access them before merging; an existing Oxygen secret
is not automatically available to a separate GitHub job or Cloudflare worker. No keys
were changed. Live ftops access could not be tested without an available integration
endpoint/credential.
