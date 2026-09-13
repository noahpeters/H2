import {Suspense, useEffect, useId, useRef, useState} from 'react';
import {Await, Link, useAsyncValue, useRouteLoaderData} from 'react-router';
import {useOptimisticCart} from '@shopify/hydrogen';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {RootLoader} from '~/root';
import {CONSULTATION_URL} from './consultation';

type StudioHeaderLink = {label: string; to: string};

function StudioCartLink() {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  const count = cart?.totalQuantity ?? 0;

  if (count < 1) return null;

  return (
    <Link className="studio-cart-link" to="/cart">
      Cart ({count})
    </Link>
  );
}

export function StudioHeader({
  links,
  home = false,
}: {
  links: StudioHeaderLink[];
  home?: boolean;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const rootData = useRouteLoaderData<RootLoader>('root');
  const navigationLinks = links.flatMap((link) =>
    link.to === '/configurator'
      ? [link, {label: 'Design Your Space', to: '/cabinet-configurator'}]
      : [link],
  );

  useEffect(() => {
    if (!mobileMenuOpen) return;

    navigationRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <header
      className={`site-header studio-page-header${home ? ' studio-home-header' : ''}`}
    >
      <Link className="brand" to="/" aria-label="From Trees home">
        <img className="brand-tree" src="/from-trees-tree.png" alt="" />
        <span>from trees</span>
      </Link>
      <button
        aria-controls={mobileMenuId}
        aria-expanded={mobileMenuOpen}
        aria-label={
          mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
        }
        className="studio-menu-button"
        onClick={() => setMobileMenuOpen((open) => !open)}
        ref={menuButtonRef}
        type="button"
      >
        <span aria-hidden="true">{mobileMenuOpen ? 'Close' : 'Menu'}</span>
      </button>
      <nav
        className="studio-header-links"
        aria-label="Primary navigation"
        data-mobile-open={mobileMenuOpen || undefined}
        id={mobileMenuId}
        ref={navigationRef}
      >
        {navigationLinks.map((link, index) => (
          <Link
            className={
              link.to === '/configurator' ||
              link.to === '/cabinet-configurator' ||
              index === navigationLinks.length - 1
                ? 'studio-header-cta-link'
                : 'studio-header-secondary-link'
            }
            key={link.to}
            onClick={closeMobileMenu}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
        <a
          className="studio-consultation-link"
          href={CONSULTATION_URL}
          onClick={closeMobileMenu}
        >
          Book A Free Home Consultation
        </a>
        {rootData?.cart ? (
          <Suspense fallback={null}>
            <Await resolve={rootData.cart}>
              <StudioCartLink />
            </Await>
          </Suspense>
        ) : null}
      </nav>
    </header>
  );
}
