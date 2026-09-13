import type {Route} from './+types/[sitemap.xml]';
import {getSitemapIndex} from '@shopify/hydrogen';

export async function loader({
  request,
  context: {storefront},
}: Route.LoaderArgs) {
  const canonicalUrl = new URL(request.url);
  canonicalUrl.protocol = 'https:';
  canonicalUrl.host = 'from-trees.com';

  const response = await getSitemapIndex({
    storefront,
    request: new Request(canonicalUrl, request),
    types: ['products', 'collections', 'pages', 'articles'],
    customChildSitemaps: ['/sitemap.custom.xml'],
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return response;
}
