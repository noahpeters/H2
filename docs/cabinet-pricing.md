# Cabinet project pricing

The **Get price range** action requires the visitor to submit their name and email through the existing Share-style sheet. Contact consent uses the same default-checked, optional checkbox and exact cabinet-project wording. An optional phone field appears only while consent is checked. Declining contact does not block the price. No recipient information or email delivery is involved.

The browser saves the latest room first, submits a `cabinet-price` Turnstile challenge, and displays a range only after a successful response. Canceling never reveals a price. Every new request opens the form again. This is a workflow gate, not an identity-verification or secrecy guarantee.

## API and storage

- Public website `POST /api/cabinet-price`: same-origin, bounded JSON body, validated name/email, Turnstile action/hostname verification; forwards to the protected Worker. GET returns 405.
- Protected Worker `POST /quote`: requires the service bearer token, rate limit, slug, editKey, exact saved revision, UUID requestId, senderName, senderEmail, boolean consent and optional senderPhone. Calculates against that authorized revision, not a later room save. Retries are idempotent; changed details require reopening the form.
- Protected Worker `GET /price?slug=…`: server-to-server project estimate using current rates; requires the service bearer token. Never expose that token or a public GET proxy. Missing slug 400, unknown room 404, unsupported dimensions/configuration 422, missing/invalid rates 503. Responses are no-store.
- `room_price_requests`: immutable design JSON, revision, returned estimate JSON, request timestamp, consent flag and idempotency hash. Opt-out requests do not store names, emails or phones here or in leads. Do not expose this table publicly.
- `cabinet_leads`: only opt-in requesters, with consent wording/version/time, optional phone and `lead_source='price'`. Existing sharing leads default to `share`. Join price leads to the request snapshot using the `price:` request ID prefix; room_slug can subsequently change as the owner edits the room.

No new administration screen is included. Authorized team members can inspect price-request snapshots/timestamps and consenting leads through D1. Avoid contact data in logs. Website requests return only customer-safe estimate fields; no cost, margin, material rate, purchase quantity or unrounded selling price.

## Calculation and assumptions

Implements the cabinet-bottom-up-pricing skill's physical takeoff, project-wide whole-sheet/whole-linear-foot purchasing after waste, separate box/drawer/finishing labor, hardware, miscellaneous allowance and gross-margin selling-price calculation. `pricing-reference.json` is the skill-calculator parity fixture; its expected range is $5,500–$6,500. Tests compare internal results privately rather than returning them to customers.

The range endpoints are `round(price * 0.9 / 500) * 500` and `round(price * 1.1 / 500) * 500`. Rounding can change the final relative tolerance or collapse a small range to one value. Prices are USD, estimates rather than binding quotes. An empty cabinetry schedule returns $0–$0 and an explanation.

Explicit conservative allowances: two finished ends per cabinet; full finished backs for island-assigned cabinets; no interior shelves; four feet on base/tall cabinets; face stock by sheet area; standard labor across front styles. Glass-front uppers use visible-material boxes with full face allowance. Corners use their rectangular envelope. Appliance cabinet openings reduce front area; panel-ready refrigerator/dishwasher fronts are priced as panels only. Detailed exposure, inset/shaker joinery and specialty hardware need shop review. These assumptions accompany the estimate.

Always excluded: installation, delivery, tax, field work, countertops, glass, appliances/sinks/hoods, decorative pulls, plumbing, electrical work, design fees, unmodeled fillers/scribes/infill and specialty pull-out/corner mechanisms.

## Administrator rates

Migration `0004_pricing.sql` seeds individually configurable rates in `cabinet_pricing_rates`; `0005_price_requests.sql` adds request records and lead source. Both run through the existing GitHub Actions deployment migration step on merge, before Worker deployment. Do not deploy locally.

Face-stock defaults approved by the owner: rift white oak and walnut $250 per 32-sq-ft sheet; maple and cherry $200; paint grade $187.50. These are independent editable amounts, not ongoing percentage relationships. Other rates follow the pricing skill. Axilo feet default to the miscellaneous allowance. NULL labor rate means derive from weekly cost/productive hours; NULL profit cap means uncapped. Other missing required values fail closed, not free material.

Use authorized D1 administration to inspect `SELECT key, value, unit, description, updated_at FROM cabinet_pricing_rates ORDER BY key`. For example, change walnut sheet cost with:

```sql
UPDATE cabinet_pricing_rates SET value = 275 WHERE key = 'face_walnut';
```

The trigger refreshes updated_at; newly requested estimates immediately use current DB rates with no redeploy. Existing request snapshots retain their original range for audit/idempotent retries. Validate currency amounts >=0, waste/overhead as decimal fractions, margin <1, productive hours >0. All internal rates and economics remain server-only.

## Verification after merge

Confirm both migrations and storefront/Worker deployment passed. On production, open the price form, verify Turnstile succeeds, submit an opt-out request and confirm a range plus a snapshot but no lead. Separately, with explicit permission to create a test lead, verify opt-in and optional phone. Do not send test emails; pricing sends none.
