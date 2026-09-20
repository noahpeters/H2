import {useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/products.$handle';
import {Analytics, RichText} from '@shopify/hydrogen';
import {ProductPrice} from '~/components/ProductPrice';
import {ProductImage} from '~/components/ProductImage';
import {ProductForm} from '~/components/ProductForm';
import {VariantOptionPickers} from '~/components/product/VariantOptionPickers';
import {useProductCustomization} from '~/components/product/useProductCustomization';
import {loadProduct} from '~/lib/product.server';
import Carousel from '~/components/Carousel';
import stylex from '~/lib/stylex';
import studioStyles from '~/styles/studio.css?url';
import {StudioFooter} from '~/studio/StudioFooter';
import {StudioHeader} from '~/studio/StudioHeader';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
];

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

export async function loader({context, request, params}: Route.LoaderArgs) {
  if (!params.handle) throw new Error('Expected product handle to be defined');
  return loadProduct({context, request, handle: params.handle});
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

  const {
    selectedVariant,
    productWithSelection,
    presentationMap,
    woodColorPalettes,
    lineItemFieldSet,
    hasPresentationMap,
    productOptions,
  } = useProductCustomization(product, lineItemFieldSetReference);

  const {title, descriptionHtml} = product;

  return (
    <main className="studio-page studio-product-page">
      <StudioHeader
        links={[
          {label: 'Back to examples', to: '/collections/all'},
          {label: 'Configure a table ↗', to: '/configurator'},
        ]}
      />
      <div className="studio-product-content">
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
      </div>
      <StudioFooter />
    </main>
  );
}
