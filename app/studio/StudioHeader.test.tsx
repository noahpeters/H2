import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createMemoryRouter, RouterProvider} from 'react-router';
import {expect, test} from 'vitest';
import {StudioHeader} from './StudioHeader';
import {CONSULTATION_URL} from './consultation';

test('groups both design tools and includes the consultation booking link', () => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <StudioHeader
          links={[{label: 'Shape Your Table', to: '/configurator'}]}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
  expect(screen.getByRole('link', {name: 'Shape Your Table'})).toHaveAttribute(
    'href',
    '/configurator',
  );
  expect(screen.getByRole('link', {name: 'Design Your Space'})).toHaveAttribute(
    'href',
    '/cabinet-configurator',
  );
  expect(
    screen.getByRole('link', {name: 'Book A Free Home Consultation'}),
  ).toHaveAttribute('href', CONSULTATION_URL);
});

test('opens the mobile navigation, moves focus, and dismisses it with Escape', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <StudioHeader
          links={[{label: 'Shape Your Table', to: '/configurator'}]}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);

  const menuButton = screen.getByRole('button', {
    name: 'Open navigation menu',
  });
  await user.click(menuButton);

  expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', {name: 'Shape Your Table'})).toHaveFocus();

  await user.keyboard('{Escape}');

  expect(
    screen.getByRole('button', {name: 'Open navigation menu'}),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(menuButton).toHaveFocus();
});
