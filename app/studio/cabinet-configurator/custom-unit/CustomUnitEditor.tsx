import {useMemo, useState} from 'react';
import {CLOSET_EXAMPLE, VANITY_EXAMPLE} from './examples';
import {customUnitParts} from './geometry';
import {
  createCustomUnit,
  deserializeCustomUnit,
  layoutCustomUnit,
  resizeDivision,
  serializeCustomUnit,
  splitSection,
  updateNode,
  validateCustomUnit,
  type CustomUnitDefinition,
  type CustomUnitNode,
  type SectionType,
} from './model';

const TYPES: SectionType[] = [
  'open',
  'doors',
  'drawers',
  'drawer-stack',
  'shelves',
  'open-lower',
  'hanging',
];

function findNode(
  node: CustomUnitNode,
  id: string,
): CustomUnitNode | undefined {
  if (node.id === id) return node;
  if (node.type === 'division')
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
}

function divisions(
  node: CustomUnitNode,
): Extract<CustomUnitNode, {type: 'division'}>[] {
  if (node.type === 'section') return [];
  return [node, ...node.children.flatMap(divisions)];
}

export function CustomUnitEditor({
  initialDefinition = createCustomUnit(),
}: {
  initialDefinition?: CustomUnitDefinition;
}) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [selectedId, setSelectedId] = useState(initialDefinition.root.id);
  const [view, setView] = useState<'elevation' | '3d'>('elevation');
  const [json, setJson] = useState(() =>
    serializeCustomUnit(initialDefinition),
  );
  const [importError, setImportError] = useState('');
  const layout = useMemo(() => layoutCustomUnit(definition), [definition]);
  const errors = useMemo(() => validateCustomUnit(definition), [definition]);
  const selected = findNode(definition.root, selectedId);
  const update = (next: CustomUnitDefinition) => {
    setDefinition(next);
    setJson(serializeCustomUnit(next));
  };
  const dimension = (field: 'width' | 'height' | 'depth', value: number) =>
    update({...definition, [field]: value});

  return (
    <div className="cu-editor">
      <header className="cu-header">
        <div>
          <p>Development harness · schema v{definition.version}</p>
          <h1>Custom unit editor</h1>
        </div>
        <div className="cu-actions">
          <button
            type="button"
            onClick={() => {
              const next = createCustomUnit();
              setSelectedId(next.root.id);
              update(next);
            }}
          >
            Blank unit
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedId(VANITY_EXAMPLE.root.id);
              update(VANITY_EXAMPLE);
            }}
          >
            Vanity example
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedId(CLOSET_EXAMPLE.root.id);
              update(CLOSET_EXAMPLE);
            }}
          >
            Closet example
          </button>
        </div>
      </header>
      <div className="cu-workbench">
        <aside className="cu-panel">
          <h2>Definition</h2>
          <label>
            Name
            <input
              value={definition.name}
              onChange={(e) => update({...definition, name: e.target.value})}
            />
          </label>
          <div className="cu-dimensions">
            {(['width', 'height', 'depth'] as const).map((field) => (
              <label key={field}>
                {field}
                <input
                  aria-label={field}
                  type="number"
                  min={field === 'depth' ? 8 : 12}
                  step="0.5"
                  value={definition[field]}
                  onChange={(e) => dimension(field, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <label>
            Reveal
            <input
              aria-label="reveal"
              type="number"
              min="0.0625"
              max="1"
              step="0.0625"
              value={definition.reveal}
              onChange={(e) =>
                update({...definition, reveal: Number(e.target.value)})
              }
            />
          </label>
          <h2>Selected region</h2>
          {selected?.type === 'section' ? (
            <>
              <label>
                Section type
                <select
                  value={selected.sectionType}
                  onChange={(e) =>
                    update({
                      ...definition,
                      root: updateNode(definition.root, selected.id, (node) =>
                        node.type === 'section'
                          ? {
                              ...node,
                              sectionType: e.target.value as SectionType,
                            }
                          : node,
                      ),
                    })
                  }
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cu-split">
                <button
                  type="button"
                  onClick={() =>
                    update(splitSection(definition, selected.id, 'vertical'))
                  }
                >
                  Split vertical
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update(splitSection(definition, selected.id, 'horizontal'))
                  }
                >
                  Split horizontal
                </button>
              </div>
              <label>
                Count
                <input
                  aria-label="section count"
                  type="number"
                  min="1"
                  max="12"
                  value={
                    selected.properties?.drawerCount ??
                    selected.properties?.shelfCount ??
                    3
                  }
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    update({
                      ...definition,
                      root: updateNode(definition.root, selected.id, (node) =>
                        node.type === 'section'
                          ? {
                              ...node,
                              properties: {
                                ...node.properties,
                                drawerCount: count,
                                shelfCount: count,
                              },
                            }
                          : node,
                      ),
                    });
                  }}
                />
              </label>
            </>
          ) : (
            <p>Select a region in the preview to edit or subdivide it.</p>
          )}
          {divisions(definition.root).length > 0 && (
            <>
              <h2>Division sizes</h2>
              {divisions(definition.root).map((division) => (
                <label key={division.id}>
                  {division.axis} split
                  <input
                    aria-label={`${division.axis} split`}
                    type="range"
                    min="1"
                    max="9"
                    value={division.weights[0]}
                    onChange={(e) =>
                      update(
                        resizeDivision(definition, division.id, [
                          Number(e.target.value),
                          ...division.weights.slice(1),
                        ]),
                      )
                    }
                  />
                  <span>
                    {division.weights
                      .map((weight) => weight.toFixed(0))
                      .join(' : ')}
                  </span>
                </label>
              ))}
            </>
          )}
          <div className={errors.length ? 'cu-errors' : 'cu-valid'}>
            {errors.length
              ? errors.map((error) => <p key={error}>{error}</p>)
              : 'Definition and geometry are valid'}
          </div>
        </aside>
        <main className="cu-preview">
          <div className="cu-preview-bar">
            <strong>{definition.name}</strong>
            <div>
              <button
                className={view === 'elevation' ? 'active' : ''}
                onClick={() => setView('elevation')}
              >
                Elevation
              </button>
              <button
                className={view === '3d' ? 'active' : ''}
                onClick={() => setView('3d')}
              >
                3D
              </button>
            </div>
          </div>
          <svg
            className={view === '3d' ? 'cu-svg cu-svg-3d' : 'cu-svg'}
            viewBox={`-5 -5 ${definition.width + 10} ${definition.height + 10}`}
            role="img"
            aria-label={`${definition.name} ${view} preview`}
          >
            <rect
              className="cu-case"
              x="0"
              y="0"
              width={definition.width}
              height={definition.height}
            />
            {layout.regions.map((region) => (
              <g
                key={region.id}
                onClick={() => setSelectedId(region.id)}
                className={selectedId === region.id ? 'selected' : ''}
              >
                <rect
                  x={region.x + definition.reveal}
                  y={
                    definition.height -
                    region.y -
                    region.height +
                    definition.reveal
                  }
                  width={region.width - definition.reveal * 2}
                  height={region.height - definition.reveal * 2}
                />
                <text
                  x={region.x + region.width / 2}
                  y={definition.height - region.y - region.height / 2}
                >
                  {region.section.sectionType}
                </text>
              </g>
            ))}
          </svg>
          <p className="cu-takeoff">
            {layout.regions.length} semantic regions ·{' '}
            {customUnitParts(definition).length} generated parts ·{' '}
            {definition.width} × {definition.height} × {definition.depth} in
          </p>
        </main>
        <aside className="cu-panel cu-json">
          <h2>Serialization</h2>
          <textarea
            aria-label="Custom unit JSON"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              try {
                const next = deserializeCustomUnit(json);
                setImportError('');
                setSelectedId(next.root.id);
                setDefinition(next);
              } catch (error) {
                setImportError(
                  error instanceof Error ? error.message : 'Invalid definition',
                );
              }
            }}
          >
            Load JSON
          </button>
          {importError && <p className="cu-errors">{importError}</p>}
        </aside>
      </div>
    </div>
  );
}
