import {useEffect, useId, useRef, useState} from 'react';

export function PhotoDialog({
  blob,
  close,
  refine,
  diagnostics,
}: {
  blob: Blob;
  close: () => void;
  refine?: () => void;
  diagnostics?: Blob;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [url, setUrl] = useState('');
  const [diagnosticUrl, setDiagnosticUrl] = useState('');
  useEffect(() => {
    if (!diagnostics) {
      setDiagnosticUrl('');
      return;
    }
    const url = URL.createObjectURL(diagnostics);
    setDiagnosticUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [diagnostics]);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);
  return (
    <dialog
      ref={dialog}
      className="cc-share-dialog cc-photo-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id={titleId}>Your room photo</h2>
      {url && (
        <img
          src={url}
          alt="Captured cabinet room with softened cabinet, countertop and wall edges"
        />
      )}
      <div className="cc-photo-actions">
        {refine && (
          <button className="cc-photo-refine" type="button" onClick={refine}>
            Render super high quality
          </button>
        )}
        <a href={url || undefined} download="cabinet-room-photo.png">
          Download PNG
        </a>
        {diagnosticUrl && (
          <a href={diagnosticUrl} download="cabinet-room-photo-diagnostics.zip">
            Download diagnostics
          </a>
        )}
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
    </dialog>
  );
}
