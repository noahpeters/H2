/** Core dimensions in inches. Shared by metadata and legacy creation adapters. */
export const CORE_APPLIANCES = {
  refrigerator: {
    label: 'Refrigerator',
    width: 36,
    depth: 30,
    height: 70,
    elevation: 0,
  },
  dishwasher: {
    label: 'Dishwasher',
    width: 24,
    depth: 24,
    height: 34.5,
    elevation: 0,
  },
  range: {
    label: 'Freestanding range',
    width: 30,
    depth: 27,
    height: 36,
    elevation: 0,
  },
  'wall-oven': {
    label: 'Wall oven',
    width: 30,
    depth: 24,
    height: 30,
    elevation: 42,
  },
  microwave: {
    label: 'Microwave',
    width: 30,
    depth: 16,
    height: 17,
    elevation: 54,
  },
  'coffee-maker': {
    label: 'Coffee maker',
    width: 10,
    depth: 12,
    height: 14,
    elevation: 36,
  },
} as const;

export const CORE_FIXTURES = {
  mirror: {label: 'Mirror', width: 30, depth: 1, height: 36},
  toilet: {label: 'Toilet', width: 20, depth: 29, height: 30},
  'freestanding-tub': {
    label: 'Freestanding bathtub',
    width: 66,
    depth: 32,
    height: 24,
  },
  'alcove-tub': {
    label: 'Rectangular / alcove bathtub',
    width: 60,
    depth: 32,
    height: 22,
  },
  'glass-shower': {
    label: 'Glass shower enclosure',
    width: 48,
    depth: 36,
    height: 96,
  },
} as const;

export const CORE_SINKS = {
  undermount: {label: 'Standard undermount', width: 22, depth: 16, height: 7},
  farmhouse: {
    label: 'Farmhouse / apron front',
    width: 22,
    depth: 16,
    height: 9,
  },
  oval: {label: 'Oval bathroom undermount', width: 17, depth: 13, height: 6},
  vessel: {label: 'Vessel / top-mount basin', width: 16, depth: 14, height: 5},
} as const;

export const DOOR_TYPES = [
  ['swing', 'Standard swing door'],
  ['sliding-glass', 'Sliding glass door'],
  ['pocket', 'Pocket door'],
  ['sliding-closet', 'Sliding closet door'],
  ['double-swing', 'Double swing door (French doors)'],
] as const;
