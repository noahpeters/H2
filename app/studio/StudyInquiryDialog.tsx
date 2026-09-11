import {useEffect, useRef} from 'react';
import {ProjectForm} from './ProjectForm';

export function StudyInquiryDialog({
  source,
  summary,
  turnstileSiteKey,
  onClose,
}: {
  source: 'table' | 'cabinet';
  summary: string;
  turnstileSiteKey: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submissionId = useRef(crypto.randomUUID());

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="study-inquiry-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="study-inquiry-card">
        <button
          className="study-inquiry-close"
          type="button"
          aria-label="Close inquiry"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">{source} configurator</p>
        <h2>Send this study</h2>
        <p>
          Your current choices are attached. Add your details to begin the
          conversation.
        </p>
        <ProjectForm
          inPlace
          configuratorSource={source}
          turnstileSiteKey={turnstileSiteKey}
          submissionId={submissionId.current}
          project={summary}
          defaultProjectType={
            source === 'table' ? 'Custom furniture' : 'Kitchen or pantry'
          }
        />
      </div>
    </dialog>
  );
}
