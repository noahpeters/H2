import {configurationCategory} from './custom-unit/designConfigurations';
import {CABINET_MATERIALS, CABINET_PAINTS} from './materials';
import {validStorage} from './openStorage';
import {validOutline, roomSegments} from './roomOutline';
import {validateCustomUnit} from './custom-unit/model';
export const ROOM_LIMIT = 200_000;
export const SLUG = /^[a-f0-9]{32}$/;
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
  });
export async function readLimited(request: Request): Promise<any> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing room');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > ROOM_LIMIT) {
      await reader.cancel();
      throw new Error('Room is too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function validStudy(value: any): boolean {
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000;
  const dimension = (v: unknown) => num(v) && Number(v) > 0;
  const id = (v: unknown) =>
    typeof v === 'string' && v.length > 0 && v.length < 100;
  if (
    !value ||
    value.version !== 2 ||
    !value.room ||
    !['width', 'depth', 'height'].every((k) => dimension(value.room[k]))
  )
    return false;
  if (
    value.room.outline !== undefined &&
    (!validOutline(value.room.outline) ||
      value.room.outline.some(
        (p: any) =>
          p.x < 0 ||
          p.z < 0 ||
          p.x > value.room.width ||
          p.z > value.room.depth,
      ))
  )
    return false;
  if (
    value.room.toeKick !== undefined &&
    (!value.room.toeKick ||
      !num(value.room.toeKick.height) ||
      value.room.toeKick.height < 0.5 ||
      value.room.toeKick.height > 12 ||
      !num(value.room.toeKick.setback) ||
      value.room.toeKick.setback < 0 ||
      value.room.toeKick.setback > 12)
  )
    return false;
  const walls = roomSegments(value.room).map((s) => s.id);
  if (
    !['oak', 'walnut', 'concrete'].includes(value.room.floor) ||
    !['plaster', 'white', 'green'].includes(value.room.walls)
  )
    return false;
  if (
    !['elements', 'openings', 'islands'].every(
      (k) => Array.isArray(value[k]) && value[k].length <= 200,
    )
  )
    return false;
  if (
    value.configurations !== undefined &&
    (!Array.isArray(value.configurations) ||
      value.configurations.length > 200 ||
      !value.configurations.every(
        (c: any) =>
          c &&
          id(c.id) &&
          Number.isInteger(c.version) &&
          c.version > 0 &&
          typeof c.name === 'string' &&
          c.name.trim().length > 0 &&
          c.name.length <= 100 &&
          typeof c.category === 'string' &&
          c.category.length < 100 &&
          validateCustomUnit(c.definition).length === 0,
      ) ||
      new Set(value.configurations.map((c: any) => c.id)).size !==
        value.configurations.length)
  )
    return false;
  const ids = [...value.elements, ...value.openings, ...value.islands].map(
    (e) => e?.id,
  );
  if (!ids.every(id) || new Set(ids).size !== ids.length) return false;
  return (
    value.elements.every(
      (e: any) =>
        e &&
        ['base', 'wall-cabinet', 'tall', 'appliance'].includes(e.kind) &&
        (e.customCabinet === undefined ||
          (e.customCabinet &&
            typeof e.customCabinet.libraryId === 'string' &&
            (e.customCabinet.scope === undefined ||
              (e.customCabinet.scope === 'design' &&
                e.kind !== 'appliance' &&
                value.configurations?.some(
                  (c: any) =>
                    c.id === e.customCabinet.libraryId &&
                    c.category === configurationCategory(e) &&
                    c.version >= e.customCabinet.libraryVersion,
                ))) &&
            Number.isInteger(e.customCabinet.libraryVersion) &&
            e.customCabinet.libraryVersion > 0 &&
            validateCustomUnit(e.customCabinet.definition).length === 0)) &&
        (e.storage === undefined ||
          (validStorage(e.storage) &&
            e.kind ===
              (['overhead', 'floating-shelves'].includes(e.storage.type)
                ? 'wall-cabinet'
                : 'tall') &&
            e.width >= 12 &&
            e.width <= 96 &&
            e.depth >= 8 &&
            e.depth <= 36 &&
            e.height >= 12 &&
            e.height <= 120)) &&
        (e.material === undefined ||
          Object.hasOwn(CABINET_MATERIALS, e.material)) &&
        (e.paintColor === undefined ||
          Object.hasOwn(CABINET_PAINTS, e.paintColor)) &&
        ['width', 'depth', 'height'].every((k) => dimension(e[k])) &&
        [
          'shaker',
          'slab',
          'shaker-glass',
          'inset-shaker',
          'vertical-slat',
        ].includes(e.face) &&
        (e.applianceFront === undefined ||
          ['stainless', 'shaker', 'slab', 'vertical-slat'].includes(
            e.applianceFront,
          )) &&
        (e.kind !== 'appliance' ||
          [
            'refrigerator',
            'dishwasher',
            'range',
            'wall-oven',
            'microwave',
            'coffee-maker',
          ].includes(e.applianceKind)) &&
        e.placement &&
        (e.placement.elevation === undefined || num(e.placement.elevation)) &&
        (e.placement.mode === 'wall'
          ? walls.includes(e.placement.wall) &&
            num(e.placement.offset) &&
            (e.placement.rotation === undefined || num(e.placement.rotation))
          : ['floor', 'hosted'].includes(e.placement.mode) &&
            num(e.placement.x) &&
            num(e.placement.z) &&
            num(e.placement.rotation)),
    ) &&
    value.openings.every(
      (o: any) =>
        o &&
        ['door', 'window', 'opening'].includes(o.kind) &&
        walls.includes(o.wall) &&
        num(o.offset) &&
        dimension(o.width) &&
        dimension(o.height) &&
        (o.sill === undefined || num(o.sill)),
    ) &&
    value.islands.every(
      (i: any) =>
        i &&
        ['x', 'z', 'rotation', 'overhang'].every((k) => num(i[k])) &&
        dimension(i.width) &&
        dimension(i.depth),
    ) &&
    typeof value.countertop === 'boolean' &&
    ['plan', 'split', 'three'].includes(value.view)
  );
}
