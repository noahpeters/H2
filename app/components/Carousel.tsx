import React, {useEffect, useRef, useState} from 'react';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  carouselContainer: {
    position: 'relative',
  },
  carousel: {
    display: 'flex',
    gap: 8,
    padding: 16,
    listStyle: 'none',
    overflowX: 'scroll',
    overflowY: 'hidden',
    scrollSnapType: 'x mandatory',
    /* Hide scrollbar in Firefox */
    scrollbarWidth: 'none',
    /* Hide scrollbar in IE and Edge */
    MsOverflowStyle: 'none',
    '::WebkitScrollbar': {
      display: 'none',
    },
  },
  item: {
    flexShrink: 0,
    width: '40%',
    height: '60vh',
    backgroundColor: 'var(--color-light-translucent)',
    scrollSnapAlign: 'center',
    '@media (max-width: 640px)': {
      width: '80%',
    },
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 16,
    overflow: 'hidden',
  },
  button: {
    position: 'absolute',
    top: '50%',

    width: '3rem',
    height: '3rem',
    transform: 'translateY(-50%)',
  },
  buttonPrevious: {
    left: '1.5rem',
    transform: 'rotate(180deg)',
  },
  buttonNext: {
    right: '1.5rem',
  },
});

export default function Carousel({children}: {children: React.ReactNode}) {
  'use client';

  const carouselRef = useRef<HTMLUListElement>(null);

  const [manualScroll, setManualScroll] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (manualScroll) {
        clearInterval(id);
        return;
      }
      if (carouselRef.current == null) {
        return;
      }
      const itemWidth =
        carouselRef.current.firstElementChild?.clientWidth ?? 100;
      const maxScrollLeft =
        carouselRef.current.scrollWidth - carouselRef.current.clientWidth;
      if (carouselRef.current.scrollLeft + itemWidth > maxScrollLeft) {
        // Scroll back to start
        carouselRef.current.scrollTo({left: 0, behavior: 'smooth'});
      } else {
        carouselRef.current.scrollBy({left: itemWidth, behavior: 'smooth'});
      }
    }, 5000);

    return () => clearInterval(id);
  }, [manualScroll]);

  return (
    <div className={stylex(styles.carouselContainer)}>
      <ul className={stylex(styles.carousel)} ref={carouselRef}>
        {React.Children.toArray(children).map((child) =>
          !React.isValidElement(child) ? null : (
            <li className={stylex(styles.item)} key={child.key ?? void 0}>
              <div className={stylex(styles.content)}>{child}</div>
            </li>
          ),
        )}
      </ul>
      <button
        className={stylex(styles.button, styles.buttonPrevious)}
        type="button"
        onClick={() => {
          if (carouselRef.current == null) {
            return;
          }
          setManualScroll(true);
          const itemWidth =
            carouselRef.current.firstElementChild?.clientWidth ?? 100;
          carouselRef.current.scrollBy({left: -itemWidth, behavior: 'smooth'});
        }}
      >
        ➜
      </button>
      <button
        className={stylex(styles.button, styles.buttonNext)}
        type="button"
        onClick={() => {
          if (carouselRef.current == null) {
            return;
          }
          setManualScroll(true);
          const itemWidth =
            carouselRef.current.firstElementChild?.clientWidth ?? 100;
          carouselRef.current.scrollBy({left: itemWidth, behavior: 'smooth'});
        }}
      >
        ➜
      </button>
    </div>
  );
}
