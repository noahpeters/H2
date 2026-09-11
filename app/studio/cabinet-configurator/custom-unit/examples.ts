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
