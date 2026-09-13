import type {RoomElement} from './model';
export const SINK_CATALOG = {
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
export type SinkKind = keyof typeof SINK_CATALOG;
/** Inches relative to countertop center; dimensions never resize the cabinet. */
export type SinkAttachment = {
  kind: SinkKind;
  x: number;
  width: number;
  depth: number;
};
export function canAttachSink(item: RoomElement) {
  return (
    item.kind === 'base' && item.configuration !== 'corner' && !item.storage
  );
}
export function createSink(kind: SinkKind): SinkAttachment {
  return {
    kind,
    x: 0,
    width: SINK_CATALOG[kind].width,
    depth: SINK_CATALOG[kind].depth,
  };
}
/** Undefined preserves old designs; null explicitly removes a legacy sink. */
export function sinkAttachment(item: RoomElement): SinkAttachment | null {
  if (!canAttachSink(item)) return null;
  if (item.sink !== undefined) return item.sink;
  if (item.configuration !== 'sink' && item.configuration !== 'farmhouse-sink')
    return null;
  return {
    ...createSink(item.configuration === 'sink' ? 'undermount' : 'farmhouse'),
    width: Math.min(22, item.width * 0.7),
    depth: Math.min(16, item.depth * 0.65),
  };
}
export function sinkFits(item: RoomElement, sink: SinkAttachment) {
  return (
    sink.width + 2 <= item.width &&
    sink.depth + 2 <= item.depth &&
    Math.abs(sink.x) + sink.width / 2 + 1 <= item.width / 2
  );
}
export function validSink(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object') return false;
  const s = value as SinkAttachment;
  return (
    Object.hasOwn(SINK_CATALOG, s.kind) &&
    ['x', 'width', 'depth'].every((k) =>
      Number.isFinite(s[k as keyof SinkAttachment]),
    ) &&
    Math.abs(s.x) <= 10000 &&
    s.width > 0 &&
    s.width <= 120 &&
    s.depth > 0 &&
    s.depth <= 120
  );
}
