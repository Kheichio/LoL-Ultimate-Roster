<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, collectionRegistry, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, makeUniqueId, TIER_ORDER, ALL_SPECIAL } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    const upgradePaths = [
        { from: 'Bronze', to: 'Silver', count: 10, cost: 50 },
        { from: 'Silver', to: 'Gold', count: 10, cost: 100 },
        { from: 'Gold', to: 'Platinum', count: 10, cost: 200 },
        { from: 'Platinum', to: 'Diamond', count: 8, cost: 400 },
        { from: 'Diamond', to: 'Master', count: 8, cost: 800 },
        { from: 'Master', to: 'Grandmaster', count: 5, cost: 1500 },
        { from: 'Grandmaster', to: 'Challenger', count: 5, cost: 3000 },
    ];

    const roles = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];
    const roleIcons = {
        TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png',
        ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png'
    };

    let selectedPath = upgradePaths[0];
    let selectedRole = 'TOP';
    let showResult = false;
    let resultCard = null;

    $: activeSquadIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));

    $: eligible = $club.filter(c =>
        c.quality === selectedPath.from &&
        c.role === selectedRole &&
        !activeSquadIds.has(c.uniqueId) &&
        !c.locked &&
        !ALL_SPECIAL.includes(c.quality)
    ).sort((a, b) => a.rating - b.rating);

    $: canUpgrade = eligible.length >= selectedPath.count && $blueEssence >= selectedPath.cost;

    $: pathCounts = (() => {
        const counts = {};
        upgradePaths.forEach(p => {
            const byRole = {};
            roles.forEach(r => {
                byRole[r] = $club.filter(c =>
                    c.quality === p.from && c.role === r &&
                    !activeSquadIds.has(c.uniqueId) && !c.locked && !ALL_SPECIAL.includes(c.quality)
                ).length;
            });
            counts[p.from] = byRole;
        });
        return counts;
    })();

    function performUpgrade() {
        if (!canUpgrade) return;

        const db = getDB();
        if (!db) return;

        const toConsume = eligible.slice(0, selectedPath.count);
        const consumeIds = new Set(toConsume.map(c => c.uniqueId));

        let pool = db.filter(p =>
            p.quality === selectedPath.to &&
            p.role === selectedRole &&
            !ALL_SPECIAL.includes(p.quality)
        );
        if (pool.length === 0) pool = db.filter(p => p.quality === selectedPath.to && !ALL_SPECIAL.includes(p.quality));
        if (pool.length === 0) { showToast('No cards available for this upgrade tier.', 'error'); return; }

        const pick = pool[Math.floor(Math.random() * pool.length)];
        const newCard = { ...pick, uniqueId: makeUniqueId('upg_') };

        club.update(c => [...c.filter(x => !consumeIds.has(x.uniqueId)), newCard]);
        collectionRegistry.update(reg => ({ ...reg, [newCard.id]: true }));
        blueEssence.update(v => v - selectedPath.cost);
        trackStats.update(s => ({ ...s, upgradesPerformed: (s.upgradesPerformed || 0) + 1 }));

        playSound('rare');
        resultCard = newCard;
        showResult = true;
        saveGame();
        showToast(`Upgraded to ${newCard.name} (${selectedPath.to})!`, 'success');
    }

    function closeResult() {
        showResult = false;
        resultCard = null;
    }
</script>

