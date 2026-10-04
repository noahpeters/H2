import {describe, expect, it} from 'vitest';
import {elevationSheets} from './ElevationWorksheet';
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
    expect(sheets[0]).toMatchObject({width: 144, height: 96, countertop: 34.5});
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
  expect(front.countertop).toBe(38.5);
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
