import {useState} from 'react';
import {
  CLOSET_EXAMPLE,
  VANITY_EXAMPLE,
  CURVED_EXAMPLE,
  STEPPED_EXAMPLE,
  END_SHELF_EXAMPLE,
} from './examples';
import {PartViewport} from './PartViewport';
import {
  addPart,
  setCabinetProfile,
  addPanel,
  addEndShelf,
  changePart,
  editableParts,
  setPartSetback,
} from './partEditing';
import {
  createCustomUnit,
  customUnitId,
  deserializeCustomUnit,
  serializeCustomUnit,
  validateCustomUnit,
  type CabinetPart,
  type CustomUnitDefinition,
} from './model';

function Dimension({
  label,
  value,
  onChange,
  min = -1000,
  max = 1000,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setDraft(String(Number(value.toFixed(4))));
  }
  return (
    <label>
      {label}
      <span className="cu-number">
        <input
          aria-label={label}
          type="number"
          step="0.0625"
          min={min}
          max={max}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = Number(draft);
            if (
              draft.trim() &&
              Number.isFinite(next) &&
              next >= min &&
              next <= max
            )
              onChange(next);
            setDraft(String(value));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span>in</span>
      </span>
    </label>
  );
}

export function CustomUnitEditor({
  initialDefinition = createCustomUnit(),
  onChange,
}: {
  initialDefinition?: CustomUnitDefinition;
  onChange?: (definition: CustomUnitDefinition) => void;
}) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<'3d' | 'front' | 'side' | 'top'>('3d');
  const [tool, setTool] = useState<'orbit' | 'move'>('orbit');
  const [fitRevision, setFitRevision] = useState(0);
  const [snap, setSnap] = useState(0.0625);
  const [openings, setOpenings] = useState<Record<string, number>>({});
  const [past, setPast] = useState<CustomUnitDefinition[]>([]);
  const [future, setFuture] = useState<CustomUnitDefinition[]>([]);
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const parts = editableParts(definition);
  const selected = parts.find((part) => part.id === selectedId);
  const publish = (next: CustomUnitDefinition) => {
    setDefinition(next);
    onChange?.(next);
  };
  const update = (next: CustomUnitDefinition) => {
    const errors = validateCustomUnit(next);
    if (errors.length) {
      setError(errors.join('\n'));
      return;
    }
    setError('');
    setPast([...past.slice(-49), definition]);
    setFuture([]);
    publish(next);
  };
  const patch = (value: Partial<CabinetPart>) => {
    if (selected) update(changePart(definition, selected.id, value));
  };
  const name = (part: CabinetPart, index: number) =>
    part.name ||
    `${part.kind[0].toUpperCase()}${part.kind.slice(1)} ${index + 1}`;
  const preset = (source: CustomUnitDefinition) => {
    update({...structuredClone(source), id: definition.id});
    setSelectedId('');
  };
  return (
    <div className="cu-editor">
      <header className="cu-heading">
        <div>
          <p className="cu-eyebrow">Cabinet workshop</p>
          <h1>Make every detail yours.</h1>
          <p>
            Shape the cabinet as a whole, then refine its parts. All
            measurements are in inches.
          </p>
        </div>
        <div className="cu-actions">
          <button onClick={() => preset(createCustomUnit())}>
            Blank cabinet
          </button>
          <button onClick={() => preset(VANITY_EXAMPLE)}>Vanity</button>
          <button onClick={() => preset(CLOSET_EXAMPLE)}>Closet</button>
          <button onClick={() => preset(CURVED_EXAMPLE)}>
            Curved bookcase
          </button>
          <button onClick={() => preset(END_SHELF_EXAMPLE)}>End shelves</button>
          <button onClick={() => preset(STEPPED_EXAMPLE)}>
            Stepped fronts
          </button>
        </div>
      </header>
      <div className="cu-workbench">
        <aside className="cu-panel cu-structure">
          <h2>01 / Cabinet</h2>
          <label>
            Name
            <input
              value={definition.name}
              onChange={(event) => {
                setDefinition({...definition, name: event.target.value});
                onChange?.({...definition, name: event.target.value});
              }}
            />
          </label>
          <div className="cu-dimensions">
            {(['width', 'height', 'depth'] as const).map((field) => (
              <Dimension
                key={field}
                label={field}
                value={definition[field]}
                min={field === 'depth' ? 8 : 12}
                onChange={(value) => {
                  // Scale physical positions and spans with the envelope; preserve board thickness.
                  const axis =
                    field === 'width' ? 'x' : field === 'height' ? 'y' : 'z';
                  const ratio = value / definition[field];
                  update({
                    ...definition,
                    [field]: value,
                    ...(definition.parts
                      ? {
                          parts: parts.map((part) => {
                            const size =
                              part[field] > 0.75
                                ? part[field] * ratio
                                : part[field];
                            const anchored =
                              Math.abs(
                                part[axis] + part[field] - definition[field],
                              ) < 0.001;
                            return {
                              ...part,
                              [axis]: anchored
                                ? value - size
                                : part[axis] * ratio,
                              [field]: size,
                            };
                          }),
                        }
                      : {}),
                  });
                }}
              />
            ))}
          </div>
          <Dimension
            label="Default front reveal"
            value={definition.reveal}
            min={0.0625}
            max={1}
            onChange={(value) => {
              const delta = value - definition.reveal;
              update({
                ...definition,
                reveal: value,
                ...(definition.parts
                  ? {
                      parts: parts.map((part) =>
                        part.kind === 'door' || part.kind === 'drawer'
                          ? {
                              ...part,
                              x: part.x + delta,
                              y: part.y + delta,
                              width: part.width - delta * 2,
                              height: part.height - delta * 2,
                            }
                          : part,
                      ),
                    }
                  : {}),
              });
            }}
          />
          <h2>Shared cabinet profile</h2>
          <p className="cu-hint">
            One outline for the top, bottom, sides, shelves, doors, and drawer
            fronts. Change it once; the cabinet follows.
          </p>
          {(['left', 'right'] as const).map((side) => (
            <label key={side}>
              Cabinet {side} edge
              <select
                value={definition.profile?.[side] ?? 'square'}
                onChange={(event) =>
                  update(
                    setCabinetProfile(definition, {
                      ...(definition.profile ?? {
                        left: 'square',
                        right: 'square',
                        radius: Math.min(
                          6,
                          definition.width / 2,
                          definition.depth - 0.75,
                        ),
                      }),
                      [side]: event.target.value as
                        | 'square'
                        | 'convex'
                        | 'concave',
                    }),
                  )
                }
              >
                <option value="square">Square</option>
                <option value="convex">Outward / convex</option>
                <option value="concave">Inward / concave</option>
              </select>
            </label>
          ))}
          {definition.profile && (
            <Dimension
              label="Cabinet edge radius"
              value={definition.profile.radius}
              min={0.0625}
              max={Math.min(definition.width / 2, definition.depth - 0.75)}
              onChange={(radius) =>
                update(
                  setCabinetProfile(definition, {
                    ...definition.profile!,
                    radius,
                  }),
                )
              }
            />
          )}
          {selected?.edges && (
            <button
              onClick={() =>
                update(setCabinetProfile(definition, {...selected.edges!}))
              }
            >
              Use selected part’s edges for the cabinet
            </button>
          )}
          <details className="cu-profile-options">
            <summary>Full-width cabinet curves</summary>
            <label>
              Curve scope
              <select
                value={definition.curve?.scope ?? 'straight'}
                onChange={(event) => {
                  const scope = event.target.value;
                  update({
                    ...definition,
                    profile: undefined,
                    curve:
                      scope === 'straight'
                        ? undefined
                        : {
                            scope: scope as 'front' | 'cabinet',
                            profile: 'arc',
                            radius: Math.max(
                              definition.width,
                              definition.depth + 1,
                            ),
                            direction: 'outward',
                          },
                  });
                }}
              >
                <option value="straight">Straight cabinet</option>
                <option value="cabinet">Curve entire cabinet</option>
                <option value="front">Curve front / straight back</option>
              </select>
            </label>
            {definition.curve && (
              <>
                {definition.curve.scope === 'front' && (
                  <label>
                    Curve profile
                    <select
                      value={definition.curve.profile}
                      onChange={(event) =>
                        update({
                          ...definition,
                          curve: {
                            ...definition.curve!,
                            profile: event.target.value as NonNullable<
                              CustomUnitDefinition['curve']
                            >['profile'],
                            radius:
                              event.target.value === 'arc'
                                ? definition.width
                                : Math.min(
                                    6,
                                    definition.width / 2,
                                    definition.depth - 1,
                                  ),
                          },
                        })
                      }
                    >
                      <option value="arc">Full-width arc</option>
                      <option value="rounded-left">Rounded left end</option>
                      <option value="rounded-right">Rounded right end</option>
                      <option value="rounded-both">Rounded both ends</option>
                    </select>
                  </label>
                )}
                {definition.curve.profile === 'arc' && (
                  <label>
                    Curve direction
                    <select
                      value={definition.curve.direction}
                      onChange={(event) =>
                        update({
                          ...definition,
                          curve: {
                            ...definition.curve!,
                            direction: event.target.value as
                              | 'inward'
                              | 'outward',
                          },
                        })
                      }
                    >
                      <option value="outward">Outward / convex</option>
                      <option value="inward">Inward / concave</option>
                    </select>
                  </label>
                )}
                <Dimension
                  label="Curve radius"
                  value={definition.curve.radius}
                  min={0.0625}
                  onChange={(radius) =>
                    update({
                      ...definition,
                      curve: {...definition.curve!, radius},
                    })
                  }
                />
                <p className="cu-hint">
                  {definition.curve.scope === 'cabinet'
                    ? 'Front, back, shelves, and dividers follow the same arc.'
                    : 'The front and shelf edges follow the curve; the back remains straight.'}{' '}
                  Positions and sizes use the uncurved cabinet dimensions.
                </p>
              </>
            )}
          </details>
          <h2>02 / Add a part</h2>
          <div className="cu-add">
            {(
              ['shelf', 'divider', 'panel', 'door', 'drawer', 'rod'] as const
            ).map((kind) => (
              <button
                key={kind}
                onClick={() => {
                  const next = addPart(definition, kind);
                  update(next);
                  setSelectedId(next.parts!.at(-1)!.id);
                  setTool('move');
                }}
              >
                + {kind}
              </button>
            ))}
          </div>
          <div className="cu-add cu-end-shelves">
            {(['back', 'side'] as const).map((orientation) => (
              <button
                key={orientation}
                onClick={() => {
                  const next = addPanel(definition, orientation);
                  update(next);
                  setSelectedId(next.parts!.at(-1)!.id);
                }}
              >
                + {orientation} panel
              </button>
            ))}
          </div>
          <div className="cu-add cu-end-shelves">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                onClick={() => {
                  const next = addEndShelf(definition, side);
                  update(next);
                  setSelectedId(next.parts!.at(-1)!.id);
                }}
              >
                + {side} end shelf
              </button>
            ))}
          </div>
          <h2>
            03 / Parts <span>{parts.length}</span>
          </h2>
          <div className="cu-parts" aria-label="Cabinet parts">
            {parts.map((part, index) => (
              <button
                className={part.id === selectedId ? 'active' : ''}
                key={part.id}
                onClick={() => setSelectedId(part.id)}
              >
                <span>{name(part, index)}</span>
                <small>
                  {part.width.toFixed(2)} × {part.height.toFixed(2)}
                </small>
              </button>
            ))}
          </div>
        </aside>
        <section className="cu-preview" aria-label="Cabinet preview">
          <div className="cu-toolbar">
            <div className="cu-actions">
              {(['3d', 'front', 'side', 'top'] as const).map((mode) => (
                <button
                  className={view === mode ? 'active' : ''}
                  key={mode}
                  onClick={() => setView(mode)}
                >
                  {mode === '3d' ? '3D' : mode}
                </button>
              ))}
            </div>
            <div className="cu-actions">
              <button onClick={() => setFitRevision(fitRevision + 1)}>
                Fit view
              </button>
              <button
                disabled={!past.length}
                onClick={() => {
                  const next = past.at(-1)!;
                  setPast(past.slice(0, -1));
                  setFuture([definition, ...future]);
                  publish(next);
                }}
              >
                Undo
              </button>
              <button
                disabled={!future.length}
                onClick={() => {
                  setPast([...past, definition]);
                  publish(future[0]);
                  setFuture(future.slice(1));
                }}
              >
                Redo
              </button>
            </div>
          </div>
          <PartViewport
            definition={definition}
            selectedId={selectedId}
            view={view}
            tool={tool}
            snap={snap}
            openings={openings}
            fitRevision={fitRevision}
            onSelect={setSelectedId}
            onMove={(id, delta) => {
              const part = parts.find((item) => item.id === id);
              if (part)
                update(
                  changePart(definition, id, {
                    x: part.x + delta.x,
                    y: Math.max(0, part.y + delta.y),
                    z: part.z + delta.z,
                  }),
                );
            }}
          />
          <div className="cu-toolbar">
            <div className="cu-actions">
              <button
                className={tool === 'orbit' ? 'active' : ''}
                onClick={() => setTool('orbit')}
              >
                Orbit / pan
              </button>
              <button
                className={tool === 'move' ? 'active' : ''}
                onClick={() => setTool('move')}
              >
                Move part
              </button>
            </div>
            <label className="cu-snap">
              Snap
              <select
                value={snap}
                onChange={(event) => setSnap(Number(event.target.value))}
              >
                <option value={0.0625}>1/16 in</option>
                <option value={0.125}>1/8 in</option>
                <option value={0.5}>1/2 in</option>
                <option value={0}>Off</option>
              </select>
            </label>
          </div>
          <p className="cu-hint">
            {tool === 'move'
              ? 'Select a part, then drag an axis arrow to move it. Use the inspector for exact sizes.'
              : 'Drag to orbit · Right-drag to pan · Scroll to zoom · Click a part to select'}
          </p>
          <p className="cu-takeoff">
            {definition.width} W × {definition.height} H × {definition.depth} D
            in
          </p>
        </section>
        <aside className="cu-panel cu-inspector">
          <h2>04 / Part details</h2>
          {selected ? (
            <>
              <label>
                Part name
                <input
                  value={
                    selected.name ?? name(selected, parts.indexOf(selected))
                  }
                  onChange={(event) => patch({name: event.target.value})}
                />
              </label>
              <p className="cu-hint">
                Position is measured from the left, bottom, and front of the
                cabinet.
              </p>
              <p className="cu-hint">
                {selected.profileMode === 'independent'
                  ? 'This part has an independent outline.'
                  : 'Follows the shared cabinet profile, including changes to cabinet edges and curves.'}
              </p>
              {selected.kind === 'door' && (
                <>
                  <h3>Door operation</h3>
                  {selected.door?.mechanism === 'pocket' &&
                    selected.width > definition.depth - 1.5 && (
                      <p className="cu-errors" role="status">
                        This door is wider than the available pocket depth. Use
                        a narrower door or a deeper cabinet to retract it fully.
                      </p>
                    )}
                  <label>
                    Mechanism
                    <select
                      value={selected.door?.mechanism ?? 'hinged'}
                      onChange={(event) =>
                        patch({
                          door: {
                            ...(selected.door ?? {
                              mechanism: 'hinged',
                              side: 'left',
                              travel: selected.width,
                              slatSize: 1,
                            }),
                            mechanism: event.target.value as NonNullable<
                              CabinetPart['door']
                            >['mechanism'],
                          },
                        })
                      }
                    >
                      <option value="hinged">Side-hinged</option>
                      <option value="pocket">Pocket door</option>
                      <option value="tambour">Tambour / roll-up</option>
                      <option value="lift-up">Lift-up</option>
                      <option value="pull-down">Pull-down</option>
                    </select>
                  </label>
                  {selected.door && (
                    <>
                      {['hinged', 'pocket'].includes(
                        selected.door.mechanism,
                      ) && (
                        <label>
                          Hinge / pocket side
                          <select
                            value={selected.door.side}
                            onChange={(event) =>
                              patch({
                                door: {
                                  ...selected.door!,
                                  side: event.target.value as 'left' | 'right',
                                },
                              })
                            }
                          >
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                      )}
                      {selected.door.mechanism === 'pocket' && (
                        <Dimension
                          label="Pocket travel"
                          value={selected.door.travel}
                          min={0}
                          onChange={(travel) =>
                            patch({door: {...selected.door!, travel}})
                          }
                        />
                      )}
                      {selected.door.mechanism === 'tambour' && (
                        <Dimension
                          label="Tambour slat size"
                          value={selected.door.slatSize}
                          min={0.25}
                          max={6}
                          onChange={(slatSize) =>
                            patch({door: {...selected.door!, slatSize}})
                          }
                        />
                      )}
                    </>
                  )}
                  <label>
                    Preview opening ·{' '}
                    {Math.round((openings[selected.id] ?? 0) * 100)}%
                    <input
                      aria-label="Door opening"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={openings[selected.id] ?? 0}
                      onChange={(event) =>
                        setOpenings({
                          ...openings,
                          [selected.id]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <p className="cu-hint">
                    Close the preview to move the door. Motion is illustrative;
                    hardware and clearances need a separate construction check.
                  </p>
                </>
              )}
              <details className="cu-profile-options">
                <summary>Independent part shape (advanced)</summary>
                <label className="cu-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.profileMode === 'independent'}
                    onChange={(event) =>
                      patch({
                        profileMode: event.target.checked
                          ? 'independent'
                          : 'cabinet',
                      })
                    }
                  />
                  Shape this part separately
                </label>
                <p className="cu-hint">
                  Use only for a separate attachment, such as an end shelf. Keep
                  cabinet panels linked so they match.
                </p>
                {selected.profileMode === 'independent' && (
                  <>
                    <label>
                      Part shape
                      <select
                        value={selected.shape ?? 'rectangular'}
                        onChange={(event) =>
                          patch({
                            shape: event.target.value as CabinetPart['shape'],
                          })
                        }
                      >
                        <option value="rectangular">Rectangular</option>
                        <option value="round-left">Rounded left end</option>
                        <option value="round-right">Rounded right end</option>
                      </select>
                    </label>
                    {selected.shape?.startsWith('round-') && (
                      <p className="cu-hint">
                        Width controls end projection; depth controls the full
                        span of the curve. Set width to half the depth for a
                        semicircle.
                      </p>
                    )}
                    <h3>Front edge curves</h3>
                    {(['left', 'right'] as const).map((side) => (
                      <label key={side}>
                        Independent {side} edge
                        <select
                          value={selected.edges?.[side] ?? 'square'}
                          onChange={(event) =>
                            patch({
                              edges: {
                                ...(selected.edges ?? {
                                  left: 'square',
                                  right: 'square',
                                  radius: Math.min(
                                    2,
                                    selected.width / 2,
                                    selected.kind === 'door' ||
                                      selected.kind === 'drawer'
                                      ? 2
                                      : selected.depth / 2,
                                  ),
                                }),
                                [side]: event.target.value as
                                  | 'square'
                                  | 'convex'
                                  | 'concave',
                              },
                            })
                          }
                        >
                          <option value="square">Square</option>
                          <option value="convex">Outward / convex</option>
                          <option value="concave">Inward / concave</option>
                        </select>
                      </label>
                    ))}
                    {selected.edges && (
                      <Dimension
                        label="Edge radius"
                        value={selected.edges.radius}
                        min={0.0625}
                        onChange={(radius) =>
                          patch({edges: {...selected.edges!, radius}})
                        }
                      />
                    )}
                  </>
                )}
              </details>
              <h3>Position</h3>
              <div className="cu-fields">
                {(['x', 'y', 'z'] as const).map((field, i) => (
                  <Dimension
                    key={field}
                    label={['From left', 'From bottom', 'Front setback'][i]}
                    value={selected[field]}
                    min={field === 'y' ? 0 : -1000}
                    onChange={(value) =>
                      field === 'z'
                        ? update(setPartSetback(definition, selected.id, value))
                        : patch({[field]: value})
                    }
                  />
                ))}
              </div>
              <h3>Size</h3>
              <div className="cu-fields">
                {(['width', 'height', 'depth'] as const).map((field) => (
                  <Dimension
                    key={field}
                    label={`Part ${field}`}
                    value={selected[field]}
                    min={0.0625}
                    onChange={(value) => patch({[field]: value})}
                  />
                ))}
              </div>
              <p className="cu-hint">
                A positive setback recesses the part. For shelves and panels, it
                keeps the rear edge in place. Negative values project past the
                front.
              </p>
              <div className="cu-actions">
                <button
                  onClick={() => {
                    const copy = {
                      ...selected,
                      id: customUnitId('part'),
                      name: `${name(selected, parts.indexOf(selected))} copy`,
                      y: selected.y + 1,
                    };
                    update({...definition, parts: [...parts, copy]});
                    setSelectedId(copy.id);
                  }}
                >
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    update({
                      ...definition,
                      parts: parts.filter((part) => part.id !== selected.id),
                    });
                    setSelectedId('');
                  }}
                >
                  Remove
                </button>
              </div>
            </>
          ) : (
            <div className="cu-empty">
              <p>Select a part in the model or the parts list.</p>
              <p>
                Set the shared cabinet profile on the left. Select a part here
                to refine its position and dimensions.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="cu-errors">
              {error}
            </p>
          )}
          <details className="cu-transfer">
            <summary>Import / export definition</summary>
            <button onClick={() => setJson(serializeCustomUnit(definition))}>
              Export to text
            </button>
            <textarea
              aria-label="Custom unit JSON"
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
            <button
              onClick={() => {
                try {
                  update(deserializeCustomUnit(json));
                  setSelectedId('');
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : 'Invalid cabinet',
                  );
                }
              }}
            >
              Import definition
            </button>
          </details>
        </aside>
      </div>
    </div>
  );
}
