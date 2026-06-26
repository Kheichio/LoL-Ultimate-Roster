<script>
    import Card from '../card/Card.svelte';
    import { club, squad, bench, blueEssence, trackStats, seasonData, skills, grantXP, grantBPXP, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab, splitCooldownEnd } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { getDB, LEGACY_TIERS, getEffectiveStats, getEffectiveRating, getEra } from '../../utils/cards.js';
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
    let roundPlays = [];
    let cooldownEnd = 0;
    let cooldownLeft = 0;
    let cooldownTimer = null;

    import { onDestroy } from 'svelte';

    const BASE_COOLDOWN = 60;
    $: benchLevel = $skills.bench || 0;
    $: swapsUsed = $seasonData.swapsUsed || 0;
    $: benchPlayers = (Array.isArray($bench) ? $bench : []).filter(Boolean);
    $: canSwap = benchPlayers.length > 0;
    let showBenchPicker = false;
    let benchSwapRole = null;

    function openBenchPicker(role) {
        benchSwapRole = role;
        showBenchPicker = true;
    }

    function executeBenchSwap(benchIdx) {
        if (!benchSwapRole) return;
        const b = Array.isArray($bench) ? $bench : [];
        const benchCard = b[benchIdx];
        if (!benchCard) return;
        const currentCard = get(squad)[benchSwapRole];
        squad.update(s => ({ ...s, [benchSwapRole]: benchCard }));
        bench.update(b => { const n = [...b]; n[benchIdx] = currentCard; return n; });
        seasonData.update(s => ({ ...s, swapsUsed: (s.swapsUsed || 0) + 1 }));
        showBenchPicker = false;
        benchSwapRole = null;
        saveGame();
        showToast(`Swapped ${benchCard.name} into ${benchSwapRole}. ${currentCard ? currentCard.name + ' moved to bench.' : ''}`, 'success');
    }

    $: benchCandidates = (Array.isArray($bench) ? $bench : []).map((card, idx) => ({ card, idx })).filter(e => e.card !== null);

    $: staminaLevel = $skills.stamina || 0;
    $: cooldownSecs = Math.max(10, BASE_COOLDOWN - staminaLevel * 10);
    $: onCooldown = cooldownLeft > 0;

    function startCooldown() {
        cooldownEnd = Date.now() + cooldownSecs * 1000;
        localStorage.setItem('lur_split_cooldown', String(cooldownEnd));
        splitCooldownEnd.set(cooldownEnd);
        updateCooldown();
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(updateCooldown, 1000);
    }
    function updateCooldown() {
        const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
        cooldownLeft = remaining;
        if (remaining <= 0) {
            splitCooldownEnd.set(0);
            if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
        }
    }
    function restoreCooldown() {
        const saved = localStorage.getItem('lur_split_cooldown');
        if (saved) {
            const end = Number(saved);
            if (end > Date.now()) {
                cooldownEnd = end;
                splitCooldownEnd.set(end);
                updateCooldown();
                if (cooldownTimer) clearInterval(cooldownTimer);
                cooldownTimer = setInterval(updateCooldown, 1000);
            } else {
                localStorage.removeItem('lur_split_cooldown');
            }
        }
    }
    restoreCooldown();
    onDestroy(() => { if (cooldownTimer) clearInterval(cooldownTimer); });

    function rollRoundPlays() {
        const shuffled = [...PLAYS].sort(() => Math.random() - 0.5);
        roundPlays = shuffled.slice(0, 3);
    }

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: coachBonus = (() => { const c=$squad.COACH; if(!c) return 0; return c.rating>=98?5:c.rating>=94?4:c.rating>=90?3:c.rating>=85?2:1; })();
    $: regionChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>c.region)).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: eraChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); if(!nl.length) return 5; const s=new Set(nl.map(c=>getEra(c.year))).size; return s<=1?5:s<=2?3:s<=3?2:1; })();
    $: teamChem = !squadReady?0:(()=>{ const nl=starters.filter(c=>!LEGACY_TIERS.includes(c.quality)); return !nl.length||new Set(nl.map(c=>c.team)).size===1?2:0; })();
    $: legacyBonus = (()=>{ const c=starters.filter(c=>LEGACY_TIERS.includes(c.quality)).length; return c>=4?2:c>=2?1:0; })();
    $: chemBonus = regionChem + eraChem + teamChem + coachBonus + legacyBonus;
    $: totalPower = squadReady ? avgRating + chemBonus : 0;
    $: tacticsLevel = $skills.tactics || 0;
    const STAT_KEYS = ['mec','tmf','map','frm','cmp'];
    $: myStatAvgs = squadReady ? (() => {
        try {
            const r = {}; STAT_KEYS.forEach(s => {
                r[s] = Math.round(starters.reduce((sum, c) => sum + (getEffectiveStats(c)[s]||0), 0) / starters.length) + tacticsLevel;
            }); return r;
        } catch(e) { return {}; }
    })() : {};
    $: cpuStatAvgs = currentOpponent ? (() => {
        try {
            const cards = Object.values(currentOpponent.cards || {}).filter(c => c && c.stats);
            const r = {}; STAT_KEYS.forEach(s => {
                r[s] = cards.length > 0 ? Math.round(cards.reduce((sum, c) => sum + (c.stats[s]||0), 0) / cards.length) : 0;
            }); return r;
        } catch(e) { return {}; }
    })() : {};
    $: splitName = SPLIT_NAMES[($seasonData.currentSplit - 1) % 4];
    $: splitYear = Math.floor(($seasonData.currentSplit - 1) / 4) + 1;
    $: matchIndex = ($seasonData.matchResults || []).filter(r => r === true || r === false).length;
    $: splitComplete = matchIndex >= GAMES_PER_SPLIT;
    $: wins = ($seasonData.matchResults || []).filter(r => r === true).length;
    $: losses = ($seasonData.matchResults || []).filter(r => r === false).length;

    // --- Meta system ---
    $: metaPhase = matchIndex < 5 ? 0 : 1;
    $: currentMeta = (() => {
        const raw = ($seasonData.meta || [])[metaPhase];
        if (!raw) return null;
        if (raw.buffed && raw.buffed.length > 0 && typeof raw.buffed[0] === 'string') return null;
        return raw;
    })();
    $: splitActive = ($seasonData.opponents || []).length > 0 && !splitComplete;
    $: affectedSquad = (() => {
        if (!currentMeta) return { buffed: {}, nerfed: {} };
        const all = ['TOP','JNG','MID','ADC','SUP','COACH'].map(r => $squad[r]).filter(Boolean);
        const b = {}, n = {};
        for (const entry of (currentMeta.buffed || [])) {
            const hit = all.filter(c => c.team === entry.team);
            if (hit.length > 0) b[entry.team] = hit;
        }
        for (const entry of (currentMeta.nerfed || [])) {
            const hit = all.filter(c => c.team === entry.team);
            if (hit.length > 0) n[entry.team] = hit;
        }
        return { buffed: b, nerfed: n };
    })();

    function randRange(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

    function generateMeta() {
        const db = getDB();
        if (!db) return [];
        const allTeams = [...new Set(db.map(c => c.team))];

        function buildPhase() {
            const shuffled = [...allTeams].sort(() => Math.random() - 0.5);
            const buffed = shuffled.slice(0, 5).map(t => ({ team: t, amount: randRange(8, 20) }));
            const nerfed = shuffled.slice(5, 17).map(t => ({ team: t, amount: randRange(10, 30) }));
            return { buffed, nerfed };
        }

        return [buildPhase(), buildPhase()];
    }

    function getMetaModifier(card) {
        if (!currentMeta || !card) return 0;
        try {
            const buff = currentMeta.buffed?.find(b => b.team === card.team);
            if (buff) return buff.amount || 0;
            const nerf = currentMeta.nerfed?.find(n => n.team === card.team);
            if (nerf) return -(nerf.amount || 0);
        } catch(e) {}
        return 0;
    }

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
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return false; }
        const regularPool = db.filter(p => p.role !== 'COACH' && !['Champion','MVP','Finalist','MSI','FirstStand','POTY','ROTY','TOTY','GPOTY','X'].includes(p.quality));
        const elitePool = db.filter(p => p.role !== 'COACH');
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const teamNames = ['Shadow Wolves', 'Storm Dragons', 'Iron Phoenix', 'Crystal Bears', 'Neon Tigers',
                          'Dark Knights', 'Solar Flare', 'Frost Giants', 'Thunder Hawks', 'Crimson Vipers'];

        const splitNum = $seasonData.currentSplit || 1;
        const yr = Math.floor((splitNum - 1) / 4);
        const hardMin = Math.min(yr, 4);
        const hardMax = Math.min(1 + yr * 2, 8);
        const bossMin = Math.max(0, yr - 1);
        const bossMax = Math.min(Math.floor(yr / 2), 3);
        const hardCount = yr === 0 ? 0 : randRange(hardMin, hardMax);
        const impossibleCount = yr <= 1 ? 0 : randRange(bossMin, bossMax);
        const hardSlots = new Set();
        const impossibleSlots = new Set();

        while (impossibleSlots.size < impossibleCount) {
            impossibleSlots.add(randRange(Math.max(5, GAMES_PER_SPLIT - 4), GAMES_PER_SPLIT - 1));
        }
        while (hardSlots.size < hardCount) {
            const s = randRange(3, GAMES_PER_SPLIT - 1);
            if (!impossibleSlots.has(s)) hardSlots.add(s);
        }

        const opps = [];
        for (let i = 0; i < GAMES_PER_SPLIT; i++) {
            const isImpossible = impossibleSlots.has(i);
            const isHard = hardSlots.has(i);
            let difficulty, pool, tag;

            if (isImpossible) {
                difficulty = randRange(110, 120);
                pool = elitePool;
                tag = 'BOSS';
            } else if (isHard) {
                difficulty = randRange(88, 100);
                pool = elitePool;
                tag = 'HARD';
            } else {
                difficulty = Math.min(95, 60 + (i * 3) + (yr * 4));
                pool = yr >= 3 ? elitePool : regularPool;
                tag = null;
            }

            const team = {};
            const used = new Set();
            roles.forEach(role => {
                let rolePool;
                if (isImpossible) {
                    rolePool = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= 95);
                    if (rolePool.length < 2) rolePool = pool.filter(p => p.role === role && !used.has(p.id)).sort((a, b) => b.rating - a.rating).slice(0, 5);
                } else if (isHard) {
                    rolePool = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= 85);
                    if (rolePool.length < 3) rolePool = pool.filter(p => p.role === role && !used.has(p.id)).sort((a, b) => b.rating - a.rating).slice(0, 10);
                } else {
                    rolePool = pool.filter(p => p.role === role && !used.has(p.id) && p.rating <= difficulty + 10);
                    if (rolePool.length < 3) rolePool = pool.filter(p => p.role === role && !used.has(p.id));
                }
                rolePool.sort((a, b) => b.rating - a.rating);
                const cutoff = Math.max(1, Math.min(rolePool.length, isImpossible ? 3 : isHard ? 5 : Math.floor(rolePool.length * 0.5)));
                const pick = rolePool[Math.floor(Math.random() * cutoff)];
                if (pick) { team[role] = pick; used.add(pick.id); }
            });

            const cards = Object.values(team);
            let avg = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : difficulty;
            if (isImpossible) avg = Math.max(avg, randRange(110, 120));
            opps.push({ name: teamNames[i], cards: team, avgRating: avg, index: i, tag });
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
        return true;
    }

    function goOverview() { phase = 'overview'; }
    function goPlayMenu() { switchTab('tournament'); }

    function startSplit() {
        if (!squadReady) { showToast('Fill all 5 starting positions.', 'error'); return; }
        const meta = generateMeta();
        seasonData.update(s => ({ ...s, meta, lockedSquad: JSON.parse(JSON.stringify(get(squad))), swapsUsed: 0 }));
        const ok = generateOpponents();
        if (ok === false) return;
        saveGame();
        phase = 'schedule';
    }

    function startMatch(oppIndex) {
        try {
            if (oppIndex !== matchIndex) {
                showToast(`Can't play this match yet. Next: #${matchIndex + 1}`, 'error');
                return;
            }
            if (!opponents[oppIndex]) {
                showToast('Opponent data missing. Try starting a new split.', 'error');
                return;
            }
            currentOpponent = opponents[oppIndex];
            playerScore = 0;
            cpuScore = 0;
            matchLog = [];
            rollRoundPlays();
            phase = 'match';
        } catch (e) {
            showToast('Error starting match: ' + e.message, 'error');
        }
    }

    function pickPlay(play) {
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const tLvl = get(skills).tactics || 0;
        const myStatAvg = Math.round(starters.reduce((s, c) => s + (getEffectiveStats(c)[play.stat] || 0) + getMetaModifier(c), 0) / starters.length) + tLvl;
        const cpuCards = Object.values(currentOpponent.cards);
        const cpuStatAvg = Math.round(cpuCards.reduce((s, c) => s + (c.stats[cpuPlay.stat] || 0), 0) / cpuCards.length);
        const statEdge = myStatAvg - cpuStatAvg;
        const myRoll = Math.floor(Math.random() * 11) - 5;
        const cpuRoll = Math.floor(Math.random() * 11) - 5;
        const myFinal = totalPower + statEdge + myRoll;
        const cpuFinal = currentOpponent.avgRating + cpuRoll;
        const won = myFinal >= cpuFinal;

        if (won) playerScore++;
        else cpuScore++;

        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won, tacticsBonus: tLvl, myBase: totalPower, cpuBase: currentOpponent.avgRating, statEdge, myRoll, cpuRoll }];
        grantXP(20);
        rollRoundPlays();

        if (playerScore >= 3 || cpuScore >= 3) {
            const matchWon = playerScore >= 3;
            grantXP(matchWon ? 150 : 60);
            grantBPXP(matchWon ? 75 : 25);
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
            startCooldown();
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
            meta: [],
            lockedSquad: null,
            trophyCase: [...(s.trophyCase || []), { split: s.currentSplit, name: splitName, year: splitYear, wins, losses, title: splitTitle.title, reward: reward.be }]
        }));

        playSound('claim');
        showToast(`Split complete! ${splitTitle.title} — +${reward.be} BE`, 'success');
        saveGame();
        phase = 'overview';
    }

