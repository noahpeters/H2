import {blankStudy} from './cabinet-configurator/CabinetConfigurator';
import {cabinetStudySummary, tableStudySummary} from './studyInquiry';

describe('configurator inquiry summaries', () => {
  it('attaches every current table choice and identifies its source', () => {
    const summary = tableStudySummary({
      shape: 'oval',
      timber: 'Black walnut',
      dimension: '96″ × 42″',
      edge: 'Soft square',
      base: 'Curved slab frame',
      chairs: 'Bow-back',
    });

    expect(summary).toContain('Configurator source: table');
    expect(summary).toContain('Shape: oval');
    expect(summary).toContain('Dimensions: 96″ × 42″');
    expect(summary).toContain('Timber: Black walnut');
    expect(summary).toContain('Edge: Soft square');
    expect(summary).toContain('Base: Curved slab frame');
    expect(summary).toContain('Chair study: Bow-back');
  });

  it('summarizes the current cabinet room and identifies its source', () => {
    const study = blankStudy();
    study.room.width = 144;
    study.openings.push({
      id: 'window-1',
      kind: 'window',
      wall: 'back',
      offset: 12,
      width: 36,
      height: 48,
    });

    const summary = cabinetStudySummary(study);
    expect(summary).toContain('Configurator source: cabinet');
    expect(summary).toContain('Room: 144″');
    expect(summary).toContain('Cabinet elements: 0');
    expect(summary).toContain('Openings: 1');
  });
});
