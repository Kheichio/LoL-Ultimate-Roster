<script>
    import { blueEssence, trackStats, club, squad, saveGame, weightedTrophies, managerLevel, questsClaimed, questsRepeatableBaselines, questsRepeatableCounts, achievementsClaimed as achievementsClaimedStore } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    // Quest definitions
    const milestoneQuests = [
        // Collection
        { id: 'mq1', cat: 'collection', desc: 'Open 5 Card Packs', target: 5, stat: 'packs', reward: 500 },
        { id: 'mq2', cat: 'collection', desc: 'Open 25 Card Packs', target: 25, stat: 'packs', reward: 2000 },
        { id: 'mq3', cat: 'collection', desc: 'Open 100 Card Packs', target: 100, stat: 'packs', reward: 5000 },
        { id: 'mq9', cat: 'collection', desc: 'Open 250 Card Packs', target: 250, stat: 'packs', reward: 10000 },
        { id: 'mq4', cat: 'collection', desc: 'Pull a Holographic Card', target: 1, stat: 'holographicPulled', reward: 2000 },
        { id: 'mq5', cat: 'collection', desc: 'Pull 5 Holographic Cards', target: 5, stat: 'holographicPulled', reward: 5000 },
        { id: 'mq8', cat: 'collection', desc: 'Pull 10 Holographic Cards', target: 10, stat: 'holographicPulled', reward: 8000 },
        { id: 'mq6', cat: 'collection', desc: 'Pull a Signature Card', target: 1, stat: 'signaturesPulled', reward: 3000 },
        { id: 'mq7', cat: 'collection', desc: 'Pull 5 Signature Cards', target: 5, stat: 'signaturesPulled', reward: 8000 },
        { id: 'mq60', cat: 'collection', desc: 'Open 500 Card Packs', target: 500, stat: 'packs', reward: 20000 },
        { id: 'mq61', cat: 'collection', desc: 'Pull 25 Holographic Cards', target: 25, stat: 'holographicPulled', reward: 15000 },
        { id: 'mq62', cat: 'collection', desc: 'Pull 10 Signature Cards', target: 10, stat: 'signaturesPulled', reward: 15000 },
        // Economy
        { id: 'mq10', cat: 'economy', desc: 'Sell 10 Cards', target: 10, stat: 'soldCount', reward: 400 },
        { id: 'mq11', cat: 'economy', desc: 'Sell 50 Cards', target: 50, stat: 'soldCount', reward: 1500 },
        { id: 'mq12', cat: 'economy', desc: 'Sell 200 Cards', target: 200, stat: 'soldCount', reward: 4000 },
        { id: 'mq13', cat: 'economy', desc: 'Sell 500 Cards', target: 500, stat: 'soldCount', reward: 8000 },
        { id: 'mq63', cat: 'economy', desc: 'Perform 10 Upgrades', target: 10, stat: 'upgradesPerformed', reward: 3000 },
        { id: 'mq64', cat: 'economy', desc: 'Perform 50 Upgrades', target: 50, stat: 'upgradesPerformed', reward: 10000 },
        // Competitive
        { id: 'mq20', cat: 'competitive', desc: 'Win a Tournament', target: 1, stat: 'tournamentsWon', reward: 800 },
        { id: 'mq21', cat: 'competitive', desc: 'Win 5 Tournaments', target: 5, stat: 'tournamentsWon', reward: 3000 },
        { id: 'mq22', cat: 'competitive', desc: 'Win 25 Tournaments', target: 25, stat: 'tournamentsWon', reward: 8000 },
        { id: 'mq50', cat: 'competitive', desc: 'Win 100 Tournaments', target: 100, stat: 'tournamentsWon', reward: 20000 },
        { id: 'mq23', cat: 'competitive', desc: 'Win a Gaming Cafe', target: 1, stat: 'cafeWins', reward: 500 },
        { id: 'mq24', cat: 'competitive', desc: 'Win 10 Gaming Cafes', target: 10, stat: 'cafeWins', reward: 3000 },
        { id: 'mq25', cat: 'competitive', desc: 'Win 50 Gaming Cafes', target: 50, stat: 'cafeWins', reward: 6000 },
        { id: 'mq26', cat: 'competitive', desc: 'Win a Regional Trophy', target: 1, stat: 'regionalSplitWon', reward: 1000 },
        { id: 'mq27', cat: 'competitive', desc: 'Win 5 Regional Trophies', target: 5, stat: 'regionalSplitWon', reward: 4000 },
        { id: 'mq51', cat: 'competitive', desc: 'Win 25 Regional Trophies', target: 25, stat: 'regionalSplitWon', reward: 10000 },
        { id: 'mq28', cat: 'competitive', desc: 'Win a First Stand', target: 1, stat: 'firstStandWon', reward: 2000 },
        { id: 'mq29', cat: 'competitive', desc: 'Win 5 First Stands', target: 5, stat: 'firstStandWon', reward: 6000 },
        { id: 'mq35', cat: 'competitive', desc: 'Win an MSI', target: 1, stat: 'msiWon', reward: 3000 },
        { id: 'mq36', cat: 'competitive', desc: 'Win 3 MSIs', target: 3, stat: 'msiWon', reward: 8000 },
        { id: 'mq37', cat: 'competitive', desc: 'Win a World Championship', target: 1, stat: 'worldsWon', reward: 5000 },
        { id: 'mq38', cat: 'competitive', desc: 'Win 3 World Championships', target: 3, stat: 'worldsWon', reward: 12000 },
        { id: 'mq65', cat: 'competitive', desc: 'Win a Draft Mode', target: 1, stat: 'draftModesWon', reward: 1500 },
        { id: 'mq66', cat: 'competitive', desc: 'Win 5 Draft Modes', target: 5, stat: 'draftModesWon', reward: 5000 },
        { id: 'mq67', cat: 'competitive', desc: 'Win 25 Draft Modes', target: 25, stat: 'draftModesWon', reward: 12000 },
        { id: 'mq68', cat: 'competitive', desc: 'Play 10 Draft Modes', target: 10, stat: 'draftModesPlayed', reward: 3000 },
        { id: 'mq69', cat: 'competitive', desc: 'Play 50 Draft Modes', target: 50, stat: 'draftModesPlayed', reward: 10000 },
        { id: 'mq70', cat: 'competitive', desc: 'Win 10 First Stands', target: 10, stat: 'firstStandWon', reward: 12000 },
        { id: 'mq71', cat: 'competitive', desc: 'Win 5 MSIs', target: 5, stat: 'msiWon', reward: 15000 },
        { id: 'mq72', cat: 'competitive', desc: 'Win 5 World Championships', target: 5, stat: 'worldsWon', reward: 25000 },
        { id: 'mq73', cat: 'competitive', desc: 'Win 100 Gaming Cafes', target: 100, stat: 'cafeWins', reward: 12000 },
        // Progression
        { id: 'mq30', cat: 'progression', desc: 'Complete a Season Split', target: 1, stat: 'splitsCompleted', reward: 2000 },
        { id: 'mq31', cat: 'progression', desc: 'Complete 5 Season Splits', target: 5, stat: 'splitsCompleted', reward: 5000 },
        { id: 'mq32', cat: 'progression', desc: 'Complete 25 Season Splits', target: 25, stat: 'splitsCompleted', reward: 12000 },
        { id: 'mq39', cat: 'progression', desc: 'Complete 50 Season Splits', target: 50, stat: 'splitsCompleted', reward: 20000 },
        { id: 'mq33', cat: 'progression', desc: 'Complete a Golden Road', target: 1, stat: 'goldenRoads', reward: 5000 },
        { id: 'mq34', cat: 'progression', desc: 'Complete 5 Golden Roads', target: 5, stat: 'goldenRoads', reward: 15000 },
        { id: 'mq40', cat: 'progression', desc: 'Complete 10 Golden Roads', target: 10, stat: 'goldenRoads', reward: 25000 },
        { id: 'mq41', cat: 'progression', desc: 'Reach Tower Floor 10', target: 10, stat: 'towerHighestFloor', reward: 2000 },
        { id: 'mq42', cat: 'progression', desc: 'Reach Tower Floor 25', target: 25, stat: 'towerHighestFloor', reward: 5000 },
        { id: 'mq43', cat: 'progression', desc: 'Reach Tower Floor 50', target: 50, stat: 'towerHighestFloor', reward: 10000 },
        { id: 'mq44', cat: 'progression', desc: 'Reach Tower Floor 100', target: 100, stat: 'towerHighestFloor', reward: 20000 },
        { id: 'mq74', cat: 'progression', desc: 'Reach Tower Floor 200', target: 200, stat: 'towerHighestFloor', reward: 40000 },
        { id: 'mq75', cat: 'progression', desc: 'Complete 100 Season Splits', target: 100, stat: 'splitsCompleted', reward: 35000 },
        { id: 'mq76', cat: 'progression', desc: 'Complete 25 Golden Roads', target: 25, stat: 'goldenRoads', reward: 40000 },
    ];

    const repeatableQuests = [
        { id: 'rq1', desc: 'Open 3 Packs', target: 3, stat: 'packs', reward: 300 },
        { id: 'rq6', desc: 'Open 5 Packs', target: 5, stat: 'packs', reward: 500 },
        { id: 'rq2', desc: 'Win 3 Tournaments', target: 3, stat: 'tournamentsWon', reward: 500 },
        { id: 'rq4', desc: 'Win 5 Gaming Cafes', target: 5, stat: 'cafeWins', reward: 600 },
        { id: 'rq3', desc: 'Sell 5 Cards', target: 5, stat: 'soldCount', reward: 200 },
        { id: 'rq7', desc: 'Sell 10 Cards', target: 10, stat: 'soldCount', reward: 300 },
        { id: 'rq5', desc: 'Complete 2 Season Splits', target: 2, stat: 'splitsCompleted', reward: 800 },
        { id: 'rq8', desc: 'Win 2 Draft Modes', target: 2, stat: 'draftModesWon', reward: 700 },
        { id: 'rq9', desc: 'Win 10 Tournaments', target: 10, stat: 'tournamentsWon', reward: 1200 },
        { id: 'rq10', desc: 'Perform 5 Upgrades', target: 5, stat: 'upgradesPerformed', reward: 500 },
    ];

    const achievements = [
        { id: 'a1', desc: 'Field a Squad Averaging 80+ Rating', type: 'squadAvg', target: 80, reward: 1500 },
        { id: 'a2', desc: 'Field a Squad Averaging 90+ Rating', type: 'squadAvg', target: 90, reward: 3000 },
        { id: 'a3', desc: 'Field a Squad Averaging 95+ Rating', type: 'squadAvg', target: 95, reward: 6000 },
        { id: 'a4', desc: 'Own 50 Cards', type: 'clubSize', target: 50, reward: 1000 },
        { id: 'a5', desc: 'Own 200 Cards', type: 'clubSize', target: 200, reward: 4000 },
        { id: 'a6', desc: 'Own 500 Cards', type: 'clubSize', target: 500, reward: 8000 },
        { id: 'a7', desc: 'Earn 50 Trophy Points', type: 'trophies', target: 50, reward: 5000 },
        { id: 'a8', desc: 'Earn 200 Trophy Points', type: 'trophies', target: 200, reward: 15000 },
        { id: 'a14', desc: 'Earn 500 Trophy Points', type: 'trophies', target: 500, reward: 20000 },
        { id: 'a15', desc: 'Earn 1000 Trophy Points', type: 'trophies', target: 1000, reward: 50000 },
        { id: 'a9', desc: 'Own 10 Signature Cards', type: 'sigCards', target: 10, reward: 8000 },
        { id: 'a10', desc: 'Own 25 Holographic Cards', type: 'holoCards', target: 25, reward: 6000 },
        { id: 'a11', desc: 'Reach Manager Level 10', type: 'managerLvl', target: 10, reward: 3000 },
        { id: 'a12', desc: 'Reach Manager Level 25', type: 'managerLvl', target: 25, reward: 8000 },
        { id: 'a13', desc: 'Reach Manager Level 50', type: 'managerLvl', target: 50, reward: 15000 },
        { id: 'a16', desc: 'Reach Tower Floor 50', type: 'towerBest', target: 50, reward: 10000 },
        { id: 'a17', desc: 'Reach Tower Floor 100', type: 'towerBest', target: 100, reward: 25000 },
        { id: 'a18', desc: 'Own 1000 Cards', type: 'clubSize', target: 1000, reward: 15000 },
        { id: 'a19', desc: 'Field a Squad Averaging 98+ Rating', type: 'squadAvg', target: 98, reward: 12000 },
        { id: 'a20', desc: 'Reach Manager Level 100', type: 'managerLvl', target: 100, reward: 30000 },
        { id: 'a21', desc: 'Reach Tower Floor 200', type: 'towerBest', target: 200, reward: 50000 },
        { id: 'a22', desc: 'Own 5 Signature Cards', type: 'sigCards', target: 5, reward: 5000 },
        { id: 'a23', desc: 'Own 50 Holographic Cards', type: 'holoCards', target: 50, reward: 12000 },
        { id: 'a24', desc: 'Win 10 Draft Modes', type: 'draftWins', target: 10, reward: 8000 },
        { id: 'a25', desc: 'Win 50 Draft Modes', type: 'draftWins', target: 50, reward: 20000 },
    ];

    $: claimed = $questsClaimed;
    $: repeatableBaselines = $questsRepeatableBaselines;
    $: repeatableCounts = $questsRepeatableCounts;
    $: achievementsClaimed = $achievementsClaimedStore;

    function getProgress(stat) { return $trackStats[stat] || 0; }
    function getRepeatableProgress(q) {
        const base = repeatableBaselines[q.id] || 0;
        return Math.max(0, getProgress(q.stat) - base);
    }
    function getAchievementProgress(a) {
        try {
            if (a.type === 'squadAvg') {
                const starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
                return starters.length > 0 ? Math.round(starters.reduce((s, c) => s + (c.rating || 0), 0) / starters.length) : 0;
            }
            if (a.type === 'clubSize') return ($club || []).length;
            if (a.type === 'trophies') return $weightedTrophies || 0;
            if (a.type === 'sigCards') return ($club || []).filter(c => c && c.signature).length;
            if (a.type === 'holoCards') return ($club || []).filter(c => c && c.holographic).length;
            if (a.type === 'managerLvl') return $managerLevel || 1;
            if (a.type === 'towerBest') return $trackStats.towerHighestFloor || 0;
            if (a.type === 'draftWins') return $trackStats.draftModesWon || 0;
        } catch(e) { return 0; }
        return 0;
    }

    function claimMilestone(q) {
        if (claimed[q.id] || getProgress(q.stat) < q.target) return;
        questsClaimed.update(c => ({ ...c, [q.id]: true }));
        blueEssence.update(v => v + q.reward);
        playSound('claim');
        showToast(`Quest complete! +${q.reward} BE`, 'success');
        saveGame();
    }

    function getRepeatableClaimCount(q) {
        const progress = getRepeatableProgress(q);
        return Math.floor(progress / q.target);
    }

    function claimRepeatable(q) {
        const times = getRepeatableClaimCount(q);
        if (times <= 0) return;
        const base = repeatableBaselines[q.id] || 0;
        const totalReward = q.reward * times;
        questsRepeatableBaselines.update(b => ({ ...b, [q.id]: base + q.target * times }));
        questsRepeatableCounts.update(c => ({ ...c, [q.id]: (c[q.id] || 0) + times }));
        blueEssence.update(v => v + totalReward);
        playSound('claim');
        showToast(`Contract claimed ×${times}! +${totalReward} BE`, 'success');
        saveGame();
    }

    function claimAchievement(a) {
        if (achievementsClaimed[a.id] || getAchievementProgress(a) < a.target) return;
        achievementsClaimedStore.update(c => ({ ...c, [a.id]: true }));
        blueEssence.update(v => v + a.reward);
        playSound('claim');
        showToast(`Achievement unlocked! +${a.reward} BE`, 'success');
        saveGame();
    }

    let activeSubTab = 'milestones';

    const questCategories = [
        { id: 'collection', label: '📦 Collection', color: 'blue',
          textColor: 'text-blue-400', barColor: 'bg-blue-500',
          doneRow: 'border-blue-700/40 bg-blue-950/20',
          claimBtn: 'bg-blue-500 hover:bg-blue-400 text-slate-900' },
        { id: 'economy', label: '💰 Economy', color: 'emerald',
          textColor: 'text-emerald-400', barColor: 'bg-emerald-500',
          doneRow: 'border-emerald-700/40 bg-emerald-950/20',
          claimBtn: 'bg-emerald-500 hover:bg-emerald-400 text-slate-900' },
        { id: 'competitive', label: '⚔️ Competitive', color: 'amber',
          textColor: 'text-amber-400', barColor: 'bg-amber-500',
          doneRow: 'border-amber-700/40 bg-amber-950/20',
          claimBtn: 'bg-amber-500 hover:bg-amber-400 text-slate-900' },
        { id: 'progression', label: '🏆 Progression', color: 'purple',
          textColor: 'text-purple-400', barColor: 'bg-purple-500',
          doneRow: 'border-purple-700/40 bg-purple-950/20',
          claimBtn: 'bg-purple-500 hover:bg-purple-400 text-slate-900' },
    ];

    $: milestoneByCat = (() => {
        const map = {};
        questCategories.forEach(c => { map[c.id] = milestoneQuests.filter(q => q.cat === c.id); });
        return map;
    })();

    $: catCompletion = (() => {
        const map = {};
        questCategories.forEach(c => {
            const quests = milestoneByCat[c.id];
            map[c.id] = { done: quests.filter(q => claimed[q.id]).length, total: quests.length };
        });
        return map;
    })();

    $: totalMilestones = milestoneQuests.length;
    $: doneMilestones = milestoneQuests.filter(q => claimed[q.id]).length;
    $: totalAchievements = achievements.length;
    $: doneAchievements = achievements.filter(a => achievementsClaimed[a.id]).length;

    $: claimableMilestones = (() => { try { return milestoneQuests.filter(q => !claimed[q.id] && ($trackStats[q.stat] || 0) >= q.target).length; } catch(e) { return 0; } })();
    $: claimableContracts = (() => { try { let c = 0; repeatableQuests.forEach(q => { const base = ($questsRepeatableBaselines)[q.id] || 0; const prog = Math.max(0, ($trackStats[q.stat] || 0) - base); c += Math.floor(prog / q.target); }); return c; } catch(e) { return 0; } })();
    $: claimableAchievements = (() => { try { return achievements.filter(a => !achievementsClaimed[a.id] && getAchievementProgress(a) >= a.target).length; } catch(e) { return 0; } })();
