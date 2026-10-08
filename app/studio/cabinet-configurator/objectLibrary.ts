/** Metadata is JSON data, independent of meshes, materials and renderer state. */
export type ObjectVector = {x: number; y: number; z: number};
export type ObjectDimensions = {width: number; depth: number; height: number};
export type LibraryOwnership =
  | {scope: 'core'; tenantId: null}
  | {scope: 'tenant'; tenantId: string};
export type ObjectLibrary = LibraryOwnership & {
  id: string;
  name: string;
  visibility: 'public' | 'private';
};
export type ObjectDefinition = {
  id: string;
  libraryId: string;
  tenantId: string | null;
  name: string;
  category: string;
  manufacturer: string | null;
  collection: string | null;
  sku: string | null;
  source: string;
  sourceUrl: string | null;
  sourceFormat: 'procedural' | 'glb' | 'gltf' | 'step' | 'obj' | 'fbx';
  /** Procedural Core objects have no baked GLB. Never invent a file reference. */
  canonicalAssetId: string | null;
  proceduralAssetId: string | null;
  /** Designer units: inches; X width, Y up, Z depth, front toward +Z. */
  dimensions: ObjectDimensions;
  insertionOrigin: ObjectVector;
  mountingPlane: 'floor' | 'wall' | 'countertop' | 'front' | null;
  mountingPoints: ObjectVector[];
  /** Unknown clearance is null, not a claim that zero clearance is safe. */
  clearanceEnvelope: {min: ObjectVector; max: ObjectVector} | null;
  /** Euler degrees; same yaw convention as the existing designer. */
  defaultOrientation: ObjectVector;
  configurableDimensions: (keyof ObjectDimensions)[];
  finishes: {id: string; name: string}[];
  tags: string[];
  visibility: 'public' | 'private';
};
/** Imported assets always refer to a validated, normalized GLB in meters. */
export type CanonicalObjectAsset = {
  id: string;
  tenantId: string | null;
  format: 'glb';
  units: 'meters';
  url: string;
};
export type ProceduralObjectAsset = {
  id: string;
  tenantId: null;
  format: 'procedural';
  generator:
    | 'cabinet'
    | 'appliance'
    | 'fixture'
    | 'sink'
    | 'panel'
    | 'pull'
    | 'opening'
    | 'island'
    | 'range-hood';
  variant: string;
};
export type ObjectAsset = CanonicalObjectAsset | ProceduralObjectAsset;

/** Selection helper only; private storage and API authorization remain server responsibilities. */
export function visibleLibraryObjects(
  libraries: readonly ObjectLibrary[],
  objects: readonly ObjectDefinition[],
  tenantId: string | null,
  enabledLibraryIds: readonly string[],
): ObjectDefinition[] {
  const accessible = new Map(
    libraries
      .filter(
        (library) =>
          enabledLibraryIds.includes(library.id) &&
          (library.scope === 'core' ||
            (tenantId !== null && library.tenantId === tenantId)),
      )
      .map((library) => [library.id, library]),
  );
  return objects.filter((object) => {
    const library = accessible.get(object.libraryId);
    return (
      library !== undefined &&
      object.tenantId === library.tenantId &&
      (object.visibility === 'public' ||
        (tenantId !== null && object.tenantId === tenantId))
    );
  });
}

/** Reject a mismatched asset/library before publishing metadata. No network/file loading here. */
export function objectDefinitionErrors(
  object: ObjectDefinition,
  library: ObjectLibrary,
  asset: ObjectAsset,
): string[] {
  const errors: string[] = [];
  if (!object.id.trim() || !object.name.trim())
    errors.push('Object ID and name are required.');
  if (
    object.libraryId !== library.id ||
    object.tenantId !== library.tenantId ||
    asset.tenantId !== library.tenantId
  )
    errors.push('Object, library and asset ownership must match.');
  if (
    Object.values(object.dimensions).some((n) => !Number.isFinite(n) || n <= 0)
  )
    errors.push('Dimensions must be positive finite inches.');
  const vectors = [
    object.insertionOrigin,
    object.defaultOrientation,
    ...object.mountingPoints,
  ];
  if (object.clearanceEnvelope)
    vectors.push(object.clearanceEnvelope.min, object.clearanceEnvelope.max);
  if (
    vectors.some((vector) =>
      Object.values(vector).some((n) => !Number.isFinite(n)),
    )
  )
    errors.push('Coordinates must be finite.');
  if (
    object.clearanceEnvelope &&
    (['x', 'y', 'z'] as const).some(
      (axis) =>
        object.clearanceEnvelope!.min[axis] >
        object.clearanceEnvelope!.max[axis],
    )
  )
    errors.push('Clearance bounds must be ordered.');
  if (asset.format === 'glb') {
    if (
      object.canonicalAssetId !== asset.id ||
      object.proceduralAssetId !== null ||
      object.sourceFormat === 'procedural'
    )
      errors.push('Imported objects require a canonical GLB asset.');
    if (asset.units !== 'meters' || !asset.url.trim())
      errors.push('GLB assets require a URL and meter units.');
  } else if (
    library.scope !== 'core' ||
    object.sourceFormat !== 'procedural' ||
    object.proceduralAssetId !== asset.id ||
    object.canonicalAssetId !== null
  ) {
    errors.push('Procedural assets are reserved for Cabinitron Core.');
  }
  return errors;
}
