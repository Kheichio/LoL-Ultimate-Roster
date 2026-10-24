<script>
    import Card from '../card/Card.svelte';
    import LazyCardGrid from '../card/LazyCardGrid.svelte';
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { collectionRegistry, archiveRewards, blueEssence, grantBPXP, saveGame, grantXP } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, getEra, TIER_ORDER, LEGACY_TIERS, AWARD_TIERS, ALL_SPECIAL, HALL_OF_LEGENDS, TIER_COLORS } from '../../utils/cards.js';

    const roleOrder = { TOP: 1, JNG: 2, MID: 3, ADC: 4, SUP: 5, COACH: 6 };
    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };
    const CARD_BE = 25;     // per newly discovered card
    const CARD_XP = 10;

    let activeCategory = 'regular';
    let activeRegion = 'LCK';
    let search = '';
    let eraFilter = 'ALL';
    let sortBy = 'team';
    let showFilter = 'all';    // 'all' | 'owned' | 'missing' — shared by both views

    // ── Global Search ──────────────────────────────────────────────
    // Every card quality in the game, in display order (regular tiers, then legacy,
    // award and mythic special tiers). getDB() rewrites regular cards' quality via
    // ratingToQuality(), so grouping the whole DB by `quality` yields exactly these.
    const TYPE_ORDER = [...TIER_ORDER, ...ALL_SPECIAL];
    const TYPE_META = {
        Bronze: { icon: 'medal', label: 'Bronze' },
        Silver: { icon: 'medal', label: 'Silver' },
        Gold: { icon: 'medal', label: 'Gold' },
        Platinum: { icon: 'shield', label: 'Platinum' },
        Diamond: { icon: 'gem', label: 'Diamond' },
        Master: { icon: 'star', label: 'Master' },
        Grandmaster: { icon: 'flame', label: 'Grandmaster' },
        Challenger: { icon: 'crown', label: 'Challenger' },
        Champion: { icon: 'trophy', label: 'Worlds Champion' },
        MVP: { icon: 'sparkle', label: 'Finals MVP' },
        Finalist: { icon: 'medal', label: 'Worlds Finalist' },
        MSI: { icon: 'waves', label: 'MSI Champion' },
        FirstStand: { icon: 'flag', label: 'First Stand' },
        EWC: { icon: 'globe', label: 'EWC Champion' },
        POTY: { icon: 'star', label: 'Player of the Year' },
        ROTY: { icon: 'trend', label: 'Rookie of the Year' },
        TOTY: { icon: 'crown', label: 'Team of the Year' },
        GPOTY: { icon: 'globe', label: 'Global POTY' },
        X: { icon: 'friends', label: 'Community Pick' },
        [HALL_OF_LEGENDS]: { icon: 'flame', label: 'Hall of Legends' },
    };
    const ROLE_OPTIONS = ['ALL', 'TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'];

    let globalSearch = '';
    let globalRole = 'ALL';
    let globalType = 'ALL';

    function clearGlobal() { globalSearch = ''; globalRole = 'ALL'; globalType = 'ALL'; showFilter = 'all'; }
    function typeLabel(q) { return TYPE_META[q]?.label || q; }
    function typeIcon(q) { return TYPE_META[q]?.icon || 'cards'; }
    function typeColor(q) { return TIER_COLORS[q] || '#94a3b8'; }

    const ERA_OPTIONS = [
        { value: 1, label: 'Era 1 (2013 & earlier)' },
        { value: 2, label: 'Era 2 (2014-2016)' },
        { value: 3, label: 'Era 3 (2017-2019)' },
        { value: 4, label: 'Era 4 (2020-2022)' },
        { value: 5, label: 'Era 5 (2023-2025)' },
        { value: 6, label: 'Era 6 (2026+)' },
    ];
    const SORTS = [
        { value: 'team', label: 'A–Z' },
        { value: 'year', label: 'Newest' },
        { value: 'completion', label: 'Most complete' },
        { value: 'least', label: 'Least complete' },
    ];
    const SHOWS = [
        { value: 'all', label: 'All' },
        { value: 'owned', label: 'Owned' },
        { value: 'missing', label: 'Missing' },
    ];
    const passesShow = (c, reg) => showFilter === 'all' || (showFilter === 'owned' ? !!reg[c.id] : !reg[c.id]);

    $: claimedCards = ($archiveRewards && $archiveRewards.claimedCards) || {};
    $: claimedTeams = ($archiveRewards && $archiveRewards.claimedTeams) || {};

    let qualityToCat = {};

    $: badgeCounts = (() => {
        const reg = $collectionRegistry;
        const cl = ($archiveRewards && $archiveRewards.claimedCards) || {};
        const counts = {};
        for (const card of db) {
            if (!reg[card.id] || cl[card.id]) continue;
            counts.all = (counts.all || 0) + 1;
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
            if (catId === 'all') ids.push(card.id);
            else if (catId === 'regular') {
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

    function claimIds(ids, label) {
        if (ids.length === 0) return;
        const reward = ids.length * CARD_BE;
        blueEssence.update(v => v + reward);
        archiveRewards.update(ar => {
            const newClaimed = { ...ar.claimedCards };
            ids.forEach(id => newClaimed[id] = true);
            return { ...ar, claimedCards: newClaimed };
        });
        grantXP(ids.length * CARD_XP);
        playSound('rare');
        saveGame();
        showToast(`Claimed ${ids.length} card${ids.length === 1 ? '' : 's'}${label ? ` from ${label}` : ''}! +${reward.toLocaleString()} BE`, 'success');
    }

    function claimForCategory(catId, regionId) {
        const label = catId === 'all' ? '' : catId === 'regular' ? regionId : categories.find(c => c.id === catId)?.label || catId;
        claimIds(getUnclaimedForFilter(catId, regionId), label);
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

    // The reward is sized by the WHOLE team in this category (fullTeamSizes), never by the
    // filtered view — claiming with a search active used to pay for only the visible cards.
    function claimTeamReward(group) {
        const key = makeTeamKey(group);
        if (claimedTeams[key]) return;
        const reward = getTeamReward(fullTeamSizes[group.team] || group.cards.length);
        blueEssence.update(v => v + reward);
        // grantBPXP, not a raw xp write, so crossing 1,000 actually levels the pass.
        grantBPXP(100);
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
        { id: 'search', label: 'All cards', icon: 'search', c: '#e2e8f0' },
        { id: 'regular', label: 'Regular Season', icon: 'swords', c: '#60a5fa' },
        { id: 'firststand', label: 'First Stand', icon: 'flag', c: TIER_COLORS.FirstStand || '#fb923c' },
        { id: 'msi', label: 'MSI', icon: 'waves', c: TIER_COLORS.MSI || '#2dd4bf' },
        { id: 'finalists', label: 'Finalists', icon: 'medal', c: '#cbd5e1' },
        { id: 'champion', label: 'Champion', icon: 'trophy', c: TIER_COLORS.Champion || '#ecc766' },
        { id: 'mvp', label: 'MVP', icon: 'sparkle', c: TIER_COLORS.MVP || '#ec4899' },
        { id: 'ewc', label: 'EWC', icon: 'globe', c: '#ffd24a' },
        { id: 'poty', label: 'Player of Year', icon: 'star', c: '#f87171' },
        { id: 'roty', label: 'Rookie of Year', icon: 'trend', c: '#22d3ee' },
        { id: 'toty', label: 'Team of Year', icon: 'crown', c: '#fde047' },
        { id: 'gpoty', label: 'Global POTY', icon: 'globe', c: '#d8b4fe' },
        { id: 'x', label: 'Community Pick', icon: 'friends', c: '#fda4af' },
        { id: 'halloflegends', label: 'Hall of Legends', icon: 'flame', c: '#f5c542' },
    ];

    const regions = ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'];

    const catToQuality = {
        firststand: 'FirstStand', msi: 'MSI', finalists: 'Finalist',
        champion: 'Champion', mvp: 'MVP', ewc: 'EWC',
        poty: 'POTY', roty: 'ROTY', toty: 'TOTY', gpoty: 'GPOTY', x: 'X',
        halloflegends: 'Hall of Legends'
    };
    qualityToCat = Object.fromEntries(Object.entries(catToQuality).map(([k, v]) => [v, k]));

    $: db = getDB() || [];

    // Global search — spans the entire card database, grouped by type.
    $: globalOwned = db.filter(c => $collectionRegistry[c.id]).length;
    $: globalTotal = db.length;
    $: globalPct = globalTotal > 0 ? Math.round((globalOwned / globalTotal) * 100) : 0;
    $: typeStats = (() => {
        const stats = {};
        for (const c of db) {
            if (!stats[c.quality]) stats[c.quality] = { total: 0, owned: 0 };
            stats[c.quality].total++;
            if ($collectionRegistry[c.id]) stats[c.quality].owned++;
        }
        return stats;
    })();
    // Per-region stats for the regular season (non-special cards only).
    $: regionStats = (() => {
        const s = {};
        for (const c of db) {
            if (ALL_SPECIAL.includes(c.quality)) continue;
            if (!s[c.region]) s[c.region] = { total: 0, owned: 0 };
            s[c.region].total++;
            if ($collectionRegistry[c.id]) s[c.region].owned++;
        }
        return s;
    })();
    // One owned/total pair per category tile.
    $: catStats = (() => {
        const out = { search: { owned: globalOwned, total: globalTotal } };
        out.regular = Object.values(regionStats).reduce((a, r) => ({ owned: a.owned + r.owned, total: a.total + r.total }), { owned: 0, total: 0 });
        for (const [cat, q] of Object.entries(catToQuality)) out[cat] = typeStats[q] || { owned: 0, total: 0 };
        return out;
    })();
    $: typesPresent = TYPE_ORDER.filter(q => (typeStats[q]?.total || 0) > 0);
    // Owned/Missing alone doesn't count as a search: it carries over from the collection view,
    // and on its own it should still leave the browse-by-type grid up (the grid's tiles then
    // open that type filtered to it).
    $: globalActive = globalSearch.trim() !== '' || globalRole !== 'ALL' || globalType !== 'ALL';
    $: globalResults = (() => {
        if (!globalActive) return null;
        const q = globalSearch.trim().toLowerCase();
        const reg = $collectionRegistry;
        let pool = db;
        if (globalType !== 'ALL') pool = pool.filter(c => c.quality === globalType);
        if (globalRole !== 'ALL') pool = pool.filter(c => c.role === globalRole);
        if (showFilter !== 'all') pool = pool.filter(c => passesShow(c, reg));
        if (q) pool = pool.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.team.toLowerCase().includes(q) ||
            String(c.year || '').includes(q) ||
            (c.quality || '').toLowerCase().includes(q) ||
            (c.region || '').toLowerCase().includes(q) ||
            typeLabel(c.quality).toLowerCase().includes(q)
        );
        const groups = {};
        for (const c of pool) (groups[c.quality] = groups[c.quality] || []).push(c);
        return TYPE_ORDER.filter(t => groups[t]).map(t => ({
            type: t,
            cards: groups[t].sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.year || 0) - (a.year || 0)),
            owned: groups[t].filter(c => reg[c.id]).length,
        }));
    })();
    $: globalResultCount = globalResults ? globalResults.reduce((s, g) => s + g.cards.length, 0) : 0;

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
        const reg = $collectionRegistry;
        if (search) {
            const q = search.toLowerCase();
            pool = pool.filter(c => c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q) || String(c.year || '').includes(q));
        }
        if (eraFilter !== 'ALL') pool = pool.filter(c => getEra(c.year) === eraFilter);
        if (showFilter !== 'all') pool = pool.filter(c => passesShow(c, reg));
        return pool;
    })();
    $: anyFilter = !!search || eraFilter !== 'ALL' || showFilter !== 'all';
    function clearFilters() { search = ''; eraFilter = 'ALL'; showFilter = 'all'; }

    $: grouped = (() => {
        const groups = {};
        cards.forEach(c => {
            const key = c.team;
            if (!groups[key]) groups[key] = { team: key, cards: [], owned: 0 };
            groups[key].cards.push(c);
            if ($collectionRegistry[c.id]) groups[key].owned++;
        });
        let arr = Object.values(groups);
        // Sorted once here rather than inside the template, where it re-sorted (in place)
        // every group on every render.
        for (const g of arr) g.cards.sort((a, b) => b.year !== a.year ? b.year - a.year : (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
        // Completion sorts read the whole team (fullTeam*), so filtering never reorders them.
        const pctOf = (g) => (fullTeamSizes[g.team] ? (fullTeamOwned[g.team] || 0) / fullTeamSizes[g.team] : 0);
        if (sortBy === 'team') arr.sort((a, b) => a.team.localeCompare(b.team));
        else if (sortBy === 'completion') {
            arr.sort((a, b) => {
                const ap = pctOf(a), bp = pctOf(b);
                if (ap === 1 && bp === 1) return a.team.localeCompare(b.team);
                if (ap === 1) return -1;
                if (bp === 1) return 1;
                return bp - ap;
            });
        } else if (sortBy === 'least') {
            arr.sort((a, b) => {
                const ap = pctOf(a), bp = pctOf(b);
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

    $: poolTotal = categoryPool.length;
    $: poolOwned = categoryPool.filter(c => $collectionRegistry[c.id]).length;
    $: poolPct = poolTotal > 0 ? Math.round((poolOwned / poolTotal) * 100) : 0;

    // Team completion is measured against the whole category, not the filtered view, so a
    // search can't make a half-collected team read as complete. categoryPool is exactly that.
    $: fullTeamSizes = (() => {
        const sizes = {};
        categoryPool.forEach(c => { sizes[c.team] = (sizes[c.team] || 0) + 1; });
        return sizes;
    })();

    $: fullTeamOwned = (() => {
        const owned = {};
        categoryPool.forEach(c => { if ($collectionRegistry[c.id]) owned[c.team] = (owned[c.team] || 0) + 1; });
        return owned;
    })();
    $: teamsDone = Object.keys(fullTeamSizes).filter(t => (fullTeamOwned[t] || 0) === fullTeamSizes[t]).length;
    $: teamsTotal = Object.keys(fullTeamSizes).length;

    $: activeCat = categories.find(c => c.id === activeCategory) || categories[1];
    $: viewBadge = activeCategory === 'regular' ? (badgeCounts[`regular_${activeRegion}`] || 0) : (badgeCounts[activeCategory] || 0);
    $: viewLabel = activeCategory === 'regular' ? activeRegion : activeCat.label;
</script>

<section class="ar">
    <!-- ═══ Hero ═══ -->
    <header class="arh">
        <div class="arh-glow" aria-hidden="true"></div>
        <div class="arh-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="ring-bg" cx="60" cy="60" r="52" />
                <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {globalPct * 3.267} 999;" />
            </svg>
            <span class="rg-n">{globalPct}%</span>
            <span class="rg-l">collected</span>
        </div>
        <div class="arh-text">
            <span class="arh-eyebrow"><Icon name="archive" size={12} stroke={2.2} /> Archive</span>
            <h2 class="arh-title">The Archive</h2>
            <p class="arh-sub"><b>{globalOwned.toLocaleString()}</b> of {globalTotal.toLocaleString()} cards discovered. Every new card is worth {CARD_BE} BE, and a finished team pays a bonus.</p>
        </div>
        <div class="arh-claim" class:arh-claim-on={badgeCounts.all > 0}>
            {#if badgeCounts.all > 0}
                <span class="ac-label">{badgeCounts.all.toLocaleString()} new discover{badgeCounts.all === 1 ? 'y' : 'ies'}</span>
                <span class="ac-val"><Icon name="gem" size={16} stroke={2.2} /> {(badgeCounts.all * CARD_BE).toLocaleString()} BE</span>
                <button class="ac-btn" on:click={() => claimForCategory('all')} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>Claim all</button>
            {:else}
                <span class="ac-label">All caught up</span>
                <span class="ac-none">Open packs to discover new cards</span>
            {/if}
        </div>
    </header>

    <!-- ═══ Collections ═══ -->
    <nav class="cats" aria-label="Collections">
        {#each categories as cat (cat.id)}
            {@const s = catStats[cat.id] || { owned: 0, total: 0 }}
            {@const pct = s.total > 0 ? (s.owned / s.total) * 100 : 0}
            <button class="cat" title={cat.label} class:cat-on={activeCategory === cat.id} class:cat-done={s.total > 0 && s.owned === s.total} style="--c: {cat.c};" aria-pressed={activeCategory === cat.id} on:click={() => { activeCategory = cat.id; }}>
                <span class="cat-ico"><Icon name={cat.icon} size={16} stroke={2.1} /></span>
                <span class="cat-text">
                    <span class="cat-label">{cat.label}</span>
                    <span class="cat-count">{s.owned.toLocaleString()} / {s.total.toLocaleString()}{#if cat.id !== 'search' && badgeCounts[cat.id]}<span class="cat-new" title="{badgeCounts[cat.id]} new to claim">+{badgeCounts[cat.id] > 999 ? '999' : badgeCounts[cat.id]}</span>{/if}</span>
                </span>
                <span class="cat-bar"><span style="width: {pct}%;"></span></span>
            </button>
        {/each}
    </nav>

    {#if activeCategory === 'search'}
        <!-- ═══ All cards: search across every type ═══ -->
        <div class="tb">
            <div class="tb-row">
                <label class="tb-search">
                    <Icon name="search" size={16} stroke={2.2} />
                    <input type="text" bind:value={globalSearch} placeholder="Search every card — name, team, year, tier or region" aria-label="Search every card">
                    {#if globalSearch}<button class="tb-clear" aria-label="Clear search" on:click={() => globalSearch = ''}><Icon name="close" size={12} stroke={2.6} /></button>{/if}
                </label>
                <div class="seg" role="group" aria-label="Role">
                    {#each ROLE_OPTIONS as r}
                        <button class="sg" class:sg-on={globalRole === r} title={r} aria-label={r} on:click={() => globalRole = r}>
                            {#if r === 'ALL'}All{:else}<img src={ROLE_ICONS[r]} alt=""><span class="sg-l">{r}</span>{/if}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="tb-row tb-row2">
                <div class="seg" role="group" aria-label="Show">
                    {#each SHOWS as s}<button class="sg" class:sg-on={showFilter === s.value} on:click={() => showFilter = s.value}>{s.label}</button>{/each}
                </div>
                {#if globalActive}
                    <span class="tb-count"><b>{globalResultCount.toLocaleString()}</b> card{globalResultCount === 1 ? '' : 's'}{globalType !== 'ALL' ? ` · ${typeLabel(globalType)}` : ''}{globalRole !== 'ALL' ? ` · ${globalRole}` : ''}</span>
                    <button class="tb-reset" on:click={clearGlobal}><Icon name="close" size={11} stroke={2.6} /> Clear</button>
                {/if}
            </div>
        </div>

        {#if !globalActive}
            <div class="sec-head"><span class="sec-title">Browse by type</span><span class="sec-note">Pick a type to see every card in it, or search above</span></div>
            <div class="types">
                {#each typesPresent as t}
                    {@const s = typeStats[t]}
                    {@const pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0}
                    <button class="ty" style="--c: {typeColor(t)};" on:click={() => globalType = t}>
                        <span class="ty-ico"><Icon name={typeIcon(t)} size={18} stroke={2} /></span>
                        <span class="ty-label">{typeLabel(t)}</span>
                        <span class="ty-count">{s.owned} / {s.total}<span class="ty-pct">{pct}%</span></span>
                        <span class="ty-bar"><span style="width: {pct}%;"></span></span>
                    </button>
                {/each}
            </div>
        {:else if globalResults && globalResults.length > 0}
            <div class="results">
                {#each globalResults as grp, gi (grp.type)}
                    <section class="team" style="--c: {typeColor(grp.type)};">
                        <div class="team-head">
                            <span class="th-ico"><Icon name={typeIcon(grp.type)} size={15} stroke={2.2} /></span>
                            <span class="team-name" style="color: {typeColor(grp.type)};">{typeLabel(grp.type)}</span>
                            <span class="team-count">{grp.owned} / {grp.cards.length} owned</span>
                        </div>
                        <LazyCardGrid items={grp.cards} eager={gi === 0 ? 1 : 0} let:item={card}>
                            <Card {card} mini={true} showOwned={true} owned={!!$collectionRegistry[card.id]} />
                        </LazyCardGrid>
                    </section>
                {/each}
            </div>
        {:else}
            <div class="empty">
                <span class="empty-ico"><Icon name="search" size={24} /></span>
                <span class="empty-t">No cards match</span>
                <span class="empty-s">Try a different search, or clear your filters.</span>
                <button class="empty-btn" on:click={clearGlobal}>Clear filters</button>
            </div>
        {/if}
    {:else}
        <!-- ═══ A collection ═══ -->
        <div class="view-head" style="--c: {activeCat.c};">
            <span class="vh-ico"><Icon name={activeCat.icon} size={18} stroke={2.1} /></span>
            <div class="vh-text">
                <span class="vh-title">{activeCategory === 'regular' ? `Regular Season · ${activeRegion}` : activeCat.label}</span>
                <span class="vh-sub">{poolOwned} / {poolTotal} cards ({poolPct}%) · {teamsDone} of {teamsTotal} team{teamsTotal === 1 ? '' : 's'} complete</span>
            </div>
            <div class="vh-bar"><div style="width: {poolPct}%;"></div></div>
        </div>

        {#if activeCategory === 'regular'}
            <div class="regions" role="group" aria-label="Region">
                {#each regions as r}
                    {@const s = regionStats[r] || { owned: 0, total: 0 }}
                    <button class="rg" class:rg-on={activeRegion === r} aria-pressed={activeRegion === r} on:click={() => { activeRegion = r; }}>
                        <span class="rg-text"><span class="rg-name">{r}</span><span class="rg-count">{s.owned} / {s.total}</span></span>
                        {#if badgeCounts[`regular_${r}`]}<span class="cat-badge">{badgeCounts[`regular_${r}`]}</span>{/if}
                    </button>
                {/each}
            </div>
        {/if}

        {#if viewBadge > 0}
            <div class="claim">
                <span class="cl-ico"><Icon name="gift" size={18} stroke={2.1} /></span>
                <span class="cl-text"><b>{viewBadge} new card{viewBadge === 1 ? '' : 's'} discovered</b> in {viewLabel} — {CARD_BE} BE each.</span>
                <button class="cl-btn" on:click={() => activeCategory === 'regular' ? claimForCategory('regular', activeRegion) : claimForCategory(activeCategory, null)} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>
                    Claim · <Icon name="gem" size={13} stroke={2.3} /> {(viewBadge * CARD_BE).toLocaleString()}
                </button>
            </div>
        {/if}

        <div class="tb">
            <div class="tb-row">
                <label class="tb-search">
                    <Icon name="search" size={16} stroke={2.2} />
                    <input type="text" bind:value={search} placeholder="Search player, team or year" aria-label="Search this collection">
                    {#if search}<button class="tb-clear" aria-label="Clear search" on:click={() => search = ''}><Icon name="close" size={12} stroke={2.6} /></button>{/if}
                </label>
                <select class="sel" bind:value={eraFilter} aria-label="Era">
                    <option value="ALL">All eras</option>
                    {#each eraOptions as e}<option value={e.value}>{e.label}</option>{/each}
                </select>
            </div>
            <div class="tb-row tb-row2">
                <div class="seg" role="group" aria-label="Show">
                    {#each SHOWS as s}<button class="sg" class:sg-on={showFilter === s.value} on:click={() => showFilter = s.value}>{s.label}</button>{/each}
                </div>
                <div class="seg" role="group" aria-label="Sort teams">
                    {#each SORTS as s}<button class="sg" class:sg-on={sortBy === s.value} on:click={() => { sortBy = s.value; }}>{s.label}</button>{/each}
                </div>
                {#if anyFilter}<button class="tb-reset" on:click={clearFilters}><Icon name="close" size={11} stroke={2.6} /> Clear filters</button>{/if}
            </div>
        </div>

        {#if grouped.length === 0}
            <div class="empty">
                <span class="empty-ico"><Icon name={anyFilter ? 'search' : 'archive'} size={24} /></span>
                {#if showFilter === 'missing' && !search && eraFilter === 'ALL'}
                    <span class="empty-t">Nothing missing</span>
                    <span class="empty-s">You own every card in this collection.</span>
                {:else if anyFilter}
                    <span class="empty-t">No cards match</span>
                    <span class="empty-s">Try a different search, or clear your filters.</span>
                    <button class="empty-btn" on:click={clearFilters}>Clear filters</button>
                {:else}
                    <span class="empty-t">No cards here yet</span>
                {/if}
            </div>
        {:else}
            <div class="teams">
                {#each grouped as group, gi (activeCategory + '|' + activeRegion + '|' + group.team)}
                    {@const fullSize = fullTeamSizes[group.team] || group.cards.length}
                    {@const fullOwned = fullTeamOwned[group.team] || 0}
                    {@const pct = fullSize > 0 ? Math.round((fullOwned / fullSize) * 100) : 0}
                    {@const isComplete = fullOwned === fullSize && fullSize > 0}
                    {@const isClaimed = !!claimedTeams[makeTeamKey(group)]}
                    {@const reward = getTeamReward(fullSize)}
                    <section class="team" class:team-done={isComplete} style="--c: {isComplete ? '#34d399' : activeCat.c};">
                        <div class="team-head">
                            <span class="team-name">{group.team}</span>
                            <span class="team-count">{#if isComplete}<Icon name="check" size={12} stroke={3} />{/if} {fullOwned} / {fullSize}</span>
                            <div class="team-bar"><div style="width: {pct}%;"></div></div>
                            {#if isComplete && !isClaimed}
                                <button class="team-claim" on:click={() => claimTeamReward(group)} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>Claim <Icon name="gem" size={12} stroke={2.4} /> {reward.toLocaleString()}</button>
                            {:else if isComplete}
                                <span class="team-claimed"><Icon name="check" size={12} stroke={2.8} /> Claimed</span>
                            {:else}
                                <span class="team-reward">Complete for <Icon name="gem" size={11} stroke={2.3} /> {reward.toLocaleString()}</span>
                            {/if}
                        </div>
                        <!-- The first two teams mount straight away so the top of the page is never
                             blank for a frame; everything further down waits for the scroll. -->
                        <LazyCardGrid items={group.cards} eager={gi < 2 ? 1 : 0} let:item={card}>
                            <Card {card} mini={true} showOwned={true} owned={!!$collectionRegistry[card.id]} />
                        </LazyCardGrid>
                    </section>
                {/each}
            </div>
        {/if}
    {/if}
</section>

<style>
    .ar { display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; }

    /* ── Hero ── */
    .arh {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(253,230,138,0.14), transparent 65%), linear-gradient(120deg, #15130b, #0b0e1a 60%);
        border: 1px solid rgba(253,230,138,0.25);
    }
    .arh-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(96,165,250,0.1), transparent 65%); }
    .arh-ring { position: relative; width: 112px; height: 112px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .arh-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 10; }
    .ring-fg { fill: none; stroke: #fcd34d; stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(252,211,77,0.55)); transition: stroke-dasharray 0.6s ease; }
    .rg-n { position: relative; font-size: 26px; font-weight: 900; color: #fefce8; line-height: 1; font-variant-numeric: tabular-nums; }
    .rg-l { position: relative; font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #a1a1aa; margin-top: 4px; }
    .arh-text { position: relative; flex: 1; min-width: 240px; }
    .arh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #fcd34d; }
    .arh-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .arh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 560px; }
    .arh-sub b { color: #fef3c7; }
    .arh-claim { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding: 14px 18px; border-radius: 18px; min-width: 210px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.15); }
    .arh-claim-on { border-color: rgba(52,211,153,0.4); background: radial-gradient(circle at 100% 0%, rgba(52,211,153,0.18), transparent 70%), rgba(2,6,23,0.5); }
    .ac-label { font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
    .arh-claim-on .ac-label { color: #34d399; }
    .ac-val { display: inline-flex; align-items: center; gap: 6px; font-size: 22px; font-weight: 900; color: #ecfdf5; }
    .ac-none { font-size: 12px; color: #64748b; }
    .ac-btn { position: relative; overflow: hidden; margin-top: 4px; padding: 11px 22px; border-radius: 13px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 6px 20px rgba(16,185,129,0.4); animation: acPulse 2.2s ease-in-out infinite; }
    .ac-btn:hover { transform: translateY(-1px); }
    @keyframes acPulse { 50% { box-shadow: 0 6px 28px rgba(16,185,129,0.7); } }

    /* ── Collection tiles ── */
    .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .cat {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 10px; padding: 10px 12px 13px; border-radius: 14px; cursor: pointer; text-align: left;
        background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); transition: border-color 0.15s, background 0.15s, transform 0.15s;
    }
    .cat:hover { border-color: color-mix(in srgb, var(--c) 45%, transparent); transform: translateY(-1px); }
    .cat-on { background: linear-gradient(140deg, color-mix(in srgb, var(--c) 18%, transparent), rgba(12,16,28,0.75)); border-color: color-mix(in srgb, var(--c) 65%, transparent); box-shadow: 0 8px 22px color-mix(in srgb, var(--c) 14%, transparent); }
    .cat-ico { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .cat-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .cat-label { font-size: 12px; font-weight: 900; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cat-on .cat-label { color: #fff; }
    .cat-count { font-size: 10px; font-weight: 700; color: #64748b; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cat-new { margin-left: 6px; padding: 0 6px; border-radius: 100px; font-size: 9px; font-weight: 900; color: #fff; background: #ef4444; }
    .cat-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 100px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; color: #fff; background: #ef4444; box-shadow: 0 2px 8px rgba(239,68,68,0.45); flex-shrink: 0; }
    .cat-bar { position: absolute; left: 12px; right: 12px; bottom: 6px; height: 3px; border-radius: 3px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .cat-bar span { display: block; height: 100%; border-radius: 3px; background: var(--c); }
    .cat-done .cat-count { color: #34d399; }

    /* ── Collection header + regions ── */
    .view-head { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 12px; row-gap: 10px; align-items: center; padding: 14px 16px; border-radius: 18px; background: linear-gradient(150deg, color-mix(in srgb, var(--c) 10%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 60%); border: 1px solid color-mix(in srgb, var(--c) 28%, rgba(71,85,105,0.25)); }
    .vh-ico { grid-row: 1 / span 2; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 32%, transparent); }
    .vh-text { display: flex; flex-direction: column; }
    .vh-title { font-size: 18px; font-weight: 900; color: #fff; }
    .vh-sub { font-size: 12px; color: #94a3b8; }
    .vh-bar { height: 6px; border-radius: 6px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .vh-bar div { height: 100%; border-radius: 6px; background: var(--c); transition: width 0.5s; }
    .regions { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .rg { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 13px; cursor: pointer; text-align: left; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.28); }
    .rg:hover { border-color: rgba(96,165,250,0.45); }
    .rg-on { background: rgba(37,99,235,0.18); border-color: rgba(96,165,250,0.65); }
    .rg-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .rg-name { font-size: 13px; font-weight: 900; color: #cbd5e1; }
    .rg-on .rg-name { color: #fff; }
    .rg-count { font-size: 10px; font-weight: 700; color: #64748b; font-variant-numeric: tabular-nums; }

    /* ── Claim banner ── */
    .claim { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; border-radius: 16px; background: linear-gradient(90deg, rgba(16,185,129,0.14), rgba(12,16,28,0.6) 70%); border: 1px solid rgba(52,211,153,0.4); }
    .cl-ico { width: 34px; height: 34px; border-radius: 11px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #052e16; background: #34d399; }
    .cl-text { flex: 1; font-size: 13px; color: #a7f3d0; }
    .cl-text b { color: #fff; }
    .cl-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 12px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 6px 18px rgba(16,185,129,0.35); white-space: nowrap; }
    .cl-btn:hover { transform: translateY(-1px); }

    /* ── Toolbar ── */
    .tb { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 20px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .tb-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .tb-search { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 9px; padding: 0 12px; height: 42px; border-radius: 13px; color: #64748b; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.35); transition: border-color 0.15s; }
    .tb-search:focus-within { border-color: rgba(252,211,77,0.55); color: #fcd34d; }
    .tb-search input { flex: 1; min-width: 0; height: 100%; background: none; border: none; outline: none; color: #e2e8f0; font-size: 13px; font-weight: 600; }
    .tb-search input::placeholder { color: #475569; }
    .tb-clear { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #94a3b8; background: rgba(71,85,105,0.35); border: none; }
    .tb-clear:hover { color: #fff; background: rgba(100,116,139,0.6); }
    .seg { display: flex; gap: 3px; padding: 3px; border-radius: 12px; background: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.3); overflow-x: auto; scrollbar-width: none; }
    .seg::-webkit-scrollbar { display: none; }
    .sg { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 9px; cursor: pointer; font-size: 12px; font-weight: 800; color: #94a3b8; background: none; border: none; }
    .sg img { width: 15px; height: 15px; opacity: 0.65; }
    .sg:hover { color: #e2e8f0; background: rgba(51,65,85,0.4); }
    .sg-on { color: #0b1020; background: #e2e8f0; }
    .sg-on img { opacity: 1; filter: brightness(0.2); }
    .sg-on:hover { color: #0b1020; background: #fff; }
    .sel {
        height: 42px; padding: 0 32px 0 13px; border-radius: 13px; cursor: pointer; appearance: none; -webkit-appearance: none;
        font-size: 12px; font-weight: 800; color: #cbd5e1; background-color: rgba(2,6,23,0.6); border: 1px solid rgba(71,85,105,0.35);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 12px center;
    }
    .sel:focus { outline: none; border-color: rgba(252,211,77,0.55); }
    .sel option { background: #0f172a; }
    .tb-count { font-size: 12px; color: #64748b; font-weight: 700; }
    .tb-count b { color: #e2e8f0; }
    .tb-reset { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 100px; cursor: pointer; font-size: 11px; font-weight: 800; color: #94a3b8; background: rgba(51,65,85,0.35); border: 1px solid rgba(71,85,105,0.4); }
    .tb-reset:hover { color: #fff; }

    /* ── Browse by type ── */
    .sec-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 0 4px; }
    .sec-title { font-size: 16px; font-weight: 900; color: #fff; }
    .sec-note { font-size: 12px; color: #64748b; }
    .types { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 10px; }
    .ty { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px; border-radius: 16px; cursor: pointer; text-align: left; background: linear-gradient(160deg, color-mix(in srgb, var(--c) 9%, rgba(12,16,28,0.7)), rgba(12,16,28,0.7) 60%); border: 1px solid color-mix(in srgb, var(--c) 25%, rgba(71,85,105,0.25)); transition: transform 0.15s, border-color 0.15s; }
    .ty:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 60%, transparent); }
    .ty-ico { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); }
    .ty-label { font-size: 13px; font-weight: 900; color: var(--c); line-height: 1.2; }
    .ty-count { font-size: 11px; font-weight: 700; color: #94a3b8; font-variant-numeric: tabular-nums; display: flex; gap: 6px; }
    .ty-pct { color: #64748b; }
    .ty-bar { width: 100%; height: 4px; border-radius: 4px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .ty-bar span { display: block; height: 100%; border-radius: 4px; background: var(--c); min-width: 2px; }

    /* ── Team / type sections ── */
    .teams, .results { display: flex; flex-direction: column; gap: 14px; }
    .team {
        padding: 14px 16px 16px; border-radius: 18px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25);
        /* Off-screen panels skip layout and paint entirely — including every animated tier
           glow inside them — once they have been scrolled past. */
        content-visibility: auto;
        contain-intrinsic-size: auto 640px;
    }
    .team-done { border-color: rgba(52,211,153,0.35); background: linear-gradient(160deg, rgba(16,185,129,0.07), rgba(12,16,28,0.6) 50%); }
    .team-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(51,65,85,0.35); }
    .th-ico { width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .team-name { font-size: 15px; font-weight: 900; color: #f1f5f9; }
    .team-done .team-name { color: #6ee7b7; }
    .team-count { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .team-done .team-count { color: #34d399; }
    .team-bar { flex: 1; min-width: 80px; max-width: 260px; height: 5px; border-radius: 5px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .team-bar div { height: 100%; border-radius: 5px; background: var(--c); transition: width 0.4s; }
    .team-claim { position: relative; overflow: hidden; margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 8px 16px; border-radius: 11px; border: none; cursor: pointer; font-size: 12px; font-weight: 900; color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 4px 14px rgba(16,185,129,0.35); animation: acPulse 2.2s ease-in-out infinite; white-space: nowrap; }
    .team-claim:hover { transform: translateY(-1px); }
    .team-claimed { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #34d399; padding: 5px 11px; border-radius: 100px; background: rgba(16,185,129,0.1); border: 1px solid rgba(52,211,153,0.25); }
    .team-reward { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #64748b; }

    /* ── Empty ── */
    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 44px 16px; text-align: center; border-radius: 18px; border: 1px dashed rgba(71,85,105,0.4); }
    .empty-ico { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #fcd34d; background: rgba(252,211,77,0.1); border: 1px solid rgba(252,211,77,0.25); margin-bottom: 4px; }
    .empty-t { font-size: 15px; font-weight: 900; color: #e2e8f0; }
    .empty-s { font-size: 12px; color: #64748b; }
    .empty-btn { margin-top: 8px; padding: 9px 18px; border-radius: 12px; cursor: pointer; font-size: 12px; font-weight: 800; color: #e2e8f0; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }

    @media (max-width: 1000px) {
        .regions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 700px) {
        .arh-claim { align-items: flex-start; width: 100%; }
    }
    @media (max-width: 600px) {
        .arh { padding: 18px; gap: 16px; }
        .arh-ring { width: 90px; height: 90px; }
        .rg-n { font-size: 21px; }
        /* Collections become one swipeable row instead of seven stacked rows. */
        .cats { display: flex; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
        .cats::-webkit-scrollbar { display: none; }
        .cat { flex: 0 0 170px; }
        .regions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .sg-l { display: none; }
        .tb-row2 .seg { width: 100%; }
        .tb-row2 .sg { flex: 1; justify-content: center; padding: 0 8px; }
        .tb-reset { margin-left: 0; }
        .sel { flex: 1; }
        .team { padding: 12px; }
        /* Two cards a row on a phone, like the Club Vault. */
        .team :global(.lazy-grid) { zoom: 0.84; }
        .team-bar { order: 5; max-width: none; width: 100%; flex-basis: 100%; }
        .claim { flex-wrap: wrap; }
        .cl-btn { width: 100%; justify-content: center; }
    }
</style>
