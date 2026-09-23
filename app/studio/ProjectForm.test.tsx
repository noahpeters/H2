import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {ProjectForm} from './ProjectForm';
vi.mock('./ProjectVerification', () => ({
  ProjectVerification: () => (
    <input name="cf-turnstile-response" value="test" readOnly />
  ),
}));
afterEach(cleanup);
it('shows an accepted study receipt in the dialog without navigating', async () => {
  const router = createMemoryRouter(
    [
      {
        path: '/configurator',
        element: (
          <ProjectForm
            inPlace
            configuratorSource="table"
            submissionId="12345678-1234-4234-8234-123456789012"
            turnstileSiteKey="test"
          />
        ),
        loader: () => ({}),
      },
      {path: '/contact', action: async () => ({ok: true, eventId: 'test'})},
    ],
    {initialEntries: ['/configurator']},
  );
  const {container} = render(<RouterProvider router={router} />);
  await screen.findByRole('button', {name: 'Send project details'});
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('checkbox')).not.toBeRequired();
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Study received'),
  );
  expect(router.state.location.pathname).toBe('/configurator');
});
