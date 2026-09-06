import type {Route} from './+types/api.cabinet-rooms';
import {
  jsonResponse,
  readLimited,
  SLUG,
} from '~/studio/cabinet-configurator/savedRoomProtocol';
async function proxy({request, context}: Route.LoaderArgs | Route.ActionArgs) {
  const env = context.env as unknown as {
    CABINET_ROOMS_URL?: string;
    CABINET_ROOMS_TOKEN?: string;
  };
  if (!env.CABINET_ROOMS_URL || !env.CABINET_ROOMS_TOKEN)
    return jsonResponse(
      {
        error:
          'Cloud saving is not configured yet. Your local layout is retained.',
      },
      503,
    );
  if (!['GET', 'POST', 'PUT'].includes(request.method))
    return jsonResponse({error: 'Method not allowed'}, 405);
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin)
    return jsonResponse({error: 'Invalid origin'}, 403);
  const slug = url.searchParams.get('slug');
  if (slug && !SLUG.test(slug))
    return jsonResponse({error: 'Invalid room link'}, 400);
  const target = new URL(env.CABINET_ROOMS_URL);
  target.search = slug ? `?slug=${slug}` : '';
  try {
    const body =
      request.method === 'GET'
        ? undefined
        : JSON.stringify(await readLimited(request));
    const response = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Client-IP': request.headers.get('oxygen-buyer-ip') || 'unknown',
      },
      body,
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
    return jsonResponse(
      {error: 'Cloud saving is unavailable. Please retry.'},
      503,
    );
  }
}
export const loader = proxy;
export const action = proxy;
