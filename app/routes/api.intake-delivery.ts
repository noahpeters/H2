import type {ActionFunctionArgs} from 'react-router';
import {
  ftopsEvent,
  resendEvent,
  validIntake,
  type StoredIntake,
} from '~/lib/intake/protocol';
import {
  jsonResponse,
  readLimited,
} from '~/studio/cabinet-configurator/savedRoomProtocol';

export const loader = () => jsonResponse({error: 'Method not allowed'}, 405);
/** Authenticated outbox delivery. Provider credentials stay in Oxygen. */
export async function action({request, context}: ActionFunctionArgs) {
  const env = context.env as unknown as Record<string, string | undefined>;
  if (
    !env.CABINET_ROOMS_TOKEN ||
    request.headers.get('Authorization') !== `Bearer ${env.CABINET_ROOMS_TOKEN}`
  )
    return jsonResponse({error: 'Unauthorized'}, 401);
  if (request.method !== 'POST') return loader();
  let body;
  try {
    body = await readLimited(request);
  } catch {
    return jsonResponse({error: 'Invalid delivery'}, 400);
  }
  if (
    !body ||
    !['resend', 'ftops'].includes(body.destination) ||
    !validIntake(body.event) ||
    typeof body.event.submittedAt !== 'string' ||
    !Number.isFinite(Date.parse(body.event.submittedAt))
  )
    return jsonResponse({error: 'Invalid delivery'}, 400);
  const destination = body.destination as 'resend' | 'ftops';
  const event = body.event as StoredIntake;
  const key =
    destination === 'resend' ? env.RESEND_API_KEY : env.FTOPS_INTAKE_TOKEN;
  const endpoint =
    destination === 'resend'
      ? 'https://api.resend.com/events/send'
      : env.FTOPS_INTAKE_URL;
  if (!key || !endpoint)
    return jsonResponse({outcome: 'not_sent', reason: 'not_configured'});
  if (
    destination === 'ftops' &&
    !/^https:\/\/[^/?#]+\/website-intake\/[^/?#]+$/.test(endpoint)
  )
    return jsonResponse({
      outcome: 'not_sent',
      reason: 'invalid_ftops_endpoint',
    });
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `inquiry-${event.submissionId}`,
      },
      body: JSON.stringify(
        destination === 'resend' ? resendEvent(event) : ftopsEvent(event),
      ),
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    // The outbox owns retry decisions; never turn an unknown provider result into a safe retry.
    const receipt = await response.json().catch(() => null);
    return jsonResponse({
      outcome: 'response',
      status: response.status,
      receipt,
    });
  } catch {
    return jsonResponse({outcome: 'ambiguous'});
  }
}
