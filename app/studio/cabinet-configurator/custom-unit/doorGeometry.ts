import * as THREE from 'three';
import type {CabinetPart} from './model';

export type DoorMechanism =
  | 'hinged'
  | 'pocket'
  | 'tambour'
  | 'lift-up'
  | 'pull-down';

/** Preview kinematics, in inches. Opening is transient and never changes the saved part. */
export function doorPreview(
  mesh: THREE.Mesh,
  part: CabinetPart,
  opening: number,
): THREE.Object3D {
  const amount = Math.max(0, Math.min(1, opening));
  const mechanism = part.door?.mechanism ?? 'hinged';
  if (part.kind !== 'door') return mesh;
  if (mechanism === 'tambour') {
    const group = new THREE.Group();
    group.position.copy(mesh.position);
    const count = Math.ceil(part.height / (part.door?.slatSize ?? 1));
    const pitch = part.height / count;
    const radius = Math.max(1, part.depth * 2);
    for (let i = 0; i < count; i++) {
      // Follow the vertical track, a quarter-turn, then the horizontal return.
      const travel =
        (i + 0.5) * pitch + amount * (part.height + (Math.PI * radius) / 2);
      let y = travel - part.height / 2;
      let z = 0;
      let angle = 0;
      if (travel > part.height) {
        const turn = Math.min(Math.PI / 2, (travel - part.height) / radius);
        y = part.height / 2 + Math.sin(turn) * radius;
        z =
          radius * (1 - Math.cos(turn)) +
          Math.max(0, travel - part.height - (Math.PI * radius) / 2);
        angle = turn;
      }
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(part.width, pitch * 0.94, part.depth),
        (mesh.material as THREE.Material).clone(),
      );
      slat.position.set(0, y, z);
      slat.rotation.x = angle;
      slat.userData.partId = part.id;
      slat.castShadow = true;
      group.add(slat);
    }
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    return group;
  }
  if (!amount) return mesh;
  const pivot = new THREE.Group();
  pivot.position.copy(mesh.position);
  mesh.position.set(0, 0, 0);
  if (mechanism === 'lift-up' || mechanism === 'pull-down') {
    const top = mechanism === 'lift-up';
    pivot.position.y += ((top ? 1 : -1) * part.height) / 2;
    mesh.position.y = ((top ? -1 : 1) * part.height) / 2;
    pivot.rotation.x = ((top ? 1 : -1) * amount * Math.PI) / 2;
  } else {
    const right = part.door?.side === 'right';
    pivot.position.x += ((right ? 1 : -1) * part.width) / 2;
    mesh.position.x = ((right ? -1 : 1) * part.width) / 2;
    const swing = mechanism === 'pocket' ? Math.min(1, amount * 2) : amount;
    pivot.rotation.y = ((right ? -1 : 1) * swing * Math.PI) / 2;
    if (mechanism === 'pocket')
      pivot.position.z +=
        Math.max(0, amount * 2 - 1) * (part.door?.travel ?? part.width);
  }
  pivot.add(mesh);
  return pivot;
}
