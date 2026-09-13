import type {Route} from './+types/sitemap.$type.$page[.xml]';
import {getSitemap} from '@shopify/hydrogen';

const CANONICAL_ORIGIN = 'https://from-trees.com';
const LEGACY_CONTACT_URL = `${CANONICAL_ORIGIN}/pages/contact`;

export function excludeLegacyContactPage(xml: string) {
  return xml.replace(
    /\s*<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g,
    (entry, location: string) =>
      location === LEGACY_CONTACT_URL ? '' : entry,
  );
}

export async function loader({
  request,
  params,
  context: {storefront},
}: Route.LoaderArgs) {
  const canonicalUrl = new URL(request.url);
  canonicalUrl.protocol = 'https:';
  canonicalUrl.host = 'from-trees.com';

  const response = await getSitemap({
    storefront,
    request: new Request(canonicalUrl, request),
    params,
    locales: [],
    getLink: ({type, baseUrl, handle, locale}) => {
      if (!locale) return `${baseUrl}/${type}/${handle}`;
      return `${baseUrl}/${locale}/${type}/${handle}`;
    },
  });

  response.headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  if (params.type === 'pages') {
    return new Response(excludeLegacyContactPage(await response.text()), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return response;
}
