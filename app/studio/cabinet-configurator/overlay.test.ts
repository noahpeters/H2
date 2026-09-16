import {describe, expect, it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as THREE from 'three';
import {
  blankStudy,
  CabinetConfigurator,
  migrateStudy,
} from './CabinetConfigurator';
import {OVERLAY_OPTIONS} from './overlay';
import {validStudy} from './savedRoomProtocol';
import {cabinetGeometry} from './roomGeometry';
import {
  createCustomUnit,
  deserializeCustomUnit,
  type CabinetPart,
} from './custom-unit/model';
import {
  customUnitGeometry,
  customUnitLayoutParts,
} from './custom-unit/geometry';
import {roomFrontParts} from './custom-unit/frontLayout';
import {partInOpening} from './custom-unit/openingPlacement';
import {
  loadCreationPreferences,
  CREATION_PREFERENCES_KEY,
} from './creationPreferences';
import type {RoomElement} from './model';

const base: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  configuration: 'door-drawer',
  face: 'shaker',
  placement: {mode: 'wall', wall: 'back', offset: 0, elevation: 0},
};
function mixedUnit() {
  const unit = createCustomUnit({width: 30, height: 30, depth: 24});
  unit.parts = customUnitLayoutParts(unit).filter(
    (p) => p.kind === 'carcass',
  ) as CabinetPart[];
  unit.parts.push({
    id: 'divider',
    kind: 'shelf',
    x: 0.75,
    y: 14.625,
    z: 0,
    width: 28.5,
    height: 0.75,
    depth: 24,
  });
  const lower = {
    id: 'lower',
    x: 0.75,
    y: 0.75,
    width: 28.5,
    height: 13.875,
    depth: 24,
  };
  const upper = {
    id: 'upper',
    x: 0.75,
    y: 15.375,
    width: 28.5,
    height: 13.875,
    depth: 24,
  };
  unit.parts.push({...partInOpening(unit, 'door', upper), id: 'door'});
  unit.parts.push({...partInOpening(unit, 'drawer-array', lower), id: 'array'});
  return unit;
}

