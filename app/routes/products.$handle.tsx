import {useLoaderData} from 'react-router';
import type {Route} from './+types/products.$handle';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
  RichText,
} from '@shopify/hydrogen';
import {ProductPrice} from '~/components/ProductPrice';
import {ProductImage} from '~/components/ProductImage';
import {ProductForm} from '~/components/ProductForm';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import Carousel from '~/components/Carousel';
import stylex from '~/lib/stylex';

export const meta: Route.MetaFunction = ({data}) => {
  return [
    {title: `Hydrogen | ${data?.product.title ?? ''}`},
    {
      rel: 'canonical',
      href: `/products/${data?.product.handle}`,
    },
  ];
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) {
    throw new Error('Expected product handle to be defined');
  }

  const [{product}] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: {handle, selectedOptions: getSelectedProductOptions(request)},
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, {handle, data: product});

  return {
    product,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context, params}: Route.LoaderArgs) {
  // Put any API calls that is not critical to be available on first page render
  // For example: product reviews, product recommendations, social feeds.

  return {};
}

const styles = stylex.create({
  priceRange: {
    display: 'flex',
    gap: 4,
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827',
  },
  anchorButton: {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-light)',
    borderRadius: '8px',
  },
  descriptionContainer: {
    display: 'flex',
    gap: 16,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  descriptionBox: {
    flex: 1,
  },
  descriptionDivider: {
    width: 1,
    backgroundColor: 'var(--color-primary)',
  },
  valuesContainer: {
    display: 'flex',
    gap: 16,
    flexDirection: 'row',
    alignItems: 'stretch',
    '@media (max-width: 640px)': {
      flexDirection: 'column',
    },
  },
  valuesBox: {
    flex: 1,
    textAlign: 'center',
    backgroundColor: 'var(--color-secondary)',
    color: 'var(--color-light)',
    padding: 16,
    borderRadius: 8,
    paddingBottom: 24,
  },
  valuesHeader: {
    color: 'var(--color-light)',
  },
  valuesDivider: {
    width: 1,
    backgroundColor: 'var(--color-secondary)',
  },
});

export default function Product() {
  const {product} = useLoaderData<typeof loader>();

  // Optimistically selects a variant with given available variant information
  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  // Sets the search param to the selected variant without navigation
  // only when no search params are set in the url
  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  // Get the product options array
  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const {title, descriptionHtml} = product;

  console.log({product});

  return (
    <>
      <section>
        <div role="presentation" />
        <div className="product">
          {selectedVariant.product.media && (
            <div>
              <ProductImage image={selectedVariant?.image} />
            </div>
          )}
          <div className="product-main">
            <h1>{title}</h1>
            <div className={stylex(styles.priceRange)}>
              <ProductPrice price={product.priceRange.minVariantPrice} />-
              <ProductPrice price={product.priceRange.maxVariantPrice} />
            </div>
            <br />
            <br />
            <div className={stylex(styles.descriptionContainer)}>
              <div
                className={stylex(styles.descriptionBox)}
                dangerouslySetInnerHTML={{__html: descriptionHtml}}
              />
              {product.specs?.value != null ? (
                <>
                  <div className={stylex(styles.descriptionDivider)}></div>
                  <div className={stylex(styles.descriptionBox)}>
                    <RichText data={product.specs?.value ?? ''} />
                  </div>
                </>
              ) : null}
            </div>
            <br />
            <a href="#customize" className={stylex(styles.anchorButton)}>
              Customize & Purchase
            </a>
          </div>
          <Analytics.ProductView
            data={{
              products: [
                {
                  id: product.id,
                  title: product.title,
                  price: selectedVariant?.price.amount || '0',
                  vendor: product.vendor,
                  variantId: selectedVariant?.id || '',
                  variantTitle: selectedVariant?.title || '',
                  quantity: 1,
                },
              ],
            }}
          />
        </div>
      </section>
      <section>
        <div className={stylex(styles.valuesContainer)}>
          <div className={stylex(styles.valuesBox)}>
            <h3 className={stylex(styles.valuesHeader)}>Materials</h3>
            <p>
              Crafted from carefully selected solid hardwoods, chosen for grain
              consistency, stability, and aging characteristics. No veneers, no
              particleboard, no MDF—just genuine, full-thickness hardwood.
              <br />
              Finished with natural oils and waxes that enhance the wood's
              innate beauty while providing a durable, tactile surface.
            </p>
          </div>
          <div className={stylex(styles.valuesDivider)}></div>
          <div className={stylex(styles.valuesBox)}>
            <h3 className={stylex(styles.valuesHeader)}>Craftsmanship</h3>
            <p>
              Boards are milled, matched, and assembled for visual calm rather
              than dramatic contrast. Joinery is structural and time-tested,
              with mortise-and-tenon connections and properly engineered
              expansion points to ensure long-term stability. Edges are shaped
              by hand, surfaces are finished smooth and warm to the touch, and
              every detail—visible or not—is refined with intention.
            </p>
          </div>
          <div className={stylex(styles.valuesDivider)}></div>
          <div className={stylex(styles.valuesBox)}>
            <h3 className={stylex(styles.valuesHeader)}>Legacy</h3>
            <p>
              Our products are designed to be heirlooms—durable, timeless, and
              repairable. With proper care, they will age gracefully, developing
              a rich patina that tells the story of a life well-lived. This is
              furniture built slowly, thoughtfully, and to a standard that
              doesn’t compromise.
            </p>
          </div>
        </div>
      </section>
      <section id="customize">
        <div className="product">
          <div className="product-main">
            <ProductPrice
              price={selectedVariant?.price}
              compareAtPrice={selectedVariant?.compareAtPrice}
            />
            <br />
            <ProductForm
              productOptions={productOptions}
              selectedVariant={selectedVariant}
            />
          </div>
          <div>
            {selectedVariant.product.media.nodes.length > 1 ? (
              <Carousel>
                {selectedVariant.product.media.nodes
                  ?.map((mediaItem: any) => {
                    if (
                      mediaItem.__typename === 'MediaImage' &&
                      mediaItem.image
                    ) {
                      return (
                        <ProductImage
                          key={mediaItem.id}
                          image={mediaItem.image}
                          shortened={true}
                        />
                      );
                    }

                    return null;
                  })
                  .filter(Boolean) ?? null}
              </Carousel>
            ) : (
              <ProductImage image={selectedVariant?.image} />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice {
      amount
      currencyCode
    }
    id
    image {
      __typename
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    product {
      title
      handle
      media(first: 10) {
        nodes {
          ... on MediaImage {
            __typename
            id
            image {
              __typename
              id
              url
              altText
              width
              height
            }
          }
          ... on Model3d {
            id
            sources {
              url
              mimeType
              format
            }
          }
        }
      }
    }
    selectedOptions {
      name
      value
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
  }
` as const;

const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    tags
    vendor
    handle
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    options {
      name
      optionValues {
        name
        firstSelectableVariant {
          ...ProductVariant
        }
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
      ...ProductVariant
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    adjacentVariants (selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    seo {
      description
      title
    }
    specs: metafield(key:"specs" namespace: "custom") {
      value
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
  }
  ${PRODUCT_FRAGMENT}
` as const;
