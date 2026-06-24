<script>
    import Card from '../card/Card.svelte';
    import { inspectingCard } from '../../stores/ui.js';
    import { club, squad, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { getDB, getEffectiveStats, TIER_COLORS } from '../../utils/cards.js';

    let rotX = 0, rotY = 0;

    function handleMouseMove(e) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        rotY = ((e.clientX - cx) / cx) * 12;
        rotX = ((cy - e.clientY) / cy) * 12;
    }

    function close() { inspectingCard.set(null); }

    $: card = $inspectingCard;
    $: ownedInstance = card ? $club.find(c => c.uniqueId === card.uniqueId) : null;
    $: isOwned = !!ownedInstance;
    $: isInSquad = card ? Object.values($squad).some(s => s && s.uniqueId === card.uniqueId) : false;
    $: isLocked = ownedInstance?.locked || false;
    $: isFav = ownedInstance?.favorite || false;

    $: altVersions = (() => {
        if (!card) return [];
        const db = getDB();
        if (!db) return [];
        return db.filter(c => c.name === card.name && c.id !== card.id);
    })();

    $: teamRoster = (() => {
        if (!card) return [];
        const db = getDB();
        if (!db) return [];
        return db.filter(c => c.team === card.team && c.year === card.year && c.id !== card.id)
            .sort((a, b) => b.rating - a.rating);
    })();

    $: ownedIds = new Set($club.map(c => c.id));

    function toggleLock() {
        if (!ownedInstance) return;
        ownedInstance.locked = !ownedInstance.locked;
        club.update(c => [...c]);
        saveGame();
        showToast(ownedInstance.locked ? 'Card locked.' : 'Card unlocked.', 'info');
    }

    function toggleFav() {
        if (!ownedInstance) return;
        ownedInstance.favorite = !ownedInstance.favorite;
        club.update(c => [...c]);
        saveGame();
    }

    function viewAlt(alt) {
        inspectingCard.set(alt);
    }

    let activeTab = 'details';
</script>

