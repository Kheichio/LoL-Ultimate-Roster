<script>
    import ProfileModal from '../modals/ProfileModal.svelte';
    import { blueEssence, club, squad, trackStats, teamIdentity, managerLevel, weightedTrophies } from '../../stores/game.js';
    import { currentUser } from '../../stores/auth.js';
    import { get } from 'svelte/store';

    let sortBy = 'trophies';
    let selectedPlayer = null;
    let players = [];

    const columns = [
        { key: 'trophies', label: 'Trophies', color: '#34d399' },
        { key: 'totalPower', label: 'Power', color: '#22c55e' },
        { key: 'splitsCompleted', label: 'Splits', color: '#94a3b8' },
        { key: 'goldenRoads', label: 'GR', color: '#eab308' },
        { key: 'clubSize', label: 'Cards', color: '#94a3b8' },
        { key: 'signatureCards', label: 'Sig', color: '#c084fc' },
        { key: 'holographicCards', label: 'Holo', color: '#fbbf24' },
    ];

    function loadLeaderboard() {
        const myData = buildMyEntry();
        players = [myData];
    }

    function buildMyEntry() {
        const starters = ['TOP','JNG','MID','ADC','SUP'].map(r => get(squad)[r]).filter(Boolean);
        const avg = starters.length > 0 ? Math.round(starters.reduce((s, c) => s + c.rating, 0) / starters.length) : 0;
        const ts = get(trackStats);
        return {
            id: 'me',
            isMe: true,
            displayName: get(currentUser)?.displayName || 'You',
            teamName: get(teamIdentity).name,
            teamLogo: get(teamIdentity).logo,
            teamColor: get(teamIdentity).color || '#3b82f6',
            managerLevel: get(managerLevel),
            prestigeTitle: getTitle(get(weightedTrophies)),
            trophies: get(weightedTrophies),
            totalPower: avg,
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

    loadLeaderboard();
</script>

<section class="lb">
    <div class="lb-head">
        <div>
            <h2 class="lb-title">Global Leaderboard</h2>
            <p class="lb-desc">Compete against managers worldwide. Connect Firebase to see other players.</p>
        </div>
        <button class="lb-refresh" on:click={loadLeaderboard}>Refresh</button>
    </div>

    <!-- Sort -->
    <div class="lb-sort">
        <span class="sort-label">Sort:</span>
        {#each columns as col}
            <button class="sort-btn" class:sort-active={sortBy === col.key} on:click={() => changeSort(col.key)}>{col.label}</button>
        {/each}
    </div>

    <!-- Table -->
    <div class="lb-table">
        <!-- Header -->
        <div class="lb-row lb-header">
            <span class="lb-rank">#</span>
            <span class="lb-manager">Manager</span>
            {#each columns as col}
                <span class="lb-col" class:lb-col-active={sortBy === col.key}>{col.label}</span>
            {/each}
            <span class="lb-col">Title</span>
        </div>

        <!-- Rows -->
        {#each players as p, i}
            {@const rank = i + 1}
            {@const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ''}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="lb-row lb-data" class:lb-me={p.isMe} style="background: linear-gradient(90deg, {p.teamColor}12 0%, transparent 60%);" on:click={() => openProfile(p)}>
                <span class="lb-rank" class:lb-rank-top={rank <= 3}>{medal || rank}</span>
                <div class="lb-manager">
                    <span class="lb-logo">{p.teamLogo}</span>
                    <div class="lb-info">
                        <span class="lb-team">{p.teamName}{p.isMe ? ' (You)' : ''}</span>
                        <span class="lb-sub">{p.displayName} · Lv {p.managerLevel}</span>
                    </div>
                </div>
                {#each columns as col}
                    {@const val = p[col.key] || 0}
                    <span class="lb-col lb-val" style="color: {sortBy === col.key ? col.color : '#94a3b8'}">{val}</span>
                {/each}
                <span class="lb-col lb-title-cell">{p.prestigeTitle}</span>
            </div>
        {/each}

        {#if players.length <= 1}
            <div class="lb-empty">
                Sign in and connect to Firebase to see other players on the leaderboard.
            </div>
        {/if}
    </div>
</section>

<ProfileModal player={selectedPlayer} onClose={closeProfile} />

<style>
    .lb { padding-bottom: 40px; }
    .lb-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .lb-title { font-size: 22px; font-weight: 900; color: #fbbf24; }
    .lb-desc { font-size: 12px; color: #64748b; margin-top: 3px; }
    .lb-refresh {
        padding: 10px 20px; border-radius: 12px;
        background: linear-gradient(135deg, #d97706, #f59e0b);
        color: #1c1917; font-weight: 900; font-size: 11px;
        text-transform: uppercase; letter-spacing: 1px;
        border: none; cursor: pointer; transition: all 0.15s;
        box-shadow: 0 4px 12px rgba(245,158,11,0.2);
    }
    .lb-refresh:hover { box-shadow: 0 6px 20px rgba(245,158,11,0.35); transform: translateY(-1px); }

    /* Sort */
    .lb-sort { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 16px; }
    .sort-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-right: 4px; }
    .sort-btn {
        padding: 5px 12px; border-radius: 8px;
        font-size: 10px; font-weight: 900; cursor: pointer;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        color: #64748b; transition: all 0.12s;
    }
    .sort-btn:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }
    .sort-active {
        background: linear-gradient(135deg, #d97706, #f59e0b) !important;
        color: #1c1917 !important; border-color: transparent !important;
    }

    /* Table */
    .lb-table {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(251,191,36,0.1);
        border-radius: 16px; overflow: hidden;
    }
    .lb-row {
        display: flex; align-items: center; gap: 8px;
        padding: 0 20px;
    }
    .lb-header {
        padding-top: 14px; padding-bottom: 14px;
        background: rgba(15,23,42,0.5); border-bottom: 1px solid rgba(51,65,85,0.2);
    }
    .lb-header .lb-rank, .lb-header .lb-manager, .lb-header .lb-col {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #475569;
    }
    .lb-data {
        padding-top: 12px; padding-bottom: 12px;
        border-bottom: 1px solid rgba(51,65,85,0.1);
        cursor: pointer; transition: background 0.1s;
    }
    .lb-data:hover { background: rgba(255,255,255,0.02) !important; }
    .lb-me { border-left: 3px solid var(--team-color, #3b82f6); }

    .lb-rank { width: 32px; text-align: center; font-size: 12px; font-weight: 900; color: #475569; flex-shrink: 0; }
    .lb-rank-top { color: #fbbf24; }
    .lb-manager { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
    .lb-logo { font-size: 18px; flex-shrink: 0; }
    .lb-info { min-width: 0; }
    .lb-team { display: block; font-size: 12px; font-weight: 800; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lb-sub { display: block; font-size: 9px; color: #475569; }
    .lb-col { width: 60px; text-align: center; flex-shrink: 0; font-size: 10px; }
    .lb-col-active { color: #fbbf24 !important; }
    .lb-val { font-size: 12px; font-weight: 800; color: #94a3b8; }
    .lb-title-cell { font-size: 10px; color: #64748b; width: 70px; }

    .lb-empty {
        text-align: center; padding: 40px 20px;
        font-size: 12px; color: #475569; font-style: italic;
    }

    @media (max-width: 800px) {
        .lb-col { width: 44px; font-size: 9px; }
        .lb-val { font-size: 10px; }
        .lb-row { gap: 4px; padding: 0 12px; }
    }
</style>
