<script>
    import Card from '../card/Card.svelte';
    import { club, squad, academy, blueEssence, trackStats, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, getEffectiveRating, ALL_SPECIAL, TIER_COLORS } from '../../utils/cards.js';
    import { rollCardsFromDrops } from '../../utils/packs.js';
    import { get } from 'svelte/store';

    // Mystery Trades — pay a large sum of Blue Essence plus a stack of spare cards for
    // ONE fully random player, guaranteed Master tier or higher (up to any Legacy/Award
    // card — no upper limit). You never see the reward in advance. Holographic and
    // signature versions are never produced.
    const MYSTERY_TRADES = [
        { id: 'elite', name: 'Elite Mystery', color: '#a855f7', cardCost: 8, beCost: 10000,
          blurb: 'A guaranteed Master or better.',
          drops: [{ tier: 'Master', pct: 60 }, { tier: 'Grandmaster', pct: 30 }, { tier: 'Challenger', pct: 8 }, { tier: 'SPECIAL', pct: 2 }] },
        { id: 'prestige', name: 'Prestige Mystery', color: '#f59e0b', cardCost: 8, beCost: 25000,
          blurb: 'Real shot at a Challenger or Legacy card.',
          drops: [{ tier: 'Master', pct: 38 }, { tier: 'Grandmaster', pct: 34 }, { tier: 'Challenger', pct: 18 }, { tier: 'SPECIAL', pct: 10 }] },
        { id: 'legendary', name: 'Legendary Mystery', color: '#ec4899', cardCost: 8, beCost: 60000,
          blurb: 'Best odds at a Champion, MVP or EWC card.',
          drops: [{ tier: 'Master', pct: 18 }, { tier: 'Grandmaster', pct: 27 }, { tier: 'Challenger', pct: 30 }, { tier: 'SPECIAL', pct: 25 }] },
    ];

    let showResult = false;
    let resultCard = null;
    let resultTradeColor = '#f59e0b';

    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
    $: academyIds = new Set(['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => $academy[r]).filter(Boolean).map(c => c.uniqueId));

    // Cards eligible to feed into a trade: your lowest-value spares. Squad, Academy,
    // locked, holographic, signature and Legacy/Award cards are all protected.
    $: fodder = $club
        .filter(c =>
            !activeSquadIds.has(c.uniqueId) && !academyIds.has(c.uniqueId) &&
            !c.locked && !c.signature && !c.holographic && !ALL_SPECIAL.includes(c.quality))
        .sort((a, b) => getEffectiveRating(a) - getEffectiveRating(b));

    function tierSummary(cards) {
        const counts = {};
        cards.forEach(c => { counts[c.quality] = (counts[c.quality] || 0) + 1; });
        return Object.entries(counts).map(([tier, n]) => ({ tier, n }));
    }

    function labelFor(tier) {
        return tier === 'SPECIAL' ? 'Legacy / Award' : tier;
    }
    function colorFor(tier) {
        return tier === 'SPECIAL' ? '#fbbf24' : (TIER_COLORS[tier] || '#94a3b8');
    }

    function requestTrade(trade) {
        if (fodder.length < trade.cardCost) {
            showToast(`Need ${trade.cardCost} spare (non-Legacy, unlocked) cards. You have ${fodder.length}.`, 'error');
            return;
        }
        if (get(blueEssence) < trade.beCost) {
            showToast(`Need ${trade.beCost.toLocaleString()} BE for this trade.`, 'error');
            return;
        }
        openConfirmModal(
            `Run ${trade.name}? This consumes ${trade.cardCost} of your lowest-rated spare cards and ${trade.beCost.toLocaleString()} BE for ONE random Master-or-better card.`,
            () => doTrade(trade)
        );
    }

    function doTrade(trade) {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        if (fodder.length < trade.cardCost || get(blueEssence) < trade.beCost) {
            showToast('Trade no longer available.', 'error');
            return;
        }

        const consume = fodder.slice(0, trade.cardCost);
        const consumeIds = new Set(consume.map(c => c.uniqueId));
        const rolled = rollCardsFromDrops(db, trade.drops, 1, 'trade_', { includeCoach: false });
        if (rolled.length === 0) { showToast('Trade failed to roll a card. Try again.', 'error'); return; }
        const newCard = rolled[0];

        blueEssence.update(v => v - trade.beCost);
        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        trackStats.update(s => ({ ...s, soldCount: (s.soldCount || 0) + trade.cardCost, tradesDone: (s.tradesDone || 0) + 1 }));

        playSound('rare');
        resultCard = newCard;
        resultTradeColor = trade.color;
        showResult = true;
        saveGame();
        showToast(`${trade.name}: received ${newCard.name} (${newCard.quality})!`, 'success');
    }

    function closeResult() { showResult = false; resultCard = null; }
</script>

<section class="trade-page">
    <div class="trade-head">
        <div>
            <h2 class="trade-title">Mystery Trade Market</h2>
            <p class="trade-desc">Feed in your spare cards plus Blue Essence for ONE fully random player — <b>guaranteed Master tier or higher</b>, all the way up to Legacy &amp; Award cards. No previews, no limits.</p>
        </div>
        <div class="trade-bank">
            <span class="tb-label">Your BE</span>
            <span class="tb-val">💎 {$blueEssence.toLocaleString()}</span>
        </div>
    </div>

    <div class="trade-grid">
        {#each MYSTERY_TRADES as trade}
            {@const consume = fodder.slice(0, trade.cardCost)}
            {@const enoughCards = fodder.length >= trade.cardCost}
            {@const enoughBE = $blueEssence >= trade.beCost}
            {@const canDo = enoughCards && enoughBE}
            <div class="mt-card" style="--accent: {trade.color};">
                <div class="mt-top">
                    <div class="mt-name">{trade.name}</div>
                    <div class="mt-blurb">{trade.blurb}</div>
                </div>

                <div class="mt-cost">
                    <div class="mt-cost-row">
                        <span class="mt-cost-label">Trade in</span>
                        <span class="mt-cost-val" class:mt-short={!enoughCards}>{trade.cardCost} cards ({fodder.length} spare)</span>
                    </div>
                    <div class="mt-cost-row">
                        <span class="mt-cost-label">Cost</span>
                        <span class="mt-cost-val" class:mt-short={!enoughBE}>💎 {trade.beCost.toLocaleString()} BE</span>
                    </div>
                    {#if enoughCards}
                        <div class="mt-fodder">
                            {#each tierSummary(consume) as { tier, n }}
                                <span class="mt-chip" style="color: {TIER_COLORS[tier] || '#94a3b8'};">{n}× {tier}</span>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="mt-odds">
                    <div class="mt-odds-label">Reward odds</div>
                    {#each trade.drops as d}
                        <div class="mt-odd">
                            <span class="mt-odd-tier" style="color: {colorFor(d.tier)};">{labelFor(d.tier)}</span>
                            <div class="mt-odd-bar"><div class="mt-odd-fill" style="width: {d.pct}%; background: {colorFor(d.tier)};"></div></div>
                            <span class="mt-odd-pct">{d.pct}%</span>
                        </div>
                    {/each}
                </div>

                <button class="mt-btn" disabled={!canDo} on:click={() => requestTrade(trade)}>
                    {#if !enoughCards}
                        Need {trade.cardCost - fodder.length} more spare cards
                    {:else if !enoughBE}
                        Not enough BE
                    {:else}
                        Trade for Mystery Card →
                    {/if}
                </button>
            </div>
        {/each}
    </div>

    <div class="trade-note">
        Squad, Academy, locked, holographic, signature and Legacy/Award cards are always protected — only your lowest-rated spare cards are consumed. Rewards are never holographic or signature.
    </div>
</section>

<!-- Result Overlay -->
{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result-overlay" on:click={closeResult}>
    <div class="result-label" style="color: {resultTradeColor};">Mystery Card Revealed!</div>
    <div class="result-reveal">
        <Card card={resultCard} />
    </div>
    <button class="result-btn" on:click|stopPropagation={closeResult}>Continue</button>
</div>
{/if}

<style>
    .trade-page { max-width: 1100px; margin: 0 auto; padding-bottom: 40px; }

    .trade-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .trade-title { font-size: 22px; font-weight: 900; color: #f59e0b; }
    .trade-desc { font-size: 12px; color: #64748b; margin-top: 3px; max-width: 620px; line-height: 1.5; }
    .trade-desc b { color: #fbbf24; }
    .trade-bank { display: flex; flex-direction: column; align-items: center; padding: 8px 18px; border-radius: 12px; background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.2); }
    .tb-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .tb-val { font-size: 16px; font-weight: 900; color: #60a5fa; }

    .trade-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .mt-card {
        border: 1px solid rgba(148,163,184,0.12); border-left: 3px solid var(--accent);
        border-radius: 16px; padding: 20px;
        background: linear-gradient(155deg, color-mix(in srgb, var(--accent) 12%, transparent) 0%, rgba(12,16,28,0.6) 55%);
        display: flex; flex-direction: column; gap: 16px;
    }
    .mt-top { }
    .mt-name { font-size: 18px; font-weight: 900; color: #f1f5f9; }
    .mt-blurb { font-size: 11px; color: #94a3b8; margin-top: 3px; font-style: italic; }

    .mt-cost { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: rgba(15,23,42,0.4); }
    .mt-cost-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
    .mt-cost-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .mt-cost-val { font-weight: 900; color: #e2e8f0; }
    .mt-short { color: #f87171; }
    .mt-fodder { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
    .mt-chip { font-size: 9px; font-weight: 800; background: rgba(0,0,0,0.25); border: 1px solid rgba(148,163,184,0.12); border-radius: 100px; padding: 2px 8px; }

    .mt-odds { display: flex; flex-direction: column; gap: 5px; }
    .mt-odds-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-bottom: 2px; }
    .mt-odd { display: flex; align-items: center; gap: 8px; }
    .mt-odd-tier { font-size: 11px; font-weight: 800; width: 92px; }
    .mt-odd-bar { flex: 1; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .mt-odd-fill { height: 100%; border-radius: 4px; }
    .mt-odd-pct { font-size: 11px; font-weight: 900; color: #94a3b8; width: 34px; text-align: right; }

    .mt-btn {
        margin-top: 2px; padding: 13px; border-radius: 12px; border: none;
        font-size: 12px; font-weight: 900; letter-spacing: 0.3px; cursor: pointer;
        background: var(--accent); color: #0b1220; transition: transform 0.12s, box-shadow 0.12s;
    }
    .mt-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
    .mt-btn:disabled { background: rgba(30,41,59,0.6); color: #475569; cursor: not-allowed; }

    .trade-note { margin-top: 22px; text-align: center; font-size: 10px; color: #334155; font-style: italic; line-height: 1.5; }

    /* Result overlay */
    .result-overlay {
        position: fixed; inset: 0; z-index: 80;
        background: rgba(0,0,0,0.9); backdrop-filter: blur(16px);
        display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px;
    }
    .result-label { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 24px; }
    .result-reveal { animation: tradeReveal 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
    @keyframes tradeReveal { from { opacity: 0; transform: scale(0.5) rotateY(90deg); } to { opacity: 1; transform: scale(1) rotateY(0deg); } }
    .result-btn {
        margin-top: 24px; padding: 12px 32px; border-radius: 12px;
        background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.2);
        color: #e2e8f0; font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.12s;
    }
    .result-btn:hover { background: rgba(51,65,85,0.6); }
</style>
