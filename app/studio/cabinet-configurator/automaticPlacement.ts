import {
  bounds,
  elementCenter,
  type KitchenElement,
  type Room,
  type Opening,
  type Island,
  type Wall,
} from './model';
import {boxInRoom, roomSegments, roomPoints} from './roomOutline';
import {snapRoomCorner} from './placement';

export type PlacementLayout = {
  room: Room;
  elements: KitchenElement[];
  openings: Opening[];
  islands: Island[];
};
/** Ephemeral IDs only. The caller clears this context when switching designs. */
export type PlacementContext = {elementId?: string | null; wall?: Wall};
export type PlacementCandidate = {
  element: KitchenElement;
  score: number;
  reason: 'run' | 'wall' | 'corner' | 'island' | 'space';
};
const overlaps = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
  a.left < b.right - 1e-7 &&
  a.right > b.left + 1e-7 &&
  a.top < b.bottom - 1e-7 &&
  a.bottom > b.top + 1e-7;
const verticalOverlap = (a: number, ah: number, b: number, bh: number) =>
  a < b + bh - 1e-7 && a + ah > b + 1e-7;
const elevation = (e: KitchenElement) => e.placement.elevation ?? 0;
const compatible = (a: KitchenElement, b: KitchenElement) =>
  (a.kind === 'wall-cabinet') === (b.kind === 'wall-cabinet') &&
  Math.abs(elevation(a) - elevation(b)) < 1;

/** Reserve the wall aperture's volume, including perpendicular/floor cabinets. */
function openingVolume(opening: Opening): KitchenElement {
  return {
    id: opening.id,
    kind: 'appliance',
    width: opening.width,
    depth: 0.5,
    height: opening.height,
    face: 'slab',
    placement: {
      mode: 'wall',
      wall: opening.wall,
      offset: opening.offset,
      elevation: opening.kind === 'window' ? (opening.sill ?? 0) : 0,
    },
  };
}
function islandVolume(island: Island): KitchenElement {
  return {
    id: island.id,
    kind: 'base',
    width: island.width,
    depth: island.depth,
    height: 36,
    face: 'slab',
    placement: {
      mode: 'floor',
      x: island.x,
      z: island.z,
      rotation: island.rotation,
    },
  };
}
export function validAutomaticPlacement(
  item: KitchenElement,
  layout: PlacementLayout,
  inRoom = true,
) {
  const box = bounds(item, layout.room);
  if (item.islandId) {
    const island = layout.islands.find((i) => i.id === item.islandId);
    if (
      !island ||
      item.placement.mode !== 'floor' ||
      item.kind === 'wall-cabinet' ||
      elevation(item) !== 0
    )
      return false;
    const p = item.placement,
      angle = (island.rotation * Math.PI) / 180;
    const dx = p.x - island.x,
      dz = p.z - island.z;
    const relative = ((p.rotation - island.rotation) * Math.PI) / 180;
    const hw =
      (Math.abs(item.width * Math.cos(relative)) +
        Math.abs(item.depth * Math.sin(relative))) /
      2;
    const hd =
      (Math.abs(item.width * Math.sin(relative)) +
        Math.abs(item.depth * Math.cos(relative))) /
      2;
    if (
      Math.abs(dx * Math.cos(angle) + dz * Math.sin(angle)) + hw >
        island.width / 2 + 1e-7 ||
      Math.abs(-dx * Math.sin(angle) + dz * Math.cos(angle)) + hd >
        island.depth / 2 + 1e-7
    )
      return false;
  }
  if (
    inRoom &&
    (!boxInRoom(layout.room, box) ||
      elevation(item) < 0 ||
      elevation(item) + item.height > layout.room.height)
  )
    return false;
  if (item.placement.mode === 'wall') {
    const wall = roomSegments(layout.room).find(
      (s) => s.id === (item.placement as {wall: Wall}).wall,
    );
    if (
      !wall ||
      item.placement.offset < 0 ||
      item.placement.offset + item.width > wall.length
    )
      return false;
  }
  return ![
    ...layout.elements,
    ...layout.openings.map((o) => openingVolume(o)),
    ...layout.islands.filter((i) => i.id !== item.islandId).map(islandVolume),
  ].some(
    (other) =>
      other.id !== item.id &&
      verticalOverlap(
        elevation(item),
        item.height,
        elevation(other),
        other.height,
      ) &&
      overlaps(box, bounds(other, layout.room)),
  );
}

/** Scores are tiers: local continuity > same wall > adjacent wall > other wall > island > free space.
 * Candidate boundaries come from geometry, not an inch-by-inch room scan.
 * Stable insertion order breaks ties so identical input always gives identical output.
 */
