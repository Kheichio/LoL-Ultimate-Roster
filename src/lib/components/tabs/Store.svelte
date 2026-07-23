<script>
    import Card from '../card/Card.svelte';
    import { blueEssence, club, hasBoughtStarter, collectionRegistry, trackStats, skills, grantXP, grantBPXP, grantBE, saveGame, isClubFull, clubCapacity, bulkOpenMax, freePacks } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { inspectingCard } from '../../stores/ui.js';
    import { getDB, rollPackTier, makeUniqueId, getSellValue, AWARD_TIERS, MYTHIC_TIERS, TIER_COLORS } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    import { onDestroy } from 'svelte';

    let pulledCards = [];
    let pullTitle = '';
    let showPulls = false;
    let revealedCount = 0;
    let lockedCards = new Set();
    let previewPack = null;

    $: scoutLevel = $skills.scouting || 0;
    $: scoutBonus = scoutLevel * 0.25;

    // --- Limited-time Store events (boosted pack + discount + pity guarantee) ---
    const MSI_EVENT_END = new Date('2026-07-12T23:59:59Z').getTime();
    const MSI_PITY_TARGET = 70;
    const EWC_EVENT_END = new Date('2026-07-27T23:59:59Z').getTime();
    const EWC_PITY_TARGET = 100;
    let eventTimeLeft = '';
    let eventTimer = null;

    let msiPityCount = parseInt(localStorage.getItem('lur_msi_pity') || '0');
    let ewcPityCount = parseInt(localStorage.getItem('lur_ewc_pity') || '0');

    // Event registry keyed by the pack id it boosts. getMsiEventDrops / getEwcEventDrops
    // are hoisted function declarations, so referencing them here is safe.
    const EVENTS = {
        msi: { name: 'MSI 2026 Event', tier: 'MSI', end: MSI_EVENT_END, pity: MSI_PITY_TARGET, pityKey: 'lur_msi_pity', base: 5000, discount: 3500, color: '#2dd4bf', drops: getMsiEventDrops },
        ewc: { name: 'EWC 2026 Event', tier: 'EWC', end: EWC_EVENT_END, pity: EWC_PITY_TARGET, pityKey: 'lur_ewc_pity', base: 4000, discount: 3000, color: '#ffd24a', drops: getEwcEventDrops },
    };

    function currentEventEnd() {
        const now = Date.now();
        if (now < EWC_EVENT_END) return EWC_EVENT_END;
        if (now < MSI_EVENT_END) return MSI_EVENT_END;
        return 0;
    }

    // The event currently live (if any) — drives the banner. EWC wins if windows overlap.
    $: activeEvent = (() => {
        const now = Date.now();
        if (now < EWC_EVENT_END) return { ...EVENTS.ewc, pityCount: ewcPityCount };
        if (now < MSI_EVENT_END) return { ...EVENTS.msi, pityCount: msiPityCount };
        return null;
    })();

    function updateEventTimer() {
        const end = currentEventEnd();
        const remaining = Math.max(0, end - Date.now());
        if (end === 0 || remaining <= 0) { eventTimeLeft = 'Event Ended'; return; }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        eventTimeLeft = `${h}h ${m}m ${s}s`;
    }
    updateEventTimer();
    eventTimer = setInterval(updateEventTimer, 1000);
    onDestroy(() => { if (eventTimer) clearInterval(eventTimer); });

    const allPacks = [
        { id: 'standard', name: 'Standard', sub: 'Card Pack', cost: 100, count: 5,
          color: '#eab308', borderColor: 'rgba(234,179,8,0.2)', bg: 'linear-gradient(170deg, #1a1c10 0%, #14160a 60%, #1a1c10 100%)',
          drops: [{ tier: 'Gold', pct: 15 }, { tier: 'Silver', pct: 35 }, { tier: 'Bronze', pct: 50 }] },
        { id: 'premium', name: 'Premium', sub: 'Card Pack', cost: 600, count: 5,
          color: '#3b82f6', borderColor: 'rgba(59,130,246,0.2)', bg: 'linear-gradient(170deg, #0e1a3a 0%, #0a1230 60%, #101b40 100%)',
          drops: [{ tier: 'Diamond', pct: 3 }, { tier: 'Platinum', pct: 12 }, { tier: 'Gold', pct: 30 }, { tier: 'Silver', pct: 30 }, { tier: 'Bronze', pct: 25 }] },
        { id: 'elite', name: 'Elite', sub: 'Card Pack', cost: 1000, count: 5,
          color: '#a855f7', borderColor: 'rgba(168,85,247,0.2)', bg: 'linear-gradient(170deg, #1a0e3a 0%, #120a30 60%, #1c1040 100%)',
          drops: [{ tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 20 }, { tier: 'Platinum', pct: 30 }, { tier: 'Gold', pct: 25 }, { tier: 'Silver', pct: 20 }] },
        { id: 'firststand', name: 'First Stand', sub: 'Event Pack', cost: 3000, count: 5, special: true,
          color: '#fb923c', borderColor: 'rgba(251,146,60,0.2)', bg: 'linear-gradient(170deg, #1a1008 0%, #1c0f05 60%, #201208 100%)',
          drops: [{ tier: 'FirstStand', pct: 0.5 }, { tier: 'Challenger', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 26.5 }, { tier: 'Gold', pct: 50 }] },
        { id: 'ewc', name: 'EWC', sub: 'Event Pack', cost: 4000, count: 5, special: true,
          color: '#ffd24a', borderColor: 'rgba(255,210,74,0.25)', bg: 'linear-gradient(170deg, #1c1608 0%, #14110a 60%, #201a0c 100%)',
          drops: [{ tier: 'EWC', pct: 0.5 }, { tier: 'Challenger', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 26.5 }, { tier: 'Gold', pct: 50 }] },
        { id: 'msi', name: 'MSI', sub: 'Event Pack', cost: 5000, count: 5, special: true,
          color: '#2dd4bf', borderColor: 'rgba(45,212,191,0.2)', bg: 'linear-gradient(170deg, #042f2e 0%, #0a1f1e 60%, #0d2524 100%)',
          drops: [{ tier: 'MSI', pct: 0.5 }, { tier: 'Challenger', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 26.5 }, { tier: 'Gold', pct: 50 }] },
        { id: 'champion', name: 'Champion', sub: 'Legacy Pack', cost: 6000, count: 5, special: true,
          color: '#d97706', borderColor: 'rgba(217,119,6,0.2)', bg: 'linear-gradient(170deg, #1c1917 0%, #1a1510 60%, #201a0f 100%)',
          drops: [{ tier: 'Champion', pct: 0.5 }, { tier: 'Finalist', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 76.5 }] },
        { id: 'mvp', name: 'MVP', sub: 'Legacy Pack', cost: 8000, count: 5, special: true,
          color: '#ec4899', borderColor: 'rgba(236,72,153,0.2)', bg: 'linear-gradient(170deg, #1a0520 0%, #15031a 60%, #200828 100%)',
          drops: [{ tier: 'MVP', pct: 0.5 }, { tier: 'Challenger', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 76.5 }] },
        { id: 'awards', name: 'Awards Vault', sub: 'Limited Pack', cost: 12000, count: 5, special: true,
          color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', bg: 'linear-gradient(170deg, #1c1500 0%, #1a1200 60%, #231800 100%)',
          drops: [{ tier: 'Hall of Legends', pct: 0.001 }, { tier: 'POTY', pct: 0.1 }, { tier: 'TOTY', pct: 0.9 }, { tier: 'ROTY', pct: 2 }, { tier: 'Challenger', pct: 2 }, { tier: 'Grandmaster', pct: 5 }, { tier: 'Master', pct: 8 }, { tier: 'Diamond', pct: 20 }, { tier: 'Platinum', pct: 61.999 }] },
    ];

    const SPECIAL_QUALS = new Set(['Champion','MVP','Finalist','MSI','FirstStand','EWC','POTY','ROTY','TOTY','GPOTY','X','Hall of Legends']);

    // Award & mythic cards are drop-table exclusive — they must never fall out of a generic tier pool.
    const POOL_EXCLUDED = [...AWARD_TIERS, ...MYTHIC_TIERS];

    // Per-pack bulk quantity (pack id -> 1..$bulkOpenMax). Absent means 1.
    let packQty = {};

    function qtyOf(packId, max) {
        return Math.max(1, Math.min(max, packQty[packId] || 1));
    }

    function setQty(packId, n) {
        packQty = { ...packQty, [packId]: Math.max(1, Math.min(get(bulkOpenMax), n)) };
    }

    // Hall of Legends sits at 0.001% — a raw width would be an invisible sliver.
    function dropBarWidth(pct) {
        return Math.max(pct, 0.7);
    }

    // The preview modal buys whatever quantity is selected on that pack's card.
    $: previewQty = previewPack ? Math.max(1, Math.min($bulkOpenMax, packQty[previewPack.id] || 1)) : 1;

    // Free packs earned from Roster Building Challenges, resolved to their Store pack.
    $: freePackList = Object.entries($freePacks)
        .map(([id, count]) => ({ id, count: Number(count) || 0, pack: allPacks.find(p => p.id === id) }))
        .filter(x => x.pack && x.count > 0);

    function rollFromDrops(drops) {
        const rng = Math.random() * 100;
        let cumulative = 0;
        for (const d of drops) {
            cumulative += d.pct;
            if (rng < cumulative) return d.tier;
        }
        return drops[drops.length - 1].tier;
    }

    function getMsiEventDrops() {
        return [
            { tier: 'MSI', pct: 2 },
            { tier: 'Challenger', pct: 3 },
            { tier: 'Grandmaster', pct: 5 },
            { tier: 'Master', pct: 8 },
            { tier: 'Diamond', pct: 15 },
            { tier: 'Platinum', pct: 27 },
            { tier: 'Gold', pct: 40 },
        ];
    }

    function getEwcEventDrops() {
        return [
            { tier: 'EWC', pct: 2 },
            { tier: 'Challenger', pct: 3 },
            { tier: 'Grandmaster', pct: 5 },
            { tier: 'Master', pct: 8 },
            { tier: 'Diamond', pct: 15 },
            { tier: 'Platinum', pct: 27 },
            { tier: 'Gold', pct: 40 },
        ];
    }

    function getPackCost(pack) {
        const ev = EVENTS[pack.id];
        if (ev && Date.now() < ev.end) return ev.discount;
        return pack.cost;
    }

    function buyPack(pack, free = false, qty = 1) {
        if (get(isClubFull)) { showToast('Club is full! Sell cards or upgrade Clubhouse in Skills to make room.', 'error'); return; }
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }

        // Free packs always open exactly one — bulk applies to purchases only.
        let packs = free ? 1 : qtyOf(pack.id, get(bulkOpenMax));

        // Clamp the batch to what the club can hold. A single pack is allowed to spill over the
        // cap by up to count-1 cards, so a bulk open gets the same tolerance and no more.
        const room = get(clubCapacity) - get(club).length;
        const roomPacks = Math.max(1, Math.ceil(room / pack.count));
        if (packs > roomPacks) {
            packs = roomPacks;
            showToast(`Not enough club space — opening ${packs} pack${packs > 1 ? 's' : ''}.`, 'info');
        }

        if (free) {
            if ((get(freePacks)[pack.id] || 0) <= 0) { showToast('No free packs of that type.', 'error'); return; }
        } else {
            const cost = getPackCost(pack) * packs;
            if (get(blueEssence) < cost) { showToast('Not enough BE.', 'error'); return; }
            blueEssence.update(v => v - cost);
        }
        const pulled = [];
        const holoChance = 0.01;
        const sigChance = 0.001;
        const ev = free ? null : (EVENTS[pack.id] && Date.now() < EVENTS[pack.id].end ? EVENTS[pack.id] : null);
        const drops = ev ? ev.drops() : pack.drops;
        let pity = ev ? parseInt(localStorage.getItem(ev.pityKey) || '0') : 0;

        for (let p = 0; p < packs; p++) {
            // Reset per pack so the event guarantee fires once per pack, exactly as if the
            // player had clicked buy `packs` times in a row.
            let gotGuaranteed = false;
            for (let i = 0; i < pack.count; i++) {
                let tier;
                if (ev && !gotGuaranteed && pity >= ev.pity - 1) {
                    tier = ev.tier;
                    gotGuaranteed = true;
                } else {
                    tier = rollFromDrops(drops);
                }
                if (ev) {
                    if (tier === ev.tier) { pity = 0; gotGuaranteed = true; } else { pity++; }
                }
                let pool;
                if (SPECIAL_QUALS.has(tier)) {
                    pool = db.filter(p2 => p2.quality === tier);
                } else {
                    pool = db.filter(p2 => p2.quality === tier && !POOL_EXCLUDED.includes(p2.quality));
                }
                if (pool.length === 0) pool = db.filter(p2 => p2.quality === 'Bronze' || p2.quality === 'Silver');
                const pick = pool[Math.floor(Math.random() * pool.length)];
                const inst = { ...pick, uniqueId: makeUniqueId('pack_') };
                if (Math.random() < sigChance) { inst.signature = true; inst.locked = true; }
                if (Math.random() < holoChance) { inst.holographic = true; inst.locked = true; }
                pulled.push(inst);
            }
        }
        if (ev) {
            localStorage.setItem(ev.pityKey, String(pity));
            if (ev.tier === 'MSI') msiPityCount = pity;
            else if (ev.tier === 'EWC') ewcPityCount = pity;
        }

        // Consume exactly one free-pack credit for a free open.
        if (free) {
            freePacks.update(fp => {
                const n = (fp[pack.id] || 0) - 1;
                const u = { ...fp };
                if (n > 0) u[pack.id] = n; else delete u[pack.id];
                return u;
            });
        }

        club.update(c => [...c, ...pulled]);
        collectionRegistry.update(reg => {
            const updated = { ...reg };
            pulled.forEach(c => { updated[c.id] = true; });
            return updated;
        });
        saveGame();
        const holosPulled = pulled.filter(c => c.holographic).length;
        const sigsPulled = pulled.filter(c => c.signature).length;
        if (holosPulled || sigsPulled) {
            trackStats.update(s => ({
                ...s,
                holographicPulled: (s.holographicPulled || 0) + holosPulled,
                signaturesPulled: (s.signaturesPulled || 0) + sigsPulled,
            }));
        }
        trackStats.update(s => ({ ...s, packs: (s.packs || 0) + packs }));
        grantXP(50 * packs);
        grantBPXP(30 * packs);
        playSound(sigsPulled > 0 ? 'rare' : holosPulled > 0 ? 'rare' : 'pack');
        pulledCards = pulled;
        pullTitle = free ? `Free ${pack.name} Pack Opened!`
            : packs > 1 ? `${packs}x ${pack.name} Packs Opened!`
            : `${pack.name} Pack Opened!`;
        showPulls = true;
        revealedCount = 0;
        // Shrink the per-card delay as the batch grows so a 25-card open still finishes in
        // about the same ~2.2s a single pack takes today, one card at a time.
        const step = Math.min(450, Math.round(1800 / Math.max(1, pulled.length - 1)));
        pulled.forEach((_, i) => { setTimeout(() => { revealedCount = i + 1; }, 400 + i * step); });
    }

    function buyStarterPack() {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        if (get(hasBoughtStarter)) return;
        const roles = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
        const pulled = [];
        roles.forEach(role => {
            const tier = rollPackTier('starter');
            let pool = db.filter(p => p.role === role && (p.quality === tier || p.quality === 'Bronze' || p.quality === 'Silver'));
            if (pool.length === 0) pool = db.filter(p => p.role === role);
            const pick = pool[Math.floor(Math.random() * pool.length)];
            pulled.push({ ...pick, uniqueId: makeUniqueId('starter_') });
        });
        club.update(c => [...c, ...pulled]);
        collectionRegistry.update(reg => {
            const updated = { ...reg };
            pulled.forEach(c => { updated[c.id] = true; });
            return updated;
        });
        hasBoughtStarter.set(true);
        saveGame();
        playSound('rare');
        pulledCards = pulled;
        pullTitle = 'Starter Pack — Welcome!';
        showPulls = true;
        revealedCount = 0;
        pulled.forEach((_, i) => { setTimeout(() => { revealedCount = i + 1; }, 300 + i * 500); });
    }

    function togglePullLock(card) {
        if (lockedCards.has(card.uniqueId)) {
            lockedCards.delete(card.uniqueId);
        } else {
            lockedCards.add(card.uniqueId);
        }
        lockedCards = new Set(lockedCards);
    }

    function inspectPulled(card) {
        inspectingCard.set(card);
    }

    function sellUnlocked() {
        let totalBE = 0;
        let soldCount = 0;
        const keepIds = new Set(lockedCards);
        const toKeep = [];
        const toSell = [];
        pulledCards.forEach(c => {
            if (keepIds.has(c.uniqueId)) {
                toKeep.push(c);
            } else {
                const val = getSellValue(c.quality, c, $skills.transfer);
                totalBE += val;
                soldCount++;
                toSell.push(c);
            }
        });
        if (soldCount > 0) {
            club.update(cl => cl.filter(x => !toSell.some(s => s.uniqueId === x.uniqueId)));
            const earned = grantBE(totalBE).total;
            saveGame();
            showToast(`Sold ${soldCount} cards for ${earned} BE`, 'info');
        }
        showPulls = false;
        pulledCards = [];
        lockedCards = new Set();
    }

    function keepAll() {
        pulledCards.forEach(c => {
            if (lockedCards.has(c.uniqueId)) {
                const inst = $club.find(x => x.uniqueId === c.uniqueId);
                if (inst) inst.locked = true;
            }
        });
        if (lockedCards.size > 0) {
            club.update(c => [...c]);
            saveGame();
        }
        showPulls = false;
        pulledCards = [];
        lockedCards = new Set();
    }
