<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, skills, grantXP, grantBPXP, grantBE, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, LEGACY_TIERS, getEffectiveStats, getEffectiveRating } from '../../utils/cards.js';
    import { get } from 'svelte/store';

    const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const FLEX_PENALTY = 10;
    const MIN_CARDS = 15;
    const BANS = 5;

    let phase = 'lobby';
    let myPool = [];
    let cpuPool = [];
    let myBans = new Set();
    let cpuBans = new Set();
    let mySquad = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
    let cpuSquad = {};
    let playerScore = 0;
    let cpuScore = 0;
    let matchLog = [];
    let roundPlays = [];
    let assigningRole = null;
    let draftResult = null;

    const PLAYS = [
        { id: 'teamfight', label: 'Teamfight', stat: 'tmf', icon: '🔥', desc: 'A 5v5 clash decides the fight' },
        { id: 'skirmish', label: 'Skirmish', stat: 'mec', icon: '⚡', desc: 'Mechanical outplay in a 2v2' },
        { id: 'macro', label: 'Macro Play', stat: 'map', icon: '🗺️', desc: 'Map control and rotations' },
        { id: 'lategame', label: 'Late Game', stat: 'cmp', icon: '🧊', desc: 'Composure under pressure' },
        { id: 'earlygame', label: 'Early Game', stat: 'frm', icon: '📈', desc: 'Aggressive early tempo' },
    ];

    $: canStart = $club.length >= MIN_CARDS;

    function getCardStat(card, stat, role) {
        const base = (card.stats[stat] || 0);
        const isNatural = card.role === role || LEGACY_TIERS.includes(card.quality);
        return isNatural ? base : Math.max(0, base - FLEX_PENALTY);
    }

    function startDraft() {
        if (!canStart) { showToast(`Need at least ${MIN_CARDS} cards in your club.`, 'error'); return; }
        const cl = get(club);
        const shuffled = [...cl].filter(c => c.role !== 'COACH').sort(() => Math.random() - 0.5);
        myPool = shuffled.slice(0, 15);

        const db = getDB();
        if (!db) return;
        const avgRating = Math.round(myPool.reduce((s, c) => s + c.rating, 0) / myPool.length);
        const cpuCandidates = db.filter(c => c.role !== 'COACH' && Math.abs(c.rating - avgRating) <= 8);
        const cpuShuffled = [...cpuCandidates].sort(() => Math.random() - 0.5);
        cpuPool = cpuShuffled.slice(0, 15);

        myBans = new Set();
        cpuBans = new Set();
        mySquad = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
        cpuSquad = {};
        playerScore = 0;
        cpuScore = 0;
        matchLog = [];
        draftResult = null;
        phase = 'ban_player';
    }

    function banCpuCard(card) {
        if (myBans.size >= BANS) return;
        myBans = new Set([...myBans, card.id]);
        if (myBans.size >= BANS) {
            doCpuBans();
            phase = 'build';
        }
    }

    function doCpuBans() {
        const available = myPool.filter(c => !cpuBans.has(c.uniqueId));
        const sorted = [...available].sort((a, b) => b.rating - a.rating);
        const bans = new Set();
        for (const card of sorted) {
            if (bans.size >= BANS) break;
            if (Math.random() < 0.7 || bans.size >= BANS - 1) {
                bans.add(card.uniqueId);
            } else if (Math.random() < 0.4) {
                bans.add(card.uniqueId);
            }
        }
        while (bans.size < BANS && available.length > bans.size) {
            const pick = available[Math.floor(Math.random() * available.length)];
            bans.add(pick.uniqueId);
        }
        cpuBans = bans;
    }

    $: myAvailable = myPool.filter(c => !cpuBans.has(c.uniqueId));
    $: cpuAvailable = cpuPool.filter(c => !myBans.has(c.id));
    $: myAssigned = new Set(Object.values(mySquad).filter(Boolean).map(c => c.uniqueId));
    $: myUnassigned = myAvailable.filter(c => !myAssigned.has(c.uniqueId));

    function assignToRole(card) {
        if (!assigningRole) return;
        mySquad = { ...mySquad, [assigningRole]: card };
        assigningRole = null;
    }

    function removeFromRole(role) {
        mySquad = { ...mySquad, [role]: null };
    }

    $: squadReady = ROLES.every(r => mySquad[r] !== null);

    function buildCpuSquad() {
        const available = [...cpuAvailable];
        const sq = {};
        ROLES.forEach(role => {
            const natural = available.filter(c => c.role === role);
            if (natural.length > 0) {
                natural.sort((a, b) => b.rating - a.rating);
                sq[role] = natural[0];
                available.splice(available.indexOf(natural[0]), 1);
            }
        });
        ROLES.forEach(role => {
            if (!sq[role] && available.length > 0) {
                available.sort((a, b) => b.rating - a.rating);
                sq[role] = available.shift();
            }
        });
        return sq;
    }

    function startMatch() {
        if (!squadReady) { showToast('Fill all 5 positions.', 'error'); return; }
        cpuSquad = buildCpuSquad();
        playerScore = 0;
        cpuScore = 0;
        matchLog = [];
        rollRoundPlays();
        phase = 'match';
    }

    function rollRoundPlays() {
        const shuffled = [...PLAYS].sort(() => Math.random() - 0.5);
        roundPlays = shuffled.slice(0, 3);
    }

    $: myStarters = ROLES.map(r => mySquad[r]).filter(Boolean);
    $: cpuStarters = ROLES.map(r => cpuSquad[r]).filter(Boolean);

    function getSquadStatAvg(starters, squad, stat) {
        if (starters.length === 0) return 0;
        let total = 0;
        for (const role of ROLES) {
            const card = squad[role];
            if (!card) continue;
            total += getCardStat(card, stat, role);
        }
        return Math.round(total / starters.length);
    }

    $: myPower = (() => {
        if (!squadReady) return 0;
        const avg = Math.round(myStarters.reduce((s, c) => s + c.rating, 0) / myStarters.length);
        return avg + (get(skills).conditioning || 0);
    })();
    $: cpuPower = cpuStarters.length > 0 ? Math.round(cpuStarters.reduce((s, c) => s + c.rating, 0) / cpuStarters.length) : 0;
    $: powerDiff = myPower - cpuPower;

    function pickPlay(play) {
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const tLvl = get(skills).tactics || 0;
        const myStat = getSquadStatAvg(myStarters, mySquad, play.stat) + tLvl;
        const cpuStat = getSquadStatAvg(cpuStarters, cpuSquad, cpuPlay.stat);
        const statEdge = myStat - cpuStat;
        const myRoll = Math.floor(Math.random() * 11) - 5;
        const cpuRoll = Math.floor(Math.random() * 11) - 5;
        const myFinal = myPower + statEdge + myRoll;
        const cpuFinal = cpuPower + cpuRoll;
        const won = myFinal >= cpuFinal;
        if (won) playerScore++; else cpuScore++;
        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won, myBase: myPower, cpuBase: cpuPower, statEdge, myRoll, cpuRoll }];
        grantXP(20);
        rollRoundPlays();
        if (playerScore >= 3 || cpuScore >= 3) {
            endDraft(playerScore >= 3);
        }
    }

    function endDraft(won) {
        const reward = won ? 2000 : 500;
        const total = grantBE(reward);
        grantXP(won ? 300 : 100);
        grantBPXP(won ? 150 : 50);
        trackStats.update(s => ({
            ...s,
            draftModesPlayed: (s.draftModesPlayed || 0) + 1,
            draftModesWon: (s.draftModesWon || 0) + (won ? 1 : 0),
        }));
        if (won) playSound('win'); else playSound('lose');
        draftResult = { won, reward: total };
        phase = 'result';
        saveGame();
    }

    function backToLobby() { phase = 'lobby'; }
