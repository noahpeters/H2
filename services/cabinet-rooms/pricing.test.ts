import {cabinetTypes} from '../../app/studio/cabinet-configurator/cabinetTypes';
import {createRoomPanel} from '../../app/studio/cabinet-configurator/roomPanels';
import {CABINET_MATERIALS} from '../../app/studio/cabinet-configurator/materials';
import {configurationTemplate} from '../../app/studio/cabinet-configurator/custom-unit/designConfigurations';
import {
  SINK_CATALOG,
  createSink,
  type SinkKind,
} from '../../app/studio/cabinet-configurator/sinkAttachments';
import {
  FIXTURE_CATALOG,
  createFixture,
  type FixtureKind,
} from '../../app/studio/cabinet-configurator/fixtures';
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
import {createOpenStorage} from '../../app/studio/cabinet-configurator/openStorage';
import type {Study} from '../../app/studio/cabinet-configurator/CabinetConfigurator';
import {
  APPLIANCE_CATALOG,
  createAppliance,
  type BaseConfiguration,
  type ApplianceKind,
  type RoomElement,
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
describe('bottom-up cabinet pricing', () => {
  it('saves plain-sawn white oak and prices it at the current maple rate', async () => {
    const {call, rates} = setup();
    const oakStudy = study([{...cabinet, material: 'plain-white-oak'}]);
    const saved = await call('/', 'POST', 'test', {study: oakStudy});
    expect(saved.status).toBe(201);
    const {slug} = (await saved.json()) as {slug: string};
    const response = await call(`/price?slug=${slug}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ...estimateProject(study([{...cabinet, material: 'maple'}]), rates),
      assumptions: expect.any(Array),
    });
    for (const mapleRate of [200, 275]) {
      const updatedRates = {...rates, face_maple: mapleRate};
      const oak = calculatePrice(projectSchedule(oakStudy).lines, updatedRates);
      const maple = calculatePrice(
        projectSchedule(study([{...cabinet, material: 'maple'}])).lines,
        updatedRates,
      );
      expect(oak.price).toBe(maple.price);
      expect(oak.purchases['face_plain-white-oak']).toBeGreaterThan(0);
      expect(oak.purchases.face_maple).toBeUndefined();
    }
  });

  it('accepts and prices a saved open-storage room through the Worker', async () => {
    const {call} = setup();
    const saved = await call('/', 'POST', 'test', {
      study: study([createOpenStorage('double-hang', 'storage')]),
    });
    expect(saved.status).toBe(201);
    const body = (await saved.json()) as {slug: string};
    const response = await call(`/price?slug=${body.slug}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pricedItemCount: 1,
      currency: 'USD',
    });
  });
  it('prices storage interiors and optional fronts/back without pricing an empty closed cabinet', () => {
    const {rates} = setup();
    const item = createOpenStorage('shelving', 'storage');
    const line = projectSchedule(study([item])).lines[0];
    expect(line.frontCoverage).toBe(0);
    expect(line.hinges).toBe(0);
    expect(line.extraCarcass).toBeGreaterThan(0);
    const baseline = calculatePrice([line], rates);
    expect(baseline.cost).toBe(1456.25);
    item.storage!.shelves = 0;
    item.storage!.back = false;
    expect(projectSchedule(study([item])).lines[0].extraCarcass).toBeLessThan(
      line.extraCarcass!,
    );
    item.storage!.doors = true;
    expect(projectSchedule(study([item])).lines[0].hinges).toBeGreaterThan(0);
    const hanging = createOpenStorage('double-hang', 'hang');
    const hangLines = projectSchedule(study([hanging])).lines;
    expect(hangLines[0].rodFeet).toBeGreaterThan(0);
    expect(
      calculatePrice(hangLines, {...rates, hanging_rod_lf: 25}).price,
    ).toBeGreaterThan(calculatePrice(hangLines, rates).price);
  });
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
    ).lines.map(
      ({interiorMaterial: _interior, drawerMaterial: _drawer, ...line}) => line,
    );
    const result = calculatePrice(lines, rates);
    // Legacy generic-stock reference: python3 price_cabinets.py pricing-reference.json --json
    expect(result.cost).toBe(3150);
    expect(result.price).toBeCloseTo(6034.482758620689, 8);
    expect(result.purchases).toMatchObject({
      box_sheet: 2,
      'face_rift-white-oak': 2,
      drawer_stock: 58,
      drawer_bottom_sheet: 1,
      back_sheet: 1,
    });
    expect(priceRange(result.price)).toEqual({low: 5500, high: 6500});
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
    expect(result.purchases.face_walnut).toBe(2);
    expect(result.purchases['face_rift-white-oak']).toBe(2);
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
      'farmhouse-sink': 0,
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

it('excludes bathroom room fixtures from cabinetry pricing', () => {
  const fixture = createFixture('toilet', 'toilet', study().room);
  expect(projectSchedule(study([fixture])).lines).toHaveLength(0);
  expect(projectSchedule(study([cabinet, fixture])).lines).toEqual(
    projectSchedule(study([cabinet])).lines,
  );
});

it('excludes all fixture bodies and sink attachments while retaining cabinet appliance panels', () => {
  const {rates} = setup();
  const baseline = estimateProject(study(), rates);
  const fixtures: RoomElement[] = (
    Object.keys(FIXTURE_CATALOG) as FixtureKind[]
  ).map((kind) => createFixture(kind, kind, study().room));
  for (const fixture of fixtures)
    expect(estimateProject(study([cabinet, fixture]), rates)).toEqual(baseline);
  for (const kind of Object.keys(APPLIANCE_CATALOG) as ApplianceKind[]) {
    const appliance = createAppliance(kind, kind);
    expect(estimateProject(study([cabinet, appliance]), rates)).toEqual(
      baseline,
    );
    for (const applianceFront of ['shaker', 'slab', 'vertical-slat'] as const) {
      const panel = {...appliance, applianceFront};
      if (kind === 'refrigerator' || kind === 'dishwasher') {
        expect(projectSchedule(study([panel])).lines).toEqual([
          expect.objectContaining({
            boxUnits: 0,
            finishUnits: 1,
            feet: 0,
            drawers: 0,
            hinges: 0,
            endPanels: 0,
          }),
        ]);
        expect(estimateProject(study([panel]), rates).pricedItemCount).toBe(1);
      } else
        expect(estimateProject(study([cabinet, panel]), rates)).toEqual(
          baseline,
        );
    }
  }
  for (const kind of Object.keys(SINK_CATALOG) as SinkKind[])
    expect(
      estimateProject(
        study([{...cabinet, sink: {...createSink(kind), x: 3}}]),
        rates,
      ),
    ).toEqual(baseline);
  expect(estimateProject(study(fixtures), rates)).toMatchObject({
    pricedItemCount: 0,
    range: {low: 0, high: 0},
  });
});
it('prices only the appliance panel through the saved-design endpoint', async () => {
  const {call, rates} = setup();
  const panel = {
    ...createAppliance('refrigerator', 'fridge'),
    applianceFront: 'shaker' as const,
  };
  const saved = await call('/', 'POST', 'test', {
    study: study([
      panel,
      createFixture('mirror', 'mirror', study().room),
      createFixture('toilet', 'toilet', study().room),
    ]),
  });
  expect(saved.status).toBe(201);
  const record = (await saved.json()) as {slug: string};
  const response = await call('/price?slug=' + record.slug);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    pricedItemCount: 1,
    range: estimateProject(study([panel]), rates).range,
  });
});

