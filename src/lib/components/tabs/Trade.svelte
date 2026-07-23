<script>
    import { onMount, onDestroy } from 'svelte';
    import Card from '../card/Card.svelte';
    import { club, squad, academy, blueEssence, trackStats, collectionRegistry, tradeMarket, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, getEffectiveRating, ALL_SPECIAL, TIER_COLORS, makeUniqueId } from '../../utils/cards.js';
    import { poolForTier } from '../../utils/packs.js';
    import { get } from 'svelte/store';

    // Transfer Market — a rotating board of REAL, fully-visible signings. You always see
    // exactly which player you are trading for (no mystery). The board is randomised and
    // resets every 15 minutes; each listing can be signed once per rotation. Signings are
    // never holographic or signature — those are pull-time flags only.
    const WINDOW_MS = 15 * 60 * 1000;   // rotation length
    const OFFER_COUNT = 6;              // listings per rotation

    // What can appear on the board, weighted. Higher tiers are rarer.
    const MARKET_DROPS = [
        { tier: 'Gold', pct: 20 },
        { tier: 'Platinum', pct: 24 },
        { tier: 'Diamond', pct: 22 },
        { tier: 'Master', pct: 16 },
        { tier: 'Grandmaster', pct: 10 },
        { tier: 'Challenger', pct: 6 },
        { tier: 'SPECIAL', pct: 2 },
    ];

    // Cost to sign, by reward tier: spare cards fed in + Blue Essence. Any Legacy/Award
    // quality maps to the SPECIAL row.
    const TIER_COST = {
        Gold:        { cardCost: 3, beCost: 400 },
        Platinum:    { cardCost: 4, beCost: 1200 },
        Diamond:     { cardCost: 5, beCost: 3500 },
        Master:      { cardCost: 6, beCost: 9000 },
        Grandmaster: { cardCost: 7, beCost: 20000 },
        Challenger:  { cardCost: 9, beCost: 45000 },
        SPECIAL:     { cardCost: 12, beCost: 90000 },
    };

    // Deterministic PRNG so a rotation is identical across reloads within the same window
    // (and rebuilds itself the moment the window flips).
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function rollTierSeeded(drops, rng) {
        const total = drops.reduce((s, d) => s + d.pct, 0);
        let r = rng() * total;
        for (const d of drops) { r -= d.pct; if (r < 0) return d.tier; }
        return drops[drops.length - 1].tier;
    }

    function costForCard(card) {
        const q = ALL_SPECIAL.includes(card.quality) ? 'SPECIAL' : card.quality;
        return TIER_COST[q] || TIER_COST.Gold;
    }

    // Build one rotation's worth of visible listings. No duplicate players within a rotation.
    function buildOffers(db, windowIndex) {
        const rng = mulberry32((windowIndex * 2654435761) >>> 0);
        const offers = [];
        const usedIds = new Set();
        let guard = 0;
        while (offers.length < OFFER_COUNT && guard < OFFER_COUNT * 60) {
            guard++;
            const tier = rollTierSeeded(MARKET_DROPS, rng);
            const pool = poolForTier(db, tier, { includeCoach: false });
            if (pool.length === 0) continue;
            const pick = pool[Math.floor(rng() * pool.length)];
            if (usedIds.has(pick.id)) continue;
            usedIds.add(pick.id);
            const { cardCost, beCost } = costForCard(pick);
            offers.push({
                key: pick.id,
                // Display template — a fresh real instance is minted at sign-time.
                card: { ...pick, uniqueId: `trade_view_${windowIndex}_${pick.id}`, signature: false, holographic: false },
                cardCost, beCost,
            });
        }
        return offers;
    }

    // === Reactive state ===
    let now = Date.now();
    let offers = [];
    let builtWindow = null;
    let timer = null;

    // Claim ledger lives in the persisted tradeMarket store so a sign and its claim record
    // commit together via saveGame() (never a durable claim with an unsaved reward).
    $: claimed = $tradeMarket.claimed;

    let showResult = false;
    let resultCard = null;
    let resultTradeColor = '#f59e0b';

    $: windowIndex = Math.floor(now / WINDOW_MS);
    $: msLeft = WINDOW_MS - (now % WINDOW_MS);
    $: countdown = formatCountdown(msLeft);

    function formatCountdown(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    }

    // Rebuild the board only when the 15-minute window changes (or once the DB loads).
    function refreshIfNeeded(db, wIdx) {
        if (!db || builtWindow === wIdx) return;
        builtWindow = wIdx;
        offers = buildOffers(db, wIdx);
        // New rotation → wipe the claim ledger. Same rotation (e.g. reload) → keep it.
        if (get(tradeMarket).window !== wIdx) {
            tradeMarket.set({ window: wIdx, claimed: {} });
            saveGame();
        }
    }

    function tick() {
        now = Date.now();
        refreshIfNeeded(getDB(), Math.floor(now / WINDOW_MS));
    }

    onMount(() => {
        tick();
        timer = setInterval(tick, 1000);
    });
    onDestroy(() => { if (timer) clearInterval(timer); });

    // === Fodder (cards eligible to feed a trade) ===
    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
    $: academyIds = new Set(['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => $academy[r]).filter(Boolean).map(c => c.uniqueId));

    // Squad, Academy, locked, holographic, signature and Legacy/Award cards are all protected.
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
    function labelFor(tier) { return tier === 'SPECIAL' ? 'Legacy / Award' : tier; }
    function colorFor(tier) {
        return ALL_SPECIAL.includes(tier) ? (TIER_COLORS[tier] || '#fbbf24') : (TIER_COLORS[tier] || '#94a3b8');
    }

    function requestTrade(offer) {
        if (claimed[offer.key]) return;
        if (fodder.length < offer.cardCost) {
            showToast(`Need ${offer.cardCost} spare (non-Legacy, unlocked) cards. You have ${fodder.length}.`, 'error');
            return;
        }
        if (get(blueEssence) < offer.beCost) {
            showToast(`Need ${offer.beCost.toLocaleString()} BE to sign this player.`, 'error');
            return;
        }
        openConfirmModal(
            `Sign ${offer.card.name} (${offer.card.quality})? This consumes ${offer.cardCost} of your lowest-rated spare cards and ${offer.beCost.toLocaleString()} BE.`,
            () => doTrade(offer)
        );
    }

    function doTrade(offer) {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        // Reject a listing that has rotated off the board (e.g. the confirm modal was held
        // open across a 15-minute boundary) — only current listings are signable.
        if (!offers.some(o => o.key === offer.key)) {
            showToast('That listing just rotated off the board.', 'error');
            return;
        }
        if (get(tradeMarket).claimed[offer.key]) { showToast('Already signed — wait for the next rotation.', 'error'); return; }
        if (fodder.length < offer.cardCost || get(blueEssence) < offer.beCost) {
            showToast('Trade no longer available.', 'error');
            return;
        }

        const consume = fodder.slice(0, offer.cardCost);
        const consumeIds = new Set(consume.map(c => c.uniqueId));
        const newCard = { ...offer.card, uniqueId: makeUniqueId('trade_'), signature: false, holographic: false };

        blueEssence.update(v => v - offer.beCost);
        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        trackStats.update(s => ({ ...s, soldCount: (s.soldCount || 0) + offer.cardCost, tradesDone: (s.tradesDone || 0) + 1 }));
        tradeMarket.update(tm => ({ window: builtWindow, claimed: { ...tm.claimed, [offer.key]: true } }));

        playSound('rare');
        resultCard = newCard;
        resultTradeColor = colorFor(newCard.quality);
        showResult = true;
        saveGame();
        showToast(`Signed ${newCard.name} (${newCard.quality})!`, 'success');
    }

    function closeResult() { showResult = false; resultCard = null; }
</script>

<section class="trade-page">
    <div class="trade-head">
        <div>
            <h2 class="trade-title">Transfer Market</h2>
            <p class="trade-desc">Rotating signings — <b>you see exactly who you're trading for</b>. Feed in your spare cards plus Blue Essence to sign a listed player. The board is randomised and refreshes every 15 minutes.</p>
        </div>
        <div class="trade-side">
            <div class="trade-timer">
                <span class="tt-label">Next rotation</span>
                <span class="tt-val"><span class="live-dot"></span>{countdown}</span>
            </div>
            <div class="trade-bank">
                <span class="tb-label">Your BE</span>
                <span class="tb-val">💎 {$blueEssence.toLocaleString()}</span>
            </div>
        </div>
    </div>

    {#if offers.length === 0}
        <div class="trade-empty">Loading the transfer board…</div>
    {:else}
        <div class="trade-grid">
            {#each offers as offer (offer.key)}
                {@const enoughCards = fodder.length >= offer.cardCost}
                {@const enoughBE = $blueEssence >= offer.beCost}
                {@const isClaimed = !!claimed[offer.key]}
                {@const canDo = !isClaimed && enoughCards && enoughBE}
                {@const consume = fodder.slice(0, offer.cardCost)}
                <div class="offer" class:offer-claimed={isClaimed} style="--accent: {colorFor(offer.card.quality)};">
                    <div class="offer-card-wrap">
                        <Card card={offer.card} mini />
                        {#if isClaimed}<div class="offer-signed-stamp">✓ Signed</div>{/if}
                    </div>

                    <div class="offer-cost">
                        <div class="offer-cost-row">
                            <span class="oc-label">Trade in</span>
                            <span class="oc-val" class:oc-short={!enoughCards}>{offer.cardCost} cards ({fodder.length} spare)</span>
                        </div>
                        <div class="offer-cost-row">
                            <span class="oc-label">Cost</span>
                            <span class="oc-val" class:oc-short={!enoughBE}>💎 {offer.beCost.toLocaleString()} BE</span>
                        </div>
                        {#if enoughCards}
                            <div class="offer-fodder">
                                {#each tierSummary(consume) as { tier, n }}
                                    <span class="offer-chip" style="color: {TIER_COLORS[tier] || '#94a3b8'};">{n}× {tier}</span>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <button class="offer-btn" disabled={!canDo} on:click={() => requestTrade(offer)}>
                        {#if isClaimed}
                            ✓ Signed this rotation
                        {:else if !enoughCards}
                            Need {offer.cardCost - fodder.length} more spare cards
                        {:else if !enoughBE}
                            Not enough BE
                        {:else}
                            Sign {offer.card.name} →
                        {/if}
                    </button>
                </div>
            {/each}
        </div>
    {/if}

    <div class="trade-note">
        Squad, Academy, locked, holographic, signature and Legacy/Award cards are always protected — only your lowest-rated spare cards are consumed. Signings are never holographic or signature.
    </div>
</section>

<!-- Signing Overlay -->
{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result-overlay" on:click={closeResult}>
    <div class="result-label" style="color: {resultTradeColor};">Signing Complete!</div>
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

    .trade-side { display: flex; gap: 10px; align-items: stretch; }
    .trade-timer, .trade-bank { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 18px; border-radius: 12px; }
    .trade-timer { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.22); }
    .trade-bank { background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.2); }
    .tt-label, .tb-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .tt-val { font-size: 16px; font-weight: 900; color: #fbbf24; font-variant-numeric: tabular-nums; display: flex; align-items: center; gap: 6px; }
    .tb-val { font-size: 16px; font-weight: 900; color: #60a5fa; }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 6px #34d399; animation: live-pulse 1.6s ease-in-out infinite; }
    @keyframes live-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }

    .trade-empty { text-align: center; color: #475569; font-size: 13px; font-style: italic; padding: 60px 0; }

    .trade-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; justify-items: center; }
    .offer {
        width: 100%; max-width: 240px;
        border: 1px solid rgba(148,163,184,0.12); border-top: 3px solid var(--accent);
        border-radius: 16px; padding: 16px 14px;
        background: linear-gradient(165deg, color-mix(in srgb, var(--accent) 10%, transparent) 0%, rgba(12,16,28,0.6) 55%);
        display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .offer-claimed { opacity: 0.5; }

    .offer-card-wrap { position: relative; }
    .offer-signed-stamp {
        position: absolute; inset: 0; margin: auto; height: fit-content; width: fit-content;
        padding: 6px 14px; border-radius: 8px; transform: rotate(-12deg);
        background: rgba(15,23,42,0.85); border: 2px solid #34d399; color: #34d399;
        font-size: 14px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;
    }

    .offer-cost { width: 100%; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; background: rgba(15,23,42,0.4); }
    .offer-cost-row { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
    .oc-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .oc-val { font-weight: 900; color: #e2e8f0; }
    .oc-short { color: #f87171; }
    .offer-fodder { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
    .offer-chip { font-size: 9px; font-weight: 800; background: rgba(0,0,0,0.25); border: 1px solid rgba(148,163,184,0.12); border-radius: 100px; padding: 2px 8px; }

    .offer-btn {
        width: 100%; margin-top: auto; padding: 12px 10px; border-radius: 12px; border: none;
        font-size: 12px; font-weight: 900; letter-spacing: 0.2px; cursor: pointer;
        background: var(--accent); color: #0b1220; transition: transform 0.12s, box-shadow 0.12s;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .offer-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
    .offer-btn:disabled { background: rgba(30,41,59,0.6); color: #475569; cursor: not-allowed; }

    .trade-note { margin-top: 24px; text-align: center; font-size: 10px; color: #334155; font-style: italic; line-height: 1.5; }

    /* Signing overlay */
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
