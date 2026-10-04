export type MetaAttribution = Partial<
  Record<'fbclid' | 'fbc' | 'fbp' | 'fbclidCapturedAt', string>
>;
const keys = ['fbclid', 'fbc', 'fbp', 'fbclidCapturedAt'];
const storageKey = 'ft:meta-click';
let remembered: MetaAttribution = {};
export function validMetaAttribution(value: unknown): value is MetaAttribution {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, v]) =>
        keys.includes(key) &&
        typeof v === 'string' &&
        !!v &&
        v.length <= 2000 &&
        !(/\s/.test(v) || [...v].some((char) => char.charCodeAt(0) < 32)) &&
        (key !== 'fbclidCapturedAt' ||
          (/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v) &&
            Number.isFinite(Date.parse(v)))),
    )
  );
}
export function marketingAllowed() {
  const privacy = (
    window as Window & {
      Shopify?: {customerPrivacy?: {marketingAllowed?: () => boolean}};
    }
  ).Shopify?.customerPrivacy;
  return privacy?.marketingAllowed ? privacy.marketingAllowed() : true;
}
/** Retain only the actual click, within this browser tab, while tracking is allowed. */
export function rememberMetaClick() {
  if (!marketingAllowed()) {
    remembered = {};
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage may be blocked. */
    }
    return;
  }
  try {
    const raw = sessionStorage.getItem(storageKey);
    const stored: unknown = raw ? JSON.parse(raw) : undefined;
    if (validMetaAttribution(stored)) remembered = stored;
  } catch {
    /* In-memory fallback. */
  }
  const fbclid = new URL(window.location.href).searchParams.get('fbclid');
  if (
    fbclid &&
    validMetaAttribution({fbclid}) &&
    fbclid !== remembered.fbclid
  ) {
    remembered = {fbclid, fbclidCapturedAt: new Date().toISOString()};
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(remembered));
    } catch {
      /* In-memory fallback. */
    }
  }
}
/** Read cookies at submission time, including cookies created after the form rendered. */
export function readMetaAttribution(): MetaAttribution {
  rememberMetaClick();
  if (!marketingAllowed()) return {};
  const result: MetaAttribution = {...remembered};
  try {
    for (const part of document.cookie.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      const key = name === '_fbc' ? 'fbc' : name === '_fbp' ? 'fbp' : undefined;
      if (key) {
        const value = decodeURIComponent(rest.join('='));
        if (validMetaAttribution({[key]: value})) result[key] = value;
      }
    }
  } catch {
    /* Cookie access may be blocked. */
  }
  // A new ad click may precede the pixel refreshing its existing click cookie.
  if (result.fbclid && result.fbc && !result.fbc.endsWith(`.${result.fbclid}`))
    delete result.fbc;
  return result;
}
export function parseMetaAttribution(raw: string): MetaAttribution | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return validMetaAttribution(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
