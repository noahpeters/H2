import * as THREE from 'three';
import {
  layoutCustomUnit,
  type CustomUnitDefinition,
  type RegionLayout,
} from './model';

export type CustomUnitPart = {
  kind: 'carcass' | 'divider' | 'door' | 'drawer' | 'shelf' | 'rod';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  sectionId?: string;
};

/** Catalog-independent physical takeoff generated only from the semantic definition. */
export function customUnitParts(
  definition: CustomUnitDefinition,
): CustomUnitPart[] {
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
  return parts;
}

export function customUnitGeometry(
  definition: CustomUnitDefinition,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `custom-unit:${definition.id}`;
  for (const part of customUnitParts(definition)) {
    const material = new THREE.MeshStandardMaterial({
      color:
        part.kind === 'rod'
          ? 0x777777
          : part.kind === 'carcass'
            ? 0xc7b294
            : 0xd8c7a9,
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(part.width, part.height, part.depth),
      material,
    );
    mesh.name = `custom-unit-${part.kind}`;
    mesh.userData.sectionId = part.sectionId;
    mesh.position.set(
      part.x + part.width / 2 - definition.width / 2,
      part.y + part.height / 2,
      part.z + part.depth / 2 - definition.depth / 2,
    );
    group.add(mesh);
  }
  return group;
}
