import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  applyMaterialUVs,
  createMaterial,
  materialFromTemplate,
  waitForMaterialTextures,
} from './materialRendering';
import type {
  MaterialDefinition,
  MaterialApplication,
  LengthUnit,
  GrainAxis,
} from './materialDefinition';
import type {Room, Opening} from './model';
import {pointInRoom, roomSegments} from './roomOutline';
import {isPartition} from './wallDimensions';
import {disposeStudyObject} from './studyScene';

import {
  addPhotoLighting,
  DEFAULT_PHOTO_SETTINGS,
  visiblePhotoScene,
} from './photoLighting';
import type {PhotoSettings} from './photoLighting';
import type {WebGLPathTracer} from 'three-gpu-pathtracer';
import {deterministicPhotoTracer, disposePhotoTracer} from './photoTracer';
import {configurePhotoContacts, DEFAULT_PHOTO_CONTACTS} from './photoContacts';
import {denoisePhoto} from './photoDenoise';
import {waitForPhotoGpu} from './photoGpu';

import {
  architecturalPhotoCamera,
  DEFAULT_PHOTO_CAMERA,
  PHOTO_QUALITY,
} from './photoCamera';
import {finishPhoto} from './photoFinish';

const INCH = 0.0254;
/** Only box stock and extruded stock are rebuilt. Shaped/profiled stock is retained. */
export function easedGeometry(
  source: THREE.BufferGeometry,
  radius: number,
): THREE.BufferGeometry {
  const boxes = source.userData.photoBoxes as
    | {
        width: number;
        height: number;
        depth: number;
        x: number;
        y: number;
        z: number;
        axis: GrainAxis;
        fixed: boolean;
      }[]
    | undefined;
  if (boxes) {
    const pieces = boxes.map((box) => {
      const geometry = new RoundedBoxGeometry(
        box.width,
        box.height,
        box.depth,
        3,
        radius,
      );
      geometry.translate(box.x, box.y, box.z);
      const count = geometry.getAttribute('position').count;
      geometry.setAttribute(
        'materialGrainAxis',
        new THREE.Float32BufferAttribute(
          new Float32Array(count).fill(['x', 'y', 'z'].indexOf(box.axis)),
          1,
        ),
      );
      geometry.setAttribute(
        'materialFixedGrain',
        new THREE.Float32BufferAttribute(
          new Float32Array(count).fill(box.fixed ? 1 : 0),
          1,
        ),
      );
      return geometry;
    });
    const merged = mergeGeometries(pieces, true)!;
    merged.groups.forEach((group, i) => {
      group.materialIndex = source.groups[i]?.materialIndex ?? 0;
    });
    pieces.forEach((piece) => piece.dispose());
    return merged;
  }
  if (source instanceof THREE.BoxGeometry) {
    // A BoxGeometry may have been shaped by a profile: never replace its silhouette.
    const bounds = new THREE.Box3().setFromBufferAttribute(
      source.getAttribute('position') as THREE.BufferAttribute,
    );
    const positions = source.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      const planes = ['x', 'y', 'z'].filter(
        (axis) =>
          Math.min(
            Math.abs(p[axis as 'x'] - bounds.min[axis as 'x']),
            Math.abs(p[axis as 'x'] - bounds.max[axis as 'x']),
          ) < 1e-7,
      );
      const normal = new THREE.Vector3().fromBufferAttribute(
        source.getAttribute('normal'),
        i,
      );
      const axis =
        Math.abs(normal.x) > 0.9 ? 'x' : Math.abs(normal.y) > 0.9 ? 'y' : 'z';
      if (!planes.includes(axis)) return source.clone();
    }
    const size = bounds.getSize(new THREE.Vector3());
    return new RoundedBoxGeometry(size.x, size.y, size.z, 3, radius).translate(
      ...bounds.getCenter(new THREE.Vector3()).toArray(),
    );
  }
  if (
    source instanceof THREE.ExtrudeGeometry &&
    !source.parameters.options.extrudePath
  ) {
    const {shapes, options} = source.parameters;
    const depth = options.depth ?? 1;
    const r = Math.min(radius, depth / 4);
    // Inset the caps; the central contour stays at the original perimeter.
    return new THREE.ExtrudeGeometry(shapes, {
      ...options,
      depth: depth - 2 * r,
      bevelEnabled: true,
      bevelSize: r,
      bevelThickness: r,
      bevelOffset: -r,
      bevelSegments: 3,
    }).translate(0, 0, r);
  }
  return source.clone();
}

