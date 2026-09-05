import {
  bounds,
  elementCenter,
  wallToFloor,
  type KitchenElement,
  type Island,
  type Room,
} from './model';
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
