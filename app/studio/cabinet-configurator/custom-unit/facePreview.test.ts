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
      const mesh = group.children[0].children[0] as THREE.Mesh;
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

it('honors saved part styles over the cabinet appearance and round trips them', async () => {
  const {serializeCustomUnit, deserializeCustomUnit, validateCustomUnit} =
    await import('./model');
  const unit = createCustomUnit();
  unit.parts = [
    {
      id: 'glass',
      kind: 'door',
      faceStyle: 'shaker-glass',
      x: 0,
      y: 0,
      z: -0.75,
      width: 20,
      height: 30,
      depth: 0.75,
    },
    {
      id: 'inside',
      kind: 'drawer',
      faceStyle: 'slab',
      x: 0,
      y: 10,
      z: 0.5,
      width: 20,
      height: 8,
      depth: 0.75,
    },
  ];
  expect(deserializeCustomUnit(serializeCustomUnit(unit)).parts).toEqual(
    unit.parts,
  );
  const rendered = customUnitGeometry(
    unit,
    {},
    {face: 'inset-shaker', material: 'walnut'},
  );
  const door = rendered.children[0].children[0] as THREE.Mesh;
  const drawer = rendered.children[1].children[0] as THREE.Mesh;
  expect(Array.isArray(door.material)).toBe(true);
  expect(drawer.geometry.getAttribute('position').count).toBe(24);
  expect(
    validateCustomUnit({
      ...unit,
      parts: [{...unit.parts[0], faceStyle: 'invalid'}],
    }),
  ).toContain('Invalid part face style');
});
