import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router';
import {RichText} from '@shopify/hydrogen';
import stylex from '~/lib/stylex';

type SiteHeroMetaobject = {
  id: string;
  handle?: string | null;
  fields: Array<{
    key: string;
    value?: string | null;
    reference?: SiteHeroReference | null;
  }>;
};

type SiteHeroReference =
  | {
      __typename: 'MediaImage';
      image?: {
        url: string;
        altText?: string | null;
        width?: number | null;
        height?: number | null;
      } | null;
    }
  | {
      __typename: 'Product';
      handle: string;
      title: string;
    };

type SiteHeroSlide = {
  id: string;
  text: string;
  desktopImage: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  };
  mobileImage: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  };
  product?: Extract<SiteHeroReference, {__typename: 'Product'}> | null;
};

const styles = stylex.create({
  hero: {
    marginLeft: 'calc(50% - 50vw)',
    overflow: 'hidden',
    position: 'relative',
    width: '100vw',
  },
  viewport: {
    position: 'relative',
  },
  track: {
    display: 'flex',
    transition: 'transform 600ms ease',
    width: '100%',
  },
  slide: {
    flex: '0 0 100%',
    minHeight: 'min(75vh, 720px)',
    position: 'relative',
  },
  slideLink: {
    color: 'inherit',
    display: 'block',
    height: '100%',
    position: 'relative',
    textDecoration: 'none',
  },
  media: {
    height: '100%',
    left: 0,
    objectFit: 'cover',
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  overlay: {
    backdropFilter: 'blur(8px)',
    backgroundColor: 'var(--color-light-translucent)',
    borderRadius: '16px',
    color: 'var(--color-primary)',
    left: '8%',
    maxWidth: '520px',
    padding: '2rem',
    position: 'absolute',
    textShadow: '0 2px 18px rgba(0, 0, 0, 0.4)',
    top: '8%',
    transform: 'none',
    '@media (max-width: 45em)': {
      left: '8%',
      maxWidth: '85%',
      padding: '1.5rem',
      textAlign: 'left',
      transform: 'none',
    },
  },
  overlayContent: {
    display: 'grid',
    gap: '1rem',
  },
  cta: {
    alignItems: 'center',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: '999px',
    display: 'inline-flex',
    fontSize: '0.9rem',
    fontWeight: 600,
    gap: '0.5rem',
    padding: '0.55rem 1.4rem',
    width: 'fit-content',
  },
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    left: 0,
    padding: '0 1.5rem',
    pointerEvents: 'none',
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '100%',
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    borderRadius: '999px',
    color: '#111',
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '1.1rem',
    height: '3rem',
    justifyContent: 'center',
    pointerEvents: 'auto',
    width: '3rem',
  },
  dots: {
    display: 'flex',
    gap: '0.6rem',
    justifyContent: 'center',
    padding: '1.25rem 0',
  },
  dot: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    borderRadius: '999px',
    cursor: 'pointer',
    height: '0.6rem',
    width: '0.6rem',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: '1.4rem',
  },
});

