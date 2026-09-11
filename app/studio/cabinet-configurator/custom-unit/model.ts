import type {DoorMechanism} from './doorGeometry';
import type {CabinetCurve} from './curves';
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

export type CabinetPart = {
  id: string;
  kind: 'carcass' | 'divider' | 'door' | 'drawer' | 'shelf' | 'rod' | 'panel';
  name?: string;
  faceStyle?:
    | 'slab'
    | 'shaker'
    | 'inset-shaker'
    | 'vertical-slat'
    | 'shaker-glass';
  door?: {
    mechanism: DoorMechanism;
    side: 'left' | 'right';
    travel: number;
    slatSize: number;
    direction?: 'vertical' | 'horizontal';
  };
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  sectionId?: string;
  profileMode?: 'cabinet' | 'independent';
  shape?: 'rectangular' | 'round-left' | 'round-right';
  edges?: {
    left: 'square' | 'convex' | 'concave';
    right: 'square' | 'convex' | 'concave';
    radius: number;
  };
};

export type CustomUnitDefinition = {
  version: typeof CUSTOM_UNIT_VERSION;
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  reveal: number;
  root: CustomUnitNode;
  /** Optional explicit physical layout. Legacy region definitions remain supported. */
  parts?: CabinetPart[];
  curve?: CabinetCurve;
  /** One front outline shared by all cabinet parts unless explicitly detached. */
  profile?: NonNullable<CabinetPart['edges']>;
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
    if (value.properties !== undefined) {
      const props = value.properties;
      if (!props || typeof props !== 'object')
        errors.push(`${path} has invalid section properties`);
      else {
        for (const key of ['shelfCount', 'drawerCount'] as const) {
          const count = props[key];
          if (
            count !== undefined &&
            (!Number.isInteger(count) || count < 0 || count > 100)
          )
            errors.push(`${path} has invalid ${key}`);
        }
        if (
          props.doorCount !== undefined &&
          props.doorCount !== 1 &&
          props.doorCount !== 2
        )
          errors.push(`${path} needs one or two doors`);
        if (
          props.rodHeight !== undefined &&
          (!Number.isFinite(props.rodHeight) ||
            props.rodHeight < 0 ||
            props.rodHeight > 1000)
        )
          errors.push(`${path} has invalid rod height`);
      }
    }
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
  if (Array.isArray(value.children))
    value.children.forEach((child, index) =>
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
      number < minimum ||
      number > 1000
    )
      errors.push(`${field} must be at least ${minimum} inches`);
  }
  if (
    typeof unit.reveal !== 'number' ||
    !Number.isFinite(unit.reveal) ||
    unit.reveal < CUSTOM_UNIT_LIMITS.minReveal ||
    unit.reveal > CUSTOM_UNIT_LIMITS.maxReveal
  )
    errors.push(
      `reveal must be between ${CUSTOM_UNIT_LIMITS.minReveal} and ${CUSTOM_UNIT_LIMITS.maxReveal} inches`,
    );
  if (unit.profile !== undefined) {
    const profile = unit.profile;
    if (
      !profile ||
      !['square', 'convex', 'concave'].includes(profile.left) ||
      !['square', 'convex', 'concave'].includes(profile.right) ||
      !Number.isFinite(profile.radius) ||
      profile.radius <= 0 ||
      profile.radius > Math.min((unit.width ?? 0) / 2, (unit.depth ?? 0) - 0.75)
    )
      errors.push(
        'Cabinet profile radius must fit within half the width and leave at least 3/4 inch of depth',
      );
  }
  if (unit.curve !== undefined) {
    const curve = unit.curve;
    if (
      !curve ||
      !['cabinet', 'front'].includes(curve.scope) ||
      !['arc', 'rounded-left', 'rounded-right', 'rounded-both'].includes(
        curve.profile,
      ) ||
      !['inward', 'outward'].includes(curve.direction) ||
      !Number.isFinite(curve.radius)
    )
      errors.push('Invalid cabinet curve');
    else if (curve.profile === 'arc') {
      if (curve.radius <= (unit.width ?? 0) / 2)
        errors.push('Curve radius must exceed half the cabinet width');
      else {
        const sag =
          curve.radius -
          Math.sqrt(curve.radius ** 2 - ((unit.width ?? 0) / 2) ** 2);
        if (
          curve.scope === 'front' &&
          curve.direction === 'inward' &&
          sag >= (unit.depth ?? 0) - 0.75
        )
          errors.push('Inward curve leaves insufficient cabinet depth');
        if (
          curve.scope === 'cabinet' &&
          curve.direction === 'inward' &&
          curve.radius <= (unit.depth ?? 0) + 0.75
        )
          errors.push('Curve radius must exceed cabinet depth');
      }
    } else if (
      curve.scope !== 'front' ||
      curve.radius <= 0 ||
      curve.radius > Math.min((unit.width ?? 0) / 2, (unit.depth ?? 0) - 0.75)
    )
      errors.push(
        'Rounded ends need a front curve with a radius within half the width and cabinet depth',
      );
  }
  if (unit.parts !== undefined) {
    if (!Array.isArray(unit.parts) || unit.parts.length > 500)
      errors.push('Parts must be a list of at most 500 items');
    else {
      const ids = new Set<string>();
      for (const part of unit.parts) {
        if (!part || typeof part !== 'object') {
          errors.push('Invalid part');
          continue;
        }
        if (typeof part.id !== 'string' || !part.id || ids.has(part.id))
          errors.push('Parts need unique IDs');
        ids.add(part.id);
        if (
          part.faceStyle !== undefined &&
          (!['door', 'drawer'].includes(part.kind) ||
            ![
              'slab',
              'shaker',
              'inset-shaker',
              'vertical-slat',
              'shaker-glass',
            ].includes(part.faceStyle))
        )
          errors.push('Invalid part face style');
        if (
          part.profileMode !== undefined &&
          !['cabinet', 'independent'].includes(part.profileMode)
        )
          errors.push('Invalid part profile mode');
        if (
          part.door &&
          (part.kind !== 'door' ||
            !['hinged', 'pocket', 'tambour', 'lift-up', 'pull-down'].includes(
              part.door.mechanism,
            ) ||
            !['left', 'right'].includes(part.door.side) ||
            !Number.isFinite(part.door.travel) ||
            part.door.travel < 0 ||
            part.door.travel > 1000 ||
            (part.door.direction !== undefined &&
              !['vertical', 'horizontal'].includes(part.door.direction)) ||
            !Number.isFinite(part.door.slatSize) ||
            part.door.slatSize < 0.25 ||
            part.door.slatSize > 6)
        )
          errors.push('Invalid door mechanism dimensions');
        if (part.door?.mechanism === 'tambour') {
          const intersectsEdges = (
            edges: {left: string; right: string; radius: number},
            x: number,
            width: number,
            span: number,
          ) =>
            (edges.left !== 'square' && x < edges.radius && x + width > 0) ||
            (edges.right !== 'square' &&
              x + width > span - edges.radius &&
              x < span);
          const followsCabinet = part.profileMode !== 'independent';
          const sharedCurve =
            followsCabinet &&
            (unit.profile
              ? intersectsEdges(
                  unit.profile,
                  part.x,
                  part.width,
                  unit.width ?? 0,
                )
              : unit.curve &&
                (unit.curve.profile === 'arc' ||
                  intersectsEdges(
                    {
                      left:
                        unit.curve.profile === 'rounded-right'
                          ? 'square'
                          : 'convex',
                      right:
                        unit.curve.profile === 'rounded-left'
                          ? 'square'
                          : 'convex',
                      radius: unit.curve.radius,
                    },
                    part.x,
                    part.width,
                    unit.width ?? 0,
                  )));
          const localShapeApplies =
            part.profileMode !== 'cabinet' &&
            !(followsCabinet && (unit.profile || unit.curve));
          const localCurve =
            localShapeApplies &&
            ((part.edges &&
              intersectsEdges(part.edges, 0, part.width, part.width)) ||
              (part.shape && part.shape !== 'rectangular'));
          if (sharedCurve || localCurve)
            errors.push(
              'Tambour doors require a straight rectangular opening; this door intersects a curved area',
            );
        }
        if (part.edges) {
          if (
            !['square', 'convex', 'concave'].includes(part.edges.left) ||
            !['square', 'convex', 'concave'].includes(part.edges.right) ||
            !Number.isFinite(part.edges.radius) ||
            part.edges.radius <= 0 ||
            part.edges.radius > part.width / 2
          )
            errors.push(
              'Edge radius must be positive and within half the part width',
            );
          if (
            !['door', 'drawer'].includes(part.kind) &&
            part.edges.radius >= part.depth
          )
            errors.push('Edge radius must be smaller than the part depth');
        }
        if (
          part.shape !== undefined &&
          !['rectangular', 'round-left', 'round-right'].includes(part.shape)
        )
          errors.push('Unknown part shape');
        if (
          ![
            'carcass',
            'divider',
            'door',
            'drawer',
            'shelf',
            'rod',
            'panel',
          ].includes(part.kind)
        )
          errors.push('Unknown part kind');
        for (const key of [
          'x',
          'y',
          'z',
          'width',
          'height',
          'depth',
        ] as const) {
          if (
            !Number.isFinite(part[key]) ||
            Math.abs(part[key]) > 1000 ||
            (['width', 'height', 'depth'].includes(key) && part[key] <= 0)
          )
            errors.push(`Invalid part ${key}`);
        }
        if (Number.isFinite(part.y) && part.y < 0)
          errors.push('Parts must be above the cabinet base');
      }
    }
  }
  validateNode(unit.root, 'root', errors);
  if (!errors.length && !unit.parts) {
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
