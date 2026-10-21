import {afterEach, expect, it, vi} from 'vitest';
import {action} from '../api.$version.[graphql.json]';

afterEach(() => vi.unstubAllGlobals());

it.each([
  [undefined, 'example.myshopify.com'],
  ['checkout.example.com', 'checkout.example.com'],
])(
  'proxies Storefront requests with checkout setting %j',
  async (checkoutDomain, destination) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"data":{}}', {
        headers: {'content-type': 'application/json'},
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request(
      'https://example.com/api/2025-07/graphql.json',
      {
        method: 'POST',
        body: '{"query":"query { shop { name } }"}',
        headers: {'content-type': 'application/json'},
      },
    );
    const response = await action({
      request,
      params: {version: '2025-07'},
      context: {
        env: {
          PUBLIC_CHECKOUT_DOMAIN: checkoutDomain,
          PUBLIC_STORE_DOMAIN: 'example.myshopify.com',
        },
      },
    } as unknown as Parameters<typeof action>[0]);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://${destination}/api/2025-07/graphql.json`,
      {method: 'POST', body: request.body, headers: request.headers},
    );
    expect(await response.json()).toEqual({data: {}});
    expect(response.headers.get('content-type')).toBe('application/json');
  },
);
