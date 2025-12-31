import {Money} from '@shopify/hydrogen';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';

export function ProductPrice({
  price,
  compareAtPrice,
}: {
  price?: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
}) {
  return (
    <div className="product-price">
      {compareAtPrice ? (
        <div className="product-price-on-sale">
          {price ? <Money data={price} withoutTrailingZeros /> : null}
          <s>
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
