import type {MaterialDefinition} from './materialDefinition';

/** Versioned representative finishes. Preview assumptions, not measured coating specifications. */
export const WOOD_FINISHES = {
  matte: {
    label: 'Matte',
    range: [0.38, 0.65],
    clearcoat: 0.15,
    clearcoatRoughness: 0.45,
    normalStrength: 0.5,
  },
  satin: {
    label: 'Satin',
    range: [0.22, 0.42],
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    normalStrength: 0.35,
  },
  polished: {
    label: 'Polished',
    range: [0.12, 0.26],
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    normalStrength: 0.2,
  },
} as const;
export function withWoodFinish(
  definition: MaterialDefinition,
  finish: keyof typeof WOOD_FINISHES | 'source',
): MaterialDefinition {
  const next = structuredClone(definition);
  const {
    normalStrength: _normal,
    roughnessMapRange: _range,
    clearcoat: _coat,
    clearcoatRoughness: _coatRough,
    ...pbr
  } = next.pbr;
  if (finish === 'source')
    return {
      ...next,
      finish: next.finish.color ? next.finish : {},
      pbr: {...pbr, roughness: next.textures?.roughness ? 1 : 0.7},
    };
  const preset = WOOD_FINISHES[finish];
  return {
    ...next,
    finish: next.finish.color
      ? next.finish
      : {...next.finish, system: `H2 ${finish} preview v1`},
    pbr: {
      ...pbr,
      roughness: next.textures?.roughness
        ? 1
        : (preset.range[0] + preset.range[1]) / 2,
      ior: 1.5,
      specularIntensity: 1,
      roughnessMapRange: next.textures?.roughness
        ? [...preset.range]
        : undefined,
      clearcoat: preset.clearcoat,
      clearcoatRoughness: preset.clearcoatRoughness,
      normalStrength: preset.normalStrength,
    },
  };
}

/** Sheen remains independent of the selected wood color. */
export function woodSheen(
  definition?: MaterialDefinition,
): keyof typeof WOOD_FINISHES | 'source' {
  return (
    (Object.keys(WOOD_FINISHES) as (keyof typeof WOOD_FINISHES)[]).find(
      (key) =>
        definition?.finish.system === `H2 ${key} preview v1` ||
        (definition?.pbr.clearcoat === WOOD_FINISHES[key].clearcoat &&
          definition?.pbr.clearcoatRoughness ===
            WOOD_FINISHES[key].clearcoatRoughness),
    ) ?? 'source'
  );
}
