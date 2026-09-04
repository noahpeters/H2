import {useMemo, useState} from 'react';
import {Link} from 'react-router';
import type {Route} from './+types/configurator';
import {
  CONFIGURATOR_OPTIONS,
  DEFAULT_CONFIGURATION,
  configurationSummary,
  type Configuration,
} from '~/lib/configurator';

export const meta: Route.MetaFunction = () => [
  {title: 'Design your table | from trees'},
  {
    name: 'description',
    content:
      'Explore materials and proportions for a custom From Trees table, then send an inquiry to begin the conversation.',
  },
];

type OptionKey = Exclude<keyof Configuration, 'shape'>;

export default function Configurator() {
  const [configuration, setConfiguration] = useState<Configuration>(
    DEFAULT_CONFIGURATION,
  );
  const summary = useMemo(
    () => configurationSummary(configuration),
    [configuration],
  );
  const inquiryUrl = `/contact?project=${encodeURIComponent(summary)}`;

  const update = (key: OptionKey, value: string) => {
    setConfiguration((current) => ({...current, [key]: value}));
  };

  return (
    <div className="configurator-page">
      <header className="configurator-intro">
        <p className="eyebrow">Made for your life</p>
        <h1>Design your table</h1>
        <p>
          Choose a direction for your one-of-a-kind dining table. Every piece is
          refined with you and built by hand in Riverside, California.
        </p>
      </header>

      <div className="configurator-layout">
        <section className="table-preview" aria-label="Table preview">
          <div
            className={`tabletop timber-${slug(configuration.timber)} edge-${slug(configuration.edge)}`}
            style={
              {
                '--table-ratio':
                  Number(configuration.length.split(' ')[0]) /
                  Number(configuration.width.split(' ')[0]),
              } as React.CSSProperties
            }
          >
            <span className={`table-base base-${slug(configuration.base)}`} />
          </div>
          <p>
            {configuration.timber} · {configuration.length} ×{' '}
            {configuration.width}
          </p>
          <small>
            Concept preview — grain and character vary with every board.
          </small>
        </section>

        <section
          className="configuration-panel"
          aria-labelledby="options-heading"
        >
          <h2 id="options-heading">Your table</h2>
          {(Object.keys(CONFIGURATOR_OPTIONS) as OptionKey[]).map((key) => (
            <fieldset key={key}>
              <legend>{labelFor(key)}</legend>
              <div className="option-grid">
                {CONFIGURATOR_OPTIONS[key].map((option) => (
                  <button
                    className={configuration[key] === option ? 'selected' : ''}
                    type="button"
                    aria-pressed={configuration[key] === option}
                    key={option}
                    onClick={() => update(key, option)}
                  >
                    {key === 'chairs' ? `${option} chairs` : option}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset>
            <legend>Shape</legend>
            <div className="option-grid shape-options">
              <button type="button" className="selected" aria-pressed="true">
                Rectangle
              </button>
              <button type="button" disabled>
                Circle <small>Coming soon</small>
              </button>
              <button type="button" disabled>
                Oval <small>Coming soon</small>
              </button>
            </div>
          </fieldset>

          <div className="inquiry-summary">
            <h2>Ready to talk?</h2>
            <pre>{summary}</pre>
            <p>
              No price or payment is collected here. We’ll discuss material
              availability, details, timing, and a quote personally.
            </p>
            <Link className="inquiry-button" to={inquiryUrl}>
              Send this inquiry
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(' ', '-');
}

function labelFor(key: OptionKey) {
  return key === 'chairs' ? 'Seating' : key[0].toUpperCase() + key.slice(1);
}