</script>

<section class="quests-page">
    <div class="page-header">
        <h2 class="page-title">Quests & Achievements</h2>
    </div>

    <!-- Sub tabs -->
    <div class="tab-bar">
        {#each [
            { id: 'milestones', label: '🏆 Milestones', count: `${doneMilestones}/${totalMilestones}`, badge: claimableMilestones },
            { id: 'contracts', label: '🔄 Contracts', count: '', badge: claimableContracts },
            { id: 'achievements', label: '🎖️ Achievements', count: `${doneAchievements}/${totalAchievements}`, badge: claimableAchievements },
        ] as tab}
            <button
                class="tab-btn {activeSubTab === tab.id ? 'tab-active' : ''}"
                on:click={() => { activeSubTab = tab.id; }}
            >
                {tab.label}
                {#if tab.badge > 0}<span class="tab-badge">{tab.badge}</span>{/if}
                {#if tab.count}
                    <span class="tab-count">{tab.count}</span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- MILESTONES -->
    {#if activeSubTab === 'milestones'}
        <div class="section-list">
            {#each questCategories as cat}
                {@const quests = milestoneByCat[cat.id]}
                {@const comp = catCompletion[cat.id]}
                {@const allDone = comp.done === comp.total}
                {@const colors = {
                    blue:    { text: '#60a5fa', bar: '#3b82f6', doneBorder: 'rgba(29,78,216,0.4)',  doneBg: 'rgba(23,37,84,0.2)',  btnBg: '#3b82f6', btnHover: '#60a5fa' },
                    emerald: { text: '#34d399', bar: '#10b981', doneBorder: 'rgba(4,120,87,0.4)',   doneBg: 'rgba(2,44,34,0.2)',   btnBg: '#10b981', btnHover: '#34d399' },
                    amber:   { text: '#fbbf24', bar: '#f59e0b', doneBorder: 'rgba(180,83,9,0.4)',   doneBg: 'rgba(69,26,3,0.2)',   btnBg: '#f59e0b', btnHover: '#fbbf24' },
                    purple:  { text: '#c084fc', bar: '#a855f7', doneBorder: 'rgba(126,34,206,0.4)', doneBg: 'rgba(59,7,100,0.2)',  btnBg: '#a855f7', btnHover: '#c084fc' },
                }[cat.color]}
                <div class="cat-panel">
                    <!-- Category header -->
                    <button
                        class="cat-header"
                        on:click={() => { document.getElementById(`cat-${cat.id}`)?.classList.toggle('hidden'); }}
                    >
                        <div class="cat-header-left">
                            <h3 class="cat-label" style="color: {colors.text}">{cat.label}</h3>
                            {#if allDone}
                                <span class="complete-badge">✓ COMPLETE</span>
                            {/if}
                        </div>
                        <span class="cat-count">{comp.done}/{comp.total}</span>
                    </button>
                    <!-- Quest rows -->
                    <div id="cat-{cat.id}" class="cat-body {allDone ? 'hidden' : ''}">
                        {#each quests as q}
                            {@const progress = getProgress(q.stat)}
                            {@const isDone = progress >= q.target}
                            {@const isClaimed = claimed[q.id]}
                            <div
                                class="quest-row"
                                style="
                                    {isClaimed ? 'border-color: rgba(30,41,59,0.6); background: rgba(15,23,42,0.3); opacity: 0.4;' :
                                     isDone ? `border-color: ${colors.doneBorder}; background: ${colors.doneBg};` :
                                     'border-color: rgba(51,65,85,0.4); background: rgba(30,41,59,0.4);'}
                                "
                            >
                                <div class="quest-info">
                                    <div class="quest-desc" style="{isClaimed ? 'color: #475569; text-decoration: line-through;' : 'color: #e2e8f0;'}">{q.desc}</div>
                                    <div class="progress-track">
                                        <div class="progress-fill" style="width: {Math.min(100, (progress / q.target) * 100)}%; background: {colors.bar}"></div>
                                    </div>
                                </div>
                                {#if isClaimed}
                                    <span class="claimed-label">Claimed</span>
                                {:else if isDone}
                                    <button
                                        class="claim-btn"
                                        style="background: {colors.btnBg}; color: #0f172a;"
                                        on:mouseenter={(e) => e.currentTarget.style.background = colors.btnHover}
                                        on:mouseleave={(e) => e.currentTarget.style.background = colors.btnBg}
                                        on:click={() => claimMilestone(q)}
                                    >Claim {q.reward} BE</button>
                                {:else}
                                    <span class="progress-label">{progress}/{q.target}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>

    <!-- CONTRACTS -->
    {:else if activeSubTab === 'contracts'}
        <div class="section-list contracts">
            <p class="section-hint">Repeatable quests — progress resets after each claim. Infinite completions.</p>
            {#each repeatableQuests as q}
                {@const progress = getRepeatableProgress(q)}
                {@const claimable = getRepeatableClaimCount(q)}
                {@const claimed = repeatableCounts[q.id] || 0}
                {@const progressInCycle = progress - (claimable * q.target)}
                <div
                    class="quest-row"
                    style="
                        {claimable > 0 ? 'border-color: rgba(14,116,144,0.4); background: rgba(8,51,68,0.2);' :
                         'border-color: rgba(51,65,85,0.4); background: rgba(30,41,59,0.4);'}
                    "
                >
                    <div class="quest-info">
                        <div class="quest-desc" style="color: #e2e8f0;">
                            {q.desc}
                            {#if claimed > 0}
                                <span style="color: #06b6d4; margin-left: 4px;">×{claimed}</span>
                            {/if}
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: {claimable > 0 ? 100 : Math.min(100, (progressInCycle / q.target) * 100)}%; background: #06b6d4;"></div>
                        </div>
                    </div>
                    {#if claimable > 0}
                        <button
                            class="claim-btn"
                            style="background: #06b6d4; color: #0f172a;"
                            on:mouseenter={(e) => e.currentTarget.style.background = '#22d3ee'}
                            on:mouseleave={(e) => e.currentTarget.style.background = '#06b6d4'}
                            on:click={() => claimRepeatable(q)}
                        >Claim ×{claimable} · {q.reward * claimable} BE</button>
                    {:else}
                        <span class="progress-label">{progressInCycle}/{q.target}</span>
                    {/if}
                </div>
            {/each}
        </div>

    <!-- ACHIEVEMENTS -->
    {:else if activeSubTab === 'achievements'}
        <div class="section-list contracts">
            <p class="section-hint">Live state checks — progress updates based on your current squad, club, and stats.</p>
            {#each achievements as a}
                {@const progress = getAchievementProgress(a)}
                {@const isDone = progress >= a.target}
                {@const isClaimed = achievementsClaimed[a.id]}
                <div
                    class="quest-row"
                    style="
                        {isClaimed ? 'border-color: rgba(30,41,59,0.6); background: rgba(15,23,42,0.3); opacity: 0.4;' :
                         isDone ? 'border-color: rgba(109,40,217,0.4); background: rgba(46,16,101,0.2);' :
                         'border-color: rgba(51,65,85,0.4); background: rgba(30,41,59,0.4);'}
                    "
                >
                    <div class="quest-info">
                        <div class="quest-desc" style="{isClaimed ? 'color: #475569; text-decoration: line-through;' : 'color: #e2e8f0;'}">{a.desc}</div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: {Math.min(100, (progress / a.target) * 100)}%; background: #8b5cf6;"></div>
                        </div>
                    </div>
                    {#if isClaimed}
                        <span class="claimed-label">Claimed</span>
                    {:else if isDone}
                        <button
                            class="claim-btn"
                            style="background: #8b5cf6; color: #fff;"
                            on:mouseenter={(e) => e.currentTarget.style.background = '#a78bfa'}
                            on:mouseleave={(e) => e.currentTarget.style.background = '#8b5cf6'}
                            on:click={() => claimAchievement(a)}
                        >Claim {a.reward} BE</button>
                    {:else}
                        <span class="progress-label">{Math.min(progress, a.target)}/{a.target}</span>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</section>

<style>
    /* Page layout */
    .quests-page {
        max-width: 900px;
        margin: 0 auto;
        padding: 8px 0 40px;
    }

    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
    }

    .page-title {
        font-size: 22px;
        font-weight: 900;
        color: #facc15;
        letter-spacing: 0.5px;
    }

    /* Tab bar */
    .tab-bar {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
        background: rgba(12,16,28,0.5);
        padding: 6px;
        border-radius: 14px;
        border: 1px solid rgba(51,65,85,0.2);
    }

    .tab-btn {
        flex: 1;
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        cursor: pointer;
        transition: all 0.12s;
        color: #64748b;
        background: transparent;
        border: 1px solid transparent;
    }

    .tab-btn:hover {
        color: #e2e8f0;
        background: rgba(51,65,85,0.35);
    }

    .tab-btn.tab-active {
        background: rgba(202,138,4,0.2);
        border-color: rgba(234,179,8,0.4);
        color: #fde047;
        box-shadow: inset 0 1px 4px rgba(0,0,0,0.15);
    }

    .tab-count {
        margin-left: 4px;
        font-size: 9px;
        font-family: monospace;
        opacity: 0.6;
    }

    .tab-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 16px; height: 16px; padding: 0 4px;
        border-radius: 100px; font-size: 9px; font-weight: 900;
        background: #ef4444; color: white;
        margin-left: 4px; line-height: 1;
    }

    /* Section list spacing */
    .section-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .section-list.contracts {
        gap: 8px;
    }

    .section-hint {
        font-size: 10px;
        color: #64748b;
        margin-bottom: 4px;
    }

    /* Category panel */
    .cat-panel {
        background: rgba(12,16,28,0.5);
        border-radius: 16px;
        border: 1px solid rgba(51,65,85,0.2);
        overflow: hidden;
    }

    .cat-header {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        cursor: pointer;
        background: transparent;
        border: none;
        text-align: left;
        transition: background 0.12s;
    }

    .cat-header:hover {
        background: rgba(51,65,85,0.15);
    }

    .cat-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .cat-label {
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 1.5px;
    }

    .complete-badge {
        font-size: 9px;
        font-weight: 900;
        background: rgba(4,120,87,0.25);
        color: #34d399;
        padding: 2px 10px;
        border-radius: 100px;
    }

    .cat-count {
        font-size: 10px;
        font-family: monospace;
        color: #64748b;
    }

    .cat-body {
        padding: 0 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .cat-body.hidden {
        display: none;
    }

    /* Quest row */
    .quest-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid;
        transition: opacity 0.12s;
    }

    .quest-info {
        flex: 1;
        min-width: 0;
    }

    .quest-desc {
        font-size: 12px;
        font-weight: 700;
    }

    /* Progress bar */
    .progress-track {
        width: 100%;
        height: 6px;
        background: rgba(15,23,42,0.8);
        border-radius: 100px;
        overflow: hidden;
        margin-top: 6px;
        border: 1px solid rgba(51,65,85,0.2);
    }

    .progress-fill {
        height: 100%;
        border-radius: 100px;
        transition: width 0.3s;
    }

    /* Labels */
    .claimed-label {
        font-size: 10px;
        font-weight: 700;
        color: #475569;
        flex-shrink: 0;
    }

    .progress-label {
        flex-shrink: 0;
        font-size: 10px;
        font-family: monospace;
        color: #64748b;
        width: 60px;
        text-align: right;
    }

    /* Claim button */
    .claim-btn {
        flex-shrink: 0;
        padding: 6px 12px;
        border-radius: 10px;
        font-weight: 900;
        font-size: 10px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.12s;
        border: none;
        letter-spacing: 0.3px;
    }
</style>
