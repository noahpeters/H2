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

it('shows hinge side for a default door and persists the selection', () => {
  const onChange = vi.fn();
  render(<CustomUnitEditor onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', {name: '+ door'}));
  fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
  expect(screen.getByLabelText('Hinge side')).toHaveValue('left');
  fireEvent.change(screen.getByLabelText('Hinge side'), {
    target: {value: 'right'},
  });
  expect(onChange.mock.lastCall![0].parts.at(-1).door).toMatchObject({
    mechanism: 'hinged',
    side: 'right',
  });
});

it('locks envelope controls and imports while allowing configuration naming and part editing', async () => {
  const {createCustomUnit} = await import('./model');
  const initial = createCustomUnit({width: 36, height: 34.5, depth: 24});
  const onChange = vi.fn();
  render(
    <CustomUnitEditor
      initialDefinition={initial}
      lockEnvelope
      onChange={onChange}
    />,
  );
  expect(
    screen.queryByRole('spinbutton', {name: 'width'}),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('spinbutton', {name: 'height'}),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('spinbutton', {name: 'depth'}),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Cabinet size: 36/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Configuration name'), {
    target: {value: 'Coffee station'},
  });
  expect(onChange.mock.lastCall![0]).toMatchObject({
    name: 'Coffee station',
    width: 36,
    height: 34.5,
    depth: 24,
  });
  fireEvent.click(screen.getByRole('button', {name: '+ shelf'}));
  fireEvent.click(screen.getByRole('button', {name: 'Place in opening'}));
  expect(onChange.mock.lastCall![0]).toMatchObject({
    width: 36,
    height: 34.5,
    depth: 24,
  });
  fireEvent.click(screen.getByText('Import / export definition'));
  fireEvent.change(screen.getByRole('textbox', {name: /JSON/i}), {
    target: {value: JSON.stringify({...initial, width: 60})},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Import definition'}));
  expect(
    screen.getByText('Cabinet dimensions are controlled by the configurator.'),
  ).toBeInTheDocument();
  expect(onChange.mock.lastCall![0].width).toBe(36);
});

it('saves the sheet draft only on Save configuration and discards canceled edits', async () => {
  const {ConfigurationSheet} = await import('./ConfigurationSheet');
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModal,
  });
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfigurationSheet
      item={{
        id: 'placed',
        kind: 'base',
        configuration: 'three-drawer',
        width: 36,
        height: 34.5,
        depth: 24,
        face: 'slab',
        placement: {mode: 'floor', x: 0, z: 0, rotation: 0},
      }}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  expect(showModal).toHaveBeenCalledOnce();
  expect(
    screen.getByRole('dialog', {name: 'Customize this cabinet'}),
  ).toHaveAttribute('open');
  fireEvent.change(screen.getByLabelText('Configuration name'), {
    target: {value: 'Coffee station'},
  });
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Save configuration'}));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Coffee station',
      width: 36,
      height: 34.5,
      depth: 24,
    }),
  );
  onSave.mockClear();
  fireEvent.change(screen.getByLabelText('Configuration name'), {
    target: {value: 'Discard me'},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});
