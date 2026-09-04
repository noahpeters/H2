import {configurationSummary, DEFAULT_CONFIGURATION} from '../configurator';

describe('configurationSummary', () => {
  it('includes every inquiry choice and no commerce language', () => {
    const summary = configurationSummary(DEFAULT_CONFIGURATION);

    expect(summary).toContain('Timber: White oak');
    expect(summary).toContain('Length: 72 in');
    expect(summary).toContain('Edge: Natural');
    expect(summary).toContain('Base: Trestle');
    expect(summary).toContain('Shape: Rectangle');
    expect(summary).toContain('Width: 36 in');
    expect(summary).toContain('Seating: 6 chairs');
    expect(summary).not.toMatch(/price|checkout|cart/i);
  });
});
