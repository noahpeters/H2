import {Form, useFetcher, useNavigation} from 'react-router';
import {ProjectVerification} from './ProjectVerification';

export function ProjectForm({
  turnstileSiteKey,
  project = '',
  submissionId,
  defaultProjectType = '',
  fieldErrors = {},
  formError,
  configuratorSource,
  inPlace = false,
}: {
  turnstileSiteKey: string;
  project?: string;
  submissionId: string;
  defaultProjectType?: string;
  fieldErrors?: Record<string, string>;
  formError?: string;
  configuratorSource?: 'table' | 'cabinet';
  inPlace?: boolean;
}) {
  const fetcher = useFetcher<{
    ok: boolean;
    fieldErrors?: Record<string, string>;
    formError?: string;
  }>();
  const navigation = useNavigation();
  const response = inPlace ? fetcher.data : undefined;
  const busy = inPlace ? fetcher.state !== 'idle' : navigation.state !== 'idle';
  if (inPlace && response?.ok)
    return (
      <div className="project-form-success" role="status">
        <p className="eyebrow">Study received</p>
        <h2>Thank you.</h2>
        <p>We’ll review your study and get back to you soon.</p>
      </div>
    );
  const currentFieldErrors = response?.fieldErrors ?? fieldErrors;
  const currentFormError = response?.formError ?? formError;
  const error = (field: string) =>
    currentFieldErrors[field] ? (
      <span className="field-error" role="alert">
        {currentFieldErrors[field]}
      </span>
    ) : null;
  const contents = (
    <>
      <input type="hidden" name="submissionId" value={submissionId} />
      {configuratorSource ? (
        <input
          type="hidden"
          name="configuratorSource"
          value={configuratorSource}
        />
      ) : null}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{position: 'absolute', left: '-10000px'}}
      />
      {currentFormError ? (
        <p className="form-error">{currentFormError}</p>
      ) : null}
      <div className="project-form-grid">
        <label>
          Name
          <input name="name" autoComplete="name" required />
          {error('name')}
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
          {error('email')}
        </label>
        <label>
          Phone <span aria-hidden="true">(optional)</span>
          <input name="phone" type="tel" autoComplete="tel" />
        </label>
        <label>
          Project type
          <select name="projectType" required defaultValue={defaultProjectType}>
            <option value="" disabled>
              Select one
            </option>
            <option>Custom furniture</option>
            <option>Kitchen or pantry</option>
            <option>Bathroom vanity</option>
            <option>Built-ins or storage</option>
            <option>Other cabinetry</option>
            <option>Something else</option>
          </select>
          {error('projectType')}
        </label>
        <label>
          Project location
          <input
            name="location"
            autoComplete="postal-code"
            placeholder="City or ZIP code"
            required
          />
          {error('location')}
        </label>
        <label>
          Approximate timeline <span aria-hidden="true">(optional)</span>
          <select name="timeline" defaultValue="">
            <option value="">Not sure yet</option>
            <option>As soon as practical</option>
            <option>Within 3 months</option>
            <option>3–6 months</option>
            <option>6–12 months</option>
            <option>More than a year</option>
          </select>
        </label>
        <label className="form-wide">
          General budget range <span aria-hidden="true">(optional)</span>
          <input
            name="budget"
            placeholder="A range is helpful, but not required"
          />
        </label>
        <label className="form-wide">
          Tell us about your project
          <textarea name="message" defaultValue={project} required />
          {error('message')}
        </label>
      </div>
      <div className="turnstile-wrap">
        <ProjectVerification
          siteKey={turnstileSiteKey}
          retry={
            currentFormError || Object.keys(currentFieldErrors).length
              ? currentFieldErrors
              : undefined
          }
        />
        {error('turnstile')}
      </div>
      <button type="submit" disabled={busy}>
        <span>{busy ? 'Sending…' : 'Send project details'}</span>
        <span aria-hidden="true">→</span>
      </button>
    </>
  );
  return inPlace ? (
    <fetcher.Form method="post" action="/contact" className="project-form">
      {contents}
    </fetcher.Form>
  ) : (
    <Form method="post" className="project-form">
      {contents}
    </Form>
  );
}
