import {Link, useLoaderData} from 'react-router';
import {Analytics, Image, RichText} from '@shopify/hydrogen';
import type {Route} from './+types/cutting-boards';
import {loadProduct} from '~/lib/product.server';
import {useProductCustomization} from '~/components/product/useProductCustomization';
import {VariantOptionPickers} from '~/components/product/VariantOptionPickers';
import {CuttingBoardGallery} from '~/components/product/CuttingBoardGallery';
import {ProductForm} from '~/components/ProductForm';
import {ProductPrice} from '~/components/ProductPrice';
import {StudioHeader} from '~/studio/StudioHeader';
import {StudioFooter} from '~/studio/StudioFooter';
import studioStyles from '~/styles/studio.css?url';
import giftStyles from '~/styles/cutting-boards.css?url';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: studioStyles},
  {rel: 'stylesheet', href: giftStyles},
];

export async function loader({context, request}: Route.LoaderArgs) {
  return loadProduct({
    context,
    request,
    handle: 'cutting-board',
    localizeHandle: false,
  });
}

export const meta: Route.MetaFunction = ({data}) => {
  const title = 'Cutting boards for all the meals to come | From Trees';
  const description =
    'Give a cutting board made for everyday use. Choose your wood, size, and personal touches, from the same workshop that makes our custom furniture and cabinetry.';
  const url = `${data?.origin ?? 'https://from-trees.com'}/cutting-boards`;
  const image = data?.product.selectedOrFirstAvailableVariant?.image?.url;
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link', rel: 'canonical', href: url},
    {property: 'og:site_name', content: 'From Trees'},
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: url},
    {name: 'twitter:card', content: 'summary_large_image'},
    {name: 'twitter:title', content: title},
    {name: 'twitter:description', content: description},
    ...(image
      ? [
          {property: 'og:image', content: image},
          {name: 'twitter:image', content: image},
        ]
      : []),
  ];
};

export default function CuttingBoardGifts() {
  const {product, lineItemFieldSetReference} = useLoaderData<typeof loader>();
  const {
    selectedVariant,
    productWithSelection,
    presentationMap,
    woodColorPalettes,
    lineItemFieldSet,
    hasPresentationMap,
    productOptions,
  } = useProductCustomization(product, lineItemFieldSetReference);
  const media = selectedVariant.product.media.nodes.flatMap((item) =>
    'image' in item && item.image ? [{id: item.id, image: item.image}] : [],
  );
  const heroImage = selectedVariant.image ?? media[0]?.image;

  return (
    <main className="studio-page cutting-board-page">
      <div className="board-announcement">
        A little of the workshop. A place in their everyday.
      </div>
      <StudioHeader
        showConsultation={false}
        links={[
          {label: 'Choose your board', to: '#customize'},
          {label: 'Our custom work ↗', to: '#workshop'},
        ]}
      />
      <section className="board-hero" aria-labelledby="board-title">
        <div className="board-hero-image">
          {heroImage ? (
            <Image
              data={heroImage}
              alt={heroImage.altText || 'From Trees hardwood cutting board'}
              sizes="(min-width: 800px) 55vw, 100vw"
              loading="eager"
              fetchPriority="high"
            />
          ) : null}
        </div>
        <div className="board-hero-copy">
          <p className="eyebrow">For the ones who gather</p>
          <h1 id="board-title">
            A gift for all
            <br />
            the meals <em>to come.</em>
          </h1>
          <p>
            For the host. The home cook. The person who always makes room for
            one more. Give them something worth keeping on the counter.
          </p>
          <div className="board-starting-price">
            From <ProductPrice price={product.priceRange.minVariantPrice} />
          </div>
          <a className="board-button" href="#customize">
            Make it theirs <span aria-hidden="true">↓</span>
          </a>
          <p className="board-small">
            Choose your wood, size, and finishing touches below.
          </p>
        </div>
      </section>
      <div className="board-ribbon">
        <span>Solid hardwood</span>
        <span>Made in California</span>
        <span>Made to give. Made to use.</span>
      </div>
      <section
        className="board-shop"
        id="customize"
        aria-labelledby="board-customize-title"
      >
        <div className="board-shop-heading">
          <p className="eyebrow">Something they’ll reach for</p>
          <h2 id="board-customize-title">
            Make it <em>their own.</em>
          </h2>
          <p>All the choices. The same care in every board.</p>
        </div>
        <div className="board-shop-grid">
          <CuttingBoardGallery
            key={selectedVariant.id}
            image={heroImage}
            images={media.map((item) => item.image)}
          />
          <div className="board-customizer">
            {hasPresentationMap ? (
              <VariantOptionPickers
                product={productWithSelection}
                presentationMap={presentationMap}
                basePath="/cutting-boards"
              />
            ) : null}
            <ProductForm
              productOptions={hasPresentationMap ? undefined : productOptions}
              selectedVariant={selectedVariant}
              lineItemFieldSet={lineItemFieldSet}
              woodColorPalettes={woodColorPalettes}
            />
            <p className="board-delivery">
              Giving for a particular date?{' '}
              <Link to="/contact">Check timing with us</Link> before ordering.{' '}
              <Link to="/pages/delivery-pickup">
                Shipping &amp; pickup details ↗
              </Link>
            </p>
            <details className="board-details">
              <summary>About the boards</summary>
              <div
                dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
              />
            </details>
            {product.specs?.value ? (
              <details className="board-details">
                <summary>Materials, details &amp; care</summary>
                <RichText data={product.specs.value} />
              </details>
            ) : null}
          </div>
        </div>
      </section>
      <section className="board-story">
        <p className="eyebrow">A place in their everyday</p>
        <h2>
          The best gifts become
          <br />
          <em>part of the day.</em>
        </h2>
        <p>
          Sunday breakfast. A few friends over. One more slice at the kitchen
          counter. A cutting board belongs in the middle of it all.
        </p>
      </section>
      <section
        className="board-workshop"
        id="workshop"
        aria-labelledby="board-workshop-title"
      >
        <div className="board-workshop-photo">
          <img
            src="/studio/images/white-oak-kitchen.webp"
            alt="From Trees white oak cabinetry with brass pulls"
            width="2500"
            height="1875"
            loading="lazy"
          />
        </div>
        <div className="board-workshop-copy">
          <p className="eyebrow">From the same workshop</p>
          <h2 id="board-workshop-title">
            Love the board?
            <br />
            Meet the rest of
            <br />
            <em>what we make.</em>
          </h2>
          <p>
            Custom furniture and cabinetry, thoughtfully made for the way you
            live. From the table you gather around to the kitchen that brings
            everyone in.
          </p>
          <div className="board-workshop-links">
            <Link to="/configurator">
              Explore furniture <span aria-hidden="true">↗</span>
            </Link>
            <Link to="/#work">
              Explore cabinetry <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
      <section className="board-return">
        <div>
          <p className="eyebrow">A thoughtful place to start</p>
          <h2>Give something they’ll use.</h2>
        </div>
        <a className="board-button" href="#customize">
          Choose your board <span aria-hidden="true">↑</span>
        </a>
      </section>
      <StudioFooter />
      <Analytics.ProductView
        data={{
          products: [
            {
              id: product.id,
              title: product.title,
              price: selectedVariant.price.amount,
              vendor: product.vendor,
              variantId: selectedVariant.id,
              variantTitle: selectedVariant.title,
              quantity: 1,
            },
          ],
        }}
      />
    </main>
  );
}
