import {
  createCustomUnit,
  splitSection,
  serializeCustomUnit,
  deserializeCustomUnit,
} from './custom-unit/model';
import {
  cabinetOpeningChoices,
  cabinetArchChoices,
  roomFrontParts,
} from './custom-unit/frontLayout';
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

it('arches only the chosen physical open compartment and retains its horizontal shelves', () => {
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
  expect(arches[0].x + arches[0].width).toBeLessThan(unit.width / 2 + 1);
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
  const opening = door.roomOpening!;
  const radius = Math.min(opening.width / 2, opening.height) - unit.reveal;
  const spring =
    opening.height - Math.min(opening.width / 2, opening.height) - unit.reveal;
  const curved = door.outline!.filter((p) => p.y > spring + 0.01);
  curved.forEach((p) =>
    expect(Math.hypot(p.x - door.width / 2, p.y - spring)).toBeCloseTo(
      radius,
      6,
    ),
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

it('offers only top openings and keeps all existing cabinet boards and side widths', () => {
  const unit = createCustomUnit({
    width: 24,
    height: 80,
    depth: 16,
    root: {
      id: 'shelves',
      type: 'section',
      sectionType: 'shelves',
      properties: {shelfCount: 4},
    },
  });
  const original = customUnitLayoutParts(unit);
  const choices = cabinetOpeningChoices(unit);
  const eligible = cabinetArchChoices(unit);
  expect(choices.length).toBeGreaterThan(1);
  expect(eligible).toHaveLength(1);
  expect(eligible[0].y).toBe(Math.max(...choices.map((c) => c.y)));
  unit.archedOpenings = choices.map((c) => c.id);
  const result = roomFrontParts({...unit, parts: original as any}, 'inset');
  expect(result.filter((p) => p.outline)).toHaveLength(1);
  expect(result.filter((p) => !p.outline)).toEqual(original);
  expect(result.some((p) => p.name === 'Face frame stile')).toBe(false);
  const arch = result.find((p) => p.outline)!;
  const left = original.find(
    (p) => p.kind === 'carcass' && p.x === 0 && p.width < 1,
  )!;
  expect(arch.x).toBe(left.x + left.width);
  expect(arch.width).toBe(unit.width - 2 * left.width);
});

it.each(['inset', 'partial-overlay', 'full-overlay'] as const)(
  'preserves %s door and stile dimensions when adding an arch',
  (overlay) => {
    const unit = createCustomUnit({
      width: 24,
      height: 36,
      root: {
        id: 'door',
        type: 'section',
        sectionType: 'doors',
        properties: {doorCount: 1},
      },
    });
    const parts = customUnitLayoutParts(unit);
    const before = roomFrontParts({...unit, parts: parts as any}, overlay);
    const choices = cabinetArchChoices(unit);
    unit.archedOpenings = [choices[0].id];
    const after = roomFrontParts({...unit, parts: parts as any}, overlay);
    for (const part of before.filter(
      (p) =>
        p.kind === 'door' || p.faceFrame === 'left' || p.faceFrame === 'right',
    )) {
      const changed = after.find((p) => p.id === part.id)!;
      expect([
        changed.x,
        changed.y,
        changed.width,
        changed.height,
        changed.depth,
      ]).toEqual([part.x, part.y, part.width, part.height, part.depth]);
    }
    expect(
      after.filter((p) => p.faceFrame === 'left' || p.faceFrame === 'right'),
    ).toEqual(
      before.filter((p) => p.faceFrame === 'left' || p.faceFrame === 'right'),
    );
  },
);

it('suppresses legacy lower-door arches without mutating the saved cabinet', () => {
  const unit = createCustomUnit({width: 24, height: 80});
  const original = customUnitLayoutParts(unit);
  unit.parts = [
    ...original,
    ...[1, 41].map((y, i) => ({
      id: `door-${i}`,
      name: `Door ${i}`,
      kind: 'door' as const,
      x: 1,
      y,
      z: -0.75,
      width: 22,
      height: 38,
      depth: 0.75,
      arch: 'simple' as const,
    })),
  ] as any;
  const saved = JSON.stringify(unit);
  const parts = roomFrontParts(unit, 'full-overlay');
  expect(parts.find((p) => p.id === 'door-0')!.arch).toBeUndefined();
  expect(parts.find((p) => p.id === 'door-0')!.outline).toBeUndefined();
  expect(parts.find((p) => p.id === 'door-1')!.outline).toBeDefined();
  expect(JSON.stringify(unit)).toBe(saved);
});
