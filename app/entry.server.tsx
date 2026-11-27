import {ServerRouter} from 'react-router';
import {isbot} from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import type {HydrogenRouterContextProvider} from '@shopify/hydrogen';
import type {EntryContext} from 'react-router';
import {getCheckoutDomain} from '~/lib/checkoutDomain';
import {createStorefrontContentSecurityPolicy} from '~/lib/contentSecurityPolicy';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: HydrogenRouterContextProvider,
) {
  const rootData = reactRouterContext.staticHandlerContext.loaderData.root as
    | {consent?: {checkoutDomain?: string}}
    | undefined;
  const {nonce, header, NonceProvider} = createStorefrontContentSecurityPolicy({
    requestUrl: request.url,
    checkoutDomain:
      rootData?.consent?.checkoutDomain || getCheckoutDomain(context.env),
    storeDomain: context.env.PUBLIC_STORE_DOMAIN,
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
  responseHeaders.set('Content-Security-Policy', header);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
