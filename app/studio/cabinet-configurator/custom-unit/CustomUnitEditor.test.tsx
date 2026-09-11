import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {CustomUnitEditor} from './CustomUnitEditor';
vi.mock('./PartViewport', async () => {
  const {cabinetOpenings, partInOpening} = await import('./openingPlacement');
  return {
    PartViewport: (
      props: Parameters<typeof import('./PartViewport').PartViewport>[0],
    ) =>
      props.placement ? (
        <button
          onClick={() =>
            props.onPlace(
              partInOpening(
                props.definition,
                props.placement!,
                cabinetOpenings(props.definition)[0],
              ),
            )
          }
        >
          Place in opening
        </button>
      ) : (
        <div>3D viewport</div>
      ),
  };
});

describe('Cabinet workshop', () => {
  it('does not save a part before placement and cancels without changes', () => {
    const onChange = vi.fn();
    render(<CustomUnitEditor onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Place shelf');
    fireEvent.click(screen.getByRole('button', {name: 'Cancel placement'}));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {name: 'Place in opening'}),
    ).not.toBeInTheDocument();
  });
  it('adds a shelf and commits exact sizes, setbacks, and undo to the parent', () => {
    const onChange = vi.fn();
    render(<CustomUnitEditor onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
    fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
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
    fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
    expect(onChange.mock.lastCall![0].parts.at(-1).shape).toBe('round-right');
    fireEvent.click(screen.getByRole('button', {name: '+ door'}));
    fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
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
    fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
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

it('keeps preview finishes out of cabinet changes', () => {
  const onChange = vi.fn();
  render(<CustomUnitEditor onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Face style'), {
    target: {value: 'inset-shaker'},
  });
  fireEvent.change(screen.getByLabelText('Preview material'), {
    target: {value: 'paint-grade'},
  });
  fireEvent.change(screen.getByLabelText('Preview paint'), {
    target: {value: 'sage-green'},
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
  fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
  const saved = onChange.mock.lastCall![0];
  expect(saved).not.toHaveProperty('appearance');
  expect(saved).not.toHaveProperty('face');
  expect(saved).not.toHaveProperty('material');
});
