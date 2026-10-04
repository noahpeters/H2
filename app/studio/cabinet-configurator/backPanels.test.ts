import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {
  createCustomUnit,
  serializeCustomUnit,
  deserializeCustomUnit,
} from './custom-unit/model';
import {customUnitGeometry} from './custom-unit/geometry';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import {disposeStudyObject} from './studyScene';

describe('custom cabinet back panel styles', () => {
  it('round-trips the panel choice without changing shelf or structural stock', () => {
    const unit = createCustomUnit({width: 36, height: 60, depth: 16});
    unit.parts = customUnitLayoutParts(unit).map((p, i) => ({
      ...p,
      id: `stock-${i}`,
    }));
    unit.parts.push({
      id: 'back',
      kind: 'panel',
      name: 'Back',
      x: 0,
      y: 0,
      z: 15.5,
      width: 36,
      height: 60,
      depth: 0.5,
    });
    const original = structuredClone(unit.parts);
    const flat = customUnitGeometry(unit);
    const geometryCount = (group: THREE.Object3D) => {
      let count = 0;
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) count++;
      });
      return count;
    };
    const flatCount = geometryCount(flat);
    for (const style of ['vertical-shiplap', 'vertical-plank'] as const) {
      unit.parts.at(-1)!.backStyle = style;
      const restored = deserializeCustomUnit(serializeCustomUnit(unit));
      expect(restored.parts!.at(-1)!.backStyle).toBe(style);
      expect(restored.parts!.slice(0, -1)).toEqual(original.slice(0, -1));
      expect({...restored.parts!.at(-1), backStyle: undefined}).toEqual({
        ...original.at(-1),
        backStyle: undefined,
      });
      const group = customUnitGeometry(restored);
      expect(geometryCount(group)).toBeGreaterThan(flatCount);
      disposeStudyObject(group);
    }
    expect(() =>
      deserializeCustomUnit(
        JSON.stringify({
          ...unit,
          parts: [{...unit.parts!.at(-1), backStyle: 'horizontal'}],
        }),
      ),
    ).toThrow();
    disposeStudyObject(flat);
  });
});
