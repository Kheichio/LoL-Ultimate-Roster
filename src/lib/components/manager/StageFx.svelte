<script>
    // ═══════════════════════════════════════════════════════════════════
    //  Full-screen cards: a new stage of the year, a title, an achievement
    // ═══════════════════════════════════════════════════════════════════
    //  Reads the head of mgrFx and plays it. Click, Enter or Space moves on; a
    //  card also moves on by itself after a few seconds. Nothing here touches
    //  the save.
    import { onDestroy } from 'svelte';
    import { popFx } from '../../stores/manager.js';
    import { SEASON_PHASES } from '../../manager/data.js';
    import { playSound } from '../../utils/sound.js';
    import Icon from '../ui/Icon.svelte';

    export let card;
    const HOLD = { phase: 4200, title: 6000, achievement: 4600, down: 4600 };

    // Confetti for a title: fixed positions per piece, so SSR and the browser agree.
    const pieces = Array.from({ length: 46 }, (_, i) => ({
        x: (i * 37) % 100,
        d: ((i * 13) % 20) / 10,
        r: (i * 47) % 360,
        c: ['#facc15', '#fde68a', '#34d399', '#38bdf8', '#f472b6', '#ffffff'][i % 6],
        s: 6 + (i % 4) * 2,
    }));

    let timer = null;
    let shownFor = null;
    $: if (card && card !== shownFor) start(card);
    function start(c) {
        shownFor = c;
        if (timer) clearTimeout(timer);
        if (typeof window === 'undefined') return;
        try { playSound(c.kind === 'title' ? 'win' : 'click'); } catch (e) {}
        timer = setTimeout(next, HOLD[c.kind] || 4500);
    }
    function next() {
        if (timer) { clearTimeout(timer); timer = null; }
        popFx();
    }
    function onKey(e) {
        if (!card) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); next(); }
    }
    onDestroy(() => { if (timer) clearTimeout(timer); });

    $: phaseIdx = card && card.kind === 'phase' ? SEASON_PHASES.findIndex(p => p.id === card.phase) : -1;
    $: trophyIcon = card && card.kind === 'title' ? (card.trophy === 'worlds' ? 'crown' : card.trophy === 'msi' ? 'globe' : card.trophy === 'promotion' ? 'upgrade' : 'trophy') : 'trophy';
</script>

<svelte:window on:keydown={onKey} />

