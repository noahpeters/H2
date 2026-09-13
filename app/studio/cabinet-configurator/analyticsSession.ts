const KEY = 'from-trees-configurator-session-v1';
const WINDOW = 30 * 60 * 1000;
type Session = {
  id: string;
  source: string;
  medium: string;
  campaign: string;
  lastSeen: number;
};
let memory: Session | null = null;
// First-party operational sessions are independent of optional analytics consent.
export function currentAnalyticsSession(): Session | null {
  if (typeof window === 'undefined') return null;
  let session = memory;
  try {
    session = JSON.parse(
      sessionStorage.getItem(KEY) || 'null',
    ) as Session | null;
  } catch {
    /* Use memory. */
  }
  if (
    !session ||
    !/^[a-f0-9]{32}$/.test(session.id) ||
    Date.now() - session.lastSeen > WINDOW
  ) {
    const params = new URLSearchParams(window.location.search);
    let referrer = '';
    try {
      const url = new URL(document.referrer);
      if (url.hostname !== window.location.hostname) referrer = url.hostname;
    } catch {
      /* Direct visit. */
    }
    const tag = (key: string) =>
      Array.from(params.get(key) || '')
        .filter((character) => character.charCodeAt(0) >= 32)
        .join('')
        .slice(0, 120);
    session = {
      id: crypto.randomUUID().replaceAll('-', ''),
      source: tag('utm_source') || referrer || 'Direct / unknown',
      medium: tag('utm_medium') || (referrer ? 'referral' : 'none'),
      campaign: tag('utm_campaign'),
      lastSeen: Date.now(),
    };
  }
  session.lastSeen = Date.now();
  memory = session;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* Use memory. */
  }
  return session;
}
const sent = new Set<string>();
export function trackConfiguratorSession() {
  const session = currentAnalyticsSession();
  if (
    session &&
    window.location.pathname === '/cabinet-configurator' &&
    !sent.has(session.id)
  ) {
    sent.add(session.id);
    void fetch('/api/cabinet-analytics', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...session, sessionId: session.id}),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) sent.delete(session.id);
      })
      .catch(() => sent.delete(session.id));
  }
  return session;
}
export const analyticsSessionId = () => trackConfiguratorSession()?.id;
