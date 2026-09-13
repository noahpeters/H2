import {customUnitBounds} from './geometry';
import {validateCustomUnit, type CustomUnitDefinition} from './model';

export type CabinetLifecycle = 'draft' | 'published' | 'archived';

export type CustomCabinetLibraryItem = {
  id: string;
  version: number;
  name: string;
  description: string;
  tags: string[];
  thumbnail?: string;
  status: CabinetLifecycle;
  definition: CustomUnitDefinition;
  updatedAt: string;
};

export type CustomCabinetInstance = {
  scope?: 'design';
  libraryId: string;
  libraryVersion: number;
  /** Immutable snapshot: publishing a later revision never changes a room. */
  definition: CustomUnitDefinition;
};

export function validLibraryInput(
  value: unknown,
): value is Omit<CustomCabinetLibraryItem, 'version' | 'updatedAt'> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CustomCabinetLibraryItem>;
  return (
    typeof item.id === 'string' &&
    /^[a-z0-9][a-z0-9-]{2,63}$/.test(item.id) &&
    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&
    item.name.length <= 100 &&
    typeof item.description === 'string' &&
    item.description.length <= 1000 &&
    Array.isArray(item.tags) &&
    item.tags.length <= 20 &&
    item.tags.every((tag) => typeof tag === 'string' && tag.length <= 40) &&
    (!item.thumbnail ||
      (typeof item.thumbnail === 'string' && item.thumbnail.length <= 500)) &&
    ['draft', 'published', 'archived'].includes(item.status ?? '') &&
    validateCustomUnit(item.definition).length === 0
  );
}

export function customCabinetElement(
  item: CustomCabinetLibraryItem,
  id: string,
) {
  const bounds = customUnitBounds(item.definition);
  return {
    id,
    kind: item.definition.height > 48 ? ('tall' as const) : ('base' as const),
    ...bounds,
    face: 'slab' as const,
    customCabinet: {
      libraryId: item.id,
      libraryVersion: item.version,
      definition: structuredClone(item.definition),
    },
    placement: {
      mode: 'wall' as const,
      wall: 'back' as const,
      offset: 0,
      elevation: 0,
    },
  };
}
