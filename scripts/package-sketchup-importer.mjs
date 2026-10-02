import {readFileSync, writeFileSync} from 'node:fs';
const source = readFileSync(
  new URL('../tools/sketchup/from_trees_importer.rb', import.meta.url),
  'utf8',
);
writeFileSync(
  new URL(
    '../app/studio/cabinet-configurator/fabrication/importerSource.ts',
    import.meta.url,
  ),
  '// Generated from tools/sketchup/from_trees_importer.rb. Update with scripts/package-sketchup-importer.mjs.\nexport const IMPORTER_SOURCE = ' +
    JSON.stringify(source) +
    ';\n',
);
