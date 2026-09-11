import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {CustomUnitEditor} from './CustomUnitEditor';

describe('CustomUnitEditor development harness', () => {
  it('loads representative examples and edits a selected region', () => {
    render(<CustomUnitEditor />);
    fireEvent.click(screen.getByRole('button', {name: 'Vanity example'}));
    expect(
      screen.getByRole('img', {name: /Mixed vanity elevation/}),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('doors'));
    fireEvent.change(screen.getByLabelText('Section type'), {
      target: {value: 'shelves'},
    });
    expect(screen.getByText(/semantic regions/)).toHaveTextContent(
      '4 semantic regions',
    );
    expect(
      (screen.getByLabelText('Custom unit JSON') as HTMLTextAreaElement).value,
    ).toContain('"sectionType": "shelves"');
  });

  it('subdivides blank regions and offers a 3D preview', () => {
    render(<CustomUnitEditor />);
    fireEvent.click(screen.getByRole('button', {name: 'Split vertical'}));
    expect(screen.getByText(/semantic regions/)).toHaveTextContent(
      '2 semantic regions',
    );
    fireEvent.click(screen.getByRole('button', {name: '3D'}));
    expect(screen.getByRole('img', {name: /3d preview/i})).toHaveClass(
      'cu-svg-3d',
    );
  });
});
