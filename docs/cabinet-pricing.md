# Cabinet project pricing

The **Get price range** action requires the visitor to submit their name and email through the existing Share-style sheet. Contact consent uses the same default-checked, optional checkbox and exact cabinet-project wording. An optional phone field appears only while consent is checked. Declining contact does not block the price. No recipient information or email delivery is involved.

The browser saves the latest room first, submits a `cabinet-price` Turnstile challenge, and displays a range only after a successful response. Canceling never reveals a price. Every new request opens the form again. This is a workflow gate, not an identity-verification or secrecy guarantee.

## API and storage

- Public website `POST /api/cabinet-price`: same-origin, bounded JSON body, validated name/email, Turnstile action/hostname verification; forwards to the protected Worker. GET returns 405.
- Protected Worker `POST /quote`: requires the service bearer token, rate limit, slug, editKey, exact saved revision, UUID requestId, senderName, senderEmail, boolean consent and optional senderPhone. Calculates against that authorized revision, not a later room save. Retries are idempotent; changed details require reopening the form.
- Protected Worker `GET /price?slug=…`: server-to-server project estimate using current rates; requires the service bearer token. Never expose that token or a public GET proxy. Missing slug 400, unknown room 404, invalid saved room data 422, missing/invalid rates 503. Responses are no-store.
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

Face-stock defaults approved by the owner: rift white oak and walnut $250 per 32-sq-ft sheet; maple and cherry $200; paint grade $187.50. These are independent editable amounts, not ongoing percentage relationships. Plain-sawn white oak uses the current maple rate (`face_maple`), including future rate changes, while retaining its own material purchase pool. Other rates follow the pricing skill. Axilo feet default to the miscellaneous allowance. NULL labor rate means derive from weekly cost/productive hours; NULL profit cap means uncapped. Other missing required values fail closed, not free material.

Use authorized D1 administration to inspect `SELECT key, value, unit, description, updated_at FROM cabinet_pricing_rates ORDER BY key`. For example, change walnut sheet cost with:

```sql
UPDATE cabinet_pricing_rates SET value = 275 WHERE key = 'face_walnut';
```

The trigger refreshes updated_at; newly requested estimates immediately use current DB rates with no redeploy. Existing request snapshots retain their original range for audit/idempotent retries. Validate currency amounts >=0, waste/overhead as decimal fractions, margin <1, productive hours >0. All internal rates and economics remain server-only.

## Verification after merge

Confirm both migrations and storefront/Worker deployment passed. On production, open the price form, verify Turnstile succeeds, submit an opt-out request and confirm a range plus a snapshot but no lead. Separately, with explicit permission to create a test lead, verify opt-in and optional phone. Do not send test emails; pricing sends none.

## Maple internals

The optional room flag `useMapleInternals` is saved with the design. With it enabled, concealed carcasses and drawer boxes use maple in the interactive scene, photo capture, fabrication manifest, and parts CSV. Door and drawer fronts, face frames, toe-kick faces, separate end attachments, and visible open or glass-front interiors retain the cabinet finish. A custom cabinet with any uncovered opening retains its selected carcass finish; its drawer boxes can still be maple. Ordinary door opening during preview does not change this stock choice.

Room estimates now use the selected interior material rather than assuming generic box stock for every closed cabinet. Carcass and back area share the appropriate `face_<material>` sheet purchase pool. Custom cabinet carcass/front areas come from the saved physical parts. Unspecified standard shelves remain excluded, and standard drawer dimensions/labor allowances remain estimates.

Maple drawer stock and bottoms use the existing `drawer_stock` and `drawer_bottom_sheet` rates. Other species prefer explicitly configured `drawer_stock_<material>` and `drawer_bottom_sheet_<material>` rates in the same units. When those keys are absent, the estimate scales the maple stock rate by the selected `face_<material>` to `face_maple` ratio; this is a disclosed budget allowance, not a verified solid-lumber quote. An explicitly NULL/invalid species rate fails closed. Plain-sawn white oak still follows the live maple sheet rate. No new production rate or migration is imposed.

Premium species generally cost less with maple internals at the approved rates, but whole-sheet/linear-foot purchasing, separate material pools, and $500 range rounding can affect the displayed saving. Existing quote snapshots remain unchanged. The original generic-stock calculator fixture remains a regression test for the underlying purchase/labor/margin calculation; new room schedules explicitly carry their material selections.

## Supported-feature pricing gate

