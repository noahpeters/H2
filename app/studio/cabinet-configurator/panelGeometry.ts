import * as THREE from 'three';
import type {RoomElement} from './model';
import {createCabinetMaterial, mapMaterialPart} from './materialRendering';

const INCH = 0.0254;

/** A finish-aware solid slab; panels have no cabinet fronts or hardware. */
export function panelGeometry(item: RoomElement) {
  const geometry = new THREE.BoxGeometry(
    item.width * INCH,
    item.height * INCH,
    item.depth * INCH,
  );
  const material = createCabinetMaterial(item, 0.48);
  mapMaterialPart(
    geometry,
    material,
    {
      width: item.width * INCH,
      height: item.height * INCH,
      depth: item.depth * INCH,
    },
    'm',
    'end',
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'room-panel';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
