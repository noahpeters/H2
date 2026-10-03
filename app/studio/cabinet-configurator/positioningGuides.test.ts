import {expect, test} from 'vitest';
import type {Study} from './CabinetConfigurator';
import type {RoomElement} from './model';
import {positioningGuides, guideDistanceLabel} from './positioningGuides';
import {islandCountertopOutline, islandWorldBounds} from './islandFootprint';

function cabinet(id: string, x: number, z: number, rotation = 0): RoomElement {
  return {
    id,
    kind: 'base',
    width: 24,
    depth: 18,
    height: 34.5,
    face: 'shaker',
    placement: {mode: 'floor', x, z, rotation},
  };
}
function sample(): Study {
  return {
    version: 2,
    room: {width: 240, depth: 180, height: 96, floor: 'oak', walls: 'plaster'},
    elements: [
      cabinet('active', 60, 60),
      cabinet('near', 100, 60),
      cabinet('far', 160, 60),
    ],
    openings: [],
    islands: [],
    selected: 'active',
    countertop: true,
    view: 'plan',
  };
}

test('reports the nearest clear gap and exact edge/center alignment across the room', () => {
  const study = sample();
  study.elements.push(
    cabinet('near-aligned', 60, 100),
    cabinet('across', 60, 150),
  );
  const original = JSON.stringify(study);
  const guides = positioningGuides(
    study,
    {kind: 'element', id: 'active'},
    0.01,
  );
  expect(guides).toContainEqual({
    kind: 'distance',
    axis: 'x',
    from: 72,
    to: 88,
    at: 60,
    distance: 16,
  });
  expect(guides.some((g) => g.kind === 'distance' && g.distance === 76)).toBe(
    false,
  );
  expect(guides).toContainEqual({
    kind: 'alignment',
    axis: 'z',
    at: 60,
    from: 43,
    to: 167,
  });
  expect(JSON.stringify(study)).toBe(original);
});

test('uses rotated bounds and ignores diagonally separated objects for gaps', () => {
  const study = sample();
  study.elements = [
    cabinet('active', 60, 60, 90),
    cabinet('near', 100, 60),
    cabinet('diagonal', 90, 120),
  ];
  const guides = positioningGuides(
    study,
    {kind: 'element', id: 'active'},
    0.01,
  );
  expect(
    guides.find((g) => g.kind === 'distance' && g.axis === 'x' && g.from > 60)
      ?.distance,
  ).toBeCloseTo(19);
  expect(
    guides
      .filter((g) => g.kind === 'distance' && g.axis === 'z')
      .map((g) => g.distance),
  ).toEqual([48, 108]);
});

test('touching neighbors block farther measurements and overlaps never produce negative gaps', () => {
  const study = sample();
  study.elements[1] = cabinet('near', 84, 60);
  const guides = positioningGuides(study, {kind: 'element', id: 'active'});
  expect(
    guides.filter(
      (g) => g.kind === 'distance' && g.axis === 'x' && g.from >= 72,
    ),
  ).toHaveLength(0);
  study.elements[1] = cabinet('near', 65, 60);
  expect(
    positioningGuides(study, {kind: 'element', id: 'active'}).every(
      (g) => g.distance === undefined || g.distance > 0,
    ),
  ).toBe(true);
});

test('alignment guides appear only within the display tolerance', () => {
  const study = sample();
  study.elements = [cabinet('active', 60, 60), cabinet('across', 61, 150)];
  const target = {kind: 'element' as const, id: 'active'};
  expect(
    positioningGuides(study, target, 2).some(
      (g) => g.kind === 'alignment' && g.axis === 'z' && g.at === 61,
    ),
  ).toBe(true);
  expect(
    positioningGuides(study, target, 0.5).some(
      (g) => g.kind === 'alignment' && g.axis === 'z' && g.at === 61,
    ),
  ).toBe(false);
});

test('wall edits measure opposing walls and update against the current dimensions', () => {
  const study = sample();
  study.elements = [];
  const target = {kind: 'wall' as const, id: 'front'};
  expect(
    positioningGuides(study, target).filter((g) => g.kind === 'distance'),
  ).toContainEqual({
    kind: 'distance',
    axis: 'z',
    from: 0,
    to: 180,
    at: 120,
    distance: 180,
  });
  study.room.depth = 200;
  expect(positioningGuides(study, target).some((g) => g.distance === 200)).toBe(
    true,
  );
  study.room.partitions = [
    {
      id: 'segment-divider',
      x: 20,
      z: 80,
      length: 120,
      orientation: 'horizontal',
    },
  ];
  expect(
    positioningGuides(study, {kind: 'wall', id: 'segment-divider'}).some(
      (g) => g.distance === 80,
    ),
  ).toBe(true);
});

test('opening aids measure neighboring openings and room edges', () => {
  const study = sample();
  study.elements = [];
  study.openings = [
    {
      id: 'active-door',
      kind: 'door',
      wall: 'back',
      offset: 40,
      width: 30,
      height: 80,
    },
    {
      id: 'near-window',
      kind: 'window',
      wall: 'back',
      offset: 100,
      width: 24,
      height: 30,
    },
  ];
  expect(
    positioningGuides(study, {kind: 'opening', id: 'active-door'}),
  ).toContainEqual({
    kind: 'distance',
    axis: 'x',
    from: 70,
    to: 100,
    at: 0,
    distance: 30,
  });
});

test('islands use finished countertop footprints and ignore their moving members', () => {
  const study = sample();
  study.islands = [
    {
      id: 'island',
      x: 60,
      z: 60,
      width: 48,
      depth: 24,
      rotation: 90,
      overhang: 12,
      seatingSide: 'south',
    },
  ];
  study.elements = [{...cabinet('member', 60, 60), islandId: 'island'}];
  const b = islandWorldBounds(
    study.islands[0],
    islandCountertopOutline(study.islands[0], study.elements, study.room),
  );
  expect(
    positioningGuides(study, {kind: 'island', id: 'island'}).find(
      (g) => g.kind === 'distance' && g.axis === 'x' && g.from === 0,
    )?.distance,
  ).toBeCloseTo(b.left);
  study.elements.push({...cabinet('member2', 100, 60), islandId: 'island'});
  expect(
    positioningGuides(study, {kind: 'element', id: 'member'}).some(
      (g) => g.distance === 16,
    ),
  ).toBe(true);
});

test('inactive and missing targets have no guides and labels keep fractional inches', () => {
  expect(positioningGuides(sample(), null)).toEqual([]);
  expect(positioningGuides(sample(), {kind: 'element', id: 'deleted'})).toEqual(
    [],
  );
  expect(guideDistanceLabel(24)).toBe('24″');
  expect(guideDistanceLabel(12.375)).toBe('12.4″');
});
