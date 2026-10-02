import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry} from '../roomGeometry';
import type {RoomElement} from '../model';
import {createCustomUnit, type CabinetPart} from './model';
import {customUnitGeometry} from './geometry';
import {configurationTemplate, saveConfiguration} from './designConfigurations';
import {withDrawerArrays} from './drawerArrayEditing';

const cabinet: RoomElement = {
  id: 'cabinet',
  kind: 'base',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'floor', x: 0, z: 0, rotation: 0},
};
function handles(group: THREE.Object3D) {
  const result: THREE.Mesh<THREE.BoxGeometry>[] = [];
  group.traverse((object) => {
    if (object.name === 'custom-unit-handle')
      result.push(object as THREE.Mesh<THREE.BoxGeometry>);
  });
  return result;
}
const door: CabinetPart = {
  id: 'door',
  kind: 'door',
  x: 0,
  y: 0,
  z: -0.75,
  width: 18,
  height: 30,
  depth: 0.75,
  door: {mechanism: 'hinged', side: 'left', travel: 18, slatSize: 1},
};

describe('custom cabinet room handles', () => {
  it.each(['full-overlay', 'partial-overlay', 'inset'] as const)(
    'renders paired door and drawer-array handles with %s fronts',
    (overlay) => {
      const doors = saveConfiguration(
        [],
        cabinet,
        configurationTemplate(cabinet),
      ).item;
      const drawers = saveConfiguration(
        [],
        {...cabinet, configuration: 'three-drawer'},
        withDrawerArrays(
          configurationTemplate({...cabinet, configuration: 'three-drawer'}),
        ),
      ).item;
      for (const [item, count, horizontal] of [
        [doors, 2, false],
        [drawers, 3, true],
      ] as const) {
        const before = JSON.stringify(item);
        const group = cabinetGeometry(item, false, false, {overlay});
        group.updateMatrixWorld(true);
        const pulls = handles(group);
        expect(pulls).toHaveLength(count);
        for (const pull of pulls) {
          expect(
            pull.geometry.parameters.width > pull.geometry.parameters.height,
          ).toBe(horizontal);
          const front = pull.parent!;
          expect(new THREE.Box3().setFromObject(pull).min.z).toBeGreaterThan(
            front.getWorldPosition(new THREE.Vector3()).z,
          );
        }
        if (!horizontal) {
          expect(pulls[0].position.x).toBeGreaterThan(0);
          expect(pulls[1].position.x).toBeLessThan(0);
        }
        expect(JSON.stringify(item)).toBe(before);
      }
    },
  );
  it('keeps tall handles 36 inches above the floor, including toe kick and elevation', () => {
    const item = {
      ...cabinet,
      kind: 'tall' as const,
      height: 84,
      placement: {...cabinet.placement, elevation: 6},
    };
    const customized = saveConfiguration(
      [],
      item,
      configurationTemplate(item),
    ).item;
    const group = cabinetGeometry(customized, false, false, {
      toeKick: {height: 4, setback: 3},
    });
    group.position.y = (item.height / 2 + 6) * 0.0254;
    group.updateMatrixWorld(true);
    for (const handle of handles(group))
      expect(
        handle.getWorldPosition(new THREE.Vector3()).y / 0.0254,
      ).toBeCloseTo(36);
    expect(handles(group).length).toBeGreaterThan(0);
  });
  it('places wall-cabinet pulls near the bottom of each door', () => {
    const unit = createCustomUnit({parts: [door]});
    const group = customUnitGeometry(unit, {}, undefined, {
      kind: 'wall-cabinet',
      bodyElevation: 54,
    });
    group.updateMatrixWorld(true);
    const pull = handles(group)[0];
    const front = pull.parent as THREE.Mesh;
    const bottom =
      front.geometry.boundingBox ??
      (front.geometry.computeBoundingBox(), front.geometry.boundingBox!);
    expect(pull.position.y - bottom.min.y).toBeCloseTo(4);
  });
  it.each([
    'hinged',
    'pocket',
    'lift-up',
    'pull-down',
    'tambour',
    'drawer',
  ] as const)(
    'keeps the handle attached through %s opening and closing',
    (mechanism) => {
      const part =
        mechanism === 'drawer'
          ? {...door, kind: 'drawer' as const}
          : {...door, door: {...door.door!, mechanism, side: 'right' as const}};
      const unit = createCustomUnit({parts: [part]});
      const group = customUnitGeometry(unit, {}, undefined, {
        kind: 'base',
        bodyElevation: 4,
      });
      const pull = handles(group)[0];
      expect(pull.userData.partId).toBe('door');
      if (mechanism === 'hinged' || mechanism === 'pocket')
        expect(pull.position.x).toBeLessThan(0);
      const rig = group.children[0];
      group.updateMatrixWorld(true);
      const closed = pull.getWorldPosition(new THREE.Vector3());
      rig.userData.updateOpening(1);
      group.updateMatrixWorld(true);
      expect(
        pull.getWorldPosition(new THREE.Vector3()).distanceTo(closed),
      ).toBeGreaterThan(1);
      rig.userData.updateOpening(0);
      group.updateMatrixWorld(true);
      expect(
        pull.getWorldPosition(new THREE.Vector3()).distanceTo(closed),
      ).toBeCloseTo(0);
    },
  );
  it('keeps handles out of physical takeoff geometry and open storage', () => {
    const unit = createCustomUnit({parts: [door]});
    expect(handles(customUnitGeometry(unit))).toHaveLength(0);
    expect(
      handles(
        customUnitGeometry(createCustomUnit(), {}, undefined, {
          kind: 'base',
          bodyElevation: 4,
        }),
      ),
    ).toHaveLength(0);
  });
  it('follows a curved front surface', () => {
    const unit = createCustomUnit({
      width: 18,
      parts: [door],
      curve: {scope: 'front', profile: 'arc', radius: 30, direction: 'inward'},
    });
    const pull = handles(
      customUnitGeometry(unit, {}, undefined, {kind: 'base', bodyElevation: 4}),
    )[0];
    expect(Math.abs(pull.rotation.y)).toBeGreaterThan(0.1);
    expect(pull.position.z).toBeGreaterThan(-door.depth / 2 - 0.7);
  });
});
