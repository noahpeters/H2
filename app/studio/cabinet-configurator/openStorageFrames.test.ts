import * as THREE from 'three';
import {expect, it} from 'vitest';
import {blankStudy} from './CabinetConfigurator';
import {continuousFrameNeighbors} from './continuousFaceFrames';
import {createOpenStorage} from './openStorage';
import {cabinetGeometry} from './roomGeometry';
import {customUnitGeometry} from './custom-unit/geometry';
import {roomFrontParts} from './custom-unit/frontLayout';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import {createCustomUnit, type CabinetPart} from './custom-unit/model';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import type {RoomElement} from './model';

const source = {slug: 'a'.repeat(32), revision: 1, updatedAt: '2026-10-04'};
const room = {...blankStudy().room, overlay: 'inset' as const};
const exportParts = (elements: RoomElement[], overlay = room.overlay) =>
  resolveFabrication(
    {room: {...room, overlay}, elements},
    source,
    DEFAULT_CONSTRUCTION,
  ).parts;

it.each([
  'shelving',
  'overhead',
  'shoes',
  'single-hang',
  'combination',
] as const)(
  'frames open %s without adding doors or drawers in preview and export',
  (type) => {
    const item = createOpenStorage(type, 'open');
    const before = JSON.stringify(item);
    const group = cabinetGeometry(item, false, false, room);
    const frames = group.children.filter(
      (p) => p.name === 'cabinet-face-frame',
    );
    expect(frames).toHaveLength(4);
    expect(
      group.children.filter((p) => p.name === 'cabinet-front'),
    ).toHaveLength(0);
    for (const member of frames) {
      const bounds = new THREE.Box3().setFromObject(member);
      expect(bounds.min.z).toBeCloseTo((item.depth / 2) * 0.0254);
      expect(bounds.max.z).toBeCloseTo((item.depth / 2 + 0.75) * 0.0254);
    }
    const stock = exportParts([item]).filter((p) =>
      p.name.startsWith('Face frame '),
    );
    expect(stock).toHaveLength(4);
    expect(stock.every((p) => p.stockType === 'solid')).toBe(true);
    expect(JSON.stringify(item)).toBe(before);
  },
);

it('keeps floating shelves unframed and full-overlay open cabinets unchanged', () => {
  for (const [item, overlay] of [
    [createOpenStorage('floating-shelves', 'floating'), 'inset'],
    [createOpenStorage('shelving', 'open'), 'full-overlay'],
  ] as const) {
    const group = cabinetGeometry(item, false, false, {...room, overlay});
    expect(
      group.children.filter((p) => p.name === 'cabinet-face-frame'),
    ).toHaveLength(0);
    const parts = resolveFabrication(
      {room: {...room, overlay}, elements: [item]},
      source,
      DEFAULT_CONSTRUCTION,
    ).parts;
    expect(parts.filter((p) => p.name.startsWith('Face frame '))).toHaveLength(
      0,
    );
  }
});

it.each([false, true])(
  'connects an open custom arch to its face frame (joined: %s)',
  (joined) => {
    const unit = createCustomUnit({
      width: 36,
      height: 60,
      depth: 16,
      root: {
        id: 'shelves',
        type: 'section',
        sectionType: 'shelves',
        properties: {shelfCount: 4},
      },
    });
    unit.frontArch = 'simple';
    const before = JSON.stringify(unit);
    const parts = roomFrontParts(
      {...unit, parts: customUnitLayoutParts(unit) as CabinetPart[]},
      'inset',
      {left: joined},
    );
    const left = parts.find((p) => p.faceFrame === 'left')!;
    const right = parts.find((p) => p.faceFrame === 'right')!;
    const arch = parts.find((p) => p.id === 'room-frame-cabinet-arch')!;
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(arch.x).toBeCloseTo(left.x + left.width);
    expect(arch.x + arch.width).toBeCloseTo(right.x);
    expect(arch.y + arch.height).toBeCloseTo(unit.height);
    expect(arch.z).toBe(left.z);
    expect(arch.depth).toBe(left.depth);
    expect(
      parts.filter((p) => p.kind === 'door' || p.kind === 'drawer'),
    ).toHaveLength(0);
    const group = customUnitGeometry(
      unit,
      {},
      {overlay: 'inset', face: 'slab', material: 'walnut'},
      undefined,
      joined ? {left: 'neighbor'} : {},
    );
    expect(
      group.children.filter((p) => p.name === 'cabinet-face-frame'),
    ).toHaveLength(joined ? 3 : 4);
    const item: RoomElement = {
      id: 'custom',
      kind: 'wall-cabinet',
      width: 36,
      height: 60,
      depth: 16,
      face: 'slab',
      placement: {mode: 'floor', x: 18, z: 30, rotation: 0},
      customCabinet: {libraryId: 'custom', libraryVersion: 1, definition: unit},
    };
    const exported = exportParts([item]);
    const stiles = exported
      .filter((p) => p.name === 'Face frame stile')
      .sort((a, b) => a.origin[0] - b.origin[0]);
    const exportedArch = exported.find(
      (p) => p.name === 'Arched face frame rail',
    )!;
    expect(stiles).toHaveLength(2);
    expect(exportedArch.mesh).toBeDefined();
    expect(exportedArch.origin[0]).toBeCloseTo(
      stiles[0].origin[0] + stiles[0].size[0],
    );
    expect(exportedArch.origin[0] + exportedArch.size[0]).toBeCloseTo(
      stiles[1].origin[0],
    );
    expect(exportedArch.origin[1]).toBeCloseTo(stiles[0].origin[1]);
    expect(JSON.stringify(unit)).toBe(before);
  },
);

it('includes open standard and custom cabinets in continuous frame runs', () => {
  const a = createOpenStorage('shelving', 'a');
  a.width = 30;
  a.placement = {mode: 'floor', x: 15, z: 30, rotation: 0};
  const unit = createCustomUnit({
    width: 30,
    height: 80,
    depth: a.depth,
    root: {id: 'open', type: 'section', sectionType: 'shelves'},
  });
  const b: RoomElement = {
    ...a,
    id: 'b',
    storage: undefined,
    placement: {mode: 'floor', x: 45, z: 30, rotation: 0},
    customCabinet: {libraryId: 'custom', libraryVersion: 1, definition: unit},
  };
  const continuousRoom = {...room, continuousFaceFrames: true};
  const neighbors = continuousFrameNeighbors([b, a], continuousRoom);
  expect(neighbors.get('a')).toEqual({right: 'b'});
  expect(neighbors.get('b')).toEqual({left: 'a'});
  const groups = [a, b].map((item) =>
    cabinetGeometry(
      item,
      false,
      false,
      continuousRoom,
      undefined,
      neighbors.get(item.id),
    ),
  );
  expect(
    groups.flatMap((g) => {
      const frames: THREE.Object3D[] = [];
      g.traverse((p) => {
        if (p.name === 'cabinet-face-frame') frames.push(p);
      });
      return frames;
    }),
  ).toHaveLength(7);
  const manifest = resolveFabrication(
    {room: continuousRoom, elements: [a, b]},
    source,
    DEFAULT_CONSTRUCTION,
  );
  expect(
    manifest.assemblies.filter((a) => a.name === 'Continuous face frame'),
  ).toHaveLength(1);
  expect(
    manifest.parts.filter((p) => p.name === 'Face frame stile'),
  ).toHaveLength(3);
  const floating = {
    ...a,
    storage: createOpenStorage('floating-shelves', 'floating').storage,
  };
  expect(continuousFrameNeighbors([floating, b], continuousRoom).size).toBe(0);
});
