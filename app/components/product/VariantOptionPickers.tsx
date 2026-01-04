import {VariantSelector} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import {
  OptionPicker,
  type OptionPickerValue,
  type OptionPresentation,
} from '~/components/OptionPicker';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  legacyGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  legacyItem: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    fontSize: '1rem',
    fontFamily: 'inherit',
    textDecoration: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    color: 'inherit',
  },
  legacyItemSelected: {
    borderColor: '#111827',
  },
  legacyItemUnavailable: {
    opacity: 0.3,
  },
  swatch: {
    width: '1.25rem',
    height: '1.25rem',
    margin: '0.25rem 0',
  },
  swatchImage: {
    width: '100%',
  },
});

type VariantOptionPickersProps = {
  product: ProductFragment;
  presentationMap?: Record<string, OptionPresentation>;
};

export function VariantOptionPickers({
  product,
  presentationMap,
}: VariantOptionPickersProps) {
  const variants =
    'variants' in product
      ? (product as ProductFragment & {variants?: unknown}).variants
      : product.adjacentVariants;

  return (
    <VariantSelector
      handle={product.handle}
      options={product.options}
      variants={variants ?? product.adjacentVariants}
      selectedVariant={product.selectedOrFirstAvailableVariant}
    >
      {({option}) => {
        if (!option.values.length || option.values.length === 1) {
          return null;
        }

        const hasPresentation =
          !!presentationMap &&
          option.values.some((value) =>
            Boolean(
              presentationMap?.[`${option.name}::${value.value}`],
            ),
          );

        if (!hasPresentation) {
          return (
            <div key={option.name}>
              <h5>{option.name}</h5>
              <div className={stylex(styles.legacyGrid)}>
                {option.values.map((value) => (
                  <a
                    key={`${option.name}-${value.value}`}
                    href={value.to}
                    className={stylex(
                      styles.legacyItem,
                      value.isActive && styles.legacyItemSelected,
                      !value.isAvailable && styles.legacyItemUnavailable,
                    )}
                    aria-label={value.value}
                    aria-disabled={!value.isAvailable}
                    role="radio"
                  >
                    {value.value}
                  </a>
                ))}
              </div>
              <br />
            </div>
          );
        }

        const values: OptionPickerValue[] = option.values.map((value) => ({
          value: value.value,
          selected: value.isActive,
          available: value.isAvailable,
          disabled: !value.isAvailable,
          to: value.to,
          exists: true,
          swatch: value.optionValue?.swatch,
        }));

        return (
          <div key={option.name}>
            <h5>{option.name}</h5>
            <OptionPicker
              optionName={option.name}
              values={values}
              presentationMap={presentationMap}
            />
            <br />
          </div>
        );
      }}
    </VariantSelector>
  );
}
