import {Form, useNavigation} from 'react-router';
import {ProjectVerification} from './ProjectVerification';

export function ProjectForm({
  turnstileSiteKey,
  project = '',
  submissionId,
  defaultProjectType = '',
  fieldErrors = {},
  formError,
}: {
  turnstileSiteKey: string;
  project?: string;
  submissionId: string;
  defaultProjectType?: string;
  fieldErrors?: Record<string, string>;
  formError?: string;
}) {
  const busy = useNavigation().state !== 'idle';
  const error = (field: string) =>
    fieldErrors[field] ? (
      <span className="field-error" role="alert">
        {fieldErrors[field]}
      </span>
    ) : null;
  return (
    <Form method="post" className="project-form">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{position: 'absolute', left: '-10000px'}}
      />
      {formError ? <p className="form-error">{formError}</p> : null}
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
            formError || Object.keys(fieldErrors).length
              ? fieldErrors
              : undefined
          }
        />
        {error('turnstile')}
      </div>
      <button type="submit" disabled={busy}>
        <span>{busy ? 'Sending…' : 'Send project details'}</span>
        <span aria-hidden="true">→</span>
      </button>
    </Form>
  );
}
