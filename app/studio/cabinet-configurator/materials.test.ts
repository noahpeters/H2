import {describe, expect, it} from 'vitest';
import {CABINET_MATERIALS, CABINET_PAINTS, cabinetColor} from './materials';
import {cabinetGeometry} from './kitchenGeometry';
import {applianceGeometry} from './applianceGeometry';
import {hasMaterialFinish} from './materials';
import {Mesh, MeshStandardMaterial} from 'three';
describe('cabinet materials', () => {
  it.each(['refrigerator', 'dishwasher'] as const)(
    'colors %s panels for wood and paint finishes',
    (kind) => {
      for (const style of ['shaker', 'slab'] as const) {
        expect(
          hasMaterialFinish({
            kind: 'appliance',
            applianceKind: kind,
            applianceFront: style,
          }),
        ).toBe(true);
        for (const color of [
          CABINET_MATERIALS.walnut.color,
          CABINET_PAINTS['sage-green'].color,
        ]) {
          const group = applianceGeometry(
            kind,
            0.76,
            1.8,
            0.6,
            style,
            false,
            color,
          );
          const panels = group.children.filter(
            (child) => child.name === 'appliance-panel',
          ) as Mesh[];
          expect(panels).toHaveLength(kind === 'refrigerator' ? 2 : 1);
          for (const panel of panels)
            expect(
              `#${(panel.material as MeshStandardMaterial).color.getHexString()}`,
            ).toBe(color);
        }
      }
      expect(
        hasMaterialFinish({
          kind: 'appliance',
          applianceKind: kind,
          applianceFront: 'stainless',
        }),
      ).toBe(false);
      expect(
        applianceGeometry(
          kind,
          0.76,
          1.8,
          0.6,
          'stainless',
          false,
          '#929d86',
        ).getObjectByName('appliance-panel'),
      ).toBeUndefined();
    },
  );
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
