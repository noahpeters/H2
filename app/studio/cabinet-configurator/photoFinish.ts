import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {meterPhoto, type PhotoCameraSettings} from './photoCamera';
import {temperatureColor} from './photoLighting';
import {waitForPhotoGpu} from './photoGpu';

/** All metering, WB, bloom, reconstruction and AgX run on captured linear HDR.
 * There is exactly one display transform, after the denoiser and area resolve. */
export async function finishPhoto(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  radiance: THREE.Texture,
  width: number,
  height: number,
  settings: PhotoCameraSettings,
  manualExposure: number,
  signal?: AbortSignal,
) {
  const meter = new THREE.WebGLRenderTarget(64, 64, {type: THREE.FloatType});
  const guide = scene.clone(true);
  const materials: THREE.Material[] = [];
  // Clear alpha identifies empty pixels independently of black surface albedo.
  guide.background = null;
  guide.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const replace = (original: THREE.Material) => {
      const pbr = original as THREE.MeshStandardMaterial;
      const material = new THREE.MeshBasicMaterial({
        color: pbr.color ?? 0xffffff,
        map: pbr.map ?? null,
        side: original.side,
        opacity: original.opacity,
        transparent: original.transparent,
        alphaTest: original.alphaTest,
      });
      materials.push(material);
      return material;
    };
    object.material = Array.isArray(object.material)
      ? (object.material as THREE.Material[]).map(replace)
      : replace(object.material);
  });
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      image: {value: radiance},
      gains: {value: new THREE.Vector3(1, 1, 1)},
      exposure: {value: 1},
      pixel: {value: new THREE.Vector2(1 / width, 1 / height)},
      finishing: {value: false},
    },
    vertexShader:
      'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D image;
      uniform vec3 gains;
      uniform vec2 pixel;
      uniform float exposure;
      uniform bool finishing;
      vec4 sampleAt(vec2 uv) {
        vec4 c = texture2D(image, clamp(uv, vec2(0.0), vec2(1.0)));
        if (any(isnan(c)) || any(isinf(c))) return vec4(0.0);
        return max(c, vec4(0.0));
      }
      void main() {
        if (!finishing) {gl_FragColor=sampleAt(vUv); return;}
        // 4x4 stratified area reconstruction at the final pixel footprint.
        vec4 resolved = vec4(0.0);
        for (int x=0; x<4; x++) for (int y=0; y<4; y++)
          resolved += sampleAt(vUv + (vec2(float(x),float(y)) / 4.0 - 0.375) * pixel);
        resolved /= 16.0;
        vec3 c = resolved.rgb * gains * exposure;
        vec3 glow = vec3(0.0);
        float total = 0.0;
        for (int x=-2; x<=2; x++) for (int y=-2; y<=2; y++) {
          float weight = exp(-float(x*x+y*y)/2.0);
          vec3 bright = sampleAt(vUv + vec2(float(x),float(y)) * pixel * 2.0).rgb * gains * exposure;
          float l = dot(bright, vec3(0.2126,0.7152,0.0722));
          glow += min(bright, vec3(16.0)) * smoothstep(4.0,8.0,l) * weight;
          total += weight;
        }
        gl_FragColor = vec4(c + glow / total * 0.008, resolved.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new FullScreenQuad(material);
  const previous = {
    target: renderer.getRenderTarget(),
    tone: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    color: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    clearAlpha: renderer.getClearAlpha(),
  };
  try {
    renderer.autoClear = true;
    renderer.setClearAlpha(0);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(meter);
    renderer.render(guide, camera);
    await waitForPhotoGpu(renderer.getContext(), signal);
    const albedo = new Float32Array(64 * 64 * 4);
    renderer.readRenderTargetPixels(meter, 0, 0, 64, 64, albedo);
    quad.render(renderer);
    await waitForPhotoGpu(renderer.getContext(), signal);
    const pixels = new Float32Array(albedo.length);
    renderer.readRenderTargetPixels(meter, 0, 0, 64, 64, pixels);
    const measured = meterPhoto(pixels, albedo, settings, manualExposure);
    let gains = measured.gains;
    if (!settings.autoWhiteBalance) {
      const white = temperatureColor(settings.temperature);
      const reference = temperatureColor(6500);
      gains = [
        reference.r / Math.max(white.r, 0.01),
        reference.g / Math.max(white.g, 0.01),
        reference.b / Math.max(white.b, 0.01),
      ];
    }
    material.uniforms.gains.value.fromArray(gains);
    material.uniforms.exposure.value = measured.exposure;
    material.uniforms.finishing.value = true;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1; // Exposure is applied before bright-source extraction.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(width, height, false);
    renderer.setRenderTarget(null);
    quad.render(renderer);
    await waitForPhotoGpu(renderer.getContext(), signal);
    return measured;
  } finally {
    renderer.setRenderTarget(previous.target);
    renderer.toneMapping = previous.tone;
    renderer.toneMappingExposure = previous.exposure;
    renderer.outputColorSpace = previous.color;
    renderer.autoClear = previous.autoClear;
    renderer.setClearAlpha(previous.clearAlpha);
    quad.dispose();
    material.dispose();
    meter.dispose();
    materials.forEach((value) => value.dispose());
  }
}
