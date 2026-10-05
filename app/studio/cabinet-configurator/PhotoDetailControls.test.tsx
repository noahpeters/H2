import {useState} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test} from 'vitest';
import {PhotoDetailControls} from './PhotoDetailControls';
import {DEFAULT_PHOTO_SETTINGS} from './photoLighting';

afterEach(cleanup);
test('daylight first selects a physical enclosure, then preserves explicit user choices', () => {
  function Harness() {
    const [value, setValue] = useState(DEFAULT_PHOTO_SETTINGS);
    return (
      <>
        <PhotoDetailControls value={value} onChange={setValue} />
        <output data-testid="settings">{JSON.stringify(value)}</output>
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('checkbox', {name: 'Directional daylight'}));
  expect(
    screen.getByRole('checkbox', {name: 'Include a ceiling'}),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', {name: 'Clear window glass'}),
  ).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', {name: 'Include a ceiling'}));
  fireEvent.click(screen.getByRole('checkbox', {name: 'Directional daylight'}));
  fireEvent.click(screen.getByRole('checkbox', {name: 'Directional daylight'}));
  expect(
    screen.getByRole('checkbox', {name: 'Include a ceiling'}),
  ).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Surface texture detail'), {
    target: {value: '2048'},
  });
  fireEvent.click(screen.getByRole('checkbox', {name: 'Unfiltered reference'}));
  expect(screen.getByLabelText('Reflection smoothing')).toBeDisabled();
  expect(
    (
      JSON.parse(screen.getByTestId('settings').textContent!) as {
        textureResolution: number;
      }
    ).textureResolution,
  ).toBe(2048);
});
