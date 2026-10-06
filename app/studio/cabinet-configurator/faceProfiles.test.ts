import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {facePreviewGeometry} from './custom-unit/facePreview';
import {archedFrontGeometry} from './custom-unit/archedFrontGeometry';
import {
  createCustomUnit,
  serializeCustomUnit,
  deserializeCustomUnit,
} from './custom-unit/model';
import type {CabinetPart} from './custom-unit/model';
import {customUnitLayoutParts} from './custom-unit/layoutParts';
import {roomFrontParts} from './custom-unit/frontLayout';
import {cabinetGeometry} from './roomGeometry';
import {shakerFrameWidth} from './hardwarePlacement';
import {blankStudy} from './CabinetConfigurator';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {exportBundle} from './fabrication/bundle';
import {easedGeometry} from './photoRender';
import {
  shakerBeadGeometry,
  SHAKER_PANEL_SETBACK,
  SHAKER_BEAD_WIDTH,
} from './faceProfiles';
import type {RoomElement} from './model';

const front: RoomElement = {
  id: 'test',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
const source = {slug: 'test', revision: 1, updatedAt: '2026-10-05'};
function frontHit(geometry: THREE.BufferGeometry, x = 0, y = 0) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({side: THREE.DoubleSide}),
  );
  return new THREE.Raycaster(
    new THREE.Vector3(x, y, -10),
    new THREE.Vector3(0, 0, 1),
  ).intersectObject(mesh)[0].point.z;
}

describe('physical Shaker profile dimensions', () => {
  it.each(['shaker', 'beaded-shaker', 'shaker-glass'] as const)(
    '%s has exactly 5/16-inch setback across stock thicknesses and segmentation',
    (style) => {
      for (const depth of [0.5, 0.75, 1])
        for (const segmented of [false, true]) {
          const geometry = facePreviewGeometry(18, 30, depth, style, segmented);
          expect(frontHit(geometry) + depth / 2).toBeCloseTo(5 / 16, 6);
          expect(frontHit(geometry, 8, 0)).toBeCloseTo(-depth / 2, 6);
          expect(
            Array.from(geometry.getAttribute('position').array).every(
              Number.isFinite,
            ),
          ).toBe(true);
          geometry.dispose();
        }
    },
  );
  it('makes a quarter-inch rounded bead with its crown on the face plane', () => {
    const geometry = shakerBeadGeometry(
      [
        {x: -7, y: -13},
        {x: 7, y: -13},
        {x: 7, y: 13},
        {x: -7, y: 13},
      ],
      0.75,
    );
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.x - 7).toBe(SHAKER_BEAD_WIDTH);
    expect(geometry.boundingBox!.min.z).toBe(-0.375);
    expect(frontHit(geometry, 7.125, 0)).toBeCloseTo(-0.375, 6);
    expect(frontHit(geometry, 7.0625, 0)).toBeGreaterThan(-0.375);
    geometry.dispose();
  });
  it('preserves exact bead vertices when preparing a photo', () => {
    const geometry = facePreviewGeometry(18, 30, 0.75, 'beaded-shaker', false);
    const photo = easedGeometry(geometry, 0.03);
    expect(Array.from(photo.getAttribute('position').array)).toEqual(
      Array.from(geometry.getAttribute('position').array),
    );
    expect(frontHit(photo) + 0.375).toBeCloseTo(SHAKER_PANEL_SETBACK, 6);
    photo.dispose();
    geometry.dispose();
  });
  it.each(['shaker', 'beaded-shaker'] as const)(
    'standard %s doors and drawers retain setback in all overlays',
    (face) => {
      for (const overlay of [
        'inset',
        'partial-overlay',
        'full-overlay',
      ] as const) {
        const study = blankStudy();
        study.room.overlay = overlay;
        const group = cabinetGeometry(
          {...front, face, configuration: 'door-drawer'},
          false,
          false,
          study.room,
        );
        const fronts: THREE.Mesh[] = [];
        group.traverse((object) => {
          if (object.name === 'cabinet-front')
            fronts.push(object as THREE.Mesh);
        });
        expect(fronts.length).toBeGreaterThan(1);
        for (const panel of fronts) {
          const bounds = new THREE.Box3();
          panel.traverse((object) => {
            if (
              object instanceof THREE.Mesh &&
              !object.name.includes('handle')
            ) {
              object.geometry.computeBoundingBox();
              bounds.union(
                object.geometry
                  .boundingBox!.clone()
                  .applyMatrix4(object.matrixWorld),
              );
            }
          });
          panel.geometry.computeBoundingBox();
          const panelFace = panel.localToWorld(
            new THREE.Vector3(0, 0, panel.geometry.boundingBox!.max.z),
          );
          expect((bounds.max.z - panelFace.z) / 0.0254).toBeCloseTo(5 / 16, 5);
          expect(Boolean(panel.getObjectByName('shaker-bead'))).toBe(
            face === 'beaded-shaker',
          );
          if (face === 'beaded-shaker') {
            const bead = panel.getObjectByName('shaker-bead') as THREE.Mesh;
            const dimensions = (panel.geometry as THREE.BoxGeometry).parameters;
            const width = dimensions.width / 0.0254,
              height = dimensions.height / 0.0254;
            const origin = bead.localToWorld(
              new THREE.Vector3(
                (width / 2 - shakerFrameWidth(width, height) + 0.125) * 0.0254,
                0,
                0.0254,
              ),
            );
            expect(
              new THREE.Raycaster(
                origin,
                new THREE.Vector3(0, 0, -1),
              ).intersectObject(bead).length,
            ).toBeGreaterThan(0);
          }
        }
      }
    },
  );
  it.each(['shaker', 'beaded-shaker'] as const)(
    'arched %s fronts use the same panel plane',
    (face) => {
      const unit = createCustomUnit({
        width: 36,
        height: 60,
        root: {id: 'door', type: 'section', sectionType: 'doors'},
      });
      unit.frontArch = 'simple';
      const part = roomFrontParts(
        {...unit, parts: customUnitLayoutParts(unit) as CabinetPart[]},
        'inset',
      ).find((p) => p.kind === 'door')!;
      const geometry = archedFrontGeometry(part, face);
      expect(frontHit(geometry) + part.depth / 2).toBeCloseTo(5 / 16, 6);
      geometry.dispose();
    },
  );
  it('round trips per-part beaded door and drawer styles', () => {
    const unit = createCustomUnit();
    unit.parts = ['door', 'drawer'].map((kind, i) => ({
      id: kind,
      kind: kind as 'door' | 'drawer',
      faceStyle: 'beaded-shaker',
      x: 0,
      y: i * 20,
      z: -0.75,
      width: 18,
      height: i ? 8 : 20,
      depth: 0.75,
    }));
    expect(deserializeCustomUnit(serializeCustomUnit(unit)).parts).toEqual(
      unit.parts,
    );
  });
  it.each(['shaker', 'beaded-shaker'] as const)(
    'exports %s door and drawer panel surfaces at the specified setback',
    (face) => {
      const study = blankStudy();
      study.elements = [{...front, face, configuration: 'door-drawer'}];
      const manifest = resolveFabrication(study, source, DEFAULT_CONSTRUCTION);
      const panels = manifest.parts.filter((p) =>
        face === 'shaker'
          ? /(?:Door|Drawer front) panel/.test(p.name)
          : p.name.includes('Beaded Shaker'),
      );
      expect(panels.length).toBeGreaterThan(1);
      for (const panel of panels) {
        if (face === 'shaker') {
          const frame = manifest.parts.find(
            (p) =>
              p.name === panel.name.replace('panel', 'stile') &&
              Math.abs(p.origin[2] - panel.origin[2]) < 3,
          )!;
          expect(panel.origin[1] - frame.origin[1]).toBeCloseTo(5 / 16, 6);
        } else {
          expect(panel.mesh).toBeDefined();
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              panel.mesh!.vertices.flatMap((v) => [
                v[0] - panel.size[0] / 2,
                v[2] - panel.size[2] / 2,
                v[1],
              ]),
              3,
            ),
          );
          geometry.setIndex(panel.mesh!.faces.flat());
          expect(frontHit(geometry)).toBeCloseTo(5 / 16, 6);
          geometry.dispose();
        }
      }
      expect(JSON.stringify(exportBundle(manifest).manifest)).toContain(
        face === 'shaker' ? 'Door panel' : 'Beaded Shaker',
      );
    },
  );
});

