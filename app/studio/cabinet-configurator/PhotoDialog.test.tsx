import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {PhotoDialog} from './PhotoDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('previews the captured PNG, offers an explicit download, and releases it on close or Escape', () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  const closeDialog = vi
    .spyOn(HTMLDialogElement.prototype, 'close')
    .mockImplementation(function (this: HTMLDialogElement) {
      this.open = false;
    });
  const close = vi.fn();
  const blob = new Blob(['captured'], {type: 'image/png'});
  const view = render(<PhotoDialog blob={blob} close={close} />);
  expect(create).toHaveBeenCalledWith(blob);
  expect(screen.getByRole('dialog', {name: 'Your room photo'})).toBeVisible();
  expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:photo');
  const download = screen.getByRole('link', {name: 'Download PNG'});
  expect(download).toHaveAttribute('href', 'blob:photo');
  expect(download).toHaveAttribute('download', 'cabinet-room-photo.png');
  fireEvent.click(screen.getByRole('button', {name: 'Close'}));
  expect(close).toHaveBeenCalledOnce();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', {cancelable: true}),
  );
  expect(close).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(closeDialog).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith('blob:photo');
});
