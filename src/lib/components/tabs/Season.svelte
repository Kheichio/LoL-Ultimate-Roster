<script>
    import Icon from '../ui/Icon.svelte';
    import MatchArena from '../match/MatchArena.svelte';
    import MatchResult from '../match/MatchResult.svelte';
    import { drawPlays, seriesWinChance } from '../match/matchMath.js';
    import { pressFx } from '../../utils/fx.js';
    import { squad, bench, trackStats, seasonData, skills, teamIdentity, grantXP, grantBPXP, grantBE, saveGame, logMatch, recordTitle } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab, splitCooldownEnd, openConfirmModal } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { saveToStorage, loadFromStorage, removeFromStorage } from '../../utils/storage.js';
    import { getDB, getEffectiveStats, getEffectiveRating, TIER_COLORS } from '../../utils/cards.js';
    import { calcCoachBonus, calcRegionChem, calcEraChem, calcTeamChem, calcLegacyBonus } from '../../utils/combat.js';
    import {
        ME, MATCHDAYS, PLAYOFF_SPOTS, WINS_NEEDED, SPLITS, LEAGUE_PRIZES, PLAYOFF_PRIZES, PERFECT_LEAGUE_BONUS, GR_STEPS, GOLDEN_ROAD_PRIZE,
        splitInfo, splitIndex, seasonYear, buildCpuTeams, createLeague, recordMyMatch, myFixture, myPlayed, leagueComplete, standings,
        seedPlayoffs, advancePlayoffs, simulatePlayoffs, myPlayoffSeries, myPlayoffResult, qualifiesFor, splitOutcome, splitPrize, regionalKey, grFresh,
    } from '../../utils/league.js';
    import { get } from 'svelte/store';
    import { onDestroy, onMount } from 'svelte';

    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };
    const EVENT_ICONS = { firststand: 'flame', msi: 'waves', worlds: 'trophy' };
    const PLAYS = [
        { id: 'mec', label: 'Mechanical', stat: 'mec', icon: '⚡' },
        { id: 'tmf', label: 'Teamfight', stat: 'tmf', icon: '🔥' },
        { id: 'map', label: 'Macro', stat: 'map', icon: '🗺️' },
        { id: 'frm', label: 'Form', stat: 'frm', icon: '📈' },
        { id: 'cmp', label: 'Composure', stat: 'cmp', icon: '🧊' },
    ];
    const STAT_KEYS = ['mec', 'tmf', 'map', 'frm', 'cmp'];

    // Screen: overview · league · playoffs · results (split done, rewards waiting) · match · matchResult
    let phase = 'overview';
    let matchLog = [];
    let playerScore = 0;
    let cpuScore = 0;
    let currentOpponent = null;
    let matchCtx = null;          // { kind: 'league' | 'semi' | 'final', round }
    let roundPlays = [];
    let lastMatch = null;         // what the result screen shows

    // ── Cooldown between your matches (Stamina skill) ──
    let cooldownEnd = 0, cooldownLeft = 0, cooldownTimer = null;
    const BASE_COOLDOWN = 60;
    $: staminaLevel = $skills.stamina || 0;
    $: cooldownSecs = Math.max(10, BASE_COOLDOWN - staminaLevel * 10);
    $: onCooldown = cooldownLeft > 0;
    function startCooldown() {
        cooldownEnd = Date.now() + cooldownSecs * 1000;
        saveToStorage('lur_split_cooldown', cooldownEnd);
        splitCooldownEnd.set(cooldownEnd);
        updateCooldown();
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(updateCooldown, 1000);
    }
    function updateCooldown() {
        const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
        cooldownLeft = remaining;
        if (remaining <= 0) { splitCooldownEnd.set(0); if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; } }
    }
    (function restoreCooldown() {
        // Back-compat: a bare number is valid JSON, so pre-slot cooldowns still decode; anything
        // unreadable is 0 (no cooldown), never a permanent one.
        const end = Number(loadFromStorage('lur_split_cooldown')) || 0;
        if (end > Date.now()) { cooldownEnd = end; splitCooldownEnd.set(end); updateCooldown(); cooldownTimer = setInterval(updateCooldown, 1000); }
        else if (end) removeFromStorage('lur_split_cooldown');
    })();
    onDestroy(() => { if (cooldownTimer) clearInterval(cooldownTimer); });

    // ── Your squad ──
    $: starters = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: chemBonus = (squadReady ? calcRegionChem(starters) + calcEraChem(starters) + calcTeamChem(starters) : 0) + calcCoachBonus($squad.COACH) + calcLegacyBonus(starters) + ($skills.conditioning || 0);
    $: totalPower = squadReady ? avgRating + chemBonus : 0;
    $: tacticsLevel = $skills.tactics || 0;

    // ── The season ──
    $: sd = $seasonData;
    $: split = splitInfo(sd.currentSplit);
    $: splitIdx = splitIndex(sd.currentSplit);
    $: year = seasonYear(sd.currentSplit);
    $: league = sd.league;
    $: played = myPlayed(league);
    $: table = league ? standings(league, totalPower) : [];
    $: myRow = table.find(r => r.id === ME) || null;
    $: po = sd.playoffs;
    $: mySeries = myPlayoffSeries(po);
    $: nextFix = sd.stage === 'league' && league && played < MATCHDAYS ? myFixture(league, played) : null;
    const teamOf = (id) => (id === ME ? { id: ME, name: $teamIdentity.name, logo: $teamIdentity.logo, avgRating: totalPower } : (league?.teams || []).find(t => t.id === id) || { id, name: '—', avgRating: 0, cards: {} });
    $: nextOppId = nextFix ? nextFix.opponentId : mySeries ? (mySeries.match.a === ME ? mySeries.match.b : mySeries.match.a) : null;
    $: nextOpp = nextOppId ? teamOf(nextOppId) : null;
    $: myFixtures = league ? Array.from({ length: MATCHDAYS }, (_, r) => myFixture(league, r)) : [];
    $: gr = sd.goldenRoad && sd.goldenRoad.year === year ? sd.goldenRoad : grFresh(year, splitIdx > 0 && (!sd.goldenRoad || sd.goldenRoad.year !== year));
    $: q = sd.qualified && !sd.qualified.played ? sd.qualified : null;
    $: trophies = sd.trophyCase || [];

    // ── Team meta (buffed / slumping real teams) ──
    $: metaPhase = sd.stage === 'playoffs' ? 1 : played < 5 ? 0 : 1;
    $: currentMeta = (() => {
        const raw = (sd.meta || [])[metaPhase];
        if (!raw || (raw.buffed && raw.buffed.length && typeof raw.buffed[0] === 'string')) return null;
        return raw;
    })();
    $: affectedSquad = (() => {
        if (!currentMeta) return { buffed: {}, nerfed: {} };
        const all = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'].map(r => $squad[r]).filter(Boolean);
        const b = {}, n = {};
        for (const e of currentMeta.buffed || []) { const hit = all.filter(c => c.team === e.team); if (hit.length) b[e.team] = hit; }
        for (const e of currentMeta.nerfed || []) { const hit = all.filter(c => c.team === e.team); if (hit.length) n[e.team] = hit; }
        return { buffed: b, nerfed: n };
    })();
    $: buffedMine = Object.values(affectedSquad.buffed).reduce((s, a) => s + a.length, 0);
    $: nerfedMine = Object.values(affectedSquad.nerfed).reduce((s, a) => s + a.length, 0);
    const randRange = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    function generateMeta() {
        const db = getDB();
        if (!db) return [];
        const allTeams = [...new Set(db.map(c => c.team))];
        const phaseOf = () => {
            const s = [...allTeams].sort(() => Math.random() - 0.5);
            return { buffed: s.slice(0, 5).map(t => ({ team: t, amount: randRange(8, 20) })), nerfed: s.slice(5, 17).map(t => ({ team: t, amount: randRange(10, 30) })) };
        };
        return [phaseOf(), phaseOf()];
    }
    function getMetaModifier(card) {
        if (!currentMeta || !card) return 0;
        const buff = currentMeta.buffed?.find(b => b.team === card.team);
        if (buff) return buff.amount || 0;
        const nerf = currentMeta.nerfed?.find(x => x.team === card.team);
        return nerf ? -(nerf.amount || 0) : 0;
    }
    // What a play is resolved with: meta folded in, plus Tactics.
    $: myPlayStats = squadReady ? Object.fromEntries(STAT_KEYS.map(s => [s,
        Math.round(starters.reduce((sum, c) => sum + (getEffectiveStats(c)[s] || 0) + getMetaModifier(c), 0) / starters.length) + tacticsLevel])) : {};
    const statsOf = (team) => {
        const cards = Object.values(team?.cards || {}).filter(c => c && c.stats);
        return Object.fromEntries(STAT_KEYS.map(s => [s, cards.length ? Math.round(cards.reduce((a, c) => a + (c.stats[s] || 0), 0) / cards.length) : 0]));
    };
    const pct = (p) => (p >= 1 ? 100 : p <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(p * 100))));
    $: nextOdds = nextOpp && squadReady ? (() => {
        const st = statsOf(nextOpp);
        return seriesWinChance({ myPower: totalPower, cpuPower: nextOpp.avgRating, myStats: myPlayStats, cpuStatPool: PLAYS.map(p => st[p.stat] || 0), allStats: PLAYS.map(p => p.stat), offered: [], scoreBlue: 0, scoreRed: 0, winsNeeded: WINS_NEEDED });
    })() : null;
    $: nextLineup = nextOpp ? ['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => ({ role: r, card: nextOpp.cards?.[r] || null })) : [];

    // ── Bench swaps (the only squad change allowed once a split starts) ──
    $: benchLevel = $skills.bench || 0;
    $: benchPlayers = (Array.isArray($bench) ? $bench : []).filter(Boolean);
    $: canSwap = benchPlayers.length > 0;
    $: benchCandidates = (Array.isArray($bench) ? $bench : []).map((card, idx) => ({ card, idx })).filter(e => e.card);
    let showBenchPicker = false;
    let benchSwapRole = null;
    function openBenchPicker(role) { benchSwapRole = role; showBenchPicker = true; }
    function executeBenchSwap(idx) {
        if (!benchSwapRole) return;
        const benchCard = (Array.isArray($bench) ? $bench : [])[idx];
        if (!benchCard) return;
        const role = benchSwapRole;
        const currentCard = get(squad)[role];
        squad.update(s => ({ ...s, [role]: benchCard }));
        bench.update(b => { const n = [...b]; n[idx] = currentCard; return n; });
        seasonData.update(s => ({ ...s, swapsUsed: (s.swapsUsed || 0) + 1 }));
        showBenchPicker = false; benchSwapRole = null;
        saveGame();
        showToast(`Swapped ${benchCard.name} into ${role}.${currentCard ? ` ${currentCard.name} moved to bench.` : ''}`, 'success');
    }

    // ── Flow ──
    // The split only ever advances from an event handler (finishSeries) or onMount — NEVER from a
    // `$:` statement. A store update made inside a reactive statement lands after that update's
    // reactive declarations have already run, so `sd` / `po` keep the old values until the next
    // change: the first cut did that, and "To the bracket" opened an empty screen.
    // onMount is the safety net for a save that stopped between steps, or an old save converted
    // with every matchday already played.
    onMount(() => {
        const s = get(seasonData);
        if (s.stage === 'league' && leagueComplete(s.league)) finishLeague();
        else if (s.stage === 'playoffs' && s.playoffs?.champion) finishPlayoffs();
    });

    function beginSplit() {
        if (!squadReady) { showToast('Fill all 5 starting positions.', 'error'); return; }
        if (q) {
            openConfirmModal(`You qualified for ${q.eventName} and have not played it. Starting the next split gives up your spot — and with it this year's Golden Road. Start anyway?`, () => {
                recordTitle(q.event, q.year, false);
                seasonData.update(s => ({ ...s, qualified: { ...s.qualified, played: true, won: false, forfeited: true } }));
                startSplit();
            });
            return;
        }
        startSplit();
    }
    function startSplit() {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return; }
        const cur = get(seasonData);
        const lg = createLeague(buildCpuTeams(db, cur.currentSplit));
        seasonData.update(s => ({
            ...s, stage: 'league', league: lg, playoffs: null, summary: null,
            meta: generateMeta(), lockedSquad: JSON.parse(JSON.stringify(get(squad))), swapsUsed: 0,
            // A new year's Winter split opens a new Golden Road.
            goldenRoad: s.goldenRoad && s.goldenRoad.year === seasonYear(s.currentSplit) ? s.goldenRoad : grFresh(seasonYear(s.currentSplit), splitIndex(s.currentSplit) > 0),
        }));
        saveGame();
        playSound('claim');
        phase = 'league';
    }

    function startMatch() {
        if (!nextOpp || onCooldown) return;
        currentOpponent = nextOpp;
        matchCtx = nextFix ? { kind: 'league', round: nextFix.r } : { kind: mySeries.stage, round: null };
        playerScore = 0; cpuScore = 0; matchLog = [];
        revealing = false; pendingPhase = null;
        roundPlays = drawPlays(PLAYS, 3);
        phase = 'match';
    }

    // The match screen reveals each game before moving on; results are saved at once and only
    // the screen change waits.
    let revealing = false;
    let pendingPhase = null;
    function goPhase(p) { if (revealing) pendingPhase = p; else phase = p; }
    function onRevealed() { revealing = false; if (pendingPhase) { phase = pendingPhase; pendingPhase = null; } }

    const lineupOf = (cards) => ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH'].map(role => ({ role, card: (cards && cards[role]) || null, flex: false }));
    let blueSide = null, redSide = null;
    $: if (!revealing || !blueSide) blueSide = { name: $teamIdentity.name, logo: $teamIdentity.logo, power: totalPower, lineup: lineupOf($squad), stats: myPlayStats };
    $: if (!revealing || !redSide) redSide = currentOpponent ? { name: currentOpponent.name, logo: currentOpponent.tag === 'BOSS' ? '💀' : '🛡️', power: currentOpponent.avgRating, lineup: lineupOf(currentOpponent.cards), stats: statsOf(currentOpponent) } : null;
    $: metaChips = (() => {
        const out = [];
        if (currentOpponent?.tag) out.push({ text: currentOpponent.tag === 'BOSS' ? 'Boss opponent' : 'Hard opponent', tone: 'bad' });
        for (const [team, cards] of Object.entries(affectedSquad.buffed)) out.push({ text: `Meta buff · ${team} ×${cards.length}`, tone: 'good' });
        for (const [team, cards] of Object.entries(affectedSquad.nerfed)) out.push({ text: `Meta nerf · ${team} ×${cards.length}`, tone: 'bad' });
        return out;
    })();

    function pickPlay(play) {
        revealing = true;
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const tLvl = get(skills).tactics || 0;
        const myStatAvg = Math.round(starters.reduce((s, c) => s + (getEffectiveStats(c)[play.stat] || 0) + getMetaModifier(c), 0) / starters.length) + tLvl;
        const cpuCards = Object.values(currentOpponent.cards || {}).filter(Boolean);
        const cpuStatAvg = cpuCards.length ? Math.round(cpuCards.reduce((s, c) => s + (c.stats?.[cpuPlay.stat] || 0), 0) / cpuCards.length) : 0;
        const statEdge = myStatAvg - cpuStatAvg;
        const myRoll = Math.floor(Math.random() * 11) - 5;
        const cpuRoll = Math.floor(Math.random() * 11) - 5;
        const myFinal = totalPower + statEdge + myRoll;
        const cpuFinal = currentOpponent.avgRating + cpuRoll;
        const won = myFinal >= cpuFinal;
        if (won) playerScore++; else cpuScore++;
        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won, tacticsBonus: tLvl, myBase: totalPower, cpuBase: currentOpponent.avgRating, statEdge, myRoll, cpuRoll }];
        grantXP(20);
        roundPlays = drawPlays(PLAYS, 3);
        if (playerScore >= WINS_NEEDED || cpuScore >= WINS_NEEDED) finishSeries(playerScore >= WINS_NEEDED);
    }

    function finishSeries(matchWon) {
        grantXP(matchWon ? 150 : 60);
        grantBPXP(matchWon ? 75 : 25);
        playSound(matchWon ? 'win' : 'lose');
        if (matchCtx.kind === 'league') {
            seasonData.update(s => ({ ...s, league: recordMyMatch(s.league, matchCtx.round, playerScore, cpuScore) }));
        } else {
            seasonData.update(s => ({ ...s, playoffs: advancePlayoffs(s.playoffs, powerOf, { me: playerScore, them: cpuScore }) }));
        }
        trackStats.update(s => {
            const mp = { ...s.matchesPlayed };
            starters.forEach(c => { mp[c.name] = (mp[c.name] || 0) + 1; });
            return { ...s, matchesPlayed: mp };
        });
        logMatch({ mode: 'season', result: matchWon ? 'win' : 'loss', opponent: currentOpponent.name, be: 0, xp: matchWon ? 150 : 60 });
        lastMatch = { won: matchWon, me: playerScore, them: cpuScore, opp: currentOpponent.name, kind: matchCtx.kind, round: matchCtx.round };
        // Move the split on (league → playoffs → done) here, in the handler — see the note above onMount.
        const after = get(seasonData);
        if (after.stage === 'league' && leagueComplete(after.league)) finishLeague();
        else if (after.stage === 'playoffs' && after.playoffs?.champion) finishPlayoffs();
        saveGame();
        goPhase('matchResult');
    }

    const powerOf = (id) => (id === ME ? totalPower : ((get(seasonData).league?.teams || []).find(t => t.id === id)?.avgRating || 0));

    function finishLeague() {
        const s = get(seasonData);
        if (s.stage !== 'league' || !leagueComplete(s.league)) return;
        const tbl = standings(s.league, totalPower);
        const pos = tbl.findIndex(r => r.id === ME) + 1;
        const bracket = seedPlayoffs(tbl);
        if (pos <= PLAYOFF_SPOTS) {
            seasonData.update(x => ({ ...x, stage: 'playoffs', playoffs: bracket }));
        } else {
            // Missed the cut: the Regional Trophy is played out without you.
            const done = simulatePlayoffs(bracket, powerOf);
            seasonData.update(x => ({ ...x, playoffs: done }));
            concludeSplit();
        }
        saveGame();
    }
    function finishPlayoffs() {
        const s = get(seasonData);
        if (s.stage !== 'playoffs' || !s.playoffs?.champion) return;
        concludeSplit();
        saveGame();
    }
    /** The split is over: freeze the summary (rewards are claimed from the results screen) and
     *  record this split's Regional for the Golden Road. */
    function concludeSplit() {
        const s = get(seasonData);
        const tbl = standings(s.league, totalPower);
        const row = tbl.find(r => r.id === ME);
        const result = myPlayoffResult(s.playoffs);
        const info = splitInfo(s.currentSplit);
        const qualified = qualifiesFor(info, result) ? info.event : null;
        const perfect = row.w === MATCHDAYS;
        const champ = s.playoffs?.champion;
        const summary = {
            position: row.pos, w: row.w, l: row.l, playoff: result, qualified, perfect,
            champion: champ === ME ? $teamIdentity.name : (s.league.teams.find(t => t.id === champ)?.name || '—'),
            prize: splitPrize(row.pos, result, perfect),
        };
        seasonData.update(x => ({ ...x, stage: 'done', summary }));
        recordTitle(regionalKey(s.currentSplit), seasonYear(s.currentSplit), result === 'champion');
        if (result === 'champion') playSound('win');
    }

    function claimSplit() {
        const s = get(seasonData);
        const sum = s.summary;
        if (s.stage !== 'done' || !sum) return;
        const info = splitInfo(s.currentSplit);
        const outcome = splitOutcome(sum.position, sum.playoff);
        const { total: earned, bonus } = grantBE(sum.prize.total);
        trackStats.update(t => ({
            ...t,
            splitsCompleted: (t.splitsCompleted || 0) + 1,
            regionalSplitWon: (t.regionalSplitWon || 0) + (sum.playoff === 'champion' ? 1 : 0),
            tournamentsWon: (t.tournamentsWon || 0) + (sum.playoff === 'champion' ? 1 : 0),
            undefeatedSplits: (t.undefeatedSplits || 0) + (sum.perfect ? 1 : 0),
        }));
        seasonData.update(x => ({
            ...x,
            currentSplit: x.currentSplit + 1,
            stage: 'idle', league: null, playoffs: null, summary: null, meta: [], lockedSquad: null,
            qualified: sum.qualified ? { event: info.event, eventName: info.eventName, split: x.currentSplit, year: seasonYear(x.currentSplit), played: false, won: null } : x.qualified,
            trophyCase: [...(x.trophyCase || []), { split: x.currentSplit, name: info.name, year: seasonYear(x.currentSplit), wins: sum.w, losses: sum.l, position: sum.position, playoff: sum.playoff, title: outcome.title, reward: earned }],
        }));
        playSound('claim');
        showToast(`${outcome.title} — +${earned.toLocaleString()} BE${bonus > 0 ? ` (+${bonus} Wealth)` : ''}${sum.qualified ? ` · Qualified for ${info.eventName}!` : ''}`, 'success');
        saveGame();
        phase = 'overview';
    }

    function backFromMatch() {
        const s = get(seasonData);
        if (s.stage === 'done') { phase = 'results'; return; }
        startCooldown();
        phase = s.stage === 'playoffs' ? 'playoffs' : 'league';
    }
    function openCurrent() {
        phase = sd.stage === 'league' ? 'league' : sd.stage === 'playoffs' ? 'playoffs' : sd.stage === 'done' ? 'results' : 'overview';
    }

    // ── Overview helpers ──
    $: yearTrack = SPLITS.map((s, i) => ({ ...s, state: i < splitIdx ? 'done' : i === splitIdx ? 'now' : 'next' }));
    $: grSteps = GR_STEPS.map((st, i) => ({ ...st, state: i < gr.done.length ? 'done' : gr.broken ? 'broken' : i === gr.done.length ? 'next' : 'later' }));
    $: regionalCount = trophies.filter(t => t.playoff === 'champion' || (t.playoff === undefined && t.wins >= 6)).length;
    $: perfectCount = trophies.filter(t => (t.position !== undefined ? t.wins === MATCHDAYS : t.wins === 10)).length;
    $: totalEarned = trophies.reduce((s, t) => s + (t.reward || 0), 0);
    const outcomeStyle = (t) => {
        if (t.playoff === 'champion') return { ico: 'trophy', c: '#facc15' };
        if (t.playoff === 'runnerUp') return { ico: 'medal', c: '#cbd5e1' };
        if (t.playoff === 'semi') return { ico: 'target', c: '#60a5fa' };
        if (t.position !== undefined) return t.position <= 6 ? { ico: 'ranking', c: '#94a3b8' } : t.position <= 8 ? { ico: 'shield', c: '#fb923c' } : { ico: 'skull', c: '#f87171' };
        // Pre-format-2 entries: ten-match splits, judged on wins.
        return t.wins >= 9 ? { ico: 'crown', c: '#facc15' } : t.wins >= 6 ? { ico: 'check', c: '#34d399' } : t.wins >= 5 ? { ico: 'ranking', c: '#94a3b8' } : { ico: 'shield', c: '#fb923c' };
    };
    const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    $: matchdayResults = league && played > 0 ? (league.rounds[played - 1] || []).map(([a, b]) => ({ a: teamOf(a), b: teamOf(b), res: league.results.find(x => x.r === played - 1 && x.a === a && x.b === b) || league.results.find(x => x.r === played - 1 && x.a === b && x.b === a) })) : [];
    const scoreFor = (res, id) => (!res ? null : res.a === id ? res.sa : res.sb);
