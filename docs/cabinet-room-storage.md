# Saved cabinet rooms

H2 uses a same-origin `/api/cabinet-rooms` proxy on Oxygen. A dedicated Worker owns the D1 database. Database credentials and the Worker service token never reach the browser. Layouts are public by unguessable slug; there is no public listing endpoint. A separate random edit key is returned only at creation, stored in local browser history, and hashed in D1.

## Behavior

- Opening `?design=SLUG` always reads and forks the source before enabling editing, including reloads and links to your own rooms. The URL is replaced with the new slug. The original is untouched.
- History (last 20 rooms, last successful save timestamp) explicitly resumes an owned room. Clearing browser storage loses edit access, but public URLs can still be opened as copies.
- New room creates the sample. Copy to new duplicates the current layout, including unsaved changes. Both wait for outstanding requests before switching.
- Autosave waits 800 ms after edits, serializes requests, and uses revision-conditional updates to reject stale tabs. Retry is explicit after a failure; Copy to new recovers conflicts. Unsaved drafts are retained in browser history where storage is available. Navigation prompts while changes remain unsaved.
- Missing/inaccessible links do not fall back to another layout or update the source. The UI shows the error and offers Retry or New room.

## Production setup (not performed by this PR)

The **Cabinet rooms API** workflow runs on every push to `main`, including every merged PR, with no path filter. Manual dispatch remains available for retries. Each run still requires approval in `cabinet-rooms-production` before migrations and deployment. Approve API deployments promptly alongside storefront releases: until approval and successful completion, the API can still be running an older schema validator than Oxygen.

1. Create a dedicated D1 database named `h2-cabinet-rooms` in the intended Cloudflare account. Do not reuse Metis or customer-management databases. Record its database ID.
2. Configure GitHub environment `cabinet-rooms-production` with a required human reviewer. Set variables `CLOUDFLARE_ACCOUNT_ID` and `CABINET_ROOMS_DATABASE_ID`; secrets `CLOUDFLARE_API_TOKEN` (Worker deployment and D1 permissions) and `CABINET_ROOMS_TOKEN` (a strong random service token).
3. Coordinate rollout: the configurator will show a cloud-configuration error until the API and Oxygen variables are available. Merge this PR, then dispatch **Cabinet rooms API** from main. The workflow applies the migration and deploys the Worker with its service token. No local production deployment is required. Do not advertise the saved-room feature before the following verification passes.
4. In Oxygen, configure server-only `CABINET_ROOMS_URL` (deployed Worker HTTPS URL) and `CABINET_ROOMS_TOKEN` (same token). Redeploy H2 through its existing GitHub Action. Configure these separately for preview if desired; do not point experimental previews at production storage.
5. Verify New room → edit → Saved online → History resume. Open its URL in another browser: the URL must change to a new slug and edits must not affect the source. Check Copy to new, failed requests, and concurrent-tab conflicts.

The Worker limits writes to 60 per minute per forwarded Oxygen client IP and caps JSON at 200 KB / 200 objects per collection. Verify `oxygen-buyer-ip` is populated in the deployed proxy; absent IPs share an `unknown` bucket. These are initial abuse controls, not an unlimited-storage promise. Monitor D1 usage and add retention/quota policy before large public promotion. No automatic expiry is currently applied. All responses are no-store. No edit keys should be placed in URLs or logs.

## Local integration

The included `services/cabinet-rooms/wrangler.local.jsonc` is exclusively for local emulation and has a deliberately non-secret test token. Run `npx wrangler@4.129.0 d1 migrations apply DB --local --config services/cabinet-rooms/wrangler.local.jsonc`, then `npx wrangler@4.129.0 dev --config services/cabinet-rooms/wrangler.local.jsonc --port 8799`. Set the two Oxygen variables to that local endpoint and `local-preview-only` in an ignored `.env`, and run the Hydrogen dev server. Never deploy the local config or commit secret files, `.env`, or local D1 data.

The standalone `preview.html` used for earlier visual work has no server routes; use Hydrogen or a test API fixture for this feature.
