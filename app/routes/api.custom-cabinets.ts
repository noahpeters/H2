import type {Route} from './+types/api.custom-cabinets';
import {jsonResponse} from '~/studio/cabinet-configurator/savedRoomProtocol';

export async function loader({context}: Route.LoaderArgs) {
  const env = context.env as unknown as {
    CABINET_ROOMS_URL?: string;
    CABINET_ROOMS_TOKEN?: string;
  };
  if (!env.CABINET_ROOMS_URL || !env.CABINET_ROOMS_TOKEN)
    return jsonResponse([], 200);
  try {
    const target = new URL('/custom-cabinets', env.CABINET_ROOMS_URL);
    const response = await fetch(target, {
      headers: {Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`},
      signal: AbortSignal.timeout(15000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch {
    return jsonResponse([], 503);
  }
}
