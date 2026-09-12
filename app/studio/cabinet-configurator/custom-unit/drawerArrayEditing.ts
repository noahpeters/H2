import {
  drawerBounds,
  equalDrawerHeights,
  refitDrawerArray,
} from './drawerArrays';
import {editableParts} from './partEditing';
import {placementOpenings} from './openingPlacement';
import type {CabinetPart, CustomUnitDefinition} from './model';

/** Upgrade legacy stacks only in the editor; loading old saved rooms stays unchanged. */
export function withDrawerArrays(
  unit: CustomUnitDefinition,
): CustomUnitDefinition {
  const parts = editableParts(unit);
  const legacy = parts.filter((p) => p.kind === 'drawer' && !p.drawerArray);
  if (!legacy.length) return unit;
  const spaces = placementOpenings(
    {...unit, parts: parts.filter((p) => !legacy.includes(p))},
    'drawer',
  );
  const groups = new Map<
    string,
    {opening: (typeof spaces)[number]; drawers: CabinetPart[]}
  >();
  for (const part of legacy) {
    const opening = spaces.find(
      (o) =>
        part.x + part.width / 2 > o.x &&
        part.x + part.width / 2 < o.x + o.width &&
        part.y + part.height / 2 > o.y &&
        part.y + part.height / 2 < o.y + o.height,
    );
    if (!opening) continue;
    const key = `${opening.id}:${part.z >= 0 ? 'internal' : 'external'}`;
    const group = groups.get(key) ?? {opening, drawers: []};
    group.drawers.push(part);
    groups.set(key, group);
  }
  const removed = new Set<string>();
  const arrays: CabinetPart[] = [];
  for (const {opening, drawers} of groups.values()) {
    drawers.sort((a, b) => a.y - b.y);
    const first = drawers[0];
    // Do not erase per-front appearance or independent geometry in older layouts.
    if (
      drawers.some(
        (p) =>
          p.faceStyle !== first.faceStyle ||
          p.z !== first.z ||
          p.depth !== first.depth ||
          p.profileMode === 'independent' ||
          p.height < 2,
      )
    )
      continue;
    const face = first.z >= 0 ? 'internal' : 'external';
    const bounds = drawerBounds(unit, opening, face);
    try {
      let heights = equalDrawerHeights(
        bounds.height,
        unit.reveal,
        drawers.length,
      );
      if (drawers.some((p) => Math.abs(p.height - first.height) > 1e-8)) {
        heights = drawers.map((p) => p.height);
        const remaining =
          bounds.height -
          (drawers.length - 1) * unit.reveal -
          heights.slice(1).reduce((sum, h) => sum + h, 0);
        if (remaining < 2) continue;
        heights[0] = remaining;
      }
      arrays.push({
        ...first,
        ...bounds,
        name: 'Drawer array',
        drawerArray: {face, opening, heights},
      });
      drawers.forEach((p) => removed.add(p.id));
    } catch {
      // Preserve old layouts that cannot satisfy the new minimum until replaced.
    }
  }
  return {
    ...unit,
    parts: [...parts.filter((p) => !removed.has(p.id)), ...arrays],
  };
}

/** Refitting follows current boards/other fronts rather than cached face widths. */
export function reflowDrawerArrays(
  unit: CustomUnitDefinition,
): CustomUnitDefinition {
  if (!unit.parts?.some((p) => p.drawerArray)) return unit;
  return {
    ...unit,
    parts: unit.parts.map((part) => {
      if (!part.drawerArray) return part;
      const old = part.drawerArray.opening;
      const spaces = placementOpenings(
        {...unit, parts: unit.parts!.filter((p) => p.id !== part.id)},
        'drawer',
      );
      const opening = spaces.find(
        (o) =>
          old.x + old.width / 2 > o.x &&
          old.x + old.width / 2 < o.x + o.width &&
          old.y + old.height / 2 > o.y &&
          old.y + old.height / 2 < o.y + o.height,
      );
      if (!opening)
        throw new Error(
          'The drawer array needs a clear opening. Remove it before dividing this opening.',
        );
      const doors = unit.parts!.filter(
        (p) =>
          p.kind === 'door' &&
          p.x < opening.x + opening.width &&
          p.x + p.width > opening.x &&
          p.y < opening.y + opening.height &&
          p.y + p.height > opening.y,
      );
      return refitDrawerArray(unit, {
        ...part,
        z:
          part.drawerArray.face === 'external'
            ? -part.depth
            : Math.max(0.5, ...doors.map((p) => p.z + p.depth + 0.5)),
        drawerArray: {...part.drawerArray, opening},
      });
    }),
  };
}
