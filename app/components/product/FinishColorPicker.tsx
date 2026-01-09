import stylex from '~/lib/stylex';
import {
  buildPaletteMatch,
  type WoodColorPalette,
} from '~/lib/options/woodColorPalettes';
import {
  OptionPicker,
  type OptionPickerValue,
  type OptionPresentation,
  getOptionPresentationKey,
} from '~/components/OptionPicker';

const styles = stylex.create({
  section: {
    marginBottom: '1rem',
  },
  title: {
    marginBottom: '0.5rem',
  },
});

export function FinishColorPicker({
  palettes,
  selectedOptions,
  selectedFinishColorLabel,
  onChange,
  isLoading = false,
}: {
  palettes: WoodColorPalette[];
  selectedOptions: Array<{name?: string | null; value?: string | null}>;
  selectedFinishColorLabel: string | null;
  onChange: (label: string) => void;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className={stylex(styles.section)}>
        <h5 className={stylex(styles.title)}>Finish Color</h5>
        <div className="skeleton-row" aria-hidden="true">
          {Array.from({length: 6}).map((_, index) => (
            <span key={index} className="skeleton skeleton-swatch" />
          ))}
        </div>
      </div>
    );
  }

  const match = buildPaletteMatch(palettes, selectedOptions);
  if (!match || !match.palette.swatches.length) return null;

  const values: OptionPickerValue[] = match.palette.swatches.map((swatch) => ({
    value: swatch.label,
    label: swatch.label,
    selected: swatch.label === selectedFinishColorLabel,
    available: true,
    exists: true,
  }));

  const presentationMap = match.palette.swatches.reduce<
    Record<string, OptionPresentation>
  >((map, swatch) => {
    const key = getOptionPresentationKey('Finish Color', swatch.label);
    map[key] = {
      type: 'thumbnail',
      label: swatch.label,
      image: swatch.image
        ? {
            url: swatch.image.url,
            alt: swatch.image.altText ?? swatch.label,
            width: swatch.image.width ?? undefined,
            height: swatch.image.height ?? undefined,
          }
        : undefined,
      imageShape: 'circle',
      description: swatch.description ?? undefined,
    };
    return map;
  }, {});

  return (
    <div className={stylex(styles.section)}>
      <h5 className={stylex(styles.title)}>
        {match.palette.title ?? 'Finish Color'}
      </h5>
      <OptionPicker
        optionName="Finish Color"
        values={values}
        presentationMap={presentationMap}
        onSelect={onChange}
      />
    </div>
  );
}
