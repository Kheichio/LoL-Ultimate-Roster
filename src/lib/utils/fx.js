// Small interaction effects shared by the roster shell's big pressable surfaces (the Play
// menu's stage cards, the mode tiles). Kept as Svelte actions so a component opts in with
// one attribute and owns none of the bookkeeping.

function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

/**
 * use:pressFx — a light that follows the pointer across the surface (exposed as the CSS
 * vars --mx / --my, so the component decides what to draw with them) and a soft ripple
 * from wherever it is pressed. The host must be position:relative + overflow:hidden.
 *
 * The ripple is a plain span animated with the Web Animations API, so it needs no global
 * CSS and cannot leak styles into anything else. Disabled hosts get neither.
 */
export function pressFx(node, opts = {}) {
    let color = opts.color || 'rgba(255,255,255,0.32)';

    const inactive = () => node.disabled || node.getAttribute('aria-disabled') === 'true';

    function move(e) {
        const r = node.getBoundingClientRect();
        node.style.setProperty('--mx', `${e.clientX - r.left}px`);
        node.style.setProperty('--my', `${e.clientY - r.top}px`);
    }

    function down(e) {
        if (inactive() || reducedMotion() || typeof node.animate !== 'function') return;
        const r = node.getBoundingClientRect();
        const d = Math.max(r.width, r.height) * 2;
        const s = document.createElement('span');
        Object.assign(s.style, {
            position: 'absolute',
            left: `${e.clientX - r.left - d / 2}px`,
            top: `${e.clientY - r.top - d / 2}px`,
            width: `${d}px`,
            height: `${d}px`,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color} 0%, transparent 62%)`,
            pointerEvents: 'none',
            zIndex: '0',
        });
        node.appendChild(s);
        const a = s.animate(
            [{ transform: 'scale(0.05)', opacity: 0.85 }, { transform: 'scale(1)', opacity: 0 }],
            { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' }
        );
        a.onfinish = () => s.remove();
        a.oncancel = () => s.remove();
    }

    node.addEventListener('pointermove', move);
    node.addEventListener('pointerdown', down);
    return {
        update(next = {}) { if (next.color) color = next.color; },
        destroy() {
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerdown', down);
        },
    };
}
