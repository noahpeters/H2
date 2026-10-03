import {expect, test} from 'vitest';
import * as THREE from 'three';
import {blankStudy} from './CabinetConfigurator';
import {bounds, validateLayout, wallToFloor, type RoomElement} from './model';
import {roomSegments, presetOutline} from './roomOutline';
import {cabinetGeometry, roomGeometry, openingGeometry} from './roomGeometry';
import {elementTransform, disposeStudyObject} from './studyScene';
import {snapWall} from './placement';
import {validAutomaticPlacement} from './automaticPlacement';
import {validStudy} from './savedRoomProtocol';
import {addPhotoLighting, DEFAULT_PHOTO_SETTINGS} from './photoLighting';
import {wallThickness, wallFootprint, wallBounds} from './wallDimensions';

const INCH = 0.0254;
const base: RoomElement = {
  id: 'base',
  kind: 'base',
  face: 'slab',
  width: 24,
  depth: 24,
  height: 34.5,
  placement: {mode: 'wall', wall: 'back', offset: 6, elevation: 0},
};
const area = (points: {x: number; z: number}[]) =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length];
      return sum + a.x * b.z - b.x * a.z;
    }, 0),
  ) / 2;

test.each(['rectangle', 'l-shape', 'alcove'] as const)(
  '%s walls have solid thickness outward of the interior face and cabinet backs touch that face',
  (shape) => {
    for (const thickness of [4.5, 6]) {
      const room = {...blankStudy().room, wallThickness: thickness};
      room.outline = presetOutline(room, shape);
      const segments = roomSegments(room);
      const walls = roomGeometry(room, [], 0xffffff);
      let wallArea = 0;
      for (const [index, s] of segments.entries()) {
        const wall = walls[index];
        wall.updateMatrixWorld(true);
        const normalDistances: number[] = [];
        wall.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return;
          const positions = part.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3()
              .fromBufferAttribute(positions, i)
              .applyMatrix4(part.matrixWorld);
            normalDistances.push(
              s.nx * (p.x / INCH + room.width / 2 - s.a.x) +
                s.nz * (p.z / INCH + room.depth / 2 - s.a.z),
            );
          }
        });
        expect(Math.max(...normalDistances)).toBeCloseTo(0, 4);
        expect(Math.min(...normalDistances)).toBeCloseTo(-thickness, 4);
        const item = {
          ...base,
          placement: {
            mode: 'wall' as const,
            wall: s.id,
            offset: 6,
            elevation: 0,
          },
        };
        const cabinet = cabinetGeometry(item, false, false, room);
        const transform = elementTransform(item, room);
        cabinet.rotation.y = (-transform.rotation * Math.PI) / 180;
        cabinet.position.set(
          (transform.x - room.width / 2) * INCH,
          (item.height / 2) * INCH,
          (transform.z - room.depth / 2) * INCH,
        );
        cabinet.updateMatrixWorld(true);
        let back = Infinity;
        cabinet.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return;
          const positions = part.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            const p = new THREE.Vector3()
              .fromBufferAttribute(positions, i)
              .applyMatrix4(part.matrixWorld);
            back = Math.min(
              back,
              s.nx * (p.x / INCH + room.width / 2 - s.a.x) +
                s.nz * (p.z / INCH + room.depth / 2 - s.a.z),
            );
          }
        });
        expect(back).toBeCloseTo(0, 4);
        const footprint = wallFootprint(room, s.id);
        wallArea += area(footprint);
        // Even a narrow subdivision next to a concave miter remains a valid solid.
        const subdivisions = [0, 1, s.length - 1, s.length];
        const splitArea = subdivisions
          .slice(1)
          .reduce(
            (sum, end, i) =>
              sum + area(wallFootprint(room, s.id, subdivisions[i], end)),
            0,
          );
        expect(splitArea).toBeCloseTo(area(footprint), 6);
        disposeStudyObject(cabinet);
        disposeStudyObject(wall);
      }
      // Closed orthogonal wall ring: straight-run area plus four net exterior corners.
      expect(wallArea).toBeCloseTo(
        segments.reduce((sum, s) => sum + s.length * thickness, 0) +
          4 * thickness ** 2,
        6,
      );
    }
  },
);

