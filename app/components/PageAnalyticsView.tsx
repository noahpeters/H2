import {Analytics} from '@shopify/hydrogen';
import {useLocation} from 'react-router';

export function PageViewAnalytics() {
  const location = useLocation();

  return (
    <Analytics.CustomView
      type="custom_page_view"
      data={{
        url: location.pathname + location.search,
      }}
    />
  );
}
