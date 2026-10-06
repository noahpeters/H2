import {
  isShakerFace,
  isBeadedFace,
  BEADED_FLAT_INSET,
  SHAKER_PANEL_SETBACK,
  SHAKER_BEAD_WIDTH,
  shakerPanelDepth,
  shakerBeadGeometry,
  offsetProfile,
} from '../faceProfiles';
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
  const flat = style === 'beaded-flat';
  const pane = flat
    ? offsetProfile(part.outline!, -BEADED_FLAT_INSET)
    : part.cabinetArch && isShakerFace(style)
      ? cabinetArchPane(part, shakerFrameWidth(part.width, part.height))
      : [];
  const bead = isBeadedFace(style) && pane.length >= 3;
  if (!flat && pane.length >= 3)
    shape.holes.push(
      archPath(
        [...(bead ? offsetProfile(pane, SHAKER_BEAD_WIDTH) : pane)].reverse(),
      ),
    );
  const frame =
    flat && pane.length >= 3
      ? undefined
      : new THREE.ExtrudeGeometry(shape, {
          depth: part.depth,
          bevelEnabled: false,
        });
  frame?.translate(-part.width / 2, -part.height / 2, -part.depth / 2);
  if (pane.length < 3) return frame!;
  const panel = new THREE.ExtrudeGeometry(archPath(pane), {
    depth: flat ? part.depth : shakerPanelDepth(part.depth),
    bevelEnabled: false,
  });
  panel.translate(
    -part.width / 2,
    -part.height / 2,
    -part.depth / 2 + (flat ? 0 : SHAKER_PANEL_SETBACK),
  );
  // An edge bead fills the entire perimeter band; no outer frame remains.
  const pieces: THREE.BufferGeometry[] = frame ? [frame, panel] : [panel];
  if (bead)
    pieces.push(
      shakerBeadGeometry(pane, part.depth)
        .toNonIndexed()
        .translate(-part.width / 2, -part.height / 2, 0),
    );
  const result = mergeGeometries(pieces, true)!;
  result.groups.forEach((group) => {
    group.materialIndex = 0;
  });
  if (style === 'shaker-glass') result.groups[1].materialIndex = 1;
  pieces.forEach((piece) => piece.dispose());
  return result;
}
