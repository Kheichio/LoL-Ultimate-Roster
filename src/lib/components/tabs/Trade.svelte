<script>
    import { onMount, onDestroy } from 'svelte';
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import { club, squad, academy, blueEssence, trackStats, collectionRegistry, tradeMarket, skills, saveGame } from '../../stores/game.js';
    import { tradeMastery, tradePrice } from '../../utils/skillEffects.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, getEffectiveRating, getSellValue, ALL_SPECIAL, TIER_COLORS, makeUniqueId } from '../../utils/cards.js';
    import { poolForTier } from '../../utils/packs.js';
    import { get } from 'svelte/store';

    // ═══════════════════════════════════════════════════════════════════════════
    //  TRANSFER MARKET — two boards, both rebuilt every 15 minutes from a seed, so a rotation
    //  is identical across reloads and rebuilds itself the moment the window flips.
    //
    //   SIGNINGS  real, fully-visible players you buy with spare cards + Blue Essence. Priced to
    //             beat chasing the same tier in packs (an Elite pack's Master costs ~4,000 BE in
    //             expectation), because here you pick exactly who you get. One listing per
    //             rotation is a Hot Deal, and the board can be re-rolled twice per rotation.
    //   REQUESTS  clubs that want one of your spare cards of a given tier and role, paying 3-6x
    //             its Quick Sell value. The outlet for duplicates that used to sell for pennies.
    //
    //  Squad, Academy, locked, holographic, signature and Legacy/Award cards are never touched.
    // ═══════════════════════════════════════════════════════════════════════════
    const WINDOW_MS = 15 * 60 * 1000;
    const OFFER_COUNT = 6;              // signings per rotation, before Trade Mastery
    const DEAL_OFF = 0.35;              // the Hot Deal's BE discount (it also costs one card fewer)
    const REROLL_COST = [300, 600];     // BE for the 1st / 2nd re-roll of a rotation
    const REQUEST_BASE = 3;             // club requests per rotation, before Trade Mastery

    const MARKET_DROPS = [
        { tier: 'Gold', pct: 14 },
        { tier: 'Platinum', pct: 22 },
        { tier: 'Diamond', pct: 24 },
        { tier: 'Master', pct: 18 },
        { tier: 'Grandmaster', pct: 12 },
        { tier: 'Challenger', pct: 7 },
        { tier: 'SPECIAL', pct: 3 },
    ];

    // Spare cards fed in + Blue Essence, by tier. Any Legacy/Award quality is SPECIAL.
    const TIER_COST = {
        Gold:        { cardCost: 2, beCost: 250 },
        Platinum:    { cardCost: 3, beCost: 600 },
        Diamond:     { cardCost: 3, beCost: 1500 },
        Master:      { cardCost: 4, beCost: 3800 },
        Grandmaster: { cardCost: 5, beCost: 9500 },
        Challenger:  { cardCost: 6, beCost: 21000 },
        SPECIAL:     { cardCost: 8, beCost: 42000 },
    };

    // What clubs ask for, and how many times the card's Quick Sell value they pay.
    const REQUEST_TIERS = [
        { tier: 'Silver', pct: 16, mult: 6 },
        { tier: 'Gold', pct: 24, mult: 5 },
        { tier: 'Platinum', pct: 24, mult: 4.5 },
        { tier: 'Diamond', pct: 18, mult: 4 },
        { tier: 'Master', pct: 12, mult: 3.5 },
        { tier: 'Grandmaster', pct: 6, mult: 3 },
    ];
    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function rollSeeded(drops, rng) {
        const total = drops.reduce((s, d) => s + d.pct, 0);
        let r = rng() * total;
        for (const d of drops) { r -= d.pct; if (r < 0) return d; }
        return drops[drops.length - 1];
    }
    const costForCard = (card) => TIER_COST[ALL_SPECIAL.includes(card.quality) ? 'SPECIAL' : card.quality] || TIER_COST.Gold;

    // Trade Mastery's extra listings are drawn further along the same seeded sequence, so
    // levelling mid-rotation ADDS listings and never reshuffles the ones already showing.
    function buildOffers(db, windowIndex, rerolls, count) {
        const rng = mulberry32((windowIndex * 2654435761 + rerolls * 40503) >>> 0);
        const offers = [];
        const usedIds = new Set();
        let guard = 0;
        while (offers.length < count && guard < count * 60) {
            guard++;
            const { tier } = rollSeeded(MARKET_DROPS, rng);
            const pool = poolForTier(db, tier, { includeCoach: false });
            if (!pool.length) continue;
            const pick = pool[Math.floor(rng() * pool.length)];
            if (usedIds.has(pick.id)) continue;
            usedIds.add(pick.id);
            offers.push({
                key: pick.id,
                card: { ...pick, uniqueId: `trade_view_${windowIndex}_${pick.id}`, signature: false, holographic: false },
                ...costForCard(pick),
                deal: false,
            });
        }
        // The Hot Deal is always one of the first six, so it never depends on Trade Mastery.
        if (offers.length) offers[Math.floor(rng() * Math.min(OFFER_COUNT, offers.length))].deal = true;
        return offers;
    }

    function buildRequests(db, windowIndex, count) {
        const rng = mulberry32((windowIndex * 2246822519 + 17) >>> 0);
        const clubs = [...new Set(db.filter(c => Number(c.year) >= 2025 && !ALL_SPECIAL.includes(c.quality)).map(c => c.team))].sort();
        const out = [];
        for (let i = 0; i < count; i++) {
            const t = rollSeeded(REQUEST_TIERS, rng);
            const role = rng() < 0.3 ? 'ANY' : ROLES[Math.floor(rng() * ROLES.length)];
            out.push({ key: `req_${windowIndex}_${i}`, club: clubs.length ? clubs[Math.floor(rng() * clubs.length)] : 'A club', tier: t.tier, role, mult: t.mult });
        }
        return out;
    }

    // === Clock + boards ===
    let now = Date.now();
    let offers = [];
    let requests = [];
    let builtKey = '';
    let timer = null;

    $: windowIndex = Math.floor(now / WINDOW_MS);
    $: msLeft = WINDOW_MS - (now % WINDOW_MS);
    $: countdown = `${String(Math.floor(msLeft / 60000)).padStart(2, '0')}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0')}`;
    $: windowPct = 1 - msLeft / WINDOW_MS;

    $: tradeLevel = $skills.trading || 0;
    $: transferLevel = $skills.transfer || 0;
    $: mastery = tradeMastery(tradeLevel);
    $: listingCount = OFFER_COUNT + mastery.extraListings;
    $: requestCount = REQUEST_BASE + (tradeLevel >= 3 ? 1 : 0) + (tradeLevel >= 5 ? 1 : 0);
    $: claimed = $tradeMarket.claimed || {};
    $: sold = $tradeMarket.sold || {};
    $: rerolls = $tradeMarket.window === windowIndex ? ($tradeMarket.rerolls || 0) : 0;
    $: rerollCost = REROLL_COST[rerolls] ?? null;

    function refreshIfNeeded() {
        const db = getDB();
        const wIdx = Math.floor(Date.now() / WINDOW_MS);
        if (!db) return;
        // New rotation → fresh ledgers. Same rotation (a reload) → keep them.
        if (get(tradeMarket).window !== wIdx) {
            tradeMarket.set({ window: wIdx, claimed: {}, sold: {}, rerolls: 0 });
            saveGame();
        }
        const rr = get(tradeMarket).rerolls || 0;
        const key = `${wIdx}:${rr}:${listingCount}:${requestCount}`;
        if (key === builtKey) return;
        builtKey = key;
        offers = buildOffers(db, wIdx, rr, listingCount);
        requests = buildRequests(db, wIdx, requestCount);
    }
    // Trade Mastery levelled while the page is open: grow the boards straight away.
    $: listingCount, requestCount, refreshIfNeeded();

    function tick() { now = Date.now(); refreshIfNeeded(); }
    onMount(() => { tick(); timer = setInterval(tick, 1000); });
    onDestroy(() => { if (timer) clearInterval(timer); });

    // === Spare cards ===
    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
    $: academyIds = new Set(ROLES.map(r => $academy[r]).filter(Boolean).map(c => c.uniqueId));
    $: fodder = $club
        .filter(c => !activeSquadIds.has(c.uniqueId) && !academyIds.has(c.uniqueId) &&
            !c.locked && !c.signature && !c.holographic && !ALL_SPECIAL.includes(c.quality))
        .sort((a, b) => getEffectiveRating(a) - getEffectiveRating(b));

    // === Signings ===
    let roleFilter = 'ALL';
    $: priced = offers.map(o => {
        const p = tradePrice(o.cardCost, o.beCost, tradeLevel);
        const cardCost = o.deal ? Math.max(1, p.cardCost - 1) : p.cardCost;
        const beCost = o.deal ? Math.round((p.beCost * (1 - DEAL_OFF)) / 10) * 10 : p.beCost;
        return { ...o, cardCost, beCost, baseCardCost: o.cardCost, baseBeCost: o.beCost };
    });
    $: shownOffers = roleFilter === 'ALL' ? priced : priced.filter(o => o.card.role === roleFilter);
    $: openCount = priced.filter(o => !claimed[o.key]).length;

    const labelFor = (q) => (ALL_SPECIAL.includes(q) ? 'Legacy / Award' : q);
    const colorFor = (q) => TIER_COLORS[q] || (ALL_SPECIAL.includes(q) ? '#fbbf24' : '#94a3b8');
    function tierSummary(cards) {
        const counts = {};
        cards.forEach(c => { counts[c.quality] = (counts[c.quality] || 0) + 1; });
        return Object.entries(counts).map(([tier, n]) => ({ tier, n }));
    }

    let showResult = false;
    let resultCard = null;
    let resultColor = '#f59e0b';

    function requestTrade(offer) {
        if (claimed[offer.key]) return;
        if (fodder.length < offer.cardCost) { showToast(`Need ${offer.cardCost} spare cards. You have ${fodder.length}.`, 'error'); return; }
        if (get(blueEssence) < offer.beCost) { showToast(`Need ${offer.beCost.toLocaleString()} BE to sign this player.`, 'error'); return; }
        openConfirmModal(
            `Sign ${offer.card.name} (${labelFor(offer.card.quality)})? This uses ${offer.cardCost} of your lowest-rated spare cards and ${offer.beCost.toLocaleString()} BE.`,
            () => doTrade(offer)
        );
    }

    function doTrade(offer) {
        if (!getDB()) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        // A listing that rotated off while the confirm was open is no longer signable.
        if (!priced.some(o => o.key === offer.key)) { showToast('That listing just rotated off the board.', 'error'); return; }
        if (get(tradeMarket).claimed[offer.key]) { showToast('Already signed — wait for the next rotation.', 'error'); return; }
        if (fodder.length < offer.cardCost || get(blueEssence) < offer.beCost) { showToast('Trade no longer available.', 'error'); return; }

        const consumeIds = new Set(fodder.slice(0, offer.cardCost).map(c => c.uniqueId));
        const newCard = { ...offer.card, uniqueId: makeUniqueId('trade_'), signature: false, holographic: false };
        blueEssence.update(v => v - offer.beCost);
        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        trackStats.update(s => ({ ...s, soldCount: (s.soldCount || 0) + offer.cardCost, tradesDone: (s.tradesDone || 0) + 1 }));
        tradeMarket.update(tm => ({ ...tm, claimed: { ...tm.claimed, [offer.key]: true } }));

        playSound('rare');
        resultCard = newCard;
        resultColor = colorFor(newCard.quality);
        showResult = true;
        saveGame();
        showToast(`Signed ${newCard.name} (${labelFor(newCard.quality)})!`, 'success');
    }

    function reroll() {
        if (rerollCost === null) return;
        if (get(blueEssence) < rerollCost) { showToast(`Re-rolling costs ${rerollCost} BE.`, 'error'); return; }
        openConfirmModal(`Re-roll the signings for ${rerollCost} BE? Every listing on the board is replaced (club requests stay).`, () => {
            if (get(tradeMarket).window !== Math.floor(Date.now() / WINDOW_MS)) { showToast('The board just rotated — it is already fresh.', 'info'); return; }
            const cost = REROLL_COST[get(tradeMarket).rerolls || 0];
            if (cost == null || get(blueEssence) < cost) return;
            blueEssence.update(v => v - cost);
            tradeMarket.update(tm => ({ ...tm, rerolls: (tm.rerolls || 0) + 1 }));
            saveGame();
            refreshIfNeeded();
            playSound('pack');
            showToast('New signings on the board.', 'success');
        });
    }

    // === Club requests ===
    $: pricedRequests = requests.map(r => {
        const pay = Math.round((getSellValue(r.tier, null, transferLevel) * r.mult) / 5) * 5;
        const quick = getSellValue(r.tier, null, transferLevel);
        const match = fodder.find(c => c.quality === r.tier && (r.role === 'ANY' || c.role === r.role)) || null;
        const have = fodder.filter(c => c.quality === r.tier && (r.role === 'ANY' || c.role === r.role)).length;
        return { ...r, pay, quick, match, have };
    });
    $: requestsOpen = pricedRequests.filter(r => !sold[r.key] && r.match).length;

    function fillRequest(r) {
        if (sold[r.key] || !r.match) return;
        openConfirmModal(`Sell ${r.match.name} (${r.tier} ${r.match.role}) to ${r.club} for ${r.pay.toLocaleString()} BE? Quick Sell would pay ${r.quick.toLocaleString()}.`, () => {
            if (get(tradeMarket).sold?.[r.key]) return;
            if (!requests.some(x => x.key === r.key)) { showToast('That request just expired.', 'error'); return; }
            const card = get(club).find(c => c.uniqueId === r.match.uniqueId);
            if (!card || !fodder.some(c => c.uniqueId === card.uniqueId)) { showToast('That card is no longer available.', 'error'); return; }
            club.update(c => c.filter(x => x.uniqueId !== card.uniqueId));
            blueEssence.update(v => v + r.pay);
            trackStats.update(s => ({ ...s, soldCount: (s.soldCount || 0) + 1, soldBE: (s.soldBE || 0) + r.pay }));
            tradeMarket.update(tm => ({ ...tm, sold: { ...(tm.sold || {}), [r.key]: true } }));
            saveGame();
            playSound('claim');
            showToast(`${r.club} signed ${card.name}. +${r.pay.toLocaleString()} BE`, 'success');
        });
    }
