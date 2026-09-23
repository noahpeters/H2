// Local-only browser harness: real H2 forms/actions/worker, SQLite, isolated provider doubles.
// Never loads .env or permits outbound network. No production bypasses are installed.
import {createServer as createViteServer} from 'vite';
import {createServer} from 'node:http';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const root = process.cwd();
const port = 4179;
const origin = `http://127.0.0.1:${port}`;
const vite = await createViteServer({
  configFile: false,
  root,
  appType: 'custom',
  resolve: {alias: {'~': resolve(root, 'app')}},
  esbuild: {jsx: 'automatic'},
  server: {middlewareMode: true, hmr: false, watch: null},
});
const db = new DatabaseSync(':memory:');
for (const file of readdirSync('services/cabinet-rooms/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  db.exec(readFileSync(`services/cabinet-rooms/migrations/${file}`, 'utf8'));
const env = {
  SERVICE_TOKEN: 'local-test-only',
  RESEND_API_KEY: 'local-test-only',
  CONTACT_FROM_EMAIL: 'test@example.invalid',
  CONTACT_TO_EMAIL: 'owner@example.invalid',
  FTOPS_INTAKE_URL: 'https://ftops.test/website-intake/local-test',
  FTOPS_INTAKE_TOKEN: 'local-test-only',
  CABINET_ROOMS_URL: 'https://rooms.test',
  CABINET_ROOMS_TOKEN: 'local-test-only',
  TURNSTILE_SITE_KEY: 'local-test-only',
  TURNSTILE_SECRET_KEY: 'local-test-only',
  WRITES: {limit: async () => ({success: true})},
  SHARES: {limit: async () => ({success: true})},
  DB: {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              return db.prepare(sql).get(...values) ?? null;
            },
            async all() {
              return {results: db.prepare(sql).all(...values)};
            },
            async run() {
              return {
                meta: {changes: Number(db.prepare(sql).run(...values).changes)},
              };
            },
          };
        },
      };
    },
  },
};
const {default: worker} = await vite.ssrLoadModule(
  '/services/cabinet-rooms/worker.ts',
);
const {drainIntake} = await vite.ssrLoadModule(
  '/services/cabinet-rooms/intake.ts',
);
const events = [];
const intakes = new Map();
const invitations = new Map();
let failure = '';
globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  if (url.hostname === 'rooms.test') return worker.fetch(request, env);
  if (url.hostname === 'challenges.cloudflare.com') {
    const token = new URLSearchParams(await request.text()).get('response');
    return Response.json({
      success: token?.startsWith('local-test-'),
      hostname: '127.0.0.1',
      action: token?.replace('local-test-', ''),
    });
  }
  if (url.hostname === 'api.resend.com') {
    const body = await request.json();
    if (url.pathname === '/emails') {
      const key = request.headers.get('Idempotency-Key');
      invitations.set(key, body);
      return Response.json({id: 'test-invitation'});
    }
    if (url.pathname !== '/events/send')
      throw new Error('Unexpected Resend endpoint');
    if (failure === 'resend') return Response.json({}, {status: 429});
    events.push(body);
    return Response.json({object: 'event', event: body.event});
  }
  if (url.href === env.FTOPS_INTAKE_URL) {
    if (failure === 'ftops') return Response.json({}, {status: 503});
    const body = await request.json();
    const old = intakes.get(body.externalEventId);
    if (old && JSON.stringify(old) !== JSON.stringify(body))
      return Response.json({}, {status: 409});
    intakes.set(body.externalEventId, body);
    return Response.json(
      {
        submissionId: `TEST-${body.externalEventId}`,
        status: 'linked',
        duplicate: !!old,
      },
      {status: old ? 200 : 201},
    );
  }
  throw new Error(
    `Outbound network blocked by local test harness: ${url.origin}`,
  );
};
const routeFiles = {
  '/contact': 'contact.tsx',
  '/configurator': 'configurator.tsx',
  '/cabinet-configurator': 'cabinet-configurator.tsx',
  '/api/cabinet-price': 'api.cabinet-price.ts',
  '/api/cabinet-share': 'api.cabinet-share.ts',
  '/api/cabinet-rooms': 'api.cabinet-rooms.ts',
  '/api/cabinet-analytics': 'api.cabinet-analytics.ts',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/__status')
      return json(res, {
        events,
        intakes: [...intakes.values()],
        invitations: [...invitations.values()],
        deliveries: db.prepare('SELECT * FROM intake_deliveries').all(),
        stored: db
          .prepare('SELECT payload FROM intake_events')
          .all()
          .map((r) => JSON.parse(r.payload)),
      });
    if (url.pathname === '/__drain') {
      db.exec(
        "UPDATE intake_deliveries SET next_attempt=0 WHERE state='pending'",
      );
      await drainIntake(env);
      return json(res, {ok: true});
    }
    if (url.pathname === '/__failure') {
      failure = url.searchParams.get('destination') || '';
      return json(res, {failure});
    }
    const path =
      url.pathname === '/__loader' || url.pathname === '/__action'
        ? url.searchParams.get('path')
        : url.pathname;
    const file = path?.startsWith('/inquire/')
      ? 'inquire.$kind.tsx'
      : routeFiles[path];
    if (
      file &&
      (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__'))
    ) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const route = await vite.ssrLoadModule(`/app/routes/${file}`);
      const target = new URL(path, origin);
      target.search = url.searchParams.get('query') || url.search;
      const request = new Request(target, {
        method: req.method,
        headers: req.headers,
        ...(req.method === 'GET' ? {} : {body: Buffer.concat(chunks)}),
      });
      const result = await route[req.method === 'GET' ? 'loader' : 'action']({
        request,
        context: {env, session: {set() {}}},
        params: {kind: path.split('/').pop()},
      });
      if (result instanceof Response) {
        if (url.pathname === '/__action' && result.status === 303)
          return json(res, {redirect: result.headers.get('Location')});
        res.writeHead(result.status, Object.fromEntries(result.headers));
        return res.end(await result.text());
      }
      return json(
        res,
        result?.type === 'DataWithResponseInit' ? result.data : result,
      );
    }
    if (req.method === 'GET' && (file || url.pathname === '/')) {
      const html = await vite.transformIndexHtml(
        req.url,
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/intake-e2e/client.jsx"></script></body></html>',
      );
      res.writeHead(200, {'Content-Type': 'text/html'});
      return res.end(html);
    }
    vite.middlewares(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end(String(error));
  }
});
function json(res, body) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(body));
}
server.listen(port, '127.0.0.1', () =>
  console.warn(`Local intake E2E ready at ${origin}`),
);
