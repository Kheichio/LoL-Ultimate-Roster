<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab } from '../../stores/ui.js';
    import { getDB, makeUniqueId } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    let phase = 'lobby';
    let round = 0;
    let enemies = [];
    let currentEnemy = null;
    let matchLog = [];
    let playerScore = 0;
    let cpuScore = 0;
    let roundResults = [];
    let tournamentResult = null;

    const PLAYS = [
        { id: 'mec', label: 'Mechanical Outplay', stat: 'mec', icon: '⚡' },
        { id: 'tmf', label: 'Teamfight', stat: 'tmf', icon: '🔥' },
        { id: 'map', label: 'Macro Play', stat: 'map', icon: '🗺️' },
    ];

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s, c) => s + c.rating, 0) / starters.length) : 0;

    function generateCpuTeam(difficulty) {
        const db = getDB();
        if (!db) return null;
        const pool = db.filter(p => p.role !== 'COACH' && ['Bronze', 'Silver', 'Gold'].includes(p.quality));
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const team = {};
        const used = new Set();
        roles.forEach(role => {
            let rolePool = pool.filter(p => p.role === role && !used.has(p.id));
            if (rolePool.length === 0) rolePool = pool.filter(p => !used.has(p.id));
            rolePool.sort((a, b) => b.rating - a.rating);
            const cutoff = Math.min(rolePool.length, Math.max(3, Math.floor(rolePool.length * (1 - difficulty * 0.15))));
            const pick = rolePool[Math.floor(Math.random() * cutoff)];
            if (pick) { team[role] = pick; used.add(pick.id); }
        });
        const teamCards = Object.values(team);
        const avg = teamCards.length > 0 ? Math.round(teamCards.reduce((s, c) => s + c.rating, 0) / teamCards.length) : 60;
        const names = ['Iron Wolves', 'Silver Fangs', 'Bronze Legion', 'Rookie Squad', 'Cafe Regulars', 'Local Heroes', 'Ladder Climbers', 'Weekend Warriors'];
        return { name: names[Math.floor(Math.random() * names.length)], cards: team, avgRating: avg };
    }

    function startTournament() {
        if (!squadReady) { showToast('Fill all 5 starting positions first.', 'error'); return; }
        enemies = [generateCpuTeam(1), generateCpuTeam(2), generateCpuTeam(3)];
        round = 0;
        roundResults = [];
        tournamentResult = null;
        phase = 'bracket';
        matchLog = [];
    }

    function startMatch() {
        currentEnemy = enemies[round];
        playerScore = 0;
        cpuScore = 0;
        matchLog = [];
        phase = 'match';
    }

    function pickPlay(play) {
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const myTotal = starters.reduce((s, c) => s + (c.stats[play.stat] || 0), 0);
        const cpuCards = Object.values(currentEnemy.cards);
        const cpuTotal = cpuCards.reduce((s, c) => s + (c.stats[cpuPlay.stat] || 0), 0);
        const myAvg = Math.round(myTotal / starters.length);
        const cpuAvg = Math.round(cpuTotal / cpuCards.length);
        const variance = Math.floor(Math.random() * 11) - 5;
        const myFinal = myAvg + variance;
        const cpuFinal = cpuAvg + Math.floor(Math.random() * 11) - 5;
        const won = myFinal >= cpuFinal;

        if (won) playerScore++;
        else cpuScore++;

        matchLog = [...matchLog, {
            round: matchLog.length + 1,
            myPlay: play,
            cpuPlay: cpuPlay,
            myVal: myFinal,
            cpuVal: cpuFinal,
            won
        }];

        if (playerScore >= 2 || cpuScore >= 2) {
            const matchWon = playerScore >= 2;
            roundResults = [...roundResults, matchWon];

            if (!matchWon) {
                endTournament(false);
            } else if (round >= 2) {
                endTournament(true);
            } else {
                phase = 'roundEnd';
            }
        }
    }

    function nextRound() {
        round++;
        phase = 'bracket';
        matchLog = [];
    }

    function endTournament(won) {
        const isFinalist = round >= 1 && !won;
        const reward = won ? 300 : isFinalist ? 150 : 0;
        blueEssence.update(v => v + reward);

        if (won) {
            trackStats.update(s => ({ ...s, tournamentsWon: (s.tournamentsWon || 0) + 1, cafeWins: (s.cafeWins || 0) + 1 }));
            playSound('win');
        } else {
            trackStats.update(s => ({ ...s, losses: (s.losses || 0) + 1 }));
            playSound('lose');
        }

        starters.forEach(c => {
            trackStats.update(s => {
                const mp = { ...s.matchesPlayed };
                mp[c.name] = (mp[c.name] || 0) + 1;
                return { ...s, matchesPlayed: mp };
            });
        });

        saveGame();
        tournamentResult = { won, reward, round: round + 1, isFinalist };
        phase = 'result';
    }

    function backToLobby() {
        phase = 'lobby';
        tournamentResult = null;
        enemies = [];
        matchLog = [];
    }
