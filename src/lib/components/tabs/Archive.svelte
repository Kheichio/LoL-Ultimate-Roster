<script>
    import Card from '../card/Card.svelte';
    import { collectionRegistry } from '../../stores/game.js';
    import { getDB, TIER_ORDER, LEGACY_TIERS, AWARD_TIERS, ALL_SPECIAL } from '../../utils/cards.js';

    let activeCategory = 'regular';
    let activeRegion = 'LCK';
    let search = '';
    let sortBy = 'team';

    const categories = [
        { id: 'regular', label: '⚔️ Regular Season', color: '#93c5fd', bg: 'rgba(37,99,235,0.2)', border: 'rgba(59,130,246,0.5)' },
        { id: 'firststand', label: '🟠 First Stand', color: '#fdba74', bg: 'rgba(234,88,12,0.2)', border: 'rgba(249,115,22,0.5)' },
        { id: 'msi', label: '🌊 MSI', color: '#5eead4', bg: 'rgba(13,148,136,0.2)', border: 'rgba(20,184,166,0.5)' },
        { id: 'finalists', label: '🥈 Finalists', color: '#cbd5e1', bg: 'rgba(100,116,139,0.2)', border: 'rgba(148,163,184,0.5)' },
        { id: 'champion', label: '🏆 Champion', color: '#fcd34d', bg: 'rgba(217,119,6,0.2)', border: 'rgba(245,158,11,0.5)' },
        { id: 'mvp', label: '✨ MVP', color: '#f9a8d4', bg: 'rgba(219,39,119,0.2)', border: 'rgba(236,72,153,0.5)' },
        { id: 'poty', label: '🌟 Player of Year', color: '#fca5a5', bg: 'rgba(220,38,38,0.2)', border: 'rgba(239,68,68,0.5)' },
        { id: 'roty', label: '🌱 Rookie of Year', color: '#67e8f9', bg: 'rgba(8,145,178,0.2)', border: 'rgba(6,182,212,0.5)' },
        { id: 'toty', label: '👑 Team of Year', color: '#fde047', bg: 'rgba(202,138,4,0.2)', border: 'rgba(234,179,8,0.5)' },
        { id: 'gpoty', label: '🌍 Global POTY', color: '#d8b4fe', bg: 'rgba(147,51,234,0.2)', border: 'rgba(168,85,247,0.5)' },
        { id: 'x', label: '✕ Community Pick', color: '#fda4af', bg: 'rgba(225,29,72,0.2)', border: 'rgba(244,63,94,0.5)' },
    ];

    const regions = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP'];
    const regionLabels = { LCK: '🇰🇷 LCK', LPL: '🇨🇳 LPL', LEC: '🇪🇺 LEC', LCS: '🇺🇸 LCS', LCP: '🌏 LCP' };

    const catToQuality = {
        firststand: 'FirstStand', msi: 'MSI', finalists: 'Finalist',
        champion: 'Champion', mvp: 'MVP',
        poty: 'POTY', roty: 'ROTY', toty: 'TOTY', gpoty: 'GPOTY', x: 'X'
    };

    $: db = getDB() || [];
    $: cards = (() => {
        let pool;
        if (activeCategory === 'regular') {
            pool = db.filter(c => !ALL_SPECIAL.includes(c.quality) && c.region === activeRegion && c.role !== 'COACH');
        } else {
            const qual = catToQuality[activeCategory];
            pool = qual ? db.filter(c => c.quality === qual) : [];
        }
        if (search) {
            const q = search.toLowerCase();
            pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q));
        }
        return pool;
    })();

    $: grouped = (() => {
        const groups = {};
        cards.forEach(c => {
            const key = c.team;
            if (!groups[key]) groups[key] = { team: key, cards: [], owned: 0 };
            groups[key].cards.push(c);
            if ($collectionRegistry[c.id]) groups[key].owned++;
        });
        let arr = Object.values(groups);
        if (sortBy === 'team') arr.sort((a, b) => a.team.localeCompare(b.team));
        else if (sortBy === 'completion') {
            arr.sort((a, b) => {
                const ap = a.cards.length > 0 ? a.owned / a.cards.length : 0;
                const bp = b.cards.length > 0 ? b.owned / b.cards.length : 0;
                if (ap === 1 && bp === 1) return a.team.localeCompare(b.team);
                if (ap === 1) return -1;
                if (bp === 1) return 1;
                return bp - ap;
            });
        } else if (sortBy === 'least') {
            arr.sort((a, b) => {
                const ap = a.cards.length > 0 ? a.owned / a.cards.length : 0;
                const bp = b.cards.length > 0 ? b.owned / b.cards.length : 0;
                if (ap === 0 && bp === 0) return a.team.localeCompare(b.team);
                if (ap === 0) return 1;
                if (bp === 0) return -1;
                return ap - bp;
            });
        }
        return arr;
    })();

    $: totalCards = cards.length;
    $: ownedCards = cards.filter(c => $collectionRegistry[c.id]).length;
    $: completionPct = totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 0;

    const roleOrder = { TOP: 1, JNG: 2, MID: 3, ADC: 4, SUP: 5, COACH: 6 };
</script>

