type Statement = {
  bind(...values: unknown[]): Statement;
  all<T>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
};

type DeliveryEnv = {
  DB: {prepare(sql: string): Statement};
  FTOPS_ACQUISITION?: {fetch(request: Request): Promise<Response>};
};

type QueuedEvent = {
  sequence: number;
  id: string;
  kind: string;
  occurred_at: string;
  received_at: string;
  visitor_id: string | null;
  session_id: string | null;
  payload: string;
};

// Each batch is committed atomically by the receiving Worker. The deadline
// leaves room for the next one-minute cron to continue the backfill.
export async function drainAcquisition(env: DeliveryEnv) {
  if (!env.FTOPS_ACQUISITION) return;
  const deadline = Date.now() + 50_000;
  while (Date.now() < deadline) {
    const {results} = await env.DB.prepare(
      `SELECT d.sequence, e.id, e.kind, e.occurred_at, e.received_at,
              e.visitor_id, e.session_id, e.payload
       FROM acquisition_delivery d
       JOIN acquisition_events e ON e.kind = d.kind AND e.id = d.event_id
       ORDER BY d.sequence LIMIT 50`,
    ).all<QueuedEvent>();
    const last = results.at(-1);
    const response = await env.FTOPS_ACQUISITION.fetch(
      new Request('https://ftops.internal/h2-acquisition', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          events: results.map(({sequence: _sequence, ...event}) => event),
          caughtUp: !last,
        }),
      }),
    );
    if (response.status !== 204)
      throw new Error(`FTOPS acquisition delivery returned ${response.status}`);
    if (!last) return;
    await env.DB.prepare('DELETE FROM acquisition_delivery WHERE sequence <= ?')
      .bind(last.sequence)
      .run();
  }
}
