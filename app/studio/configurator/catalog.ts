export const shapes = [
  { name: "Rectangle", slug: "rectangle" },
  { name: "Circle", slug: "circle" },
  { name: "Oval", slug: "oval" },
] as const;

export const edges = [
  { name: "Soft square", slug: "soft-square", column: 0 },
  { name: "Bullnose", slug: "bullnose", column: 1 },
  { name: "Live edge", slug: "live-edge", column: 2 },
] as const;

export const circleEdges = [
  { name: "Soft square", slug: "soft-square", column: 0 },
  { name: "Bullnose", slug: "bullnose", column: 1 },
] as const;

export const ovalEdges = [
  { name: "Soft square", slug: "soft-square", column: 0 },
  { name: "Bullnose", slug: "bullnose", column: 1 },
] as const;

export const lengthBands = [
  { name: "Short", slug: "short", min: 72, max: 84, row: 0 },
  { name: "Medium", slug: "medium", min: 90, max: 102, row: 1 },
  { name: "Long", slug: "long", min: 108, max: 120, row: 2 },
] as const;

export const bases = [
  { name: "Curved slab frame", slug: "curved-slab-frame", round: false },
  { name: "A-frame", slug: "a-frame", round: false },
  { name: "Mid-century splayed", slug: "mid-century-splayed", round: true },
  { name: "X-trestle", slug: "x-trestle", round: false },
  { name: "Sculpted turned pedestal", slug: "sculpted-turned-pedestal", round: true },
  { name: "Curved trestle", slug: "curved-trestle", round: false },
  { name: "Solid pedestal", slug: "solid-pedestal", round: true },
  { name: "Tapered pedestal", slug: "tapered-pedestal", round: true },
  { name: "Four tapered legs", slug: "four-tapered-legs", round: true },
  { name: "Turned legs — classic", slug: "turned-legs-classic", round: true },
  { name: "Turned legs — simplified", slug: "turned-legs-simplified", round: true },
] as const;

export const chairs = [
  { name: "None", slug: "none" },
  { name: "Curved back", slug: "curved-back" },
  { name: "Ladder back", slug: "ladder-back" },
  { name: "Spindle back", slug: "spindle-back" },
] as const;

export type ShapeSlug = (typeof shapes)[number]["slug"];
export type EdgeSlug = (typeof edges)[number]["slug"];
export type BaseSlug = (typeof bases)[number]["slug"];
export type ChairSlug = (typeof chairs)[number]["slug"];

export function edgesForShape(shape: ShapeSlug) {
  if (shape === "circle") return circleEdges;
  if (shape === "oval") return ovalEdges;
  return edges;
}

export function basesForShape(shape: ShapeSlug) {
  return shape === "circle" ? bases.filter((base) => base.round) : bases;
}

export function bandForLength(length: number) {
  return lengthBands.find((band) => length >= band.min && length <= band.max) ?? lengthBands[1];
}

export function spritePath(shape: ShapeSlug, base: BaseSlug) {
  return `/renders-transparent/${shape}/${base}.webp`;
}

export function chairLayerPath(shape: ShapeSlug, chair: Exclude<ChairSlug, "none">, layer: "back" | "front") {
  return `/chairs/position-atlases/${shape}/${chair}-${layer}.png?v=20`;
}
