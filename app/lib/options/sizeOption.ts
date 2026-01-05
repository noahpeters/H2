export type SizeExtension = 'none' | '2' | '4';

export type ParsedSizeValue = {
  base: string | null;
  ext: SizeExtension | null;
};

const EXTENSION_PATTERN = /extension for\s*(\d+)/i;

export function parseSizeValue(value: string): ParsedSizeValue {
  if (!value) return {base: null, ext: null};

  const [basePart, extensionPart] = value.split(' + ');
  const base = basePart?.trim() ?? '';

  if (!base || !base.toLowerCase().startsWith('seats')) {
    return {base: null, ext: null};
  }

  if (!extensionPart) {
    return {base, ext: 'none'};
  }

  const match = extensionPart.match(EXTENSION_PATTERN);
  if (!match) return {base, ext: null};

  const ext = match[1];
  if (ext === '2' || ext === '4') {
    return {base, ext};
  }

  return {base, ext: null};
}

export function makeSizeValue(base: string, ext: SizeExtension) {
  return ext === 'none' ? base : `${base} + Extension for ${ext}`;
}
