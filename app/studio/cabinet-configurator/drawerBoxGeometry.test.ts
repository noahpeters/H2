import {expect, it} from 'vitest';
import * as THREE from 'three';
import {drawerBoxGeometry} from './drawerBoxGeometry';
import {resolvePartApplication} from './materialRendering';

function volume(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  let result = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    result += a.dot(b.cross(c)) / 6;
  }
  return result;
}

it.each([
  [18, 5, 22],
  [4, 0.5, 1],
  [18, 30, 22],
])(
  'closes all four dovetailed walls without adding or losing wood (%s × %s × %s)',
  (width, height, length) => {
    const box = drawerBoxGeometry(
      width,
      height,
      length,
      new THREE.MeshStandardMaterial(),
    );
    const t = Math.min(0.5, width / 4, length / 4);
    const walls = box.children.filter(
      (child) => child.name !== 'drawer-box-bottom',
    ) as THREE.Mesh[];
    expect(walls).toHaveLength(4);
    expect(walls.every((wall) => volume(wall.geometry) > 0)).toBe(true);
    expect(
      walls.reduce((sum, wall) => sum + volume(wall.geometry), 0),
    ).toBeCloseTo(
      (width * length - (width - 2 * t) * (length - 2 * t)) * height,
      4,
    );
    const front = box.getObjectByName('drawer-box-front') as THREE.Mesh;
    const back = box.getObjectByName('drawer-box-back') as THREE.Mesh;
    front.geometry.computeBoundingBox();
    back.geometry.computeBoundingBox();
    expect(front.geometry.boundingBox!.min.z).toBeCloseTo(0);
    expect(front.geometry.boundingBox!.max.z).toBeCloseTo(t);
    expect(back.geometry.boundingBox!.max.z).toBeCloseTo(length);
    // Sloped joint surfaces distinguish dovetails from plain butt joints.
    const normals = walls[0].geometry.getAttribute('normal');
    expect(
      Array.from(
        {length: normals.count},
        (_, i) =>
          Math.abs(normals.getY(i)) > 0.01 && Math.abs(normals.getZ(i)) > 0.01,
      ).some(Boolean),
    ).toBe(true);
  },
);

it('locks front/back grain horizontally even for tall drawers and explicit vertical overrides', () => {
  expect(
    resolvePartApplication(
      'drawer-end',
      {width: 18, height: 30, depth: 0.5},
      {
        grainAxis: 'y',
        rotation: 90,
      },
    ),
  ).toMatchObject({grainAxis: 'x', rotation: 0});
  const material = new THREE.MeshStandardMaterial();
  material.userData.flatGrain = 'vertical';
  const box = drawerBoxGeometry(18, 30, 22, material);
  for (const name of ['drawer-box-front', 'drawer-box-back']) {
    const mesh = box.getObjectByName(name) as THREE.Mesh;
    expect(mesh.geometry.userData.materialApplication).toMatchObject({
      grainAxis: 'x',
      rotation: 0,
    });
  }
});

it('widens the side tails at the ends so the corners mechanically interlock', () => {
  const box = drawerBoxGeometry(18, 6, 22, new THREE.MeshStandardMaterial());
  const side = box.getObjectByName('drawer-box-side') as THREE.Mesh;
  const positions = side.geometry.getAttribute('position');
  const firstTailLowerEdge = (z: number) =>
    Math.min(
      ...Array.from({length: positions.count}, (_, i) => i)
        .filter(
          (i) =>
            Math.abs(positions.getZ(i) - z) < 1e-6 &&
            positions.getY(i) > -3 + 1e-6,
        )
        .map((i) => positions.getY(i)),
    );
  expect(firstTailLowerEdge(0)).toBeLessThan(firstTailLowerEdge(0.5));
});
