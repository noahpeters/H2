import {Suspense} from 'react';
import {Await, Link, useRouteLoaderData} from 'react-router';
import type {FooterQuery} from 'storefrontapi.generated';
import type {RootLoader} from '~/root';

const fallbackPolicies = [
  {id: 'privacy', title: 'Privacy policy', url: '/policies/privacy-policy'},
  {id: 'refund', title: 'Refund policy', url: '/policies/refund-policy'},
  {id: 'shipping', title: 'Shipping policy', url: '/policies/shipping-policy'},
  {id: 'terms', title: 'Terms of service', url: '/policies/terms-of-service'},
];

function policyLinks(footer: FooterQuery | null) {
  const policies = (footer?.menu?.items ?? []).flatMap((item) => {
    if (!item.url) return [];
    try {
      const url = new URL(item.url, 'https://from-trees.com').pathname;
      return url.startsWith('/policies/')
        ? [{id: item.id, title: item.title, url}]
        : [];
    } catch {
      return [];
    }
  });
  return policies.length ? policies : fallbackPolicies;
}

function PolicyMenu({footer}: {footer: FooterQuery | null}) {
  return (
    <nav className="studio-policy-menu" aria-label="Store policies">
      {policyLinks(footer).map((item) => (
        <Link key={item.id} to={item.url}>
          {item.title}
        </Link>
      ))}
    </nav>
  );
}

export function StudioFooter() {
  const rootData = useRouteLoaderData<RootLoader>('root');
  const footer = rootData?.footer ?? Promise.resolve(null);
  return (
    <footer className="studio-footer">
      <div className="footer-main">
        <div>
          <p className="eyebrow">Have something in mind?</p>
          <h2>
            Let’s bring your
            <br />
            <em>vision to life.</em>
          </h2>
          <a href="mailto:noah@fromtrees.studio">
            noah@fromtrees.studio <span>↗</span>
          </a>
        </div>
        <img
          className="footer-logo"
          src="/from-trees-logo.png"
          alt="from trees"
        />
      </div>
      <Suspense fallback={<PolicyMenu footer={null} />}>
        <Await resolve={footer}>{(data) => <PolicyMenu footer={data} />}</Await>
      </Suspense>
      <div className="footer-bottom">
        <span>from trees / RIVERSIDE, CALIFORNIA</span>
        <span>Family owned · Veteran owned</span>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
