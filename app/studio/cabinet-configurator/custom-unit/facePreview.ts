import {
  SHAKER_PANEL_SETBACK,
  SHAKER_BEAD_WIDTH,
  shakerPanelDepth,
  shakerBeadGeometry,
  rectangularBeadAperture,
} from '../faceProfiles';
import {shakerFrameWidth} from '../hardwarePlacement';
import type {Overlay} from '../overlay';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {RoomElement} from '../model';
import type {CabinetMaterial, CabinetPaint} from '../materials';
import type {MaterialDefinition, GrainAxis} from '../materialDefinition';
export type CabinetAppearance = {
  interior?: import('../materials').MaterialSelection;
  useMapleInternals?: boolean;
  flatGrain?: import('../designMaterials').FlatGrain;
  overlay?: Overlay;
  face: RoomElement['face'];
  material: CabinetMaterial;
  paintColor?: CabinetPaint;
  materialDefinition?: MaterialDefinition;
};
export const FACE_STYLES = {
  slab: 'Slab',
  shaker: 'Shaker',
  'beaded-shaker': 'Beaded Shaker',
  'vertical-slat': 'Slatted',
  'shaker-glass': 'Shaker + glass',
} as const;
/** Decorative geometry stays within the part envelope and never changes its definition. */
export function facePreviewGeometry(
  w: number,
  h: number,
  d: number,
  style: RoomElement['face'],
  segmented: boolean,
  grainAxis: GrainAxis = 'y',
) {
  const pieces: THREE.BufferGeometry[] = [];
  const photoBoxes: {
    width: number;
    height: number;
    depth: number;
    x: number;
    y: number;
    z: number;
    axis: GrainAxis;
    fixed: boolean;
  }[] = [];
  const box = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    axis: GrainAxis = grainAxis,
    fixed = false,
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
    geometry.setAttribute(
      'materialGrainAxis',
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.getAttribute('position').count).fill(
          ['x', 'y', 'z'].indexOf(axis),
        ),
        1,
      ),
    );
    geometry.setAttribute(
      'materialFixedGrain',
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.getAttribute('position').count).fill(
          fixed ? 1 : 0,
        ),
        1,
      ),
    );
    pieces.push(geometry);
    photoBoxes.push({width, height, depth, x, y, z, axis, fixed});
  };
  const frame = (
    width: number,
    height: number,
    rail: number,
    depth: number,
    z: number,
  ) => {
    for (const side of [-1, 1]) {
      box(rail, height, depth, (side * (width - rail)) / 2, 0, z, 'y', true);
      box(
        width - rail * 2,
        rail,
        depth,
        0,
        (side * (height - rail)) / 2,
        z,
        'x',
        true,
      );
    }
  };
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
    const rail = shakerFrameWidth(w, h);
    const bead = style === 'beaded-shaker';
    frame(w, h, bead ? rail - SHAKER_BEAD_WIDTH : rail, d, 0);
    if (bead) {
      const geometry = shakerBeadGeometry(
        rectangularBeadAperture(w, h, rail, segmented),
        d,
      );
      const count = geometry.getAttribute('position').count;
      for (const attribute of ['materialGrainAxis', 'materialFixedGrain'])
        geometry.setAttribute(
          attribute,
          new THREE.Float32BufferAttribute(
            Float32Array.from({length: count}, (_, i) =>
              attribute === 'materialFixedGrain'
                ? 1
                : Math.abs(geometry.getAttribute('position').getY(i)) >=
                    h / 2 - rail - 1e-6
                  ? 0
                  : 1,
            ),
            1,
          ),
        );
      pieces.push(geometry);
    }
    const p = shakerPanelDepth(d);
    box(
      w - rail * 2,
      h - rail * 2,
      p,
      0,
      0,
      -d / 2 + SHAKER_PANEL_SETBACK + p / 2,
    );
  } else box(w, h, d, 0, 0, 0);
  const result = mergeGeometries(pieces, true)!;
  result.groups.forEach((group) => {
    group.materialIndex = 0;
  });
  if (style === 'shaker-glass')
    result.groups[result.groups.length - 1].materialIndex = 1;
  if (!segmented && style !== 'beaded-shaker')
    result.userData.photoBoxes = photoBoxes;
  pieces.forEach((piece) => piece.dispose());
  return result;
}
