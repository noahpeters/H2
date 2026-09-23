# Website inquiry delivery

All public intake routes send directly from Oxygen, using the existing Oxygen
`RESEND_API_KEY`, `FTOPS_INTAKE_URL`, and `FTOPS_INTAKE_TOKEN` settings. There is no
Cloudflare intake-service call, durable queue, callback, or automatic retry in the
submission path. The existing cabinet service remains responsible for cabinet designs,
sharing and pricing only.

## Behavior

1. Validate the form and Turnstile.
2. Send one `inquiry.received` event directly to Resend from Oxygen. The top-level
   email is the customer's email. A rejected or invalid Resend receipt returns a form error.
3. After Resend accepts, attempt ftops once with a two-second timeout. A missing
   setting, failed request or invalid receipt logs `ftops_intake_failed` with the
   submission ID and a sanitized reason. It does not fail the form submission.

No provider keys are copied to GitHub or the cabinet worker. Fetch uses Oxygen-supported
`redirect: manual`; redirects are not followed. The submission ID is used for both
provider idempotency keys and ftops `externalEventId`. Resend Events does not document
an exactly-once guarantee; there is no application queue or automatic replay.

## Contracts and consent

Uses the strict contract inspected in merged ftops PR #11:
`POST /website-intake/:integrationId`, `Authorization: Bearer <intakeToken>`.
H2 sends no authoritative workspace ID and never calls customer CRUD APIs. The strict
ftops schema has no extensible source metadata field, so source kind, configurator,
UTM values, disclosure text and structured details are preserved in its message as a
JSON envelope with `format: h2-inquiry-v1`, alongside the original customer message.

The Resend payload contains all 19 agreed flat fields plus `customer_email`, which
the configured internal-notification template references. Marketing consent is
optional and initially unchecked. It sends `granted` or `not_provided`, never revocation,
with `website-inquiry-v1` and captured timestamp. Cabinet project-contact permission
remains separate; sharing recipients are not added as leads. The separate design
invitation email remains unchanged.

## Covered submission paths

- `/contact`: general inquiry.
- `/inquire/furniture`, `/inquire/cabinetry`, `/inquire/designers`: both form placements.
- `/configurator`: table study dialog.
- `/cabinet-configurator`: cabinet study dialog.
- `/api/cabinet-price`: cabinet pricing sender intake.
- `/api/cabinet-share`: cabinet sharing sender intake.

All call the shared Oxygen `acceptIntake` adapter. General inquiries and study dialogs
no longer require cabinet-service credentials. Actual cabinet saving/pricing/sharing
retains its pre-existing cabinet-service dependency.

## Deployment and validation

The storefront deployment depends only on its normal validation job. It does not
wait for the separate cabinet worker deployment or read provider secrets from GitHub.
Every required test must be executable and pass before merge is attempted. Do not
introduce tests or readiness gates that run only during deployment.

Run `npm run verify` and the local browser harness `node scripts/intake-e2e/server.mjs`.
The harness uses actual forms/actions, provider test doubles and a local cabinet worker
for cabinet-specific functions. It never loads production secrets. `/__failure` can
simulate ftops failure; accepted submissions must still show success.

## Superseded outbox

The previous release introduced an intake outbox in the cabinet worker. Its historical
tables and records are preserved rather than deleted during this emergency correction.
The new Oxygen submission path does not read or write them. Previously queued entries
must be reconciled separately; do not claim they were delivered merely because new
submissions succeed. No data deletion or provider-secret provisioning is part of this fix.
