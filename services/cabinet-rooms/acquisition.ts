import type {AcquisitionEvent} from '../../app/lib/acquisition/protocol';
import {readLimited} from '../../app/studio/cabinet-configurator/savedRoomProtocol';

type Statement = {
  bind(...values: unknown[]): Statement;
  run(): Promise<unknown>;
};

export async function recordAcquisition(
  request: Request,
  db: {prepare(sql: string): Statement},
) {
  if (request.method !== 'POST') return new Response(null, {status: 405});
  // This route is reachable only through the existing authenticated H2 service contract.
  const event = (await readLimited(request)) as AcquisitionEvent;
  await db
    .prepare(
      'INSERT INTO acquisition_events (id, kind, occurred_at, received_at, visitor_id, session_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO NOTHING',
    )
    .bind(
      event.id,
      event.kind,
      event.occurredAt,
      new Date().toISOString(),
      'visitorId' in event ? event.visitorId : null,
      'sessionId' in event ? event.sessionId : null,
      JSON.stringify(event),
    )
    .run();
  return new Response(null, {status: 204});
}
