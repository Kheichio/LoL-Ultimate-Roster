<script>
    import Card from '../card/Card.svelte';

    export let player = null;
    export let onClose = () => {};
</script>

{#if player}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pm-overlay" on:click|self={onClose}>
    <div class="pm-modal" style="--tc: {player.teamColor || '#3b82f6'};">
        <div class="pm-bg"></div>

        <!-- Header -->
        <div class="pm-header">
            <div class="pm-avatar">{player.teamLogo || '🛡️'}</div>
            <div class="pm-info">
                <div class="pm-team">{player.teamName || 'Unknown'}</div>
                <div class="pm-name">{player.displayName || 'Anonymous'}</div>
                <div class="pm-title">{player.prestigeTitle || 'Scout'} · Lv {player.managerLevel || 1}</div>
            </div>
            <button class="pm-close" on:click={onClose}>✕</button>
        </div>

        <div class="pm-body">
            <!-- Primary Stats -->
            <div class="pm-stats-primary">
                {#each [
                    { label: 'Trophy Points', value: player.trophies || 0, icon: '🏆' },
                    { label: 'Total Power', value: player.totalPower || 0, icon: '⚡' },
                    { label: 'Raw Power', value: player.rawPower || 0, icon: '💪' },
                    { label: 'Blue Essence', value: (player.totalBE || 0).toLocaleString(), icon: '💎' },
                ] as stat}
                    <div class="pm-stat-tile">
                        <span class="pst-icon">{stat.icon}</span>
                        <span class="pst-value">{stat.value}</span>
                        <span class="pst-label">{stat.label}</span>
                    </div>
                {/each}
            </div>

            <!-- Detail Stats -->
            <div class="pm-stats-detail">
                {#each [
                    { label: 'Cards', value: player.clubSize || 0 },
                    { label: 'Signatures', value: player.signatureCards || 0 },
                    { label: 'Holographics', value: player.holographicCards || 0 },
                    { label: 'Splits', value: player.splitsCompleted || 0 },
                    { label: 'Golden Roads', value: player.goldenRoads || 0 },
                    { label: 'Tower Best', value: player.towerBest || 0 },
                ] as stat}
                    <div class="pm-detail-tile">
                        <span class="pdt-value">{stat.value}</span>
                        <span class="pdt-label">{stat.label}</span>
                    </div>
                {/each}
            </div>

            <!-- Career Record -->
            <div class="pm-section">
                <div class="pm-section-title">Career Record</div>
                <div class="pm-record-grid">
                    {#each [
                        { label: 'Cafe Wins', value: player.cafeWins || 0 },
                        { label: 'Regional Wins', value: player.regionalWins || 0 },
                        { label: 'MSI Wins', value: player.msiWins || 0 },
                        { label: 'Worlds Wins', value: player.worldsWins || 0 },
                        { label: 'Draft Wins', value: player.draftWins || 0 },
                        { label: 'Salary Cap', value: player.salaryWins || 0 },
                        { label: 'Total Losses', value: player.losses || 0 },
                        { label: 'Packs Opened', value: player.packsOpened || 0 },
                    ] as stat}
                        <div class="pm-record-row">
                            <span class="prr-label">{stat.label}</span>
                            <span class="prr-value">{stat.value}</span>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Favourite / Most Played -->
            {#if player.favouriteTeam || player.mostPlayedMode}
                <div class="pm-extras">
                    {#if player.favouriteTeam}
                        <div class="pm-extra">
                            <span class="pe-label">★ Favourite Team</span>
                            <span class="pe-value">{player.favouriteTeam}</span>
                        </div>
                    {/if}
                    {#if player.mostPlayedMode}
                        <div class="pm-extra">
                            <span class="pe-label">🎮 Most Played</span>
                            <span class="pe-value">{player.mostPlayedMode}</span>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Squad -->
            {#if player.squad && Object.values(player.squad).some(Boolean)}
                <div class="pm-section">
                    <div class="pm-section-title">Starting Roster</div>
                    <div class="pm-squad">
                        {#each ['TOP','JNG','MID','ADC','SUP','COACH'] as role}
                            {#if player.squad[role]}
                                <div class="pm-squad-slot">
                                    <Card card={player.squad[role]} mini={true} />
                                    <div class="pm-role-badge">{role}</div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Showcase -->
            {#if player.showcaseCards && player.showcaseCards.length > 0}
                <div class="pm-section">
                    <div class="pm-section-title">Card Showcase</div>
                    <div class="pm-showcase">
                        {#each player.showcaseCards as card}
                            <Card {card} mini={true} />
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <!-- Footer -->
        <div class="pm-footer">
            <button class="pm-close-btn" on:click={onClose}>Close</button>
        </div>
    </div>
</div>
{/if}

<style>
    .pm-overlay {
        position: fixed; inset: 0; z-index: 100;
        background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .pm-modal {
        position: relative; width: 100%; max-width: 700px;
        max-height: 90vh; overflow-y: auto;
        border-radius: 20px; border: 1px solid rgba(255,255,255,0.08);
        background: color-mix(in srgb, var(--tc) 12%, #0a0f1c);
        box-shadow: 0 25px 80px rgba(0,0,0,0.6);
    }
    .pm-bg {
        position: absolute; inset: 0; border-radius: 20px; pointer-events: none;
        background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--tc) 15%, transparent) 0%, transparent 60%);
    }

    /* Header */
    .pm-header {
        position: relative; display: flex; align-items: center; gap: 14px;
        padding: 24px 24px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .pm-avatar {
        width: 56px; height: 56px; border-radius: 16px;
        background: color-mix(in srgb, var(--tc) 20%, #0f172a);
        border: 2px solid var(--tc);
        display: flex; align-items: center; justify-content: center;
        font-size: 26px; flex-shrink: 0;
    }
    .pm-info { flex: 1; min-width: 0; }
    .pm-team { font-size: 20px; font-weight: 900; color: #f1f5f9; }
    .pm-name { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .pm-title { font-size: 11px; font-weight: 800; color: var(--tc); margin-top: 2px; }
    .pm-close {
        position: absolute; top: 16px; right: 16px;
        width: 32px; height: 32px; border-radius: 10px;
        background: rgba(51,65,85,0.3); border: 1px solid rgba(71,85,105,0.2);
        color: #64748b; font-size: 14px; font-weight: 700;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .pm-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }

    /* Body */
    .pm-body { position: relative; padding: 20px 24px; }

    /* Primary stats */
    .pm-stats-primary {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;
    }
    @media (max-width: 550px) { .pm-stats-primary { grid-template-columns: repeat(2, 1fr); } }
    .pm-stat-tile {
        background: rgba(0,0,0,0.25); border-radius: 12px; padding: 14px 8px;
        text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px;
    }
    .pst-icon { font-size: 18px; }
    .pst-value { font-size: 20px; font-weight: 900; color: #f1f5f9; }
    .pst-label { font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Detail stats */
    .pm-stats-detail {
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 16px;
    }
    @media (max-width: 550px) { .pm-stats-detail { grid-template-columns: repeat(3, 1fr); } }
    .pm-detail-tile {
        background: rgba(0,0,0,0.2); border-radius: 10px; padding: 10px 4px;
        text-align: center;
    }
    .pdt-value { display: block; font-size: 16px; font-weight: 900; color: #e2e8f0; }
    .pdt-label { display: block; font-size: 7px; font-weight: 700; color: #64748b; text-transform: uppercase; }

    /* Sections */
    .pm-section { margin-bottom: 16px; }
    .pm-section-title {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #64748b; margin-bottom: 10px;
    }

    /* Record grid */
    .pm-record-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;
    }
    @media (min-width: 550px) { .pm-record-grid { grid-template-columns: repeat(4, 1fr); } }
    .pm-record-row {
        display: flex; justify-content: space-between; align-items: center;
        background: rgba(0,0,0,0.2); padding: 8px 10px; border-radius: 8px;
        font-size: 11px;
    }
    .prr-label { color: #64748b; }
    .prr-value { font-weight: 800; color: #e2e8f0; }

    /* Extras */
    .pm-extras { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .pm-extra {
        background: rgba(0,0,0,0.2); border-radius: 12px; padding: 14px;
    }
    .pe-label { display: block; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: var(--tc); margin-bottom: 4px; }
    .pe-value { display: block; font-size: 14px; font-weight: 900; color: #f1f5f9; }

    /* Squad */
    .pm-squad { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .pm-squad-slot { position: relative; }
    .pm-role-badge {
        position: absolute; top: 0; left: 0; z-index: 10;
        background: rgba(30,27,75,0.9); color: #a5b4fc;
        font-size: 8px; font-weight: 900; padding: 2px 8px;
        border-radius: 14px 0 10px 0;
    }

    /* Showcase */
    .pm-showcase { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

    /* Footer */
    .pm-footer { position: relative; padding: 0 24px 20px; }
    .pm-close-btn {
        width: 100%; padding: 12px;
        background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.2);
        border-radius: 12px; color: #e2e8f0;
        font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.12s;
    }
    .pm-close-btn:hover { background: rgba(51,65,85,0.6); }
</style>
