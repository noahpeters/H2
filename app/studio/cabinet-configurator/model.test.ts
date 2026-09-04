import {
  APPLIANCE_CATALOG,
  createAppliance,
  initialStudy,
  normalizeStudy,
  problemIds,
} from './model';

describe('cabinet configurator appliance model', () => {
  it('defines all six kitchen appliances with parametric dimensions', () => {
    expect(Object.keys(APPLIANCE_CATALOG)).toEqual([
      'refrigerator',
      'dishwasher',
      'range',
      'wall-oven',
      'microwave',
      'coffee-maker',
    ]);
    for (const appliance of Object.values(APPLIANCE_CATALOG)) {
      expect(appliance.width).toBeGreaterThan(0);
      expect(appliance.depth).toBeGreaterThan(0);
      expect(appliance.height).toBeGreaterThan(0);
    }
  });

  it('places countertop and built-in appliances on appropriate cabinets', () => {
    const study = initialStudy();
    const coffee = createAppliance('coffee-maker', study, 'coffee');
    const oven = createAppliance('wall-oven', study, 'oven');
    expect(coffee).toMatchObject({
      placement: 'countertop',
      hostCabinetId: 'starter-base-30',
      elevation: 36,
    });
    expect(oven).toMatchObject({
      placement: 'built-in',
      hostCabinetId: 'starter-tall-24',
    });
    study.appliances.push(coffee, oven);
    expect(problemIds(study).has('coffee')).toBe(false);
  });

  it('flags room bounds, openings, cabinet collisions, and appliance overlaps', () => {
    const study = initialStudy();
    study.appliances = [
      {
        ...createAppliance('refrigerator', study, 'fridge'),
        wall: 'back',
        offset: 130,
      },
      {
        ...createAppliance('dishwasher', study, 'dishwasher'),
        wall: 'back',
        offset: 58,
      },
      {...createAppliance('range', study, 'range'), wall: 'back', offset: 60},
      {
        ...createAppliance('microwave', study, 'microwave'),
        wall: 'right',
        offset: 30,
      },
    ];
    const problems = problemIds(study);
    for (const id of ['fridge', 'dishwasher', 'range', 'microwave'])
      expect(problems.has(id)).toBe(true);
  });

  it('migrates saved studies that predate appliances', () => {
    const oldStudy = initialStudy();
    delete (oldStudy as Partial<typeof oldStudy>).appliances;
    expect(normalizeStudy(oldStudy).appliances).toEqual([]);
  });
});
