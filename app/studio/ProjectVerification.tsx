import {useEffect, useRef} from 'react';
import {useNonce} from '@shopify/hydrogen';

type Turnstile = {
  render: (
    element: HTMLElement,
    options: {sitekey: string; theme: string},
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
export function ProjectVerification({
  siteKey,
  retry,
}: {
  siteKey: string;
  retry: unknown;
}) {
  const nonce = useNonce();
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string>();
  useEffect(() => {
    if (!siteKey) return;
    const api = () => (window as Window & {turnstile?: Turnstile}).turnstile;
    const render = () => {
      if (!api() || !container.current || widget.current) return;
      widget.current = api()!.render(container.current, {
        sitekey: siteKey,
        theme: 'light',
      });
    };
    if (
      !document.querySelector(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
      )
    ) {
      const script = document.createElement('script');
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      if (nonce) script.nonce = nonce;
      document.head.appendChild(script);
    }
    render();
    const timer = window.setInterval(render, 200);
    return () => {
      window.clearInterval(timer);
      if (widget.current) api()?.remove(widget.current);
      widget.current = undefined;
    };
  }, [nonce, siteKey]);
  useEffect(() => {
    if (retry && widget.current)
      (window as Window & {turnstile?: Turnstile}).turnstile?.reset(
        widget.current,
      );
  }, [retry]);
  return <div ref={container} />;
}
