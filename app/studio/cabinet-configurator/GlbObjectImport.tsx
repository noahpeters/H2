import {useEffect, useRef, useState, type FormEvent} from 'react';
import {measureGlb} from './glbGeometry';
import type {ObjectDimensions} from './objectLibrary';

export function GlbObjectImport({
  onAdd,
}: {
  onAdd: (name: string, url: string, dimensions: ObjectDimensions) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const loading = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError('');
    try {
      const dimensions = await measureGlb(url.trim());
      if (!active.current) return;
      onAdd(name.trim(), url.trim(), dimensions);
      setName('');
      setUrl('');
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error ? cause.message : 'Unable to import model.',
        );
    } finally {
      loading.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <details className="cc-add-menu">
      <summary>+ Add GLB object</summary>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="cc-fields"
      >
        <label>
          Object name
          <input
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label>
          GLB URL
          <input
            required
            value={url}
            disabled={busy}
            placeholder="https://example.com/model.glb"
            onChange={(event) => setUrl(event.currentTarget.value)}
          />
        </label>
        <small>
          Self-contained GLB, up to 20 MB. The host must allow browser access.
          Materials and proportions are preserved.
        </small>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Loading model…' : 'Add object'}
        </button>
      </form>
    </details>
  );
}
