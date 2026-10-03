import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {waitForPhotoGpu} from './photoGpu';

export type PhotoConvergenceCheck = {
  samples: number;
  rms: number;
  p95: number;
  worstRegion: number;
  stable: boolean;
};
/** Estimate remaining noise from successive cumulative means. Multiplying the
 * difference by sqrt(previousN / addedN) corrects for its shrinking update weight.
 * A regional guard prevents a small noisy reflection from hiding in the average.
 * This is a perceptual convergence estimate, not proof of unbiased lighting.
 */
export class PhotoConvergence {
  private previous?: {samples: number; pixels: Float32Array};
  private stableChecks = 0;
  private exposure?: number;
  readonly checks: PhotoConvergenceCheck[] = [];
  constructor(
    readonly interval: number,
    readonly minimum: number,
    readonly tolerance: number,
    private manualExposure?: number,
    private exposureMultiplier = 1,
  ) {}
  shouldCheck(samples: number) {
    const n = Math.round(samples);
    return (
      Math.abs(n - samples) < 1e-5 &&
      n >= this.interval &&
      n % this.interval === 0 &&
      n !== this.previous?.samples
    );
  }
  observe(pixels: Float32Array, samples: number, width: number) {
    samples = Math.round(samples);
    const previous = this.previous;
    this.previous = {samples, pixels: pixels.slice()};
    if (!previous) {
      const luminances: number[] = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const l =
          pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
        if (Number.isFinite(l) && l > 1e-5) luminances.push(l);
      }
      luminances.sort((a, b) => a - b);
      this.exposure =
        (this.manualExposure ??
          Math.max(
            1 / 16,
            Math.min(
              16,
              0.35 / (luminances[Math.floor(luminances.length / 2)] ?? 0.18),
            ),
          )) * this.exposureMultiplier;
      return false;
    }
    if (
      pixels.length !== previous.pixels.length ||
      samples <= previous.samples
    ) {
      this.stableChecks = 0;
      return false;
    }
    const weight = Math.sqrt(previous.samples / (samples - previous.samples));
    const errors: number[] = [],
      regions = new Map<number, {sum: number; count: number}>();
    const height = pixels.length / 4 / width;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      let square = 0;
      for (let c = 0; c < 3; c++) {
        const a = pixels[i + c],
          b = previous.pixels[i + c];
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
          this.stableChecks = 0;
          return false;
        }
        // Bounded display-like response with fixed metering across checkpoints.
        const display = (v: number) =>
          Math.sqrt((v * this.exposure!) / (1 + v * this.exposure!));
        square += ((display(a) - display(b)) * weight) ** 2 / 3;
      }
      const error = Math.sqrt(square);
      errors.push(error);
      sum += square;
      const pixel = i / 4,
        key =
          Math.floor(((pixel % width) / width) * 8) +
          8 * Math.floor((Math.floor(pixel / width) / height) * 8);
      const region = regions.get(key) ?? {sum: 0, count: 0};
      region.sum += square;
      region.count++;
      regions.set(key, region);
    }
    errors.sort((a, b) => a - b);
    const rms = Math.sqrt(sum / errors.length),
      p95 = errors[Math.floor(errors.length * 0.95)] ?? Infinity;
    const worstRegion = Math.max(
      ...[...regions.values()].map((r) => Math.sqrt(r.sum / r.count)),
    );
    const stable =
      samples >= this.minimum &&
      rms <= this.tolerance &&
      p95 <= this.tolerance * 3 &&
      worstRegion <= this.tolerance * 4;
    this.checks.push({samples, rms, p95, worstRegion, stable});
    this.stableChecks = stable ? this.stableChecks + 1 : 0;
    return this.stableChecks >= 3;
  }
}

/** Sparse output-pixel probes retain fine noise rather than averaging whole tiles.
 * Four subpixel taps match the output reconstruction footprint, not probe spacing.
 * Readbacks are photo-only and occur only at complete sample boundaries.
 */
export class PhotoConvergenceProbe {
  readonly width = 128;
  readonly height: number;
  private target: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  constructor(aspect: number, outputWidth: number, outputHeight: number) {
    this.height = Math.max(16, Math.round(this.width / aspect));
    this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.FloatType,
      depthBuffer: false,
    });
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        image: {value: null},
        pixel: {value: new THREE.Vector2(1 / outputWidth, 1 / outputHeight)},
      },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vUv; uniform sampler2D image; uniform vec2 pixel;
      void main(){vec4 c=vec4(0.); for(int x=0;x<2;x++)for(int y=0;y<2;y++)c+=texture2D(image,clamp(vUv+(vec2(float(x),float(y))-.5)*pixel*.5,vec2(0.),vec2(1.)));gl_FragColor=c*.25;}`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  async read(
    renderer: THREE.WebGLRenderer,
    image: THREE.Texture,
    signal?: AbortSignal,
  ) {
    const previous = {
      target: renderer.getRenderTarget(),
      tone: renderer.toneMapping,
      color: renderer.outputColorSpace,
    };
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.material.uniforms.image.value = image;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
      await waitForPhotoGpu(renderer.getContext(), signal);
      const pixels = new Float32Array(this.width * this.height * 4);
      renderer.readRenderTargetPixels(
        this.target,
        0,
        0,
        this.width,
        this.height,
        pixels,
      );
      return pixels;
    } finally {
      renderer.setRenderTarget(previous.target);
      renderer.toneMapping = previous.tone;
      renderer.outputColorSpace = previous.color;
    }
  }
  dispose() {
    this.quad.dispose();
    this.material.dispose();
    this.target.dispose();
  }
}
