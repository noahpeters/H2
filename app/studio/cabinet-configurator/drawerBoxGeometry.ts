import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {mapMaterialPart, type PartRole} from './materialRendering';

/** Five physical boards. Local +Z runs from the box front toward its back. */
export function drawerBoxGeometry(
  width: number,
  height: number,
  length: number,
  material: THREE.Material,
  scale = 1,
) {
  const group = new THREE.Group();
  group.name = 'storage-drawer-box';
  const t = Math.min(0.5, width / 4, length / 4);
  const count = Math.max(1, Math.round(height / 2));
  const pitch = height / count;
  // Through dovetails: side tails widen toward the end of the board.
  const boundary: THREE.Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const y = -height / 2 + i * pitch;
    for (const [z, offset] of [
      [t, 0],
      [t, 0.25],
      [0, 0.15],
      [0, 0.85],
      [t, 0.75],
      [t, 1],
    ])
      boundary.push(new THREE.Vector2(z, y + offset * pitch));
  }
  const prism = (points: THREE.Vector2[], x: number) => {
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
      depth: t,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    // Shape coordinates are depth/height; extrusion becomes board width.
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getX(i);
      positions.setX(i, x + positions.getZ(i));
      positions.setZ(i, z);
    }
    // Swapping X/Z reverses winding. Correct each triangle before normals.
    for (let i = 0; i < positions.count; i += 3)
      for (let axis = 0; axis < 3; axis++) {
        const value = positions.getComponent(i + 1, axis);
        positions.setComponent(
          i + 1,
          axis,
          positions.getComponent(i + 2, axis),
        );
        positions.setComponent(i + 2, axis, value);
      }
    geometry.computeVertexNormals();
    return geometry;
  };
  const board = (
    name: string,
    geometry: THREE.BufferGeometry,
    role: PartRole,
  ) => {
    geometry.scale(scale, scale, scale);
    mapMaterialPart(
      geometry,
      material,
      {
        width: width * scale,
        height: height * scale,
        depth: length * scale,
      },
      scale === 1 ? 'in' : 'm',
      role,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  for (const side of [-1, 1]) {
    const contour = [
      ...boundary,
      ...boundary
        .slice()
        .reverse()
        .map(({x, y}) => new THREE.Vector2(length - x, y)),
    ];
    const mesh = board(
      'drawer-box-side',
      prism(contour, side < 0 ? -width / 2 : width / 2 - t),
      'drawer-side',
    );
    // Hairline seams keep the joinery legible on pale stock in the live view.
    // The underlying boards still contain the matching physical tails/pins.
    const points: THREE.Vector3[] = [];
    for (const rear of [false, true])
      for (let i = 1; i < boundary.length; i++)
        for (const point of [boundary[i - 1], boundary[i]])
          points.push(
            new THREE.Vector3(
              side * (width / 2 + 0.001) * scale,
              point.y * scale,
              (rear ? length - point.x : point.x) * scale,
            ),
          );
    const seams = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0x78634b,
        transparent: true,
        opacity: 0.55,
      }),
    );
    seams.name = 'drawer-dovetail-seams';
    // Decorative lines must not capture clicks with Raycaster's world-space
    // line tolerance, which can reach neighboring fronts in the meter-scale room.
    seams.raycast = () => {};
    mesh.add(seams);
    mesh.geometry.addEventListener('dispose', () => {
      seams.geometry.dispose();
      seams.material.dispose();
    });
  }
  for (const rear of [false, true]) {
    const center = new THREE.BoxGeometry(
      width - 2 * t,
      height,
      t,
    ).toNonIndexed();
    center.translate(0, 0, rear ? length - t / 2 : t / 2);
    const pieces: THREE.BufferGeometry[] = [center];
    for (const x of [-width / 2, width / 2 - t])
      for (let i = 0; i < count; i++) {
        const y = -height / 2 + i * pitch;
        // Complementary pins fill precisely the spaces between the side tails.
        for (const offsets of [
          [0, 0.25, 0.15],
          [1, 0.75, 0.85],
        ]) {
          const points = [
            new THREE.Vector2(0, y + offsets[0] * pitch),
            new THREE.Vector2(t, y + offsets[0] * pitch),
            new THREE.Vector2(t, y + offsets[1] * pitch),
            new THREE.Vector2(0, y + offsets[2] * pitch),
          ];
          if (offsets[0] === 1) points.reverse();
          if (rear) {
            points.forEach((point) => {
              point.x = length - point.x;
            });
            points.reverse();
          }
          pieces.push(prism(points, x));
        }
      }
    const geometry = mergeGeometries(pieces)!;
    pieces.forEach((piece) => piece.dispose());
    board(
      rear ? 'drawer-box-back' : 'drawer-box-front',
      geometry,
      'drawer-end',
    );
  }
  const bottom = new THREE.BoxGeometry(width, 0.5, length).toNonIndexed();
  bottom.translate(0, -height / 2, length / 2);
  board('drawer-box-bottom', bottom, 'shelf');
  return group;
}
