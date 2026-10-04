import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {shakerFrameWidth} from '../hardwarePlacement';
import {cabinetArchPane, type ArchPoint} from './cabinetArch';
import type {RoomFrontPart} from './frontLayout';

export function archPath(points: ArchPoint[]) {
  const path = new THREE.Shape();
  points.forEach((point, i) =>
    i ? path.lineTo(point.x, point.y) : path.moveTo(point.x, point.y),
  );
  path.closePath();
  return path;
}

/** Rectangular stock is cut to the shared outer arch; shaker/glass fronts also
 * have a concentric inset aperture. Both move together with the door. */
export function archedFrontGeometry(part: RoomFrontPart, style?: string) {
  const shape = archPath(part.outline!);
  const pane =
    part.cabinetArch &&
    ['shaker', 'shaker-glass', 'inset-shaker'].includes(style ?? '')
      ? cabinetArchPane(part, shakerFrameWidth(part.width, part.height))
      : [];
  if (pane.length >= 3) shape.holes.push(archPath([...pane].reverse()));
  const frame = new THREE.ExtrudeGeometry(shape, {
    depth: part.depth,
    bevelEnabled: false,
  });
  frame.translate(-part.width / 2, -part.height / 2, -part.depth / 2);
  if (pane.length < 3) return frame;
  const panel = new THREE.ExtrudeGeometry(archPath(pane), {
    depth: part.depth / 3,
    bevelEnabled: false,
  });
  panel.translate(-part.width / 2, -part.height / 2, part.depth / 6);
  const result = mergeGeometries([frame, panel], true)!;
  result.groups[0].materialIndex = 0;
  result.groups[1].materialIndex = style === 'shaker-glass' ? 1 : 0;
  frame.dispose();
  panel.dispose();
  return result;
}
