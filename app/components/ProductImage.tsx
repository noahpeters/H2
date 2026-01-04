import type {ProductVariantFragment} from 'storefrontapi.generated';
import {Image} from '@shopify/hydrogen';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  image: {
    height: 'auto',
    width: '100%',
  },
});

export function ProductImage({
  image,
  shortened = false,
}: {
  image: ProductVariantFragment['image'];
  shortened?: boolean;
}) {
  if (!image) {
    return <div />;
  }
  const sizes = shortened
    ? '(min-width: 45em) 33vw, 100vw'
    : '(min-width: 45em) 50vw, 100vw';
  return (
    <div>
      <Image
        alt={image.altText || 'Product Image'}
        aspectRatio="1/1"
        data={image}
        key={image.id}
        sizes={sizes}
        className={stylex(styles.image)}
      />
    </div>
  );
}
