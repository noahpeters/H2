import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import stylex from '~/lib/stylex';

type AsideType = 'search' | 'cart' | 'mobile' | 'closed';
type AsideContextValue = {
  type: AsideType;
  open: (mode: AsideType) => void;
  close: () => void;
};

const styles = stylex.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    bottom: 0,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
    position: 'fixed',
    right: 0,
    top: 0,
    transition: 'opacity 400ms ease-in-out',
    visibility: 'hidden',
    zIndex: 10,
  },
  overlayExpanded: {
    opacity: 1,
    pointerEvents: 'auto',
    visibility: 'visible',
  },
  closeOutside: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    color: 'transparent',
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: 'calc(100% - var(--aside-width))',
  },
  aside: {
    backgroundColor: 'var(--color-light)',
    boxShadow: '0 0 50px rgba(0, 0, 0, 0.3)',
    height: '100vh',
    width: 'min(var(--aside-width), 100vw)',
    position: 'fixed',
    right: 'calc(-1 * var(--aside-width))',
    top: 0,
    transition: 'transform 200ms ease-in-out',
  },
  asideExpanded: {
    transform: 'translateX(calc(var(--aside-width) * -1))',
  },
  asideMobile: {
    backgroundColor: 'var(--color-secondary)',
  },
  asideHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-dark)',
    display: 'flex',
    height: 'var(--header-height)',
    justifyContent: 'space-between',
    padding: '0 20px',
  },
  asideHeaderText: {
    margin: 0,
  },
  asideHeaderMobile: {
    color: 'var(--color-light)',
  },
  closeButton: {
    backgroundColor: 'inherit',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    fontSize: 'inherit',
    fontWeight: 'bold',
    opacity: 0.8,
    textDecoration: 'none',
    transition: 'all 200ms',
    width: 20,
    cursor: 'pointer',
  },
  closeButtonHover: {
    ':hover': {
      opacity: 1,
    },
  },
  main: {
    margin: '1rem',
  },
});

/**
 * A side bar component with Overlay
 * @example
 * ```jsx
 * <Aside type="search" heading="SEARCH">
 *  <input type="search" />
 *  ...
 * </Aside>
 * ```
 */
export function Aside({
  children,
  heading,
  type,
}: {
  children?: React.ReactNode;
  type: AsideType;
  heading: React.ReactNode;
}) {
  const {type: activeType, close} = useAside();
  const expanded = type === activeType;

  useEffect(() => {
    const abortController = new AbortController();

    if (expanded) {
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener(
        'keydown',
        function handler(event: KeyboardEvent) {
          if (event.key === 'Escape') {
            close();
          }
        },
        {signal: abortController.signal},
      );
    }
    return () => {
      document.documentElement.style.overflow = '';
      abortController.abort();
    };
  }, [close, expanded]);

  return (
    <div
      aria-modal
      className={stylex(styles.overlay, expanded && styles.overlayExpanded)}
      role="dialog"
    >
      <button className={stylex(styles.closeOutside)} onClick={close} />
      <aside
        className={stylex(
          styles.aside,
          expanded && styles.asideExpanded,
          type === 'mobile' && styles.asideMobile,
        )}
      >
        <header className={stylex(styles.asideHeader)}>
          <h3
            className={stylex(
              styles.asideHeaderText,
              type === 'mobile' && styles.asideHeaderMobile,
            )}
          >
            {heading}
          </h3>
          <button
            className={stylex(
              styles.closeButton,
              styles.closeButtonHover,
              type === 'mobile' && styles.asideHeaderMobile,
            )}
            onClick={close}
            aria-label="Close"
          >
            &times;
          </button>
        </header>
        <main className={stylex(styles.main)}>{children}</main>
      </aside>
    </div>
  );
}

const AsideContext = createContext<AsideContextValue | null>(null);

Aside.Provider = function AsideProvider({children}: {children: ReactNode}) {
  const [type, setType] = useState<AsideType>('closed');

  return (
    <AsideContext.Provider
      value={{
        type,
        open: setType,
        close: () => setType('closed'),
      }}
    >
      {children}
    </AsideContext.Provider>
  );
};

export function useAside() {
  const aside = useContext(AsideContext);
  if (!aside) {
    throw new Error('useAside must be used within an AsideProvider');
  }
  return aside;
}