it.each([
  [false, 'beaded-shaker'],
  [true, 'beaded-shaker'],
  [false, 'beaded-flat'],
  [true, 'beaded-flat'],
] as const)(
  'beaded custom fronts export the same vertices as preview (arch=%s, face=%s)',
  (arched, face) => {
    const unit = createCustomUnit({
      width: 36,
      height: 60,
      root: {id: 'doors', type: 'section', sectionType: 'doors'},
    });
    if (arched) unit.frontArch = 'simple';
    else unit.profile = {left: 'square', right: 'convex', radius: 8};
    const study = blankStudy();
    study.room.overlay = 'inset';
    study.elements = [
      {
        ...front,
        kind: 'wall-cabinet',
        width: 36,
        height: 60,
        depth: unit.depth,
        face,
        customCabinet: {
          libraryId: 'local',
          libraryVersion: 1,
          definition: unit,
        },
      },
    ];
    const before = JSON.stringify(study);
    const preview = cabinetGeometry(
      study.elements[0],
      false,
      false,
      study.room,
    );
    const manifest = resolveFabrication(study, source, DEFAULT_CONSTRUCTION);
    const board = manifest.parts.find((p) =>
      p.name.includes(face === 'beaded-flat' ? 'Beaded Flat' : 'Beaded Shaker'),
    )!;
    expect(board.mesh).toBeDefined();
    const door = preview.getObjectByName('custom-unit-door') as THREE.Mesh;
    const positions = door.geometry.getAttribute('position');
    // Export uses X, rearward Y, upward Z; vertices are relative to stock origin.
    expect(board.mesh!.vertices.length).toBe(positions.count);
    preview.updateMatrixWorld(true);
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(door.matrixWorld)
        .applyMatrix4(
          preview
            .getObjectByName('custom-cabinet-body')!
            .matrixWorld.clone()
            .invert(),
        );
      const exported = board.mesh!.vertices[i].map(
        (n, axis) => n + board.origin[axis],
      );
      expect(exported[0]).toBeCloseTo(point.x, 5);
      expect(exported[1]).toBeCloseTo(point.z, 5);
      expect(exported[2]).toBeCloseTo(point.y, 5);
    }
    expect(JSON.stringify(study)).toBe(before);
  },
);

