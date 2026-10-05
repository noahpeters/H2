import type {WebGLPathTracer} from 'three-gpu-pathtracer';

export const PHOTO_PASSES = [
  'beauty',
  'albedo',
  'normal',
  'roughness',
  'direct-diffuse',
  'direct-specular',
  'indirect-diffuse',
  'indirect-specular',
  'transmission',
  'emission',
  'background',
  'depth',
] as const;
export type PhotoPass = (typeof PHOTO_PASSES)[number];

/** Pinned shader instrumentation. Splits the evaluated first-hit BSDF, not sampled lobe labels.
 * Transmission/emission/background have their own passes so the radiance sum stays complete.
 * Does not consume RNG or change PDFs/throughput. Run each pass with the same reset seed. */
export function configurePhotoTransport(tracer: WebGLPathTracer) {
  const material = (
    tracer as unknown as {
      _pathTracer: {
        material: {
          fragmentShader: string;
          uniforms: Record<string, {value: unknown}>;
          needsUpdate: boolean;
        };
      };
    }
  )._pathTracer.material;
  let shader = material.fragmentShader;
  const replace = (before: string | RegExp, after: string) => {
    if (
      typeof before === 'string'
        ? !shader.includes(before)
        : !before.test(shader)
    )
      throw new Error('Photo diagnostic tracer compatibility changed.');
    shader = shader.replace(before, after);
  };
  replace(
    'float bsdfEval(',
    `
    uniform int photoPass;
    vec3 photoLobeDiffuse, photoLobeTransmission;
    vec3 photoDirectDiffuse, photoDirectTransmission;
    vec3 photoFirstDiffuse, photoFirstTransmission;
    vec3 photoDD, photoDS, photoID, photoIS, photoT, photoE, photoB;
    int photoSurfaceDepth;
    void photoAdd(vec3 value, int depth, vec3 diffuseFraction, vec3 transmissionFraction) {
      vec3 d = value * diffuseFraction;
      vec3 t = value * transmissionFraction;
      vec3 s = value - d - t;
      if (depth <= 1) {photoDD += d; photoDS += s;} else {photoID += d; photoIS += s;}
      photoT += t;
    }
    float bsdfEval(`,
  );
  replace(
    '// ggx specular',
    `vec3 photoDiffuseColor = color;
    // ggx specular`,
  );
  replace(
    'color *= mix( 1.0, sheenAlbedoScaling( wo, wi, surf ), surf.sheen );',
    `
    float photoSheenScale = mix(1.0, sheenAlbedoScaling(wo, wi, surf), surf.sheen);
    color *= photoSheenScale;
    photoDiffuseColor *= photoSheenScale;`,
  );
  replace(
    'cpdf = clearcoatEval( clearcoatWo, clearcoatWi, clearcoatHalfVector, surf, color );',
    `
    cpdf = clearcoatEval( clearcoatWo, clearcoatWi, clearcoatHalfVector, surf, color );
    photoDiffuseColor *= 1.0 - surf.clearcoat * schlickFresnel(dot(clearcoatWi, clearcoatHalfVector), 0.04);`,
  );
  replace(
    '// retrieve specular rays for the shadows flag',
    `
    photoLobeTransmission = wi.z < 0.0 ? vec3(1.0) : vec3(0.0);
    photoLobeDiffuse = clamp(photoDiffuseColor / max(color, vec3(1e-20)), vec3(0.0), vec3(1.0)) * (1.0 - photoLobeTransmission);
    // retrieve specular rays for the shadows flag`,
  );
  // Direct sampling exposes the same exact BSDF decomposition evaluated for that light.
  replace(
    'vec3 result = vec3( 0.0 );',
    'vec3 result = vec3(0.0); photoDirectDiffuse = vec3(0.0); photoDirectTransmission = vec3(0.0);',
  );
  replace(
    /result = attenuatedColor \* lightRec\.emission[^;]+;/,
    '$&\nphotoDirectDiffuse = result * photoLobeDiffuse; photoDirectTransmission = result * photoLobeTransmission;',
  );
  replace(
    /result = attenuatedColor \* environmentIntensity[^;]+;/,
    '$&\nphotoDirectDiffuse = result * photoLobeDiffuse; photoDirectTransmission = result * photoLobeTransmission;',
  );
  replace(
    '// surface results',
    `
    // surface results
    photoDD=photoDS=photoID=photoIS=photoT=photoE=photoB=vec3(0.0);
    photoFirstDiffuse=photoFirstTransmission=vec3(0.0);
    photoSurfaceDepth=0;
    vec3 photoAlbedo=vec3(0.0), photoNormal=vec3(0.0);
    float photoRoughness=0.0, photoDepth=0.0;`,
  );
  replace(
    'scatterRec = bsdfSample( - ray.direction, surf );',
    `
    photoSurfaceDepth++;
    if(photoSurfaceDepth==1){photoAlbedo=surf.color;photoNormal=normalize(surf.normal)*0.5+0.5;photoRoughness=sqrt(surf.roughness);photoDepth=surfaceHit.dist;}
    scatterRec = bsdfSample( - ray.direction, surf );
    if(photoSurfaceDepth==1){photoFirstDiffuse=photoLobeDiffuse;photoFirstTransmission=photoLobeTransmission;}`,
  );
  replace(
    'gl_FragColor.rgb += directLightContribution( - ray.direction, surf, state, hitPoint );',
    `
    vec3 photoDirect = directLightContribution(-ray.direction, surf, state, hitPoint);
    gl_FragColor.rgb += photoDirect;
    if(photoSurfaceDepth==1){photoDD+=photoDirectDiffuse;photoT+=photoDirectTransmission;photoDS+=photoDirect-photoDirectDiffuse-photoDirectTransmission;}
    else photoAdd(photoDirect,photoSurfaceDepth,photoFirstDiffuse,photoFirstTransmission);`,
  );
  replace(
    'gl_FragColor.rgb += ( surf.emission * state.throughputColor );',
    `
    vec3 photoEmission=surf.emission*state.throughputColor;
    gl_FragColor.rgb+=photoEmission;
    if(photoSurfaceDepth==1) photoE+=photoEmission;
    else photoAdd(photoEmission,photoSurfaceDepth-1,photoFirstDiffuse,photoFirstTransmission);`,
  );
  replace(
    'gl_FragColor.rgb += sampleBackground( ray.direction, rand2( 2 ) ) * state.throughputColor;',
    `
    vec3 photoBackground=sampleBackground(ray.direction,rand2(2))*state.throughputColor;
    gl_FragColor.rgb+=photoBackground;
    if(photoSurfaceDepth==0)photoB+=photoBackground;
    else photoAdd(photoBackground,photoSurfaceDepth,photoFirstDiffuse,photoFirstTransmission);`,
  );
  // Remaining additions are light hits and environment escape; classify by preceding surfaces.
  replace(
    /gl_FragColor\.rgb \+= lightRec\.emission \* state\.throughputColor \* misWeight;/,
    '$&\nphotoAdd(lightRec.emission*state.throughputColor*misWeight,photoSurfaceDepth,photoFirstDiffuse,photoFirstTransmission);',
  );
  replace(
    'gl_FragColor.rgb += lightRec.emission * state.throughputColor;',
    '$&\nphotoAdd(lightRec.emission*state.throughputColor,photoSurfaceDepth,photoFirstDiffuse,photoFirstTransmission);',
  );
  replace(
    'gl_FragColor.rgb += environmentIntensity * envColor * state.throughputColor * misWeight;',
    '$&\nphotoAdd(environmentIntensity*envColor*state.throughputColor*misWeight,photoSurfaceDepth,photoFirstDiffuse,photoFirstTransmission);',
  );
  replace(
    /gl_FragColor\.rgb \+=\s+environmentIntensity \*\s+sampleEquirectColor[^;]+;/,
    '$&\nphotoAdd(environmentIntensity*sampleEquirectColor(envMapInfo.map,envRotation3x3*ray.direction)*state.throughputColor,photoSurfaceDepth,photoFirstDiffuse,photoFirstTransmission);',
  );
  replace(
    'gl_FragColor.a *= opacity;',
    `
    if(photoPass==1)gl_FragColor.rgb=photoAlbedo;
    if(photoPass==2)gl_FragColor.rgb=photoNormal;
    if(photoPass==3)gl_FragColor.rgb=vec3(photoRoughness);
    if(photoPass==4)gl_FragColor.rgb=photoDD;
    if(photoPass==5)gl_FragColor.rgb=photoDS;
    if(photoPass==6)gl_FragColor.rgb=photoID;
    if(photoPass==7)gl_FragColor.rgb=photoIS;
    if(photoPass==8)gl_FragColor.rgb=photoT;
    if(photoPass==9)gl_FragColor.rgb=photoE;
    if(photoPass==10)gl_FragColor.rgb=photoB;
    if(photoPass==11)gl_FragColor.rgb=vec3(photoDepth);
    gl_FragColor.a *= opacity;`,
  );
  material.fragmentShader = shader;
  material.uniforms.photoPass = {value: 0};
  material.needsUpdate = true;
  return (pass: PhotoPass) => {
    material.uniforms.photoPass.value = PHOTO_PASSES.indexOf(pass);
  };
}
