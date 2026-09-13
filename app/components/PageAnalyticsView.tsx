import {GoogleTag} from './GoogleTag';
import {Analytics, useNonce} from '@shopify/hydrogen';
import {useLocation} from 'react-router';

export function PageViewAnalytics() {
  const location = useLocation();
  const nonce = useNonce();

  return (
    <>
      <GoogleTag nonce={nonce} id="GT-TXBKGK45" />
      <Analytics.CustomView
        type="custom_page_view"
        data={{
          url: location.pathname + location.search,
        }}
      />
    </>
  );
}
