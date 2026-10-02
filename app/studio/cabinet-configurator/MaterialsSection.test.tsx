import {useState} from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {MaterialsSection} from './MaterialsSection';
import {blankStudy, type Study} from './CabinetConfigurator';
import {migrateDesignMaterials, syncDesignMaterials} from './designMaterials';
import type {RoomElement} from './model';
vi.mock('./VisualChoices', () => ({
  ChoiceImage: () => null,
  VisualSelect: ({value, onChange, children}: any) => (
    <select value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));
vi.mock('./useSavedRooms', () => ({
  useSavedRooms: () => ({
    busy: false,
    ready: true,
    recent: [],
    status: 'Saved',
    share: vi.fn(),
    getPrice: vi.fn(),
  }),
}));
vi.mock('./studyScene', () => ({
  StudyScene: class {
    root = {};
    dispose() {}
  },
  elementTransform: () => ({x: 30, z: 30, rotation: 0}),
}));
const element: RoomElement = {
  id: 'base',
  kind: 'base',
  width: 30,
  height: 34.5,
  depth: 24,
  material: 'walnut',
  face: 'shaker',
  placement: {mode: 'floor', x: 30, z: 30, rotation: 0},
};
afterEach(cleanup);
it('edits shared finishes and grain and reassigns objects before removing a material', () => {
  function Harness() {
    const [study, setStudy] = useState(() =>
      migrateDesignMaterials({
        ...blankStudy(),
        elements: [element, {...element, id: 'second'}],
      }),
    );
    return (
      <>
        <MaterialsSection
          study={study}
          update={(change) =>
            setStudy((current) => {
              const next = structuredClone(current);
              change(next);
              syncDesignMaterials(next);
              return next;
            })
          }
        />
        <output data-testid="design">{JSON.stringify(study)}</output>
      </>
    );
  }
  render(<Harness />);
  const read = () =>
    JSON.parse(screen.getByTestId('design').textContent!) as Study;
  fireEvent.change(screen.getByLabelText('Material name'), {
    target: {value: 'Cabinet finish'},
  });
  fireEvent.change(
    within(
      screen.getByRole('group', {name: 'Finish for Cabinet finish'}),
    ).getByRole('combobox'),
    {target: {value: 'paint-grade'}},
  );
  fireEvent.change(
    within(
      screen.getByRole('group', {name: 'Paint color for Cabinet finish'}),
    ).getByRole('combobox'),
    {target: {value: 'sage-green'}},
  );
  fireEvent.change(screen.getByLabelText('Flat surface grain'), {
    target: {value: 'horizontal'},
  });
  expect(
    read().elements.every(
      (e) =>
        e.material === 'paint-grade' &&
        e.paintColor === 'sage-green' &&
        e.flatGrain === 'horizontal',
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', {name: 'Add material'}));
  expect(read().materials).toHaveLength(2);
  // Open the existing material again after the palette gains a second entry.
  const first = screen.getByText('Cabinet finish').closest('details')!;
  first.open = true;
  fireEvent.click(
    within(first).getByRole('button', {name: 'Remove material…'}),
  );
  expect(read().elements[0].material).toBe('paint-grade');
  fireEvent.click(
    within(first).getByRole('button', {name: 'Reassign and remove material'}),
  );
  expect(read().materials).toHaveLength(1);
  expect(read().elements.every((e) => e.material === 'rift-white-oak')).toBe(
    true,
  );
});
