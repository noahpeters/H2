import {act, renderHook, waitFor, cleanup} from '@testing-library/react';
import {useState} from 'react';
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';
import {readSavedRooms, useSavedRooms} from './useSavedRooms';
import {migrateStudy, type Study} from './CabinetConfigurator';
const sample = (): Study => ({
  version: 2,
  room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
  elements: [],
  openings: [],
  islands: [],
  selected: null,
  countertop: true,
  view: 'split',
});
function useHarness(migrate: (study: Study) => Study = (s) => s) {
  const [study, setStudy] = useState(sample);
  return {
    study,
    setStudy,
    ...useSavedRooms(study, setStudy, sample, migrate, () => {}),
  };
}
function refreshWarns() {
  const event = new Event('beforeunload', {cancelable: true});
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
describe('saved room lifecycle', () => {
  it('migrates recovery drafts when switching rooms through History', async () => {
    const {result} = renderHook(() => useHarness(migrateStudy));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const original = result.current.recent[0];
    await act(async () => {
      await result.current.switchRoom('new');
    });
    await act(async () => {
      await result.current.switchRoom({...original, draft: sample()});
    });
    expect(result.current.study.room.overlay).toBe('full-overlay');
  });

  it('restores the most recent owned room on a clean-URL reload without creating a copy', async () => {
    const first = renderHook(useHarness);
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    const original = first.result.current.recent[0].slug;
    act(() =>
      first.result.current.setStudy({
        ...sample(),
        room: {...sample().room, width: 200},
      }),
    );
    await act(async () => {
      await first.result.current.switchRoom(first.result.current.recent[0]);
    });
    first.unmount();
    const before = count;
    const second = renderHook(useHarness);
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.recent[0].slug).toBe(original);
    expect(second.result.current.study.room.width).toBe(200);
    expect(count).toBe(before);
    expect(window.location.search).toBe('');
  });
  let records: Map<string, any>, count: number;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/cabinet-configurator');
    records = new Map();
    count = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: any) => {
        if (input === '/api/cabinet-analytics') return Response.json({ok: true});
        const slug = new URL(input, 'https://test.local').searchParams.get(
          'slug',
        );
        const body: any = init.body ? JSON.parse(init.body) : null;
        if (init.method === 'GET')
          return new Response(
            JSON.stringify(records.get(slug!) || {error: 'Room not found'}),
            {status: records.has(slug!) ? 200 : 404},
          );
        if (init.method === 'POST') {
          const id = String(++count).padStart(32, '0');
          const record = {
            slug: id,
            editKey: `key-${id}`,
            revision: 1,
            updatedAt: new Date().toISOString(),
            study: body.study,
          };
          records.set(id, record);
          return Response.json(record);
        }
        const record = records.get(slug!);
        if (body.revision !== record.revision)
          return Response.json({error: 'Conflict'}, {status: 409});
        Object.assign(record, {
          study: body.study,
          revision: record.revision + 1,
        });
        return Response.json(record);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  it('forks direct URLs, copies exact edits, makes fresh samples, and resumes History without forking', async () => {
    const source = {...sample(), room: {...sample().room, width: 210}};
    records.set('source', {study: source});
    window.history.replaceState(null, '', '?design=source');
    const {result} = renderHook(useHarness);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.study).toEqual(source);
    expect(window.location.search).not.toContain('source');
    const first = result.current.recent[0];
    act(() =>
      result.current.setStudy({...source, room: {...source.room, width: 220}}),
    );
    await act(async () => {
      await result.current.switchRoom('copy');
    });
    expect(result.current.study.room.width).toBe(220);
    expect(result.current.recent[0].slug).not.toBe(first.slug);
    expect(records.get('source').study.room.width).toBe(210);
    await act(async () => {
      await result.current.switchRoom('new');
    });
    expect(result.current.study).toEqual(sample());
    const before = count;
    await act(async () => {
      await result.current.switchRoom(first);
    });
    expect(count).toBe(before);
    expect(result.current.study.room.width).toBe(220);
  });
  it('restores this tab’s active room even when another room is more recent', async () => {
    const first = renderHook(useHarness);
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    const original = first.result.current.recent[0];
    await act(async () => {
      await first.result.current.switchRoom('new');
    });
    const other = first.result.current.recent[0];
    await act(async () => {
      await first.result.current.switchRoom(original);
    });
    first.unmount();
    localStorage.setItem(
      'from-trees-room-history-v1',
      JSON.stringify([other, original]),
    );
    const before = count;
    const second = renderHook(useHarness);
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.recent[0].slug).toBe(original.slug);
    expect(count).toBe(before);
  });
  it('autosaves changes and preserves a recovery draft on failed writes', async () => {
    const {result} = renderHook(useHarness);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.setStudy({
        ...sample(),
        room: {...sample().room, width: 180},
      }),
    );
    await waitFor(
      () =>
        expect(
          records.get(result.current.recent[0].slug).study.room.width,
        ).toBe(180),
      {timeout: 3000},
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({error: 'Offline'}, {status: 503})),
    );
    act(() =>
      result.current.setStudy({
        ...sample(),
        room: {...sample().room, width: 190},
      }),
    );
    await waitFor(() => expect(result.current.error).toBe(true), {
      timeout: 3000,
    });
    expect(
      (
        JSON.parse(localStorage.getItem('from-trees-room-history-v1')!) as any
      )[0].draft.room.width,
    ).toBe(190);
  });
  it('recovers a stale draft once, preserves the newer online room, and reloads without a warning', async () => {
    const first = renderHook(useHarness);
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    const original = first.result.current.recent[0];
    first.unmount();
    const remote = {...sample(), room: {...sample().room, width: 210}};
    const draft = {...sample(), room: {...sample().room, width: 180}};
    Object.assign(records.get(original.slug), {study: remote, revision: 2});
    localStorage.setItem(
      'from-trees-room-history-v1',
      JSON.stringify([{...original, draft}]),
    );
    const recovered = renderHook(useHarness);
    await waitFor(() => expect(recovered.result.current.study).toEqual(draft));
    await waitFor(
      () => expect(recovered.result.current.status).toBe('Saved online'),
      {
        timeout: 3000,
      },
    );
    const copy = recovered.result.current.recent[0];
    expect(copy.slug).not.toBe(original.slug);
    expect(records.get(copy.slug).study).toEqual(draft);
    expect(records.get(original.slug).study).toEqual(remote);
    expect(
      readSavedRooms().find((r) => r.slug === original.slug)?.draft,
    ).toBeUndefined();
    expect(sessionStorage.getItem('from-trees-active-room-v1')).toBe(copy.slug);
    expect(refreshWarns()).toBe(false);
    recovered.unmount();
    const before = count;
    const reload = renderHook(useHarness);
    await waitFor(() => expect(reload.result.current.ready).toBe(true));
    expect(reload.result.current.study).toEqual(draft);
    expect(reload.result.current.recent[0].slug).toBe(copy.slug);
    expect(refreshWarns()).toBe(false);
    expect(count).toBe(before);
  });
  it('saves edits queued during conflict recovery to the recovered room without creating another copy', async () => {
    const {result} = renderHook(useHarness);
    await waitFor(() => expect(result.current.ready).toBe(true));
    const original = result.current.recent[0];
    records.get(original.slug).revision = 2;
    const fetchRoom = vi.mocked(fetch).getMockImplementation()!;
    let finishCopy: (() => void) | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init: any) => {
      if (init.method === 'POST')
        await new Promise<void>((resolve) => {
          finishCopy = resolve;
        });
      return fetchRoom(input, init);
    });
    act(() =>
      result.current.setStudy({
        ...sample(),
        room: {...sample().room, width: 180},
      }),
    );
    await waitFor(() => expect(finishCopy).toBeDefined(), {timeout: 3000});
    expect(refreshWarns()).toBe(true);
    act(() =>
      result.current.setStudy({
        ...sample(),
        room: {...sample().room, width: 190},
      }),
    );
    act(() => result.current.retry());
    await act(async () => finishCopy!());
    await waitFor(() => expect(result.current.status).toBe('Saved online'));
    const copy = result.current.recent[0];
    expect(copy.slug).not.toBe(original.slug);
    expect(result.current.study.room.width).toBe(190);
    expect(records.get(copy.slug).study.room.width).toBe(190);
    expect(records.get(original.slug).study.room.width).toBe(144);
    expect(count).toBe(2);
    expect(refreshWarns()).toBe(false);
  });
  it('keeps the original recovery draft and warning when saving the recovered copy fails', async () => {
    const {result} = renderHook(useHarness);
    await waitFor(() => expect(result.current.ready).toBe(true));
    const original = result.current.recent[0];
    records.get(original.slug).revision = 2;
    const fetchRoom = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init: any) =>
      init.method === 'POST'
        ? Response.json({error: 'Offline'}, {status: 503})
        : fetchRoom(input, init),
    );
    act(() =>
      result.current.setStudy({
        ...sample(),
        room: {...sample().room, width: 180},
      }),
    );
    await waitFor(() => expect(result.current.error).toBe(true), {
      timeout: 3000,
    });
    expect(result.current.recent[0].slug).toBe(original.slug);
    expect(readSavedRooms()[0].draft?.room.width).toBe(180);
    expect(refreshWarns()).toBe(true);
    expect(count).toBe(1);
  });
  it('does not create a sample or overwrite anything for a missing shared slug', async () => {
    window.history.replaceState(null, '', '?design=missing');
    const {result} = renderHook(useHarness);
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(count).toBe(0);
    expect(window.location.search).toBe('');
  });
});