it.each([false, true])(
  'Beaded Flat is flush with a quarter-inch perimeter bead (segmented=%s)',
  (segmented) => {
    const geometry = facePreviewGeometry(
      18,
      30,
      0.75,
      'beaded-flat',
      segmented,
      'x',
    );
    expect(frontHit(geometry)).toBeCloseTo(-0.375, 6);
    expect(frontHit(geometry, 8.875)).toBeCloseTo(-0.375, 6);
    expect(frontHit(geometry, 8.8125)).toBeGreaterThan(-0.375);
    expect(frontHit(geometry, 8.99)).toBeGreaterThan(-0.375);
    expect(frontHit(geometry, 0, 14.875)).toBeCloseTo(-0.375, 6);
    expect(frontHit(geometry, 0, 14.99)).toBeGreaterThan(-0.375);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.toArray()).toEqual([-9, -15, -0.375]);
    expect(geometry.boundingBox!.max.toArray()).toEqual([9, 15, 0.375]);
    expect(new Set(geometry.getAttribute('materialGrainAxis').array)).toEqual(
      new Set([0]),
    );
    expect(new Set(geometry.getAttribute('materialFixedGrain').array)).toEqual(
      new Set([0]),
    );
    const photo = easedGeometry(geometry, 0.03);
    expect(Array.from(photo.getAttribute('position').array)).toEqual(
      Array.from(geometry.getAttribute('position').array),
    );
    photo.dispose();
    geometry.dispose();
  },
);

it('Beaded Flat renders moving standard doors/drawers and exports flush profiled stock', () => {
  const study = blankStudy();
  study.elements = [
    {...front, face: 'beaded-flat', configuration: 'door-drawer'},
  ];
  const group = cabinetGeometry(study.elements[0], false, false, study.room);
  const fronts: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (object.name === 'cabinet-front') fronts.push(object as THREE.Mesh);
  });
  expect(fronts).toHaveLength(2);
  expect(
    fronts.every((panel) =>
      Boolean(
        panel.getObjectByName('cabinet-door-handle') ||
        panel.getObjectByName('cabinet-drawer-handle'),
      ),
    ),
  ).toBe(true);
  const manifest = resolveFabrication(study, source, DEFAULT_CONSTRUCTION);
  const faces = manifest.parts.filter((p) => p.name.includes('Beaded Flat'));
  expect(faces).toHaveLength(2);
  for (const part of faces) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        part.mesh!.vertices.flatMap((v) => [
          v[0] - part.size[0] / 2,
          v[2] - part.size[2] / 2,
          v[1],
        ]),
        3,
      ),
    );
    geometry.setIndex(part.mesh!.faces.flat());
    expect(frontHit(geometry)).toBeCloseTo(0, 6);
    geometry.dispose();
  }
});

it('arched Beaded Flat places its flush bead on every clipped door edge', () => {
  const unit = createCustomUnit({
    width: 36,
    height: 60,
    root: {id: 'doors', type: 'section', sectionType: 'doors'},
  });
  unit.frontArch = 'simple';
  const parts = roomFrontParts(
    {...unit, parts: customUnitLayoutParts(unit) as CabinetPart[]},
    'inset',
  ).filter((part) => part.kind === 'door');
  for (const part of parts) {
    const geometry = archedFrontGeometry(part, 'beaded-flat');
    expect(frontHit(geometry)).toBeCloseTo(-part.depth / 2, 6);
    expect(frontHit(geometry, -part.width / 2 + 0.125)).toBeCloseTo(
      -part.depth / 2,
      6,
    );
    expect(frontHit(geometry, -part.width / 2 + 0.01)).toBeGreaterThan(
      -part.depth / 2,
    );
    const positions = geometry.getAttribute('position');
    for (const point of part.outline!) {
      // The outermost bead section follows the actual cut outline, including
      // the arch and paired doors' meeting edges, without a surrounding land.
      const edgeVertices = Array.from(
        {length: positions.count},
        (_, i) => i,
      ).filter(
        (i) =>
          Math.hypot(
            positions.getX(i) + part.width / 2 - point.x,
            positions.getY(i) + part.height / 2 - point.y,
          ) < 1e-5,
      );
      expect(edgeVertices.length).toBeGreaterThan(0);
      expect(
        edgeVertices.some(
          (i) => Math.abs(positions.getZ(i) + part.depth / 2 - 0.125) < 1e-5,
        ),
      ).toBe(true);
    }
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.z).toBeCloseTo(-part.depth / 2, 6);
    geometry.dispose();
  }
});
