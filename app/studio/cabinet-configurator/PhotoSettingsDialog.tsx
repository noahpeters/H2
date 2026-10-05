import {useEffect, useId, useRef, type ReactNode} from 'react';

export function PhotoSettingsDialog({
  children,
  cancel,
  render,
}: {
  children: ReactNode;
  cancel: () => void;
  render: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="cc-photo-settings-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          dialog.current?.close();
          render();
        }}
      >
        <header>
          <h2 id={titleId}>Photo settings</h2>
          <p id={descriptionId}>
            Adjust camera, lighting and quality before rendering your room.
          </p>
        </header>
        <div className="cc-photo-settings-body">{children}</div>
        <footer>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="submit">Render photo</button>
        </footer>
      </form>
    </dialog>
  );
}
