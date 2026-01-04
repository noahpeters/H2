import type {ReactNode} from 'react';
import {Link} from 'react-router';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  container: {
    width: '100%',
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 6,
    fontSize: '1rem',
    fontFamily: 'inherit',
    color: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  itemSelected: {
    borderColor: '#111827',
  },
  itemUnavailable: {
    opacity: 0.3,
  },
  itemDisabled: {
    cursor: 'not-allowed',
  },
  itemSwatch: {
    padding: '0.35rem',
  },
  itemMedia: {
    padding: '0.35rem',
    width: '5.5rem',
    justifyContent: 'center',
    minHeight: '6.5rem',
  },
  text: {
    whiteSpace: 'nowrap',
  },
  swatch: {
    width: '1.25rem',
    height: '1.25rem',
    margin: '0.25rem 0',
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'inline-flex',
  },
  swatchImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  media: {
    width: '4.5rem',
    height: '4.5rem',
    borderRadius: 6,
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  mediaStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    justifyContent: 'flex-start',
  },
  mediaLabel: {
    fontSize: '0.85rem',
    lineHeight: 1.2,
    textAlign: 'center',
    minHeight: '2.2rem',
    maxWidth: '5rem',
  },
});

export type OptionMedia =
  | string
  | {
      url: string;
      alt?: string | null;
      width?: number | null;
      height?: number | null;
    };

export type OptionPresentation = {
  type?: 'swatch' | 'thumbnail' | 'icon' | 'text';
  label?: string;
  swatchColor?: string;
  image?: OptionMedia;
  icon?: OptionMedia | ReactNode;
};

export type OptionPickerValue = {
  value: string;
  label?: string;
  selected?: boolean;
  available?: boolean;
  exists?: boolean;
  disabled?: boolean;
  swatch?: Maybe<ProductOptionValueSwatch>;
  to?: string;
  onSelect?: (value: string) => void;
};

export type OptionPickerProps = {
  optionName: string;
  values: OptionPickerValue[];
  presentationMap?: Record<string, OptionPresentation>;
  onSelect?: (value: string) => void;
};

export function getOptionPresentationKey(optionName: string, value: string) {
  return `${optionName}::${value}`;
}

export function OptionPicker({
  optionName,
  values,
  presentationMap,
  onSelect,
}: OptionPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={optionName}
      className={stylex(styles.container)}
    >
      <div className={stylex(styles.grid)}>
        {values.map((value) => {
          const normalizedKey = getOptionPresentationKey(
            optionName.trim().toLowerCase(),
            value.value.trim().toLowerCase(),
          );
          const presentation =
            presentationMap?.[
              getOptionPresentationKey(optionName, value.value)
            ] ??
            presentationMap?.[normalizedKey] ??
            presentationMap?.[value.value];
          const label = presentation?.label ?? value.label ?? value.value;
          const mode = resolvePresentationMode(value, presentation);
          const isDisabled = value.disabled || value.exists === false;
          const isAvailable = value.available !== false;
          const isSelected = Boolean(value.selected);
          const content = renderOptionContent({
            label,
            mode,
            presentation,
            swatch: value.swatch,
          });
          const onSelectValue = value.onSelect ?? onSelect ?? null;
          const itemStyles = [
            styles.item,
            mode === 'swatch' && styles.itemSwatch,
            (mode === 'thumbnail' || mode === 'icon') && styles.itemMedia,
            isSelected && styles.itemSelected,
            !isAvailable && styles.itemUnavailable,
            isDisabled && styles.itemDisabled,
          ];

          if (value.to) {
            return (
              <Link
                key={`${optionName}-${value.value}`}
                to={value.to}
                preventScrollReset
                replace
                className={stylex(itemStyles)}
                aria-label={label}
                aria-checked={isSelected}
                aria-disabled={isDisabled}
                role="radio"
                tabIndex={isDisabled ? -1 : undefined}
                onClick={(event) => {
                  if (isDisabled) {
                    event.preventDefault();
                    return;
                  }
                  if (onSelectValue) {
                    void onSelectValue(value.value);
                  }
                }}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={`${optionName}-${value.value}`}
              type="button"
              className={stylex(itemStyles)}
              aria-label={label}
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              role="radio"
              disabled={isDisabled}
              onClick={() => {
                if (onSelectValue) {
                  void onSelectValue(value.value);
                }
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function resolvePresentationMode(
  value: OptionPickerValue,
  presentation?: OptionPresentation,
) {
  if (presentation?.type) return presentation.type;

  const swatchImage = value.swatch?.image?.previewImage?.url;
  const swatchColor = value.swatch?.color;
  if (swatchImage || swatchColor || presentation?.swatchColor) return 'swatch';
  if (presentation?.image) return 'thumbnail';
  if (presentation?.icon) return 'icon';

  return 'text';
}

function renderOptionContent({
  label,
  mode,
  presentation,
  swatch,
}: {
  label: string;
  mode: 'swatch' | 'thumbnail' | 'icon' | 'text';
  presentation?: OptionPresentation;
  swatch?: Maybe<ProductOptionValueSwatch>;
}) {
  if (mode === 'text') {
    return <span className={stylex(styles.text)}>{label}</span>;
  }

  if (mode === 'swatch') {
    const image = swatch?.image?.previewImage?.url;
    const color = swatch?.color ?? presentation?.swatchColor;

    if (image) {
      return (
        <span className={stylex(styles.swatch)} aria-hidden="true">
          <img src={image} alt={label} className={stylex(styles.swatchImage)} />
        </span>
      );
    }

    return (
      <span
        className={stylex(styles.swatch)}
        aria-hidden="true"
        style={{backgroundColor: color || 'transparent'}}
      />
    );
  }

  if (mode === 'thumbnail') {
    return renderMedia(presentation?.image, label);
  }

  return renderMedia(presentation?.icon, label);
}

function renderMedia(
  media: OptionPresentation['icon'] | OptionPresentation['image'],
  label: string,
) {
  if (!media) return <span className={stylex(styles.text)}>{label}</span>;

  let mediaNode: ReactNode;
  if (typeof media === 'string') {
    mediaNode = (
      <span className={stylex(styles.media)} aria-hidden="true">
        <img src={media} alt={label} className={stylex(styles.mediaImage)} />
      </span>
    );
  } else if (typeof media === 'object' && 'url' in media) {
    mediaNode = (
      <span className={stylex(styles.media)} aria-hidden="true">
        <img
          src={media.url}
          alt={media.alt ?? label}
          width={media.width ?? undefined}
          height={media.height ?? undefined}
          className={stylex(styles.mediaImage)}
        />
      </span>
    );
  } else {
    mediaNode = <span className={stylex(styles.media)}>{media}</span>;
  }

  return (
    <span className={stylex(styles.mediaStack)}>
      {mediaNode}
      <span className={stylex(styles.mediaLabel)}>{label}</span>
    </span>
  );
}
