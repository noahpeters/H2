import type {Route} from './+types/[sitemap.custom.xml]';

const MENU_QUERY = `#graphql
  fragment MenuItemFields on MenuItem {
    url
    items {
      ...MenuItemFields
    }
  }
  query MenuLinks(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(language: $language, country: $country) {
    menu(handle: $handle) {
      items {
        ...MenuItemFields
      }
    }
  }
` as const;

type MenuItem = {
  url?: string | null;
  items?: MenuItem[] | null;
};

function flattenMenuItems(items: MenuItem[] | null | undefined): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items ?? []) {
    out.push(item);
    if (item.items?.length) {
      out.push(...flattenMenuItems(item.items));
    }
  }
  return out;
}

function normalizeMenuUrl(url: string, baseUrl: URL): string | null {
  if (url.startsWith('mailto:') || url.startsWith('tel:')) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return parsed.origin === baseUrl.origin ? parsed.toString() : null;
    } catch {
      return null;
    }
  }
  if (url.startsWith('/')) {
    return new URL(url, baseUrl).toString();
  }
  return null;
}

export async function loader({
  request,
  context: {storefront},
}: Route.LoaderArgs) {
  const baseUrl = new URL(request.url);

  const [headerMenu, footerMenu] = await Promise.all([
    storefront.query(MENU_QUERY, {
      variables: {handle: 'main-menu'},
    }),
    storefront.query(MENU_QUERY, {
      variables: {handle: 'footer'},
    }),
  ]);

  const items = [
    ...(headerMenu?.menu?.items ?? []),
    ...(footerMenu?.menu?.items ?? []),
  ];
  const urls = new Set<string>([baseUrl.origin]);

  for (const item of flattenMenuItems(items)) {
    if (!item.url) continue;
    const normalized = normalizeMenuUrl(item.url, baseUrl);
    if (normalized) urls.add(normalized);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls]
  .map((url) => `  <url><loc>${url}</loc></url>`)
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}
