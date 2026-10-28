import {expect, it, vi} from 'vitest';
import {cabinitronEmbedUrl, cabinitronMigrationReady} from './cabinitronEmbed';
it('keeps existing design links and supported views inside a chrome-free tenant embed', () => {
  const url = new URL(
    cabinitronEmbedUrl(
      'https://from-trees.com/cabinet-configurator?design=abc&preset=blank&embed=other&editKey=private&unknown=ignored',
    ),
  );
  expect(url.origin).toBe('https://cabinitron.com');
  expect(url.pathname).toBe('/t/from-trees/cabinet-configurator');
  expect(url.searchParams.get('design')).toBe('abc');
  expect(url.searchParams.get('preset')).toBe('blank');
  expect(url.searchParams.get('embed')).toBe('studio');
  expect(url.searchParams.has('editKey')).toBe(false);
  expect(url.searchParams.has('unknown')).toBe(false);
});
it('waits for the frozen source and migration receiver before replacing the old designer', async () => {
  expect(
    await cabinitronMigrationReady(
      vi.fn(async () => Response.json({ready: false})) as any,
    ),
  ).toBe(false);
  expect(
    await cabinitronMigrationReady(
      vi.fn(async () => Response.json({ready: true})) as any,
    ),
  ).toBe(true);
  expect(
    await cabinitronMigrationReady(
      vi.fn(async () => new Response('', {status: 503})) as any,
    ),
  ).toBe(false);
  expect(
    await cabinitronMigrationReady(
      vi.fn(async () => {
        throw Error('offline');
      }) as any,
    ),
  ).toBe(false);
});
