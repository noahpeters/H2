// @vitest-environment node
import {describe, it, expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOpenStorage} from '../openStorage';
import {blankStudy} from '../CabinetConfigurator';
import {createCustomUnit} from '../custom-unit/model';
import {cabinetOpenings, partInOpening} from '../custom-unit/openingPlacement';
import {customUnitLayoutParts} from '../custom-unit/layoutParts';
import {resolveFabrication} from './resolve';
import {DEFAULT_CONSTRUCTION, constructionProfile} from './profile';
import {exportBundle} from './bundle';
import {stockDimensions} from './stock';
import type {FabricationPart} from './model';
import type {RoomElement} from '../model';
const base: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  face: 'slab',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
const source = {
  slug: 'a'.repeat(32),
  revision: 3,
  updatedAt: '2026-10-01T00:00:00Z',
};
const resolve = (elements = [base]) =>
  resolveFabrication({...blankStudy(), elements}, source, {
    ...DEFAULT_CONSTRUCTION,
  });
/** Exact rectangular cell check: shared stock volume must be removed by at
 * least one member's machining. Catch interpenetrating fabrication joints. */
function sharedVolume(a: FabricationPart, b: FabricationPart) {
  const lo = a.origin.map((v, i) => Math.max(v, b.origin[i]));
  const hi = a.origin.map((v, i) =>
    Math.min(v + a.size[i], b.origin[i] + b.size[i]),
  );
  if (lo.some((v, i) => v >= hi[i] - 1e-8)) return 0;
  const grid = lo.map((v, i) =>
    [
      v,
      hi[i],
      ...[a, b].flatMap((p) =>
        p.pockets.flatMap((c) => [
          p.origin[i] + c.origin[i],
          p.origin[i] + c.origin[i] + c.size[i],
        ]),
      ),
    ]
      .filter((v) => v >= lo[i] && v <= hi[i])
      .sort((a, b) => a - b),
  );
  const removed = (p: FabricationPart, center: number[]) =>
    p.pockets.some((c) =>
      center.every(
        (v, i) =>
          v > p.origin[i] + c.origin[i] - 1e-8 &&
          v < p.origin[i] + c.origin[i] + c.size[i] + 1e-8,
      ),
    );
  let volume = 0;
  for (let i = 0; i < grid[0].length - 1; i++)
    for (let j = 0; j < grid[1].length - 1; j++)
      for (let k = 0; k < grid[2].length - 1; k++) {
        const n = [i, j, k],
          center = n.map((v, a) => (grid[a][v] + grid[a][v + 1]) / 2);
        if (!removed(a, center) && !removed(b, center))
          volume += n.reduce(
            (prod, v, ax) => prod * (grid[ax][v + 1] - grid[ax][v]),
            1,
          );
      }
  return volume;
}
function noIntersections(parts: FabricationPart[]) {
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      expect(
        sharedVolume(parts[i], parts[j]),
        `${parts[i].name} / ${parts[j].name}`,
      ).toBeCloseTo(0, 6);
}
describe('From Trees construction export', () => {
  it('uses the skill construction with dado/rabbet stock and no full top', () => {
    const manifest = resolve();
    expect(
      manifest.parts.filter((p) => p.name.includes('stretcher')),
    ).toHaveLength(2);
    expect(
      manifest.parts.filter((p) => p.name.includes('nailer')),
    ).toHaveLength(2);
    const bottom = manifest.parts.find((p) => p.name === 'Bottom')!;
    expect(bottom.size[0]).toBe(29.25);
    expect(stockDimensions(bottom)).toEqual([29.25, 23, 0.75]);
    expect(manifest.parts.find((p) => p.name === 'Left side')!.size).toEqual([
      0.75, 24, 30.5,
    ]);
    expect(manifest.parts.find((p) => p.name === 'Back')!.size).toEqual([
      29, 0.25, 29.75,
    ]);
    expect(manifest.parts.some((p) => p.name === 'Top')).toBe(false);
    noIntersections(manifest.parts);
  });
  it.each(['three-drawer', 'door-drawer', 'pullout'] as const)(
    'creates separate 5/8-inch drawer stock, grooved 3/8-inch bottoms and fronts for %s',
    (configuration) => {
      const manifest = resolve([{...base, configuration}]);
      const drawers = configuration === 'three-drawer' ? 3 : 1;
      expect(
        manifest.parts.filter((p) => p.name === 'Drawer side'),
      ).toHaveLength(drawers * 2);
      expect(
        manifest.parts.filter((p) => p.name === 'Drawer bottom'),
      ).toHaveLength(drawers);
      for (const part of manifest.parts.filter((p) => p.name === 'Drawer side'))
        expect(stockDimensions(part)[2]).toBe(0.625);
      for (const part of manifest.parts.filter(
        (p) => p.name === 'Drawer bottom',
      ))
        expect(stockDimensions(part)[2]).toBe(0.375);
      noIntersections(manifest.parts);
    },
  );
  it('splits Shaker fronts into rails, stiles and panels with working stub-tenon/groove joints', () => {
    const manifest = resolve([{...base, face: 'shaker'}]);
    expect(manifest.parts.filter((p) => p.name === 'Door stile')).toHaveLength(
      2,
    );
    expect(manifest.parts.filter((p) => p.name === 'Door rail')).toHaveLength(
      2,
    );
    expect(manifest.parts.filter((p) => p.name === 'Door panel')).toHaveLength(
      1,
    );
    noIntersections(manifest.parts);
  });
  it('preserves arbitrary rectangular custom parts and resolves arrays rather than a catalog model', () => {
    const definition = createCustomUnit({
      id: 'custom',
      width: 30,
      height: 30.5,
      depth: 24,
    });
    definition.parts = customUnitLayoutParts(definition).map((p, i) => ({
      ...p,
      id: `part-${i}`,
    }));
    definition.parts.push({
      id: 'shelf',
      kind: 'shelf',
      x: 0.75,
      y: 15,
      z: 0,
      width: 28.5,
      height: 0.75,
      depth: 23,
    });
    const custom = {
      ...base,
      customCabinet: {libraryId: 'custom', libraryVersion: 1, definition},
    };
    const manifest = resolve([custom]);
    expect(manifest.parts.find((p) => p.name === 'shelf')!.size[0]).toBe(29.25);
    noIntersections(manifest.parts);
    expect(resolve([custom])).toEqual(manifest);
  });
  it.each([
    'shelving',
    'single-hang',
    'double-hang',
    'drawers',
    'combination',
    'overhead',
  ] as const)('joins %s storage parts without shared wood volume', (type) => {
    noIntersections(resolve([createOpenStorage(type, type)]).parts);
  });
  it('expands custom drawer arrays into fronts and five solid box parts per drawer', () => {
    const definition = createCustomUnit({width: 30, height: 30.5, depth: 24});
    const array = {
      ...partInOpening(
        definition,
        'drawer-array',
        cabinetOpenings(definition)[0],
      ),
      id: 'array',
    };
    definition.parts = [
      ...customUnitLayoutParts(definition).map((p, i) => ({
        ...p,
        id: p.id ?? `board-${i}`,
      })),
      array,
    ];
    const manifest = resolve([
      {
        ...base,
        customCabinet: {libraryId: 'array', libraryVersion: 1, definition},
      },
    ]);
    expect(
      manifest.parts.filter((p) => p.name === 'Drawer bottom'),
    ).toHaveLength(array.drawerArray!.heights.length);
    noIntersections(manifest.parts);
  });
  it('preserves room positions, rotation and elevated cabinet transforms', () => {
    const item = {
      ...base,
      kind: 'wall-cabinet' as const,
      placement: {
        mode: 'wall' as const,
        wall: 'left' as const,
        offset: 24,
        elevation: 54,
      },
    };
    expect(resolve([item]).assemblies[0]).toMatchObject({
      origin: [12, -39, 54],
      rotation: -270,
    });
  });
  it('refuses unsupported curved designs rather than generating approximate cut dimensions', () => {
    const definition = createCustomUnit({
      width: 30,
      height: 30.5,
      depth: 24,
      curve: {scope: 'front', profile: 'arc', radius: 30, direction: 'inward'},
    });
    expect(() =>
      resolve([
        {
          ...base,
          customCabinet: {libraryId: 'curved', libraryVersion: 1, definition},
        },
      ]),
    ).toThrow('curved/profiled/tambour');
  });
  it('validates editable joint depths and finite dimensions', () => {
    expect(() =>
      constructionProfile(new URLSearchParams('dadoDepth=0.75')),
    ).toThrow('Joint depth');
    expect(() =>
      constructionProfile(new URLSearchParams('drawerThickness=NaN')),
    ).toThrow('Invalid construction');
    expect(constructionProfile(new URLSearchParams()).drawerThickness).toBe(
      0.625,
    );
  });
  it('exports only construction data and uses the same parts for CSV', () => {
    const manifest = resolve([
      {...base, materialDefinition: undefined, material: 'rift-white-oak'},
    ]);
    manifest.parts[0].name = "'; system('evil'); #";
    const bundle = exportBundle(manifest);
    expect(bundle).not.toHaveProperty('ruby');
    expect(bundle.csv.split('\r\n')).toHaveLength(manifest.parts.length + 2);
    expect(bundle.csv).toContain('29.25');
  });
  it('produces native SketchUp verification fixtures from the real resolver', () => {
    const manifest = resolve([
      {
        ...base,
        id: 'drawer-base',
        configuration: 'three-drawer',
        face: 'shaker',
      },
      {
        ...base,
        id: 'tall',
        kind: 'tall',
        height: 84,
        width: 36,
        placement: {mode: 'floor', x: 63, z: 30, rotation: 0},
      },
    ]);
    writeFileSync(
      join(tmpdir(), 'from-trees-sketchup-fixture.json'),
      JSON.stringify(manifest),
    );
    expect(manifest.parts.length).toBeGreaterThan(20);
  });
});
