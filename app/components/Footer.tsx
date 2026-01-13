import {Suspense} from 'react';
import {Await, NavLink} from 'react-router';
import type {FooterQuery, HeaderQuery} from 'storefrontapi.generated';
import stylex from '~/lib/stylex';

interface FooterProps {
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  publicStoreDomain: string;
}

const styles = stylex.create({
  footer: {
    backgroundColor: 'var(--color-dark)',
    marginTop: 'auto',
  },
  menu: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    justifyContent: 'center',
    padding: '1rem',
  },
  link: {
    color: 'var(--color-light)',
    minWidth: 'fit-content',
    textDecoration: 'none',
  },
  iconLink: {
    alignItems: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
  },
  icon: {
    height: '1.25rem',
    width: '1.25rem',
  },
});

export function Footer({
  footer: footerPromise,
  header,
  publicStoreDomain,
}: FooterProps) {
  return (
    <Suspense>
      <Await resolve={footerPromise}>
        {(footer) => (
          <footer className={stylex(styles.footer)}>
            {footer?.menu && header.shop.primaryDomain?.url && (
              <FooterMenu
                menu={footer.menu}
                primaryDomainUrl={header.shop.primaryDomain.url}
                publicStoreDomain={publicStoreDomain}
                additionalLinks={[
                  {
                    title: 'furniture@from-trees.com',
                    url: 'maiilto:furniture@from-trees.com',
                    id: 'email',
                  },
                ]}
              />
            )}
          </footer>
        )}
      </Await>
    </Suspense>
  );
}

function FooterMenu({
  menu,
  primaryDomainUrl,
  publicStoreDomain,
  additionalLinks = [],
}: {
  menu: FooterQuery['menu'];
  primaryDomainUrl: FooterProps['header']['shop']['primaryDomain']['url'];
  publicStoreDomain: string;
  additionalLinks: {title: string; url: string; id: string}[];
}) {
  return (
    <nav className={stylex(styles.menu)} role="navigation">
      {(menu || FALLBACK_FOOTER_MENU).items
        .map(({title, url, id}): {title: string; url: string; id: string} => ({
          title,
          url: String(url),
          id,
        }))
        .concat(additionalLinks)
        .map((item: {title: string; url: string; id: string}) => {
          if (!item.url) return null;
          // if the url is internal, we strip the domain
          const url =
            item.url.includes('myshopify.com') ||
            item.url.includes(publicStoreDomain) ||
            item.url.includes(primaryDomainUrl)
              ? new URL(item.url).pathname
              : item.url;
          const isExternal = !url.startsWith('/');
          const label = renderFooterLabel(item.title);
          const linkClassName = stylex(
            styles.link,
            label.type === 'icon' && styles.iconLink,
          );
          return isExternal ? (
            <a
              href={url}
              key={item.id}
              rel="noopener noreferrer"
              target="_blank"
              className={linkClassName}
              aria-label={label.ariaLabel}
            >
              {label.node}
            </a>
          ) : (
            <NavLink
              end
              key={item.id}
              prefetch="intent"
              style={activeLinkStyle}
              to={url}
              className={linkClassName}
              aria-label={label.ariaLabel}
            >
              {label.node}
            </NavLink>
          );
        })}
    </nav>
  );
}

const FALLBACK_FOOTER_MENU = {
  id: 'gid://shopify/Menu/199655620664',
  items: [
    {
      id: 'gid://shopify/MenuItem/461633060920',
      resourceId: 'gid://shopify/ShopPolicy/23358046264',
      tags: [],
      title: 'Privacy Policy',
      type: 'SHOP_POLICY',
      url: '/policies/privacy-policy',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461633093688',
      resourceId: 'gid://shopify/ShopPolicy/23358013496',
      tags: [],
      title: 'Refund Policy',
      type: 'SHOP_POLICY',
      url: '/policies/refund-policy',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461633126456',
      resourceId: 'gid://shopify/ShopPolicy/23358111800',
      tags: [],
      title: 'Shipping Policy',
      type: 'SHOP_POLICY',
      url: '/policies/shipping-policy',
      items: [],
    },
    {
      id: 'gid://shopify/MenuItem/461633159224',
      resourceId: 'gid://shopify/ShopPolicy/23358079032',
      tags: [],
      title: 'Terms of Service',
      type: 'SHOP_POLICY',
      url: '/policies/terms-of-service',
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
    color: isPending ? 'grey' : 'white',
  };
}

function renderFooterLabel(title: string): {
  type: 'text' | 'icon';
  node: JSX.Element | string;
  ariaLabel?: string;
} {
  const normalized = title.trim().toLowerCase();
  if (normalized === 'facebook') {
    return {
      type: 'icon',
      ariaLabel: 'Facebook',
      node: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={stylex(styles.icon)}
        >
          <path
            fill="currentColor"
            d="M13.5 8.5V7.1c0-.7.5-1.1 1.1-1.1H16V3.1h-1.9c-2.5 0-3.6 1.7-3.6 3.8V8.5H8.9v2.8h1.6v7.6h3V11.3h2.2l.4-2.8H13.5z"
          />
        </svg>
      ),
    };
  }

  if (normalized === 'instagram') {
    return {
      type: 'icon',
      ariaLabel: 'Instagram',
      node: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={stylex(styles.icon)}
        >
          <path
            fill="currentColor"
            d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"
          />
          <path
            fill="currentColor"
            d="M12 7.3a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4zm0 2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4zM17.2 6.3a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
          />
        </svg>
      ),
    };
  }

  return {type: 'text', node: title};
}
