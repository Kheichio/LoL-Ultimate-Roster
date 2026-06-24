<script>
    import Card from '../card/Card.svelte';
    import { blueEssence, club, hasBoughtStarter, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { getDB, rollPackTier, makeUniqueId } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    let pulledCards = [];
    let pullTitle = '';
    let showPulls = false;
    let revealedCount = 0;

    const packs = [
        { id: 'standard', name: 'Standard', sub: 'Card Pack', desc: 'Best pull: Gold', cost: 100, count: 5, tier: 'Gold' },
        { id: 'premium', name: 'Premium', sub: 'Card Pack', desc: 'Best pull: Diamond', cost: 300, count: 5, tier: 'Diamond' },
        { id: 'elite', name: 'Elite', sub: 'Card Pack', desc: 'Best pull: Master', cost: 600, count: 5, tier: 'Master' },
    ];

    function buyPack(pack) {
        const db = getDB();
        if (!db) return;
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
        if (!db || get(hasBoughtStarter)) return;
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

    function closePulls() { showPulls = false; pulledCards = []; }
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
                    <div class="pack-title" style="font-size:18px;color:#1e293b;">{name}</div>
                    <div class="pack-sub" style="color:#1e293b;">Card Pack</div>
                </div>
                <div class="pack-btn" style="opacity:.25;cursor:not-allowed;">🔒 Locked</div>
            </div>
        {/each}
    </div>
</section>

<!-- Pull Overlay — horizontal scroll -->
{#if showPulls}
<div class="pull-overlay">
    <div class="pull-header">{pullTitle}</div>
    <div class="pull-scroll">
        <div class="pull-track">
            {#each pulledCards as card, i}
                {#if i < revealedCount}
                    <div class="pull-card-wrap pull-reveal">
                        <Card {card} />
                    </div>
                {:else}
                    <div class="pull-placeholder">
                        <span>?</span>
                    </div>
                {/if}
            {/each}
        </div>
    </div>
    {#if revealedCount >= pulledCards.length}
        <button class="pull-confirm" on:click={closePulls}>Confirm</button>
    {/if}
</div>
{/if}

<style>
    .store { padding-bottom: 40px; }

    /* Event */
    .event-bar {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 20px; border-radius: 10px;
        background: rgba(12,16,28,0.4); border: 1px solid rgba(51,65,85,0.12);
        margin-bottom: 20px;
    }
    .event-dot { width: 6px; height: 6px; border-radius: 50%; background: #334155; flex-shrink: 0; }
    .event-label { font-size: 11px; color: #334155; font-weight: 600; }

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
    .starter-desc { font-size: 11px; color: #475569; margin-top: 4px; }
    .starter-cta {
        flex-shrink: 0; padding: 12px 28px; border-radius: 12px;
        background: linear-gradient(135deg, #059669, #10b981); color: white;
        font-weight: 900; font-size: 14px; letter-spacing: 0.5px;
    }

    /* Packs */
    .packs-header { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #3d4a5c; margin-bottom: 14px; }
    .packs-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    @media (max-width: 900px) { .packs-row { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 550px) { .packs-row { grid-template-columns: 1fr; max-width: 260px; margin: 0 auto; } }

    .pack {
        position: relative; overflow: hidden;
        border-radius: 16px; border: 1px solid;
        display: flex; flex-direction: column;
        aspect-ratio: 3/4; min-height: 240px;
        transition: transform 0.15s, box-shadow 0.15s;
    }
    .pack:hover { transform: translateY(-4px); }

    .pack-standard { background: linear-gradient(170deg, #1a2332 0%, #0e1420 60%, #141c2a 100%); border-color: rgba(71,85,105,0.2); }
    .pack-standard:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
    .pack-premium { background: linear-gradient(170deg, #0e1a3a 0%, #0a1230 60%, #101b40 100%); border-color: rgba(59,130,246,0.15); }
    .pack-premium:hover { box-shadow: 0 12px 40px rgba(59,130,246,0.08), 0 0 20px rgba(59,130,246,0.06); }
    .pack-elite { background: linear-gradient(170deg, #1a0e3a 0%, #120a30 60%, #1c1040 100%); border-color: rgba(168,85,247,0.15); }
    .pack-elite:hover { box-shadow: 0 12px 40px rgba(168,85,247,0.08), 0 0 20px rgba(168,85,247,0.06); }

    .pack-locked { background: rgba(8,10,18,0.4); border-color: rgba(30,41,59,0.15); opacity:.5; }

    .pack-foil {
        position: absolute; inset: 0;
        background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px);
        pointer-events: none;
    }
    .pack-content {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 24px 16px; position: relative; z-index: 1;
    }
    .pack-badge {
        font-size: 8px; font-weight: 900; letter-spacing: 2px;
        color: #475569; background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.04); padding: 3px 12px;
        border-radius: 100px; margin-bottom: 20px;
    }
    .pack-title { font-size: 26px; font-weight: 900; color: #e2e8f0; letter-spacing: 1px; }
    .pack-sub { font-size: 11px; font-weight: 700; color: #475569; margin-top: 2px; letter-spacing: 2px; text-transform: uppercase; }
    .pack-tier { font-size: 10px; color: #334155; margin-top: 16px; font-weight: 600; }

    .pack-btn {
        padding: 14px; margin: 0 16px 16px;
        border-radius: 12px; background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        color: #e2e8f0; font-weight: 900; font-size: 14px;
        cursor: pointer; transition: all 0.12s; position: relative; z-index: 1;
        text-align: center;
    }
    .pack-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.1); }

    /* Pull Overlay */
    .pull-overlay {
        position: fixed; inset: 0; z-index: 80;
        background: rgba(4,6,14,0.95); backdrop-filter: blur(12px);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 24px;
    }
    .pull-header { font-size: 16px; font-weight: 900; color: #94a3b8; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 24px; }
    .pull-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; padding-bottom: 12px; }
    .pull-track { display: flex; gap: 16px; justify-content: center; min-width: min-content; padding: 0 24px; }
    .pull-card-wrap { flex-shrink: 0; }
    .pull-reveal { animation: cardPop 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
    @keyframes cardPop { from { opacity:0; transform:scale(0.6) rotateY(80deg); } to { opacity:1; transform:scale(1) rotateY(0); } }

    .pull-placeholder {
        width: 220px; height: 350px; flex-shrink: 0;
        background: linear-gradient(135deg, #080e1e, #0c1630, #080e1e);
        border-radius: 16px; border: 2px solid #1e293b;
        display: flex; align-items: center; justify-content: center;
        animation: phPulse 1.4s ease-in-out infinite;
    }
    .pull-placeholder span { font-size: 2.5rem; color: #1e293b; font-weight: 900; }
    @keyframes phPulse { 0%,100% { border-color: #1e293b; } 50% { border-color: #334155; } }

    .pull-confirm {
        margin-top: 28px; padding: 12px 40px; border-radius: 12px;
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        color: white; font-weight: 900; font-size: 13px; letter-spacing: 1px;
        border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(59,130,246,0.25);
        transition: all 0.15s;
    }
    .pull-confirm:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(59,130,246,0.4); }
</style>
