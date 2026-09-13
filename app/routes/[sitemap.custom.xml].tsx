import type {Route} from './+types/[sitemap.custom.xml]';

export const CANONICAL_ORIGIN = 'https://from-trees.com';

export const CORE_SITEMAP_PATHS = [
  '/',
  '/about',
  '/contact',
  '/configurator',
] as const;

export function buildCoreSitemapXml() {
  const urls = CORE_SITEMAP_PATHS.map(
    (path) => new URL(path, CANONICAL_ORIGIN).href,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>`;
}

export function loader(_: Route.LoaderArgs) {
  return new Response(buildCoreSitemapXml(), {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}
