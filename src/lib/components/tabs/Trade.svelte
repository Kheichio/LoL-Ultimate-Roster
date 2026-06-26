<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, collectionRegistry, skills, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, makeUniqueId, TIER_ORDER, ALL_SPECIAL, TIER_COLORS } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    const BASE_TRADE_COUNT = 3;
    const ROTATE_MS = 15 * 60 * 1000;
    const REFRESH_COST = 1000;

    $: tradeSkillLevel = $skills.trading || 0;
    $: tradeCount = BASE_TRADE_COUNT + (tradeSkillLevel >= 4 ? 2 : tradeSkillLevel >= 2 ? 1 : 0);
    $: cardDiscount = Math.floor(tradeSkillLevel / 2);
    $: refreshDiscount = tradeSkillLevel >= 4 ? 500 : tradeSkillLevel >= 2 ? 250 : 0;
    $: actualRefreshCost = REFRESH_COST - refreshDiscount;

    const TRADE_PATHS = [
        { from: 'Bronze', to: 'Platinum', count: 8, minLevel: 0 },
        { from: 'Silver', to: 'Platinum', count: 5, minLevel: 0 },
        { from: 'Gold', to: 'Platinum', count: 3, minLevel: 0 },
        { from: 'Silver', to: 'Diamond', count: 10, minLevel: 1 },
        { from: 'Gold', to: 'Diamond', count: 6, minLevel: 1 },
        { from: 'Platinum', to: 'Diamond', count: 3, minLevel: 1 },
        { from: 'Gold', to: 'Master', count: 8, minLevel: 2 },
        { from: 'Platinum', to: 'Master', count: 4, minLevel: 2 },
        { from: 'Diamond', to: 'Master', count: 3, minLevel: 2 },
        { from: 'Platinum', to: 'Grandmaster', count: 6, minLevel: 3 },
        { from: 'Diamond', to: 'Grandmaster', count: 4, minLevel: 3 },
        { from: 'Master', to: 'Grandmaster', count: 3, minLevel: 3 },
        { from: 'Diamond', to: 'Challenger', count: 6, minLevel: 4 },
        { from: 'Master', to: 'Challenger', count: 4, minLevel: 4 },
        { from: 'Grandmaster', to: 'Challenger', count: 2, minLevel: 4 },
    ];

    let offers = [];
    let nextRotation = 0;
    let timeLeft = '';
    let timerInterval = null;
    let showResult = false;
    let resultCard = null;

    function getSeed() {
        return Math.floor(Date.now() / ROTATE_MS);
    }

    function seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    function generateOffers(seed, count) {
        const rng = seededRandom(seed);
        const level = get(skills).trading || 0;
        const discount = Math.floor(level / 2);
        const available = TRADE_PATHS.filter(p => level >= p.minLevel);
        const shuffled = [...available].sort(() => rng() - 0.5);
        const selected = shuffled.slice(0, count);

        const db = getDB();
        if (!db) return selected.map(t => ({ ...t, targetCard: null }));

        return selected.map(t => {
            const discounted = Math.max(1, t.count - discount);
            const pool = db.filter(p =>
                p.quality === t.to &&
                !ALL_SPECIAL.includes(p.quality) &&
                p.role !== 'COACH'
            );
            const target = pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : null;
            return { ...t, count: discounted, originalCount: t.count, targetCard: target };
        });
    }

    function loadOffers() {
        const seed = getSeed();
        const level = get(skills).trading || 0;
        const count = BASE_TRADE_COUNT + (level >= 4 ? 2 : level >= 2 ? 1 : 0);
        offers = generateOffers(seed, count);
        nextRotation = (seed + 1) * ROTATE_MS;
        updateTimer();
    }

    function updateTimer() {
        const remaining = Math.max(0, nextRotation - Date.now());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timeLeft = `${mins}:${secs.toString().padStart(2, '0')}`;
        if (remaining <= 0) loadOffers();
    }

    function refreshOffers() {
        const cost = actualRefreshCost;
        if (get(blueEssence) < cost) {
            showToast(`Need ${cost} BE to refresh.`, 'error');
            return;
        }
        blueEssence.update(v => v - cost);
        const newSeed = Date.now();
        const level = get(skills).trading || 0;
        const count = BASE_TRADE_COUNT + (level >= 4 ? 2 : level >= 2 ? 1 : 0);
        offers = generateOffers(newSeed, count);
        nextRotation = Date.now() + ROTATE_MS;
        saveGame();
        showToast('Trade offers refreshed!', 'success');
    }

    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));

    function getEligible(offer) {
        return $club.filter(c =>
            c.quality === offer.from &&
            !ALL_SPECIAL.includes(c.quality) &&
            !c.signature && !c.holographic &&
            !c.locked &&
            !activeSquadIds.has(c.uniqueId)
        ).sort((a, b) => a.rating - b.rating);
    }

    function executeTrade(offer) {
        const eligible = getEligible(offer);
        if (eligible.length < offer.count) {
            showToast(`Need ${offer.count} ${offer.from} cards. You have ${eligible.length}.`, 'error');
            return;
        }
        if (!offer.targetCard) {
            showToast('No target card available.', 'error');
            return;
        }

        const toConsume = eligible.slice(0, offer.count);
        const consumeIds = new Set(toConsume.map(c => c.uniqueId));
        const newCard = { ...offer.targetCard, uniqueId: makeUniqueId('trade_') };

        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        trackStats.update(s => ({ ...s, soldCount: (s.soldCount || 0) + offer.count }));

        playSound('rare');
        resultCard = newCard;
        showResult = true;
        saveGame();
        showToast(`Traded ${offer.count}× ${offer.from} → ${newCard.name} (${offer.to})!`, 'success');
    }

    function closeResult() { showResult = false; resultCard = null; }

    // Init
    loadOffers();
    timerInterval = setInterval(updateTimer, 1000);

    import { onDestroy } from 'svelte';
    onDestroy(() => { if (timerInterval) clearInterval(timerInterval); });
