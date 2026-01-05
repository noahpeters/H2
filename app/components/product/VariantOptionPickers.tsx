import {VariantSelector, type VariantOption} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import {
  OptionPicker,
  type OptionPickerValue,
  type OptionPresentation,
} from '~/components/OptionPicker';
import {
  makeSizeValue,
  parseSizeValue,
  type SizeExtension,
} from '~/lib/options/sizeOption';

const SIZE_OPTION_NAME = 'seating capacity';

type VariantOptionPickersProps = {
  product: ProductFragment;
  presentationMap?: Record<string, OptionPresentation>;
};

export function VariantOptionPickers({
  product,
  presentationMap,
}: VariantOptionPickersProps) {
  return (
    <VariantSelector
      handle={product.handle}
      options={product.options as any}
      variants={product.adjacentVariants as any}
      selectedVariant={product.selectedOrFirstAvailableVariant as any}
    >
      {({option}) => {
        if (!option.values.length || option.values.length === 1) {
          return null;
        }

        if (option.name.trim().toLowerCase() === SIZE_OPTION_NAME) {
          return (
            <SizeOptionPicker
              key={option.name}
              option={option}
              presentationMap={presentationMap}
            />
          );
        }

        const values: OptionPickerValue[] = option.values.map((value) => ({
          value: value.value,
          selected: value.isActive,
          available: value.isAvailable,
          disabled: !value.isAvailable,
          to: value.to,
          exists: true,
          swatch: value.optionValue?.swatch as OptionPickerValue['swatch'],
        }));

        return (
          <div key={option.name}>
            <h5>{option.name}</h5>
            <OptionPicker
              optionName={option.name}
              values={values}
              presentationMap={presentationMap}
            />
            <br />
          </div>
        );
      }}
    </VariantSelector>
  );
}

type SizeOptionEntry = {
  base: string;
  ext: SizeExtension;
  value: VariantOption['values'][number];
};

function SizeOptionPicker({
  option,
  presentationMap,
}: {
  option: VariantOption;
  presentationMap?: Record<string, OptionPresentation>;
}) {
  const parsedEntries = option.values
    .map((value) => {
      const parsed = parseSizeValue(value.value);
      if (!parsed.base || !parsed.ext) return null;
      return {base: parsed.base, ext: parsed.ext, value};
    })
    .filter((entry): entry is SizeOptionEntry => entry != null);

  if (!parsedEntries.length) {
    const fallbackValues: OptionPickerValue[] = option.values.map((value) => ({
      value: value.value,
      selected: value.isActive,
      available: value.isAvailable,
      disabled: !value.isAvailable,
      to: value.to,
      exists: true,
      swatch: value.optionValue?.swatch as OptionPickerValue['swatch'],
    }));

    return (
      <div key={option.name}>
        <h5>{option.name}</h5>
        <OptionPicker optionName={option.name} values={fallbackValues} />
        <br />
      </div>
    );
  }

  const baseOrder: string[] = [];
  const baseSet = new Set<string>();
  const valueMap = new Map(
    option.values.map((value) => [value.value, value]),
  );

  for (const entry of parsedEntries) {
    if (!baseSet.has(entry.base)) {
      baseSet.add(entry.base);
      baseOrder.push(entry.base);
    }
  }

  const activeValue = option.values.find((value) => value.isActive);
  const activeParsed = activeValue ? parseSizeValue(activeValue.value) : null;
  const selectedBase = activeParsed?.base ?? null;
  const selectedExt = activeParsed?.ext ?? null;

  const resolveEntryForBase = (
    base: string,
    extPreference: SizeExtension | null,
  ) => {
    const preferredExt = extPreference ?? 'none';
    const preferredValue = valueMap.get(makeSizeValue(base, preferredExt));
    if (preferredValue?.isAvailable) return preferredValue;

    const noExtensionValue = valueMap.get(makeSizeValue(base, 'none'));
    if (noExtensionValue?.isAvailable) return noExtensionValue;

    const extOrder: SizeExtension[] = ['none', '2', '4'];
    for (const ext of extOrder) {
      const entry = valueMap.get(makeSizeValue(base, ext));
      if (entry?.isAvailable) return entry;
    }

    return preferredValue ?? noExtensionValue ?? undefined;
  };

  const getBaseDefaultValue = (base: string) => {
    return (
      valueMap.get(makeSizeValue(base, 'none')) ??
      valueMap.get(makeSizeValue(base, '2')) ??
      valueMap.get(makeSizeValue(base, '4'))
    );
  };

  const getBaseSwatch = (base: string) => {
    return getBaseDefaultValue(base)?.optionValue?.swatch;
  };

  const baseValues: OptionPickerValue[] = baseOrder.map((base) => {
    const defaultValue = getBaseDefaultValue(base);
    const targetValue = resolveEntryForBase(base, selectedExt);
    const hasAny = Boolean(defaultValue);
    const hasAvailable = parsedEntries.some(
      (entry) => entry.base === base && entry.value.isAvailable,
    );

    return {
      value: defaultValue?.value ?? base,
      label: base,
      selected: selectedBase === base,
      available: hasAvailable,
      disabled: !hasAvailable,
      to: targetValue?.to,
      exists: hasAny,
      swatch: getBaseSwatch(base) as OptionPickerValue['swatch'],
    };
  });

  const extensions: SizeExtension[] = ['none', '2', '4'];
  const extensionValues: OptionPickerValue[] = selectedBase
    ? extensions.map((ext) => {
        const targetValue = valueMap.get(makeSizeValue(selectedBase, ext));
        const exists = Boolean(targetValue);
        return {
          value: targetValue?.value ?? makeSizeValue(selectedBase, ext),
          label: ext === 'none' ? 'No extension' : `+${ext} seats`,
          selected: selectedExt ? selectedExt === ext : ext === 'none',
          available: targetValue?.isAvailable ?? false,
          disabled: !targetValue?.isAvailable,
          to: targetValue?.to,
          exists,
          swatch: targetValue?.optionValue?.swatch as OptionPickerValue['swatch'],
        };
      })
    : [];

  // Extend this pattern for other hierarchies (e.g., Wood Species -> Color)
  // by adding a parse/make pair and mapping it into multiple OptionPicker steps.

  return (
    <div key={option.name}>
      <h5>{option.name}</h5>
      <h6>Base size</h6>
      <OptionPicker
        optionName={option.name}
        values={baseValues}
        presentationMap={presentationMap}
      />
      {selectedBase ? (
        <>
          <br />
          <h6>Extensions</h6>
          <OptionPicker
            optionName={option.name}
            values={extensionValues}
            presentationMap={presentationMap}
          />
        </>
      ) : null}
      <br />
    </div>
  );
}