test.each(['back', 'front', 'left', 'right', 'segment-divider'] as const)(
  'openings cut fully through %s walls and jambs span both faces',
  (id) => {
    for (const thickness of [4.5, 6]) {
      const room = {
        ...blankStudy().room,
        wallThickness: thickness,
        partitions: [
          {
            id: 'segment-divider' as const,
            x: 60,
            z: 0,
            length: 100,
            orientation: 'vertical' as const,
          },
        ],
      };
      const s = roomSegments(room).find((s) => s.id === id)!;
      for (const kind of ['opening', 'door', 'window'] as const) {
        const opening = {
          id: 'aperture',
          kind,
          wall: id,
          offset: 12,
          width: 30,
          height: 48,
          sill: 24,
        };
        const wall = roomGeometry(room, [opening], 0xffffff)[
          roomSegments(room).findIndex((s) => s.id === id)
        ];
        const x = s.x + (s.horizontal ? 27 : 0),
          z = s.z + (s.horizontal ? 0 : 27);
        const ray = (y: number) =>
          new THREE.Raycaster(
            new THREE.Vector3(
              (x - room.width / 2 + s.nx * 30) * INCH,
              y * INCH,
              (z - room.depth / 2 + s.nz * 30) * INCH,
            ),
            new THREE.Vector3(-s.nx, 0, -s.nz),
          );
        wall.updateMatrixWorld(true);
        expect(ray(36).intersectObject(wall, true)).toHaveLength(0);
        expect(ray(90).intersectObject(wall, true).length).toBeGreaterThan(0);
        const assembly = openingGeometry(opening, room);
        const box = new THREE.Box3().setFromObject(assembly);
        expect(
          s.horizontal ? box.max.z - box.min.z : box.max.x - box.min.x,
        ).toBeCloseTo(thickness * INCH, 6);
        const center = box.getCenter(new THREE.Vector3());
        const distance =
          s.nx * (center.x / INCH + room.width / 2 - x) +
          s.nz * (center.z / INCH + room.depth / 2 - z);
        expect(distance).toBeCloseTo(
          id === 'segment-divider' ? 0 : -thickness / 2,
          5,
        );
        disposeStudyObject(wall);
        disposeStudyObject(assembly);
      }
      const scene = new THREE.Scene().add(
        openingGeometry(
          {
            id: 'light',
            kind: 'window',
            wall: id,
            offset: 12,
            width: 30,
            height: 48,
          },
          room,
        ),
      );
      addPhotoLighting(scene, DEFAULT_PHOTO_SETTINGS);
      const lights = scene.children.filter(
        (o) => o instanceof THREE.RectAreaLight,
      ) as THREE.RectAreaLight[];
      expect(lights).toHaveLength(id === 'segment-divider' ? 2 : 1);
      for (const light of lights) {
        const distance = Math.abs(
          s.nx * (light.position.x - (s.x - room.width / 2) * INCH) +
            s.nz * (light.position.z - (s.z - room.depth / 2) * INCH),
        );
        expect(distance).toBeCloseTo(
          (id === 'segment-divider' ? thickness / 2 : thickness) * INCH + 0.04,
        );
      }
      disposeStudyObject(scene);
    }
  },
);

test.each(['horizontal', 'vertical'] as const)(
  'cabinets snap to both faces of a %s partition and collisions use wall volume',
  (orientation) => {
    for (const thickness of [4.5, 6]) {
      const study = blankStudy();
      study.room.wallThickness = thickness;
      study.room.partitions = [
        {id: 'segment-divider', x: 48, z: 48, length: 60, orientation},
      ];
      const s = roomSegments(study.room).find(
        (s) => s.id === 'segment-divider',
      )!;
      const solid = wallBounds(study.room, s.id);
      for (const side of [1, -1]) {
        const item: RoomElement = {
          ...base,
          placement: {
            mode: 'floor',
            x:
              s.x +
              (s.horizontal ? 18 : 0) +
              s.nx * side * (thickness / 2 + 12),
            z:
              s.z +
              (s.horizontal ? 0 : 18) +
              s.nz * side * (thickness / 2 + 12),
            rotation: 0,
          },
        };
        snapWall(item, study.room);
        expect(item.placement.mode).toBe('wall');
        const box = bounds(item, study.room);
        expect(
          s.horizontal
            ? side === 1
              ? box.top
              : box.bottom
            : side === 1
              ? box.right
              : box.left,
        ).toBeCloseTo(
          s.horizontal
            ? side === 1
              ? solid.bottom
              : solid.top
            : side === 1
              ? solid.left
              : solid.right,
        );
        expect(validateLayout([item], study.room).get(item.id)).toBeUndefined();
        expect(validAutomaticPlacement(item, study)).toBe(true);
        const placed = wallToFloor(item, study.room);
        const overlapping = {
          ...item,
          placement: {
            ...placed,
            x: placed.x - s.nx * side * 0.5,
            z: placed.z - s.nz * side * 0.5,
          },
        };
        expect(
          validateLayout([overlapping], study.room).get(item.id),
        ).toContain('Crosses an interior wall');
        expect(validAutomaticPlacement(overlapping, study)).toBe(false);
      }
    }
  },
);

test('wall thickness round-trips in saved rooms, defaults for old rooms, and rejects invalid values', () => {
  const study = blankStudy();
  delete study.room.wallThickness;
  expect(wallThickness(study.room)).toBe(4.5);
  expect(validStudy(study)).toBe(true);
  study.room.wallThickness = 4.75;
  const saved = JSON.parse(JSON.stringify(study)) as typeof study;
  expect(validStudy(saved)).toBe(true);
  expect(wallThickness(saved.room)).toBe(4.75);
  for (const wallThickness of [0, -1, 25, NaN, Infinity, '4.5', null])
    expect(validStudy({...study, room: {...study.room, wallThickness}})).toBe(
      false,
    );
});
