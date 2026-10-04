import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry} from './roomGeometry';
import {
  configurationTemplate,
  saveConfiguration,
} from './custom-unit/designConfigurations';
import {withDrawerArrays} from './custom-unit/drawerArrayEditing';
import type {RoomElement} from './model';
import {disposeStudyObject} from './studyScene';

const inch = 0.0254;
const base: RoomElement = {
  id: 'test',
  kind: 'base',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'floor', x: 0, z: 0, rotation: 0},
};
const pullNames = new Set([
  'cabinet-door-handle',
  'cabinet-drawer-handle',
  'custom-unit-handle',
]);
function checkStockContact(group: THREE.Object3D) {
  group.updateMatrixWorld(true);
  const pulls: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && pullNames.has(o.name)) pulls.push(o);
  });
  expect(pulls.length).toBeGreaterThan(0);
  for (const pull of pulls) {
    const front = pull.parent as THREE.Mesh;
    const stock: THREE.Mesh[] = [];
    front.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        !pullNames.has(o.name) &&
        o.name !== 'cabinet-handle-mount'
      )
        stock.push(o);
    });
    const frontInverse = front.matrixWorld.clone().invert();
    const projected = new THREE.Box3()
      .setFromBufferAttribute(
        pull.geometry.getAttribute('position') as THREE.BufferAttribute,
      )
      .applyMatrix4(frontInverse.clone().multiply(pull.matrixWorld));
    let rectangles: THREE.Box3[] = [];
    const boxes = front.geometry.userData.photoBoxes;
    if (boxes)
      rectangles = boxes
        .filter(
          (b: {
            fixed: boolean;
            width: number;
            height: number;
            x: number;
            y: number;
          }) => b.fixed,
        )
        .map(
          (b: {
            fixed: boolean;
            width: number;
            height: number;
            x: number;
            y: number;
          }) =>
            new THREE.Box3(
              new THREE.Vector3(
                b.x - b.width / 2,
                b.y - b.height / 2,
                -Infinity,
              ),
              new THREE.Vector3(
                b.x + b.width / 2,
                b.y + b.height / 2,
                Infinity,
              ),
            ),
        );
    else
      rectangles = stock
        .filter((o) => o !== front)
        .map((o) => {
          const bounds = new THREE.Box3()
            .setFromBufferAttribute(
              o.geometry.getAttribute('position') as THREE.BufferAttribute,
            )
            .applyMatrix4(frontInverse.clone().multiply(o.matrixWorld));
          bounds.min.z = -Infinity;
          bounds.max.z = Infinity;
          return bounds;
        });
    expect(
      rectangles.some((r) => r.expandByScalar(1e-7).containsBox(projected)),
    ).toBe(true);
    const bounds = new THREE.Box3().setFromBufferAttribute(
      front.geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    expect(projected.min.y).toBeGreaterThan(bounds.min.y);
    expect(projected.max.y).toBeLessThan(bounds.max.y);
    const feet = pull.children.filter(
      (o) => o.name === 'cabinet-handle-mount',
    ) as THREE.Mesh<THREE.CylinderGeometry>[];
    expect(feet).toHaveLength(2);
    const ray = new THREE.Raycaster();
    const outward = new THREE.Vector3(
      0,
      0,
      front.name === 'cabinet-front' ? 1 : -1,
    ).transformDirection(front.matrixWorld);
    for (const foot of feet) {
      const endpoints = [-1, 1].map((sign) =>
        new THREE.Vector3(
          0,
          (sign * foot.geometry.parameters.height) / 2,
          0,
        ).applyMatrix4(foot.matrixWorld),
      );
      const distances = endpoints.map((p) => {
        ray.set(
          p.clone().addScaledVector(outward, inch),
          outward.clone().negate(),
        );
        const hit = ray.intersectObjects(stock, false)[0];
        return hit ? hit.point.distanceTo(p) : Infinity;
      });
      expect(Math.min(...distances)).toBeLessThan(0.000001);
    }
  }
  return pulls.length;
}

describe('hardware mounted entirely on actual shaker stock', () => {
  it.each(['full-overlay', 'partial-overlay', 'inset'] as const)(
    'supports both standard and custom doors/drawers with %s',
    (overlay) => {
      for (const custom of [false, true])
        for (const drawers of [false, true]) {
          const item = {
            ...base,
            configuration: drawers ? 'three-drawer' : 'two-doors',
          } as RoomElement;
          const source = drawers
            ? withDrawerArrays(configurationTemplate(item))
            : configurationTemplate(item);
          const rendered = custom
            ? saveConfiguration([], item, source).item
            : item;
          const unchanged = JSON.stringify(rendered);
          const group = cabinetGeometry(rendered, false, false, {overlay});
          expect(checkStockContact(group)).toBe(drawers ? 3 : 2);
          expect(JSON.stringify(rendered)).toBe(unchanged);
          disposeStudyObject(group);
        }
    },
  );
  it('keeps glass-front pulls on wood stiles and attached during door movement', () => {
    const item = {
      ...base,
      kind: 'wall-cabinet',
      height: 30,
      depth: 12,
      face: 'shaker-glass',
    } as RoomElement;
    for (const custom of [false, true]) {
      const rendered = custom
        ? saveConfiguration([], item, configurationTemplate(item)).item
        : item;
      const group = cabinetGeometry(rendered, false, false, {
        overlay: 'full-overlay',
      });
      checkStockContact(group);
      const rigs: THREE.Object3D[] = [];
      group.traverse((o) => {
        if (o.userData.updateOpening) rigs.push(o);
      });
      expect(rigs.length).toBeGreaterThan(0);
      rigs.forEach((o) => o.userData.updateOpening(1));
      checkStockContact(group);
      disposeStudyObject(group);
    }
  });
});
