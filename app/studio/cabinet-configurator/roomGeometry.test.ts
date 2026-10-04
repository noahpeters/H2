import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry, openingGeometry} from './roomGeometry';
import {wallToFloor, bounds, type RoomElement, type Room} from './model';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const base: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'front', offset: 18, elevation: 0},
};
function descendants(object: THREE.Object3D) {
  const children: THREE.Object3D[] = [];
  object.traverse((child) => children.push(child));
  return children;
}
describe('four wall room geometry', () => {
  it.each([
    ['base', 0, 'top'],
    ['wall-cabinet', 0, 'top'],
    ['wall-cabinet', 54, 'bottom'],
    ['tall', 0, 'bottom'],
  ] as const)(
    'places each %s door from its absolute top at %s inches (%s edge)',
    (kind, elevation, expectedEdge) => {
      for (const face of ['shaker', 'slab'] as const) {
        const height = kind === 'tall' ? 84 : kind === 'base' ? 34.5 : 30;
        const group = cabinetGeometry(
          {
            ...base,
            kind,
            width: 36,
            height,
            face,
            placement: {...base.placement, elevation},
          },
          false,
        );
        const doors = group.children.filter(
          (child) => child.name === 'cabinet-front',
        ) as THREE.Mesh<THREE.BoxGeometry>[];
        expect(doors).toHaveLength(2);
        for (const door of doors) {
          const handle = door.getObjectByName('cabinet-door-handle')!;
          const margin = face === 'shaker' ? 1 : 4;
          expect(handle.position.y / 0.0254).toBeCloseTo(
            (expectedEdge === 'top' ? 1 : -1) *
              (door.geometry.parameters.height / 0.0254 / 2 - margin),
          );
        }
      }
    },
  );
  it('evaluates doors in a multi-door tall cabinet independently', () => {
    const group = cabinetGeometry(
      {
        ...base,
        kind: 'tall',
        width: 36,
        height: 84,
        tallConfiguration: 'one-oven',
      },
      false,
    );
    const doors = group.children.filter(
      (child) =>
        child.name === 'cabinet-front' &&
        child.getObjectByName('cabinet-door-handle'),
    ) as THREE.Mesh<THREE.BoxGeometry>[];
    expect(doors).toHaveLength(2);
    for (const door of doors) {
      const handle = door.getObjectByName('cabinet-door-handle')!;
      const absoluteTop =
        84 / 2 +
        door.position.y / 0.0254 +
        door.geometry.parameters.height / 0.0254 / 2;
      expect(Math.sign(handle.position.y)).toBe(absoluteTop <= 35 ? 1 : -1);
    }
  });
  it.each(['base', 'tall', 'wall-cabinet'] as const)(
    'renders inset shaker %s fronts inside a flush face frame',
    (kind) => {
      for (const width of [30, 36]) {
        const group = cabinetGeometry(
          {...base, kind, width, face: 'shaker'},
          false,
          false,
          {...room, overlay: 'inset'},
        );
        group.updateMatrixWorld(true);
        const frames = group.children.filter(
          (child) => child.name === 'cabinet-face-frame',
        );
        const fronts = group.children.filter(
          (child) => child.name === 'cabinet-front',
        );
        expect(fronts).toHaveLength(width > 30 ? 2 : 1);
        expect(frames).toHaveLength(width > 30 ? 5 : 4);
        for (const frame of frames) {
          expect(new THREE.Box3().setFromObject(frame).max.z).toBeCloseTo(
            (base.depth / 2 + 0.75) * 0.0254,
          );
        }
        for (const front of fronts) {
          const mesh = front as THREE.Mesh;
          mesh.geometry.computeBoundingBox();
          expect(
            mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
              .max.z,
          ).toBeLessThan((base.depth / 2 + 0.75) * 0.0254);
        }
      }
    },
  );
  it('uses two full-height stiles and four single rails for three inset drawers', () => {
    const group = cabinetGeometry(
      {...base, configuration: 'three-drawer'},
      false,
      false,
      {...room, overlay: 'inset'},
    );
    const frames = group.children.filter(
      (c) => c.name === 'cabinet-face-frame',
    ) as THREE.Mesh<THREE.BoxGeometry>[];
    expect(frames).toHaveLength(6);
    expect(
      frames.filter((c) => c.geometry.parameters.height > 1.5 * 0.0254),
    ).toHaveLength(2);
    const fronts = group.children.filter((c) => c.name === 'cabinet-front');
    expect(fronts).toHaveLength(3);
    group.updateMatrixWorld(true);
    for (let i = 0; i < frames.length; i++)
      for (let j = i + 1; j < frames.length; j++) {
        const intersection = new THREE.Box3()
          .setFromObject(frames[i])
          .intersect(new THREE.Box3().setFromObject(frames[j]));
        const size = intersection.getSize(new THREE.Vector3());
        expect(size.x * size.y * size.z).toBeLessThan(1e-10);
      }
  });
  it('renders a microwave drawer above one storage drawer under a countertop', () => {
    const group = cabinetGeometry(
      {...base, configuration: 'microwave-drawer'},
      true,
    );
    const microwave = group.getObjectByName('base-microwave-drawer');
    expect(microwave).toBeDefined();
    const fronts = group.children.filter(
      (child) => child.name === 'cabinet-front',
    );
    expect(fronts).toHaveLength(1);
    group.updateMatrixWorld(true);
    const applianceBounds = new THREE.Box3().setFromObject(microwave!);
    const drawerBounds = new THREE.Box3().setFromObject(fronts[0]);
    expect(applianceBounds.min.y).toBeGreaterThan(drawerBounds.max.y);
    expect(applianceBounds.max.y).toBeLessThan((base.height / 2) * 0.0254);
  });
  it.each(['one-oven', 'two-oven', 'coffee-maker'] as const)(
    'renders integrated %s with drawers and width-dependent upper doors',
    (tallConfiguration) => {
      for (const width of [30, 36]) {
        const group = cabinetGeometry(
          {...base, kind: 'tall', height: 84, width, tallConfiguration},
          false,
        );
        const appliances = group.children.filter((child) =>
          child.name.startsWith('tall-cabinet-'),
        );
        expect(appliances).toHaveLength(
          tallConfiguration === 'two-oven' ? 2 : 1,
        );
        const fronts = group.children.filter(
          (child) => child.name === 'cabinet-front',
        );
        expect(fronts).toHaveLength(2 + (width > 30 ? 2 : 1));
        if (tallConfiguration === 'coffee-maker') {
          // Appliance center is 45 inches above the floor: 36-inch sill plus half its 18-inch height.
          expect(appliances[0].position.y / 0.0254 + 42).toBeCloseTo(45);
        }
      }
    },
  );
  it.each(['tall', 'wall-cabinet'] as const)(
    'closes %s with a wood top at its configured height',
    (kind) => {
      for (const height of [30, 84]) {
        const cabinet = cabinetGeometry({...base, kind, height}, false);
        cabinet.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(0, 3, 0),
          new THREE.Vector3(0, -1, 0),
        );
        const hit = ray.intersectObject(cabinet, true)[0];
        expect(hit.object.name).toBe('cabinet-top');
        expect(hit.point.y).toBeCloseTo((height / 2) * 0.0254);
      }
    },
  );
  it('leaves the corner cabinet front-right notch open', () => {
    const corner = cabinetGeometry(
      {...base, configuration: 'corner', width: 36, depth: 36},
      true,
    );
    corner.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(15 * 0.0254, 2, 15 * 0.0254),
      new THREE.Vector3(0, -1, 0),
    );
    expect(ray.intersectObject(corner, true)).toHaveLength(0);
    ray.set(
      new THREE.Vector3(-12 * 0.0254, 2, 12 * 0.0254),
      new THREE.Vector3(0, -1, 0),
    );
    expect(ray.intersectObject(corner, true).length).toBeGreaterThan(0);
  });
  it.each(['single-door', 'sink'] as const)(
    'uses only the shared island slab for %s cabinets',
    (configuration) => {
      const item = {...base, configuration};
      const standalone = cabinetGeometry(item, true);
      const shared = cabinetGeometry(item, true, true);
      const stoneCount = (group: THREE.Group) =>
        group.children.filter(
          (child) =>
            child instanceof THREE.Mesh &&
            (child.material as THREE.MeshStandardMaterial).color.getHex() ===
              0xe0d9cc,
        ).length;
      expect(stoneCount(standalone)).toBeGreaterThan(0);
      expect(stoneCount(shared)).toBe(0);
      const nonStoneCount = (group: THREE.Group) =>
        group.children.length - stoneCount(group);
      expect(nonStoneCount(shared)).toBe(nonStoneCount(standalone));
    },
  );
  it('renders an apron-front farmhouse sink and countertop opening', () => {
    const sink = cabinetGeometry(
      {...base, width: 36, configuration: 'farmhouse-sink'},
      true,
    );
    expect(sink.getObjectByName('farmhouse-sink-apron')).toBeDefined();
  });

  it('renders wall-mounted floating shelves without a cabinet carcass', () => {
    const shelves = cabinetGeometry(
      {
        ...base,
        kind: 'wall-cabinet',
        height: 36,
        depth: 11,
        storage: {
          type: 'floating-shelves',
          shelves: 3,
          drawers: 0,
          rodHeight: 68,
          lowerRodHeight: 36,
          shelfSpacing: 0,
          dividerPercent: 40,
          doors: false,
          back: false,
          angled: false,
        },
      },
      false,
    );
    expect(
      shelves.children.filter((child) => child.name === 'floating-shelf'),
    ).toHaveLength(3);
    expect(shelves.getObjectByName('cabinet-front')).toBeUndefined();
  });
  it('places front-wall objects facing inward with the correct center and bounds', () => {
    expect(wallToFloor(base, room)).toEqual({
      mode: 'floor',
      x: 33,
      z: 108,
      rotation: 180,
    });
    expect(bounds(base, room)).toEqual({
      left: 18,
      right: 48,
      top: 96,
      bottom: 120,
    });
  });
  it.each(['back', 'front', 'left', 'right'] as const)(
    'places opening geometry flush on the %s wall',
    (wall) => {
      const mesh = openingGeometry(
        {id: 'door', kind: 'door', wall, offset: 12, width: 32, height: 80},
        room,
      );
      const b = new THREE.Box3().setFromObject(mesh);
      const horizontal = wall === 'back' || wall === 'front';
      const size = b.getSize(new THREE.Vector3());
      expect(horizontal ? size.z : size.x).toBeCloseTo(4.5 * 0.0254);
      expect(horizontal ? mesh.position.z : mesh.position.x).toBeCloseTo(
        (wall === 'back'
          ? -60
          : wall === 'front'
            ? 60
            : wall === 'left'
              ? -72
              : 72) * 0.0254,
      );
    },
  );
  it('leaves a true countertop opening over the sink basin', () => {
    const sink = cabinetGeometry({...base, configuration: 'sink'}, true);
    sink.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = ray.intersectObject(sink, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeLessThan((base.height / 2) * 0.0254);
  });
});
