import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {afterEach, expect, it} from 'vitest';
import {base, Discovery, Process} from './CabinetryPages';
import CabinetryContact from '~/routes/inquire.cabinetry.contact';

afterEach(cleanup);

it('keeps saved ideas and campaign attribution across independently addressable pages', async () => {
  const router = createMemoryRouter(
    [
      {path: base + '/discover', element: <Discovery />},
      {path: base + '/process', element: <Process />},
      {
        path: base + '/contact',
        loader: () => ({turnstileSiteKey: '', submissionId: 'test'}),
        element: <CabinetryContact />,
      },
    ],
    {initialEntries: [base + '/discover?idea=vanity&utm_source=ad']},
  );
  render(<RouterProvider router={router} />);
  fireEvent.click(screen.getByRole('link', {name: 'Save to my project'}));
  fireEvent.click(screen.getByRole('link', {name: 'Our process'}));
  fireEvent.click(
    await screen.findByRole('link', {name: /Talk about your room/}),
  );
  expect(
    await screen.findByDisplayValue('I’m interested in Bathroom vanity.'),
  ).toBeVisible();
  expect(screen.queryByRole('option', {name: 'Custom furniture'})).toBeNull();
  expect(router.state.location.search).toContain('utm_source=ad');
});
