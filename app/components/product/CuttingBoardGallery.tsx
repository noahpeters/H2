import {useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {ProductVariantFragment} from 'storefrontapi.generated';

type BoardImage = NonNullable<ProductVariantFragment['image']>;

export function CuttingBoardGallery({
  image,
  images,
}: {
  image?: BoardImage | null;
  images: BoardImage[];
}) {
  const [activeImage, setActiveImage] = useState(image ?? images[0]);
  if (!activeImage) return null;
  const choices = images.some((item) => item.url === activeImage.url)
    ? images
    : [activeImage, ...images];
  return (
    <div className="board-gallery">
      <Image
        data={activeImage}
        alt={activeImage.altText || 'Selected cutting board'}
        sizes="(min-width: 800px) 45vw, 100vw"
      />
      {choices.length > 1 ? (
        <div
          className="board-gallery-details"
          aria-label="Cutting board photos"
        >
          {choices.map((item, index) => (
            <button
              key={item.url}
              type="button"
              aria-label={`View cutting board photo ${index + 1}`}
              aria-pressed={activeImage.url === item.url}
              onClick={() => setActiveImage(item)}
            >
              <Image
                data={item}
                aspectRatio="1/1"
                alt=""
                sizes="(min-width: 800px) 11vw, 22vw"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