describe('room overlay', () => {
  it('defaults old rooms to full overlay and migrates all nested styles without modifying input', () => {
    const unit = mixedUnit();
    const raw = {
      ...blankStudy(),
      elements: [
        {
          ...base,
          face: 'inset-shaker',
          customCabinet: {
            libraryId: 'old',
            libraryVersion: 1,
            definition: {
              ...unit,
              parts: unit.parts!.map((p) =>
                p.kind === 'door' ? {...p, faceStyle: 'inset-shaker'} : p,
              ),
            },
          },
        },
      ],
      configurations: [
        {
          id: 'old',
          version: 1,
          name: 'Old',
          category: 'base',
          definition: unit,
          template: {...base, face: 'inset-shaker'},
        },
      ],
    };
    const before = JSON.stringify(raw);
    const migrated = migrateStudy(raw);
    expect(migrated.room.overlay).toBe('full-overlay');
    expect(JSON.stringify(migrated)).not.toContain('inset-shaker');
    expect(migrated.elements[0].face).toBe('shaker');
    expect(
      migrated.elements[0].customCabinet!.definition.parts!.find(
        (p) => p.kind === 'door',
      )!.faceStyle,
    ).toBe('shaker');
    expect(JSON.stringify(raw)).toBe(before);
    expect(migrateStudy(migrated)).toEqual(migrated);
  });
  it.each(OVERLAY_OPTIONS)(
    'persists %s through saved-room validation and reload',
    (overlay) => {
      const study = {
        ...blankStudy(),
        room: {...blankStudy().room, overlay},
        elements: [base],
      };
      expect(validStudy(study)).toBe(true);
      expect(migrateStudy(JSON.parse(JSON.stringify(study))).room.overlay).toBe(
        overlay,
      );
    },
  );
  it('rejects unknown settings while accepting old saved rooms', () => {
    const study = blankStudy();
    delete study.room.overlay;
    expect(validStudy(study)).toBe(true);
    expect(
      validStudy({...study, room: {...study.room, overlay: 'invalid'}}),
    ).toBe(false);
  });
  it('migrates imported part styles and remembered cabinet preferences', () => {
    const unit = mixedUnit();
    const raw = {
      ...unit,
      parts: unit.parts!.map((p) =>
        p.kind === 'door' ? {...p, faceStyle: 'inset-shaker'} : p,
      ),
    };
    expect(
      JSON.stringify(deserializeCustomUnit(JSON.stringify(raw))),
    ).not.toContain('inset-shaker');
    const prefs = loadCreationPreferences({
      getItem: (key) =>
        key === CREATION_PREFERENCES_KEY
          ? JSON.stringify({
              version: 1,
              sharedCabinet: {face: 'inset-shaker'},
              scopes: {'cabinet:base': {face: 'inset-shaker'}},
            })
          : null,
    });
    expect(prefs.sharedCabinet!.face).toBe('shaker');
    expect(prefs.scopes['cabinet:base'].face).toBe('shaker');
  });
  it.each(OVERLAY_OPTIONS)(
    'aligns custom doors and drawer arrays for %s without altering the composition',
    (overlay) => {
      const unit = mixedUnit(),
        before = JSON.stringify(unit);
      const parts = roomFrontParts(unit, overlay);
      const door = parts.find((p) => p.kind === 'door')!;
      const drawers = parts.filter((p) => p.kind === 'drawer');
      const width =
        overlay === 'full-overlay'
          ? 29.75
          : overlay === 'partial-overlay'
            ? 29
            : 28.25;
      expect(door.width).toBeCloseTo(width);
      for (const drawer of drawers) {
        expect(drawer.x).toBeCloseTo(door.x);
        expect(drawer.width).toBeCloseTo(door.width);
        expect(drawer.z).toBe(door.z);
      }
      expect(door.z).toBe(overlay === 'inset' ? 0 : -0.75);
      for (const face of ['shaker', 'slab', 'vertical-slat'] as const) {
        const group = customUnitGeometry(
          unit,
          {},
          {face, overlay, material: 'walnut'},
        );
        const meshes: THREE.Mesh[] = [];
        group.traverse((object) => {
          if (
            object instanceof THREE.Mesh &&
            ['custom-unit-door', 'custom-unit-drawer'].includes(object.name)
          )
            meshes.push(object);
        });
        for (const mesh of meshes)
          expect(
            new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).x,
          ).toBeCloseTo(width);
      }
      expect(JSON.stringify(unit)).toBe(before);
    },
  );
  it.each(OVERLAY_OPTIONS)(
    'keeps internal drawers behind doors for %s',
    (overlay) => {
      const unit = mixedUnit();
      const internal: CabinetPart = {
        id: 'internal',
        kind: 'drawer',
        x: 1,
        y: 20,
        z: 1,
        width: 27,
        height: 4,
        depth: 0.75,
      };
      unit.parts!.push(internal);
      expect(
        roomFrontParts(unit, overlay).find((p) => p.id === 'internal'),
      ).toEqual(internal);
    },
  );
  it.each(OVERLAY_OPTIONS)(
    'applies %s equally to standard shaker doors and drawers',
    (overlay) => {
      const group = cabinetGeometry(base, false, false, {overlay});
      const fronts = group.children.filter(
        (p) => p.name === 'cabinet-front',
      ) as THREE.Mesh<THREE.BoxGeometry>[];
      expect(fronts.length).toBeGreaterThan(1);
      expect(new Set(fronts.map((p) => p.geometry.parameters.width)).size).toBe(
        1,
      );
      expect(new Set(fronts.map((p) => p.position.z)).size).toBe(1);
    },
  );
  it('offers overlay only in Room and removes the obsolete style', () => {
    const markup = renderToStaticMarkup(createElement(CabinetConfigurator));
    for (const overlay of OVERLAY_OPTIONS)
      expect(markup).toContain(`value="${overlay}"`);
    expect(markup).toContain('Front overlay');
    expect(markup).not.toContain('inset-shaker');
  });
});
