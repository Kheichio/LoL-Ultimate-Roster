<script>
    import { blueEssence, trackStats, club, squad, academy, rbcState, battlePass, prestige, collectionRegistry, saveGame, weightedTrophies, managerLevel, questsClaimed, questsRepeatableBaselines, questsRepeatableCounts, achievementsClaimed as achievementsClaimedStore, grantBE } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { HALL_OF_LEGENDS } from '../../utils/cards.js';
    import { todayKey, claimedToday } from '../../utils/rbc.js';
    import { milestoneQuests, repeatableQuests, achievements, LINEUP_ROLES, lineupAvg } from '../../utils/quests.js';
    import { get } from 'svelte/store';

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
            if (a.type === 'squadAvg') return lineupAvg($squad);
            if (a.type === 'academySize') return LINEUP_ROLES.filter(r => $academy[r]).length;
            if (a.type === 'academyAvg') return lineupAvg($academy);
            if (a.type === 'clubSize') return ($club || []).length;
            if (a.type === 'discovered') return Object.keys($collectionRegistry || {}).length;
            if (a.type === 'trophies') return $weightedTrophies || 0;
            if (a.type === 'sigCards') return ($club || []).filter(c => c && c.signature).length;
            if (a.type === 'holoCards') return ($club || []).filter(c => c && c.holographic).length;
            if (a.type === 'holCards') return ($club || []).filter(c => c && c.quality === HALL_OF_LEGENDS).length;
            if (a.type === 'be') return $blueEssence || 0;
            if (a.type === 'managerLvl') return $managerLevel || 1;
            if (a.type === 'prestige') return $prestige || 0;
            if (a.type === 'bpTier') return $battlePass.tier || 0;
            if (a.type === 'towerBest') return $trackStats.towerHighestFloor || 0;
            if (a.type === 'draftWins') return $trackStats.draftModesWon || 0;
            // Daily RBCs — only today's clears count, so this resets with the challenges.
            if (a.type === 'rbcToday') return Object.keys(claimedToday($rbcState, todayKey(Date.now()))).length;
        } catch(e) { return 0; }
        return 0;
    }

    // Compact label so six-figure targets (Blue Essence) still fit the progress column.
    function fmtProgress(n) {
        return n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n);
    }

    function claimMilestone(q) {
        if (claimed[q.id] || getProgress(q.stat) < q.target) return;
        questsClaimed.update(c => ({ ...c, [q.id]: true }));
        const { total: qTotal, bonus: qBonus } = grantBE(q.reward);
        playSound('claim');
        showToast(`Quest complete! +${qTotal} BE${qBonus > 0 ? ` (+${qBonus} Wealth)` : ''}`, 'success');
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
        const { total: rTotal, bonus: rBonus } = grantBE(totalReward);
        playSound('claim');
        showToast(`Contract claimed ×${times}! +${rTotal} BE${rBonus > 0 ? ` (+${rBonus} Wealth)` : ''}`, 'success');
        saveGame();
    }

    function claimAchievement(a) {
        if (achievementsClaimed[a.id] || getAchievementProgress(a) < a.target) return;
        achievementsClaimedStore.update(c => ({ ...c, [a.id]: true }));
        const { total: aTotal, bonus: aBonus } = grantBE(a.reward);
        playSound('claim');
        showToast(`Achievement unlocked! +${aTotal} BE${aBonus > 0 ? ` (+${aBonus} Wealth)` : ''}`, 'success');
        saveGame();
    }

    let activeSubTab = 'milestones';

    // One category list drives all three sub-tabs, so a quest, a contract and an
    // achievement about the same system always sit under the same heading, in the
    // same order. `color` keys into CAT_COLORS below.
    const questCategories = [
        { id: 'collection',  label: '📦 Collection',  color: 'blue' },
        { id: 'squad',       label: '🛡️ Squad',       color: 'sky' },
        { id: 'economy',     label: '💰 Economy',     color: 'emerald' },
        { id: 'competitive', label: '⚔️ Competitive', color: 'amber' },
        { id: 'challenges',  label: '🧩 Challenges',  color: 'rose' },
        { id: 'progression', label: '🏆 Progression', color: 'purple' },
    ];

    const CAT_COLORS = {
        blue:    { text: '#60a5fa', bar: '#3b82f6', doneBorder: 'rgba(29,78,216,0.4)',  doneBg: 'rgba(23,37,84,0.2)',  btnBg: '#3b82f6', btnHover: '#60a5fa' },
        sky:     { text: '#38bdf8', bar: '#0ea5e9', doneBorder: 'rgba(3,105,161,0.4)',  doneBg: 'rgba(8,47,73,0.2)',   btnBg: '#0ea5e9', btnHover: '#38bdf8' },
        emerald: { text: '#34d399', bar: '#10b981', doneBorder: 'rgba(4,120,87,0.4)',   doneBg: 'rgba(2,44,34,0.2)',   btnBg: '#10b981', btnHover: '#34d399' },
        amber:   { text: '#fbbf24', bar: '#f59e0b', doneBorder: 'rgba(180,83,9,0.4)',   doneBg: 'rgba(69,26,3,0.2)',   btnBg: '#f59e0b', btnHover: '#fbbf24' },
        rose:    { text: '#fb7185', bar: '#f43f5e', doneBorder: 'rgba(190,18,60,0.4)',  doneBg: 'rgba(76,5,25,0.2)',   btnBg: '#f43f5e', btnHover: '#fb7185' },
        purple:  { text: '#c084fc', bar: '#a855f7', doneBorder: 'rgba(126,34,206,0.4)', doneBg: 'rgba(59,7,100,0.2)',  btnBg: '#a855f7', btnHover: '#c084fc' },
    };

    // Categories a list actually uses — an empty section would render as "0/0 COMPLETE".
    function catsFor(list) {
        return questCategories.filter(c => list.some(q => q.cat === c.id));
    }
    const milestoneCats = catsFor(milestoneQuests);
    const contractCats = catsFor(repeatableQuests);
    const achievementCats = catsFor(achievements);

    const milestoneByCat = {};
    milestoneCats.forEach(c => { milestoneByCat[c.id] = milestoneQuests.filter(q => q.cat === c.id); });
    const contractsByCat = {};
    contractCats.forEach(c => { contractsByCat[c.id] = repeatableQuests.filter(q => q.cat === c.id); });
    const achievementsByCat = {};
    achievementCats.forEach(c => { achievementsByCat[c.id] = achievements.filter(a => a.cat === c.id); });

    $: catCompletion = (() => {
        const map = {};
        milestoneCats.forEach(c => {
            const quests = milestoneByCat[c.id];
            map[c.id] = { done: quests.filter(q => claimed[q.id]).length, total: quests.length };
        });
        return map;
    })();

    $: achCompletion = (() => {
        const map = {};
        achievementCats.forEach(c => {
            const list = achievementsByCat[c.id];
            map[c.id] = { done: list.filter(a => achievementsClaimed[a.id]).length, total: list.length };
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
            {#each milestoneCats as cat}
                {@const quests = milestoneByCat[cat.id]}
                {@const comp = catCompletion[cat.id]}
                {@const allDone = comp.done === comp.total}
                {@const colors = CAT_COLORS[cat.color]}
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
        <div class="section-list">
            <p class="section-hint">Repeatable quests — progress resets after each claim. Infinite completions.</p>
            {#each contractCats as cat}
                {@const colors = CAT_COLORS[cat.color]}
                <div class="group">
                    <div class="group-head" style="color: {colors.text}">{cat.label}</div>
                    <div class="group-body">
                        {#each contractsByCat[cat.id] as q}
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
                </div>
            {/each}
        </div>

    <!-- ACHIEVEMENTS -->
    {:else if activeSubTab === 'achievements'}
        <div class="section-list">
            <p class="section-hint">Live state checks — progress updates based on your current squad, club, and stats.</p>
            {#each achievementCats as cat}
                {@const colors = CAT_COLORS[cat.color]}
                {@const comp = achCompletion[cat.id]}
                <div class="group">
                    <div class="group-head" style="color: {colors.text}">
                        {cat.label}
                        <span class="group-count">{comp.done}/{comp.total}</span>
                    </div>
                    <div class="group-body">
                        {#each achievementsByCat[cat.id] as a}
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
                                    <span class="progress-label">{fmtProgress(Math.min(progress, a.target))}/{fmtProgress(a.target)}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
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

    .section-hint {
        font-size: 10px;
        color: #64748b;
        margin-bottom: 4px;
    }

    /* Category group — the flat Contracts / Achievements lists use the same headings
       as the Milestones panels, minus the collapsible chrome. */
    .group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 1.5px;
    }

    .group-count {
        font-size: 10px;
        font-family: monospace;
        color: #64748b;
        letter-spacing: 0;
        text-transform: none;
    }

    .group-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
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
        min-width: 60px;
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