{#if card}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="overlay" on:click={close} on:mousemove={handleMouseMove}>
    <div class="modal" on:click|stopPropagation>
        <!-- Close -->
        <button class="close-x" on:click={close}>✕</button>

        <div class="modal-layout">
            <!-- LEFT: Card preview with tilt -->
            <div class="card-side">
                <div class="card-3d" style="transform: rotateY({rotY}deg) rotateX({rotX}deg); perspective: 800px;">
                    <Card {card} />
                </div>
                {#if isOwned}
                    <div class="card-actions">
                        <button class="act-btn" class:act-on={isFav} on:click={toggleFav}>
                            {isFav ? '★' : '☆'} {isFav ? 'Favourited' : 'Favourite'}
                        </button>
                        <button class="act-btn" class:act-lock={isLocked} on:click={toggleLock}>
                            {isLocked ? '🔒 Locked' : '🔓 Unlocked'}
                        </button>
                    </div>
                    {#if isInSquad}
                        <div class="squad-badge">In Starting Squad</div>
                    {/if}
                {/if}
            </div>

            <!-- RIGHT: Info panel -->
            <div class="info-side">
                <!-- Tabs -->
                <div class="info-tabs">
                    <button class="info-tab" class:tab-active={activeTab === 'details'} on:click={() => activeTab = 'details'}>Details</button>
                    {#if altVersions.length > 0}
                        <button class="info-tab" class:tab-active={activeTab === 'alts'} on:click={() => activeTab = 'alts'}>Versions ({altVersions.length})</button>
                    {/if}
                    {#if teamRoster.length > 0}
                        <button class="info-tab" class:tab-active={activeTab === 'roster'} on:click={() => activeTab = 'roster'}>Team Roster</button>
                    {/if}
                </div>

                <!-- Details Tab -->
                {#if activeTab === 'details'}
                    <div class="detail-grid">
                        <div class="detail-row">
                            <span class="d-label">Name</span>
                            <span class="d-value">{card.name}</span>
                        </div>
                        <div class="detail-row">
                            <span class="d-label">Team</span>
                            <span class="d-value">{card.team}</span>
                        </div>
                        <div class="detail-row">
                            <span class="d-label">Year</span>
                            <span class="d-value">{card.year}</span>
                        </div>
                        <div class="detail-row">
                            <span class="d-label">Role</span>
                            <span class="d-value">{card.role}</span>
                        </div>
                        <div class="detail-row">
                            <span class="d-label">Region</span>
                            <span class="d-value">{card.region}</span>
                        </div>
                        <div class="detail-row">
                            <span class="d-label">Tier</span>
                            <span class="d-value d-tier">{card.quality}</span>
                        </div>
                        <div class="detail-row">
                            <span class="d-label">Rating</span>
                            <span class="d-value d-rating">{card.rating}</span>
                        </div>
                        {#if card.holographic}
                            <div class="detail-row">
                                <span class="d-label">Special</span>
                                <span class="d-value d-holo">Holographic</span>
                            </div>
                        {/if}
                        {#if card.signature}
                            <div class="detail-row">
                                <span class="d-label">Special</span>
                                <span class="d-value d-sig">Signature</span>
                            </div>
                        {/if}
                    </div>

                    <div class="stats-title">Stats {card.signature || card.holographic ? `(+${(card.signature ? 2 : 0) + (card.holographic ? 1 : 0)} bonus)` : ''}</div>
                    {@const eStats = getEffectiveStats(card)}
                    <div class="stats-grid">
                        {#each [['MEC', eStats.mec], ['TMF', eStats.tmf], ['FRM', eStats.frm], ['CMP', eStats.cmp], ['MAP', eStats.map], ['LDR', eStats.ldr]] as [label, val]}
                            <div class="stat-bar-row">
                                <span class="sb-label">{label}</span>
                                <div class="sb-track"><div class="sb-fill" style="width: {val}%"></div></div>
                                <span class="sb-val">{val}</span>
                            </div>
                        {/each}
                    </div>

                <!-- Alt Versions Tab -->
                {:else if activeTab === 'alts'}
                    <div class="alt-list">
                        {#each altVersions as alt}
                            {@const tc = TIER_COLORS[alt.quality] || '#64748b'}
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div class="alt-row" style="border-left: 3px solid {tc};" on:click={() => viewAlt(alt)}>
                                <div class="alt-info">
                                    <span class="alt-name">{alt.team} [{alt.year}]</span>
                                    <span class="alt-tier" style="color: {tc};">{alt.quality} · {alt.role}</span>
                                </div>
                                <div class="alt-rating">{alt.rating}</div>
                                <div class="alt-owned">{ownedIds.has(alt.id) ? '✓' : ''}</div>
                            </div>
                        {/each}
                    </div>

                <!-- Team Roster Tab -->
                {:else if activeTab === 'roster'}
                    <div class="roster-header">{card.team} [{card.year}]</div>
                    <div class="alt-list">
                        {#each teamRoster as mate}
                            {@const tc = TIER_COLORS[mate.quality] || '#64748b'}
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div class="alt-row" style="border-left: 3px solid {tc};" on:click={() => viewAlt(mate)}>
                                <div class="alt-info">
                                    <span class="alt-name">{mate.name}</span>
                                    <span class="alt-tier" style="color: {tc};">{mate.role} · {mate.quality}</span>
                                </div>
                                <div class="alt-rating">{mate.rating}</div>
                                <div class="alt-owned">{ownedIds.has(mate.id) ? '✓' : ''}</div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>
{/if}

<style>
    .overlay {
        position: fixed; inset: 0; z-index: 150;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(12px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
    }
    .modal {
        position: relative;
        background: linear-gradient(170deg, #0d1224 0%, #0a0f1c 100%);
        border: 1px solid rgba(71,85,105,0.2);
        border-radius: 20px;
        max-width: 720px; width: 100%;
        max-height: 90vh; overflow-y: auto;
        box-shadow: 0 25px 80px rgba(0,0,0,0.6);
    }
    .close-x {
        position: absolute; top: 12px; right: 14px; z-index: 10;
        width: 32px; height: 32px; border-radius: 10px;
        background: rgba(51,65,85,0.3); border: 1px solid rgba(71,85,105,0.2);
        color: #64748b; font-size: 14px; font-weight: 700;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .close-x:hover { background: rgba(239,68,68,0.15); color: #f87171; }

    .modal-layout {
        display: flex; gap: 24px; padding: 28px;
    }
    @media (max-width: 680px) {
        .modal-layout { flex-direction: column; align-items: center; gap: 16px; padding: 20px; }
    }

    /* Card side */
    .card-side {
        flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .card-3d {
        transform-style: preserve-3d; transition: transform 0.08s ease-out;
    }
    .card-actions { display: flex; gap: 6px; width: 100%; }
    .act-btn {
        flex: 1; padding: 8px 6px; border-radius: 8px;
        font-size: 10px; font-weight: 800; cursor: pointer;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        color: #94a3b8; transition: all 0.12s; text-align: center;
    }
    .act-btn:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }
    .act-on { background: rgba(234,179,8,0.1); border-color: rgba(234,179,8,0.2); color: #fbbf24; }
    .act-lock { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.15); color: #f87171; }
    .squad-badge {
        font-size: 9px; font-weight: 900; color: #818cf8;
        background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.15);
        padding: 4px 14px; border-radius: 100px; text-transform: uppercase; letter-spacing: 1px;
    }

    /* Info side */
    .info-side { flex: 1; min-width: 0; }
    .info-tabs {
        display: flex; gap: 4px; margin-bottom: 16px;
        border-bottom: 1px solid rgba(51,65,85,0.2); padding-bottom: 8px;
    }
    .info-tab {
        padding: 6px 14px; border-radius: 8px;
        font-size: 11px; font-weight: 800; color: #475569;
        background: transparent; border: none; cursor: pointer; transition: all 0.1s;
    }
    .info-tab:hover { color: #94a3b8; }
    .tab-active { color: #93c5fd; background: rgba(59,130,246,0.08); }

    /* Details */
    .detail-grid { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .detail-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 10px; border-radius: 8px; background: rgba(15,23,42,0.3);
    }
    .d-label { font-size: 11px; font-weight: 700; color: #475569; }
    .d-value { font-size: 12px; font-weight: 800; color: #e2e8f0; }
    .d-tier { text-transform: uppercase; letter-spacing: 0.5px; }
    .d-rating { color: #60a5fa; font-size: 14px; }
    .d-holo { color: #fbbf24; }
    .d-sig { color: #c084fc; }

    /* Stats bars */
    .stats-title {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #475569; margin-bottom: 8px;
    }
    .stats-grid { display: flex; flex-direction: column; gap: 6px; }
    .stat-bar-row { display: flex; align-items: center; gap: 8px; }
    .sb-label { font-size: 10px; font-weight: 800; color: #64748b; width: 30px; }
    .sb-track {
        flex: 1; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden;
    }
    .sb-fill {
        height: 100%; border-radius: 4px;
        background: linear-gradient(90deg, #3b82f6, #6366f1);
        transition: width 0.4s ease;
    }
    .sb-val { font-size: 12px; font-weight: 900; color: #e2e8f0; width: 24px; text-align: right; }

    /* Alt versions & roster */
    .roster-header {
        font-size: 14px; font-weight: 900; color: #e2e8f0; margin-bottom: 12px;
    }
    .alt-list { display: flex; flex-direction: column; gap: 4px; }
    .alt-row {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; border-radius: 10px;
        background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15);
        cursor: pointer; transition: all 0.1s;
    }
    .alt-row:hover { background: rgba(30,41,59,0.4); border-color: rgba(59,130,246,0.15); }
    .alt-info { flex: 1; min-width: 0; }
    .alt-name { font-size: 12px; font-weight: 800; color: #e2e8f0; display: block; }
    .alt-tier { font-size: 10px; color: #475569; }
    .alt-rating { font-size: 16px; font-weight: 900; color: #60a5fa; }
    .alt-owned { font-size: 12px; color: #10b981; width: 16px; text-align: center; }
</style>
