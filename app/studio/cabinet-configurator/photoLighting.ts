import * as THREE from 'three';
import {DEFAULT_PHOTO_CONTACTS} from './photoContacts';
import type {PhotoContactSettings} from './photoContacts';
import type {Opening, Room} from './model';
import {roomSegments} from './roomOutline';
import {wallThickness, isPartition} from './wallDimensions';
import {
  addDirectionalDaylight,
  addPhotoCeiling,
  type PhotoDaylight,
} from './photoDaylight';
import {
  DEFAULT_PHOTO_CAMERA,
  validatePhotoCamera,
  type PhotoCameraSettings,
} from './photoCamera';

export type OpeningLightSettings = {temperature: number; intensity: number};
export type PhotoSettings = {
  camera?: PhotoCameraSettings;
  daylight: OpeningLightSettings;
  adjacent: OpeningLightSettings;
  openings: Record<string, Partial<OpeningLightSettings>>;
  samples: number;
  bounces: number;
  contacts?: PhotoContactSettings;
  denoise: boolean;
  maxDimension: number;
  exposure: number;
  toneMapping: THREE.ToneMapping;
  glossyFilter?: number;
  textureResolution?: 1024 | 2048 | 4096;
  reference?: boolean;
  diagnostics?: boolean;
  sunSky?: PhotoDaylight;
  ceiling?: boolean;
  physicalWindows?: boolean;
};
export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  camera: DEFAULT_PHOTO_CAMERA,
  daylight: {temperature: 6500, intensity: 100},
  adjacent: {temperature: 3000, intensity: 12},
  openings: {},
  samples: 256,
  denoise: true,
  bounces: 6,
  contacts: DEFAULT_PHOTO_CONTACTS,
  maxDimension: 1600,
  exposure: 1,
  toneMapping: THREE.AgXToneMapping,
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
  if (settings.camera) validatePhotoCamera(settings.camera);
  const bounded = (v: number, min: number, max: number) =>
    Number.isFinite(v) && v >= min && v <= max;
  const light = (v: OpeningLightSettings) =>
    bounded(v.temperature, 1000, 25000) && bounded(v.intensity, 0, 10000);
  if (
    (settings.contacts !== undefined &&
      (!['off', 'standard', 'fine'].includes(settings.contacts.quality) ||
        !bounded(settings.contacts.intensity, 0, 1) ||
        !bounded(settings.contacts.radius, 0.001, 0.2))) ||
    typeof settings.denoise !== 'boolean' ||
    (settings.glossyFilter !== undefined &&
      !bounded(settings.glossyFilter, 0, 1)) ||
    (settings.textureResolution !== undefined &&
      ![1024, 2048, 4096].includes(settings.textureResolution)) ||
    (settings.reference !== undefined &&
      typeof settings.reference !== 'boolean') ||
    (settings.diagnostics !== undefined &&
      typeof settings.diagnostics !== 'boolean') ||
    (settings.ceiling !== undefined && typeof settings.ceiling !== 'boolean') ||
    (settings.physicalWindows !== undefined &&
      typeof settings.physicalWindows !== 'boolean') ||
    (settings.sunSky !== undefined &&
      (typeof settings.sunSky.enabled !== 'boolean' ||
        !bounded(settings.sunSky.azimuth, 0, 360) ||
        !bounded(settings.sunSky.altitude, 1, 89) ||
        !bounded(settings.sunSky.sky, 0, 100) ||
        !bounded(settings.sunSky.sun, 0, 1000) ||
        !bounded(settings.sunSky.angularDiameter, 0.1, 10))) ||
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
  // Cutaway visibility removes wall/opening geometry, not the room's illumination.
  // Still honor other hidden ancestors (for example an intentionally hidden room).
  const collectOpenings = (object: THREE.Object3D) => {
    if (!object.visible && object.userData.cutawayRoomWall !== true) return;
    if (object.userData.photoOpening)
      sources.push(object.userData.photoOpening);
    object.children.forEach(collectOpenings);
  };
  collectOpenings(scene);
  let room: Room | undefined;
  scene.traverse((object) => {
    if (object.userData.photoWall) room = object.userData.photoWall.room;
  });
  // Sky/sun require the full light enclosure: cutaways are a viewing convention.
  // Opting into directional daylight restores photo-only blockers rather than leaking exterior fill.
  if (settings.sunSky?.enabled)
    scene.traverse((object) => {
      if (object.userData.cutawayRoomWall) object.visible = true;
    });
  if (settings.ceiling && room) addPhotoCeiling(scene, room);
  const windows = new Map<THREE.Material, THREE.Material>();
  if (settings.physicalWindows)
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const replace = (original: THREE.Material) => {
        if (!original.userData.photoWindowPane) return original;
        if (windows.has(original)) return windows.get(original)!;
        const glass = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.02,
          metalness: 0,
          ior: 1.5,
          transmission: 1,
          thickness: 0.006,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
        });
        glass.userData = {...original.userData};
        windows.set(original, glass);
        return glass;
      };
      object.material = Array.isArray(object.material)
        ? (object.material as THREE.Material[]).map(replace)
        : replace(object.material);
    });
  windows.forEach((_glass, original) => original.dispose());
  if (settings.sunSky?.enabled)
    addDirectionalDaylight(
      scene,
      settings.sunSky,
      settings.daylight.temperature,
      settings.daylight.intensity,
    );
  for (const {opening, room} of sources) {
    if (settings.sunSky?.enabled && opening.kind === 'window') continue;
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
      const wallDepth = wallThickness(room, opening.wall) * inch;
      emitter.position
        .copy(center)
        .addScaledVector(
          inward,
          -(isPartition(room, opening.wall) ? wallDepth / 2 : wallDepth) - 0.04,
        );
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
  // Upstream sorts meshes by UUID before BVH construction. clone() creates random
  // UUIDs, changing tie ordering at coplanar contacts between repeated captures.
  let meshIndex = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.uuid = `00000000-0000-4000-8000-${(meshIndex++).toString(16).padStart(12, '0')}`;
    }
  });
  return scene;
}
