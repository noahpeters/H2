import {useMemo} from 'react';
import {useLocation} from 'react-router';
import {
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
} from '@shopify/hydrogen';
import type {ProductFragment} from 'storefrontapi.generated';
import {buildPresentationMap} from '~/lib/options/buildPresentationMap';
import {
  parseLineItemFieldSet,
  type MetaobjectField,
} from '~/lib/cart/lineItemFieldSet';
import {
  parseWoodColorPalette,
  type MetaobjectField as PaletteMetaobjectField,
} from '~/lib/options/woodColorPalettes';

export function useProductCustomization(
  product: ProductFragment,
  lineItemFieldSetReference: unknown,
) {
  // Optimistically selects a variant with given available variant information
  const optimisticVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );
  const location = useLocation();
  const selectedVariantFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (params.size === 0) return null;
    const baseOptions =
      product.selectedOrFirstAvailableVariant?.selectedOptions ??
      optimisticVariant?.selectedOptions ??
      [];
    if (baseOptions.length === 0) return null;
    const mergedOptions = baseOptions.map((option) => ({
      name: option.name,
      value: params.get(option.name) ?? option.value,
    }));
    return (
      product.variants.nodes.find((variant) =>
        (variant.selectedOptions ?? []).every(
          (option) =>
            mergedOptions.find((merged) => merged.name === option.name)
              ?.value === option.value,
        ),
      ) ?? null
    );
  }, [
    location.search,
    optimisticVariant?.selectedOptions,
    product.selectedOrFirstAvailableVariant?.selectedOptions,
    product.variants.nodes,
  ]);
  const selectedVariant = selectedVariantFromUrl ?? optimisticVariant;

  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  const productWithSelection = {
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  };
  const optionUiEntries = getOptionUiEntries(product);
  const presentationMap = buildPresentationMap(optionUiEntries);
  const woodColorPalettes = getWoodColorPalettes(product);
  const lineItemFieldSet = lineItemFieldSetReference
    ? parseLineItemFieldSet(
        lineItemFieldSetReference as {fields?: MetaobjectField[] | null},
      )
    : null;
  const optionUiNodes = (
    product as ProductFragment & {
      option_ui?: {references?: {nodes?: unknown[]}};
    }
  ).option_ui?.references?.nodes;
  const hasPresentationMap = (optionUiNodes?.length ?? 0) > 0;
  const productOptions = getProductOptions(productWithSelection);

  return {
    selectedVariant,
    productWithSelection,
    presentationMap,
    woodColorPalettes,
    lineItemFieldSet,
    hasPresentationMap,
    productOptions,
  };
}

type OptionUiField = {
  key: string;
  value?: string | null;
  type?: string | null;
  reference?: unknown;
};

function getOptionUiEntries(product: ProductFragment) {
  const optionUi = (
    product as ProductFragment & {
      optionUi?: {
        references?: {
          nodes?: Array<{
            __typename?: string;
            fields?: OptionUiField[];
          }>;
        };
      };
      option_ui?: {
        references?: {
          nodes?: Array<{
            __typename?: string;
            fields?: OptionUiField[];
          }>;
        };
      };
    }
  ).optionUi;
  const optionUiLegacyAlias = (
    product as ProductFragment & {
      option_ui?: {
        references?: {
          nodes?: Array<{
            __typename?: string;
            fields?: OptionUiField[];
          }>;
        };
      };
    }
  ).option_ui;

  const nodes =
    optionUi?.references?.nodes ?? optionUiLegacyAlias?.references?.nodes ?? [];

  return nodes
    .map((node: {fields?: OptionUiField[]}) => {
      const fields = node.fields ?? [];
      const fieldMap: Record<string, OptionUiField> = {};

      for (const field of fields) {
        fieldMap[field.key] = field;
      }

      return {
        optionName:
          fieldMap.option_name?.value ??
          fieldMap.optionName?.value ??
          fieldMap.option?.value ??
          null,
        value: fieldMap.value?.value ?? null,
        label: fieldMap.label?.value ?? null,
        description: fieldMap.description?.value ?? null,
        sortOrder:
          fieldMap.sort_order?.value ?? fieldMap.sortOrder?.value ?? null,
        type: (fieldMap.type?.value ?? undefined) as
          | 'swatch'
          | 'thumbnail'
          | 'icon'
          | 'text'
          | undefined,
        swatchColor:
          fieldMap.swatch_color?.value ?? fieldMap.swatchColor?.value ?? null,
        image: fieldMap.image?.reference,
        icon: fieldMap.icon?.reference,
      };
    })
    .filter((entry: {optionName: string | null; value: string | null}) =>
      Boolean(entry.optionName && entry.value),
    );
}

function getWoodColorPalettes(product: ProductFragment) {
  const palettes = getWoodColorPalettesRaw(product);
  return (
    palettes
      ?.filter((node): node is {fields?: PaletteMetaobjectField[] | null} =>
        Boolean(node && 'fields' in node),
      )
      .map((node) => parseWoodColorPalette(node))
      .filter(
        (palette): palette is NonNullable<typeof palette> => palette != null,
      ) ?? []
  );
}

function getWoodColorPalettesRaw(product: ProductFragment) {
  return (
    (
      product as ProductFragment & {
        wood_color_palettes?: {
          references?: {
            nodes?: Array<{
              fields?: PaletteMetaobjectField[] | null;
            } | null> | null;
          } | null;
        } | null;
      }
    ).wood_color_palettes?.references?.nodes ?? null
  );
}
