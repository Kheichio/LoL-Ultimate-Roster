<script>
    import { blueEssence, teamIdentity, skillPoints, dailyLogin, battlePass, collectionRegistry, archiveRewards, trackStats, club, squad, weightedTrophies, managerLevel, questsClaimed, questsRepeatableBaselines, achievementsClaimed, prestige } from '../../stores/game.js';
    import { activeTab, switchTab, showAuthPanel, splitCooldownEnd } from '../../stores/ui.js';
    import { onDestroy } from 'svelte';
    import { currentUser } from '../../stores/auth.js';
    import { loadFromStorage } from '../../utils/storage.js';

    function isSameDay(d1, d2) {
        if (!d1 || !d2) return false;
        const a = new Date(d1), b = new Date(d2);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    $: dailyAvailable = !isSameDay($dailyLogin.lastClaim, Date.now());
    $: bpCanLevel = ($battlePass.xp || 0) >= 1000;
    $: spAvailable = $skillPoints > 0;

    $: archiveUnclaimed = (() => {
        const reg = $collectionRegistry;
        const claimed = ($archiveRewards && $archiveRewards.claimedCards) || {};
        let count = 0;
        for (const id in reg) {
            if (reg[id] && !claimed[id]) count++;
        }
        return count;
    })();

    $: questBadge = (() => {
        const ts = $trackStats;
        const qc = $questsClaimed;
        const ac = $achievementsClaimed;
        const rb = $questsRepeatableBaselines;
        let count = 0;
        const mq = [
            ['mq1','packs',5],['mq2','packs',25],['mq3','packs',100],['mq9','packs',250],['mq60','packs',500],
            ['mq4','holographicPulled',1],['mq5','holographicPulled',5],['mq8','holographicPulled',10],['mq61','holographicPulled',25],
            ['mq6','signaturesPulled',1],['mq7','signaturesPulled',5],['mq62','signaturesPulled',10],
            ['mq10','soldCount',10],['mq11','soldCount',50],['mq12','soldCount',200],['mq13','soldCount',500],
            ['mq63','upgradesPerformed',10],['mq64','upgradesPerformed',50],
            ['mq20','tournamentsWon',1],['mq21','tournamentsWon',5],['mq22','tournamentsWon',25],['mq50','tournamentsWon',100],
            ['mq23','cafeWins',1],['mq24','cafeWins',10],['mq25','cafeWins',50],['mq73','cafeWins',100],
            ['mq26','regionalSplitWon',1],['mq27','regionalSplitWon',5],['mq51','regionalSplitWon',25],
            ['mq28','firstStandWon',1],['mq29','firstStandWon',5],['mq70','firstStandWon',10],
            ['mq35','msiWon',1],['mq36','msiWon',3],['mq71','msiWon',5],
            ['mq37','worldsWon',1],['mq38','worldsWon',3],['mq72','worldsWon',5],
            ['mq65','draftModesWon',1],['mq66','draftModesWon',5],['mq67','draftModesWon',25],
            ['mq68','draftModesPlayed',10],['mq69','draftModesPlayed',50],
            ['mq30','splitsCompleted',1],['mq31','splitsCompleted',5],['mq32','splitsCompleted',25],['mq39','splitsCompleted',50],['mq75','splitsCompleted',100],
            ['mq33','goldenRoads',1],['mq34','goldenRoads',5],['mq40','goldenRoads',10],['mq76','goldenRoads',25],
            ['mq41','towerHighestFloor',10],['mq42','towerHighestFloor',25],['mq43','towerHighestFloor',50],['mq44','towerHighestFloor',100],['mq74','towerHighestFloor',200],
        ];
        for (const [id, stat, target] of mq) {
            if (!qc[id] && (ts[stat] || 0) >= target) count++;
        }
        const rq = [['rq1','packs',3],['rq6','packs',5],['rq2','tournamentsWon',3],['rq4','cafeWins',5],['rq3','soldCount',5],['rq7','soldCount',10],['rq5','splitsCompleted',2],['rq8','draftModesWon',2],['rq9','tournamentsWon',10],['rq10','upgradesPerformed',5]];
        for (const [id, stat, target] of rq) {
            if (Math.max(0, (ts[stat] || 0) - (rb[id] || 0)) >= target) count++;
        }
        const starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
        const sqAvg = starters.length > 0 ? Math.round(starters.reduce((s, c) => s + c.rating, 0) / starters.length) : 0;
        const achChecks = [
            ['a1',sqAvg,80],['a2',sqAvg,90],['a3',sqAvg,95],['a19',sqAvg,98],
            ['a4',$club.length,50],['a5',$club.length,200],['a6',$club.length,500],['a18',$club.length,1000],
            ['a7',$weightedTrophies,50],['a8',$weightedTrophies,200],['a14',$weightedTrophies,500],['a15',$weightedTrophies,1000],
            ['a22',$club.filter(c => c.signature).length,5],['a9',$club.filter(c => c.signature).length,10],
            ['a10',$club.filter(c => c.holographic).length,25],['a23',$club.filter(c => c.holographic).length,50],
            ['a11',$managerLevel,10],['a12',$managerLevel,25],['a13',$managerLevel,50],['a20',$managerLevel,100],
            ['a16',ts.towerHighestFloor||0,50],['a17',ts.towerHighestFloor||0,100],['a21',ts.towerHighestFloor||0,200],
            ['a24',ts.draftModesWon||0,10],['a25',ts.draftModesWon||0,50],
        ];
        for (const [id, val, target] of achChecks) {
            if (!ac[id] && val >= target) count++;
        }
        return count;
    })();

    $: upgradeAvailable = (() => {
        const paths = [
            { from: 'Bronze', count: 10, cost: 50 }, { from: 'Silver', count: 10, cost: 100 },
            { from: 'Gold', count: 10, cost: 200 }, { from: 'Platinum', count: 8, cost: 400 },
            { from: 'Diamond', count: 8, cost: 800 }, { from: 'Master', count: 5, cost: 1500 },
            { from: 'Grandmaster', count: 5, cost: 3000 },
        ];
        const roles = ['TOP','JNG','MID','ADC','SUP','COACH'];
        const sqIds = new Set(Object.values($squad).filter(Boolean).map(c => c.uniqueId));
        let total = 0;
        for (const p of paths) {
            if ($blueEssence < p.cost) continue;
            for (const r of roles) {
                const count = $club.filter(c => c.quality === p.from && c.role === r && !sqIds.has(c.uniqueId) && !c.locked).length;
                if (count >= p.count) total++;
            }
        }
        return total;
    })();

    $: notifications = {
        rewards: (dailyAvailable ? 1 : 0) + (bpCanLevel ? 1 : 0),
        skills: spAvailable ? $skillPoints : 0,
        collection: archiveUnclaimed > 0 ? archiveUnclaimed : 0,
        quests: questBadge,
        upgrade: upgradeAvailable,
    };

    const leftTabs = [
        { id: 'home', label: 'Home', accent: true },
        { id: 'store', label: 'Store', accent: true },
        { id: 'club', label: 'Club' },
        { id: 'squad', label: 'Squad', accent: true },
        { id: 'season', label: 'Season' },
    ];

    const rightTabs = [
        { id: 'quests', label: 'Quests' },
        { id: 'upgrade', label: 'Upgrade' },
        { id: 'skills', label: 'Skills' },
        { id: 'collection', label: 'Archive' },
        { id: 'leaderboard', label: 'Board' },
    ];

    const subTabs = [
        { id: 'welcome', label: 'Welcome' },
        { id: 'guide', label: 'Guide' },
        { id: 'rewards', label: 'Rewards' },
        { id: 'trade', label: 'Trade' },
    ];

    let mobileOpen = false;
    function navTo(tab) { switchTab(tab); mobileOpen = false; }

    let splitTimerDisplay = '';
    let splitTimerInterval = null;

    function updateSplitTimer() {
        const end = $splitCooldownEnd;
        if (!end || end <= Date.now()) {
            splitTimerDisplay = '';
            return;
        }
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        splitTimerDisplay = remaining > 0 ? `${remaining}s` : '';
    }

    $: if ($splitCooldownEnd > 0) {
        updateSplitTimer();
        if (!splitTimerInterval) splitTimerInterval = setInterval(updateSplitTimer, 1000);
    } else {
        splitTimerDisplay = '';
        if (splitTimerInterval) { clearInterval(splitTimerInterval); splitTimerInterval = null; }
    }

    function restoreHeaderCooldown() {
        const saved = localStorage.getItem('lur_split_cooldown');
        if (saved) {
            const end = Number(saved);
            if (end > Date.now()) {
                splitCooldownEnd.set(end);
            }
        }
    }
    restoreHeaderCooldown();
    onDestroy(() => { if (splitTimerInterval) clearInterval(splitTimerInterval); });
</script>

<header class="hdr">
    <div class="hdr-inner">
        <!-- LEFT: Team identity — pinned far left -->
        <div class="hdr-left">
            <button class="mob-toggle mobile-only" on:click={() => mobileOpen = !mobileOpen}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><rect y="3" width="20" height="2" rx="1"/><rect y="9" width="20" height="2" rx="1"/><rect y="15" width="20" height="2" rx="1"/></svg>
            </button>
            <div class="team-chip">
                <span class="team-icon">{$teamIdentity.logo}</span>
                <div class="team-text">
                    <span class="team-n">{$teamIdentity.name}</span>
                    <span class="team-b">💎 {$blueEssence.toLocaleString()}</span>
                </div>
            </div>
            {#if splitTimerDisplay}
                <button class="split-timer" on:click={() => navTo('season')}>
                    <span class="st-icon">⏱</span>
                    <span class="st-time">{splitTimerDisplay}</span>
                </button>
            {/if}
        </div>

        <!-- CENTER: Nav rows — always centered -->
        <div class="hdr-center desktop-only">
            <div class="row-1">
                {#each leftTabs as t}
                    <button class="nt" class:nt-on={$activeTab === t.id} class:nt-accent={t.accent} on:click={() => navTo(t.id)}>{t.label}</button>
                {/each}

                <button class="play" class:play-on={$activeTab === 'tournament'} on:click={() => navTo('tournament')}>
                    P L A Y
                </button>

                {#each rightTabs as t}
                    <button class="nt" class:nt-on={$activeTab === t.id} class:nt-accent={t.accent} on:click={() => navTo(t.id)}>
                        {t.label}
                        {#if notifications[t.id]}<span class="nav-badge">{notifications[t.id]}</span>{/if}
                    </button>
                {/each}
            </div>
            <div class="row-2">
                {#each subTabs as t}
                    <button class="st" class:st-on={$activeTab === t.id} on:click={() => navTo(t.id)}>
                        {t.label}
                        {#if notifications[t.id]}<span class="nav-badge">{notifications[t.id]}</span>{/if}
                    </button>
                {/each}
            </div>
        </div>

        <!-- RIGHT: Account — pinned far right -->
        <div class="hdr-right">
            {#if $prestige > 0}
                <div class="prestige-chip" title="Prestige {$prestige}">{'⭐'.repeat(Math.min($prestige, 5))} P{$prestige}</div>
            {/if}
            <button class="acct" on:click={() => showAuthPanel.set(true)}>
                <span class="acct-icon">👤</span>
                <span class="acct-label desktop-only">{$currentUser ? $currentUser.displayName || 'Account' : 'Sign In'}</span>
            </button>
        </div>
    </div>
</header>

<!-- Mobile Drawer -->
{#if mobileOpen}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="mo" on:click={() => mobileOpen = false}>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="md" on:click|stopPropagation>
        <div class="md-head">
            <span class="text-xl">{$teamIdentity.logo}</span>
            <div>
                <div class="md-team">{$teamIdentity.name}</div>
                <div class="md-be">💎 {$blueEssence.toLocaleString()}</div>
            </div>
        </div>
        <div class="md-list">
            {#each [...leftTabs, { id: 'tournament', label: '⚔️ PLAY' }, ...rightTabs, ...subTabs] as t}
                <button class="md-btn" class:md-on={$activeTab === t.id} on:click={() => navTo(t.id)}>{t.label}</button>
            {/each}
        </div>
    </div>
</div>
{/if}

<style>
    .hdr {
        position: sticky; top: 0; z-index: 50;
        background: rgba(6, 9, 17, 0.92);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border-bottom: 1px solid rgba(100, 140, 255, 0.05);
        box-shadow: 0 0 40px rgba(0,0,0,0.3);
    }
    .hdr-inner {
        display: flex; align-items: center;
        max-width: 1800px; margin: 0 auto;
        padding: 0 20px; height: 80px;
    }

    /* LEFT — fixed to far left */
    .hdr-left { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
    .team-chip {
        display: flex; align-items: center; gap: 8px;
        background: linear-gradient(135deg, rgba(30,41,59,0.6), rgba(15,23,42,0.7));
        border: 1px solid rgba(71,85,105,0.25);
        padding: 4px 14px 4px 6px; border-radius: 100px;
    }
    .team-icon { font-size: 24px; }
    .team-text { display: flex; flex-direction: column; line-height: 1.2; }
    .team-n { font-size: 11px; font-weight: 800; color: #8b99ad; }
    .team-b { font-size: 13px; font-weight: 900; color: #60a5fa; }

    /* Split cooldown timer */
    .split-timer {
        display: flex; align-items: center; gap: 4px;
        padding: 4px 10px; border-radius: 8px;
        background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
        cursor: pointer; transition: all 0.12s;
        animation: timerPulse 2s ease-in-out infinite;
    }
    .split-timer:hover { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.4); }
    @keyframes timerPulse {
        0%, 100% { border-color: rgba(239,68,68,0.25); }
        50% { border-color: rgba(239,68,68,0.5); }
    }
    .st-icon { font-size: 11px; }
    .st-time { font-size: 12px; font-weight: 900; color: #f87171; font-family: monospace; }

    /* CENTER — fills remaining space, content centered */
    .hdr-center {
        flex: 1 1 auto;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 1px; min-width: 0;
    }
    .row-1 { display: flex; align-items: center; gap: 2px; }
    .row-2 { display: flex; align-items: center; gap: 2px; margin-top: 3px; }

    /* Nav tabs */
    .nt {
        padding: 7px 16px; border-radius: 8px;
        font-size: 13px; font-weight: 700; color: #4a5568;
        background: transparent; border: 1px solid transparent;
        cursor: pointer; transition: all 0.12s ease; white-space: nowrap;
    }
    .nt:hover { color: #a0aec0; background: rgba(51,65,85,0.25); }
    .nt-on {
        color: #90cdf4 !important;
        background: rgba(59,130,246,0.08) !important;
        border-color: rgba(59,130,246,0.12) !important;
    }
    .nt-accent { color: #7b8fa8; font-weight: 800; }
    .nt-accent:hover { color: #cbd5e1; }
    .nt-accent.nt-on { color: #93c5fd !important; font-weight: 900; }

    /* Notification badge */
    .nav-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 16px; height: 16px; padding: 0 4px;
        border-radius: 100px; font-size: 9px; font-weight: 900;
        background: #ef4444; color: white;
        margin-left: 4px; line-height: 1;
    }

    /* PLAY */
    .play {
        position: relative; margin: 0 10px;
        padding: 8px 28px; border-radius: 100px;
        background: linear-gradient(135deg, #4338ca 0%, #6366f1 40%, #4f46e5 100%);
        background-size: 200% 200%; animation: pg 3s ease infinite;
        border: 2px solid rgba(129,140,248,0.35);
        color: white; font-size: 12px; font-weight: 900; letter-spacing: 5px;
        cursor: pointer; overflow: hidden;
        box-shadow: 0 0 16px rgba(99,102,241,0.25), 0 0 36px rgba(99,102,241,0.06);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .play:hover {
        transform: scale(1.07);
        box-shadow: 0 0 24px rgba(99,102,241,0.45), 0 0 50px rgba(99,102,241,0.12);
    }
    .play-on {
        border-color: rgba(129,140,248,0.6);
        box-shadow: 0 0 22px rgba(99,102,241,0.45), inset 0 0 10px rgba(99,102,241,0.12);
    }
    @keyframes pg { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }

    /* Sub tabs */
    .st {
        padding: 3px 12px; border-radius: 6px;
        font-size: 11px; font-weight: 700; color: #3d4a5c;
        background: transparent; border: none;
        cursor: pointer; transition: all 0.1s ease;
    }
    .st:hover { color: #8b99ad; }
    .st-on { color: #7dd3fc !important; }

    /* RIGHT — fixed to far right */
    .hdr-right { flex: 0 0 auto; margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .prestige-chip { font-size: 10px; font-weight: 900; color: #fbbf24; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); border-radius: 8px; padding: 4px 8px; white-space: nowrap; }
    .acct {
        display: flex; align-items: center; gap: 6px;
        padding: 8px 16px; border-radius: 10px;
        font-size: 12px; font-weight: 700;
        color: #a5b4fc; background: rgba(67,56,202,0.08);
        border: 1px solid rgba(99,102,241,0.12);
        cursor: pointer; transition: all 0.12s ease;
    }
    .acct:hover { background: rgba(67,56,202,0.16); border-color: rgba(99,102,241,0.25); }
    .acct-icon { font-size: 13px; }
    .acct-label { font-size: 11px; }

    /* MOBILE */
    .mob-toggle {
        width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
        border-radius: 8px; background: transparent; border: 1px solid rgba(51,65,85,0.25);
        color: #94a3b8; cursor: pointer;
    }
    .mo { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
    .md {
        position: absolute; left: 0; top: 0; bottom: 0; width: 280px;
        background: #0a0e1a; border-right: 1px solid rgba(51,65,85,0.2);
        overflow-y: auto; animation: sI 0.2s ease;
    }
    @keyframes sI { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    .md-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px; border-bottom: 1px solid rgba(51,65,85,0.15); }
    .md-team { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .md-be { font-size: 12px; font-weight: 700; color: #60a5fa; }
    .md-list { padding: 8px; }
    .md-btn {
        display: block; width: 100%; text-align: left;
        padding: 11px 16px; border-radius: 10px;
        font-size: 13px; font-weight: 700; color: #8b99ad;
        background: transparent; border: none; cursor: pointer; transition: all 0.1s ease;
    }
    .md-btn:hover { background: rgba(51,65,85,0.3); color: #e2e8f0; }
    .md-on { background: rgba(59,130,246,0.08) !important; color: #90cdf4 !important; }
</style>
