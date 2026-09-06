# Cabinet design sharing

The normal configurator URL contains no room identifier. The browser restores its most recent owned room from local history, preserving unsaved drafts. Opening an incoming `design` link creates an independent copy and removes the identifier from the address bar. Removing local storage removes this browser's ownership history; this is not an account system.

Share opens a form for sender and recipient names and email addresses. The default-checked consent text is exactly “From Trees may contact me about my cabinet project”. Only checked consent creates a sender record in the private D1 `cabinet_leads` table, with consent wording, version, time, and room reference. Recipient details are not stored in the lead table. Delivery details are processed by Resend; sender identity is not verified. No CRM sync or team-facing lead management screen is included.

Sharing creates an immutable room snapshot and sends its link through Resend. Recipients can forward the link: hidden identifiers are not access control. Edit credentials never appear in email. Turnstile, origin checks, authenticated API calls, per-IP share limits, and request/email idempotency protect the sending endpoint. A consenting lead is captured when sharing is prepared, even if the email provider subsequently rejects delivery. Provider acceptance is not proof of inbox delivery.

## Deployment and verification

Use the existing main-merge GitHub Actions deployment; do not deploy locally. The cabinet API workflow must apply `0002_sharing.sql` and deploy the `SHARES` rate-limit binding. Oxygen needs the existing `CABINET_ROOMS_URL`, `CABINET_ROOMS_TOKEN`, `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `TURNSTILE_SECRET_KEY`, and public `TURNSTILE_SITE_KEY`. The Turnstile widget must authorize the storefront hostname. No new secrets are introduced.

After both deployments complete, verify with an explicitly authorized recipient: actual Turnstile completion, provider delivery, opening an independent copy, clean URL/reload restoration, and consenting versus non-consenting D1 lead records. Local tests mock email delivery and do not send real invitations. Restrict team database access and establish lead retention/deletion procedures before broad promotion.
