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
function closedMesh(part: FabricationPart) {
  expect(part.mesh).toBeDefined();
  const mesh = part.mesh!;
  const point = (i: number) =>
    mesh.vertices[i].map((v) => v.toFixed(6)).join(',');
  const edges = new Map<string, number>();
  for (const raw of mesh.faces) {
    const face = [...new Set(raw.map(point))];
    if (face.length < 3) continue;
    for (let i = 0; i < face.length; i++) {
      const key = [face[i], face[(i + 1) % face.length]].sort().join('/');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  expect(
    [...edges.values()].every((count) => count === 2),
    part.name,
  ).toBe(true);
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
  it.each(['full-overlay', 'partial-overlay', 'inset'] as const)(
    'exports standard fronts and a single joined cabinet frame for %s',
    (overlay) => {
      const manifest = resolveFabrication(
        {
          ...blankStudy(),
          room: {...blankStudy().room, overlay},
          elements: [{...base, configuration: 'three-drawer', face: 'shaker'}],
        },
        source,
        DEFAULT_CONSTRUCTION,
      );
      expect(manifest.parts.some((p) => p.name === 'Drawer bottom')).toBe(true);
      expect(
        manifest.parts.filter((p) => p.name === 'Face frame stile'),
      ).toHaveLength(overlay === 'full-overlay' ? 0 : 2);
      for (const frame of manifest.parts.filter((p) =>
        p.name.startsWith('Face frame '),
      ))
        expect(frame.pockets).toEqual([]);
      noIntersections(manifest.parts);
    },
  );
  it.each(['single-door', 'door-drawer', 'three-drawer'] as const)(
    'shares frame members and preserves machined solids for %s',
    (configuration) => {
      const manifest = resolveFabrication(
        {
          ...blankStudy(),
          room: {...blankStudy().room, overlay: 'inset'},
          elements: [{...base, width: 36, configuration}],
        },
        source,
        DEFAULT_CONSTRUCTION,
      );
      const stiles = manifest.parts.filter(
        (p) => p.name === 'Face frame stile',
      );
      const rails = manifest.parts.filter((p) => p.name === 'Face frame rail');
      expect(stiles).toHaveLength(configuration === 'three-drawer' ? 2 : 3);
      expect(rails).toHaveLength(
        configuration === 'three-drawer'
          ? 4
          : configuration === 'door-drawer'
            ? 3
            : 2,
      );
      for (const stile of stiles) expect(stile.size[0]).toBe(1.5);
      for (const rail of rails) expect(rail.size[2]).toBe(1.5);
      noIntersections(manifest.parts);
    },
  );
  it.each([false, true])(
    'exports one physical seam stile for continuous frames=%s',
    (enabled) => {
      const elements = [
        {
          ...base,
          width: 30,
          placement: {mode: 'floor' as const, x: 15, z: 30, rotation: 0},
        },
        {
          ...base,
          id: 'next',
          width: 30,
          placement: {mode: 'floor' as const, x: 45, z: 30, rotation: 0},
        },
      ];
      const manifest = resolveFabrication(
        {
          ...blankStudy(),
          room: {
            ...blankStudy().room,
            overlay: 'inset',
            continuousFaceFrames: enabled,
          },
          elements,
        },
        source,
        DEFAULT_CONSTRUCTION,
      );
      const stiles = manifest.parts.filter(
        (p) => p.name === 'Face frame stile',
      );
      expect(stiles).toHaveLength(enabled ? 3 : 4);
      for (const stile of stiles) expect(stile.size[0]).toBe(1.5);
      const world = manifest.parts.map((p) => {
        const assembly = manifest.assemblies.find(
          (a) => a.id === p.assemblyId,
        )!;
        return {
          ...p,
          origin: p.origin.map((v, i) => v + assembly.origin[i]) as [
            number,
            number,
            number,
          ],
        };
      });
      noIntersections(world);
      if (enabled) {
        expect(
          manifest.assemblies.filter((a) => a.name === 'Continuous face frame'),
        ).toHaveLength(1);
        const seam = stiles.find(
          (p) =>
            p.assemblyId === `continuous-frame:${base.id}` && p.origin[0] > 10,
        )!;
        expect(seam.pockets).toEqual([]);
        const fronts = manifest.parts.filter((p) => p.name === 'Door');
        expect(fronts).toHaveLength(2);
        for (const front of fronts) expect(front.size[0]).toBe(27.5);
      }
    },
  );
  it.each(['inset', 'partial-overlay'] as const)(
    'exports unequal-width, mixed-front runs for %s in any element order',
    (overlay) => {
      const elements = [
        {
          ...base,
          id: 'a',
          width: 24,
          configuration: 'three-drawer' as const,
          placement: {mode: 'floor' as const, x: 12, z: 30, rotation: 0},
        },
        {
          ...base,
          id: 'b',
          width: 36,
          configuration: 'door-drawer' as const,
          placement: {mode: 'floor' as const, x: 42, z: 30, rotation: 0},
        },
        {
          ...base,
          id: 'c',
          width: 18,
          placement: {mode: 'floor' as const, x: 69, z: 30, rotation: 0},
        },
      ];
      const manifest = resolveFabrication(
        {
          ...blankStudy(),
          room: {...blankStudy().room, overlay, continuousFaceFrames: true},
          elements: elements.reverse(),
        },
        source,
        DEFAULT_CONSTRUCTION,
      );
      const run = manifest.assemblies.filter(
        (a) => a.name === 'Continuous face frame',
      );
      expect(run).toHaveLength(1);
      const frameParts = manifest.parts.filter((p) =>
        p.name.startsWith('Face frame '),
      );
      expect(new Set(frameParts.map((p) => p.assemblyId))).toEqual(
        new Set([run[0].id]),
      );
      expect(
        frameParts.filter((p) => p.name === 'Face frame stile'),
      ).toHaveLength(5);
      noIntersections(
        manifest.parts.map((p) => {
          const assembly = manifest.assemblies.find(
            (a) => a.id === p.assemblyId,
          )!;
          return {
            ...p,
            origin: p.origin.map((v, i) => v + assembly.origin[i]) as [
              number,
              number,
              number,
            ],
          };
        }),
      );
    },
  );
  it.each([
    'single-door',
    'three-drawer',
    'door-drawer',
    'sink',
    'farmhouse-sink',
    'microwave-drawer',
    'pullout',
    'corner',
  ] as const)(
    'exports %s without a cabinet-type rejection',
    (configuration) => {
      const manifest = resolve([
        {
          ...base,
          width: configuration === 'corner' ? 42 : 30,
          depth: configuration === 'corner' ? 42 : 24,
          configuration,
        },
      ]);
      expect(manifest.parts.length).toBeGreaterThan(0);
      expect(new Set(manifest.parts.map((p) => p.assemblyId))).toEqual(
        new Set(['base']),
      );
      if (configuration === 'corner')
        expect(manifest.parts.some((p) => p.basis)).toBe(true);
      else noIntersections(manifest.parts);
    },
  );
  it.each(['one-oven', 'two-oven', 'coffee-maker'] as const)(
    'exports %s supports and fronts',
    (tallConfiguration) => {
      const manifest = resolve([
        {...base, kind: 'tall', height: 84, tallConfiguration},
      ]);
      expect(
        manifest.parts.filter((p) => p.name === 'Appliance support shelf'),
      ).toHaveLength(tallConfiguration === 'two-oven' ? 3 : 2);
      noIntersections(manifest.parts);
    },
  );
  it.each(['shoes', 'floating-shelves'] as const)(
    'exports the actual %s construction',
    (type) => {
      const manifest = resolve([createOpenStorage(type, 'storage')]);
      expect(manifest.parts.length).toBeGreaterThan(0);
      if (type === 'shoes') {
        expect(
          manifest.parts.some((p) => p.name === 'Angled shelf' && p.basis),
        ).toBe(true);
        expect(
          manifest.parts
            .filter((p) => p.name.endsWith('side'))
            .every((p) => p.mesh),
        ).toBe(true);
        for (const part of manifest.parts.filter((p) => p.mesh))
          closedMesh(part);
      } else {
        expect(manifest.parts.some((p) => p.name === 'Left side')).toBe(false);
        noIntersections(manifest.parts);
      }
    },
  );
  it('exports curved machined parts using the designer profile, not rectangular substitutes', () => {
    const definition = createCustomUnit({
      width: 30,
      height: 30.5,
      depth: 24,
      curve: {scope: 'front', profile: 'arc', radius: 30, direction: 'inward'},
    });
    const manifest = resolve([
      {
        ...base,
        customCabinet: {libraryId: 'curved', libraryVersion: 1, definition},
      },
    ]);
    expect(manifest.parts.some((p) => p.mesh)).toBe(true);
    for (const part of manifest.parts.filter((p) => p.mesh)) closedMesh(part);
  });
  it.each(['round-left', 'round-right'] as const)(
    'exports %s individual shelves',
    (shape) => {
      const definition = createCustomUnit({width: 30, height: 30.5, depth: 24});
      definition.parts = [
        {
          id: 'shelf',
          kind: 'shelf',
          name: 'Round shelf',
          x: 0,
          y: 15,
          z: 0,
          width: 30,
          height: 0.75,
          depth: 24,
          shape,
          profileMode: 'independent',
        },
      ];
      const manifest = resolve([
        {
          ...base,
          customCabinet: {libraryId: 'round', libraryVersion: 1, definition},
        },
      ]);
      closedMesh(manifest.parts.find((p) => p.name === 'Round shelf')!);
    },
  );
  it('exports tambour slats as separate oriented components', () => {
    const definition = createCustomUnit({width: 30, height: 30.5, depth: 24});
    definition.parts = [
      {
        id: 'tambour',
        kind: 'door',
        x: 0,
        y: 0,
        z: -0.75,
        width: 30,
        height: 30.5,
        depth: 0.75,
        door: {
          mechanism: 'tambour',
          side: 'left',
          travel: 30,
          slatSize: 1,
          direction: 'horizontal',
        },
      },
    ];
    const manifest = resolve([
      {
        ...base,
        customCabinet: {libraryId: 'tambour', libraryVersion: 1, definition},
      },
    ]);
    expect(
      manifest.parts.filter((p) => p.name === 'Tambour slat'),
    ).toHaveLength(30);
    expect(
      manifest.parts
        .filter((p) => p.name === 'Tambour slat')
        .every((p) => p.basis),
    ).toBe(true);
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
    const fixtures = ['inset', 'partial-overlay'].map((overlay) =>
      resolveFabrication(
        {
          ...blankStudy(),
          room: {
            ...blankStudy().room,
            overlay: overlay as 'inset' | 'partial-overlay',
          },
          elements: [{...base, configuration: 'three-drawer', face: 'shaker'}],
        },
        source,
        DEFAULT_CONSTRUCTION,
      ),
    );
    fixtures.push(resolve([createOpenStorage('shoes', 'shoes')]));
    fixtures.push(
      resolve([{...base, configuration: 'corner', width: 42, depth: 42}]),
    );
    const curved = createCustomUnit({
      width: 30,
      height: 30.5,
      depth: 24,
      curve: {scope: 'front', profile: 'arc', radius: 30, direction: 'inward'},
    });
    fixtures.push(
      resolve([
        {
          ...base,
          customCabinet: {
            libraryId: 'curved',
            libraryVersion: 1,
            definition: curved,
          },
        },
      ]),
    );
    curved.root = {id: 'doors', type: 'section', sectionType: 'doors'};
    fixtures.push(
      resolve([
        {
          ...base,
          face: 'shaker',
          customCabinet: {
            libraryId: 'curved-shaker',
            libraryVersion: 1,
            definition: curved,
          },
        },
      ]),
    );
    for (const shape of ['round-left', 'round-right'] as const) {
      const definition = createCustomUnit({
        width: 30,
        height: 30.5,
        depth: 24,
        parts: [
          {
            id: 'round',
            kind: 'shelf',
            x: 0,
            y: 15,
            z: 0,
            width: 30,
            height: 0.75,
            depth: 24,
            shape,
            profileMode: 'independent',
          },
        ],
      });
      fixtures.push(
        resolve([
          {
            ...base,
            customCabinet: {libraryId: 'round', libraryVersion: 1, definition},
          },
        ]),
      );
    }
    const tambour = createCustomUnit({
      width: 30,
      height: 30.5,
      depth: 24,
      parts: [
        {
          id: 'tambour',
          kind: 'door',
          x: 0,
          y: 0,
          z: -0.75,
          width: 30,
          height: 30.5,
          depth: 0.75,
          door: {
            mechanism: 'tambour',
            side: 'left',
            travel: 30,
            slatSize: 1,
            direction: 'horizontal',
          },
        },
      ],
    });
    fixtures.push(
      resolve([
        {
          ...base,
          customCabinet: {
            libraryId: 'tambour',
            libraryVersion: 1,
            definition: tambour,
          },
        },
      ]),
    );
    writeFileSync(
      join(tmpdir(), 'from-trees-universal-fixtures.json'),
      JSON.stringify(fixtures),
    );
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
