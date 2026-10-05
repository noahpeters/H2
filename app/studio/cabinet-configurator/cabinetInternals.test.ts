import {expect, test} from 'vitest';
import * as THREE from 'three';
import {blankStudy, migrateStudy} from './CabinetConfigurator';
import {validStudy} from './savedRoomProtocol';
import {createOpenStorage} from './openStorage';
import {cabinetGeometry} from './roomGeometry';
import {
  cabinetInteriorSelection,
  exposedCabinetInterior,
} from './cabinetInternals';
import {createCustomUnit, type CabinetPart} from './custom-unit/model';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {exportBundle} from './fabrication/bundle';
import type {RoomElement} from './model';

const cabinet: RoomElement = {
  id: 'cabinet',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  configuration: 'three-drawer',
  face: 'shaker',
  material: 'walnut',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
const room = {
  ...blankStudy().room,
  overlay: 'inset' as const,
  useMapleInternals: true,
};
const source = {
  slug: 'a'.repeat(32),
  revision: 1,
  updatedAt: '2026-10-05T00:00:00Z',
};
const definition = (sectionType: 'doors' | 'drawer-stack' | 'open') =>
  createCustomUnit({
    width: 30,
    height: 30.5,
    depth: 24,
    root: {id: 'section', type: 'section', sectionType},
  });
function meshMaterials(object: THREE.Object3D) {
  const ids: string[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      for (const material of Array.isArray(child.material)
        ? child.material
        : [child.material]) {
        const id = material.userData.materialDefinition?.id;
        if (id) ids.push(id);
      }
    }
  });
  return ids;
}
const custom = (sectionType: 'doors' | 'drawer-stack' | 'open'): RoomElement =>
  ({
    ...cabinet,
    customCabinet: {definition: definition(sectionType)},
  }) as RoomElement;

test.each([true, false])(
  'saves and validates the maple preference (%s) without changing older rooms',
  (value) => {
    const study = {...blankStudy(), room: {...room, useMapleInternals: value}};
    expect(validStudy(study)).toBe(true);
    expect(
      migrateStudy(JSON.parse(JSON.stringify(study))).room.useMapleInternals,
    ).toBe(value);
    expect(
      validStudy({...study, room: {...room, useMapleInternals: 'true'}}),
    ).toBe(false);
    expect(migrateStudy(blankStudy()).room.useMapleInternals).toBeUndefined();
  },
);

test('standard hidden carcasses and moving drawer boxes render maple while fronts and frames retain walnut', () => {
  const group = cabinetGeometry(cabinet, false, false, room);
  expect(meshMaterials(group.getObjectByName('cabinet-back-panel')!)).toEqual([
    'maple',
  ]);
  expect(meshMaterials(group.getObjectByName('storage-drawer-box')!)).toEqual([
    'maple',
    'maple',
    'maple',
    'maple',
  ]);
  const front = group.getObjectByName('cabinet-front') as THREE.Mesh;
  expect(front.material).toHaveProperty(
    'userData.materialDefinition.id',
    'walnut',
  );
  expect(meshMaterials(group.getObjectByName('cabinet-face-frame')!)).toEqual([
    'walnut',
  ]);
  expect(meshMaterials(group.getObjectByName('room-toe-kick')!)).toEqual([
    'walnut',
  ]);
  const normal = cabinetGeometry(cabinet, false, false, {
    ...room,
    useMapleInternals: false,
  });
  expect(meshMaterials(normal.getObjectByName('storage-drawer-box')!)).toEqual([
    'walnut',
    'walnut',
    'walnut',
    'walnut',
  ]);
});

test.each(['open', 'doors', 'drawer-stack'] as const)(
  'custom %s stock uses the same exposed-interior rule in preview and export',
  (sectionType) => {
    const item = custom(sectionType);
    const expected = sectionType === 'open' ? 'walnut' : 'maple';
    expect(exposedCabinetInterior(item, room)).toBe(sectionType === 'open');
    const preview = cabinetGeometry(item, false, false, room);
    const panel = preview.getObjectByName('custom-unit-carcass')!;
    expect(meshMaterials(panel)).toEqual([expected]);
    const manifest = resolveFabrication(
      {room, elements: [item]},
      source,
      DEFAULT_CONSTRUCTION,
    );
    const panelStock = manifest.parts.filter(
      (p) =>
        !/^Drawer (side|back|box front|bottom)$/.test(p.name) &&
        (p.name === 'panel' || p.name === 'carcass'),
    );
    expect(panelStock.length).toBeGreaterThan(0);
    expect(
      panelStock.every(
        (p) =>
          p.material === (expected === 'maple' ? 'Maple plywood' : 'walnut'),
      ),
    ).toBe(true);
    if (sectionType === 'drawer-stack') {
      const drawerStock = manifest.parts.filter((p) =>
        /^Drawer (side|back|box front|bottom)$/.test(p.name),
      );
      expect(drawerStock.length).toBeGreaterThan(0);
      expect(drawerStock.every((p) => p.material.startsWith('Maple'))).toBe(
        true,
      );
      expect(
        meshMaterials(preview).filter((id) => id === 'maple').length,
      ).toBeGreaterThan(4);
    }
  },
);

