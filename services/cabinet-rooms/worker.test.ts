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
    SHARES: {limit: async () => ({success: true})},
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
  it('stores consenting senders only, creates private-edit snapshots, and retries idempotently', async () => {
    const {db, call, env} = setup();
    db.exec(
      readFileSync(
        new URL('./migrations/0002_sharing.sql', import.meta.url),
        'utf8',
      ),
    );
    const room: any = await (await call('POST', undefined, {study})).json();
    const details = {
      ...room,
      requestId: crypto.randomUUID(),
      senderName: 'Sender',
      senderEmail: 'sender@example.com',
      recipientName: 'Recipient',
      recipientEmail: 'recipient@example.com',
      consent: false,
    };
    const share = (body: unknown) =>
      worker.fetch(
        new Request('https://rooms.test/share', {
          method: 'POST',
          headers: {Authorization: 'Bearer test-service'},
          body: JSON.stringify(body),
        }),
        env as unknown as Parameters<typeof worker.fetch>[1],
      );
    try {
      expect((await share({...details, editKey: 'wrong'})).status).toBe(409);
      const first: any = await (await share(details)).json();
      expect(first.shareSlug).toMatch(/^[a-f0-9]{32}$/);
      expect(await (await share(details)).json()).toEqual(first);
      expect(db.prepare('SELECT * FROM cabinet_leads').all()).toHaveLength(0);
      const consented: any = await (
        await share({...details, requestId: crypto.randomUUID(), consent: true})
      ).json();
      const leads = db.prepare('SELECT * FROM cabinet_leads').all();
      expect(leads).toHaveLength(1);
      expect(leads[0]).toMatchObject({
        sender_email: 'sender@example.com',
        consent_text: 'From Trees may contact me about my cabinet project',
      });
      expect(JSON.stringify(leads)).not.toContain('recipient@example.com');
      const publicRoom: any = await (
        await call('GET', consented.shareSlug)
      ).json();
      expect(publicRoom.study).toEqual(study);
      expect(JSON.stringify(publicRoom)).not.toContain('sender@example.com');
      expect((await share({...details, consent: true})).status).toBe(409);
      env.SHARES.limit = async () => ({success: false});
      expect((await share(details)).status).toBe(429);
    } finally {
      db.close();
    }
  });
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
