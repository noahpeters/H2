import {PhotoSettingField} from './PhotoSettingField';
import {DEFAULT_PHOTO_CAMERA, type PhotoCameraSettings} from './photoCamera';

export function PhotoCameraControls({
  value = DEFAULT_PHOTO_CAMERA,
  onChange,
}: {
  value?: PhotoCameraSettings;
  onChange: (value: PhotoCameraSettings) => void;
}) {
  const update = (patch: Partial<PhotoCameraSettings>) =>
    onChange({...value, ...patch});
  return (
    <>
      <PhotoSettingField label="Auto Exposure">
        <input
          type="checkbox"
          checked={value.autoExposure}
          onChange={(e) => update({autoExposure: e.target.checked})}
        />
      </PhotoSettingField>
      <PhotoSettingField label="Exposure Compensation (EV)">
        <input
          type="number"
          min={-4}
          max={4}
          step={0.25}
          value={value.exposureCompensation}
          onChange={(e) =>
            update({exposureCompensation: Number(e.target.value)})
          }
        />
      </PhotoSettingField>
      <PhotoSettingField label="Auto White Balance">
        <input
          type="checkbox"
          checked={value.autoWhiteBalance}
          onChange={(e) => update({autoWhiteBalance: e.target.checked})}
        />
      </PhotoSettingField>
      <PhotoSettingField label="Temperature override (K)">
        <input
          type="number"
          min={2000}
          max={10000}
          step={100}
          disabled={value.autoWhiteBalance}
          value={value.temperature}
          onChange={(e) => update({temperature: Number(e.target.value)})}
        />
      </PhotoSettingField>
      <PhotoSettingField label="Keep vertical lines straight">
        <input
          type="checkbox"
          checked={value.architectural}
          onChange={(e) => update({architectural: e.target.checked})}
        />
      </PhotoSettingField>
      <PhotoSettingField label="Lens (mm)">
        <input
          type="number"
          min={18}
          max={85}
          step={1}
          disabled={!value.architectural}
          value={value.lensMm}
          onChange={(e) => update({lensMm: Number(e.target.value)})}
        />
      </PhotoSettingField>
      <PhotoSettingField label="Vertical Shift">
        <input
          type="number"
          min={-0.5}
          max={0.5}
          step={0.05}
          disabled={!value.architectural}
          value={value.verticalShift}
          onChange={(e) => update({verticalShift: Number(e.target.value)})}
        />
      </PhotoSettingField>
      <PhotoSettingField
        label="Photo Quality"
        help={
          <>
            Photos keep the current position and aim point. A level 28mm lens
            changes framing to straighten verticals; turn correction off to
            capture the exact viewport view. Positive shift frames higher.
            Standard and Fine improve edges but take longer. Adaptive photos
            stop when image changes stay small; difficult scenes continue
            refining. Super high quality runs the full rendering budget. The
            full room stays sharp.
          </>
        }
      >
        <select
          value={value.quality}
          onChange={(e) =>
            update({quality: e.target.value as PhotoCameraSettings['quality']})
          }
        >
          <option value="quick">Quick · adaptive</option>
          <option value="standard">Standard · adaptive</option>
          <option value="fine">Fine · adaptive</option>
          <option value="ultra">Super high quality · full render</option>
        </select>
      </PhotoSettingField>
    </>
  );
}
