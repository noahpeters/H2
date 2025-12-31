import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/policies._index';

type AugmentedEnv = Env & {
  SHOPIFY_ADMIN_API_TOKEN?: string;
  SHOPIFY_ADMIN_API_VERSION?: string;
};

export async function loader({context}: Route.LoaderArgs) {
  const shopDomain =
    context.env.PUBLIC_STORE_DOMAIN ?? context.storefront?.getShopifyDomain();
  if (!shopDomain) {
    throw new Response('Missing shop domain', {status: 500});
  }
  const env = context.env as AugmentedEnv;
  const adminToken = env.SHOPIFY_ADMIN_API_TOKEN;
  const adminVersion = env.SHOPIFY_ADMIN_API_VERSION;
  if (!adminToken || !adminVersion) {
    throw new Response('Missing Admin API configuration', {status: 500});
  }
  const ADMIN_ENDPOINT = `https://${shopDomain}/admin/api/${adminVersion}/graphql.json`;
  const QUERY = `#graphql
        query ContactInfoPolicy {
            shop {
                shopPolicies {
                    type
                    title
                    body
                    url
                }
            }
        }
    `;

  let res: Response;
  try {
    res = await fetch(ADMIN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({query: QUERY}),
    });
  } catch (error) {
    console.error('Admin API fetch failed', error);
    throw new Response('Admin API fetch failed', {status: 502});
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Admin API error', res.status, res.statusText, errorText);
    throw new Response('Admin API error', {status: res.status});
  }

  type Policy = {
    type?: string;
    title?: string;
    body?: string;
    url?: string;
  };
  type AdminResponse = {
    data?: {
      shop?: {
        shopPolicies?: Policy[];
      };
    };
    errors?: Array<{message?: string}>;
  };

  const rawText = await res.text();
  let data: AdminResponse | null = null;
  try {
    data = JSON.parse(rawText) as AdminResponse;
  } catch (error) {
    console.error('Admin API non-JSON response', error, rawText);
    throw new Response('Admin API invalid response', {status: 502});
  }
  if (data?.errors?.length) {
    console.error('Admin API GraphQL errors', data.errors);
    throw new Response('Admin API GraphQL error', {status: 502});
  }
  const policies = data?.data?.shop?.shopPolicies ?? [];
  const contactPolicy = policies.find(
    (policy) => policy.type === 'CONTACT_INFORMATION',
  );

  console.log('Contact Policy:', JSON.stringify(contactPolicy));

  return {
    contactPolicy,
    headers: {
      // Cache for 10m at the edge, revalidate in background
      'Cache-Control':
        'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    },
  };
}

export default function ContactInformation() {
  const {contactPolicy} = useLoaderData<typeof loader>();

  return (
    <div className="contact-information">
      <h1>{contactPolicy?.title}</h1>
      <p>
        {contactPolicy?.body ? (
          <div dangerouslySetInnerHTML={{__html: contactPolicy.body}} />
        ) : null}
      </p>
    </div>
  );
}
