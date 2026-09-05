import {
  bounds,
  elementCenter,
  wallToFloor,
  type KitchenElement,
  type Island,
  type Room,
  type Wall,
} from './model';
export function snapWall(item: KitchenElement, room: Room, threshold = 3) {
  if (item.placement.mode !== 'floor') return;
  const {x, z, elevation = 0} = item.placement;
  const candidates: {
    wall: Wall;
    distance: number;
    offset: number;
    length: number;
  }[] = [
    {
      wall: 'back',
      distance: Math.abs(z - item.depth / 2),
      offset: x - item.width / 2,
      length: room.width,
    },
    {
      wall: 'front',
      distance: Math.abs(z - (room.depth - item.depth / 2)),
      offset: x - item.width / 2,
      length: room.width,
    },
    {
      wall: 'left',
      distance: Math.abs(x - item.depth / 2),
      offset: z - item.width / 2,
      length: room.depth,
    },
    {
      wall: 'right',
      distance: Math.abs(x - (room.width - item.depth / 2)),
      offset: z - item.width / 2,
      length: room.depth,
    },
  ];
  const target = candidates
    .filter(
      (c) =>
        c.distance <= threshold &&
        c.offset >= -threshold &&
        c.offset + item.width <= c.length + threshold,
    )
    .sort((a, b) => a.distance - b.distance)[0];
  if (!target) return;
  item.placement = {
    mode: 'wall',
    wall: target.wall,
    offset: Math.max(
      0,
      Math.min(target.length - item.width, Math.round(target.offset)),
    ),
    elevation,
  };
  delete item.islandId;
}
export function islandAt(item: KitchenElement, islands: Island[], room: Room) {
  const p = elementCenter(item, room);
  return islands
    .filter((i) => {
      const a = (-i.rotation * Math.PI) / 180,
        dx = p.x - i.x,
        dz = p.z - i.z;
      return (
        Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) <= i.width / 2 &&
        Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) <= i.depth / 2
      );
    })
    .sort(
      (a, b) =>
        Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z),
    )[0]?.id;
}
export function positionElement(
  item: KitchenElement,
  x: number,
  z: number,
  room: Room,
) {
  const elevation =
    item.placement.mode === 'floor'
      ? (item.placement.elevation ?? 0)
      : item.placement.elevation;
  item.placement = {...wallToFloor(item, room), mode: 'floor', x, z, elevation};
}
/** Snap the footprint inside an island boundary, in the island's local axes. */
export function snapIslandEdges(
  item: KitchenElement,
  islands: Island[],
  room: Room,
  threshold = 3,
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
  if (hw > island.width / 2 || hd > island.depth / 2) return;
  const nearest = (value: number, limit: number) => {
    const target = value < 0 ? -limit : limit;
    return Math.abs(value - target) <= threshold ? target : value;
  };
  x = nearest(x, island.width / 2 - hw);
  z = nearest(z, island.depth / 2 - hd);
  p.x = island.x + x * c - z * s;
  p.z = island.z + x * s + z * c;
}
export function snapAdjacent(
  item: KitchenElement,
  items: KitchenElement[],
  room: Room,
  threshold = 3,
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
    const elevation = (i: KitchenElement) => i.placement.elevation ?? 0;
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
