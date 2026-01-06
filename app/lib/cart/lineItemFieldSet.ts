export type MetaobjectField = {
  key: string;
  type?: string | null;
  value?: string | null;
  reference?: unknown;
  references?: {nodes?: Array<{fields?: MetaobjectField[]}>};
};

export type LineItemField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'select';
  helpText?: string;
  sortOrder: number;
  required?: boolean;
  maxLength?: number;
  showWhenOptionName?: string;
  showWhenOptionValue?: string;
  choices?: string[];
};

export type LineItemFieldSet = {
  title: string;
  fields: LineItemField[];
};

// Line item field sets let products share customization definitions without
// duplicating variant data; they become cart line attributes at add-to-cart.
export function parseMetaobjectFields(fields: MetaobjectField[] | null | undefined) {
  return (fields ?? []).reduce<Record<string, string>>((acc, field) => {
    if (field.key && field.value != null) {
      acc[field.key] = field.value;
    }
    return acc;
  }, {});
}

export function parseLineItemField(metaobject: {
  fields?: MetaobjectField[] | null;
}): LineItemField | null {
  const fieldMap = parseMetaobjectFields(metaobject.fields);

  const key =
    fieldMap.key?.trim() ??
    fieldMap.attribute_key?.trim() ??
    fieldMap.attributeKey?.trim() ??
    '';
  const label =
    fieldMap.label?.trim() ??
    fieldMap.title?.trim() ??
    fieldMap.name?.trim() ??
    '';
  const rawType = fieldMap.type?.trim().toLowerCase();
  const type =
    rawType === 'text' ||
    rawType === 'textarea' ||
    rawType === 'url' ||
    rawType === 'select'
      ? rawType
      : undefined;

  if (!key || !label || !type) return null;

  const sortOrder = Number(fieldMap.sort_order ?? 0);
  const maxLength = fieldMap.max_length ? Number(fieldMap.max_length) : undefined;
  const required =
    fieldMap.required != null ? fieldMap.required.toLowerCase() === 'true' : undefined;
  const choicesSource = fieldMap.choices ?? fieldMap.options;
  const choices = choicesSource
    ? choicesSource
        .split('\n')
        .map((choice) => choice.trim())
        .filter(Boolean)
    : undefined;

  return {
    key,
    label,
    type,
    helpText: fieldMap.help_text ?? undefined,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    required,
    maxLength: maxLength && Number.isFinite(maxLength) ? maxLength : undefined,
    showWhenOptionName: fieldMap.show_when_option_name ?? undefined,
    showWhenOptionValue: fieldMap.show_when_option_value ?? undefined,
    choices,
  };
}

export function parseLineItemFieldSet(metaobject: {
  fields?: MetaobjectField[] | null;
}): LineItemFieldSet | null {
  const fieldMap = parseMetaobjectFields(metaobject.fields);
  const title =
    fieldMap.title?.trim() ?? fieldMap.name?.trim() ?? fieldMap.label?.trim();

  const fieldsEntry = metaobject.fields?.find((field) => field.key === 'fields');
  const referenceSource =
    fieldsEntry?.references?.nodes ??
    metaobject.fields?.find((field) => field.references?.nodes)?.references
      ?.nodes ??
    [];
  const fieldRefs = referenceSource
    .map((node) => parseLineItemField(node))
    .filter((field): field is LineItemField => field != null);

  const fields = fieldRefs.sort((a, b) => a.sortOrder - b.sortOrder);

  if (!fields.length) return null;

  return {title: title || 'Customization', fields};
}
