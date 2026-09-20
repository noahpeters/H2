import {describe, expect, it} from 'vitest';
import {normalizeOptionUrl} from './VariantOptionPickers';

describe('variant option links', () => {
  const origin = 'https://from-trees.com';
  const target =
    '/products/cutting-board?Material=Walnut+End+Grain&Customization=Laser+Engraving';
  it('keeps gift-page option changes on the gift page, including encoded choices', () => {
    const result = new URL(
      normalizeOptionUrl(target, origin, '/cutting-boards')!,
      origin,
    );
    expect(result.pathname).toBe('/cutting-boards');
    expect(result.searchParams.get('Material')).toBe('Walnut End Grain');
    expect(result.searchParams.get('Customization')).toBe('Laser Engraving');
  });
  it('preserves product-page destinations by default', () => {
    expect(new URL(normalizeOptionUrl(target, origin)!, origin).pathname).toBe(
      '/products/cutting-board',
    );
  });
  it('does not create links for missing variants', () => {
    expect(
      normalizeOptionUrl(undefined, origin, '/cutting-boards'),
    ).toBeUndefined();
  });
});
