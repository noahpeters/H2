import {elementCenter, wallToFloor, type RoomElement, type Room} from './model';
import {roomSegments} from './roomOutline';
export const FIXTURE_CATALOG = {
  mirror: {label: 'Mirror', width: 30, depth: 1, height: 36},
  toilet: {label: 'Toilet', width: 20, depth: 29, height: 30},
  'freestanding-tub': {
    label: 'Freestanding bathtub',
    width: 66,
    depth: 32,
    height: 24,
  },
  'alcove-tub': {
    label: 'Rectangular / alcove bathtub',
    width: 60,
    depth: 32,
    height: 22,
  },
  'glass-shower': {
    label: 'Glass shower enclosure',
    width: 48,
    depth: 36,
    height: 96,
  },
} as const;
export type FixtureKind = keyof typeof FIXTURE_CATALOG;
export type FixtureSide = 'front' | 'back' | 'left' | 'right';
export function createFixture(
  kind: FixtureKind,
  id: string,
  room: Room,
): RoomElement {
  const {width, depth, height} = FIXTURE_CATALOG[kind];
  return {
    id,
    kind: 'fixture',
    fixtureKind: kind,
    width,
    depth,
    height: kind === 'glass-shower' ? room.height : height,
    face: 'slab',
    placement:
      kind === 'mirror'
        ? {
            mode: 'wall',
            wall: 'back',
            offset: 0,
            elevation: Math.max(0, Math.min(42, room.height - height)),
          }
        : {
            mode: 'floor',
            x: room.width / 2,
            z: room.depth / 2,
            rotation: 0,
          },
  };
}
/** Omit glass only when the entire side touches a real room-wall segment. */
export function showerGlassSides(item: RoomElement, room: Room): FixtureSide[] {
  const c = elementCenter(item, room);
  const angle = (wallToFloor(item, room).rotation * Math.PI) / 180;
  const world = (x: number, z: number) => ({
    x: c.x + x * Math.cos(angle) - z * Math.sin(angle),
    z: c.z + x * Math.sin(angle) + z * Math.cos(angle),
  });
  const w = item.width / 2,
    d = item.depth / 2;
  const sides: [FixtureSide, number[][]][] = [
    [
      'front',
      [
        [-w, d],
        [w, d],
      ],
    ],
    [
      'back',
      [
        [-w, -d],
        [w, -d],
      ],
    ],
    [
      'left',
      [
        [-w, -d],
        [-w, d],
      ],
    ],
    [
      'right',
      [
        [w, -d],
        [w, d],
      ],
    ],
  ];
  return sides
    .filter(
      ([, ends]) =>
        !roomSegments(room).some((wall) =>
          ends.every(([x, z]) => {
            const p = world(x, z),
              dx = p.x - wall.a.x,
              dz = p.z - wall.a.z;
            const along =
              (dx * (wall.b.x - wall.a.x) + dz * (wall.b.z - wall.a.z)) /
              wall.length;
            return (
              Math.abs(dx * wall.nx + dz * wall.nz) < 0.1 &&
              along >= -0.1 &&
              along <= wall.length + 0.1
            );
          }),
        ),
    )
    .map(([side]) => side);
}
