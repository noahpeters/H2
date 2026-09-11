import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {createCustomUnit} from './model';
import {customUnitGeometry} from './geometry';
import {FACE_STYLES} from './facePreview';

describe('preview face styles', () => {
  for (const face of Object.keys(FACE_STYLES) as Array<
    keyof typeof FACE_STYLES
  >) {
    it(`renders ${face} without changing the shaped cabinet definition`, () => {
      const unit = createCustomUnit();
      unit.profile = {left: 'square', right: 'convex', radius: 8};
      unit.parts = [
        {
          id: 'door',
          kind: 'door',
          x: 1,
          y: 1,
          z: -0.75,
          width: 46,
          height: 34,
          depth: 0.75,
        },
      ];
      const before = JSON.stringify(unit);
      const group = customUnitGeometry(unit, {}, {face, material: 'walnut'});
      const mesh = group.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      expect(JSON.stringify(unit)).toBe(before);
      expect(
        new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y,
      ).toBeCloseTo(34);
      if (face === 'shaker-glass')
        expect(Array.isArray(mesh.material)).toBe(true);
    });
  }
});
