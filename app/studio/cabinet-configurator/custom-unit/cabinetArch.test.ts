import * as THREE from 'three';
import {it, expect} from 'vitest';
import {createCustomUnit, validateCustomUnit} from './model';
import {customUnitLayoutParts} from './layoutParts';
import {roomFrontParts} from './frontLayout';
import {archedFrontGeometry} from './archedFrontGeometry';
import {cabinetArchPane} from './cabinetArch';
import {shakerFrameWidth} from '../hardwarePlacement';
import {resolveFabrication} from '../fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from '../fabrication/profile';
import {blankStudy} from '../CabinetConfigurator';

it('cuts paired glass fronts to the same circle and exports closed frames with real apertures', () => {
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
  unit.frontArch = 'simple';
  const doors = roomFrontParts(
    {...unit, parts: customUnitLayoutParts(unit) as any},
    'inset',
  ).filter((part) => part.kind === 'door');
  for (const door of doors) {
    const pane = cabinetArchPane(
      door,
      shakerFrameWidth(door.width, door.height),
    );
    expect(pane.length).toBeGreaterThan(30);
    const geometry = archedFrontGeometry(door, 'shaker-glass');
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial({side: THREE.DoubleSide}),
      new THREE.MeshBasicMaterial({side: THREE.DoubleSide}),
    ]);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(0, 0, 1),
    );
    const hits = ray.intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.face!.materialIndex === 1)).toBe(true);
    geometry.dispose();
  }
  const study = blankStudy();
  study.room.overlay = 'inset';
  study.elements = [
    {
      id: 'arched',
      kind: 'wall-cabinet',
      width: 36,
      height: 60,
      depth: unit.depth,
      face: 'shaker-glass',
      placement: {mode: 'wall', wall: 'back', offset: 12, elevation: 0},
      customCabinet: {libraryId: 'local', libraryVersion: 1, definition: unit},
    },
  ];
  const manifest = resolveFabrication(
    study,
    {slug: 'test', revision: 1, updatedAt: '2026-10-04'},
    DEFAULT_CONSTRUCTION,
  );
  expect(
    manifest.parts.filter((part) => part.name === 'Arched door frame'),
  ).toHaveLength(2);
  expect(
    manifest.parts.filter((part) => part.name === 'Arched glass panel'),
  ).toHaveLength(2);
  for (const part of manifest.parts.filter((part) => part.mesh)) {
    const edges = new Map<string, number>();
    for (const face of part.mesh!.faces)
      for (let i = 0; i < face.length; i++) {
        const edge = [face[i], face[(i + 1) % face.length]]
          .sort((a, b) => a - b)
          .join(':');
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
  }
});

it('requires space for the full width-derived semicircle rather than flattening its crown', () => {
  const unit = createCustomUnit({width: 48, height: 18});
  unit.frontArch = 'simple';
  expect(validateCustomUnit(unit)).toContain(
    'Cabinet height must leave room for its full semicircular arch above the bottom rail',
  );
});

it('keeps a single door pull below the actual curved top of its latch stile', async () => {
  const {addFrontHandle} = await import('./frontHandles');
  const unit = createCustomUnit({
    width: 36,
    height: 30,
    root: {
      id: 'single',
      type: 'section',
      sectionType: 'doors',
      properties: {doorCount: 1},
    },
  });
  unit.frontArch = 'simple';
  const door = roomFrontParts(
    {...unit, parts: customUnitLayoutParts(unit) as any},
    'inset',
  ).find((part) => part.kind === 'door')!;
  const mesh = new THREE.Mesh(
    archedFrontGeometry(door, 'shaker-glass'),
    new THREE.MeshBasicMaterial(),
  );
  addFrontHandle(mesh, door, unit, {
    kind: 'base',
    face: 'shaker-glass',
    hinge: 'left',
    bodyElevation: 0,
  });
  const pull = mesh.children.find(
    (child) => child.name === 'custom-unit-handle',
  )!;
  expect(pull).toBeDefined();
  const bounds = new THREE.Box3().setFromObject(pull);
  const arch = door.cabinetArch!;
  for (const x of [bounds.min.x, bounds.max.x]) {
    const roof =
      arch.spring +
      Math.sqrt(
        arch.radius ** 2 - (door.x + door.width / 2 + x - arch.center) ** 2,
      );
    expect(door.y + door.height / 2 + bounds.max.y).toBeLessThan(roof);
  }
});

it('meets the existing shared stiles when cabinets are joined', () => {
  const unit = createCustomUnit({
    width: 36,
    height: 60,
    root: {
      id: 'joined',
      type: 'section',
      sectionType: 'doors',
      properties: {doorCount: 2},
    },
  });
  unit.frontArch = 'simple';
  const parts = roomFrontParts(
    {...unit, parts: customUnitLayoutParts(unit) as any},
    'inset',
    {left: true},
  );
  const left = parts.find((part) => part.faceFrame === 'left')!;
  const right = parts.find((part) => part.faceFrame === 'right')!;
  const arch = parts.find((part) => part.id === 'room-frame-cabinet-arch')!;
  expect(arch.x).toBe(left.x + left.width);
  expect(arch.x + arch.width).toBe(right.x);
});