<section class="upgrade-page">
    <h2 class="page-title">Upgrade Lab</h2>
    <p class="page-subtitle">Combine cards of the same role and tier to forge a higher-tier card.</p>

    <div class="main-grid">
        <!-- Left: Upgrade Path Selector -->
        <div class="paths-column">
            <h3 class="section-label">Select Upgrade</h3>
            {#each upgradePaths as path}
                {@const isSelected = selectedPath.from === path.from}
                <button
                    class="path-btn"
                    class:path-btn--active={isSelected}
                    on:click={() => { selectedPath = path; }}
                >
                    <div class="path-btn__header">
                        <span class="path-btn__name" class:path-btn__name--active={isSelected}>
                            {path.from} → {path.to}
                        </span>
                        <span class="path-btn__cost">{path.cost} BE</span>
                    </div>
                    <div class="path-btn__req">
                        Requires {path.count} × {path.from} cards (same role)
                    </div>
                </button>
            {/each}
        </div>

        <!-- Center + Right: Role + Preview -->
        <div class="detail-column">
            <!-- Role Selector -->
            <div class="panel">
                <h3 class="section-label">Select Role</h3>
                <div class="role-grid">
                    {#each roles as role}
                        {@const count = pathCounts[selectedPath.from]?.[role] || 0}
                        {@const enough = count >= selectedPath.count}
                        <button
                            class="role-btn"
                            class:role-btn--active={selectedRole === role}
                            on:click={() => { selectedRole = role; }}
                        >
                            <img
                                src={roleIcons[role]}
                                alt={role}
                                class="role-btn__icon"
                                class:role-btn__icon--active={selectedRole === role}
                            >
                            <div class="role-btn__label" class:role-btn__label--active={selectedRole === role}>{role}</div>
                            <div class="role-btn__count" class:role-btn__count--enough={enough}>{count}/{selectedPath.count}</div>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Upgrade Summary -->
            <div class="panel panel--preview">
                <div class="preview-header">
                    <h3 class="section-label">Upgrade Preview</h3>
                </div>

                <div class="preview-visual">
                    <!-- From -->
                    <div class="preview-slot">
                        <div class="preview-card preview-card--from">
                            <div class="preview-card__count">{selectedPath.count}×</div>
                            <div class="preview-card__tier">{selectedPath.from}</div>
                        </div>
                        <div class="preview-slot__label">{selectedRole}</div>
                    </div>

                    <!-- Arrow -->
                    <div class="preview-arrow">
                        <div class="preview-arrow__icon">→</div>
                        <div class="preview-arrow__cost">{selectedPath.cost} BE</div>
                    </div>

                    <!-- To -->
                    <div class="preview-slot">
                        <div class="preview-card preview-card--to">
                            <div class="preview-card__mystery">?</div>
                            <div class="preview-card__tier preview-card__tier--to">{selectedPath.to}</div>
                        </div>
                        <div class="preview-slot__label preview-slot__label--to">Random {selectedRole}</div>
                    </div>
                </div>

                <!-- Status -->
                <div class="status-rows">
                    <div class="status-row">
                        <span class="status-row__label">Cards available</span>
                        <span class="status-row__value" class:status-row__value--ok={eligible.length >= selectedPath.count} class:status-row__value--bad={eligible.length < selectedPath.count}>{eligible.length} / {selectedPath.count}</span>
                    </div>
                    <div class="status-row">
                        <span class="status-row__label">Cost</span>
                        <span class="status-row__value" class:status-row__value--ok={$blueEssence >= selectedPath.cost} class:status-row__value--bad={$blueEssence < selectedPath.cost}>{selectedPath.cost} BE</span>
                    </div>
                    <div class="status-row">
                        <span class="status-row__label">Your balance</span>
                        <span class="status-row__value status-row__value--balance">{$blueEssence} BE</span>
                    </div>
                </div>

                <!-- Upgrade button -->
                <button
                    class="upgrade-btn"
                    class:upgrade-btn--ready={canUpgrade}
                    class:upgrade-btn--disabled={!canUpgrade}
                    disabled={!canUpgrade}
                    on:click={performUpgrade}
                >
                    {#if eligible.length < selectedPath.count}
                        Need {selectedPath.count - eligible.length} more {selectedPath.from} {selectedRole} cards
                    {:else if $blueEssence < selectedPath.cost}
                        Need {selectedPath.cost - $blueEssence} more BE
                    {:else}
                        Upgrade {selectedPath.count}× {selectedPath.from} → 1× {selectedPath.to}
                    {/if}
                </button>
            </div>

            <!-- Cards that would be consumed -->
            {#if eligible.length > 0}
                <div class="panel panel--eligible">
                    <h3 class="section-label eligible-heading">
                        Eligible Cards ({eligible.length})
                        {#if eligible.length >= selectedPath.count}
                            <span class="consumed-warning">— lowest {selectedPath.count} will be consumed</span>
                        {/if}
                    </h3>
                    <div class="eligible-grid">
                        {#each eligible as card, i (card.uniqueId)}
                            <div class="eligible-card-wrap">
                                <Card {card} mini={true} />
                                {#if i < selectedPath.count}
                                    <div class="consumed-overlay">
                                        <span class="consumed-badge">CONSUMED</span>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</section>

<!-- Result Overlay -->
{#if showResult && resultCard}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="result-overlay" on:click={closeResult}>
    <div class="result-title">Upgrade Complete!</div>
    <div class="animate-card-reveal">
        <Card card={resultCard} />
    </div>
    <button class="result-continue" on:click|stopPropagation={closeResult}>
        Continue
    </button>
</div>
{/if}

<style>
    /* ── Page Layout ── */
    .upgrade-page {
        max-width: 900px;
        margin: 0 auto;
        padding: 8px 0 40px;
    }

    .page-title {
        font-size: 22px;
        font-weight: 900;
        color: #eab308;
        letter-spacing: 0.05em;
        margin: 0 0 4px;
    }

    .page-subtitle {
        font-size: 12px;
        color: #64748b;
        margin: 0 0 20px;
    }

    .main-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
    }

    @media (min-width: 1024px) {
        .main-grid {
            grid-template-columns: 1fr 2fr;
        }
    }

    /* ── Section Label ── */
    .section-label {
        font-size: 10px;
        font-weight: 900;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin: 0 0 10px;
    }

    /* ── Panel ── */
    .panel {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 16px;
        padding: 16px;
    }

    .panel--preview {
        padding: 20px;
    }

    .panel--eligible {
        background: rgba(12, 16, 28, 0.35);
        border-color: rgba(51, 65, 85, 0.15);
    }

    /* ── Paths Column ── */
    .paths-column {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .paths-column > .section-label {
        margin-bottom: 0;
    }

    /* ── Detail Column ── */
    .detail-column {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    /* ── Path Buttons ── */
    .path-btn {
        width: 100%;
        text-align: left;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(51, 65, 85, 0.3);
        background: rgba(30, 41, 59, 0.4);
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }

    .path-btn:hover {
        background: rgba(51, 65, 85, 0.4);
    }

    .path-btn--active {
        background: rgba(113, 63, 18, 0.2);
        border-color: rgba(202, 138, 4, 0.4);
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.2);
    }

    .path-btn--active:hover {
        background: rgba(113, 63, 18, 0.25);
    }

    .path-btn__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
    }

    .path-btn__name {
        font-size: 12px;
        font-weight: 900;
        color: #cbd5e1;
    }

    .path-btn__name--active {
        color: #fde047;
    }

    .path-btn__cost {
        font-size: 9px;
        font-family: monospace;
        color: #64748b;
    }

    .path-btn__req {
        font-size: 9px;
        color: #64748b;
    }

    /* ── Role Grid ── */
    .role-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    }

    @media (min-width: 640px) {
        .role-grid {
            grid-template-columns: repeat(6, 1fr);
        }
    }

    .role-btn {
        padding: 12px;
        border-radius: 12px;
        text-align: center;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        border: 1px solid rgba(51, 65, 85, 0.4);
        background: rgba(30, 41, 59, 0.6);
    }

    .role-btn:hover {
        background: rgba(51, 65, 85, 0.5);
    }

    .role-btn--active {
        background: rgba(30, 58, 138, 0.3);
        border-color: rgba(59, 130, 246, 0.5);
    }

    .role-btn--active:hover {
        background: rgba(30, 58, 138, 0.35);
    }

    .role-btn__icon {
        width: 24px;
        height: 24px;
        margin: 0 auto 4px;
        opacity: 0.4;
    }

    .role-btn__icon--active {
        opacity: 1;
    }

    .role-btn__label {
        font-size: 10px;
        font-weight: 900;
        color: #64748b;
    }

    .role-btn__label--active {
        color: #93c5fd;
    }

    .role-btn__count {
        font-size: 9px;
        font-family: monospace;
        color: #475569;
    }

    .role-btn__count--enough {
        color: #34d399;
    }

    /* ── Preview Visual ── */
    .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
    }

    .preview-header .section-label {
        margin-bottom: 0;
    }

    .preview-visual {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin-bottom: 20px;
    }

    .preview-slot {
        text-align: center;
    }

    .preview-card {
        width: 80px;
        height: 112px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .preview-card--from {
        background: rgba(51, 65, 85, 0.4);
        border: 2px dashed #475569;
    }

    .preview-card--to {
        background: rgba(113, 63, 18, 0.2);
        border: 2px solid rgba(202, 138, 4, 0.4);
    }

    .preview-card__count {
        font-size: 18px;
        font-weight: 900;
        color: #64748b;
    }

    .preview-card__mystery {
        font-size: 18px;
        font-weight: 900;
        color: #eab308;
    }

    .preview-card__tier {
        font-size: 9px;
        font-weight: 700;
        color: #475569;
    }

    .preview-card__tier--to {
        color: #ca8a04;
    }

    .preview-slot__label {
        font-size: 9px;
        font-family: monospace;
        color: #64748b;
        margin-top: 4px;
    }

    .preview-slot__label--to {
        color: #eab308;
    }

    .preview-arrow {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }

    .preview-arrow__icon {
        font-size: 20px;
        color: #eab308;
    }

    .preview-arrow__cost {
        font-size: 9px;
        font-family: monospace;
        color: #64748b;
    }

    /* ── Status Rows ── */
    .status-rows {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
        font-size: 12px;
    }

    .status-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 8px;
        border-radius: 6px;
        background: rgba(15, 23, 42, 0.4);
    }

    .status-row__label {
        color: #64748b;
    }

    .status-row__value {
        font-weight: 700;
    }

    .status-row__value--ok {
        color: #34d399;
    }

    .status-row__value--bad {
        color: #f87171;
    }

    .status-row__value--balance {
        color: #60a5fa;
    }

    /* ── Upgrade Button ── */
    .upgrade-btn {
        width: 100%;
        padding: 12px;
        border-radius: 12px;
        font-weight: 900;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        cursor: pointer;
        transition: background 0.15s;
        border: none;
    }

    .upgrade-btn--ready {
        background: #ca8a04;
        color: #0f172a;
        box-shadow: 0 4px 12px rgba(202, 138, 4, 0.3);
    }

    .upgrade-btn--ready:hover {
        background: #eab308;
    }

    .upgrade-btn--disabled {
        background: #334155;
        color: #475569;
        cursor: not-allowed;
    }

    /* ── Eligible Cards ── */
    .eligible-heading {
        margin-bottom: 12px;
    }

    .consumed-warning {
        color: #f87171;
        margin-left: 4px;
    }

    .eligible-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
    }

    .eligible-card-wrap {
        position: relative;
    }

    .consumed-overlay {
        position: absolute;
        inset: 0;
        background: rgba(127, 29, 29, 0.4);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .consumed-badge {
        color: #fca5a5;
        font-size: 12px;
        font-weight: 900;
        background: rgba(69, 10, 10, 0.8);
        padding: 4px 8px;
        border-radius: 6px;
    }

    /* ── Result Overlay ── */
    .result-overlay {
        position: fixed;
        inset: 0;
        z-index: 80;
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(16px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }

    .result-title {
        font-size: 16px;
        font-weight: 900;
        color: #eab308;
        text-transform: uppercase;
        letter-spacing: 3px;
        margin-bottom: 24px;
    }

    .animate-card-reveal {
        animation: upgradeReveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .result-continue {
        margin-top: 24px;
        background: #334155;
        color: #e2e8f0;
        padding: 10px 32px;
        border-radius: 12px;
        font-weight: 900;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        cursor: pointer;
        transition: background 0.15s;
        border: none;
    }

    .result-continue:hover {
        background: #475569;
    }

    @keyframes upgradeReveal {
        from { opacity: 0; transform: scale(0.5) rotateY(90deg); }
        to { opacity: 1; transform: scale(1) rotateY(0deg); }
    }
</style>
