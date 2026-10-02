import * as THREE from 'three';
import type {MaterialDefinition} from './materialDefinition';
import {applyMaterialUVs, createMaterial} from './materialRendering';

function surface(
  id: string,
  label: string,
  scan: string,
  size: number,
  color: string,
  tint = '#ffffff',
): MaterialDefinition {
  const asset = (suffix: string) => ({
    uri: `/textures/room/${scan}/${scan}_${suffix}_1k.jpg`,
    provenance: {source: `https://polyhaven.com/a/${scan}`, license: 'CC0-1.0'},
  });
  return {
    version: 1,
    id,
    label,
    substrate: {type: 'unspecified'},
    finish: {},
    pbr: {color, albedoTint: tint, roughness: 1, metalness: 0},
    textures: {
      albedo: asset('diff'),
      normal: asset('nor_gl'),
      roughness: asset('rough'),
      ao: asset('ao'),
    },
    textureSize: {width: size, height: size, unit: 'mm'},
  };
}
// Existing IDs stay stable. Wood-floor species is not identified by the scan.
export const ROOM_MATERIALS = {
  walls: {
    plaster: surface(
      'plaster',
      'Warm plaster',
      'white_plaster_02',
      1000,
      '#e9e3d7',
      '#e9e3d7',
    ),
    white: surface(
      'white',
      'White plaster',
      'white_plaster_02',
      1000,
      '#f5f4ef',
    ),
    green: surface(
      'green',
      'Sage painted plaster',
      'white_plaster_02',
      1000,
      '#849184',
      '#849184',
    ),
  },
  floor: {
    oak: surface('oak', 'Light wood planks', 'wood_floor', 1700, '#bca679'),
    walnut: surface(
      'walnut',
      'Dark stained wood planks',
      'wood_floor',
      1700,
      '#75604c',
      '#75604c',
    ),
    concrete: surface(
      'concrete',
      'Smooth concrete',
      'smooth_concrete_floor',
      2000,
      '#bab9b4',
    ),
  },
  countertop: {
    'white-quartz': {
      version: 1,
      id: 'white-quartz',
      label: 'White quartz',
      substrate: {type: 'unspecified'},
      finish: {system: 'Polished engineered quartz preview'},
      pbr: {
        color: '#f6f4ef',
        roughness: 0.18,
        metalness: 0,
        ior: 1.54,
        specularIntensity: 1,
      },
    },
    'taj-mahal': {
      ...surface(
        'taj-mahal',
        'Taj Mahal',
        'marble_01',
        1500,
        '#dfd3bb',
        '#e5d7be',
      ),
      finish: {system: 'Polished cream stone representative preview'},
      pbr: {
        color: '#dfd3bb',
        albedoTint: '#e5d7be',
        roughness: 0.22,
        metalness: 0,
        ior: 1.5,
      },
    },
    'dark-granite': {
      version: 1,
      id: 'dark-granite',
      label: 'Dark granite',
      substrate: {type: 'unspecified'},
      finish: {system: 'Polished granite preview'},
      pbr: {
        color: '#292b2c',
        albedoTint: '#454749',
        roughness: 0.25,
        metalness: 0,
        ior: 1.5,
      },
      textures: Object.fromEntries(
        [
          ['albedo', 'Color'],
          ['normal', 'NormalGL'],
          ['roughness', 'Roughness'],
        ].map(([slot, suffix]) => [
          slot,
          {
            uri: `/textures/room/Granite001B/Granite001B_1K-JPG_${suffix}.jpg`,
            provenance: {
              source: 'https://ambientcg.com/view?id=Granite001B',
              license: 'CC0-1.0',
              notes:
                'Procedural granite, 1m preview tile assumption; dark tint and polished roughness multiplier.',
            },
          },
        ]),
      ),
      textureSize: {width: 1000, height: 1000, unit: 'mm'},
    },
  },
} satisfies Record<string, Record<string, MaterialDefinition>>;
// Paint provides the albedo; scan microstructure supplies normal/roughness/AO.
// This avoids retaining the unpainted source's grey mottling on white/sage walls.
for (const definition of Object.values(ROOM_MATERIALS.walls)) {
  delete definition.textures!.albedo;
  definition.pbr.albedoTint = definition.pbr.color;
}
// The cream marble scan is representative, not a verified Taj Mahal slab scan.
Object.values(ROOM_MATERIALS.countertop['taj-mahal'].textures!).forEach(
  (asset) => {
    (
      asset.provenance as {source: string; license: string; notes?: string}
    ).notes =
      'Representative cream-tinted Marble 01 scan, not verified Taj Mahal quartzite. Polished roughness is a preview assumption.';
  },
);
export type CountertopMaterial = keyof typeof ROOM_MATERIALS.countertop;
/** Geometry units are metres; map local planes at the scan's measured footprint. */
export function applyRoomSurface(
  mesh: THREE.Mesh,
  definition: MaterialDefinition,
  role: 'wall' | 'floor' | 'countertop',
) {
  const previous = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  const material = createMaterial(definition, 0.7);
  material.transparent = previous[0].transparent;
  material.opacity = previous[0].opacity;
  material.depthWrite = previous[0].depthWrite;
  material.side = previous[0].side;
  if (role === 'wall') {
    material.normalScale.set(0.18, 0.18);
    material.aoMapIntensity = 0.3;
  }
  mesh.material = material;
  applyMaterialUVs(mesh.geometry, definition, {grainAxis: 'y'}, 'm');
  mesh.geometry.userData.materialApplication = {grainAxis: 'y', unit: 'm'};
  mesh.userData.photoSurface = role;
  return previous;
}
