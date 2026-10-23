<script>
    // One player in a broadcast-style lineup: role, rating chip in the card's tier colour,
    // name and team. Clicking opens the full card. The red side is mirrored.
    import { inspectingCard } from '../../stores/ui.js';
    import { TIER_COLORS, getEffectiveRating } from '../../utils/cards.js';

    export let role;
    export let card = null;
    export let flex = false;
    export let side = 'blue';     // 'blue' | 'red'
    export let delay = 0;

    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };
    const yy = (y) => (y ? `'${String(y).slice(-2)}` : '');
</script>

{#if card}
    <button class="plate" class:plate-r={side === 'red'} style="--q: {TIER_COLORS[card.quality] || '#64748b'}; animation-delay: {delay}ms;" on:click={() => inspectingCard.set(card)} title="Inspect {card.name}">
        <img class="pl-role" src={ROLE_ICONS[role]} alt={role}>
        <span class="pl-rating">{getEffectiveRating(card)}</span>
        <span class="pl-text">
            <span class="pl-name">{card.name}{#if card.signature}<span class="pl-sig" title="Signature">✦</span>{/if}</span>
            <span class="pl-meta">{role} · {card.team} {yy(card.year)}</span>
        </span>
        {#if flex}<span class="pl-flex">Flex</span>{/if}
    </button>
{:else if role !== 'COACH'}
    <div class="plate plate-empty" class:plate-r={side === 'red'}>
        <img class="pl-role" src={ROLE_ICONS[role]} alt="">
        <span class="pl-meta">{role} — empty</span>
    </div>
{/if}

<style>
    .plate {
        position: relative; display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; cursor: pointer;
        padding: 8px 10px; border-radius: 14px;
        background: linear-gradient(90deg, color-mix(in srgb, var(--q) 20%, rgba(12,17,32,0.95)), rgba(12,17,32,0.9) 70%);
        border: 1px solid color-mix(in srgb, var(--q) 35%, rgba(71,85,105,0.3));
        box-shadow: inset 3px 0 0 var(--q);
        animation: plateIn 0.4s cubic-bezier(.2,.8,.3,1) both;
    }
    .plate:hover { border-color: var(--q); transform: translateX(2px); }
    .plate-r { flex-direction: row-reverse; text-align: right; background: linear-gradient(270deg, color-mix(in srgb, var(--q) 20%, rgba(12,17,32,0.95)), rgba(12,17,32,0.9) 70%); box-shadow: inset -3px 0 0 var(--q); animation-name: plateInR; }
    .plate-r:hover { transform: translateX(-2px); }
    .plate-r .pl-text { align-items: flex-end; }
    @keyframes plateIn { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
    @keyframes plateInR { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
    .pl-role { width: 18px; height: 18px; opacity: 0.85; flex-shrink: 0; }
    .pl-rating { flex-shrink: 0; min-width: 34px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: #fff; background: color-mix(in srgb, var(--q) 45%, #0b1020); border: 1px solid color-mix(in srgb, var(--q) 70%, transparent); text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .pl-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .pl-name { font-size: 13.5px; font-weight: 900; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .pl-sig { color: #fde68a; margin-left: 4px; }
    .pl-meta { font-size: 10.5px; font-weight: 700; color: #7c8aa0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .pl-flex { flex-shrink: 0; font-size: 8.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #38bdf8; padding: 2px 6px; border-radius: 6px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.35); }
    .plate-empty { cursor: default; opacity: 0.5; border: 1px dashed rgba(71,85,105,0.5); box-shadow: none; background: rgba(15,23,42,0.5); --q: #334155; }
</style>
