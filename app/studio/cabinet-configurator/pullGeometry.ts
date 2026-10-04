import * as THREE from 'three';
import type {PullLayout} from './hardwarePlacement';

/** Mount only to this moving front, including its actual rails and curved surface. */
export function mountedPull(
  front: THREE.Object3D,
  layout: PullLayout,
  direction: 1 | -1,
  units = 1,
) {
  front.updateWorldMatrix(true, true);
  const inverse = front.matrixWorld.clone().invert();
  const surface = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  front.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const copy = new THREE.Mesh(object.geometry, material);
    copy.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    surface.add(copy);
  });
  surface.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(surface);
  const ray = new THREE.Raycaster();
  const skin = (x: number, y: number) => {
    ray.set(
      new THREE.Vector3(
        x,
        y,
        direction === 1 ? bounds.max.z + units : bounds.min.z - units,
      ),
      new THREE.Vector3(0, 0, -direction),
    );
    return ray.intersectObject(surface, true)[0];
  };
  const width = layout.width * units,
    height = layout.height * units;
  const x = layout.x * units;
  let y = layout.y * units;
  // A curved/arched outline may remove the nominal corner. Keep the whole grip on stock.
  const supported = () =>
    [-1, 1].every((sx) =>
      [-1, 1].every((sy) =>
        Boolean(skin(x + (sx * width) / 2, y + (sy * height) / 2)),
      ),
    );
  for (let step = 0; !supported() && step < 200; step++) {
    const towardCenter = Math.sign(y);
    if (!towardCenter) break;
    y -= towardCenter * Math.min(Math.abs(y), 0.25 * units);
  }
  const centre = skin(x, y);
  if (!centre || !supported()) {
    material.dispose();
    return null;
  }
  const normal = centre
    .face!.normal.clone()
    .transformDirection(centre.object.matrixWorld);
  if (normal.z * direction < 0) normal.negate();
  const pull = new THREE.Mesh(
    new THREE.BoxGeometry(
      width,
      height,
      Math.min(0.35, layout.width, layout.height) * units,
    ),
    new THREE.MeshStandardMaterial({
      color: 0xb9c0c4,
      metalness: 0.65,
      roughness: 0.28,
    }),
  );
  pull.castShadow = true;
  pull.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, direction),
    normal,
  );
  pull.position.copy(centre.point).addScaledVector(normal, 0.7 * units);
  pull.updateMatrix();
  const gripInverse = pull.matrix.clone().invert();
  const horizontal = width > height;
  const offset = Math.max(0, (horizontal ? width : height) / 2 - 0.35 * units);
  for (const sign of [-1, 1]) {
    const end = new THREE.Vector3(
      horizontal ? sign * offset : 0,
      horizontal ? 0 : sign * offset,
      0,
    ).applyMatrix4(pull.matrix);
    const contact = skin(end.x, end.y);
    if (!contact) {
      pull.children.forEach((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      pull.geometry.dispose();
      (pull.material as THREE.Material).dispose();
      material.dispose();
      return null;
    }
    const start = contact.point.clone().applyMatrix4(gripInverse);
    const finish = end.clone().applyMatrix4(gripInverse);
    const vector = finish.clone().sub(start);
    const radius = Math.min(0.125, layout.width / 3, layout.height / 3) * units;
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, vector.length(), 12),
      pull.material,
    );
    foot.name = 'cabinet-handle-mount';
    foot.position.copy(start).add(finish).multiplyScalar(0.5);
    foot.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      vector.normalize(),
    );
    pull.add(foot);
  }
  material.dispose();
  return pull;
}
