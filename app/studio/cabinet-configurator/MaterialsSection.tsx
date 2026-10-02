import {useState} from 'react';
import type {Study} from './CabinetConfigurator';
import {VisualSelect} from './VisualChoices';
import {
  CABINET_MATERIALS,
  CABINET_PAINTS,
  cabinetColor,
  materialPreviewNote,
  type CabinetMaterial,
  type CabinetPaint,
} from './materials';
import {removeDesignMaterial, type FlatGrain} from './designMaterials';

export function MaterialsSection({
  study,
  update,
}: {
  study: Study;
  update: (change: (draft: Study) => void) => void;
}) {
  const [removing, setRemoving] = useState<string>();
  const [replacement, setReplacement] = useState('');
  const [expanded, setExpanded] = useState<string>();
  const materials = study.materials ?? [];
  return (
    <details className="cc-accordion cc-materials" open>
      <summary>Materials</summary>
      <div className="cc-fields">
        <p className="cc-muted">
          Edit a material to update every object assigned to it.
        </p>
        {materials.map((material, index) => {
          const edit = (change: (m: typeof material) => void) =>
            update((d) => {
              const m = d.materials?.find((m) => m.id === material.id);
              if (m) change(m);
            });
          const usage = study.elements.filter(
            (e) => e.materialId === material.id,
          ).length;
          return (
            <details
              className="cc-material"
              key={material.id}
              open={materials.length === 1 || expanded === material.id}
            >
              <summary>
                <span
                  className="cc-material-swatch"
                  style={{backgroundColor: cabinetColor(material)}}
                  aria-hidden="true"
                />
                {material.name}
                <small>
                  {usage} {usage === 1 ? 'object' : 'objects'}
                </small>
              </summary>
              <div className="cc-fields">
                <label>
                  Material name
                  <input
                    value={material.name}
                    maxLength={100}
                    onChange={(e) => {
                      const name = e.currentTarget.value;
                      edit((m) => {
                        m.name = name.trim() ? name : `Material ${index + 1}`;
                      });
                    }}
                  />
                </label>
                <div
                  className="cc-visual-field"
                  role="group"
                  aria-label={`Finish for ${material.name}`}
                >
                  Material
                  <VisualSelect
                    category="material"
                    value={material.material}
                    onChange={(e) => {
                      const value = e.currentTarget.value as CabinetMaterial;
                      edit((m) => {
                        m.material = value;
                        delete m.materialDefinition;
                      });
                    }}
                  >
                    {Object.entries(CABINET_MATERIALS).map(([id, m]) => (
                      <option key={id} value={id}>
                        {m.label}
                      </option>
                    ))}
                  </VisualSelect>
                </div>
                {material.material === 'paint-grade' && (
                  <div
                    className="cc-visual-field"
                    role="group"
                    aria-label={`Paint color for ${material.name}`}
                  >
                    Paint color
                    <VisualSelect
                      category="paint"
                      value={material.paintColor ?? 'white'}
                      onChange={(e) => {
                        const value = e.currentTarget.value as CabinetPaint;
                        edit((m) => {
                          m.paintColor = value;
                          delete m.materialDefinition;
                        });
                      }}
                    >
                      {Object.entries(CABINET_PAINTS).map(([id, paint]) => (
                        <option key={id} value={id}>
                          {paint.label}
                        </option>
                      ))}
                    </VisualSelect>
                  </div>
                )}
                <label>
                  Flat surface grain
                  <select
                    value={material.flatGrain}
                    onChange={(e) => {
                      const value = e.currentTarget.value as FlatGrain;
                      edit((m) => {
                        m.flatGrain = value;
                      });
                    }}
                  >
                    <option value="automatic">By part</option>
                    <option value="horizontal">Horizontal (width)</option>
                    <option value="vertical">Vertical (height / depth)</option>
                  </select>
                </label>
                {materialPreviewNote(material) && (
                  <p className="cc-hint">{materialPreviewNote(material)}</p>
                )}
                {materials.length > 1 &&
                  (removing === material.id ? (
                    <>
                      <label>
                        Reassign objects to
                        <select
                          value={replacement}
                          onChange={(e) =>
                            setReplacement(e.currentTarget.value)
                          }
                        >
                          {materials
                            .filter((m) => m.id !== material.id)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          update((d) =>
                            removeDesignMaterial(d, material.id, replacement),
                          );
                          setRemoving(undefined);
                        }}
                      >
                        Reassign and remove material
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(undefined)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(material.id);
                        setReplacement(
                          materials.find((m) => m.id !== material.id)!.id,
                        );
                      }}
                    >
                      Remove material…
                    </button>
                  ))}
              </div>
            </details>
          );
        })}
        <button
          type="button"
          disabled={materials.length >= 200}
          onClick={() => {
            const id = `material-${crypto.randomUUID()}`;
            update((d) => {
              d.materials ??= [];
              d.materials.push({
                id,
                name: `Material ${d.materials.length + 1}`,
                material: 'rift-white-oak',
                flatGrain: 'automatic',
              });
            });
            setExpanded(id);
          }}
        >
          Add material
        </button>
        <small>
          Grain follows each surface locally as objects rotate. Rails and stiles
          always follow their length. Screen finishes are approximate; approve a
          physical sample.
        </small>
      </div>
    </details>
  );
}
