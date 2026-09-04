import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/policies._index';
import type {PoliciesQuery, PolicyItemFragment} from 'storefrontapi.generated';
import studioStyles from '~/styles/studio.css?url';
import {StudioFooter} from '~/studio/StudioFooter';
import {StudioHeader} from '~/studio/StudioHeader';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];

export async function loader({context}: Route.LoaderArgs) {
  const data: PoliciesQuery = await context.storefront.query(POLICIES_QUERY);

  const shopPolicies = data.shop;
  const policies: PolicyItemFragment[] = [
    shopPolicies?.privacyPolicy,
    shopPolicies?.shippingPolicy,
    shopPolicies?.termsOfService,
    shopPolicies?.refundPolicy,
    shopPolicies?.subscriptionPolicy,
  ].filter((policy): policy is PolicyItemFragment => policy != null);

  if (!policies.length) {
    throw new Response('No policies found', {status: 404});
  }

  return {policies};
}

export default function Policies() {
  const {policies} = useLoaderData<typeof loader>();

  return (
    <main className="studio-page studio-policy-page">
      <StudioHeader
        links={[
          {label: 'Back to the studio', to: '/'},
          {label: 'Pre-configured examples', to: '/collections/all'},
          {label: 'Configure a table ↗', to: '/configurator'},
        ]}
      />
      <section className="studio-policy-content studio-policy-index">
        <p className="eyebrow">From Trees policies</p>
        <h1>Policies</h1>
        <div className="studio-policy-list">
        {policies.map((policy) => (
          <div key={policy.id}>
            <Link to={`/policies/${policy.handle}`}>{policy.title}</Link>
            <span>↗</span>
          </div>
        ))}
          {[
            ['Your Privacy Choices', '/pages/data-sharing-opt-out'],
            ['Cosmetic Standards', '/pages/our-cosmetic-standards'],
            ['Cancellation', '/pages/returns-refunds'],
            ['Shipping', '/pages/delivery-pickup'],
            ['Contact', '/policies/contact-information'],
          ].map(([title, to]) => (
            <div key={to}>
              <Link to={to}>{title}</Link>
              <span>↗</span>
            </div>
          ))}
        </div>
      </section>
      <StudioFooter />
    </main>
  );
}

const POLICIES_QUERY = `#graphql
  fragment PolicyItem on ShopPolicy {
    id
    title
    handle
  }
  query Policies ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    shop {
      privacyPolicy {
        ...PolicyItem
      }
      shippingPolicy {
        ...PolicyItem
      }
      termsOfService {
        ...PolicyItem
      }
      refundPolicy {
        ...PolicyItem
      }
      subscriptionPolicy {
        id
        title
        handle
      }
    }
  }
` as const;
