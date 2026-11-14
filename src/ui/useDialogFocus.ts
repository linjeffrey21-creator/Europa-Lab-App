import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useDialogFocus(dialogRef: RefObject<HTMLDivElement>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const heading = dialog.querySelector<HTMLElement>('h2');
    heading?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],summary,input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )].filter(control => control.getClientRects().length > 0 && control.checkVisibility?.({ visibilityProperty: true }) !== false &&
        !control.matches(':disabled') && !control.closest('[inert]'));
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        heading?.focus();
        return;
      }
      const active = document.activeElement as HTMLElement;
      if (!controls.includes(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dialogRef]);
}
