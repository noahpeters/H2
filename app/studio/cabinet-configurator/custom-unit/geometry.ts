import {resolvePartFaces} from '../combinationFaces';
import {drawerBoxSelection, internalCustomPart} from '../cabinetInternals';
import {archedFrontGeometry} from './archedFrontGeometry';
import {decorateBackPanel} from '../backPanels';
import type {FrameNeighbors} from '../continuousFaceFrames';
import {roomFrontParts} from './frontLayout';
import {migrateFrontStyles} from '../overlay';
import {expandDrawerArray} from './drawerArrays';
import {facePreviewGeometry, type CabinetAppearance} from './facePreview';
import {createCabinetMaterial, mapMaterialPart} from '../materialRendering';
import {doorPreview} from './doorGeometry';
import {addFrontHandle, type RoomHandleContext} from './frontHandles';
import {cabinetProfilePoint, edgeSetback} from './curves';
import {simpleArchProfile} from '../simpleArch';
import * as THREE from 'three';
import {type CustomUnitDefinition, type CabinetPart} from './model';

export {customUnitLayoutParts, type CustomUnitPart} from './layoutParts';
import {customUnitLayoutParts, type CustomUnitPart} from './layoutParts';

export function customUnitParts(
  definition: CustomUnitDefinition,
): CustomUnitPart[] {
  return customUnitLayoutParts(definition).flatMap((part) =>
    expandDrawerArray(part as CabinetPart, definition.reveal),
  );
}

