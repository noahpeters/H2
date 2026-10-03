import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {PhotoProgressDialog} from './PhotoProgressDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('opens modally, keeps progress updates in the same dialog, and cancels by button or Escape', () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  const close = vi.spyOn(HTMLDialogElement.prototype, 'close');
  const cancel = vi.fn();
  const view = render(<PhotoProgressDialog progress={0} cancel={cancel} />);
  const dialog = screen.getByRole('dialog', {name: 'Say cheese!'});
  expect(show).toHaveBeenCalledOnce();
  expect(dialog).toHaveAccessibleDescription(/can take a few minutes/);
  expect(screen.getByRole('button', {name: 'Cancel photo'})).toHaveFocus();
  view.rerender(<PhotoProgressDialog progress={0.42} cancel={cancel} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0.42');
  expect(show).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', {name: 'Cancel photo'}));
  expect(cancel).toHaveBeenCalledOnce();
  const escape = new Event('cancel', {cancelable: true});
  fireEvent(dialog, escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(dialog).toHaveAttribute('open');
  view.unmount();
  expect(close).toHaveBeenCalledOnce();
});
