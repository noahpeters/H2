import {useActionData, useLoaderData, useLocation} from 'react-router';
import {CabinetryPage, BookingChoices} from '~/studio/CabinetryPages';
import {cabinetryIdeas} from '~/studio/cabinetryIdeas';
import {ProjectForm} from '~/studio/ProjectForm';
import {loader} from './contact';
import {action as inquiryAction} from './inquire.$kind';
import type {Route} from './+types/inquire.cabinetry.contact';
export {links} from '~/studio/CabinetryPages';
export {loader};
export {headers} from './inquire.$kind';
export const meta = () => [
  {title: 'Discuss your cabinetry project — From Trees'},
  {name: 'robots', content: 'noindex, nofollow'},
];
export function action(args: Route.ActionArgs) {
  return inquiryAction({...args, params: {kind: 'cabinetry'}});
}
export default function CabinetryContact() {
  const {search} = useLocation();
  const params = new URLSearchParams(search);
  const ideas = cabinetryIdeas.filter((x) =>
    params.getAll('save').includes(x.id),
  );
  const call = params.get('request') === 'call';
  const project = [
    call ? 'I’d like to schedule a phone call.' : '',
    ideas.length
      ? 'I’m interested in ' + ideas.map((x) => x.name).join(', ') + '.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const info = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <CabinetryPage>
      <section className="cab-body">
        <p className="eyebrow">Cabinetry inquiries</p>
        <h1>Tell us about your room.</h1>
        <div className="cab-explore">
          <div>
            <p>
              Send us a few details, or choose a time for us to visit your home.
            </p>
            <BookingChoices search={search} />
          </div>
          <div id="project-form">
            {call && (
              <p>
                Include a phone number and a few times that work for you. We’ll
                follow up to confirm.
              </p>
            )}
            <ProjectForm
              cabinetryOnly
              project={project}
              turnstileSiteKey={info.turnstileSiteKey}
              submissionId={info.submissionId}
              fieldErrors={result?.fieldErrors}
              formError={result?.formError}
            />
          </div>
        </div>
      </section>
    </CabinetryPage>
  );
}
