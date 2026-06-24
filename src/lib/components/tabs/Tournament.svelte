<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab } from '../../stores/ui.js';
    import { getDB, makeUniqueId, LEGACY_TIERS } from '../../utils/cards.js';
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
    $: coachBonus = (() => { const c=$squad.COACH; if(!c) return 0; return c.rating>=98?5:c.rating>=94?4:c.rating>=90?3:c.rating>=85?2:1; })();
    $: regionChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.region)).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: yearChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.year)).size; return s<=1?5:s<=2?4:s<=3?3:s<=4?2:1; })();
    $: teamChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); return !nl.length||new Set(nl.map(c=>c.team)).size===1?2:0; })();
    $: legacyBonus = (()=>{ const c=starters.filter(c=>LEGACY_TIERS.includes(c.quality)).length; return c>=4?2:c>=2?1:0; })();
    $: chemBonus = regionChem + yearChem + teamChem + coachBonus + legacyBonus;
    $: totalPower = squadReady ? avgRating + chemBonus : 0;

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
        const myStatAvg = Math.round(starters.reduce((s, c) => s + (c.stats[play.stat] || 0), 0) / starters.length);
        const cpuCards = Object.values(currentEnemy.cards);
        const cpuStatAvg = Math.round(cpuCards.reduce((s, c) => s + (c.stats[cpuPlay.stat] || 0), 0) / cpuCards.length);
        const statEdge = myStatAvg - cpuStatAvg;
        const myFinal = totalPower + statEdge + Math.floor(Math.random() * 11) - 5;
        const cpuFinal = currentEnemy.avgRating + Math.floor(Math.random() * 11) - 5;
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

