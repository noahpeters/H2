import {useState} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it} from 'vitest';
import {OpenStorageControls} from './OpenStorageControls';
import {createOpenStorage} from './openStorage';
afterEach(cleanup);
function Harness() {
  const [item, setItem] = useState(createOpenStorage('shelving', 'test'));
  return (
    <>
      <OpenStorageControls
        item={item}
        change={(patch) => setItem((current) => ({...current, ...patch}))}
      />
      <output>{JSON.stringify(item)}</output>
    </>
  );
}
it('edits dimensions, interiors, doors and back without changing type', () => {
  const {container} = render(<Harness />);
  fireEvent.change(screen.getByLabelText('Storage depth'), {
    target: {value: '20'},
  });
  fireEvent.change(screen.getByLabelText('Shelf count'), {
    target: {value: '3'},
  });
  fireEvent.click(screen.getByLabelText('Doors'));
  fireEvent.click(screen.getByLabelText('Finished back'));
  const item = JSON.parse(
    container.querySelector('output')!.textContent!,
  ) as any;
  expect(item).toMatchObject({
    depth: 20,
    storage: {shelves: 3, doors: true, back: false},
  });
  expect(item.storage.type).toBe('shelving');
  expect(screen.queryByLabelText('Open storage type')).not.toBeInTheDocument();
});

it('selects a decorative style on the back panel', () => {
  const {container} = render(<Harness />);
  fireEvent.change(screen.getByLabelText('Back panel style'), {
    target: {value: 'vertical-shiplap'},
  });
  const item = JSON.parse(
    container.querySelector('output')!.textContent!,
  ) as any;
  expect(item.storage.backStyle).toBe('vertical-shiplap');

  fireEvent.click(screen.getByLabelText('Finished back'));
  expect(screen.queryByLabelText('Back panel style')).not.toBeInTheDocument();
});

it('accepts fractional shelf spacing while keeping shelf counts integral', () => {
  const {container} = render(<Harness />);
  const spacing = screen.getByLabelText('Shelf spacing (0 = evenly spaced)');
  expect(spacing).toHaveAttribute('step', '0.125');
  expect(screen.getByLabelText('Storage depth')).toHaveAttribute(
    'step',
    '0.125',
  );
  fireEvent.change(spacing, {target: {value: '12.125'}});
  fireEvent.change(screen.getByLabelText('Shelf count'), {
    target: {value: '2.5'},
  });
  const item = JSON.parse(
    container.querySelector('output')!.textContent!,
  ) as ReturnType<typeof createOpenStorage>;
  expect(item.storage!.shelfSpacing).toBe(12.125);
  expect(item.storage!.shelves).toBe(
    createOpenStorage('shelving', 'test').storage!.shelves,
  );
});
