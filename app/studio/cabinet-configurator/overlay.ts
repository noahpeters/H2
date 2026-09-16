export const OVERLAY_OPTIONS = [
  'full-overlay',
  'partial-overlay',
  'inset',
] as const;
export type Overlay = (typeof OVERLAY_OPTIONS)[number];
export function roomOverlay(value: unknown): Overlay {
  return OVERLAY_OPTIONS.includes(value as Overlay)
    ? (value as Overlay)
    : 'full-overlay';
}
/** Normalize legacy persisted styles in instances, parts, templates and preferences. */
export function migrateFrontStyles<T>(value: T): T {
  if (Array.isArray(value)) return value.map(migrateFrontStyles) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      (key === 'face' || key === 'faceStyle') && entry === 'inset-shaker'
        ? 'shaker'
        : migrateFrontStyles(entry),
    ]),
  ) as T;
}
