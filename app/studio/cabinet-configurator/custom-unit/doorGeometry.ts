import * as THREE from 'three';
import type {CabinetPart} from './model';
export type DoorMechanism =
  | 'hinged'
  | 'pocket'
  | 'tambour'
  | 'lift-up'
  | 'pull-down';

/** A reusable motion rig: animate transforms without rebuilding meshes every frame. */
export function doorPreview(
  mesh: THREE.Mesh,
  part: CabinetPart,
  opening: number,
  cabinetDepth = 24,
): THREE.Object3D {
  if (part.kind !== 'door' && part.kind !== 'drawer') return mesh;
  const rig = new THREE.Group();
  rig.position.copy(mesh.position);
  const origin = rig.position.clone();
  mesh.position.set(0, 0, 0);
  const mechanism = part.door?.mechanism ?? 'hinged';
  let update: (amount: number) => void;
  if (part.kind === 'drawer') {
    rig.add(mesh);
    const length = Math.max(
      1,
      cabinetDepth - Math.max(0, part.z) - part.depth - 0.75,
    );
    const width = Math.max(0.5, part.width - 1);
    const height = Math.max(0.5, part.height - 1);
    const material = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as THREE.Material;
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        material.clone(),
      );
      board.position.set(x, y, z);
      board.userData.partId = part.id;
      board.castShadow = true;
      rig.add(board);
    };
    box(width, 0.5, length, 0, -height / 2, part.depth / 2 + length / 2);
    for (const side of [-1, 1])
      box(
        0.5,
        height,
        length,
        (side * (width - 0.5)) / 2,
        0,
        part.depth / 2 + length / 2,
      );
    box(width, height, 0.5, 0, 0, part.depth / 2 + length - 0.25);
    update = (amount) => {
      rig.position.z = origin.z - amount * length;
    };
  } else if (mechanism === 'tambour') {
    const horizontal = part.door?.direction === 'horizontal';
    const sign = horizontal && part.door?.side === 'left' ? -1 : 1;
    const span = horizontal ? part.width : part.height;
    const count = Math.ceil(span / (part.door?.slatSize ?? 1));
    const pitch = span / count;
    const radius = Math.max(1, part.depth * 2);
    const material = Array.isArray(mesh.material)
      ? mesh.material[0]
      : mesh.material;
    for (let i = 0; i < count; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(
          horizontal ? pitch * 0.94 : part.width,
          horizontal ? part.height : pitch * 0.94,
          part.depth,
        ),
        material.clone(),
      );
      slat.userData.partId = part.id;
      slat.castShadow = true;
      rig.add(slat);
    }
    mesh.geometry.dispose();
    material.dispose();
    update = (amount) =>
      rig.children.forEach((slat, i) => {
        const travel = (i + 0.5) * pitch + amount * span;
        const turn = Math.max(0, (travel - span) / radius);
        // Roll around a spool behind the top or side of the opening.
        const coilRadius =
          radius + (Math.max(0, turn - Math.PI) * part.depth) / (2 * Math.PI);
        const along =
          travel <= span
            ? travel - span / 2
            : span / 2 + Math.sin(turn) * coilRadius;
        const z = travel <= span ? 0 : radius - coilRadius * Math.cos(turn);
        slat.position.set(
          horizontal ? sign * along : 0,
          horizontal ? 0 : along,
          z,
        );
        if (horizontal) slat.rotation.y = -sign * turn;
        else slat.rotation.x = turn;
      });
  } else {
    rig.add(mesh);
    if (mechanism === 'lift-up' || mechanism === 'pull-down') {
      const sign = mechanism === 'lift-up' ? 1 : -1;
      rig.position.y += (sign * part.height) / 2;
      mesh.position.y = (-sign * part.height) / 2;
      update = (amount) => {
        rig.rotation.x = (sign * amount * Math.PI) / 2;
      };
    } else {
      const sign = part.door?.side === 'right' ? -1 : 1;
      rig.position.x -= (sign * part.width) / 2;
      mesh.position.x = (sign * part.width) / 2;
      update = (amount) => {
        const swing = mechanism === 'pocket' ? Math.min(1, amount * 2) : amount;
        rig.rotation.y = (sign * swing * Math.PI) / 2;
        rig.position.z =
          origin.z +
          (mechanism === 'pocket'
            ? Math.max(0, amount * 2 - 1) * (part.door?.travel ?? part.width)
            : 0);
      };
    }
  }
  rig.userData.updateOpening = (value: number) =>
    update(Math.max(0, Math.min(1, value)));
  rig.userData.updateOpening(opening);
  return rig;
}
