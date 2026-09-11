import {facePreviewGeometry, type CabinetAppearance} from './facePreview';
import {cabinetColor} from '../materials';
import {doorPreview} from './doorGeometry';
import {cabinetProfilePoint, edgeSetback} from './curves';
import * as THREE from 'three';
import {
  layoutCustomUnit,
  type CustomUnitDefinition,
  type RegionLayout,
  type CabinetPart,
} from './model';

export type CustomUnitPart = Omit<CabinetPart, 'id'> & {id?: string};

/** Catalog-independent physical takeoff generated only from the semantic definition. */
export function customUnitParts(
  definition: CustomUnitDefinition,
): CustomUnitPart[] {
  if (definition.parts) return definition.parts;
  const t = 0.75,
    r = definition.reveal,
    parts: CustomUnitPart[] = [
      {
        kind: 'carcass',
        x: 0,
        y: 0,
        z: 0,
        width: t,
        height: definition.height,
        depth: definition.depth,
      },
      {
        kind: 'carcass',
        x: definition.width - t,
        y: 0,
        z: 0,
        width: t,
        height: definition.height,
        depth: definition.depth,
      },
      {
        kind: 'carcass',
        x: 0,
        y: 0,
        z: 0,
        width: definition.width,
        height: t,
        depth: definition.depth,
      },
      {
        kind: 'carcass',
        x: 0,
        y: definition.height - t,
        z: 0,
        width: definition.width,
        height: t,
        depth: definition.depth,
      },
    ];
  const addDivisions = (
    node: CustomUnitDefinition['root'],
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    if (node.type === 'section') return;
    const total = node.weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = node.axis === 'vertical' ? x : y;
    node.children.forEach((child, index) => {
      const share = node.weights[index] / total;
      const childWidth = node.axis === 'vertical' ? width * share : width;
      const childHeight = node.axis === 'horizontal' ? height * share : height;
      if (index)
        parts.push(
          node.axis === 'vertical'
            ? {
                kind: 'divider',
                x: cursor - t / 2,
                y,
                z: 0,
                width: t,
                height,
                depth: definition.depth,
              }
            : {
                kind: 'divider',
                x,
                y: cursor - t / 2,
                z: 0,
                width,
                height: t,
                depth: definition.depth,
              },
        );
      addDivisions(
        child,
        node.axis === 'vertical' ? cursor : x,
        node.axis === 'horizontal' ? cursor : y,
        childWidth,
        childHeight,
      );
      cursor += node.axis === 'vertical' ? childWidth : childHeight;
    });
  };
  addDivisions(definition.root, 0, 0, definition.width, definition.height);
  const addFront = (
    region: RegionLayout,
    kind: 'door' | 'drawer',
    y: number,
    height: number,
    x = region.x,
    width = region.width,
  ) =>
    parts.push({
      kind,
      sectionId: region.id,
      x: x + r,
      y: y + r,
      z: -0.75,
      width: width - r * 2,
      height: height - r * 2,
      depth: 0.75,
    });
  for (const region of layoutCustomUnit(definition).regions) {
    const {sectionType, properties = {}} = region.section;
    if (sectionType === 'doors') {
      const count = properties.doorCount ?? 2;
      for (let i = 0; i < count; i++)
        addFront(
          region,
          'door',
          region.y,
          region.height,
          region.x + (region.width * i) / count,
          region.width / count,
        );
    }
    if (sectionType === 'drawers' || sectionType === 'drawer-stack') {
      const count =
        properties.drawerCount ?? (sectionType === 'drawer-stack' ? 3 : 1);
      for (let i = 0; i < count; i++)
        addFront(
          region,
          'drawer',
          region.y + (region.height * i) / count,
          region.height / count,
        );
    }
    if (sectionType === 'shelves' || sectionType === 'open-lower') {
      const count = properties.shelfCount ?? 2;
      for (let i = 1; i <= count; i++)
        parts.push({
          kind: 'shelf',
          sectionId: region.id,
          x: region.x + t,
          y: region.y + (region.height * i) / (count + 1),
          z: 0,
          width: region.width - t * 2,
          height: t,
          depth: definition.depth - t,
        });
    }
    if (sectionType === 'hanging')
      parts.push({
        kind: 'rod',
        sectionId: region.id,
        x: region.x + 1,
        y:
          region.y +
          Math.min(
            region.height - 2,
            properties.rodHeight ?? region.height - 8,
          ),
        z: definition.depth / 2,
        width: region.width - 2,
        height: 0.75,
        depth: 0.75,
      });
  }
  return parts.map((part, index) => ({
    ...part,
    id: `${part.sectionId ?? definition.id}-${part.kind}-${index}`,
  }));
}

export function customUnitGeometry(
  definition: CustomUnitDefinition,
  openings: Record<string, number> = {},
  appearance?: CabinetAppearance,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `custom-unit:${definition.id}`;
  for (const part of customUnitParts(definition)) {
    const followsProfile =
      part.profileMode !== 'independent' &&
      Boolean(definition.profile || definition.curve);
    const localEdges =
      followsProfile || part.profileMode === 'cabinet' ? undefined : part.edges;
    const localShape =
      followsProfile || part.profileMode === 'cabinet' ? undefined : part.shape;
    const material = new THREE.MeshStandardMaterial({
      color:
        part.kind === 'rod'
          ? 0x777777
          : appearance
            ? cabinetColor(appearance)
            : part.kind === 'carcass'
              ? 0xc7b294
              : 0xd8c7a9,
    });
    const face =
      part.faceStyle ??
      (part.kind === 'drawer' && appearance?.face === 'shaker-glass'
        ? 'shaker'
        : appearance?.face);
    const geometry =
      face &&
      (part.kind === 'door' || part.kind === 'drawer') &&
      part.door?.mechanism !== 'tambour'
        ? facePreviewGeometry(
            part.width,
            part.height,
            part.depth,
            face,
            Boolean(followsProfile || localEdges),
          )
        : new THREE.BoxGeometry(
            part.width,
            part.height,
            part.depth,
            followsProfile || localEdges ? 64 : 1,
            1,
            followsProfile || localShape?.startsWith('round-') ? 64 : 1,
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
    mesh.name = `custom-unit-${part.kind}`;
    mesh.userData.sectionId = part.sectionId;
    mesh.userData.partId = part.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      part.x + part.width / 2 - definition.width / 2,
      part.y + part.height / 2,
      part.z + part.depth / 2 - definition.depth / 2,
    );
    const object = doorPreview(
      mesh,
      {...part, id: part.id!},
      openings[part.id!] ?? 0,
      definition.depth,
    );
    object.userData.partId = part.id;
    object.userData.partRoot = true;
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
