import {render, screen, fireEvent, cleanup} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {VisualSelect, previewElement} from './VisualChoices';
afterEach(cleanup);

test('visual choices keep labels, selected state, disabled choices and change behavior', () => {
  const onChange = vi.fn();
  render(
    <VisualSelect category="front" value="shaker" onChange={onChange}>
      <option value="shaker">Shaker</option>
      <option value="slab">Slab</option>
      <option value="shaker-glass" disabled>
        Glass
      </option>
    </VisualSelect>,
  );
  expect(screen.getByRole('button', {name: 'Shaker'})).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', {name: 'Glass'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Slab'}));
  expect(onChange).toHaveBeenCalledWith({currentTarget: {value: 'slab'}});
});
test('previews use the actual cabinet, appliance, storage and finish models', () => {
  expect(previewElement('cabinet', 'wall-cabinet')).toMatchObject({
    kind: 'wall-cabinet',
    depth: 12,
  });
  expect(previewElement('base', 'farmhouse-sink')).toMatchObject({
    kind: 'base',
    configuration: 'farmhouse-sink',
  });
  expect(previewElement('front', 'vertical-slat')).toMatchObject({
    face: 'vertical-slat',
  });
  expect(previewElement('material', 'walnut')).toMatchObject({
    material: 'walnut',
  });
  expect(previewElement('paint', 'sage-green')).toMatchObject({
    material: 'paint-grade',
    paintColor: 'sage-green',
  });
  expect(previewElement('appliance', 'refrigerator')).toMatchObject({
    kind: 'appliance',
    applianceKind: 'refrigerator',
  });
  expect(previewElement('storage', 'floating-shelves')).toMatchObject({
    storage: {type: 'floating-shelves'},
  });
});
