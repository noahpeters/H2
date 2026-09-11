export const CUSTOM_UNIT_VERSION = 1 as const;

export type SectionType =
  | 'doors'
  | 'drawers'
  | 'drawer-stack'
  | 'open'
  | 'shelves'
  | 'open-lower'
  | 'hanging';

export type SectionProperties = {
  shelfCount?: number;
  drawerCount?: number;
  doorCount?: 1 | 2;
  rodHeight?: number;
};

export type CustomUnitSection = {
  id: string;
  type: 'section';
  sectionType: SectionType;
  properties?: SectionProperties;
};

export type CustomUnitDivision = {
  id: string;
  type: 'division';
  axis: 'horizontal' | 'vertical';
  children: CustomUnitNode[];
  /** Relative sizes. They are normalized when layout is calculated. */
  weights: number[];
};

export type CustomUnitNode = CustomUnitSection | CustomUnitDivision;

export type CustomUnitDefinition = {
  version: typeof CUSTOM_UNIT_VERSION;
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  reveal: number;
  root: CustomUnitNode;
};

export const CUSTOM_UNIT_LIMITS = {
  minWidth: 12,
  minHeight: 12,
  minDepth: 8,
  minRegion: 6,
  minReveal: 0.0625,
  maxReveal: 1,
} as const;