</script>

<section class="draft">
    {#if phase === 'lobby'}
        <div class="draft-lobby">
            <h2 class="draft-title">Draft Mode</h2>
            <p class="draft-desc">15 random cards from your club. Ban 5 of their cards, they ban 5 of yours. Build a squad and battle — best of 5.</p>
            <div class="draft-rules">
                <div class="rule"><span class="rule-icon">📋</span> Minimum {MIN_CARDS} cards in club required</div>
                <div class="rule"><span class="rule-icon">🚫</span> {BANS} bans per side</div>
                <div class="rule"><span class="rule-icon">🔄</span> All cards flexable — non-natural role gets -{FLEX_PENALTY} to all stats</div>
                <div class="rule"><span class="rule-icon">🏆</span> Legacy cards are wild — no flex penalty</div>
                <div class="rule"><span class="rule-icon">💎</span> Win: 2,000 BE · Loss: 500 BE</div>
            </div>
            {#if canStart}
                <button class="draft-start" on:click={startDraft}>Start Draft</button>
            {:else}
                <div class="draft-warn">You need at least {MIN_CARDS} non-coach cards. You have {$club.filter(c => c.role !== 'COACH').length}.</div>
            {/if}
            <button class="draft-back" on:click={() => switchTab('tournament')}>← Back to Play</button>
        </div>

    {:else if phase === 'ban_player'}
        <div class="ban-phase">
            <h2 class="phase-title ban-title">Ban Phase — Your Turn</h2>
            <p class="phase-desc">Select {BANS} of your opponent's cards to ban ({myBans.size}/{BANS})</p>
            <div class="ban-grid">
                {#each cpuPool as card (card.id)}
                    {@const banned = myBans.has(card.id)}
                    <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="ban-card" class:ban-card-banned={banned} on:click={() => !banned && banCpuCard(card)}>
                        <Card {card} mini={true} onclick={() => !banned && banCpuCard(card)} />
                        {#if banned}<div class="ban-overlay">BANNED</div>{/if}
                    </div>
                {/each}
            </div>
        </div>

    {:else if phase === 'build'}
        <div class="build-phase">
            <h2 class="phase-title build-title">Build Your Squad</h2>
            <p class="phase-desc">CPU banned {cpuBans.size} of your cards. Assign your remaining cards to roles. Off-role = -{FLEX_PENALTY} stats.</p>

            <!-- Banned cards display -->
            <div class="banned-bar">
                <span class="banned-label">Your Banned Cards:</span>
                {#each myPool.filter(c => cpuBans.has(c.uniqueId)) as card}
                    <span class="banned-name">{card.name} ({card.rating})</span>
                {/each}
            </div>

            <!-- Squad slots -->
            <div class="build-squad">
                {#each ROLES as role}
                    <div class="build-slot">
                        <div class="build-role">{role}</div>
                        {#if mySquad[role]}
                            <Card card={mySquad[role]} mini={true} onclick={() => {}} />
                            {#if mySquad[role].role !== role && !LEGACY_TIERS.includes(mySquad[role].quality)}
                                <div class="flex-tag">FLEX -{FLEX_PENALTY}</div>
                            {/if}
                            <button class="build-remove" on:click={() => removeFromRole(role)}>✕</button>
                        {:else}
                            <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div class="build-empty" class:build-picking={assigningRole === role} on:click={() => assigningRole = role}>
                                {assigningRole === role ? 'Select a card below' : `Assign ${role}`}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <!-- Available cards -->
            {#if assigningRole}
                <div class="pick-section">
                    <div class="pick-label">Available Cards — assigning to {assigningRole}</div>
                    <div class="pick-grid">
                        {#each myUnassigned as card (card.uniqueId)}
                            {@const isNatural = card.role === assigningRole || LEGACY_TIERS.includes(card.quality)}
                            <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div class="pick-card" class:pick-natural={isNatural} class:pick-flex={!isNatural} on:click={() => assignToRole(card)}>
                                <Card {card} mini={true} onclick={() => assignToRole(card)} />
                                {#if !isNatural}<div class="pick-penalty">-{FLEX_PENALTY}</div>{/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if squadReady}
                <button class="draft-start" on:click={startMatch}>Start Match →</button>
            {/if}
        </div>

    {:else if phase === 'match'}
        <div class="match-phase">
            <div class="match-header">
                <div class="mh-label">Draft Mode — Best of 5</div>
                <div class="mh-score"><span class="mh-blue">{playerScore}</span><span class="mh-sep">—</span><span class="mh-red">{cpuScore}</span></div>
            </div>

            <div class="power-compare">
                <span class="pc-side pc-blue">{myPower}</span>
                <div class="pc-center">
                    <div class="pc-label">Power</div>
                    <div class="pc-diff" class:pc-pos={powerDiff > 0} class:pc-neg={powerDiff < 0} class:pc-even={powerDiff === 0}>{powerDiff > 0 ? '+' : ''}{powerDiff}</div>
                    <div class="pc-note">Net = Power + Stat · Luck ±5 each</div>
                </div>
                <span class="pc-side pc-red">{cpuPower}</span>
            </div>

            {#if matchLog.length > 0}
                <div class="log-list">
                    {#each matchLog as log, i}
                        <div class="log-row" class:log-w={log.won} class:log-l={!log.won}>
                            <span class="log-result">R{i+1} {log.won ? '✓' : '✗'}</span>
                            <div class="log-breakdown">
                                <div class="log-main">{log.myPlay.icon} <strong>{log.myVal}</strong> vs {log.cpuPlay.icon} <strong>{log.cpuVal}</strong></div>
                                <div class="log-detail-row">
                                    <span class="log-calc">{log.myBase}{log.statEdge>=0?'+':''}{log.statEdge}{log.myRoll>=0?'+':''}{log.myRoll}</span>
                                    <span class="log-vs">vs</span>
                                    <span class="log-calc">{log.cpuBase}{log.cpuRoll>=0?'+':''}{log.cpuRoll}</span>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if playerScore < 3 && cpuScore < 3}
                <div class="play-picker">
                    <div class="play-label">Choose Your Play</div>
                    <div class="play-grid">
                        {#each roundPlays as play}
                            {@const myStat = getSquadStatAvg(myStarters, mySquad, play.stat) + (get(skills).tactics || 0)}
                            {@const cpuStat = getSquadStatAvg(cpuStarters, cpuSquad, PLAYS[0].stat)}
                            {@const edge = myStat - cpuStat}
                            {@const net = powerDiff + edge}
                            <button class="play-btn" on:click={() => pickPlay(play)}>
                                <span class="pb-icon">{play.icon}</span>
                                <span class="pb-name">{play.label}</span>
                                <span class="pb-desc">{play.desc}</span>
                                <span class="pb-stat" class:pb-edge-pos={edge>0} class:pb-edge-neg={edge<0}>Stat {edge>0?'+':''}{edge}</span>
                                <span class="pb-net" class:pb-edge-pos={net>0} class:pb-edge-neg={net<0}>Net {net>0?'+':''}{net}</span>
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

    {:else if phase === 'result'}
        <div class="result-phase">
            <div class="result-icon">{draftResult.won ? '🏆' : '💀'}</div>
            <h2 class="result-title">{draftResult.won ? 'Draft Won!' : 'Draft Lost'}</h2>
            <div class="result-score">{playerScore} — {cpuScore}</div>
            <div class="result-reward">+{draftResult.reward} BE</div>
            <div class="result-btns">
                <button class="draft-start" on:click={startDraft}>Play Again</button>
                <button class="draft-back" on:click={backToLobby}>Back to Lobby</button>
            </div>
        </div>
    {/if}
</section>

<style>
    .draft { max-width: 1100px; margin: 0 auto; padding-bottom: 40px; }

    /* Lobby */
    .draft-lobby { text-align: center; padding: 40px 0; }
    .draft-title { font-size: 28px; font-weight: 900; color: #c084fc; margin-bottom: 8px; }
    .draft-desc { font-size: 13px; color: #64748b; margin-bottom: 24px; max-width: 500px; margin-left: auto; margin-right: auto; }
    .draft-rules { display: flex; flex-direction: column; gap: 8px; max-width: 400px; margin: 0 auto 24px; text-align: left; }
    .rule { font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: rgba(15,23,42,0.3); }
    .rule-icon { font-size: 14px; }
    .draft-start { padding: 14px 40px; border-radius: 14px; background: linear-gradient(135deg, #7c3aed, #a855f7); border: none; color: white; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; cursor: pointer; transition: all 0.15s; box-shadow: 0 4px 16px rgba(124,58,237,0.3); }
    .draft-start:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(124,58,237,0.5); }
    .draft-back { display: block; margin: 16px auto 0; padding: 8px 20px; border-radius: 8px; background: transparent; border: 1px solid rgba(51,65,85,0.3); color: #64748b; font-size: 11px; font-weight: 700; cursor: pointer; }
    .draft-warn { color: #f87171; font-size: 12px; margin-bottom: 16px; }

    /* Ban Phase */
    .ban-phase, .build-phase, .match-phase { padding: 8px 0; }
    .phase-title { font-size: 20px; font-weight: 900; margin-bottom: 6px; }
    .ban-title { color: #f87171; }
    .build-title { color: #34d399; }
    .phase-desc { font-size: 12px; color: #64748b; margin-bottom: 16px; }
    .ban-grid, .pick-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .ban-card, .pick-card { position: relative; cursor: pointer; border-radius: 12px; border: 2px solid transparent; transition: all 0.12s; }
    .ban-card:hover { border-color: rgba(239,68,68,0.4); }
    .ban-card-banned { opacity: 0.3; pointer-events: none; }
    .ban-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(127,29,29,0.6); border-radius: 12px; color: #fca5a5; font-size: 14px; font-weight: 900; letter-spacing: 2px; }

    /* Build Phase */
    .banned-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 16px; padding: 10px 14px; border-radius: 10px; background: rgba(127,29,29,0.1); border: 1px solid rgba(239,68,68,0.15); }
    .banned-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #f87171; }
    .banned-name { font-size: 10px; color: #fca5a5; background: rgba(127,29,29,0.2); padding: 2px 8px; border-radius: 4px; }
    .build-squad { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; }
    .build-slot { position: relative; text-align: center; }
    .build-role { font-size: 10px; font-weight: 900; color: #475569; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .build-empty { width: 180px; height: 260px; border-radius: 14px; border: 2px dashed rgba(51,65,85,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px; color: #334155; font-weight: 700; cursor: pointer; transition: all 0.12s; }
    .build-empty:hover { border-color: rgba(168,85,247,0.4); color: #c084fc; }
    .build-picking { border-color: rgba(168,85,247,0.6) !important; color: #c084fc !important; background: rgba(168,85,247,0.05); }
    .build-remove { position: absolute; top: 20px; right: -4px; z-index: 5; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 1px solid rgba(239,68,68,0.3); color: #f87171; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .flex-tag { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); font-size: 8px; font-weight: 900; color: #f87171; background: rgba(127,29,29,0.8); padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
    .pick-section { margin-bottom: 20px; }
    .pick-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }
    .pick-card:hover { border-color: rgba(168,85,247,0.4); }
    .pick-natural { border-color: rgba(34,197,94,0.3); }
    .pick-flex { border-color: rgba(239,68,68,0.15); }
    .pick-penalty { position: absolute; top: 4px; right: 4px; z-index: 5; font-size: 8px; font-weight: 900; color: #f87171; background: rgba(127,29,29,0.8); padding: 2px 6px; border-radius: 4px; }

    /* Match */
    .match-header { text-align: center; margin-bottom: 16px; }
    .mh-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; }
    .mh-score { font-size: 28px; font-weight: 900; }
    .mh-blue { color: #60a5fa; } .mh-red { color: #f87171; } .mh-sep { color: #334155; margin: 0 8px; }
    .power-compare { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px; padding: 12px 16px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.15); }
    .pc-side { font-size: 22px; font-weight: 900; min-width: 40px; text-align: center; }
    .pc-blue { color: #60a5fa; } .pc-red { color: #f87171; }
    .pc-center { text-align: center; }
    .pc-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    .pc-diff { font-size: 18px; font-weight: 900; }
    .pc-pos { color: #34d399; } .pc-neg { color: #f87171; } .pc-even { color: #64748b; }
    .pc-note { font-size: 8px; color: #334155; margin-top: 2px; }
    .log-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .log-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; font-size: 12px; background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15); }
    .log-w { border-color: rgba(16,185,129,0.15); } .log-l { border-color: rgba(239,68,68,0.15); }
    .log-result { font-weight: 900; font-size: 14px; flex-shrink: 0; } .log-w .log-result { color: #34d399; } .log-l .log-result { color: #f87171; }
    .log-breakdown { flex: 1; }
    .log-main { font-size: 12px; font-weight: 700; color: #e2e8f0; }
    .log-detail-row { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #475569; font-family: monospace; margin-top: 2px; }
    .log-calc { color: #64748b; } .log-vs { color: #334155; }
    .play-picker { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 16px; padding: 24px; }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 16px; }
    .play-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .play-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 12px; border-radius: 14px; cursor: pointer; background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3); transition: all 0.12s; }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(168,85,247,0.3); transform: scale(1.03); }
    .pb-icon { font-size: 24px; } .pb-name { font-size: 12px; font-weight: 900; color: #e2e8f0; }
    .pb-desc { font-size: 8px; color: #475569; text-align: center; }
    .pb-stat { font-size: 10px; font-weight: 700; color: #64748b; }
    .pb-net { font-size: 12px; font-weight: 900; color: #64748b; margin-top: 2px; }
    .pb-edge-pos { color: #34d399; } .pb-edge-neg { color: #f87171; }

    /* Result */
    .result-phase { text-align: center; padding: 60px 0; }
    .result-icon { font-size: 64px; margin-bottom: 16px; }
    .result-title { font-size: 28px; font-weight: 900; color: #e2e8f0; margin-bottom: 8px; }
    .result-score { font-size: 18px; font-weight: 900; color: #64748b; margin-bottom: 8px; }
    .result-reward { font-size: 16px; font-weight: 900; color: #34d399; margin-bottom: 24px; }
    .result-btns { display: flex; gap: 12px; justify-content: center; }
</style>
