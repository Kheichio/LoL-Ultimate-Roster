<script>
    // One booster pack, drawn entirely in CSS: a foil body in the pack's colour, crimped
    // zig-zag seals top and bottom (a mask, so the page background shows through the teeth),
    // a tear line under the top seal, the pack's emblem and name, and a holographic sheen that
    // follows the pointer. Used by the Store shelves and by the opening animation, so a pack
    // looks the same on the shelf as it does in your hands.
    import Icon from '../ui/Icon.svelte';

    export let pack;               // { id, name, sub, color, count }
    export let width = 200;        // px; the height follows at the real pack ratio
    export let tilt = true;        // lift + lean on hover (off for the opening animation)
    export let state = '';         // '' | 'shake' | 'torn' — driven by the opening sequence

    const ICONS = {
        standard: 'cards', premium: 'gem', elite: 'sparkle', firststand: 'flame', ewc: 'globe',
        msi: 'waves', champion: 'trophy', mvp: 'star', awards: 'crown', starter: 'gift',
    };
    $: icon = ICONS[pack.id] || 'cards';

    let mx = 50, my = 30;
    function move(e) {
        const r = e.currentTarget.getBoundingClientRect();
        mx = Math.round(((e.clientX - r.left) / r.width) * 100);
        my = Math.round(((e.clientY - r.top) / r.height) * 100);
    }
    function leave() { mx = 50; my = 30; }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    class="pk"
    class:pk-tilt={tilt}
    class:pk-shake={state === 'shake'}
    class:pk-torn={state === 'torn'}
    style="--c: {pack.color}; --w: {width}px; --mx: {mx}%; --my: {my}%;"
    on:pointermove={move}
    on:pointerleave={leave}
>
    <!-- The top seal is its own element so the opening sequence can tear it away. -->
    <div class="pk-cap" aria-hidden="true"><div class="pk-cap-in"></div></div>
    <div class="pk-body">
        <div class="pk-mark" aria-hidden="true"><Icon name={icon} size={Math.round(width * 0.9)} stroke={1} /></div>
        <div class="pk-stripes" aria-hidden="true"></div>
        <div class="pk-sheen" aria-hidden="true"></div>
        <div class="pk-tear" aria-hidden="true"></div>
        <div class="pk-face">
            <span class="pk-brand">Ultimate Roster</span>
            <span class="pk-emblem"><Icon name={icon} size={Math.round(width * 0.2)} stroke={1.8} /></span>
            <span class="pk-name">{pack.name}</span>
            <span class="pk-sub">{pack.sub}</span>
        </div>
        <div class="pk-foot" aria-hidden="true">
            <span class="pk-count">{pack.count} cards</span>
            <span class="pk-code">S26 · {String(pack.id).toUpperCase().slice(0, 4)}</span>
        </div>
    </div>
</div>

