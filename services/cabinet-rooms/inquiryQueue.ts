import {
  ftopsEvent,
  resendEvent,
  type StoredIntake,
} from '../../app/lib/intake/protocol';
import type {IntakeServiceEnv} from './intake';

type EventRow = {id: string; payload: string; destinations: string};

export async function readInquiryQueue(
  request: Request,
  env: IntakeServiceEnv,
) {
  const path = new URL(request.url).pathname;
  if (path === '/pending' && request.method === 'GET') {
    const now = Date.now();
    const rows = await env.DB.prepare(
      `SELECT e.id,e.payload,
     json_group_array(json_object('kind',d.destination,'state',d.state,'attempts',d.attempts,'nextAttempt',d.next_attempt)) AS destinations
     FROM intake_events e JOIN intake_deliveries d ON d.event_id=e.id
     WHERE d.state IN ('pending','sending') AND NOT EXISTS(SELECT 1 FROM inquiry_transfers t WHERE t.event_id=e.id)
     AND NOT EXISTS(SELECT 1 FROM intake_deliveries busy WHERE busy.event_id=e.id AND busy.state='sending' AND busy.lease_until>?)
     GROUP BY e.id ORDER BY e.created_at,e.id LIMIT 8`,
    )
      .bind(now)
      .all<EventRow>();
    return Response.json(
      rows.results.map((row) => {
        const event = JSON.parse(row.payload) as StoredIntake & {
          notificationOwner?: string;
        };
        return {
          id: row.id,
          notifyStaff: event.notificationOwner === 'ftops',
          intake: ftopsEvent(event),
          acknowledgement: resendEvent(event),
          destinations: JSON.parse(row.destinations),
        };
      }),
    );
  }
  if (path === '/received' && request.method === 'POST') {
    const {id} = (await request.json()) as {id?: string};
    if (typeof id !== 'string')
      return Response.json({error: 'Invalid receipt'}, {status: 400});
    await env.DB.prepare(
      'INSERT OR IGNORE INTO inquiry_transfers SELECT id,? FROM intake_events WHERE id=?',
    )
      .bind(Date.now(), id)
      .run();
    return Response.json({received: true});
  }
  return new Response(null, {status: 404});
}
