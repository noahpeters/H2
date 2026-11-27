import {GoogleTag} from './GoogleTag';
import {Analytics, useNonce} from '@shopify/hydrogen';
import {useLocation, useRouteLoaderData} from 'react-router';
import type {RootLoader} from '~/root';

export function PageViewAnalytics() {
  const location = useLocation();
  const nonce = useNonce();
  const root = useRouteLoaderData<RootLoader>('root');

  return (
    <>
      <GoogleTag
        nonce={nonce}
        id="GT-TXBKGK45"
        cabinetryConversion={root?.cabinetryConversion}
      />
      <Analytics.CustomView
        type="custom_page_view"
        data={{
          url: location.pathname + location.search,
        }}
      />
    </>
  );
}
