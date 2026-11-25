import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

export function useModalFocusTrap(isOpen, onClose, { allowEscape = true } = {}) {
  const containerRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    restoreRef.current = document.activeElement;

    const rafId = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const first = container.querySelector(FOCUSABLE_SELECTOR);
      first?.focus();
    });

    const onKeyDown = (event) => {
      const container = containerRef.current;
      if (!container) return;

      if (event.key === 'Escape' && allowEscape) {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const nodes = [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (node) => !node.disabled && node.getClientRects().length > 0
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKeyDown);
      const prev = restoreRef.current;
      if (prev && prev.isConnected && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [isOpen, onClose, allowEscape]);

  return containerRef;
}
