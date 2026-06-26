<script>
    import Header from './lib/components/layout/Header.svelte';
    import TabContent from './lib/components/layout/TabContent.svelte';
    import ToastContainer from './lib/components/layout/ToastContainer.svelte';
    import ConfirmModal from './lib/components/modals/ConfirmModal.svelte';
    import CardInspectModal from './lib/components/modals/CardInspectModal.svelte';
    import AuthPanel from './lib/components/modals/AuthPanel.svelte';
    import { activeTab } from './lib/stores/ui.js';
    import { initGame, saveGame, squad, club, blueEssence, trackStats, teamIdentity, managerLevel, weightedTrophies } from './lib/stores/game.js';
    import { currentUser, cloudSave } from './lib/stores/auth.js';
    import { getEffectiveRating, LEGACY_TIERS, getEra } from './lib/utils/cards.js';
    import { get } from 'svelte/store';
    import { onDestroy } from 'svelte';

    initGame();

    function getTitle(tp) {
        if (tp >= 1000) return 'Immortal';
        if (tp >= 600) return 'Legend';
        if (tp >= 400) return 'Hall of Fame';
        if (tp >= 250) return 'President';
        if (tp >= 150) return 'Executive';
        if (tp >= 75) return 'GM';
        if (tp >= 30) return 'Director';
        if (tp >= 10) return 'Manager';
        return 'Scout';
    }

    function serializeCard(c) {
        if (!c) return null;
        return { id: c.id, name: c.name, team: c.team, year: c.year, role: c.role, region: c.region, rating: c.rating, quality: c.quality, stats: c.stats, signature: c.signature || false, holographic: c.holographic || false };
    }

    async function globalAutoSave() {
        saveGame();
        const user = get(currentUser);
        if (!user || !window.fbDb) return;
        try { await cloudSave(); } catch(e) {}
        try {
            const sq = get(squad);
            const starters = ['TOP','JNG','MID','ADC','SUP'].map(r => sq[r]).filter(Boolean);
            const rawAvg = starters.length > 0 ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
            const nl = starters.filter(c => !LEGACY_TIERS.includes(c.quality));
            const regChem = !starters.length ? 0 : !nl.length ? 5 : (() => { const s = new Set(nl.map(c => c.region)).size; return s <= 1 ? 5 : s <= 2 ? 3 : s <= 3 ? 2 : 1; })();
            const eraChem = !starters.length ? 0 : !nl.length ? 5 : (() => { const s = new Set(nl.map(c => getEra(c.year))).size; return s <= 1 ? 5 : s <= 2 ? 3 : s <= 3 ? 2 : 1; })();
            const tmChem = !starters.length ? 0 : !nl.length ? 2 : new Set(nl.map(c => c.team)).size === 1 ? 2 : 0;
            const coachB = (() => { const c = sq.COACH; if (!c) return 0; return c.rating >= 98 ? 5 : c.rating >= 94 ? 4 : c.rating >= 90 ? 3 : c.rating >= 85 ? 2 : 1; })();
            const legB = (() => { const c = starters.filter(c => LEGACY_TIERS.includes(c.quality)).length; return c >= 4 ? 2 : c >= 2 ? 1 : 0; })();
            const totalPwr = rawAvg + regChem + eraChem + tmChem + coachB + legB;
            const ts = get(trackStats);
            const tp = get(weightedTrophies);
            const ti = get(teamIdentity);
            const cl = get(club);
            const squadData = {};
            for (const role of ['TOP','JNG','MID','ADC','SUP','COACH']) {
                if (sq[role]) squadData[role] = serializeCard(sq[role]);
            }
            const showcaseData = [...cl].sort((a, b) => ((b.signature?1000:0)+(b.holographic?500:0)+b.rating) - ((a.signature?1000:0)+(a.holographic?500:0)+a.rating)).slice(0,3).map(serializeCard).filter(Boolean);
            await window.fbDb.collection('leaderboard').doc(user.uid).set({
                displayName: user.displayName || 'Unknown',
                teamName: ti.name, teamLogo: ti.logo, teamColor: ti.color || '#3b82f6',
                managerLevel: get(managerLevel), prestigeTitle: getTitle(tp),
                trophies: tp, totalPower: totalPwr, rawPower: rawAvg,
                clubSize: cl.length,
                signatureCards: cl.filter(c => c.signature).length,
                holographicCards: cl.filter(c => c.holographic).length,
                splitsCompleted: ts.splitsCompleted || 0, goldenRoads: ts.goldenRoads || 0,
                cafeWins: ts.cafeWins || 0, regionalWins: ts.regionalSplitWon || 0,
                firstStandWins: ts.firstStandWon || 0,
                msiWins: ts.msiWon || 0, worldsWins: ts.worldsWon || 0,
                losses: ts.losses || 0, packsOpened: ts.packs || 0,
                towerBest: ts.towerHighestFloor || 0,
                favouriteTeam: ti.favouriteTeam || '', favouritePlayer: ti.favouritePlayer || '',
                mostPlayedMode: (ts.cafeWins || 0) > (ts.splitsCompleted || 0) ? 'Gaming Cafe' : 'Season Splits',
                squadData, showcaseData, updatedAt: Date.now(),
            });
        } catch(e) {}
    }

    const autoSaveInterval = setInterval(globalAutoSave, 10 * 60 * 1000);
    onDestroy(() => clearInterval(autoSaveInterval));
</script>

<div class="app-shell">
    <Header />
    <main>
        <TabContent tab={$activeTab} />
    </main>
</div>

<ToastContainer />
<ConfirmModal />
<CardInspectModal />
<AuthPanel />

<div class="version-badge">Beta 1.0.9.1 public build</div>

<style>
    .version-badge {
        position: fixed;
        bottom: 12px;
        right: 16px;
        font-size: 9px;
        font-weight: 700;
        color: #334155;
        letter-spacing: 0.5px;
        z-index: 10;
        pointer-events: none;
        user-select: none;
    }
    .app-shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }
    main {
        flex: 1;
        padding: 20px 24px;
        max-width: 1600px;
        width: 100%;
        margin: 0 auto;
    }
    @media (max-width: 768px) {
        main { padding: 12px; }
    }
    @media (min-width: 1800px) {
        main { max-width: 1700px; }
    }
</style>
