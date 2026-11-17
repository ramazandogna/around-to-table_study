import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Dialogs currently open, the last one on top: only that one takes Tab and Escape. */
const open: HTMLElement[] = [];

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0,
  );
}

const isField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * What every dialog and panel shares: the first control takes focus when it
 * opens, Tab stays inside it, Escape closes it (unless a text field is
 * typing: that Escape belongs to the field), and focus goes back to where it
 * was when it closes. The element needs `tabIndex={-1}` to be a fallback.
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose?: () => void,
  enabled = true,
): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open.push(root);
    (focusables(root)[0] ?? root).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (open[open.length - 1] !== root || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (isField(event.target) || !close.current) return;
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(root);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        root.focus();
      } else if (
        event.shiftKey &&
        (active === first || active === root || !root.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      open.splice(open.indexOf(root), 1);
      const now = document.activeElement;
      const lost = !now || now === document.body || root.contains(now);
      if (lost && before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}
