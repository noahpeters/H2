// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {afterEach, expect, it} from 'vitest';
import worker from './worker';
import {recordEvent} from './analytics';
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  for (const name of readdirSync(new URL('./migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
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
