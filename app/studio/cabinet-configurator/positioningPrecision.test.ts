import {describe, expect, test} from 'vitest';
import {
  createDragUpdate,
  createDragEndUpdate,
  migrateStudy,
  type Study,
} from './CabinetConfigurator';
import {bounds, validateLayout, moveIsland, type RoomElement} from './model';
import {
  positioningResolution,
  quantizePosition,
  quantizeElementPosition,
} from './positioningPrecision';
import {
  positioningGuides,
  elevationGuide,
  commitElevationGuide,
} from './positioningGuides';
import {validAutomaticPlacement} from './automaticPlacement';
import {validStudy} from './savedRoomProtocol';

const cabinet = (id: string, x = 60, z = 60): RoomElement => ({
  id,
  kind: 'base',
  width: 24,
  depth: 24,
  height: 34.5,
  face: 'slab',
  placement: {mode: 'floor', x, z, rotation: 0},
});
function sample(): Study {
  return {
    version: 2,
    room: {width: 240, depth: 200, height: 120, floor: 'oak', walls: 'plaster'},
    elements: [cabinet('active')],
    islands: [],
    openings: [],
    selected: 'active',
    view: 'plan',
    countertop: true,
  };
}
const overlap = (study: Study) =>
  [...validateLayout(study.elements, study.room).values()]
    .flat()
    .includes('Overlaps another element');

describe('room positioning precision', () => {
  test.each([1 / 16, 1 / 8, 1] as const)(
    'uses %s inch for X, Y and Z in drag and numerical edits',
    (step) => {
      const study = sample();
      study.room.positioningResolution = step;
      const item = study.elements[0];
      item.kind = 'wall-cabinet';
      item.placement.elevation = 54 + step * 0.6;
      quantizeElementPosition(item, study.room);
      expect(item.placement.elevation).toBe(54 + step);
      const result = createDragUpdate(
        {id: item.id, mode: 'floor', x: 60, z: 60, clientX: 0, clientY: 0},
        step * 0.6,
        -step * 0.6,
        1,
      )(study);
      expect(result.elements[0].placement).toMatchObject({
        x: 60 + step,
        z: 60 - step,
        elevation: 54 + step,
      });
      expect(quantizePosition(-step * 0.6, study.room)).toBe(-step);
      expect(
        quantizePosition(quantizePosition(0.3, study.room), study.room),
      ).toBe(quantizePosition(0.3, study.room));
    },
  );
  test('defaults legacy rooms to 1/8 and saves only supported resolutions', () => {
    const study = sample();
    expect(positioningResolution(migrateStudy(study).room)).toBe(1 / 8);
    for (const step of [1 / 16, 1 / 8, 1] as const) {
      study.room.positioningResolution = step;
      expect(validStudy(JSON.parse(JSON.stringify(study)))).toBe(true);
      expect(migrateStudy(study).room.positioningResolution).toBe(step);
    }
    expect(
      validStudy({...study, room: {...study.room, positioningResolution: 3}}),
    ).toBe(false);
  });
  test('does not move exact off-grid alignments when unrelated properties change', () => {
    const study = sample();
    const old = cabinet('active', 60.03);
    const next = structuredClone(old);
    next.face = 'shaker';
    quantizeElementPosition(next, study.room, old);
    expect(next.placement).toEqual(old.placement);
  });
  test('horizontal dragging preserves an exact off-grid height alignment', () => {
    const study = sample();
    study.elements[0].kind = 'wall-cabinet';
    study.elements[0].placement.elevation = 60.03;
    const next = createDragUpdate(
      {id: 'active', mode: 'floor', x: 60, z: 60, clientX: 0, clientY: 0},
      1,
      0,
      1,
    )(study);
    expect(next.elements[0].placement.elevation).toBe(60.03);
  });
  test('removes three-inch magnetic wall and cabinet attraction', () => {
    const study = sample();
    study.elements.push(cabinet('other', 84));
    const drag = {
      id: 'active',
      mode: 'floor' as const,
      x: 60,
      z: 60,
      clientX: 0,
      clientY: 0,
    };
    const next = createDragUpdate(drag, -2, -46, 1)(study);
    expect(next.elements[0].placement).toMatchObject({
      mode: 'floor',
      x: 58,
      z: 14,
    });
    const adjacent = createDragUpdate(drag, -2, 0, 1)(study);
    expect(
      createDragEndUpdate('active')(adjacent).elements[0].placement,
    ).toMatchObject({x: 58});
  });
});

