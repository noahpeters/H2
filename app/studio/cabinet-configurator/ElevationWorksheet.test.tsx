import {describe, expect, it} from 'vitest';
import {elevationSheets, ElevationWorksheet} from './ElevationWorksheet';
import {render} from '@testing-library/react';
import type {Study} from './CabinetConfigurator';

const study: Study = {
  version: 2,
  room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'white'},
  openings: [
    {
      id: 'window',
      kind: 'window',
      wall: 'back',
      offset: 72,
      width: 36,
      height: 42,
      sill: 40,
    },
  ],
  elements: [
    {
      id: 'base',
      kind: 'base',
      width: 30,
      depth: 24,
      height: 34.5,
      face: 'shaker',
      placement: {mode: 'wall', wall: 'back', offset: 12, elevation: 0},
    },
    {
      id: 'wall',
      kind: 'wall-cabinet',
      width: 30,
      depth: 12,
      height: 30,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 12, elevation: 54},
    },
    {
      id: 'island-base',
      kind: 'base',
      width: 36,
      depth: 24,
      height: 34.5,
      face: 'slab',
      islandId: 'island',
      placement: {mode: 'floor', x: 54, z: 48, rotation: 0},
    },
  ],
  islands: [
    {
      id: 'island',
      x: 72,
      z: 60,
      width: 72,
      depth: 36,
      rotation: 0,
      overhang: 0,
      seatingSide: 'none',
    },
  ],
  selected: null,
  countertop: true,
  view: 'elevation',
};

describe('elevationSheets', () => {
  it('creates cabinetry-facing wall and exposed island elevations', () => {
    const sheets = elevationSheets(study);
    expect(sheets.map(({title}) => title)).toEqual([
      'Back wall — front elevation',
      'Island — front elevation',
      'Island — back elevation',
      'Island — left elevation',
      'Island — right elevation',
    ]);
    expect(sheets[0]).toMatchObject({width: 144, height: 96});
    expect(sheets[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({id: 'base', x: 12, y: 0, width: 30}),
        expect.objectContaining({id: 'wall', y: 54, height: 30}),
      ]),
    );
    expect(sheets[0].openings[0]).toMatchObject({id: 'window', sill: 40});
  });

  it('omits walls without cabinetry or architectural openings', () => {
    expect(
      elevationSheets({...study, elements: [], openings: [], islands: []}),
    ).toEqual([]);
  });
});

it('projects separate island members without centering or clamping and uses depth in side views', () => {
  const next = structuredClone(study);
  const first = next.elements[2];
  next.elements = [
    first,
    {
      ...structuredClone(first),
      id: 'neighbor',
      placement: {mode: 'floor', x: 90, z: 48, rotation: 0, elevation: 4},
    },
  ];
  const sheets = elevationSheets(next);
  const front = sheets.find((s) => s.id === 'island-front')!;
  expect(front.items.map((i) => [i.x, i.width])).toEqual([
    [0, 36],
    [36, 36],
  ]);
  const back = sheets.find((s) => s.id === 'island-back')!;
  expect(back.items[0].x).toBeCloseTo(36, 6);
  expect(back.items[1].x).toBeCloseTo(0, 6);
  const side = sheets.find((s) => s.id === 'island-left')!;
  expect(side.items.map((i) => i.width)).toEqual([24, 24]);
  expect(front.countertops[0].y + front.countertops[0].height).toBeCloseTo(36);
  expect(front.items[0].lines.length).toBeGreaterThan(4);
});

it('retains identical projections when the island and members rotate together', () => {
  const next = structuredClone(study);
  next.elements = [next.elements[2]];
  next.openings = [];
  const before = elevationSheets(next);
  next.islands[0].rotation = 90;
  next.elements[0].placement = {
    mode: 'floor',
    x: 84,
    z: 42,
    rotation: 90,
    elevation: 0,
  };
  const after = elevationSheets(next);
  after.forEach((sheet, i) => {
    expect(sheet.items[0].x).toBeCloseTo(before[i].items[0].x, 6);
    expect(sheet.items[0].width).toBeCloseTo(before[i].items[0].width, 6);
  });
});

it('generates freestanding elevations without requiring an island container', () => {
  const next = structuredClone(study);
  next.elements = [{...next.elements[2], islandId: undefined}];
  next.islands = [];
  next.openings = [];
  expect(elevationSheets(next)).toHaveLength(4);
  expect(elevationSheets(next)[0].items[0].x).toBe(0);
});

it('hides front hardware and door details behind the opaque cabinet back', () => {
  const next = structuredClone(study);
  next.openings = [];
  next.elements = [{...next.elements[2], face: 'shaker'}];
  const sheets = elevationSheets(next);
  const front = sheets.find((s) => s.id === 'island-front')!;
  const back = sheets.find((s) => s.id === 'island-back')!;
  expect(front.items[0].lines.length).toBeGreaterThan(
    back.items[0].lines.length,
  );
});

