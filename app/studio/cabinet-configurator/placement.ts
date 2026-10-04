import {snappingDistance, quantizePosition} from './positioningPrecision';
import {isPartition, wallFaceOffset} from './wallDimensions';
import {
  islandContainsElement,
  islandOverlapsElement,
  islandOutline,
} from './islandFootprint';
import {placeOpening} from './openingPlacement';
import {
  bounds,
  elementCenter,
  wallToFloor,
  type RoomElement,
  type Island,
  type Room,
  type Wall,
} from './model';
import {roomSegments, roomPoints, boxInRoom} from './roomOutline';
/** Corner footprints sit flush against both walls; the notch points inward. */
export function snapRoomCorner(
  item: RoomElement,
  room: Room,
  threshold = snappingDistance(room),
) {
  if (
    item.kind !== 'base' ||
    item.configuration !== 'corner' ||
    item.placement.mode !== 'floor'
  )
    return false;
  const p = item.placement;
  const corners = roomPoints(room);
  const segments = roomSegments(room);
  const candidates = corners.flatMap((corner, index) => {
    const prev = segments[(index + corners.length - 1) % corners.length],
      next = segments[index];
    const nx = prev.nx + next.nx,
      nz = prev.nz + next.nz;
    const rotation = nx > 0 ? (nz > 0 ? 0 : 270) : nz > 0 ? 90 : 180;
    const width = rotation % 180 ? item.depth : item.width;
    const depth = rotation % 180 ? item.width : item.depth;
    return [
      {
        rotation,
        width,
        depth,
        x: corner.x + (nx * width) / 2,
        z: corner.z + (nz * depth) / 2,
      },
    ];
  });
  const target = candidates
    .filter(
      (c) =>
        c.width <= room.width &&
        c.depth <= room.depth &&
        boxInRoom(room, {
          left: c.x - c.width / 2,
          right: c.x + c.width / 2,
          top: c.z - c.depth / 2,
          bottom: c.z + c.depth / 2,
        }) &&
        Math.abs(p.x - c.x) <= threshold &&
        Math.abs(p.z - c.z) <= threshold,
    )
    .sort(
      (a, b) =>
        Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z),
    )[0];
  if (!target) return false;
  Object.assign(p, {x: target.x, z: target.z, rotation: target.rotation});
  delete item.islandId;
  return true;
}
export function snapWall(
  item: RoomElement,
  room: Room,
  threshold = snappingDistance(room),
) {
  if (item.placement.mode !== 'floor') return;
  const {x, z, elevation = 0} = item.placement;
  const candidates: {
    wall: Wall;
    distance: number;
    offset: number;
    length: number;
    rotation: number;
  }[] = roomSegments(room).flatMap((s) =>
    (isPartition(room, s.id) ? [1, -1] : [1]).map((side) => ({
      wall: s.id,
      distance: Math.abs(
        s.horizontal
          ? z -
              (s.z +
                side * s.nz * (wallFaceOffset(room, s.id) + item.depth / 2))
          : x -
              (s.x +
                side * s.nx * (wallFaceOffset(room, s.id) + item.depth / 2)),
      ),
      offset: (s.horizontal ? x - s.x : z - s.z) - item.width / 2,
      length: s.length,
      rotation: (s.rotation + (side === -1 ? 180 : 0)) % 360,
    })),
  );
  const target = candidates
    .filter(
      (c) =>
        c.distance <= threshold &&
        c.offset >= -threshold &&
        c.offset + item.width <= c.length + threshold &&
        boxInRoom(
          room,
          bounds(
            {
              ...item,
              placement: {
                mode: 'wall',
                wall: c.wall,
                rotation: c.rotation,
                offset: Math.max(
                  0,
                  Math.min(
                    c.length - item.width,
                    quantizePosition(c.offset, room),
                  ),
                ),
                elevation,
              },
            },
            room,
          ),
        ),
    )
    .sort((a, b) => a.distance - b.distance)[0];
  if (!target) return;
  item.placement = {
    mode: 'wall',
    wall: target.wall,
    rotation: target.rotation,
    offset: Math.max(
      0,
      Math.min(
        target.length - item.width,
        quantizePosition(target.offset, room),
      ),
    ),
    elevation,
  };
  delete item.islandId;
}
export function islandAt(item: RoomElement, islands: Island[], room: Room) {
  const current = islands.find((i) => i.id === item.islandId);
  if (current && islandOverlapsElement(item, current)) return current.id;
  const p = elementCenter(item, room);
  return islands
    .filter((i) => islandContainsElement(item, i))
    .sort(
      (a, b) =>
        Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z),
    )[0]?.id;
}
export function positionElement(
  item: RoomElement,
  x: number,
  z: number,
  room: Room,
) {
  const elevation =
    item.kind === 'base' || item.kind === 'tall'
      ? 0
      : (item.placement.elevation ?? 0);
  if (item.fixtureKind === 'mirror') {
    const previous =
      item.placement.mode === 'wall'
        ? item.placement
        : {wall: 'back' as const, offset: 0};
    item.placement = {
      mode: 'wall',
      ...placeOpening(room, {...previous, width: item.width}, x, z),
      elevation: elevation ?? 42,
    };
    return;
  }
  item.placement = {
    ...wallToFloor(item, room),
    mode: 'floor',
    x: quantizePosition(x, room),
    z: quantizePosition(z, room),
    elevation,
  };
}
/** Snap the footprint inside an island boundary, in the island's local axes. */
export function snapIslandEdges(
  item: RoomElement,
  islands: Island[],
  room: Room,
  threshold = snappingDistance(room),
) {
  if (item.placement.mode !== 'floor') return;
  const island = islands.find((i) => i.id === islandAt(item, islands, room));
  if (!island) return;
  const p = item.placement;
  const angle = (island.rotation * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const dx = p.x - island.x,
    dz = p.z - island.z;
  let x = dx * c + dz * s,
    z = -dx * s + dz * c;
  const relative = ((p.rotation - island.rotation) * Math.PI) / 180;
  const hw =
    (Math.abs(item.width * Math.cos(relative)) +
      Math.abs(item.depth * Math.sin(relative))) /
    2;
  const hd =
    (Math.abs(item.width * Math.sin(relative)) +
      Math.abs(item.depth * Math.cos(relative))) /
    2;
  const outline = islandOutline(island);
  if (
    hw * 2 > outline.right - outline.left ||
    hd * 2 > outline.bottom - outline.top
  )
    return;
  const nearest = (value: number, min: number, max: number) => {
    const target = Math.abs(value - min) < Math.abs(value - max) ? min : max;
    return Math.abs(value - target) <= threshold ? target : value;
  };
  x = nearest(x, outline.left + hw, outline.right - hw);
  z = nearest(z, outline.top + hd, outline.bottom - hd);
  p.x = island.x + x * c - z * s;
  p.z = island.z + x * s + z * c;
}
export function snapAdjacent(
  item: RoomElement,
  items: RoomElement[],
  room: Room,
  threshold = snappingDistance(room),
) {
  if (item.placement.mode === 'wall') {
    const p = item.placement;
    let delta = Infinity;
    for (const other of items) {
      if (
        other.id === item.id ||
        other.placement.mode !== 'wall' ||
        other.placement.wall !== p.wall
      )
        continue;
      if (
        p.elevation >= other.placement.elevation + other.height ||
        other.placement.elevation >= p.elevation + item.height
      )
        continue;
      for (const distance of [
        other.placement.offset - p.offset - item.width,
        other.placement.offset + other.width - p.offset,
      ])
        if (Math.abs(distance) < Math.abs(delta)) delta = distance;
    }
    if (Math.abs(delta) <= threshold) p.offset += delta;
    return;
  }
  if (item.placement.mode !== 'floor') return;
  const b = bounds(item, room);
  let dx = Infinity,
    dz = Infinity;
  for (const other of items) {
    if (other.id === item.id) continue;
    const elevation = (i: RoomElement) => i.placement.elevation ?? 0;
    if (
      elevation(item) >= elevation(other) + other.height ||
      elevation(other) >= elevation(item) + item.height
    )
      continue;
    const o = bounds(other, room);
    if (b.top < o.bottom && b.bottom > o.top)
      for (const d of [o.left - b.right, o.right - b.left])
        if (Math.abs(d) < Math.abs(dx)) dx = d;
    if (b.left < o.right && b.right > o.left)
      for (const d of [o.top - b.bottom, o.bottom - b.top])
        if (Math.abs(d) < Math.abs(dz)) dz = d;
  }
  if (Math.abs(dx) <= threshold) item.placement.x += dx;
  if (Math.abs(dz) <= threshold) item.placement.z += dz;
}
