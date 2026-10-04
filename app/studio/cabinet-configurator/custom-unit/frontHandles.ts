import * as THREE from 'three';
import type {RoomElement} from '../model';
import {cabinetProfilePoint, edgeSetback} from './curves';
import type {CabinetPart, CustomUnitDefinition} from './model';
import {doorHandlePosition, type HardwareFaceStyle} from '../hardwarePlacement';

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
  const width = horizontal ? Math.min(6, part.width * 0.5) : 0.35;
  const height = horizontal ? 0.35 : Math.min(4, part.height * 0.5);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 1),
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
  if (tambour) {
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
  const placement = doorHandlePosition({
    width: part.width,
    height: part.height,
    absoluteTop: context.bodyElevation + part.y + part.height,
    faceStyle,
    hingeSide: side,
  });
  const x = horizontal ? 0 : placement.x;
  let y = 0;
  if (mechanism === 'lift-up')
    y = -part.height / 2 + Math.min(4, part.height / 2);
  else if (mechanism === 'pull-down')
    y = part.height / 2 - Math.min(4, part.height / 2);
  else if (part.kind === 'door') y = placement.y;
  const localX = x + part.width / 2;
  const followsProfile =
    part.profileMode !== 'independent' &&
    Boolean(definition.profile || definition.curve);
  const edges =
    followsProfile || part.profileMode === 'cabinet' ? undefined : part.edges;
  const surface = (sample: number) =>
    cabinetProfilePoint(
      definition,
      part,
      part.x + sample,
      part.z + (edges ? edgeSetback(sample, part.width, edges) : 0),
    );
  const [surfaceX, surfaceZ] = surface(localX);
  const [beforeX, beforeZ] = surface(localX - 0.01);
  const [afterX, afterZ] = surface(localX + 0.01);
  const angle = Math.atan2(afterZ - beforeZ, afterX - beforeX);
  handle.rotation.y = -angle;
  handle.position.set(
    surfaceX - part.x - part.width / 2 + Math.sin(angle) * 0.7,
    y,
    surfaceZ - part.z - part.depth / 2 - Math.cos(angle) * 0.7,
  );
  target.add(handle);
}