function softenWallIntersections(scene: THREE.Scene) {
  const walls: THREE.Group[] = [];
  scene.traverse((object) => {
    if (object.userData.photoWall) walls.push(object as THREE.Group);
  });
  for (const wall of walls) {
    const {segment, room, openings} = wall.userData.photoWall as {
      segment: ReturnType<typeof roomSegments>[number];
      room: Room;
      openings: Opening[];
    };
    if (isPartition(room, segment.id)) continue;
    const previous = walls.find((candidate) => {
      const s = candidate.userData.photoWall.segment;
      return s.b.x === segment.a.x && s.b.z === segment.a.z;
    });
    if (!previous || !wall.visible || !previous.visible) continue;
    if (isPartition(room, previous.userData.photoWall.segment.id)) continue;
    const before = previous.userData.photoWall.segment as typeof segment;
    // Interior convex corners only; preserve recess silhouettes and opening voids.
    if (before.nx * segment.nz - before.nz * segment.nx <= 0) continue;
    if (
      openings.some(
        (o) =>
          (o.wall === segment.id && o.offset < 2) ||
          (o.wall === before.id && o.offset + o.width > before.length - 2),
      )
    )
      continue;
    const currentMesh = wall.children.find((o) => o instanceof THREE.Mesh) as
      | THREE.Mesh
      | undefined;
    const previousMesh = previous.children.find(
      (o) => o instanceof THREE.Mesh,
    ) as THREE.Mesh | undefined;
    if (!currentMesh || !previousMesh) continue;
    const radius = 0.025; // 25mm plaster corner fillet, independent of 1mm stock easing.
    // Perimeter wall coordinates now describe the finished interior faces.
    const x = (segment.a.x - room.width / 2) * INCH;
    const z = (segment.a.z - room.depth / 2) * INCH;
    const a = new THREE.Vector2(
      x + before.nx * radius,
      -(z + before.nz * radius),
    );
    const b = new THREE.Vector2(
      x + segment.nx * radius,
      -(z + segment.nz * radius),
    );
    const shape = new THREE.Shape()
      .moveTo(x, -z)
      .lineTo(a.x, a.y)
      .quadraticCurveTo(x, -z, b.x, b.y)
      .closePath();
    const material = materialFromTemplate(
      currentMesh.material as THREE.Material,
    ) as THREE.MeshStandardMaterial;
    const current = currentMesh.material as THREE.MeshStandardMaterial;
    material.normalScale.copy(current.normalScale);
    material.aoMapIntensity = current.aoMapIntensity;
    const other = previousMesh.material as THREE.MeshStandardMaterial;
    material.opacity = Math.min(
      (currentMesh.material as THREE.MeshStandardMaterial).opacity,
      other.opacity,
    );
    material.transparent = material.opacity < 1;
    material.depthWrite = !material.transparent;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: room.height * INCH,
      bevelEnabled: false,
      curveSegments: 16,
    });
    const definition = material.userData
      .materialDefinition as MaterialDefinition;
    applyMaterialUVs(geometry, definition, {grainAxis: 'z'}, 'm');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'photo-wall-fillet';
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/** Capture synchronously before any await: later edits, motion and navigation are independent. */
export function createPhotoSnapshot(
  source: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  target?: THREE.Vector3,
) {
  const scene = source.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  scene.traverse((part) => {
    if (part instanceof THREE.Line || part instanceof THREE.BoxHelper) {
      part.visible = false;
      return;
    }
    if (!(part instanceof THREE.Mesh)) return;
    const original: THREE.Material[] = Array.isArray(part.material)
      ? part.material
      : [part.material];
    const role = part.userData.photoSurface;
    const application = part.geometry.userData.materialApplication as
      | (MaterialApplication & {unit?: LengthUnit})
      | undefined;
    const unit = application?.unit ?? 'm';
    const radius =
      (role === 'countertop' ? 0.002 : 0.001) / (unit === 'in' ? INCH : 1);
    const stock = original.some((m) => m.userData.materialDefinition);
    const geometry =
      stock && role !== 'wall' && role !== 'floor'
        ? easedGeometry(part.geometry, radius)
        : part.geometry.clone();
    geometry.userData = structuredClone(part.geometry.userData);
    part.geometry = geometry;
    const cloned = original.map((m) => {
      let material = materials.get(m);
      if (!material) {
        const definition = m.userData.materialDefinition as
          | MaterialDefinition
          | undefined;
        material =
          definition && m instanceof THREE.MeshStandardMaterial
            ? createMaterial(structuredClone(definition), m.roughness)
            : m.clone();
        material.userData.flatGrain = m.userData.flatGrain;
        materials.set(m, material);
      }
      material.transparent = m.transparent;
      material.opacity = m.opacity;
      material.depthWrite = m.depthWrite;
      material.side = m.side;
      if (
        material instanceof THREE.MeshStandardMaterial &&
        m instanceof THREE.MeshStandardMaterial
      ) {
        material.normalScale.copy(m.normalScale);
        material.aoMapIntensity = m.aoMapIntensity;
      }
      const definition = material.userData.materialDefinition as
        | MaterialDefinition
        | undefined;
      if (definition)
        applyMaterialUVs(
          geometry,
          definition,
          application ?? {grainAxis: 'y'},
          unit,
        );
      return material;
    });
    part.material = Array.isArray(part.material) ? cloned : cloned[0];
  });
  // Classify the exact capture position against the room outline, including recesses.
  // Only cloned photo resources change; interactive materials stay translucent.
  let room: Room | undefined;
  scene.traverse((part) => {
    if (part.userData.photoWall) room = part.userData.photoWall.room as Room;
  });
  if (room) {
    const position = camera.getWorldPosition(new THREE.Vector3());
    const inside = pointInRoom(
      room,
      position.x / INCH + room.width / 2,
      position.z / INCH + room.depth / 2,
    );
    scene.traverse((part) => {
      if (part.userData.cutawayRoomWall === true) part.visible = inside;
      if (
        !(part instanceof THREE.Mesh) ||
        part.userData.photoSurface !== 'wall'
      )
        return;
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material]) {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
    });
  }
  softenWallIntersections(scene);
  return {scene, camera: camera.clone(), target: target?.clone()};
}

