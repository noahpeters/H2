import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {HelpField, InfoTooltip} from './ControlHelp';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('hover reveals help without changing the associated input label or value and allows reading across the gap', async () => {
  vi.useFakeTimers();
  render(
    <HelpField
      label="Positioning resolution"
      help="Hold Command to disable snapping."
    >
      {(id) => (
        <select id={id} defaultValue="fine">
          <option value="fine">Fine</option>
        </select>
      )}
    </HelpField>,
  );
  const input = screen.getByLabelText('Positioning resolution');
  expect(input).toHaveAccessibleName('Positioning resolution');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', {
    name: 'About Positioning resolution',
  });
  fireEvent.pointerEnter(trigger);
  const tooltip = screen.getByRole('tooltip');
  expect(trigger).toHaveAccessibleDescription(
    'Hold Command to disable snapping.',
  );
  expect(tooltip.parentElement).toBe(document.body);
  fireEvent.pointerLeave(trigger);
  await act(() => vi.advanceTimersByTime(100));
  fireEvent.pointerEnter(tooltip);
  await act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole('tooltip')).toBe(tooltip);
  fireEvent.pointerLeave(tooltip);
  await act(() => vi.advanceTimersByTime(151));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(input).toHaveValue('fine');
});

test('keyboard focus and tap reveal help; Escape and outside taps dismiss it without firing parent shortcuts', () => {
  const shortcut = vi.fn();
  const view = render(
    <InfoTooltip label="Face frames">Shared frame explanation.</InfoTooltip>,
  );
  view.container.addEventListener('keydown', shortcut);
  const trigger = screen.getByRole('button', {name: 'About Face frames'});
  fireEvent.focus(trigger);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.keyDown(trigger, {key: 'Escape'});
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(shortcut).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.pointerEnter(trigger);
  fireEvent.keyDown(document.body, {key: 'Escape'});
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('help inside a modal remains inside that modal and closes on scroll', () => {
  render(
    <dialog open>
      <InfoTooltip label="Overhang">Measured beyond the cabinet.</InfoTooltip>
    </dialog>,
  );
  fireEvent.click(screen.getByRole('button', {name: 'About Overhang'}));
  expect(screen.getByRole('tooltip').parentElement).toBe(
    screen.getByRole('dialog'),
  );
  fireEvent.scroll(window);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
