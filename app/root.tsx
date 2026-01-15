import {Analytics, getShopAnalytics, useNonce} from '@shopify/hydrogen';
import {PageViewAnalytics} from '~/components/PageAnalyticsView';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import type {Route} from './+types/root';
import favicon from '~/assets/favicon.png';
import {FOOTER_QUERY, HEADER_QUERY} from '~/lib/fragments';
import resetStyles from '~/styles/reset.css?url';
import appStyles from '~/styles/app.css?url';
import stylexStyles from '~/styles/stylex.css?url';
import {PageLayout} from './components/PageLayout';
import {useEffect} from 'react';

declare global {
  interface Window {
    dataLayer: unknown[];
    fbq?: FbqFn;
    _fbq?: Window['fbq'];
    __metaPixelInitialized?: boolean;
  }
}

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
};

export type RootLoader = typeof loader;

/**
 * This is important to avoid re-fetching root queries on sub-navigations
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') return true;

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) return true;

  // Defaulting to no revalidation for root loader data to improve performance.
  // When using this feature, you risk your UI getting out of sync with your server.
  // Use with caution. If you are uncomfortable with this optimization, update the
  // line below to `return defaultShouldRevalidate` instead.
  // For more details see: https://remix.run/docs/en/main/route/should-revalidate
  return false;
};

/**
 * The main and reset stylesheets are added in the Layout component
 * to prevent a bug in development HMR updates.
 *
 * This avoids the "failed to execute 'insertBefore' on 'Node'" error
 * that occurs after editing and navigating to another page.
 *
 * It's a temporary fix until the issue is resolved.
 * https://github.com/remix-run/remix/issues/9242
 */
export function links() {
  const linksList = [
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
    {rel: 'icon', type: 'image/png', href: `${favicon}?v=1`},
    {rel: 'shortcut icon', type: 'image/png', href: `${favicon}?v=1`},
    {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
  ];

  if (!import.meta.env.DEV) {
    linksList.push({rel: 'stylesheet', href: stylexStyles});
  }

  return linksList;
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  const {storefront, env} = args.context;

  return {
    ...deferredData,
    ...criticalData,
    publicStoreDomain: env.PUBLIC_STORE_DOMAIN,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      withPrivacyBanner: false,
      // localize the privacy banner
      country: args.context.storefront.i18n.country,
      language: args.context.storefront.i18n.language,
    },
  };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront} = context;

  const [header] = await Promise.all([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        headerMenuHandle: 'main-menu', // Adjust to your header menu handle
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {header};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  const {storefront, customerAccount, cart} = context;

  // defer the footer query (below the fold)
  const footer = storefront
    .query(FOOTER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        footerMenuHandle: 'footer', // Adjust to your footer menu handle
      },
    })
    .catch((error: Error) => {
      // Log query errors, but don't throw them so the page can still render
      console.error(error);
      return null;
    });
  return {
    cart: cart.get(),
    isLoggedIn: customerAccount.isLoggedIn(),
    footer,
  };
}

export function TawkToTag({nonce}: {nonce?: string}) {
  useEffect(() => {
    const existing = document.querySelector(
      `script[src="https://embed.tawk.to/695f3d8c231fb5197e2a62f0/1jee0gr4m"]`,
    );
    if (existing) return;

    const s1 = document.createElement('script');
    s1.async = true;
    s1.src = 'https://embed.tawk.to/695f3d8c231fb5197e2a62f0/1jee0gr4m';
    s1.charset = 'UTF-8';
    if (nonce) s1.nonce = nonce;
    s1.setAttribute('crossorigin', '*');
    document.head.appendChild(s1);
  }, [nonce]);

  return null;
}

export function GoogleTag({id, nonce}: {id: string; nonce?: string}) {
  useEffect(() => {
    // avoid double-inject (HMR, client nav, etc.)
    const existing = document.querySelector(
      `script[src="https://www.googletagmanager.com/gtag/js?id=${id}"]`,
    );
    if (existing) return;

    const s1 = document.createElement('script');
    s1.async = true;
    s1.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    if (nonce) s1.nonce = nonce;
    document.head.appendChild(s1);

    const s2 = document.createElement('script');
    if (nonce) s2.nonce = nonce;
    s2.text = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}');
    `;
    document.head.appendChild(s2);
  }, [id, nonce]);

  return null;
}

export function MetaPixel({nonce}: {nonce?: string}) {
  useEffect(() => {
    const pixelId = '4235923316621088';

    if (!window.fbq) {
      const fbq: FbqFn = (...args: unknown[]) => {
        if (fbq.callMethod) {
          fbq.callMethod(...args);
        } else {
          fbq.queue?.push(args);
        }
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      window.fbq = fbq;
      window._fbq = fbq;
    }

    const existing = document.querySelector(
      `script[src="https://connect.facebook.net/en_US/fbevents.js"]`,
    );
    if (!existing) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://connect.facebook.net/en_US/fbevents.js';
      if (nonce) s.nonce = nonce;
      document.head.appendChild(s);
    }

    if (!window.__metaPixelInitialized && window.fbq) {
      window.fbq('init', pixelId);
      window.fbq('track', 'PageView');
      window.__metaPixelInitialized = true;
    }
  }, [nonce]);

  return null;
}

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();
  const gtagId = 'GT-TXBKGK45';

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={resetStyles}></link>
        <link rel="stylesheet" href={appStyles}></link>
        {import.meta.env.DEV ? (
          <link
            rel="stylesheet"
            href="/virtual:stylex.css"
            suppressHydrationWarning
          />
        ) : null}
        {import.meta.env.DEV ? (
          <script
            type="module"
            src="/@id/virtual:stylex:runtime"
            suppressHydrationWarning
          />
        ) : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ClientErrorReporter />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
        <GoogleTag nonce={nonce} id={gtagId} />
        <TawkToTag nonce={nonce} />
        <MetaPixel nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<RootLoader>('root');
  const isDev = import.meta.env.DEV;
  const hasCheckoutDomain = Boolean(data?.consent?.checkoutDomain);

  if (!data) {
    return <Outlet />;
  }

  if (isDev || !hasCheckoutDomain) {
    return (
      <PageLayout {...data}>
        <Outlet />
      </PageLayout>
    );
  }

  return (
    <Analytics.Provider
      cart={data.cart}
      shop={data.shop}
      consent={data.consent}
    >
      <PageLayout {...data}>
        <PageViewAnalytics />
        <Outlet />
      </PageLayout>
    </Analytics.Provider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = 'Unknown error';
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message ?? error.data;
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div className="route-error">
      <h1>Oops</h1>
      <h2>{errorStatus}</h2>
      {errorMessage && (
        <fieldset>
          <pre>{errorMessage}</pre>
        </fieldset>
      )}
    </div>
  );
}

function ClientErrorReporter() {
  useEffect(() => {
    const report = (payload: Record<string, unknown>) => {
      if (window.location.pathname === '/log-client-error') return;
      fetch('/log-client-error', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    };

    const handleError = (event: ErrorEvent) => {
      report({
        type: 'error',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as {message?: string; stack?: string};
      report({
        type: 'unhandledrejection',
        message: reason?.message ?? String(event.reason),
        stack: reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
