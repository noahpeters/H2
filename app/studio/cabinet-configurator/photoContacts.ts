import type {WebGLPathTracer} from 'three-gpu-pathtracer';

export type PhotoContactSettings = {
  quality: 'off' | 'standard' | 'fine';
  /** Refinement effort, not an artistic darkening multiplier. */
  intensity: number;
  /** World-space detection radius in metres. Never clips GI or shadow rays. */
  radius: number;
};
export const DEFAULT_PHOTO_CONTACTS: PhotoContactSettings = {
  quality: 'standard',
  intensity: 1,
  radius: 0.05,
};

// Probe geometry only to allocate work. Visibility/radiance comes exclusively from
// the existing BSDF, shadow, transparency and MIS integration, never from this mask.
const contactShader = /* glsl */ `
  uniform float photoContactRadius;
  uniform int photoContactPaths;

  int photoContactPathCount( Ray cameraRay ) {
    if ( photoContactPaths == 1 ) return 1;
    SurfaceHit hit;
    if ( ! bvhIntersectFirstHit( bvh, cameraRay.origin, cameraRay.direction,
      hit.faceIndices, hit.faceNormal, hit.barycoord, hit.side, hit.dist ) ) return 1;
    vec3 normal = hit.faceNormal;
    if ( dot( normal, cameraRay.direction ) > 0.0 ) normal = -normal;
    vec3 origin = stepRayOrigin( cameraRay.origin, cameraRay.direction, normal, hit.dist );
    vec3 tangent = normalize( cross( normal, abs( normal.y ) < 0.9 ? vec3(0,1,0) : vec3(1,0,0) ) );
    vec3 bitangent = cross( normal, tangent );
    // Fixed cosine-distributed directions: no RNG consumed and no screen-space radius.
    // Include grazing directions to detect reveals and cabinet/floor interfaces.
    for ( int probe = 0; probe < 8; probe ++ ) {
      float r = sqrt( ( float( probe ) + 0.5 ) / 8.0 );
      float angle = float( probe ) * 2.39996323;
      vec3 direction = tangent * ( r * cos( angle ) ) + bitangent * ( r * sin( angle ) )
        + normal * sqrt( 1.0 - r * r );
      SurfaceHit nearby;
      if ( bvhIntersectFirstHit( bvh, origin, direction, nearby.faceIndices,
        nearby.faceNormal, nearby.barycoord, nearby.side, nearby.dist )
        && nearby.dist < photoContactRadius ) return photoContactPaths;
    }
    return 1;
  }
`;

/** Pinned 0.0.23 adapter: average independent complete paths at the SAME camera
 * ray near contacts. More accurate ray-traced AO/contact shadows without applying
 * visibility twice to GI, changing materials, or moving the authoritative camera.
 */
export function configurePhotoContacts(
  tracer: WebGLPathTracer,
  settings: PhotoContactSettings,
) {
  const pinned = tracer as WebGLPathTracer & {
    _pathTracer: {
      material: {
        fragmentShader: string;
        uniforms: Record<string, {value: unknown}>;
        needsUpdate: boolean;
      };
    };
  };
  const material = pinned._pathTracer?.material;
  const markers = [
    '#define RAY_OFFSET 1e-4',
    'void main() {',
    'Ray ray = getCameraRay();',
    '// surface results',
    'gl_FragColor.a *= opacity;',
  ];
  if (
    !material ||
    markers.some((marker) => !material.fragmentShader?.includes(marker))
  ) {
    throw new Error(
      'Photo contact tracer compatibility changed. Update the photo adapter.',
    );
  }
  // Retain upstream position-relative precision scaling, but resolve sub-mm gaps.
  // Larger offsets skip attachment points and cause cabinet/floor light leaks.
  material.fragmentShader = material.fragmentShader
    .replace(markers[0], '#define RAY_OFFSET 1e-5')
    .replace(markers[1], `${contactShader}\n${markers[1]}`)
    .replace(markers[2], 'Ray cameraRay = getCameraRay();')
    .replace(
      markers[3],
      `
      int contactPaths = photoContactPathCount( cameraRay );
      vec4 photoContactSum = vec4( 0.0 );
      for ( int contactPath = 0; contactPath < 4; contactPath ++ ) {
        if ( contactPath >= contactPaths ) break;
        Ray ray = cameraRay;
        gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
        ${markers[3]}`,
    )
    .replace(
      markers[4],
      `
        photoContactSum += gl_FragColor;
      }
      gl_FragColor = photoContactSum / float( contactPaths );
      ${markers[4]}`,
    );
  const maximum =
    settings.quality === 'fine' ? 4 : settings.quality === 'standard' ? 2 : 1;
  material.uniforms.photoContactPaths = {
    value: 1 + Math.round((maximum - 1) * settings.intensity),
  };
  material.uniforms.photoContactRadius = {value: settings.radius};
  material.needsUpdate = true;
}
