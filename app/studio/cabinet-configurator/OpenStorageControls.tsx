import type {KitchenElement} from './model';
import {
  OPEN_STORAGE,
  storageDefaults,
  storageLayout,
  type StorageKind,
} from './openStorage';
export function OpenStorageControls({
  item,
  change,
}: {
  item: KitchenElement;
  change: (patch: Partial<KitchenElement>) => void;
}) {
  const s = item.storage!;
  const storage = (key: keyof typeof s, value: number | boolean) =>
    change({storage: {...s, [key]: value}});
  const hanging = ['single-hang', 'double-hang', 'combination'].includes(
    s.type,
  );
  return (
    <>
      <label>
        Open storage type
        <select
          value={s.type}
          onChange={(event) => {
            const type = event.currentTarget.value as StorageKind;
            const overhead = type === 'overhead';
            change({
              storage: storageDefaults(type),
              kind: overhead ? 'wall-cabinet' : 'tall',
              height: overhead ? 24 : 84,
              placement: {...item.placement, elevation: overhead ? 72 : 0},
            });
          }}
        >
          {Object.entries(OPEN_STORAGE).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {(['depth', 'height'] as const).map((key) => (
        <label key={key}>
          {key}
          <span>
            <input
              aria-label={`Storage ${key}`}
              type="number"
              min={key === 'depth' ? 8 : 12}
              max={key === 'depth' ? 36 : 120}
              value={item[key]}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                if (
                  Number.isFinite(value) &&
                  value >= (key === 'depth' ? 8 : 12) &&
                  value <= (key === 'depth' ? 36 : 120)
                )
                  change({[key]: value});
              }}
            />{' '}
            in
          </span>
        </label>
      ))}
      {(
        [
          [
            'shelves',
            'Shelf count',
            0,
            hanging && s.type !== 'combination' ? 1 : 20,
          ],
          ...(!hanging || s.type === 'combination'
            ? [['shelfSpacing', 'Shelf spacing (0 = evenly spaced)', 0, 36]]
            : []),
          ...(s.type === 'drawers' ? [['drawers', 'Drawer count', 1, 10]] : []),
          ...(hanging
            ? [['rodHeight', 'Upper rod height from cabinet bottom', 6, 120]]
            : []),
          ...(s.type === 'double-hang'
            ? [
                [
                  'lowerRodHeight',
                  'Lower rod height from cabinet bottom',
                  6,
                  120,
                ],
              ]
            : []),
          ...(s.type === 'combination'
            ? [['dividerPercent', 'Shelf section width (%)', 20, 80]]
            : []),
        ] as Array<[keyof typeof s, string, number, number]>
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={min}
            max={max}
            step="1"
            value={Number(s[key])}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isInteger(value) && value >= min && value <= max)
                storage(key, value);
            }}
          />
        </label>
      ))}
      <label>
        Doors
        <input
          type="checkbox"
          checked={s.doors}
          onChange={(event) => storage('doors', event.currentTarget.checked)}
        />
      </label>
      <label>
        Finished back
        <input
          type="checkbox"
          checked={s.back}
          onChange={(event) => storage('back', event.currentTarget.checked)}
        />
      </label>
      {s.type === 'shoes' && (
        <label>
          Angled shoe shelves
          <input
            type="checkbox"
            checked={s.angled}
            onChange={(event) => storage('angled', event.currentTarget.checked)}
          />
        </label>
      )}
      <p className="cc-muted">
        Fitted layout: {storageLayout(item).shelfYs.length} shelves,{' '}
        {storageLayout(item).drawers} drawers, {storageLayout(item).rods.length}{' '}
        rods. Interior spacing adjusts to fit the cabinet. Rod heights are
        measured from the unit bottom; mounting height is added for wall-mounted
        units.
      </p>
    </>
  );
}
