import {afterEach, expect, it, vi} from 'vitest';
import {action, loader} from '../../routes/api.cabinet-price';
afterEach(() => vi.unstubAllGlobals());
const body = {
  slug: 'a'.repeat(32),
  editKey: 'private',
  revision: 1,
  requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  senderName: 'Example',
  senderEmail: 'example@example.com',
  consent: false,
  senderPhone: '5551234567',
  turnstileToken: 'verified',
};
function call(data: unknown = body, origin = 'https://from-trees.com') {
  return action({
    request: new Request('https://from-trees.com/api/cabinet-price', {
      method: 'POST',
      headers: {Origin: origin, 'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    }),
    context: {
      env: {
        CABINET_ROOMS_URL: 'https://rooms.test',
        CABINET_ROOMS_TOKEN: 'secret',
        TURNSTILE_SECRET_KEY: 'challenge-secret',
      },
    },
  } as any);
}
it('requires a same-origin submitted form and verification, not a direct GET', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect(loader().status).toBe(405);
  expect((await call(body, 'https://untrusted.test')).status).toBe(403);
  expect((await call({...body, senderEmail: ''})).status).toBe(400);
  expect((await call({...body, turnstileToken: ''})).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(
    Response.json({
      success: true,
      hostname: 'from-trees.com',
      action: 'cabinet-share',
    }),
  );
  expect((await call()).status).toBe(400);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('allows opt-out pricing, strips phone and forwards only after challenge success', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        hostname: 'from-trees.com',
        action: 'cabinet-price',
      }),
    )
    .mockResolvedValueOnce(Response.json({range: {low: 5500, high: 6500}}));
  vi.stubGlobal('fetch', fetcher);
  const response = await call();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(fetcher.mock.calls[1][0].toString()).toBe('https://rooms.test/quote');
  const forwarded = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(forwarded).toMatchObject({consent: false});
  expect(forwarded).not.toHaveProperty('senderPhone');
});
