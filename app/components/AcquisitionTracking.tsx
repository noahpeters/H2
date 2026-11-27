import {useEffect, useRef} from 'react';
import {useLocation} from 'react-router';
import {
  flushAcquisition,
  trackAcquisition,
} from '~/lib/acquisition/acquisition.client';
import {publicPath} from '~/lib/acquisition/protocol';

export function AcquisitionTracking({
  visitorTtl,
  version,
}: {
  visitorTtl: number;
  version: string;
}) {
  const {key, pathname, search} = useLocation();
  const lastView = useRef<{visit: string; url: string}>();

  useEffect(() => {
    const url = new URL(pathname + search, window.location.origin);
    const visit = url.pathname + url.search;
    const view = () => {
      if (
        lastView.current?.visit === visit ||
        document.visibilityState !== 'visible'
      )
        return;
      if (
        trackAcquisition(
          visitorTtl,
          version,
          'view',
          url,
          key === 'default',
          lastView.current?.url || document.referrer,
        )
      )
        lastView.current = {visit, url: url.href};
    };
    const sync = () => {
      view();
      void flushAcquisition(visitorTtl);
    };
    const click = (event: MouseEvent) => {
      if (
        !event.isTrusted ||
        event.button !== 0 ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest('a[href]');
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.origin !== url.origin
      )
        return;
      const target = publicPath(anchor.pathname);
      if (
        target === '/contact' ||
        target?.startsWith('/inquire/') ||
        (anchor.pathname === url.pathname && anchor.hash === '#inquiry')
      ) {
        trackAcquisition(visitorTtl, version, 'inquiry_cta', url, false, '');
      } else if (
        target === '/configurator' ||
        target === '/cabinet-configurator'
      ) {
        trackAcquisition(
          visitorTtl,
          version,
          'configurator_cta',
          url,
          false,
          '',
        );
      }
    };
    sync();
    document.addEventListener('shopifyCustomerPrivacyApiLoaded', sync);
    document.addEventListener('visitorConsentCollected', sync);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('click', click);
    window.addEventListener('online', sync);
    return () => {
      document.removeEventListener('shopifyCustomerPrivacyApiLoaded', sync);
      document.removeEventListener('visitorConsentCollected', sync);
      document.removeEventListener('visibilitychange', sync);
      document.removeEventListener('click', click);
      window.removeEventListener('online', sync);
    };
  }, [key, pathname, search, version, visitorTtl]);
  return null;
}
