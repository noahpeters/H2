import * as THREE from 'three';
import type {Opening, Room, Wall} from './model';
import {roomWall} from './roomOutline';
import {wallFootprint} from './wallDimensions';
import {simpleArchProfile} from './simpleArch';

const inch = 0.0254;
type Height = (x: number) => number;

/** Extrude each continuous elevation band through the authoritative wall footprint.
 * The arch roof slopes between circle samples instead of removing rectangular cells.
 */
export function archedWallGeometry(room: Room, wall: Wall, holes: Opening[]) {
  const segment = roomWall(room, wall);
  const along = (p: {x: number; z: number}) =>
    segment.horizontal ? p.x - segment.x : p.z - segment.z;
  const across = (p: {x: number; z: number}) =>
    segment.horizontal ? p.z - segment.z : segment.x - p.x;
  const xs = [
    ...new Set(
      [
        0,
        segment.length,
        ...holes.flatMap((o) => [o.offset, o.offset + o.width]),
        ...holes.flatMap((o) =>
          o.arch === 'simple'
            ? simpleArchProfile(o.width, o.height, 128).points.map(
                (p) => o.offset + p.x,
              )
            : [],
        ),
      ].map((x) => Math.max(0, Math.min(segment.length, x))),
    ),
  ].sort((a, b) => a - b);
  const geometries: THREE.BufferGeometry[] = [];
  for (let i = 1; i < xs.length; i++) {
    const start = xs[i - 1],
      end = xs[i];
    if (end - start < 1e-8) continue;
    const intervals = holes
      .filter(
        (o) =>
          o.offset < (start + end) / 2 &&
          o.offset + o.width > (start + end) / 2,
      )
      .map((o) => {
        const sill = o.kind === 'window' ? (o.sill ?? 42) : 0;
        const roof = (x: number) => {
          if (o.arch !== 'simple') return sill + o.height;
          const radius = Math.min(o.width / 2, o.height);
          const dx = x - o.offset - o.width / 2;
          return (
            sill +
            o.height -
            radius +
            Math.sqrt(Math.max(0, radius * radius - dx * dx))
          );
        };
        const a = roof(start),
          b = roof(end);
        return {
          low: (() => sill) as Height,
          high: ((x: number) =>
            a + ((b - a) * (x - start)) / (end - start)) as Height,
        };
      });
    const levels: Height[] = [
      () => 0,
      () => room.height,
      ...intervals.flatMap((v) => [v.low, v.high]),
    ];
    // Split at crossing profiles so overlapping apertures form their union.
    const cuts = [start, end];
    for (let a = 0; a < levels.length; a++)
      for (let b = a + 1; b < levels.length; b++) {
        const left = levels[a](start) - levels[b](start),
          right = levels[a](end) - levels[b](end);
        if (left * right < 0)
          cuts.push(start + ((end - start) * left) / (left - right));
      }
    cuts.sort((a, b) => a - b);
    for (let j = 1; j < cuts.length; j++) {
      const x0 = cuts[j - 1],
        x1 = cuts[j],
        mid = (x0 + x1) / 2;
      if (x1 - x0 < 1e-8) continue;
      const voids = intervals
        .filter((v) => v.high(mid) > 0 && v.low(mid) < room.height)
        .sort((a, b) => a.low(mid) - b.low(mid));
      const bands: Array<[Height, Height]> = [];
      let bottom: Height = () => 0;
      for (const v of voids) {
        if (v.low(mid) > bottom(mid)) bands.push([bottom, v.low]);
        if (v.high(mid) > bottom(mid)) bottom = v.high;
      }
      if (bottom(mid) < room.height) bands.push([bottom, () => room.height]);
      for (const [low, high] of bands) {
        const footprint = wallFootprint(room, wall, x0, x1);
        const contour = footprint.map(
          (p) => new THREE.Vector2(along(p) - segment.length / 2, -across(p)),
        );
        if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
        const coordinates: number[] = [];
        const point = (index: number, top: boolean) => {
          const p = contour[index],
            x = p.x + segment.length / 2;
          return [
            p.x * inch,
            Math.max(0, Math.min(room.height, (top ? high : low)(x))) * inch,
            -p.y * inch,
          ];
        };
        const triangle = (a: number[], b: number[], c: number[]) =>
          coordinates.push(...a, ...b, ...c);
        for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
          contour,
          [],
        )) {
          triangle(point(a, true), point(b, true), point(c, true));
          triangle(point(c, false), point(b, false), point(a, false));
        }
        for (let k = 0; k < contour.length; k++) {
          const next = (k + 1) % contour.length;
          triangle(point(k, false), point(next, false), point(next, true));
          triangle(point(k, false), point(next, true), point(k, true));
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(coordinates, 3),
        );
        geometry.computeVertexNormals();
        geometries.push(geometry);
      }
    }
  }
  return geometries;
}
