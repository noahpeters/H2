import type {ActionFunctionArgs} from 'react-router';
import {
  jsonResponse,
  readLimited,
} from '~/studio/cabinet-configurator/savedRoomProtocol';
import {validPriceRequest} from '~/studio/cabinet-configurator/priceProtocol';
export const loader = () =>
  jsonResponse(
    {error: 'Submit the price request form to see an estimate.'},
    405,
  );
export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin)
    return jsonResponse({error: 'Invalid origin'}, 403);
  const env = context.env as unknown as Record<string, string | undefined>;
  if (
    !env.CABINET_ROOMS_URL ||
    !env.CABINET_ROOMS_TOKEN ||
    !env.TURNSTILE_SECRET_KEY
  )
    return jsonResponse({error: 'Pricing is unavailable'}, 503);
  try {
    const body = await readLimited(request);
    if (!validPriceRequest(body))
      return jsonResponse(
        {error: 'Please enter your name and a valid email address.'},
        400,
      );
    if (!body.consent) delete body.senderPhone;
    const token = (body as unknown as Record<string, unknown>).turnstileToken;
    if (typeof token !== 'string' || !token || token.length > 2048)
      return jsonResponse({error: 'Please complete verification.'}, 400);
    const check = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = (await check.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !result.success ||
      result.hostname !== url.hostname ||
      result.action !== 'cabinet-price'
    )
      return jsonResponse({error: 'Verification failed. Please retry.'}, 400);
    const response = await fetch(new URL('/quote', env.CABINET_ROOMS_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Client-IP': request.headers.get('oxygen-buyer-ip') || 'unknown',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return jsonResponse({error: 'Pricing is unavailable. Please retry.'}, 503);
  }
}
