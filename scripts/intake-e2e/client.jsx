import {RouterProvider} from 'react-router/dom';
import {createRoot} from 'react-dom/client';
import {createBrowserRouter, redirect} from 'react-router';
import Contact from '../../app/routes/contact';
import Inquiry from '../../app/routes/inquire.$kind';
import Table from '../../app/routes/configurator';
import Cabinet from '../../app/routes/cabinet-configurator';
import '../../app/styles/studio.css';
import '../../app/styles/ad-landings.css';
import '../../app/styles/cabinet-configurator.css';
import '../../app/styles/custom-unit-editor.css';
// Deterministic local challenge double. The real action still verifies server-side.
window.turnstile = {
  render(el, options) {
    const token = `local-test-${options.action || 'contact'}`;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'cf-turnstile-response';
    input.value = token;
    el.append(input);
    options.callback?.(token);
    return crypto.randomUUID();
  },
  remove() {},
  reset() {},
};
const script = document.createElement('script');
script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?local-test';
script.type = 'text/plain';
document.head.append(script);
async function loader({request}) {
  const url = new URL(request.url);
  const r = await fetch(
    `/__loader?path=${encodeURIComponent(url.pathname)}&query=${encodeURIComponent(url.search)}`,
  );
  const data = await r.json();
  // React Router data wrappers are serialized by the harness.
  return data.data ?? data;
}
async function action({request}) {
  const url = new URL(request.url);
  const body = await request.formData();
  const r = await fetch(
    `/__action?path=${encodeURIComponent(url.pathname)}&query=${encodeURIComponent(url.search)}`,
    {method: 'POST', body},
  );
  const data = await r.json();
  if (data.redirect) return redirect(data.redirect);
  return data.data ?? data;
}
// Match the real root loader's stable deferred footer, avoiding a fresh fallback Promise per render.
const footer = Promise.resolve(null);
createRoot(document.getElementById('root')).render(
  <RouterProvider
    router={createBrowserRouter([
      {
        id: 'root',
        loader: () => ({footer}),
        children: [
          {path: '/', element: <h1>Test home — inquiry received</h1>},
          {path: '/contact', Component: Contact, loader, action},
          {path: '/inquire/:kind', Component: Inquiry, loader, action},
          {path: '/configurator', Component: Table, loader},
          {path: '/cabinet-configurator', Component: Cabinet, loader},
        ],
      },
    ])}
  />,
);
