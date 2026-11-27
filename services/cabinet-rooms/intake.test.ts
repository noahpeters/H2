// @vitest-environment node
import type {
  AcquisitionEvent,
  Identity,
} from '../../app/lib/acquisition/protocol';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import worker from './worker';
import {drainIntake} from './intake';
import {captureArrival} from '../../app/lib/acquisition/acquisition.server';
import {action as acquisition} from '../../app/routes/api.acquisition';
import {acceptIntake} from '../../app/lib/intake/intake.server';
import {
  ftopsEvent,
  MARKETING_DISCLOSURE,
  MARKETING_VERSION,
  resendEvent,
  type Intake,
} from '../../app/lib/intake/protocol';
import {action as contact} from '../../app/routes/contact';
import {action as inquiry} from '../../app/routes/inquire.$kind';
import {action as price} from '../../app/routes/api.cabinet-price';
import {action as share} from '../../app/routes/api.cabinet-share';
const sendEmail = vi.hoisted(() =>
  vi.fn(async () => ({data: {id: 'test-share-email'}, error: null})),
);
vi.mock('resend', () => ({
  Resend: class {
    emails = {send: sendEmail};
  },
}));
export const sample: Intake = {
  submissionId: '12345678-1234-4234-8234-123456789012',
  name: 'H2 TEST ONLY',
  email: 'test@example.invalid',
  phone: '',
  projectType: 'Custom furniture',
  location: 'Riverside',
  timeline: '6–12 months',
  budget: 'Not decided',
  message: 'H2 TEST ONLY. Table study.',
  sourcePath: '/configurator',
  sourceKind: 'table_study',
  configuratorSource: 'table',
  utm: {
    utm_source: 'test',
    utm_medium: 'e2e',
    utm_campaign: 'intake',
    utm_content: 'control',
    utm_term: 'table',
  },
  marketingConsent: 'not_provided',
  marketingVersion: MARKETING_VERSION,
  marketingDisclosure: MARKETING_DISCLOSURE,
  details: {studySummary: 'Test study'},
};
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    readFileSync(
      new URL('./migrations/0009_intake_outbox.sql', import.meta.url),
      'utf8',
    ),
  );
  db.exec(
    readFileSync(
      new URL('./migrations/0011_acquisition.sql', import.meta.url),
      'utf8',
    ),
  );
  const env = {
    WRITES: {limit: async () => ({success: true})},
    SERVICE_TOKEN: 'test',
    RESEND_API_KEY: 'test',
    CONTACT_TO_EMAIL: 'owner@example.invalid',
    CONTACT_FROM_EMAIL: 'sender@example.invalid',
    FTOPS_INTAKE_URL: 'https://ftops.test/website-intake/test',
    FTOPS_INTAKE_TOKEN: 'test-integration',
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: any[]) {
            return {
              async run() {
                return {
                  meta: {
                    changes: Number(db.prepare(sql).run(...values).changes),
                  },
                };
              },
              async first<T>() {
                return (db.prepare(sql).get(...values) ?? null) as T | null;
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
  const call = (body: unknown, token = 'test') =>
    worker.fetch(
      new Request('https://rooms.test/intake', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      env as any,
    );
  const status = () =>
    db
      .prepare(
        'SELECT destination,state,attempts,last_error FROM intake_deliveries ORDER BY destination',
      )
      .all();
  const events: any[] = [];
  const ownerEmails: any[] = [];
  const intakes = new Map<string, any>();
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/siteverify'))
        return Response.json({
          success: true,
          hostname: 'from-trees.com',
          action: new URLSearchParams(init?.body as string).get('response'),
        });
      if (url === 'https://rooms.test/analytics/acquisition')
        return worker.fetch(new Request(url, init), env as any);
      if (url === 'https://rooms.test/intake')
        return call(JSON.parse(init?.body as string));
      if (url === 'https://rooms.test/quote')
        return Response.json({range: {low: 5000, high: 6000}});
      if (url === 'https://rooms.test/share')
        return Response.json({shareSlug: 'b'.repeat(32)});
      if (url === 'https://rooms.test/analytics/email')
        return Response.json({ok: true});
      const body = JSON.parse(init?.body as string) as any;
      if (url === 'https://api.resend.com/emails') {
        ownerEmails.push(body);
        return Response.json({id: 'test-owner-email'});
      }
      if (url === 'https://api.resend.com/events/send') {
        events.push(body);
        return Response.json({object: 'event', event: body.event});
      }
      if (url === env.FTOPS_INTAKE_URL) {
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer test-integration',
        );
        const old = intakes.get(body.externalEventId);
        if (old && JSON.stringify(old) !== JSON.stringify(body))
          return Response.json(
            {error: 'event_id_payload_conflict'},
            {status: 409},
          );
        intakes.set(body.externalEventId, body);
        return Response.json(
          {
            submissionId: 'test-ftops-receipt',
            status: 'linked',
            duplicate: !!old,
          },
          {status: old ? 200 : 201},
        );
      }
      throw new Error(`Unexpected network: ${url}`);
    },
  );
  vi.stubGlobal('fetch', fetcher);
  return {db, env, call, status, events, ownerEmails, intakes, fetcher};
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('durable intake and delivery', () => {
  it('authenticates, rejects oversized evidence and refuses revocation before writing', async () => {
    const {call, db} = setup();
    expect((await call(sample, 'wrong')).status).toBe(401);
    expect((await call({...sample, marketingConsent: 'revoked'})).status).toBe(
      400,
    );
    expect(
      (await call({...sample, details: {huge: 'x'.repeat(17000)}})).status,
    ).toBe(413);
    expect(db.prepare('SELECT * FROM intake_events').all()).toHaveLength(0);
  });
  it('atomically stores both deliveries, reuses timestamps, rejects changed values and suppresses concurrent duplicates', async () => {
    const {call, db, env, events, intakes, status} = setup();
    expect((await call(sample)).status).toBe(202);
    const original = db.prepare('SELECT payload FROM intake_events').get();
    expect((await call({...sample})).status).toBe(202);
    expect((await call({...sample, message: 'Changed'})).status).toBe(409);
    expect(db.prepare('SELECT payload FROM intake_events').get()).toEqual(
      original,
    );
    expect(status()).toHaveLength(2);
    await Promise.all([drainIntake(env as any), drainIntake(env as any)]);
    await call(sample);
    await drainIntake(env as any);
    expect(events).toHaveLength(1);
    expect(intakes.size).toBe(1);
    expect(status().every((row) => row.state === 'sent')).toBe(true);
  });
  it('retains ftops failure after Resend success and retries identical evidence without resending the event', async () => {
    const {call, env, db, fetcher, events, intakes} = setup();
    await call(sample);
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) =>
      String(url) === env.FTOPS_INTAKE_URL
        ? Response.json({error: 'temporary'}, {status: 503})
        : normal(url, init),
    );
    await drainIntake(env as any);
    expect(events).toHaveLength(1);
    expect(intakes.size).toBe(0);
    expect(
      db
        .prepare(
          "SELECT state FROM intake_deliveries WHERE destination='ftops'",
        )
        .get()?.state,
    ).toBe('pending');
    fetcher.mockImplementation(normal);
    db.exec('UPDATE intake_deliveries SET next_attempt=0');
    await drainIntake(env as any);
    expect(events).toHaveLength(1);
    expect(intakes.size).toBe(1);
  });
  it('deduplicates a ftops committed-but-lost response and recovers an interrupted lease', async () => {
    const {call, env, db, fetcher, intakes, events} = setup();
    await call(sample);
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) => {
      const r = await normal(url, init);
      if (String(url) === env.FTOPS_INTAKE_URL)
        throw new Error('lost response');
      return r;
    });
    await drainIntake(env as any);
    fetcher.mockImplementation(normal);
    db.exec(
      "UPDATE intake_deliveries SET state='sending',lease_until=0,next_attempt=0 WHERE destination='ftops'",
    );
    await drainIntake(env as any);
    expect(intakes.size).toBe(1);
    expect(events).toHaveLength(1);
    expect(
      (
        JSON.parse(
          String(
            db
              .prepare(
                "SELECT receipt FROM intake_deliveries WHERE destination='ftops'",
              )
              .get()?.receipt,
          ),
        ) as any
      ).duplicate,
    ).toBe(true);
  });
  it('isolates Resend 429, retries it once, and preserves successful ftops delivery', async () => {
    const {call, env, db, fetcher, intakes, events} = setup();
    await call(sample);
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) =>
      String(url).includes('resend.com')
        ? Response.json({}, {status: 429})
        : normal(url, init),
    );
    await drainIntake(env as any);
    expect(intakes.size).toBe(1);
    expect(events).toHaveLength(0);
    db.exec('UPDATE intake_deliveries SET next_attempt=0');
    fetcher.mockImplementation(normal);
    await drainIntake(env as any);
    expect(intakes.size).toBe(1);
    expect(events).toHaveLength(1);
  });
  it('holds ambiguous Resend sends for review instead of risking duplicate acknowledgements', async () => {
    const {call, env, fetcher, events, intakes, status} = setup();
    await call(sample);
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) => {
      const r = await normal(url, init);
      if (String(url).includes('resend.com')) throw new Error('lost response');
      return r;
    });
    await drainIntake(env as any);
    await drainIntake(env as any);
    expect(events).toHaveLength(1);
    expect(intakes.size).toBe(1);
    expect(status().find((r) => r.destination === 'resend')?.state).toBe(
      'review',
    );
  });
  it('does not accept or deliver anything if durable persistence fails', async () => {
    const {call, db, events, intakes} = setup();
    db.exec('DROP TABLE intake_events');
    expect((await call(sample)).ok).toBe(false);
    expect(events).toHaveLength(0);
    expect(intakes.size).toBe(0);
  });
});

