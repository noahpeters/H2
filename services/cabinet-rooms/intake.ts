import {
  ftopsEvent,
  resendEvent,
  validIntake,
  type StoredIntake,
} from '../../app/lib/intake/protocol';
import {
  jsonResponse,
  readLimited,
} from '../../app/studio/cabinet-configurator/savedRoomProtocol';
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
}
export interface IntakeServiceEnv {
  DB: {prepare(sql: string): Statement};
  SERVICE_TOKEN?: string;
  INTAKE_DELIVERY_URL?: string;
  RESEND_API_KEY?: string;
  FTOPS_INTAKE_URL?: string;
  FTOPS_INTAKE_TOKEN?: string;
}
// Stable JSON prevents key ordering from turning an identical retry into a conflict.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export async function intake(request: Request, env: IntakeServiceEnv) {
  if (request.method !== 'POST')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const value = await readLimited(request);
  if (!validIntake(value)) return jsonResponse({error: 'Invalid intake'}, 400);
  const input = stable(value);
  const payload: StoredIntake = {
    ...value,
    submittedAt: new Date().toISOString(),
  };
  const target = ftopsEvent(payload);
  // Reject before accepting rather than silently truncate inquiry or metadata.
  if (
    target.message.length > 16000 ||
    new TextEncoder().encode(JSON.stringify(target)).length > 65536
  )
    return jsonResponse({error: 'Inquiry too large'}, 413);
  await env.DB.prepare(
    'INSERT OR IGNORE INTO intake_events(id,input,payload,created_at) VALUES (?,?,?,?)',
  )
    .bind(value.submissionId, input, JSON.stringify(payload), Date.now())
    .run();
  const stored = await env.DB.prepare(
    'SELECT input FROM intake_events WHERE id=?',
  )
    .bind(value.submissionId)
    .first<{input: string}>();
  if (stored?.input !== input)
    return jsonResponse({error: 'event_id_payload_conflict'}, 409);
  // Do not let either provider prevent acceptance after the durable commit. Cron drains the outbox.
  return jsonResponse({accepted: true, submissionId: value.submissionId}, 202);
}
type Destination = 'resend' | 'ftops';
type Delivery = {
  event_id: string;
  destination: Destination;
  attempts: number;
  payload: string;
};
export async function drainIntake(env: IntakeServiceEnv) {
  const now = Date.now();
  // A crashed Resend attempt may already have triggered an automation. Never blindly replay it.
  await env.DB.prepare(
    "UPDATE intake_deliveries SET state='review',last_error='ambiguous_interrupted_send' WHERE destination='resend' AND state='sending' AND lease_until<?",
  )
    .bind(now)
    .run();
  await env.DB.prepare(
    "UPDATE intake_deliveries SET state='pending' WHERE destination='ftops' AND state='sending' AND lease_until<?",
  )
    .bind(now)
    .run();
  const due = await env.DB.prepare(
    "SELECT d.event_id,d.destination,d.attempts,e.payload FROM intake_deliveries d JOIN intake_events e ON e.id=d.event_id WHERE d.state='pending' AND d.next_attempt<=? ORDER BY d.next_attempt,e.created_at LIMIT 20",
  )
    .bind(now)
    .all<Delivery>();
  await Promise.all(due.results.map((row) => deliver(row, env)));
  const review = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM intake_deliveries WHERE state='review'",
  )
    .bind()
    .first<{count: number}>();
  if (review?.count)
    console.error('intake_delivery_review_required', {count: review.count});
}
async function deliver(row: Delivery, env: IntakeServiceEnv) {
  const d = row.destination;
  const key = d === 'resend' ? env.RESEND_API_KEY : env.FTOPS_INTAKE_TOKEN;
  const endpoint =
    d === 'resend'
      ? 'https://api.resend.com/events/send'
      : env.FTOPS_INTAKE_URL;
  const retry = async (reason: string, review = false) => {
    const delay = Math.min(3600000, 60000 * 2 ** Math.min(row.attempts, 6));
    await env.DB.prepare(
      'UPDATE intake_deliveries SET state=?,next_attempt=?,last_error=? WHERE event_id=? AND destination=?',
    )
      .bind(
        review ? 'review' : 'pending',
        Date.now() + delay,
        reason,
        row.event_id,
        d,
      )
      .run();
    console.error('intake_delivery_failed', {
      submissionId: row.event_id,
      destination: d,
      reason,
      review,
    });
  };
  // Claim before all state mutations so overlapping scheduled invocations cannot double-send.
  const claimed = await env.DB.prepare(
    "UPDATE intake_deliveries SET state='sending',attempts=attempts+1,lease_until=? WHERE event_id=? AND destination=? AND state='pending' AND next_attempt<=? RETURNING event_id",
  )
    .bind(Date.now() + 120000, row.event_id, d, Date.now())
    .first();
  if (!claimed) return;
  const relay = env.INTAKE_DELIVERY_URL;
  if (!relay && (!key || !endpoint)) {
    await retry('not_configured');
    return;
  }
  if (
    !relay &&
    d === 'ftops' &&
    !/^https:\/\/[^/?#]+\/website-intake\/[^/?#]+$/.test(endpoint || '')
  ) {
    await retry('invalid_ftops_endpoint', true);
    return;
  }
  const event = JSON.parse(row.payload) as StoredIntake;
  let response: Response;
  try {
    if (relay) {
      if (
        !env.SERVICE_TOKEN ||
        !/^https:\/\/[^/?#]+\/api\/intake-delivery$/.test(relay)
      ) {
        await retry('invalid_delivery_relay', true);
        return;
      }
      const result = await fetch(relay, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({destination: d, event}),
        signal: AbortSignal.timeout(15000),
        redirect: 'manual',
      });
      if ([401, 403, 404, 405].includes(result.status)) {
        // Rejected before provider execution, including worker-first rollout ordering.
        await retry(`delivery_relay_unavailable:${result.status}`);
        return;
      }
      if (!result.ok) throw new Error('Unknown relay outcome');
      const envelope = (await result.json()) as {
        outcome?: string;
        reason?: string;
        status?: number;
        receipt?: unknown;
      };
      if (envelope.outcome === 'not_sent') {
        await retry(
          envelope.reason === 'invalid_ftops_endpoint'
            ? 'invalid_ftops_endpoint'
            : 'not_configured',
          envelope.reason === 'invalid_ftops_endpoint',
        );
        return;
      }
      if (
        envelope.outcome !== 'response' ||
        !Number.isInteger(envelope.status) ||
        envelope.status! < 200 ||
        envelope.status! > 599
      )
        throw new Error('Unknown relay outcome');
      response = new Response(JSON.stringify(envelope.receipt), {
        status:
          envelope.status === 204 ||
          envelope.status === 205 ||
          envelope.status === 304
            ? 502
            : envelope.status,
      });
    } else {
      response = await fetch(endpoint!, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `inquiry-${row.event_id}`,
        },
        body: JSON.stringify(
          d === 'resend' ? resendEvent(event) : ftopsEvent(event),
        ),
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });
    }
  } catch {
    await retry('network_or_timeout', d === 'resend');
    return;
  }
  if (!response.ok) {
    // ftops explicitly guarantees retry safety. Events API does not document that guarantee.
    const review =
      d === 'resend'
        ? response.status !== 429
        : !(response.status === 429 || response.status >= 500);
    await retry(`http_${response.status}`, review);
    return;
  }
  try {
    const result = (await response.json()) as {
      object?: string;
      event?: string;
      submissionId?: string;
      duplicate?: boolean;
      status?: string;
    };
    if (
      d === 'resend'
        ? result.object !== 'event' || result.event !== 'inquiry.received'
        : !result.submissionId ||
          !['linked', 'needs_review'].includes(result.status || '') ||
          typeof result.duplicate !== 'boolean'
    ) {
      await retry('invalid_receipt', d === 'resend');
      return;
    }
    await env.DB.prepare(
      "UPDATE intake_deliveries SET state='sent',last_error=NULL,receipt=? WHERE event_id=? AND destination=?",
    )
      .bind(JSON.stringify(result), row.event_id, d)
      .run();
  } catch {
    await retry('receipt_or_commit_failed', d === 'resend');
  }
}
