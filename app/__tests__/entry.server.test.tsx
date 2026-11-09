import {describe, expect, it, vi} from 'vitest';
import type {EntryContext} from 'react-router';
import type {HydrogenRouterContextProvider} from '@shopify/hydrogen';
import handleRequest from '../entry.server';

vi.mock('react-dom/server', async (original) => ({
  ...(await original<typeof import('react-dom/server')>()),
  renderToReadableStream: vi.fn(
    async () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  ),
}));

async function policy(path: string) {
  const response = await handleRequest(
    new Request(`https://from-trees.com${path}`, {
      headers: {'User-Agent': 'Mozilla/5.0'},
    }),
    200,
    new Headers(),
    {staticHandlerContext: {loaderData: {root: {}}}} as unknown as EntryContext,
    {
      env: {
        PUBLIC_CHECKOUT_DOMAIN: 'sample.myshopify.com',
        PUBLIC_STORE_DOMAIN: 'sample.myshopify.com',
      },
    } as unknown as HydrogenRouterContextProvider,
  );
  expect(response.status).toBe(200);
  return response.headers.get('Content-Security-Policy')!;
}

function sources(header: string, directive: string) {
  return (
    header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${directive} `))
      ?.split(/\s+/)
      .slice(1) ?? []
  );
}

describe('Storefront content security policy', () => {
  it.each([
    '/',
    '/configurator',
    '/cabinet-configurator/',
    '/collections/all',
    '/cart',
  ])(
    'allows the Cloudflare beacon and reporting endpoint on %s',
    async (path) => {
      const header = await policy(path);
      expect(sources(header, 'script-src')).toContain(
        'https://static.cloudflareinsights.com',
      );
      expect(sources(header, 'connect-src')).toContain(
        'https://cloudflareinsights.com',
      );
      expect(sources(header, 'script-src')).not.toContain('*');
      expect(sources(header, 'script-src')).not.toContain("'unsafe-inline'");
    },
  );
  it.each(['/', '/configurator', '/cabinet-configurator/'])(
    'permits DoubleClick collection requests and image fallbacks on %s',
    async (path) => {
      const header = await policy(path);
      expect(sources(header, 'connect-src')).toContain(
        'https://ad.doubleclick.net',
      );
      expect(sources(header, 'img-src')).toContain(
        'https://ad.doubleclick.net',
      );
      expect(sources(header, 'script-src')).not.toContain(
        'https://ad.doubleclick.net',
      );
      expect(sources(header, 'frame-src')).not.toContain(
        'https://ad.doubleclick.net',
      );
    },
  );

  it.each([
    '/cabinet-configurator',
    '/cabinet-configurator/',
    '/cabinet-configurator/?design=saved&revision=3',
  ])('allows the embedded designer on direct visits to %s', async (path) => {
    const header = await policy(path);
    expect(sources(header, 'frame-src')).toContain('https://cabinitron.com');
    expect(sources(header, 'frame-src')).toContain(
      'https://challenges.cloudflare.com',
    );
    expect(sources(header, 'frame-src')).not.toContain('*');
    expect(sources(header, 'img-src')).toContain('data:');
    expect(
      sources(header, 'script-src').some((source) =>
        source.startsWith("'nonce-"),
      ),
    ).toBe(true);
  });

  it('uses the same directives across entry pages apart from per-response nonces', async () => {
    const paths = [
      '/',
      '/configurator',
      '/collections/all',
      '/cart',
      '/cabinet-configurator',
      '/cabinet-configurator/?design=saved',
    ];
    const headers = await Promise.all(paths.map(policy));
    const normalized = headers.map((header) =>
      header.replace(/'nonce-[^']+'/g, "'nonce-REDACTED'"),
    );
    expect(new Set(normalized).size).toBe(1);
  });

  it.each([
    '/',
    '/collections/cutting-boards',
    '/products/the-field-table',
    '/configurator',
    '/cart',
    '/cabinet-configurator-other',
    '/cabinet-configurator/nested',
  ])('allows client navigation into the designer from %s', async (path) => {
    const header = await policy(path);
    expect(sources(header, 'frame-src')).toContain('https://cabinitron.com');
    expect(sources(header, 'frame-src')).not.toContain('*');
    expect(sources(header, 'img-src')).toContain('data:');
  });
});
