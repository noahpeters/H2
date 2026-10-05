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

test('replaces and releases diagnostic downloads independently of the photo', () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((blob) =>
      blob instanceof Blob && blob.type === 'image/png'
        ? 'blob:photo'
        : 'blob:diagnostics',
    );
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const photo = new Blob(['photo'], {type: 'image/png'});
  const archive = new Blob(['archive'], {type: 'application/zip'});
  const view = render(
    <PhotoDialog blob={photo} close={() => {}} diagnostics={archive} />,
  );
  expect(create).toHaveBeenCalledWith(archive);
  expect(
    screen.getByRole('link', {name: 'Download diagnostics'}),
  ).toHaveAttribute('download', 'cabinet-room-photo-diagnostics.zip');
  view.rerender(<PhotoDialog blob={photo} close={() => {}} />);
  expect(screen.queryByRole('link', {name: 'Download diagnostics'})).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:diagnostics');
  expect(revoke).not.toHaveBeenCalledWith('blob:photo');
  view.unmount();
  expect(revoke).toHaveBeenCalledWith('blob:photo');
});
