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
    transition: 'width 200ms ease, min-height 200ms ease',
  },
  itemMediaSelected: {
    width: 'auto',
    minHeight: 'auto',
    alignItems: 'flex-start',
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
  swatchRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  swatchDescription: {
    fontSize: '0.85rem',
    lineHeight: 1.2,
    maxWidth: '12rem',
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
  descriptionRow: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  descriptionText: {
    fontSize: '0.85rem',
    lineHeight: 1.2,
  },
  descriptionDivider: {
    width: 0,
    alignSelf: 'stretch',
    backgroundColor: 'var(--color-primary)',
    opacity: 0,
    transform: 'scaleY(0.6)',
    transition: 'none',
  },
  descriptionDividerExpanded: {
    width: 1,
    opacity: 1,
    transform: 'scaleY(1)',
    transition: 'width 200ms ease, opacity 200ms ease, transform 200ms ease',
  },
  descriptionPanel: {
    maxWidth: 0,
    maxHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    transform: 'translateX(-4px)',
    transition: 'none',
  },
  descriptionPanelExpanded: {
    maxWidth: '14rem',
    maxHeight: '6rem',
    opacity: 1,
    transform: 'translateX(0)',
    transition:
      'max-width 200ms ease, max-height 200ms ease, opacity 200ms ease, transform 200ms ease',
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
  description?: string;
  sortOrder?: number;
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
  const sortedValues = sortValuesByPresentation(values, optionName, presentationMap);

  return (
    <div
      role="radiogroup"
      aria-label={optionName}
      className={stylex(styles.container)}
    >
      <div className={stylex(styles.grid)}>
        {sortedValues.map((value) => {
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
            isSelected,
          });
          const hasSelectedDescription =
            isSelected && Boolean(presentation?.description);
          const onSelectValue = value.onSelect ?? onSelect ?? null;
          const itemStyles = [
            styles.item,
            mode === 'swatch' && styles.itemSwatch,
            (mode === 'thumbnail' || mode === 'icon') && styles.itemMedia,
            hasSelectedDescription &&
              (mode === 'thumbnail' || mode === 'icon') &&
              styles.itemMediaSelected,
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

function sortValuesByPresentation(
  values: OptionPickerValue[],
  optionName: string,
  presentationMap?: Record<string, OptionPresentation>,
) {
  if (!presentationMap) return values;

  const normalizedOption = optionName.trim().toLowerCase();
  const keyedValues = values.map((value, index) => {
    const rawKey = getOptionPresentationKey(optionName, value.value);
    const normalizedKey = getOptionPresentationKey(
      normalizedOption,
      value.value.trim().toLowerCase(),
    );
    const presentation =
      presentationMap[rawKey] ??
      presentationMap[normalizedKey] ??
      presentationMap[value.value];
    return {
      value,
      index,
      sortOrder: presentation?.sortOrder,
    };
  });

  return keyedValues
    .slice()
    .sort((a, b) => {
      if (a.sortOrder == null && b.sortOrder == null) {
        return a.index - b.index;
      }
      if (a.sortOrder == null) return 1;
      if (b.sortOrder == null) return -1;
      if (a.sortOrder === b.sortOrder) return a.index - b.index;
      return a.sortOrder - b.sortOrder;
    })
    .map((entry) => entry.value);
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
  isSelected,
}: {
  label: string;
  mode: 'swatch' | 'thumbnail' | 'icon' | 'text';
  presentation?: OptionPresentation;
  swatch?: Maybe<ProductOptionValueSwatch>;
  isSelected: boolean;
}) {
  if (mode === 'text') {
    return <span className={stylex(styles.text)}>{label}</span>;
  }

  if (mode === 'swatch') {
    const image = swatch?.image?.previewImage?.url;
    const color = swatch?.color ?? presentation?.swatchColor;
    const description = presentation?.description ?? '';

    const swatchNode = image ? (
      <span className={stylex(styles.swatch)} aria-hidden="true">
        <img src={image} alt={label} className={stylex(styles.swatchImage)} />
      </span>
    ) : (
      <span
        className={stylex(styles.swatch)}
        aria-hidden="true"
        style={{backgroundColor: color || 'transparent'}}
      />
    );

    if (description) {
      return (
        <span className={stylex(styles.swatchRow)}>
          {swatchNode}
          <span
            className={stylex(
              styles.descriptionDivider,
              isSelected && styles.descriptionDividerExpanded,
            )}
            aria-hidden
          />
          <span
            className={stylex(
              styles.descriptionPanel,
              isSelected && styles.descriptionPanelExpanded,
            )}
          >
            <span className={stylex(styles.swatchDescription)}>
              {description}
            </span>
          </span>
        </span>
      );
    }

    return swatchNode;
  }

  if (mode === 'thumbnail') {
    const media = renderMedia(presentation?.image, label);
    const description = presentation?.description ?? '';
    if (description) {
      return (
        <span className={stylex(styles.descriptionRow)}>
          {media}
          <span
            className={stylex(
              styles.descriptionDivider,
              isSelected && styles.descriptionDividerExpanded,
            )}
            aria-hidden
          />
          <span
            className={stylex(
              styles.descriptionPanel,
              isSelected && styles.descriptionPanelExpanded,
            )}
          >
            <span className={stylex(styles.descriptionText)}>
              {description}
            </span>
          </span>
        </span>
      );
    }
    return media;
  }

  const media = renderMedia(presentation?.icon, label);
  const description = presentation?.description ?? '';
  if (description) {
    return (
      <span className={stylex(styles.descriptionRow)}>
        {media}
        <span
          className={stylex(
            styles.descriptionDivider,
            isSelected && styles.descriptionDividerExpanded,
          )}
          aria-hidden
        />
        <span
          className={stylex(
            styles.descriptionPanel,
            isSelected && styles.descriptionPanelExpanded,
          )}
        >
          <span className={stylex(styles.descriptionText)}>{description}</span>
        </span>
      </span>
    );
  }
  return media;
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
