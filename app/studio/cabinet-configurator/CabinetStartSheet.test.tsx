import {render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {CabinetStartSheet, STARTER_DESIGNS} from './CabinetStartSheet';
import {blankStudy} from './CabinetConfigurator';

vi.mock('./CabinetConfigurator', async (original) => {
  const actual = await original<typeof import('./CabinetConfigurator')>();
  return {
    ...actual,
    ThreeStudy: ({study, onSelect}: {study: unknown; onSelect?: unknown}) => (
      <div data-testid="preview" data-readonly={!onSelect}>
        {JSON.stringify(study)}
      </div>
    ),
  };
});
afterEach(() => vi.unstubAllGlobals());

test('reads three examples without creating or modifying rooms and offers four starting links', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ok: true, json: async () => ({study: blankStudy()})});
  vi.stubGlobal('fetch', fetcher);
  render(<CabinetStartSheet />);
  await waitFor(() => expect(screen.getAllByTestId('preview')).toHaveLength(4));
  expect(fetcher).toHaveBeenCalledTimes(3);
  STARTER_DESIGNS.forEach(({slug, title}) => {
    expect(fetcher).toHaveBeenCalledWith(
      `/api/cabinet-rooms?slug=${slug}`,
      expect.objectContaining({method: 'GET', body: undefined}),
    );
    expect(
      screen.getByRole('link', {name: `Start here: ${title}`}),
    ).toHaveAttribute('href', `/cabinet-configurator?design=${slug}`);
  });
  expect(
    screen.getByRole('link', {name: 'Start here: Start from scratch'}),
  ).toHaveAttribute('href', '/cabinet-configurator?preset=blank');
  screen
    .getAllByTestId('preview')
    .forEach((preview) =>
      expect(preview).toHaveAttribute('data-readonly', 'true'),
    );
});

test('blank study has no cabinets, appliances, islands or openings', () => {
  expect(blankStudy()).toMatchObject({
    elements: [],
    islands: [],
    openings: [],
    selected: null,
  });
});
