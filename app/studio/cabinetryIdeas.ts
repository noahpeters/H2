export const cabinetryIdeas = [
  {
    id: 'kitchen',
    group: 'Rooms',
    name: 'Kitchen & pantry',
    prompt:
      'Think through one meal. Where do you prep, reach for cookware, and put things away?',
    related: ['drawers', 'appliance-storage', 'white-oak'],
  },
  {
    id: 'vanity',
    group: 'Rooms',
    name: 'Bathroom vanity',
    prompt:
      'Who shares the vanity? Plan drawer space around the sink, plumbing, and morning routines.',
    related: ['drawers', 'inset', 'reeded'],
  },
  {
    id: 'built-ins',
    group: 'Rooms',
    name: 'Living room built-ins',
    prompt:
      'Which books, screens, or speakers need a home? Consider what stays visible and what needs access behind a door.',
    related: ['open-shelves', 'framing', 'hardware'],
  },
  {
    id: 'open-shelves',
    group: 'Layout & use',
    name: 'Open shelving',
    prompt:
      'Measure the tallest object you want to display. Shelf spacing and depth can follow what you actually own.',
    related: ['built-ins', 'white-oak'],
  },
  {
    id: 'drawers',
    group: 'Layout & use',
    name: 'Drawer storage',
    prompt:
      'Which things get lost at the back of a shelf? A drawer brings them into view, and its depth can follow the contents.',
    related: ['vanity', 'hardware'],
  },
  {
    id: 'appliance-storage',
    group: 'Layout & use',
    name: 'Appliance storage',
    prompt:
      'Which appliances stay out during the week? Their height and how you use them guide openings and door placement.',
    related: ['kitchen', 'hardware'],
  },
  {
    id: 'white-oak',
    group: 'Materials & finishes',
    name: 'White oak',
    prompt:
      'Do you like long, straight grain or a more varied figure? Compare samples in the light of your room.',
    related: ['painted', 'open-shelves'],
  },
  {
    id: 'painted',
    group: 'Materials & finishes',
    name: 'Painted cabinetry',
    prompt:
      'Consider the color beside your floor and walls, in daylight and under the lights you use at night.',
    related: ['framing', 'inset'],
  },
  {
    id: 'reeded',
    group: 'Doors & details',
    name: 'Reeded fronts',
    prompt:
      'Narrow repeated grooves catch the light. Consider a single bank of drawers or a larger run.',
    related: ['vanity', 'white-oak'],
  },
  {
    id: 'inset',
    group: 'Doors & details',
    name: 'Inset doors',
    prompt:
      'The door sits within its frame. The width of the frame and the fine line around each front shape the elevation.',
    related: ['framing', 'hardware'],
  },
  {
    id: 'framing',
    group: 'Doors & details',
    name: 'Architectural trim',
    prompt:
      'Look at nearby baseboards, door casings, and crown. Which lines should continue across the built-in?',
    related: ['built-ins', 'inset'],
  },
  {
    id: 'hardware',
    group: 'Doors & details',
    name: 'Pulls & hinges',
    prompt:
      'Try the grip you prefer and consider the swing of each door beside the wall or the next cabinet.',
    related: ['inset', 'drawers'],
  },
];
