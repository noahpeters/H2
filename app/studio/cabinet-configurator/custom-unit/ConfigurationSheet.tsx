import {useEffect, useRef, useState} from 'react';
import {CustomUnitEditor} from './CustomUnitEditor';
import {configurationTemplate} from './designConfigurations';
import type {CustomUnitDefinition} from './model';
import type {KitchenElement} from '../model';

export function ConfigurationSheet({
  item,
  onSave,
  onClose,
}: {
  item: KitchenElement;
  onSave: (definition: CustomUnitDefinition) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [initial] = useState(() => configurationTemplate(item));
  const [definition, setDefinition] = useState(initial);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    // Mount the viewport only once the dialog has measurable dimensions.
    setReady(true);
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="cc-configuration-sheet"
      aria-label="Customize this cabinet"
      onCancel={onClose}
    >
      <div className="cc-configuration-actions">
        <h2>Customize this cabinet</h2>
        <p>
          Save a named configuration for reuse in this design. Other cabinets
          keep their current configuration.
        </p>
        {!item.customCabinet &&
          (item.configuration === 'corner' ||
            item.configuration === 'sink' ||
            item.configuration === 'farmhouse-sink' ||
            item.configuration === 'microwave-drawer' ||
            (item.tallConfiguration && item.tallConfiguration !== 'standard') ||
            item.storage) && (
            <p>
              Starting from a simplified composition. Specialty cutouts, corner
              geometry, and fittings may need to be recreated in the workshop.
            </p>
          )}
        <button onClick={onClose}>Cancel</button>
        <button
          onClick={() => {
            try {
              onSave(definition);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Unable to save configuration.',
              );
            }
          }}
        >
          Save configuration
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
      {ready && (
        <CustomUnitEditor
          initialDefinition={initial}
          lockEnvelope
          initialAppearance={{
            face: item.face,
            material: item.material ?? 'rift-white-oak',
            paintColor: item.paintColor,
          }}
          onChange={setDefinition}
        />
      )}
    </dialog>
  );
}
