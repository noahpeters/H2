import {act, renderHook, waitFor, cleanup} from '@testing-library/react';
import {useState} from 'react';
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';
import {useSavedRooms} from './useSavedRooms';
import type {Study} from './CabinetConfigurator';
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
function useHarness() {
  const [study, setStudy] = useState(sample);
  return {
    study,
    setStudy,
    ...useSavedRooms(
      study,
      setStudy,
      sample,
      (s) => s,
      () => {},
    ),
  };
}
describe('saved room lifecycle', () => {
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
    window.history.replaceState(null, '', '/cabinet-configurator');
    records = new Map();
    count = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: any) => {
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
  it('does not create a sample or overwrite anything for a missing shared slug', async () => {
    window.history.replaceState(null, '', '?design=missing');
    const {result} = renderHook(useHarness);
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(count).toBe(0);
    expect(window.location.search).toBe('');
  });
});
