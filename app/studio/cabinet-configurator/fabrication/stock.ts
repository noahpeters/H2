import type {FabricationPart, Vec3} from './model';
/** Map board axes into stock axes: red=grain/length, green=width, blue=thickness. */
export function stockAxes(part: FabricationPart): [number, number, number] {
  const remaining = [0, 1, 2].filter((i) => i !== part.grainAxis);
  const thickness = remaining.reduce((a, b) =>
    part.size[a] < part.size[b] ? a : b,
  );
  return [part.grainAxis, remaining.find((i) => i !== thickness)!, thickness];
}
export function stockDimensions(part: FabricationPart): Vec3 {
  return stockAxes(part).map((i) => part.size[i]) as Vec3;
}
export function partsCsv(parts: FabricationPart[]): string {
  const cell = (value: unknown) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    [
      'Part ID',
      'Cabinet ID',
      'Part',
      'Material',
      'Stock type',
      'Quantity',
      'Length (in)',
      'Width (in)',
      'Thickness (in)',
      'Machining',
      'Grain axis',
    ],
  ];
  for (const part of parts)
    rows.push([
      part.id,
      part.assemblyId,
      part.name,
      part.material,
      part.stockType,
      1,
      ...stockDimensions(part),
      part.pockets
        .map(
          (p) =>
            `${p.operation}: ${p.size.join(' x ')} at ${p.origin.join(',')}`,
        )
        .join('; '),
      ['X', 'Y', 'Z'][part.grainAxis],
    ]);
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
