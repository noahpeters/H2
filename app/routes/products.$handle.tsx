import {useMemo} from 'react';
import {useLoaderData, useLocation, useNavigation} from 'react-router';
import type {Route} from './+types/products.$handle';
import type {ProductFragment} from 'storefrontapi.generated';
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
import {VariantOptionPickers} from '~/components/product/VariantOptionPickers';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import Carousel from '~/components/Carousel';
import stylex from '~/lib/stylex';
import {buildPresentationMap} from '~/lib/options/buildPresentationMap';
import {
  parseLineItemFieldSet,
  type MetaobjectField,
} from '~/lib/cart/lineItemFieldSet';
import {
  parseWoodColorPalette,
  type MetaobjectField as PaletteMetaobjectField,
} from '~/lib/options/woodColorPalettes';

export const meta: Route.MetaFunction = ({data}) => {
  const origin = data?.origin ?? 'https://from-trees.com';

  const product = data?.product;
  if (!product) return [{title: 'from trees'}];

  const title = `from trees | ${product.seo?.title ?? product.title}`;

  const description =
    product.seo?.description ??
    product.description?.replace(/\s+/g, ' ').trim().slice(0, 160) ??
    'Handcrafted furniture from from trees.';

  const url = `${origin}/products/${product.handle}`;

  const imageURL = product.selectedOrFirstAvailableVariant?.image?.url;
  const image = imageURL
    ? `${imageURL}&width=1200&height=630&crop=center`
    : `${origin}/app/assets/logo-wide.png`;

  return [
    {title},
    {name: 'description', content: description},

    // Canonical
    {rel: 'canonical', href: url},

    // Open Graph
    {property: 'og:site_name', content: 'from trees'},
    {property: 'og:type', content: 'product'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    ...(image
      ? [
          {property: 'og:image', content: image},
          {property: 'og:image:width', content: '1200'},
          {property: 'og:image:height', content: '630'},
        ]
      : []),

    // Twitter
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
    ...(image ? [{name: 'twitter:image', content: image}] : []),
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

  const [{product}, {product: fieldSetProduct}] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: {handle, selectedOptions: getSelectedProductOptions(request)},
    }),
    storefront.query(LINE_ITEM_FIELD_SET_QUERY, {
      cache: storefront.CacheNone(),
      variables: {handle},
    }),
  ]);

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, {handle, data: product});

  return {
    origin: new URL(request.url).origin,
    product,
    lineItemFieldSetReference:
      fieldSetProduct?.line_item_field_set?.reference ?? null,
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
  product: {
    display: 'grid',
    '@media (min-width: 45em)': {
      gridTemplateColumns: '1fr 1fr',
      gap: '4rem',
    },
  },
  productTitle: {
    marginTop: 0,
  },
  productMain: {
    alignSelf: 'start',
    position: 'sticky',
    top: '6rem',
  },
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
    '@media (max-width: 640px)': {
      flexDirection: 'column',
    },
  },
  descriptionBox: {
    flex: 1,
  },
  descriptionDivider: {
    width: 1,
    backgroundColor: 'var(--color-primary)',
    '@media (max-width: 640px)': {
      width: 'unset',
      height: 1,
    },
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
    '@media (max-width: 640px)': {
      width: 'unset',
      height: 1,
    },
  },
});

