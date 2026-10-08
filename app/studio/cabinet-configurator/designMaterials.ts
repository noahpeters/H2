import type {RoomElement} from './model';
import {
  CABINET_MATERIALS,
  CABINET_PAINTS,
  type MaterialSelection,
} from './materials';
import {validMaterialDefinition} from './materialDefinition';

export const FLAT_GRAIN_OPTIONS = [
  'automatic',
  'horizontal',
  'vertical',
] as const;
export type FlatGrain = (typeof FLAT_GRAIN_OPTIONS)[number];
export type DesignMaterial = MaterialSelection & {
  id: string;
  name: string;
  material: NonNullable<MaterialSelection['material']>;
  flatGrain: FlatGrain;
};
type MaterialStudy = {
  materials?: DesignMaterial[];
  elements: RoomElement[];
  selected?: string | null;
};
export function validDesignMaterials(
  value: unknown,
): value is DesignMaterial[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 200 &&
    value.every(
      (m: any) =>
        m &&
        typeof m.id === 'string' &&
        m.id.length > 0 &&
        m.id.length < 100 &&
        typeof m.name === 'string' &&
        m.name.trim().length > 0 &&
        m.name.length <= 100 &&
        Object.hasOwn(CABINET_MATERIALS, m.material) &&
        (m.paintColor === undefined ||
          Object.hasOwn(CABINET_PAINTS, m.paintColor)) &&
        FLAT_GRAIN_OPTIONS.includes(m.flatGrain) &&
        (m.materialDefinition === undefined ||
          (validMaterialDefinition(m.materialDefinition) &&
            m.materialDefinition.id === m.material)),
    ) &&
    new Set(value.map((m: any) => m.id)).size === value.length
  );
}
function finishKey(item: MaterialSelection) {
  const material = item.material ?? 'rift-white-oak';
  return JSON.stringify([
    material,
    material === 'paint-grade' ? (item.paintColor ?? 'white') : null,
    item.materialDefinition ?? null,
    item.flatGrain ?? 'automatic',
  ]);
}
/** Convert legacy per-object finishes without losing distinct saved snapshots. */
export function migrateDesignMaterials<T extends MaterialStudy>(study: T): T {
  const next = {...study, elements: study.elements.map((e) => ({...e}))};
  if (!validDesignMaterials(study.materials)) {
    next.materials = [];
    const finishes = new Map<string, string>();
    for (const item of next.elements) {
      if (item.kind === 'fixture' || item.kind === 'object') continue;
      const key = finishKey(item);
      let id = finishes.get(key);
      if (!id) {
        id = `material-${next.materials.length + 1}`;
        const material = item.material ?? 'rift-white-oak';
        next.materials.push({
          id,
          name:
            CABINET_MATERIALS[material].label +
            (material === 'paint-grade'
              ? ` · ${CABINET_PAINTS[item.paintColor ?? 'white'].label}`
              : ''),
          material,
          paintColor: item.paintColor,
          materialDefinition: item.materialDefinition,
          flatGrain: item.flatGrain ?? 'automatic',
        });
        finishes.set(key, id);
      }
      item.materialId = id;
    }
    if (!next.materials.length)
      next.materials.push({
        id: 'material-1',
        name: 'Rift-sawn white oak',
        material: 'rift-white-oak',
        flatGrain: 'automatic',
      });
  }
  syncDesignMaterials(next);
  return next;
}
/** The palette owns finishes. Element copies keep pricing/inquiry and old exports compatible. */
export function syncDesignMaterials(
  study: MaterialStudy,
  preferredId?: string,
) {
  const materials = study.materials;
  if (!materials?.length) return;
  const selected = study.elements.find((e) => e.id === study.selected);
  for (const item of study.elements) {
    if (item.kind === 'fixture' || item.kind === 'object') continue;
    const material =
      materials.find((m) => m.id === item.materialId) ??
      materials.find((m) => m.id === selected?.materialId) ??
      materials.find((m) => m.id === preferredId) ??
      materials.find((m) => finishKey(m) === finishKey(item)) ??
      materials[0];
    item.materialId = material.id;
    item.material = material.material;
    item.paintColor = material.paintColor;
    item.materialDefinition = material.materialDefinition;
    item.flatGrain = material.flatGrain;
  }
}
/** Removing an assigned material deliberately moves its objects to a remaining material. */
export function removeDesignMaterial(
  study: MaterialStudy,
  id: string,
  replacementId: string,
) {
  if (
    id === replacementId ||
    !study.materials?.some((m) => m.id === replacementId)
  )
    return;
  study.materials = study.materials.filter((m) => m.id !== id);
  for (const item of study.elements)
    if (item.materialId === id) item.materialId = replacementId;
  syncDesignMaterials(study);
}