let nextId = 0;
export const customUnitId = (prefix = 'section') =>
  `${prefix}-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export function createCustomUnit(
  overrides: Partial<CustomUnitDefinition> = {},
): CustomUnitDefinition {
  return {
    version: CUSTOM_UNIT_VERSION,
    id: customUnitId('unit'),
    name: 'Untitled custom unit',
    width: 48,
    height: 36,
    depth: 24,
    reveal: 0.125,
    root: {id: customUnitId(), type: 'section', sectionType: 'open'},
    ...overrides,
  };
}

export function updateNode(
  node: CustomUnitNode,
  id: string,
  update: (node: CustomUnitNode) => CustomUnitNode,
): CustomUnitNode {
  if (node.id === id) return update(node);
  if (node.type === 'section') return node;
  return {
    ...node,
    children: node.children.map((child) => updateNode(child, id, update)),
  };
}

export function splitSection(
  definition: CustomUnitDefinition,
  sectionId: string,
  axis: CustomUnitDivision['axis'],
): CustomUnitDefinition {
  return {
    ...definition,
    root: updateNode(definition.root, sectionId, (node) => {
      if (node.type !== 'section') return node;
      return {
        id: customUnitId('division'),
        type: 'division',
        axis,
        weights: [1, 1],
        children: [node, {...node, id: customUnitId()}],
      };
    }),
  };
}

export function resizeDivision(
  definition: CustomUnitDefinition,
  divisionId: string,
  weights: number[],
): CustomUnitDefinition {
  return {
    ...definition,
    root: updateNode(definition.root, divisionId, (node) =>
      node.type === 'division' &&
      weights.length === node.children.length &&
      weights.every((weight) => Number.isFinite(weight) && weight > 0)
        ? {...node, weights}
        : node,
    ),
  };
}

export function serializeCustomUnit(definition: CustomUnitDefinition) {
  return JSON.stringify(definition, null, 2);
}

export function deserializeCustomUnit(value: string): CustomUnitDefinition {
  const parsed: unknown = JSON.parse(value);
  const errors = validateCustomUnit(parsed);
  if (errors.length) throw new Error(errors.join('\n'));
  return parsed as CustomUnitDefinition;
}

function validateNode(node: unknown, path: string, errors: string[]) {
  if (!node || typeof node !== 'object') {
    errors.push(`${path} must be a section or division`);
    return;
  }
  const value = node as Partial<CustomUnitNode>;
  if (!value.id || typeof value.id !== 'string')
    errors.push(`${path} needs an id`);
  if (value.type === 'section') {
    const types: SectionType[] = [
      'doors',
      'drawers',
      'drawer-stack',
      'open',
      'shelves',
      'open-lower',
      'hanging',
    ];
    if (!types.includes(value.sectionType as SectionType))
      errors.push(`${path} has an unknown section type`);
    return;
  }
  if (value.type !== 'division') {
    errors.push(`${path} has an unknown node type`);
    return;
  }
  if (value.axis !== 'horizontal' && value.axis !== 'vertical')
    errors.push(`${path} has an invalid axis`);
  if (!Array.isArray(value.children) || value.children.length < 2)
    errors.push(`${path} needs at least two children`);
  if (
    !Array.isArray(value.weights) ||
    value.weights.length !== value.children?.length ||
    value.weights.some((weight) => !Number.isFinite(weight) || weight <= 0)
  )
    errors.push(`${path} needs one positive weight per child`);
  value.children?.forEach((child, index) =>
    validateNode(child, `${path}.children[${index}]`, errors),
  );
}

export function validateCustomUnit(value: unknown): string[] {
  if (!value || typeof value !== 'object')
    return ['Definition must be an object'];
  const unit = value as Partial<CustomUnitDefinition>;
  const errors: string[] = [];
  if (unit.version !== CUSTOM_UNIT_VERSION)
    errors.push(`Unsupported custom-unit version: ${String(unit.version)}`);
  if (!unit.id || typeof unit.id !== 'string')
    errors.push('Definition needs an id');
  if (!unit.name || typeof unit.name !== 'string')
    errors.push('Definition needs a name');
  for (const [field, minimum] of [
    ['width', CUSTOM_UNIT_LIMITS.minWidth],
    ['height', CUSTOM_UNIT_LIMITS.minHeight],
    ['depth', CUSTOM_UNIT_LIMITS.minDepth],
  ] as const) {
    const number = unit[field];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < minimum
    )
      errors.push(`${field} must be at least ${minimum} inches`);
  }
  if (
    typeof unit.reveal !== 'number' ||
    unit.reveal < CUSTOM_UNIT_LIMITS.minReveal ||
    unit.reveal > CUSTOM_UNIT_LIMITS.maxReveal
  )
    errors.push(
      `reveal must be between ${CUSTOM_UNIT_LIMITS.minReveal} and ${CUSTOM_UNIT_LIMITS.maxReveal} inches`,
    );
  validateNode(unit.root, 'root', errors);
  if (!errors.length) {
    const {errors: layoutErrors} = layoutCustomUnit(
      unit as CustomUnitDefinition,
    );
    errors.push(...layoutErrors);
  }
  return errors;
}

export type RegionLayout = {
  id: string;
  section: CustomUnitSection;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function layoutCustomUnit(definition: CustomUnitDefinition): {
  regions: RegionLayout[];
  errors: string[];
} {
  const regions: RegionLayout[] = [],
    errors: string[] = [];
  const visit = (
    node: CustomUnitNode,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    if (node.type === 'section') {
      if (
        width < CUSTOM_UNIT_LIMITS.minRegion ||
        height < CUSTOM_UNIT_LIMITS.minRegion
      )
        errors.push(
          `${node.id} is smaller than ${CUSTOM_UNIT_LIMITS.minRegion} inches`,
        );
      regions.push({id: node.id, section: node, x, y, width, height});
      return;
    }
    const total = node.weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = node.axis === 'vertical' ? x : y;
    node.children.forEach((child, index) => {
      const share = node.weights[index] / total;
      const childWidth = node.axis === 'vertical' ? width * share : width;
      const childHeight = node.axis === 'horizontal' ? height * share : height;
      visit(
        child,
        node.axis === 'vertical' ? cursor : x,
        node.axis === 'horizontal' ? cursor : y,
        childWidth,
        childHeight,
      );
      cursor += node.axis === 'vertical' ? childWidth : childHeight;
    });
  };
  visit(definition.root, 0, 0, definition.width, definition.height);
  return {regions, errors};
}
