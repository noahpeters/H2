import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {GoogleTag} from '../GoogleTag';
const permission = vi.hoisted(() => ({canTrack: vi.fn(() => false)}));
vi.mock('@shopify/hydrogen', () => ({useAnalytics: () => permission}));
afterEach(() => {
  cleanup();
  permission.canTrack.mockReturnValue(false);
  vi.unstubAllGlobals();
  document.querySelectorAll('script').forEach((script) => script.remove());
});
it('waits for analytics permission, initializes once, and updates revoked consent', () => {
  const dataLayer: unknown[] = [];
  vi.stubGlobal('dataLayer', dataLayer);
  vi.stubGlobal('Shopify', undefined);
  render(<GoogleTag id="GT-TEST" nonce="test-nonce" />);
  expect(document.querySelector('script')).toBeNull();
  const analyticsProcessingAllowed = vi.fn(() => false);
  vi.stubGlobal('Shopify', {
    customerPrivacy: {
      analyticsProcessingAllowed,
      marketingAllowed: () => false,
    },
  });
  document.dispatchEvent(new Event('visitorConsentCollected'));
  expect(document.querySelector('script')).toBeNull();
  permission.canTrack.mockReturnValue(true);
  analyticsProcessingAllowed.mockReturnValue(true);
  document.dispatchEvent(new Event('visitorConsentCollected'));
  expect(document.querySelectorAll('script')).toHaveLength(1);
  expect(document.querySelector('script')?.nonce).toBe('test-nonce');
  expect(Array.from(dataLayer[0] as ArrayLike<unknown>)).toEqual([
    'consent',
    'default',
    {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  analyticsProcessingAllowed.mockReturnValue(false);
  permission.canTrack.mockReturnValue(false);
  document.dispatchEvent(new Event('visitorConsentCollected'));
  expect(Array.from(dataLayer.at(-1) as ArrayLike<unknown>)).toEqual([
    'consent',
    'update',
    {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    },
  ]);
  expect(document.querySelectorAll('script')).toHaveLength(1);
});