describe('guide commit and intersections', () => {
  test('release commits exact edge alignment to fractional geometry rather than re-rounding it', () => {
    const study = sample();
    const other = cabinet('other', 84.03);
    study.elements.push(other);
    const guide = positioningGuides(study, {kind: 'element', id: 'active'});
    expect(
      guide.some(
        (g) => g.kind === 'alignment' && g.axis === 'z' && g.at === 72.03,
      ),
    ).toBe(true);
    const result = createDragEndUpdate('active')(study);
    expect(bounds(result.elements[0], result.room).right).toBeCloseTo(
      bounds(other, result.room).left,
      8,
    );
    expect(overlap(result)).toBe(false);
    expect(study.elements[0].placement).toMatchObject({x: 60});
    expect(createDragEndUpdate('active')(result)).toEqual(result);
  });
  test.each(['edge', 'center', 'face'] as const)(
    'commits %s guides from the displayed candidate',
    (alignment) => {
      const study = sample();
      const other = cabinet(
        'other',
        alignment === 'edge' ? 84.03 : 60.03,
        alignment === 'face' ? 84.03 : 100,
      );
      if (alignment === 'center') other.width = 30;
      study.elements.push(other);
      const result = createDragEndUpdate('active')(study);
      expect(result.elements[0].placement).toMatchObject({x: 60.03});
      if (alignment === 'face')
        expect(result.elements[0].placement).toMatchObject({z: 60.03});
    },
  );
  test('conflicting nearby guides display only a compatible translation', () => {
    const study = sample();
    study.elements.push(cabinet('left', 84.03), cabinet('right', 35.95));
    const guides = positioningGuides(study, {
      kind: 'element',
      id: 'active',
    }).filter((g) => g.kind === 'alignment' && g.axis === 'z');
    expect(guides.map((g) => g.at)).toContain(72.03);
    expect(guides.map((g) => g.at)).not.toContain(47.95);
    expect(
      createDragEndUpdate('active')(study).elements[0].placement,
    ).toMatchObject({x: 60.03});
  });
  test.each([0, 90, 45])(
    'touching island cabinets remain valid at %s degrees, including rotation drift',
    (rotation) => {
      const study = sample();
      const zone = {
        id: 'island',
        x: 84,
        z: 84,
        rotation: 0,
        width: 96,
        depth: 48,
        overhang: 0,
        seatingSide: 'none' as const,
      };
      const a = {...cabinet('a', 72, 84), islandId: zone.id};
      const b = {...cabinet('b', 96 - 1e-10, 84), islandId: zone.id};
      study.elements = moveIsland(zone, [a, b], {...zone, rotation});
      zone.rotation = rotation;
      // Island editing currently uses quarter turns; also verify imported
      // arbitrary-angle geometry without changing its dimensions.
      if (rotation === 45)
        for (const e of study.elements) e.placement.rotation = rotation;
      study.islands = [zone];
      expect(overlap(study)).toBe(false);
      expect(validAutomaticPlacement(study.elements[0], study)).toBe(true);
      const angle = (rotation * Math.PI) / 180;
      if (study.elements[1].placement.mode === 'floor') {
        study.elements[1].placement.x -= Math.cos(angle) / 16;
        study.elements[1].placement.z -= Math.sin(angle) / 16;
      }
      expect(overlap(study)).toBe(true);
      expect(validAutomaticPlacement(study.elements[0], study)).toBe(false);
    },
  );
  test.each([1 / 16, 1 / 8, 1] as const)(
    'height alignment and real overlaps share tolerance at resolution %s',
    (resolution) => {
      const study = sample();
      study.room.positioningResolution = resolution;
      const lower = {
        ...cabinet('lower'),
        kind: 'wall-cabinet' as const,
        height: 20.03,
        placement: {
          mode: 'wall' as const,
          wall: 'back' as const,
          offset: 24,
          elevation: 40,
        },
      };
      const upper = {
        ...cabinet('upper'),
        kind: 'wall-cabinet' as const,
        height: 20,
        placement: {
          mode: 'wall' as const,
          wall: 'back' as const,
          offset: 24,
          elevation: 60,
        },
      };
      study.elements = [lower, upper];
      expect(elevationGuide(study, upper.id)).toMatchObject({
        alignment: 'bottom',
        at: 60.03,
      });
      commitElevationGuide(study, upper.id);
      expect(upper.placement.elevation).toBe(60.03);
      upper.placement.elevation -= 1e-10;
      expect(overlap(study)).toBe(false);
      expect(validAutomaticPlacement(upper, study)).toBe(true);
      upper.placement.elevation -= 1 / 16;
      expect(overlap(study)).toBe(true);
      expect(validAutomaticPlacement(upper, study)).toBe(false);
      upper.placement.elevation =
        lower.placement.elevation - upper.height + 0.03;
      expect(elevationGuide(study, upper.id)).toMatchObject({
        alignment: 'top',
        at: 40,
      });
      commitElevationGuide(study, upper.id);
      expect(overlap(study)).toBe(false);
    },
  );
  test('floor-mounted stacked wall cabinets also use height for intersection', () => {
    const study = sample();
    study.elements = [
      cabinet('lower'),
      {
        ...cabinet('upper'),
        kind: 'wall-cabinet',
        placement: {
          mode: 'floor',
          x: 60,
          z: 60,
          rotation: 0,
          elevation: 34.5 - 1e-10,
        },
      },
    ];
    expect(overlap(study)).toBe(false);
    study.elements[1].placement.elevation = 34.5 - 1 / 16;
    expect(overlap(study)).toBe(true);
  });
});

