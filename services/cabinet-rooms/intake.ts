import {
  ftopsEvent,
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
  FTOPS_INQUIRIES?: {fetch(request: Request): Promise<Response>};
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
export async function intake(
  request: Request,
  env: IntakeServiceEnv,
  ctx?: {waitUntil(promise: Promise<unknown>): void},
) {
  if (request.method !== 'POST')
    return jsonResponse({error: 'Method not allowed'}, 405);
  const value = await readLimited(request);
  if (!validIntake(value)) return jsonResponse({error: 'Invalid intake'}, 400);
  const notificationOwner =
    request.headers.get('X-Inquiry-Notification') === 'ftops'
      ? 'ftops'
      : undefined;
  const input = stable(
    notificationOwner ? {...value, notificationOwner} : value,
  );
  const payload: StoredIntake & {notificationOwner?: string} = {
    ...value,
    notificationOwner,
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
  // A missed wake-up is harmless: FTOPS also polls for unacknowledged records.
  if (ctx && env.FTOPS_INQUIRIES)
    ctx.waitUntil(
      env.FTOPS_INQUIRIES.fetch(
        new Request('https://ftops.internal/inquiries-ready', {method: 'POST'}),
      )
        .then((response) => {
          if (!response.ok) throw Error('wake_failed');
        })
        .catch(() => console.error('inquiry_wakeup_failed')),
    );
  return jsonResponse(
    {accepted: true, submissionId: value.submissionId, notificationOwner},
    202,
  );
}
