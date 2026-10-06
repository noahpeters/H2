import {
  cabinetCompositionEnvelope,
  cabinetToeKick,
} from '../../app/studio/cabinet-configurator/cabinetEnvelope';
import {
  cabinetFaceFrame,
  type FrameRect,
} from '../../app/studio/cabinet-configurator/faceFrame';
import {roomFrontParts} from '../../app/studio/cabinet-configurator/custom-unit/frontLayout';
import {fitDefinition} from '../../app/studio/cabinet-configurator/custom-unit/designConfigurations';
import {customUnitLayoutParts} from '../../app/studio/cabinet-configurator/custom-unit/layoutParts';
import {storageLayout} from '../../app/studio/cabinet-configurator/openStorage';
import type {
  Room,
  RoomElement,
} from '../../app/studio/cabinet-configurator/model';
import type {FrameNeighbors} from '../../app/studio/cabinet-configurator/continuousFaceFrames';

/** Equivalent individual frame stock, in bdft. Joined frames retain this baseline
 * so shared-stile savings cannot cancel the owner-approved 20% premium. */
export function individualFrameBoardFeet(
  item: RoomElement,
  room: Room,
  extensions: FrameNeighbors = {},
): number {
  if (
    !['inset', 'partial-overlay'].includes(room.overlay ?? 'full-overlay') ||
    !['base', 'tall', 'wall-cabinet'].includes(item.kind) ||
    (!item.customCabinet && item.storage?.type === 'floating-shelves')
  )
    return 0;
  const envelope = cabinetCompositionEnvelope(item, room);
  const joined = {
    leftExtension: extensions.leftExtension,
    rightExtension: extensions.rightExtension,
  };
  if (item.customCabinet) {
    const unit = fitDefinition(item.customCabinet.definition, envelope);
    return roomFrontParts(
      {
        ...unit,
        parts: customUnitLayoutParts(unit) as NonNullable<typeof unit.parts>,
      },
      room.overlay!,
      joined,
    )
      .filter((part) => part.faceFrame)
      .reduce(
        (sum, part) => sum + (part.width * part.height * part.depth) / 144,
        0,
      );
  }
  if (item.configuration === 'corner') {
    const arm = Math.min(24, (item.width * 2) / 3, (item.depth * 2) / 3);
    return (
      individualFrameBoardFeet(
        {...item, width: item.width, depth: arm, configuration: 'single-door'},
        room,
        {rightExtension: extensions.rightExtension},
      ) +
      individualFrameBoardFeet(
        {
          ...item,
          width: item.depth - arm,
          depth: arm,
          configuration: 'single-door',
        },
        room,
        {leftExtension: extensions.leftExtension},
      )
    );
  }
  const w = envelope.width,
    h = envelope.height,
    toe = cabinetToeKick(item, room);
  const cells: FrameRect[] = [];
  const addFront = (
    _kind: string,
    width: number,
    height: number,
    x: number,
    y: number,
    _box = true,
  ) => cells.push({width, height, x, y});
  const paired = (low: number, height: number) => {
    const count = w > 30 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const width = count === 1 ? w - 0.25 : w / 2 - 0.1875;
      addFront('door', width, height, ((i + 0.5) * w) / count - width / 2, low);
    }
  };
  const usable = h - 0.25;
  if (item.storage) {
    const layout = storageLayout(item, room);
    for (let i = 0; i < layout.drawers; i++)
      addFront(
        'drawer',
        w - 0.25,
        layout.drawerZone / layout.drawers - 0.125,
        0.125,
        layout.low - toe.height + (i * layout.drawerZone) / layout.drawers,
      );
    if (item.storage.doors)
      paired(
        layout.low - toe.height + layout.drawerZone,
        layout.high - layout.low - layout.drawerZone - 0.125,
      );
  } else if (item.configuration === 'three-drawer') {
    let y = 0.125;
    for (const height of [usable * 0.4, usable * 0.4, usable * 0.2]) {
      addFront('drawer', w - 0.25, height - 0.125, 0.125, y + 0.0625);
      y += height;
    }
  } else if (
    item.configuration === 'door-drawer' ||
    item.configuration === 'sink'
  ) {
    const height = Math.min(6, usable / 3);
    addFront(
      'drawer',
      w - 0.25,
      height - 0.125,
      0.125,
      h - height - 0.0625,
      item.configuration !== 'sink',
    );
    paired(0.125, usable - height - 0.125);
  } else if (item.configuration === 'farmhouse-sink') {
    const apron = Math.min(10, usable * 0.35);
    // The sink apron is plumbing, not a wood door/front.
    const count = 2,
      height = usable - apron - 0.125,
      width = w / 2 - 0.1875;
    for (let i = 0; i < count; i++)
      addFront(
        'door',
        width,
        height,
        ((i + 0.5) * w) / count - width / 2,
        0.125,
      );
  } else if (item.configuration === 'microwave-drawer') {
    const applianceHeight = Math.min(16, usable * 0.6);
    const drawerHeight = usable - applianceHeight - 0.25;
    addFront('drawer', w - 0.25, drawerHeight - 0.125, 0.125, 0.125);
  } else if (item.tallConfiguration && item.tallConfiguration !== 'standard') {
    const coffee = item.tallConfiguration === 'coffee-maker';
    const count = item.tallConfiguration === 'two-oven' ? 2 : 1;
    const applianceHeight = Math.min(coffee ? 18 : 28, (usable * 0.64) / count);
    const drawerHeight = coffee
      ? Math.min(36 - toe.height, usable * 0.5)
      : Math.min(count === 2 ? 12 : 24, usable * 0.28);
    for (let i = 0; i < 2; i++)
      addFront(
        'drawer',
        w - 0.25,
        drawerHeight / 2 - 0.125,
        0.125,
        (i * drawerHeight) / 2 + 0.0625,
      );
    const low = drawerHeight + count * applianceHeight;
    paired(low + 0.125, h - low - 0.25);
  } else if (item.configuration === 'pullout')
    addFront('drawer', w - 0.25, usable, 0.125, 0.125);
  else paired(0.125, usable);
  const frame = cabinetFaceFrame(
    cells,
    {x: 0, y: 0, width: w, height: h},
    joined,
  );
  return [...frame.stiles, ...frame.rails].reduce(
    (sum, part) => sum + (part.width * part.height * 0.75) / 144,
    0,
  );
}
