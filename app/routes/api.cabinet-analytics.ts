import type {ActionFunctionArgs} from 'react-router';
import {isbot} from 'isbot';
import {
  jsonResponse,
  readLimited,
} from '~/studio/cabinet-configurator/savedRoomProtocol';
export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST')
    return jsonResponse({error: 'Method not allowed'}, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    return jsonResponse({error: 'Invalid origin'}, 403);
  if (isbot(request.headers.get('User-Agent') || ''))
    return jsonResponse({ok: true});
  const env = context.env as unknown as Record<string, string>;
  if (!env.CABINET_ROOMS_URL || !env.CABINET_ROOMS_TOKEN)
    return jsonResponse({error: 'Tracking unavailable'}, 503);
  try {
    const body = await readLimited(request);
    const response = await fetch(
      new URL('/analytics/visit', env.CABINET_ROOMS_URL),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Client-IP': request.headers.get('oxygen-buyer-ip') || 'unknown',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
    return jsonResponse({ok: response.ok}, response.ok ? 200 : 503);
  } catch {
    return jsonResponse({error: 'Tracking unavailable'}, 503);
  }
}
