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
it('edits dimensions, interiors, doors/back and switches to overhead storage', () => {
  const {container} = render(<Harness />);
  fireEvent.change(screen.getByLabelText('Storage depth'), {
    target: {value: '20'},
  });
  fireEvent.change(screen.getByLabelText('Shelf count'), {
    target: {value: '3'},
  });
  fireEvent.click(screen.getByLabelText('Doors'));
  fireEvent.click(screen.getByLabelText('Finished back'));
  let item = JSON.parse(container.querySelector('output')!.textContent!) as any;
  expect(item).toMatchObject({
    depth: 20,
    storage: {shelves: 3, doors: true, back: false},
  });
  fireEvent.change(screen.getByLabelText('Open storage type'), {
    target: {value: 'overhead'},
  });
  item = JSON.parse(container.querySelector('output')!.textContent!) as any;
  expect(item).toMatchObject({
    kind: 'wall-cabinet',
    height: 24,
    placement: {elevation: 72},
    storage: {type: 'overhead'},
  });
});
