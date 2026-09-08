import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import CabinetPage from '../../routes/cabinet-configurator';

vi.mock('react-router', () => ({
  useLoaderData: () => ({showStartSheet: true, turnstileSiteKey: ''}),
}));
vi.mock('../StudioHeader', () => ({StudioHeader: () => null}));
vi.mock('./CabinetConfigurator', () => ({
  CabinetConfigurator: () => <div>Design editor</div>,
}));
vi.mock('./CabinetStartSheet', () => ({
  CabinetStartSheet: () => <div>Choose a starting design</div>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
test('a clean URL opens the editor when a saved design exists', () => {
  localStorage.setItem(
    'from-trees-room-history-v1',
    JSON.stringify([{slug: 'owned', editKey: 'key'}]),
  );
  render(<CabinetPage />);
  expect(screen.getByText('Design editor')).toBeInTheDocument();
  expect(
    screen.queryByText('Choose a starting design'),
  ).not.toBeInTheDocument();
});
test.each([null, 'invalid', '[{}]'])(
  'shows the starter for missing or invalid history: %s',
  (history) => {
    if (history) localStorage.setItem('from-trees-room-history-v1', history);
    render(<CabinetPage />);
    expect(screen.getByText('Choose a starting design')).toBeInTheDocument();
  },
);
