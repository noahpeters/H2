import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry, openingGeometry} from './kitchenGeometry';
import {wallToFloor, bounds, type KitchenElement, type Room} from './model';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const base: KitchenElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'front', offset: 18, elevation: 0},
};
describe('four wall kitchen geometry', () => {
  it('places front-wall objects facing inward with the correct center and bounds', () => {
    expect(wallToFloor(base, room)).toEqual({
      mode: 'floor',
      x: 33,
      z: 108,
      rotation: 180,
    });
    expect(bounds(base, room)).toEqual({
      left: 18,
      right: 48,
      top: 96,
      bottom: 120,
    });
  });
  it.each(['back', 'front', 'left', 'right'] as const)(
    'places opening geometry flush on the %s wall',
    (wall) => {
      const mesh = openingGeometry(
        {id: 'door', kind: 'door', wall, offset: 12, width: 32, height: 80},
        room,
      );
      const b = new THREE.Box3().setFromObject(mesh);
      const horizontal = wall === 'back' || wall === 'front';
      const size = b.getSize(new THREE.Vector3());
      expect(horizontal ? size.z : size.x).toBeLessThan(0.07);
      expect(horizontal ? mesh.position.z : mesh.position.x).toBeCloseTo(
        (wall === 'back'
          ? -60
          : wall === 'front'
            ? 60
            : wall === 'left'
              ? -72
              : 72) * 0.0254,
      );
    },
  );
  it('leaves a true countertop opening over the sink basin', () => {
    const sink = cabinetGeometry({...base, configuration: 'sink'}, true);
    sink.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = ray.intersectObject(sink, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeLessThan((base.height / 2) * 0.0254);
  });
});