export default function SiteHero({items}: {items: SiteHeroMetaobject[]}) {
  'use client';

  const slides = useMemo(() => getSlides(items), [items]);
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || slides.length < 2 || isPaused) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion, slides.length, isPaused]);

  if (slides.length === 0) return null;

  const goTo = (nextIndex: number) => {
    const total = slides.length;
    const normalized = (nextIndex + total) % total;
    setIndex(normalized);
  };

  return (
    <section
      className={stylex(styles.hero)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Site hero"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          goTo(index - 1);
        } else if (event.key === 'ArrowRight') {
          goTo(index + 1);
        } else if (event.key === 'Home') {
          goTo(0);
        } else if (event.key === 'End') {
          goTo(slides.length - 1);
        }
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={(event) => {
        event.currentTarget.dataset.touchX = String(
          event.touches[0]?.clientX ?? 0,
        );
      }}
      onTouchEnd={(event) => {
        const start = Number(event.currentTarget.dataset.touchX ?? 0);
        const end = event.changedTouches[0]?.clientX ?? 0;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        goTo(delta > 0 ? index - 1 : index + 1);
      }}
    >
      <div className={stylex(styles.viewport)}>
        <div
          className={stylex(styles.track)}
          style={{transform: `translateX(-${index * 100}%)`}}
        >
          {slides.map((slide, slideIndex) => {
            const isActive = slideIndex === index;
            const link = slide.product
              ? `/products/${slide.product.handle}`
              : null;
            const content = (
              <>
                <picture>
                  <source
                    media="(max-width: 45em)"
                    srcSet={slide.mobileImage.url}
                  />
                  <img
                    alt={slide.desktopImage.altText ?? 'Site hero image'}
                    className={stylex(styles.media)}
                    src={slide.desktopImage.url}
                    width={slide.desktopImage.width ?? undefined}
                    height={slide.desktopImage.height ?? undefined}
                    loading={slideIndex === 0 ? 'eager' : 'lazy'}
                  />
                </picture>
                <div className={stylex(styles.overlay)}>
                  <div className={stylex(styles.overlayContent)}>
                    {renderHeroText(slide.text)}
                    {link ? <span className={stylex(styles.cta)}>View</span> : null}
                  </div>
                </div>
              </>
            );

            return (
              <div
                key={slide.id}
                className={stylex(styles.slide)}
                aria-hidden={!isActive}
              >
                {link ? (
                  <Link
                    to={link}
                    className={stylex(styles.slideLink)}
                    aria-label={`View ${slide.product?.title ?? 'product'}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={stylex(styles.slideLink)}>{content}</div>
                )}
              </div>
            );
          })}
        </div>

        {slides.length > 1 ? (
          <div className={stylex(styles.controls)}>
            <button
              type="button"
              className={stylex(styles.controlButton)}
              aria-label="Previous slide"
              onClick={() => goTo(index - 1)}
            >
              ←
            </button>
            <button
              type="button"
              className={stylex(styles.controlButton)}
              aria-label="Next slide"
              onClick={() => goTo(index + 1)}
            >
              →
            </button>
          </div>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className={stylex(styles.dots)}>
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Go to slide ${slideIndex + 1}`}
              aria-current={slideIndex === index ? 'true' : undefined}
              className={stylex(
                styles.dot,
                slideIndex === index && styles.dotActive,
              )}
              onClick={() => goTo(slideIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getSlides(items: SiteHeroMetaobject[]): SiteHeroSlide[] {
  return items
    .map((item) => {
      const desktopField = item.fields.find(
        (field) => field.key === 'desktop_image' || field.key === 'image',
      );
      const mobileField = item.fields.find(
        (field) => field.key === 'mobile_image',
      );
      const textField = item.fields.find((field) => field.key === 'text');
      const productField = item.fields.find((field) => field.key === 'product');

      const desktopImage = asMediaImage(desktopField?.reference)?.image ?? null;
      const mobileImage = asMediaImage(mobileField?.reference)?.image ?? null;
      const text = textField?.value ?? '';
      const product = asProduct(productField?.reference) ?? null;

      // Storefront API does not expose a publish/active flag for metaobjects,
      // so treat entries with required fields as "active".
      if (!desktopImage || !mobileImage || !text) return null;

      return {
        id: item.id,
        text,
        desktopImage,
        mobileImage,
        product,
      };
    })
    .filter(Boolean) as SiteHeroSlide[];
}

function asMediaImage(
  reference?: SiteHeroReference | null,
): Extract<SiteHeroReference, {__typename: 'MediaImage'}> | null {
  if (!reference || reference.__typename !== 'MediaImage') return null;
  return reference;
}

function asProduct(
  reference?: SiteHeroReference | null,
): Extract<SiteHeroReference, {__typename: 'Product'}> | null {
  if (!reference || reference.__typename !== 'Product') return null;
  return reference;
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefers(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return prefers;
}

function renderHeroText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    JSON.parse(trimmed);
    return <RichText data={trimmed} />;
  } catch {
    return <p>{text}</p>;
  }
}
