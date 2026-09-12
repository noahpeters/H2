import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {createElement, StrictMode} from 'react';
import {MemoryRouter} from 'react-router';
import {ConfiguratorAnalytics} from '../../components/ConfiguratorAnalytics';
import {
  currentAnalyticsSession,
  trackConfiguratorSession,
} from './analyticsSession';

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  // Expire the module's in-memory fallback between tests.
  vi.setSystemTime(Date.now() + 31 * 60000);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true}));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});
it.each([undefined, false, true])(
  'records first-party visits with analytics permission %s',
  (allowed) => {
    vi.stubGlobal('Shopify', {
      customerPrivacy: {analyticsProcessingAllowed: () => allowed},
    });
    window.history.replaceState({}, '', '/cabinet-configurator');
    render(
      createElement(
        MemoryRouter,
        {},
        createElement(StrictMode, {}, createElement(ConfiguratorAnalytics)),
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/cabinet-analytics',
      expect.objectContaining({method: 'POST'}),
    );
    const first = currentAnalyticsSession()!;
    expect(first.id).toMatch(/^[a-f0-9]{32}$/);
    vi.stubGlobal('Shopify', {
      customerPrivacy: {analyticsProcessingAllowed: () => false},
    });
    document.dispatchEvent(new Event('visitorConsentCollected'));
    expect(trackConfiguratorSession()?.id).toBe(first.id);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('preserves initial campaign attribution across navigation and starts a new session after inactivity', () => {
  window.history.replaceState(
    {},
    '',
    '/?utm_source=instagram&utm_medium=paid_social&utm_campaign=launch',
  );
  const first = trackConfiguratorSession()!;
  expect(fetch).not.toHaveBeenCalled();
  window.history.replaceState(
    {},
    '',
    '/cabinet-configurator?utm_source=changed',
  );
  expect(trackConfiguratorSession()).toMatchObject({
    id: first.id,
    source: 'instagram',
    campaign: 'launch',
  });
  vi.advanceTimersByTime(31 * 60000);
  expect(trackConfiguratorSession()?.id).not.toBe(first.id);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('retries a failed visit without changing its session', async () => {
  window.history.replaceState({}, '', '/cabinet-configurator');
  vi.mocked(fetch).mockResolvedValueOnce({ok: false} as Response);
  const first = trackConfiguratorSession()!;
  await Promise.resolve();
  expect(trackConfiguratorSession()?.id).toBe(first.id);
  expect(fetch).toHaveBeenCalledTimes(2);
});
