import {expect, it} from 'vitest';
import {createCustomUnit} from './model';
import {roomFrontParts} from './frontLayout';
import {customUnitLayoutParts} from './layoutParts';
import {customUnitGeometry} from './geometry';
import {resolveFabrication} from '../fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from '../fabrication/profile';
import {blankStudy} from '../CabinetConfigurator';
import type {RoomElement} from '../model';
const definition = () => {
  const unit = createCustomUnit({width: 30, height: 30.5, depth: 24});
  unit.root = {id: 'doors', type: 'section', sectionType: 'doors'};
  return unit;
};
it.each(['full-overlay', 'partial-overlay', 'inset'] as const)(
  'custom preview and export respect room %s',
  (overlay) => {
    const unit = definition(),
      before = JSON.stringify(unit);
    const parts = roomFrontParts(
      {...unit, parts: customUnitLayoutParts(unit) as typeof unit.parts},
      overlay,
    );
    const frame = parts.filter((p) => p.faceFrame);
    expect(frame).toHaveLength(overlay === 'full-overlay' ? 0 : 5);
    const group = customUnitGeometry(
      unit,
      {},
      {overlay, face: 'slab', material: 'walnut'},
    );
    expect(
      group.children.filter((p) => p.name === 'cabinet-face-frame'),
    ).toHaveLength(frame.length);
    const element: RoomElement = {
      id: 'custom',
      kind: 'base',
      width: 30,
      height: 34.5,
      depth: 24,
      face: 'slab',
      placement: {mode: 'floor', x: 15, z: 30, rotation: 0},
      customCabinet: {libraryId: 'custom', libraryVersion: 1, definition: unit},
    };
    const study = blankStudy();
    const manifest = resolveFabrication(
      {...study, room: {...study.room, overlay}, elements: [element]},
      {slug: 'a'.repeat(32), revision: 1, updatedAt: '2026-10-02'},
      DEFAULT_CONSTRUCTION,
    );
    const stock = manifest.parts.filter((p) =>
      p.name.startsWith('Face frame '),
    );
    expect(stock).toHaveLength(frame.length);
    for (const part of stock) {
      expect(part.stockType).toBe('solid');
      expect(part.pockets).toEqual([]);
    }
    const door = manifest.parts.find((p) => p.name === 'Door')!;
    const preview = parts.find((p) => p.kind === 'door')!;
    expect(door.size[0]).toBeCloseTo(preview.width);
    expect(door.origin[1]).toBeCloseTo(preview.z - 12);
    expect(JSON.stringify(unit)).toBe(before);
  },
);
it('joins custom cabinets in continuous room frames', () => {
  const unit = definition(),
    study = blankStudy();
  const elements: RoomElement[] = [0, 1].map((i) => ({
    id: `custom-${i}`,
    kind: 'base',
    width: 30,
    height: 34.5,
    depth: 24,
    face: 'slab',
    placement: {mode: 'floor', x: 15 + 30 * i, z: 30, rotation: 0},
    customCabinet: {libraryId: 'custom', libraryVersion: 1, definition: unit},
  }));
  const manifest = resolveFabrication(
    {
      ...study,
      room: {...study.room, overlay: 'inset', continuousFaceFrames: true},
      elements,
    },
    {slug: 'a'.repeat(32), revision: 1, updatedAt: '2026-10-02'},
    DEFAULT_CONSTRUCTION,
  );
  expect(
    manifest.assemblies.filter((a) => a.name === 'Continuous face frame'),
  ).toHaveLength(1);
  expect(
    manifest.parts.filter((p) => p.name === 'Face frame stile'),
  ).toHaveLength(5);
  for (const p of manifest.parts.filter((p) =>
    p.name.startsWith('Face frame '),
  ))
    expect(p.pockets).toEqual([]);
});

it('reprojects saved flush inset fronts when room settings change', () => {
  const unit = definition();
  unit.parts = (
    customUnitLayoutParts(unit) as NonNullable<typeof unit.parts>
  ).map((p) => (p.kind === 'door' ? {...p, z: 0} : p));
  const projected = roomFrontParts(unit, 'partial-overlay');
  expect(projected.filter((p) => p.faceFrame)).toHaveLength(5);
  for (const part of projected.filter((p) => p.kind === 'door'))
    expect(part.z).toBe(-1.5);
});
