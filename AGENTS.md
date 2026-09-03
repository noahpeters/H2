# H2 agent instructions

- Treat this repository as the consolidated From Trees storefront on Shopify Hydrogen and Oxygen.
- Preserve the existing Shopify Storefront API, product, collection, cart, account, policy, search, analytics, sitemap, and redirect behavior unless an issue explicitly changes it.
- Port approved editorial content and the inquiry-only furniture configurator from `noahpeters/from-trees-studio`; do not introduce prices or checkout into the configurator unless an issue explicitly requests it.
- Preserve valuable URL paths from `from-trees.com`, `fromtrees.build`, and `from-trees-studio`. Add explicit permanent redirects when a path cannot remain unchanged.
- Keep product data and product-feed sources in Shopify. Project case studies may use Shopify-managed content or repository-managed content as specified by the issue.
- Ship only approved production artwork. Do not copy experimental, duplicate, or source-study image directories into the storefront bundle.
- Keep server code compatible with the Oxygen worker runtime and web-standard APIs. Do not add a Node-only server dependency without proving Oxygen compatibility.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before proposing a change.
- Never push directly to `main`, merge a pull request, or deploy from a Metis coding task. Pull-request merges are human-only, and production deployment must run through GitHub Actions after merge.
