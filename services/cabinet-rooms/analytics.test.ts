// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {afterEach, expect, it} from 'vitest';
import worker from './worker';
import {recordEvent} from './analytics';
import {drainAcquisition} from './acquisitionDelivery';
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup(includeAcquisitionDelivery = true) {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  for (const name of readdirSync(new URL('./migrations/', import.meta.url))
    .filter(
      (name) =>
        name.endsWith('.sql') &&
        name !== '0010_cabinitron_cutover.sql' &&
        (includeAcquisitionDelivery ||
          name !== '0012_acquisition_delivery.sql'),
    )
    .sort())
    db.exec(
      readFileSync(new URL(`./migrations/${name}`, import.meta.url), 'utf8'),
    );
  const env = {
    SERVICE_TOKEN: 'write-token',
    ANALYTICS_READ_TOKEN: 'read-token',
    WRITES: {limit: async () => ({success: true})},
    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            args = values;
            return this;
          },
          async first<T>() {
            return (db.prepare(sql).get(...(args as any[])) ||
              null) as T | null;
          },
          async all<T>() {
            return {results: db.prepare(sql).all(...(args as any[])) as T[]};
          },
          async run() {
            return {
              meta: {
                changes: Number(
                  db.prepare(sql).run(...(args as any[])).changes,
                ),
              },
            };
          },
        };
      },
    },
  };
  const call = (path: string, token = 'read-token', body?: unknown) =>
    worker.fetch(
      new Request(`https://rooms.test${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {Authorization: `Bearer ${token}`},
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );
  return {db, env, call};
}
it('keeps reporting private and its token read-only', async () => {
  const {call} = setup();
  expect((await call('/admin/dashboard', 'write-token')).status).toBe(401);
  expect((await call('/admin/dashboard', 'wrong')).status).toBe(401);
  expect((await call('/', 'read-token', {})).status).toBe(401);
  expect((await call('/admin/dashboard', 'read-token', {})).status).toBe(405);
  expect((await call('/admin/dashboard?days=100000')).status).toBe(400);
  expect((await call('/admin/dashboard?page=-1')).status).toBe(400);
});
it('deduplicates visits and outcomes, reports real records, and excludes share snapshots from the gallery', async () => {
  const {call, env, db} = setup();
  const id = 'a'.repeat(32),
    slug = 'b'.repeat(32),
    snapshot = 'c'.repeat(32),
    now = new Date().toISOString();
  const visit = {
    sessionId: id,
    source: 'instagram',
    medium: 'paid_social',
    campaign: 'cabinet-launch',
  };
  await call('/analytics/visit', 'write-token', visit);
  await call('/analytics/visit', 'write-token', visit);
  const data = JSON.stringify({
    room: {width: 144, depth: 120},
    elements: [
      {
        kind: 'base',
        width: 30,
        depth: 24,
        placement: {mode: 'floor', x: 15, z: 12, rotation: 0},
      },
    ],
  });
  for (const s of [slug, snapshot])
    db.prepare('INSERT INTO rooms VALUES (?,?,?,?,?)').run(
      s,
      'secret-hash',
      data,
      1,
      now,
    );
  db.prepare('INSERT INTO room_shares VALUES (?,?,?,?)').run(
    'share1',
    'hash',
    snapshot,
    now,
  );
  for (const request of ['share1', 'share2'])
    db.prepare(
      'INSERT INTO cabinet_leads (request_id,sender_name,sender_email,room_slug,consent_text,consent_version,consent_at,lead_source) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      request,
      'Test person',
      'test@example.com',
      snapshot,
      'yes',
      'v1',
      now,
      'share',
    );
  await recordEvent(env.DB, 'share', 'share1', id, snapshot);
  await recordEvent(env.DB, 'lead', 'share1', id, snapshot);
  await recordEvent(env.DB, 'lead', 'share1', id, snapshot);
  const report = (await (await call('/admin/dashboard')).json()) as any;
  expect(report.totals).toMatchObject({
    visits: 1,
    shares: 1,
    emails: 0,
    leads: 1,
    leadSubmissions: 2,
    convertedVisits: 1,
  });
  expect(report.sources).toEqual([
    {
      source: 'instagram',
      medium: 'paid_social',
      campaign: 'cabinet-launch',
      visits: 1,
      shares: 1,
      convertedVisits: 1,
    },
  ]);
  expect(report.designs.map((d: any) => d.slug)).toEqual([slug]);
  expect(JSON.stringify(report.designs)).not.toContain('secret-hash');
  expect(report.trackingStartedAt).toBeTruthy();
  await call('/analytics/email', 'write-token', {
    requestId: 'share1',
    analyticsSessionId: id,
  });
  await call('/analytics/email', 'write-token', {
    requestId: 'share1',
    analyticsSessionId: id,
  });
  expect(
    ((await (await call('/admin/dashboard')).json()) as any).totals.emails,
  ).toBe(1);
  const detail = (await (
    await call(`/admin/design?slug=${slug}`)
  ).json()) as any;
  expect(detail.preview.elements).toHaveLength(1);
  expect(detail).not.toHaveProperty('data');
});
it('rejects malformed visits and reports empty results without inventing history', async () => {
  const {call} = setup();
  expect(
    (await call('/analytics/visit', 'write-token', {sessionId: 'bad'})).status,
  ).toBe(400);
  const report = (await (await call('/admin/dashboard')).json()) as any;
  expect(report.totals.visits).toBe(0);
  expect(report.designs).toEqual([]);
  expect(report.sources).toEqual([]);
  expect((await call('/admin/design?slug=' + 'd'.repeat(32))).status).toBe(404);
});

it('exports only the requested saved revision with the separate read token', async () => {
  const {db, call} = setup();
  const slug = 'e'.repeat(32);
  const data = JSON.stringify({
    version: 2,
    countertop: true,
    view: 'split',
    openings: [],
    islands: [],
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    elements: [
      {
        id: 'base',
        kind: 'base',
        width: 30,
        height: 34.5,
        depth: 24,
        face: 'shaker',
        configuration: 'three-drawer',
        placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
      },
    ],
  });
  db.prepare('INSERT INTO rooms VALUES (?,?,?,?,?)').run(
    slug,
    'secret-hash',
    data,
    4,
    new Date().toISOString(),
  );
  const path = `/admin/export?slug=${slug}&revision=4`;
  expect((await call(path, 'write-token')).status).toBe(401);
  expect((await call(path, 'wrong')).status).toBe(401);
  expect((await call(path, 'read-token', {})).status).toBe(405);
  expect((await call(`/admin/export?slug=${slug}`)).status).toBe(400);
  expect((await call(`/admin/export?slug=${slug}&revision=3`)).status).toBe(
    409,
  );
  expect((await call(path + '&dadoDepth=0.75')).status).toBe(400);
  const response = await call(path);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = (await response.json()) as any;
  expect(body.manifest.design.revision).toBe(4);
  expect(body.manifest.parts.length).toBeGreaterThan(30);
  expect(body).not.toHaveProperty('ruby');
  expect(JSON.stringify(body)).not.toContain('secret-hash');
  expect(
    db.prepare('SELECT data FROM rooms WHERE slug=?').get(slug)?.data,
  ).toBe(data);
  expect(
    (await call(`/admin/export?slug=${'f'.repeat(32)}&revision=1`)).status,
  ).toBe(404);
  db.prepare('UPDATE rooms SET data=? WHERE slug=?').run(
    data.replace('three-drawer', 'corner'),
    slug,
  );
  expect((await call(path)).status).toBe(200);
});

it('reports only aggregate production acquisition data within the requested window', async () => {
  const {call, db} = setup();
  const insert = db.prepare(
    'INSERT INTO acquisition_events VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const time = '2026-11-27T09:00:00.000Z';
  const write = (
    id: string,
    kind: string,
    origin: string,
    extra: object,
    at = time,
  ) =>
    insert.run(
      id,
      kind,
      at,
      at,
      kind === 'arrival' ? null : 'visitor-1',
      kind === 'arrival' ? null : 'session-1',
      JSON.stringify({origin, path: '/', ...extra}),
    );
  const production = 'https://from-trees.com';
  write('1', 'arrival', production, {traffic: 'navigation'});
  write('2', 'arrival', production, {traffic: 'prefetch'});
  write('3', 'view', production, {
    attribution: {utm_source: 'newsletter', utm_campaign: 'fall'},
  });
  write('4', 'view', production, {});
  write('5', 'inquiry_accepted', production, {});
  write('6', 'view', 'https://preview.example', {});
  write('7', 'view', production, {}, '2026-11-28T08:00:00.000Z');
  const url =
    '/admin/acquisition?start=2026-11-27T08:00:00.000Z&end=2026-11-28T08:00:00.000Z';
  expect((await call(url, 'write-token')).status).toBe(401);
  expect((await call(url, 'read-token', {})).status).toBe(405);
  expect((await call('/admin/acquisition')).status).toBe(400);
  const response = await call(url);
  expect(response.status).toBe(200);
  const report = await response.json();
  expect(report).toMatchObject({
    totals: {arrivals: 1, views: 2, visitors: 1, sessions: 1, inquiries: 1},
    pages: [{path: '/', arrivals: 1}],
    campaigns: [
      {source: null, medium: null, campaign: null, views: 1},
      {source: 'newsletter', medium: null, campaign: 'fall', views: 1},
    ],
  });
  expect(JSON.stringify(report)).not.toContain('visitor-1');
});

it('backfills existing rows and retries the same immutable batch after a failed delivery', async () => {
  const {db, env} = setup(false);
  const timestamp = '2026-11-27T09:00:00.000Z';
  const payload =
    '{"path":"/","origin":"https://from-trees.com","traffic":"navigation"}';
  const insert = db.prepare(
    'INSERT INTO acquisition_events VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run('backfill', 'arrival', timestamp, timestamp, null, null, payload);
  db.exec(
    readFileSync(
      new URL('./migrations/0012_acquisition_delivery.sql', import.meta.url),
      'utf8',
    ),
  );
  insert.run('new', 'arrival', timestamp, timestamp, null, null, payload);
  const batches: unknown[] = [];
  const deliver = {
    ...env,
    FTOPS_ACQUISITION: {
      fetch: async (request: Request) => {
        expect(request.method).toBe('POST');
        expect(new URL(request.url).pathname).toBe('/h2-acquisition');
        batches.push(await request.json());
        return new Response(null, {status: batches.length === 1 ? 503 : 204});
      },
    },
  };
  await expect(drainAcquisition(deliver)).rejects.toThrow('503');
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM acquisition_delivery').get(),
  ).toEqual({count: 2});
  await drainAcquisition(deliver);
  expect(batches[0]).toEqual(batches[1]);
  expect(batches[1]).toEqual({
    events: ['backfill', 'new'].map((id) => ({
      id,
      kind: 'arrival',
      occurred_at: timestamp,
      received_at: timestamp,
      visitor_id: null,
      session_id: null,
      payload,
    })),
    caughtUp: false,
  });
  expect(batches[2]).toEqual({events: [], caughtUp: true});
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM acquisition_events').get(),
  ).toEqual({count: 2});
  expect(
    db.prepare('SELECT COUNT(*) AS count FROM acquisition_delivery').get(),
  ).toEqual({count: 0});
});