</script>

<section class="tm">
    <!-- ── Hero ── -->
    <header class="hero">
        <div class="hero-glow" aria-hidden="true"></div>
        <div class="hero-text">
            <span class="eyebrow"><Icon name="trade" size={13} stroke={2.2} /> Transfer Market</span>
            <h2 class="title">Buy who you want. Sell what you don't.</h2>
            <p class="sub">Sign real players with spare cards and Blue Essence, and sell duplicates to clubs that pay far more than Quick Sell. Both boards change every 15 minutes.</p>
            <div class="chips">
                {#if tradeLevel > 0}
                    <span class="chip chip-on"><Icon name="skills" size={12} stroke={2.2} /> Trade Mastery {tradeLevel} · {listingCount} signings · {requestCount} requests{mastery.cardDiscount ? ` · −${mastery.cardDiscount} card${mastery.cardDiscount === 1 ? '' : 's'}` : ''} · −{Math.round(mastery.beDiscount * 100)}% BE</span>
                {:else}
                    <span class="chip">Trade Mastery in Skills adds listings and requests and cuts every price.</span>
                {/if}
            </div>
        </div>
        <div class="hero-side">
            <div class="clock" style="--p: {windowPct};">
                <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ck-bg" cx="50" cy="50" r="44" /><circle class="ck-fg" cx="50" cy="50" r="44" style="stroke-dasharray: {windowPct * 276.5} 276.5;" /></svg>
                <span class="ck-n">{countdown}</span>
                <span class="ck-l">next board</span>
            </div>
            <div class="bank">
                <div class="bank-row"><span class="bk-l">Blue Essence</span><span class="bk-v bk-be"><Icon name="gem" size={14} stroke={2.2} /> {$blueEssence.toLocaleString()}</span></div>
                <div class="bank-row"><span class="bk-l">Spare cards</span><span class="bk-v">{fodder.length.toLocaleString()}</span></div>
                <div class="bank-row"><span class="bk-l">Signings left</span><span class="bk-v">{openCount} / {priced.length}</span></div>
            </div>
        </div>
    </header>

    <!-- ── Signings ── -->
    <section class="block">
        <div class="block-head">
            <div class="bh-text">
                <h3 class="bh-title"><Icon name="cards" size={16} /> Signings</h3>
                <p class="bh-sub">You see exactly who you are signing. Your lowest-rated spare cards are used first.</p>
            </div>
            <div class="bh-tools">
                <div class="roles" role="group" aria-label="Filter by role">
                    <button class="rf" class:rf-on={roleFilter === 'ALL'} on:click={() => (roleFilter = 'ALL')}>All</button>
                    {#each ROLES as r}
                        <button class="rf" class:rf-on={roleFilter === r} on:click={() => (roleFilter = r)} title={r}><img src={ROLE_ICONS[r]} alt={r}></button>
                    {/each}
                </div>
                <button class="reroll" disabled={rerollCost === null || $blueEssence < (rerollCost || 0)} on:click={reroll}>
                    <Icon name="trend" size={14} stroke={2.2} />
                    {rerollCost === null ? 'No re-rolls left' : `Re-roll · ${rerollCost} BE`}
                </button>
            </div>
        </div>

        {#if !offers.length}
            <div class="empty">Loading the transfer board…</div>
        {:else if !shownOffers.length}
            <div class="empty">No {roleFilter} players on the board this rotation.</div>
        {:else}
            <div class="grid">
                {#each shownOffers as offer (offer.key)}
                    {@const enoughCards = fodder.length >= offer.cardCost}
                    {@const enoughBE = $blueEssence >= offer.beCost}
                    {@const isClaimed = !!claimed[offer.key]}
                    {@const canDo = !isClaimed && enoughCards && enoughBE}
                    <div class="offer" class:offer-claimed={isClaimed} class:offer-deal={offer.deal && !isClaimed} style="--accent: {colorFor(offer.card.quality)};">
                        {#if offer.deal && !isClaimed}<span class="deal"><Icon name="flame" size={12} stroke={2.4} /> Hot deal −{Math.round(DEAL_OFF * 100)}%</span>{/if}
                        <div class="offer-card">
                            <Card card={offer.card} mini />
                            {#if isClaimed}<div class="stamp">Signed</div>{/if}
                        </div>
                        <div class="cost">
                            <div class="cost-row">
                                <span class="cl">Spare cards</span>
                                <span class="cv" class:short={!enoughCards}>{#if offer.cardCost < offer.baseCardCost}<s>{offer.baseCardCost}</s>{/if}{offer.cardCost}</span>
                            </div>
                            <div class="cost-row">
                                <span class="cl">Blue Essence</span>
                                <span class="cv" class:short={!enoughBE}>{#if offer.beCost < offer.baseBeCost}<s>{offer.baseBeCost.toLocaleString()}</s>{/if}{offer.beCost.toLocaleString()}</span>
                            </div>
                            {#if enoughCards && !isClaimed}
                                <div class="uses">
                                    {#each tierSummary(fodder.slice(0, offer.cardCost)) as { tier, n }}
                                        <span class="use" style="--c: {colorFor(tier)};">{n}× {tier}</span>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                        <button class="go" disabled={!canDo} on:click={() => requestTrade(offer)}>
                            {#if isClaimed}Signed this rotation
                            {:else if !enoughCards}Need {offer.cardCost - fodder.length} more spare
                            {:else if !enoughBE}Need {(offer.beCost - $blueEssence).toLocaleString()} BE
                            {:else}Sign {offer.card.name}{/if}
                        </button>
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    <!-- ── Club requests ── -->
    <section class="block">
        <div class="block-head">
            <div class="bh-text">
                <h3 class="bh-title"><Icon name="coins" size={16} /> Club requests <span class="bh-badge" class:bh-badge-on={requestsOpen > 0}>{requestsOpen} you can fill</span></h3>
                <p class="bh-sub">Clubs looking for a player of a certain tier and role. They pay several times Quick Sell, and take your lowest-rated match.</p>
            </div>
        </div>
        <div class="reqs">
            {#each pricedRequests as r (r.key)}
                {@const done = !!sold[r.key]}
                <div class="req" class:req-done={done} class:req-ready={!done && r.match} style="--accent: {colorFor(r.tier)};">
                    <div class="req-top">
                        <span class="req-club">{r.club}</span>
                        <span class="req-x">×{r.mult} Quick Sell</span>
                    </div>
                    <div class="req-want">
                        {#if r.role !== 'ANY'}<img src={ROLE_ICONS[r.role]} alt="">{/if}
                        <span>Wants a <b style="color: {colorFor(r.tier)};">{r.tier}</b> {r.role === 'ANY' ? 'player, any role' : r.role}</span>
                    </div>
                    <div class="req-pay"><Icon name="gem" size={15} stroke={2.2} /> {r.pay.toLocaleString()} <span>BE</span></div>
                    <div class="req-match">
                        {#if done}
                            <span class="rm-done"><Icon name="check" size={13} stroke={2.6} /> Deal done</span>
                        {:else if r.match}
                            <span class="rm-card">{r.match.name} · {r.match.team} {r.match.year} · {getEffectiveRating(r.match)}</span>
                            <span class="rm-have">{r.have} eligible in your club</span>
                        {:else}
                            <span class="rm-none">No spare {r.tier} {r.role === 'ANY' ? '' : r.role} card in your club</span>
                        {/if}
                    </div>
                    <button class="req-go" disabled={done || !r.match} on:click={() => fillRequest(r)}>
                        {done ? 'Sold' : r.match ? `Sell for ${r.pay.toLocaleString()} BE` : 'Nothing to sell'}
                    </button>
                </div>
            {/each}
        </div>
    </section>

    <p class="note">
        Protected, always: your squad, your Academy, and every locked, holographic, signature and Legacy/Award card. Signings are never holographic or signature.
    </p>
</section>

{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result" on:click={() => (showResult = false)}>
    <div class="result-label" style="color: {resultColor};">Signing complete</div>
    <div class="result-card"><Card card={resultCard} /></div>
    <button class="result-btn" on:click|stopPropagation={() => (showResult = false)}>Continue</button>
</div>
{/if}

<style>
    .tm { display: flex; flex-direction: column; gap: 18px; padding-bottom: 40px; }

    /* ── Hero ── */
    .hero {
        position: relative; overflow: hidden; display: flex; gap: 24px; align-items: center; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(45,212,191,0.14), transparent 65%), linear-gradient(120deg, #08171a, #0b0e1a 60%);
        border: 1px solid rgba(45,212,191,0.25);
    }
    .hero-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(245,158,11,0.1), transparent 65%); }
    .hero-text { position: relative; flex: 1; min-width: 260px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #5eead4; }
    .title { font-size: clamp(22px, 2.8vw, 30px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 600px; line-height: 1.55; }
    .chips { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 100px; font-size: 11.5px; font-weight: 700; color: #94a3b8; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.35); }
    .chip-on { color: #fda4af; background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.32); font-weight: 800; }

    .hero-side { position: relative; display: flex; gap: 14px; align-items: center; }
    .clock { position: relative; width: 104px; height: 104px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
    .clock svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ck-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 8; }
    .ck-fg { fill: none; stroke: #2dd4bf; stroke-width: 8; stroke-linecap: round; filter: drop-shadow(0 0 5px rgba(45,212,191,0.5)); }
    .ck-n { position: relative; font-size: 20px; font-weight: 900; color: #ecfeff; font-variant-numeric: tabular-nums; }
    .ck-l { position: relative; font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #64748b; }
    .bank { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 16px; min-width: 190px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.15); }
    .bank-row { display: flex; justify-content: space-between; gap: 14px; align-items: center; }
    .bk-l { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .bk-v { display: inline-flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 900; color: #e2e8f0; font-variant-numeric: tabular-nums; }
    .bk-be { color: #7dd3fc; }

    /* ── Blocks ── */
    .block { display: flex; flex-direction: column; gap: 12px; }
    .block-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .bh-text { min-width: 240px; flex: 1; }
    .bh-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 900; color: #fff; }
    .bh-sub { font-size: 12.5px; color: #64748b; margin-top: 3px; }
    .bh-badge { font-size: 10.5px; font-weight: 900; padding: 2px 9px; border-radius: 100px; color: #64748b; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.35); }
    .bh-badge-on { color: #052e16; background: #34d399; border-color: #34d399; }
    .bh-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .roles { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.3); }
    .rf { display: flex; align-items: center; justify-content: center; min-width: 34px; height: 30px; padding: 0 9px; border-radius: 9px; border: none; cursor: pointer; background: transparent; color: #94a3b8; font-size: 12px; font-weight: 800; }
    .rf img { width: 16px; height: 16px; opacity: 0.55; }
    .rf:hover img, .rf-on img { opacity: 1; }
    .rf-on { background: rgba(45,212,191,0.18); color: #fff; }
    .reroll { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 12px; cursor: pointer; font-size: 12.5px; font-weight: 800; color: #fde68a; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); }
    .reroll:hover:not(:disabled) { background: rgba(245,158,11,0.2); }
    .reroll:disabled { color: #475569; background: rgba(2,6,23,0.4); border-color: rgba(71,85,105,0.3); cursor: not-allowed; }
    .empty { padding: 40px 0; text-align: center; font-size: 13px; color: #64748b; }

    /* ── Signings ── */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(214px, 1fr)); gap: 14px; }
    .offer {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 14px 14px; border-radius: 18px;
        background: linear-gradient(170deg, color-mix(in srgb, var(--accent) 12%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 55%);
        border: 1px solid color-mix(in srgb, var(--accent) 28%, rgba(71,85,105,0.25));
    }
    .offer-deal { border-color: rgba(251,146,60,0.65); box-shadow: 0 10px 30px rgba(251,146,60,0.14); }
    .offer-claimed { opacity: 0.5; }
    .deal { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); z-index: 2; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 100px; font-size: 10.5px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #f97316, #ef4444); box-shadow: 0 4px 12px rgba(239,68,68,0.35); }
    .offer-card { position: relative; }
    .stamp { position: absolute; inset: 0; margin: auto; height: fit-content; width: fit-content; padding: 6px 14px; border-radius: 8px; transform: rotate(-12deg); background: rgba(15,23,42,0.88); border: 2px solid #34d399; color: #34d399; font-size: 14px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
    .cost { width: 100%; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; background: rgba(2,6,23,0.45); }
    .cost-row { display: flex; justify-content: space-between; align-items: center; }
    .cl { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .cv { font-size: 13px; font-weight: 900; color: #e2e8f0; font-variant-numeric: tabular-nums; }
    .cv s { margin-right: 6px; color: #64748b; font-weight: 700; }
    .short { color: #f87171; }
    .uses { display: flex; flex-wrap: wrap; gap: 4px; }
    .use { font-size: 10px; font-weight: 800; color: var(--c); padding: 2px 8px; border-radius: 100px; background: rgba(0,0,0,0.25); border: 1px solid rgba(148,163,184,0.12); }
    .go { width: 100%; margin-top: auto; padding: 11px 10px; border-radius: 12px; border: none; cursor: pointer; font-size: 12.5px; font-weight: 900; color: #0b1220; background: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: transform 0.12s, box-shadow 0.12s; }
    .go:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
    .go:disabled { background: rgba(30,41,59,0.6); color: #64748b; cursor: not-allowed; }

    /* ── Requests ── */
    .reqs { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
    .req { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 18px; background: rgba(12,16,28,0.7); border: 1px solid rgba(71,85,105,0.3); }
    .req-ready { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 12%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 60%); }
    .req-done { opacity: 0.55; }
    .req-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .req-club { font-size: 14px; font-weight: 900; color: #fff; }
    .req-x { font-size: 10px; font-weight: 900; color: #34d399; padding: 2px 8px; border-radius: 100px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); white-space: nowrap; }
    .req-want { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #cbd5e1; }
    .req-want img { width: 18px; height: 18px; }
    .req-pay { display: flex; align-items: center; gap: 6px; font-size: 24px; font-weight: 900; color: #7dd3fc; font-variant-numeric: tabular-nums; }
    .req-pay span { font-size: 12px; color: #64748b; }
    .req-match { display: flex; flex-direction: column; gap: 2px; min-height: 34px; padding: 8px 10px; border-radius: 10px; background: rgba(2,6,23,0.45); }
    .rm-card { font-size: 12px; font-weight: 800; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rm-have { font-size: 10.5px; color: #64748b; }
    .rm-none { font-size: 12px; color: #64748b; }
    .rm-done { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: #34d399; }
    .req-go { padding: 10px; border-radius: 12px; border: none; cursor: pointer; font-size: 12.5px; font-weight: 900; color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); }
    .req-go:hover:not(:disabled) { filter: brightness(1.08); }
    .req-go:disabled { background: rgba(30,41,59,0.6); color: #64748b; cursor: not-allowed; }

    .note { text-align: center; font-size: 11.5px; color: #475569; line-height: 1.5; }

    /* ── Result ── */
    .result { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.9); backdrop-filter: blur(16px); }
    .result-label { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 24px; }
    .result-card { animation: reveal 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
    @keyframes reveal { from { opacity: 0; transform: scale(0.5) rotateY(90deg); } to { opacity: 1; transform: none; } }
    .result-btn { margin-top: 24px; padding: 12px 32px; border-radius: 12px; background: rgba(51,65,85,0.45); border: 1px solid rgba(71,85,105,0.3); color: #e2e8f0; font-size: 13px; font-weight: 800; cursor: pointer; }
    .result-btn:hover { background: rgba(51,65,85,0.65); }

    @media (max-width: 620px) {
        .hero { padding: 18px; }
        .hero-side { width: 100%; }
        .bank { flex: 1; min-width: 0; }
        .bh-tools { width: 100%; }
        .roles { flex: 1; justify-content: space-between; }
    }
</style>
