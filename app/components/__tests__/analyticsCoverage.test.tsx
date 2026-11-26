import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {createMemoryRouter, RouterProvider} from 'react-router';
import App, {loader} from '../../root';

const privacy = vi.hoisted(() => ({canTrack: () => true}));
vi.mock('@shopify/hydrogen', () => ({
  getShopAnalytics: () => Promise.resolve(null),
  useNonce: () => 'analytics-test-nonce',
  useAnalytics: () => privacy,
  Analytics: {
    Provider: ({children}: {children: ReactNode}) => children,
    CustomView: () => null,
  },
}));
vi.mock('../ConfiguratorAnalytics', () => ({
  ConfiguratorAnalytics: () => null,
}));
vi.mock('../MetaPixel', () => ({MetaPixel: () => null}));
vi.mock('../PageLayout', () => ({
  PageLayout: ({children}: {children: ReactNode}) => <main>{children}</main>,
}));
vi.mock('../../studio/StudioNotFound', () => ({StudioNotFound: () => null}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.querySelectorAll('script').forEach((script) => script.remove());
});

async function loadRoot(
  checkoutDomain?: string,
  receipt?: {kind: string; eventId: string},
  destination?: string,
) {
  const context = {
    env: {
      PUBLIC_CHECKOUT_DOMAIN: checkoutDomain,
      PUBLIC_GOOGLE_ADS_CABINETRY_CONVERSION: destination,
      PUBLIC_STORE_DOMAIN: 'example.myshopify.com',
      PUBLIC_STOREFRONT_API_TOKEN: 'public-token',
    },
    storefront: {
      query: vi.fn().mockResolvedValue({
        shop: {primaryDomain: {url: 'https://shop.example.com/'}},
      }),
      CacheLong: vi.fn(),
      i18n: {country: 'US', language: 'EN'},
    },
    session: {get: vi.fn().mockReturnValue(receipt), unset: vi.fn()},
    cart: {get: vi.fn().mockResolvedValue(null)},
    customerAccount: {isLoggedIn: vi.fn().mockResolvedValue(false)},
  };
  return loader({context} as unknown as Parameters<typeof loader>[0]);
}

describe('storefront Google Analytics coverage', () => {
  it('passes the store fallback and existing consent settings to the client', async () => {
    expect((await loadRoot()).consent).toEqual({
      checkoutDomain: 'shop.example.com',
      storefrontAccessToken: 'public-token',
      withPrivacyBanner: false,
      country: 'US',
      language: 'EN',
    });
    expect(
      (await loadRoot('checkout.example.com')).consent.checkoutDomain,
    ).toBe('checkout.example.com');
  });

  it.each([
    '/',
    '/about',
    '/contact',
    '/inquire/furniture',
    '/configurator',
    '/cabinet-configurator',
    '/products/example',
    '/cart',
    '/policies/privacy-policy',
    '/pages/delivery-pickup',
    '/search',
  ])(
    'loads the shared tag on %s without a custom checkout setting',
    async (path) => {
      vi.stubEnv('DEV', false);
      vi.stubGlobal('dataLayer', []);
      const data = await loadRoot();
      const router = createMemoryRouter(
        [
          {
            id: 'root',
            path: '/',
            loader: () => data,
            element: <App />,
            children: [{path: '*', element: <p>Storefront page</p>}],
          },
        ],
        {initialEntries: [path]},
      );
      render(<RouterProvider router={router} />);
      const tagSelector =
        'script[src="https://www.googletagmanager.com/gtag/js?id=GT-TXBKGK45"]';
      await waitFor(() => {
        expect(document.querySelectorAll(tagSelector)).toHaveLength(1);
      });
      expect(document.querySelector(tagSelector)?.getAttribute('nonce')).toBe(
        'analytics-test-nonce',
      );

      await act(() => router.navigate(path === '/' ? '/about' : '/'));
      expect(document.querySelectorAll(tagSelector)).toHaveLength(1);
    },
  );
});

it('sends a consented accepted cabinetry inquiry once to its Google Ads action', async () => {
  const destination = 'AW-123456789/test-label';
  const receipt = {kind: 'cabinetry', eventId: 'test-inquiry'};
  for (const kind of ['contact', 'furniture', 'designers']) {
    expect(
      (await loadRoot(undefined, {...receipt, kind}, destination))
        .cabinetryConversion,
    ).toBeNull();
  }
  expect(
    (await loadRoot(undefined, undefined, destination)).cabinetryConversion,
  ).toBeNull();
  expect(
    (await loadRoot(undefined, receipt, 'invalid')).cabinetryConversion,
  ).toBeNull();

  vi.stubEnv('DEV', false);
  const dataLayer: unknown[] = [];
  const conversions = () =>
    dataLayer
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter(
        ([command, event]) => command === 'event' && event === 'conversion',
      );
  const marketingAllowed = vi.fn(() => false);
  vi.stubGlobal('dataLayer', dataLayer);
  vi.stubGlobal('Shopify', {customerPrivacy: {marketingAllowed}});
  const data = await loadRoot(undefined, receipt, destination);
  const router = createMemoryRouter([
    {id: 'root', path: '/', loader: () => data, element: <App />},
  ]);
  render(<RouterProvider router={router} />);

  await waitFor(() => expect(document.querySelector('script')).not.toBeNull());
  expect(conversions()).toEqual([]);
  marketingAllowed.mockReturnValue(true);
  document.dispatchEvent(new Event('visitorConsentCollected'));
  document.dispatchEvent(new Event('shopifyCustomerPrivacyApiLoaded'));
  expect(conversions()).toEqual([
    [
      'event',
      'conversion',
      {send_to: destination, transaction_id: receipt.eventId},
    ],
  ]);
});
