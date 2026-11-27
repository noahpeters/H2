import {
  advertisingClicks,
  ARRIVAL_TIMING,
  SESSION_MS,
  campaignFields,
  publicPath,
  referrerOrigin,
  validIdentity,
  type BrowserEvent,
  type Identity,
} from './protocol';

const PREFIX = 'ft:acquisition:';
const ID = PREFIX + 'identity';
const EVENT = PREFIX + 'event:';
const RETRY_MS = 60_000; // Match the existing H2 outbox's first retry interval.
type BrowserIdentity = Identity & {createdAt: number; activeAt: number};
type ShopifyWindow = Window & {
  Shopify?: {
    customerPrivacy?: {
      marketingAllowed?: () => boolean;
    };
  };
};

let memoryIdentity: BrowserIdentity | undefined;
const pending = new Map<string, BrowserEvent>();
let sending = false;
let sendAgain = false;
let retry: ReturnType<typeof setTimeout> | undefined;
// A browser opt-out invalidates the signed cookie even if local storage is empty.
let needsClear = true;

function acquisitionPrivacy() {
  const signal = navigator as Navigator & {globalPrivacyControl?: boolean};
  const privacy = (window as ShopifyWindow).Shopify?.customerPrivacy;
  if (signal.globalPrivacyControl || signal.doNotTrack === '1')
    return {optOut: true, marketing: false};
  return {
    optOut: false,
    marketing: privacy?.marketingAllowed?.(),
  };
}

function stored(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as unknown;
  } catch {
    return undefined;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The in-memory copy remains available. */
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable. */
  }
}

function eventKeys() {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(EVENT));
  } catch {
    return [];
  }
}

function forget() {
  pending.clear();
  memoryIdentity = undefined;
  remove(ID);
  for (const key of eventKeys()) remove(key);
  clearTimeout(retry);
}

async function post(input: unknown) {
  try {
    return await fetch('/api/acquisition', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch {
    return undefined;
  }
}

export async function flushAcquisition(ttl: number) {
  if (sending) {
    sendAgain = true;
    return;
  }
  sending = true;
  clearTimeout(retry);
  let retryNeeded = false;
  try {
    const {optOut, marketing} = acquisitionPrivacy();
    if (optOut) {
      if (memoryIdentity || stored(ID) || eventKeys().length) needsClear = true;
      forget();
      if (needsClear) {
        const response = await post({optOut: true});
        needsClear = !response?.ok;
        retryNeeded = needsClear;
      }
      return;
    }
    needsClear = true;
    for (const key of eventKeys()) {
      const event = stored(key) as BrowserEvent | null;
      if (event?.id && !pending.has(event.id)) pending.set(event.id, event);
    }
    for (const [id, event] of pending) {
      if (
        Date.now() - Date.parse(event.occurredAt) > ttl * 1000 ||
        (event.kind === 'ad_attribution' && marketing === false)
      ) {
        pending.delete(id);
        remove(EVENT + id);
      }
    }
    for (const [id, event] of pending) {
      const privacy = acquisitionPrivacy();
      if (privacy.optOut) break;
      if (event.kind === 'ad_attribution' && privacy.marketing !== true) {
        if (privacy.marketing === false) {
          pending.delete(id);
          remove(EVENT + id);
        }
        continue;
      }
      const identity = (stored(ID) || memoryIdentity) as
        | BrowserIdentity
        | undefined;
      const response = await post({
        marketing: privacy.marketing === true,
        event,
        refresh:
          identity?.sessionId === event.sessionId &&
          identity?.visitorId === event.visitorId,
      });
      if (!response || response.status === 429 || response.status >= 500) {
        retryNeeded = true;
        break;
      }
      pending.delete(id);
      remove(EVENT + id);
    }
  } finally {
    sending = false;
    if (sendAgain) {
      sendAgain = false;
      void flushAcquisition(ttl);
    } else if (retryNeeded) {
      retry = setTimeout(() => void flushAcquisition(ttl), RETRY_MS);
    }
  }
}

export function trackAcquisition(
  ttl: number,
  version: string,
  kind: BrowserEvent['kind'],
  url: URL,
  {
    initial,
    referrer,
    viewId,
  }: {initial?: boolean; referrer?: string; viewId?: string} = {},
) {
  const path = publicPath(url.pathname);
  const {optOut, marketing} = acquisitionPrivacy();
  if (!path || optOut) return;
  const adClicks =
    kind === 'ad_attribution' && marketing
      ? advertisingClicks(url.searchParams)
      : undefined;
  if (kind === 'ad_attribution' && (!adClicks || !viewId)) return;
  const now = Date.now();
  const candidate = stored(ID) || memoryIdentity;
  const previous = validIdentity(candidate)
    ? (candidate as BrowserIdentity)
    : undefined;
  const visitor =
    previous && now - previous.createdAt < ttl * 1000 ? previous : undefined;
  const identity = {
    visitorId: visitor?.visitorId || crypto.randomUUID(),
    sessionId:
      visitor && now - visitor.activeAt < SESSION_MS
        ? visitor.sessionId
        : crypto.randomUUID(),
    createdAt: visitor?.createdAt ?? now,
    activeAt: now,
  };
  memoryIdentity = identity;
  store(ID, identity);
  const navigation = initial
    ? (performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined)
    : undefined;
  const event: BrowserEvent = {
    id: crypto.randomUUID(),
    kind,
    path,
    version,
    occurredAt: new Date(now).toISOString(),
    visitorId: identity.visitorId,
    sessionId: identity.sessionId,
    ...(adClicks ? {viewId, attribution: adClicks} : {}),
    ...(kind === 'view'
      ? {
          referrer: referrerOrigin(referrer),
          arrivalId: navigation?.serverTiming?.find(
            (entry) => entry.name === ARRIVAL_TIMING,
          )?.description,
          attribution: campaignFields(url.searchParams),
        }
      : {}),
  };
  pending.set(event.id, event);
  store(EVENT + event.id, event);
  void flushAcquisition(ttl);
  return event.id;
}
