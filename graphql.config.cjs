const dotenv = require('dotenv');

dotenv.config({path: '.env'});

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function resolveSchema(path) {
  return require.resolve(path);
}

/** @type {import('graphql-config').IGraphQLConfig} */
module.exports = {
  projects: {
    default: {
      schema: resolveSchema('@shopify/hydrogen/storefront.schema.json'),
      documents: [
        '*.{ts,tsx,js,jsx}',
        'app/**/!(*policies.contact-information).@(ts|tsx|js|jsx)',
      ],
    },
    customer: {
      schema: resolveSchema('@shopify/hydrogen/customer-account.schema.json'),
      documents: ['./app/graphql/customer-account/*.{ts,tsx,js,jsx}'],
    },
    admin: {
      schema: [
        {
          [`https://${req('PUBLIC_STORE_DOMAIN')}/admin/api/${req('SHOPIFY_ADMIN_API_VERSION')}/graphql.json`]:
            {
              headers: {
                'X-Shopify-Access-Token': req('SHOPIFY_ADMIN_API_TOKEN'),
                'Content-Type': 'application/json',
              },
            },
        },
      ],
      documents: ['./app/routes/policies.contact-information.tsx'],
    },
  },
};
