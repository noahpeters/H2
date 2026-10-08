import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {GlbObjectImport} from './GlbObjectImport';
import {glbFixture} from './__tests__/glbFixture';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('imports a measured hosted GLB and surfaces load failures without adding an object', async () => {
  const add = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(glbFixture())),
  );
  render(<GlbObjectImport onAdd={add} />);
  fireEvent.click(screen.getByText('+ Add GLB object'));
  fireEvent.change(screen.getByLabelText('Object name'), {
    target: {value: 'Our lamp'},
  });
  fireEvent.change(screen.getByLabelText('GLB URL'), {
    target: {value: 'https://example.com/lamp.glb'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Add object'}));
  await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  expect(add.mock.calls[0][0]).toBe('Our lamp');
  expect(add.mock.calls[0][2].width).toBeCloseTo(10, 4);
  vi.mocked(fetch).mockResolvedValue(new Response(null, {status: 404}));
  fireEvent.change(screen.getByLabelText('Object name'), {
    target: {value: 'Missing model'},
  });
  fireEvent.change(screen.getByLabelText('GLB URL'), {
    target: {value: 'https://example.com/missing.glb'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Add object'}));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load GLB'),
  );
  expect(add).toHaveBeenCalledTimes(1);
});
