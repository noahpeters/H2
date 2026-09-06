import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {cabinetGeometry, openingGeometry} from './kitchenGeometry';
import {wallToFloor, bounds, type KitchenElement, type Room} from './model';
const room: Room = {
  width: 144,
  depth: 120,
  height: 96,
  floor: 'oak',
  walls: 'plaster',
};
const base: KitchenElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  placement: {mode: 'wall', wall: 'front', offset: 18, elevation: 0},
};
describe('four wall kitchen geometry', () => {
  it('centers standard tall cabinet handles 36 inches above the floor', () => {
    for (const height of [72, 84, 96])
      for (const width of [30, 36])
        for (const elevation of [0, 6]) {
          const group = cabinetGeometry(
            {
              ...base,
              kind: 'tall',
              height,
              width,
              placement: {mode: 'wall', wall: 'back', offset: 0, elevation},
            },
            false,
          );
          const handles = group.children.filter(
            (child) =>
              child instanceof THREE.Mesh &&
              Math.abs(child.geometry.parameters.width - 0.35 * 0.0254) <
                1e-6 &&
              Math.abs(child.geometry.parameters.height - 4 * 0.0254) < 1e-6,
          );
          expect(handles).toHaveLength(width > 30 ? 2 : 1);
          for (const handle of handles)
            expect(
              handle.position.y / 0.0254 + height / 2 + elevation,
            ).toBeCloseTo(36);
        }
  });
  it.each(['one-oven', 'two-oven', 'coffee-maker'] as const)(
    'places upper door handles near the bottom for %s cabinets',
    (tallConfiguration) => {
      for (const width of [30, 36])
        for (const face of ['shaker', 'slab', 'inset-shaker'] as const) {
          const group = cabinetGeometry(
            {...base, kind: 'tall', height: 84, width, face, tallConfiguration},
            false,
          );
          const doors = group.children.filter(
            (child) => child.name === 'cabinet-front' && child.position.y > 0,
          ) as THREE.Mesh<THREE.BoxGeometry>[];
          const handles = group.children.filter(
            (child) =>
              child instanceof THREE.Mesh &&
              Math.abs(child.geometry.parameters.width - 0.35 * 0.0254) <
                1e-6 &&
              Math.abs(child.geometry.parameters.height - 4 * 0.0254) < 1e-6,
          ) as THREE.Mesh[];
          expect(handles).toHaveLength(width > 30 ? 2 : 1);
          expect(doors).toHaveLength(handles.length);
          for (let i = 0; i < handles.length; i++) {
            const height = doors[i].geometry.parameters.height;
            expect(handles[i].position.y).toBeCloseTo(
              doors[i].position.y -
                height / 2 +
                Math.min(4 * 0.0254, height / 2),
            );
          }
        }
    },
  );
  it.each(['base', 'tall', 'wall-cabinet'] as const)(
    'renders inset shaker %s fronts inside a flush face frame',
    (kind) => {
      for (const width of [30, 36]) {
        const group = cabinetGeometry(
          {...base, kind, width, face: 'inset-shaker'},
          false,
        );
        group.updateMatrixWorld(true);
        const frames = group.children.filter(
          (child) => child.name === 'cabinet-face-frame',
        );
        const fronts = group.children.filter(
          (child) => child.name === 'cabinet-front',
        );
        expect(fronts).toHaveLength(width > 30 ? 2 : 1);
        expect(frames).toHaveLength(fronts.length * 4);
        for (const frame of frames) {
          expect(new THREE.Box3().setFromObject(frame).max.z).toBeCloseTo(
            (base.depth / 2) * 0.0254,
          );
        }
        for (const front of fronts) {
          expect(new THREE.Box3().setFromObject(front).max.z).toBeLessThan(
            (base.depth / 2) * 0.0254,
          );
        }
      }
    },
  );
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
      expect(horizontal ? size.z : size.x).toBeLessThan(0.07);
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
