import type {Room, RoomElement} from './model';
import type {
  CanonicalObjectAsset,
  ObjectDefinition,
  ObjectDimensions,
} from './objectLibrary';

export type GlbObjectInstance = {
  definition: ObjectDefinition;
  asset: CanonicalObjectAsset;
  loadRevision?: number;
};
export const GLB_BYTE_LIMIT = 20 * 1024 * 1024;
/** Durable public assets only. Local blob/data URLs cannot survive sharing/reload. */
export function validGlbUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    value.trim() !== value
  )
    return false;
  try {
    const relative =
      value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
    const url = new URL(value, 'https://cabinitron.invalid');
    return (
      (relative ||
        (value.startsWith('https://') && url.protocol === 'https:')) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /\.glb$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export function createGlbObject(
  name: string,
  url: string,
  dimensions: ObjectDimensions,
  id: string,
  room: Room,
): RoomElement {
  if (
    !validGlbUrl(url) ||
    !name.trim() ||
    name.trim().length > 100 ||
    Object.values(dimensions).some(
      (n) => !Number.isFinite(n) || n <= 0 || n > 10000,
    )
  )
    throw new Error(
      'Provide a name, a hosted .glb URL and valid model dimensions.',
    );
  const asset: CanonicalObjectAsset = {
    id: `glb-asset:${id}`,
    tenantId: null,
    format: 'glb',
    units: 'meters',
    url,
  };
  const definition: ObjectDefinition = {
    id: `glb-object:${id}`,
    libraryId: 'design-objects',
    tenantId: null,
    name: name.trim(),
    category: 'object',
    manufacturer: null,
    collection: null,
    sku: null,
    source: 'Design import',
    sourceUrl: url,
    sourceFormat: 'glb',
    canonicalAssetId: asset.id,
    proceduralAssetId: null,
    dimensions: {...dimensions},
    insertionOrigin: {x: 0, y: 0, z: 0},
    mountingPlane: 'floor',
    mountingPoints: [],
    clearanceEnvelope: null,
    defaultOrientation: {x: 0, y: 0, z: 0},
    configurableDimensions: [],
    finishes: [],
    tags: [],
    visibility: 'public',
  };
  return {
    id,
    kind: 'object',
    face: 'slab',
    ...dimensions,
    libraryObject: {definition, asset},
    placement: {
      mode: 'floor',
      x: room.width / 2,
      z: room.depth / 2,
      rotation: 0,
      elevation: 0,
    },
  };
}
export function resizeGlbObject(item: RoomElement, width: number) {
  if (!item.libraryObject || !Number.isFinite(width) || width <= 0) return;
  const original = item.libraryObject.definition.dimensions;
  const scale = width / original.width;
  const depth = original.depth * scale,
    height = original.height * scale;
  if (Math.max(width, depth, height) > 10000) return;
  Object.assign(item, {width, depth, height});
}
/** Current public saved designs support public, design-owned GLBs only. */
export function validGlbObjectInstance(
  value: unknown,
): value is GlbObjectInstance {
  if (!value || typeof value !== 'object') return false;
  const {definition: d, asset: a, loadRevision} = value as GlbObjectInstance;
  const text = (v: unknown, max = 100) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const vector = (v: unknown) =>
    !!v &&
    typeof v === 'object' &&
    ['x', 'y', 'z'].every((k) =>
      Number.isFinite((v as Record<string, number>)[k]),
    );
  return (
    (loadRevision === undefined ||
      (Number.isSafeInteger(loadRevision) && loadRevision >= 0)) &&
    !!d &&
    !!a &&
    text(d.id) &&
    text(a.id) &&
    text(d.name) &&
    text(d.category) &&
    d.libraryId === 'design-objects' &&
    d.tenantId === null &&
    a.tenantId === null &&
    d.visibility === 'public' &&
    a.format === 'glb' &&
    a.units === 'meters' &&
    validGlbUrl(a.url) &&
    d.canonicalAssetId === a.id &&
    d.proceduralAssetId === null &&
    d.sourceFormat === 'glb' &&
    d.source === 'Design import' &&
    d.sourceUrl === a.url &&
    d.manufacturer === null &&
    d.collection === null &&
    d.sku === null &&
    !!d.dimensions &&
    ['width', 'depth', 'height'].every((k) => {
      const n = d.dimensions[k as keyof ObjectDimensions];
      return Number.isFinite(n) && n > 0 && n <= 10000;
    }) &&
    vector(d.insertionOrigin) &&
    vector(d.defaultOrientation) &&
    Object.values(d.insertionOrigin).every((n) => n === 0) &&
    Object.values(d.defaultOrientation).every((n) => n === 0) &&
    d.mountingPlane === 'floor' &&
    d.clearanceEnvelope === null &&
    Array.isArray(d.mountingPoints) &&
    d.mountingPoints.length === 0 &&
    Array.isArray(d.configurableDimensions) &&
    d.configurableDimensions.length === 0 &&
    Array.isArray(d.finishes) &&
    d.finishes.length === 0 &&
    Array.isArray(d.tags) &&
    d.tags.length === 0
  );
}
