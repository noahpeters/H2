import {PhotoSettingField} from './PhotoSettingField';
import type {PhotoSettings} from './photoLighting';
import {DEFAULT_PHOTO_DAYLIGHT} from './photoDaylight';

export function PhotoDetailControls({
  value,
  onChange,
}: {
  value: PhotoSettings;
  onChange: (value: PhotoSettings) => void;
}) {
  const update = (patch: Partial<PhotoSettings>) =>
    onChange({...value, ...patch});
  const daylight = value.sunSky ?? DEFAULT_PHOTO_DAYLIGHT;
  return (
    <>
      <PhotoSettingField
        label="Directional daylight"
        help="Uses the sun direction and outdoor sky through the room openings. Take this photo from inside the room; windows and a ceiling contain the light."
      >
        <input
          type="checkbox"
          checked={daylight.enabled}
          onChange={(event) =>
            update({
              sunSky: {...daylight, enabled: event.target.checked},
              ceiling: value.ceiling ?? true,
              physicalWindows: value.physicalWindows ?? true,
            })
          }
        />
      </PhotoSettingField>
      {daylight.enabled && (
        <>
          {(
            [
              ['azimuth', 'Sun direction (degrees)', 0, 360, 5],
              ['altitude', 'Sun height (degrees)', 1, 89, 1],
              ['sky', 'Sky brightness', 0, 100, 0.1],
              ['sun', 'Sun brightness', 0, 1000, 1],
              ['angularDiameter', 'Sun softness (degrees)', 0.1, 10, 0.1],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <PhotoSettingField key={key} label={label}>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={daylight[key]}
                onChange={(event) =>
                  update({
                    sunSky: {...daylight, [key]: Number(event.target.value)},
                  })
                }
              />
            </PhotoSettingField>
          ))}
        </>
      )}
      <PhotoSettingField
        label="Include a ceiling"
        help="Adds a white ceiling to this photo using the room's exact outline and height. The design and live view stay unchanged."
      >
        <input
          type="checkbox"
          checked={value.ceiling ?? false}
          onChange={(event) => update({ceiling: event.target.checked})}
        />
      </PhotoSettingField>
      <PhotoSettingField
        label="Clear window glass"
        help="Uses clear transmitting glass in this photo. Frames and window dimensions stay unchanged."
      >
        <input
          type="checkbox"
          checked={value.physicalWindows ?? false}
          onChange={(event) => update({physicalWindows: event.target.checked})}
        />
      </PhotoSettingField>
      <details>
        <summary>Photo inspection</summary>
        <PhotoSettingField
          label="Unfiltered reference"
          help="Runs the full sample budget without noise reduction, reflection smoothing, or automatic exposure/white balance. Useful for comparing surface detail; takes longer."
        >
          <input
            type="checkbox"
            checked={value.reference ?? false}
            onChange={(event) => update({reference: event.target.checked})}
          />
        </PhotoSettingField>
        <PhotoSettingField
          label="Include diagnostic files"
          help="Adds a downloadable ZIP with render settings, asset fingerprints and lighting passes. Inspection buffers are limited to 512 pixels; the final photo keeps its selected size. Takes substantially longer."
        >
          <input
            type="checkbox"
            checked={value.diagnostics ?? false}
            onChange={(event) => update({diagnostics: event.target.checked})}
          />
        </PhotoSettingField>
        <PhotoSettingField label="Reflection smoothing">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            disabled={value.reference}
            value={value.glossyFilter ?? 0.1}
            onChange={(event) =>
              update({glossyFilter: Number(event.target.value)})
            }
          />
        </PhotoSettingField>
        <PhotoSettingField label="Light bounces">
          <input
            type="number"
            min={1}
            max={16}
            step={1}
            value={value.bounces}
            onChange={(event) => update({bounces: Number(event.target.value)})}
          />
        </PhotoSettingField>
        <PhotoSettingField
          label="Surface texture detail"
          help="Automatic uses finer surface detail for larger photos while fitting the room's memory needs. Higher manual settings use more memory."
        >
          <select
            value={value.textureResolution ?? 'auto'}
            onChange={(event) =>
              update({
                textureResolution:
                  event.target.value === 'auto'
                    ? undefined
                    : (Number(event.target.value) as 1024 | 2048 | 4096),
              })
            }
          >
            <option value="auto">Automatic</option>
            <option value={1024}>Standard · 1K</option>
            <option value={2048}>Detailed · 2K</option>
            <option value={4096}>Maximum · 4K</option>
          </select>
        </PhotoSettingField>
      </details>
    </>
  );
}
