import React from 'react';
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
    width: '80%',
    height: '90vh',
    backgroundColor: '#FFF',
    scrollSnapAlign: 'center',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontFamily: 'sans-serif',
    fontSize: '64px',
    fontWeight: 'bold',
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

  const carouselRef = React.useRef<HTMLUListElement>(null);

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
