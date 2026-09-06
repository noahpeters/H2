import type {Room, Wall} from './model';
export type RoomPoint = {id: Wall; x: number; z: number};
export function roomPoints(room: Room): RoomPoint[] {
  return (
    room.outline ?? [
      {id: 'back', x: 0, z: 0},
      {id: 'right', x: room.width, z: 0},
      {id: 'front', x: room.width, z: room.depth},
      {id: 'left', x: 0, z: room.depth},
    ]
  );
}
export function roomSegments(room: Room) {
  const points = roomPoints(room);
  return points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const nx = -dz / length,
      nz = dx / length;
    return {
      id: a.id,
      a,
      b,
      length,
      horizontal: dz === 0,
      x: Math.min(a.x, b.x),
      z: Math.min(a.z, b.z),
      nx,
      nz,
      rotation: nz > 0 ? 0 : nx < 0 ? 90 : nz < 0 ? 180 : 270,
      label: ['back', 'left', 'right', 'front'].includes(a.id)
        ? a.id
        : `Wall ${index + 1}`,
    };
  });
}
export function roomWall(room: Room, id: Wall) {
  return roomSegments(room).find((s) => s.id === id) ?? roomSegments(room)[0];
}
export function wallPoint(room: Room, id: Wall, offset: number) {
  const s = roomWall(room, id);
  return {
    x: s.x + (s.horizontal ? offset : 0),
    z: s.z + (s.horizontal ? 0 : offset),
  };
}
export function validOutline(value: unknown): value is RoomPoint[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 40)
    return false;
  const points = value as RoomPoint[];
  if (
    points.some(
      (p) =>
        !p ||
        typeof p.id !== 'string' ||
        !/^(back|front|left|right|segment-[a-z0-9-]+)$/.test(p.id) ||
        p.id.length > 90 ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.z) ||
        Math.abs(p.x) > 10000 ||
        Math.abs(p.z) > 10000,
    )
  )
    return false;
  if (new Set(points.map((p) => p.id)).size !== points.length) return false;
  let area = 0;
  const edges = points.map((a, i) => ({a, b: points[(i + 1) % points.length]}));
  for (let i = 0; i < edges.length; i++) {
    const {a, b} = edges[i];
    if ((a.x === b.x) === (a.z === b.z) || Math.hypot(b.x - a.x, b.z - a.z) < 6)
      return false;
    const c = edges[(i + 1) % edges.length].b;
    if ((a.x === b.x) === (b.x === c.x)) return false;
    area += a.x * b.z - b.x * a.z;
    for (let j = i + 2; j < edges.length; j++) {
      if (i === 0 && j === edges.length - 1) continue;
      const {a: u, b: v} = edges[j];
      if (
        Math.max(Math.min(a.x, b.x), Math.min(u.x, v.x)) <=
          Math.min(Math.max(a.x, b.x), Math.max(u.x, v.x)) &&
        Math.max(Math.min(a.z, b.z), Math.min(u.z, v.z)) <=
          Math.min(Math.max(a.z, b.z), Math.max(u.z, v.z))
      )
        return false;
    }
  }
  return area >= 72;
}
export function pointInRoom(room: Room, x: number, z: number) {
  const points = roomPoints(room);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      x >= Math.min(a.x, b.x) - 1e-7 &&
      x <= Math.max(a.x, b.x) + 1e-7 &&
      z >= Math.min(a.z, b.z) - 1e-7 &&
      z <= Math.max(a.z, b.z) + 1e-7 &&
      Math.abs((x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x)) < 1e-7
    )
      return true;
    if (
      a.z > z !== b.z > z &&
      x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function boxInRoom(
  room: Room,
  box: {left: number; right: number; top: number; bottom: number},
) {
  // Split at every boundary coordinate: corners alone miss concave cut-outs.
  const xs = [
    box.left,
    box.right,
    ...roomPoints(room)
      .map((p) => p.x)
      .filter((x) => x > box.left && x < box.right),
  ].sort((a, b) => a - b);
  const zs = [
    box.top,
    box.bottom,
    ...roomPoints(room)
      .map((p) => p.z)
      .filter((z) => z > box.top && z < box.bottom),
  ].sort((a, b) => a - b);
  if (
    ![
      [box.left, box.top],
      [box.right, box.top],
      [box.left, box.bottom],
      [box.right, box.bottom],
    ].every(([x, z]) => pointInRoom(room, x, z))
  )
    return false;
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < zs.length; j++)
      if (!pointInRoom(room, (xs[i - 1] + xs[i]) / 2, (zs[j - 1] + zs[j]) / 2))
        return false;
  return true;
}
export function moveRoomWall(room: Room, id: Wall, position: number) {
  const points = roomPoints(room).map((p) => ({...p}));
  const i = points.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const next = (i + 1) % points.length;
  const axis = points[i].x === points[next].x ? 'x' : 'z';
  points[i][axis] = points[next][axis] = Math.round(position);
  return validOutline(points) ? points : null;
}
/** Replace a three-wall detour and its collinear shoulders with one wall. */
export function removeRoomRecess(
  room: Room,
  selected: Wall,
): RoomPoint[] | null {
  const points = roomPoints(room),
    n = points.length;
  if (n < 8) return null;
  const selectedIndex = points.findIndex((p) => p.id === selected);
  if (selectedIndex < 0) return null;
  // Accept the middle wall or either short return, including across index zero.
  for (const shift of [0, 1, -1]) {
    const center = (selectedIndex + shift + n) % n;
    const start = (center - 2 + n) % n;
    const ordered = Array.from({length: n}, (_, i) => ({
      ...points[(start + i) % n],
    }));
    const [a, b, c, d, e, f] = ordered;
    const horizontal = a.z === b.z;
    if (
      horizontal
        ? !(e.z === f.z && a.z === e.z && c.z === d.z)
        : !(e.x === f.x && a.x === e.x && c.x === d.x)
    )
      continue;
    // Only remove a detour, never a reversed or overlapping wall run.
    const axis = horizontal ? 'x' : 'z';
    const direction = Math.sign(f[axis] - a[axis]);
    if (
      !direction ||
      [b[axis] - a[axis], d[axis] - c[axis], f[axis] - e[axis]].some(
        (v) => Math.sign(v) !== direction,
      )
    )
      continue;
    const simplified = [a, ...ordered.slice(5)];
    if (validOutline(simplified)) return simplified;
  }
  return null;
}

