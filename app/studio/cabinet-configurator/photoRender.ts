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
import {
  deterministicPhotoTracer,
  disposePhotoTracer,
  preparePhotoSampler,
} from './photoTracer';
import {configurePhotoContacts, DEFAULT_PHOTO_CONTACTS} from './photoContacts';
import {denoisePhoto} from './photoDenoise';
import {waitForPhotoGpu} from './photoGpu';
import {PhotoRadianceHistory} from './photoHistory';
import {
  upgradePhotoTextures,
  photoTextureBytes,
  budgetedPhotoTextureResolution,
  PHOTO_TEXTURE_BUDGET,
} from './photoTextures';
import {PHOTO_PASSES, configurePhotoTransport} from './photoTransport';
import {
  photoManifest,
  readPhotoRadiance,
  photoFloatBytes,
  photoDiagnosticZip,
} from './photoDiagnostics';

import {
  architecturalPhotoCamera,
  DEFAULT_PHOTO_CAMERA,
  PHOTO_QUALITY,
} from './photoCamera';
import {finishPhoto} from './photoFinish';
import {
  PhotoConvergence,
  PhotoConvergenceProbe,
  type PhotoConvergenceCheck,
} from './photoConvergence';

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
    // Constructor parameters retain the original shape coordinates, whereas
    // cabinet stock is translated after extrusion to its local mesh origin.
    // Rebuilding from parameters alone would detach it from the assembly.
    const original = new THREE.ExtrudeGeometry(shapes, options);
    const before = original.getAttribute('position');
    const after = source.getAttribute('position');
    const offset = new THREE.Vector3();
    let translated = before.count === after.count;
    if (translated) {
      offset.subVectors(
        new THREE.Vector3().fromBufferAttribute(after, 0),
        new THREE.Vector3().fromBufferAttribute(before, 0),
      );
      const bounds = new THREE.Box3().setFromBufferAttribute(
        before as THREE.BufferAttribute,
      );
      const tolerance =
        Math.max(1, bounds.getSize(new THREE.Vector3()).length()) * 1e-6;
      const delta = new THREE.Vector3();
      const point = new THREE.Vector3();
      for (let i = 0; i < before.count; i++) {
        delta
          .fromBufferAttribute(after, i)
          .sub(point.fromBufferAttribute(before, i));
        if (delta.distanceTo(offset) > tolerance) {
          translated = false;
          break;
        }
      }
    }
    original.dispose();
    // Rotated, scaled or independently reshaped stock retains its captured
    // geometry rather than being reconstructed from stale shape parameters.
    if (!translated) return source.clone();
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
    }).translate(offset.x, offset.y, offset.z + r);
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
      part.geometry = part.geometry.clone();
      part.material = Array.isArray(part.material)
        ? (part.material as THREE.Material[]).map((m) => m.clone())
        : part.material.clone();
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

/** Clone a prepared capture without easing edges or classifying walls again. */
export function clonePhotoSnapshot(
  snapshot: ReturnType<typeof createPhotoSnapshot>,
) {
  const scene = snapshot.scene.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  scene.traverse((part) => {
    if (!(part instanceof THREE.Mesh || part instanceof THREE.Line)) return;
    part.geometry = part.geometry.clone();
    const copy = (original: THREE.Material) => {
      let material = materials.get(original);
      if (!material) {
        material = original.clone();
        materials.set(original, material);
      }
      return material;
    };
    part.material = Array.isArray(part.material)
      ? (part.material as THREE.Material[]).map(copy)
      : copy(part.material);
  });
  return {
    scene,
    camera: snapshot.camera.clone(),
    target: snapshot.target?.clone(),
  };
}