</script>

<section class="max-w-5xl mx-auto pb-10 pt-2">

    {#if phase === 'lobby'}
        <h2 style="font-size:18px; font-weight:900; color:#e2e8f0; margin-bottom:4px;">Competitive Arenas</h2>
        <p style="font-size:11px; color:#475569; margin-bottom:20px;">Test your roster against CPU opponents.</p>

        <!-- Season Banner -->
        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
        <div style="background:linear-gradient(135deg, rgba(30,58,138,0.25), rgba(15,23,42,0.6)); border:1px solid rgba(59,130,246,0.12); border-radius:16px; padding:24px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;" on:click={() => switchTab('season')}>
            <div>
                <div style="font-size:9px; font-weight:900; color:#3b82f6; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px;">Season Splits</div>
                <div style="font-size:20px; font-weight:900; color:#93c5fd;">Play Season Matches</div>
                <div style="font-size:11px; color:#475569; margin-top:4px;">10 opponents per split · Earn regional trophies</div>
            </div>
            <div class="btn-primary" style="flex-shrink:0;">Open Season →</div>
        </div>

        <!-- Gaming Cafe Tournament -->
        <div class="bg-gradient-to-br from-green-950/60 via-slate-900 to-slate-800 p-6 rounded-2xl border border-green-700/30 text-center relative overflow-hidden">
            <div class="absolute -right-8 -top-8 opacity-5 text-[120px]">☕</div>
            <h3 class="text-2xl font-black text-green-300 mb-1 tracking-widest uppercase">Gaming Cafe Tournament</h3>
            <p class="text-slate-400 text-xs mb-4">3 rounds against local opponents. CPU capped at Gold tier.</p>
            <div class="flex justify-center gap-3 mb-5 text-[10px] font-mono">
                <span class="bg-black/30 px-3 py-1.5 rounded-lg border border-green-800/40 text-green-300">Free Entry</span>
                <span class="bg-black/30 px-3 py-1.5 rounded-lg border border-emerald-800/40 text-emerald-300">Win: 300 BE</span>
                <span class="bg-black/30 px-3 py-1.5 rounded-lg border border-slate-700/40 text-slate-400">2nd: 150 BE</span>
            </div>
            {#if squadReady}
                <button class="bg-green-600 hover:bg-green-500 text-white px-10 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer shadow-lg transition" on:click={startTournament}>Enter Tournament</button>
            {:else}
                <p class="text-red-400 text-xs font-bold">Fill all 5 starting positions to enter.</p>
                <button class="mt-2 text-blue-400 text-xs cursor-pointer hover:text-blue-300 font-bold" on:click={() => switchTab('squad')}>Go to Squad →</button>
            {/if}
        </div>

        <!-- More modes placeholder -->
        <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {#each [
                { name: 'Regional Split', icon: '🏟️', desc: 'Win Season Matches to unlock.', color: 'border-slate-700/30' },
                { name: 'First Stand', icon: '🟠', desc: 'Beat a Playoff Split to unlock.', color: 'border-slate-700/30' },
                { name: 'World Championship', icon: '🏆', desc: 'Win MSI to unlock.', color: 'border-slate-700/30' },
            ] as mode}
                <div class="bg-slate-800/30 p-5 rounded-xl border {mode.color} text-center opacity-50">
                    <div class="text-2xl mb-2">{mode.icon}</div>
                    <h4 class="text-sm font-black text-slate-500 uppercase tracking-wider">{mode.name}</h4>
                    <p class="text-[10px] text-slate-600 mt-1">{mode.desc}</p>
                    <div class="text-[10px] text-red-400 font-bold mt-2">🔒 Locked</div>
                </div>
            {/each}
        </div>

    {:else if phase === 'bracket'}
        <!-- Bracket View -->
        <div class="text-center mb-6">
            <h2 class="text-lg font-black text-green-300 uppercase tracking-widest">Gaming Cafe — Round {round + 1}/3</h2>
            <div class="flex justify-center gap-2 mt-3">
                {#each [0, 1, 2] as r}
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black border-2 {
                        r < roundResults.length ? (roundResults[r] ? 'bg-emerald-900/60 border-emerald-500 text-emerald-300' : 'bg-red-900/60 border-red-500 text-red-300') :
                        r === round ? 'bg-blue-900/60 border-blue-500 text-blue-300 animate-pulse' :
                        'bg-slate-800 border-slate-700 text-slate-600'
                    }">
                        {r < roundResults.length ? (roundResults[r] ? 'W' : 'L') : r + 1}
                    </div>
                {/each}
            </div>
        </div>

        <div class="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/40 text-center">
            <div class="flex items-center justify-center gap-8 mb-6">
                <div>
                    <div class="text-3xl font-black text-blue-400">{avgRating}</div>
                    <div class="text-[10px] text-slate-500 uppercase font-bold mt-1">Your Squad</div>
                </div>
                <div class="text-xl font-black text-slate-600">VS</div>
                <div>
                    <div class="text-3xl font-black text-red-400">{enemies[round]?.avgRating || '?'}</div>
                    <div class="text-[10px] text-slate-500 uppercase font-bold mt-1">{enemies[round]?.name || 'CPU'}</div>
                </div>
            </div>
            <button class="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={startMatch}>Start Match</button>
        </div>

    {:else if phase === 'match'}
        <!-- Match in Progress -->
        <div class="text-center mb-4">
            <h2 class="text-sm font-black text-slate-400 uppercase tracking-widest">Round {round + 1} — vs {currentEnemy.name}</h2>
            <div class="flex justify-center gap-6 mt-2">
                <span class="text-lg font-black text-blue-400">{playerScore}</span>
                <span class="text-lg font-black text-slate-600">—</span>
                <span class="text-lg font-black text-red-400">{cpuScore}</span>
            </div>
        </div>

        <!-- Match Log -->
        {#if matchLog.length > 0}
            <div class="space-y-2 mb-5">
                {#each matchLog as log}
                    <div class="bg-slate-800/60 p-3 rounded-xl border {log.won ? 'border-emerald-700/40' : 'border-red-700/40'} flex items-center justify-between text-xs">
                        <span class="font-bold {log.won ? 'text-emerald-400' : 'text-red-400'}">{log.won ? '✓ Won' : '✗ Lost'}</span>
                        <span class="text-slate-400">You: {log.myPlay.icon} {log.myPlay.label} ({log.myVal}) vs CPU: {log.cpuPlay.icon} {log.cpuPlay.label} ({log.cpuVal})</span>
                    </div>
                {/each}
            </div>
        {/if}

        <!-- Pick a Play -->
        {#if playerScore < 2 && cpuScore < 2}
            <div class="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/30">
                <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Choose Your Play</h3>
                <div class="grid grid-cols-3 gap-3">
                    {#each PLAYS as play}
                        <button class="bg-slate-700 hover:bg-slate-600 p-4 rounded-xl text-center cursor-pointer transition hover:scale-[1.03] border border-slate-600/50 hover:border-blue-500/30" on:click={() => pickPlay(play)}>
                            <div class="text-2xl mb-1">{play.icon}</div>
                            <div class="text-xs font-black text-slate-200">{play.label}</div>
                            <div class="text-[10px] text-slate-500 mt-1 uppercase">{play.stat.toUpperCase()}</div>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

    {:else if phase === 'roundEnd'}
        <div class="bg-emerald-950/30 p-8 rounded-2xl border border-emerald-700/30 text-center">
            <div class="text-4xl mb-3">✓</div>
            <h2 class="text-xl font-black text-emerald-400 mb-2">Round {round + 1} Won!</h2>
            <p class="text-slate-400 text-xs mb-5">Score: {playerScore}-{cpuScore}. Next opponent is tougher.</p>
            <button class="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={nextRound}>Next Round →</button>
        </div>

    {:else if phase === 'result'}
        <div class="p-8 rounded-2xl border text-center {tournamentResult.won ? 'bg-emerald-950/30 border-emerald-700/30' : 'bg-red-950/20 border-red-700/30'}">
            <div class="text-5xl mb-3">{tournamentResult.won ? '🏆' : tournamentResult.isFinalist ? '🥈' : '💀'}</div>
            <h2 class="text-2xl font-black mb-2 {tournamentResult.won ? 'text-emerald-400' : 'text-red-400'}">
                {tournamentResult.won ? 'Tournament Champion!' : tournamentResult.isFinalist ? 'Runner Up' : 'Eliminated'}
            </h2>
            <p class="text-slate-400 text-sm mb-2">
                {tournamentResult.won ? `Swept all 3 rounds.` : `Eliminated in round ${tournamentResult.round}.`}
            </p>
            {#if tournamentResult.reward > 0}
                <p class="text-lg font-black text-blue-400 mb-5">+{tournamentResult.reward} BE</p>
            {:else}
                <p class="text-slate-500 text-xs mb-5">No payout.</p>
            {/if}
            <button class="bg-slate-700 hover:bg-slate-600 text-slate-200 px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition" on:click={backToLobby}>Back to Lobby</button>
        </div>
    {/if}
</section>
