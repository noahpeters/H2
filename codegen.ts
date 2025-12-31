import type {CodegenConfig} from '@graphql-codegen/cli';
import {pluckConfig as hydrogenPluck, preset, getSchema} from '@shopify/hydrogen-codegen';

const config: CodegenConfig = {
  overwrite: true,
  // hydrogenPluck is compatible at runtime but not typed for Codegen’s interface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pluckConfig: hydrogenPluck as any,
  generates: {
    'storefrontapi.generated.d.ts': {
      preset,
      schema: getSchema('storefront'),
      documents: [
        './*.{ts,tsx,js,jsx}',
        './app/**/*.{ts,tsx,js,jsx}',
        '!./app/graphql/customer-account/**',
        '!./app/routes/policies.contact-information.tsx',
      ],
    },
    'customeraccountapi.generated.d.ts': {
      preset,
      schema: getSchema('customer-account'),
      documents: ['./app/graphql/customer-account/**/*.{ts,tsx,js,jsx}'],
    },
  },
};
export default config;
