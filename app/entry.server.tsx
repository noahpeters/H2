import {ServerRouter} from 'react-router';
import {isbot} from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {
  createContentSecurityPolicy,
  type HydrogenRouterContextProvider,
} from '@shopify/hydrogen';
import type {EntryContext} from 'react-router';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: HydrogenRouterContextProvider,
) {
  const {nonce, header, NonceProvider} = createContentSecurityPolicy({
    shop: {
      checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN,
      storeDomain: context.env.PUBLIC_STORE_DOMAIN,
    },
  });

  const body = await renderToReadableStream(
    <NonceProvider>
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
        nonce={nonce}
      />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set(
    'Content-Security-Policy',
    patchTurnstileCsp(header, request.url, nonce),
  );

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

function addCspSource(csp: string, directive: string, source: string): string {
  const parts = csp
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  const idx = parts.findIndex((p) => p.startsWith(`${directive} `));
  if (idx === -1) {
    parts.push(`${directive} ${source}`);
    return parts.join('; ');
  }

  const tokens = parts[idx].split(/\s+/);
  if (!tokens.includes(source)) tokens.push(source);
  parts[idx] = tokens.join(' ');
  return parts.join('; ');
}

function patchTurnstileCsp(
  csp: string,
  requestUrl: string,
  nonce?: string,
): string {
  let out = csp;

  // Turnstile
  const cf = 'https://challenges.cloudflare.com';
  out = addCspSource(out, 'script-src', cf);
  out = addCspSource(out, 'frame-src', cf);
  out = addCspSource(out, 'connect-src', cf);

  // Allow Oxygen CDN scripts in production
  out = addCspSource(out, 'script-src', 'https://cdn.shopify.com');
  out = addCspSource(out, 'script-src', 'https://www.googletagmanager.com');
  out = addCspSource(out, 'script-src', 'https://embed.tawk.to');
  out = addCspSource(out, 'script-src', 'https://*.tawk.to');
  out = addCspSource(out, 'script-src', 'https://connect.facebook.net');
  out = addCspSource(out, 'script-src', 'https://cdn.jsdelivr.net');
  out = addCspSource(out, 'style-src', 'https://embed.tawk.to');
  out = addCspSource(out, 'img-src', 'https://embed.tawk.to');
  out = addCspSource(out, 'font-src', 'https://embed.tawk.to');
  out = addCspSource(out, 'style-src', 'https://*.tawk.to');
  out = addCspSource(out, 'style-src', 'https://fonts.googleapis.com');
  out = addCspSource(out, 'style-src', 'https://cdn.jsdelivr.net');
  out = addCspSource(out, 'font-src', 'https://*.tawk.to');
  out = addCspSource(out, 'font-src', 'https://fonts.gstatic.com');
  out = addCspSource(out, 'img-src', 'https://*.tawk.to');
  out = addCspSource(out, 'img-src', 'https://cdn.jsdelivr.net');
  out = addCspSource(out, 'img-src', 'https://tawk.link');
  out = addCspSource(out, 'img-src', 'https://s3.amazonaws.com');
  out = addCspSource(out, 'connect-src', 'https://www.google-analytics.com');
  out = addCspSource(out, 'connect-src', 'https://www.googletagmanager.com');
  out = addCspSource(out, 'connect-src', 'https://connect.facebook.net');
  out = addCspSource(out, 'connect-src', 'https://www.google.com');
  out = addCspSource(out, 'connect-src', 'https://www.merchant-center-analytics.goog');
  out = addCspSource(out, 'connect-src', 'https://embed.tawk.to');
  out = addCspSource(out, 'connect-src', 'https://*.tawk.to');
  out = addCspSource(out, 'connect-src', 'https://va.tawk.to');
  out = addCspSource(out, 'connect-src', 'wss://*.tawk.to');
  out = addCspSource(out, 'connect-src', 'wss://vsa1.tawk.to');
  out = addCspSource(out, 'connect-src', 'wss://vsa14.tawk.to');
  out = addCspSource(
    out,
    'connect-src',
    'https://mv-prod-1-1053047382554.us-central1.run.app',
  );
  out = addCspSource(
    out,
    'connect-src',
    'https://demo-1.conversionsapigateway.com',
  );
  out = addCspSource(out, 'frame-src', 'https://www.googletagmanager.com');
  out = addCspSource(out, 'frame-src', 'https://*.tawk.to');
  out = addCspSource(out, 'img-src', 'https://www.google.com');
  out = addCspSource(out, 'img-src', 'https://www.googleadservices.com');
  out = addCspSource(out, 'img-src', "'self'");
  out = addCspSource(out, 'img-src', 'https://cdn.shopify.com');
  out = addCspSource(out, 'img-src', 'https://www.facebook.com');
  out = addCspSource(out, 'img-src', 'https://connect.facebook.net');
  out = addCspSource(out, 'form-action', 'https://*.tawk.to');
  if (nonce) {
    out = addCspSource(out, 'script-src', `'nonce-${nonce}'`);
  }

  // DEV: allow Vite module scripts (stylex runtime etc.)
  const {hostname, protocol} = new URL(requestUrl);
  const isLocalDev =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';

  if (isLocalDev) {
    // Allow scripts served from the dev origin
    const origin = `${protocol}//${hostname}:3000`;
    out = addCspSource(out, 'script-src', origin);

    // Many dev bundles use eval/source maps; Safari/Vite often needs this
    out = addCspSource(out, 'script-src', "'unsafe-eval'");
    // Dev tools and injected scripts can be inline during HMR
    out = addCspSource(out, 'script-src', "'unsafe-inline'");

    // Websocket/HMR and module fetching
    out = addCspSource(out, 'connect-src', origin);
    out = addCspSource(out, 'connect-src', 'ws:');
    out = addCspSource(out, 'connect-src', 'wss:');
  }

  return out;
}
