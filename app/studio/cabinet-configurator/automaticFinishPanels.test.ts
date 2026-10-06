import {islandCountertopOutline} from './islandFootprint';
import {storageDefaults} from './openStorage';
import {expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {
  automaticFinishPanels,
  withAutomaticFinishPanels,
} from './automaticFinishPanels';
import {blankStudy} from './CabinetConfigurator';
import {wallToFloor, type RoomElement} from './model';
import {elevationSheets} from './ElevationWorksheet';
import {StudyScene} from './studyScene';
import {resolveFabrication} from './fabrication/resolve';
import {DEFAULT_CONSTRUCTION} from './fabrication/profile';
import {validStudy} from './savedRoomProtocol';
const owner: RoomElement = {
  id: 'owner',
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'shaker',
  material: 'walnut',
  placement: {mode: 'floor', x: 60, z: 60, rotation: 0},
};
function sample() {
  const s = blankStudy();
  s.room.useMapleInternals = true;
  s.elements = [structuredClone(owner)];
  return s;
}
const surfaces = (s: ReturnType<typeof sample>) =>
  automaticFinishPanels(s.elements, s.room).filter(
    (p) => p.autoPanel.ownerId === 'owner',
  );
it('derives exact attached side/back stock and leaves the saved design untouched', () => {
  const s = sample(),
    before = JSON.stringify(s),
    panels = surfaces(s);
  expect(panels.map((p) => p.autoPanel.surface)).toEqual([
    'left',
    'right',
    'back',
  ]);
  expect(panels.map((p) => [p.width, p.depth, p.height])).toEqual([
    [0.75, 24, 34.5],
    [0.75, 24, 34.5],
    [0.75, 30, 34.5],
  ]);
  expect(
    panels.map((p) => {
      const {x, z, rotation} = wallToFloor(p, s.room);
      return {x, z, rotation};
    }),
  ).toEqual([
    {x: 44.625, z: 60, rotation: 0},
    {x: 75.375, z: 60, rotation: 0},
    {x: 60, z: 47.625, rotation: 90},
  ]);
  expect(panels.every((p) => p.material === 'walnut')).toBe(true);
  expect(JSON.stringify(s)).toBe(before);
  const expanded = withAutomaticFinishPanels(s);
  expect(withAutomaticFinishPanels(expanded).elements).toEqual(
    expanded.elements,
  );
  expect(validStudy(s)).toBe(true);
  expect(validStudy({...s, elements: expanded.elements})).toBe(false);
});
it.each(['base', 'wall-cabinet', 'tall', 'appliance', 'panel'] as const)(
  'suppresses only the side in direct contact with %s',
  (kind) => {
    const s = sample();
    s.elements.push({
      ...owner,
      id: 'neighbor',
      kind,
      width: kind === 'panel' ? 0.75 : 30,
      placement: {
        mode: 'floor',
        x: 75 + (kind === 'panel' ? 0.375 : 15),
        z: 60,
        rotation: 0,
      },
    });
    expect(surfaces(s).map((p) => p.autoPanel.surface)).toEqual([
      'left',
      'back',
    ]);
  },
);
it('keeps uncovered patches beside shorter and shallower cabinets', () => {
  const s = sample();
  s.elements.push({
    ...owner,
    id: 'short',
    height: 20,
    depth: 12,
    placement: {mode: 'floor', x: 90, z: 54, rotation: 0},
  });
  const right = surfaces(s).filter((p) => p.autoPanel.surface === 'right');
  expect(right.map((p) => [p.depth, p.height, p.autoPanel.bottom])).toEqual([
    [12, 34.5, 0],
    [12, 14.5, 20],
  ]);
});
it.each([0, 90, 180, 270, 37])(
  'uses actual rotated footprints for contact at %s degrees',
  (rotation) => {
    const s = sample();
    const a = (rotation * Math.PI) / 180;
    s.elements[0].placement = {mode: 'floor', x: 60, z: 60, rotation};
    s.elements.push({
      ...owner,
      id: 'neighbor',
      placement: {
        mode: 'floor',
        x: 60 + 30 * Math.cos(a),
        z: 60 + 30 * Math.sin(a),
        rotation,
      },
    });
    expect(surfaces(s).map((p) => p.autoPanel.surface)).toEqual([
      'left',
      'back',
    ]);
  },
);
it('recognizes perimeter walls, partition faces and wall-mounted cabinet elevations', () => {
  const s = sample();
  s.elements[0].placement = {
    mode: 'wall',
    wall: 'back',
    offset: 0,
    elevation: 54,
  };
  s.elements[0].kind = 'wall-cabinet';
  s.elements[0].height = 30;
  expect(surfaces(s).map((p) => p.autoPanel.surface)).toEqual(['right']);
  expect(surfaces(s)[0].placement.elevation).toBe(54);
  s.elements[0].placement = {mode: 'floor', x: 42.75, z: 60, rotation: 0};
  s.room.partitions = [
    {
      id: 'segment-partition',
      x: 60,
      z: 0,
      length: 120,
      orientation: 'vertical',
    },
  ];
  expect(surfaces(s).map((p) => p.autoPanel.surface)).toEqual(['left', 'back']);
  s.room.partitions = [];
  const sheets = elevationSheets({
    ...s,
    elements: [
      {
        ...s.elements[0],
        placement: {mode: 'wall', wall: 'back', offset: 30, elevation: 54},
      },
    ],
  });
  expect(
    sheets
      .find((sheet) => sheet.id === 'back')!
      .items.filter((i) => i.kind === 'panel'),
  ).toHaveLength(2);
  expect(sheets.every((sheet) => !sheet.title.startsWith('Freestanding'))).toBe(
    true,
  );
});
it('respects gaps, vertical separation, per-cabinet opt-out and the room toggle', () => {
  const s = sample();
  s.elements.push({
    ...owner,
    id: 'gap',
    placement: {mode: 'floor', x: 91, z: 60, rotation: 0},
  });
  expect(surfaces(s)).toHaveLength(3);
  s.elements[1].placement = {
    mode: 'floor',
    x: 90,
    z: 60,
    rotation: 0,
    elevation: 40,
  };
  expect(surfaces(s)).toHaveLength(3);
  s.elements[0].disableAutoPanels = true;
  expect(surfaces(s)).toHaveLength(0);
  expect(validStudy(s)).toBe(true);
  s.room.useMapleInternals = false;
  expect(automaticFinishPanels(s.elements, s.room)).toEqual([]);
});
it('omits floating shelves and uses the real corner return depth', () => {
  const s = sample();
  s.elements[0] = {...owner, width: 36, depth: 36, configuration: 'corner'};
  expect(surfaces(s).find((p) => p.autoPanel.surface === 'right')!.depth).toBe(
    24,
  );
  s.elements[0].storage = storageDefaults('floating-shelves');
  expect(surfaces(s)).toEqual([]);
});
it('exports the same panel stock inside its controlling cabinet assembly', () => {
  const s = sample();
  const m = resolveFabrication(
    s,
    {slug: 'test', revision: 1, updatedAt: '2026-10-05'},
    DEFAULT_CONSTRUCTION,
  );
  const panels = surfaces(s);
  const exported = m.parts.filter((p) => p.name.startsWith('Automatic'));
  expect(exported).toHaveLength(3);
  expect(m.assemblies).toHaveLength(1);
  for (const panel of panels) {
    const p = exported.find((p) => p.id === panel.id)!;
    const a = panel.autoPanel;
    expect(p.assemblyId).toBe(owner.id);
    expect(p.material).toBe('walnut');
    expect(p.size).toEqual([a.width, a.depth, panel.height]);
    expect(p.origin).toEqual([
      a.x - a.width / 2,
      -a.z - a.depth / 2,
      a.bottom - 4,
    ]);
  }
  s.elements[0].disableAutoPanels = true;
  expect(
    resolveFabrication(
      s,
      {slug: 'test', revision: 1, updatedAt: '2026-10-05'},
      DEFAULT_CONSTRUCTION,
    ).parts.filter((p) => p.name.startsWith('Automatic')),
  ).toEqual([]);
});
it('shows selectable panel geometry in 3D and updates it with the controlling cabinet', async () => {
  const load = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockImplementation((_url, onLoad) => {
      const t = new THREE.Texture();
      queueMicrotask(() => onLoad?.(t));
      return t;
    });
  const scene = new StudyScene(new THREE.Scene());
  const s = sample();
  try {
    await scene.update(s);
    const panels = scene.selectable.filter((o) =>
      String(o.userData.id).startsWith('auto-panel:'),
    );
    expect(panels).toHaveLength(3);
    expect(panels.every((o) => o.name === 'room-panel')).toBe(true);
    const x = panels[0].position.x;
    s.elements[0].placement = {mode: 'floor', x: 65, z: 60, rotation: 0};
    await scene.update(s);
    expect(
      scene.selectable.find((o) => o.userData.id === panels[0].userData.id)!
        .position.x - x,
    ).toBeCloseTo(5 * 0.0254);
    s.elements[0].disableAutoPanels = true;
    await scene.update(s);
    expect(
      scene.selectable.filter((o) =>
        String(o.userData.id).startsWith('auto-panel:'),
      ),
    ).toEqual([]);
  } finally {
    scene.dispose();
    load.mockRestore();
  }
});

it('reserves panel coverage on a fixed island countertop without following member translation', () => {
  const s = sample();
  s.elements[0].islandId = 'zone';
  const island = {
    id: 'zone',
    x: 60,
    z: 60,
    width: 30,
    depth: 24,
    rotation: 0,
    overhang: 0,
    seatingSide: 'none' as const,
  };
  s.islands = [island];
  const front = elevationSheets(s).find(
    (sheet) => sheet.title === 'Island — front elevation',
  )!;
  expect(front.countertops[0].width).toBeCloseTo(31.75);
  const outline = islandCountertopOutline(island, s.elements, s.room);
  s.elements[0].placement = {mode: 'floor', x: 64, z: 60, rotation: 0};
  expect(islandCountertopOutline(island, s.elements, s.room)).toEqual(outline);
  s.elements[0].disableAutoPanels = true;
  const disabled = elevationSheets(s).find(
    (sheet) => sheet.title === 'Island — front elevation',
  )!;
  expect(disabled.countertops[0].width).toBeCloseTo(30.25);
});
