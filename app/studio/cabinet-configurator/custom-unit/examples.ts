import {addEndShelf, editableParts} from './partEditing';
import {createCustomUnit, type CustomUnitDefinition} from './model';

export const VANITY_EXAMPLE: CustomUnitDefinition = createCustomUnit({
  id: 'example-vanity',
  name: 'Mixed vanity',
  width: 72,
  height: 34.5,
  depth: 22,
  root: {
    id: 'vanity-columns',
    type: 'division',
    axis: 'vertical',
    weights: [1, 1.15, 1],
    children: [
      {
        id: 'vanity-drawers-left',
        type: 'section',
        sectionType: 'drawer-stack',
        properties: {drawerCount: 3},
      },
      {
        id: 'vanity-doors',
        type: 'section',
        sectionType: 'doors',
        properties: {doorCount: 2},
      },
      {
        id: 'vanity-right',
        type: 'division',
        axis: 'horizontal',
        weights: [1, 2],
        children: [
          {
            id: 'vanity-open',
            type: 'section',
            sectionType: 'open-lower',
            properties: {shelfCount: 1},
          },
          {
            id: 'vanity-drawers-right',
            type: 'section',
            sectionType: 'drawers',
            properties: {drawerCount: 2},
          },
        ],
      },
    ],
  },
});

export const CLOSET_EXAMPLE: CustomUnitDefinition = createCustomUnit({
  id: 'example-closet',
  name: 'Closet wall',
  width: 96,
  height: 96,
  depth: 24,
  root: {
    id: 'closet-columns',
    type: 'division',
    axis: 'vertical',
    weights: [1, 1.4, 1],
    children: [
      {
        id: 'shoe-shelves',
        type: 'section',
        sectionType: 'shelves',
        properties: {shelfCount: 6},
      },
      {
        id: 'closet-center',
        type: 'division',
        axis: 'horizontal',
        weights: [1, 2],
        children: [
          {
            id: 'closet-drawers',
            type: 'section',
            sectionType: 'drawer-stack',
            properties: {drawerCount: 4},
          },
          {
            id: 'closet-hanging',
            type: 'section',
            sectionType: 'hanging',
            properties: {rodHeight: 66},
          },
        ],
      },
      {
        id: 'closet-shelves',
        type: 'section',
        sectionType: 'shelves',
        properties: {shelfCount: 5},
      },
    ],
  },
});

export const CURVED_EXAMPLE: CustomUnitDefinition = createCustomUnit({
  id: 'example-curved',
  name: 'Curved bookcase',
  width: 48,
  height: 36,
  depth: 16,
  curve: {scope: 'cabinet', profile: 'arc', direction: 'inward', radius: 60},
  root: {
    id: 'curved-shelves',
    type: 'section',
    sectionType: 'shelves',
    properties: {shelfCount: 2},
  },
});
export const STEPPED_EXAMPLE: CustomUnitDefinition = {
  ...VANITY_EXAMPLE,
  id: 'example-stepped',
  name: 'Stepped faces & curved edges',
  parts: editableParts(VANITY_EXAMPLE).map((part) => ({
    ...part,
    ...(['door', 'drawer'].includes(part.kind)
      ? {z: part.x < 24 ? -3 : part.x > 48 ? 1 : -0.75}
      : {}),
    ...(part.kind === 'door'
      ? {edges: {left: 'concave' as const, right: 'convex' as const, radius: 2}}
      : {}),
  })),
};
const endBase = createCustomUnit({
  id: 'example-end',
  name: 'Open curved end shelves',
  width: 36,
  height: 34.5,
  depth: 24,
});
const end = addEndShelf(endBase, 'right');
const endPart = end.parts!.at(-1)!;
export const END_SHELF_EXAMPLE: CustomUnitDefinition = {
  ...end,
  parts: [
    ...end.parts!.slice(0, -1),
    ...[0.75, 11.75, 22.75, 33.75].map((y, index) => ({
      ...endPart,
      id: `end-shelf-${index}`,
      y,
    })),
  ],
};
