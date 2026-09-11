// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {describe, it, expect} from 'vitest';
import worker from './worker';
import {presetOutline} from '../../app/studio/cabinet-configurator/roomOutline';
import type {Room} from '../../app/studio/cabinet-configurator/model';
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
              async all<T>() {
                return {results: db.prepare(sql).all(...values) as T[]};
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
  it('keeps drafts private and creates immutable published versions', async () => {
    const {db, env} = setup();
    db.exec(
      readFileSync(
        new URL('./migrations/0007_custom_cabinets.sql', import.meta.url),
        'utf8',
      ),
    );
    (env as typeof env & {ADMIN_TOKEN: string}).ADMIN_TOKEN = 'admin-secret';
    const definition = {
      version: 1,
      id: 'semantic-unit',
      name: 'Library vanity',
      width: 36,
      height: 34.5,
      depth: 24,
      reveal: 0.125,
      root: {id: 'root', type: 'section', sectionType: 'doors'},
    };
    const request = (method: string, body?: unknown, admin = false) =>
      worker.fetch(
        new Request('https://rooms.test/custom-cabinets', {
          method,
          headers: {
            Authorization: 'Bearer test-service',
            ...(admin ? {'X-Admin-Token': 'admin-secret'} : {}),
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
        env as any,
      );
    const draft = {
      id: 'library-vanity',
      name: 'Library vanity',
      description: 'A flexible vanity',
      tags: ['vanity'],
      status: 'draft',
      definition,
    };
    expect((await request('POST', draft)).status).toBe(403);
    expect((await request('POST', draft, true)).status).toBe(201);
    expect(await (await request('GET')).json()).toEqual([]);
    const published = {
      ...draft,
      status: 'published',
      definition: {...definition, width: 42},
    };
    const result: any = await (await request('PUT', published, true)).json();
    expect(result.version).toBe(2);
    const publicItems: any = await (await request('GET')).json();
    expect(publicItems[0]).toMatchObject({
      id: 'library-vanity',
      version: 2,
      status: 'published',
    });
    expect(
      db
        .prepare(
          'SELECT version, definition FROM custom_cabinet_versions ORDER BY version',
        )
        .all(),
    ).toHaveLength(2);
    expect(
      (
        JSON.parse(
          String(
            (
              db
                .prepare(
                  'SELECT definition FROM custom_cabinet_versions WHERE version=1',
                )
                .get() as any
            ).definition,
          ),
        ) as {width: number}
      ).width,
    ).toBe(36);
  });
  it('round-trips irregular outlines and custom wall references, rejecting invalid polygons', async () => {
    const {db, call} = setup();
    try {
      const room = {
        ...study.room,
        outline: presetOutline(study.room as Room, 'l-shape'),
      };
      const data = {
        ...study,
        room,
        openings: [
          {
            id: 'custom-door',
            kind: 'door',
            wall: 'segment-l-1',
            offset: 6,
            width: 24,
            height: 80,
          },
        ],
      };
      const saved = await call('POST', undefined, {study: data});
      expect(saved.status).toBe(201);
      const record: any = await saved.json();
      const loaded: any = await (await call('GET', record.slug)).json();
      expect(loaded.study).toEqual(data);
      expect(
        (
          await call('POST', undefined, {
            study: {
              ...data,
              room: {...room, outline: [...room.outline].reverse()},
            },
          })
        ).status,
      ).toBe(400);
    } finally {
      db.close();
    }
  });
  it('stores consenting senders only, creates private-edit snapshots, and retries idempotently', async () => {
    const {db, call, env} = setup();
    db.exec(
      readFileSync(
        new URL('./migrations/0002_sharing.sql', import.meta.url),
        'utf8',
      ),
    );
    const room: any = await (await call('POST', undefined, {study})).json();
    db.exec(
      readFileSync(
        new URL('./migrations/0003_lead_phone.sql', import.meta.url),
        'utf8',
      ),
    );
    const details = {
      ...room,
      requestId: crypto.randomUUID(),
      senderName: 'Sender',
      senderEmail: 'sender@example.com',
      recipientName: 'Recipient',
      recipientEmail: 'recipient@example.com',
      consent: false,
      senderPhone: '+1 (555) 123-4567',
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
        sender_phone: '+1 (555) 123-4567',
        consent_text: 'From Trees may contact me about my cabinet project',
      });
      expect(JSON.stringify(leads)).not.toContain('recipient@example.com');
      const publicRoom: any = await (
        await call('GET', consented.shareSlug)
      ).json();
      expect(publicRoom.study).toEqual(study);
      expect(JSON.stringify(publicRoom)).not.toContain('sender@example.com');
      expect(JSON.stringify(publicRoom)).not.toContain(details.senderPhone);
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