const paths = [
  '/contact',
  '/inquire/furniture',
  '/inquire/cabinetry',
  '/inquire/designers',
  '/configurator',
  '/cabinet-configurator',
  '/api/cabinet-price',
  '/api/cabinet-share',
];
describe.each(paths)('real Oxygen route → provider APIs: %s', (path) => {
  it.each(['granted', 'not_provided'] as const)(
    'sends one event and intake with %s consent',
    async (consent) => {
      const {env, events, ownerEmails, intakes} = setup();
      const metaAttribution = {
        fbclid: 'click_123',
        fbc: 'fb.1.1791130000000.click_123',
        fbp: 'fb.1.1791130000000.123456',
      };
      const context = {
        env: {
          CABINET_ROOMS_URL: 'https://rooms.test',
          CABINET_ROOMS_TOKEN: 'test',
          TURNSTILE_SECRET_KEY: 'test',
          RESEND_API_KEY: 'test',
          FTOPS_INTAKE_URL: env.FTOPS_INTAKE_URL,
          FTOPS_INTAKE_TOKEN: env.FTOPS_INTAKE_TOKEN,
          CONTACT_FROM_EMAIL: 'test@example.invalid',
          CONTACT_TO_EMAIL: 'owner@example.invalid',
        },
        session: {set: vi.fn()},
      };
      const query =
        '?utm_source=test&utm_medium=e2e&utm_campaign=intake&utm_content=control&utm_term=table';
      const args = () => {
        if (path.startsWith('/api/'))
          return {
            request: new Request(`https://from-trees.com${path}`, {
              method: 'POST',
              headers: {
                Origin: 'https://from-trees.com',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                requestId: sample.submissionId,
                senderName: sample.name,
                senderEmail: sample.email,
                senderPhone: '5555555555',
                recipientName: 'Test recipient',
                recipientEmail: 'recipient@example.invalid',
                consent: false,
                marketingConsent: consent,
                sourceQuery: query,
                metaAttribution,
                slug: 'a'.repeat(32),
                editKey: 'NEVER_FORWARD',
                revision: 1,
                turnstileToken: path.endsWith('price')
                  ? 'cabinet-price'
                  : 'cabinet-share',
              }),
            }),
            context,
            params: {},
          } as any;
        const source =
          path === '/configurator'
            ? 'table'
            : path === '/cabinet-configurator'
              ? 'cabinet'
              : '';
        const form = new FormData();
        Object.entries({
          submissionId: sample.submissionId,
          name: sample.name,
          email: sample.email,
          projectType: sample.projectType,
          location: sample.location,
          message: sample.message,
          marketingConsent: consent,
          configuratorSource: source,
          sourceQuery: query,
          metaAttribution: JSON.stringify(metaAttribution),
          studySummary: source ? 'Full original study' : '',
          'cf-turnstile-response': 'test',
        }).forEach(([k, v]) => form.set(k, v));
        return {
          request: new Request(
            `https://from-trees.com${source ? '/contact' : path}${query}`,
            {method: 'POST', body: form},
          ),
          context,
          params: {kind: path.split('/').pop()},
        } as any;
      };
      const route = path.endsWith('price')
        ? price
        : path.endsWith('share')
          ? share
          : path.startsWith('/inquire/')
            ? inquiry
            : contact;
      for (let i = 0; i < 1; i++) {
        const result = await route(args());
        if (result instanceof Response)
          expect(result.status).toBe(path.startsWith('/inquire/') ? 303 : 200);
        else expect(result).toMatchObject({ok: true});
      }
      expect(events).toHaveLength(1);
      expect(ownerEmails).toHaveLength(1);
      expect(ownerEmails[0]).toMatchObject({
        to: 'owner@example.invalid',
        reply_to: sample.email,
      });
      expect(intakes.size).toBe(1);
      const event = events[0];
      const intake = [...intakes.values()][0];
      expect(event.email).toBe(sample.email);
      expect(event.payload.submission_id).toBe(sample.submissionId);
      expect(event.payload.marketing_email_consent).toBe(consent);
      expect(event.payload.utm_source).toBe('test');
      expect(event.payload.utm_content).toBe('control');
      expect(intake.marketingConsent).toEqual({
        state: consent,
        disclosureVersion: MARKETING_VERSION,
        capturedAt: event.payload.submitted_at,
      });
      expect(intake.externalEventId).toBe(sample.submissionId);
      expect(intake.metaAttribution).toEqual(metaAttribution);
      expect(Object.keys(intake).sort()).toEqual(
        [
          'externalEventId',
          'metaAttribution',
          'email',
          'name',
          'phone',
          'projectType',
          'location',
          'timeline',
          'budget',
          'sourcePath',
          'message',
          'marketingConsent',
        ].sort(),
      );
      const metadata = JSON.parse(intake.message) as any;
      expect(metadata.marketing_disclosure).toBe(MARKETING_DISCLOSURE);
      expect(metadata.utm_term).toBe('table');
      expect(JSON.stringify(intake)).not.toContain('NEVER_FORWARD');
      expect(JSON.stringify(intake)).not.toContain('recipient@example.invalid');
    },
  );
});
it('builds the agreed flat Resend fields plus the live template email binding and a compatible ftops envelope', () => {
  const stored = {...sample, submittedAt: '2026-09-22T10:00:00.000Z'};
  expect(Object.keys(resendEvent(stored).payload).sort()).toEqual(
    'submission_id submitted_at name customer_email phone project_type project_location timeline budget message source_path source_kind configurator_source utm_source utm_medium utm_campaign utm_content utm_term marketing_email_consent marketing_consent_version'
      .split(' ')
      .sort(),
  );
  expect((JSON.parse(ftopsEvent(stored).message) as any).details).toEqual(
    sample.details,
  );
});

