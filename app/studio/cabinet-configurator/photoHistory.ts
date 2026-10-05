import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {waitForPhotoGpu} from './photoGpu';

/** A preceding cumulative mean estimates residual variance without altering transport. */
export class PhotoRadianceHistory {
  samples = 0;
  readonly target: THREE.WebGLRenderTarget;
  private material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {image: {value: null}},
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:
      'varying vec2 vUv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,vUv);}',
  });
  private quad = new FullScreenQuad(this.material);
  constructor(width: number, height: number) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.FloatType,
      depthBuffer: false,
    });
  }
  async record(
    renderer: THREE.WebGLRenderer,
    image: THREE.Texture,
    samples: number,
    signal?: AbortSignal,
  ) {
    const previous = renderer.getRenderTarget();
    try {
      this.material.uniforms.image.value = image;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
      await waitForPhotoGpu(renderer.getContext(), signal);
      this.samples = Math.round(samples);
    } finally {
      renderer.setRenderTarget(previous);
    }
  }
  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
