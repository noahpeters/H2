import {describe, it, expect} from 'vitest';
import {
  OPEN_STORAGE,
  createOpenStorage,
  storageLayout,
  validStorage,
  type StorageKind,
} from './openStorage';
import {cabinetGeometry} from './roomGeometry';
import {validStudy} from './savedRoomProtocol';
import type {Study} from './CabinetConfigurator';
describe('open storage', () => {
  it('supports every type in saved rooms and produces matching geometry', () => {
    for (const type of Object.keys(OPEN_STORAGE) as StorageKind[]) {
      const item = createOpenStorage(type, type);
      expect(validStorage(item.storage)).toBe(true);
      const room: Study = {
        version: 2,
        room: {
          width: 144,
          depth: 120,
          height: 96,
          floor: 'oak',
          walls: 'plaster',
        },
        elements: [item],
        openings: [],
        islands: [],
        selected: null,
        countertop: true,
        view: 'split',
      };
      expect(validStudy(JSON.parse(JSON.stringify(room)))).toBe(true);
      const layout = storageLayout(item),
        group = cabinetGeometry(item, true);
      const count = (name: string) =>
        (() => {
          let count = 0;
          group.traverse((c) => {
            if (c.name === name) count++;
          });
          return count;
        })();
      expect(count('storage-shelf')).toBe(
        type === 'floating-shelves' ? 0 : layout.shelfYs.length,
      );
      expect(count('floating-shelf')).toBe(
        type === 'floating-shelves' ? item.storage!.shelves : 0,
      );
      expect(count('storage-hanging-rod')).toBe(layout.rods.length);
      expect(count('storage-drawer-box')).toBe(layout.drawers);
      expect(count('cabinet-top')).toBe(type === 'floating-shelves' ? 0 : 1);
      expect(count('cabinet-front')).toBe(layout.drawers);
      expect(count('storage-divider')).toBe(type === 'combination' ? 1 : 0);
      group.traverse((child) => {
        if ('geometry' in child)
          (child.geometry as {dispose: () => void}).dispose();
      });
    }
  });
  it('renders optional doors, finished backs and shoe retaining lips', () => {
    const item = createOpenStorage('shoes', 's');
    item.width = 36;
    const open = cabinetGeometry(item, false);
    expect(
      open.children.filter((c) => c.name === 'shoe-retaining-lip'),
    ).toHaveLength(storageLayout(item).shelfYs.length);
    item.storage!.doors = true;
    const closed = cabinetGeometry(item, false);
    expect(
      closed.children.filter((c) => c.name === 'cabinet-front'),
    ).toHaveLength(2);
    item.storage!.back = false;
    expect(cabinetGeometry(item, false).children.length).toBe(
      closed.children.length - 1,
    );
  });
  it.each([
    ['flat', 0],
    ['vertical-shiplap', 6],
    ['vertical-plank', 13],
  ] as const)('renders a %s back independently of shelves', (style, lines) => {
    const item = createOpenStorage('shelving', style);
    item.width = 36;
    item.storage!.backStyle = style;
    const group = cabinetGeometry(item, false);
    expect(
      group.children.filter((c) => c.name === 'cabinet-back-panel'),
    ).toHaveLength(1);
    expect(
      group.children.filter((c) => c.name === `back-panel-${style}-line`),
    ).toHaveLength(lines);
    expect(
      group.children.filter((c) => c.name === 'storage-shelf'),
    ).toHaveLength(storageLayout(item).shelfYs.length);
  });
  it('bounds counts and keeps fitted shelves inside short and shallow units', () => {
    const item = createOpenStorage('shoes', 's');
    item.height = 12;
    item.depth = 36;
    item.storage!.shelves = 20;
    const layout = storageLayout(item);
    expect(layout.shelfYs.every((y) => y > layout.low && y < layout.high)).toBe(
      true,
    );
    expect(validStorage({...item.storage, shelves: 100000})).toBe(false);
    expect(validStorage({...item.storage, type: 'unknown'})).toBe(false);
    expect(validStorage({...item.storage, doors: 'yes'})).toBe(false);
    expect(validStorage({...item.storage, backStyle: 'beadboard'})).toBe(false);
    const {backStyle: _legacyStyle, ...legacy} = item.storage!;
    expect(validStorage(legacy)).toBe(true);
  });
});