</script>

<section class="store">
    <!-- Event Banner -->
    {#if activeEvent}
        <div class="event-banner event-active" style="--ev: {activeEvent.color};">
            <div class="eb-left">
                <span class="eb-live">LIVE</span>
                <div class="eb-info">
                    <div class="eb-title" style="color: {activeEvent.color};">{activeEvent.name}</div>
                    <div class="eb-desc" style="color: {activeEvent.color};">{activeEvent.tier} Pack {activeEvent.base.toLocaleString()} → <b>{activeEvent.discount.toLocaleString()} BE</b>, boosted drops, and a guaranteed {activeEvent.tier} card within {activeEvent.pity} pulls.</div>
                </div>
            </div>
            <div class="eb-right">
                <div class="eb-pity">
                    <span class="eb-pity-label">Pity Counter</span>
                    <span class="eb-pity-val" style="color: {activeEvent.color};">{activeEvent.pityCount}/{activeEvent.pity}</span>
                </div>
                <div class="eb-timer">
                    <span class="eb-timer-label">Ends in</span>
                    <span class="eb-timer-val">{eventTimeLeft}</span>
                </div>
            </div>
        </div>
    {:else}
        <div class="event-banner event-ended">
            <span class="eb-ended-icon">🏆</span>
            <div class="eb-info">
                <div class="eb-title" style="color: #475569;">Store Event</div>
                <div class="eb-desc" style="color: #334155;">No event running right now. Stay tuned for the next one!</div>
            </div>
            <span class="eb-ended-tag">Ended</span>
        </div>
    {/if}

    <!-- Starter Pack -->
    {#if !$hasBoughtStarter}
    <button class="starter" on:click={buyStarterPack}>
        <div class="starter-glow">
            <div class="starter-inner">
                <div>
                    <span class="starter-free">FREE</span>
                    <div class="starter-title">Starter Pack</div>
                    <div class="starter-desc">6 cards — one per role · Bronze & Silver</div>
                </div>
                <div class="starter-cta">Claim →</div>
            </div>
        </div>
    </button>
    {/if}

    <!-- Free Packs (earned from RBCs) -->
    {#if freePackList.length > 0}
    <div class="free-packs">
        <div class="fp-header">🎁 Free Packs <span class="fp-hint">— earned from Roster Building Challenges</span></div>
        <div class="fp-row">
            {#each freePackList as fp (fp.id)}
                <div class="fp-card" style="background: {fp.pack.bg}; border-color: {fp.pack.borderColor};">
                    <div class="fp-badge" style="color: {fp.pack.color}; border-color: {fp.pack.borderColor};">×{fp.count}</div>
                    <div class="fp-title">{fp.pack.name}</div>
                    <div class="fp-sub">{fp.pack.count} cards · Free</div>
                    <button class="fp-btn" style="background: {fp.pack.color};" on:click={() => buyPack(fp.pack, true)}>Open Free</button>
                </div>
            {/each}
        </div>
    </div>
    {/if}

    <!-- Packs Grid -->
    <div class="packs-header">Card Packs</div>
    <div class="packs-row">
        {#each allPacks as pack}
            {@const effectiveCost = getPackCost(pack)}
            {@const isDiscounted = effectiveCost < pack.cost}
            {@const qty = Math.max(1, Math.min($bulkOpenMax, packQty[pack.id] || 1))}
            {@const best = pack.drops[0]}
            {@const bestMythic = MYTHIC_TIERS.includes(best.tier)}
            <div class="pack" style="background: {pack.bg}; border-color: {pack.borderColor};">
                <div class="pack-foil"></div>
                <div class="pack-content">
                    <div class="pack-badge" style="color: {pack.color}; border-color: {pack.borderColor};">{pack.count * qty} CARDS</div>
                    <div class="pack-title">{pack.name}</div>
                    <div class="pack-sub">{pack.sub}</div>
                    <div class="pack-best" class:pack-best-mythic={bestMythic} style="color: {bestMythic ? TIER_COLORS[best.tier] : pack.color}; --tier: {TIER_COLORS[best.tier]};">Best: {best.tier} ({best.pct}%)</div>
                </div>
                {#if $bulkOpenMax > 1}
                    <div class="pack-qty">
                        <button class="pq-step" on:click={() => setQty(pack.id, qty - 1)} disabled={qty <= 1} aria-label="Fewer packs">−</button>
                        <span class="pq-val" style="color: {pack.color};">{qty}× pack</span>
                        <button class="pq-step" on:click={() => setQty(pack.id, qty + 1)} disabled={qty >= $bulkOpenMax} aria-label="More packs">+</button>
                    </div>
                {/if}
                <div class="pack-buttons">
                    <button class="pack-btn pack-buy" style="border-color: {pack.borderColor};" on:click={() => buyPack(pack, false, qty)}>
                        {#if isDiscounted}
                            <span class="pack-old-price">💎 {(pack.cost * qty).toLocaleString()}</span>
                            <span class="pack-new-price">💎 {(effectiveCost * qty).toLocaleString()} BE</span>
                        {:else}
                            💎 {(pack.cost * qty).toLocaleString()} BE
                        {/if}
                    </button>
                    <button class="pack-btn pack-preview-btn" style="border-color: {pack.borderColor}; color: {pack.color};" on:click={() => previewPack = pack}>Preview</button>
                </div>
            </div>
        {/each}
    </div>

    <!-- Pack Preview Modal -->
    {#if previewPack}
    <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="pv-overlay" on:click={() => previewPack = null}>
        <div class="pv-modal" on:click|stopPropagation>
            <button class="pv-close" on:click={() => previewPack = null}>✕</button>
            <h3 class="pv-title" style="color: {previewPack.color};">{previewPack.name} {previewPack.sub}</h3>
            <p class="pv-sub">{previewPack.count} cards per pack · 💎 {previewPack.cost.toLocaleString()} BE</p>

            <div class="pv-section">Drop Rates</div>
            <div class="pv-drops">
                {#each previewPack.drops as d}
                    {@const mythic = MYTHIC_TIERS.includes(d.tier)}
                    <div class="pv-drop" class:pvd-mythic={mythic} style="--tier: {TIER_COLORS[d.tier]};">
                        <span class="pvd-tier" style={mythic ? `color: ${TIER_COLORS[d.tier]};` : ''}>{d.tier}</span>
                        <div class="pvd-bar"><div class="pvd-fill" style="width: {dropBarWidth(d.pct)}%; background: {mythic ? TIER_COLORS[d.tier] : previewPack.color};"></div></div>
                        <span class="pvd-pct">{d.pct}%</span>
                    </div>
                {/each}
            </div>

            <div class="pv-section">Special Chances</div>
            <div class="pv-specials">
                <div class="pv-spec"><span class="pvs-label">Holographic</span><span class="pvs-val">1% per card</span></div>
                <div class="pv-spec"><span class="pvs-label">Signature</span><span class="pvs-val">0.1% per card</span></div>
            </div>

            {#if scoutLevel > 0}
                <div class="pv-section">Scouting Bonus (Lv {scoutLevel})</div>
                <div class="pv-scout">+{scoutBonus.toFixed(2)}% bonus to all drop rolls</div>
            {/if}

            <button class="pv-buy" style="background: {previewPack.color};" on:click={() => { buyPack(previewPack, false, previewQty); previewPack = null; }}>
                Buy {previewQty > 1 ? `${previewQty}× Packs` : 'Pack'} · 💎 {(previewPack.cost * previewQty).toLocaleString()} BE
            </button>
        </div>
    </div>
    {/if}
</section>

<!-- Pull Modal -->
{#if showPulls}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pull-overlay">
    <div class="pull-modal" on:click|stopPropagation>
        <div class="pull-header">{pullTitle}</div>
        <div class="pull-sub">{pulledCards.length} cards · Click a card to inspect · Lock cards you want to keep</div>

        <div class="pull-grid">
            {#each pulledCards as card, i}
                {#if i < revealedCount}
                    <div class="pull-card-slot pull-reveal">
                        <div class="pull-card-inner">
                            <Card {card} mini={true} onclick={() => inspectPulled(card)} />
                        </div>
                        <div class="pull-card-controls">
                            <button
                                class="pc-btn"
                                class:pc-locked={lockedCards.has(card.uniqueId)}
                                on:click={() => togglePullLock(card)}
                            >
                                {lockedCards.has(card.uniqueId) ? '🔒 Locked' : '🔓 Lock'}
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="pull-placeholder">
                        <span>?</span>
                    </div>
                {/if}
            {/each}
        </div>

        {#if revealedCount >= pulledCards.length}
            <div class="pull-actions">
                <button class="pa-btn pa-keep" on:click={keepAll}>
                    Send All to Club
                </button>
                <button class="pa-btn pa-sell" on:click={sellUnlocked}>
                    Sell Unlocked ({pulledCards.length - lockedCards.size}) · Keep Locked ({lockedCards.size})
                </button>
            </div>
        {/if}
    </div>
</div>
{/if}

<style>
    .store { padding-bottom: 40px; }

    /* Event */
    .event-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 14px 20px; border-radius: 14px; margin-bottom: 20px; flex-wrap: wrap;
    }
    .event-active {
        background: linear-gradient(135deg, color-mix(in srgb, var(--ev, #2dd4bf) 14%, transparent), color-mix(in srgb, var(--ev, #2dd4bf) 7%, transparent));
        border: 1px solid color-mix(in srgb, var(--ev, #2dd4bf) 35%, transparent);
        animation: eventPulse 3s ease-in-out infinite;
    }
    @keyframes eventPulse {
        0%, 100% { border-color: color-mix(in srgb, var(--ev, #2dd4bf) 30%, transparent); }
        50% { border-color: color-mix(in srgb, var(--ev, #2dd4bf) 60%, transparent); }
    }
    .event-ended {
        background: rgba(12,16,28,0.4); border: 1px solid rgba(51,65,85,0.15);
    }
    .eb-left { display: flex; align-items: center; gap: 10px; }
    .eb-live {
        padding: 3px 10px; border-radius: 6px; font-size: 9px; font-weight: 900;
        letter-spacing: 1.5px; background: #ef4444; color: white;
        animation: liveBlink 1.5s ease-in-out infinite;
    }
    @keyframes liveBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .eb-info {}
    .eb-title { font-size: 14px; font-weight: 900; color: #2dd4bf; }
    .eb-desc { font-size: 10px; color: #5eead4; margin-top: 2px; }
    .eb-right { display: flex; gap: 16px; align-items: center; }
    .eb-pity, .eb-timer {
        text-align: center; padding: 6px 14px; border-radius: 8px;
        background: rgba(0,0,0,0.2);
    }
    .eb-pity-label, .eb-timer-label { display: block; font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .eb-pity-val { display: block; font-size: 16px; font-weight: 900; color: #2dd4bf; font-family: monospace; }
    .eb-timer-val { display: block; font-size: 14px; font-weight: 900; color: #fbbf24; font-family: monospace; }
    .eb-ended-icon { font-size: 20px; opacity: 0.4; }
    .eb-ended-tag {
        padding: 4px 12px; border-radius: 6px; font-size: 9px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1px;
        background: rgba(51,65,85,0.3); color: #475569;
    }

    /* Starter */
    .starter { display: block; width: 100%; cursor: pointer; background: none; border: none; text-align: left; margin-bottom: 28px; }
    .starter-glow {
        padding: 2px; border-radius: 16px;
        background: linear-gradient(135deg, #059669, #10b981, #34d399, #10b981);
        background-size: 300% 300%; animation: starterShift 4s ease infinite;
        transition: box-shadow 0.2s;
    }
    .starter:hover .starter-glow { box-shadow: 0 0 30px rgba(16,185,129,0.25); }
    @keyframes starterShift { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
    .starter-inner {
        background: #080c18; border-radius: 14px;
        padding: 24px 28px; display: flex; align-items: center; justify-content: space-between; gap: 20px;
    }
    .starter-free {
        display: inline-block; font-size: 8px; font-weight: 900; color: #10b981;
        background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.15);
        padding: 2px 10px; border-radius: 100px; letter-spacing: 2px; margin-bottom: 8px;
    }
    .starter-title { font-size: 22px; font-weight: 900; color: #34d399; }
    .starter-desc { font-size: 11px; color: #64748b; margin-top: 4px; }
    .starter-cta {
        flex-shrink: 0; padding: 12px 28px; border-radius: 12px;
        background: linear-gradient(135deg, #059669, #10b981); color: white;
        font-weight: 900; font-size: 14px; letter-spacing: 0.5px;
    }

    /* Free Packs */
    .free-packs { margin-bottom: 28px; }
    .fp-header { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #fbbf24; margin-bottom: 14px; }
    .fp-hint { color: #64748b; font-weight: 700; text-transform: none; letter-spacing: 0; font-size: 10px; }
    .fp-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .fp-card { position: relative; overflow: hidden; border: 1px solid; border-radius: 14px; padding: 18px 14px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .fp-badge { position: absolute; top: 8px; right: 8px; font-size: 12px; font-weight: 900; border: 1px solid; border-radius: 100px; padding: 2px 9px; background: rgba(0,0,0,0.35); }
    .fp-title { font-size: 17px; font-weight: 900; color: #f1f5f9; margin-top: 4px; }
    .fp-sub { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .fp-btn { width: 100%; padding: 9px; border-radius: 10px; border: none; color: #0b1220; font-size: 11px; font-weight: 900; cursor: pointer; transition: transform 0.12s, box-shadow 0.12s; }
    .fp-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.3); }

    /* Packs */
    .packs-header { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-bottom: 14px; }
    .packs-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 900px) { .packs-row { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 550px) { .packs-row { grid-template-columns: 1fr; max-width: 280px; margin: 0 auto; } }

    .pack {
        position: relative; overflow: hidden;
        border-radius: 16px; border: 1px solid;
        display: flex; flex-direction: column;
        min-height: 200px;
        transition: transform 0.15s, box-shadow 0.15s;
    }
    .pack:hover { transform: translateY(-4px); }

    .pack:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.35); }


    .pack-foil {
        position: absolute; inset: 0;
        background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px);
        pointer-events: none;
    }
    .pack-content {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 20px 16px; position: relative; z-index: 1;
    }
    .pack-badge {
        font-size: 9px; font-weight: 900; letter-spacing: 2px;
        color: #64748b; background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06); padding: 4px 14px;
        border-radius: 100px; margin-bottom: 16px;
    }
    .pack-title { font-size: 22px; font-weight: 900; color: #f1f5f9; letter-spacing: 1px; }
    .pack-sub { font-size: 10px; font-weight: 800; color: #64748b; margin-top: 3px; letter-spacing: 2px; text-transform: uppercase; }

    .pack-btn {
        padding: 12px; margin: 0 14px 14px;
        border-radius: 12px; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: #f1f5f9; font-weight: 900; font-size: 13px;
        cursor: pointer; transition: all 0.12s; position: relative; z-index: 1;
        text-align: center;
    }
    .pack-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.14); }
    .pack-buttons { display: flex; gap: 6px; margin: 0 14px 14px; }
    .pack-buy { flex: 1; }
    .pack-old-price { text-decoration: line-through; color: #475569; font-size: 9px; margin-right: 4px; }
    .pack-new-price { color: #34d399; font-weight: 900; }
    .pack-preview-btn { flex: 0 0 auto; background: transparent !important; font-size: 11px !important; }
    .pack-best { font-size: 10px; margin-top: 12px; font-weight: 700; text-align: center; }
    /* Mythic headline drop (Hall of Legends) — the rarest line in the Store, lit up. */
    .pack-best-mythic {
        font-weight: 900; letter-spacing: 0.4px;
        text-shadow: 0 0 12px color-mix(in srgb, var(--tier, #ff0033) 60%, transparent);
    }

    /* Bulk Opening quantity stepper — only rendered when the skill is above level 0. */
    .pack-qty {
        display: flex; align-items: center; justify-content: center; gap: 10px;
        margin: 0 14px 10px; position: relative; z-index: 1;
    }
    .pq-step {
        width: 26px; height: 26px; flex-shrink: 0;
        border-radius: 8px; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: #cbd5e1; font-size: 15px; font-weight: 900; line-height: 1;
        cursor: pointer; transition: all 0.12s;
    }
    .pq-step:hover:not(:disabled) { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.14); }
    .pq-step:disabled { opacity: 0.25; cursor: default; }
    .pq-val { font-size: 11px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; min-width: 60px; text-align: center; }

    /* Preview modal */
    .pv-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px; }
    .pv-modal {
        position: relative; width: 100%; max-width: 420px; padding: 28px;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71,85,105,0.2); border-radius: 20px;
        box-shadow: 0 25px 80px rgba(0,0,0,0.6);
    }
    .pv-close { position: absolute; top: 12px; right: 14px; width: 32px; height: 32px; border-radius: 10px; background: rgba(51,65,85,0.3); border: 1px solid rgba(71,85,105,0.2); color: #64748b; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .pv-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }
    .pv-title { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
    .pv-sub { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    .pv-section { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-bottom: 10px; margin-top: 16px; }
    .pv-drops { display: flex; flex-direction: column; gap: 6px; }
    .pv-drop { display: flex; align-items: center; gap: 8px; }
    /* Widened so "Hall of Legends" and its "0.001%" fit without clipping. */
    .pvd-tier { font-size: 12px; font-weight: 800; color: #e2e8f0; width: 96px; flex-shrink: 0; }
    .pvd-bar { flex: 1; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .pvd-fill { height: 100%; border-radius: 4px; }
    .pvd-pct { font-size: 12px; font-weight: 900; color: #94a3b8; width: 48px; flex-shrink: 0; text-align: right; }
    .pvd-mythic .pvd-tier { font-weight: 900; text-shadow: 0 0 10px color-mix(in srgb, var(--tier, #ff0033) 55%, transparent); }
    .pvd-mythic .pvd-pct { color: #fbbf24; }
    .pvd-mythic .pvd-fill { box-shadow: 0 0 8px var(--tier, #ff0033); }
    .pv-specials { display: flex; flex-direction: column; gap: 4px; }
    .pv-spec { display: flex; justify-content: space-between; font-size: 12px; padding: 6px 0; }
    .pvs-label { color: #64748b; } .pvs-val { color: #e2e8f0; font-weight: 800; }
    .pv-scout { font-size: 12px; color: #34d399; font-weight: 800; padding: 8px 12px; background: rgba(16,185,129,0.08); border-radius: 8px; border: 1px solid rgba(16,185,129,0.12); }
    .pv-buy {
        display: block; width: 100%; margin-top: 20px; padding: 14px;
        border-radius: 12px; border: none; color: #1c1917;
        font-weight: 900; font-size: 14px; cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: all 0.15s;
    }
    .pv-buy:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }

    /* Pull Modal */
    .pull-overlay {
        position: fixed; inset: 0; z-index: 80;
        background: rgba(4,6,14,0.92); backdrop-filter: blur(16px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
    }
    .pull-modal {
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71,85,105,0.2);
        border-radius: 24px;
        padding: 32px;
        max-width: 1050px; width: 100%;
        max-height: 90vh; overflow-y: auto;
        box-shadow: 0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(79,70,229,0.04);
    }
    .pull-header {
        font-size: 20px; font-weight: 900; color: #e2e8f0;
        letter-spacing: 3px; text-transform: uppercase;
        text-align: center; margin-bottom: 4px;
    }
    .pull-sub {
        font-size: 11px; color: #475569; text-align: center;
        margin-bottom: 24px;
    }
    .pull-grid {
        display: flex; flex-wrap: wrap; gap: 14px;
        justify-content: center; margin-bottom: 24px;
    }
    .pull-card-slot {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .pull-card-inner { cursor: pointer; transition: transform 0.12s; }
    .pull-card-inner:hover { transform: scale(1.03); }
    .pull-reveal { animation: cardPop 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
    @keyframes cardPop { from { opacity:0; transform:scale(0.6) rotateY(80deg); } to { opacity:1; transform:scale(1) rotateY(0); } }

    .pull-card-controls { display: flex; gap: 4px; width: 100%; }
    .pc-btn {
        flex: 1; padding: 6px 8px; border-radius: 8px;
        font-size: 10px; font-weight: 800; cursor: pointer;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        color: #64748b; transition: all 0.12s; text-align: center;
    }
    .pc-btn:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }
    .pc-locked {
        background: rgba(234,179,8,0.1) !important; border-color: rgba(234,179,8,0.25) !important;
        color: #fbbf24 !important;
    }

    .pull-placeholder {
        width: 180px; height: 320px; flex-shrink: 0;
        background: linear-gradient(135deg, #080e1e, #0c1630, #080e1e);
        border-radius: 16px; border: 2px solid #1e293b;
        display: flex; align-items: center; justify-content: center;
        animation: phPulse 1.4s ease-in-out infinite;
    }
    .pull-placeholder span { font-size: 2.5rem; color: #1e293b; font-weight: 900; }
    @keyframes phPulse { 0%,100% { border-color: #1e293b; } 50% { border-color: #334155; } }

    /* Pull action buttons */
    .pull-actions {
        display: flex; gap: 10px; justify-content: center;
    }
    @media (max-width: 600px) { .pull-actions { flex-direction: column; } }
    .pa-btn {
        padding: 12px 28px; border-radius: 12px;
        font-weight: 900; font-size: 12px; letter-spacing: 0.5px;
        border: none; cursor: pointer; transition: all 0.15s;
        text-transform: uppercase;
    }
    .pa-keep {
        background: linear-gradient(135deg, #3b82f6, #6366f1); color: white;
        box-shadow: 0 4px 15px rgba(59,130,246,0.25);
    }
    .pa-keep:hover { box-shadow: 0 6px 20px rgba(59,130,246,0.4); transform: translateY(-1px); }
    .pa-sell {
        background: rgba(239,68,68,0.1); color: #f87171;
        border: 1px solid rgba(239,68,68,0.2);
    }
    .pa-sell:hover { background: rgba(239,68,68,0.2); }
</style>
