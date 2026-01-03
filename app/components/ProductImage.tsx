import type {ProductVariantFragment} from 'storefrontapi.generated';
import {Image} from '@shopify/hydrogen';

export function ProductImage({
  image,
  shortened = false,
}: {
  image: ProductVariantFragment['image'];
  shortened?: boolean;
}) {
  if (!image) {
    return <div className="product-image" />;
  }
  const sizes = shortened
    ? '(min-width: 45em) 33vw, 100vw'
    : '(min-width: 45em) 50vw, 100vw';
  return (
    <div className="product-image">
      <Image
        alt={image.altText || 'Product Image'}
        aspectRatio="1/1"
        data={image}
        key={image.id}
        sizes={sizes}
      />
    </div>
  );
}