/** Separate GPU/context lifetime, supersampled PNG. No interactive renderer settings change. */
export async function renderPhoto(
  snapshot: ReturnType<typeof createPhotoSnapshot>,
  host?: HTMLElement,
  settings: PhotoSettings = DEFAULT_PHOTO_SETTINGS,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    onComplete?: (result: {
      samples: number;
      elapsedMs: number;
      converged: boolean;
      checks: PhotoConvergenceCheck[];
    }) => void;
    onDiagnostics?: (zip: Blob) => void;
  } = {},
): Promise<Blob> {
  let renderer: THREE.WebGLRenderer | undefined;
  let flash: HTMLDivElement | undefined;
  let tracer: WebGLPathTracer | undefined;
  let linearOutput: THREE.WebGLRenderTarget | undefined;
  let probe: PhotoConvergenceProbe | undefined;
  let history: PhotoRadianceHistory | undefined;
  try {
    // Copy options before yielding so later control edits cannot change this capture.
    settings = structuredClone(settings);
    if (settings.reference) {
      settings.camera = {
        ...(settings.camera ?? DEFAULT_PHOTO_CAMERA),
        quality: 'ultra',
        autoExposure: false,
        autoWhiteBalance: false,
        temperature: 6500,
      };
      settings.denoise = false;
      settings.glossyFilter = 0;
    }
    const sourceResolution =
      settings.textureResolution ??
      (settings.maxDimension >= 1200 ? 2048 : 1024);
    upgradePhotoTextures(snapshot.scene, sourceResolution);
    await waitForMaterialTextures(snapshot.scene);
    if (settings.sunSky?.enabled) {
      let room: Room | undefined;
      snapshot.scene.traverse((part) => {
        if (part.userData.photoWall) room = part.userData.photoWall.room;
      });
      const position = snapshot.camera.getWorldPosition(new THREE.Vector3());
      if (
        !room ||
        !pointInRoom(
          room,
          position.x / INCH + room.width / 2,
          position.z / INCH + room.depth / 2,
        ) ||
        position.y < 0 ||
        position.y > room.height * INCH
      )
        throw new Error(
          'Move the camera inside the room before using directional daylight.',
        );
    }
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
    const adaptive = !!settings.camera && cameraSettings.quality !== 'ultra';
    const minimum =
      cameraSettings.quality === 'fine'
        ? 64
        : cameraSettings.quality === 'quick'
          ? 16
          : 32;
    const convergence = new PhotoConvergence(
      minimum / 2,
      minimum,
      cameraSettings.quality === 'fine'
        ? 0.01
        : cameraSettings.quality === 'quick'
          ? 0.025
          : 0.015,
      cameraSettings.autoExposure ? undefined : settings.exposure,
      2 ** cameraSettings.exposureCompensation,
    );
    let converged = false;
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
    // Deterministic sample sequence; adaptive stopping depends on image clarity, not elapsed time.
    deterministicPhotoTracer(tracer);
    const selectPass = settings.diagnostics
      ? configurePhotoTransport(tracer)
      : undefined;
    configurePhotoContacts(tracer, settings.contacts ?? DEFAULT_PHOTO_CONTACTS);
    tracer.bounces = settings.bounces;
    tracer.filterGlossyFactor = settings.glossyFilter ?? 0.1;
    tracer.multipleImportanceSampling = true;
    tracer.tiles.set(3, 3);
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 1;
    tracer.rasterizeScene = false;
    const traceScene = visiblePhotoScene(snapshot.scene);
    const textureResolution =
      settings.textureResolution ??
      budgetedPhotoTextureResolution(
        traceScene,
        sourceResolution,
        renderer.capabilities.maxTextureSize,
      );
    tracer.textureSize.set(textureResolution, textureResolution);
    if (
      textureResolution > renderer.capabilities.maxTextureSize ||
      photoTextureBytes(traceScene, textureResolution) > PHOTO_TEXTURE_BUDGET
    )
      throw new Error(
        'This surface texture detail exceeds the photo memory budget. Choose a smaller texture detail setting.',
      );
    tracer.setScene(traceScene, camera);
    preparePhotoSampler(tracer);
    tracer.reset();
    const manifest = settings.diagnostics
      ? await photoManifest(traceScene, camera, settings, options.signal)
      : undefined;
    const exportScale = Math.min(1, 512 / Math.max(renderWidth, renderHeight));
    const exportWidth = Math.round(renderWidth * exportScale),
      exportHeight = Math.round(renderHeight * exportScale);
    const diagnosticFiles: Record<string, Uint8Array> = {};
    const started = performance.now();
    if (adaptive) probe = new PhotoConvergenceProbe(aspect, width, height);
    if (settings.denoise)
      history = new PhotoRadianceHistory(renderWidth, renderHeight);
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
        (!adaptive || !convergence.shouldCheck(tracer.samples)) &&
        performance.now() - frameStart < 12
      );
      options.onProgress?.(Math.min(0.9, (tracer.samples / samples) * 0.9));
      await waitForPhotoGpu(renderer.getContext(), options.signal);
      if (probe && convergence.shouldCheck(tracer.samples)) {
        const pixels = await probe.read(
          renderer,
          tracer.target.texture,
          options.signal,
        );
        converged = convergence.observe(pixels, tracer.samples, probe.width);
        if (converged) break;
      }
      // Keep a preceding complete pass, never a partially submitted tile or final mean.
      if (
        history &&
        Number.isInteger(tracer.samples) &&
        tracer.samples % 16 === 0 &&
        tracer.samples < samples &&
        history.samples !== tracer.samples
      )
        await history.record(
          renderer,
          tracer.target.texture,
          tracer.samples,
          options.signal,
        );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    options.signal?.throwIfAborted();
    options.onProgress?.(0.92);
    let radiance = tracer.target.texture;
    if (settings.diagnostics)
      diagnosticFiles['beauty-linear.f32'] = photoFloatBytes(
        await readPhotoRadiance(
          renderer,
          radiance,
          exportWidth,
          exportHeight,
          options.signal,
        ),
      );
    if (settings.denoise) {
      linearOutput ??= new THREE.WebGLRenderTarget(renderWidth, renderHeight, {
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
        {
          samples: tracer.samples,
          previous: history?.samples ? history.target.texture : undefined,
          previousSamples: history?.samples,
        },
      );
      radiance = linearOutput.texture;
      if (settings.diagnostics)
        diagnosticFiles['denoised-linear.f32'] = photoFloatBytes(
          await readPhotoRadiance(
            renderer,
            radiance,
            exportWidth,
            exportHeight,
            options.signal,
          ),
        );
    }
    const measured = await finishPhoto(
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
    const beautySamples = Math.round(tracer.samples);
    if (settings.diagnostics && selectPass) {
      // Diagnostic transports use the same sample count, contacts, seed, camera and BSDF.
      tracer.renderToCanvas = false;
      // Finishing resized the canvas to output size. Restore the original tracing
      // grid before reset so diagnostic rays match the supersampled beauty.
      renderer.setSize(renderWidth, renderHeight, false);
      const passes = PHOTO_PASSES.slice(1);
      for (let passIndex = 0; passIndex < passes.length; passIndex++) {
        selectPass(passes[passIndex]);
        tracer.reset();
        while (tracer.samples < beautySamples) {
          options.signal?.throwIfAborted();
          if (performance.now() - started > timeLimit)
            throw new Error(
              'Photo diagnostics exceeded the rendering time limit. Try a smaller image.',
            );
          tracer.renderSample();
          await waitForPhotoGpu(renderer.getContext(), options.signal);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          options.onProgress?.(
            0.92 +
              ((passIndex + tracer.samples / beautySamples) / passes.length) *
                0.07,
          );
        }
        diagnosticFiles[`${passes[passIndex]}-linear.f32`] = photoFloatBytes(
          await readPhotoRadiance(
            renderer,
            tracer.target.texture,
            exportWidth,
            exportHeight,
            options.signal,
          ),
        );
      }
      selectPass('beauty');
      const zip = await photoDiagnosticZip(diagnosticFiles, blob, {
        manifest,
        result: {
          samples: beautySamples,
          textureResolution,
          converged,
          checks: convergence.checks,
          measured,
        },
        buffers: {
          width: exportWidth,
          height: exportHeight,
          renderWidth,
          renderHeight,
          format:
            'float32 little endian RGBA; bottom row first; linear sRGB; normal encoded 0..1; depth in metres',
          resampled: exportScale !== 1,
          transportSum: [
            'direct-diffuse',
            'direct-specular',
            'indirect-diffuse',
            'indirect-specular',
            'transmission',
            'emission',
            'background',
          ],
        },
      });
      options.signal?.throwIfAborted();
      options.onDiagnostics?.(zip);
    }
    if (host?.isConnected) {
      flash = document.createElement('div');
      flash.className = 'cc-photo-flash';
      flash.setAttribute('aria-hidden', 'true');
      host.append(flash);
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
    options.onProgress?.(1);
    options.onComplete?.({
      samples: beautySamples,
      elapsedMs: performance.now() - started,
      converged,
      checks: convergence.checks,
    });
    return blob;
  } finally {
    try {
      probe?.dispose();
      history?.dispose();
      linearOutput?.dispose();
      snapshot.scene.environment?.dispose();
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
