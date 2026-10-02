import type {FabricationManifest} from './model';
import {partsCsv} from './stock';
import {IMPORTER_SOURCE} from './importerSource';
export function exportBundle(manifest: FabricationManifest) {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  // Chunk to avoid argument limits on large designs. Data is decoded as JSON,
  // never interpolated as Ruby code or evaluated.
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const data = btoa(binary);
  return {
    filename: `From-Trees-${manifest.design.slug.slice(0, 8)}-r${manifest.design.revision}`,
    manifest,
    csv: partsCsv(manifest.parts),
    ruby:
      IMPORTER_SOURCE +
      `\nFromTrees::CabinetImport.run(JSON.parse(Base64.strict_decode64('${data}')))\n`,
  };
}
