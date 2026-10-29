import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import CabinetPage from '../../routes/cabinet-configurator';
const state = vi.hoisted(() => ({embedded: false}));

vi.mock('react-router', () => ({
  useLocation: () => ({hash: '', key: 'default'}),
  useLoaderData: () => ({
    showStartSheet: true,
    turnstileSiteKey: '',
    embedded: state.embedded,
    designerUrl:
      'https://cabinitron.com/t/from-trees/cabinet-configurator?embed=studio',
  }),
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
  state.embedded = false;
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

test('embeds Cabinitron without reading browser-only drafts after the cloud cutover', () => {
  state.embedded = true;
  localStorage.setItem(
    'from-trees-room-history-v1',
    JSON.stringify([{slug: 'left-behind', editKey: 'private'}]),
  );
  render(<CabinetPage />);
  expect(screen.getByTitle('From Trees cabinet designer')).toHaveAttribute(
    'src',
    'https://cabinitron.com/t/from-trees/cabinet-configurator?embed=studio',
  );
  expect(screen.queryByText('Design editor')).not.toBeInTheDocument();
  expect(localStorage.getItem('from-trees-room-history-v1')).toContain(
    'left-behind',
  );
});
