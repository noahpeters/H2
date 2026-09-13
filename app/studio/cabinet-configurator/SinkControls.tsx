import {VisualSelect} from './VisualChoices';
import type {RoomElement} from './model';
import {
  canAttachSink,
  createSink,
  SINK_CATALOG,
  sinkFits,
  type SinkAttachment,
  type SinkKind,
} from './sinkAttachments';

/** Edited in the unit designer and committed with Save configuration. */
export function SinkControls({
  item,
  value,
  onChange,
}: {
  item: RoomElement;
  value: SinkAttachment | null;
  onChange: (sink: SinkAttachment | null) => void;
}) {
  if (!canAttachSink(item)) return null;
  return (
    <section aria-label="Countertop sink attachment">
      <div role="group" aria-label="Countertop sink">
        Countertop sink
        <VisualSelect
          category="sink"
          value={value?.kind ?? ''}
          onChange={(event) => {
            const kind = event.currentTarget.value as SinkKind | '';
            onChange(kind ? createSink(kind) : null);
          }}
        >
          <option value="">None</option>
          {(Object.keys(SINK_CATALOG) as SinkKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {SINK_CATALOG[kind].label}
            </option>
          ))}
        </VisualSelect>
      </div>
      {value && (
        <>
          {(['x', 'width', 'depth'] as const).map((key) => (
            <label key={key}>
              {key === 'x'
                ? 'Sink horizontal offset from center (in)'
                : `Sink ${key} (in)`}
              <input
                type="number"
                step="0.5"
                value={value[key]}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (
                    !Number.isFinite(next) ||
                    Math.abs(next) > 10000 ||
                    (key !== 'x' && (next <= 0 || next > 120))
                  )
                    return;
                  onChange({...value, [key]: next});
                }}
              />
            </label>
          ))}
          {!sinkFits(item, value) && (
            <p role="status">
              This sink extends beyond the countertop. Adjust its size or
              position.
            </p>
          )}
          <p>
            The sink appears on the room countertop when countertops are
            enabled. Allow room for the basin in the cabinet composition.
          </p>
        </>
      )}
    </section>
  );
}