<style>
    .pk {
        --s: 11px;                                  /* zig-zag tooth width */
        --h: calc(var(--w) * 1.42);
        --cap: calc(var(--w) * 0.13);
        position: relative; width: var(--w); height: var(--h);
        filter: drop-shadow(0 14px 22px rgba(0,0,0,0.5)) drop-shadow(0 0 18px color-mix(in srgb, var(--c) 22%, transparent));
        transition: transform 0.25s cubic-bezier(.2,.8,.3,1.25), filter 0.25s;
        user-select: none;
    }
    .pk-tilt:hover { transform: translateY(-8px) rotate(-1.6deg) scale(1.02); filter: drop-shadow(0 22px 30px rgba(0,0,0,0.55)) drop-shadow(0 0 30px color-mix(in srgb, var(--c) 40%, transparent)); }

    /* Both seals carry a zig-zag edge, cut with a conic-gradient mask. */
    .pk-cap {
        position: absolute; left: 0; right: 0; top: 0; height: var(--cap); z-index: 2;
        -webkit-mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / var(--s) 100%;
                mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / var(--s) 100%;
        transition: transform 0.45s cubic-bezier(.3,.7,.2,1), opacity 0.45s;
    }
    .pk-cap-in {
        width: 100%; height: 100%;
        background:
            repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0 2px, rgba(255,255,255,0.10) 2px 4px),
            linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, #fff), color-mix(in srgb, var(--c) 55%, #000));
    }
    .pk-body {
        position: absolute; left: 0; right: 0; top: calc(var(--cap) - 1px); bottom: 0; overflow: hidden;
        background:
            radial-gradient(90% 55% at var(--mx) var(--my), rgba(255,255,255,0.22), transparent 70%),
            linear-gradient(165deg,
                color-mix(in srgb, var(--c) 72%, #fff) 0%,
                var(--c) 18%,
                color-mix(in srgb, var(--c) 62%, #000) 55%,
                color-mix(in srgb, var(--c) 30%, #05060c) 100%);
        -webkit-mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / var(--s) 100%;
                mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / var(--s) 100%;
    }
    /* Bottom seal: ridges along the last strip of the body. */
    .pk-body::after {
        content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--cap) * 0.8);
        background:
            repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 0 2px, rgba(255,255,255,0.08) 2px 4px),
            color-mix(in srgb, var(--c) 40%, #000);
    }
    .pk-mark { position: absolute; right: -24%; bottom: 4%; color: rgba(255,255,255,0.07); transform: rotate(-14deg); pointer-events: none; }
    .pk-stripes { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px); pointer-events: none; }
    .pk-sheen {
        position: absolute; inset: -20%; pointer-events: none; mix-blend-mode: soft-light;
        background: linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.65) 46%, rgba(180,220,255,0.35) 50%, rgba(255,200,255,0.3) 54%, transparent 66%);
        background-size: 260% 100%; background-position: 120% 0;
        transition: background-position 0.9s ease;
    }
    .pk-tilt:hover .pk-sheen { background-position: -40% 0; }
    .pk-tear { position: absolute; left: 8px; right: 8px; top: 7px; border-top: 1.5px dashed rgba(255,255,255,0.32); }

    .pk-face {
        position: absolute; left: 0; right: 0; top: 10%; bottom: 20%;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2px;
        padding: 0 10px; color: #fff;
    }
    .pk-brand { font-size: calc(var(--w) * 0.045); font-weight: 900; letter-spacing: 0.35em; text-transform: uppercase; opacity: 0.75; margin-bottom: calc(var(--w) * 0.06); }
    .pk-emblem {
        width: calc(var(--w) * 0.36); height: calc(var(--w) * 0.36); border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4), rgba(255,255,255,0.08) 60%), rgba(0,0,0,0.18);
        border: 2px solid rgba(255,255,255,0.45);
        box-shadow: 0 0 0 5px rgba(0,0,0,0.12), 0 0 26px color-mix(in srgb, var(--c) 70%, #fff 0%), inset 0 -6px 14px rgba(0,0,0,0.25);
        margin-bottom: calc(var(--w) * 0.07);
    }
    .pk-name {
        font-size: calc(var(--w) * 0.14); font-weight: 900; line-height: 0.95; letter-spacing: -0.01em; text-transform: uppercase;
        text-shadow: 0 2px 0 rgba(0,0,0,0.25), 0 4px 14px rgba(0,0,0,0.45);
    }
    .pk-sub { font-size: calc(var(--w) * 0.055); font-weight: 800; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.8; margin-top: calc(var(--w) * 0.03); }
    .pk-foot {
        position: absolute; left: 0; right: 0; bottom: calc(var(--cap) * 0.8 + 6px);
        display: flex; justify-content: space-between; align-items: center; padding: 0 12px;
    }
    .pk-count { font-size: calc(var(--w) * 0.05); font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; color: #fff; padding: 3px 8px; border-radius: 100px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.25); }
    .pk-code { font-size: calc(var(--w) * 0.04); font-weight: 800; letter-spacing: 0.15em; color: rgba(255,255,255,0.55); font-family: monospace; }

    /* Opening sequence */
    .pk-shake { animation: pkShake 0.55s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes pkShake {
        10%, 90% { transform: translateX(-2px) rotate(-1deg); }
        20%, 80% { transform: translateX(4px) rotate(1.5deg); }
        30%, 50%, 70% { transform: translateX(-6px) rotate(-2deg) scale(1.02); }
        40%, 60% { transform: translateX(6px) rotate(2deg) scale(1.03); }
    }
    .pk-torn .pk-cap { transform: translate(18%, -140%) rotate(16deg); opacity: 0; }
    .pk-torn { animation: pkGlow 0.6s ease-out both; }
    @keyframes pkGlow { from { filter: drop-shadow(0 0 0 transparent) brightness(1); } 40% { filter: drop-shadow(0 0 60px color-mix(in srgb, var(--c) 90%, #fff)) brightness(1.6); } to { filter: drop-shadow(0 0 30px color-mix(in srgb, var(--c) 60%, transparent)) brightness(1.15); } }

    /* Light mode inverts the whole page; packs, like cards, opt back out so they keep their colours. */
    :global(html.light-mode) .pk { filter: invert(1) hue-rotate(180deg) drop-shadow(0 14px 22px rgba(0,0,0,0.3)); }
</style>
