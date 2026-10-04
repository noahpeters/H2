// @vitest-environment jsdom
import {beforeEach, expect, it, vi} from 'vitest';
let meta: typeof import('./metaAttribution');
beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();
  document.cookie = '_fbc=; Max-Age=0; Path=/';
  document.cookie = '_fbp=; Max-Age=0; Path=/';
  window.history.replaceState({}, '', '/');
  (window as any).Shopify = {customerPrivacy: {marketingAllowed: () => true}};
  meta = await import('./metaAttribution');
});
it('keeps the actual click and capture time across navigation and reads late pixel cookies', () => {
  window.history.replaceState({}, '', '/?fbclid=click_123');
  meta.rememberMetaClick();
  const initial = meta.readMetaAttribution();
  window.history.replaceState({}, '', '/contact');
  document.cookie = '_fbc=fb.1.1791130000000.click_123; Path=/';
  document.cookie = '_fbp=fb.1.1791130000000.123456; Path=/';
  expect(meta.readMetaAttribution()).toEqual({
    ...initial,
    fbc: 'fb.1.1791130000000.click_123',
    fbp: 'fb.1.1791130000000.123456',
  });
});
it('clears captured clicks and omits cookie identifiers when tracking is declined', () => {
  window.history.replaceState({}, '', '/?fbclid=click_123');
  meta.rememberMetaClick();
  (window as any).Shopify.customerPrivacy.marketingAllowed = () => false;
  document.cookie = '_fbp=fb.1.1791130000000.123456; Path=/';
  expect(meta.readMetaAttribution()).toEqual({});
  expect(sessionStorage.getItem('ft:meta-click')).toBeNull();
});
it('does not fabricate identifiers for organic traffic and tolerates blocked storage', () => {
  expect(meta.readMetaAttribution()).toEqual({});
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  window.history.replaceState({}, '', '/?fbclid=click_123');
  meta.rememberMetaClick();
  window.history.replaceState({}, '', '/contact');
  expect(meta.readMetaAttribution().fbclid).toBe('click_123');
  spy.mockRestore();
});
it('does not associate an old click cookie with a newly captured click', () => {
  document.cookie = '_fbc=fb.1.1791130000000.old_click; Path=/';
  window.history.replaceState({}, '', '/?fbclid=new_click');
  expect(meta.readMetaAttribution()).toMatchObject({fbclid: 'new_click'});
  expect(meta.readMetaAttribution().fbc).toBeUndefined();
});
