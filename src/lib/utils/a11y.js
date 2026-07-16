// Svelte action for modal dialogs. Applied to the dialog box element it:
//   • moves keyboard focus into the dialog on open,
//   • traps Tab / Shift+Tab inside the dialog,
//   • closes on Escape via params.onClose,
//   • restores focus to the previously-focused element on close.
// Usage: <div use:trapFocus={{ onClose: close }} role="dialog" aria-modal="true" tabindex="-1"> … </div>
export function trapFocus(node, params = {}) {
    let onClose = params.onClose;
    const prev = (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) ? document.activeElement : null;
    const SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const focusable = () => Array.from(node.querySelectorAll(SELECTOR))
        .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

    function onKeydown(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (onClose) onClose(); return; }
        if (e.key !== 'Tab') return;
        const items = focusable();
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0], last = items[items.length - 1], active = document.activeElement;
        if (e.shiftKey) {
            if (active === first || !node.contains(active)) { e.preventDefault(); last.focus(); }
        } else {
            if (active === last || !node.contains(active)) { e.preventDefault(); first.focus(); }
        }
    }

    node.addEventListener('keydown', onKeydown);
    const focusIn = () => node.focus();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusIn); else focusIn();

    return {
        update(p) { onClose = p && p.onClose; },
        destroy() {
            node.removeEventListener('keydown', onKeydown);
            if (prev && typeof prev.focus === 'function') prev.focus();
        },
    };
}
