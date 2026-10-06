import {expect, it} from 'vitest';
import * as THREE from 'three';
import {
  resolveFaceRows,
  resolvePartFaces,
  combinationProfiles,
} from './combinationFaces';
import {createCustomUnit, type CabinetPart} from './custom-unit/model';
import {customUnitGeometry} from './custom-unit/geometry';
import {cabinetGeometry} from './roomGeometry';
import {blankStudy} from './CabinetConfigurator';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {validStudy} from './savedRoomProtocol';
import type {RoomElement} from './model';

const cabinet: RoomElement = {
  id: 'combo',
  kind: 'base',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'shaker',
  configuration: 'door-drawer',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
it.each(
  Object.keys(combinationProfiles) as (keyof typeof combinationProfiles)[],
)('%s resolves paired top faces and preserves overrides', (face) => {
  const [top, lower] = combinationProfiles[face];
  expect(
    resolveFaceRows(
      [
        {top: 30},
        {top: 30 + 1e-7},
        {top: 15},
        {top: 30, faceStyle: 'shaker-glass'},
      ],
      face,
    ),
  ).toEqual([top, top, lower, 'shaker-glass']);
  expect(resolveFaceRows([{top: 15}], face)).toEqual([top]);
});
it('uses exterior fronts for row selection and expands overrides without mutating saved parts', () => {
  const parts: CabinetPart[] = [
    {
      id: 'lower',
      kind: 'drawer',
      x: 0,
      y: 0,
      z: -0.75,
      width: 24,
      height: 10,
      depth: 0.75,
    },
    {
      id: 'top',
      kind: 'door',
      x: 0,
      y: 12,
      z: -0.75,
      width: 24,
      height: 10,
      depth: 0.75,
    },
    {
      id: 'internal',
      kind: 'drawer',
      x: 0,
      y: 30,
      z: 2,
      width: 24,
      height: 10,
      depth: 0.75,
    },
    {
      id: 'override',
      kind: 'door',
      x: 25,
      y: 12,
      z: -0.75,
      width: 10,
      height: 10,
      depth: 0.75,
      faceStyle: 'shaker',
    },
  ];
  expect(
    resolvePartFaces(parts, 'beaded-flat-beaded-shaker').map(
      (p) => p.faceStyle,
    ),
  ).toEqual(['beaded-shaker', 'beaded-flat', 'beaded-shaker', 'shaker']);
  expect(parts[0].faceStyle).toBeUndefined();
});
it.each(
  Object.keys(combinationProfiles) as (keyof typeof combinationProfiles)[],
)(
  '%s renders the correct standard face rows through every overlay and exports lower profiles',
  (face) => {
    for (const overlay of [
      'full-overlay',
      'partial-overlay',
      'inset',
    ] as const) {
      const design = blankStudy();
      design.room.overlay = overlay;
      design.elements = [{...cabinet, face}];
      const group = cabinetGeometry(
        design.elements[0],
        false,
        false,
        design.room,
      );
      const fronts: THREE.Mesh[] = [];
      group.traverse((o) => {
        if (o.name === 'cabinet-front') fronts.push(o as THREE.Mesh);
      });
      fronts.sort((a, b) => b.position.y - a.position.y);
      expect(fronts.map((f) => f.userData.faceStyle)).toEqual([
        combinationProfiles[face][0],
        combinationProfiles[face][1],
        combinationProfiles[face][1],
      ]);
      const fabrication = resolveFabrication(
        design,
        {slug: 'combo', revision: 1, updatedAt: '2026-10-05'},
        DEFAULT_CONSTRUCTION,
      );
      expect(validStudy(JSON.parse(JSON.stringify(design)))).toBe(true);
      const beads = fabrication.parts.filter((p) => p.name.includes('Beaded'));
      expect(beads.length).toBe(
        face === 'flat-shaker' ? 0 : face === 'flat-beaded-shaker' ? 2 : 3,
      );
    }
  },
);
it('custom previews resolve each physical row before geometry and handle placement', () => {
  const definition = createCustomUnit();
  definition.parts = [0, 12, 24].map((y, i) => ({
    id: `face-${i}`,
    kind: 'drawer' as const,
    x: 0,
    y,
    z: -0.75,
    width: 24,
    height: 10,
    depth: 0.75,
  }));
  const appearance = {
    face: 'beaded-flat-beaded-shaker' as const,
    material: 'maple' as const,
  };
  const group = customUnitGeometry(definition, {}, appearance);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      o.name === 'custom-unit-drawer' &&
      !o.name.includes('handle')
    )
      meshes.push(o);
  });
  expect(meshes).toHaveLength(3);
  // The flat top has full thickness at its center, while both lower panels are recessed.
  const centerZ = (mesh: THREE.Mesh) => {
    const isolated = new THREE.Mesh(
      mesh.geometry,
      new THREE.MeshBasicMaterial({side: THREE.DoubleSide}),
    );
    return new THREE.Raycaster(
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(0, 0, 1),
    ).intersectObject(isolated)[0].point.z;
  };
  expect(centerZ(meshes[2])).toBeCloseTo(-0.375);
  for (const mesh of meshes.slice(0, 2))
    expect(centerZ(mesh)).toBeCloseTo(-0.375 + 5 / 16);
});