test('any open custom compartment and independent end shelves retain the front material', () => {
  const unit = definition('doors');
  unit.root = {
    id: 'split',
    type: 'division',
    axis: 'vertical',
    weights: [1, 1],
    children: [
      {id: 'closed', type: 'section', sectionType: 'doors'},
      {id: 'open', type: 'section', sectionType: 'shelves'},
    ],
  };
  const item = {
    ...custom('doors'),
    customCabinet: {definition: unit},
  } as RoomElement;
  expect(exposedCabinetInterior(item, room)).toBe(true);
  expect(
    meshMaterials(cabinetGeometry(item, false, false, room)),
  ).not.toContain('maple');
  const closed = definition('doors');
  closed.parts = customUnitLayoutParts(closed).map((p, i) => ({
    ...p,
    id: `part-${i}`,
  })) as CabinetPart[];
  closed.parts.push({
    id: 'end-shelf',
    kind: 'shelf',
    profileMode: 'independent',
    x: 30,
    y: 12,
    z: 0,
    width: 12,
    height: 0.75,
    depth: 24,
  });
  const ended = {
    ...custom('doors'),
    customCabinet: {definition: closed},
  } as RoomElement;
  const shelf = cabinetGeometry(ended, false, false, room)
    .getObjectByName('custom-cabinet-body')!
    .children.find((child) => child.userData.partId === 'end-shelf')!;
  expect(meshMaterials(shelf)).toEqual(['walnut']);
});

test('open storage and glass-front interiors stay walnut; closed storage can use maple and room panels keep their finish', () => {
  const open: RoomElement = {
    ...createOpenStorage('drawers', 'open'),
    material: 'walnut',
    face: 'shaker',
  };
  expect(cabinetInteriorSelection(open, room).material).toBe('walnut');
  expect(
    cabinetInteriorSelection(
      {...open, storage: {...open.storage!, doors: true}},
      room,
    ).material,
  ).toBe('maple');
  expect(
    cabinetInteriorSelection(
      {...cabinet, kind: 'wall-cabinet', face: 'shaker-glass'},
      room,
    ).material,
  ).toBe('walnut');
  expect(
    cabinetInteriorSelection({...cabinet, kind: 'panel'}, room).material,
  ).toBe('walnut');
  const preview = cabinetGeometry(open, false, false, room);
  expect(meshMaterials(preview.getObjectByName('storage-shelf')!)).toEqual([
    'walnut',
  ]);
  expect(meshMaterials(preview.getObjectByName('storage-drawer-box')!)).toEqual(
    ['maple', 'maple', 'maple', 'maple'],
  );
});

test('exports maple stock and CSV without changing part dimensions, joints or fronts', () => {
  const regular = resolveFabrication(
    {room: {...room, useMapleInternals: false}, elements: [cabinet]},
    source,
    DEFAULT_CONSTRUCTION,
  );
  const maple = resolveFabrication(
    {room, elements: [cabinet]},
    source,
    DEFAULT_CONSTRUCTION,
  );
  expect(maple.parts.map(({material: _material, ...part}) => part)).toEqual(
    regular.parts.map(({material: _material, ...part}) => part),
  );
  expect(maple.parts.find((p) => p.name === 'Left side')?.material).toBe(
    'Maple plywood',
  );
  expect(maple.parts.find((p) => p.name === 'Back')?.material).toBe(
    'Maple plywood',
  );
  expect(
    maple.parts
      .filter((p) => /^Drawer (side|back|box front|bottom)$/.test(p.name))
      .every((p) => p.material.startsWith('Maple')),
  ).toBe(true);
  expect(maple.parts.find((p) => p.name === 'Toe-kick face')?.material).toBe(
    'walnut',
  );
  expect(exportBundle(maple).csv).toContain('Maple plywood');
});