it('draws only actual countertop runs and keeps gaps and different elevations', () => {
  const next = structuredClone(study);
  next.islands = [];
  next.elements = [
    next.elements[0],
    {
      ...next.elements[0],
      id: 'raised',
      width: 24,
      height: 36,
      placement: {mode: 'wall', wall: 'back', offset: 90, elevation: 4},
    },
    {
      ...next.elements[0],
      id: 'fridge',
      kind: 'appliance',
      applianceKind: 'refrigerator',
      width: 30,
      height: 84,
      placement: {mode: 'wall', wall: 'back', offset: 42, elevation: 0},
    },
  ];
  const sheet = elevationSheets(next)[0];
  expect(sheet.countertops).toHaveLength(2);
  const [first, second] = sheet.countertops;
  expect(first.x).toBeCloseTo(11);
  expect(first.x + first.width).toBeCloseTo(41.98);
  expect(first.y).toBeCloseTo(34.5);
  expect(first.height).toBeCloseTo(1.5);
  expect(second.x).toBeCloseTo(89);
  expect(second.width).toBeCloseTo(26);
  expect(second.y + second.height).toBeCloseTo(41.5);
  const {container} = render(<ElevationWorksheet study={next} />);
  expect(container.querySelectorAll('rect.cc-elevation-counter')).toHaveLength(
    2,
  );
  expect(container.querySelector('path.cc-elevation-counter')).toBeNull();
  expect(elevationSheets({...next, countertop: false})[0].countertops).toEqual(
    [],
  );
});

it('places rectangular and arched doors and passageways on the floor on every wall, ignoring stale sills', () => {
  const next = structuredClone(study);
  next.elements = [];
  next.islands = [];
  next.room.height = 111;
  next.openings = (['back', 'right', 'front', 'left'] as const).flatMap(
    (wall) =>
      (['door', 'opening'] as const).flatMap((kind, index) =>
        [undefined, 'simple' as const].map((arch, n) => ({
          id: `${wall}-${kind}-${n}`,
          kind,
          wall,
          offset: 12 + index * 48 + n * 24,
          width: 24,
          height: 80,
          sill: 42,
          arch,
        })),
      ),
  );
  const {container} = render(<ElevationWorksheet study={next} />);
  for (const svg of container.querySelectorAll('svg')) {
    const floor = 44 + 260;
    for (const opening of svg.querySelectorAll('.cc-elevation-opening')) {
      const rect = opening.querySelector('rect');
      if (rect)
        expect(
          Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')),
        ).toBeCloseTo(floor);
      else {
        const values = opening
          .querySelector('path')!
          .getAttribute('d')!
          .match(/-?\d+(?:\.\d+)?/g)!
          .map(Number);
        const heights = values.filter((_, i) => i % 2 === 1);
        expect(Math.max(...heights)).toBeCloseTo(floor);
        expect(Math.min(...heights)).toBeCloseTo(floor - (80 * 260) / 111);
      }
    }
  }
  const back = elevationSheets(next).find((sheet) => sheet.id === 'back')!;
  const front = elevationSheets(next).find((sheet) => sheet.id === 'front')!;
  expect(back.openings[0].offset).toBe(12);
  expect(front.openings[0].offset).toBe(next.room.width - 12 - 24);
});

it('retains explicit window sills and uses the same default sill as the 3D scene', () => {
  const next = structuredClone(study);
  next.elements = [];
  next.islands = [];
  next.openings = [
    next.openings[0],
    {...next.openings[0], id: 'default', offset: 12, sill: undefined},
  ];
  const {container} = render(<ElevationWorksheet study={next} />);
  const rects = [...container.querySelectorAll('.cc-elevation-opening rect')];
  const scale = 260 / next.room.height,
    floor = 304;
  expect(
    Number(rects[0].getAttribute('y')) +
      Number(rects[0].getAttribute('height')),
  ).toBeCloseTo(floor - 40 * scale);
  expect(
    Number(rects[1].getAttribute('y')) +
      Number(rects[1].getAttribute('height')),
  ).toBeCloseTo(floor - 42 * scale);
});

it('includes dishwasher tops and omits countertops from wall-only cabinetry', () => {
  const next = structuredClone(study);
  next.islands = [];
  next.elements = [
    {...next.elements[0], kind: 'appliance', applianceKind: 'dishwasher'},
  ];
  expect(elevationSheets(next)[0].countertops).toHaveLength(1);
  next.elements = [study.elements[1]];
  expect(elevationSheets(next)[0].countertops).toEqual([]);
});
