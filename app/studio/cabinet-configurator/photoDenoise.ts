import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {waitForPhotoGpu} from './photoGpu';

// Two octahedral normals share the existing half-float RGBA guide: bumped RG,
// geometric BA. Relief edge tests must not treat pores as a geometric plane.
const PHOTO_NORMAL_PACKING = /* glsl */ `
  vec2 photoSign(vec2 v) {return vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);}
  vec2 encodePhotoNormal(vec3 n) {
    if (dot(n,n) < 0.000001) return vec2(2.0);
    n /= abs(n.x) + abs(n.y) + abs(n.z);
    if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * photoSign(n.xy);
    return n.xy * 0.5 + 0.5;
  }
  vec3 decodePhotoNormal(vec2 e) {
    if (any(greaterThan(e, vec2(1.0)))) return vec3(0.0);
    vec2 f = e * 2.0 - 1.0;
    vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
    float t = clamp(-n.z, 0.0, 1.0);
    n.xy -= photoSign(n.xy) * t;
    return normalize(n);
  }
`;

/** Photo-only radiance filter. Original albedo is restored after filtering lighting,
 * while normal/depth and roughness guides protect geometry and finish detail. */
export async function denoisePhoto(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  radiance: THREE.Texture,
  width: number,
  height: number,
  signal?: AbortSignal,
  linearOutput?: THREE.WebGLRenderTarget,
  effort: {
    samples: number;
    previous?: THREE.Texture;
    previousSamples?: number;
  } = {samples: 256},
) {
  const target = () =>
    new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
  const edges = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RedFormat,
    depthBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  const normal = target();
  normal.depthTexture = new THREE.DepthTexture(width, height);
  const albedo = target();
  const roughness = target();
  const buffers = [target(), target()];
  const guideMaterials: THREE.Material[] = [];
  // Scene clones share the captured geometry/maps; only guide materials are temporary.
  const guide = scene.clone(true);
  const guideParts: {
    mesh: THREE.Mesh;
    albedo: THREE.Material | THREE.Material[];
    normal: THREE.Material | THREE.Material[];
    roughness: THREE.Material | THREE.Material[];
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
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader =
          PHOTO_NORMAL_PACKING +
          shader.fragmentShader
            .replace(
              '#include <normal_fragment_maps>',
              'vec3 photoGeometricNormal = normal;\n#include <normal_fragment_maps>',
            )
            .replace(
              /\}\s*$/,
              'gl_FragColor = vec4(encodePhotoNormal(normal), encodePhotoNormal(photoGeometricNormal));\n}',
            );
      };
      material.customProgramCacheKey = () => 'photo-packed-normals-v1';
      guideMaterials.push(material);
      return material;
    });
    const roughnessMaterials = original.map((value) => {
      const pbr = value as THREE.MeshStandardMaterial;
      const level = pbr.roughness ?? 1;
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(level, level, level),
        map: pbr.roughnessMap ?? null,
        side: value.side,
        alphaTest: value.alphaTest,
      });
      // PBR roughness uses the green channel, including packed ORM textures.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          '#include <map_fragment>\ndiffuseColor.rgb = vec3(diffuseColor.g);',
        );
      };
      material.customProgramCacheKey = () => 'photo-roughness-guide-v1';
      guideMaterials.push(material);
      return material;
    });
    const colors = original.map(makeAlbedo);
    guideParts.push({
      mesh: object,
      albedo: Array.isArray(object.material) ? colors : colors[0],
      normal: Array.isArray(object.material) ? normals : normals[0],
      roughness: Array.isArray(object.material)
        ? roughnessMaterials
        : roughnessMaterials[0],
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
      roughness: {value: roughness.texture},
      depth: {value: normal.depthTexture},
      edges: {value: albedo.texture},
      edgePass: {value: false},
      inverseProjection: {value: camera.projectionMatrixInverse.clone()},
      pixel: {value: new THREE.Vector2(1 / width, 1 / height)},
      stepSize: {value: 1},
      firstPass: {value: true},
      finalPass: {value: false},
      raw: {value: radiance},
      previous: {value: effort.previous ?? radiance},
      varianceWeight: {
        value:
          effort.previous &&
          effort.previousSamples &&
          effort.samples > effort.previousSamples
            ? effort.previousSamples / (effort.samples - effort.previousSamples)
            : 0,
      },
    },
    vertexShader: `varying vec2 vUv;
      void main() {vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0);}`,
    fragmentShader:
      PHOTO_NORMAL_PACKING +
      `
      uniform sampler2D image, albedo, normals, roughness, depth, edges, raw, previous;
      uniform mat4 inverseProjection;
      uniform float varianceWeight;
      uniform vec2 pixel;
      uniform float stepSize;
      uniform bool firstPass, finalPass, edgePass;
      varying vec2 vUv;
      bool validLighting(vec3 value) {
        return !any(isnan(value)) && !any(isinf(value)) && all(greaterThanEqual(value, vec3(0.0)));
      }
      vec3 positionAt(vec2 uv) {
        vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, texture2D(depth, uv).r * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      float planeWeight(vec3 centerPosition, vec3 centerNormal, vec2 uv, vec3 otherNormal) {
        vec3 delta = positionAt(uv) - centerPosition;
        // Reject millimetre-scale steps between parallel rails/panels. Comparing
        // depth relative to camera distance blended away their recess shadows.
        // Tangent-plane distance still permits smoothing across a sloped plane.
        float separation = max(abs(dot(delta, centerNormal)), abs(dot(delta, otherNormal)));
        return exp(-separation * separation / 0.000004);
      }
      vec3 lightingAt(vec2 uv) {
        vec3 value = texture2D(image, uv).rgb;
        if (!validLighting(value)) return vec3(-1.0);
        value = firstPass ? value / max(texture2D(albedo, uv).rgb, vec3(0.04)) : value;
        // Filter targets are half floats. Keep rare HDR outliers representable
        // instead of letting infinity contaminate every neighboring pixel.
        return min(value, vec3(65504.0));
      }
      vec3 normalAt(vec2 uv) {return decodePhotoNormal(texture2D(normals, uv).rg);}
      vec3 geometryNormalAt(vec2 uv) {return decodePhotoNormal(texture2D(normals, uv).ba);}
      float photoLuminance(vec3 c) {return dot(c, vec3(0.2126, 0.7152, 0.0722));}
      float kernel(int i) {return i == 0 ? 6.0 : abs(i) == 1 ? 4.0 : 1.0;}
      vec2 noiseVariance(vec3 n, vec3 position, vec3 base, float r) {
        if (varianceWeight <= 0.0) return vec2(0.0);
        vec3 original = texture2D(raw, vUv).rgb;
        vec3 oldCenter = texture2D(previous, vUv).rgb;
        bool validCenter = validLighting(original) && validLighting(oldCenter);
        vec3 delta = validCenter ? original - oldCenter : vec3(0.0);
        float centerVariance = dot(delta, delta) / 3.0;
        float variance = centerVariance;
        float varianceTotal = validCenter ? 1.0 : 0.0;
        // A single temporal difference can be accidentally small in a noisy
        // pixel. Pool nearby differences, with the same surface guides,
        // rather than punching raw-noise holes through the filtered image.
        for (int x = -1; x <= 1; x++) {
          for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;
            vec2 uv = clamp(vUv + vec2(float(x), float(y)) * pixel, pixel * 0.5, vec2(1.0) - pixel * 0.5);
            if (texture2D(depth, uv).r >= 0.999999) continue;
            vec3 other = texture2D(raw, uv).rgb;
            vec3 old = texture2D(previous, uv).rgb;
            if (!validLighting(other) || !validLighting(old)) continue;
            float weight = pow(clamp(dot(n, normalAt(uv)), 0.0, 1.0), 64.0);
            weight *= planeWeight(position, geometryNormalAt(vUv), uv, geometryNormalAt(uv));
            vec3 dc = texture2D(albedo, uv).rgb - base;
            weight *= exp(-dot(dc, dc) / 0.02);
            float dr = texture2D(roughness, uv).r - r;
            weight *= exp(-dr * dr / 0.0020);
            vec3 difference = other - old;
            variance += dot(difference, difference) / 3.0 * weight;
            varianceTotal += weight;
          }
        }
        variance = varianceTotal > 0.0 ? variance / varianceTotal * varianceWeight : 0.0;
        return vec2(variance, max(variance, centerVariance * varianceWeight));
      }
      void main() {
        if (edgePass) {
          float nearest = 0.03;
          if (texture2D(depth, vUv).r < 0.999999) {
            vec3 centerPosition = positionAt(vUv);
            vec3 centerNormal = geometryNormalAt(vUv);
            for (int level = 0; level < 6; level++) {
              float spacing = exp2(float(level));
              for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
                if (x == 0 && y == 0) continue;
                vec2 uv = clamp(vUv + vec2(float(x),float(y)) * pixel * spacing, pixel * 0.5, vec2(1.0) - pixel * 0.5);
                if (texture2D(depth, uv).r >= 0.999999) continue;
                vec3 delta = positionAt(uv) - centerPosition;
                float separation = dot(delta, centerNormal);
                if (abs(separation) > 0.002 || dot(centerNormal, geometryNormalAt(uv)) < 0.9)
                  nearest = min(nearest, length(delta - centerNormal * separation));
              }
            }
          }
          gl_FragColor = vec4(nearest,0.0,0.0,1.0);
          return;
        }
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
          vec3 position = positionAt(vUv);
          float r = texture2D(roughness, vUv).r;
          vec2 varianceGuide = finalPass ? noiseVariance(n, position, base, r) : vec2(0.0);
          float variance = varianceGuide.y;
          float light = validCenter ? log(1.0 + photoLuminance(centerLight)) : 0.0;
          float edgeDistance = texture2D(edges, vUv).r;
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
              geometry *= planeWeight(position, geometryNormalAt(vUv), uv, geometryNormalAt(uv));
              vec3 deltaColor = texture2D(albedo, uv).rgb - base;
              float colorWeight = exp(-dot(deltaColor, deltaColor) / 0.02);
              // Fine finish variation can carry grain even with flat base color.
              float deltaRoughness = texture2D(roughness, uv).r - r;
              float finishWeight = exp(-deltaRoughness * deltaRoughness / 0.0020);
              vec3 value = lightingAt(uv);
              if (!validLighting(value)) continue;
              float deltaLight = log(1.0 + photoLuminance(value)) - light;
              float lightingWeight = exp(-deltaLight * deltaLight / 2.0);
              // Smooth along a recess edge, not from its contact shadow into the
              // open panel. This guide comes from geometry, never noisy radiance.
              float deltaEdge = texture2D(edges, uv).r - edgeDistance;
              float edgeWeight = exp(-deltaEdge * deltaEdge / 0.000009);
              float weight = kernel(x) * kernel(y) * geometry * colorWeight * finishWeight * lightingWeight * edgeWeight;
              sum += value * weight;
              total += weight;
            }
          }
          sum = total > 0.0 ? sum / total : vec3(0.0);
          if (finalPass) {
            sum *= max(base, vec3(0.04));
            vec3 original = texture2D(raw, vUv).rgb;
            if (validLighting(original)) {
              float level = max(photoLuminance(original), 0.01);
              float noise = varianceWeight > 0.0 ? variance / (variance + level * level * 0.0004) : 1.0;
              // Confidence already falls as sampling converges. A sample-count
              // cap would retain visible noise even when confidence is high.
              sum = mix(original, sum, noise);
            }
          }
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
      part.mesh.material = part.roughness;
    });
    renderer.setRenderTarget(roughness);
    renderer.render(guide, camera);
    await waitForPhotoGpu(renderer.getContext(), signal);
    guideParts.forEach((part) => {
      part.mesh.material = part.albedo;
    });
    renderer.setRenderTarget(albedo);
    renderer.render(guide, camera);
    await waitForPhotoGpu(renderer.getContext(), signal);
    material.uniforms.edgePass.value = true;
    renderer.setRenderTarget(edges);
    quad.render(renderer);
    await waitForPhotoGpu(renderer.getContext(), signal);
    material.uniforms.edgePass.value = false;
    material.uniforms.edges.value = edges.texture;
    // Extend lighting smoothing at photo resolution, while restoring the original
    // albedo and using the actual material relief to protect grain and fine edges.
    // Four bounded à-trous passes: 25 taps each, at spacing 1, 2, 4 and 8.
    for (let pass = 0; pass < 4; pass++) {
      const finalPass = pass === 3;
      material.uniforms.firstPass.value = pass === 0;
      material.uniforms.finalPass.value = finalPass;
      material.toneMapped = !linearOutput;
      material.uniforms.stepSize.value = 2 ** pass;
      material.uniforms.image.value =
        pass === 0 ? radiance : buffers[(pass - 1) % 2].texture;
      if (finalPass && !linearOutput) {
        renderer.toneMapping = previous.toneMapping;
        renderer.outputColorSpace = previous.colorSpace;
      }
      renderer.setRenderTarget(
        finalPass ? (linearOutput ?? previous.target) : buffers[pass % 2],
      );
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
    edges.dispose();
    normal.dispose();
    normal.depthTexture?.dispose();
    albedo.dispose();
    roughness.dispose();
    buffers.forEach((value) => value.dispose());
  }
}
