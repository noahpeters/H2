import * as THREE from 'three';
import type {Opening, Room} from './model';
import {roomSegments} from './roomOutline';

export type OpeningLightSettings = {temperature: number; intensity: number};
export type PhotoSettings = {
  daylight: OpeningLightSettings;
  adjacent: OpeningLightSettings;
  openings: Record<string, Partial<OpeningLightSettings>>;
  samples: number;
  bounces: number;
  maxDimension: number;
  exposure: number;
  toneMapping: THREE.ToneMapping;
};
export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  daylight: {temperature: 6500, intensity: 100},
  adjacent: {temperature: 3000, intensity: 12},
  openings: {},
  samples: 96,
  bounces: 6,
  maxDimension: 1600,
  exposure: 1,
  toneMapping: THREE.ACESFilmicToneMapping,
};

/** Approximate black-body chromaticity, converted from display RGB to linear RGB. */
export function temperatureColor(kelvin: number) {
  const t = Math.min(25000, Math.max(1000, kelvin)) / 100;
  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b =
    t >= 66
      ? 255
      : t <= 19
        ? 0
        : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new THREE.Color().setRGB(
    clamp(r),
    clamp(g),
    clamp(b),
    THREE.SRGBColorSpace,
  );
}

export function validatePhotoSettings(settings: PhotoSettings) {
  const bounded = (v: number, min: number, max: number) =>
    Number.isFinite(v) && v >= min && v <= max;
  const light = (v: OpeningLightSettings) =>
    bounded(v.temperature, 1000, 25000) && bounded(v.intensity, 0, 10000);
  if (
    !light(settings.daylight) ||
    !light(settings.adjacent) ||
    !Number.isInteger(settings.samples) ||
    !bounded(settings.samples, 1, 1024) ||
    !Number.isInteger(settings.bounces) ||
    !bounded(settings.bounces, 1, 16) ||
    !Number.isInteger(settings.maxDimension) ||
    !bounded(settings.maxDimension, 64, 2400) ||
    !bounded(settings.exposure, 0.01, 20) ||
    Object.values(settings.openings).some(
      (v) =>
        (v.temperature !== undefined && !bounded(v.temperature, 1000, 25000)) ||
        (v.intensity !== undefined && !bounded(v.intensity, 0, 10000)),
    )
  ) {
    throw new Error('Invalid photo lighting or quality settings.');
  }
}

/** Replace viewport studio lights with opening-sized radiance sources in a private scene. */
export function addPhotoLighting(scene: THREE.Scene, settings: PhotoSettings) {
  validatePhotoSettings(settings);
  const oldLights: THREE.Light[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Light) oldLights.push(object);
  });
  oldLights.forEach((light) => light.removeFromParent());
  // Background is visual only: no arbitrary environment fill through enclosing walls.
  scene.environment = null;
  const sources: {opening: Opening; room: Room}[] = [];
  scene.traverseVisible((object) => {
    if (object.userData.photoOpening)
      sources.push(object.userData.photoOpening);
  });
  for (const {opening, room} of sources) {
    const segment = roomSegments(room).find((s) => s.id === opening.wall);
    if (!segment || segment.length <= 0) continue;
    const defaults =
      opening.kind === 'window' ? settings.daylight : settings.adjacent;
    const values = {...defaults, ...settings.openings[opening.id]};
    if (values.intensity === 0) continue;
    const inch = 0.0254;
    // Match placeOnWall's offset convention (from the minimum coordinate).
    const offset = opening.offset + opening.width / 2;
    const center = new THREE.Vector3(
      (segment.x + (segment.horizontal ? offset : 0) - room.width / 2) * inch,
      ((opening.kind === 'window' ? (opening.sill ?? 42) : 0) +
        opening.height / 2) *
        inch,
      (segment.z + (segment.horizontal ? 0 : offset) - room.depth / 2) * inch,
    );
    const normal = new THREE.Vector3(segment.nx, 0, segment.nz);
    // Partitions connect two rooms; contribute from either side independently of camera.
    const sides = room.partitions?.some((p) => p.id === opening.wall)
      ? [1, -1]
      : [1];
    for (const side of sides) {
      const inward = normal.clone().multiplyScalar(side);
      const emitter = new THREE.RectAreaLight(
        temperatureColor(values.temperature),
        values.intensity,
        opening.width * inch,
        opening.height * inch,
      );
      // Outside the aperture, so existing panes, frames and closed door leaves occlude it.
      emitter.position.copy(center).addScaledVector(inward, -0.04);
      emitter.lookAt(emitter.position.clone().add(inward));
      emitter.name = `photo-opening:${opening.id}:${side}`;
      scene.add(emitter);
    }
  }
  scene.updateMatrixWorld(true);
}

/** The tracer's generator doesn't honor invisible ancestors; prune only its derived view. */
export function visiblePhotoScene(source: THREE.Scene) {
  const scene = source.clone(true);
  const prune = (object: THREE.Object3D) => {
    for (const child of [...object.children]) {
      if (!child.visible) object.remove(child);
      else prune(child);
    }
  };
  prune(scene);
  return scene;
}
