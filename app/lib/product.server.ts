import {getSelectedProductOptions, type Storefront} from '@shopify/hydrogen';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';

export async function loadProduct({
  context,
  request,
  handle,
  localizeHandle = true,
}: {
  context: {storefront: Storefront};
  request: Request;
  handle: string;
  localizeHandle?: boolean;
}) {
  const {storefront} = context;
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
  if (localizeHandle)
    redirectIfHandleIsLocalized(request, {handle, data: product});

  return {
    origin: new URL(request.url).origin,
    product,
    lineItemFieldSetReference:
      fieldSetProduct?.line_item_field_set?.reference ?? null,
  };
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
