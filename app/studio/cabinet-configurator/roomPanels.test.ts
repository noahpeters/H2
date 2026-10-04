import {describe, expect, it} from 'vitest';
import {
  automaticallyPlaceElement,
  type PlacementLayout,
} from './automaticPlacement';
import {wallToFloor, type RoomElement} from './model';
import {createRoomPanel, DEFAULT_PANEL_THICKNESS} from './roomPanels';

const room = {
  width: 180,
  depth: 144,
  height: 108,
  floor: 'oak' as const,
  walls: 'white' as const,
};
const layout = (): PlacementLayout => ({
  room,
  elements: [],
  openings: [],
  islands: [],
});
const cabinet = (
  id: string,
  placement: RoomElement['placement'],
): RoomElement => ({
  id,
  kind: 'base',
  width: 30,
  depth: 24,
  height: 34.5,
  face: 'slab',
  placement,
});

describe('standalone room panels', () => {
  it('places a full-height panel at a wall run end, perpendicular to the wall face', () => {
    const design = layout();
    const refrigerator: RoomElement = {
      ...cabinet('refrigerator', {
        mode: 'wall',
        wall: 'back',
        offset: 24,
        elevation: 0,
      }),
      kind: 'appliance',
      applianceKind: 'refrigerator',
      width: 36,
      depth: 30,
      height: 70,
    };
    design.elements.push(refrigerator);

    const panel = automaticallyPlaceElement(
      createRoomPanel('panel', room),
      design,
      {elementId: refrigerator.id},
    );

    expect(panel.kind).toBe('panel');
    expect(panel.width).toBe(DEFAULT_PANEL_THICKNESS);
    expect(panel.height).toBe(room.height);
    expect(panel.placement).toMatchObject({
      mode: 'wall',
      wall: 'back',
      offset: 60,
    });
    expect(wallToFloor(panel, room).rotation).toBe(0);
  });

  it('places an island end panel parallel to the run end plane', () => {
    const design = layout();
    design.islands.push({
      id: 'island',
      x: 90,
      z: 72,
      width: 72,
      depth: 42,
      rotation: 90,
      overhang: 0,
      seatingSide: 'none',
    });
    const endCabinet = cabinet('island-cabinet', {
      mode: 'floor',
      x: 90,
      z: 57,
      rotation: 90,
      elevation: 0,
    });
    endCabinet.islandId = 'island';
    design.elements.push(endCabinet);

    const panel = automaticallyPlaceElement(
      createRoomPanel('panel', room),
      design,
      {elementId: endCabinet.id},
    );

    expect(panel.islandId).toBe('island');
    expect(panel.placement).toMatchObject({mode: 'floor', rotation: 90});
  });
});