describe('direct Oxygen intake delivery', () => {
  it.each([401, 429, 500, 503, 302])(
    'logs ftops %s without failing the accepted submission',
    async (status) => {
      const {env, fetcher, events} = setup();
      const normal = fetcher.getMockImplementation()!;
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetcher.mockImplementation(async (url, init) =>
        String(url) === env.FTOPS_INTAKE_URL
          ? new Response('', {status})
          : normal(url, init),
      );
      await expect(acceptIntake(sample, env)).resolves.toBeUndefined();
      expect(events).toHaveLength(1);
      expect(log).toHaveBeenCalledWith('ftops_intake_failed', {
        submissionId: sample.submissionId,
        reason: `http_${status}`,
      });
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
  it('uses only Oxygen credentials and supported redirects, with stable provider idempotency keys', async () => {
    const {env, fetcher, events, intakes} = setup();
    await acceptIntake(sample, env);
    expect(events).toHaveLength(1);
    expect(intakes.size).toBe(1);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain('rooms.test');
      expect(init?.redirect).toBe('manual');
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
        `${String(url).endsWith('/emails') ? 'project' : 'inquiry'}-${sample.submissionId}`,
      );
    }
    const direct = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith('/emails'),
    )!;
    const message = JSON.parse(direct[1]!.body as string) as {
      text: string;
      [key: string]: string;
    };
    expect(message).toMatchObject({
      to: 'owner@example.invalid',
      from: 'sender@example.invalid',
      reply_to: sample.email,
    });
    expect(message.text).toContain(sample.message);
    expect(events[0].email).toBe(sample.email);
  });
  it('logs network failure and missing ftops settings without failing success', async () => {
    const {env, fetcher} = setup();
    const normal = fetcher.getMockImplementation()!;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetcher.mockImplementation(async (url, init) => {
      if (String(url) === env.FTOPS_INTAKE_URL) throw new Error('timeout');
      return normal(url, init);
    });
    await expect(acceptIntake(sample, env)).resolves.toBeUndefined();
    await expect(
      acceptIntake(sample, {...env, FTOPS_INTAKE_TOKEN: undefined}),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('ftops_intake_failed', {
      submissionId: sample.submissionId,
      reason: 'network_or_timeout',
    });
    expect(log).toHaveBeenCalledWith('ftops_intake_failed', {
      submissionId: sample.submissionId,
      reason: 'not_configured',
    });
  });
  it.each([302, 401, 429, 500])(
    'rejects direct email %s and makes no event or ftops call',
    async (status) => {
      const {env, fetcher} = setup();
      fetcher.mockImplementation(async () => new Response('', {status}));
      await expect(acceptIntake(sample, env)).rejects.toThrow(
        `contact_email_not_accepted:${status}`,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('reports an event rejection after the direct owner email without sending to ftops', async () => {
    const {env, fetcher, ownerEmails} = setup();
    const normal = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url, init) =>
      String(url).endsWith('/events/send')
        ? Response.json({}, {status: 429})
        : normal(url, init),
    );
    await expect(acceptIntake(sample, env)).rejects.toThrow(
      'resend_not_accepted:429',
    );
    expect(ownerEmails).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

it('passes structured Meta identifiers through direct Oxygen delivery without changing the event identity', async () => {
  const {env, intakes} = setup();
  const metaAttribution = {
    fbclid: 'click_123',
    fbc: 'fb.1.1791130000000.click_123',
    fbp: 'fb.1.1791130000000.123456',
    fbclidCapturedAt: '2026-10-04T17:00:00.000Z',
  };
  await acceptIntake({...sample, metaAttribution}, env);
  expect([...intakes.values()][0]).toMatchObject({
    externalEventId: sample.submissionId,
    metaAttribution,
  });
});

it('separates arrivals, preserves campaign touches and correlates a real accepted inquiry', async () => {
  const {env, db, intakes, events} = setup();
  const settings = {
    ...env,
    SESSION_SECRET: 'test-session',
    TURNSTILE_SECRET_KEY: 'test',
    ACQUISITION_MODE: 'coarse-arrivals',
    ACQUISITION_VISITOR_TTL_SECONDS: '900',
    CABINET_ROOMS_URL: 'https://rooms.test',
    CABINET_ROOMS_TOKEN: env.SERVICE_TOKEN,
  };
  const work: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => work.push(promise);
  const path =
    'https://from-trees.com/inquire/cabinetry?gclid=click&customer_email=private@example.invalid';
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
  for (const headers of [
    {},
    {'Sec-Purpose': 'prefetch'},
    {'User-Agent': 'Googlebot'},
  ]) {
    const response = new Response('', {headers: {'Content-Type': 'text/html'}});
    const request = new Request(path, {
      headers: {
        'User-Agent': userAgent,
        Referer: 'https://google.test/search?q=private',
        ...headers,
      } as HeadersInit,
    });
    captureArrival(
      request,
      response,
      settings,
      waitUntil,
      new Date().toISOString(),
    );
    if (!Object.keys(headers).length) {
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      work.push(Promise.resolve(response.headers.get('Server-Timing')));
    }
  }
  const completed = await Promise.all(work);
  const arrivalId = completed
    .find((value): value is string => typeof value === 'string')
    ?.split('"')[1];
  expect(arrivalId).toMatch(/^[a-f0-9-]{36}$/);
  const uuid = () => crypto.randomUUID();
  const view = {
    id: uuid(),
    kind: 'view',
    path: '/inquire/cabinetry',
    occurredAt: new Date().toISOString(),
    version: 'baseline-v1',
    arrivalId,
    visitorId: uuid(),
    sessionId: uuid(),
    attribution: {
      gclid: 'click',
      fbclid: 'meta-click',
      gbraid: 'gb',
      wbraid: 'wb',
      utm_source: 'google',
      campaign_id: '123',
      email: 'never@example.invalid',
    },
  };
  const proxy = (
    payload: unknown,
    origin = 'https://from-trees.com',
    extra: HeadersInit = {},
  ) =>
    acquisition({
      request: new Request('https://from-trees.com/api/acquisition', {
        method: 'POST',
        headers: {Origin: origin, 'User-Agent': userAgent, ...extra},
        body: JSON.stringify(payload),
      }),
      context: {env: settings},
    } as any);
  expect((await proxy({event: view}, 'https://other.test')).status).toBe(403);
  expect(
    (await proxy({event: view}, 'https://from-trees.com', {'Sec-GPC': '1'}))
      .status,
  ).toBe(204);
  expect(
    db.prepare("SELECT id FROM acquisition_events WHERE kind='view'").all(),
  ).toHaveLength(0);
  const receipt = await proxy({
    refresh: true,
    event: view,
  });
  expect(receipt.status).toBe(204);
  const cookie = receipt.headers.get('Set-Cookie')!.split(';')[0]!;
  expect(
    (
      await proxy({
        event: {...view, attribution: {utm_source: 'changed'}},
      })
    ).status,
  ).toBe(204);
  expect(
    (
      await proxy({
        event: {
          ...view,
          id: uuid(),
          arrivalId: undefined,
          attribution: {...view.attribution, utm_source: 'newsletter'},
        },
      })
    ).status,
  ).toBe(204);
  const ads = {...view, id: uuid(), kind: 'ad_attribution', viewId: view.id};
  expect((await proxy({event: ads})).status).toBe(400);
  expect((await proxy({event: ads, marketing: true})).status).toBe(204);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    submissionId: sample.submissionId,
    name: sample.name,
    email: sample.email,
    message: sample.message,
    location: sample.location,
    projectType: 'Kitchen or pantry',
    'cf-turnstile-response': 'cabinetry',
  })) {
    form.set(key, value);
  }
  const session = {set: vi.fn()};
  const submitted = await inquiry({
    request: new Request(path, {
      method: 'POST',
      headers: {Cookie: cookie},
      body: form,
    }),
    context: {env: settings, waitUntil, session},
    params: {kind: 'cabinetry'},
  } as any);
  await Promise.all(work);
  expect(submitted).toBeInstanceOf(Response);
  expect((submitted as Response).status).toBe(303);
  expect(session.set).toHaveBeenLastCalledWith('projectReceipt', {
    eventId: sample.submissionId,
    kind: 'cabinetry',
  });
  expect(events).toHaveLength(1);
  const intake = intakes.get(sample.submissionId);
  const metadata = JSON.parse(intake.message) as {
    details: {acquisition?: Identity};
  };
  expect(metadata.details.acquisition).toEqual({
    visitorId: view.visitorId,
    sessionId: view.sessionId,
  });
  const stored = db
    .prepare('SELECT payload FROM acquisition_events')
    .all()
    .map(({payload}) => JSON.parse(String(payload)) as AcquisitionEvent);
  expect(
    stored
      .filter((row) => row.kind === 'arrival')
      .map((row) => row.traffic)
      .sort(),
  ).toEqual(['known_bot', 'navigation', 'prefetch']);
  expect(stored.find(({id}) => id === arrivalId)).toMatchObject({
    referrer: 'https://google.test',
    url: 'https://from-trees.com/inquire/cabinetry',
  });
  const views = stored.filter((row) => row.kind === 'view');
  expect(views).toHaveLength(2);
  expect(stored.find(({id}) => id === view.id)).toMatchObject({
    arrivalId,
    attribution: {utm_source: 'google', campaign_id: '123'},
  });
  expect(views.find(({id}) => id === view.id)).not.toHaveProperty(
    'attribution.gclid',
  );
  expect(stored.find(({id}) => id === ads.id)).toMatchObject({
    kind: 'ad_attribution',
    viewId: view.id,
    attribution: {
      gclid: 'click',
      fbclid: 'meta-click',
      gbraid: 'gb',
      wbraid: 'wb',
    },
  });
  expect(
    views.find(
      (row) =>
        'attribution' in row && row.attribution?.utm_source === 'newsletter',
    ),
  ).toMatchObject({
    attribution: {utm_source: 'newsletter', campaign_id: '123'},
  });
  expect(stored.find(({id}) => id === sample.submissionId)).toMatchObject({
    kind: 'inquiry_accepted',
    visitorId: view.visitorId,
    sessionId: view.sessionId,
  });
  expect(JSON.stringify(stored)).not.toContain('@');
  expect(() =>
    db.exec("UPDATE acquisition_events SET visitor_id=NULL WHERE kind='view'"),
  ).toThrow('immutable');
  expect((await proxy({optOut: true})).headers.get('Set-Cookie')).toContain(
    'Max-Age=0',
  );
});