describe('precision-sized adjacency snapping', () => {
  test.each([1 / 16, 1 / 8, 1] as const)(
    'snaps cabinet edges only within twice %s inch',
    (step) => {
      const study = sample();
      study.room.positioningResolution = step;
      study.elements.push(cabinet('neighbor', 84));
      const drag = {
        id: 'active',
        mode: 'floor' as const,
        x: 60,
        z: 60,
        clientX: 0,
        clientY: 0,
      };
      const atLimit = createDragUpdate(drag, 2 * step, 0, 1)(study);
      expect(atLimit.elements[0].placement).toMatchObject({x: 60});
      expect(overlap(atLimit)).toBe(false);
      const outside = createDragUpdate(drag, -3 * step, 0, 1)(study);
      expect(outside.elements[0].placement).toMatchObject({x: 60 - 3 * step});
      const bypassed = createDragUpdate(drag, 2 * step, 0, 1, true)(study);
      expect(bypassed.elements[0].placement).toMatchObject({x: 60 + 2 * step});
      expect(
        createDragEndUpdate('active', true)(bypassed).elements[0].placement,
      ).toEqual(bypassed.elements[0].placement);
      expect(
        createDragEndUpdate('active')(bypassed).elements[0].placement,
      ).toMatchObject({x: 60});
    },
  );
  test.each([1 / 16, 1 / 8, 1] as const)(
    'uses twice %s inch for walls and bypasses wall attachment',
    (step) => {
      const study = sample();
      study.room.positioningResolution = step;
      const drag = {
        id: 'active',
        mode: 'floor' as const,
        x: 60,
        z: 60,
        clientX: 0,
        clientY: 0,
      };
      expect(
        createDragUpdate(drag, 0, -48 + 2 * step, 1)(study).elements[0]
          .placement,
      ).toMatchObject({mode: 'wall', wall: 'back'});
      expect(
        createDragUpdate(drag, 0, -48 + 3 * step, 1)(study).elements[0]
          .placement,
      ).toMatchObject({mode: 'floor', z: 12 + 3 * step});
      expect(
        createDragUpdate(drag, 0, -48 + 2 * step, 1, true)(study).elements[0]
          .placement,
      ).toMatchObject({mode: 'floor', z: 12 + 2 * step});
    },
  );
  test.each([1 / 16, 1 / 8, 1] as const)(
    'uses twice %s inch for island boundaries and bypasses island-edge snapping',
    (step) => {
      const study = sample();
      study.room.positioningResolution = step;
      study.islands = [
        {
          id: 'zone',
          x: 60,
          z: 60,
          width: 72,
          depth: 48,
          rotation: 0,
          overhang: 0,
          seatingSide: 'none',
        },
      ];
      study.elements[0].islandId = 'zone';
      const drag = {
        id: 'active',
        mode: 'floor' as const,
        x: 60,
        z: 60,
        clientX: 0,
        clientY: 0,
      };
      expect(
        createDragUpdate(drag, 24 - 2 * step, 0, 1)(study).elements[0]
          .placement,
      ).toMatchObject({x: 84});
      expect(
        createDragUpdate(drag, 24 - 3 * step, 0, 1)(study).elements[0]
          .placement,
      ).toMatchObject({x: 84 - 3 * step});
      expect(
        createDragUpdate(drag, 24 - 2 * step, 0, 1, true)(study).elements[0]
          .placement,
      ).toMatchObject({x: 84 - 2 * step});
    },
  );
});
