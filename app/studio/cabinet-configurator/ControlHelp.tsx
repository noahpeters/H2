import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import './control-help.css';

export function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({left: 0, top: 0});
  const keepOpen = () => {
    clearTimeout(hideTimer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) setOpen(false);
    }, 150);
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !tooltip.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        8,
        Math.min(anchor.left, window.innerWidth - box.width - 8),
      ),
      top:
        anchor.bottom + box.height + 16 <= window.innerHeight
          ? anchor.bottom + 8
          : Math.max(8, anchor.top - box.height - 8),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (
        event.target instanceof Node &&
        (trigger.current?.contains(event.target) ||
          tooltip.current?.contains(event.target))
      )
        return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="cc-info-trigger"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        onPointerEnter={keepOpen}
        onPointerLeave={hide}
        onFocus={keepOpen}
        onBlur={() => {
          clearTimeout(hideTimer.current);
          setOpen(false);
        }}
        onClick={(event) => {
          event.stopPropagation();
          keepOpen();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            role="tooltip"
            className="cc-help-tooltip"
            style={position}
            onPointerEnter={keepOpen}
            onPointerLeave={hide}
          >
            {children}
          </span>,
          trigger.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}

export function HelpField({
  label,
  help,
  children,
  checkbox = false,
}: {
  label: string;
  help: ReactNode;
  children: (id: string) => ReactNode;
  checkbox?: boolean;
}) {
  const id = useId();
  return (
    <div className={`cc-help-field${checkbox ? ' cc-help-checkbox' : ''}`}>
      <span className="cc-label-help">
        <label htmlFor={id}>{label}</label>
        <InfoTooltip label={label}>{help}</InfoTooltip>
      </span>
      {children(id)}
    </div>
  );
}
