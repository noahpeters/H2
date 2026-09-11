import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import CabinetAdmin from '~/routes/admin.custom-cabinets';
import type {CustomCabinetLibraryItem} from './library';
vi.mock('./PartViewport', async () => {
  const {cabinetOpenings, partInOpening} = await import('./openingPlacement');
  return {
    PartViewport: (
      props: Parameters<typeof import('./PartViewport').PartViewport>[0],
    ) =>
      props.placement ? (
        <button
          onClick={() =>
            props.onPlace(
              partInOpening(
                props.definition,
                props.placement!,
                cabinetOpenings(props.definition)[0],
              ),
            )
          }
        >
          Place in opening
        </button>
      ) : (
        <div>3D viewport</div>
      ),
  };
});
vi.mock('~/studio/StudioHeader', () => ({
  StudioHeader: () => <header>From Trees</header>,
}));

describe('cabinet library save flow', () => {
  it('creates a cabinet then saves subsequent edits as new versions of the same item', async () => {
    let items: CustomCabinetLibraryItem[] = [];
    const requests: string[] = [];
    const router = createMemoryRouter(
      [
        {
          path: '/admin/custom-cabinets',
          Component: CabinetAdmin,
          loader: () => ({items}),
          action: async ({request}) => {
            const form = await request.formData();
            requests.push(String(form.get('method')));
            const input = JSON.parse(
              String(form.get('cabinet')),
            ) as CustomCabinetLibraryItem;
            const item = {
              ...input,
              version: requests.length,
              updatedAt: '2026-09-11',
            };
            items = [item];
            return item;
          },
        },
      ],
      {initialEntries: ['/admin/custom-cabinets']},
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole('button', {name: 'Save cabinet'});
    fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
    fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save cabinet'}));
    await screen.findByRole('button', {name: 'Save new version'});
    fireEvent.click(screen.getByRole('button', {name: 'Save new version'}));
    await waitFor(() => expect(requests).toEqual(['POST', 'PUT']));
    expect(
      items[0].definition.parts!.some((part) => part.kind === 'shelf'),
    ).toBe(true);
    expect(items[0].version).toBe(2);
  });
});
