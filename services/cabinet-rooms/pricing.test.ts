// @vitest-environment node
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach, describe, it, expect} from 'vitest';
import {
  calculatePrice,
  estimateProject,
  priceRange,
  projectSchedule,
  type Rates,
} from './pricing';
import worker from './worker';
import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import type {
  BaseConfiguration,
  KitchenElement,
} from '../../app/studio/cabinet-configurator/model';
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
    WRITES: {limit: async () => ({success: true})},
    DB: {
      prepare(sql: string) {
        let values: any[] = [];
        return {
          bind(...args: any[]) {
            values = args;
            return this;
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
const cabinet: KitchenElement = {
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
function study(elements: KitchenElement[] = [cabinet]): Study {
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
describe('bottom-up cabinet pricing', () => {
  it('gates quotes on contact details, snapshots the priced revision and saves leads only with consent', async () => {
    const {db, call} = setup();
    const room: any = await (
      await call('/', 'POST', 'test', {study: study()})
    ).json();
    const details = {
      ...room,
      requestId: crypto.randomUUID(),
      senderName: 'Example Person',
      senderEmail: 'person@example.com',
      senderPhone: '5551234567',
      consent: false,
    };
    expect((await call('/quote')).status).toBe(405);
    expect(
      (await call('/quote', 'POST', 'test', {...details, senderName: ''}))
        .status,
    ).toBe(400);
    expect(
      (await call('/quote', 'POST', 'test', {...details, editKey: 'wrong'}))
        .status,
    ).toBe(409);
    const response = await call('/quote', 'POST', 'test', details);
    expect(response.status).toBe(200);
    const estimate: any = await response.json();
    expect(estimate.projectRevision).toBe(room.revision);
    const record: any = db.prepare('SELECT * FROM room_price_requests').get();
    expect(JSON.parse(record.study_data)).toEqual(study());
    expect(record.created_at).toBeTruthy();
    expect(record.contact_consent).toBe(0);
    expect(JSON.stringify(record)).not.toContain(details.senderEmail);
    expect(JSON.stringify(record)).not.toContain(details.senderPhone);
    expect(db.prepare('SELECT * FROM cabinet_leads').all()).toHaveLength(0);
    db.prepare(
      "UPDATE cabinet_pricing_rates SET value=1000 WHERE key='face_rift-white-oak'",
    ).run();
    expect(
      await (await call('/quote', 'POST', 'test', details)).json(),
    ).toEqual(estimate);
    const consenting = {
      ...details,
      consent: true,
      requestId: crypto.randomUUID(),
    };
    expect((await call('/quote', 'POST', 'test', consenting)).status).toBe(200);
    expect((await call('/quote', 'POST', 'test', consenting)).status).toBe(200);
    expect(db.prepare('SELECT * FROM cabinet_leads').all()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM cabinet_leads').get()).toMatchObject({
      sender_email: details.senderEmail,
      sender_phone: details.senderPhone,
      lead_source: 'price',
    });
    expect(
      (await call('/quote', 'POST', 'test', {...details, consent: true}))
        .status,
    ).toBe(409);
  });
  it('matches the skill calculator reference using project-level purchases', () => {
    const {rates} = setup();
    const lines = projectSchedule(
      study([cabinet, {...cabinet, id: 'b2'}]),
    ).lines;
    const result = calculatePrice(lines, rates);
    // Reference: python3 price_cabinets.py pricing-reference.json --json
    expect(result.cost).toBe(3150);
    expect(result.price).toBeCloseTo(6034.482758620689, 8);
    expect(result.purchases).toMatchObject({
      box_sheet: 2,
      'face_rift-white-oak': 2,
      drawer_stock: 58,
      drawer_bottom_sheet: 1,
      back_sheet: 1,
    });
    expect(
      estimateProject(study([cabinet, {...cabinet, id: 'b2'}]), rates).range,
    ).toEqual({low: 5500, high: 6500});
  });
  it('uses approved material prices and separates mixed-material purchase pools', () => {
    const {rates} = setup();
    expect(rates).toMatchObject({
      face_walnut: 250,
      face_maple: 200,
      face_cherry: 200,
      'face_paint-grade': 187.5,
    });
    const lines = projectSchedule(
      study([cabinet, {...cabinet, id: 'b2', material: 'walnut'}]),
    ).lines;
    const result = calculatePrice(lines, rates);
    expect(result.purchases.face_walnut).toBe(1);
    expect(result.purchases['face_rift-white-oak']).toBe(1);
    expect(
      calculatePrice(lines, {...rates, face_walnut: 500}).price,
    ).toBeGreaterThan(result.price);
    expect(() => calculatePrice(lines, {...rates, face_walnut: null})).toThrow(
      'pricing_not_configured',
    );
    expect(() => calculatePrice(lines, {...rates, margin: 1})).toThrow();
    expect(() => calculatePrice(lines, {...rates, weekly_hours: 0})).toThrow();
    expect(calculatePrice(lines, {...rates, profit_cap: 100}).price).toBe(
      result.cost + 100,
    );
  });
  it('maps cabinet configurations and excludes appliance bodies, sinks and countertops', () => {
    const counts: Record<BaseConfiguration, number> = {
      'single-door': 0,
      'door-drawer': 1,
      'three-drawer': 3,
      pullout: 1,
      sink: 0,
      corner: 0,
      'microwave-drawer': 1,
    };
    for (const [configuration, count] of Object.entries(counts))
      expect(
        projectSchedule(
          study([
            {...cabinet, configuration: configuration as BaseConfiguration},
          ]),
        ).lines[0].drawers,
      ).toBe(count);
    for (const tallConfiguration of [
      'one-oven',
      'two-oven',
      'coffee-maker',
    ] as const) {
      const line = projectSchedule(
        study([{...cabinet, kind: 'tall', height: 90, tallConfiguration}]),
      ).lines[0];
      expect(line.drawers).toBe(2);
      expect(line.frontCoverage).toBeLessThan(1);
    }
    const appliance = {
      ...cabinet,
      kind: 'appliance' as const,
      applianceKind: 'refrigerator' as const,
      height: 70,
    };
    expect(projectSchedule(study([appliance])).lines).toHaveLength(0);
    const panel = projectSchedule(
      study([{...appliance, applianceFront: 'shaker'}]),
    ).lines[0];
    expect(panel).toMatchObject({
      boxUnits: 0,
      drawers: 0,
      hinges: 0,
      feet: 0,
      endPanels: 0,
    });
    const {rates} = setup();
    expect(estimateProject(study([]), rates).range).toEqual({low: 0, high: 0});
    expect(estimateProject(study(), rates).range).toEqual(
      estimateProject({...study(), countertop: false}, rates).range,
    );
  });
  it('rounds each unrounded ±10 percent endpoint to the nearest $500', () => {
    expect(priceRange(10000)).toEqual({low: 9000, high: 11000});
    expect(priceRange(12345)).toEqual({low: 11000, high: 13500});
    expect(priceRange(500)).toEqual({low: 500, high: 500});
  });
  it('looks up slugs and live rates without leaking internal economics', async () => {
    const {db, call} = setup(),
      slug = 'a'.repeat(32);
    db.prepare('INSERT INTO rooms VALUES (?, ?, ?, ?, ?)').run(
      slug,
      'private-edit-hash',
      JSON.stringify(study()),
      7,
      '2026-09-06T00:00:00Z',
    );
    expect((await call(`/price?slug=${slug}`, 'GET', 'wrong')).status).toBe(
      401,
    );
    expect((await call('/price')).status).toBe(400);
    expect((await call('/price?slug=bad')).status).toBe(400);
    expect((await call(`/price?slug=${'b'.repeat(32)}`)).status).toBe(404);
    expect((await call(`/price?slug=${slug}`, 'POST')).status).toBe(405);
    const response = await call(`/price?slug=${slug}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body: any = await response.json();
    expect(body.projectRevision).toBe(7);
    expect(Object.keys(body)).not.toEqual(
      expect.arrayContaining([
        'cost',
        'price',
        'margin',
        'purchases',
        'rates',
        'editKey',
      ]),
    );
    for (const key of [
      'cost',
      'price',
      'margin',
      'purchases',
      'rates',
      'editKey',
    ])
      expect(body).not.toHaveProperty(key);
    expect(body.exclusions).toEqual(
      expect.arrayContaining(['installation', 'delivery', 'tax']),
    );
    db.prepare(
      "UPDATE cabinet_pricing_rates SET value=1000 WHERE key='face_rift-white-oak'",
    ).run();
    const changed: any = await (await call(`/price?slug=${slug}`)).json();
    expect(changed.range.high).toBeGreaterThan(body.range.high);
    db.prepare(
      "DELETE FROM cabinet_pricing_rates WHERE key='face_rift-white-oak'",
    ).run();
    expect((await call(`/price?slug=${slug}`)).status).toBe(503);
  });
});
