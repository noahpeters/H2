import {useEffect, useRef} from 'react';
import {useAnalytics} from '@shopify/hydrogen';

type GoogleWindow = Window & {
  dataLayer?: unknown[];
  Shopify?: {
    customerPrivacy?: {
      analyticsProcessingAllowed?: () => boolean;
      marketingAllowed?: () => boolean;
    };
  };
};

export function GoogleTag({
  id,
  nonce,
  cabinetryConversion,
}: {
  id: string;
  nonce?: string;
  cabinetryConversion?: {destination: string; receiptId: string} | null;
}) {
  const {canTrack} = useAnalytics();
  const {destination, receiptId} = cabinetryConversion ?? {};
  const sentReceipt = useRef<string>();
  useEffect(() => {
    const target = window as GoogleWindow;
    // Google's queue expects an arguments object for each command.
    function gtag(..._args: unknown[]) {
      // eslint-disable-next-line prefer-rest-params -- Google requires an arguments object, not an array.
      (target.dataLayer ??= []).push(arguments);
    }
    const syncConsent = () => {
      const privacy = target.Shopify?.customerPrivacy;
      const analytics = canTrack();
      const marketing = privacy?.marketingAllowed?.() === true;
      const existing = document.querySelector(
        `script[src="https://www.googletagmanager.com/gtag/js?id=${id}"]`,
      );
      const consent = {
        analytics_storage: analytics ? 'granted' : 'denied',
        ad_storage: marketing ? 'granted' : 'denied',
        ad_user_data: marketing ? 'granted' : 'denied',
        ad_personalization: marketing ? 'granted' : 'denied',
      };
      if (existing) {
        gtag('consent', 'update', consent);
      } else if (analytics) {
        gtag('consent', 'default', consent);
        gtag('js', new Date());
        gtag('config', id);
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        if (nonce) script.nonce = nonce;
        document.head.appendChild(script);
      }
      if (
        analytics &&
        marketing &&
        destination &&
        receiptId &&
        sentReceipt.current !== receiptId
      ) {
        gtag('event', 'conversion', {
          send_to: destination,
          transaction_id: receiptId,
        });
        sentReceipt.current = receiptId;
      }
    };
    syncConsent();
    document.addEventListener('shopifyCustomerPrivacyApiLoaded', syncConsent);
    document.addEventListener('visitorConsentCollected', syncConsent);
    return () => {
      document.removeEventListener(
        'shopifyCustomerPrivacyApiLoaded',
        syncConsent,
      );
      document.removeEventListener('visitorConsentCollected', syncConsent);
    };
  }, [canTrack, destination, id, nonce, receiptId]);
  return null;
}
