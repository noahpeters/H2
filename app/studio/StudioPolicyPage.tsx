import {StudioFooter} from './StudioFooter';
import {StudioHeader} from './StudioHeader';

export function StudioPolicyPage({
  title,
  body,
}: {
  title: string;
  body?: string | null;
}) {
  return (
    <main className="studio-page studio-policy-page">
      <StudioHeader
        links={[
          {label: 'Back to the studio', to: '/'},
          {label: 'Pre-configured examples', to: '/collections/all'},
          {label: 'Configure a table ↗', to: '/configurator'},
        ]}
      />
      <article className="studio-policy-content">
        <p className="eyebrow">From Trees policies</p>
        <h1>{title}</h1>
        {body ? (
          <div
            className="studio-policy-body"
            dangerouslySetInnerHTML={{__html: body}}
          />
        ) : null}
      </article>
      <StudioFooter />
    </main>
  );
}
