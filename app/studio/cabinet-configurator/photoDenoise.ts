import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {waitForPhotoGpu} from './photoGpu';

/** Photo-only radiance filter. Original albedo is restored after filtering lighting,
 * while normal/depth guides stop averaging across geometry boundaries. */
export async function denoisePhoto(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  radiance: THREE.Texture,
  width: number,
  height: number,
  signal?: AbortSignal,
) {
  const target = () =>
    new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
  const normal = target();
  normal.depthTexture = new THREE.DepthTexture(width, height);
  const albedo = target();
  const buffers = [target(), target()];
  const guideMaterials: THREE.Material[] = [];
  // Scene clones share the captured geometry/maps; only guide materials are temporary.
  const guide = scene.clone(true);
  const guideParts: {
    mesh: THREE.Mesh;
    albedo: THREE.Material | THREE.Material[];
    normal: THREE.Material | THREE.Material[];
  }[] = [];
  guide.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const makeAlbedo = (original: THREE.Material) => {
      const pbr = original as THREE.MeshStandardMaterial;
      const material = new THREE.MeshBasicMaterial({
        color: pbr.color ?? 0xffffff,
        map: pbr.map ?? null,
        side: original.side,
        transparent: original.transparent,
        opacity: original.opacity,
        depthWrite: original.depthWrite,
        alphaTest: original.alphaTest,
      });
      guideMaterials.push(material);
      return material;
    };
    const original = Array.isArray(object.material)
      ? (object.material as THREE.Material[])
      : [object.material];
    const normals = original.map((value) => {
      const pbr = value as THREE.MeshStandardMaterial;
      const material = new THREE.MeshNormalMaterial({
        side: value.side,
        alphaTest: value.alphaTest,
        normalMap: pbr.normalMap ?? null,
        normalMapType: pbr.normalMapType,
        normalScale: pbr.normalScale?.clone(),
        bumpMap: pbr.bumpMap ?? null,
        bumpScale: pbr.bumpScale,
      });
      guideMaterials.push(material);
      return material;
    });
    const colors = original.map(makeAlbedo);
    guideParts.push({
      mesh: object,
      albedo: Array.isArray(object.material) ? colors : colors[0],
      normal: Array.isArray(object.material) ? normals : normals[0],
    });
  });
  // No emitter backgrounds in the guides. Empty pixels have far depth.
  guide.background = new THREE.Color(0);
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      image: {value: radiance},
      albedo: {value: albedo.texture},
      normals: {value: normal.texture},
      depth: {value: normal.depthTexture},
      pixel: {value: new THREE.Vector2(1 / width, 1 / height)},
      nearFar: {value: new THREE.Vector2(camera.near, camera.far)},
      stepSize: {value: 1},
      firstPass: {value: true},
      finalPass: {value: false},
    },
    vertexShader: `varying vec2 vUv;
      void main() {vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0);}`,
    fragmentShader: `
      uniform sampler2D image, albedo, normals, depth;
      uniform vec2 pixel, nearFar;
      uniform float stepSize;
      uniform bool firstPass, finalPass;
      varying vec2 vUv;
      bool validLighting(vec3 value) {
        return !any(isnan(value)) && !any(isinf(value)) && all(greaterThanEqual(value, vec3(0.0)));
      }
      float distanceAt(vec2 uv) {
        float z = texture2D(depth, uv).r;
        return nearFar.x * nearFar.y / (nearFar.y - z * (nearFar.y - nearFar.x));
      }
      vec3 lightingAt(vec2 uv) {
        vec3 value = texture2D(image, uv).rgb;
        if (!validLighting(value)) return vec3(-1.0);
        value = firstPass ? value / max(texture2D(albedo, uv).rgb, vec3(0.04)) : value;
        // Filter targets are half floats. Keep rare HDR outliers representable
        // instead of letting infinity contaminate every neighboring pixel.
        return min(value, vec3(65504.0));
      }
      vec3 normalAt(vec2 uv) {
        vec3 n = texture2D(normals, uv).rgb * 2.0 - 1.0;
        float lengthSquared = dot(n, n);
        // Missing/degenerate normals must preserve radiance, never erase it.
        return lengthSquared > 0.000001 ? n * inversesqrt(lengthSquared) : vec3(0.0);
      }
      float photoLuminance(vec3 c) {return dot(c, vec3(0.2126, 0.7152, 0.0722));}
      float kernel(int i) {return i == 0 ? 6.0 : abs(i) == 1 ? 4.0 : 1.0;}
      void main() {
        vec4 center = texture2D(image, vUv);
        float rawDepth = texture2D(depth, vUv).r;
        vec3 base = texture2D(albedo, vUv).rgb;
        vec3 sum = vec3(0.0);
        float total = 0.0;
        if (rawDepth >= 0.999999) {
          // Keep the captured background and silhouette exactly, including alpha.
          sum = validLighting(center.rgb) ? center.rgb : vec3(0.0);
        } else {
          vec3 n = normalAt(vUv);
          // Keep every valid center, but reconstruct invalid centers from their
          // finite neighbors. A single NaN must never grow into a black square.
          vec3 centerLight = lightingAt(vUv);
          bool validCenter = validLighting(centerLight);
          sum = validCenter ? centerLight * 36.0 : vec3(0.0);
          total = validCenter ? 36.0 : 0.0;
          float d = distanceAt(vUv);
          float light = validCenter ? log(1.0 + photoLuminance(centerLight)) : 0.0;
          for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
              if (x == 0 && y == 0) continue;
              if (dot(n, n) < 0.5) continue;
              vec2 uv = clamp(vUv + vec2(float(x), float(y)) * pixel * stepSize, pixel * 0.5, vec2(1.0) - pixel * 0.5);
              float otherDepth = texture2D(depth, uv).r;
              if (otherDepth >= 0.999999) continue;
              vec3 otherNormal = normalAt(uv);
              if (dot(otherNormal, otherNormal) < 0.5) continue;
              float geometry = pow(clamp(dot(n, otherNormal), 0.0, 1.0), 64.0);
              float deltaDepth = (distanceAt(uv) - d) / max(d, 0.01);
              geometry *= exp(-deltaDepth * deltaDepth / 0.0004);
              vec3 deltaColor = texture2D(albedo, uv).rgb - base;
              float colorWeight = exp(-dot(deltaColor, deltaColor) / 0.02);
              vec3 value = lightingAt(uv);
              if (!validLighting(value)) continue;
              float deltaLight = log(1.0 + photoLuminance(value)) - light;
              float lightingWeight = exp(-deltaLight * deltaLight / 2.0);
              float weight = kernel(x) * kernel(y) * geometry * colorWeight * lightingWeight;
              sum += value * weight;
              total += weight;
            }
          }
          sum = total > 0.0 ? sum / total : vec3(0.0);
          if (finalPass) sum *= max(base, vec3(0.04));
        }
        gl_FragColor = vec4(sum, center.a);
        if (finalPass) {
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      }`,
  });
  const quad = new FullScreenQuad(material);
  const previous = {
    target: renderer.getRenderTarget(),
    toneMapping: renderer.toneMapping,
    colorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
  };
  try {
    renderer.autoClear = true;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(normal);
    guideParts.forEach((part) => {
      part.mesh.material = part.normal;
    });
    renderer.render(guide, camera);
    await waitForPhotoGpu(renderer.getContext(), signal);
    guideParts.forEach((part) => {
      part.mesh.material = part.albedo;
    });
    renderer.setRenderTarget(albedo);
    renderer.render(guide, camera);
    await waitForPhotoGpu(renderer.getContext(), signal);
    // Extend lighting smoothing at photo resolution, while restoring the original
    // albedo and using the actual material relief to protect grain and fine edges.
    // Four bounded à-trous passes: 25 taps each, at spacing 1, 2, 4 and 8.
    for (let pass = 0; pass < 4; pass++) {
      const finalPass = pass === 3;
      material.uniforms.firstPass.value = pass === 0;
      material.uniforms.finalPass.value = finalPass;
      material.uniforms.stepSize.value = 2 ** pass;
      material.uniforms.image.value =
        pass === 0 ? radiance : buffers[(pass - 1) % 2].texture;
      if (finalPass) {
        renderer.toneMapping = previous.toneMapping;
        renderer.outputColorSpace = previous.colorSpace;
      }
      renderer.setRenderTarget(finalPass ? previous.target : buffers[pass % 2]);
      quad.render(renderer);
      await waitForPhotoGpu(renderer.getContext(), signal);
    }
  } finally {
    renderer.setRenderTarget(previous.target);
    renderer.toneMapping = previous.toneMapping;
    renderer.outputColorSpace = previous.colorSpace;
    renderer.autoClear = previous.autoClear;
    quad.dispose();
    material.dispose();
    guideMaterials.forEach((value) => value.dispose());
    normal.dispose();
    normal.depthTexture?.dispose();
    albedo.dispose();
    buffers.forEach((value) => value.dispose());
  }
}
