import * as THREE from 'three';
import type {RoomElement} from '../model';
import {mountedPull} from '../pullGeometry';
import type {CabinetPart, CustomUnitDefinition} from './model';
import {frontPullLayout, type HardwareFaceStyle} from '../hardwarePlacement';

export type RoomHandleContext = Pick<
  RoomElement,
  'kind' | 'face' | 'hinge' | 'tallConfiguration'
> & {bodyElevation: number};

/** Render-only hardware, in the definition's inch coordinates. */
export function addFrontHandle(
  front: THREE.Object3D,
  part: CabinetPart,
  definition: CustomUnitDefinition,
  context: RoomHandleContext,
) {
  if (part.kind !== 'door' && part.kind !== 'drawer') return;
  const mechanism = part.door?.mechanism;
  const tambour = mechanism === 'tambour';
  const horizontal =
    part.kind === 'drawer' ||
    mechanism === 'lift-up' ||
    mechanism === 'pull-down' ||
    (tambour && part.door?.direction !== 'horizontal');
  // A tambour pull belongs to the leading slat so it follows the roll-up rig.
  const target = tambour ? front.children[0] : front;
  if (!target) return;
  if (tambour) {
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(
        horizontal ? Math.min(6, part.width * 0.5) : 0.35,
        horizontal ? 0.35 : Math.min(4, part.height * 0.5),
        1,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xb9c0c4,
        metalness: 0.65,
        roughness: 0.28,
      }),
    );
    handle.name = 'custom-unit-handle';
    handle.userData.partId = front.userData.partId;
    handle.userData.sectionId = part.sectionId;
    handle.castShadow = true;
    handle.position.z = -part.depth / 2 - 0.7;
    target.add(handle);
    return;
  }
  const side =
    part.door?.side ??
    (Math.abs(part.x + part.width / 2 - definition.width / 2) < 0.01
      ? (context.hinge ?? 'left')
      : part.x + part.width / 2 > definition.width / 2
        ? 'right'
        : 'left');
  const faceStyle = (part.faceStyle ?? context.face) as HardwareFaceStyle;
  const placement = frontPullLayout({
    width: part.width,
    height: part.height,
    absoluteTop: context.bodyElevation + part.y + part.height,
    faceStyle,
    hingeSide: side,
    horizontal,
    drawer: part.kind === 'drawer',
    edge:
      mechanism === 'lift-up'
        ? 'bottom'
        : mechanism === 'pull-down' || part.kind === 'drawer'
          ? 'top'
          : undefined,
  });
  const handle = mountedPull(front, placement, -1);
  if (!handle) return;
  handle.name = 'custom-unit-handle';
  handle.userData.partId = front.userData.partId;
  handle.userData.sectionId = part.sectionId;
  target.add(handle);
}
