import {VariantSelector} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import {
  OptionPicker,
  type OptionPickerValue,
  type OptionPresentation,
} from '~/components/OptionPicker';

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
