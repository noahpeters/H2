import {useState} from 'react';
import {Form, useLoaderData} from 'react-router';
import type {Route} from './+types/admin.custom-cabinets';
import {CustomUnitEditor} from '~/studio/cabinet-configurator/custom-unit/CustomUnitEditor';
import {
  createCustomUnit,
  type CustomUnitDefinition,
} from '~/studio/cabinet-configurator/custom-unit/model';
import type {
  CabinetLifecycle,
  CustomCabinetLibraryItem,
} from '~/studio/cabinet-configurator/custom-unit/library';
import {jsonResponse} from '~/studio/cabinet-configurator/savedRoomProtocol';
import styles from '~/styles/custom-unit-editor.css?url';

export const links: Route.LinksFunction = () => [
  {rel: 'stylesheet', href: styles},
];
export const meta: Route.MetaFunction = () => [
  {title: 'Custom cabinet library | From Trees'},
  {name: 'robots', content: 'noindex,nofollow'},
];

function config(context: Route.LoaderArgs['context']) {
  const env = context.env as unknown as {
    CABINET_ROOMS_URL?: string;
    CABINET_ROOMS_TOKEN?: string;
  };
  if (!env.CABINET_ROOMS_URL || !env.CABINET_ROOMS_TOKEN)
    throw new Response('Cabinet library is not configured', {status: 503});
  return env as Required<typeof env>;
}
export async function loader({context}: Route.LoaderArgs) {
  const env = config(context);
  const response = await fetch(
    new URL('/custom-cabinets', env.CABINET_ROOMS_URL),
    {
      headers: {
        Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
        'X-Admin-Token': env.CABINET_ROOMS_TOKEN,
      },
    },
  );
  if (!response.ok)
    throw new Response('Unable to load cabinet library', {
      status: response.status,
    });
  return {items: (await response.json()) as CustomCabinetLibraryItem[]};
}
export async function action({context, request}: Route.ActionArgs) {
  const env = config(context);
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    return jsonResponse({error: 'Invalid origin'}, 403);
  const form = await request.formData();
  const value = JSON.parse(String(form.get('cabinet')));
  const response = await fetch(
    new URL('/custom-cabinets', env.CABINET_ROOMS_URL),
    {
      method: String(form.get('method')) === 'POST' ? 'POST' : 'PUT',
      headers: {
        Authorization: `Bearer ${env.CABINET_ROOMS_TOKEN}`,
        'X-Admin-Token': env.CABINET_ROOMS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    },
  );
  return jsonResponse(await response.json(), response.status);
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56) || 'cabinet';
export default function CabinetAdmin() {
  const {items} = useLoaderData<typeof loader>();
  const [selected, setSelected] = useState<CustomCabinetLibraryItem | null>(
    items[0] ?? null,
  );
  const [definition, setDefinition] = useState<CustomUnitDefinition>(
    selected?.definition ?? createCustomUnit(),
  );
  const [description, setDescription] = useState(selected?.description ?? '');
  const [tags, setTags] = useState(selected?.tags.join(', ') ?? '');
  const [status, setStatus] = useState<CabinetLifecycle>(
    selected?.status ?? 'draft',
  );
  const choose = (item: CustomCabinetLibraryItem | null, duplicate = false) => {
    const source = item?.definition ?? createCustomUnit();
    const next = duplicate
      ? {
          ...structuredClone(source),
          id: `${slug(source.name)}-${Date.now().toString(36)}`,
          name: `${source.name} copy`,
        }
      : source;
    setSelected(duplicate ? null : item);
    setDefinition(next);
    setDescription(item?.description ?? '');
    setTags(item?.tags.join(', ') ?? '');
    setStatus(duplicate ? 'draft' : (item?.status ?? 'draft'));
  };
  const payload = {
    id: selected?.id ?? slug(definition.name),
    name: definition.name,
    description,
    tags: tags
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    status,
    definition,
  };
  return (
    <main className="cu-admin">
      <header className="cu-header">
        <div>
          <p>Library editor</p>
          <h1>Reusable cabinet library</h1>
        </div>
        <button onClick={() => choose(null)}>Create cabinet</button>
      </header>
      <nav className="cu-library" aria-label="Cabinet definitions">
        {items.map((item) => (
          <button key={item.id} onClick={() => choose(item)}>
            {item.name} · v{item.version} · {item.status}
          </button>
        ))}
      </nav>
      <section className="cu-metadata">
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="kitchen, vanity"
          />
        </label>
        <label>
          Lifecycle
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CabinetLifecycle)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <Form method="post">
          <input
            type="hidden"
            name="method"
            value={selected ? 'PUT' : 'POST'}
          />
          <input type="hidden" name="cabinet" value={JSON.stringify(payload)} />
          <button type="submit">
            {selected ? 'Save new version' : 'Create'}
          </button>
        </Form>
        {selected && (
          <button onClick={() => choose(selected, true)}>
            Duplicate as draft
          </button>
        )}
      </section>
      <CustomUnitEditor
        key={`${selected?.id ?? 'new'}-${definition.id}`}
        initialDefinition={definition}
        onChange={setDefinition}
      />
    </main>
  );
}