</script>

<section class="trade-page">
    <div class="trade-head">
        <div>
            <h2 class="trade-title">Trade Market</h2>
            <p class="trade-desc">Trade lower-tier cards for higher-tier players. Offers rotate every 15 minutes.</p>
        </div>
        <div class="trade-controls">
            <div class="trade-timer">
                <span class="tt-label">Next rotation</span>
                <span class="tt-time">{timeLeft}</span>
            </div>
            <button class="trade-refresh" on:click={refreshOffers}>
                Refresh · {actualRefreshCost} BE
                {#if refreshDiscount > 0}<span class="tr-disc">(-{refreshDiscount})</span>{/if}
            </button>
        </div>
    </div>

    <div class="trade-grid">
        {#each offers as offer, i}
            {@const eligible = getEligible(offer)}
            {@const canTrade = eligible.length >= offer.count && offer.targetCard}
            {@const fromColor = TIER_COLORS[offer.from] || '#64748b'}
            {@const toColor = TIER_COLORS[offer.to] || '#64748b'}
            <div class="trade-card">
                <!-- Left: Trade info -->
                <div class="tc-info">
                    <div class="tc-give">
                        <div class="tc-section-label">Trade In</div>
                        <div class="tc-tier" style="color: {fromColor};">{offer.count}× {offer.from}</div>
                        <div class="tc-have" class:tc-enough={eligible.length >= offer.count} class:tc-short={eligible.length < offer.count}>
                            You have: {eligible.length}
                        </div>
                    </div>

                    <div class="tc-arrow">→</div>

                    <div class="tc-get">
                        <div class="tc-section-label">Receive</div>
                        {#if offer.targetCard}
                            <div class="tc-target-tier" style="color: {toColor}; border-color: {toColor};">{offer.to}</div>
                            <div class="tc-target-name">{offer.targetCard.name}</div>
                            <div class="tc-target-info">{offer.targetCard.team} [{offer.targetCard.year}] · {offer.targetCard.role}</div>
                        {:else}
                            <div class="tc-target-none">No card available</div>
                        {/if}
                    </div>

                    <button
                        class="tc-btn"
                        class:tc-btn-ready={canTrade}
                        class:tc-btn-disabled={!canTrade}
                        disabled={!canTrade}
                        on:click={() => executeTrade(offer)}
                    >
                        {#if !offer.targetCard}
                            Unavailable
                        {:else if eligible.length < offer.count}
                            Need {offer.count - eligible.length} more
                        {:else}
                            Trade →
                        {/if}
                    </button>
                </div>

                <!-- Right: Card preview -->
                <div class="tc-preview">
                    {#if offer.targetCard}
                        <Card card={offer.targetCard} mini={true} />
                    {:else}
                        <div class="tc-no-card">?</div>
                    {/if}
                </div>
            </div>
        {/each}
    </div>

    <div class="trade-note">
        Signature and holographic cards cannot be traded in. Locked cards and cards in your squad are excluded.
    </div>
</section>

<!-- Result Overlay -->
{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result-overlay" on:click={closeResult}>
    <div class="result-label">Trade Complete!</div>
    <div class="result-reveal">
        <Card card={resultCard} />
    </div>
    <button class="result-btn" on:click|stopPropagation={closeResult}>Continue</button>
</div>
{/if}

<style>
    .trade-page { max-width: 1000px; margin: 0 auto; padding-bottom: 40px; }

    .trade-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .trade-title { font-size: 22px; font-weight: 900; color: #f59e0b; }
    .trade-desc { font-size: 12px; color: #64748b; margin-top: 3px; }
    .trade-controls { display: flex; align-items: center; gap: 12px; }
    .trade-timer {
        display: flex; flex-direction: column; align-items: center;
        padding: 8px 16px; border-radius: 10px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
    }
    .tt-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .tt-time { font-size: 18px; font-weight: 900; color: #e2e8f0; font-family: monospace; }
    .trade-refresh {
        padding: 10px 18px; border-radius: 10px;
        background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2);
        color: #fbbf24; font-size: 11px; font-weight: 900;
        cursor: pointer; transition: all 0.12s;
    }
    .trade-refresh:hover { background: rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.35); }
    .tr-disc { font-size: 9px; color: #34d399; margin-left: 4px; }

    /* Trade grid */
    .trade-grid { display: flex; flex-direction: column; gap: 12px; }

    .trade-card {
        display: flex; align-items: center; gap: 20px;
        padding: 20px 24px; border-radius: 16px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        transition: border-color 0.12s;
    }
    .trade-card:hover { border-color: rgba(245,158,11,0.15); }
    .tc-info { flex: 1; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .tc-preview { flex-shrink: 0; }
    .tc-no-card {
        width: 180px; height: 280px; border-radius: 14px;
        background: rgba(15,23,42,0.3); border: 1px dashed rgba(51,65,85,0.2);
        display: flex; align-items: center; justify-content: center;
        font-size: 32px; font-weight: 900; color: #1e293b;
    }
    @media (max-width: 700px) {
        .trade-card { flex-direction: column; text-align: center; }
        .tc-info { justify-content: center; }
    }

    .tc-section-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-bottom: 6px; }
    .tc-tier { font-size: 18px; font-weight: 900; }
    .tc-have { font-size: 11px; font-weight: 700; margin-top: 4px; }
    .tc-enough { color: #34d399; }
    .tc-short { color: #f87171; }
    .tc-arrow { font-size: 24px; font-weight: 900; color: #334155; }

    /* Target card info */

    .tc-target-tier {
        display: inline-block; font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; padding: 2px 10px; border-radius: 6px;
        border: 1px solid; background: rgba(0,0,0,0.2); width: fit-content;
    }
    .tc-target-name { font-size: 16px; font-weight: 900; color: #f1f5f9; margin-top: 4px; }
    .tc-target-info { font-size: 10px; color: #64748b; }
    .tc-target-none { font-size: 12px; color: #334155; font-style: italic; }

    /* Trade button */
    .tc-btn {
        padding: 12px 20px; border-radius: 12px;
        font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
        border: none; cursor: pointer; transition: all 0.15s;
        white-space: nowrap;
    }
    .tc-btn-ready {
        background: linear-gradient(135deg, #d97706, #f59e0b); color: #1c1917;
        box-shadow: 0 4px 12px rgba(245,158,11,0.2);
    }
    .tc-btn-ready:hover { box-shadow: 0 6px 20px rgba(245,158,11,0.35); transform: translateY(-1px); }
    .tc-btn-disabled {
        background: rgba(30,41,59,0.5); color: #475569; cursor: not-allowed;
        border: 1px solid rgba(51,65,85,0.2);
    }

    .trade-note {
        margin-top: 20px; text-align: center;
        font-size: 10px; color: #334155; font-style: italic;
    }

    /* Result overlay */
    .result-overlay {
        position: fixed; inset: 0; z-index: 80;
        background: rgba(0,0,0,0.9); backdrop-filter: blur(16px);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 16px;
    }
    .result-label {
        font-size: 16px; font-weight: 900; color: #f59e0b;
        text-transform: uppercase; letter-spacing: 3px; margin-bottom: 24px;
    }
    .result-reveal { animation: tradeReveal 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
    @keyframes tradeReveal {
        from { opacity: 0; transform: scale(0.5) rotateY(90deg); }
        to { opacity: 1; transform: scale(1) rotateY(0deg); }
    }
    .result-btn {
        margin-top: 24px; padding: 12px 32px; border-radius: 12px;
        background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.2);
        color: #e2e8f0; font-size: 13px; font-weight: 800;
        cursor: pointer; transition: all 0.12s;
    }
    .result-btn:hover { background: rgba(51,65,85,0.6); }
</style>
