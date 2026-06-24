<script>
    import { blueEssence, trackStats, club, squad, saveGame, weightedTrophies, questsClaimed, questsRepeatableBaselines, questsRepeatableCounts, achievementsClaimed as achievementsClaimedStore } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    // Quest definitions
    const milestoneQuests = [
        // Collection
        { id: 'mq1', cat: 'collection', desc: 'Open 5 Card Packs', target: 5, stat: 'packs', reward: 500 },
        { id: 'mq2', cat: 'collection', desc: 'Open 25 Card Packs', target: 25, stat: 'packs', reward: 2000 },
        { id: 'mq3', cat: 'collection', desc: 'Open 100 Card Packs', target: 100, stat: 'packs', reward: 5000 },
        { id: 'mq4', cat: 'collection', desc: 'Pull a Holographic Card', target: 1, stat: 'holographicPulled', reward: 2000 },
        { id: 'mq5', cat: 'collection', desc: 'Pull 5 Holographic Cards', target: 5, stat: 'holographicPulled', reward: 5000 },
        // Economy
        { id: 'mq10', cat: 'economy', desc: 'Sell 10 Cards', target: 10, stat: 'soldCount', reward: 400 },
        { id: 'mq11', cat: 'economy', desc: 'Sell 50 Cards', target: 50, stat: 'soldCount', reward: 1500 },
        { id: 'mq12', cat: 'economy', desc: 'Sell 200 Cards', target: 200, stat: 'soldCount', reward: 4000 },
        // Competitive
        { id: 'mq20', cat: 'competitive', desc: 'Win a Tournament', target: 1, stat: 'tournamentsWon', reward: 800 },
        { id: 'mq21', cat: 'competitive', desc: 'Win 5 Tournaments', target: 5, stat: 'tournamentsWon', reward: 3000 },
        { id: 'mq22', cat: 'competitive', desc: 'Win 25 Tournaments', target: 25, stat: 'tournamentsWon', reward: 8000 },
        { id: 'mq23', cat: 'competitive', desc: 'Win a Gaming Cafe', target: 1, stat: 'cafeWins', reward: 500 },
        { id: 'mq24', cat: 'competitive', desc: 'Win 10 Gaming Cafes', target: 10, stat: 'cafeWins', reward: 3000 },
        { id: 'mq25', cat: 'competitive', desc: 'Win 50 Gaming Cafes', target: 50, stat: 'cafeWins', reward: 6000 },
        // Progression
        { id: 'mq30', cat: 'progression', desc: 'Complete a Season Split', target: 1, stat: 'splitsCompleted', reward: 2000 },
        { id: 'mq31', cat: 'progression', desc: 'Complete 5 Season Splits', target: 5, stat: 'splitsCompleted', reward: 5000 },
        { id: 'mq32', cat: 'progression', desc: 'Complete 25 Season Splits', target: 25, stat: 'splitsCompleted', reward: 12000 },
        { id: 'mq33', cat: 'progression', desc: 'Complete a Golden Road', target: 1, stat: 'goldenRoads', reward: 5000 },
        { id: 'mq34', cat: 'progression', desc: 'Complete 5 Golden Roads', target: 5, stat: 'goldenRoads', reward: 15000 },
    ];

    const repeatableQuests = [
        { id: 'rq1', desc: 'Open 3 Packs', target: 3, stat: 'packs', reward: 300 },
        { id: 'rq2', desc: 'Win 3 Tournaments', target: 3, stat: 'tournamentsWon', reward: 500 },
        { id: 'rq3', desc: 'Sell 5 Cards', target: 5, stat: 'soldCount', reward: 200 },
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
        if (a.type === 'squadAvg') {
            const starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
            return starters.length > 0 ? Math.round(starters.reduce((s, c) => s + c.rating, 0) / starters.length) : 0;
        }
        if (a.type === 'clubSize') return $club.length;
        if (a.type === 'trophies') return $weightedTrophies;
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

    function claimRepeatable(q) {
        if (getRepeatableProgress(q) < q.target) return;
        questsRepeatableBaselines.update(b => ({ ...b, [q.id]: getProgress(q.stat) }));
        questsRepeatableCounts.update(c => ({ ...c, [q.id]: (c[q.id] || 0) + 1 }));
        blueEssence.update(v => v + q.reward);
        playSound('claim');
        showToast(`Contract claimed! +${q.reward} BE`, 'success');
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
</script>

<section class="max-w-5xl mx-auto pb-10 pt-2">
    <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-black text-yellow-400 tracking-wide">Quests & Achievements</h2>
    </div>

    <!-- Sub tabs -->
    <div class="flex gap-2 mb-5 bg-slate-800/40 p-1.5 rounded-xl border border-slate-700/30">
        {#each [
            { id: 'milestones', label: '🏆 Milestones', count: `${doneMilestones}/${totalMilestones}` },
            { id: 'contracts', label: '🔄 Contracts', count: '' },
            { id: 'achievements', label: '🎖️ Achievements', count: `${doneAchievements}/${totalAchievements}` },
        ] as tab}
            <button
                class="flex-1 py-2.5 px-3 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition {
                    activeSubTab === tab.id
                        ? 'bg-yellow-600/20 border border-yellow-500/40 text-yellow-300 shadow-inner'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 border border-transparent'
                }"
                on:click={() => { activeSubTab = tab.id; }}
            >
                {tab.label}
                {#if tab.count}
                    <span class="ml-1 text-[9px] font-mono opacity-60">{tab.count}</span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- MILESTONES -->
    {#if activeSubTab === 'milestones'}
        <div class="space-y-4">
            {#each questCategories as cat}
                {@const quests = milestoneByCat[cat.id]}
                {@const comp = catCompletion[cat.id]}
                {@const allDone = comp.done === comp.total}
                <div class="bg-slate-800/40 rounded-xl border border-slate-700/30 overflow-hidden">
                    <!-- Category header -->
                    <button
                        class="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/20 transition text-left"
                        on:click={() => { document.getElementById(`cat-${cat.id}`)?.classList.toggle('hidden'); }}
                    >
                        <div class="flex items-center gap-2">
                            <h3 class="text-xs font-black {cat.textColor} uppercase tracking-widest">{cat.label}</h3>
                            {#if allDone}
                                <span class="text-[9px] font-black bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-full">✓ COMPLETE</span>
                            {/if}
                        </div>
                        <span class="text-[10px] font-mono text-slate-500">{comp.done}/{comp.total}</span>
                    </button>
                    <!-- Quest rows -->
                    <div id="cat-{cat.id}" class="{allDone ? 'hidden' : ''} px-4 pb-4 space-y-1.5">
                        {#each quests as q}
                            {@const progress = getProgress(q.stat)}
                            {@const isDone = progress >= q.target}
                            {@const isClaimed = claimed[q.id]}
                            <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg border {
                                isClaimed ? 'border-slate-800 bg-slate-900/30 opacity-40' :
                                isDone ? cat.doneRow :
                                'border-slate-700/40 bg-slate-800/40'
                            }">
                                <div class="flex-1 min-w-0">
                                    <div class="text-xs font-bold {isClaimed ? 'text-slate-600 line-through' : 'text-slate-200'}">{q.desc}</div>
                                    <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-700/30">
                                        <div class="{cat.barColor} h-full rounded-full transition-all" style="width: {Math.min(100, (progress / q.target) * 100)}%"></div>
                                    </div>
                                </div>
                                {#if isClaimed}
                                    <span class="text-[10px] font-bold text-slate-600 shrink-0">Claimed</span>
                                {:else if isDone}
                                    <button
                                        class="shrink-0 {cat.claimBtn} px-3 py-1.5 rounded-lg font-black cursor-pointer transition text-[10px] uppercase"
                                        on:click={() => claimMilestone(q)}
                                    >Claim {q.reward} BE</button>
                                {:else}
                                    <span class="shrink-0 text-[10px] font-mono text-slate-500 w-16 text-right">{progress}/{q.target}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>

    <!-- CONTRACTS -->
    {:else if activeSubTab === 'contracts'}
        <div class="space-y-2">
            <p class="text-[10px] text-slate-500 mb-3">Repeatable quests — progress resets after each claim. Infinite completions.</p>
            {#each repeatableQuests as q}
                {@const progress = getRepeatableProgress(q)}
                {@const isDone = progress >= q.target}
                {@const times = repeatableCounts[q.id] || 0}
                <div class="flex items-center gap-3 px-4 py-3 rounded-xl border {
                    isDone ? 'border-cyan-700/40 bg-cyan-950/20' : 'border-slate-700/40 bg-slate-800/40'
                }">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-slate-200">
                            {q.desc}
                            {#if times > 0}
                                <span class="text-cyan-500 ml-1">×{times}</span>
                            {/if}
                        </div>
                        <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-700/30">
                            <div class="bg-cyan-500 h-full rounded-full transition-all" style="width: {Math.min(100, (progress / q.target) * 100)}%"></div>
                        </div>
                    </div>
                    {#if isDone}
                        <button
                            class="shrink-0 bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-3 py-1.5 rounded-lg font-black cursor-pointer transition text-[10px] uppercase"
                            on:click={() => claimRepeatable(q)}
                        >Claim {q.reward} BE</button>
                    {:else}
                        <span class="shrink-0 text-[10px] font-mono text-slate-500 w-16 text-right">{progress}/{q.target}</span>
                    {/if}
                </div>
            {/each}
        </div>

    <!-- ACHIEVEMENTS -->
    {:else if activeSubTab === 'achievements'}
        <div class="space-y-2">
            <p class="text-[10px] text-slate-500 mb-3">Live state checks — progress updates based on your current squad, club, and stats.</p>
            {#each achievements as a}
                {@const progress = getAchievementProgress(a)}
                {@const isDone = progress >= a.target}
                {@const isClaimed = achievementsClaimed[a.id]}
                <div class="flex items-center gap-3 px-4 py-3 rounded-xl border {
                    isClaimed ? 'border-slate-800 bg-slate-900/30 opacity-40' :
                    isDone ? 'border-violet-700/40 bg-violet-950/20' :
                    'border-slate-700/40 bg-slate-800/40'
                }">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold {isClaimed ? 'text-slate-600 line-through' : 'text-slate-200'}">{a.desc}</div>
                        <div class="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-1.5 border border-slate-700/30">
                            <div class="bg-violet-500 h-full rounded-full transition-all" style="width: {Math.min(100, (progress / a.target) * 100)}%"></div>
                        </div>
                    </div>
                    {#if isClaimed}
                        <span class="text-[10px] font-bold text-slate-600 shrink-0">Claimed</span>
                    {:else if isDone}
                        <button
                            class="shrink-0 bg-violet-500 hover:bg-violet-400 text-white px-3 py-1.5 rounded-lg font-black cursor-pointer transition text-[10px] uppercase"
                            on:click={() => claimAchievement(a)}
                        >Claim {a.reward} BE</button>
                    {:else}
                        <span class="shrink-0 text-[10px] font-mono text-slate-500 w-16 text-right">{Math.min(progress, a.target)}/{a.target}</span>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</section>