</script>

<section class="sn">
    {#if phase === 'overview'}
        <!-- ═══ Hero ═══ -->
        <header class="snh">
            <div class="snh-glow" aria-hidden="true"></div>
            <div class="snh-ring">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle class="ring-bg" cx="60" cy="60" r="52" />
                    <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {(sd.stage === 'idle' ? 0 : sd.stage === 'league' ? played / MATCHDAYS : 1) * 326.7} 999;" />
                </svg>
                {#if sd.stage === 'league' && myRow}
                    <span class="rg-n">{ordinal(myRow.pos)}</span><span class="rg-l">{myRow.w}–{myRow.l} · {played}/{MATCHDAYS}</span>
                {:else if sd.stage === 'playoffs'}
                    <span class="rg-n"><Icon name="flag" size={26} /></span><span class="rg-l">Regional</span>
                {:else if sd.stage === 'done'}
                    <span class="rg-n"><Icon name="gift" size={26} /></span><span class="rg-l">rewards</span>
                {:else}
                    <span class="rg-n">#{sd.currentSplit}</span><span class="rg-l">split</span>
                {/if}
            </div>
            <div class="snh-text">
                <span class="snh-eyebrow"><Icon name="calendar" size={12} stroke={2.2} /> Season · Year {year}</span>
                <h2 class="snh-title">{split.name} Split</h2>
                <p class="snh-sub">
                    {#if sd.stage === 'league'}Matchday {Math.min(played + 1, MATCHDAYS)} of {MATCHDAYS}. Finish top {PLAYOFF_SPOTS} for the Regional Trophy — {split.qualify === 1 ? 'its champion' : 'both its finalists'} go{split.qualify === 1 ? 'es' : ''} to {split.eventName}.
                    {:else if sd.stage === 'playoffs'}The table is done — you made the Regional Trophy. {split.qualify === 1 ? 'Win it' : 'Reach the final'} to go to {split.eventName}.
                    {:else if sd.stage === 'done'}The {split.name} split is over. Your rewards are waiting.
                    {:else}A ten-team league, everyone plays everyone once. The top {PLAYOFF_SPOTS} play the Regional Trophy, and {split.qualify === 1 ? 'its champion' : 'both finalists'} go{split.qualify === 1 ? 'es' : ''} to {split.eventName}.{/if}
                </p>
                <div class="year" aria-label="This year">
                    {#each yearTrack as y}
                        <span class="yr" class:yr-done={y.state === 'done'} class:yr-now={y.state === 'now'}><span class="yr-name">{y.name}</span><Icon name="arrow" size={10} stroke={2.6} /><span class="yr-ev"><Icon name={EVENT_ICONS[y.event]} size={11} stroke={2.4} /> {y.eventName}</span></span>
                    {/each}
                </div>
            </div>
            <div class="snh-cta">
                {#if sd.stage === 'idle'}
                    {#if !squadReady}
                        <button class="cta cta-warn" on:click={() => switchTab('squad')}>Build your squad <Icon name="arrow" size={16} /></button>
                        <span class="cta-note">Fill all five positions to start</span>
                    {:else}
                        <button class="cta" on:click={beginSplit} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name="play" size={15} stroke={2.2} /> Start {split.name} split</button>
                        <span class="cta-note">Your squad · {totalPower} power · locks for the split</span>
                    {/if}
                {:else if sd.stage === 'done'}
                    <button class="cta cta-claim" on:click={() => phase = 'results'} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}><Icon name="gift" size={16} stroke={2.2} /> Split results</button>
                    <span class="cta-note">Claim your rewards</span>
                {:else}
                    <button class="cta" on:click={openCurrent} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}>{sd.stage === 'playoffs' ? 'To the Regional Trophy' : 'Continue split'} <Icon name="arrow" size={16} /></button>
                    {#if nextOpp}<span class="cta-note">Next: {nextOpp.name} · {nextOpp.avgRating} power</span>{/if}
                {/if}
                {#if q}
                    <button class="cta cta-event" on:click={() => switchTab('tournament')} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name={EVENT_ICONS[q.event]} size={15} stroke={2.2} /> Play {q.eventName}</button>
                    <span class="cta-note cta-note-ev">You qualified — it's on the Play tab</span>
                {/if}
            </div>
        </header>

        <!-- ═══ Golden Road ═══ -->
        <section class="gold" class:gold-broken={gr.broken}>
            <div class="gold-head">
                <span class="gold-crown"><Icon name="crown" size={22} /></span>
                <div class="gold-text">
                    <span class="gold-title">Golden Road · Year {year}</span>
                    <span class="gold-sub">{gr.broken ? 'Gone for this year — it reopens with next year\'s Winter split.' : gr.done.length === GR_STEPS.length ? 'Completed!' : 'Win all six titles of the year, in order, for the road.'}</span>
                </div>
                <span class="gold-prize"><Icon name="gem" size={13} stroke={2.3} /> {GOLDEN_ROAD_PRIZE.toLocaleString()}{#if ($trackStats.goldenRoads || 0) > 0}<span class="gold-x">· done ×{$trackStats.goldenRoads}</span>{/if}</span>
            </div>
            <ol class="gold-steps">
                {#each grSteps as st, i}
                    <li class="gs" class:gs-done={st.state === 'done'} class:gs-next={st.state === 'next'} class:gs-broken={st.state === 'broken'}>
                        <span class="gs-box">{#if st.state === 'done'}<Icon name="check" size={14} stroke={3} />{:else if st.state === 'broken'}<Icon name="close" size={12} stroke={3} />{:else}<Icon name={st.icon} size={13} stroke={2.2} />{/if}</span>
                        <span class="gs-label">{st.label}</span>
                    </li>
                {/each}
            </ol>
        </section>

        <div class="sn-stats">
            <div class="ss" style="--c: #818cf8;"><span class="ss-ico"><Icon name="calendar" size={16} /></span><span class="ss-t"><span class="ss-n">{trophies.length}</span><span class="ss-l">Splits played</span></span></div>
            <div class="ss" style="--c: #34d399;"><span class="ss-ico"><Icon name="flag" size={16} /></span><span class="ss-t"><span class="ss-n">{$trackStats.regionalSplitWon || 0}</span><span class="ss-l">Regional trophies</span></span></div>
            <div class="ss" style="--c: #facc15;"><span class="ss-ico"><Icon name="trophy" size={16} /></span><span class="ss-t"><span class="ss-n">{($trackStats.firstStandWon || 0) + ($trackStats.msiWon || 0) + ($trackStats.worldsWon || 0)}</span><span class="ss-l">International titles</span></span></div>
            <div class="ss" style="--c: #38bdf8;"><span class="ss-ico"><Icon name="gem" size={16} /></span><span class="ss-t"><span class="ss-n">{totalEarned.toLocaleString()}</span><span class="ss-l">BE from splits</span></span></div>
        </div>

        <div class="sn-grid">
            <section class="panel">
                <div class="p-head">
                    <span class="p-ico" style="--c: #fbbf24;"><Icon name="trophy" size={15} /></span>
                    <span class="p-title">How a split works</span>
                </div>
                <ol class="how">
                    <li><span class="how-n">1</span><span><b>League</b> — 10 teams, everyone plays everyone once (best of 5). The table updates every matchday.</span></li>
                    <li><span class="how-n">2</span><span><b>Regional Trophy</b> — the top {PLAYOFF_SPOTS}: semi-finals 1 v 4 and 2 v 3, then the final.</span></li>
                    <li><span class="how-n">3</span><span><b>International</b> — Winter's champion goes to First Stand; Spring and Summer send both finalists to MSI and Worlds.</span></li>
                </ol>
                <div class="prizes">
                    <div class="pz-col">
                        <span class="pz-h">League finish</span>
                        {#each LEAGUE_PRIZES as p, i}<span class="pz-row" class:pz-cut={i === PLAYOFF_SPOTS - 1}><span>{ordinal(i + 1)}</span><b><Icon name="gem" size={10} stroke={2.4} /> {p.toLocaleString()}</b></span>{/each}
                    </div>
                    <div class="pz-col">
                        <span class="pz-h">Regional Trophy</span>
                        <span class="pz-row"><span>Champion</span><b><Icon name="gem" size={10} stroke={2.4} /> +{PLAYOFF_PRIZES.champion.toLocaleString()}</b></span>
                        <span class="pz-row"><span>Runner-up</span><b><Icon name="gem" size={10} stroke={2.4} /> +{PLAYOFF_PRIZES.runnerUp.toLocaleString()}</b></span>
                        <span class="pz-h pz-h2">Bonus</span>
                        <span class="pz-row"><span>Unbeaten 9–0</span><b><Icon name="gem" size={10} stroke={2.4} /> +{PERFECT_LEAGUE_BONUS.toLocaleString()}</b></span>
                    </div>
                </div>
            </section>

            <section class="panel">
                <div class="p-head">
                    <span class="p-ico" style="--c: #f59e0b;"><Icon name="medal" size={15} /></span>
                    <span class="p-title">Trophy case</span>
                    <span class="p-note">{trophies.length} split{trophies.length === 1 ? '' : 's'}</span>
                </div>
                {#if trophies.length === 0}
                    <div class="empty">
                        <span class="empty-ico"><Icon name="trophy" size={24} /></span>
                        <span class="empty-t">Nothing here yet</span>
                        <span class="empty-s">Every split you finish is kept here.</span>
                    </div>
                {:else}
                    <div class="trophies">
                        {#each [...trophies].reverse() as t}
                            {@const st = outcomeStyle(t)}
                            <div class="tr" style="--c: {st.c};">
                                <span class="tr-ico"><Icon name={st.ico} size={16} stroke={2.1} /></span>
                                <span class="tr-info">
                                    <span class="tr-name">{t.name} Split · Year {t.year}</span>
                                    <span class="tr-sub"><b>{t.title}</b> · {t.position ? `${ordinal(t.position)} · ` : ''}{t.wins}–{t.losses}</span>
                                </span>
                                <span class="tr-be">+{(t.reward || 0).toLocaleString()}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        </div>

    {:else if phase === 'league' && league}
        <!-- ═══ League ═══ -->
        <header class="sh">
            <div class="sh-nav">
                <button class="nav-btn" on:click={() => phase = 'overview'}><span class="flip"><Icon name="chevron" size={14} stroke={2.4} /></span> Season</button>
                <button class="nav-btn" on:click={() => switchTab('tournament')}><Icon name="play" size={12} stroke={2.4} /> Play menu</button>
            </div>
            <div class="sh-main">
                <div>
                    <span class="snh-eyebrow"><Icon name="calendar" size={12} stroke={2.2} /> {split.name} Split · Year {year}</span>
                    <h2 class="sh-title">League · Matchday {Math.min(played + 1, MATCHDAYS)} of {MATCHDAYS}</h2>
                    <p class="sh-sub">{#if myRow}<b class="w">{myRow.w}W</b> <b class="l">{myRow.l}L</b> · {ordinal(myRow.pos)} in the table · top {PLAYOFF_SPOTS} make the Regional Trophy{/if}</p>
                </div>
                <div class="pips" aria-label="Your results">
                    {#each myFixtures as f, i}
                        <span class="pip" class:pip-w={f?.result?.won} class:pip-l={f?.result && !f.result.won} class:pip-next={i === played} title="{i + 1}. {teamOf(f?.opponentId).name}">
                            {#if f?.result?.won}<Icon name="check" size={12} stroke={3} />{:else if f?.result}<Icon name="close" size={11} stroke={3} />{:else}{i + 1}{/if}
                        </span>
                    {/each}
                </div>
            </div>
        </header>

        {#if nextOpp}
            <section class="next" class:next-boss={nextOpp.tag === 'BOSS'} class:next-hard={nextOpp.tag === 'HARD'}>
                <div class="nx-left">
                    <span class="nx-kicker">Matchday {played + 1} · best of 5
                        {#if nextOpp.tag === 'BOSS'}<span class="tag tag-boss">Boss</span>{:else if nextOpp.tag === 'HARD'}<span class="tag tag-hard">Hard</span>{/if}
                    </span>
                    <h3 class="nx-name">{nextOpp.name}</h3>
                    <div class="nx-line">
                        {#each nextLineup as p}
                            <span class="nx-p" title="{p.role}: {p.card ? p.card.name : '—'}" style="--t: {p.card ? (TIER_COLORS[p.card.quality] || '#64748b') : '#334155'};"><img src={ROLE_ICONS[p.role]} alt={p.role}><b>{p.card ? p.card.rating : '–'}</b><span>{p.card ? p.card.name : '—'}</span></span>
                        {/each}
                    </div>
                </div>
                <div class="nx-vs">
                    <div class="nx-pw"><span class="nx-pw-n nx-me">{totalPower}</span><span class="nx-pw-l">You</span></div>
                    <span class="nx-x">vs</span>
                    <div class="nx-pw"><span class="nx-pw-n nx-them">{nextOpp.avgRating}</span><span class="nx-pw-l">Them</span></div>
                </div>
                <div class="nx-right">
                    {#if nextOdds !== null}
                        <div class="nx-odds"><span class="nx-odds-n" class:odds-good={nextOdds >= 0.6} class:odds-bad={nextOdds < 0.4}>{pct(nextOdds)}%</span><span class="nx-odds-l">to win the match</span><div class="nx-odds-bar"><div style="width: {pct(nextOdds)}%;"></div></div></div>
                    {/if}
                    {#if onCooldown}
                        <div class="nx-cd"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="cd-bg" cx="20" cy="20" r="17" /><circle class="cd-fg" cx="20" cy="20" r="17" style="stroke-dasharray: {(cooldownLeft / cooldownSecs) * 106.8} 999;" /></svg><span>Ready in <b>{cooldownLeft}s</b></span></div>
                    {:else}
                        <button class="cta cta-play" on:click={startMatch} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name="play" size={15} stroke={2.2} /> Play match</button>
                    {/if}
                </div>
            </section>
        {/if}

        <div class="lg-grid">
            <section class="panel">
                <div class="p-head">
                    <span class="p-ico" style="--c: #818cf8;"><Icon name="ranking" size={15} /></span>
                    <span class="p-title">Standings</span>
                    <span class="p-note">Top {PLAYOFF_SPOTS} → Regional Trophy</span>
                </div>
                <div class="tbl" role="table">
                    <div class="tr-row tr-head" role="row"><span>#</span><span>Team</span><span>W</span><span>L</span><span class="col-gd">Games</span><span class="col-form">Form</span><span class="col-pw">Power</span></div>
                    {#each table as row (row.id)}
                        {@const t = teamOf(row.id)}
                        <div class="tr-row" class:tr-me={row.id === ME} class:tr-cut={row.pos === PLAYOFF_SPOTS} class:tr-in={row.pos <= PLAYOFF_SPOTS} role="row">
                            <span class="c-pos">{row.pos}</span>
                            <span class="c-team">{row.id === ME ? $teamIdentity.name : t.name}{#if t.tag === 'BOSS'}<span class="tag tag-boss">Boss</span>{:else if t.tag === 'HARD'}<span class="tag tag-hard">Hard</span>{/if}</span>
                            <span class="c-w">{row.w}</span>
                            <span class="c-l">{row.l}</span>
                            <span class="col-gd">{row.gw}–{row.gl}</span>
                            <span class="col-form">{#each row.form as f}<span class="fm" class:fm-w={f === 'W'}>{f}</span>{/each}</span>
                            <span class="col-pw">{row.power}</span>
                        </div>
                    {/each}
                </div>
            </section>

            <div class="lg-side">
                <section class="panel">
                    <div class="p-head">
                        <span class="p-ico" style="--c: #a5b4fc;"><Icon name="calendar" size={15} /></span>
                        <span class="p-title">Your fixtures</span>
                    </div>
                    <div class="fx-list">
                        {#each myFixtures as f, i}
                            {@const opp = teamOf(f?.opponentId)}
                            <div class="fx" class:fx-win={f?.result?.won} class:fx-loss={f?.result && !f.result.won} class:fx-next={i === played}>
                                <span class="fx-num">{i + 1}</span>
                                <span class="fx-name">{opp.name}</span>
                                {#if opp.tag === 'BOSS'}<span class="tag tag-boss">Boss</span>{:else if opp.tag === 'HARD'}<span class="tag tag-hard">Hard</span>{/if}
                                {#if f?.result}<span class="fx-res" class:fx-res-w={f.result.won}>{f.result.sa}–{f.result.sb}</span>
                                {:else if i === played}<span class="fx-res fx-res-next">Next</span>
                                {:else}<span class="fx-pwr" class:fx-pwr-up={opp.avgRating > totalPower}>{opp.avgRating}</span>{/if}
                            </div>
                        {/each}
                    </div>
                </section>

                {#if matchdayResults.length}
                    <section class="panel">
                        <div class="p-head">
                            <span class="p-ico" style="--c: #34d399;"><Icon name="swords" size={15} /></span>
                            <span class="p-title">Matchday {played} results</span>
                        </div>
                        <div class="md">
                            {#each matchdayResults as m}
                                <div class="md-row" class:md-me={m.a.id === ME || m.b.id === ME}>
                                    <span class="md-t md-a" class:md-win={m.res && scoreFor(m.res, m.a.id) > scoreFor(m.res, m.b.id)}>{m.a.name}</span>
                                    <span class="md-score">{m.res ? `${scoreFor(m.res, m.a.id)}–${scoreFor(m.res, m.b.id)}` : 'vs'}</span>
                                    <span class="md-t md-b" class:md-win={m.res && scoreFor(m.res, m.b.id) > scoreFor(m.res, m.a.id)}>{m.b.name}</span>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
            </div>
        </div>

        <!-- Meta + bench -->
        <section class="panel">
            <div class="p-head">
                <span class="p-ico" style="--c: #a78bfa;"><Icon name="trend" size={15} /></span>
                <span class="p-title">Team meta</span>
                <span class="p-note">{#if currentMeta}Phase {metaPhase + 1} of 2 · {metaPhase === 0 ? 'changes after matchday 5' : 'through the playoffs'}{/if}</span>
            </div>
            {#if currentMeta}
                <p class="meta-sum">Real teams are in and out of form this split, and it moves your players' stats in every play.
                    {#if buffedMine || nerfedMine}Your squad: {#if buffedMine}<b class="w">{buffedMine} buffed</b>{/if}{buffedMine && nerfedMine ? ' · ' : ''}{#if nerfedMine}<b class="l">{nerfedMine} slumping</b>{/if}.{:else}None of your players are affected right now.{/if}</p>
                <div class="meta-cols">
                    <div class="meta-col">
                        <div class="mc-label mc-buff"><Icon name="trend" size={12} stroke={2.4} /> In form</div>
                        {#each currentMeta.buffed as e}
                            {@const mine = affectedSquad.buffed[e.team] || []}
                            <div class="mt mt-buff" class:mt-mine={mine.length}><div class="mt-head"><span class="mt-name">{e.team}</span><span class="mt-amt">+{e.amount}</span></div>{#if mine.length}<div class="mt-players">{#each mine as c}<span class="mt-p">{c.role} · {c.name}</span>{/each}</div>{/if}</div>
                        {/each}
                    </div>
                    <div class="meta-col">
                        <div class="mc-label mc-nerf"><span class="flipv"><Icon name="trend" size={12} stroke={2.4} /></span> Slumping</div>
                        {#each currentMeta.nerfed as e}
                            {@const mine = affectedSquad.nerfed[e.team] || []}
                            <div class="mt mt-nerf" class:mt-mine={mine.length}><div class="mt-head"><span class="mt-name">{e.team}</span><span class="mt-amt">−{e.amount}</span></div>{#if mine.length}<div class="mt-players">{#each mine as c}<span class="mt-p">{c.role} · {c.name}</span>{/each}</div>{/if}</div>
                        {/each}
                    </div>
                </div>
            {:else}
                <p class="meta-sum">No meta for this split.</p>
            {/if}
            <div class="swap">
                <div class="swap-head"><Icon name="lock" size={13} stroke={2.3} /> Squad locked for this split
                    {#if canSwap}<span class="swap-ok">{benchPlayers.length} bench player{benchPlayers.length > 1 ? 's' : ''} ready</span>
                    {:else if benchLevel > 0}<span class="swap-hint">Add bench players in Squad Builder to swap mid-split.</span>
                    {:else}<span class="swap-hint">Unlock bench slots with Bench Management.</span>{/if}
                </div>
                {#if canSwap}
                    <div class="swap-btns">
                        {#each ['TOP', 'JNG', 'MID', 'ADC', 'SUP'] as role}
                            <button class="swap-btn" on:click={() => openBenchPicker(role)}><img src={ROLE_ICONS[role]} alt=""><span class="sw-text"><span class="sw-role">{role}</span><span class="sw-name">{$squad[role]?.name || 'Empty'}</span></span><Icon name="trade" size={13} stroke={2.2} /></button>
                        {/each}
                    </div>
                {/if}
            </div>
        </section>

    {:else if phase === 'playoffs' && po}
        <!-- ═══ Regional Trophy ═══ -->
        <header class="sh sh-gold">
            <div class="sh-nav">
                <button class="nav-btn" on:click={() => phase = 'overview'}><span class="flip"><Icon name="chevron" size={14} stroke={2.4} /></span> Season</button>
                {#if league}<button class="nav-btn" on:click={() => phase = 'league'}><Icon name="ranking" size={12} stroke={2.4} /> Final table</button>{/if}
            </div>
            <div class="sh-main">
                <div>
                    <span class="snh-eyebrow snh-eyebrow-gold"><Icon name="flag" size={12} stroke={2.2} /> {split.name} Split · Year {year}</span>
                    <h2 class="sh-title">Regional Trophy</h2>
                    <p class="sh-sub">Best of 5 · the champion wins {PLAYOFF_PRIZES.champion.toLocaleString()} BE · {split.qualify === 1 ? 'only the champion' : 'both finalists'} go{split.qualify === 1 ? 'es' : ''} to <b>{split.eventName}</b></p>
                </div>
            </div>
        </header>

        <div class="bracket">
            <div class="br-col">
                <span class="br-h">Semi-finals</span>
                {#each po.semis as m, i}
                    {@const A = teamOf(m.a)}
                    {@const B = teamOf(m.b)}
                    <div class="br-m" class:br-mine={m.a === ME || m.b === ME}>
                        <div class="br-t" class:br-win={m.sa !== null && m.sa > m.sb} class:br-lose={m.sa !== null && m.sa < m.sb}><span class="br-seed">{po.seeds.indexOf(m.a) + 1}</span><span class="br-name">{A.id === ME ? $teamIdentity.name : A.name}</span><span class="br-s">{m.sa ?? ''}</span></div>
                        <div class="br-t" class:br-win={m.sb !== null && m.sb > m.sa} class:br-lose={m.sb !== null && m.sb < m.sa}><span class="br-seed">{po.seeds.indexOf(m.b) + 1}</span><span class="br-name">{B.id === ME ? $teamIdentity.name : B.name}</span><span class="br-s">{m.sb ?? ''}</span></div>
                    </div>
                {/each}
            </div>
            <div class="br-link" aria-hidden="true"></div>
            <div class="br-col br-col-final">
                <span class="br-h">Final</span>
                {#if po.final}
                    {@const A = teamOf(po.final.a)}
                    {@const B = teamOf(po.final.b)}
                    <div class="br-m br-m-final" class:br-mine={po.final.a === ME || po.final.b === ME}>
                        <div class="br-t" class:br-win={po.final.sa !== null && po.final.sa > po.final.sb} class:br-lose={po.final.sa !== null && po.final.sa < po.final.sb}><span class="br-name">{A.id === ME ? $teamIdentity.name : A.name}</span><span class="br-s">{po.final.sa ?? ''}</span></div>
                        <div class="br-t" class:br-win={po.final.sb !== null && po.final.sb > po.final.sa} class:br-lose={po.final.sb !== null && po.final.sb < po.final.sa}><span class="br-name">{B.id === ME ? $teamIdentity.name : B.name}</span><span class="br-s">{po.final.sb ?? ''}</span></div>
                    </div>
                {:else}
                    <div class="br-m br-m-tbd"><span>Winners of the semi-finals</span></div>
                {/if}
                {#if po.champion}<span class="br-champ"><Icon name="trophy" size={14} /> {teamOf(po.champion).id === ME ? $teamIdentity.name : teamOf(po.champion).name}</span>{/if}
            </div>
        </div>

        {#if nextOpp && mySeries}
            <section class="next next-gold">
                <div class="nx-left">
                    <span class="nx-kicker">{mySeries.stage === 'final' ? 'The final' : 'Semi-final'} · best of 5</span>
                    <h3 class="nx-name">{nextOpp.name}</h3>
                    <div class="nx-line">
                        {#each nextLineup as p}
                            <span class="nx-p" style="--t: {p.card ? (TIER_COLORS[p.card.quality] || '#64748b') : '#334155'};"><img src={ROLE_ICONS[p.role]} alt={p.role}><b>{p.card ? p.card.rating : '–'}</b><span>{p.card ? p.card.name : '—'}</span></span>
                        {/each}
                    </div>
                </div>
                <div class="nx-vs">
                    <div class="nx-pw"><span class="nx-pw-n nx-me">{totalPower}</span><span class="nx-pw-l">You</span></div>
                    <span class="nx-x">vs</span>
                    <div class="nx-pw"><span class="nx-pw-n nx-them">{nextOpp.avgRating}</span><span class="nx-pw-l">Them</span></div>
                </div>
                <div class="nx-right">
                    {#if nextOdds !== null}
                        <div class="nx-odds"><span class="nx-odds-n" class:odds-good={nextOdds >= 0.6} class:odds-bad={nextOdds < 0.4}>{pct(nextOdds)}%</span><span class="nx-odds-l">to win the series</span><div class="nx-odds-bar"><div style="width: {pct(nextOdds)}%;"></div></div></div>
                    {/if}
                    {#if onCooldown}
                        <div class="nx-cd"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="cd-bg" cx="20" cy="20" r="17" /><circle class="cd-fg" cx="20" cy="20" r="17" style="stroke-dasharray: {(cooldownLeft / cooldownSecs) * 106.8} 999;" /></svg><span>Ready in <b>{cooldownLeft}s</b></span></div>
                    {:else}
                        <button class="cta cta-play cta-gold" on:click={startMatch} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name="play" size={15} stroke={2.2} /> Play {mySeries.stage === 'final' ? 'the final' : 'semi-final'}</button>
                    {/if}
                </div>
            </section>
        {/if}

    {:else if phase === 'results' && sd.summary}
        {@const sum = sd.summary}
        {@const oc = splitOutcome(sum.position, sum.playoff)}
        <MatchResult
            outcome={sum.playoff === 'champion' ? 'gold' : sum.playoff ? 'win' : sum.position <= 6 ? 'neutral' : 'lose'}
            kicker={`${split.name} Split · Year ${year}`}
            title={oc.title}
            subtitle={`${ordinal(sum.position)} in the table at ${sum.w}–${sum.l}${sum.playoff ? '' : ' — out of the Regional Trophy'}. ${sum.playoff === 'champion' ? 'You won the Regional Trophy.' : `${sum.champion} won the Regional Trophy.`}${sum.qualified ? ` You're going to ${split.eventName}!` : ''}`}
            icon={oc.ico}
            rewards={[
                { label: `BE · ${ordinal(sum.position)} place`, value: `+${sum.prize.league.toLocaleString()}`, tone: 'be' },
                ...(sum.prize.playoff ? [{ label: `BE · ${sum.playoff === 'champion' ? 'Regional champion' : 'Runner-up'}`, value: `+${sum.prize.playoff.toLocaleString()}`, tone: 'be' }] : []),
                ...(sum.prize.perfect ? [{ label: 'BE · unbeaten league', value: `+${sum.prize.perfect.toLocaleString()}`, tone: 'be' }] : []),
                ...(sum.playoff === 'champion' ? [{ label: 'Regional Trophy', value: '+1', tone: 'good' }] : []),
                ...(sum.qualified ? [{ label: `Qualified for ${split.eventName}`, value: '✓', tone: 'good' }] : []),
            ]}
        >
            <button class="mr-btn" on:click={claimSplit}>Claim rewards <Icon name="arrow" size={15} /></button>
            {#if league}<button class="mr-btn-ghost" on:click={() => phase = 'league'}>Final table</button>{/if}
        </MatchResult>

    {:else if phase === 'match' && currentOpponent && blueSide && redSide}
        <MatchArena
            title={matchCtx?.kind === 'league' ? `${split.name} Split · League` : 'Regional Trophy'}
            subtitle={matchCtx?.kind === 'league' ? `Matchday ${matchCtx.round + 1} of ${MATCHDAYS}` : matchCtx?.kind === 'final' ? 'The final' : 'Semi-final'}
            accent={matchCtx?.kind === 'league' ? '#818cf8' : '#fbbf24'}
            icon={matchCtx?.kind === 'league' ? 'calendar' : 'flag'}
            blue={blueSide}
            red={redSide}
            plays={roundPlays}
            allPlays={PLAYS}
            scoreBlue={playerScore}
            scoreRed={cpuScore}
            winsNeeded={WINS_NEEDED}
            log={matchLog}
            tactics={tacticsLevel}
            chips={metaChips}
            on:pick={(e) => pickPlay(e.detail)}
            on:revealed={onRevealed}
        />

    {:else if phase === 'matchResult' && lastMatch}
        {@const s2 = $seasonData}
        {@const rowNow = s2.league ? standings(s2.league, totalPower).find(r => r.id === ME) : null}
        <MatchResult
            outcome={lastMatch.won ? 'win' : 'lose'}
            kicker={lastMatch.kind === 'league' ? `${split.name} Split · Matchday ${lastMatch.round + 1}` : `Regional Trophy · ${lastMatch.kind === 'final' ? 'Final' : 'Semi-final'}`}
            title={lastMatch.kind === 'final' ? (lastMatch.won ? 'Regional champions!' : 'Beaten in the final') : lastMatch.won ? 'Match won' : 'Match lost'}
            subtitle={lastMatch.kind === 'league' && rowNow ? `${ordinal(rowNow.pos)} in the table at ${rowNow.w}–${rowNow.l}${s2.stage === 'playoffs' ? ' — through to the Regional Trophy!' : s2.stage === 'done' ? ' — the league is over' : ''}` : s2.stage === 'done' ? 'The split is over.' : 'On to the final.'}
            icon={lastMatch.won ? 'trophy' : 'shield'}
            blueName={$teamIdentity.name}
            redName={lastMatch.opp}
            scoreBlue={lastMatch.me}
            scoreRed={lastMatch.them}
            rewards={[{ label: 'XP', value: `+${lastMatch.won ? 150 : 60}`, tone: 'xp' }, { label: 'Battle Pass XP', value: `+${lastMatch.won ? 75 : 25}`, tone: 'xp' }]}
        >
            <button class="mr-btn" on:click={backFromMatch}>
                {s2.stage === 'done' ? 'Split results' : s2.stage === 'playoffs' ? 'To the bracket' : 'Back to the table'} <Icon name="arrow" size={15} />
            </button>
        </MatchResult>

    {:else}
        <div class="empty">
            <span class="empty-ico"><Icon name="calendar" size={24} /></span>
            <span class="empty-t">Nothing to show here</span>
            <button class="cta cta-sm" on:click={() => phase = 'overview'}>Back to Season</button>
        </div>
    {/if}

    {#if showBenchPicker}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="bp-over" on:click={() => { showBenchPicker = false; }}>
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <div class="bp" on:click|stopPropagation role="dialog" aria-label="Swap with bench">
                <div class="bp-head">
                    <span class="bp-role"><img src={ROLE_ICONS[benchSwapRole]} alt=""></span>
                    <span class="bp-titles"><span class="bp-title">Swap your {benchSwapRole}</span><span class="bp-sub">Out: {$squad[benchSwapRole]?.name || 'empty slot'} · they move to the bench</span></span>
                    <button class="bp-x" aria-label="Close" on:click={() => { showBenchPicker = false; }}><Icon name="close" size={14} stroke={2.6} /></button>
                </div>
                {#if benchCandidates.length === 0}
                    <div class="bp-empty">No players on your bench. Add them in Squad Builder.</div>
                {:else}
                    <div class="bp-list">
                        {#each benchCandidates as entry}
                            <button class="bp-row" style="--t: {TIER_COLORS[entry.card.quality] || '#64748b'};" on:click={() => executeBenchSwap(entry.idx)}>
                                <img src={ROLE_ICONS[entry.card.role]} alt={entry.card.role} class="bp-ri">
                                <span class="bp-rating">{entry.card.rating}</span>
                                <span class="bp-info"><span class="bp-name">{entry.card.name}</span><span class="bp-meta">{entry.card.team} · {entry.card.year} · {entry.card.role}{entry.card.role !== benchSwapRole ? ' (off-role)' : ''}</span></span>
                                <span class="bp-q">{entry.card.quality}</span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</section>

<style>
    .sn { display: flex; flex-direction: column; gap: 16px; max-width: 1400px; margin: 0 auto; padding-bottom: 40px; }

    /* ── Hero ── */
    .snh { position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; padding: 22px 26px; border-radius: 24px; background: radial-gradient(60% 140% at 0% 50%, rgba(129,140,248,0.18), transparent 65%), linear-gradient(120deg, #0f1027, #0b0e1a 60%); border: 1px solid rgba(129,140,248,0.28); }
    .snh-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(56,189,248,0.12), transparent 65%); }
    .snh-ring { position: relative; width: 112px; height: 112px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #c7d2fe; }
    .snh-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 10; }
    .ring-fg { fill: none; stroke: #818cf8; stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(129,140,248,0.6)); transition: stroke-dasharray 0.6s ease; }
    .rg-n { position: relative; font-size: 24px; font-weight: 900; color: #eef2ff; line-height: 1; font-variant-numeric: tabular-nums; display: flex; }
    .rg-l { position: relative; font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
    .snh-text { position: relative; flex: 1; min-width: 260px; }
    .snh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #818cf8; }
    .snh-eyebrow-gold { color: #fbbf24; }
    .snh-title { font-size: clamp(26px, 3.2vw, 36px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .snh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 600px; }
    .year { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
    .yr { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 100px; font-size: 11px; font-weight: 800; color: #475569; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.3); }
    .yr-ev { display: inline-flex; align-items: center; gap: 4px; }
    .yr-done { color: #94a3b8; border-color: rgba(129,140,248,0.25); }
    .yr-now { color: #0b1020; background: #a5b4fc; border-color: #a5b4fc; }
    .snh-cta { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 7px; }
    .cta-note { font-size: 11px; color: #64748b; font-weight: 700; text-align: right; }
    .cta-note-ev { color: #fbbf24; }
    .cta { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 24px; border-radius: 14px; cursor: pointer; font-size: 14px; font-weight: 900; color: #fff; border: none; background: linear-gradient(135deg, #6366f1, #818cf8); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
    .cta:hover { transform: translateY(-1px); }
    .cta-warn { color: #1c1404; background: linear-gradient(135deg, #fcd34d, #f59e0b); box-shadow: 0 8px 24px rgba(245,158,11,0.3); }
    .cta-claim { color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 8px 24px rgba(16,185,129,0.4); animation: claimPulse 2.2s ease-in-out infinite; }
    .cta-event, .cta-gold { color: #1c1404; background: linear-gradient(135deg, #fde68a, #f59e0b); box-shadow: 0 8px 24px rgba(245,158,11,0.35); }
    .cta-event { animation: evPulse 2.2s ease-in-out infinite; margin-top: 4px; }
    @keyframes claimPulse { 50% { box-shadow: 0 8px 32px rgba(16,185,129,0.7); } }
    @keyframes evPulse { 50% { box-shadow: 0 8px 32px rgba(245,158,11,0.65); } }
    .cta-sm { padding: 10px 18px; font-size: 13px; margin-top: 8px; }
    .cta-play { width: 100%; }

    /* ── Golden Road ── */
    .gold { padding: 16px 18px; border-radius: 20px; background: radial-gradient(60% 160% at 0% 50%, rgba(251,191,36,0.14), transparent 60%), rgba(20,16,8,0.6); border: 1px solid rgba(251,191,36,0.3); }
    .gold-broken { filter: saturate(0.4); opacity: 0.8; }
    .gold-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .gold-crown { width: 40px; height: 40px; border-radius: 13px; display: flex; align-items: center; justify-content: center; color: #1c1404; background: linear-gradient(135deg, #fde68a, #f59e0b); }
    .gold-text { flex: 1; min-width: 200px; display: flex; flex-direction: column; }
    .gold-title { font-size: 15px; font-weight: 900; color: #fef3c7; }
    .gold-sub { font-size: 12px; color: #a8a29e; }
    .gold-prize { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 900; color: #fde68a; }
    .gold-x { color: #a8a29e; font-weight: 700; margin-left: 4px; }
    .gold-steps { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; list-style: none; }
    .gs { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: rgba(2,6,23,0.45); border: 1px solid rgba(120,113,108,0.3); }
    .gs-box { width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #78716c; background: rgba(41,37,36,0.8); }
    .gs-label { font-size: 12px; font-weight: 800; color: #a8a29e; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gs-done { border-color: rgba(251,191,36,0.5); background: rgba(251,191,36,0.1); }
    .gs-done .gs-box { color: #1c1404; background: #fbbf24; }
    .gs-done .gs-label { color: #fde68a; }
    .gs-next { border-color: rgba(251,191,36,0.6); box-shadow: 0 0 0 3px rgba(251,191,36,0.1); }
    .gs-next .gs-box { color: #fbbf24; background: rgba(251,191,36,0.15); }
    .gs-next .gs-label { color: #fef3c7; }
    .gs-broken .gs-box { color: #f87171; }
    .gs-broken .gs-label { text-decoration: line-through; color: #78716c; }

    /* Stat tiles */
    .sn-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .ss { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 18px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .ss-ico { width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .ss-t { display: flex; flex-direction: column; min-width: 0; }
    .ss-n { font-size: 22px; font-weight: 900; color: #f1f5f9; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .ss-l { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }

    /* Panels */
    .sn-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .panel { padding: 16px; border-radius: 20px; background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25); }
    .p-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; flex-wrap: wrap; }
    .p-ico { width: 30px; height: 30px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .p-title { font-size: 13px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #e2e8f0; }
    .p-note { margin-left: auto; font-size: 11px; font-weight: 700; color: #64748b; }
    .how { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .how li { display: flex; gap: 10px; font-size: 12.5px; color: #94a3b8; line-height: 1.45; }
    .how b { color: #e2e8f0; }
    .how-n { width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fbbf24; background: rgba(251,191,36,0.12); }
    .prizes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .pz-col { display: flex; flex-direction: column; gap: 3px; }
    .pz-h { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .pz-h2 { margin-top: 8px; }
    .pz-row { display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; padding: 3px 8px; border-radius: 7px; background: rgba(15,23,42,0.5); }
    .pz-row b { display: inline-flex; align-items: center; gap: 4px; color: #7dd3fc; font-variant-numeric: tabular-nums; }
    .pz-cut { box-shadow: inset 0 -2px 0 rgba(251,191,36,0.5); }
    .trophies { display: flex; flex-direction: column; gap: 5px; max-height: 470px; overflow-y: auto; }
    .tr { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 12px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .tr-ico { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); }
    .tr-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .tr-name { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .tr-sub { font-size: 11px; color: #64748b; }
    .tr-sub b { color: var(--c); font-weight: 800; }
    .tr-be { font-size: 13px; font-weight: 900; color: #6ee7b7; font-variant-numeric: tabular-nums; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 36px 16px; text-align: center; border-radius: 16px; border: 1px dashed rgba(71,85,105,0.4); }
    .empty-ico { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #818cf8; background: rgba(129,140,248,0.1); border: 1px solid rgba(129,140,248,0.25); margin-bottom: 4px; }
    .empty-t { font-size: 15px; font-weight: 900; color: #e2e8f0; }
    .empty-s { font-size: 12px; color: #64748b; max-width: 320px; }

    /* ── League header ── */
    .sh { display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 18px; border-radius: 22px; background: radial-gradient(60% 160% at 0% 0%, rgba(129,140,248,0.14), transparent 60%), rgba(12,16,28,0.7); border: 1px solid rgba(129,140,248,0.25); }
    .sh-gold { background: radial-gradient(60% 160% at 0% 0%, rgba(251,191,36,0.16), transparent 60%), rgba(20,16,8,0.7); border-color: rgba(251,191,36,0.35); }
    .sh-nav { display: flex; gap: 6px; flex-wrap: wrap; }
    .nav-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 800; color: #94a3b8; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.35); }
    .nav-btn:hover { color: #fff; border-color: rgba(129,140,248,0.5); }
    .flip { display: inline-flex; transform: scaleX(-1); }
    .flipv { display: inline-flex; transform: scaleY(-1); }
    .sh-main { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .sh-title { font-size: clamp(22px, 2.8vw, 30px); font-weight: 900; color: #fff; margin-top: 4px; }
    .sh-sub { font-size: 13px; color: #94a3b8; margin-top: 2px; }
    .sh-sub b { color: #fde68a; }
    .w { color: #34d399; font-weight: 900; }
    .l { color: #f87171; font-weight: 900; }
    .pips { display: flex; gap: 5px; flex-wrap: wrap; }
    .pip { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #475569; background: rgba(2,6,23,0.55); border: 1px solid rgba(71,85,105,0.35); }
    .pip-w { color: #052e16; background: #34d399; border-color: #34d399; }
    .pip-l { color: #fff; background: #ef4444; border-color: #ef4444; }
    .pip-next { color: #fff; border-color: #818cf8; background: rgba(99,102,241,0.35); box-shadow: 0 0 0 3px rgba(129,140,248,0.2); }

    /* ── Next match ── */
    .next { display: grid; grid-template-columns: minmax(0, 1.5fr) auto minmax(220px, 0.8fr); align-items: center; gap: 20px; padding: 20px 22px; border-radius: 22px; background: radial-gradient(70% 140% at 100% 50%, rgba(239,68,68,0.1), transparent 60%), radial-gradient(70% 140% at 0% 50%, rgba(59,130,246,0.12), transparent 60%), rgba(12,16,28,0.75); border: 1px solid rgba(129,140,248,0.3); }
    .next-hard { border-color: rgba(245,158,11,0.45); }
    .next-boss { border-color: rgba(239,68,68,0.55); background: radial-gradient(70% 140% at 100% 50%, rgba(239,68,68,0.2), transparent 60%), rgba(20,10,14,0.8); }
    .next-gold { border-color: rgba(251,191,36,0.45); background: radial-gradient(70% 140% at 0% 50%, rgba(251,191,36,0.14), transparent 60%), rgba(20,16,8,0.75); }
    .nx-left { min-width: 0; }
    .nx-kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #818cf8; }
    .next-gold .nx-kicker { color: #fbbf24; }
    .nx-name { font-size: clamp(22px, 2.6vw, 30px); font-weight: 900; color: #fff; margin-top: 4px; }
    .nx-line { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
    .nx-p { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 7px; border-radius: 10px; font-size: 11px; color: #94a3b8; background: rgba(2,6,23,0.55); border: 1px solid rgba(71,85,105,0.3); border-left: 3px solid var(--t); max-width: 170px; }
    .nx-p img { width: 14px; height: 14px; opacity: 0.75; }
    .nx-p b { color: #f1f5f9; font-weight: 900; font-variant-numeric: tabular-nums; }
    .nx-p span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 700; }
    .nx-vs { display: flex; align-items: center; gap: 14px; }
    .nx-pw { display: flex; flex-direction: column; align-items: center; }
    .nx-pw-n { font-size: 34px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
    .nx-me { color: #60a5fa; }
    .nx-them { color: #f87171; }
    .nx-pw-l { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
    .nx-x { font-size: 12px; font-weight: 900; color: #475569; text-transform: uppercase; }
    .nx-right { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
    .nx-odds { display: flex; flex-direction: column; }
    .nx-odds-n { font-size: 28px; font-weight: 900; color: #e2e8f0; line-height: 1; font-variant-numeric: tabular-nums; }
    .odds-good { color: #34d399; }
    .odds-bad { color: #f87171; }
    .nx-odds-l { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 2px; }
    .nx-odds-bar { height: 5px; border-radius: 5px; margin-top: 7px; background: rgba(239,68,68,0.35); overflow: hidden; }
    .nx-odds-bar div { height: 100%; border-radius: 5px; background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .nx-cd { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px; font-size: 13px; color: #fcd34d; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); }
    .nx-cd svg { width: 34px; height: 34px; transform: rotate(-90deg); flex-shrink: 0; }
    .nx-cd b { color: #fff; font-variant-numeric: tabular-nums; }
    .cd-bg { fill: none; stroke: rgba(245,158,11,0.2); stroke-width: 4; }
    .cd-fg { fill: none; stroke: #f59e0b; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 1s linear; }
    .tag { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px; border-radius: 6px; margin-left: 6px; }
    .tag-hard { color: #fbbf24; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); }
    .tag-boss { color: #fca5a5; background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.45); }

    /* ── League body ── */
    .lg-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .lg-side { display: flex; flex-direction: column; gap: 16px; }
    .tbl { display: flex; flex-direction: column; gap: 3px; }
    .tr-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 30px 30px 56px 70px 48px; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 10px; font-size: 13px; color: #cbd5e1; background: rgba(15,23,42,0.5); border: 1px solid transparent; font-variant-numeric: tabular-nums; }
    .tr-head { background: none; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #64748b; padding-top: 0; padding-bottom: 4px; }
    .tr-in .c-pos { color: #fbbf24; }
    .tr-cut { box-shadow: 0 2px 0 rgba(251,191,36,0.55); margin-bottom: 4px; }
    .tr-me { border-color: rgba(96,165,250,0.6); background: rgba(37,99,235,0.18); color: #fff; }
    .c-pos { font-weight: 900; color: #64748b; text-align: center; }
    .c-team { font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .c-w { font-weight: 900; color: #6ee7b7; text-align: center; }
    .c-l { font-weight: 900; color: #fca5a5; text-align: center; }
    .col-gd { text-align: center; color: #94a3b8; font-size: 12px; }
    .col-form { display: flex; gap: 2px; justify-content: center; }
    .fm { width: 18px; height: 18px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 900; color: #fff; background: #b91c1c; }
    .fm-w { background: #059669; }
    .col-pw { text-align: right; font-weight: 800; color: #94a3b8; }
    .tr-head .col-pw { color: #64748b; }
    .fx-list { display: flex; flex-direction: column; gap: 4px; }
    .fx { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 11px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .fx-num { width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #64748b; background: rgba(2,6,23,0.5); }
    .fx-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 800; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fx-pwr { font-size: 12px; font-weight: 900; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .fx-pwr-up { color: #f87171; }
    .fx-res { min-width: 48px; text-align: center; font-size: 12px; font-weight: 900; padding: 3px 8px; border-radius: 8px; color: #fca5a5; background: rgba(239,68,68,0.12); font-variant-numeric: tabular-nums; }
    .fx-res-w { color: #6ee7b7; background: rgba(52,211,153,0.12); }
    .fx-res-next { color: #c7d2fe; background: rgba(99,102,241,0.2); }
    .fx-win { border-color: rgba(52,211,153,0.2); }
    .fx-win .fx-num { color: #052e16; background: #34d399; }
    .fx-loss { border-color: rgba(239,68,68,0.2); }
    .fx-loss .fx-num { color: #fff; background: #ef4444; }
    .fx-next { border-color: rgba(129,140,248,0.55); background: rgba(99,102,241,0.12); }
    .fx-next .fx-num { color: #fff; background: #6366f1; }
    .md { display: flex; flex-direction: column; gap: 4px; }
    .md-row { display: grid; grid-template-columns: minmax(0, 1fr) 50px minmax(0, 1fr); align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; font-size: 12px; background: rgba(15,23,42,0.5); }
    .md-me { background: rgba(37,99,235,0.15); }
    .md-t { color: #94a3b8; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .md-a { text-align: right; }
    .md-win { color: #f1f5f9; font-weight: 900; }
    .md-score { text-align: center; font-weight: 900; color: #e2e8f0; font-variant-numeric: tabular-nums; }

    /* Meta + swaps */
    .meta-sum { font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 12px; }
    .meta-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .meta-col { display: flex; flex-direction: column; gap: 5px; }
    .mc-label { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 2px; }
    .mc-buff { color: #34d399; }
    .mc-nerf { color: #f87171; }
    .mt { padding: 7px 10px; border-radius: 10px; border: 1px solid transparent; }
    .mt-buff { background: rgba(16,185,129,0.06); border-color: rgba(16,185,129,0.12); }
    .mt-nerf { background: rgba(239,68,68,0.05); border-color: rgba(239,68,68,0.1); }
    .mt-mine.mt-buff { border-color: rgba(52,211,153,0.55); background: rgba(16,185,129,0.14); }
    .mt-mine.mt-nerf { border-color: rgba(248,113,113,0.55); background: rgba(239,68,68,0.13); }
    .mt-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
    .mt-name { font-size: 12px; font-weight: 800; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mt-amt { font-size: 12px; font-weight: 900; font-variant-numeric: tabular-nums; }
    .mt-buff .mt-amt { color: #34d399; }
    .mt-nerf .mt-amt { color: #f87171; }
    .mt-players { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
    .mt-p { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 6px; color: #fff; background: rgba(2,6,23,0.5); }
    .swap { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(51,65,85,0.3); }
    .swap-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; font-weight: 800; color: #fbbf24; }
    .swap-ok { color: #34d399; font-weight: 700; }
    .swap-hint { color: #64748b; font-weight: 600; }
    .swap-btns { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin-top: 10px; }
    .swap-btn { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 11px; cursor: pointer; text-align: left; color: #5eead4; background: rgba(20,184,166,0.08); border: 1px solid rgba(20,184,166,0.28); }
    .swap-btn:hover { background: rgba(20,184,166,0.18); border-color: rgba(45,212,191,0.6); }
    .swap-btn img { width: 16px; height: 16px; }
    .sw-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .sw-role { font-size: 10px; font-weight: 900; letter-spacing: 1px; color: #5eead4; }
    .sw-name { font-size: 12px; font-weight: 800; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ── Bracket ── */
    .bracket { display: grid; grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr); align-items: center; gap: 10px; padding: 18px; border-radius: 22px; background: rgba(12,16,28,0.6); border: 1px solid rgba(251,191,36,0.2); }
    .br-col { display: flex; flex-direction: column; gap: 12px; }
    .br-col-final { justify-content: center; }
    .br-h { font-size: 10px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #fbbf24; }
    .br-m { display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; border: 1px solid rgba(71,85,105,0.35); background: rgba(2,6,23,0.55); }
    .br-mine { border-color: rgba(96,165,250,0.65); box-shadow: 0 0 0 3px rgba(96,165,250,0.12); }
    .br-m-final { border-color: rgba(251,191,36,0.55); }
    .br-m-tbd { padding: 22px 14px; text-align: center; font-size: 12px; color: #64748b; border-style: dashed; }
    .br-t { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 13px; color: #cbd5e1; }
    .br-t + .br-t { border-top: 1px solid rgba(51,65,85,0.4); }
    .br-seed { width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fbbf24; background: rgba(251,191,36,0.12); }
    .br-name { flex: 1; min-width: 0; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .br-s { font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums; min-width: 14px; text-align: right; }
    .br-win { color: #fff; background: rgba(52,211,153,0.1); }
    .br-win .br-s { color: #34d399; }
    .br-lose { color: #64748b; }
    .br-link { height: 2px; background: linear-gradient(90deg, rgba(251,191,36,0.1), rgba(251,191,36,0.5)); }
    .br-champ { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 6px 12px; border-radius: 100px; font-size: 12px; font-weight: 900; color: #1c1404; background: linear-gradient(135deg, #fde68a, #f59e0b); }

    /* Bench picker */
    .bp-over { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.78); backdrop-filter: blur(8px); }
    .bp { width: 100%; max-width: 460px; max-height: 80vh; overflow-y: auto; padding: 18px; border-radius: 20px; background: linear-gradient(170deg, #0d1224, #0a0f1c); border: 1px solid rgba(71,85,105,0.35); box-shadow: 0 25px 80px rgba(0,0,0,0.6); }
    .bp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .bp-role { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(45,212,191,0.12); border: 1px solid rgba(45,212,191,0.35); }
    .bp-role img { width: 20px; height: 20px; }
    .bp-titles { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .bp-title { font-size: 16px; font-weight: 900; color: #fff; }
    .bp-sub { font-size: 11px; color: #64748b; }
    .bp-x { width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94a3b8; background: rgba(51,65,85,0.35); border: 1px solid rgba(71,85,105,0.3); }
    .bp-x:hover { color: #fca5a5; background: rgba(239,68,68,0.18); }
    .bp-empty { text-align: center; padding: 30px; color: #64748b; font-size: 12px; }
    .bp-list { display: flex; flex-direction: column; gap: 6px; }
    .bp-row { position: relative; overflow: hidden; display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 15px; border-radius: 12px; cursor: pointer; text-align: left; background: rgba(15,23,42,0.6); border: 1px solid rgba(71,85,105,0.35); }
    .bp-row::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--t); }
    .bp-row:hover { border-color: rgba(45,212,191,0.6); background: rgba(20,184,166,0.08); }
    .bp-ri { width: 18px; height: 18px; opacity: 0.8; }
    .bp-rating { font-size: 18px; font-weight: 900; color: #f1f5f9; min-width: 28px; font-variant-numeric: tabular-nums; }
    .bp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .bp-name { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .bp-meta { font-size: 10px; color: #64748b; }
    .bp-q { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: var(--t); }

    @media (max-width: 1100px) {
        .next { grid-template-columns: 1fr auto; }
        .nx-right { grid-column: 1 / -1; flex-direction: row; align-items: center; }
        .nx-odds { flex: 1; }
        .cta-play { width: auto; }
        .gold-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) {
        .sn-grid, .lg-grid { grid-template-columns: 1fr; }
        .sn-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .snh-cta { align-items: flex-start; width: 100%; }
        .cta-note { text-align: left; }
        .bracket { grid-template-columns: 1fr; }
        .br-link { display: none; }
    }
    @media (max-width: 600px) {
        .snh { padding: 18px; gap: 16px; }
        .snh-ring { width: 90px; height: 90px; }
        .rg-n { font-size: 19px; }
        .gold-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ss { padding: 12px; gap: 10px; }
        .ss-n { font-size: 19px; }
        .next { grid-template-columns: 1fr; padding: 16px; }
        .nx-vs { justify-content: flex-start; }
        .nx-right { flex-direction: column; align-items: stretch; }
        .cta-play { width: 100%; }
        .pips { gap: 4px; }
        .pip { width: 30px; height: 30px; border-radius: 8px; }
        .meta-cols { grid-template-columns: 1fr; }
        .tr-row { grid-template-columns: 22px minmax(0, 1fr) 24px 24px 44px; font-size: 12px; padding: 7px 8px; }
        .col-form, .col-pw { display: none; }
        .prizes { grid-template-columns: 1fr; }
    }
</style>
