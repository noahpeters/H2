import type {ActionFunctionArgs} from 'react-router';
import {isbot} from 'isbot';
import {readLimited} from '~/studio/cabinet-configurator/savedRoomProtocol';
import {
  acquisitionConfig,
  acquisitionCookie,
  deliverAcquisition,
  experience,
  privacyOptOut,
} from '~/lib/acquisition/acquisition.server';
import {browserEvent} from '~/lib/acquisition/protocol';

export async function action({request, context}: ActionFunctionArgs) {
  const env = context.env;
  const origin = new URL(request.url).origin;
  if (!acquisitionConfig(env)) return new Response(null, {status: 503});
  if (request.method !== 'POST') return new Response(null, {status: 405});
  if (request.headers.get('Origin') !== origin)
    return new Response(null, {status: 403});
  if (isbot(request.headers.get('User-Agent') || ''))
    return new Response(null, {status: 204});
  const respond = (status: number, cookie?: string) =>
    new Response(null, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(cookie ? {'Set-Cookie': cookie} : {}),
      },
    });
  if (privacyOptOut(request)) return respond(204, await acquisitionCookie(env));
  let input: unknown;
  try {
    input = await readLimited(request);
  } catch {
    return respond(400);
  }
  if (!input || typeof input !== 'object' || !('analytics' in input))
    return respond(400);
  if (input.analytics === false)
    return respond(204, await acquisitionCookie(env));
  if (input.analytics !== true || !('event' in input)) return respond(400);
  const event = browserEvent(
    input.event,
    'marketing' in input && input.marketing === true,
  );
  if (!event) return respond(400);
  const result = await deliverAcquisition(
    {...experience(env, origin, event.path), ...event},
    env,
    request.headers.get('oxygen-buyer-ip') || 'unknown',
  );
  if (!result.ok) return respond(result.status === 429 ? 429 : 503);
  // A delayed retry should never overwrite the cookie for the current session.
  const refresh = 'refresh' in input && input.refresh === true;
  return respond(
    204,
    refresh ? await acquisitionCookie(env, event, event.occurredAt) : undefined,
  );
}