export function addRoomRecess(
  room: Room,
  id: Wall,
  key: string,
  outward = false,
) {
  const points = roomPoints(room).map((p) => ({...p}));
  const i = points.findIndex((p) => p.id === id),
    s = roomWall(room, id);
  if (i < 0 || s.length < 36) return null;
  const t = Math.floor(s.length / 3),
    dx = (s.b.x - s.a.x) / s.length,
    dz = (s.b.z - s.a.z) / s.length;
  const depth =
    (outward ? -1 : 1) *
    Math.min(24, Math.floor(Math.min(room.width, room.depth) / 4));
  const a = {x: s.a.x + dx * t, z: s.a.z + dz * t},
    b = {x: s.a.x + dx * (s.length - t), z: s.a.z + dz * (s.length - t)};
  points.splice(
    i + 1,
    0,
    ...[
      a,
      {x: a.x + s.nx * depth, z: a.z + s.nz * depth},
      {x: b.x + s.nx * depth, z: b.z + s.nz * depth},
      b,
    ].map((p, j) => ({...p, id: `segment-${key}-${j}` as Wall})),
  );
  return validOutline(points) ? points : null;
}
export function presetOutline(
  room: Room,
  kind: 'rectangle' | 'l-shape' | 'alcove',
) {
  const w = room.width,
    d = room.depth;
  if (kind === 'rectangle') return roomPoints({...room, outline: undefined});
  const x = Math.round(w * 0.6),
    z = Math.round(d * 0.4);
  if (kind === 'l-shape')
    return [
      {id: 'back', x: 0, z: 0},
      {id: 'right', x: w, z: 0},
      {id: 'segment-l-1', x: w, z},
      {id: 'segment-l-2', x, z},
      {id: 'front', x, z: d},
      {id: 'left', x: 0, z: d},
    ] as RoomPoint[];
  return addRoomRecess({...room, outline: undefined}, 'back', 'alcove', true)!;
}