export function customUnitGeometry(
  definition: CustomUnitDefinition,
  openings: Record<string, number> = {},
  appearance?: CabinetAppearance,
  handles?: RoomHandleContext,
  neighbors: FrameNeighbors = {},
): THREE.Group {
  definition = migrateFrontStyles(definition);
  const layout = customUnitLayoutParts(definition) as CabinetPart[];
  const parts = resolvePartFaces(
    roomFrontParts(
      {...definition, parts: layout},
      appearance?.overlay ?? 'full-overlay',
      {left: Boolean(neighbors.left), right: Boolean(neighbors.right)},
    ),
    appearance?.face,
  );
  const group = new THREE.Group();
  group.name = `custom-unit:${definition.id}`;
  for (const part of parts) {
    if (neighbors.left && part.faceFrame === 'left') continue;
    const followsProfile =
      part.profileMode !== 'independent' &&
      Boolean(definition.profile || definition.curve);
    const localEdges =
      followsProfile || part.profileMode === 'cabinet' ? undefined : part.edges;
    const localShape =
      followsProfile || part.profileMode === 'cabinet' ? undefined : part.shape;
    const material =
      appearance && part.kind !== 'rod'
        ? createCabinetMaterial(
            internalCustomPart(part)
              ? (appearance.interior ?? appearance)
              : appearance,
            1,
          )
        : new THREE.MeshStandardMaterial({
            color:
              part.kind === 'rod'
                ? 0x777777
                : part.kind === 'carcass'
                  ? 0xc7b294
                  : 0xd8c7a9,
          });
    const face =
      part.faceStyle ??
      (part.kind === 'drawer' && appearance?.face === 'shaker-glass'
        ? 'shaker'
        : appearance?.face === 'shaker-glass'
          ? 'shaker-glass'
          : undefined);
    let geometry: THREE.BufferGeometry;
    if (part.outline) {
      geometry = archedFrontGeometry(part, face);
    } else if (part.arch === 'simple' && part.kind === 'door') {
      const shape = new THREE.Shape();
      (
        part.outline ?? simpleArchProfile(part.width, part.height).points
      ).forEach((point, index) =>
        index
          ? shape.lineTo(point.x - part.width / 2, point.y - part.height / 2)
          : shape.moveTo(point.x - part.width / 2, point.y - part.height / 2),
      );
      shape.closePath();
      geometry = new THREE.ExtrudeGeometry(shape, {
        depth: part.depth,
        bevelEnabled: false,
      });
      geometry.translate(0, 0, -part.depth / 2);
    } else
      geometry =
        face &&
        (part.kind === 'door' || part.kind === 'drawer') &&
        part.door?.mechanism !== 'tambour'
          ? facePreviewGeometry(
              part.width,
              part.height,
              part.depth,
              face,
              Boolean(followsProfile || localEdges),
              part.kind === 'drawer' ? 'x' : 'y',
            )
          : new THREE.BoxGeometry(
              part.width,
              part.height,
              part.depth,
              followsProfile || localEdges ? 64 : 1,
              1,
              followsProfile || localShape?.startsWith('round-') ? 64 : 1,
            );
    mapMaterialPart(
      geometry,
      material,
      part,
      'in',
      part.kind === 'door'
        ? 'door'
        : part.kind === 'drawer'
          ? 'drawer'
          : part.kind === 'shelf'
            ? 'shelf'
            : 'board',
      part.materialApplication,
    );
    if (followsProfile || localEdges || localShape?.startsWith('round-')) {
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        let localX = positions.getX(index) + part.width / 2;
        if (localShape === 'round-left' || localShape === 'round-right') {
          const v = positions.getZ(index) / (part.depth / 2);
          const reach = Math.sqrt(Math.max(0, 1 - v * v));
          localX =
            localShape === 'round-right'
              ? localX * reach
              : part.width - (part.width - localX) * reach;
        }
        const x = localX + part.x;
        let z = positions.getZ(index) + part.z + part.depth / 2;
        if (localEdges) {
          const front = part.kind === 'door' || part.kind === 'drawer';
          const blend = front ? 1 : 1 - (z - part.z) / part.depth;
          z += edgeSetback(localX, part.width, localEdges) * blend;
        }
        const [curvedX, curvedZ] = cabinetProfilePoint(
          definition,
          {...part, id: part.id!},
          x,
          z,
        );
        positions.setX(index, curvedX - part.x - part.width / 2);
        positions.setZ(index, curvedZ - part.z - part.depth / 2);
      }
      geometry.computeVertexNormals();
    }
    const glass =
      face === 'shaker-glass' &&
      (part.kind === 'door' || part.kind === 'drawer') &&
      part.door?.mechanism !== 'tambour';
    const mesh = new THREE.Mesh(
      geometry,
      glass
        ? [
            material,
            new THREE.MeshStandardMaterial({
              color: 0xb6d2d7,
              transparent: true,
              opacity: 0.25,
              roughness: 0.12,
              depthWrite: false,
            }),
          ]
        : material,
    );
    mesh.name = part.faceFrame
      ? 'cabinet-face-frame'
      : `custom-unit-${part.kind}`;
    if (part.kind === 'panel')
      decorateBackPanel(
        mesh,
        part.backStyle,
        part.width,
        part.height,
        part.depth,
        1,
        -1,
      );
    mesh.userData.sectionId = part.sectionId;
    mesh.userData.partId = part.arrayId ?? part.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      part.x + part.width / 2 - definition.width / 2,
      part.y + part.height / 2,
      part.z + part.depth / 2 - definition.depth / 2,
    );
    // Attach before rigging so hardware shares every door/drawer transform.
    if (handles && part.door?.mechanism !== 'tambour')
      addFrontHandle(mesh, part, definition, handles);
    const object = doorPreview(
      mesh,
      {...part, id: part.id!},
      openings[part.arrayId ?? part.id!] ?? 0,
      definition.depth,
      appearance
        ? drawerBoxSelection(appearance, appearance.useMapleInternals)
        : undefined,
    );
    object.userData.partId = part.arrayId ?? part.id;
    object.userData.partRoot = true;
    if (handles && part.door?.mechanism === 'tambour')
      addFrontHandle(object, part, definition, handles);
    group.add(object);
  }
  return group;
}

/** Closed physical footprint, including projecting fronts and end shelves. */
export function customUnitBounds(definition: CustomUnitDefinition) {
  const group = customUnitGeometry(definition);
  const bounds = new THREE.Box3().setFromObject(group);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    }
  });
  if (bounds.isEmpty())
    return {
      width: definition.width,
      height: definition.height,
      depth: definition.depth,
    };
  const size = bounds.getSize(new THREE.Vector3());
  return {width: size.x, height: size.y, depth: size.z};
}
