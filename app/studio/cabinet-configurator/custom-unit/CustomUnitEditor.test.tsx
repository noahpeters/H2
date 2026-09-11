import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {CustomUnitEditor} from './CustomUnitEditor';
vi.mock('./PartViewport', () => ({PartViewport: () => <div>3D viewport</div>}));

describe('Cabinet workshop', () => {
  it('adds a shelf and commits exact sizes, setbacks, and undo to the parent', () => {
    const onChange = vi.fn();
    render(<CustomUnitEditor onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
    const field = screen.getByLabelText('Front setback');
    fireEvent.change(field, {target: {value: '1.0625'}});
    fireEvent.blur(field);
    expect(onChange.mock.lastCall![0].parts.at(-1).z).toBe(1.0625);
    fireEvent.click(screen.getByRole('button', {name: 'Undo'}));
    expect(onChange.mock.lastCall![0].parts.at(-1).z).toBe(0.5);
  });
  it('adds independent end shelves and door mechanisms', () => {
    const onChange = vi.fn();
    render(<CustomUnitEditor onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', {name: '+ right end shelf'}));
    expect(onChange.mock.lastCall![0].parts.at(-1).shape).toBe('round-right');
    fireEvent.click(screen.getByRole('button', {name: '+ door'}));
    fireEvent.change(screen.getByLabelText('Mechanism'), {
      target: {value: 'pocket'},
    });
    expect(onChange.mock.lastCall![0].parts.at(-1).door.mechanism).toBe(
      'pocket',
    );
    expect(screen.getByLabelText('Pocket travel')).toBeInTheDocument();
  });
  it('edits one cabinet profile and makes newly added parts inherit it', () => {
    const onChange = vi.fn();
    render(<CustomUnitEditor onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', {name: 'Vanity'}));
    fireEvent.change(screen.getByLabelText('Cabinet right edge'), {
      target: {value: 'convex'},
    });
    const radius = screen.getByLabelText('Cabinet edge radius');
    fireEvent.change(radius, {target: {value: '12'}});
    fireEvent.blur(radius);
    expect(onChange.mock.lastCall![0].profile).toEqual({
      left: 'square',
      right: 'convex',
      radius: 12,
    });
    fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
    expect(onChange.mock.lastCall![0].profile.radius).toBe(12);
    expect(onChange.mock.lastCall![0].parts.at(-1).profileMode).not.toBe(
      'independent',
    );
    expect(screen.queryByLabelText('Part shape')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Follows the shared cabinet profile/),
    ).toBeInTheDocument();
  });

  it('uses imported designs in the parent save payload', () => {
    const onChange = vi.fn();
    render(<CustomUnitEditor onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', {name: 'Vanity'}));
    fireEvent.click(screen.getByText('Import / export definition'));
    fireEvent.click(screen.getByRole('button', {name: 'Export to text'}));
    const json = screen.getByLabelText(
      'Custom unit JSON',
    ) as HTMLTextAreaElement;
    const value = JSON.parse(json.value) as {name: string};
    value.name = 'Imported design';
    fireEvent.change(json, {target: {value: JSON.stringify(value)}});
    fireEvent.click(screen.getByRole('button', {name: 'Import definition'}));
    expect(onChange.mock.lastCall![0].name).toBe('Imported design');
  });
});
