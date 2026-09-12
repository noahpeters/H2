import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry} from './kitchenGeometry';
import {
  configurationTemplate,
  saveConfiguration,
} from './custom-unit/designConfigurations';
import type {KitchenElement} from './model';
const inch = 0.0254;
const base: KitchenElement = {
  id: 'base',
  kind: 'base',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'slab',
  configuration: 'three-drawer',
  placement: {mode: 'floor', x: 48, z: 48, rotation: 0, elevation: 2},
};
const bounds = (object: THREE.Object3D) => {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
};

describe('precise custom cabinet dimensions', () => {
  it.each([false, true])(
    'matches standard base height with countertop=%s',
    (countertop) => {
      for (const height of [30, 34.5, 40]) {
        const item = {...base, height};
        const custom = saveConfiguration(
          [],
          item,
          configurationTemplate(item),
        ).item;
        for (const shared of [false, true]) {
          const standardBounds = bounds(
            cabinetGeometry(item, countertop, shared),
          );
          const customBounds = bounds(
            cabinetGeometry(custom, countertop, shared),
          );
          const expectedTop = height / 2 + (countertop && !shared ? 1.5 : 0);
          expect(customBounds.max.y / inch).toBeCloseTo(expectedTop, 5);
          expect(customBounds.min.y / inch).toBeCloseTo(-height / 2, 5);
          expect(customBounds.max.y).toBeCloseTo(standardBounds.max.y, 6);
          expect(custom.height).toBe(height);
        }
      }
    },
  );
  it('preserves exact part sizes, setbacks and bottom offsets instead of stretching visible bounds', () => {
    const definition = {
      ...configurationTemplate(base),
      parts: [
        {
          id: 'precise-drawer',
          kind: 'drawer' as const,
          x: 1.5,
          y: 12.25,
          z: 2.25,
          width: 21.375,
          height: 6.125,
          depth: 0.75,
        },
      ],
    };
    const item = saveConfiguration([], base, definition).item;
    const before = JSON.stringify(item);
    const geometry = cabinetGeometry(item, false);
    const part = geometry.getObjectByName('custom-unit-drawer')!;
    const actual = bounds(part);
    const size = actual.getSize(new THREE.Vector3()).divideScalar(inch);
    expect(size.x).toBeCloseTo(21.375, 5);
    expect(size.y).toBeCloseTo(6.125, 5);
    expect(size.z).toBeCloseTo(0.75, 5);
    expect(actual.min.x / inch).toBeCloseTo(-base.width / 2 + 1.5, 5);
    expect(actual.min.y / inch).toBeCloseTo(-base.height / 2 + 4 + 12.25, 5);
    expect(actual.max.z / inch).toBeCloseTo(base.depth / 2 - 2.25, 5);
    expect(JSON.stringify(item)).toBe(before);
  });
  it('does not shrink the body when a part projects beyond the nominal envelope', () => {
    const template = configurationTemplate(base);
    const part = {
      id: 'end',
      kind: 'shelf' as const,
      x: base.width,
      y: 15,
      z: 0,
      width: 12,
      height: 0.75,
      depth: 24,
    };
    const item = saveConfiguration([], base, {...template, parts: [part]}).item;
    const actual = bounds(
      cabinetGeometry(item, false).getObjectByName('custom-unit-shelf')!,
    );
    expect(actual.min.x / inch).toBeCloseTo(base.width / 2, 5);
    expect(actual.max.x / inch).toBeCloseTo(base.width / 2 + 12, 5);
    expect(actual.getSize(new THREE.Vector3()).y / inch).toBeCloseTo(0.75, 5);
  });
  it.each(['sink', 'farmhouse-sink'] as const)(
    'retains standard %s countertop and fixture elevations',
    (configuration) => {
      const item = {...base, configuration};
      const custom = saveConfiguration(
        [],
        item,
        configurationTemplate(item),
      ).item;
      for (const shared of [false, true]) {
        expect(bounds(cabinetGeometry(custom, true, shared)).max.y).toBeCloseTo(
          bounds(cabinetGeometry(item, true, shared)).max.y,
          6,
        );
      }
    },
  );
});
