import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {
  createCustomUnit,
  deserializeCustomUnit,
  serializeCustomUnit,
  validateCustomUnit,
  type CabinetPart,
} from './model';
import {customUnitGeometry} from './geometry';
import {cabinetProfilePoint} from './curves';
import {addEndShelf, setCabinetProfile} from './partEditing';

const board = (
  id: string,
  kind: CabinetPart['kind'],
  y: number,
): CabinetPart => ({
  id,
  kind,
  x: 0,
  y,
  z: 0,
  width: 48,
  height: 0.75,
  depth: 24,
});
const parts: CabinetPart[] = [
  board('bottom', 'carcass', 0),
  board('top', 'carcass', 35.25),
  board('shelf', 'shelf', 18),
  {...board('side', 'carcass', 0), x: 47.25, width: 0.75, height: 36},
  {...board('drawer', 'drawer', 24), z: -0.75, height: 8, depth: 0.75},
];
const unit = setCabinetProfile(createCustomUnit({parts}), {
  left: 'square',
  right: 'convex',
  radius: 12,
});
function frontEdge(object: THREE.Object3D) {
  const mesh = (
    object instanceof THREE.Mesh ? object : object.children[0]
  ) as THREE.Mesh;
  mesh.updateWorldMatrix(true, false);
  const vertices = mesh.geometry.getAttribute('position');
  const points = new Map<number, number>();
  for (let i = 0; i < vertices.count; i++) {
    const point = mesh.localToWorld(
      new THREE.Vector3().fromBufferAttribute(vertices, i),
    );
    const x = point.x + 24;
    const z = point.z + 12;
    points.set(x, Math.min(z, points.get(x) ?? Infinity));
  }
  return points;
}
describe('shared cabinet profile', () => {
  it('generates matching top, bottom, and shelf outlines from one profile', () => {
    const meshes = customUnitGeometry(unit).children as THREE.Mesh[];
    expect(frontEdge(meshes[0])).toEqual(frontEdge(meshes[1]));
    expect(frontEdge(meshes[0])).toEqual(frontEdge(meshes[2]));
    expect(frontEdge(meshes[0]).get(48)).toBeCloseTo(12);
    expect(frontEdge(meshes[3]).get(48)).toBeCloseTo(12);
    expect(frontEdge(meshes[4]).get(48)).toBeCloseTo(11.25);
  });
  it('keeps independent front setbacks, thickness, and shelf rear edges', () => {
    const shelf = {...parts[2], z: 0.5, depth: 22.75};
    expect(cabinetProfilePoint(unit, shelf, 48, 0.5)[1]).toBe(12.5);
    expect(cabinetProfilePoint(unit, shelf, 48, 23.25)[1]).toBe(23.25);
    const front = parts[4];
    expect(
      cabinetProfilePoint(unit, front, 48, 0)[1] -
        cabinetProfilePoint(unit, front, 48, -0.75)[1],
    ).toBe(0.75);
  });
  it('replaces old local panel curves while retaining deliberate independent attachments', () => {
    const legacy = {
      ...unit,
      parts: parts.map((part) => ({
        ...part,
        edges: {left: 'convex' as const, right: 'square' as const, radius: 2},
      })),
    };
    const mesh = customUnitGeometry(legacy).children[0] as THREE.Mesh;
    expect(frontEdge(mesh)).toEqual(
      frontEdge(customUnitGeometry(unit).children[0] as THREE.Mesh),
    );
    const attached = addEndShelf(unit, 'right');
    const end = attached.parts!.at(-1)!;
    expect(end.profileMode).toBe('independent');
    expect(cabinetProfilePoint(attached, end, 50, 0)).toEqual([50, 0]);
  });
  it('round trips the shared shape and rejects impossible radii', () => {
    expect(deserializeCustomUnit(serializeCustomUnit(unit))).toEqual(unit);
    expect(
      validateCustomUnit({...unit, profile: {...unit.profile!, radius: 25}}),
    ).not.toEqual([]);
    const inward = {
      ...unit,
      profile: {...unit.profile!, right: 'concave' as const},
    };
    const meshes = customUnitGeometry(inward).children as THREE.Mesh[];
    expect(frontEdge(meshes[0])).toEqual(frontEdge(meshes[2]));
    expect(frontEdge(meshes[0]).get(48)).toBeCloseTo(12);
  });
});