export function elementPlacementCandidates(
  item: KitchenElement,
  layout: PlacementLayout,
  context: PlacementContext = {},
  freeSpaceOnly = false,
): PlacementCandidate[] {
  const {room, elements, islands} = layout;
  const peers = elements.filter((e) => compatible(item, e));
  const active = peers.find((e) => e.id === context.elementId) ?? peers.at(-1);
  const center = active ? elementCenter(active, room) : {x: 0, z: 0};
  const activeWall =
    active?.placement.mode === 'wall' ? active.placement.wall : context.wall;
  const walls = roomSegments(room);
  const wallIndex = walls.findIndex((w) => w.id === activeWall);
  const result: PlacementCandidate[] = [];
  const add = (
    element: KitchenElement,
    score: number,
    reason: PlacementCandidate['reason'],
  ) => {
    if (freeSpaceOnly && reason !== 'space') return;
    if (!validAutomaticPlacement(element, layout)) return;
    const c = elementCenter(element, room);
    result.push({
      element,
      score:
        score - Math.min(99, Math.hypot(c.x - center.x, c.z - center.z) / 100),
      reason,
    });
  };
  const floor = (
    x: number,
    z: number,
    rotation: number,
    islandId?: string,
  ): KitchenElement => ({
    ...item,
    islandId,
    placement: {mode: 'floor', x, z, rotation, elevation: elevation(item)},
  });
  // Continue both ends of wall runs and both local-axis sides of free-standing runs.
  for (const peer of peers) {
    const score = peer === active ? 1000 : 650;
    if (peer.placement.mode === 'wall') {
      for (const offset of [
        peer.placement.offset + peer.width,
        peer.placement.offset - item.width,
      ])
        add(
          {
            ...item,
            islandId: undefined,
            placement: {
              mode: 'wall',
              wall: peer.placement.wall,
              offset,
              elevation: elevation(item),
            },
          },
          score,
          'run',
        );
    } else if (
      item.kind !== 'wall-cabinet' &&
      peer.placement.mode === 'floor'
    ) {
      const p = peer.placement,
        angle = (p.rotation * Math.PI) / 180;
      for (const sign of [1, -1]) {
        const distance = (peer.width + item.width) / 2;
        add(
          floor(
            p.x + sign * distance * Math.cos(angle),
            p.z + sign * distance * Math.sin(angle),
            p.rotation,
            peer.islandId,
          ),
          score,
          'run',
        );
      }
    }
  }
  if (item.configuration === 'corner') {
    for (const point of roomPoints(room)) {
      const candidate = floor(point.x, point.z, 0);
      if (snapRoomCorner(candidate, room, Math.max(item.width, item.depth)))
        add(candidate, 950, 'corner');
    }
  }
  const obstacles = [
    ...elements,
    ...layout.openings.map((o) => openingVolume(o)),
    ...islands.map(islandVolume),
  ];
  walls.forEach((wall, index) => {
    const offsets = new Set([0, wall.length - item.width]);
    for (const other of obstacles) {
      const b = bounds(other, room);
      offsets.add(wall.horizontal ? b.right - wall.x : b.bottom - wall.z);
      offsets.add(
        (wall.horizontal ? b.left - wall.x : b.top - wall.z) - item.width,
      );
    }
    const adjacent =
      wallIndex >= 0 &&
      ((index + 1) % walls.length === wallIndex ||
        (wallIndex + 1) % walls.length === index);
    const tier = wall.id === activeWall ? 800 : adjacent ? 700 : 600;
    for (const offset of offsets)
      add(
        {
          ...item,
          islandId: undefined,
          placement: {
            mode: 'wall',
            wall: wall.id,
            offset,
            elevation: elevation(item),
          },
        },
        tier,
        'wall',
      );
  });
  if (item.kind !== 'wall-cabinet' && elevation(item) === 0) {
    for (const island of islands) {
      if (item.width > island.width || item.depth > island.depth) continue;
      const angle = (island.rotation * Math.PI) / 180;
      for (const x of [
        -(island.width - item.width) / 2,
        (island.width - item.width) / 2,
      ])
        for (const z of [
          -(island.depth - item.depth) / 2,
          (island.depth - item.depth) / 2,
        ])
          add(
            floor(
              island.x + x * Math.cos(angle) - z * Math.sin(angle),
              island.z + x * Math.sin(angle) + z * Math.cos(angle),
              island.rotation,
              island.id,
            ),
            context.elementId === island.id ? 1000 : 500,
            'island',
          );
    }
  }
  if (result.length) return result.sort((a, b) => b.score - a.score);
  // Movable fallback preserves the requested elevation and searches all obstacle edges.
  for (const rotation of [0, 90]) {
    const hw = (rotation ? item.depth : item.width) / 2,
      hd = (rotation ? item.width : item.depth) / 2;
    const xs = new Set([room.width / 2, hw, room.width - hw]);
    const zs = new Set([room.depth / 2, hd, room.depth - hd]);
    for (const other of obstacles) {
      const b = bounds(other, room);
      xs.add(b.left - hw);
      xs.add(b.right + hw);
      zs.add(b.top - hd);
      zs.add(b.bottom + hd);
    }
    for (const p of roomPoints(room)) {
      xs.add(p.x + hw);
      xs.add(p.x - hw);
      zs.add(p.z + hd);
      zs.add(p.z - hd);
    }
    for (const x of xs)
      for (const z of zs) add(floor(x, z, rotation), 100, 'space');
  }
  return result.sort((a, b) => b.score - a.score);
}
export function automaticallyPlaceElement(
  item: KitchenElement,
  layout: PlacementLayout,
  context: PlacementContext = {},
): KitchenElement {
  const candidate = elementPlacementCandidates(item, layout, context)[0];
  if (candidate) return candidate.element;
  // A physically full/undersized room cannot contain another object. Stage it
  // outside the room with a visible bounds warning, never overlap the design.
  const right = Math.max(
    layout.room.width,
    ...layout.elements.map((e) => bounds(e, layout.room).right),
    ...layout.islands.map((i) => bounds(islandVolume(i), layout.room).right),
  );
  return {
    ...item,
    islandId: undefined,
    placement: {
      mode: 'floor',
      x: right + item.width / 2 + 6,
      z: item.depth / 2,
      rotation: 0,
      elevation: elevation(item),
    },
  };
}

