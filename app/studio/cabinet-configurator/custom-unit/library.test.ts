import {describe, expect, it} from 'vitest';
import {createCustomUnit} from './model';
import {customCabinetElement, validLibraryInput} from './library';

describe('custom cabinet library', () => {
  it('validates metadata and snapshots a published definition for placement', () => {
    const definition = createCustomUnit({id: 'unit', name: 'Vanity'});
    const item = {
      id: 'vanity',
      version: 3,
      name: 'Vanity',
      description: '',
      tags: ['bath'],
      status: 'published' as const,
      definition,
      updatedAt: '2026-09-11T00:00:00Z',
    };
    expect(validLibraryInput(item)).toBe(true);
    const element = customCabinetElement(item, 'placed');
    definition.width = 99;
    expect(element.customCabinet).toMatchObject({
      libraryId: 'vanity',
      libraryVersion: 3,
    });
    expect(element.customCabinet.definition.width).toBe(48);
  });
});
