import {describe, expect, it} from 'vitest';
import {CABINET_MATERIALS, CABINET_PAINTS, cabinetColor} from './materials';
import {cabinetGeometry} from './kitchenGeometry';
import {Mesh, MeshStandardMaterial} from 'three';
describe('cabinet materials', () => {
  it('provides five materials and five original paint colors', () => {
    expect(Object.keys(CABINET_MATERIALS)).toHaveLength(5);
    expect(Object.keys(CABINET_PAINTS)).toHaveLength(5);
    expect(cabinetColor({})).toBe(CABINET_MATERIALS['rift-white-oak'].color);
  });
  it.each(Object.keys(CABINET_PAINTS) as (keyof typeof CABINET_PAINTS)[])(
    'uses %s for both cabinet fronts and toe kicks',
    (paintColor) => {
      const group = cabinetGeometry(
        {
          id: 'test',
          kind: 'base',
          width: 30,
          depth: 24,
          height: 34.5,
          face: 'shaker',
          material: 'paint-grade',
          paintColor,
          placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
        },
        false,
      );
      const toe = group.children[0] as Mesh;
      const front = group.getObjectByName('cabinet-front') as Mesh;
      for (const mesh of [toe, front])
        expect(
          `#${(mesh.material as MeshStandardMaterial).color.getHexString()}`,
        ).toBe(CABINET_PAINTS[paintColor].color);
    },
  );
});