export default function Product() {
  const {product, lineItemFieldSetReference} = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  // Optimistically selects a variant with given available variant information
  const optimisticVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );
  const location = useLocation();
  const selectedVariantFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (params.size === 0) return null;
    const baseOptions =
      product.selectedOrFirstAvailableVariant?.selectedOptions ??
      optimisticVariant?.selectedOptions ??
      [];
    if (baseOptions.length === 0) return null;
    const mergedOptions = baseOptions.map((option) => ({
      name: option.name,
      value: params.get(option.name) ?? option.value,
    }));
    return (
      product.variants.nodes.find((variant) =>
        (variant.selectedOptions ?? []).every(
          (option) =>
            mergedOptions.find((merged) => merged.name === option.name)
              ?.value === option.value,
        ),
      ) ?? null
    );
  }, [
    location.search,
    optimisticVariant?.selectedOptions,
    product.selectedOrFirstAvailableVariant?.selectedOptions,
    product.variants.nodes,
  ]);
  const selectedVariant = selectedVariantFromUrl ?? optimisticVariant;

  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  const productWithSelection = {
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  };
  const optionUiEntries = getOptionUiEntries(product);
  const presentationMap = buildPresentationMap(optionUiEntries);
  const woodColorPalettes = getWoodColorPalettes(product);
  const lineItemFieldSet = lineItemFieldSetReference
    ? parseLineItemFieldSet(
        lineItemFieldSetReference as {fields?: MetaobjectField[] | null},
      )
    : null;
  const optionUiNodes = (
    product as ProductFragment & {
      option_ui?: {references?: {nodes?: unknown[]}};
    }
  ).option_ui?.references?.nodes;
  const hasPresentationMap = (optionUiNodes?.length ?? 0) > 0;
  const productOptions = getProductOptions(productWithSelection);

  const {title, descriptionHtml} = product;

  return (
    <>
      <section>
        <div role="presentation" />
        <div className={stylex(styles.product)}>
          {selectedVariant.product.media && (
            <div>
              <ProductImage image={selectedVariant?.image} />
            </div>
          )}
          <div className={stylex(styles.productMain)}>
            <h1 className={stylex(styles.productTitle)}>{title}</h1>
            <div className={stylex(styles.priceRange)}>
              <ProductPrice
                price={product.priceRange.minVariantPrice}
                isLoading={isLoading}
              />
              -
              <ProductPrice
                price={product.priceRange.maxVariantPrice}
                isLoading={isLoading}
              />
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
              Finished with natural oils and waxes that enhance the wood&apos;s
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
              doesn&apos;t compromise.
            </p>
          </div>
        </div>
      </section>
      <section>
        <div className={stylex(styles.product)}>
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
          <div className={stylex(styles.productMain)}>
            <div id="customize">
              {hasPresentationMap ? (
                <VariantOptionPickers
                  product={productWithSelection}
                  presentationMap={presentationMap}
                />
              ) : null}
              <ProductForm
                productOptions={hasPresentationMap ? undefined : productOptions}
                selectedVariant={selectedVariant}
                lineItemFieldSet={lineItemFieldSet}
                woodColorPalettes={woodColorPalettes}
              />
            </div>
          </div>
        </div>
      </section>
      <section>
        <div className={stylex(styles.valuesContainer)}>
          <div className={stylex(styles.valuesBox)}>
            <h3 className={stylex(styles.valuesHeader)}>Made To Order</h3>
            <p>
              Each piece of furniture is made to order and built specifically
              for your space and selections. Because every piece is constructed
              individually, decisions about proportion, grain orientation, edge
              treatment, and finish are resolved during the build rather than
              pulled from a fixed template. This approach allows each piece to
              respond naturally to the material and the design, resulting in a
              finished piece that is singular in character. Natural variation is
              an inherent part of working with solid wood. Grain patterns, color
              shifts, and subtle differences in figure ensure that no two pieces
              are ever exactly alike. These variations are not deviations from
              the design, but an essential part of what gives each piece its own
              presence and identity.
            </p>
          </div>
          <div className={stylex(styles.valuesDivider)}></div>
          <div className={stylex(styles.valuesBox)}>
            <h3 className={stylex(styles.valuesHeader)}>
              Lead Time & Expectations
            </h3>
            <p>
              Our made-to-order process prioritizes careful execution over
              speed. Production timelines vary based on design details, material
              selection, and finishing requirements, but most orders are
              completed within 8–10 weeks. This timeframe allows the work to
              progress at a pace that respects the material and the build
              process, rather than compressing it to meet an arbitrary schedule.
              Because each piece is built specifically for you, the finished
              result will reflect both your selections and the natural character
              of the wood itself. The furniture you receive will be unmistakably
              yours—familiar in form, yet unique in detail.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

type OptionUiField = {
  key: string;
  value?: string | null;
  type?: string | null;
  reference?: unknown;
};

function getOptionUiEntries(product: ProductFragment) {
  const optionUi = (
    product as ProductFragment & {
      optionUi?: {
        references?: {
          nodes?: Array<{
            __typename?: string;
            fields?: OptionUiField[];
          }>;
        };
      };
      option_ui?: {
        references?: {
          nodes?: Array<{
            __typename?: string;
            fields?: OptionUiField[];
          }>;
        };
      };
    }
  ).optionUi;
  const optionUiLegacyAlias = (
    product as ProductFragment & {
      option_ui?: {
        references?: {
          nodes?: Array<{
            __typename?: string;
            fields?: OptionUiField[];
          }>;
        };
      };
    }
  ).option_ui;

  const nodes =
    optionUi?.references?.nodes ?? optionUiLegacyAlias?.references?.nodes ?? [];

  return nodes
    .map((node: {fields?: OptionUiField[]}) => {
      const fields = node.fields ?? [];
      const fieldMap: Record<string, OptionUiField> = {};

      for (const field of fields) {
        fieldMap[field.key] = field;
      }

      return {
        optionName:
          fieldMap.option_name?.value ??
          fieldMap.optionName?.value ??
          fieldMap.option?.value ??
          null,
        value: fieldMap.value?.value ?? null,
        label: fieldMap.label?.value ?? null,
        description: fieldMap.description?.value ?? null,
        sortOrder:
          fieldMap.sort_order?.value ?? fieldMap.sortOrder?.value ?? null,
        type: (fieldMap.type?.value ?? undefined) as
          | 'swatch'
          | 'thumbnail'
          | 'icon'
          | 'text'
          | undefined,
        swatchColor:
          fieldMap.swatch_color?.value ?? fieldMap.swatchColor?.value ?? null,
        image: fieldMap.image?.reference,
        icon: fieldMap.icon?.reference,
      };
    })
    .filter((entry: {optionName: string | null; value: string | null}) =>
      Boolean(entry.optionName && entry.value),
    );
}

function getWoodColorPalettes(product: ProductFragment) {
  const palettes = getWoodColorPalettesRaw(product);
  return (
    palettes
      ?.filter((node): node is {fields?: PaletteMetaobjectField[] | null} =>
        Boolean(node && 'fields' in node),
      )
      .map((node) => parseWoodColorPalette(node))
      .filter(
        (palette): palette is NonNullable<typeof palette> => palette != null,
      ) ?? []
  );
}

function getWoodColorPalettesRaw(product: ProductFragment) {
  return (
    (
      product as ProductFragment & {
        wood_color_palettes?: {
          references?: {
            nodes?: Array<{
              fields?: PaletteMetaobjectField[] | null;
            } | null> | null;
          } | null;
        } | null;
      }
    ).wood_color_palettes?.references?.nodes ?? null
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
    variants(first: 250) {
      nodes {
        ...ProductVariant
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
    option_ui: metafield(key: "option_ui", namespace: "custom") {
      references(first: 100) {
        nodes {
          __typename
          ... on Metaobject {
            id
            type
            handle
            fields {
              key
              value
              type
              reference {
                ... on MediaImage {
                  image {
                    url
                    altText
                    width
                    height
                  }
                }
                ... on GenericFile {
                  url
                }
              }
            }
          }
        }
      }
    }
    line_item_field_set: metafield(key: "line_item_field_set", namespace: "custom") {
      reference {
        __typename
        ... on Metaobject {
          fields {
            key
            type
            value
            references(first: 50) {
              nodes {
                __typename
                ... on Metaobject {
                  fields {
                    key
                    type
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
    lineItemFieldSet: metafield(key: "line_item_field_set", namespace: "custom") {
      reference {
        __typename
        ... on Metaobject {
          fields {
            key
            type
            value
            references(first: 50) {
              nodes {
                __typename
                ... on Metaobject {
                  fields {
                    key
                    type
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
    wood_color_palettes: metafield(key: "wood_color_palettes", namespace: "custom") {
      references(first: 20) {
        nodes {
          __typename
          ... on Metaobject {
            fields {
              key
              type
              value
              references(first: 20) {
                nodes {
                  __typename
                  ... on Metaobject {
                    fields {
                      key
                      type
                      value
                      reference {
                        ... on MediaImage {
                          image {
                            url
                            altText
                            width
                            height
                          }
                        }
                        ... on GenericFile {
                          url
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
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

const LINE_ITEM_FIELD_SET_QUERY = `#graphql
  query LineItemFieldSet($handle: String!) {
    product(handle: $handle) {
      line_item_field_set: metafield(
        key: "line_item_field_set"
        namespace: "custom"
      ) {
        reference {
          __typename
          ... on Metaobject {
            fields {
              key
              type
              value
              references(first: 50) {
                nodes {
                  __typename
                  ... on Metaobject {
                    fields {
                      key
                      type
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
` as const;
