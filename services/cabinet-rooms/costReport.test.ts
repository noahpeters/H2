// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach, it, expect} from 'vitest';
import {buildCostReport, costReportCsv} from './costReport';
import {calculatePrice, projectSchedule, type Rates} from './pricing';
import worker from './worker';
import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import type {RoomElement} from '../../app/studio/cabinet-configurator/model';
const dbs: DatabaseSync[] = [];
afterEach(() => {
  dbs.splice(0).forEach((db) => db.close());
});
function setup() {
  const db = new DatabaseSync(':memory:');
  dbs.push(db);
  for (const name of [
    '0001_rooms.sql',
    '0002_sharing.sql',
    '0003_lead_phone.sql',
    '0004_pricing.sql',
    '0005_price_requests.sql',
    '0006_open_storage.sql',
    '0008_analytics.sql',
  ])
    db.exec(
      readFileSync(new URL(`./migrations/${name}`, import.meta.url), 'utf8'),
    );
  const rates = Object.fromEntries(
    db
      .prepare('SELECT key, value FROM cabinet_pricing_rates')
      .all()
      .map((r) => [r.key, r.value]),
  ) as Rates;
  const env = {
    SERVICE_TOKEN: 'test',
    ANALYTICS_READ_TOKEN: 'report-token',
    WRITES: {limit: async () => ({success: true})},
    DB: {
      prepare(sql: string) {
        let values: any[] = [];
        return {
          bind(...args: any[]) {
            values = args;
            return this;
          },
          async all<T>() {
            return {results: db.prepare(sql).all(...values) as T[]};
          },
          async first<T>() {
            return (db.prepare(sql).get(...values) ?? null) as T | null;
          },
          async run() {
            return {
              meta: {changes: Number(db.prepare(sql).run(...values).changes)},
            };
          },
        };
      },
    },
  };
  return {
    db,
    rates,
    call: (path: string, method = 'GET', token = 'test', body?: unknown) =>
      worker.fetch(
        new Request(`https://api.test${path}`, {
          method,
          headers: {Authorization: `Bearer ${token}`},
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
      ),
  };
}
const cabinet: RoomElement = {
  id: 'b1',
  kind: 'base',
  configuration: 'three-drawer',
  width: 30,
  depth: 24,
  height: 34.5,
  material: 'rift-white-oak',
  face: 'shaker',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
function study(elements: RoomElement[] = [cabinet]): Study {
  return {
    version: 2,
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    elements,
    openings: [],
    islands: [],
    selected: null,
    countertop: true,
    view: 'split',
  };
}

it('reconciles options, cabinets and project with pooled purchases, overhead, cap and premiums', () => {
  const {rates} = setup();
  const design = study([
    {...cabinet, face: 'beaded-shaker'},
    {...cabinet, id: 'b2', width: 36, material: 'walnut', face: 'beaded-flat'},
  ]);
  rates.profit_cap = 100;
  const calculated = calculatePrice(projectSchedule(design).lines, rates);
  const report = buildCostReport(design, rates);
  const sumCents = (
    items: {cost: number; price: number}[],
    key: 'cost' | 'price',
  ) => items.reduce((sum, item) => sum + Math.round(item[key] * 100), 0);
  expect(report.totals.cost).toBe(Math.round(calculated.cost * 100) / 100);
  expect(report.totals.price).toBe(Math.round(calculated.price * 100) / 100);
  for (const key of ['cost', 'price'] as const) {
    expect(sumCents(report.cabinets, key)).toBe(
      Math.round(report.totals[key] * 100),
    );
    for (const item of report.cabinets)
      expect(sumCents(item.options, key)).toBe(Math.round(item[key] * 100));
  }
  expect(report.totals.profitMargin).toBeCloseTo(
    report.totals.profit / report.totals.price,
  );
  expect(
    report.cabinets[0].options.find(
      (item) => item.option === 'Beaded Shaker face premium',
    ),
  ).toMatchObject({cost: 0, price: 30});
  expect(
    report.cabinets[1].options.find(
      (item) => item.option === 'Beaded Flat face premium',
    ),
  ).toMatchObject({cost: 0, price: 15});
});
it('groups attached panels with their cabinet and handles empty projects', () => {
  const {rates} = setup();
  const design = study();
  design.room.useMapleInternals = true;
  const report = buildCostReport(design, rates);
  expect(report.cabinets).toHaveLength(1);
  expect(
    report.cabinets[0].options.some((item) =>
      item.option.startsWith('Attached finish panel:'),
    ),
  ).toBe(true);
  const empty = buildCostReport(study([]), rates);
  expect(empty.cabinets).toEqual([]);
  expect(empty.totals).toEqual({
    cost: 0,
    price: 0,
    profit: 0,
    profitMargin: null,
  });
});
it('quotes CSV cells and neutralizes formulas in saved cabinet identifiers', () => {
  const {rates} = setup();
  const report = buildCostReport(
    study([{...cabinet, id: '=HYPERLINK("bad")'}]),
    rates,
  );
  const csv = costReportCsv(report, {
    slug: 'aaaaaaaa',
    revision: 1,
    updatedAt: 'then',
    ratesUpdatedAt: 'now',
    generatedAt: 'now',
  });
  expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
  expect(csv).toContain('"Profit margin (%)"');
  expect(csv).toContain('"Excluded","installation"');
});
it('requires the separate reporting credential and exact revision, without exposing economics publicly', async () => {
  const {call} = setup();
  const saved = await call('/rooms', 'POST', 'test', {study: study()});
  expect(saved.status).toBe(201);
  const {slug} = (await saved.json()) as {slug: string};
  const path = `/admin/cost-report?slug=${slug}&revision=1`;
  expect((await call(path)).status).toBe(401);
  expect((await call(path, 'GET', 'wrong')).status).toBe(401);
  expect((await call(path, 'POST', 'report-token')).status).toBe(405);
  expect(
    (await call(`/admin/cost-report?slug=${slug}`, 'GET', 'report-token'))
      .status,
  ).toBe(400);
  expect(
    (
      await call(
        path.replace('revision=1', 'revision=2'),
        'GET',
        'report-token',
      )
    ).status,
  ).toBe(409);
  const response = await call(path, 'GET', 'report-token');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = (await response.json()) as any;
  expect(body.report.cabinets).toHaveLength(1);
  expect(body.csv).toContain('"Project total"');
  const publicPrice = await call(`/price?slug=${slug}`);
  expect(await publicPrice.text()).not.toMatch(
    /components|profitMargin|purchases|"cost"/,
  );
});
it('fails closed when rates are unavailable', async () => {
  const {db, call} = setup();
  const saved = await call('/rooms', 'POST', 'test', {study: study()});
  const {slug} = (await saved.json()) as {slug: string};
  db.exec('DELETE FROM cabinet_pricing_rates');
  expect(
    (
      await call(
        `/admin/cost-report?slug=${slug}&revision=1`,
        'GET',
        'report-token',
      )
    ).status,
  ).toBe(503);
});