export function automaticallyPlaceOpening(
  opening: Opening,
  layout: PlacementLayout,
  context: PlacementContext = {},
): Opening {
  const active = layout.elements.find((e) => e.id === context.elementId);
  const preferred =
    active?.placement.mode === 'wall'
      ? active.placement.wall
      : (context.wall ?? opening.wall);
  const candidates: {opening: Opening; score: number}[] = [];
  for (const wall of roomSegments(layout.room)) {
    const offsets = new Set([0, wall.length - opening.width, opening.offset]);
    for (const other of [
      ...layout.elements,
      ...layout.openings.map((o) => openingVolume(o)),
      ...layout.islands.map(islandVolume),
    ]) {
      const b = bounds(other, layout.room);
      offsets.add(wall.horizontal ? b.right - wall.x : b.bottom - wall.z);
      offsets.add(
        (wall.horizontal ? b.left - wall.x : b.top - wall.z) - opening.width,
      );
    }
    for (const offset of offsets) {
      const next = {...opening, wall: wall.id, offset};
      if (validAutomaticPlacement(openingVolume(next), layout))
        candidates.push({
          opening: next,
          score:
            (wall.id === preferred ? 1000 : 500) -
            Math.abs(offset - opening.offset) / 100,
        });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0]) return candidates[0].opening;
  // Openings have no floor mode. Stage beyond a wall's end if every aperture is occupied.
  const wall =
    roomSegments(layout.room).find((w) => w.id === preferred) ??
    roomSegments(layout.room)[0];
  const end = Math.max(
    wall.length,
    ...layout.openings
      .filter((o) => o.wall === wall.id)
      .map((o) => o.offset + o.width),
  );
  return {...opening, wall: wall.id, offset: end + 6};
}

export function automaticallyPlaceIsland(
  island: Island,
  layout: PlacementLayout,
): Island {
  const item = islandVolume(island);
  const candidates = elementPlacementCandidates(item, layout, {}, true).filter(
    (c) => c.reason === 'space',
  );
  candidates.sort((a, b) => {
    const x = elementCenter(a.element, layout.room),
      y = elementCenter(b.element, layout.room);
    return (
      Math.hypot(x.x - island.x, x.z - island.z) -
      Math.hypot(y.x - island.x, y.z - island.z)
    );
  });
  const placed =
    candidates[0]?.element ?? automaticallyPlaceElement(item, layout);
  const center = elementCenter(placed, layout.room);
  return {
    ...island,
    ...center,
    rotation:
      placed.placement.mode === 'wall'
        ? roomSegments(layout.room).find(
            (s) => s.id === (placed.placement as {wall: Wall}).wall,
          )!.rotation
        : placed.placement.rotation,
  };
}
