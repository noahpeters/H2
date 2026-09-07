import {Suspense} from 'react';
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
  const rootData = useRouteLoaderData<RootLoader>('root');
  const navigationLinks = links.flatMap((link) =>
    link.to === '/configurator'
      ? [link, {label: 'Design Your Space', to: '/cabinet-configurator'}]
      : [link],
  );

  return (
    <header
      className={`site-header studio-page-header${home ? ' studio-home-header' : ''}`}
    >
      <Link className="brand" to="/" aria-label="From Trees home">
        <img className="brand-tree" src="/from-trees-tree.png" alt="" />
        <span>from trees</span>
      </Link>
      <nav className="studio-header-links" aria-label="Primary navigation">
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
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
        <a className="studio-consultation-link" href={CONSULTATION_URL}>
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
