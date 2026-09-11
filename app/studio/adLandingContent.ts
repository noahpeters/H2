export const adLandings = {
  furniture: {
    title: 'Furniture, made for your room.',
    label: 'Commissioned furniture · Riverside, California',
    intro:
      'The length of a table. The way its base meets the floor. The grain you notice every morning. We design furniture around the room, the material, and the way you want to live with it.',
    hero: '/studio/ad-projects/slab-craft.jpeg',
    heroAlt:
      'A From Trees craftsperson routing a detail in a figured wood slab',
    caption: 'At the bench in the From Trees shop.',
    detailTitle: 'Begin with the piece you have in mind.',
    detail:
      'A dining table with room to gather. A cabinet that belongs to a particular wall. A proportion you have looked for but haven’t found. We work through the dimensions, material, and construction with you before building.',
    image: '/studio/images/field-table.webp',
    imageAlt: 'The Field Table by From Trees',
    evidence: 'The Field Table. A finished piece from our selected work.',
    process: [
      'Tell us about the piece and its room.',
      'Refine the proportions, materials, and details together.',
      'Build in our Riverside shop, then coordinate delivery.',
    ],
    formTitle: 'Tell us about your piece.',
    formIntro:
      'A few dimensions, a material you’re drawn to, or a description of the room is enough to begin.',
    projectType: 'Custom furniture',
  },
  cabinetry: {
    title: 'Start with the room.',
    label: 'Custom cabinetry & built-ins · Riverside, California',
    intro:
      'An unusual wall. A corner that could work harder. Storage that needs to feel part of the room. We design and build cabinetry around the space you have and the way you use it.',
    hero: '/studio/ad-projects/arched-builtins.jpeg',
    heroAlt: 'Arched built-in shelves and cabinets framing a fireplace',
    caption: 'Shelving, storage, and a fireplace brought into one composition.',
    detailTitle: 'The useful details belong in the design.',
    detail:
      'A finished wall can do more than it first reveals. In this media wall, the TV panel opens to allow access behind it. Thinking through how a room works is part of thinking through how it looks.',
    image: '/studio/ad-projects/mediawall-access.jpeg',
    imageAlt:
      'Custom media wall with the television panel open to reveal access behind it',
    evidence: 'An opening TV panel, shown in use.',
    process: [
      'Start with the room, its dimensions, and what needs to work better.',
      'Resolve the layout, storage, materials, and details together.',
      'Build for the space and coordinate the final fit.',
    ],
    formTitle: 'What does your room need?',
    formIntro:
      'Tell us about the space, what you want it to hold, and the details that matter to you.',
    projectType: 'Built-ins or storage',
  },
  designers: {
    title: 'Your design. Worked through together.',
    label: 'For interior designers · A Riverside craft partner',
    intro:
      'Bring the drawing, the unusual dimension, or the detail that needs another pair of hands. We work with you on custom cabinetry and commissioned furniture, with close attention to design intent and the finished piece.',
    hero: '/studio/ad-projects/mediawall-access.jpeg',
    heroAlt: 'An opening television panel within a custom built-in media wall',
    caption: 'Access behind the screen, considered as part of the whole wall.',
    detailTitle: 'Resolve the construction. Keep the idea.',
    detail:
      'Openings, proportions, and the relationship between pieces all affect the room. We can work through those decisions with you, from dimensions and material direction to the details of fabrication.',
    image: '/studio/ad-projects/arched-builtins.jpeg',
    imageAlt: 'Paired arched shelves and cabinets arranged around a fireplace',
    evidence: 'A fireplace wall with arched shelving and integrated storage.',
    process: [
      'Share your drawings, dimensions, and project context.',
      'Work through materials, construction, and the details of the fit.',
      'Coordinate fabrication and the next steps for your project.',
    ],
    formTitle: 'Bring us the detail.',
    formIntro:
      'Describe your project and the part you’d like help making. We can arrange to review drawings and references together.',
    projectType: 'Something else',
  },
} as const;
export type AdLandingKind = keyof typeof adLandings;
export function isAdLandingKind(
  value: string | undefined,
): value is AdLandingKind {
  return (
    value === 'furniture' || value === 'cabinetry' || value === 'designers'
  );
}
