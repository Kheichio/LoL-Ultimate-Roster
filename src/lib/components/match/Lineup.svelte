<script>
    // One side's lineup on a match screen, drawn either as the real cards or as compact player
    // rows — the player's choice, from the matchCardView device preference.
    //
    // The cards are the standard mini cards scaled to 80% with CSS `zoom` (which, unlike a
    // transform, shrinks the layout box too) in a two-column grid. That is what lets six cards
    // a side sit beside the play area: the original screen used full-size cards and had to hide
    // both lineups entirely below 1400px.
    import Card from '../card/Card.svelte';
    import PlayerPlate from './PlayerPlate.svelte';
    import { matchCardView } from '../../stores/ui.js';

    export let lineup = [];       // [{ role, card, flex }]
    export let side = 'blue';

    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };
</script>

{#if $matchCardView}
    <div class="lc" class:lc-r={side === 'red'}>
        {#each lineup as p, i (p.role)}
            {#if p.card}
                <div class="lc-cell" style="animation-delay: {i * 50}ms;">
                    <Card card={p.card} mini={true} />
                    {#if p.flex}<span class="lc-flex">Flex</span>{/if}
                </div>
            {:else if p.role !== 'COACH'}
                <div class="lc-cell lc-empty" style="animation-delay: {i * 50}ms;">
                    <img src={ROLE_ICONS[p.role]} alt=""><span>{p.role}</span>
                </div>
            {/if}
        {/each}
    </div>
{:else}
    <div class="lp">
        {#each lineup as p, i (p.role)}
            <PlayerPlate role={p.role} card={p.card} flex={p.flex} {side} delay={i * 50} />
        {/each}
    </div>
{/if}

<style>
    /* Columns come from --lineup-cols, so a roomier screen (the pre-match face-off) can set 3. */
    .lc { display: grid; grid-template-columns: repeat(var(--lineup-cols, 2), max-content); gap: 8px; justify-content: center; }
    .lc-cell { position: relative; zoom: 0.8; animation: lcIn 0.4s cubic-bezier(.2,.8,.3,1) both; }
    .lc-r .lc-cell { animation-name: lcInR; }
    @keyframes lcIn { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
    @keyframes lcInR { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
    .lc-flex { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 6; font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #38bdf8; padding: 3px 9px; border-radius: 8px; background: rgba(2,6,23,0.85); border: 1px solid rgba(56,189,248,0.5); }
    .lc-empty { width: 180px; height: 266px; border-radius: 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 2px dashed rgba(71,85,105,0.45); background: rgba(15,23,42,0.4); color: #475569; font-size: 13px; font-weight: 900; letter-spacing: 1.5px; }
    .lc-empty img { width: 26px; height: 26px; opacity: 0.4; }
    .lp { display: flex; flex-direction: column; gap: 6px; }
</style>
