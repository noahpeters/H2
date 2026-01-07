export type MetaobjectField = {
  key: string;
  type?: string | null;
  value?: string | null;
  reference?: unknown;
  references?: {nodes?: Array<{fields?: MetaobjectField[]} | null>};
};

export type ColorSwatch = {
  label: string;
  value: string;
  image?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  };
  sortOrder: number;
  description?: string;
};

export type WoodColorPalette = {
  woodOptionName: string;
  woodOptionValue: string;
  title?: string;
  swatches: ColorSwatch[];
};

export function parseMetaobjectFields(
  fields: MetaobjectField[] | null | undefined,
) {
  return (fields ?? []).reduce<Record<string, string>>((acc, field) => {
    if (field.key && field.value != null) {
      acc[field.key] = field.value;
    }
    return acc;
  }, {});
}

export function parseColorSwatch(metaobject: {
  fields?: MetaobjectField[] | null;
}): ColorSwatch | null {
  const fieldMap = parseMetaobjectFields(metaobject.fields);

  const label = fieldMap.label?.trim();
  const value = fieldMap.value?.trim();
  if (!label || !value) return null;

  const sortOrder = Number(fieldMap.sort_order ?? Number.POSITIVE_INFINITY);
  const imageField = metaobject.fields?.find((field) => field.key === 'image');
  const imageReference = imageField?.reference as
    | {
        image?: {
          url?: string | null;
          altText?: string | null;
          width?: number | null;
          height?: number | null;
        };
        url?: string | null;
        altText?: string | null;
        width?: number | null;
        height?: number | null;
      }
    | null
    | undefined;
  const imageUrl = imageReference?.image?.url ?? imageReference?.url ?? null;
  const image = imageUrl
    ? {
        url: imageUrl,
        altText: imageReference?.image?.altText ?? imageReference?.altText ?? null,
        width: imageReference?.image?.width ?? imageReference?.width ?? null,
        height: imageReference?.image?.height ?? imageReference?.height ?? null,
      }
    : undefined;

  return {
    label,
    value,
    image,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : Number.POSITIVE_INFINITY,
    description: fieldMap.description ?? undefined,
  };
}

export function parseWoodColorPalette(metaobject: {
  fields?: MetaobjectField[] | null;
}): WoodColorPalette | null {
  const fieldMap = parseMetaobjectFields(metaobject.fields);
  const woodOptionName = fieldMap.wood_option_name?.trim();
  const woodOptionValue = fieldMap.wood_option_value?.trim();
  if (!woodOptionName || !woodOptionValue) return null;

  const swatchField = metaobject.fields?.find(
    (field) => field.key === 'swatches',
  );
  const swatches =
    swatchField?.references?.nodes
      ?.map((node) => parseColorSwatch(node ?? {}))
      .filter((swatch): swatch is ColorSwatch => swatch != null)
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  return {
    woodOptionName,
    woodOptionValue,
    title: fieldMap.title ?? undefined,
    swatches,
  };
}

export function buildPaletteMatch(
  palettes: WoodColorPalette[],
  selectedOptions: Array<{name?: string | null; value?: string | null}>,
) {
  const normalizedOptions = selectedOptions.map((option) => ({
    name: option.name?.trim().toLowerCase() ?? '',
    value: option.value?.trim().toLowerCase() ?? '',
  }));

  for (const palette of palettes) {
    const paletteName = palette.woodOptionName.trim().toLowerCase();
    const paletteValue = palette.woodOptionValue.trim().toLowerCase();
    const match = normalizedOptions.find(
      (option) =>
        option.name === paletteName && option.value === paletteValue,
    );
    if (match?.value) {
      return {palette, selectedWoodValue: match.value};
    }
  }

  return null;
}