</script>

<section class="sn">
    {#if phase === 'overview'}
        <div class="sn-head">
            <div>
                <h2 class="sn-title">Season Splits</h2>
                <p class="sn-desc">Play through 10 matches per split. Each split counts as a regional trophy.</p>
            </div>
        </div>

        <!-- Current Split Hero -->
        <div class="split-hero">
            <div class="split-hero-glow"></div>
            <div class="split-badge">Current Split</div>
            <div class="split-name">{splitName} Split — Year {splitYear}</div>
            <div class="split-num">Split #{$seasonData.currentSplit}</div>
            {#if opponents.length > 0 && !splitComplete}
                <div class="split-record">
                    <span class="sr-w">{wins}W</span>
                    <span class="sr-l">{losses}L</span>
                    <span class="sr-rem">{GAMES_PER_SPLIT - matchIndex} remaining</span>
                </div>
                <button class="sn-action-btn" on:click={() => phase = 'schedule'}>Continue Split →</button>
            {:else if !squadReady}
                <p class="split-warn">Fill all 5 positions to start.</p>
            {:else}
                <button class="sn-action-btn" on:click={startSplit}>Start {splitName} Split</button>
            {/if}
        </div>

        <!-- Rewards + Trophy in two columns -->
        <div class="sn-two-col">
            <div class="sn-panel">
                <div class="sn-label">Split Reward Tiers</div>
                <div class="reward-grid">
                    {#each SPLIT_REWARDS as r}
                        {@const t = SPLIT_TITLES.find(x => x.wins === r.wins)}
                        <div class="reward-tile">
                            <span class="rw-icon">{t?.icon || '—'}</span>
                            <span class="rw-title">{t?.title || '—'}</span>
                            <span class="rw-req">{r.wins === 0 ? '0-3' : r.wins}+ wins</span>
                            <span class="rw-be">{r.be} BE</span>
                        </div>
                    {/each}
                </div>
            </div>

            {#if ($seasonData.trophyCase || []).length > 0}
                <div class="sn-panel">
                    <div class="sn-label sn-label-gold">Trophy Case</div>
                    <div class="trophy-list">
                        {#each [...($seasonData.trophyCase || [])].reverse() as trophy}
                            {@const t = SPLIT_TITLES.find(x => x.title === trophy.title)}
                            <div class="trophy-row">
                                <span class="tr-icon">{t?.icon || '—'}</span>
                                <div class="tr-info">
                                    <span class="tr-name">{trophy.name} Split Y{trophy.year}</span>
                                    <span class="tr-sub">{trophy.wins}W-{trophy.losses}L · {trophy.title}</span>
                                </div>
                                <span class="tr-be">+{trophy.reward}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

    {:else if phase === 'schedule'}
        <div class="sn-topbar">
            <div>
                <h2 class="sn-title-sm">{splitName} Split — Schedule</h2>
                <p class="sn-mono">{wins}W - {losses}L · Match {matchIndex + 1} of {GAMES_PER_SPLIT}</p>
            </div>
            <div class="sn-topbar-btns">
                <button class="sn-nav-btn" on:click={goOverview}>← Overview</button>
                <button class="sn-nav-btn" on:click={goPlayMenu}>← Play Menu</button>
            </div>
        </div>

        <!-- Meta Panel -->
        {#if currentMeta}
            <div class="meta-panel">
                <div class="meta-header">
                    <span class="meta-badge">Team Meta — Phase {metaPhase + 1}/2</span>
                    <span class="meta-note">{metaPhase === 0 ? 'Changes after game 5' : 'Final phase'}</span>
                </div>
                <div class="meta-grid">
                    <div class="meta-col">
                        <div class="meta-col-label meta-buff">▲ Buffed Teams</div>
                        {#each currentMeta.buffed as entry}
                            {@const myAffected = affectedSquad.buffed[entry.team] || []}
                            <div class="meta-team-row meta-team-buff">
                                <div class="mtr-head">
                                    <span class="mtr-name">{entry.team}</span>
                                    <span class="mtr-amount mtr-amount-buff">+{entry.amount}</span>
                                </div>
                                {#if myAffected.length > 0}
                                    <div class="mtr-players">
                                        {#each myAffected as c}
                                            <span class="mtr-player mtr-player-buff">{c.role}: {c.name}</span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <div class="meta-col">
                        <div class="meta-col-label meta-nerf">▼ Slumping Teams</div>
                        {#each currentMeta.nerfed as entry}
                            {@const myAffected = affectedSquad.nerfed[entry.team] || []}
                            <div class="meta-team-row meta-team-nerf">
                                <div class="mtr-head">
                                    <span class="mtr-name">{entry.team}</span>
                                    <span class="mtr-amount mtr-amount-nerf">-{entry.amount}</span>
                                </div>
                                {#if myAffected.length > 0}
                                    <div class="mtr-players">
                                        {#each myAffected as c}
                                            <span class="mtr-player mtr-player-nerf">{c.role}: {c.name}</span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
                {#if splitActive}
                    <div class="meta-lock">
                        🔒 Squad locked for this split.
                        {#if canSwap}
                            <span class="swap-count">{benchPlayers.length} bench player{benchPlayers.length > 1 ? 's' : ''} available</span>
                        {:else if benchLevel > 0}
                            <span class="swap-hint">Add players to your bench in Squad Builder to enable swaps.</span>
                        {:else}
                            <span class="swap-hint">Upgrade Bench Management to unlock bench slots.</span>
                        {/if}
                    </div>
                    {#if canSwap}
                        <div class="bench-swap-bar">
                            <span class="bsb-label">Swap with Bench</span>
                            {#each ['TOP','JNG','MID','ADC','SUP'] as role}
                                <button class="bsb-btn" on:click={() => openBenchPicker(role)}>
                                    {role}
                                    {#if $squad[role]}<span class="bsb-name">{$squad[role].name}</span>{/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}

        <!-- Bench Picker Modal -->
        {#if showBenchPicker}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="bench-overlay" on:click={() => { showBenchPicker = false; }}>
                <div class="bench-modal" on:click|stopPropagation>
                    <div class="bench-head">
                        <h3 class="bench-title">Swap {benchSwapRole} with Bench</h3>
                        <button class="bench-close" on:click={() => { showBenchPicker = false; }}>✕</button>
                    </div>
                    {#if benchCandidates.length === 0}
                        <div class="bench-empty">No players on your bench. Add them in Squad Builder.</div>
                    {:else}
                        <div class="bench-list">
                            {#each benchCandidates as entry}
                                <button class="bench-card" on:click={() => executeBenchSwap(entry.idx)}>
                                    <span class="bc-rating">{entry.card.rating}</span>
                                    <span class="bc-name">{entry.card.name}</span>
                                    <span class="bc-team">{entry.card.team} [{entry.card.year}] · {entry.card.role}</span>
                                    <span class="bc-quality">{entry.card.quality}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        {#if opponents.length === 0}
            <div class="sch-empty">No opponents generated. Start a new split from the overview.</div>
        {:else}
            <div class="schedule-list">
                {#each opponents as opp, i}
                    {@const result = ($seasonData.matchResults || [])[i]}
                    {@const isNext = i === matchIndex}
                    {@const played = result !== null && result !== undefined}
                    <div class="sch-row" class:sch-win={played && result} class:sch-loss={played && !result} class:sch-next={isNext && !played} class:sch-future={!played && !isNext}>
                        <span class="sch-num">{i + 1}</span>
                        <div class="sch-info">
                            <span class="sch-name">{opp.name}</span>
                            {#if opp.tag === 'BOSS'}
                                <span class="sch-tag sch-tag-boss">BOSS</span>
                            {:else if opp.tag === 'HARD'}
                                <span class="sch-tag sch-tag-hard">HARD</span>
                            {/if}
                            <span class="sch-pwr-badge">{opp.avgRating} PWR</span>
                        </div>
                        {#if played}
                            <span class="sch-result" class:sch-result-w={result} class:sch-result-l={!result}>{result ? 'WIN' : 'LOSS'}</span>
                        {:else if isNext}
                            {#if onCooldown}
                                <span class="sch-cooldown">{cooldownLeft}s</span>
                            {:else}
                                <button class="sch-play-btn" on:click={() => startMatch(i)}>Play Match →</button>
                            {/if}
                        {:else}
                            <span class="sch-dash">—</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

    {:else if phase === 'match' && currentOpponent}
        {@const powerDiff = totalPower - currentOpponent.avgRating}
        <div class="match-header">
            <div class="match-label">Match {currentOpponent.index + 1} — vs {currentOpponent.name}</div>
            <div class="match-score">
                <span class="ms-blue">{playerScore}</span>
                <span class="ms-sep">—</span>
                <span class="ms-red">{cpuScore}</span>
            </div>
            <div class="match-bo5">Best of 5 — first to 3</div>
        </div>

        <div class="match-layout">
            <!-- Left: Your team -->
            <div class="team-block">
                <div class="arena-label arena-label-blue">Your Squad ({totalPower})</div>
                <div class="arena-grid-2x3">
                    {#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}
                        {#each pair as role}
                            <div class="arena-cell">
                                {#if $squad[role]}
                                    <Card card={$squad[role]} mini={true} />
                                {:else}
                                    <div class="arena-empty">{role}</div>
                                {/if}
                            </div>
                        {/each}
                    {/each}
                </div>
            </div>

            <!-- Center: Combat -->
            <div class="arena-center">
                <div class="power-compare">
                    <span class="pc-side pc-blue">{totalPower}</span>
                    <div class="pc-center">
                        <div class="pc-label">Base Power</div>
                        <div class="pc-diff" class:pc-pos={powerDiff > 0} class:pc-neg={powerDiff < 0} class:pc-even={powerDiff === 0}>
                            {powerDiff > 0 ? '+' : ''}{powerDiff}
                        </div>
                        <div class="pc-note">± 5 luck per side</div>
                    </div>
                    <span class="pc-side pc-red">{currentOpponent.avgRating}</span>
                </div>

                <div class="stat-compare">
                    <div class="sc-title">Available Plays {#if tacticsLevel > 0}<span class="tactics-tag">🧠 Tactics +{tacticsLevel}</span>{/if}</div>
                    {#each roundPlays as play}
                        {@const myVal = myStatAvgs[play.stat] || 0}
                        {@const cpuVal = cpuStatAvgs[play.stat] || 0}
                        {@const diff = myVal - cpuVal}
                        <div class="sc-row">
                            <span class="sc-val sc-val-blue">{myVal}</span>
                            <div class="sc-bar-wrap">
                                <div class="sc-label">{play.icon} {play.label}</div>
                                <div class="sc-bar">
                                    <div class="sc-fill-blue" style="width: {Math.min(100, (myVal / Math.max(myVal, cpuVal, 1)) * 50)}%"></div>
                                    <div class="sc-fill-red" style="width: {Math.min(100, (cpuVal / Math.max(myVal, cpuVal, 1)) * 50)}%; margin-left: auto;"></div>
                                </div>
                                <div class="sc-diff" class:sc-diff-pos={diff > 0} class:sc-diff-neg={diff < 0}>{diff > 0 ? '+' : ''}{diff} stat</div>
                            </div>
                            <span class="sc-val sc-val-red">{cpuVal}</span>
                        </div>
                    {/each}
                </div>

                {#if matchLog.length > 0}
                    <div class="log-list">
                        {#each matchLog as log, i}
                            <div class="log-row" class:log-w={log.won} class:log-l={!log.won}>
                                <span class="log-result">R{i + 1} {log.won ? '✓' : '✗'}</span>
                                <div class="log-breakdown">
                                    <div class="log-main">{log.myPlay.icon} <strong>{log.myVal}</strong> vs {log.cpuPlay.icon} <strong>{log.cpuVal}</strong></div>
                                    <div class="log-detail-row">
                                        <span class="log-calc">{log.myBase}{log.statEdge >= 0 ? '+' : ''}{log.statEdge}{log.myRoll >= 0 ? '+' : ''}{log.myRoll}</span>
                                        <span class="log-vs">vs</span>
                                        <span class="log-calc">{log.cpuBase}{log.cpuRoll >= 0 ? '+' : ''}{log.cpuRoll}</span>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}

                {#if playerScore < 3 && cpuScore < 3}
                    <div class="play-picker">
                        <div class="play-label">Choose Your Play (3 of {PLAYS.length})</div>
                        <div class="play-grid play-grid-3">
                            {#each roundPlays as play}
                                {@const myVal = myStatAvgs[play.stat] || 0}
                                {@const cpuVal = cpuStatAvgs[play.stat] || 0}
                                {@const edge = myVal - cpuVal}
                                {@const net = powerDiff + edge}
                                <button class="play-btn" on:click={() => pickPlay(play)}>
                                    <span class="pb-icon">{play.icon}</span>
                                    <span class="pb-name">{play.label}</span>
                                    <span class="pb-edge" class:pb-edge-pos={net > 0} class:pb-edge-neg={net < 0}>Net {net > 0 ? '+' : ''}{net}</span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Right: CPU team -->
            <div class="team-block">
                <div class="arena-label arena-label-red">{currentOpponent.name} ({currentOpponent.avgRating})</div>
                <div class="arena-grid-2x3">
                    {#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}
                        {#each pair as role}
                            <div class="arena-cell">
                                {#if currentOpponent.cards[role]}
                                    <Card card={currentOpponent.cards[role]} mini={true} />
                                {:else if role !== 'COACH'}
                                    <div class="arena-empty">{role}</div>
                                {:else}
                                    <div class="arena-empty-sm"></div>
                                {/if}
                            </div>
                        {/each}
                    {/each}
                </div>
            </div>
        </div>

    {:else if phase === 'matchResult'}
        {@const matchWon = playerScore >= 3}
        <div class="result-card" class:result-win={matchWon} class:result-lose={!matchWon}>
            <div class="result-icon">{matchWon ? '✓' : '✗'}</div>
            <h2 class="result-title" class:rt-win={matchWon} class:rt-lose={!matchWon}>{matchWon ? 'Match Won!' : 'Match Lost'}</h2>
            <p class="result-score">Score: {playerScore}-{cpuScore} vs {currentOpponent?.name || 'CPU'}</p>
            <p class="result-record">Split record: {wins}W - {losses}L ({GAMES_PER_SPLIT - matchIndex} remaining)</p>
            <button class="sn-back-btn" on:click={backToSchedule}>
                {matchIndex >= GAMES_PER_SPLIT ? 'View Split Results' : 'Back to Schedule'}
            </button>
        </div>

    {:else if phase === 'splitEnd'}
        <div class="result-card" class:result-win={wins >= 6}>
            <div class="result-icon" style="font-size:48px;">{splitTitle?.icon || '—'}</div>
            <h2 class="result-title rt-win" style="font-size:24px;">{splitTitle?.title || 'Split Complete'}</h2>
            <p class="result-sub">{splitName} Split — Year {splitYear}</p>
            <p class="result-record">Final Record: {wins}W - {losses}L</p>
            {#if splitReward}
                <div class="reward-box">
                    <span class="rb-be">+{splitReward.be} BE</span>
                    <span class="rb-label">{splitReward.label}</span>
                    {#if wins >= 6}<span class="rb-trophy">+1 Regional Trophy</span>{/if}
                </div>
            {/if}
            <button class="sn-action-btn sn-claim-btn" on:click={claimSplitReward}>Claim & Start Next Split</button>
        </div>
    {/if}
</section>

<style>
    .sn { max-width: 1600px; margin: 0 auto; padding-bottom: 40px; }
    .sn-head { margin-bottom: 20px; }
    .sn-title { font-size: 22px; font-weight: 900; color: #93c5fd; letter-spacing: 0.5px; }
    .sn-desc { font-size: 12px; color: #64748b; margin-top: 4px; }

    /* Split hero */
    .split-hero {
        position: relative; text-align: center; padding: 40px 24px 32px;
        background: linear-gradient(160deg, rgba(30,58,138,0.25), rgba(15,23,42,0.6));
        border: 1px solid rgba(59,130,246,0.12); border-radius: 20px;
        margin-bottom: 24px; overflow: hidden;
    }
    .split-hero-glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.08), transparent 60%); pointer-events: none; }
    .split-badge { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; color: #3b82f6; margin-bottom: 8px; position: relative; }
    .split-name { font-size: 28px; font-weight: 900; color: #bfdbfe; position: relative; }
    .split-num { font-size: 12px; color: #64748b; font-family: monospace; margin-top: 4px; position: relative; }
    .split-record { display: flex; justify-content: center; gap: 20px; margin-top: 16px; font-size: 14px; font-weight: 900; position: relative; }
    .sr-w { color: #34d399; } .sr-l { color: #f87171; } .sr-rem { color: #64748b; font-weight: 600; }
    .split-warn { color: #f87171; font-size: 12px; font-weight: 700; margin-top: 16px; position: relative; }

    /* Two column layout */
    .sn-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 700px) { .sn-two-col { grid-template-columns: 1fr; } }
    .sn-panel {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 16px; padding: 20px;
    }
    .sn-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; margin-bottom: 14px; }
    .sn-label-gold { color: #f59e0b; }

    /* Reward tiles */
    .reward-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .reward-tile {
        background: rgba(15,23,42,0.4); border: 1px solid rgba(51,65,85,0.15);
        border-radius: 10px; padding: 10px 8px; text-align: center;
        display: flex; flex-direction: column; gap: 2px;
    }
    .rw-icon { font-size: 16px; }
    .rw-title { font-size: 10px; font-weight: 900; color: #94a3b8; }
    .rw-req { font-size: 9px; color: #475569; }
    .rw-be { font-size: 12px; font-weight: 900; color: #60a5fa; }

    /* Trophy list */
    .trophy-list { display: flex; flex-direction: column; gap: 6px; }
    .trophy-row {
        display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        background: rgba(15,23,42,0.3); border-radius: 10px;
    }
    .tr-icon { font-size: 18px; flex-shrink: 0; }
    .tr-info { flex: 1; min-width: 0; }
    .tr-name { display: block; font-size: 12px; font-weight: 800; color: #e2e8f0; }
    .tr-sub { display: block; font-size: 10px; color: #64748b; }
    .tr-be { font-size: 12px; font-weight: 900; color: #34d399; flex-shrink: 0; }

    /* Schedule */
    .sn-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
    .sn-title-sm { font-size: 18px; font-weight: 900; color: #93c5fd; }
    .sn-mono { font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px; }
    .sn-topbar-btns { display: flex; gap: 6px; }
    .sn-nav-btn {
        padding: 8px 16px; border-radius: 10px;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        color: #94a3b8; font-size: 11px; font-weight: 800;
        cursor: pointer; transition: all 0.12s;
    }
    .sn-nav-btn:hover { background: rgba(51,65,85,0.5); color: #e2e8f0; }

    .schedule-list { display: flex; flex-direction: column; gap: 6px; }
    .sch-row {
        display: flex; align-items: center; gap: 14px; padding: 14px 18px;
        border-radius: 12px; border: 1px solid rgba(51,65,85,0.2);
        background: rgba(12,16,28,0.4); transition: all 0.12s;
    }
    .sch-win { border-color: rgba(16,185,129,0.15); background: rgba(6,78,59,0.08); }
    .sch-loss { border-color: rgba(239,68,68,0.15); background: rgba(127,29,29,0.06); }
    .sch-next { border-color: rgba(59,130,246,0.3); background: rgba(30,58,138,0.12); }
    .sch-future { opacity: 0.4; }
    .sch-num { font-size: 13px; font-weight: 900; color: #475569; width: 24px; text-align: center; }
    .sch-win .sch-num { color: #34d399; } .sch-loss .sch-num { color: #f87171; } .sch-next .sch-num { color: #60a5fa; }
    .sch-info { flex: 1; }
    .sch-name { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .sch-tag {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        padding: 2px 8px; border-radius: 4px; margin-left: 6px;
    }
    .sch-tag-hard {
        background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.2); color: #fbbf24;
    }
    .sch-tag-boss {
        background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.2); color: #f87171;
        animation: boss-pulse 2s ease-in-out infinite;
    }
    @keyframes boss-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
    .sch-pwr-badge {
        font-size: 11px; font-weight: 900; color: #f87171;
        background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.12);
        padding: 2px 10px; border-radius: 6px; margin-left: 8px;
    }
    .sch-empty {
        text-align: center; padding: 40px 20px; color: #475569;
        font-size: 13px; font-style: italic;
    }
    .sch-result { font-size: 12px; font-weight: 900; }
    .sch-result-w { color: #34d399; } .sch-result-l { color: #f87171; }
    .sch-dash { font-size: 11px; color: #1e293b; }
    .sch-play-btn {
        padding: 8px 20px; border-radius: 10px;
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        color: white; font-weight: 900; font-size: 11px;
        text-transform: uppercase; letter-spacing: 1px;
        border: none; cursor: pointer;
        box-shadow: 0 4px 12px rgba(59,130,246,0.3);
        transition: all 0.15s;
    }
    .sch-play-btn:hover { box-shadow: 0 6px 20px rgba(59,130,246,0.45); transform: translateY(-1px); }
    .sch-cooldown {
        padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 900;
        color: #f59e0b; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.15);
        font-family: monospace;
    }

    /* Season action buttons */
    .sn-action-btn {
        margin-top: 16px; padding: 12px 32px; border-radius: 12px;
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        color: white; font-weight: 900; font-size: 13px;
        text-transform: uppercase; letter-spacing: 1px;
        border: none; cursor: pointer; position: relative;
        box-shadow: 0 4px 15px rgba(59,130,246,0.3);
        transition: all 0.15s;
    }
    .sn-action-btn:hover { box-shadow: 0 6px 20px rgba(59,130,246,0.45); transform: translateY(-1px); }
    .sn-claim-btn {
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        box-shadow: 0 4px 15px rgba(16,185,129,0.25);
    }
    .sn-claim-btn:hover { box-shadow: 0 6px 20px rgba(16,185,129,0.4); }
    .sn-back-btn {
        margin-top: 20px; padding: 12px 32px; border-radius: 12px;
        background: rgba(51,65,85,0.5); color: #94a3b8;
        font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;
        border: 1px solid rgba(71,85,105,0.4); cursor: pointer; transition: all 0.12s;
    }
    .sn-back-btn:hover { background: rgba(71,85,105,0.6); color: #e2e8f0; }

    /* Match */
    .match-header { text-align: center; margin-bottom: 20px; }
    .match-label { font-size: 11px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
    .match-score { display: flex; justify-content: center; gap: 16px; margin-top: 12px; }
    .ms-blue { font-size: 22px; font-weight: 900; color: #60a5fa; }
    .ms-red { font-size: 22px; font-weight: 900; color: #f87171; }
    .ms-sep { font-size: 22px; font-weight: 900; color: #334155; }
    .match-bo5 { font-size: 9px; color: #475569; margin-top: 4px; }

    /* Power compare */
    .power-compare { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px; padding: 12px 16px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.15); }
    .pc-side { font-size: 22px; font-weight: 900; min-width: 40px; text-align: center; }
    .pc-blue { color: #60a5fa; } .pc-red { color: #f87171; }
    .pc-center { text-align: center; }
    .pc-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; }
    .pc-diff { font-size: 18px; font-weight: 900; }
    .pc-pos { color: #34d399; } .pc-neg { color: #f87171; } .pc-even { color: #64748b; }
    .pc-note { font-size: 8px; color: #334155; margin-top: 2px; }

    .log-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
    .log-row {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px; border-radius: 10px; font-size: 12px;
        background: rgba(15,23,42,0.3); border: 1px solid rgba(51,65,85,0.15);
    }
    .log-w { border-color: rgba(16,185,129,0.15); } .log-l { border-color: rgba(239,68,68,0.15); }
    .log-result { font-weight: 900; font-size: 14px; flex-shrink: 0; }
    .log-w .log-result { color: #34d399; } .log-l .log-result { color: #f87171; }
    .log-breakdown { flex: 1; }
    .log-main { font-size: 12px; font-weight: 700; color: #e2e8f0; }
    .log-detail-row { display: flex; align-items: center; gap: 6px; font-size: 9px; color: #475569; font-family: monospace; margin-top: 2px; }
    .log-calc { color: #64748b; } .log-vs { color: #334155; }

    /* Play picker */
    .play-picker {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 16px; padding: 24px;
    }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 16px; }
    .play-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .play-grid-3 { grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 600px) { .play-grid { grid-template-columns: repeat(3, 1fr); } }
    .play-btn {
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        padding: 16px 8px; border-radius: 12px; cursor: pointer;
        background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3);
        transition: all 0.12s;
    }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(59,130,246,0.2); transform: scale(1.04); }
    .pb-icon { font-size: 22px; }
    .pb-name { font-size: 10px; font-weight: 900; color: #e2e8f0; }

    /* Results */
    .result-card {
        text-align: center; padding: 40px 24px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 20px;
    }
    .result-win { border-color: rgba(16,185,129,0.15); background: rgba(6,78,59,0.08); }
    .result-lose { border-color: rgba(239,68,68,0.15); background: rgba(127,29,29,0.06); }
    .result-icon { font-size: 40px; margin-bottom: 12px; }
    .result-title { font-size: 22px; font-weight: 900; margin-bottom: 8px; }
    .rt-win { color: #34d399; } .rt-lose { color: #f87171; }
    .result-score { font-size: 12px; color: #94a3b8; }
    .result-sub { font-size: 16px; font-weight: 900; color: #e2e8f0; margin-bottom: 4px; }
    .result-record { font-size: 12px; color: #64748b; font-family: monospace; }

    .reward-box {
        display: inline-flex; flex-direction: column; align-items: center; gap: 2px;
        background: rgba(15,23,42,0.4); padding: 16px 28px; border-radius: 14px; margin-top: 16px;
    }
    .rb-be { font-size: 24px; font-weight: 900; color: #60a5fa; }
    .rb-label { font-size: 10px; color: #64748b; }
    .rb-trophy { font-size: 10px; font-weight: 800; color: #fbbf24; margin-top: 2px; }

    /* Meta panel */
    .meta-panel {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 16px; padding: 20px; margin-bottom: 20px;
    }
    .meta-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .meta-badge {
        font-size: 11px; font-weight: 900; color: #a78bfa;
        text-transform: uppercase; letter-spacing: 1.5px;
    }
    .meta-note { font-size: 10px; color: #475569; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 600px) { .meta-grid { grid-template-columns: 1fr; } }
    .meta-col { display: flex; flex-direction: column; gap: 6px; }
    .meta-col-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .meta-buff { color: #34d399; }
    .meta-nerf { color: #f87171; }
    .meta-team-row { padding: 10px 12px; border-radius: 10px; }
    .meta-team-row.meta-team-buff {
        background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.12);
    }
    .meta-team-row.meta-team-nerf {
        background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.1);
    }
    .mtr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .mtr-name { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .mtr-amount { font-size: 14px; font-weight: 900; }
    .mtr-amount-buff { color: #34d399; }
    .mtr-amount-nerf { color: #f87171; }
    .mtr-players { display: flex; flex-wrap: wrap; gap: 4px; }
    .mtr-player {
        font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 6px;
    }
    .mtr-player-buff {
        color: #6ee7b7; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.15);
    }
    .mtr-player-nerf {
        color: #fca5a5; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.12);
    }
    .meta-lock {
        text-align: center; font-size: 10px; font-weight: 700; color: #f59e0b;
        margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(51,65,85,0.15);
    }
    .swap-count { color: #34d399; margin-left: 6px; }
    .swap-hint { color: #64748b; margin-left: 6px; font-weight: 400; }
    .bench-swap-bar {
        display: flex; align-items: center; gap: 6px; justify-content: center;
        margin-top: 10px; flex-wrap: wrap;
    }
    .bsb-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
    .bsb-btn {
        padding: 6px 12px; border-radius: 8px; font-size: 10px; font-weight: 700;
        background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.25);
        color: #5eead4; cursor: pointer; transition: all 0.12s;
        display: flex; align-items: center; gap: 4px;
    }
    .bsb-btn:hover { background: rgba(20,184,166,0.2); border-color: rgba(20,184,166,0.4); }
    .bsb-name { font-size: 9px; color: #94a3b8; }

    /* Bench picker modal */
    .bench-overlay {
        position: fixed; inset: 0; z-index: 100;
        background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .bench-modal {
        width: 100%; max-width: 420px; max-height: 80vh; overflow-y: auto;
        background: #0f172a; border: 1px solid rgba(51,65,85,0.3);
        border-radius: 16px; padding: 20px;
    }
    .bench-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .bench-title { font-size: 16px; font-weight: 900; color: #5eead4; }
    .bench-close {
        width: 28px; height: 28px; border-radius: 8px;
        background: rgba(51,65,85,0.3); border: 1px solid rgba(71,85,105,0.2);
        color: #64748b; font-size: 12px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
    }
    .bench-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }
    .bench-empty { text-align: center; padding: 32px; color: #475569; font-size: 12px; }
    .bench-list { display: flex; flex-direction: column; gap: 4px; }
    .bench-card {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px; border-radius: 10px;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3);
        cursor: pointer; transition: all 0.12s; text-align: left;
    }
    .bench-card:hover { background: rgba(20,184,166,0.08); border-color: rgba(20,184,166,0.3); }
    .bc-rating { font-size: 16px; font-weight: 900; color: #f1f5f9; min-width: 28px; }
    .bc-name { font-size: 12px; font-weight: 800; color: #e2e8f0; flex: 1; }
    .bc-team { font-size: 9px; color: #64748b; }
    .bc-quality { font-size: 9px; font-weight: 900; text-transform: uppercase; }

    /* Match layout - 3 columns: cards | combat | cards */
    .match-layout { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
    @media (max-width: 1400px) { .match-layout { grid-template-columns: 1fr; } .team-block { display: none; } }
    .team-block { display: flex; flex-direction: column; gap: 6px; }
    .arena-label {
        font-size: 10px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; padding: 8px 12px;
        border-radius: 10px; text-align: center;
    }
    .arena-label-blue { color: #93c5fd; background: rgba(30,58,138,0.2); border: 1px solid rgba(59,130,246,0.15); }
    .arena-label-red { color: #fca5a5; background: rgba(127,29,29,0.2); border: 1px solid rgba(239,68,68,0.15); }

    .arena-grid-2x3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .arena-cell { display: flex; justify-content: center; }
    .arena-empty {
        width: 180px; height: 80px; border-radius: 12px;
        background: rgba(15,23,42,0.3); border: 1px dashed rgba(51,65,85,0.2);
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 800; color: #1e293b; text-transform: uppercase;
    }
    .arena-empty-sm { width: 180px; height: 40px; }
    .arena-center { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    .stat-compare {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 14px; padding: 16px;
    }
    .sc-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; text-align: center; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .tactics-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 6px; background: rgba(147,51,234,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; font-size: 9px; font-weight: 900; letter-spacing: 0; text-transform: none; }
    .log-tactics { color: #c084fc; font-size: 9px; font-weight: 700; margin-left: 2px; }
    .sc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .sc-val { font-size: 14px; font-weight: 900; width: 32px; text-align: center; }
    .sc-val-blue { color: #60a5fa; }
    .sc-val-red { color: #f87171; }
    .sc-bar-wrap { flex: 1; text-align: center; }
    .sc-label { font-size: 10px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
    .sc-bar { display: flex; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .sc-fill-blue { background: linear-gradient(90deg, #1e40af, #3b82f6); border-radius: 4px 0 0 4px; }
    .sc-fill-red { background: linear-gradient(90deg, #ef4444, #991b1b); border-radius: 0 4px 4px 0; }
    .sc-diff { font-size: 11px; font-weight: 900; color: #64748b; margin-top: 2px; }
    .sc-diff-pos { color: #34d399; }
    .sc-diff-neg { color: #f87171; }
    .pb-edge { font-size: 11px; font-weight: 900; color: #64748b; }
    .pb-edge-pos { color: #34d399; }
    .pb-edge-neg { color: #f87171; }
</style>
