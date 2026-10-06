import type {MaterialDefinition} from './materialDefinition';
import {CABINET_MATERIAL_DEFINITIONS} from './materials';
import colors from './rubioFinishColors.json';

export const RUBIO_COLORS = {
  chocolate: 'Chocolate',
  natural: 'Natural',
  pure: 'Pure',
  white: 'White',
} as const;
export type RubioColor = keyof typeof RUBIO_COLORS;
export const RUBIO_SYSTEM = 'Rubio Monocoat Oil Plus 2C';
export function hasRubioColors(id: string): id is keyof typeof colors {
  return Object.hasOwn(colors, id);
}
export function rubioColor(definition?: MaterialDefinition): RubioColor | '' {
  if (definition?.finish.system !== RUBIO_SYSTEM) return '';
  return (Object.keys(RUBIO_COLORS).find(
    (id) => RUBIO_COLORS[id as RubioColor] === definition.finish.color,
  ) ?? '') as RubioColor | '';
}
/** Color-only transformation. Keep the substrate identity, sheen and UV/relief maps. */
export function withRubioColor(
  definition: MaterialDefinition,
  color: RubioColor,
): MaterialDefinition {
  const next = structuredClone(definition);
  if (!hasRubioColors(next.id)) return next;
  const reference = colors[next.id][color];
  const base = CABINET_MATERIAL_DEFINITIONS[next.id];
  next.label = `${base.label} · ${RUBIO_SYSTEM} ${RUBIO_COLORS[color]}`;
  next.textureSize ??= structuredClone(base.textureSize);
  next.textureGrainAxis ??= base.textureGrainAxis;
  next.finish = {system: RUBIO_SYSTEM, color: RUBIO_COLORS[color]};
  next.pbr = {...next.pbr, color: reference.color, albedoTint: '#ffffff'};
  next.textures = {
    ...structuredClone(base.textures),
    ...next.textures,
    albedo: {
      uri: `/studio/materials/rubio-oil-plus-2c/${next.id}-${color}.jpg`,
      provenance: {
        source: reference.referenceUrl,
        license:
          'CC0-1.0 derived grain texture; reference photographs are not bundled',
        notes: `Color preview matched to Rubio ${RUBIO_COLORS[color]} on ${reference.referenceSpecies}. Existing CC0 grain and physical scale retained. Photographic reference, not measured finish data.`,
      },
    },
  };
  return next;
}
