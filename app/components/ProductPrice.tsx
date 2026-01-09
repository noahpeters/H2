import {Money} from '@shopify/hydrogen';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  onSale: {
    display: 'flex',
    gap: '0.5rem',
  },
  compareAt: {
    opacity: 0.5,
  },
});

export function ProductPrice({
  price,
  compareAtPrice,
  isLoading = false,
}: {
  price?: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <span
        className="skeleton skeleton-price"
        role="status"
        aria-label="Updating price"
      />
    );
  }

  return (
    <div>
      {compareAtPrice ? (
        <div className={stylex(styles.onSale)}>
          {price ? <Money data={price} withoutTrailingZeros /> : null}
          <s className={stylex(styles.compareAt)}>
            <Money data={compareAtPrice} withoutTrailingZeros />
          </s>
        </div>
      ) : price ? (
        <Money data={price} withoutTrailingZeros />
      ) : (
        <span>&nbsp;</span>
      )}
    </div>
  );
}
