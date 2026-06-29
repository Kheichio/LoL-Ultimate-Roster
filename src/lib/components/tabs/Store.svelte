<script>
    import Card from '../card/Card.svelte';
    import { blueEssence, club, hasBoughtStarter, collectionRegistry, trackStats, skills, grantXP, grantBPXP, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { inspectingCard } from '../../stores/ui.js';
    import { getDB, rollPackTier, makeUniqueId, getSellValue } from '../../utils/cards.js';
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

    const MSI_EVENT_END = new Date('2026-06-30T23:59:59Z').getTime();
    const MSI_PITY_TARGET = 70;
    let eventTimeLeft = '';
    let eventTimer = null;

    $: msiEventActive = Date.now() < MSI_EVENT_END;
    let msiPityCount = parseInt(localStorage.getItem('lur_msi_pity') || '0');

    function updateEventTimer() {
        const remaining = Math.max(0, MSI_EVENT_END - Date.now());
        if (remaining <= 0) { eventTimeLeft = 'Event Ended'; if (eventTimer) { clearInterval(eventTimer); eventTimer = null; } return; }
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
        { id: 'msi', name: 'MSI', sub: 'Event Pack', cost: 5000, count: 5, special: true,
          color: '#2dd4bf', borderColor: 'rgba(45,212,191,0.2)', bg: 'linear-gradient(170deg, #042f2e 0%, #0a1f1e 60%, #0d2524 100%)',
          drops: [{ tier: 'MSI', pct: 0.5 }, { tier: 'Challenger', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 26.5 }, { tier: 'Gold', pct: 50 }] },
        { id: 'champion', name: 'Champion', sub: 'Legacy Pack', cost: 6000, count: 5, special: true,
          color: '#d97706', borderColor: 'rgba(217,119,6,0.2)', bg: 'linear-gradient(170deg, #1c1917 0%, #1a1510 60%, #201a0f 100%)',
          drops: [{ tier: 'Champion', pct: 0.5 }, { tier: 'Finalist', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 76.5 }] },
        { id: 'mvp', name: 'MVP', sub: 'Legacy Pack', cost: 8000, count: 5, special: true,
          color: '#ec4899', borderColor: 'rgba(236,72,153,0.2)', bg: 'linear-gradient(170deg, #1a0520 0%, #15031a 60%, #200828 100%)',
          drops: [{ tier: 'MVP', pct: 0.5 }, { tier: 'Challenger', pct: 1 }, { tier: 'Grandmaster', pct: 2 }, { tier: 'Master', pct: 5 }, { tier: 'Diamond', pct: 15 }, { tier: 'Platinum', pct: 76.5 }] },
    ];

    const SPECIAL_QUALS = new Set(['Champion','MVP','Finalist','MSI','FirstStand']);

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

    function buyPack(pack) {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        const be = get(blueEssence);
        if (be < pack.cost) { showToast('Not enough BE.', 'error'); return; }

        blueEssence.update(v => v - pack.cost);
        const pulled = [];
        const holoChance = 0.01;
        const sigChance = 0.001;
        const isMsiEvent = pack.id === 'msi' && Date.now() < MSI_EVENT_END;
        const drops = isMsiEvent ? getMsiEventDrops() : pack.drops;
        let pity = isMsiEvent ? parseInt(localStorage.getItem('lur_msi_pity') || '0') : 0;
        let gotMsi = false;

        for (let i = 0; i < pack.count; i++) {
            let tier;
            if (isMsiEvent && !gotMsi && pity >= MSI_PITY_TARGET - 1) {
                tier = 'MSI';
                gotMsi = true;
            } else {
                tier = rollFromDrops(drops);
            }
            if (isMsiEvent) {
                if (tier === 'MSI') { pity = 0; gotMsi = true; } else { pity++; }
            }
            let pool;
            if (SPECIAL_QUALS.has(tier)) {
                pool = db.filter(p => p.quality === tier);
            } else {
                pool = db.filter(p => p.quality === tier && !['POTY','ROTY','TOTY','GPOTY','X'].includes(p.quality));
            }
            if (pool.length === 0) pool = db.filter(p => p.quality === 'Bronze' || p.quality === 'Silver');
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const inst = { ...pick, uniqueId: makeUniqueId('pack_') };
            if (Math.random() < sigChance) { inst.signature = true; inst.locked = true; }
            if (Math.random() < holoChance) { inst.holographic = true; inst.locked = true; }
            pulled.push(inst);
        }
        if (isMsiEvent) { localStorage.setItem('lur_msi_pity', String(pity)); msiPityCount = pity; }

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
        trackStats.update(s => ({ ...s, packs: (s.packs || 0) + 1 }));
        grantXP(50);
        grantBPXP(30);
        playSound(sigsPulled > 0 ? 'rare' : holosPulled > 0 ? 'rare' : 'pack');
        pulledCards = pulled;
        pullTitle = `${pack.name} Pack Opened!`;
        showPulls = true;
        revealedCount = 0;
        pulled.forEach((_, i) => { setTimeout(() => { revealedCount = i + 1; }, 400 + i * 450); });
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
                const val = getSellValue(c.quality, c);
                totalBE += val;
                soldCount++;
                toSell.push(c);
            }
        });
        if (soldCount > 0) {
            club.update(cl => cl.filter(x => !toSell.some(s => s.uniqueId === x.uniqueId)));
            blueEssence.update(v => v + totalBE);
            saveGame();
            showToast(`Sold ${soldCount} cards for ${totalBE} BE`, 'info');
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
    {#if msiEventActive}
        <div class="event-banner event-active">
            <div class="eb-left">
                <span class="eb-live">LIVE</span>
                <div class="eb-info">
                    <div class="eb-title">MSI 2026 Event</div>
                    <div class="eb-desc">MSI Pack drop rates boosted! Guaranteed MSI card after {MSI_PITY_TARGET} pulls without one.</div>
                </div>
            </div>
            <div class="eb-right">
                <div class="eb-pity">
                    <span class="eb-pity-label">Pity Counter</span>
                    <span class="eb-pity-val">{msiPityCount}/{MSI_PITY_TARGET}</span>
                </div>
                <div class="eb-timer">
                    <span class="eb-timer-label">Ends in</span>
                    <span class="eb-timer-val">{eventTimeLeft}</span>
                </div>
            </div>
        </div>
    {:else}
        <div class="event-banner event-ended">
            <span class="eb-ended-icon">🌊</span>
            <div class="eb-info">
                <div class="eb-title" style="color: #475569;">MSI 2026 Event</div>
                <div class="eb-desc" style="color: #334155;">This event has ended. Stay tuned for the next one!</div>
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

    <!-- Packs Grid -->
    <div class="packs-header">Card Packs</div>
    <div class="packs-row">
        {#each allPacks as pack}
            <div class="pack" style="background: {pack.bg}; border-color: {pack.borderColor};">
                <div class="pack-foil"></div>
                <div class="pack-content">
                    <div class="pack-badge" style="color: {pack.color}; border-color: {pack.borderColor};">{pack.count} CARDS</div>
                    <div class="pack-title">{pack.name}</div>
                    <div class="pack-sub">{pack.sub}</div>
                    <div class="pack-best" style="color: {pack.color};">Best: {pack.drops[0].tier} ({pack.drops[0].pct}%)</div>
                </div>
                <div class="pack-buttons">
                    <button class="pack-btn pack-buy" style="border-color: {pack.borderColor};" on:click={() => buyPack(pack)}>💎 {pack.cost.toLocaleString()} BE</button>
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
                    <div class="pv-drop">
                        <span class="pvd-tier">{d.tier}</span>
                        <div class="pvd-bar"><div class="pvd-fill" style="width: {d.pct}%; background: {previewPack.color};"></div></div>
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

            <button class="pv-buy" style="background: {previewPack.color};" on:click={() => { buyPack(previewPack); previewPack = null; }}>
                Buy Pack · 💎 {previewPack.cost.toLocaleString()} BE
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
        background: linear-gradient(135deg, rgba(13,148,136,0.12), rgba(45,212,191,0.08));
        border: 1px solid rgba(45,212,191,0.3);
        animation: eventPulse 3s ease-in-out infinite;
    }
    @keyframes eventPulse {
        0%, 100% { border-color: rgba(45,212,191,0.3); }
        50% { border-color: rgba(45,212,191,0.6); }
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
    .pack-preview-btn { flex: 0 0 auto; background: transparent !important; font-size: 11px !important; }
    .pack-best { font-size: 10px; margin-top: 12px; font-weight: 700; }

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
    .pvd-tier { font-size: 12px; font-weight: 800; color: #e2e8f0; width: 80px; }
    .pvd-bar { flex: 1; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .pvd-fill { height: 100%; border-radius: 4px; }
    .pvd-pct { font-size: 12px; font-weight: 900; color: #94a3b8; width: 36px; text-align: right; }
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
