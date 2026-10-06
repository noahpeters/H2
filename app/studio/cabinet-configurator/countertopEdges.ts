import {DEFAULT_PANEL_THICKNESS} from './roomPanels';
import {automaticFinishPanels, isAutoPanel} from './automaticFinishPanels';
import {wallToFloor, type RoomElement, type Room} from './model';

export type CountertopEdges = {
  left: number;
  right: number;
  back: number;
  front: number;
};
export const DEFAULT_COUNTERTOP_EDGES: CountertopEdges = {
  left: 1,
  right: 1,
  back: 1,
  front: 1,
};

/** Inches of overhang in the cabinet's local coordinates. */
export function countertopEdges(
  item: RoomElement,
  elements: RoomElement[],
  room: Room,
): CountertopEdges {
  const edges = {...DEFAULT_COUNTERTOP_EDGES};
  const supplied = elements.filter(isAutoPanel);
  const generated = room.useMapleInternals
    ? supplied.length
      ? supplied
      : automaticFinishPanels(elements, room)
    : [];
  if (item.kind === 'base') {
    const panels = generated.filter(
      (p) =>
        p.autoPanel.ownerId === item.id &&
        Math.abs(p.autoPanel.bottom + p.height - item.height) < 0.001,
    );
    for (const side of ['left', 'right', 'back'] as const)
      if (panels.some((p) => p.autoPanel.surface === side))
        edges[side] += DEFAULT_PANEL_THICKNESS;
  }
  const origin = wallToFloor(item, room);
  const angle = (origin.rotation * Math.PI) / 180;
  const elevation = item.placement.elevation ?? 0;
  const top = elevation + item.height;
  for (const other of [
    ...elements.filter((e) => !isAutoPanel(e)),
    ...generated.filter((p) => p.autoPanel.ownerId !== item.id),
  ]) {
    if (
      other.id === item.id ||
      other.kind === 'base' ||
      (other.kind === 'appliance' &&
        (other.applianceKind ?? 'dishwasher') === 'dishwasher')
    )
      continue;
    const bottom = other.placement.elevation ?? 0;
    if (bottom >= top + 1.5 || bottom + other.height < top) continue;
    const position = wallToFloor(other, room);
    const rotation = ((position.rotation - origin.rotation) * Math.PI) / 180;
    const dx = position.x - origin.x;
    const dz = position.z - origin.z;
    const x = dx * Math.cos(angle) + dz * Math.sin(angle);
    const z = -dx * Math.sin(angle) + dz * Math.cos(angle);
    const halfWidth =
      (Math.abs(other.width * Math.cos(rotation)) +
        Math.abs(other.depth * Math.sin(rotation))) /
      2;
    const halfDepth =
      (Math.abs(other.width * Math.sin(rotation)) +
        Math.abs(other.depth * Math.cos(rotation))) /
      2;
    const minX = x - halfWidth,
      maxX = x + halfWidth;
    const minZ = z - halfDepth,
      maxZ = z + halfDepth;
    // Leave a small joint so flush faces cannot flicker from depth rounding.
    const clearance = 0.02;
    const tolerance = 0.001;
    // A panel can intrude through the edge it faces. Its long span must not
    // trim the perpendicular edge across the entire cabinet footprint.
    const sidePanel = other.kind === 'panel' && halfWidth < halfDepth;
    const endPanel = other.kind === 'panel' && halfDepth < halfWidth;
    if (maxZ > -item.depth / 2 && minZ < item.depth / 2) {
      if (
        minX >= item.width / 2 - tolerance ||
        (sidePanel && x > 0 && maxX >= item.width / 2 && minX <= item.width / 2)
      )
        edges.right = Math.min(edges.right, minX - item.width / 2 - clearance);
      if (
        maxX <= -item.width / 2 + tolerance ||
        (sidePanel &&
          x < 0 &&
          minX <= -item.width / 2 &&
          maxX >= -item.width / 2)
      )
        edges.left = Math.min(edges.left, -item.width / 2 - maxX - clearance);
    }
    if (maxX > -item.width / 2 && minX < item.width / 2) {
      if (
        minZ >= item.depth / 2 - tolerance ||
        (endPanel && z > 0 && maxZ >= item.depth / 2 && minZ <= item.depth / 2)
      )
        edges.front = Math.min(edges.front, minZ - item.depth / 2 - clearance);
      if (
        maxZ <= -item.depth / 2 + tolerance ||
        (endPanel &&
          z < 0 &&
          minZ <= -item.depth / 2 &&
          maxZ >= -item.depth / 2)
      )
        edges.back = Math.min(edges.back, -item.depth / 2 - maxZ - clearance);
    }
  }
  return edges;
}
