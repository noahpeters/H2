import {StrictMode} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {MemoryRouter, StaticRouter} from 'react-router';
import {CabinitronFrame} from '../CabinitronFrame';
import {
  cabinitronEmbedUrl,
  cabinitronInstallationUrl,
} from '../cabinitronEmbed';

const token = 'a'.repeat(64);
const storageKey = 'cabinitron:https://cabinitron.com:from-trees:test';
const page = `/cabinet-configurator?design=saved&revision=3#section=plan&cabinitron-test=${token}`;
const designer = cabinitronEmbedUrl(`https://from-trees.com${page}`);

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState({router: 'preserved'}, '', page);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

it('forwards the installation token while preserving design links and router history', () => {
  const url = new URL(cabinitronInstallationUrl(designer, window));
  expect(url.searchParams.get('installTest')).toBe(token);
  expect(url.searchParams.get('design')).toBe('saved');
  expect(url.searchParams.get('revision')).toBe('3');
  expect(url.searchParams.get('embed')).toBe('studio');
  expect(location.hash).toBe('#section=plan');
  expect(location.search).toBe('?design=saved&revision=3');
  expect(history.state).toEqual({router: 'preserved'});
  expect(sessionStorage.getItem(storageKey)).toBe('staff');
  expect(
    new URL(cabinitronInstallationUrl(designer, window)).searchParams.get(
      'installTest',
    ),
  ).toBe('staff');
});

it('does not mark ordinary visitors or accept arbitrary test values', () => {
  history.replaceState(
    null,
    '',
    '/cabinet-configurator#cabinitron-test=invalid',
  );
  expect(
    new URL(cabinitronInstallationUrl(designer, window)).searchParams.has(
      'installTest',
    ),
  ).toBe(false);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
});

it('continues the current test when storage and history are blocked', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  vi.spyOn(history, 'replaceState').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(
    new URL(cabinitronInstallationUrl(designer, window)).searchParams.get(
      'installTest',
    ),
  ).toBe(token);
});

it('keeps ordinary visitor loads working when storage cannot be read', () => {
  history.replaceState(null, '', '/cabinet-configurator');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(cabinitronInstallationUrl(designer, window)).toBe(designer);
});

it('waits to resolve the test before loading the frame and survives effect replay', () => {
  const markup = renderToString(
    <StaticRouter location={page}>
      <CabinitronFrame designerUrl={designer} />
    </StaticRouter>,
  );
  expect(markup).not.toContain('<iframe');
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[page]}>
        <CabinitronFrame designerUrl={designer} />
      </MemoryRouter>
    </StrictMode>,
  );
  const frame = screen.getByTitle('From Trees cabinet designer');
  expect(
    new URL(frame.getAttribute('src')!).searchParams.get('installTest'),
  ).toBe(token);
  expect(frame.getAttribute('referrerpolicy')).toBe('origin');
  expect(document.querySelectorAll('iframe')).toHaveLength(1);
});
