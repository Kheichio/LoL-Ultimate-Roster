<script>
    import ProfileModal from '../modals/ProfileModal.svelte';
    import { blueEssence, club, squad, trackStats, teamIdentity, managerLevel, weightedTrophies, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { get } from 'svelte/store';

    let sortBy = 'trophies';
    let selectedPlayer = null;
    let players = [];
    let loading = false;

    const columns = [
        { key: 'trophies', label: 'Trophies', w: 'w-16' },
        { key: 'totalPower', label: 'Power', w: 'w-14' },
        { key: 'rawPower', label: 'Raw', w: 'w-12' },
        { key: 'splitsCompleted', label: 'Splits', w: 'w-12' },
        { key: 'goldenRoads', label: 'GR', w: 'w-10' },
        { key: 'clubSize', label: 'Cards', w: 'w-12' },
        { key: 'signatureCards', label: 'Sig', w: 'w-10' },
        { key: 'holographicCards', label: 'Holo', w: 'w-10' },
    ];

    // Generate mock leaderboard from player's own data + bots until Firebase is connected
    function loadLeaderboard() {
        loading = true;
        const myData = buildMyEntry();
        const bots = generateBotEntries();
        players = [myData, ...bots].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
        loading = false;
    }

    function buildMyEntry() {
        const starters = ['TOP','JNG','MID','ADC','SUP'].map(r => get(squad)[r]).filter(Boolean);
        const avg = starters.length > 0 ? Math.round(starters.reduce((s, c) => s + c.rating, 0) / starters.length) : 0;
        const ts = get(trackStats);
        return {
            id: 'me',
            isMe: true,
            displayName: 'You',
            teamName: get(teamIdentity).name,
            teamLogo: get(teamIdentity).logo,
            teamColor: get(teamIdentity).color || '#3b82f6',
            managerLevel: get(managerLevel),
            prestigeTitle: getTitle(get(weightedTrophies)),
            trophies: get(weightedTrophies),
            totalPower: avg + 5,
            rawPower: avg,
            totalBE: get(blueEssence),
            clubSize: get(club).length,
            signatureCards: get(club).filter(c => c.signature).length,
            holographicCards: get(club).filter(c => c.holographic).length,
            splitsCompleted: ts.splitsCompleted || 0,
            goldenRoads: ts.goldenRoads || 0,
            towerBest: ts.towerHighestFloor || 0,
            cafeWins: ts.cafeWins || 0,
            regionalWins: ts.regionalSplitWon || 0,
            msiWins: ts.msiWon || 0,
            worldsWins: ts.worldsWon || 0,
            draftWins: ts.draftModesWon || 0,
            salaryWins: ts.salaryCapWon || 0,
            losses: ts.losses || 0,
            packsOpened: ts.packs || 0,
            favouriteTeam: 'N/A',
            mostPlayedMode: ts.cafeWins > (ts.splitsCompleted || 0) ? 'Gaming Cafe' : 'Season Splits',
            squad: get(squad),
            showcaseCards: [...get(club)].sort((a, b) => ((b.signature?1000:0)+(b.holographic?500:0)+b.rating) - ((a.signature?1000:0)+(a.holographic?500:0)+a.rating)).slice(0,3),
        };
    }

    function generateBotEntries() {
        const names = [
            { team: 'SuperStar Esports', name: 'SnowShow', logo: '🌟', color: '#f59e0b' },
            { team: 'NioJ Esport', name: 'Jimbo', logo: '🚀', color: '#ef4444' },
            { team: 'Kapanka Esports', name: 'Osworth', logo: '🦁', color: '#10b981' },
            { team: 'Phoenix Rising', name: 'BlazeMaster', logo: '🔥', color: '#f97316' },
            { team: 'Arctic Wolves', name: 'FrostByte', logo: '🐺', color: '#06b6d4' },
            { team: 'Dragon Force', name: 'ScaleKing', logo: '🐲', color: '#8b5cf6' },
            { team: 'Thunder Squad', name: 'VoltAge', logo: '⚡', color: '#eab308' },
            { team: 'Shadow Legion', name: 'DarkStar', logo: '🌑', color: '#6b7280' },
            { team: 'Crystal Gaming', name: 'GemHunter', logo: '💎', color: '#3b82f6' },
        ];
        return names.map((n, i) => {
            const t = 80 - i * 8 + Math.floor(Math.random() * 15);
            const sp = Math.max(0, 20 - i * 2 + Math.floor(Math.random() * 5));
            const cw = Math.max(0, 40 - i * 4 + Math.floor(Math.random() * 10));
            return {
                id: 'bot_' + i,
                isMe: false,
                displayName: n.name,
                teamName: n.team,
                teamLogo: n.logo,
                teamColor: n.color,
                managerLevel: Math.max(1, 30 - i * 3 + Math.floor(Math.random() * 5)),
                prestigeTitle: getTitle(t),
                trophies: t,
                totalPower: 85 + Math.floor(Math.random() * 30) - i * 2,
                rawPower: 80 + Math.floor(Math.random() * 20) - i * 2,
                totalBE: Math.floor(Math.random() * 500000),
                clubSize: 100 + Math.floor(Math.random() * 900),
                signatureCards: Math.floor(Math.random() * 8),
                holographicCards: Math.floor(Math.random() * 20),
                splitsCompleted: sp,
                goldenRoads: Math.max(0, Math.floor(sp / 6)),
                towerBest: Math.floor(Math.random() * 100),
                cafeWins: cw,
                regionalWins: Math.max(0, Math.floor(sp * 0.6)),
                msiWins: Math.max(0, Math.floor(Math.random() * 5)),
                worldsWins: Math.max(0, Math.floor(Math.random() * 3)),
                draftWins: Math.floor(Math.random() * 15),
                salaryWins: Math.floor(Math.random() * 10),
                losses: Math.floor(Math.random() * 40),
                packsOpened: 50 + Math.floor(Math.random() * 300),
                favouriteTeam: ['T1', 'Gen.G', 'BLG', 'G2', 'TL'][Math.floor(Math.random() * 5)],
                mostPlayedMode: ['Gaming Cafe', 'Season Splits', 'Draft Mode', 'Infinite Tower'][Math.floor(Math.random() * 4)],
                squad: {},
                showcaseCards: [],
            };
        });
    }

    function getTitle(tp) {
        if (tp >= 200) return 'Immortal';
        if (tp >= 150) return 'Legend';
        if (tp >= 100) return 'Hall of Fame';
        if (tp >= 70) return 'President';
        if (tp >= 50) return 'Executive';
        if (tp >= 30) return 'GM';
        if (tp >= 15) return 'Director';
        if (tp >= 5) return 'Manager';
        return 'Scout';
    }

    function changeSort(key) {
        sortBy = key;
        players = [...players].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    }

    function openProfile(player) { selectedPlayer = player; }
    function closeProfile() { selectedPlayer = null; }

    // Load on mount
    loadLeaderboard();
</script>

<section class="pb-10 pt-2">
    <div class="flex items-center justify-between mb-4">
        <div>
            <h2 class="text-xl font-black text-amber-400 tracking-wide">Global Leaderboard</h2>
            <p class="text-xs text-slate-500">Compete against managers worldwide.</p>
        </div>
        <button class="bg-amber-600 hover:bg-amber-500 text-slate-900 font-black px-4 py-2 rounded-xl cursor-pointer transition text-xs uppercase tracking-wider shadow" on:click={loadLeaderboard}>
            Refresh
        </button>
    </div>

    <!-- Sort buttons -->
    <div class="flex flex-wrap gap-1.5 mb-4 items-center">
        <span class="text-[10px] text-slate-500 font-black uppercase tracking-widest mr-1">Sort:</span>
        {#each columns as col}
            <button
                class="px-2 py-1 rounded text-[10px] font-black cursor-pointer transition {sortBy === col.key ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
                on:click={() => changeSort(col.key)}
            >{col.label}</button>
        {/each}
    </div>

    <!-- Table -->
    <div class="bg-slate-800/60 rounded-xl border border-amber-700/20 overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-slate-900/60 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span class="w-8 text-center">#</span>
            <span class="flex-1">Manager</span>
            {#each columns as col}
                <span class="{col.w} text-center {sortBy === col.key ? 'text-amber-300' : ''}">{col.label}</span>
            {/each}
            <span class="w-16 text-center">Title</span>
        </div>

        <!-- Rows -->
        {#each players as p, i}
            {@const rank = i + 1}
            {@const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ''}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/30 text-sm cursor-pointer hover:bg-white/[0.02] transition {p.isMe ? 'border-l-4' : ''}"
                style="{p.isMe ? `border-left-color: ${p.teamColor}; background: linear-gradient(90deg, ${p.teamColor}25 0%, ${p.teamColor}08 100%);` : `background: linear-gradient(90deg, ${p.teamColor}15 0%, transparent 60%);`}"
                on:click={() => openProfile(p)}
            >
                <span class="w-8 text-center text-xs font-black {rank <= 3 ? 'text-amber-400' : 'text-slate-500'}">{medal || rank}</span>
                <div class="flex-1 flex items-center gap-2 min-w-0">
                    <span class="text-base">{p.teamLogo}</span>
                    <div class="min-w-0">
                        <div class="font-bold text-slate-200 text-xs truncate">
                            {p.teamName}{p.isMe ? ' (You)' : ''}
                        </div>
                        <div class="text-[9px] text-slate-500 truncate">{p.displayName} · Lv {p.managerLevel}</div>
                    </div>
                </div>
                {#each columns as col}
                    {@const val = p[col.key] || 0}
                    <span class="{col.w} text-center text-xs font-bold {
                        col.key === 'trophies' ? 'text-emerald-400' :
                        col.key === 'totalPower' ? 'text-green-400' :
                        col.key === 'signatureCards' ? 'text-purple-300' :
                        col.key === 'holographicCards' ? 'text-yellow-300' :
                        col.key === 'goldenRoads' ? 'text-yellow-400' :
                        'text-slate-300'
                    } {sortBy === col.key ? 'font-black' : ''}">{
                        col.key === 'totalBE' ? (val >= 1000 ? Math.floor(val/1000) + 'k' : val) : val
                    }</span>
                {/each}
                <span class="w-16 text-center text-[10px] text-slate-400">{p.prestigeTitle}</span>
            </div>
        {/each}
    </div>
</section>

<ProfileModal player={selectedPlayer} onClose={closeProfile} />
