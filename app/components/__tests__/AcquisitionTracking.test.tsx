// @vitest-environment jsdom
import {act, render, waitFor} from '@testing-library/react';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {afterEach, expect, it, vi} from 'vitest';
import {AcquisitionTracking} from '../AcquisitionTracking';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('links the hydrated document arrival without reusing it for client navigation', async () => {
  const arrivalId = '16bcb192-608b-47eb-bc98-6036c56ca5e5';
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('performance', {
    now: performance.now.bind(performance),
    getEntriesByType: (type: string) =>
      type === 'navigation'
        ? [{serverTiming: [{name: 'h2-acquisition', description: arrivalId}]}]
        : [],
  });
  const fetcher = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(null, {status: 204}),
  );
  vi.stubGlobal('fetch', fetcher);

  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AcquisitionTracking visitorTtl={15552000} version="baseline-v1" />
        ),
      },
    ],
    {initialEntries: [{pathname: '/about', key: 'scroll-restoration-key'}]},
  );
  render(<RouterProvider router={router} />);
  const view = (index: number) =>
    (
      JSON.parse(String(fetcher.mock.calls[index]?.[1].body)) as {
        event: unknown;
      }
    ).event;

  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(view(0)).toMatchObject({kind: 'view', path: '/about', arrivalId});

  await act(async () => {
    await router.navigate('/contact');
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(view(1)).toMatchObject({kind: 'view', path: '/contact'});
  expect(view(1)).not.toHaveProperty('arrivalId');
});