it('uses room toe height for base and tall takeoffs while preserving default estimates', () => {
  const {rates} = setup();
  for (const kind of ['base', 'tall'] as const) {
    const design = study([
      {...cabinet, kind, height: kind === 'tall' ? 84 : 34.5},
    ]);
    const defaults = projectSchedule(design).lines;
    const changed = projectSchedule({
      ...design,
      room: {...design.room, toeKick: {height: 6, setback: 5}},
    }).lines;
    expect(defaults[0].toeKickHeight).toBe(4);
    expect(changed[0].toeKickHeight).toBe(6);
    expect(changed[0].height).toBe(defaults[0].height);
    expect(
      calculatePrice(
        Array.from({length: 20}, () => changed[0]),
        rates,
      ),
    ).not.toEqual(
      calculatePrice(
        Array.from({length: 20}, () => defaults[0]),
        rates,
      ),
    );
    expect(
      calculatePrice(
        defaults.map(({toeKickHeight: _height, ...line}) => line),
        rates,
      ),
    ).toEqual(calculatePrice(defaults, rates));
  }
});

it('prices maple internals below premium interiors while retaining front stock and following live maple rates', () => {
  const {rates} = setup();
  const premium = study(
    Array.from({length: 6}, (_, i) => ({
      ...cabinet,
      id: `cabinet-${i}`,
      material: 'walnut' as const,
    })),
  );
  const maple = {...premium, room: {...premium.room, useMapleInternals: true}};
  const off = calculatePrice(projectSchedule(premium).lines, rates);
  const on = calculatePrice(projectSchedule(maple).lines, rates);
  expect(on.price).toBeLessThan(off.price);
  expect(on.purchases.face_maple).toBeGreaterThan(0);
  expect(on.purchases.face_walnut).toBeGreaterThan(0);
  expect(on.purchases.drawer_stock).toBeGreaterThan(0);
  expect(on.purchases.drawer_stock_walnut).toBeUndefined();
  expect(off.purchases.drawer_stock_walnut).toBeGreaterThan(0);
  expect(
    calculatePrice(projectSchedule(maple).lines, {...rates, face_maple: 300})
      .price,
  ).toBeGreaterThan(on.price);
  expect(() =>
    calculatePrice(projectSchedule(maple).lines, {...rates, face_maple: null}),
  ).toThrow('pricing_not_configured');
  expect(() =>
    calculatePrice(projectSchedule(premium).lines, {
      ...rates,
      drawer_stock_walnut: null,
    }),
  ).toThrow('pricing_not_configured');
});

