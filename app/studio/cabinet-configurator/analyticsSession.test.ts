import {afterEach, expect, it, vi} from 'vitest';
import {
  currentAnalyticsSession,
  setAnalyticsPermission,
} from './analyticsSession';
afterEach(() => {
  setAnalyticsPermission(() => false);
  currentAnalyticsSession();
  sessionStorage.clear();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});
it('creates no identifiers without consent and removes them when consent is withdrawn', () => {
  setAnalyticsPermission(() => false);
  expect(currentAnalyticsSession()).toBeNull();
  expect(sessionStorage.length).toBe(0);
  setAnalyticsPermission(() => true);
  expect(currentAnalyticsSession()?.id).toMatch(/^[a-f0-9]{32}$/);
  setAnalyticsPermission(() => false);
  expect(currentAnalyticsSession()).toBeNull();
  expect(sessionStorage.length).toBe(0);
});
it('preserves initial campaign attribution across navigation and starts a new session after inactivity', () => {
  vi.useFakeTimers();
  setAnalyticsPermission(() => true);
  window.history.replaceState(
    {},
    '',
    '/?utm_source=instagram&utm_medium=paid_social&utm_campaign=launch',
  );
  const first = currentAnalyticsSession()!;
  window.history.replaceState(
    {},
    '',
    '/cabinet-configurator?utm_source=changed',
  );
  expect(currentAnalyticsSession()).toMatchObject({
    id: first.id,
    source: 'instagram',
    campaign: 'launch',
  });
  vi.advanceTimersByTime(31 * 60000);
  expect(currentAnalyticsSession()?.id).not.toBe(first.id);
});