/** Separate GPU/context lifetime, supersampled PNG. No interactive renderer settings change. */
export async function renderPhoto(
  snapshot: ReturnType<typeof createPhotoSnapshot>,
  host?: HTMLElement,
  settings: PhotoSettings = DEFAULT_PHOTO_SETTINGS,
  options: {signal?: AbortSignal; onProgress?: (progress: number) => void} = {},
): Promise<Blob> {
  let renderer: THREE.WebGLRenderer | undefined;
  let flash: HTMLDivElement | undefined;
  let tracer: WebGLPathTracer | undefined;
  let linearOutput: THREE.WebGLRenderTarget | undefined;
  try {
    // Copy options before yielding so later control edits cannot change this capture.
    settings = structuredClone(settings);
    await waitForMaterialTextures(snapshot.scene);
    addPhotoLighting(snapshot.scene, settings);
    const {WebGLPathTracer} = await import('three-gpu-pathtracer');
    options.signal?.throwIfAborted();
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (renderer.debug)
      renderer.debug.onShaderError = () => {
        throw new Error(
          'Photo graphics shader could not compile on this device.',
        );
      };
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = settings.toneMapping;
    renderer.toneMappingExposure = settings.exposure;
    if (!renderer.extensions.has('EXT_color_buffer_float')) {
      throw new Error(
        'Photo lighting requires WebGL2 floating-point rendering on this device.',
      );
    }
    const cameraSettings = settings.camera ?? DEFAULT_PHOTO_CAMERA;
    const camera = architecturalPhotoCamera(
      snapshot.camera,
      cameraSettings,
      snapshot.target,
    );
    const quality = PHOTO_QUALITY[cameraSettings.quality];
    const samples = settings.camera ? quality.samples : settings.samples;
    const aspect = camera.aspect;
    const width =
      aspect >= 1
        ? settings.maxDimension
        : Math.round(settings.maxDimension * aspect);
    const height = Math.round(width / aspect);
    const renderWidth = Math.round(width * quality.scale);
    const renderHeight = Math.round(height * quality.scale);
    if (
      Math.max(renderWidth, renderHeight) >
      Math.min(
        renderer.capabilities.maxTextureSize,
        renderer
          .getContext()
          .getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE),
      )
    )
      throw new Error(
        'Photo quality exceeds this device’s image limit. Choose a smaller image or Quick quality.',
      );
    renderer.setPixelRatio(1);
    renderer.setSize(renderWidth, renderHeight, false);
    renderer.domElement.className = 'cc-photo-canvas';
    renderer.domElement.setAttribute('aria-label', 'Photo render');
    host?.append(renderer.domElement);
    tracer = new WebGLPathTracer(renderer);
    // Fixed sample sequence and count, independent of elapsed time and frame scheduling.
    deterministicPhotoTracer(tracer);
    configurePhotoContacts(tracer, settings.contacts ?? DEFAULT_PHOTO_CONTACTS);
    tracer.bounces = settings.bounces;
    tracer.filterGlossyFactor = 0.5;
    tracer.multipleImportanceSampling = true;
    tracer.tiles.set(3, 3);
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 1;
    tracer.rasterizeScene = false;
    const traceScene = visiblePhotoScene(snapshot.scene);
    tracer.setScene(traceScene, camera);
    tracer.reset();
    const started = performance.now();
    // Work grows with pixel area and sample count. Give detailed photos time to
    // converge instead of silently lowering their resolution or sample budget.
    const timeLimit = Math.min(
      2700000,
      Math.max(
        540000,
        540000 *
          ((settings.maxDimension * quality.scale) / 1600) ** 2 *
          (samples / 256),
      ),
    );
    while (tracer.samples < samples) {
      const frameStart = performance.now();
      let tilesSubmitted = 0;
      do {
        options.signal?.throwIfAborted();
        if (renderer.getContext().isContextLost())
          throw new Error('Photo graphics context was lost. Please retry.');
        if (performance.now() - started > timeLimit)
          throw new Error(
            `Photo rendering timed out after ${Math.round(timeLimit / 60000)} minutes (${Math.floor((tracer.samples / samples) * 100)}% complete). Try Quick quality or a smaller image, then take the photo again.`,
          );
        const previousSamples = tracer.samples;
        tracer.renderSample();
        tilesSubmitted++;
        // Shader compilation is asynchronous: yield instead of spinning at zero progress.
        if (tracer.samples === previousSamples) break;
      } while (
        tracer.samples < samples &&
        tilesSubmitted < 3 &&
        performance.now() - frameStart < 12
      );
      options.onProgress?.(Math.min(1, tracer.samples / samples));
      await waitForPhotoGpu(renderer.getContext(), options.signal);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    options.signal?.throwIfAborted();
    let radiance = tracer.target.texture;
    if (settings.denoise) {
      linearOutput = new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
        type: THREE.HalfFloatType,
      });
      await denoisePhoto(
        renderer,
        traceScene,
        camera,
        radiance,
        renderWidth,
        renderHeight,
        options.signal,
        linearOutput,
      );
      radiance = linearOutput.texture;
    }
    await finishPhoto(
      renderer,
      traceScene,
      camera,
      radiance,
      width,
      height,
      cameraSettings,
      settings.exposure,
      options.signal,
    );
    // Present the enhanced pass in the existing viewport before capturing it.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      renderer!.domElement.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('Photo capture failed.')),
        'image/png',
      ),
    );
    if (host?.isConnected) {
      flash = document.createElement('div');
      flash.className = 'cc-photo-flash';
      flash.setAttribute('aria-hidden', 'true');
      host.append(flash);
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
    return blob;
  } finally {
    try {
      linearOutput?.dispose();
      if (tracer) disposePhotoTracer(tracer);
    } finally {
      disposeStudyObject(snapshot.scene);
      snapshot.scene.traverse((object) => {
        if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
      });
      flash?.remove();
      renderer?.domElement.remove();
      renderer?.dispose();
      renderer?.forceContextLoss();
    }
  }
}
