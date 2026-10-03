import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, test} from 'vitest';
import type {Study} from './CabinetConfigurator';
import {PositioningGuides} from './PlanPositioningGuides';

afterEach(cleanup);
test('measurements render above the plan without intercepting drags and disappear on release', () => {
  const study: Study = {
    version: 2,
    room: {width: 144, depth: 120, height: 96, floor: 'oak', walls: 'plaster'},
    elements: [],
    openings: [],
    islands: [],
    selected: null,
    countertop: true,
    view: 'plan',
  };
  const props = {study, pad: 20, scale: 2, screenScale: 1};
  const view = render(
    <svg>
      <PositioningGuides {...props} target={{kind: 'wall', id: 'front'}} />
    </svg>,
  );
  expect(screen.getByLabelText('Positioning aids')).toHaveAttribute(
    'pointer-events',
    'none',
  );
  expect(screen.getByText('120″')).toHaveAttribute('font-size', '11');
  view.rerender(
    <svg>
      <PositioningGuides
        {...props}
        screenScale={2}
        target={{kind: 'wall', id: 'front'}}
      />
    </svg>,
  );
  expect(screen.getByText('120″')).toHaveAttribute('font-size', '5.5');
  view.rerender(
    <svg>
      <PositioningGuides {...props} target={null} />
    </svg>,
  );
  expect(screen.queryByLabelText('Positioning aids')).not.toBeInTheDocument();
});
