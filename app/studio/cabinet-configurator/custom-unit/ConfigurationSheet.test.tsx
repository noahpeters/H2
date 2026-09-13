import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import {afterEach, beforeAll, expect, it, vi} from 'vitest';
import {ConfigurationSheet} from './ConfigurationSheet';
import type {RoomElement} from '../model';
vi.mock('./PartViewport', () => ({
  PartViewport: () => <div>Cabinet preview</div>,
}));
vi.mock('../VisualChoices', () => ({
  VisualSelect: ({
    value,
    onChange,
    children,
  }: {
    value: string;
    onChange: (event: unknown) => void;
    children: import('react').ReactNode;
  }) => (
    <select aria-label="Countertop sink" value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
});
afterEach(cleanup);
const item: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 36,
  height: 34.5,
  depth: 24,
  face: 'slab',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
it('keeps sink edits local until the designer saves the configuration', () => {
  const save = vi.fn(),
    close = vi.fn();
  render(<ConfigurationSheet item={item} onSave={save} onClose={close} />);
  fireEvent.change(screen.getByRole('combobox', {name: 'Countertop sink'}), {
    target: {value: 'vessel'},
  });
  fireEvent.change(
    screen.getByLabelText('Sink horizontal offset from center (in)'),
    {target: {value: '3'}},
  );
  expect(item.sink).toBeUndefined();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Save configuration'}));
  expect(save).toHaveBeenCalledWith(expect.any(Object), {
    kind: 'vessel',
    x: 3,
    width: 16,
    depth: 14,
  });
});
it('cancels removing a legacy sink without changing the cabinet', () => {
  const legacy = {...item, configuration: 'sink' as const};
  const save = vi.fn(),
    close = vi.fn();
  render(<ConfigurationSheet item={legacy} onSave={save} onClose={close} />);
  expect(screen.getByRole('combobox', {name: 'Countertop sink'})).toHaveValue(
    'undermount',
  );
  fireEvent.change(screen.getByRole('combobox', {name: 'Countertop sink'}), {
    target: {value: ''},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
  expect(close).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(legacy.sink).toBeUndefined();
});
it('does not offer sink controls for wall cabinets', () => {
  render(
    <ConfigurationSheet
      item={{...item, kind: 'wall-cabinet'}}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole('combobox', {name: 'Countertop sink'}),
  ).not.toBeInTheDocument();
});