<section class="trn">
    {#if phase === 'lobby'}
        <div class="trn-head">
            <h2 class="trn-title">Competitive Arenas</h2>
            <p class="trn-desc">Test your roster against CPU opponents.</p>
        </div>

        <!-- Season Banner -->
        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="season-banner" on:click={() => switchTab('season')}>
            <div class="sb-glow"></div>
            <div class="sb-content">
                <div class="sb-badge">Season Splits</div>
                <div class="sb-title">Play Season Matches</div>
                <div class="sb-sub">10 opponents per split · Earn regional trophies</div>
            </div>
            <button class="btn-primary" style="flex-shrink:0; position:relative;">Open Season →</button>
        </div>

        <!-- Gaming Cafe -->
        <div class="mode-card mode-cafe">
            <div class="mode-bg">☕</div>
            <h3 class="mode-title mode-title-green">Gaming Cafe Tournament</h3>
            <p class="mode-desc">3 rounds against local opponents. CPU capped at Gold tier.</p>
            <div class="mode-tags">
                <span class="tag tag-green">Free Entry</span>
                <span class="tag tag-emerald">Win: 300 BE</span>
                <span class="tag tag-slate">2nd: 150 BE</span>
            </div>
            {#if squadReady}
                <button class="btn-success" on:click={startTournament}>Enter Tournament</button>
            {:else}
                <p class="mode-warn">Fill all 5 starting positions to enter.</p>
                <button class="mode-link" on:click={() => switchTab('squad')}>Go to Squad →</button>
            {/if}
        </div>

        <!-- Locked Modes -->
        <div class="modes-grid">
            {#each [
                { name: 'Regional Split', icon: '🏟️', desc: 'Win Season Matches to unlock.' },
                { name: 'First Stand', icon: '🟠', desc: 'Beat a Playoff Split to unlock.' },
                { name: 'World Championship', icon: '🏆', desc: 'Win MSI to unlock.' },
            ] as mode}
                <div class="mode-locked">
                    <span class="ml-icon">{mode.icon}</span>
                    <h4 class="ml-name">{mode.name}</h4>
                    <p class="ml-desc">{mode.desc}</p>
                    <span class="ml-lock">🔒 Locked</span>
                </div>
            {/each}
        </div>

    {:else if phase === 'bracket'}
        <div class="phase-center">
            <h2 class="phase-title phase-title-green">Gaming Cafe — Round {round + 1}/3</h2>
            <div class="bracket-dots">
                {#each [0, 1, 2] as r}
                    <div class="bdot" class:bdot-w={r < roundResults.length && roundResults[r]} class:bdot-l={r < roundResults.length && !roundResults[r]} class:bdot-active={r === round && r >= roundResults.length} class:bdot-future={r > round || (r >= roundResults.length && r !== round)}>
                        {r < roundResults.length ? (roundResults[r] ? 'W' : 'L') : r + 1}
                    </div>
                {/each}
            </div>
        </div>

        <div class="vs-card">
            <div class="vs-side"><span class="vs-rating vs-blue">{avgRating}</span><span class="vs-label">Your Squad</span></div>
            <span class="vs-x">VS</span>
            <div class="vs-side"><span class="vs-rating vs-red">{enemies[round]?.avgRating || '?'}</span><span class="vs-label">{enemies[round]?.name || 'CPU'}</span></div>
        </div>
        <div class="phase-center"><button class="btn-primary" on:click={startMatch}>Start Match</button></div>

    {:else if phase === 'match'}
        <div class="match-header">
            <div class="mh-label">Round {round + 1} — vs {currentEnemy.name}</div>
            <div class="mh-score">
                <span class="mh-blue">{playerScore}</span>
                <span class="mh-sep">—</span>
                <span class="mh-red">{cpuScore}</span>
            </div>
        </div>

        {#if matchLog.length > 0}
            <div class="log-list">
                {#each matchLog as log}
                    <div class="log-row" class:log-w={log.won} class:log-l={!log.won}>
                        <span class="log-result">{log.won ? '✓ Won' : '✗ Lost'}</span>
                        <span class="log-detail">You: {log.myPlay.icon} {log.myPlay.label} ({log.myVal}) vs CPU: {log.cpuPlay.icon} {log.cpuPlay.label} ({log.cpuVal})</span>
                    </div>
                {/each}
            </div>
        {/if}

        {#if playerScore < 2 && cpuScore < 2}
            <div class="play-picker">
                <div class="play-label">Choose Your Play</div>
                <div class="play-grid">
                    {#each PLAYS as play}
                        <button class="play-btn" on:click={() => pickPlay(play)}>
                            <span class="pb-icon">{play.icon}</span>
                            <span class="pb-name">{play.label}</span>
                            <span class="pb-stat">{play.stat.toUpperCase()}</span>
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

    {:else if phase === 'roundEnd'}
        <div class="result-card result-win">
            <div class="result-icon">✓</div>
            <h2 class="result-title rt-win">Round {round + 1} Won!</h2>
            <p class="result-sub">Score: {playerScore}-{cpuScore}. Next opponent is tougher.</p>
            <button class="btn-primary" style="margin-top:20px;" on:click={nextRound}>Next Round →</button>
        </div>

    {:else if phase === 'result'}
        <div class="result-card" class:result-win={tournamentResult.won} class:result-lose={!tournamentResult.won}>
            <div class="result-icon" style="font-size:48px;">{tournamentResult.won ? '🏆' : tournamentResult.isFinalist ? '🥈' : '💀'}</div>
            <h2 class="result-title" class:rt-win={tournamentResult.won} class:rt-lose={!tournamentResult.won}>
                {tournamentResult.won ? 'Tournament Champion!' : tournamentResult.isFinalist ? 'Runner Up' : 'Eliminated'}
            </h2>
            <p class="result-sub">{tournamentResult.won ? 'Swept all 3 rounds.' : `Eliminated in round ${tournamentResult.round}.`}</p>
            {#if tournamentResult.reward > 0}
                <div class="result-reward">+{tournamentResult.reward} BE</div>
            {:else}
                <div class="result-none">No payout.</div>
            {/if}
            <button class="btn-secondary" style="margin-top:20px;" on:click={backToLobby}>Back to Lobby</button>
        </div>
    {/if}
</section>

<style>
    .trn { max-width: 900px; margin: 0 auto; padding-bottom: 40px; }
    .trn-head { margin-bottom: 20px; }
    .trn-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .trn-desc { font-size: 12px; color: #64748b; margin-top: 4px; }

    /* Season banner */
    .season-banner {
        position: relative; display: flex; align-items: center; justify-content: space-between;
        padding: 24px 28px; border-radius: 16px; margin-bottom: 20px; cursor: pointer;
        background: linear-gradient(135deg, rgba(30,58,138,0.25), rgba(15,23,42,0.6));
        border: 1px solid rgba(59,130,246,0.12); overflow: hidden;
        transition: border-color 0.15s;
    }
    .season-banner:hover { border-color: rgba(59,130,246,0.25); }
    .sb-glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.06), transparent 60%); pointer-events: none; }
    .sb-content { position: relative; }
    .sb-badge { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #3b82f6; margin-bottom: 4px; }
    .sb-title { font-size: 20px; font-weight: 900; color: #93c5fd; }
    .sb-sub { font-size: 11px; color: #64748b; margin-top: 4px; }

    /* Mode cards */
    .mode-card {
        position: relative; text-align: center; overflow: hidden;
        padding: 32px 24px; border-radius: 20px; margin-bottom: 24px;
    }
    .mode-cafe {
        background: linear-gradient(160deg, rgba(6,78,59,0.2), rgba(15,23,42,0.6));
        border: 1px solid rgba(16,185,129,0.15);
    }
    .mode-bg {
        position: absolute; right: -10px; top: -20px; font-size: 100px; opacity: 0.04; pointer-events: none;
    }
    .mode-title { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 6px; position: relative; }
    .mode-title-green { color: #6ee7b7; }
    .mode-desc { font-size: 12px; color: #64748b; margin-bottom: 16px; position: relative; }
    .mode-tags { display: flex; justify-content: center; gap: 8px; margin-bottom: 20px; position: relative; }
    .tag {
        font-size: 10px; font-weight: 800; font-family: monospace;
        padding: 5px 14px; border-radius: 8px; border: 1px solid;
        background: rgba(0,0,0,0.25);
    }
    .tag-green { color: #6ee7b7; border-color: rgba(16,185,129,0.2); }
    .tag-emerald { color: #34d399; border-color: rgba(16,185,129,0.15); }
    .tag-slate { color: #94a3b8; border-color: rgba(71,85,105,0.2); }
    .mode-warn { font-size: 12px; font-weight: 700; color: #f87171; margin-bottom: 8px; position: relative; }
    .mode-link { font-size: 11px; font-weight: 700; color: #60a5fa; background: none; border: none; cursor: pointer; position: relative; }
    .mode-link:hover { color: #93c5fd; }

    /* Locked modes grid */
    .modes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 700px) { .modes-grid { grid-template-columns: 1fr; } }
    .mode-locked {
        text-align: center; padding: 24px 16px; border-radius: 16px; opacity: 0.45;
        background: rgba(12,16,28,0.4); border: 1px solid rgba(51,65,85,0.15);
    }
    .ml-icon { font-size: 24px; display: block; margin-bottom: 8px; }
    .ml-name { font-size: 12px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
    .ml-desc { font-size: 10px; color: #475569; margin-top: 4px; }
    .ml-lock { font-size: 10px; font-weight: 800; color: #f87171; display: block; margin-top: 8px; }

    /* Phase shared */
    .phase-center { text-align: center; margin-bottom: 20px; }
    .phase-title { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .phase-title-green { color: #6ee7b7; }

    /* Bracket dots */
    .bracket-dots { display: flex; justify-content: center; gap: 8px; }
    .bdot {
        width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 900; border: 2px solid;
    }
    .bdot-w { background: rgba(6,78,59,0.4); border-color: #10b981; color: #6ee7b7; }
    .bdot-l { background: rgba(127,29,29,0.4); border-color: #ef4444; color: #fca5a5; }
    .bdot-active { background: rgba(30,58,138,0.4); border-color: #3b82f6; color: #93c5fd; }
    .bdot-future { background: rgba(15,23,42,0.4); border-color: #334155; color: #475569; }

    /* VS card */
    .vs-card {
        display: flex; align-items: center; justify-content: center; gap: 32px;
        padding: 28px; border-radius: 16px; margin-bottom: 20px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
    }
    .vs-side { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .vs-rating { font-size: 36px; font-weight: 900; }
    .vs-blue { color: #60a5fa; } .vs-red { color: #f87171; }
    .vs-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .vs-x { font-size: 18px; font-weight: 900; color: #334155; }

    /* Match header */
    .match-header { text-align: center; margin-bottom: 20px; }
    .mh-label { font-size: 12px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
    .mh-score { display: flex; justify-content: center; gap: 16px; margin-top: 8px; }
    .mh-blue { font-size: 24px; font-weight: 900; color: #60a5fa; }
    .mh-red { font-size: 24px; font-weight: 900; color: #f87171; }
    .mh-sep { font-size: 24px; font-weight: 900; color: #334155; }

    /* Log */
    .log-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
    .log-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; border-radius: 12px; font-size: 12px;
        background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15);
    }
    .log-w { border-color: rgba(16,185,129,0.15); } .log-l { border-color: rgba(239,68,68,0.15); }
    .log-result { font-weight: 900; }
    .log-w .log-result { color: #34d399; } .log-l .log-result { color: #f87171; }
    .log-detail { color: #64748b; font-size: 11px; }

    /* Play picker */
    .play-picker {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 16px; padding: 24px;
    }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 16px; }
    .play-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .play-btn {
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        padding: 20px 12px; border-radius: 14px; cursor: pointer;
        background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3);
        transition: all 0.12s;
    }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(59,130,246,0.2); transform: scale(1.03); }
    .pb-icon { font-size: 26px; }
    .pb-name { font-size: 12px; font-weight: 900; color: #e2e8f0; }
    .pb-stat { font-size: 9px; color: #475569; text-transform: uppercase; }

    /* Results */
    .result-card {
        text-align: center; padding: 40px 24px; border-radius: 20px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
    }
    .result-win { border-color: rgba(16,185,129,0.15); background: rgba(6,78,59,0.08); }
    .result-lose { border-color: rgba(239,68,68,0.15); background: rgba(127,29,29,0.06); }
    .result-icon { font-size: 40px; margin-bottom: 12px; }
    .result-title { font-size: 24px; font-weight: 900; margin-bottom: 8px; }
    .rt-win { color: #34d399; } .rt-lose { color: #f87171; }
    .result-sub { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
    .result-reward { font-size: 22px; font-weight: 900; color: #60a5fa; margin-top: 12px; }
    .result-none { font-size: 11px; color: #475569; margin-top: 8px; }
</style>
