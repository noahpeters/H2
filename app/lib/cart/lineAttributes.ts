import type {AttributeInput} from '@shopify/hydrogen/storefront-api-types';

// Line attributes travel with the cart line into checkout and orders.
export const CUSTOM_ATTRIBUTE_KEYS = {
  engravingText: 'Engraving Text',
  logoUrl: 'Engraving Logo URL',
  color: 'Color',
  notes: 'Customer Notes',
} as const;

// Extend by adding new keys above and mapping them in parse/normalize helpers.

export type CustomAttributes = {
  engravingText: string;
  logoUrl: string;
  color: string;
  notes: string;
};

export function normalizeAttributes({
  engravingText,
  logoUrl,
  color,
  notes,
}: Partial<CustomAttributes>): AttributeInput[] {
  const entries: AttributeInput[] = [];

  const pushIfPresent = (key: string, value: string | undefined) => {
    const trimmed = value?.trim() ?? '';
    if (trimmed) {
      entries.push({key, value: trimmed});
    }
  };

  pushIfPresent(CUSTOM_ATTRIBUTE_KEYS.engravingText, engravingText);
  pushIfPresent(CUSTOM_ATTRIBUTE_KEYS.logoUrl, logoUrl);
  pushIfPresent(CUSTOM_ATTRIBUTE_KEYS.color, color);
  pushIfPresent(CUSTOM_ATTRIBUTE_KEYS.notes, notes);

  return entries;
}

export function parseAttributes(
  attributes: Array<{key: string; value: string}> | null | undefined,
): CustomAttributes {
  const initial: CustomAttributes = {
    engravingText: '',
    logoUrl: '',
    color: '',
    notes: '',
  };

  if (!attributes?.length) return initial;

  return attributes.reduce<CustomAttributes>((acc, attribute) => {
    switch (attribute.key) {
      case CUSTOM_ATTRIBUTE_KEYS.engravingText:
        acc.engravingText = attribute.value;
        break;
      case CUSTOM_ATTRIBUTE_KEYS.logoUrl:
        acc.logoUrl = attribute.value;
        break;
      case CUSTOM_ATTRIBUTE_KEYS.color:
        acc.color = attribute.value;
        break;
      case CUSTOM_ATTRIBUTE_KEYS.notes:
        acc.notes = attribute.value;
        break;
      default:
        break;
    }
    return acc;
  }, initial);
}

export function mergeAttributes(
  attributes: Array<{key: string; value: string}> | null | undefined,
  updates: AttributeInput[],
) {
  const customKeys = new Set(Object.values(CUSTOM_ATTRIBUTE_KEYS));
  const preserved =
    attributes?.filter((attribute) => !customKeys.has(attribute.key)) ?? [];

  return [...preserved, ...updates];
}

export function isEngravingSelected(
  selectedOptions: Array<{name?: string | null; value?: string | null}>,
) {
  const engravingOption = selectedOptions.find((option) =>
    option.name?.toLowerCase().includes('engraving'),
  );

  if (!engravingOption) return false;

  const value = (engravingOption.value ?? '').toLowerCase();
  return value !== '' && value !== 'none' && value !== 'no';
}
