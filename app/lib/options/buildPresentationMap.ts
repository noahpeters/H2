import {
  getOptionPresentationKey,
  type OptionPresentation,
  type OptionMedia,
} from '~/components/OptionPicker';

export type OptionPresentationEntry = {
  optionName?: string | null;
  option_name?: string | null;
  value?: string | null;
  label?: string | null;
  description?: string | null;
  sortOrder?: string | number | null;
  sort_order?: string | number | null;
  type?: OptionPresentation['type'];
  swatchColor?: string | null;
  image?: unknown;
  icon?: unknown;
};

type MediaLike =
  | string
  | {
      url?: string | null;
      alt?: string | null;
      altText?: string | null;
      width?: number | null;
      height?: number | null;
      image?: {
        url?: string | null;
        altText?: string | null;
        width?: number | null;
        height?: number | null;
      } | null;
      previewImage?: {
        url?: string | null;
        altText?: string | null;
        width?: number | null;
        height?: number | null;
      } | null;
    };

export function buildPresentationMap(
  entries: OptionPresentationEntry[] | null | undefined,
): Record<string, OptionPresentation> {
  if (!entries?.length) return {};

  return entries.reduce<Record<string, OptionPresentation>>((map, entry) => {
    const optionName = entry.optionName ?? entry.option_name ?? null;
    const value = entry.value ?? null;

    if (!optionName || !value) {
      return map;
    }

    const image = resolveMedia(entry.image as MediaLike);
    const icon = resolveMedia(entry.icon as MediaLike);

    const key = getOptionPresentationKey(optionName, value);
    const normalizedKey = getOptionPresentationKey(
      optionName.trim().toLowerCase(),
      value.trim().toLowerCase(),
    );

    const presentation = {
      type: entry.type ?? undefined,
      label: entry.label ?? undefined,
      description: entry.description ?? undefined,
      sortOrder: coerceSortOrder(entry.sortOrder ?? entry.sort_order),
      swatchColor: entry.swatchColor ?? undefined,
      image,
      icon,
    };

    map[key] = presentation;
    map[normalizedKey] = presentation;
    return map;
  }, {});
}

function resolveMedia(media: MediaLike | null | undefined): OptionMedia | undefined {
  if (!media) return undefined;
  if (typeof media === 'string') return media;

  if (typeof media === 'object') {
    if (media.url) {
      return {
        url: media.url,
        alt: media.altText ?? media.alt ?? null,
        width: media.width ?? null,
        height: media.height ?? null,
      };
    }

    if (media.image?.url) {
      return {
        url: media.image.url,
        alt: media.image.altText ?? null,
        width: media.image.width ?? null,
        height: media.image.height ?? null,
      };
    }

    if (media.previewImage?.url) {
      return {
        url: media.previewImage.url,
        alt: media.previewImage.altText ?? null,
        width: media.previewImage.width ?? null,
        height: media.previewImage.height ?? null,
      };
    }
  }

  return undefined;
}

function coerceSortOrder(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
