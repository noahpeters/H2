import {describe, expect, it} from 'vitest';
import {getCheckoutDomain} from '../checkoutDomain';

describe('checkout domain', () => {
  it('preserves an explicit custom checkout', () => {
    expect(
      getCheckoutDomain(
        {
          PUBLIC_CHECKOUT_DOMAIN: 'checkout.example.com',
          PUBLIC_STORE_DOMAIN: 'example.myshopify.com',
        },
        'https://shop.example.com',
      ),
    ).toBe('checkout.example.com');
  });

  it('uses the trusted Shopify primary domain before the canonical store domain', () => {
    expect(
      getCheckoutDomain(
        {PUBLIC_STORE_DOMAIN: 'example.myshopify.com'},
        'https://shop.example.com/',
      ),
    ).toBe('shop.example.com');
  });

  it('falls back to the canonical store when a primary URL is invalid', () => {
    expect(
      getCheckoutDomain(
        {PUBLIC_STORE_DOMAIN: 'example.myshopify.com'},
        'invalid-domain-url',
      ),
    ).toBe('example.myshopify.com');
  });

  it.each([undefined, '', '  '])(
    'uses the Shopify store when the custom checkout is %j',
    (PUBLIC_CHECKOUT_DOMAIN) => {
      expect(
        getCheckoutDomain({
          PUBLIC_CHECKOUT_DOMAIN,
          PUBLIC_STORE_DOMAIN: 'example.myshopify.com',
        }),
      ).toBe('example.myshopify.com');
    },
  );

  it('does not invent a domain for an unconfigured storefront', () => {
    expect(getCheckoutDomain({})).toBeUndefined();
  });
});
