import {Link, useNavigate} from 'react-router';
import {useEffect, useMemo, useState, type ChangeEvent} from 'react';
import {type MappedProductOptions} from '@shopify/hydrogen';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import {AddToCartButton} from './AddToCartButton';
import {useAside} from './Aside';
import type {ProductFragment} from 'storefrontapi.generated';
import {BuyNowButton} from './BuyNowButton';
import {ProductPrice} from './ProductPrice';
import stylex from '~/lib/stylex';
import type {LineItemFieldSet, LineItemField} from '~/lib/cart/lineItemFieldSet';
import type {WoodColorPalette} from '~/lib/options/woodColorPalettes';
import {buildPaletteMatch} from '~/lib/options/woodColorPalettes';
import {FinishColorPicker} from '~/components/product/FinishColorPicker';

const styles = stylex.create({
  buttonsContainer: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  priceBlock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    color: '#111827',
    fontWeight: 600,
  },
  customization: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  customizationTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    marginBottom: '0.25rem',
  },
  customizationRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  helper: {
    fontSize: '0.85rem',
    color: 'var(--color-secondary)',
  },
  helperDisabled: {
    color: 'var(--color-secondary)',
    fontStyle: 'italic',
  },
  input: {
    padding: '0.5rem 0.65rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-secondary)',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
  },
  textarea: {
    padding: '0.5rem 0.65rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-secondary)',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    minHeight: '5rem',
    resize: 'vertical',
  },
  disclosure: {
    marginTop: '0.25rem',
  },
  disclosureSummary: {
    cursor: 'pointer',
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  select: {
    padding: '0.5rem 0.65rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-secondary)',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    backgroundColor: 'var(--color-light)',
  },
  optionsGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  optionItem: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    fontSize: '1rem',
    fontFamily: 'inherit',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    color: 'var(--color-dark)',
  },
  optionItemLink: {
    ':hover': {
      textDecoration: 'none',
      cursor: 'pointer',
      borderColor: 'var(--color-secondary)',
      backgroundColor: 'var(--color-light)',
      color: 'var(--color-primary)',
    },
  },
  optionItemSelected: {
    borderColor: 'var(--color-primary)',
    backgroundColor: 'var(--color-light)',
    color: 'var(--color-primary)',
    fontWeight: 600,
  },
  optionItemUnavailable: {
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

export function ProductForm({
  productOptions,
  selectedVariant,
  lineItemFieldSet,
  woodColorPalettes,
}: {
  productOptions?: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
  lineItemFieldSet?: LineItemFieldSet | null;
  woodColorPalettes?: WoodColorPalette[];
}) {
  const navigate = useNavigate();
  const {open} = useAside();
  const initialValues = useMemo(
    () =>
      (lineItemFieldSet?.fields ?? []).reduce<Record<string, string>>(
        (acc, field) => {
          acc[field.key] = '';
          return acc;
        },
        {},
      ),
    [lineItemFieldSet?.fields],
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialValues,
  );

  useEffect(() => {
    setFieldValues((prev) => ({...initialValues, ...prev}));
  }, [initialValues]);

  const selectedOptions = selectedVariant?.selectedOptions ?? [];
  const normalizedSelectedOptions = selectedOptions.map((option) => ({
    name: (option.name ?? '').trim().toLowerCase(),
    value: (option.value ?? '').trim().toLowerCase(),
  }));
  const paletteMatch = buildPaletteMatch(
    woodColorPalettes ?? [],
    selectedOptions,
  );
  const selectedWoodValue = paletteMatch?.selectedWoodValue ?? null;
  const swatchLabels = useMemo(
    () => paletteMatch?.palette.swatches.map((swatch) => swatch.label) ?? [],
    [paletteMatch?.palette.swatches],
  );
  const [selectedFinishColorLabel, setSelectedFinishColorLabel] = useState<
    string | null
  >(null);
  const helperText = 'Select engraving to add text or a logo.';

  const isFieldAvailable = (field: LineItemField) => {
    if (!field.showWhenOptionName || !field.showWhenOptionValue) return true;
    const normalizedName = field.showWhenOptionName.trim().toLowerCase();
    const normalizedValue = field.showWhenOptionValue.trim().toLowerCase();
    return normalizedSelectedOptions.some(
      (option) =>
        option.name === normalizedName &&
        (option.value === normalizedValue ||
          option.value.includes(normalizedValue)),
    );
  };

  const finishColorAttributes =
    paletteMatch && selectedFinishColorLabel
      ? [
          {key: 'Finish Color', value: selectedFinishColorLabel},
          {key: 'Finish Color Wood', value: paletteMatch.selectedWoodValue},
        ]
      : [];
  const attributes = [
    ...(lineItemFieldSet?.fields ?? [])
      .filter((field) => isFieldAvailable(field))
      .map((field) => {
        const value = fieldValues[field.key]?.trim();
        if (!value) return null;
        return {key: field.key, value};
      })
      .filter(
        (entry): entry is {key: string; value: string} => entry != null,
      ),
    ...finishColorAttributes,
  ];

  useEffect(() => {
    setSelectedFinishColorLabel(null);
  }, [selectedWoodValue]);

  useEffect(() => {
    if (!paletteMatch || swatchLabels.length === 0) {
      if (selectedFinishColorLabel !== null) {
        setSelectedFinishColorLabel(null);
      }
      return;
    }
    if (
      !selectedFinishColorLabel ||
      !swatchLabels.includes(selectedFinishColorLabel)
    ) {
      setSelectedFinishColorLabel(swatchLabels[0]);
    }
  }, [paletteMatch, selectedFinishColorLabel, swatchLabels]);

  const lines = selectedVariant
    ? [
        {
          merchandiseId: selectedVariant.id,
          quantity: 1,
          selectedVariant,
          ...(attributes.length ? {attributes} : {}),
        },
      ]
    : [];

  return (
    <div>
      {productOptions?.map((option) => {
        if (option.optionValues.length === 1) return null;

        return (
          <div key={option.name}>
            <h5>{option.name}</h5>
            <div className={stylex(styles.optionsGrid)}>
              {option.optionValues.map((value) => {
                const {
                  name,
                  handle,
                  variantUriQuery,
                  selected,
                  available,
                  exists,
                  isDifferentProduct,
                  swatch,
                } = value;

                const itemStyles = [
                  styles.optionItem,
                  selected && styles.optionItemSelected,
                  !available && styles.optionItemUnavailable,
                ];

                if (isDifferentProduct) {
                  return (
                    <Link
                      key={option.name + name}
                      prefetch="intent"
                      preventScrollReset
                      replace
                      to={`/products/${handle}?${variantUriQuery}`}
                      className={stylex(itemStyles)}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </Link>
                  );
                }

                return (
                    <button
                      type="button"
                      key={option.name + name}
                      className={stylex(itemStyles, styles.optionItemLink)}
                      disabled={!exists}
                      onClick={() => {
                      if (!selected) {
                        void navigate(`?${variantUriQuery}`, {
                          replace: true,
                          preventScrollReset: true,
                        });
                      }
                    }}
                  >
                    <ProductOptionSwatch swatch={swatch} name={name} />
                  </button>
                );
              })}
            </div>
            <br />
          </div>
        );
      })}
      {paletteMatch ? (
        <FinishColorPicker
          key={selectedWoodValue ?? 'default'}
          palettes={woodColorPalettes ?? []}
          selectedOptions={selectedOptions}
          selectedFinishColorLabel={selectedFinishColorLabel}
          onChange={setSelectedFinishColorLabel}
        />
      ) : null}
      {lineItemFieldSet?.fields?.length ? (
        <div className={stylex(styles.customization)}>
          <div className={stylex(styles.customizationTitle)}>Customization</div>
          {lineItemFieldSet.fields.map((field) => {
            const isAvailable = isFieldAvailable(field);
            const value = fieldValues[field.key] ?? '';
            const helper = !isAvailable
              ? field.helpText
                ? `${helperText} ${field.helpText}`
                : helperText
              : field.helpText;
            const commonProps = {
              value,
              onChange: (
                event: ChangeEvent<
                  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >,
              ) =>
                setFieldValues((prev) => ({
                  ...prev,
                  [field.key]: event.target.value,
                })),
              disabled: !isAvailable,
            };

            if (
              field.key.toLowerCase() === 'customer notes' &&
              field.type === 'textarea'
            ) {
              return (
                <details
                  key={field.key}
                  className={stylex(styles.disclosure)}
                >
                  <summary className={stylex(styles.disclosureSummary)}>
                    Add notes to the maker
                  </summary>
                  <div className={stylex(styles.customizationRow)}>
                    <span className={stylex(styles.label)}>{field.label}</span>
                    <textarea
                      className={stylex(styles.textarea)}
                      maxLength={field.maxLength}
                      placeholder={field.required ? 'Required' : undefined}
                      {...commonProps}
                    />
                    {helper ? (
                      <span
                        className={stylex(
                          styles.helper,
                          !isAvailable && styles.helperDisabled,
                        )}
                      >
                        {helper}
                      </span>
                    ) : null}
                  </div>
                </details>
              );
            }

            return (
              <div key={field.key} className={stylex(styles.customizationRow)}>
                <span className={stylex(styles.label)}>{field.label}</span>
                {field.type === 'textarea' ? (
                  <textarea
                    className={stylex(styles.textarea)}
                    maxLength={field.maxLength}
                    placeholder={field.required ? 'Required' : undefined}
                    {...commonProps}
                  />
                ) : field.type === 'select' ? (
                  <select className={stylex(styles.select)} {...commonProps}>
                    <option value="">Select...</option>
                    {(field.choices ?? []).map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={stylex(styles.input)}
                    type={field.type === 'url' ? 'url' : 'text'}
                    inputMode={field.type === 'url' ? 'url' : undefined}
                    maxLength={field.maxLength}
                    placeholder={field.required ? 'Required' : undefined}
                    {...commonProps}
                  />
                )}
                {helper ? (
                  <span
                    className={stylex(
                      styles.helper,
                      !isAvailable && styles.helperDisabled,
                    )}
                  >
                    {helper}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className={stylex(styles.buttonsContainer)}>
        <div className={stylex(styles.priceBlock)}>
          <span>Configured Price:</span>
          <ProductPrice
            price={selectedVariant?.price}
            compareAtPrice={selectedVariant?.compareAtPrice}
          />
        </div>
        <AddToCartButton
          disabled={!selectedVariant || !selectedVariant.availableForSale}
          onClick={() => {
            open('cart');
          }}
          lines={lines}
        >
          {selectedVariant?.availableForSale ? 'Add to cart' : 'Sold out'}
        </AddToCartButton>
        <BuyNowButton
          disabled={!selectedVariant || !selectedVariant.availableForSale}
          lines={lines}
        >
          Buy now
        </BuyNowButton>
      </div>
    </div>
  );
}

function ProductOptionSwatch({
  swatch,
  name,
}: {
  swatch?: Maybe<ProductOptionValueSwatch> | undefined;
  name: string;
}) {
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (!image && !color) return name;

  return (
    <div
      aria-label={name}
      className={stylex(styles.swatch)}
      style={{
        backgroundColor: color || 'transparent',
      }}
    >
      {!!image && (
        <img src={image} alt={name} className={stylex(styles.swatchImage)} />
      )}
    </div>
  );
}
