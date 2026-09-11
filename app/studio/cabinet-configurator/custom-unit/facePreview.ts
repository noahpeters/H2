import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {KitchenElement} from '../model';
import type {CabinetMaterial, CabinetPaint} from '../materials';
export type CabinetAppearance = {
  face: KitchenElement['face'];
  material: CabinetMaterial;
  paintColor?: CabinetPaint;
};
export const FACE_STYLES = {
  slab: 'Slab',
  shaker: 'Shaker',
  'inset-shaker': 'Inset shaker',
  'vertical-slat': 'Slatted',
  'shaker-glass': 'Shaker + glass',
} as const;
/** Decorative geometry stays within the part envelope and never changes its definition. */
export function facePreviewGeometry(
  w: number,
  h: number,
  d: number,
  style: KitchenElement['face'],
  segmented: boolean,
) {
  const pieces: THREE.BufferGeometry[] = [];
  const box = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const geometry = new THREE.BoxGeometry(
      width,
      height,
      depth,
      segmented ? 64 : 1,
      1,
      1,
    );
    geometry.translate(x, y, z);
    pieces.push(geometry);
  };
  const frame = (
    width: number,
    height: number,
    rail: number,
    depth: number,
    z: number,
  ) => {
    for (const side of [-1, 1]) {
      box(rail, height, depth, (side * (width - rail)) / 2, 0, z);
      box(width - rail * 2, rail, depth, 0, (side * (height - rail)) / 2, z);
    }
  };
  if (style === 'inset-shaker') {
    const rail = Math.min(1.5, w / 8, h / 8);
    frame(w, h, rail, d, 0);
    w -= 2 * rail + Math.min(0.25, w / 20);
    h -= 2 * rail + Math.min(0.25, h / 20);
  }
  if (style === 'vertical-slat') {
    box(w, h, d / 2, 0, 0, d / 4);
    const count = Math.max(2, Math.ceil(w / 2));
    for (let i = 0; i < count; i++)
      box(
        w / count - Math.min(0.12, w / count / 4),
        h,
        d / 2,
        -w / 2 + ((i + 0.5) * w) / count,
        0,
        -d / 4,
      );
  } else if (style !== 'slab') {
    const rail = Math.min(2, w / 5, h / 4);
    frame(w, h, rail, d, 0);
    box(w - rail * 2, h - rail * 2, d / 3, 0, 0, d / 3);
  } else box(w, h, d, 0, 0, 0);
  const result = mergeGeometries(pieces, true)!;
  result.groups.forEach((group) => {
    group.materialIndex = 0;
  });
  if (style === 'shaker-glass')
    result.groups[result.groups.length - 1].materialIndex = 1;
  pieces.forEach((piece) => piece.dispose());
  return result;
}