it('retains exposed storage finish and uses configured premium drawer rates rather than a maple-only allowance', () => {
  const {rates} = setup();
  const storage = createOpenStorage('shelving', 'storage');
  storage.material = 'walnut';
  storage.storage!.doors = false;
  const design = study([storage]);
  design.room.useMapleInternals = true;
  expect(projectSchedule(design).lines[0].interiorMaterial).toBe('walnut');
  const glass = {
    ...cabinet,
    kind: 'wall-cabinet' as const,
    face: 'shaker-glass' as const,
  };
  expect(
    projectSchedule({...design, elements: [glass]}).lines[0].interiorMaterial,
  ).toBe('rift-white-oak');
  const premium = projectSchedule(
    study([{...cabinet, material: 'walnut'}]),
  ).lines;
  const modeled = calculatePrice(premium, rates);
  const configured = calculatePrice(premium, {
    ...rates,
    drawer_stock_walnut: 30,
    drawer_bottom_sheet_walnut: 200,
  });
  expect(configured.price).toBeGreaterThan(modeled.price);
});

it('prices standalone panels by their span and height, without a cabinet box or hardware', () => {
  const {rates} = setup();
  const room = study().room;
  for (const thickness of [0.125, 0.75, 1.5]) {
    const panel = {
      ...createRoomPanel('room-panel', room),
      width: thickness,
      material: 'walnut' as const,
    };
    const line = projectSchedule(study([panel])).lines[0];
    expect(line).toMatchObject({
      boxUnits: 0,
      drawers: 0,
      hinges: 0,
      feet: 0,
      faceArea: 16,
      carcassArea: 0,
      backArea: 0,
    });
    expect(calculatePrice([line], rates).purchases).toEqual({face_walnut: 1});
    const alone = estimateProject(study([panel]), rates);
    expect(alone.range.high).toBeGreaterThan(0);
    const combined = estimateProject(study([cabinet, panel]), rates);
    expect(combined.pricedItemCount).toBe(2);
    expect(combined.range.high).toBeGreaterThanOrEqual(
      estimateProject(study(), rates).range.high,
    );
  }
});
it('gates every selectable cabinet feature and material on a finite automatic estimate', () => {
  const {rates} = setup();
  const room = study().room;
  const catalog = cabinetTypes();
  expect(catalog.length).toBeGreaterThan(15);
  const objects = [
    ...catalog.map((c) => c.item),
    createRoomPanel('panel', room),
  ];
  for (const object of objects) {
    for (const material of Object.keys(CABINET_MATERIALS) as Array<
      keyof typeof CABINET_MATERIALS
    >) {
      for (const useMapleInternals of [false, true]) {
        const design = {
          ...study([{...object, material}]),
          room: {...room, useMapleInternals},
        };
        const estimate = estimateProject(design, rates);
        expect(
          estimate.pricedItemCount,
          `${object.kind}/${object.configuration || object.storage?.type}/${material}`,
        ).toBe(1);
        expect(Number.isFinite(estimate.range.high)).toBe(true);
        expect(estimate.range.high).toBeGreaterThan(0);
      }
    }
  }
  // The editor's saved custom definitions use the same physical stock schedule.
  for (const choice of catalog) {
    const definition = configurationTemplate(choice.item, room);
    const item = {
      ...choice.item,
      customCabinet: {libraryId: 'coverage', libraryVersion: 1, definition},
    };
    expect(
      estimateProject(study([item]), rates).range.high,
      choice.label,
    ).toBeGreaterThan(0);
  }
});
it('returns a price for a saved room containing ordinary three-quarter-inch panels', async () => {
  const {call} = setup();
  const design = study([cabinet, createRoomPanel('end-panel', study().room)]);
  const saved = (await (
    await call('/', 'POST', 'test', {study: design})
  ).json()) as any;
  const response = await call('/quote', 'POST', 'test', {
    slug: saved.slug,
    editKey: saved.editKey,
    revision: saved.revision,
    requestId: '11111111-1111-4111-8111-111111111111',
    senderName: 'Example',
    senderEmail: 'example@example.com',
    consent: false,
  });
  expect(response.status).toBe(200);
  const result = (await response.json()) as any;
  expect(result.range.high).toBeGreaterThan(0);
  expect(result.pricedItemCount).toBe(2);
  expect(result).not.toHaveProperty('error');
});

