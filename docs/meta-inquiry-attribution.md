# Meta identifiers on inquiries

The website retains a real `fbclid` in session storage while the existing Shopify marketing tracking preference permits it, with the time it was first captured. The shared Meta Pixel component captures ad clicks across navigation. On submission, project forms and cabinet share/price requests read the current `_fbc` and `_fbp` cookies and carry the available identifiers in `metaAttribution`. Declining tracking clears the cached click and submits no identifiers. Blocked storage uses a tab-memory fallback. No identifier is invented for organic traffic.

Oxygen passes this optional object directly to the existing authenticated FTOPS website-intake endpoint. It uses the existing submission ID, preserving browser Lead event identity. FTOPS stores the object in the immutable submission's `fields_json` and original `raw_payload`, alongside the existing contact/customer relationship. Metadata is not sent to Meta by this change.

Deploy the FTOPS intake change first: older FTOPS intake rejects unknown top-level fields. Then release the website change through the normal reviewed deployment workflow. Existing submissions and clients without metadata remain supported. Existing FTOPS delivery behavior remains one bounded attempt with sanitized failure logging; this does not add delivery infrastructure or historical recovery.

After deployment, verify with an approved test inquiry that the stored submission contains the expected identifiers and matching external event ID. Missing cookies or opted-out tracking should still allow the inquiry to succeed without identifiers.
