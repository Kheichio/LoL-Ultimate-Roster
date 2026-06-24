<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, seasonData, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    const SPLIT_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const GAMES_PER_SPLIT = 10;

    const SPLIT_TITLES = [
        { wins: 10, title: 'Perfect Split', color: 'text-yellow-400', icon: '👑' },
        { wins: 9, title: 'Dominant', color: 'text-amber-400', icon: '🏆' },
        { wins: 8, title: 'Elite', color: 'text-purple-400', icon: '⭐' },
        { wins: 7, title: 'Playoff Contender', color: 'text-blue-400', icon: '🎯' },
        { wins: 6, title: 'Playoff Qualifier', color: 'text-emerald-400', icon: '✓' },
        { wins: 5, title: 'Mid Table', color: 'text-slate-300', icon: '—' },
        { wins: 4, title: 'Struggling', color: 'text-orange-400', icon: '⚠️' },
        { wins: 0, title: 'Relegated', color: 'text-red-400', icon: '💀' },
    ];

    const SPLIT_REWARDS = [
        { wins: 10, be: 5000, label: 'Perfect Split Bonus' },
        { wins: 9, be: 3500, label: 'Dominant Finish' },
        { wins: 8, be: 2500, label: 'Elite Finish' },
        { wins: 7, be: 1800, label: 'Playoff Run' },
        { wins: 6, be: 1200, label: 'Playoff Entry' },
        { wins: 5, be: 800, label: 'Mid Table' },
        { wins: 4, be: 500, label: 'Survival' },
        { wins: 0, be: 200, label: 'Participation' },
    ];

    const PLAYS = [
        { id: 'mec', label: 'Mechanical', stat: 'mec', icon: '⚡' },
        { id: 'tmf', label: 'Teamfight', stat: 'tmf', icon: '🔥' },
        { id: 'map', label: 'Macro', stat: 'map', icon: '🗺️' },
        { id: 'frm', label: 'Form', stat: 'frm', icon: '📈' },
        { id: 'cmp', label: 'Composure', stat: 'cmp', icon: '🧊' },
    ];

    let phase = 'overview';
    let matchLog = [];
    let playerScore = 0;
    let cpuScore = 0;
    let currentOpponent = null;

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s, c) => s + c.rating, 0) / starters.length) : 0;
    $: splitName = SPLIT_NAMES[($seasonData.currentSplit - 1) % 4];
    $: splitYear = Math.floor(($seasonData.currentSplit - 1) / 4) + 1;
    $: matchIndex = ($seasonData.matchResults || []).filter(r => r !== null).length;
    $: splitComplete = matchIndex >= GAMES_PER_SPLIT;
    $: wins = ($seasonData.matchResults || []).filter(r => r === true).length;
    $: losses = ($seasonData.matchResults || []).filter(r => r === false).length;

    $: splitTitle = (() => {
        if (!splitComplete) return null;
        return SPLIT_TITLES.find(t => wins >= t.wins) || SPLIT_TITLES[SPLIT_TITLES.length - 1];
    })();

    $: splitReward = (() => {
        if (!splitComplete) return null;
        return SPLIT_REWARDS.find(r => wins >= r.wins) || SPLIT_REWARDS[SPLIT_REWARDS.length - 1];
    })();

    $: opponents = $seasonData.opponents || [];

    function generateOpponents() {
        const db = getDB();
        if (!db) return;
        const pool = db.filter(p => p.role !== 'COACH' && !['Champion','MVP','Finalist','MSI','FirstStand','POTY','ROTY','TOTY','GPOTY','X'].includes(p.quality));
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const teamNames = ['Shadow Wolves', 'Storm Dragons', 'Iron Phoenix', 'Crystal Bears', 'Neon Tigers',
                          'Dark Knights', 'Solar Flare', 'Frost Giants', 'Thunder Hawks', 'Crimson Vipers'];
        const opps = [];

        for (let i = 0; i < GAMES_PER_SPLIT; i++) {
            const difficulty = 60 + (i * 3);
            const team = {};
            const used = new Set();
            roles.forEach(role => {
                let rolePool = pool.filter(p => p.role === role && !used.has(p.id) && p.rating <= difficulty + 10);
                if (rolePool.length < 3) rolePool = pool.filter(p => p.role === role && !used.has(p.id));
                rolePool.sort((a, b) => b.rating - a.rating);
                const cutoff = Math.max(1, Math.min(rolePool.length, Math.floor(rolePool.length * 0.5)));
                const pick = rolePool[Math.floor(Math.random() * cutoff)];
                if (pick) { team[role] = pick; used.add(pick.id); }
            });
            const cards = Object.values(team);
            const avg = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : difficulty;
            opps.push({ name: teamNames[i], cards: team, avgRating: avg, index: i });
        }

        seasonData.update(s => ({
            ...s,
            opponents: opps,
            matchResults: new Array(GAMES_PER_SPLIT).fill(null),
            splitWins: 0,
            splitLosses: 0,
            splitComplete: false,
        }));
        saveGame();
    }

    function startSplit() {
        if (!squadReady) { showToast('Fill all 5 starting positions.', 'error'); return; }
        generateOpponents();
        phase = 'schedule';
    }

    function startMatch(oppIndex) {
        if (oppIndex !== matchIndex) return;
        currentOpponent = opponents[oppIndex];
        playerScore = 0;
        cpuScore = 0;
        matchLog = [];
        phase = 'match';
    }

    function pickPlay(play) {
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const myTotal = starters.reduce((s, c) => s + (c.stats[play.stat] || 0), 0);
        const cpuCards = Object.values(currentOpponent.cards);
        const cpuTotal = cpuCards.reduce((s, c) => s + (c.stats[cpuPlay.stat] || 0), 0);
        const myAvg = Math.round(myTotal / starters.length);
        const cpuAvg = Math.round(cpuTotal / cpuCards.length);
        const myFinal = myAvg + Math.floor(Math.random() * 11) - 5;
        const cpuFinal = cpuAvg + Math.floor(Math.random() * 11) - 5;
        const won = myFinal >= cpuFinal;

        if (won) playerScore++;
        else cpuScore++;

        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won }];

        if (playerScore >= 3 || cpuScore >= 3) {
            const matchWon = playerScore >= 3;
            if (matchWon) playSound('win');
            else playSound('lose');

            seasonData.update(s => {
                const results = [...(s.matchResults || [])];
                results[currentOpponent.index] = matchWon;
                return {
                    ...s,
                    matchResults: results,
                    splitWins: (s.splitWins || 0) + (matchWon ? 1 : 0),
                    splitLosses: (s.splitLosses || 0) + (matchWon ? 0 : 1),
                };
            });

            starters.forEach(c => {
                trackStats.update(s => {
                    const mp = { ...s.matchesPlayed };
                    mp[c.name] = (mp[c.name] || 0) + 1;
                    return { ...s, matchesPlayed: mp };
                });
            });

            saveGame();
            phase = 'matchResult';
        }
    }

    function backToSchedule() {
        if (matchIndex >= GAMES_PER_SPLIT) {
            phase = 'splitEnd';
        } else {
            phase = 'schedule';
        }
    }

    function claimSplitReward() {
        const reward = splitReward;
        if (!reward) return;
        blueEssence.update(v => v + reward.be);
        trackStats.update(s => ({
            ...s,
            splitsCompleted: (s.splitsCompleted || 0) + 1,
            regionalSplitWon: (s.regionalSplitWon || 0) + (wins >= 6 ? 1 : 0),
            undefeatedSplits: (s.undefeatedSplits || 0) + (wins === 10 ? 1 : 0),
        }));

        seasonData.update(s => ({
            ...s,
            currentSplit: s.currentSplit + 1,
            opponents: [],
            matchResults: [],
            splitWins: 0,
            splitLosses: 0,
            splitComplete: false,
            trophyCase: [...(s.trophyCase || []), { split: s.currentSplit, name: splitName, year: splitYear, wins, losses, title: splitTitle.title, reward: reward.be }]
        }));

        playSound('claim');
        showToast(`Split complete! ${splitTitle.title} — +${reward.be} BE`, 'success');
        saveGame();
        phase = 'overview';
    }