<section class="archive">
    <div class="archive-header">
        <div>
            <h2 class="archive-title">Archive</h2>
            <p class="archive-subtitle">{ownedCards}/{totalCards} collected ({completionPct}%)</p>
        </div>
    </div>

    <!-- Category Tabs -->
    <div class="pill-bar">
        {#each categories as cat}
            <button
                class="pill"
                class:pill-inactive={activeCategory !== cat.id}
                style={activeCategory === cat.id ? `color: ${cat.color}; background: ${cat.bg}; border-color: ${cat.border};` : ''}
                on:click={() => { activeCategory = cat.id; }}
            >{cat.label}</button>
        {/each}
    </div>

    <!-- Region tabs (regular only) -->
    {#if activeCategory === 'regular'}
        <div class="region-bar">
            {#each regions as r}
                <button
                    class="region-tab"
                    class:region-active={activeRegion === r}
                    on:click={() => { activeRegion = r; }}
                >{regionLabels[r]}</button>
            {/each}
        </div>
    {/if}

    <!-- Search + Sort -->
    <div class="controls-bar">
        <input type="text" bind:value={search} placeholder="Search player or team..." class="input archive-search">
        <div class="sort-group">
            {#each [
                { value: 'team', label: 'Teams' },
                { value: 'completion', label: 'Completion' },
                { value: 'least', label: 'Least Cards' },
            ] as s}
                <button
                    class="sort-btn"
                    class:sort-active={sortBy === s.value}
                    on:click={() => { sortBy = s.value; }}
                >{s.label}</button>
            {/each}
        </div>
    </div>

    <!-- Card Grid by Team -->
    {#if grouped.length === 0}
        <div class="empty-state">
            <p>{search ? 'No cards match your search.' : 'No cards in this category yet.'}</p>
        </div>
    {:else}
        <div class="team-list">
            {#each grouped as group}
                {@const pct = group.cards.length > 0 ? Math.round((group.owned / group.cards.length) * 100) : 0}
                {@const isComplete = group.owned === group.cards.length && group.cards.length > 0}
                <div class="team-panel" class:team-complete={isComplete}>
                    <!-- Team Header -->
                    <div class="team-header">
                        <h3 class="team-name" class:team-name-complete={isComplete}>{group.team}</h3>
                        <span class="team-stats" class:team-stats-complete={isComplete}>
                            {isComplete ? '✓' : ''} {group.owned}/{group.cards.length} ({pct}%)
                        </span>
                    </div>
                    <!-- Cards -->
                    <div class="card-grid">
                        {#each group.cards.sort((a, b) => b.year !== a.year ? b.year - a.year : (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99)) as card (card.id)}
                            {@const isOwned = !!$collectionRegistry[card.id]}
                            <Card {card} mini={true} showOwned={true} owned={isOwned} />
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>

<style>
    .archive {
        padding: 8px 0 40px;
    }

    .archive-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
    }

    .archive-title {
        font-size: 22px;
        font-weight: 900;
        color: #fde68a;
        letter-spacing: 0.025em;
    }

    .archive-subtitle {
        font-size: 12px;
        color: #64748b;
        font-family: monospace;
    }

    /* ── Category pill bar ── */
    .pill-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 16px;
    }

    .pill {
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        background: none;
    }

    .pill-inactive {
        background: rgba(30, 41, 59, 0.8);
        border-color: transparent;
        color: #64748b;
    }

    .pill-inactive:hover {
        color: #e2e8f0;
        background: rgba(51, 65, 85, 0.6);
    }

    /* ── Region tabs ── */
    .region-bar {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
    }

    .region-tab {
        flex: 1;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        background: rgba(30, 41, 59, 0.8);
        color: #64748b;
    }

    .region-tab:hover {
        background: rgba(51, 65, 85, 0.6);
    }

    .region-active {
        background: rgba(37, 99, 235, 0.2);
        border-color: rgba(59, 130, 246, 0.5);
        color: #93c5fd;
    }

    /* ── Search + sort controls ── */
    .controls-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
        align-items: center;
    }

    .archive-search {
        flex: 1;
        min-width: 150px;
        padding: 8px 12px;
        font-size: 12px;
    }

    .sort-group {
        display: flex;
        gap: 4px;
    }

    .sort-btn {
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        background: rgba(30, 41, 59, 0.8);
        color: #64748b;
    }

    .sort-btn:hover {
        color: #e2e8f0;
    }

    .sort-active {
        background: rgba(71, 85, 105, 0.8);
        border-color: rgba(100, 116, 139, 0.6);
        color: #f1f5f9;
    }

    /* ── Empty state ── */
    .empty-state {
        text-align: center;
        padding: 64px 0;
    }

    .empty-state p {
        color: #475569;
        font-family: monospace;
        font-size: 14px;
    }

    /* ── Team panels ── */
    .team-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .team-panel {
        background: rgba(12, 16, 28, 0.5);
        padding: 16px;
        border-radius: 12px;
        border: 1px solid rgba(51, 65, 85, 0.2);
    }

    .team-complete {
        border-color: rgba(5, 150, 105, 0.4);
    }

    .team-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    }

    .team-name {
        font-size: 14px;
        font-weight: 900;
        color: #e2e8f0;
    }

    .team-name-complete {
        color: #34d399;
    }

    .team-stats {
        font-size: 10px;
        font-family: monospace;
        color: #64748b;
    }

    .team-stats-complete {
        color: #34d399;
    }

    /* ── Card grid ── */
    .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 10px;
        justify-items: center;
    }
</style>
