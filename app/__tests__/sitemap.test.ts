import {describe, expect, it} from 'vitest';
import {
  buildCoreSitemapXml,
  CORE_SITEMAP_PATHS,
} from '../routes/[sitemap.custom.xml]';
import {excludeLegacyContactPage} from '../routes/sitemap.$type.$page[.xml]';

function locations(xml: string) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

describe('core sitemap', () => {
  it('contains every indexable core route exactly once on the canonical origin', () => {
    const sitemapLocations = locations(buildCoreSitemapXml());
    const expectedLocations = CORE_SITEMAP_PATHS.map(
      (path) => new URL(path, 'https://from-trees.com').href,
    );

    expect(sitemapLocations).toEqual(expectedLocations);
    expect(new Set(sitemapLocations).size).toBe(sitemapLocations.length);
    expect(sitemapLocations).not.toContain('https://from-trees.com/faq');
    expect(sitemapLocations).not.toContain(
      'https://from-trees.com/cabinet-configurator',
    );
    expect(sitemapLocations.every((url) => !new URL(url).search)).toBe(true);
  });
});

describe('Shopify page sitemap filtering', () => {
  it('removes only the legacy contact page entry', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://from-trees.com/pages/contact</loc><lastmod>2026-09-01</lastmod></url>
  <url><loc>https://from-trees.com/pages/shipping</loc><lastmod>2026-09-02</lastmod></url>
</urlset>`;

    const filtered = excludeLegacyContactPage(xml);

    expect(locations(filtered)).toEqual([
      'https://from-trees.com/pages/shipping',
    ]);
    expect(filtered).toContain('<urlset');
    expect(filtered).toContain('</urlset>');
  });
});