</script>

<section class="max-w-4xl mx-auto pb-10 pt-2">

    {#if phase === 'overview'}
        <h2 class="text-xl font-black text-blue-300 tracking-wide mb-1">Season Splits</h2>
        <p class="text-xs text-slate-500 mb-5">Play through 10 matches per split. Each split counts as a regional trophy.</p>

        <!-- Current Split Info -->
        <div class="bg-gradient-to-br from-blue-950/50 via-slate-900 to-slate-800 p-6 rounded-2xl border border-blue-700/30 text-center mb-6">
            <div class="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">Current Split</div>
            <div class="text-3xl font-black text-blue-200 mb-1">{splitName} Split — Year {splitYear}</div>
            <div class="text-xs text-slate-400 font-mono">Split #{$seasonData.currentSplit}</div>

            {#if opponents.length > 0 && !splitComplete}
                <div class="mt-4 flex justify-center gap-6 text-sm">
                    <span class="text-emerald-400 font-black">{wins}W</span>
                    <span class="text-red-400 font-black">{losses}L</span>
                    <span class="text-slate-500">{GAMES_PER_SPLIT - matchIndex} remaining</span>
                </div>
                <button class="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={() => { phase = 'schedule'; }}>
                    Continue Split →
                </button>
            {:else if !squadReady}
                <p class="text-red-400 text-xs font-bold mt-4">Fill all 5 positions to start.</p>
            {:else}
                <button class="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={startSplit}>
                    Start {splitName} Split
                </button>
            {/if}
        </div>

        <!-- Reward Tiers -->
        <div class="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30 mb-6">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Split Reward Tiers</h3>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {#each SPLIT_REWARDS as r}
                    {@const t = SPLIT_TITLES.find(x => x.wins === r.wins)}
                    <div class="bg-slate-900/40 p-2.5 rounded-lg text-center">
                        <div class="text-lg">{t?.icon || '—'}</div>
                        <div class="text-[10px] font-black {t?.color || 'text-slate-400'}">{t?.title || '—'}</div>
                        <div class="text-[9px] text-slate-500">{r.wins === 0 ? '0-3' : r.wins}+ wins</div>
                        <div class="text-xs font-bold text-blue-400 mt-1">{r.be} BE</div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Trophy Case -->
        {#if ($seasonData.trophyCase || []).length > 0}
            <div class="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30">
                <h3 class="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3">🏅 Trophy Case</h3>
                <div class="space-y-1.5">
                    {#each [...($seasonData.trophyCase || [])].reverse() as trophy}
                        {@const t = SPLIT_TITLES.find(x => x.title === trophy.title)}
                        <div class="flex items-center justify-between bg-slate-900/40 px-3 py-2 rounded-lg">
                            <div>
                                <span class="text-xs font-bold text-slate-200">{trophy.name} Split Y{trophy.year}</span>
                                <span class="ml-2 text-[10px] {t?.color || 'text-slate-400'}">{t?.icon} {trophy.title}</span>
                            </div>
                            <div class="text-right">
                                <span class="text-[10px] text-slate-400">{trophy.wins}W-{trophy.losses}L</span>
                                <span class="ml-2 text-[10px] text-emerald-400">+{trophy.reward} BE</span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

    {:else if phase === 'schedule'}
        <!-- Schedule View -->
        <div class="flex items-center justify-between mb-4">
            <div>
                <h2 class="text-lg font-black text-blue-300">{splitName} Split — Schedule</h2>
                <p class="text-xs text-slate-500 font-mono">{wins}W - {losses}L · Match {matchIndex + 1} of {GAMES_PER_SPLIT}</p>
            </div>
            <button class="text-xs text-slate-500 hover:text-slate-300 cursor-pointer font-bold" on:click={() => { phase = 'overview'; }}>← Overview</button>
        </div>

        <div class="space-y-2">
            {#each opponents as opp, i}
                {@const result = ($seasonData.matchResults || [])[i]}
                {@const isNext = i === matchIndex}
                {@const played = result !== null && result !== undefined}
                <div class="flex items-center gap-4 px-4 py-3 rounded-xl border {
                    played ? (result ? 'border-emerald-700/30 bg-emerald-950/10' : 'border-red-700/30 bg-red-950/10') :
                    isNext ? 'border-blue-500/40 bg-blue-950/20 animate-pulse' :
                    'border-slate-700/30 bg-slate-800/30 opacity-50'
                }">
                    <span class="text-xs font-black w-6 text-center {played ? (result ? 'text-emerald-400' : 'text-red-400') : isNext ? 'text-blue-400' : 'text-slate-600'}">{i + 1}</span>
                    <div class="flex-1">
                        <span class="text-xs font-bold {played ? 'text-slate-400' : 'text-slate-200'}">{opp.name}</span>
                        <span class="text-[10px] text-slate-500 ml-2">Power: {opp.avgRating}</span>
                    </div>
                    {#if played}
                        <span class="text-xs font-black {result ? 'text-emerald-400' : 'text-red-400'}">{result ? 'WIN' : 'LOSS'}</span>
                    {:else if isNext}
                        <button class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-wider cursor-pointer transition" on:click={() => startMatch(i)}>Play</button>
                    {:else}
                        <span class="text-[10px] text-slate-600">—</span>
                    {/if}
                </div>
            {/each}
        </div>

    {:else if phase === 'match'}
        <!-- Match -->
        <div class="text-center mb-4">
            <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest">Match {currentOpponent.index + 1} — vs {currentOpponent.name}</h2>
            <div class="flex justify-center gap-4 mt-2 text-xs">
                <span class="font-black text-blue-400">You {avgRating}</span>
                <span class="font-black text-slate-600">vs</span>
                <span class="font-black text-red-400">{currentOpponent.name} {currentOpponent.avgRating}</span>
            </div>
            <div class="flex justify-center gap-6 mt-2">
                <span class="text-lg font-black text-blue-400">{playerScore}</span>
                <span class="text-lg font-black text-slate-600">—</span>
                <span class="text-lg font-black text-red-400">{cpuScore}</span>
            </div>
            <p class="text-[9px] text-slate-500 mt-1">Best of 5 — first to 3</p>
        </div>

        {#if matchLog.length > 0}
            <div class="space-y-1.5 mb-5">
                {#each matchLog as log, i}
                    <div class="bg-slate-800/60 p-2.5 rounded-lg border {log.won ? 'border-emerald-700/30' : 'border-red-700/30'} flex items-center justify-between text-xs">
                        <span class="font-bold {log.won ? 'text-emerald-400' : 'text-red-400'}">R{i + 1} {log.won ? 'Won' : 'Lost'}</span>
                        <span class="text-slate-400">{log.myPlay.icon} {log.myVal} vs {log.cpuPlay.icon} {log.cpuVal}</span>
                    </div>
                {/each}
            </div>
        {/if}

        {#if playerScore < 3 && cpuScore < 3}
            <div class="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/30">
                <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Choose Your Play</h3>
                <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {#each PLAYS as play}
                        <button class="bg-slate-700 hover:bg-slate-600 p-3 rounded-xl text-center cursor-pointer transition hover:scale-[1.03] border border-slate-600/50 hover:border-blue-500/30" on:click={() => pickPlay(play)}>
                            <div class="text-xl mb-1">{play.icon}</div>
                            <div class="text-[10px] font-black text-slate-200">{play.label}</div>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

    {:else if phase === 'matchResult'}
        {@const matchWon = playerScore >= 3}
        <div class="p-8 rounded-2xl border text-center {matchWon ? 'bg-emerald-950/20 border-emerald-700/30' : 'bg-red-950/20 border-red-700/30'}">
            <div class="text-4xl mb-3">{matchWon ? '✓' : '✗'}</div>
            <h2 class="text-xl font-black {matchWon ? 'text-emerald-400' : 'text-red-400'} mb-2">{matchWon ? 'Match Won!' : 'Match Lost'}</h2>
            <p class="text-slate-400 text-xs mb-2">Score: {playerScore}-{cpuScore} vs {currentOpponent.name}</p>
            <p class="text-sm font-mono text-slate-500 mb-5">Split record: {wins}W - {losses}L ({GAMES_PER_SPLIT - matchIndex} remaining)</p>
            <button class="bg-slate-700 hover:bg-slate-600 text-slate-200 px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={backToSchedule}>
                {matchIndex >= GAMES_PER_SPLIT ? 'View Split Results' : 'Back to Schedule'}
            </button>
        </div>

    {:else if phase === 'splitEnd'}
        <div class="p-8 rounded-2xl border text-center {wins >= 6 ? 'bg-emerald-950/20 border-emerald-700/30' : 'bg-slate-800/40 border-slate-700/30'}">
            <div class="text-5xl mb-3">{splitTitle?.icon || '—'}</div>
            <h2 class="text-2xl font-black {splitTitle?.color || 'text-slate-300'} mb-1">{splitTitle?.title || 'Split Complete'}</h2>
            <p class="text-lg font-black text-slate-200 mb-1">{splitName} Split — Year {splitYear}</p>
            <p class="text-sm text-slate-400 mb-4">Final Record: {wins}W - {losses}L</p>

            {#if splitReward}
                <div class="bg-slate-900/50 inline-block px-6 py-3 rounded-xl mb-5">
                    <div class="text-2xl font-black text-blue-400">+{splitReward.be} BE</div>
                    <div class="text-[10px] text-slate-500">{splitReward.label}</div>
                    {#if wins >= 6}
                        <div class="text-[10px] text-amber-400 font-bold mt-1">+1 Regional Trophy</div>
                    {/if}
                </div>
            {/if}

            <div>
                <button class="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={claimSplitReward}>
                    Claim & Start Next Split
                </button>
            </div>
        </div>
    {/if}
</section>
