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
    <fieldset>
      <legend>Camera and finishing</legend>
      <label>
        <input
          type="checkbox"
          checked={value.autoExposure}
          onChange={(e) => update({autoExposure: e.target.checked})}
        />
        Auto Exposure
      </label>
      <label>
        Exposure Compensation (EV)
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
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.autoWhiteBalance}
          onChange={(e) => update({autoWhiteBalance: e.target.checked})}
        />
        Auto White Balance
      </label>
      <label>
        Temperature override (K)
        <input
          type="number"
          min={2000}
          max={10000}
          step={100}
          disabled={value.autoWhiteBalance}
          value={value.temperature}
          onChange={(e) => update({temperature: Number(e.target.value)})}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.architectural}
          onChange={(e) => update({architectural: e.target.checked})}
        />
        Keep vertical lines straight
      </label>
      <label>
        Lens (mm)
        <input
          type="number"
          min={18}
          max={85}
          step={1}
          disabled={!value.architectural}
          value={value.lensMm}
          onChange={(e) => update({lensMm: Number(e.target.value)})}
        />
      </label>
      <label>
        Vertical Shift
        <input
          type="number"
          min={-0.5}
          max={0.5}
          step={0.05}
          disabled={!value.architectural}
          value={value.verticalShift}
          onChange={(e) => update({verticalShift: Number(e.target.value)})}
        />
      </label>
      <label>
        Photo Quality
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
      </label>
      <p>
        Photos keep the current position and aim point. A level 28mm lens
        changes framing to straighten verticals; turn correction off to capture
        the exact viewport view. Positive shift frames higher. Standard and Fine
        improve edges but take longer. Adaptive photos stop when image changes
        stay small; difficult scenes continue refining. Super high quality runs
        the full rendering budget. The full room stays sharp.
      </p>
    </fieldset>
  );
}
