<script>
    import Card from '../card/Card.svelte';
    import { blueEssence, club, hasBoughtStarter, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { inspectingCard } from '../../stores/ui.js';
    import { getDB, rollPackTier, makeUniqueId, getSellValue } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    let pulledCards = [];
    let pullTitle = '';
    let showPulls = false;
    let revealedCount = 0;
    let lockedCards = new Set();

    const packs = [
        { id: 'standard', name: 'Standard', sub: 'Card Pack', desc: 'Best pull: Gold', cost: 100, count: 5, tier: 'Gold' },
        { id: 'premium', name: 'Premium', sub: 'Card Pack', desc: 'Best pull: Diamond', cost: 300, count: 5, tier: 'Diamond' },
        { id: 'elite', name: 'Elite', sub: 'Card Pack', desc: 'Best pull: Master', cost: 600, count: 5, tier: 'Master' },
    ];

    function buyPack(pack) {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        const be = get(blueEssence);
        if (be < pack.cost) { showToast('Not enough BE.', 'error'); return; }

        blueEssence.update(v => v - pack.cost);
        const pulled = [];

        for (let i = 0; i < pack.count; i++) {
            const tier = rollPackTier(pack.id);
            let pool = db.filter(p => p.quality === tier && !['Champion','MVP','Finalist','MSI','FirstStand','POTY','ROTY','TOTY','GPOTY','X'].includes(p.quality));
            if (pool.length === 0) pool = db.filter(p => p.quality === 'Bronze' || p.quality === 'Silver');
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const inst = { ...pick, uniqueId: makeUniqueId('pack_') };
            if (Math.random() < 0.02) { inst.holographic = true; inst.locked = true; }
            pulled.push(inst);
        }

        club.update(c => [...c, ...pulled]);
        collectionRegistry.update(reg => {
            const updated = { ...reg };
            pulled.forEach(c => { updated[c.id] = true; });
            return updated;
        });
        saveGame();
        playSound(pulled.some(c => c.holographic) ? 'rare' : 'pack');
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
    <div class="event-bar">
        <span class="event-dot"></span>
        <span class="event-label">No active event — limited-time events will appear here</span>
    </div>

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
        {#each packs as pack}
            <div class="pack pack-{pack.id}">
                <div class="pack-foil"></div>
                <div class="pack-content">
                    <div class="pack-badge">{pack.count} CARDS</div>
                    <div class="pack-title">{pack.name}</div>
                    <div class="pack-sub">{pack.sub}</div>
                    <div class="pack-tier">Best: {pack.tier}</div>
                </div>
                <button class="pack-btn" on:click={() => buyPack(pack)}>
                    💎 {pack.cost} BE
                </button>
            </div>
        {/each}
        {#each ['Champion','MVP','Finalist','MSI','Regional','First Stand'] as name}
            <div class="pack pack-locked">
                <div class="pack-content">
                    <div class="pack-badge">COMING SOON</div>
                    <div class="pack-title" style="font-size:18px;">{name}</div>
                    <div class="pack-sub">Card Pack</div>
                </div>
                <div class="pack-btn" style="opacity:.35;cursor:not-allowed;">🔒 Locked</div>
            </div>
        {/each}
    </div>
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
    .event-bar {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 20px; border-radius: 10px;
        background: rgba(12,16,28,0.4); border: 1px solid rgba(51,65,85,0.15);
        margin-bottom: 20px;
    }
    .event-dot { width: 6px; height: 6px; border-radius: 50%; background: #475569; flex-shrink: 0; }
    .event-label { font-size: 11px; color: #64748b; font-weight: 600; }

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

    .pack-standard { background: linear-gradient(170deg, #1a2332 0%, #0e1420 60%, #141c2a 100%); border-color: rgba(71,85,105,0.25); }
    .pack-standard:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
    .pack-premium { background: linear-gradient(170deg, #0e1a3a 0%, #0a1230 60%, #101b40 100%); border-color: rgba(59,130,246,0.2); }
    .pack-premium:hover { box-shadow: 0 12px 40px rgba(59,130,246,0.08), 0 0 20px rgba(59,130,246,0.06); }
    .pack-elite { background: linear-gradient(170deg, #1a0e3a 0%, #120a30 60%, #1c1040 100%); border-color: rgba(168,85,247,0.2); }
    .pack-elite:hover { box-shadow: 0 12px 40px rgba(168,85,247,0.08), 0 0 20px rgba(168,85,247,0.06); }

    .pack-locked { background: rgba(8,10,18,0.4); border-color: rgba(30,41,59,0.2); opacity:.45; }

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
    .pack-tier { font-size: 10px; color: #475569; margin-top: 12px; font-weight: 700; }

    .pack-btn {
        padding: 12px; margin: 0 14px 14px;
        border-radius: 12px; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: #f1f5f9; font-weight: 900; font-size: 13px;
        cursor: pointer; transition: all 0.12s; position: relative; z-index: 1;
        text-align: center;
    }
    .pack-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.14); }

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
