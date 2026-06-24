<script>
    import Card from '../card/Card.svelte';
    import { collectionRegistry } from '../../stores/game.js';
    import { getDB, TIER_ORDER, LEGACY_TIERS, AWARD_TIERS, ALL_SPECIAL } from '../../utils/cards.js';

    let activeCategory = 'regular';
    let activeRegion = 'LCK';
    let search = '';
    let sortBy = 'team';

    const categories = [
        { id: 'regular', label: '⚔️ Regular Season', activeClass: 'bg-blue-600/20 border-blue-500/50 text-blue-300' },
        { id: 'firststand', label: '🟠 First Stand', activeClass: 'bg-orange-600/20 border-orange-500/50 text-orange-300' },
        { id: 'msi', label: '🌊 MSI', activeClass: 'bg-teal-600/20 border-teal-500/50 text-teal-300' },
        { id: 'finalists', label: '🥈 Finalists', activeClass: 'bg-slate-600/20 border-slate-500/50 text-slate-300' },
        { id: 'champion', label: '🏆 Champion', activeClass: 'bg-amber-600/20 border-amber-500/50 text-amber-300' },
        { id: 'mvp', label: '✨ MVP', activeClass: 'bg-pink-600/20 border-pink-500/50 text-pink-300' },
        { id: 'poty', label: '🌟 Player of Year', activeClass: 'bg-red-600/20 border-red-500/50 text-red-300' },
        { id: 'roty', label: '🌱 Rookie of Year', activeClass: 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300' },
        { id: 'toty', label: '👑 Team of Year', activeClass: 'bg-yellow-600/20 border-yellow-500/50 text-yellow-300' },
        { id: 'gpoty', label: '🌍 Global POTY', activeClass: 'bg-purple-600/20 border-purple-500/50 text-purple-300' },
        { id: 'x', label: '✕ Community Pick', activeClass: 'bg-rose-600/20 border-rose-500/50 text-rose-300' },
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

<section class="pb-10 pt-2">
    <div class="flex items-center justify-between mb-4">
        <div>
            <h2 class="text-xl font-black text-yellow-200 tracking-wide">Archive</h2>
            <p class="text-xs text-slate-500 font-mono">{ownedCards}/{totalCards} collected ({completionPct}%)</p>
        </div>
    </div>

    <!-- Category Tabs -->
    <div class="flex flex-wrap gap-1.5 mb-4">
        {#each categories as cat}
            <button
                class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition border {
                    activeCategory === cat.id
                        ? cat.activeClass
                        : 'bg-slate-800 border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                }"
                on:click={() => { activeCategory = cat.id; }}
            >{cat.label}</button>
        {/each}
    </div>

    <!-- Region tabs (regular only) -->
    {#if activeCategory === 'regular'}
        <div class="flex gap-2 mb-4">
            {#each regions as r}
                <button
                    class="flex-1 py-2 px-3 rounded-lg text-xs font-bold cursor-pointer transition border {
                        activeRegion === r
                            ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                            : 'bg-slate-800 border-transparent text-slate-500 hover:bg-slate-700'
                    }"
                    on:click={() => { activeRegion = r; }}
                >{regionLabels[r]}</button>
            {/each}
        </div>
    {/if}

    <!-- Search + Sort -->
    <div class="flex flex-wrap gap-3 mb-5 items-center">
        <input type="text" bind:value={search} placeholder="Search player or team..." class="input" style="flex:1; min-width:150px; padding:8px 12px; font-size:12px;">
        <div class="flex gap-1">
            {#each [
                { value: 'team', label: 'Teams' },
                { value: 'completion', label: 'Completion' },
                { value: 'least', label: 'Least Cards' },
            ] as s}
                <button
                    class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer transition {
                        sortBy === s.value ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-slate-800 border border-transparent text-slate-500 hover:text-slate-300'
                    }"
                    on:click={() => { sortBy = s.value; }}
                >{s.label}</button>
            {/each}
        </div>
    </div>

    <!-- Card Grid by Team -->
    {#if grouped.length === 0}
        <div class="text-center py-16">
            <p class="text-slate-600 font-mono text-sm">{search ? 'No cards match your search.' : 'No cards in this category yet.'}</p>
        </div>
    {:else}
        <div class="space-y-4">
            {#each grouped as group}
                {@const pct = group.cards.length > 0 ? Math.round((group.owned / group.cards.length) * 100) : 0}
                {@const isComplete = group.owned === group.cards.length && group.cards.length > 0}
                <div class="bg-slate-800/40 p-4 rounded-xl border {isComplete ? 'border-emerald-700/40' : 'border-slate-700/30'}">
                    <!-- Team Header -->
                    <div class="flex items-center justify-between mb-3 border-b border-slate-700/40 pb-2">
                        <h3 class="text-sm font-black {isComplete ? 'text-emerald-400' : 'text-slate-300'}">{group.team}</h3>
                        <span class="text-[10px] font-mono {isComplete ? 'text-emerald-400' : 'text-slate-500'}">
                            {isComplete ? '✓' : ''} {group.owned}/{group.cards.length} ({pct}%)
                        </span>
                    </div>
                    <!-- Cards -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:10px; justify-items:center;">
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
