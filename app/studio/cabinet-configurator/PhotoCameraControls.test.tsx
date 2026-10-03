import {useState} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test} from 'vitest';
import {PhotoCameraControls} from './PhotoCameraControls';
import {DEFAULT_PHOTO_CAMERA} from './photoCamera';
afterEach(cleanup);
function Controls() {
  const [value, setValue] = useState(DEFAULT_PHOTO_CAMERA);
  return <PhotoCameraControls value={value} onChange={setValue} />;
}
test('automatic defaults expose manual temperature and exact-view controls only when applicable', () => {
  render(<Controls />);
  expect(screen.getByLabelText('Auto Exposure')).toBeChecked();
  expect(screen.getByLabelText('Temperature override (K)')).toBeDisabled();
  expect(screen.getByLabelText('Lens (mm)')).toHaveValue(28);
  fireEvent.click(screen.getByLabelText('Auto White Balance'));
  expect(screen.getByLabelText('Temperature override (K)')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Temperature override (K)'), {
    target: {value: '4000'},
  });
  expect(screen.getByLabelText('Temperature override (K)')).toHaveValue(4000);
  fireEvent.click(screen.getByLabelText('Keep vertical lines straight'));
  expect(screen.getByLabelText('Lens (mm)')).toBeDisabled();
  expect(screen.getByLabelText('Vertical Shift')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Photo Quality'), {
    target: {value: 'fine'},
  });
  expect(screen.getByLabelText('Photo Quality')).toHaveValue('fine');
});
