import * as THREE from 'three';
import type {Room} from './model';
import {roomPoints} from './roomOutline';
import {temperatureColor} from './photoLighting';

export type PhotoDaylight = {
  enabled: boolean;
  azimuth: number;
  altitude: number;
  sky: number;
  sun: number;
  angularDiameter: number;
};
export const DEFAULT_PHOTO_DAYLIGHT: PhotoDaylight = {
  enabled: false,
  azimuth: 135,
  altitude: 35,
  sky: 1,
  sun: 10,
  angularDiameter: 0.5,
};
export function sunDirection(value: PhotoDaylight) {
  const a = (value.azimuth * Math.PI) / 180,
    h = (value.altitude * Math.PI) / 180;
  // Azimuth 0 faces +Z, 90 faces +X in the designer's world axes.
  return new THREE.Vector3(
    Math.sin(a) * Math.cos(h),
    Math.sin(h),
    Math.cos(a) * Math.cos(h),
  );
}
/** Explicit analytic daylight, not geographic/weather simulation. Only light outside apertures enters.
 * A distant finite emitter gives deterministic sun penumbra; sky has no embedded sun to double-count. */
export function addDirectionalDaylight(
  scene: THREE.Scene,
  daylight: PhotoDaylight,
  temperature: number,
  intensity = 1,
) {
  const skyColor = temperatureColor(temperature);
  const width = 128,
    height = 64,
    data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const elevation = -Math.cos(((y + 0.5) / height) * Math.PI);
      const radiance =
        elevation > 0
          ? intensity * daylight.sky * (0.5 + 0.5 * Math.sqrt(elevation))
          : 0;
      data.set(
        [
          skyColor.r * radiance,
          skyColor.g * radiance,
          skyColor.b * radiance,
          1,
        ],
        (y * width + x) * 4,
      );
    }
  const sky = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.needsUpdate = true;
  scene.environment = sky;
  scene.environmentIntensity = 1;
  if (daylight.sun > 0) {
    const bounds = new THREE.Box3().setFromObject(scene);
    const distance = Math.max(
      20,
      bounds.getSize(new THREE.Vector3()).length() * 10,
    );
    const diameter = 2 * Math.tan((daylight.angularDiameter * Math.PI) / 360);
    const sun = new THREE.RectAreaLight(
      temperatureColor(5500),
      (intensity * daylight.sun) / (diameter * diameter),
      diameter * distance,
      diameter * distance,
    );
    const center = bounds.isEmpty()
      ? new THREE.Vector3()
      : bounds.getCenter(new THREE.Vector3());
    sun.position.copy(center).addScaledVector(sunDirection(daylight), distance);
    sun.lookAt(center);
    sun.name = 'photo-sun';
    scene.add(sun);
  }
  return sky;
}

/** User-selected photo enclosure; silhouette comes only from the exact room outline/height. */
export function addPhotoCeiling(scene: THREE.Scene, room: Room) {
  const points = roomPoints(room);
  const shape = new THREE.Shape(
    points.map(
      (p) =>
        new THREE.Vector2(
          (p.x - room.width / 2) * 0.0254,
          -(p.z - room.depth / 2) * 0.0254,
        ),
    ),
  );
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({
    color: '#f5f4ef',
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(geometry, material);
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = room.height * 0.0254;
  ceiling.name = 'photo-ceiling';
  ceiling.userData.photoSurface = 'ceiling';
  scene.add(ceiling);
  return ceiling;
}
