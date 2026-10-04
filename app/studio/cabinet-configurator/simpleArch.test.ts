import {
  createCustomUnit,
  splitSection,
  serializeCustomUnit,
  deserializeCustomUnit,
} from './custom-unit/model';
import {cabinetOpeningChoices, roomFrontParts} from './custom-unit/frontLayout';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {blankStudy} from './CabinetConfigurator';
import {insetArchProfile} from './simpleArch';
import {describe, expect, it} from 'vitest';
import {pointInSimpleArch, simpleArchProfile} from './simpleArch';

describe('shared simple arch', () => {
  it('uses the constrained circular radius and an authoritative outline', () => {
    expect(simpleArchProfile(36, 48).radius).toBe(18);
    expect(simpleArchProfile(36, 12).radius).toBe(12);
    expect(pointInSimpleArch(18, 48, 36, 48)).toBe(true);
    expect(pointInSimpleArch(1, 47, 36, 48)).toBe(false);
  });
});

it('migrates a legacy opening flag to one cabinet-wide arch and retains its dividers', () => {
  let unit = createCustomUnit({width: 48, height: 48});
  unit = splitSection(unit, unit.root.id, 'vertical');
  const cells = cabinetOpeningChoices(unit);
  unit.archedOpenings = [cells[0].id];
  expect(
    deserializeCustomUnit(serializeCustomUnit(unit)).archedOpenings,
  ).toEqual(unit.archedOpenings);
  const layout = customUnitLayoutParts(unit);
  const fronts = roomFrontParts({...unit, parts: layout as any}, 'inset');
  const arches = fronts.filter((p) => p.outline);
  expect(arches).toHaveLength(1);
  expect(arches[0].name).toBe('Arched face frame rail');
  expect(arches[0].width).toBe(46.5);
  expect(arches[0].x).toBe(0.75);
  expect(fronts.filter((p) => p.kind === 'divider')).toEqual(
    layout.filter((p) => p.kind === 'divider'),
  );
});

it('uses the opening circle for the matching door reveal and exports both curved components', () => {
  const unit = createCustomUnit({
    width: 24,
    height: 36,
    root: {
      id: 'one-door',
      type: 'section',
      sectionType: 'doors',
      properties: {doorCount: 1},
    },
  });
  const choices = cabinetOpeningChoices(unit);
  unit.archedOpenings = [choices[0].id];
  const parts = roomFrontParts(
    {...unit, parts: customUnitLayoutParts(unit) as any},
    'inset',
  );
  const door = parts.find((p) => p.kind === 'door')!;
  const {center, radius, spring} = door.cabinetArch!;
  const curved = door.outline!.filter((p) => door.y + p.y > spring + 0.01);
  curved.forEach((p) =>
    expect(
      Math.hypot(door.x + p.x - center, door.y + p.y - spring),
    ).toBeCloseTo(radius, 2),
  );
  const study = blankStudy();
  study.room.overlay = 'inset';
  study.elements = [
    {
      id: 'custom',
      kind: 'wall-cabinet',
      width: 24,
      height: 36,
      depth: 24,
      face: 'slab',
      placement: {mode: 'wall', wall: 'back', offset: 12, elevation: 0},
      customCabinet: {libraryId: 'local', libraryVersion: 1, definition: unit},
    },
  ];
  const manifest = resolveFabrication(
    study,
    {slug: 'test', revision: 1, updatedAt: '2026-10-04'},
    DEFAULT_CONSTRUCTION,
  );
  const curvedParts = manifest.parts.filter((p) => p.mesh);
  expect(curvedParts.map((p) => p.name)).toEqual(
    expect.arrayContaining(['Arched door', 'Arched face frame rail']),
  );
  for (const part of curvedParts) {
    const edgeCounts = new Map<string, number>();
    part.mesh!.faces.forEach((face) =>
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length],
          k = [a, b].sort((a, b) => a - b).join(':');
        edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
      }),
    );
    expect([...edgeCounts.values()].every((n) => n === 2)).toBe(true);
  }
});

it('retains the bottom reveal for short wide arch doors', () => {
  expect(insetArchProfile(36, 12, 0.125).every((p) => p.y >= 0)).toBe(true);
});

it('uses one cabinet-width circle across paired doors and retains the normal stiles', () => {
  const unit = createCustomUnit({
    width: 36,
    height: 60,
    root: {
      id: 'pair',
      type: 'section',
      sectionType: 'doors',
      properties: {doorCount: 2},
    },
  });
  const layout = customUnitLayoutParts(unit);
  const baseline = roomFrontParts({...unit, parts: layout as any}, 'inset');
  unit.frontArch = 'simple';
  const result = roomFrontParts({...unit, parts: layout as any}, 'inset');
  const doors = result.filter((part) => part.kind === 'door');
  expect(doors).toHaveLength(2);
  expect(doors[0].cabinetArch).toEqual(doors[1].cabinetArch);
  expect(doors[0].cabinetArch!.radius).toBe(16.5 - unit.reveal);
  expect(
    result.filter((part) => part.faceFrame && part.faceFrame !== 'rail'),
  ).toEqual(
    baseline.filter((part) => part.faceFrame && part.faceFrame !== 'rail'),
  );
  expect(result.filter((part) => part.kind === 'carcass')).toEqual(
    layout.filter((part) => part.kind === 'carcass'),
  );
  for (const door of doors) {
    const curve = door.outline!.filter(
      (point) => point.y + door.y > door.cabinetArch!.spring + 0.01,
    );
    expect(curve.length).toBeGreaterThan(30);
    for (const point of curve)
      expect(
        Math.hypot(
          point.x + door.x - 18,
          point.y + door.y - door.cabinetArch!.spring,
        ),
      ).toBeCloseTo(door.cabinetArch!.radius, 2);
  }
  expect(deserializeCustomUnit(serializeCustomUnit(unit)).frontArch).toBe(
    'simple',
  );
});

it('spans several shelf openings without changing the shelves or adding wider stiles', () => {
  const unit = createCustomUnit({
    width: 36,
    height: 72,
    root: {
      id: 'shelves',
      type: 'section',
      sectionType: 'shelves',
      properties: {shelfCount: 5},
    },
  });
  const layout = customUnitLayoutParts(unit);
  const result = roomFrontParts(
    {...unit, frontArch: 'simple', parts: layout as any},
    'inset',
  );
  const arch = result.find((part) => part.outline)!;
  expect(arch.width).toBe(34.5);
  expect(arch.y).toBe(54);
  expect(result.filter((part) => part.kind === 'shelf')).toEqual(
    layout.filter((part) => part.kind === 'shelf'),
  );
  expect(result.filter((part) => part.faceFrame)).toHaveLength(1);
});