Every selectable cabinet type, open-storage type, saved custom cabinet template, cabinet material, and standalone room panel must return a finite automatic estimate. The pricing coverage test consumes the editor catalog and material catalog directly, so new choices are tested automatically. Exhaustive object-kind, base-configuration, and tall-configuration maps fail typecheck when a new model option lacks a pricing rule. Both storefront and cabinet-service deployment depend on the CI workflow running `npm run verify`; feature pricing coverage must pass before deployment.

Standalone panels store thickness in `width`, span in `depth`, and vertical size in `height`. Their stock allowance is `depth * height / 144` square feet, pooled with matching front stock after waste. Each panel has one finishing allowance, no cabinet box, no drawer stock, no hinges, and no feet. Thin room panels must never be subjected to cabinet-box minimum dimensions. Customer requests have no custom-estimate fallback; missing or invalid administrator rates remain an operational pricing error rather than an invented price.

## Beaded Shaker face charge

Beaded Shaker adds **$10 to the selling price for each door or drawer face using that profile**. Standard cabinets count their physical fronts, including a sink false front but excluding a farmhouse sink apron. Custom cabinets count expanded drawer-array faces individually and honor each part's style override; tambour fronts are excluded because they do not use this profile. Doorless open storage, cabinet panels and non-beaded faces receive no charge.

The fixed selling-price addition is applied after the existing margin/profit-cap calculation, before the existing $500 price-range rounding. It is not multiplied by margin, overhead or waste. A small addition may therefore leave the displayed rounded range unchanged. No production rate edits or migration are required; new estimates use the addition after normal reviewed deployment, while existing quote snapshots retain their recorded prices.

**Beaded Flat adds $5 per door/drawer face** using that profile. It uses the same face-count, override, drawer-array and exclusion rules as Beaded Shaker. Mixed cabinets add $10 for each beaded Shaker face plus $5 for each beaded flat face; plain faces add nothing. Both additions enter the selling price after margin/profit-cap calculations and before range rounding.

Combination front selections price the resolved profile of each physical face: $5 for a Beaded Flat top face and $10 for each Beaded Shaker lower face. Flat and standard Shaker faces add no profile charge. For example, three drawers with Beaded Flat on top and Beaded Shaker below add $25; Flat on top with Beaded Shaker below adds $20. Paired top doors each receive the top profile and its charge. Single-row cabinets use the top profile. These additions retain the existing selling-price and displayed-range rounding rules.

With maple internals enabled, the physical automatic finish panels replace the blanket two-end/island-back finish allowances. Each exposed panel patch contributes its actual finished area and the existing panel finishing allowance, using its controlling cabinet's exterior material. Disabling automatic panels removes these additions. Custom-cabinet stock and panel-ready appliance allowances remain independent. Attached panels do not increase the count of user-created priced objects and receive no door/drawer profile surcharge.

## Face-frame lumber and continuous runs

Inset and partial-overlay frames now have a separate solid-lumber allowance. Rail and stile stock uses `width × height × thickness / 144` board feet, including interior members and custom arched-rail blank dimensions. Standard corner cabinets use their two arm frames; floating shelves, appliances, room panels, and full-overlay cabinets have no face-frame allowance. Cabinet assembly and finishing labor remain covered by the existing cabinet allowances, with no invented separate labor rate.

The live selected-material sheet rate is converted to a provisional lumber rate: a 3/4-inch 4×8 sheet represents **24 board feet**, so `$ / bdft = face_<material> / 24`. Plain-sawn white oak continues to follow the live maple rate. This is an estimating allowance derived from approved material costs, not a verified supplier solid-lumber quote. Frame board feet receive existing `face_waste`, overhead and gross-margin pricing. Lumber is costed by fractional board feet after waste; sheet material retains project-wide whole-sheet purchasing. Standard closed-front allowances credit the unextended frame footprint out of their broad sheet area; custom frame parts are removed from sheet takeoff to avoid charging the same stock twice. Open and appliance-opening front allowances retain their existing conservative coverage.

Only actual matched continuous runs receive the **20% premium on the whole equivalent individual frame material selling price**. Pricing retains the separate-frame stock baseline (including outer finish-panel extensions) rather than reducing the baseline for shared stiles. Eligibility uses the same neighbor matching as rendering/fabrication: overlay, adjacency, material, depth, height, elevation and orientation must match. Isolated frames retain individual pricing even if the room option is enabled.

The additional selling price is `eligible frame bdft × (1 + face_waste) × derived lumber $/bdft × (1 + overhead) / (1 - margin) × 0.20`. It enters after the optional project profit cap, like the existing profile additions, so the cap cannot erase the approved premium. The usual $500 range rounding can conceal small differences in the displayed range. No rate migration or production rate change is required, and saved quote snapshots remain unchanged.