it.each([
  ['single-door', 30, 1],
  ['single-door', 36, 2],
  ['door-drawer', 30, 2],
  ['door-drawer', 36, 3],
  ['three-drawer', 30, 3],
  ['pullout', 36, 1],
  ['microwave-drawer', 30, 1],
  ['sink', 36, 3],
  ['farmhouse-sink', 36, 2],
  ['corner', 36, 2],
] as const)(
  'adds exactly $10 per beaded %s face at width %s',
  (configuration, width, count) => {
    const {rates} = setup();
    const item = {...cabinet, configuration, width};
    const plain = projectSchedule(study([item])).lines;
    const beaded = projectSchedule(
      study([{...item, face: 'beaded-shaker'}]),
    ).lines;
    expect(beaded[0].beadedFaces).toBe(count);
    for (const profitCap of [null, 0, 200]) {
      const currentRates = {...rates, profit_cap: profitCap};
      const baseline = calculatePrice(plain, currentRates);
      const charged = calculatePrice(beaded, currentRates);
      expect(charged.cost).toBe(baseline.cost);
      expect(charged.price - baseline.price).toBeCloseTo(count * 10, 6);
    }
  },
);

it('charges only custom faces whose resolved profile is beaded, including each expanded drawer', () => {
  const {rates} = setup();
  const definition = configurationTemplate({
    ...cabinet,
    configuration: 'single-door',
  });
  definition.parts = [
    {
      id: 'beaded-door',
      kind: 'door',
      x: 1,
      y: 1,
      z: -0.75,
      width: 12,
      height: 20,
      depth: 0.75,
      faceStyle: 'beaded-shaker',
    },
    {
      id: 'plain-door',
      kind: 'door',
      x: 15,
      y: 1,
      z: -0.75,
      width: 12,
      height: 20,
      depth: 0.75,
      faceStyle: 'slab',
    },
    {
      id: 'drawers',
      kind: 'drawer',
      x: 1,
      y: 1,
      z: -0.75,
      width: 12,
      height: 20,
      depth: 0.75,
      drawerArray: {
        opening: {x: 1, y: 1, width: 12, height: 20},
        face: 'external',
        heights: [6, 6, 6],
      },
    },
    {
      id: 'tambour',
      kind: 'door',
      x: 1,
      y: 1,
      z: -0.75,
      width: 12,
      height: 20,
      depth: 0.75,
      faceStyle: 'beaded-shaker',
      door: {mechanism: 'tambour', side: 'left', travel: 1, slatSize: 2},
    },
  ];
  const item: RoomElement = {
    ...cabinet,
    face: 'beaded-shaker',
    customCabinet: {libraryId: 'test', libraryVersion: 1, definition},
  };
  const beaded = projectSchedule(study([item])).lines;
  expect(beaded[0].beadedFaces).toBe(4);
  const plainDefinition = structuredClone(definition);
  plainDefinition.parts!.forEach((part) => {
    part.faceStyle = 'slab';
  });
  const plain = projectSchedule(
    study([
      {
        ...item,
        face: 'slab',
        customCabinet: {...item.customCabinet!, definition: plainDefinition},
      },
    ]),
  ).lines;
  expect(plain[0].beadedFaces).toBe(0);
  expect(
    calculatePrice(beaded, rates).price - calculatePrice(plain, rates).price,
  ).toBeCloseTo(40, 6);
});

