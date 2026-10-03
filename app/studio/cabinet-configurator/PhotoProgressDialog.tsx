import {useEffect, useId, useRef} from 'react';

export function PhotoProgressDialog({
  progress,
  cancel,
  error,
  retry,
  adaptive = false,
}: {
  progress: number;
  cancel: () => void;
  error?: string;
  retry?: () => void;
  adaptive?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancelButton.current?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="cc-photo-progress"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <span className="cc-photo-progress-camera" aria-hidden="true">
        📸
      </span>
      <h2 id={titleId}>
        {error ? 'Photo could not be completed' : 'Say cheese!'}
      </h2>
      <p id={descriptionId} role={error ? 'alert' : undefined}>
        {error ||
          'We’re bringing your room into focus. Rendering your image can take several minutes.'}
      </p>
      {!error && (
        <>
          <progress
            aria-label="Photo rendering"
            value={adaptive && progress < 0.9 ? undefined : progress}
            max={1}
          />
          <p className="cc-photo-progress-caption">
            {adaptive
              ? progress < 0.9
                ? 'Refining lighting until the image is clear.'
                : 'Finishing your photo.'
              : `Taking your photo · ${Math.floor(progress * 100)}%`}
          </p>
        </>
      )}
      {error && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
      <button ref={cancelButton} type="button" onClick={cancel}>
        {error ? 'Close' : 'Cancel photo'}
      </button>
    </dialog>
  );
}
