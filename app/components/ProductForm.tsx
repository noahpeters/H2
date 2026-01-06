import {Link, useNavigate} from 'react-router';
import {useState} from 'react';
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
import {
  isEngravingSelected,
  normalizeAttributes,
} from '~/lib/cart/lineAttributes';

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
}: {
  productOptions?: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
}) {
  const navigate = useNavigate();
  const {open} = useAside();
  const [engravingText, setEngravingText] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [color, setColor] = useState('');
  const [notes, setNotes] = useState('');

  const engravingEnabled = selectedVariant
    ? isEngravingSelected(selectedVariant.selectedOptions)
    : false;
  const helperText = 'Select Engraving to add text or a logo.';

  const lines = selectedVariant
    ? [
        (() => {
          const attributes = normalizeAttributes({
            engravingText,
            logoUrl,
            color,
            notes,
          });
          return {
            merchandiseId: selectedVariant.id,
            quantity: 1,
            selectedVariant,
            ...(attributes.length ? {attributes} : {}),
          };
        })(),
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
      <div className={stylex(styles.customization)}>
        <div className={stylex(styles.customizationRow)}>
          <span className={stylex(styles.label)}>Engraving Text</span>
          <input
            className={stylex(styles.input)}
            type="text"
            value={engravingText}
            onChange={(event) => setEngravingText(event.target.value)}
            disabled={!engravingEnabled}
            placeholder="Up to 25 characters"
          />
          {!engravingEnabled ? (
            <span className={stylex(styles.helper)}>{helperText}</span>
          ) : null}
        </div>
        <div className={stylex(styles.customizationRow)}>
          <span className={stylex(styles.label)}>Engraving Logo URL</span>
          <input
            className={stylex(styles.input)}
            type="url"
            inputMode="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            disabled={!engravingEnabled}
            placeholder="https://example.com/logo.png"
          />
          {!engravingEnabled ? (
            <span className={stylex(styles.helper)}>{helperText}</span>
          ) : (
            <span className={stylex(styles.helper)}>
              TODO: replace with an upload flow that returns a public URL.
            </span>
          )}
        </div>
        <div className={stylex(styles.customizationRow)}>
          <span className={stylex(styles.label)}>Color (optional)</span>
          <select
            className={stylex(styles.select)}
            value={color}
            onChange={(event) => setColor(event.target.value)}
          >
            <option value="">Select color</option>
            <option value="Natural">Natural</option>
            <option value="Light">Light</option>
            <option value="Medium">Medium</option>
            <option value="Dark">Dark</option>
          </select>
        </div>
        <div className={stylex(styles.customizationRow)}>
          <span className={stylex(styles.label)}>Customer Notes</span>
          <textarea
            className={stylex(styles.textarea)}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything else we should know?"
          />
        </div>
      </div>
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
