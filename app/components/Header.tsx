import {Suspense} from 'react';
import {Await, NavLink, useAsyncValue} from 'react-router';
import {
  type CartViewPayload,
  useAnalytics,
  useOptimisticCart,
} from '@shopify/hydrogen';
import type {HeaderQuery, CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import stylex from '~/lib/stylex';
import logoWhite from '~/assets/logo-white.png';

interface HeaderProps {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
}

type Viewport = 'desktop' | 'mobile';

const styles = stylex.create({
  header: {
    alignItems: 'center',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-light)',
    display: 'flex',
    height: 'var(--header-height)',
    padding: '0 1rem',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  logoCenter: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '128px',
    height: '128px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary)',
    bottom: '-32px',
    paddingTop: '14px',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.2)',
  },
  logoImage: {
    width: '84px',
    height: '84px',
    display: 'block',
    position: 'relative',
    top: '6px',
    paddingTop: 20,
  },
  link: {
    color: 'inherit',
    textDecoration: 'none',
  },
  burger: {
    color: 'var(--color-light)',
  },
  menuMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  menuDesktop: {
    display: 'none',
    gap: '1rem',
    '@media (min-width: 45em)': {
      display: 'flex',
      marginLeft: 0,
    },
  },
  menuItem: {
    cursor: 'pointer',
  },
  ctas: {
    alignItems: 'center',
    display: 'flex',
    gap: '1rem',
    marginLeft: 'auto',
  },
  ctaItem: {
    minWidth: 'fit-content',
  },
  menuMobileToggle: {
    '@media (min-width: 48em)': {
      display: 'none',
    },
  },
  resetButton: {
    backgroundColor: 'inherit',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    fontSize: 'inherit',
    cursor: 'pointer',
  },
});

export function Header({
  header,
  isLoggedIn,
  cart,
  publicStoreDomain,
}: HeaderProps) {
  const {shop, menu} = header;
  return (
    <header className={stylex(styles.header)}>
      <NavLink
        prefetch="intent"
        to="/"
        end
        className={stylex(styles.logoCenter)}
        aria-label="Home"
      >
        <img src={logoWhite} alt="" className={stylex(styles.logoImage)} />
      </NavLink>
      <HeaderMenu
        menu={menu}
        viewport="desktop"
        primaryDomainUrl={header.shop.primaryDomain.url}
        publicStoreDomain={publicStoreDomain}
      />
      <HeaderCtas isLoggedIn={isLoggedIn} cart={cart} />
    </header>
  );
}

export function HeaderMenu({
  menu,
  primaryDomainUrl,
  viewport,
  publicStoreDomain,
}: {
  menu: HeaderProps['header']['menu'];
  primaryDomainUrl: HeaderProps['header']['shop']['primaryDomain']['url'];
  viewport: Viewport;
  publicStoreDomain: HeaderProps['publicStoreDomain'];
}) {
  const className =
    viewport === 'mobile' ? styles.menuMobile : styles.menuDesktop;
  const {close} = useAside();

  return (
    <nav className={stylex(className)} role="navigation">
      {(menu || FALLBACK_HEADER_MENU).items.map((item) => {
        if (!item.url) return null;

        // if the url is internal, we strip the domain
        const url =
          item.url.includes('myshopify.com') ||
          item.url.includes(publicStoreDomain) ||
          item.url.includes(primaryDomainUrl)
            ? new URL(item.url).pathname
            : item.url;
        return (
          <NavLink
            end
            key={item.id}
            onClick={close}
            prefetch="intent"
            style={activeLinkStyle}
            to={url}
            className={stylex(styles.link, styles.menuItem)}
          >
            {item.title}
          </NavLink>
        );
      })}
      <NavLink
        end
        onClick={close}
        prefetch="intent"
        style={activeLinkStyle}
        to="/contact"
        className={stylex(styles.link, styles.menuItem)}
      >
        Contact
      </NavLink>
    </nav>
  );
}

function HeaderCtas({
  isLoggedIn,
  cart,
}: Pick<HeaderProps, 'isLoggedIn' | 'cart'>) {
  return (
    <nav className={stylex(styles.ctas)} role="navigation">
      <HeaderMenuMobileToggle />
      {/* <NavLink prefetch="intent" to="/account" style={activeLinkStyle}>
        <Suspense fallback="Sign in">
          <Await resolve={isLoggedIn} errorElement="Sign in">
            {(isLoggedIn) => (isLoggedIn ? 'Account' : 'Sign in')}
          </Await>
        </Suspense>
      </NavLink> */}
      {/* <SearchToggle /> */}
      <CartToggle cart={cart} />
    </nav>
  );
}

function HeaderMenuMobileToggle() {
  const {open} = useAside();
  return (
    <button
      className={stylex(
        styles.resetButton,
        styles.menuMobileToggle,
        styles.ctaItem,
      )}
      onClick={() => open('mobile')}
    >
      <h3 className={stylex(styles.burger)}>☰</h3>
    </button>
  );
}

function SearchToggle() {
  const {open} = useAside();
  return (
    <button
      className={stylex(styles.resetButton, styles.ctaItem)}
      onClick={() => open('search')}
    >
      Search
    </button>
  );
}

function CartBadge({count}: {count: number | null}) {
  const {open} = useAside();
  const {publish, shop, cart, prevCart} = useAnalytics();

  return (
    <a
      href="/cart"
      className={stylex(styles.link, styles.ctaItem)}
      onClick={(e) => {
        e.preventDefault();
        open('cart');
        publish('cart_viewed', {
          cart,
          prevCart,
          shop,
          url: window.location.href || '',
        } as CartViewPayload);
      }}
    >
      Cart {count === null ? <span>&nbsp;</span> : count}
    </a>
  );
}

function CartToggle({cart}: Pick<HeaderProps, 'cart'>) {
  return (
    <Suspense fallback={<CartBadge count={null} />}>
      <Await resolve={cart}>
        <CartBanner />
      </Await>
    </Suspense>
  );
}

function CartBanner() {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  return <CartBadge count={cart?.totalQuantity ?? 0} />;
}

const FALLBACK_HEADER_MENU = {
  id: 'gid://shopify/Menu/199655587896',
  items: [
    {
      id: 'gid://shopify/MenuItem/461609500728',
      resourceId: null,
      tags: [],
      title: 'Collections',
      type: 'HTTP',
      url: '/collections',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461609533496',
      resourceId: null,
      tags: [],
      title: 'Blog',
      type: 'HTTP',
      url: '/blogs/journal',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461609566264',
      resourceId: null,
      tags: [],
      title: 'Policies',
      type: 'HTTP',
      url: '/policies',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461609599032',
      resourceId: 'gid://shopify/Page/92591030328',
      tags: [],
      title: 'About',
      type: 'PAGE',
      url: '/pages/about',
      items: [],
    },
  ],
};

function activeLinkStyle({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending: boolean;
}) {
  return {
    fontWeight: isActive ? 'bold' : undefined,
    color: isPending ? 'grey' : 'var(--color-light)',
  };
}
