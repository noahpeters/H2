import {useCallback, useEffect, useRef, useState} from 'react';
import type {Study} from './CabinetConfigurator';
type SavedRoom = {
  slug: string;
  editKey: string;
  revision: number;
  updatedAt: string;
  draft?: Study;
};
const HISTORY_KEY = 'from-trees-room-history-v1';
const LOCAL_KEY = 'from-trees-cabinet-study-v1';
export async function roomRequest(
  method: string,
  slug?: string,
  body?: unknown,
) {
  const response = await fetch(
    `/api/cabinet-rooms${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`,
    {
      method,
      headers: {'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    },
  );
  const data = (await response.json()) as any;
  if (!response.ok) throw new Error(data.error || 'Unable to save room');
  return data;
}
export function useSavedRooms(
  study: Study,
  setStudy: (study: Study) => void,
  sample: () => Study,
  migrate: (study: any) => Study,
  clearUndo: () => void,
) {
  const [recent, setRecent] = useState<SavedRoom[]>([]);
  const [status, setStatus] = useState('Opening room…');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const active = useRef<SavedRoom | null>(null);
  const saved = useRef('');
  const latest = useRef(study);
  latest.current = study;
  const rows = useRef<SavedRoom[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const started = useRef(false);
  const incomingSlug = useRef<string | null>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callbacks = useRef({setStudy, sample, migrate, clearUndo});
  callbacks.current = {setStudy, sample, migrate, clearUndo};
  const remember = useCallback((record: SavedRoom) => {
    // Other tabs can create rooms too; do not erase their history entries.
    let elsewhere: SavedRoom[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(stored))
        elsewhere = stored.filter(
          (r: any): r is SavedRoom =>
            r && typeof r.slug === 'string' && typeof r.editKey === 'string',
        );
    } catch {
      /* Keep in-memory history when browser storage is unavailable. */
    }
    const seen = new Set<string>();
    rows.current = [
      record,
      ...elsewhere,
      ...rows.current.filter((r) => r.slug !== record.slug),
    ]
      .filter((r) => {
        if (seen.has(r.slug)) return false;
        seen.add(r.slug);
        return true;
      })
      .slice(0, 20);
    setRecent([...rows.current]);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.current));
    } catch {
      setStatus('Saved online; browser history storage is unavailable');
    }
  }, []);
  const fail = useCallback((e: unknown) => {
    setError(true);
    setStatus(e instanceof Error ? e.message : 'Saving failed. Please retry.');
  }, []);
  const install = useCallback(
    (record: SavedRoom, data: Study) => {
      active.current = record;
      latest.current = data;
      saved.current = JSON.stringify(data);
      callbacks.current.setStudy(data);
      callbacks.current.clearUndo();
      remember(record);
      const url = new URL(window.location.href);
      url.searchParams.delete('design');
      window.history.replaceState(null, '', url);
      setError(false);
      setStatus('Saved online');
    },
    [remember],
  );
  const create = useCallback(
    async (data: Study) => {
      const record = (await roomRequest('POST', undefined, {
        study: data,
      })) as SavedRoom;
      install(record, data);
    },
    [install],
  );
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const record = active.current;
    const data = latest.current;
    const serialized = JSON.stringify(data);
    if (!record)
      throw new Error('No saved room yet. Use Retry or Copy to new.');
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        if (saved.current === serialized && active.current === record) return;
        setStatus('Saving…');
        const result = await roomRequest('PUT', record.slug, {
          study: data,
          editKey: record.editKey,
          revision: record.revision,
        });
        Object.assign(record, result);
        delete record.draft;
        if (
          active.current === record &&
          JSON.stringify(latest.current) !== serialized
        )
          record.draft = latest.current;
        remember(record);
        if (active.current === record) {
          saved.current = serialized;
          setStatus(record.draft ? 'Unsaved changes…' : 'Saved online');
          setError(false);
        }
      });
    queue.current = task;
    return task;
  }, [remember]);
  const initialize = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      if (incomingSlug.current === undefined) {
        const url = new URL(window.location.href);
        incomingSlug.current = url.searchParams.get('design');
        url.searchParams.delete('design');
        window.history.replaceState(null, '', url);
      }
      const slug = incomingSlug.current;
      if (slug) {
        const source = await roomRequest('GET', slug);
        await create(callbacks.current.migrate(source.study));
      } else if (rows.current[0]) {
        const record = rows.current[0];
        const source = await roomRequest('GET', record.slug);
        install(
          {...record, revision: source.revision, updatedAt: source.updatedAt},
          callbacks.current.migrate(source.study),
        );
        if (record.draft) {
          active.current!.revision = record.revision;
          latest.current = callbacks.current.migrate(record.draft);
          callbacks.current.setStudy(latest.current);
        }
      } else {
        let data = callbacks.current.sample();
        try {
          const local = localStorage.getItem(LOCAL_KEY);
          if (local) data = callbacks.current.migrate(JSON.parse(local));
        } catch {
          /* Keep sample if the old local layout is invalid. */
        }
        await create(data);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [create, fail, install]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      rows.current = Array.isArray(stored)
        ? stored
            .filter(
              (r: any): r is SavedRoom =>
                r &&
                typeof r.slug === 'string' &&
                typeof r.editKey === 'string',
            )
            .slice(0, 20)
        : [];
      setRecent(rows.current);
    } catch {
      /* History is optional; database remains authoritative. */
    }
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (busy || !active.current) return;
    const serialized = JSON.stringify(study);
    if (serialized === saved.current) return;
    active.current.draft = study;
    remember(active.current);
    try {
      localStorage.setItem(LOCAL_KEY, serialized);
    } catch {
      /* Online save still works. */
    }
    setStatus('Unsaved changes…');
    timer.current = setTimeout(() => {
      void flush().catch(fail);
    }, 800);
    return () => clearTimeout(timer.current);
  }, [study, busy, remember, flush, fail]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (active.current && JSON.stringify(latest.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const switchRoom = async (mode: 'new' | 'copy' | SavedRoom) => {
    setBusy(true);
    clearTimeout(timer.current);
    try {
      // Copy is also the escape hatch for a stale revision; preserve its exact local draft.
      if (mode !== 'copy' && active.current) await flush();
      else await queue.current.catch(() => {});
      if (mode === 'new') await create(callbacks.current.sample());
      else if (mode === 'copy') await create(latest.current);
      else {
        const source = await roomRequest('GET', mode.slug);
        const remote = callbacks.current.migrate(source.study);
        const draft = mode.draft;
        install(
          {...mode, revision: source.revision, updatedAt: source.updatedAt},
          remote,
        );
        if (draft) {
          // Retain the draft's original revision so a stale local draft cannot overwrite a newer tab.
          active.current!.revision = mode.revision;
          latest.current = draft;
          callbacks.current.setStudy(draft);
        }
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const retry = () => {
    if (active.current) void flush().catch(fail);
    else void initialize();
  };
  const share = async (details: Record<string, unknown>) => {
    await flush();
    const record = active.current!;
    const response = await fetch('/api/cabinet-share', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        ...details,
        slug: record.slug,
        editKey: record.editKey,
        revision: record.revision,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = (await response.json()) as {error?: string};
    if (!response.ok)
      throw new Error(data.error || 'Unable to send the email. Please retry.');
  };
  const getPrice = async (details: Record<string, unknown>) => {
    await flush();
    const record = active.current!;
    const response = await fetch('/api/cabinet-price', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        ...details,
        slug: record.slug,
        editKey: record.editKey,
        revision: record.revision,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data =
      (await response.json()) as import('./priceProtocol').PriceEstimate & {
        error?: string;
      };
    if (!response.ok)
      throw new Error(
        data.error || 'Unable to calculate a price. Please retry.',
      );
    return data;
  };
  return {
    recent,
    status,
    busy,
    error,
    ready: !!active.current,
    switchRoom,
    retry,
    share,
    getPrice,
  };
}
