import type {FabricationManifest} from './model';
import {partsCsv} from './stock';
export function exportBundle(manifest: FabricationManifest) {
  return {
    filename: `From-Trees-${manifest.design.slug.slice(0, 8)}-r${manifest.design.revision}`,
    manifest,
    csv: partsCsv(manifest.parts),
  };
}