{#if card}
    <div class="fx fx-{card.kind}" style="--c:{card.color || '#34d399'}" on:click={next} role="presentation">
        <div class="glow"></div>
        <div class="rays"></div>
        {#if card.kind === 'title'}
            <div class="confetti" aria-hidden="true">
                {#each pieces as p}<i style="left:{p.x}%; animation-delay:{p.d}s; background:{p.c}; width:{p.s}px; height:{p.s * 1.6}px; transform:rotate({p.r}deg)"></i>{/each}
            </div>
        {/if}
        <div class="body">
            {#if card.kind === 'phase'}
                {#if card.newYear}<span class="eyebrow">Season {card.year}</span>{:else}<span class="eyebrow">{card.year} · Next up</span>{/if}
                <span class="ring"><Icon name={card.icon || 'calendar'} size={44} stroke={1.8} /></span>
                <h1>{card.title}</h1>
                <p class="sub tone-{card.tone}">{card.sub}</p>
                <div class="track" aria-hidden="true">
                    {#each SEASON_PHASES as p, i}
                        <span class="tk" class:done={i < phaseIdx} class:now={i === phaseIdx} style="--pc:{p.color}" title={p.name}><i></i><b>{p.short}</b></span>
                    {/each}
                </div>
            {:else if card.kind === 'title'}
                <span class="eyebrow">Champions</span>
                <span class="ring big"><Icon name={trophyIcon} size={64} stroke={1.6} /></span>
                <h1>{card.title}</h1>
                <p class="sub">{card.sub}</p>
            {:else if card.kind === 'achievement'}
                <span class="eyebrow">Achievement {card.count > 1 ? `· ×${card.count}` : 'unlocked'}</span>
                <span class="ring"><Icon name="medal" size={48} stroke={1.8} /></span>
                <h1>{card.title}</h1>
                <p class="sub">{card.sub}</p>
                {#if card.point}<span class="pt"><Icon name="star" size={14} /> +1 perk point</span>{/if}
            {:else}
                <span class="eyebrow">Bad news</span>
                <span class="ring"><Icon name="alert" size={48} stroke={1.8} /></span>
                <h1>{card.title}</h1>
                <p class="sub">{card.sub}</p>
            {/if}
            <span class="tap">Click or press Enter to continue</span>
        </div>
        <div class="bar"><i style="animation-duration:{(HOLD[card.kind] || 4500) / 1000}s"></i></div>
    </div>
{/if}

<style>
    .fx {
        position: fixed; inset: 0; z-index: 400; display: grid; place-items: center; overflow: hidden; cursor: pointer;
        background: radial-gradient(60% 60% at 50% 45%, color-mix(in srgb, var(--c) 26%, rgba(2, 6, 23, 0.92)), rgba(2, 6, 23, 0.97) 70%);
        animation: fxIn 0.35s ease both;
    }
    @keyframes fxIn { from { opacity: 0; } to { opacity: 1; } }
    .glow { position: absolute; width: 70vmin; height: 70vmin; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--c) 45%, transparent), transparent 65%); filter: blur(20px); animation: pulse 2.4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(0.92); opacity: 0.7; } 50% { transform: scale(1.06); opacity: 1; } }
    .rays { position: absolute; width: 160vmax; height: 160vmax; background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--c) 10%, transparent) 0deg 6deg, transparent 6deg 18deg); animation: spin 40s linear infinite; mask-image: radial-gradient(circle, #000 0%, transparent 55%); -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 55%); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .body { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 24px; text-align: center; max-width: 760px; }
    .eyebrow { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 6px; text-transform: uppercase; color: var(--c); animation: up 0.5s 0.1s ease both; }
    .ring { width: 104px; height: 104px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--c) 70%, #fff 10%), color-mix(in srgb, var(--c) 40%, #020617)); box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 25%, transparent), 0 0 60px color-mix(in srgb, var(--c) 55%, transparent); animation: pop 0.6s 0.15s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
    .ring.big { width: 140px; height: 140px; }
    @keyframes pop { from { transform: scale(0.2) rotate(-25deg); opacity: 0; } to { transform: none; opacity: 1; } }
    h1 { margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: clamp(30px, 6vw, 58px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; color: #fff; text-shadow: 0 6px 40px color-mix(in srgb, var(--c) 60%, transparent); animation: up 0.55s 0.25s ease both; }
    .sub { margin: 0; font-size: clamp(14px, 2vw, 18px); line-height: 1.55; color: #dbe4f3; max-width: 620px; animation: up 0.55s 0.35s ease both; }
    .sub.tone-good { color: #a7f3d0; }
    .sub.tone-bad { color: #fecaca; }
    .sub.tone-warn { color: #fde68a; }
    @keyframes up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    .pt { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 999px; font-weight: 800; font-size: 13px; color: #1e1033; background: #c4b5fd; animation: up 0.5s 0.5s ease both; }
    .tap { margin-top: 8px; font-size: 12px; color: #8aa0c4; animation: up 0.5s 0.8s ease both; }
    .track { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-top: 8px; animation: up 0.55s 0.45s ease both; }
    .tk { display: flex; flex-direction: column; align-items: center; gap: 5px; width: 62px; }
    .tk i { width: 100%; height: 5px; border-radius: 5px; background: rgba(148, 163, 184, 0.2); }
    .tk.done i { background: color-mix(in srgb, var(--pc) 55%, #334155); }
    .tk.now i { background: var(--pc); box-shadow: 0 0 12px var(--pc); }
    .tk b { font-size: 9.5px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; color: #64748b; }
    .tk.now b { color: #fff; }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(148, 163, 184, 0.12); }
    .bar i { display: block; height: 100%; width: 100%; background: var(--c); transform-origin: left; animation-name: drain; animation-timing-function: linear; animation-fill-mode: both; }
    @keyframes drain { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .confetti { position: absolute; inset: 0; pointer-events: none; }
    .confetti i { position: absolute; top: -20px; border-radius: 2px; opacity: 0.9; animation: fall 3.4s linear infinite; }
    @keyframes fall { 0% { transform: translateY(-20px) rotate(0); } 100% { transform: translateY(110vh) rotate(720deg); } }
    @media (max-width: 620px) { .tk { width: 44px; } .tk b { display: none; } }
</style>
