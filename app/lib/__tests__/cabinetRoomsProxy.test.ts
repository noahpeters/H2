// @vitest-environment node
import {afterEach, describe, it, expect, vi} from 'vitest';
import {loader, action} from '../../routes/api.cabinet-rooms';
describe('Oxygen rooms proxy', () => {
  afterEach(() => vi.unstubAllGlobals());
  const context = {
    env: {
      CABINET_ROOMS_URL: 'https://rooms.test/',
      CABINET_ROOMS_TOKEN: 'service-secret',
    },
  };
  it('rejects cross-origin writes and returns a clear unconfigured error', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await action({
      request: new Request('https://store.test/api/cabinet-rooms', {
        method: 'POST',
        headers: {Origin: 'https://other.test'},
        body: '{}',
      }),
      context,
    } as any);
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (
        await loader({
          request: new Request('https://store.test/api/cabinet-rooms'),
          context: {env: {}},
        } as any)
      ).status,
    ).toBe(503);
  });
  it('forwards authenticated same-origin writes without exposing the service token', async () => {
    const fetcher = vi.fn(async () => Response.json({slug: 'a'.repeat(32)}));
    vi.stubGlobal('fetch', fetcher);
    const response = await action({
      request: new Request('https://store.test/api/cabinet-rooms', {
        method: 'POST',
        headers: {Origin: 'https://store.test', 'oxygen-buyer-ip': '192.0.2.1'},
        body: '{}',
      }),
      context,
    } as any);
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0]).toBeDefined();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('service-secret');
  });
});
