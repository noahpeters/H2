import React, {useEffect, useRef, useState} from 'react';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  carouselContainer: {
    position: 'relative',
  },
  carousel: {
    display: 'flex',
    gap: 32,
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
    width: 'auto',
    height: 'auto',
    // backgroundColor: 'var(--color-light-translucent)',
    scrollSnapAlign: 'left',
    padding: 4,
    borderRadius: 4,
    '@media (max-width: 640px)': {
      width: '80%',
      scrollSnapAlign: 'center',
    },
    ':hover': {
      backgroundColor: 'var(--color-light)',
    },
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 0,
    overflow: 'hidden',
  },
  button: {
    position: 'absolute',
    top: '50%',
    width: '3rem',
    height: '3rem',
    transform: 'translateY(-50%)',
    backgroundColor: 'var(--color-light-translucent)',
    color: 'var(--color-primary)',
    borderStyle: 'none',
    borderRadius: '50%',
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

  const scrollLeft = () => {
    if (carouselRef.current == null) {
      return;
    }
    const itemWidth =
      (carouselRef.current.firstElementChild?.clientWidth ?? 100) + 32; // + gap
    carouselRef.current.scrollBy({left: -itemWidth, behavior: 'smooth'});
  };

  const scrollRight = (allowReset: boolean = false) => {
    if (carouselRef.current == null) {
      return;
    }
    const itemWidth =
      (carouselRef.current.firstElementChild?.clientWidth ?? 100) + 32; // + gap
    const maxScrollLeft =
      carouselRef.current.scrollWidth - carouselRef.current.clientWidth;
    const currentScrollLeft = carouselRef.current.scrollLeft;
    if (allowReset && currentScrollLeft + 1 > maxScrollLeft) {
      // Scroll back to start
      carouselRef.current.scrollTo({left: 0, behavior: 'smooth'});
    } else {
      carouselRef.current.scrollBy({left: itemWidth, behavior: 'smooth'});
    }
  };

  useEffect(() => {
    const id = setInterval(() => {
      if (manualScroll) {
        clearInterval(id);
        return;
      }
      scrollRight(true);
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
        disabled={carouselRef.current == null}
        onClick={() => {
          setManualScroll(true);
          scrollLeft();
        }}
      >
        ➜
      </button>
      <button
        className={stylex(styles.button, styles.buttonNext)}
        type="button"
        disabled={carouselRef.current == null}
        onClick={() => {
          setManualScroll(true);
          scrollRight();
        }}
      >
        ➜
      </button>
    </div>
  );
}
