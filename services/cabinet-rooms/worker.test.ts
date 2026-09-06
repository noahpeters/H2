// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {describe, it, expect} from 'vitest';
import worker from './worker';
const study = {
  version: 2,
  room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
  elements: [],
  openings: [],
  islands: [],
  selected: null,
  view: 'split',
  countertop: true,
};
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    readFileSync(
      new URL('./migrations/0001_rooms.sql', import.meta.url),
      'utf8',
    ),
  );
  const env = {
    SERVICE_TOKEN: 'test-service',
    WRITES: {limit: async () => ({success: true})},
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: any[]) {
            return {
              async first<T>() {
                return (db.prepare(sql).get(...values) ?? null) as T | null;
              },
              async run() {
                return {
                  meta: {
                    changes: Number(db.prepare(sql).run(...values).changes),
                  },
                };
              },
            };
          },
        };
      },
    },
  };
  const call = (
    method: string,
    slug?: string,
    body?: unknown,
    token = 'test-service',
  ) =>
    worker.fetch(
      new Request(`https://rooms.test/${slug ? `?slug=${slug}` : ''}`, {
        method,
        headers: {Authorization: `Bearer ${token}`},
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env as any,
    );
  return {db, call, env};
}
describe('D1 room API with SQLite migration', () => {
  it('creates, recalls, updates, forks and protects originals with edit keys and revisions', async () => {
    const {db, call} = setup();
    try {
      const response = await call('POST', undefined, {study});
      expect(response.status).toBe(201);
      const owned: any = await response.json();
      expect(owned.slug).toMatch(/^[a-f0-9]{32}$/);
      const read: any = await (await call('GET', owned.slug)).json();
      expect(read.study).toEqual(study);
      expect(read.editKey).toBeUndefined();
      const changed = {...study, room: {...study.room, width: 200}};
      expect(
        (
          await call('PUT', owned.slug, {
            study: changed,
            revision: 1,
            editKey: 'wrong',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await call('PUT', owned.slug, {
            study: changed,
            revision: 1,
            editKey: owned.editKey,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call('PUT', owned.slug, {
            study,
            revision: 1,
            editKey: owned.editKey,
          })
        ).status,
      ).toBe(409);
      const copy: any = await (
        await call('POST', undefined, {study: changed})
      ).json();
      expect(copy.slug).not.toBe(owned.slug);
      expect(
        (
          await call('PUT', owned.slug, {
            study,
            revision: 2,
            editKey: copy.editKey,
          })
        ).status,
      ).toBe(409);
      expect(
        ((await (await call('GET', owned.slug)).json()) as any).study,
      ).toEqual(changed);
    } finally {
      db.close();
    }
  });
  it('rejects malformed, oversized, unauthenticated, unknown and rate-limited requests', async () => {
    const {db, call, env} = setup();
    try {
      expect(
        (await call('GET', 'a'.repeat(32), undefined, 'wrong')).status,
      ).toBe(401);
      expect((await call('GET', 'bad')).status).toBe(400);
      expect((await call('GET', 'a'.repeat(32))).status).toBe(404);
      expect((await call('POST', undefined, {study: {}})).status).toBe(400);
      expect(
        (await call('POST', undefined, {study, padding: 'x'.repeat(210000)}))
          .status,
      ).toBe(400);
      env.WRITES.limit = async () => ({success: false});
      expect((await call('POST', undefined, {study})).status).toBe(429);
    } finally {
      db.close();
    }
  });
});
