import {Link, useNavigate} from 'react-router';
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

  const lines = selectedVariant
    ? [
        {
          merchandiseId: selectedVariant.id,
          quantity: 1,
          selectedVariant,
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
