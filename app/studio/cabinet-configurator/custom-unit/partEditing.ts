import {customUnitParts} from './geometry';
import {
  customUnitId,
  type CabinetPart,
  type CustomUnitDefinition,
} from './model';

export function editableParts(unit: CustomUnitDefinition): CabinetPart[] {
  return customUnitParts(unit).map((part, index) => ({
    ...part,
    id: part.id ?? `${unit.id}-part-${index}`,
  }));
}
export function changePart(
  unit: CustomUnitDefinition,
  id: string,
  patch: Partial<CabinetPart>,
): CustomUnitDefinition {
  return {
    ...unit,
    parts: editableParts(unit).map((part) =>
      part.id === id ? {...part, ...patch, id} : part,
    ),
  };
}
export function addPart(
  unit: CustomUnitDefinition,
  kind: CabinetPart['kind'],
): CustomUnitDefinition {
  const t = 0.75;
  const front = kind === 'door' || kind === 'drawer';
  const vertical = kind === 'divider';
  const part: CabinetPart = {
    id: customUnitId('part'),
    kind,
    x: vertical ? unit.width / 2 - t / 2 : front ? unit.reveal : t,
    y: front ? unit.reveal : vertical ? t : unit.height / 2,
    z: front ? -t : 0.5,
    width: vertical ? t : unit.width - (front ? unit.reveal * 2 : t * 2),
    height: front
      ? kind === 'drawer'
        ? 6
        : unit.height - unit.reveal * 2
      : vertical
        ? unit.height - t * 2
        : t,
    depth: front ? t : unit.depth - 1.25,
  };
  return {...unit, parts: [...editableParts(unit), part]};
}

/** Positive setback is measured from the cabinet front; preserve the rear edge. */
export function setPartSetback(
  unit: CustomUnitDefinition,
  id: string,
  setback: number,
) {
  const part = editableParts(unit).find((item) => item.id === id);
  if (!part) return unit;
  const front = part.kind === 'door' || part.kind === 'drawer';
  return changePart(unit, id, {
    z: setback,
    ...(!front ? {depth: Math.max(0.0625, part.depth + part.z - setback)} : {}),
  });
}

export function addEndShelf(
  unit: CustomUnitDefinition,
  side: 'left' | 'right',
) {
  const part: CabinetPart = {
    id: customUnitId('part'),
    kind: 'shelf',
    name: `${side === 'left' ? 'Left' : 'Right'} curved end shelf`,
    profileMode: 'independent',
    shape: side === 'left' ? 'round-left' : 'round-right',
    x: side === 'left' ? -unit.depth / 2 : unit.width,
    y: unit.height / 2,
    z: 0,
    width: unit.depth / 2,
    height: 0.75,
    depth: unit.depth,
  };
  return {...unit, parts: [...editableParts(unit), part]};
}

export function addPanel(
  unit: CustomUnitDefinition,
  orientation: 'back' | 'side',
) {
  const part: CabinetPart = {
    id: customUnitId('part'),
    kind: 'panel',
    name: orientation === 'back' ? 'Back panel' : 'Side panel',
    x: orientation === 'back' ? 0.75 : unit.width,
    y: 0.75,
    z: orientation === 'back' ? unit.depth - 0.5 : 0,
    width: orientation === 'back' ? unit.width - 1.5 : 0.75,
    height: unit.height - 1.5,
    depth: orientation === 'back' ? 0.5 : unit.depth,
  };
  return {...unit, parts: [...editableParts(unit), part]};
}

export function setCabinetProfile(
  unit: CustomUnitDefinition,
  profile: NonNullable<CustomUnitDefinition['profile']>,
): CustomUnitDefinition {
  return {...unit, profile, curve: undefined};
}
