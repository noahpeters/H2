import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  cleanup,
  waitFor,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  type ActionFunction,
} from 'react-router';
import {InquiryLayout} from '../../routes/inquire.$kind';

vi.mock('../../studio/ProjectVerification', () => ({
  ProjectVerification: () => (
    <input type="hidden" name="cf-turnstile-response" value="test-token" />
  ),
}));
afterEach(cleanup);

function setup(action: ActionFunction = vi.fn(() => null)) {
  const router = createMemoryRouter(
    [
      {
        path: '/inquire/furniture',
        element: (
          <InquiryLayout
            kind="furniture"
            turnstileSiteKey=""
            submissionId="shared-submission"
          />
        ),
        action,
      },
    ],
    {initialEntries: ['/inquire/furniture']},
  );
  const view = render(<RouterProvider router={router} />);
  const forms = view.container.querySelectorAll('form');
  return {forms, action};
}

describe('repeated inquiry forms', () => {
  it('shares every field in both directions, including preset selections and autofill changes', () => {
    const {forms} = setup();
    expect(forms).toHaveLength(2);
    for (const [name, value] of Object.entries({
      name: 'Test Person',
      email: 'test@example.com',
      phone: '5551234567',
      location: 'Riverside',
      budget: 'To discuss',
      message: 'A dining table',
      projectType: 'Built-ins or storage',
      timeline: '3–6 months',
    })) {
      const top = forms[0].elements.namedItem(name) as HTMLInputElement;
      const bottom = forms[1].elements.namedItem(name) as HTMLInputElement;
      fireEvent.change(top, {target: {value}});
      expect(bottom.value).toBe(value);
      fireEvent.change(bottom, {
        target: {
          value:
            name === 'projectType'
              ? 'Custom furniture'
              : name === 'timeline'
                ? ''
                : `${value} updated`,
        },
      });
      expect(top.value).toBe(bottom.value);
    }
    expect(
      within(forms[0]).getByRole('button', {name: /Send project details/}),
    ).toBeEnabled();
  });

  it.each([0, 1])(
    'submits the shared entries and one verification token from form %s to the existing route',
    async (index) => {
      let submitted: FormData | undefined;
      const action = vi.fn(async ({request}: {request: Request}) => {
        submitted = await request.formData();
        return null;
      });
      const {forms} = setup(action);
      fireEvent.change(
        forms[1 - index].elements.namedItem('name') as HTMLInputElement,
        {
          target: {value: 'Shared name'},
        },
      );
      fireEvent.submit(forms[index]);
      await waitFor(() => expect(action).toHaveBeenCalledOnce());
      await waitFor(() => expect(submitted?.get('name')).toBe('Shared name'));
      expect(submitted?.get('projectType')).toBe('Custom furniture');
      expect(submitted?.getAll('submissionId')).toEqual(['shared-submission']);
      expect(submitted?.getAll('cf-turnstile-response')).toEqual([
        'test-token',
      ]);
      expect(screen.getByRole('heading', {level: 1})).toHaveTextContent(
        'Furniture, made for your room.',
      );
    },
  );
});