it('does not charge a profile without physical faces and includes the addition before range rounding', () => {
  const {rates} = setup();
  const storage = {
    ...createOpenStorage('shelving', 'open'),
    face: 'beaded-shaker' as const,
  };
  const panel = {
    ...createRoomPanel('panel', study().room),
    face: 'beaded-shaker' as const,
  };
  const schedule = projectSchedule(study([storage, panel]));
  expect(schedule.lines.every((line) => !line.beadedFaces)).toBe(true);
  const design = study([{...cabinet, face: 'beaded-shaker'}]);
  const priced = calculatePrice(projectSchedule(design).lines, rates);
  const estimate = estimateProject(design, rates);
  expect(estimate.range).toEqual(priceRange(priced.price));
  expect(estimate.assumptions.join(' ')).toContain('$10 per door/drawer face');
});

it('adds exactly $5 per beaded flat face and sums mixed profile overrides', () => {
  const {rates} = setup();
  const baseline = calculatePrice(projectSchedule(study()).lines, rates);
  const flat = projectSchedule(study([{...cabinet, face: 'beaded-flat'}]));
  expect(flat.lines[0].beadedFlatFaces).toBe(3);
  expect(flat.lines[0].beadedFaces).toBe(0);
  expect(calculatePrice(flat.lines, rates).price - baseline.price).toBeCloseTo(
    15,
    6,
  );
  expect(flat.assumptions.join(' ')).toContain('$5 per door/drawer face');
  const definition = configurationTemplate(cabinet);
  definition.parts = ['beaded-shaker', 'beaded-flat', 'slab'].map(
    (faceStyle, i) => ({
      id: `face-${i}`,
      kind: 'drawer',
      x: 1,
      y: 1 + i * 8,
      z: -0.75,
      width: 28,
      height: 7,
      depth: 0.75,
      faceStyle: faceStyle as 'beaded-shaker' | 'beaded-flat' | 'slab',
    }),
  );
  const item = {
    ...cabinet,
    customCabinet: {libraryId: 'test', libraryVersion: 1, definition},
  };
  const mixed = projectSchedule(study([item])).lines;
  expect(mixed[0]).toMatchObject({beadedFaces: 1, beadedFlatFaces: 1});
  const plain = structuredClone(item);
  plain.customCabinet.definition.parts!.forEach((part) => {
    part.faceStyle = 'slab';
  });
  expect(
    calculatePrice(mixed, rates).price -
      calculatePrice(projectSchedule(study([plain])).lines, rates).price,
  ).toBeCloseTo(15, 6);
});

it.each([
  ['flat-shaker', 0, 0, 0],
  ['beaded-flat-beaded-shaker', 2, 1, 25],
  ['flat-beaded-shaker', 2, 0, 20],
] as const)(
  'prices %s per resolved drawer face',
  (face, beadedFaces, beadedFlatFaces, charge) => {
    const {rates} = setup();
    const item = {...cabinet, face};
    const lines = projectSchedule(study([item])).lines;
    expect(lines[0]).toMatchObject({beadedFaces, beadedFlatFaces});
    const baseline = projectSchedule(study([{...item, face: 'shaker'}])).lines;
    expect(
      calculatePrice(lines, rates).price -
        calculatePrice(baseline, rates).price,
    ).toBeCloseTo(charge, 6);
    // A custom three-drawer layout must produce the same resolved counts.
    const definition = configurationTemplate(cabinet);
    definition.parts = [0, 9, 18].map((y, i) => ({
      id: `drawer-${i}`,
      kind: 'drawer',
      x: 1,
      y,
      z: -0.75,
      width: 28,
      height: 8,
      depth: 0.75,
    }));
    const custom = {
      ...item,
      customCabinet: {libraryId: 'test', libraryVersion: 1, definition},
    };
    expect(projectSchedule(study([custom])).lines[0]).toMatchObject({
      beadedFaces,
      beadedFlatFaces,
    });
  },
);
it.each([
  ['door-drawer', 36, 2, 1],
  ['sink', 36, 2, 1],
  ['farmhouse-sink', 36, 0, 2],
  ['single-door', 36, 0, 2],
  ['pullout', 30, 0, 1],
] as const)(
  'prices physical rows for %s, excluding sink aprons',
  (configuration, width, beadedFaces, beadedFlatFaces) => {
    const item = {
      ...cabinet,
      configuration,
      width,
      face: 'beaded-flat-beaded-shaker' as const,
    };
    expect(projectSchedule(study([item])).lines[0]).toMatchObject({
      beadedFaces,
      beadedFlatFaces,
    });
  },
);
