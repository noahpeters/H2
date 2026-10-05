import type {PerspectiveCamera, Vector3} from 'three';

export const CAMERA_POSITION_LIMIT = 50;
export type CameraPose = {
  /** World-space metres, independent of viewport dimensions. */
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
  fov: number;
};
export type SavedCameraPosition = CameraPose & {id: string; name: string};
export function validCameraPositions(
  value: unknown,
): value is SavedCameraPosition[] {
  if (!Array.isArray(value) || value.length > CAMERA_POSITION_LIMIT)
    return false;
  const vector = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (n) =>
        typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000,
    );
  const ids = new Set<string>();
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const v = entry as Record<string, unknown>;
    if (
      !v ||
      typeof v.id !== 'string' ||
      !v.id.length ||
      v.id.length > 100 ||
      ids.has(v.id) ||
      typeof v.name !== 'string' ||
      !v.name.trim() ||
      v.name.length > 80 ||
      !vector(v.position) ||
      !vector(v.target) ||
      typeof v.zoom !== 'number' ||
      !Number.isFinite(v.zoom) ||
      v.zoom < 0.01 ||
      v.zoom > 100 ||
      typeof v.fov !== 'number' ||
      !Number.isFinite(v.fov) ||
      v.fov < 1 ||
      v.fov > 120
    )
      return false;
    ids.add(v.id);
    const target = v.target;
    return (
      Math.hypot(...v.position.map((n: number, i: number) => n - target[i])) >
      0.000001
    );
  });
}
export function captureCameraPosition(
  camera: PerspectiveCamera,
  target: Vector3,
): CameraPose {
  return {
    position: camera.position.toArray(),
    target: target.toArray(),
    zoom: camera.zoom,
    fov: camera.fov,
  };
}
export function restoreCameraPosition(
  camera: PerspectiveCamera,
  controls: {target: Vector3; enableDamping: boolean; update: () => unknown},
  pose: CameraPose,
) {
  // Flush pending orbit/pan deltas before restoring; a coasting gesture must not move the saved view.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  try {
    controls.update();
    camera.position.fromArray(pose.position);
    controls.target.fromArray(pose.target);
    camera.zoom = pose.zoom;
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    controls.update();
    camera.updateMatrixWorld(true);
  } finally {
    controls.enableDamping = damping;
  }
}
