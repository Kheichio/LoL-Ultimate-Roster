<script>
    import Card from '../card/Card.svelte';
    import { collectionRegistry, archiveRewards, blueEssence, battlePass, saveGame, grantXP } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, getEra, TIER_ORDER, LEGACY_TIERS, AWARD_TIERS, ALL_SPECIAL } from '../../utils/cards.js';

    let activeCategory = 'regular';
    let activeRegion = 'LCK';
    let search = '';
    let eraFilter = 'ALL';
    let sortBy = 'team';

    const ERA_OPTIONS = [
        { value: 1, label: 'Era 1 (2013 & earlier)' },
        { value: 2, label: 'Era 2 (2014-2016)' },
        { value: 3, label: 'Era 3 (2017-2019)' },
        { value: 4, label: 'Era 4 (2020-2022)' },
        { value: 5, label: 'Era 5 (2023-2025)' },
        { value: 6, label: 'Era 6 (2026+)' },
    ];

    $: claimedCards = ($archiveRewards && $archiveRewards.claimedCards) || {};
    $: claimedTeams = ($archiveRewards && $archiveRewards.claimedTeams) || {};

    $: viewCardIds = new Set(cards.map(c => c.id));
    $: unclaimedInView = Object.keys($collectionRegistry).filter(id =>
        $collectionRegistry[id] && !claimedCards[id] && viewCardIds.has(id)
    );
    $: unclaimedInViewCount = unclaimedInView.length;

    let qualityToCat = {};

    $: badgeCounts = (() => {
        const reg = $collectionRegistry;
        const cl = ($archiveRewards && $archiveRewards.claimedCards) || {};
        const counts = {};
        for (const card of db) {
            if (!reg[card.id] || cl[card.id]) continue;
            if (!ALL_SPECIAL.includes(card.quality)) {
                counts['regular'] = (counts['regular'] || 0) + 1;
                counts[`regular_${card.region}`] = (counts[`regular_${card.region}`] || 0) + 1;
            } else {
                const catId = qualityToCat[card.quality];
                if (catId) counts[catId] = (counts[catId] || 0) + 1;
            }
        }
        return counts;
    })();

    function getUnclaimedForFilter(catId, regionId) {
        const reg = $collectionRegistry;
        const cl = ($archiveRewards && $archiveRewards.claimedCards) || {};
        const ids = [];
        for (const card of db) {
            if (!reg[card.id] || cl[card.id]) continue;
            if (catId === 'regular') {
                if (!ALL_SPECIAL.includes(card.quality) && card.region === regionId) {
                    ids.push(card.id);
                }
            } else {
                const qual = catToQuality[catId];
                if (qual && card.quality === qual) ids.push(card.id);
            }
        }
        return ids;
    }

    function claimViewCards() {
        if (unclaimedInView.length === 0) return;
        const count = unclaimedInView.length;
        const reward = count * 25;
        blueEssence.update(v => v + reward);
        const toClaim = [...unclaimedInView];
        archiveRewards.update(ar => {
            const newClaimed = { ...ar.claimedCards };
            toClaim.forEach(id => newClaimed[id] = true);
            return { ...ar, claimedCards: newClaimed };
        });
        grantXP(count * 10);
        playSound('rare');
        saveGame();
        showToast(`Claimed ${count} new card rewards! +${reward} BE`, 'success');
    }

    function claimForCategory(catId, regionId) {
        const ids = getUnclaimedForFilter(catId, regionId);
        if (ids.length === 0) return;
        const reward = ids.length * 25;
        blueEssence.update(v => v + reward);
        archiveRewards.update(ar => {
            const newClaimed = { ...ar.claimedCards };
            ids.forEach(id => newClaimed[id] = true);
            return { ...ar, claimedCards: newClaimed };
        });
        grantXP(ids.length * 10);
        playSound('rare');
        saveGame();
        const label = catId === 'regular' ? regionId : categories.find(c => c.id === catId)?.label || catId;
        showToast(`Claimed ${ids.length} cards from ${label}! +${reward} BE`, 'success');
    }

    function getTeamReward(size) {
        if (size >= 11) return 2000;
        if (size >= 7) return 1000;
        if (size >= 4) return 500;
        return 200;
    }

    function makeTeamKey(group) {
        return `${activeCategory}_${activeCategory === 'regular' ? activeRegion : 'all'}_${group.team}`;
    }

    function claimTeamReward(group) {
        const key = makeTeamKey(group);
        if (claimedTeams[key]) return;
        const reward = getTeamReward(group.cards.length);
        blueEssence.update(v => v + reward);
        battlePass.update(bp => ({ ...bp, xp: (bp.xp || 0) + 100 }));
        archiveRewards.update(ar => ({
            ...ar,
            claimedTeams: { ...ar.claimedTeams, [key]: true }
        }));
        grantXP(50);
        playSound('rare');
        saveGame();
        showToast(`${group.team} complete! +${reward} BE +100 BP XP`, 'success');
    }

    const categories = [
        { id: 'regular', label: '⚔️ Regular Season', color: '#93c5fd', bg: 'rgba(37,99,235,0.2)', border: 'rgba(59,130,246,0.5)' },
        { id: 'firststand', label: '🟠 First Stand', color: '#fdba74', bg: 'rgba(234,88,12,0.2)', border: 'rgba(249,115,22,0.5)' },
        { id: 'msi', label: '🌊 MSI', color: '#5eead4', bg: 'rgba(13,148,136,0.2)', border: 'rgba(20,184,166,0.5)' },
        { id: 'finalists', label: '🥈 Finalists', color: '#cbd5e1', bg: 'rgba(100,116,139,0.2)', border: 'rgba(148,163,184,0.5)' },
        { id: 'champion', label: '🏆 Champion', color: '#fcd34d', bg: 'rgba(217,119,6,0.2)', border: 'rgba(245,158,11,0.5)' },
        { id: 'mvp', label: '✨ MVP', color: '#f9a8d4', bg: 'rgba(219,39,119,0.2)', border: 'rgba(236,72,153,0.5)' },
        { id: 'ewc', label: '🥇 EWC', color: '#ffd24a', bg: 'rgba(202,138,4,0.2)', border: 'rgba(255,210,74,0.5)' },
        { id: 'poty', label: '🌟 Player of Year', color: '#fca5a5', bg: 'rgba(220,38,38,0.2)', border: 'rgba(239,68,68,0.5)' },
        { id: 'roty', label: '🌱 Rookie of Year', color: '#67e8f9', bg: 'rgba(8,145,178,0.2)', border: 'rgba(6,182,212,0.5)' },
        { id: 'toty', label: '👑 Team of Year', color: '#fde047', bg: 'rgba(202,138,4,0.2)', border: 'rgba(234,179,8,0.5)' },
        { id: 'gpoty', label: '🌍 Global POTY', color: '#d8b4fe', bg: 'rgba(147,51,234,0.2)', border: 'rgba(168,85,247,0.5)' },
        { id: 'x', label: '✕ Community Pick', color: '#fda4af', bg: 'rgba(225,29,72,0.2)', border: 'rgba(244,63,94,0.5)' },
        { id: 'halloflegends', label: '🔥 Hall of Legends', color: '#f5c542', bg: 'rgba(255,0,51,0.2)', border: 'rgba(255,0,51,0.55)' },
    ];

    const regions = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP'];
    const regionLabels = { LCK: '🇰🇷 LCK', LPL: '🇨🇳 LPL', LEC: '🇪🇺 LEC', LCS: '🇺🇸 LCS', LCP: '🌏 LCP' };

    const catToQuality = {
        firststand: 'FirstStand', msi: 'MSI', finalists: 'Finalist',
        champion: 'Champion', mvp: 'MVP', ewc: 'EWC',
        poty: 'POTY', roty: 'ROTY', toty: 'TOTY', gpoty: 'GPOTY', x: 'X',
        halloflegends: 'Hall of Legends'
    };
    qualityToCat = Object.fromEntries(Object.entries(catToQuality).map(([k, v]) => [v, k]));

    $: db = getDB() || [];
    // Everything in the current category/region, before the browsing filters — the era dropdown
    // offers only the eras this pool actually contains.
    $: categoryPool = (() => {
        if (activeCategory === 'regular') {
            return db.filter(c => !ALL_SPECIAL.includes(c.quality) && c.region === activeRegion);
        }
        const qual = catToQuality[activeCategory];
        return qual ? db.filter(c => c.quality === qual) : [];
    })();
    $: eraOptions = ERA_OPTIONS.filter(e => categoryPool.some(c => getEra(c.year) === e.value));
    $: cards = (() => {
        let pool = categoryPool;
        if (search) {
            const q = search.toLowerCase();
            pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q) || String(c.year || '').includes(q));
        }
        if (eraFilter !== 'ALL') pool = pool.filter(c => getEra(c.year) === eraFilter);
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
        } else if (sortBy === 'year') {
            arr.sort((a, b) => {
                const maxA = Math.max(...a.cards.map(c => c.year || 0));
                const maxB = Math.max(...b.cards.map(c => c.year || 0));
                if (maxB !== maxA) return maxB - maxA;
                return a.team.localeCompare(b.team);
            });
        }
        return arr;
    })();

    $: totalCards = cards.length;
    $: ownedCards = cards.filter(c => $collectionRegistry[c.id]).length;
    $: completionPct = totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 0;

    $: fullTeamSizes = (() => {
        const sizes = {};
        let pool;
        if (activeCategory === 'regular') {
            pool = db.filter(c => !ALL_SPECIAL.includes(c.quality) && c.region === activeRegion);
        } else {
            const qual = catToQuality[activeCategory];
            pool = qual ? db.filter(c => c.quality === qual) : [];
        }
        pool.forEach(c => { sizes[c.team] = (sizes[c.team] || 0) + 1; });
        return sizes;
    })();

    $: fullTeamOwned = (() => {
        const owned = {};
        let pool;
        if (activeCategory === 'regular') {
            pool = db.filter(c => !ALL_SPECIAL.includes(c.quality) && c.region === activeRegion);
        } else {
            const qual = catToQuality[activeCategory];
            pool = qual ? db.filter(c => c.quality === qual) : [];
        }
        pool.forEach(c => { if ($collectionRegistry[c.id]) owned[c.team] = (owned[c.team] || 0) + 1; });
        return owned;
    })();

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
            >
                {cat.label}
                {#if badgeCounts[cat.id]}<span class="pill-badge">{badgeCounts[cat.id]}</span>{/if}
            </button>
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
                >
                    {regionLabels[r]}
                    {#if badgeCounts[`regular_${r}`]}<span class="pill-badge">{badgeCounts[`regular_${r}`]}</span>{/if}
                </button>
            {/each}
        </div>
    {/if}

    <!-- Claim banner for current view -->
    {#if activeCategory === 'regular' && badgeCounts[`regular_${activeRegion}`]}
        {@const cnt = badgeCounts[`regular_${activeRegion}`]}
        <div class="reward-banner">
            <div class="rb-info">
                <span class="rb-icon">🎁</span>
                <div>
                    <div class="rb-title">{cnt} New Card{cnt > 1 ? 's' : ''} Discovered!</div>
                    <div class="rb-desc">Claim {cnt * 25} BE for discovering new cards in {regionLabels[activeRegion]}</div>
                </div>
            </div>
            <button class="rb-btn" on:click={() => claimForCategory('regular', activeRegion)}>Claim All · +{cnt * 25} BE</button>
        </div>
    {:else if activeCategory !== 'regular' && badgeCounts[activeCategory]}
        {@const cnt = badgeCounts[activeCategory]}
        <div class="reward-banner">
            <div class="rb-info">
                <span class="rb-icon">🎁</span>
                <div>
                    <div class="rb-title">{cnt} New Card{cnt > 1 ? 's' : ''} Discovered!</div>
                    <div class="rb-desc">Claim {cnt * 25} BE for discovering new {categories.find(c => c.id === activeCategory)?.label || ''} cards</div>
                </div>
            </div>
            <button class="rb-btn" on:click={() => claimForCategory(activeCategory, null)}>Claim All · +{cnt * 25} BE</button>
        </div>
    {/if}

    <!-- Search + Sort -->
    <div class="controls-bar">
        <input type="text" bind:value={search} placeholder="Search player, team or year..." class="input archive-search">
        <select bind:value={eraFilter} class="input archive-era">
            <option value="ALL">All Eras</option>
            {#each eraOptions as e}
                <option value={e.value}>{e.label}</option>
            {/each}
        </select>
        <div class="sort-group">
            {#each [
                { value: 'team', label: 'Teams' },
                { value: 'year', label: 'Year' },
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
            <p>{search || eraFilter !== 'ALL' ? 'No cards match your search.' : 'No cards in this category yet.'}</p>
        </div>
    {:else}
        <div class="team-list">
            {#each grouped as group}
                {@const fullSize = fullTeamSizes[group.team] || group.cards.length}
                {@const fullOwned = fullTeamOwned[group.team] || 0}
                {@const pct = fullSize > 0 ? Math.round((fullOwned / fullSize) * 100) : 0}
                {@const isComplete = fullOwned === fullSize && fullSize > 0}
                <div class="team-panel" class:team-complete={isComplete}>
                    <!-- Team Header -->
                    <div class="team-header">
                        <div class="th-left">
                            <h3 class="team-name" class:team-name-complete={isComplete}>{group.team}</h3>
                            <span class="team-stats" class:team-stats-complete={isComplete}>
                                {isComplete ? '✓' : ''} {fullOwned}/{fullSize} ({pct}%)
                            </span>
                        </div>
                        {#if isComplete && !claimedTeams[makeTeamKey(group)]}
                            <button class="team-claim-btn" on:click={() => claimTeamReward(group)}>
                                Claim +{getTeamReward(group.cards.length)} BE
                            </button>
                        {:else if isComplete && claimedTeams[makeTeamKey(group)]}
                            <span class="team-claimed-tag">Claimed ✓</span>
                        {/if}
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

    /* ── Team claim button ── */
    .team-claim-btn {
        padding: 5px 14px; border-radius: 8px;
        background: linear-gradient(135deg, #059669, #10b981);
        border: none; color: white;
        font-size: 10px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 0.5px; cursor: pointer;
        transition: all 0.15s; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(16,185,129,0.2);
        animation: teamClaimPulse 2s ease-in-out infinite;
    }
    @keyframes teamClaimPulse {
        0%, 100% { box-shadow: 0 2px 8px rgba(16,185,129,0.2); }
        50% { box-shadow: 0 4px 16px rgba(16,185,129,0.4); }
    }
    .team-claim-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(16,185,129,0.4); }
    .team-claimed-tag {
        font-size: 9px; font-weight: 900; color: #34d399;
        text-transform: uppercase; letter-spacing: 1px;
        padding: 3px 10px; border-radius: 6px;
        background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15);
    }

    /* ── Reward banner ── */
    .reward-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 12px 16px; margin-bottom: 16px; border-radius: 12px;
        background: linear-gradient(135deg, rgba(234,179,8,0.08), rgba(245,158,11,0.12));
        border: 1px solid rgba(245,158,11,0.25);
        animation: rewardPulse 2s ease-in-out infinite;
    }
    @keyframes rewardPulse {
        0%, 100% { border-color: rgba(245,158,11,0.25); }
        50% { border-color: rgba(245,158,11,0.5); }
    }
    .rb-info { display: flex; align-items: center; gap: 10px; }
    .rb-icon { font-size: 22px; }
    .rb-title { font-size: 13px; font-weight: 900; color: #fbbf24; }
    .rb-desc { font-size: 10px; color: #a3873a; margin-top: 1px; }
    .rb-btn {
        padding: 8px 18px; border-radius: 10px;
        background: linear-gradient(135deg, #d97706, #f59e0b);
        border: none; color: #1c1917;
        font-size: 11px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 0.5px; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        box-shadow: 0 4px 12px rgba(245,158,11,0.2);
    }
    .rb-btn:hover { box-shadow: 0 6px 20px rgba(245,158,11,0.35); transform: translateY(-1px); }

    /* ── Category pill bar ── */
    .pill-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 16px;
        align-items: start;
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

    .pill-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 14px; height: 14px; padding: 0 3px;
        border-radius: 100px; font-size: 8px; font-weight: 900;
        background: #ef4444; color: white;
        margin-left: 4px; line-height: 1;
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
        align-items: start;
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

    .archive-era {
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 700;
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

    .th-left {
        display: flex;
        align-items: center;
        gap: 10px;
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
