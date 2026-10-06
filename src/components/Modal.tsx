import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

const FOCUSABLE = 'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  /** The accessible name of the dialog. */
  label: string;
  onClose: () => void;
  side: ReactNode;
  children: ReactNode;
}

/**
 * The two pane dialog over the dimmed window.
 *
 * Keyboard: focus moves into the dialog when it opens and returns to the
 * button that opened it when it closes, Tab stays inside, Escape closes.
 */
export function Modal({ label, onClose, side, children }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // The element that had the focus when the dialog was opened. Read once while
  // rendering, before the effect below moves the focus into the dialog.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  useEffect(() => {
    closeButton.current?.focus();
    return () => opener?.focus();
  }, [opener]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="w-dim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} ref={dialog}>
        <div className="m-side">{side}</div>
        <div className="m-main">
          <button
            type="button"
            className="m-x"
            aria-label="Close"
            onClick={onClose}
            ref={closeButton}
          >
            <Icon name="close" />
          </button>
          {children}
        </div>
      </div>
    </>
  );
}
