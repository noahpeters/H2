import {render, screen} from '@testing-library/react';
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
