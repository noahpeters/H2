import {useEffect, useRef, useState} from 'react';
import {useLocation, useRouteLoaderData} from 'react-router';
import type {RootLoader} from '~/root';

export const META_PIXEL_ID = '4235923316621088';
type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
};
declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
    __metaPixelInitialized?: boolean;
  }
}
const sentLeads = new Set<string>();
export function trackAcceptedLead(eventId: string, kind: string) {
  if (!window.fbq || sentLeads.has(eventId)) return;
  const key = `ft:lead:${eventId}`;
  try {
    if (sessionStorage.getItem(key)) return;
  } catch {
    /* Storage can be unavailable. */
  }
  window.fbq(
    'trackSingle',
    META_PIXEL_ID,
    'Lead',
    {content_name: kind},
    {eventID: eventId},
  );
  sentLeads.add(eventId);
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* In-memory deduplication remains available. */
  }
}
function marketingAllowed() {
  const privacy = (
    window as Window & {
      Shopify?: {customerPrivacy?: {marketingAllowed?: () => boolean}};
    }
  ).Shopify?.customerPrivacy;
  return privacy?.marketingAllowed ? privacy.marketingAllowed() : true;
}
export function MetaPixel({nonce}: {nonce?: string}) {
  const location = useLocation();
  const data = useRouteLoaderData<RootLoader>('root');
  const receipt = data?.projectReceipt;
  const lastPage = useRef<string>();
  const [consentVersion, updateConsent] = useState(0);
  useEffect(() => {
    const changed = () => updateConsent((value) => value + 1);
    document.addEventListener('visitorConsentCollected', changed);
    return () =>
      document.removeEventListener('visitorConsentCollected', changed);
  }, []);
  useEffect(() => {
    if (!marketingAllowed()) {
      window.fbq?.('consent', 'revoke');
      return;
    }
    if (!window.fbq) {
      const fbq: FbqFn = (...args) =>
        fbq.callMethod ? fbq.callMethod(...args) : void fbq.queue?.push(args);
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      window.fbq = fbq;
      window._fbq = fbq;
    }
    // React Router owns PageView delivery. Meta's history listener otherwise
    // sends an additional event on pushState/replaceState navigation.
    window.fbq.disablePushState = true;
    window.fbq('consent', 'grant');
    if (!window.__metaPixelInitialized) {
      // Explicit events avoid inferring a lead from a button click or form attempt.
      window.fbq('set', 'autoConfig', false, META_PIXEL_ID);
      window.fbq('init', META_PIXEL_ID);
      window.__metaPixelInitialized = true;
    }
    if (
      !document.querySelector(
        'script[src="https://connect.facebook.net/en_US/fbevents.js"]',
      )
    ) {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      if (nonce) script.nonce = nonce;
      document.head.appendChild(script);
    }
    if (lastPage.current !== location.pathname) {
      window.fbq('trackSingle', META_PIXEL_ID, 'PageView');
      lastPage.current = location.pathname;
    }
    if (receipt) trackAcceptedLead(receipt.eventId, receipt.kind);
  }, [nonce, location.pathname, receipt, consentVersion]);
  return null;
}
