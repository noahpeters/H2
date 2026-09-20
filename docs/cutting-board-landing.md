# Cutting-board gift landing page

`/cutting-boards` is a gift-focused landing page for the existing Shopify product
`cutting-board`. It has its own canonical URL and is included in the custom sitemap.
The original `/products/cutting-board` URL remains available.

## Shared shopping behavior

- Both routes use `loadProduct` and `useProductCustomization` for the same Shopify
  product, variants, option presentation, finish palettes, and line-item fields.
- The landing page renders the existing `VariantOptionPickers` / `ProductForm`,
  including Add to cart and Buy now. No product data or price table is duplicated.
- Variant selections stay on `/cutting-boards` as query parameters. The optional
  picker `basePath` preserves existing product-route destinations by default.
- Cart and product-view analytics use the existing storefront integration.
- Photos come from Shopify product media. The cabinetry image is the existing
  production image used by the home page.

## Content

The primary action leads to the full customization section. The secondary
“From the same workshop” feature links to the furniture configurator and the
home page's project portfolio. The furniture configurator remains inquiry-only.
There are no invented delivery deadlines, gift packaging promises, reviews, or
discounts. The page directs date-sensitive customers to contact the workshop.

## Validation

Run `npm run verify`. Manually check desktop/mobile layout, photo thumbnails,
variant URL persistence, prices, engraving availability and cart attributes,
and the existing product page. Test checkout only up to navigation; never place
an order as part of verification.
