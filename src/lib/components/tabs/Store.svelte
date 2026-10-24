<script>
    import Card from '../card/Card.svelte';
    import PackArt from '../store/PackArt.svelte';
    import Icon from '../ui/Icon.svelte';
    import { blueEssence, club, hasBoughtStarter, collectionRegistry, trackStats, skills, grantXP, grantBPXP, grantBE, saveGame, isClubFull, clubCapacity, bulkOpenMax, freePacks } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { inspectingCard } from '../../stores/ui.js';
    import { getDB, rollPackTier, makeUniqueId, getSellValue, AWARD_TIERS, MYTHIC_TIERS, TIER_COLORS } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { saveToStorage, loadFromStorage } from '../../utils/storage.js';
    import { applyScouting, SCOUT_STEP } from '../../utils/skillEffects.js';
    import { get } from 'svelte/store';

    import { onDestroy } from 'svelte';

    let pulledCards = [];
    let pullTitle = '';
    let showPulls = false;
    let revealedCount = 0;
    let lockedCards = new Set();
    let previewPack = null;

    $: scoutLevel = $skills.scouting || 0;
    $: scoutBonus = Math.round(scoutLevel * SCOUT_STEP * 100);   // % better odds above the floor

    // --- Limited-time Store events (boosted pack + discount + pity guarantee) ---
    const MSI_EVENT_END = new Date('2026-07-12T23:59:59Z').getTime();
    const MSI_PITY_TARGET = 70;
    const EWC_EVENT_END = new Date('2026-07-27T23:59:59Z').getTime();
    const EWC_PITY_TARGET = 100;
    // Worlds 2026 runs 15 Oct → the final at Barclays Center, Brooklyn on 14 Nov. The event
    // stays up for the weekend after it.
    const WORLDS_EVENT_START = new Date('2026-10-15T00:00:00Z').getTime();
    const WORLDS_EVENT_END = new Date('2026-11-16T23:59:59Z').getTime();
    const WORLDS_PITY_TARGET = 90;
    let eventTimeLeft = '';
    let eventTimer = null;

    // Pity is per-save. Shared across slots it is an exploit: bank the counter on one
    // slot, cash the guaranteed pull on another. Routed through storage.js so each slot
    // keeps its own.
    // Back-compat: pity used to be written raw via String(n). A bare number is valid
    // JSON, so old counters still decode — anything else (or nothing) reads as 0.
    function readPity(key) {
        const n = Math.floor(Number(loadFromStorage(key)));
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    // Event registry keyed by the pack id it boosts. The drop functions are hoisted
    // declarations, so referencing them here is safe. `start` is optional — an event with
    // none is live from the moment it ships.
    const EVENTS = {
        champion: { name: 'Worlds 2026 Event', tier: 'Champion', start: WORLDS_EVENT_START, end: WORLDS_EVENT_END, pity: WORLDS_PITY_TARGET, pityKey: 'lur_worlds_pity', base: 6000, discount: 4500, color: '#ecc766', drops: getWorldsEventDrops,
                    blurb: 'The road to Brooklyn — Worlds Champion and Finalist cards boosted all tournament long.' },
        msi: { name: 'MSI 2026 Event', tier: 'MSI', end: MSI_EVENT_END, pity: MSI_PITY_TARGET, pityKey: 'lur_msi_pity', base: 5000, discount: 3500, color: '#2dd4bf', drops: getMsiEventDrops },
        ewc: { name: 'EWC 2026 Event', tier: 'EWC', end: EWC_EVENT_END, pity: EWC_PITY_TARGET, pityKey: 'lur_ewc_pity', base: 4000, discount: 3000, color: '#ffd24a', drops: getEwcEventDrops },
    };

    function isLive(ev, now = Date.now()) {
        return !!ev && now >= (ev.start || 0) && now < ev.end;
    }

    // Registry order breaks a tie if two windows ever overlap.
    function liveEventId(now = Date.now()) {
        return Object.keys(EVENTS).find(id => isLive(EVENTS[id], now)) || null;
    }

    let pityCounts = Object.fromEntries(Object.entries(EVENTS).map(([id, ev]) => [id, readPity(ev.pityKey)]));

    // The event currently live (if any) — drives the banner. Re-evaluated by the 1s ticker,
    // so the banner switches over at the boundary without a reload.
    let liveId = liveEventId();
    $: activeEvent = liveId ? { ...EVENTS[liveId], pityCount: pityCounts[liveId] || 0 } : null;

    function updateEventTimer() {
        liveId = liveEventId();
        const end = liveId ? EVENTS[liveId].end : 0;
        const remaining = Math.max(0, end - Date.now());
        if (end === 0 || remaining <= 0) { eventTimeLeft = 'Event Ended'; return; }
        const d = Math.floor(remaining / 86400000);
        const h = Math.floor((remaining % 86400000) / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        eventTimeLeft = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
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

    // The Store is laid out as three shelves. Every pack in allPacks must appear in exactly
    // one of them, or it would be on sale nowhere.
    const SHELVES = [
        { title: 'Core Packs',       sub: 'Everyday pulls to build out your club',                   ids: ['standard', 'premium', 'elite'] },
        { title: 'Tournament Packs', sub: 'International event cards — the event pack is on offer',  ids: ['firststand', 'ewc', 'msi'] },
        { title: 'Legacy Packs',     sub: 'World Championship history and the rarest awards in the game', ids: ['champion', 'mvp', 'awards'] },
    ];
    const packById = (id) => allPacks.find(p => p.id === id);
    const STARTER_PACK = { id: 'starter', name: 'Starter', sub: 'Welcome Pack', color: '#10b981', count: 6 };

    // Packs are drawn at a fixed pixel width; two-up on a phone needs them smaller.
    let vw = 1280;
    $: packW = vw < 520 ? 118 : 164;

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

    // The Champion pack's own table is 0.5% Champion / 1% Finalist over a Platinum floor. The
    // event quadruples the headline card, triples the Finalist and adds a Challenger slice.
    function getWorldsEventDrops() {
        return [
            { tier: 'Champion', pct: 2 },
            { tier: 'Finalist', pct: 3 },
            { tier: 'Challenger', pct: 2 },
            { tier: 'Grandmaster', pct: 4 },
            { tier: 'Master', pct: 8 },
            { tier: 'Diamond', pct: 20 },
            { tier: 'Platinum', pct: 61 },
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

    // What a pack ACTUALLY drops right now. The pack card and the Preview used to read
    // pack.drops unconditionally, so during an event they advertised the normal odds of a
    // pack that was in fact rolling the boosted table. `_live` is only there so a template
    // call re-runs when the ticker moves the live event.
    // Scouting Network is folded in here AND in buyPack, so every odds figure on screen is
    // the table the roll actually uses.
    function dropsFor(pack, _live) {
        const ev = EVENTS[pack.id];
        return applyScouting(isLive(ev) ? ev.drops() : pack.drops, scoutLevel);
    }

    function getPackCost(pack) {
        const ev = EVENTS[pack.id];
        if (isLive(ev)) return ev.discount;
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
        const ev = free ? null : (isLive(EVENTS[pack.id]) ? EVENTS[pack.id] : null);
        const drops = applyScouting(ev ? ev.drops() : pack.drops, get(skills).scouting || 0);
        let pity = ev ? readPity(ev.pityKey) : 0;

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
            saveToStorage(ev.pityKey, pity);
            pityCounts = { ...pityCounts, [pack.id]: pity };
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
        startReveal(pack, pulled,
            free ? `Free ${pack.name} Pack Opened!`
            : packs > 1 ? `${packs}x ${pack.name} Packs Opened!`
            : `${pack.name} Pack Opened!`,
            sigsPulled > 0 || holosPulled > 0 ? 'rare' : 'pack');
    }

    // ── The opening sequence ──
    // The pack shakes in your hands, the top seal tears away, then the cards turn over one
    // at a time. Every step is stamped with a token so that skipping, or a second open
    // before the first has finished, can never let a stale timer reveal the wrong cards.
    let openingPack = null;
    let openingState = '';
    let pullToken = 0;
    let pendingSound = 'pack';

    function startReveal(pack, pulled, title, sound) {
        const token = ++pullToken;
        pulledCards = pulled;
        pullTitle = title;
        revealedCount = 0;
        pendingSound = sound;
        openingPack = pack;
        openingState = 'shake';
        showPulls = true;
        setTimeout(() => { if (token !== pullToken) return; openingState = 'torn'; playSound(sound); }, 560);
        setTimeout(() => {
            if (token !== pullToken) return;
            openingPack = null;
            openingState = '';
            // Shrink the per-card delay as the batch grows so a 25-card open still finishes in
            // about the same ~2s a single pack does, one card at a time.
            const step = Math.min(420, Math.round(1700 / Math.max(1, pulled.length - 1)));
            pulled.forEach((_, i) => {
                setTimeout(() => { if (token === pullToken) revealedCount = Math.max(revealedCount, i + 1); }, 120 + i * step);
            });
        }, 1050);
    }

    function skipReveal() {
        const unopened = openingState === 'shake';
        pullToken++;                       // cancels every pending step of this open
        openingPack = null;
        openingState = '';
        revealedCount = pulledCards.length;
        if (unopened) playSound(pendingSound);
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
        startReveal(STARTER_PACK, pulled, 'Starter Pack — Welcome!', 'rare');
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

<svelte:window bind:innerWidth={vw} />

<section class="store">
    <header class="st-head">
        <div>
            <span class="st-eyebrow"><Icon name="store" size={12} stroke={2.2} /> Store</span>
            <h2 class="st-title">Open some packs</h2>
            <p class="st-sub">Five cards a pack. Every pack can roll a <b class="holo-word">Holographic</b> (1%) or a <b class="sig-word">Signature</b> (0.1%) on any card.</p>
        </div>
        <div class="st-wallet">
            <span class="sw-label">Your balance</span>
            <span class="sw-val"><Icon name="gem" size={16} stroke={2.2} /> {$blueEssence.toLocaleString()}</span>
            {#if $bulkOpenMax > 1}<span class="sw-note">Bulk opening up to {$bulkOpenMax}× a click</span>{/if}
        </div>
    </header>

    <!-- Event spotlight -->
    {#if activeEvent && packById(liveId)}
        {@const evPack = packById(liveId)}
        {@const evQty = Math.max(1, Math.min($bulkOpenMax, packQty[evPack.id] || 1))}
        <div class="spot" style="--ev: {activeEvent.color};">
            <div class="spot-rays" aria-hidden="true"></div>
            <div class="spot-pack">
                <PackArt pack={evPack} width={190} />
            </div>
            <div class="spot-info">
                <span class="spot-live"><span class="live-dot"></span> Live event</span>
                <h3 class="spot-title">{activeEvent.name}</h3>
                {#if activeEvent.blurb}<p class="spot-blurb">{activeEvent.blurb}</p>{/if}
                <div class="spot-facts">
                    <div class="sf">
                        <span class="sf-label">Price</span>
                        <span class="sf-val"><s>{activeEvent.base.toLocaleString()}</s> {activeEvent.discount.toLocaleString()} BE</span>
                    </div>
                    <div class="sf">
                        <span class="sf-label">Headline odds</span>
                        <span class="sf-val">{dropsFor(evPack, liveId)[0].tier} {dropsFor(evPack, liveId)[0].pct}%</span>
                    </div>
                    <div class="sf">
                        <span class="sf-label">Ends in</span>
                        <span class="sf-val sf-mono">{eventTimeLeft}</span>
                    </div>
                </div>
                <div class="spot-pity">
                    <div class="sp-row"><span>Guaranteed {activeEvent.tier} card</span><span class="sf-mono">{activeEvent.pityCount}/{activeEvent.pity} pulls</span></div>
                    <div class="sp-track"><div class="sp-fill" style="width: {Math.min(100, (activeEvent.pityCount / activeEvent.pity) * 100)}%;"></div></div>
                </div>
                <div class="spot-actions">
                    <button class="buy-btn buy-big" style="--c: {evPack.color};" on:click={() => buyPack(evPack, false, evQty)}>
                        Open {evQty > 1 ? `${evQty}× ` : ''}<Icon name="gem" size={14} stroke={2.4} /> {(getPackCost(evPack) * evQty).toLocaleString()}
                    </button>
                    <button class="ghost-btn" on:click={() => previewPack = evPack}>Drop rates</button>
                </div>
            </div>
        </div>
    {:else}
        <div class="no-event"><Icon name="clock" size={16} /> No store event running right now — the next one will appear here.</div>
    {/if}

    <!-- Starter Pack -->
    {#if !$hasBoughtStarter}
    <button class="starter" on:click={buyStarterPack}>
        <span class="starter-pack"><PackArt pack={STARTER_PACK} width={120} tilt={false} /></span>
        <span class="starter-text">
            <span class="starter-free">Free</span>
            <span class="starter-title">Claim your Starter Pack</span>
            <span class="starter-desc">Six cards, one for every role — enough to field your first five.</span>
        </span>
        <span class="starter-cta">Open it <Icon name="arrow" size={15} /></span>
    </button>
    {/if}

    <!-- Free Packs (earned from RBCs, codes and the Battle Pass) -->
    {#if freePackList.length > 0}
    <section class="shelf shelf-free">
        <div class="shelf-head">
            <h3 class="shelf-title"><Icon name="gift" size={16} /> Free packs</h3>
            <span class="shelf-sub">Earned from challenges, codes and the Battle Pass — no Blue Essence needed</span>
        </div>
        <div class="shelf-row">
            {#each freePackList as fp (fp.id)}
                <div class="slot" style="--c: {fp.pack.color};">
                    <div class="slot-art">
                        <PackArt pack={fp.pack} width={Math.min(150, packW)} />
                        <span class="slot-count" style="--c: {fp.pack.color};">×{fp.count}</span>
                    </div>
                    <button class="buy-btn" style="--c: {fp.pack.color};" on:click={() => buyPack(fp.pack, true)}>Open free</button>
                </div>
            {/each}
        </div>
    </section>
    {/if}

    <!-- Shelves -->
    {#each SHELVES as shelf}
        <section class="shelf">
            <div class="shelf-head">
                <h3 class="shelf-title">{shelf.title}</h3>
                <span class="shelf-sub">{shelf.sub}</span>
            </div>
            <div class="shelf-row">
                {#each shelf.ids.map(packById).filter(Boolean) as pack (pack.id)}
                    {@const effectiveCost = getPackCost(pack)}
                    {@const isDiscounted = effectiveCost < pack.cost}
                    {@const qty = Math.max(1, Math.min($bulkOpenMax, packQty[pack.id] || 1))}
                    {@const best = dropsFor(pack, liveId)[0]}
                    {@const bestMythic = MYTHIC_TIERS.includes(best.tier)}
                    {@const affordable = $blueEssence >= effectiveCost * qty}
                    <div class="slot" class:slot-event={liveId === pack.id} style="--c: {pack.color};">
                        {#if liveId === pack.id}<span class="slot-flag">Event</span>{/if}
                        <button class="slot-art slot-art-btn" on:click={() => previewPack = pack} aria-label="Preview {pack.name} pack">
                            <PackArt {pack} width={packW} />
                        </button>
                        <div class="slot-info">
                            <div class="slot-name">{pack.name}<span class="slot-kind">{pack.sub}</span></div>
                            <!-- The top of the drop table, so the odds are on the shelf rather than a click away -->
                            <div class="odds">
                                {#each dropsFor(pack, liveId).slice(0, 4) as d}
                                    <div class="odd" class:odd-mythic={MYTHIC_TIERS.includes(d.tier)} style="--tier: {TIER_COLORS[d.tier] || pack.color};">
                                        <span class="odd-tier">{d.tier}</span>
                                        <span class="odd-bar"><span class="odd-fill" style="width: {Math.min(100, Math.max(4, d.pct * 2))}%;"></span></span>
                                        <span class="odd-pct">{d.pct}%</span>
                                    </div>
                                {/each}
                            </div>
                            <button class="link-btn" on:click={() => previewPack = pack}>All drop rates</button>
                            <div class="slot-buy">
                                {#if $bulkOpenMax > 1}
                                    <div class="pack-qty">
                                        <button class="pq-step" on:click={() => setQty(pack.id, qty - 1)} disabled={qty <= 1} aria-label="Fewer packs">−</button>
                                        <span class="pq-val">{qty}×</span>
                                        <button class="pq-step" on:click={() => setQty(pack.id, qty + 1)} disabled={qty >= $bulkOpenMax} aria-label="More packs">+</button>
                                    </div>
                                {/if}
                                <button class="buy-btn" class:buy-poor={!affordable} on:click={() => buyPack(pack, false, qty)} title={affordable ? '' : 'Not enough Blue Essence'}>
                                    {#if isDiscounted}<s class="buy-old">{(pack.cost * qty).toLocaleString()}</s>{/if}
                                    <Icon name="gem" size={13} stroke={2.4} /> {(effectiveCost * qty).toLocaleString()}
                                </button>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    {/each}

    <!-- Pack Preview Modal -->
    {#if previewPack}
    <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="pv-overlay" on:click={() => previewPack = null}>
        <div class="pv-modal" on:click|stopPropagation style="--c: {previewPack.color};">
            <button class="pv-close" on:click={() => previewPack = null} aria-label="Close">✕</button>
            <div class="pv-top">
                <PackArt pack={previewPack} width={110} tilt={false} />
                <div>
                    <h3 class="pv-title">{previewPack.name} {previewPack.sub}</h3>
                    <p class="pv-sub">{previewPack.count} cards per pack · <Icon name="gem" size={12} /> {getPackCost(previewPack).toLocaleString()} BE{liveId === previewPack.id ? ` · ${EVENTS[previewPack.id].name} rates` : ''}</p>
                </div>
            </div>

            <div class="pv-section">Drop Rates</div>
            <div class="pv-drops">
                {#each dropsFor(previewPack, liveId) as d}
                    {@const mythic = MYTHIC_TIERS.includes(d.tier)}
                    <div class="pv-drop" class:pvd-mythic={mythic} style="--tier: {TIER_COLORS[d.tier]};">
                        <span class="pvd-tier" style={mythic ? `color: ${TIER_COLORS[d.tier]};` : ''}>{d.tier}</span>
                        <div class="pvd-bar"><div class="pvd-fill" style="width: {dropBarWidth(d.pct)}%; background: {TIER_COLORS[d.tier] || previewPack.color};"></div></div>
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
                <div class="pv-section">Scouting Network (Lv {scoutLevel})</div>
                <div class="pv-scout">+{scoutBonus}% odds on every tier above {dropsFor(previewPack, liveId)[dropsFor(previewPack, liveId).length - 1].tier} — already included in the rates above.</div>
            {/if}

            <button class="buy-btn pv-buy" on:click={() => { buyPack(previewPack, false, previewQty); previewPack = null; }}>
                Open {previewQty > 1 ? `${previewQty}× packs` : 'pack'} · <Icon name="gem" size={14} stroke={2.4} /> {(getPackCost(previewPack) * previewQty).toLocaleString()} BE
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
    {#if openingPack}
        <button class="opening" on:click={skipReveal} aria-label="Skip the opening">
            <span class="opening-glow" style="--c: {openingPack.color};" aria-hidden="true"></span>
            <PackArt pack={openingPack} width={250} tilt={false} state={openingState} />
            <span class="opening-hint">Click to skip</span>
        </button>
    {:else}
    <div class="pull-modal" on:click|stopPropagation>
        <div class="pull-header">{pullTitle}</div>
        <div class="pull-sub">{pulledCards.length} cards · Click a card to inspect · Lock the ones you want to keep</div>

        <div class="pull-grid">
            {#each pulledCards as card, i}
                {#if i < revealedCount}
                    <div class="pull-card-slot pull-reveal" class:pull-special={card.signature || card.holographic}>
                        <div class="pull-card-inner">
                            <Card {card} mini={true} onclick={() => inspectPulled(card)} />
                        </div>
                        <div class="pull-card-controls">
                            <button
                                class="pc-btn"
                                class:pc-locked={lockedCards.has(card.uniqueId)}
                                on:click={() => togglePullLock(card)}
                            >
                                <Icon name="lock" size={12} /> {lockedCards.has(card.uniqueId) ? 'Locked' : 'Lock'}
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="pull-placeholder"><span class="pp-back"><Icon name="cards" size={34} stroke={1.4} /></span></div>
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
        {:else}
            <div class="pull-actions">
                <button class="pa-btn pa-skip" on:click={skipReveal}>Reveal all</button>
            </div>
        {/if}
    </div>
    {/if}
</div>
{/if}

<style>
    .store { padding-bottom: 40px; display: flex; flex-direction: column; gap: 26px; }

    /* Head */
    .st-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
    .st-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #fbbf24; padding: 4px 10px; border-radius: 100px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.25); }
    .st-title { font-size: clamp(26px, 3.2vw, 36px); font-weight: 900; color: #f1f5f9; letter-spacing: -0.5px; margin-top: 10px; }
    .st-sub { font-size: 13px; color: #7c8aa0; margin-top: 6px; }
    .holo-word { background: linear-gradient(90deg, #f0abfc, #67e8f9, #86efac, #fde047); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .sig-word { color: #fde68a; }
    .st-wallet { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding: 12px 18px; border-radius: 16px; background: linear-gradient(140deg, rgba(14,116,144,0.25), rgba(12,16,28,0.75)); border: 1px solid rgba(56,189,248,0.25); }
    .sw-label { font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #38bdf8; }
    .sw-val { display: inline-flex; align-items: center; gap: 6px; font-size: 22px; font-weight: 900; color: #e0f2fe; }
    .sw-note { font-size: 10px; font-weight: 700; color: #64748b; }

    /* Event spotlight */
    .spot {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 34px; flex-wrap: wrap;
        padding: 26px 34px; border-radius: 24px;
        background: radial-gradient(70% 120% at 12% 50%, color-mix(in srgb, var(--ev) 28%, transparent), transparent 70%), linear-gradient(120deg, #191306, #0c0d14 65%);
        border: 1px solid color-mix(in srgb, var(--ev) 40%, transparent);
        box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    .spot-rays { position: absolute; left: -10%; top: -60%; width: 60%; height: 220%; pointer-events: none; background: repeating-conic-gradient(from 0deg at 50% 50%, color-mix(in srgb, var(--ev) 10%, transparent) 0 6deg, transparent 6deg 18deg); animation: spin 40s linear infinite; mask: radial-gradient(circle, #000 20%, transparent 65%); -webkit-mask: radial-gradient(circle, #000 20%, transparent 65%); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spot-pack { position: relative; padding: 6px 10px; }
    .spot-info { position: relative; flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 10px; }
    .spot-live { display: inline-flex; align-items: center; gap: 7px; width: fit-content; font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #fca5a5; padding: 4px 10px; border-radius: 100px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 8px #ef4444; animation: liveBlink 1.4s ease-in-out infinite; }
    @keyframes liveBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    .spot-title { font-size: clamp(24px, 2.8vw, 32px); font-weight: 900; letter-spacing: -0.3px; color: var(--ev); text-shadow: 0 0 30px color-mix(in srgb, var(--ev) 35%, transparent); }
    .spot-blurb { font-size: 13px; color: #cbd5e1; margin-top: -4px; }
    .spot-facts { display: flex; gap: 10px; flex-wrap: wrap; }
    .sf { display: flex; flex-direction: column; gap: 2px; padding: 9px 14px; border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); }
    .sf-label { font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #7c8aa0; }
    .sf-val { font-size: 14px; font-weight: 900; color: #f1f5f9; }
    .sf-val s { color: #64748b; font-size: 11px; margin-right: 3px; }
    .sf-mono { font-family: monospace; }
    .spot-pity { max-width: 460px; }
    .sp-row { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #cbd5e1; margin-bottom: 5px; }
    .sp-track { height: 8px; border-radius: 8px; background: rgba(0,0,0,0.4); overflow: hidden; border: 1px solid rgba(255,255,255,0.06); }
    .sp-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, color-mix(in srgb, var(--ev) 60%, #000), var(--ev)); box-shadow: 0 0 10px var(--ev); transition: width 0.5s; }
    .spot-actions { display: flex; gap: 10px; align-items: center; margin-top: 4px; }

    .no-event { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-radius: 14px; font-size: 12px; font-weight: 700; color: #64748b; background: rgba(12,16,28,0.5); border: 1px dashed rgba(71,85,105,0.35); }

    /* Starter */
    .starter {
        display: flex; align-items: center; gap: 24px; width: 100%; cursor: pointer; text-align: left;
        padding: 16px 28px 16px 22px; border-radius: 22px; overflow: hidden;
        background: radial-gradient(60% 140% at 8% 50%, rgba(16,185,129,0.3), transparent 70%), linear-gradient(120deg, #052e22, #0a0f1a 70%);
        border: 1px solid rgba(52,211,153,0.4);
        box-shadow: 0 0 0 0 rgba(16,185,129,0.4); animation: starterPulse 2.4s ease-in-out infinite;
    }
    @keyframes starterPulse { 50% { box-shadow: 0 0 34px rgba(16,185,129,0.3); } }
    .starter-pack { flex-shrink: 0; transform: rotate(-6deg); }
    .starter-text { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .starter-free { width: fit-content; font-size: 9px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #052e16; background: #34d399; padding: 3px 10px; border-radius: 100px; }
    .starter-title { font-size: 22px; font-weight: 900; color: #ecfdf5; }
    .starter-desc { font-size: 12px; color: #86b8a4; }
    .starter-cta { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; padding: 13px 24px; border-radius: 14px; font-size: 14px; font-weight: 900; color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 6px 20px rgba(16,185,129,0.35); }
    .starter:hover .starter-cta { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(16,185,129,0.5); }

    /* Shelves */
    .shelf { display: flex; flex-direction: column; gap: 16px; }
    .shelf-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid rgba(71,85,105,0.25); }
    .shelf-title { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #e2e8f0; }
    .shelf-sub { font-size: 12px; color: #64748b; font-weight: 600; }
    .shelf-free .shelf-title { color: #fbbf24; }
    .shelf-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(430px, 100%), 1fr)); gap: 18px; }
    .shelf-free .shelf-row { grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); }

    /* A shelf slot: the pack standing on the left, its odds and price beside it. */
    .slot {
        position: relative; display: flex; align-items: center; gap: 22px;
        padding: 20px 22px; border-radius: 22px;
        background: radial-gradient(60% 90% at 18% 50%, color-mix(in srgb, var(--c) 14%, transparent), transparent 70%), rgba(10,14,26,0.6);
        border: 1px solid color-mix(in srgb, var(--c) 18%, rgba(71,85,105,0.25));
        transition: border-color 0.2s;
    }
    .slot:hover { border-color: color-mix(in srgb, var(--c) 45%, transparent); }
    .shelf-free .slot { flex-direction: column; gap: 14px; padding: 22px 16px 16px; }
    .slot-event { border-color: color-mix(in srgb, var(--c) 60%, transparent); box-shadow: 0 0 30px color-mix(in srgb, var(--c) 14%, transparent); }
    .slot-flag { position: absolute; top: 12px; left: 12px; z-index: 3; font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #120c02; background: var(--c); padding: 3px 9px; border-radius: 100px; box-shadow: 0 0 14px color-mix(in srgb, var(--c) 60%, transparent); }
    .slot-art { position: relative; flex-shrink: 0; display: flex; justify-content: center; }
    .slot-art-btn { background: none; border: none; padding: 0; cursor: pointer; }
    .slot-art-btn:active { transform: none; }
    .slot-count { position: absolute; top: -8px; right: -12px; z-index: 3; font-size: 13px; font-weight: 900; color: #0b1020; background: var(--c); padding: 3px 10px; border-radius: 100px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
    .slot-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
    .slot-name { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 20px; font-weight: 900; color: #f8fafc; }
    .slot-kind { font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: color-mix(in srgb, var(--c) 70%, #94a3b8); }
    .odds { display: flex; flex-direction: column; gap: 5px; }
    .odd { display: grid; grid-template-columns: 92px 1fr 52px; align-items: center; gap: 8px; font-size: 11px; }
    .odd-tier { font-weight: 800; color: var(--tier); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .odd-bar { height: 5px; border-radius: 5px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .odd-fill { display: block; height: 100%; border-radius: 5px; background: var(--tier); }
    .odd-pct { text-align: right; font-weight: 900; color: #cbd5e1; font-variant-numeric: tabular-nums; }
    .odd-mythic .odd-tier { text-shadow: 0 0 10px color-mix(in srgb, var(--tier) 60%, transparent); }
    .slot-info .link-btn { align-self: flex-start; padding: 0; }
    .slot-buy { display: flex; align-items: center; gap: 10px; margin-top: 2px; }

    .buy-btn {
        position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; padding: 12px 14px; border-radius: 14px; border: none; cursor: pointer;
        font-size: 14px; font-weight: 900; color: #0b1020;
        background: linear-gradient(180deg, color-mix(in srgb, var(--c, #3b82f6) 75%, #fff), var(--c, #3b82f6));
        box-shadow: 0 6px 18px color-mix(in srgb, var(--c, #3b82f6) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.4);
    }
    .buy-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 26px color-mix(in srgb, var(--c, #3b82f6) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.45); }
    .buy-poor { filter: saturate(0.4) brightness(0.8); }
    .buy-old { font-size: 11px; color: rgba(11,16,32,0.55); margin-right: 2px; }
    .buy-big { width: auto; padding: 14px 28px; font-size: 15px; }
    .ghost-btn { padding: 13px 20px; border-radius: 14px; cursor: pointer; font-size: 13px; font-weight: 800; color: #e2e8f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
    .ghost-btn:hover { background: rgba(255,255,255,0.12); }
    .link-btn { background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 800; color: #64748b; text-decoration: underline; text-underline-offset: 3px; }
    .link-btn:hover { color: #cbd5e1; }

    /* Bulk Opening quantity stepper — only rendered when the skill is above level 0. */
    .pack-qty { display: flex; align-items: center; justify-content: center; gap: 10px; }
    .pq-step {
        width: 28px; height: 28px; flex-shrink: 0; border-radius: 9px;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        color: #cbd5e1; font-size: 15px; font-weight: 900; line-height: 1; cursor: pointer;
    }
    .pq-step:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
    .pq-step:disabled { opacity: 0.25; cursor: default; }
    .pq-val { font-size: 12px; font-weight: 900; min-width: 26px; text-align: center; color: #cbd5e1; }

    /* Preview modal */
    .pv-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px; }
    .pv-modal {
        position: relative; width: 100%; max-width: 460px; max-height: 92vh; overflow-y: auto; padding: 26px;
        background: radial-gradient(100% 40% at 50% 0%, color-mix(in srgb, var(--c) 16%, transparent), transparent 70%), linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); border-radius: 22px;
        box-shadow: 0 25px 80px rgba(0,0,0,0.6);
    }
    .pv-close { position: absolute; top: 12px; right: 14px; width: 32px; height: 32px; border-radius: 10px; background: rgba(51,65,85,0.3); border: 1px solid rgba(71,85,105,0.2); color: #94a3b8; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .pv-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }
    .pv-top { display: flex; align-items: center; gap: 18px; }
    .pv-title { font-size: 20px; font-weight: 900; color: #f1f5f9; }
    .pv-sub { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 12px; color: #7c8aa0; margin-top: 4px; }
    .pv-section { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 10px; margin-top: 18px; }
    .pv-drops { display: flex; flex-direction: column; gap: 7px; }
    .pv-drop { display: flex; align-items: center; gap: 8px; }
    /* Widened so "Hall of Legends" and its "0.001%" fit without clipping. */
    .pvd-tier { font-size: 12px; font-weight: 800; color: #e2e8f0; width: 96px; flex-shrink: 0; }
    .pvd-bar { flex: 1; height: 7px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .pvd-fill { height: 100%; border-radius: 4px; }
    .pvd-pct { font-size: 12px; font-weight: 900; color: #94a3b8; width: 48px; flex-shrink: 0; text-align: right; }
    .pvd-mythic .pvd-tier { font-weight: 900; text-shadow: 0 0 10px color-mix(in srgb, var(--tier, #ff0033) 55%, transparent); }
    .pvd-mythic .pvd-pct { color: #fbbf24; }
    .pvd-mythic .pvd-fill { box-shadow: 0 0 8px var(--tier, #ff0033); }
    .pv-specials { display: flex; flex-direction: column; gap: 4px; }
    .pv-spec { display: flex; justify-content: space-between; font-size: 12px; padding: 6px 0; }
    .pvs-label { color: #64748b; } .pvs-val { color: #e2e8f0; font-weight: 800; }
    .pv-scout { font-size: 12px; color: #34d399; font-weight: 800; padding: 8px 12px; background: rgba(16,185,129,0.08); border-radius: 8px; border: 1px solid rgba(16,185,129,0.12); }
    .pv-buy { margin-top: 20px; }

    /* Pull Modal */
    .pull-overlay {
        position: fixed; inset: 0; z-index: 80;
        background: radial-gradient(60% 60% at 50% 45%, rgba(30,27,75,0.55), rgba(4,6,14,0.95));
        backdrop-filter: blur(16px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .opening { position: relative; display: flex; flex-direction: column; align-items: center; gap: 22px; background: none; border: none; cursor: pointer; }
    .opening:active { transform: none; }
    .opening-glow { position: absolute; left: 50%; top: 45%; width: 520px; height: 520px; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--c) 35%, transparent), transparent 65%); pointer-events: none; animation: glowIn 1s ease-out both; }
    @keyframes glowIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    .opening-hint { position: relative; font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
    .pull-modal {
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71,85,105,0.25); border-radius: 24px;
        padding: 30px; max-width: 1080px; width: 100%; max-height: 90vh; overflow-y: auto;
        box-shadow: 0 25px 80px rgba(0,0,0,0.6), 0 0 40px rgba(79,70,229,0.06);
        animation: modalIn 0.25s ease-out;
    }
    @keyframes modalIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
    .pull-header { font-size: 20px; font-weight: 900; color: #e2e8f0; letter-spacing: 3px; text-transform: uppercase; text-align: center; margin-bottom: 4px; }
    .pull-sub { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 24px; }
    .pull-grid { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-bottom: 24px; perspective: 900px; }
    .pull-card-slot { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .pull-card-inner { cursor: pointer; transition: transform 0.12s; }
    .pull-card-inner:hover { transform: scale(1.03); }
    .pull-reveal { animation: cardPop 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
    .pull-special .pull-card-inner { filter: drop-shadow(0 0 18px rgba(253,224,71,0.55)); }
    @keyframes cardPop { from { opacity: 0; transform: scale(0.6) rotateY(90deg); } to { opacity: 1; transform: scale(1) rotateY(0); } }

    .pull-card-controls { display: flex; gap: 4px; width: 100%; }
    .pc-btn {
        flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        padding: 6px 8px; border-radius: 9px; font-size: 10px; font-weight: 800; cursor: pointer;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3); color: #94a3b8;
    }
    .pc-btn:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }
    .pc-locked { background: rgba(234,179,8,0.12) !important; border-color: rgba(234,179,8,0.35) !important; color: #fbbf24 !important; }

    .pull-placeholder {
        width: 180px; height: 300px; flex-shrink: 0;
        background: repeating-linear-gradient(135deg, rgba(99,102,241,0.06) 0 2px, transparent 2px 10px), linear-gradient(160deg, #11163a, #0a0e22);
        border-radius: 16px; border: 2px solid #232a52;
        display: flex; align-items: center; justify-content: center;
        animation: phPulse 1.4s ease-in-out infinite;
    }
    .pp-back { color: #3a4380; }
    @keyframes phPulse { 0%,100% { border-color: #232a52; } 50% { border-color: #3b4486; } }

    .pull-actions { display: flex; gap: 10px; justify-content: center; }
    @media (max-width: 600px) { .pull-actions { flex-direction: column; } }
    .pa-btn { padding: 12px 28px; border-radius: 12px; font-weight: 900; font-size: 12px; letter-spacing: 0.5px; border: none; cursor: pointer; text-transform: uppercase; }
    .pa-keep { background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; box-shadow: 0 4px 15px rgba(59,130,246,0.25); }
    .pa-keep:hover { box-shadow: 0 6px 20px rgba(59,130,246,0.4); transform: translateY(-1px); }
    .pa-sell { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
    .pa-sell:hover { background: rgba(239,68,68,0.2); }
    .pa-skip { background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.14); }
    .pa-skip:hover { background: rgba(255,255,255,0.12); }

    @media (max-width: 700px) {
        .spot { padding: 20px; gap: 18px; flex-direction: column; align-items: stretch; }
        .spot-pack { align-self: center; }
        .spot-info { min-width: 0; }
        .spot-actions { flex-wrap: wrap; }
        .spot-actions .buy-big { flex: 1; }
        .starter { flex-wrap: wrap; justify-content: center; text-align: center; padding: 18px; }
        .starter-text { align-items: center; }
        .starter-cta { width: 100%; justify-content: center; }
        .st-wallet { align-items: flex-start; width: 100%; }
        .slot { gap: 14px; padding: 16px 14px; }
        .slot-name { font-size: 17px; }
        .odd { grid-template-columns: 74px 1fr 44px; gap: 6px; font-size: 10px; }
        .slot-buy { flex-wrap: wrap; }
    }
</style>
