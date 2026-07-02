<script>
    import Card from '../card/Card.svelte';
    import { club, squad, blueEssence, trackStats, unlocks, skills, grantXP, grantBPXP, grantBE, saveGame } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab } from '../../stores/ui.js';
    import { getDB, makeUniqueId, LEGACY_TIERS, getEffectiveStats, getEffectiveRating, getEra } from '../../utils/cards.js';
    import { playSound } from '../../utils/sound.js';
    import { get } from 'svelte/store';

    let phase = 'lobby';
    let activeMode = null;
    let round = 0;
    let enemies = [];
    let currentEnemy = null;
    let matchLog = [];

    // Salary Cap Mode state
    const SALARY_BUDGET = 50000;
    let salarySquad = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
    let salaryPool = [];
    let salaryPickingRole = null;
    let salarySearch = '';
    let _originalSquad = null;

    function salaryValue(rating) { return Math.max(0, (rating - 60) * 500); }
    $: salaryUsed = Object.values(salarySquad).filter(Boolean).reduce((s, c) => s + salaryValue(c.rating), 0);
    $: salaryRemaining = SALARY_BUDGET - salaryUsed;
    $: salaryComplete = ['TOP','JNG','MID','ADC','SUP'].every(r => salarySquad[r]);
    $: salaryCardPool = (() => {
        const q = salarySearch.toLowerCase();
        const roleOrder = ['TOP','JNG','MID','ADC','SUP'];
        let cards = salaryPool.filter(c => !q || c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q));
        if (salaryPickingRole) return cards.filter(c => c.role === salaryPickingRole).sort((a,b) => b.rating - a.rating);
        return cards.sort((a,b) => { const ri = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role); return ri !== 0 ? ri : b.rating - a.rating; });
    })();

    function startSalaryCap() {
        salarySquad = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
        salaryPickingRole = null;
        salarySearch = '';
        const nonCoach = get(club).filter(c => c.role !== 'COACH');
        const shuffled = [...nonCoach].sort(() => Math.random() - 0.5);
        salaryPool = shuffled.slice(0, 15);
        phase = 'salary_lobby';
    }

    function clickPoolCard(card) {
        const isAssigned = Object.values(salarySquad).some(c => c && c.uniqueId === card.uniqueId);
        if (isAssigned) {
            const newSquad = { ...salarySquad };
            for (const r of ['TOP','JNG','MID','ADC','SUP']) {
                if (newSquad[r] && newSquad[r].uniqueId === card.uniqueId) { newSquad[r] = null; break; }
            }
            salarySquad = newSquad;
            return;
        }
        const role = salaryPickingRole || card.role;
        if (!['TOP','JNG','MID','ADC','SUP'].includes(role)) { showToast('Select a role slot first.', 'info'); return; }
        const val = salaryValue(card.rating);
        const currentInRoleVal = salarySquad[role] ? salaryValue(salarySquad[role].rating) : 0;
        const isInOtherSlot = Object.values(salarySquad).some(c => c && c.uniqueId === card.uniqueId);
        const freedVal = isInOtherSlot ? val : 0;
        if (salaryUsed - currentInRoleVal - freedVal + val > SALARY_BUDGET) { showToast('Over budget! Choose a lower-rated player.', 'error'); return; }
        const newSquad = { ...salarySquad };
        for (const r of ['TOP','JNG','MID','ADC','SUP']) {
            if (newSquad[r] && newSquad[r].uniqueId === card.uniqueId) newSquad[r] = null;
        }
        newSquad[role] = card;
        salarySquad = newSquad;
        salaryPickingRole = null;
    }

    function generateSalaryCpuTeam() {
        const db = getDB();
        if (!db) return generateCpuTeam('worlds', 2);
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        let remaining = SALARY_BUDGET;
        const team = {};
        roles.forEach((role, i) => {
            const slotsLeft = roles.length - i;
            const maxForSlot = Math.floor(remaining / slotsLeft);
            const pool = db.filter(p => p.role === role && p.rating >= 65 && salaryValue(p.rating) <= maxForSlot)
                .sort((a, b) => b.rating - a.rating);
            if (pool.length > 0) {
                const pick = pool[Math.floor(Math.random() * Math.min(6, pool.length))];
                team[role] = pick;
                remaining -= salaryValue(pick.rating);
            } else {
                const fallback = db.filter(p => p.role === role && salaryValue(p.rating) <= remaining)
                    .sort((a, b) => b.rating - a.rating)[0];
                if (fallback) { team[role] = fallback; remaining -= salaryValue(fallback.rating); }
            }
        });
        const cards = Object.values(team).filter(Boolean);
        const rawAvg = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : 75;
        return { name: 'Cap Challenger', cards: team, avgRating: rawAvg };
    }

    function startSalaryTournament() {
        if (!salaryComplete) { showToast('Fill all 5 positions first.', 'error'); return; }
        _originalSquad = get(squad);
        squad.set({ ...salarySquad, COACH: _originalSquad.COACH });
        activeMode = 'salarycap';
        enemies = [];
        for (let i = 0; i < 5; i++) enemies.push(generateSalaryCpuTeam());
        round = 0; roundResults = []; tournamentResult = null; matchLog = [];
        phase = 'bracket';
    }

    // Rival Challenge state
    let rivals = [];
    let rivalsLoading = false;

    async function loadRivals() {
        rivalsLoading = true;
        rivals = [];
        if (window.fbDb) {
            try {
                const snap = await window.fbDb.collection('leaderboard').orderBy('trophies', 'desc').limit(20).get();
                const myUid = window.fbAuth?.currentUser?.uid;
                snap.forEach(doc => {
                    if (doc.id === myUid) return;
                    const d = doc.data();
                    rivals.push({ id: doc.id, displayName: d.displayName || 'Unknown', teamName: d.teamName || 'Team', teamLogo: d.teamLogo || '🛡️', totalPower: d.totalPower || 0, trophies: d.trophies || 0, squadData: d.squadData || null });
                });
            } catch(e) {}
        }
        rivalsLoading = false;
        rivals = rivals;
    }

    function startRivalChallenge(rival) {
        const db = getDB();
        if (!db || !squadReady) { showToast('Fill your squad first.', 'error'); return; }
        const rivalCards = rival.squadData;
        let cpuTeam = {};
        if (rivalCards && Object.keys(rivalCards).length >= 4) {
            const roles = ['TOP','JNG','MID','ADC','SUP','COACH'];
            roles.forEach(role => {
                const rc = rivalCards[role];
                if (rc) {
                    const dbCard = db.find(c => c.id === rc.id) || rc;
                    cpuTeam[role] = { ...dbCard, ...(rc.signature ? { signature: true } : {}), ...(rc.holographic ? { holographic: true } : {}) };
                }
            });
        }
        if (Object.keys(cpuTeam).length < 4) {
            const fallback = generateCpuTeam('worlds', 2);
            cpuTeam = fallback.cards;
        }
        const enemyPower = rival.totalPower || (() => {
            const cards = Object.values(cpuTeam).filter(Boolean);
            return cards.length > 0 ? Math.round(cards.reduce((s, c) => s + (c.rating || 90), 0) / cards.length) : 90;
        })();
        const rivalEnemy = { name: `${rival.teamLogo} ${rival.teamName}`, cards: cpuTeam, avgRating: enemyPower };
        activeMode = 'rival';
        enemies = [rivalEnemy, rivalEnemy, rivalEnemy, rivalEnemy, rivalEnemy];
        round = 0; roundResults = []; tournamentResult = null; matchLog = [];
        phase = 'bracket';
        showToast(`Rival Challenge vs ${rival.displayName}! BO5 — First to 3 wins`, 'info');
    }
    let playerScore = 0;
    let cpuScore = 0;
    let grCooldownEnd = 0;
    let grCooldownLeft = 0;
    let grTimer = null;

    import { onDestroy } from 'svelte';

    function startGRCooldown() {
        grCooldownEnd = Date.now() + 30 * 60 * 1000;
        localStorage.setItem('lur_gr_cooldown', String(grCooldownEnd));
        updateGRCooldown();
        if (grTimer) clearInterval(grTimer);
        grTimer = setInterval(updateGRCooldown, 1000);
    }
    function updateGRCooldown() {
        const r = Math.max(0, Math.ceil((grCooldownEnd - Date.now()) / 1000));
        grCooldownLeft = r;
        if (r <= 0 && grTimer) { clearInterval(grTimer); grTimer = null; }
    }
    function initGRCooldown() {
        const saved = localStorage.getItem('lur_gr_cooldown');
        if (saved) {
            grCooldownEnd = Number(saved);
            if (grCooldownEnd > Date.now()) {
                updateGRCooldown();
                grTimer = setInterval(updateGRCooldown, 1000);
            }
        }
    }
    initGRCooldown();
    onDestroy(() => { if (grTimer) clearInterval(grTimer); });

    $: grOnCooldown = grCooldownLeft > 0;
    $: grCooldownDisplay = (() => {
        const m = Math.floor(grCooldownLeft / 60);
        const s = grCooldownLeft % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    })();
    let roundResults = [];
    let tournamentResult = null;
    let goldenRoadStage = 0;

    const PLAYS = [
        { id: 'mec', label: 'Mechanical', stat: 'mec', icon: '⚡' },
        { id: 'tmf', label: 'Teamfight', stat: 'tmf', icon: '🔥' },
        { id: 'map', label: 'Macro', stat: 'map', icon: '🗺️' },
        { id: 'frm', label: 'Form', stat: 'frm', icon: '📈' },
        { id: 'cmp', label: 'Composure', stat: 'cmp', icon: '🧊' },
    ];
    let roundPlays = [];
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
    $: conditioningBonus = $skills.conditioning || 0;
    $: chemBonus = regionChem + eraChem + teamChem + coachBonus + legacyBonus + conditioningBonus;
    $: totalPower = squadReady ? avgRating + chemBonus : 0;
    $: matchWinsNeeded = activeMode === 'rival' ? 3 : 2;
    $: tacticsLevel = $skills.tactics || 0;
    $: powerDiff = currentEnemy ? totalPower - (currentEnemy.avgRating || 0) : 0;

    $: myStatAvgs = squadReady ? (() => {
        try { const r = {}; ['mec','tmf','map','frm','cmp'].forEach(s => { r[s] = Math.round(starters.reduce((sum, c) => sum + (getEffectiveStats(c)[s]||0), 0) / starters.length) + tacticsLevel; }); return r; } catch(e) { return {}; }
    })() : {};
    $: cpuStatAvgs = currentEnemy ? (() => {
        try { const cards = Object.values(currentEnemy.cards || {}).filter(c => c && c.stats && c.role !== 'COACH'); const r = {}; ['mec','tmf','map','frm','cmp'].forEach(s => { r[s] = cards.length > 0 ? Math.round(cards.reduce((sum, c) => sum + (c.stats[s]||0), 0) / cards.length) : 0; }); return r; } catch(e) { return {}; }
    })() : {};

    // Unlock conditions
    $: ts = $trackStats;
    $: canRegional = (ts.splitsCompleted || 0) >= 1;
    $: canFirstStand = (ts.regionalSplitWon || 0) >= 1;
    $: canMSI = ($unlocks.firstStand || (ts.firstStandWon || 0) >= 1 || (ts.regionalSplitWon || 0) >= 1);
    $: canWorlds = ($unlocks.msi || (ts.regionalSplitWon || 0) >= 1);
    $: canGoldenRoad = canRegional;

    const MODES = {
        cafe: { name: 'Gaming Cafe', icon: '☕', rounds: 3, minRating: 55, maxRating: 78, pool: 'regular', cpuBonus: 0, reward: 300, second: 150, color: '#10b981' },
        regional: { name: 'Regional Trophy', icon: '🏟️', rounds: 5, minRating: 70, maxRating: 90, pool: 'all', cpuBonus: 3, reward: 1500, second: 500, color: '#3b82f6', statKey: 'regionalSplitWon' },
        firststand: { name: 'First Stand', icon: '🟠', rounds: 5, minRating: 85, maxRating: 98, pool: 'elite', cpuBonus: 10, reward: 3000, second: 1000, color: '#f97316', statKey: 'firstStandWon' },
        msi: { name: 'MSI', icon: '🌊', rounds: 7, minRating: 90, maxRating: 99, pool: 'elite', cpuBonus: 15, reward: 5000, second: 2000, color: '#06b6d4', statKey: 'msiWon' },
        worlds: { name: 'World Championship', icon: '🏆', rounds: 7, minRating: 93, maxRating: 99, pool: 'elite', cpuBonus: 20, reward: 10000, second: 4000, color: '#f59e0b', statKey: 'worldsWon' },
        salarycap: { name: 'Salary Cap', icon: '💰', rounds: 5, minRating: 85, maxRating: 99, pool: 'elite', cpuBonus: 18, reward: 8000, second: 3000, color: '#34d399' },
        rival: { name: 'Rival Challenge', icon: '⚔️', rounds: 5, minRating: 88, maxRating: 99, pool: 'elite', cpuBonus: 15, reward: 3000, second: 1000, color: '#f59e0b' },
    };

    const GOLDEN_STAGES = ['regional', 'firststand', 'msi', 'worlds'];

    function generateCpuTeam(mode, roundIdx) {
        const db = getDB();
        if (!db) return null;
        const m = MODES[mode];
        const rating = m.minRating + Math.round((m.maxRating - m.minRating) * (roundIdx / Math.max(1, m.rounds - 1)));
        const ratingCap = m.maxRating;
        let pool;
        if (m.pool === 'regular') pool = db.filter(p => p.role !== 'COACH' && ['Bronze','Silver','Gold'].includes(p.quality));
        else if (m.pool === 'elite') pool = db.filter(p => p.role !== 'COACH');
        else pool = db.filter(p => p.role !== 'COACH' && !['POTY','ROTY','TOTY','GPOTY','X'].includes(p.quality));
        pool = pool.filter(p => p.rating <= ratingCap + 3);
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const team = {};
        const used = new Set();
        roles.forEach(role => {
            let rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= rating - 5 && p.rating <= rating + 3);
            if (rp.length < 3) rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating <= ratingCap + 3).sort((a,b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating)).slice(0, 8);
            const cut = Math.max(1, Math.min(rp.length, 5));
            const pick = rp[Math.floor(Math.random() * cut)];
            if (pick) { team[role] = pick; used.add(pick.id); }
        });
        const cards = Object.values(team);
        const rawAvg = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : rating;
        const roundBonus = Math.round((m.cpuBonus || 0) * ((roundIdx + 1) / m.rounds));
        const grStageBonus = activeMode === 'goldenroad' ? goldenRoadStage * 5 : 0;
        const totalAvg = rawAvg + roundBonus + grStageBonus;
        const names = ['Iron Wolves','Silver Fangs','Bronze Legion','Rookie Squad','Cafe Regulars','Local Heroes','Storm Dragons','Crystal Bears','Dark Knights','Solar Flare','Frost Giants','Thunder Hawks','Crimson Vipers','Neon Tigers','Iron Phoenix'];
        return { name: names[Math.floor(Math.random() * names.length)], cards: team, avgRating: totalAvg };
    }

    function startTournament(mode) {
        if (!squadReady) { showToast('Fill all 5 positions first.', 'error'); return; }
        activeMode = mode;
        const m = MODES[mode];
        enemies = [];
        for (let i = 0; i < m.rounds; i++) enemies.push(generateCpuTeam(mode, i));
        round = 0;
        roundResults = [];
        tournamentResult = null;
        matchLog = [];
        phase = 'bracket';
    }

    function startGoldenRoad() {
        if (!squadReady) { showToast('Fill all 5 positions first.', 'error'); return; }
        activeMode = 'goldenroad';
        goldenRoadStage = 0;
        const mode = GOLDEN_STAGES[0];
        const m = MODES[mode];
        enemies = [];
        for (let i = 0; i < m.rounds; i++) enemies.push(generateCpuTeam(mode, i));
        round = 0;
        roundResults = [];
        tournamentResult = null;
        matchLog = [];
        phase = 'bracket';
    }

    function startMatch() {
        currentEnemy = enemies[round];
        playerScore = 0;
        cpuScore = 0;
        matchLog = [];
        rollRoundPlays();
        phase = 'match';
    }

    function pickPlay(play) {
        const cpuPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)];
        const tLvl = get(skills).tactics || 0;
        const myStatAvg = Math.round(starters.reduce((s, c) => s + (getEffectiveStats(c)[play.stat] || 0), 0) / starters.length) + tLvl;
        const cpuCards = Object.values(currentEnemy.cards).filter(c => c && c.role !== 'COACH');
        const cpuStatAvg = cpuCards.length > 0 ? Math.round(cpuCards.reduce((s, c) => s + (c.stats?.[cpuPlay.stat] || 0), 0) / cpuCards.length) : 0;
        const statEdge = myStatAvg - cpuStatAvg;
        const myRoll = Math.floor(Math.random() * 11) - 5;
        const cpuRoll = Math.floor(Math.random() * 11) - 5;
        const myFinal = totalPower + statEdge + myRoll;
        const cpuFinal = currentEnemy.avgRating + cpuRoll;
        const won = myFinal >= cpuFinal;
        if (won) playerScore++; else cpuScore++;
        matchLog = [...matchLog, { myPlay: play, cpuPlay, myVal: myFinal, cpuVal: cpuFinal, won, tacticsBonus: tLvl, myBase: totalPower, cpuBase: currentEnemy.avgRating, statEdge, myRoll, cpuRoll }];
        grantXP(25);
        rollRoundPlays();

        const winsNeeded = activeMode === 'rival' ? 3 : 2;
        if (playerScore >= winsNeeded || cpuScore >= winsNeeded) {
            const matchWon = playerScore >= winsNeeded;
            roundResults = [...roundResults, matchWon];
            if (activeMode === 'rival') {
                const mw = roundResults.filter(Boolean).length;
                const ml = roundResults.filter(r => !r).length;
                if (mw >= 3) { endTournament(true); }
                else if (ml >= 3) { endTournament(false); }
                else { phase = 'roundEnd'; }
            } else if (!matchWon) {
                endTournament(false);
            } else if (round >= enemies.length - 1) {
                endTournament(true);
            } else {
                phase = 'roundEnd';
            }
        }
    }

    function nextRound() { round++; phase = 'bracket'; matchLog = []; }

    function endTournament(won) {
        if (activeMode === 'salarycap' && _originalSquad) { squad.set(_originalSquad); _originalSquad = null; }
        const mode = activeMode === 'goldenroad' ? GOLDEN_STAGES[goldenRoadStage] : activeMode;
        const m = MODES[mode];
        const isFinalist = !won && round >= enemies.length - 2;

        if (activeMode === 'goldenroad') {
            if (!won) {
                trackStats.update(s => ({ ...s, losses: (s.losses || 0) + 1 }));
                grantXP(100);
                playSound('lose');
                tournamentResult = { won: false, reward: 0, round: round + 1, isFinalist: false, goldenRoadFailed: true, stage: goldenRoadStage };
                phase = 'result';
                startGRCooldown();
                saveGame();
                return;
            }
            if (goldenRoadStage < GOLDEN_STAGES.length - 1) {
                goldenRoadStage++;
                const nextMode = GOLDEN_STAGES[goldenRoadStage];
                const nm = MODES[nextMode];
                enemies = [];
                for (let i = 0; i < nm.rounds; i++) enemies.push(generateCpuTeam(nextMode, i));
                round = 0; roundResults = []; matchLog = [];
                showToast(`Golden Road: Advancing to ${nm.name}!`, 'success');
                phase = 'bracket';
                return;
            }
            // Won the whole Golden Road!
            const { total: grTotal, bonus: grBonus } = grantBE(25000);
            grantXP(2000);
            trackStats.update(s => ({ ...s, tournamentsWon: (s.tournamentsWon||0)+1, goldenRoads: (s.goldenRoads||0)+1, worldsWon: (s.worldsWon||0)+1 }));
            playSound('win');
            tournamentResult = { won: true, reward: grTotal, bonus: grBonus, goldenRoad: true };
            phase = 'result';
            startGRCooldown();
            saveGame();
            return;
        }

        const baseReward = won ? m.reward : isFinalist ? m.second : 0;
        const { total: reward, bonus: rewardBonus } = grantBE(baseReward);

        const xpTable = { cafe: 100, regional: 200, firststand: 300, msi: 500, worlds: 800 };
        const bpTable = { cafe: 50, regional: 100, firststand: 150, msi: 200, worlds: 300 };
        grantXP(won ? (xpTable[mode] || 100) : Math.round((xpTable[mode] || 100) * 0.4));
        grantBPXP(won ? (bpTable[mode] || 50) : Math.round((bpTable[mode] || 50) * 0.3));

        if (won) {
            trackStats.update(s => {
                const u = { ...s, tournamentsWon: (s.tournamentsWon||0)+1 };
                if (m.statKey) u[m.statKey] = (s[m.statKey]||0) + 1;
                if (mode === 'cafe') u.cafeWins = (s.cafeWins||0) + 1;
                if (mode === 'salarycap') u.salaryCapWins = (s.salaryCapWins||0) + 1;
                if (mode === 'rival') u.rivalWins = (s.rivalWins||0) + 1;
                return u;
            });
            if (mode === 'firststand') unlocks.update(u => ({ ...u, firstStand: true }));
            if (mode === 'msi') unlocks.update(u => ({ ...u, msi: true }));
            if (mode === 'worlds') unlocks.update(u => ({ ...u, worlds: true }));
            playSound('win');
        } else {
            trackStats.update(s => ({ ...s, losses: (s.losses||0)+1 }));
            if (isFinalist && mode === 'regional') unlocks.update(u => ({ ...u, firstStand: true }));
            if (isFinalist && mode === 'firststand') unlocks.update(u => ({ ...u, msi: true }));
            playSound('lose');
        }

        saveGame();
        tournamentResult = { won, reward, bonus: rewardBonus || 0, round: round + 1, isFinalist };
        phase = 'result';
    }

    function backToLobby() {
        if (_originalSquad) { squad.set(_originalSquad); _originalSquad = null; }
        phase = 'lobby'; activeMode = null; tournamentResult = null; enemies = []; matchLog = [];
    }

    $: currentModeName = activeMode === 'goldenroad' ? `Golden Road — ${MODES[GOLDEN_STAGES[goldenRoadStage]]?.name || ''}` : (MODES[activeMode]?.name || '');
    $: currentModeColor = activeMode === 'goldenroad' ? '#fbbf24' : (MODES[activeMode]?.color || '#10b981');
</script>

<section class="trn">
    {#if phase === 'lobby'}
        <div class="trn-head">
            <h2 class="trn-title">Competitive Arenas</h2>
            <p class="trn-desc">Test your roster against CPU opponents. Win tournaments to unlock higher tiers.</p>
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
            <button class="mode-enter-btn" style="background: linear-gradient(135deg, #3b82f6, #6366f1);">Open Season →</button>
        </div>

        <!-- Mode Cards -->
        <div class="modes-list">
            <!-- Gaming Cafe -->
            <div class="mode-row" style="border-color: {MODES.cafe.color}20;">
                <span class="mode-icon">☕</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: {MODES.cafe.color};">Gaming Cafe Tournament</h3>
                    <p class="mode-sub">3 rounds · CPU capped at Gold · Free Entry</p>
                    <div class="mode-prizes"><span class="mp-w">Win: {MODES.cafe.reward} BE</span><span class="mp-l">2nd: {MODES.cafe.second} BE</span></div>
                </div>
                {#if squadReady}
                    <button class="mode-enter-btn" style="background: {MODES.cafe.color};" on:click={() => startTournament('cafe')}>Enter</button>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>

            <!-- Regional -->
            <div class="mode-row" class:mode-locked={!canRegional} style="border-color: {MODES.regional.color}20;">
                <span class="mode-icon">🏟️</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: {canRegional ? MODES.regional.color : '#334155'};">Regional Trophy</h3>
                    <p class="mode-sub">{canRegional ? '5 rounds · Mixed tiers' : 'Complete 1 Season Split to unlock'}</p>
                    {#if canRegional}<div class="mode-prizes"><span class="mp-w">Win: {MODES.regional.reward} BE</span><span class="mp-l">2nd: {MODES.regional.second} BE</span></div>{/if}
                </div>
                {#if canRegional && squadReady}
                    <button class="mode-enter-btn" style="background: {MODES.regional.color};" on:click={() => startTournament('regional')}>Enter</button>
                {:else if !canRegional}<span class="mode-lock-badge">🔒</span>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>

            <!-- First Stand -->
            <div class="mode-row" class:mode-locked={!canFirstStand} style="border-color: {MODES.firststand.color}20;">
                <span class="mode-icon">🟠</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: {canFirstStand ? MODES.firststand.color : '#334155'};">First Stand</h3>
                    <p class="mode-sub">{canFirstStand ? '5 rounds · Tough opponents' : 'Win/2nd Regional to unlock'}</p>
                    {#if canFirstStand}<div class="mode-prizes"><span class="mp-w">Win: {MODES.firststand.reward} BE</span><span class="mp-l">2nd: {MODES.firststand.second} BE</span></div>{/if}
                </div>
                {#if canFirstStand && squadReady}
                    <button class="mode-enter-btn" style="background: {MODES.firststand.color};" on:click={() => startTournament('firststand')}>Enter</button>
                {:else if !canFirstStand}<span class="mode-lock-badge">🔒</span>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>

            <!-- MSI -->
            <div class="mode-row" class:mode-locked={!canMSI} style="border-color: {MODES.msi.color}20;">
                <span class="mode-icon">🌊</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: {canMSI ? MODES.msi.color : '#334155'};">MSI</h3>
                    <p class="mode-sub">{canMSI ? '7 rounds · Elite competition' : 'Win Regional 1st or First Stand to unlock'}</p>
                    {#if canMSI}<div class="mode-prizes"><span class="mp-w">Win: {MODES.msi.reward} BE</span><span class="mp-l">2nd: {MODES.msi.second} BE</span></div>{/if}
                </div>
                {#if canMSI && squadReady}
                    <button class="mode-enter-btn" style="background: {MODES.msi.color};" on:click={() => startTournament('msi')}>Enter</button>
                {:else if !canMSI}<span class="mode-lock-badge">🔒</span>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>

            <!-- Worlds -->
            <div class="mode-row" class:mode-locked={!canWorlds} style="border-color: {MODES.worlds.color}20;">
                <span class="mode-icon">🏆</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: {canWorlds ? MODES.worlds.color : '#334155'};">World Championship</h3>
                    <p class="mode-sub">{canWorlds ? '7 rounds · The ultimate challenge' : 'Win Regional or MSI/2nd to unlock'}</p>
                    {#if canWorlds}<div class="mode-prizes"><span class="mp-w">Win: {MODES.worlds.reward} BE</span><span class="mp-l">2nd: {MODES.worlds.second} BE</span></div>{/if}
                </div>
                {#if canWorlds && squadReady}
                    <button class="mode-enter-btn" style="background: {MODES.worlds.color};" on:click={() => startTournament('worlds')}>Enter</button>
                {:else if !canWorlds}<span class="mode-lock-badge">🔒</span>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>

            <!-- Golden Road -->
            <div class="mode-row mode-golden" class:mode-locked={!canGoldenRoad} style="border-color: #fbbf2440;">
                <span class="mode-icon">👑</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: {canGoldenRoad ? '#fbbf24' : '#334155'};">Golden Road</h3>
                    <p class="mode-sub">{canGoldenRoad ? 'Win Regional → First Stand → MSI → Worlds without losing' : 'Complete 1 Split to unlock'}</p>
                    {#if canGoldenRoad}<div class="mode-prizes"><span class="mp-w" style="color:#fbbf24;">Win: 25,000 BE + Glory</span></div>{/if}
                </div>
                {#if grOnCooldown}
                    <span class="mode-cooldown">{grCooldownDisplay}</span>
                {:else if canGoldenRoad && squadReady}
                    <button class="mode-enter-btn" style="background: linear-gradient(135deg, #d97706, #fbbf24); color: #1c1917;" on:click={startGoldenRoad}>Begin</button>
                {:else if !canGoldenRoad}<span class="mode-lock-badge">🔒</span>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>

            <!-- Infinity Tower -->
            <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="mode-row" style="border-color: rgba(239,68,68,0.2);" on:click={() => switchTab('tower')}>
                <span class="mode-icon">🗼</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: #f87171;">Infinity Tower</h3>
                    <p class="mode-sub">Endless floors · Upgrades after each fight · How high can you go?</p>
                    <div class="mode-prizes"><span class="mp-w">BE every 10 floors</span></div>
                </div>
                <button class="mode-enter-btn" style="background: linear-gradient(135deg, #dc2626, #ef4444);" on:click|stopPropagation={() => switchTab('tower')}>Enter</button>
            </div>

            <!-- Draft Mode -->
            <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="mode-row" style="border-color: rgba(168,85,247,0.2);" on:click={() => switchTab('draft')}>
                <span class="mode-icon">🎯</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: #c084fc;">Draft Mode</h3>
                    <p class="mode-sub">15 random cards, 5 bans each, build a squad and battle. Off-role cards get -10 penalty.</p>
                    <div class="mode-prizes"><span class="mp-w">Win: 2,000 BE</span><span class="mp-l">Loss: 500 BE</span></div>
                </div>
                <button class="mode-enter-btn" style="background: linear-gradient(135deg, #7c3aed, #a855f7);" on:click|stopPropagation={() => switchTab('draft')}>Enter</button>
            </div>
            <!-- Salary Cap Mode -->
            <div class="mode-row" style="border-color: rgba(52,211,153,0.2);">
                <span class="mode-icon">💰</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: #34d399;">Salary Cap Mode</h3>
                    <p class="mode-sub">Build a squad within a 50,000 CAP budget. Higher-rated cards cost more. 5 rounds, elite opponents.</p>
                    <div class="mode-prizes"><span class="mp-w">Win: 8,000 BE</span><span class="mp-l">2nd: 3,000 BE</span></div>
                </div>
                {#if $club.filter(c => c.role !== 'COACH').length >= 5}
                    <button class="mode-enter-btn" style="background: #34d399; color: #052e16;" on:click={startSalaryCap}>Enter</button>
                {:else}<span class="mode-need">Need 5+ cards</span>{/if}
            </div>

            <!-- Rival Challenge -->
            <div class="mode-row" style="border-color: rgba(245,158,11,0.2);">
                <span class="mode-icon">⚔️</span>
                <div class="mode-info">
                    <h3 class="mode-name" style="color: #f59e0b;">Rival Challenge</h3>
                    <p class="mode-sub">Fight another player's saved squad from the leaderboard. 3-match challenge.</p>
                    <div class="mode-prizes"><span class="mp-w">Win: 3,000 BE</span><span class="mp-l">2nd: 1,000 BE</span></div>
                </div>
                {#if squadReady}
                    <button class="mode-enter-btn" style="background: #d97706;" on:click={() => { phase = 'rival_lobby'; loadRivals(); }}>Browse</button>
                {:else}<span class="mode-need">Need squad</span>{/if}
            </div>
        </div>

    {:else if phase === 'salary_lobby'}
        <div class="trn-head">
            <h2 class="trn-title" style="color:#34d399;">💰 Salary Cap Mode</h2>
            <p class="trn-desc">Click a role slot to select it, then click a card from the pool to assign. Budget: 50,000 CAP · Cost = (Rating − 60) × 500.</p>
        </div>
        <div class="salary-header">
            <div class="salary-budget-bar">
                <div class="sb-label">Budget</div>
                <div class="sb-bar-track">
                    <div class="sb-bar-fill" style="width:{Math.min(100,(salaryUsed/SALARY_BUDGET)*100)}%; background:{salaryUsed > SALARY_BUDGET ? '#ef4444' : '#34d399'};"></div>
                </div>
                <div class="sb-numbers">
                    <span style="color:{salaryUsed > SALARY_BUDGET ? '#ef4444' : '#34d399'};">{salaryUsed.toLocaleString()} used</span>
                    <span style="color:#64748b;"> / </span>
                    <span>{SALARY_BUDGET.toLocaleString()} CAP</span>
                    <span style="color:{salaryRemaining < 0 ? '#ef4444' : '#94a3b8'}; margin-left:8px;">({salaryRemaining >= 0 ? '+' : ''}{salaryRemaining.toLocaleString()} left)</span>
                </div>
            </div>
        </div>
        <div class="salary-layout2">
            <div class="salary-slots2">
                <div class="ss2-header">Your Squad</div>
                {#each ['TOP','JNG','MID','ADC','SUP'] as role}
                    <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="salary-slot2" class:ss2-active={salaryPickingRole === role} on:click={() => salaryPickingRole = salaryPickingRole === role ? null : role}>
                        <div class="ss2-role-tag">{role}</div>
                        {#if salarySquad[role]}
                            <div class="ss2-card-area">
                                <Card card={salarySquad[role]} mini={true} onclick={() => {}} />
                            </div>
                            <div class="ss2-card-meta">
                                <span class="ss2-cap-cost">{salaryValue(salarySquad[role].rating).toLocaleString()} CAP</span>
                                <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                                <button class="ss2-remove" on:click|stopPropagation={() => { salarySquad = {...salarySquad, [role]: null}; }}>✕</button>
                            </div>
                        {:else}
                            <div class="ss2-empty-slot">
                                {#if salaryPickingRole === role}
                                    <span class="ss2-assign-hint">← Pick from pool</span>
                                {:else}
                                    <span class="ss2-placeholder">Click to select</span>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
                <div class="ss2-actions">
                    {#if salaryComplete}
                        <button class="mode-enter-btn" style="background:#34d399; color:#052e16; width:100%; margin-top:8px;" on:click={startSalaryTournament}>Start Tournament →</button>
                    {/if}
                    <button class="sn-back-btn" style="margin-top:8px; width:100%;" on:click={() => phase = 'lobby'}>← Back</button>
                </div>
            </div>
            <div class="salary-pool-section">
                <div class="spool-header">
                    {#if salaryPickingRole}
                        <span class="spool-title" style="color:#34d399;">Picking {salaryPickingRole} — {salaryCardPool.length} options</span>
                    {:else}
                        <span class="spool-title">All {salaryPool.length} cards · Click a slot first</span>
                    {/if}
                    <input class="spool-search" type="text" placeholder="Search..." bind:value={salarySearch} />
                </div>
                <div class="salary-pool-grid">
                    {#each salaryCardPool as card}
                        {@const assigned = Object.values(salarySquad).some(c => c && c.uniqueId === card.uniqueId)}
                        {@const val = salaryValue(card.rating)}
                        {@const swapCost = salaryPickingRole && salarySquad[salaryPickingRole] ? salaryValue(salarySquad[salaryPickingRole].rating) : 0}
                        {@const overBudget = !assigned && (val - swapCost) > salaryRemaining}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="pool-card-wrap" class:pool-assigned={assigned} class:pool-over={overBudget && !assigned} on:click={() => clickPoolCard(card)}>
                            <Card card={card} mini={true} onclick={() => {}} />
                            <div class="pool-card-footer">
                                <span class="pool-role-tag">{card.role}</span>
                                <span class="pool-cost-tag" style="color:{assigned ? '#94a3b8' : overBudget ? '#ef4444' : '#34d399'};">{val.toLocaleString()}</span>
                            </div>
                            {#if assigned}
                                <div class="pool-badge pool-badge-in">IN SQUAD</div>
                            {/if}
                        </div>
                    {/each}
                    {#if salaryCardPool.length === 0}
                        <p style="color:#475569; font-size:12px; padding:12px;">{salaryPickingRole ? `No ${salaryPickingRole} cards in pool.` : 'No cards match your search.'}</p>
                    {/if}
                </div>
            </div>
        </div>

    {:else if phase === 'rival_lobby'}
        <div class="trn-head">
            <h2 class="trn-title" style="color:#f59e0b;">⚔️ Rival Challenge</h2>
            <p class="trn-desc">Challenge another manager's saved squad. Beat them in a 3-match series.</p>
        </div>
        {#if rivalsLoading}
            <div class="phase-center"><p style="color:#64748b;">Loading rivals...</p></div>
        {:else if rivals.length === 0}
            <div class="phase-center">
                <p style="color:#64748b; margin-bottom:16px;">{window.fbDb ? 'No rivals found on the leaderboard yet.' : 'Sign in to access Rival Challenge (requires cloud save).'}</p>
                <button class="sn-back-btn" on:click={() => phase = 'lobby'}>← Back</button>
            </div>
        {:else}
            <div class="rivals-list">
                {#each rivals as rival}
                    <div class="rival-row">
                        <span class="rival-logo">{rival.teamLogo}</span>
                        <div class="rival-info">
                            <span class="rival-name">{rival.displayName}</span>
                            <span class="rival-team">{rival.teamName}</span>
                        </div>
                        <div class="rival-stats">
                            <span class="rival-power">⚡{rival.totalPower}</span>
                            <span class="rival-trophies">🏆{rival.trophies}</span>
                        </div>
                        <button class="mode-enter-btn" style="background:#d97706;" on:click={() => startRivalChallenge(rival)}>Challenge</button>
                    </div>
                {/each}
            </div>
            <button class="sn-back-btn" style="margin-top:16px;" on:click={() => phase = 'lobby'}>← Back</button>
        {/if}

    {:else if phase === 'bracket'}
        <div class="phase-center">
            <h2 class="phase-title" style="color: {currentModeColor};">{currentModeName} — Round {round + 1}/{enemies.length}</h2>
            {#if activeMode === 'goldenroad'}
                <div class="gr-stages">
                    {#each GOLDEN_STAGES as stg, si}
                        <span class="gr-stage" class:gr-done={si < goldenRoadStage} class:gr-active={si === goldenRoadStage} class:gr-future={si > goldenRoadStage}>{MODES[stg].icon}</span>
                    {/each}
                </div>
            {/if}
            <div class="bracket-dots">
                {#each Array(enemies.length) as _, r}
                    <div class="bdot" class:bdot-w={r < roundResults.length && roundResults[r]} class:bdot-l={r < roundResults.length && !roundResults[r]} class:bdot-active={r === round && r >= roundResults.length} class:bdot-future={r > round || (r >= roundResults.length && r !== round)}>
                        {r < roundResults.length ? (roundResults[r] ? 'W' : 'L') : r + 1}
                    </div>
                {/each}
            </div>
        </div>
        <div class="vs-card">
            <div class="vs-side"><span class="vs-rating vs-blue">{totalPower}</span><span class="vs-label">Your Squad</span></div>
            <span class="vs-x">VS</span>
            <div class="vs-side"><span class="vs-rating vs-red">{enemies[round]?.avgRating || '?'}</span><span class="vs-label">{enemies[round]?.name || 'CPU'}</span></div>
        </div>
        <div class="phase-center"><button class="mode-enter-btn" style="background: {currentModeColor};" on:click={startMatch}>Start Match</button></div>

    {:else if phase === 'match' && currentEnemy}
        <div class="match-header">
            <div class="mh-label">{currentModeName} — Round {round + 1}</div>
            <div class="mh-score"><span class="mh-blue">{playerScore}</span><span class="mh-sep">—</span><span class="mh-red">{cpuScore}</span></div>
        </div>
        <div class="match-layout">
            <div class="team-block">
                <div class="arena-label arena-label-blue">Your Squad ({totalPower})</div>
                <div class="arena-grid-2x3">
                    {#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}{#each pair as role}<div class="arena-cell">{#if $squad[role]}<Card card={$squad[role]} mini={true} />{:else}<div class="arena-empty">{role}</div>{/if}</div>{/each}{/each}
                </div>
            </div>
            <div class="arena-center">
                <div class="power-compare">
                    <span class="pc-side pc-blue">{totalPower}</span>
                    <div class="pc-center">
                        <div class="pc-label">Base Power</div>
                        <div class="pc-diff" class:pc-pos={powerDiff > 0} class:pc-neg={powerDiff < 0} class:pc-even={powerDiff === 0}>
                            {powerDiff > 0 ? '+' : ''}{powerDiff}
                        </div>
                        <div class="pc-note">Net = Power + Stat · Luck ±5 each</div>
                    </div>
                    <span class="pc-side pc-red">{currentEnemy.avgRating}</span>
                </div>

                <div class="stat-compare">
                    <div class="sc-title">Available Plays {#if tacticsLevel > 0}<span class="tactics-tag">🧠 Tactics +{tacticsLevel}</span>{/if}</div>
                    {#each roundPlays as play}{@const myVal = myStatAvgs[play.stat]||0}{@const cpuVal = cpuStatAvgs[play.stat]||0}{@const diff = myVal - cpuVal}{@const net = powerDiff + diff}
                        <div class="sc-row"><span class="sc-val sc-val-blue">{myVal}</span><div class="sc-bar-wrap"><div class="sc-label">{play.icon} {play.label}</div><div class="sc-bar"><div class="sc-fill-blue" style="width:{Math.min(100,(myVal/Math.max(myVal,cpuVal,1))*50)}%"></div><div class="sc-fill-red" style="width:{Math.min(100,(cpuVal/Math.max(myVal,cpuVal,1))*50)}%;margin-left:auto;"></div></div><div class="sc-diff" class:sc-diff-pos={diff>0} class:sc-diff-neg={diff<0}>{diff>0?'+':''}{diff} stat</div></div><span class="sc-val sc-val-red">{cpuVal}</span></div>
                    {/each}
                </div>
                {#if matchLog.length > 0}
                    <div class="log-list">
                        {#each matchLog as log}
                            <div class="log-row" class:log-w={log.won} class:log-l={!log.won}>
                                <span class="log-result">{log.won?'✓':'✗'}</span>
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
                {#if playerScore < matchWinsNeeded && cpuScore < matchWinsNeeded}
                    <div class="play-picker"><div class="play-label">Choose Your Play (3 of 5)</div>
                        <div class="play-grid">{#each roundPlays as play}{@const edge = (myStatAvgs[play.stat]||0)-(cpuStatAvgs[play.stat]||0)}{@const net = powerDiff + edge}<button class="play-btn" on:click={() => pickPlay(play)}><span class="pb-icon">{play.icon}</span><span class="pb-name">{play.label}</span><span class="pb-stat" class:pb-edge-pos={edge>0} class:pb-edge-neg={edge<0}>Stat {edge>0?'+':''}{edge}</span><span class="pb-net" class:pb-edge-pos={net>0} class:pb-edge-neg={net<0}>Net {net>0?'+':''}{net}</span></button>{/each}</div>
                    </div>
                {/if}
            </div>
            <div class="team-block">
                <div class="arena-label arena-label-red">{currentEnemy.name} ({currentEnemy.avgRating})</div>
                <div class="arena-grid-2x3">
                    {#each [['TOP','COACH'],['JNG','MID'],['ADC','SUP']] as pair}{#each pair as role}<div class="arena-cell">{#if currentEnemy.cards[role]}<Card card={currentEnemy.cards[role]} mini={true} />{:else if role!=='COACH'}<div class="arena-empty">{role}</div>{:else}<div class="arena-empty-sm"></div>{/if}</div>{/each}{/each}
                </div>
            </div>
        </div>

    {:else if phase === 'roundEnd'}
        {#if activeMode === 'rival'}
            {@const seriesW = roundResults.filter(Boolean).length}
            {@const seriesL = roundResults.filter(r => !r).length}
            {@const lastWon = roundResults[roundResults.length - 1]}
            <div class="result-card" class:result-win={lastWon} class:result-lose={!lastWon}>
                <div class="result-icon" style="font-size:48px;">{lastWon ? '⚔️' : '💢'}</div>
                <h2 class="result-title" class:rt-win={lastWon} class:rt-lose={!lastWon}>Match {round + 1} {lastWon ? 'Won!' : 'Lost'}</h2>
                <p class="result-sub">Series: <strong style="color:#34d399;">{seriesW}</strong> — <strong style="color:#f87171;">{seriesL}</strong> · First to 3 wins</p>
                <button class="mode-enter-btn" style="background:#f59e0b; margin-top:20px;" on:click={nextRound}>Next Match →</button>
            </div>
        {:else}
            <div class="result-card result-win">
                <div class="result-icon">✓</div>
                <h2 class="result-title rt-win">Round {round + 1} Won!</h2>
                <p class="result-sub">Score: {playerScore}-{cpuScore}. Next opponent is tougher.</p>
                <button class="mode-enter-btn" style="background: {currentModeColor}; margin-top:20px;" on:click={nextRound}>Next Round →</button>
            </div>
        {/if}

    {:else if phase === 'result'}
        <div class="result-card" class:result-win={tournamentResult?.won} class:result-lose={!tournamentResult?.won}>
            <div class="result-icon" style="font-size:48px;">
                {#if tournamentResult?.goldenRoad}👑
                {:else if tournamentResult?.won}🏆
                {:else if tournamentResult?.goldenRoadFailed}💀
                {:else if tournamentResult?.isFinalist}🥈
                {:else}💀{/if}
            </div>
            <h2 class="result-title" class:rt-win={tournamentResult?.won} class:rt-lose={!tournamentResult?.won}>
                {#if tournamentResult?.goldenRoad}Golden Road Complete!
                {:else if tournamentResult?.goldenRoadFailed}Golden Road Failed — Stage {(tournamentResult?.stage||0)+1}/4
                {:else if tournamentResult?.won}Champion!
                {:else if tournamentResult?.isFinalist}Runner Up
                {:else}Eliminated{/if}
            </h2>
            {#if tournamentResult?.reward > 0}<div class="result-reward">+{tournamentResult.reward.toLocaleString()} BE{#if tournamentResult.bonus > 0} <span class="wealth-bonus">(+{tournamentResult.bonus.toLocaleString()} Wealth)</span>{/if}</div>{/if}
            <button class="sn-back-btn" style="margin-top:20px;" on:click={backToLobby}>Back to Lobby</button>
        </div>
    {/if}
</section>

<style>
    .trn { max-width: 1600px; margin: 0 auto; padding-bottom: 40px; }
    .trn-head { margin-bottom: 20px; }
    .trn-title { font-size: 22px; font-weight: 900; color: #e2e8f0; }
    .trn-desc { font-size: 12px; color: #64748b; margin-top: 4px; }

    .season-banner { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-radius: 16px; margin-bottom: 20px; cursor: pointer; background: linear-gradient(135deg, rgba(30,58,138,0.25), rgba(15,23,42,0.6)); border: 1px solid rgba(59,130,246,0.12); overflow: hidden; transition: border-color 0.15s; }
    .season-banner:hover { border-color: rgba(59,130,246,0.25); }
    .sb-glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.06), transparent 60%); pointer-events: none; }
    .sb-content { position: relative; }
    .sb-badge { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #3b82f6; margin-bottom: 4px; }
    .sb-title { font-size: 20px; font-weight: 900; color: #93c5fd; }
    .sb-sub { font-size: 11px; color: #64748b; margin-top: 4px; }

    /* Mode list */
    .modes-list { display: flex; flex-direction: column; gap: 8px; }
    .mode-row {
        display: flex; align-items: center; gap: 16px; padding: 18px 22px;
        border-radius: 14px; background: rgba(12,16,28,0.5); border: 1px solid;
        transition: all 0.12s;
    }
    .mode-row:hover:not(.mode-locked) { background: rgba(15,20,35,0.6); }
    .mode-locked { opacity: 0.35; }
    .mode-golden { border-color: rgba(251,191,36,0.15) !important; background: rgba(251,191,36,0.03); }
    .mode-icon { font-size: 28px; flex-shrink: 0; }
    .mode-info { flex: 1; min-width: 0; }
    .mode-name { font-size: 15px; font-weight: 900; }
    .mode-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .mode-prizes { display: flex; gap: 12px; margin-top: 6px; font-size: 10px; font-weight: 800; }
    .mp-w { color: #34d399; } .mp-l { color: #94a3b8; }
    .mode-enter-btn {
        padding: 10px 24px; border-radius: 10px; color: white; font-weight: 900;
        font-size: 12px; border: none; cursor: pointer; flex-shrink: 0;
        transition: all 0.15s; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .mode-enter-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    .mode-coming-soon { cursor: default; pointer-events: none; }
    .mode-soon-tag {
        padding: 6px 14px; border-radius: 8px; font-size: 9px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;
        background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.2);
        color: #c084fc;
    }
    .mode-lock-badge { font-size: 18px; flex-shrink: 0; opacity: 0.5; }
    .mode-need { font-size: 10px; color: #f87171; font-weight: 700; flex-shrink: 0; }
    .mode-cooldown {
        padding: 8px 16px; border-radius: 10px; font-size: 14px; font-weight: 900;
        color: #f59e0b; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.15);
        font-family: monospace; flex-shrink: 0;
    }

    /* Golden Road stages */
    .gr-stages { display: flex; justify-content: center; gap: 8px; margin-bottom: 12px; }
    .gr-stage { font-size: 24px; padding: 6px; border-radius: 10px; }
    .gr-done { background: rgba(16,185,129,0.15); border: 2px solid #10b981; }
    .gr-active { background: rgba(251,191,36,0.15); border: 2px solid #fbbf24; animation: pulse 1.5s ease-in-out infinite; }
    .gr-future { opacity: 0.25; }
    @keyframes pulse { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 16px rgba(251,191,36,0.4); } }

    /* Bracket/VS/Match — reused from before */
    .phase-center { text-align: center; margin-bottom: 20px; }
    .phase-title { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .bracket-dots { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; }
    .bdot { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; border: 2px solid; }
    .bdot-w { background: rgba(6,78,59,0.4); border-color: #10b981; color: #6ee7b7; }
    .bdot-l { background: rgba(127,29,29,0.4); border-color: #ef4444; color: #fca5a5; }
    .bdot-active { background: rgba(30,58,138,0.4); border-color: #3b82f6; color: #93c5fd; }
    .bdot-future { background: rgba(15,23,42,0.4); border-color: #334155; color: #475569; }

    .vs-card { display: flex; align-items: center; justify-content: center; gap: 32px; padding: 28px; border-radius: 16px; margin-bottom: 20px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); }
    .vs-side { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .vs-rating { font-size: 36px; font-weight: 900; } .vs-blue { color: #60a5fa; } .vs-red { color: #f87171; }
    .vs-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .vs-x { font-size: 18px; font-weight: 900; color: #334155; }

    .match-header { text-align: center; margin-bottom: 20px; }
    .mh-label { font-size: 12px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 2px; }
    .mh-score { display: flex; justify-content: center; gap: 16px; margin-top: 8px; }
    .mh-blue { font-size: 24px; font-weight: 900; color: #60a5fa; }
    .mh-red { font-size: 24px; font-weight: 900; color: #f87171; }
    .mh-sep { font-size: 24px; font-weight: 900; color: #334155; }

    .match-layout { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
    @media (max-width: 1400px) { .match-layout { grid-template-columns: 1fr; } .team-block { display: none; } }
    .team-block { display: flex; flex-direction: column; gap: 6px; }
    .arena-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; padding: 8px 12px; border-radius: 10px; text-align: center; }
    .arena-label-blue { color: #93c5fd; background: rgba(30,58,138,0.2); border: 1px solid rgba(59,130,246,0.15); }
    .arena-label-red { color: #fca5a5; background: rgba(127,29,29,0.2); border: 1px solid rgba(239,68,68,0.15); }
    .arena-grid-2x3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .arena-cell { display: flex; justify-content: center; }
    .arena-empty { width: 180px; height: 80px; border-radius: 12px; background: rgba(15,23,42,0.3); border: 1px dashed rgba(51,65,85,0.2); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #1e293b; }
    .arena-empty-sm { width: 180px; height: 40px; }
    .arena-center { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    .stat-compare { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 14px; padding: 16px; }
    .sc-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; text-align: center; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .tactics-tag { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px; border-radius: 6px; background: rgba(147,51,234,0.15); border: 1px solid rgba(168,85,247,0.3); color: #c084fc; font-size: 9px; font-weight: 900; letter-spacing: 0; text-transform: none; }
    .log-tactics { color: #c084fc; font-size: 9px; font-weight: 700; margin-left: 2px; }
    .sc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .sc-val { font-size: 14px; font-weight: 900; width: 32px; text-align: center; } .sc-val-blue { color: #60a5fa; } .sc-val-red { color: #f87171; }
    .sc-bar-wrap { flex: 1; text-align: center; }
    .sc-label { font-size: 10px; font-weight: 800; color: #94a3b8; margin-bottom: 4px; }
    .sc-bar { display: flex; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .sc-fill-blue { background: linear-gradient(90deg, #1e40af, #3b82f6); border-radius: 4px 0 0 4px; }
    .sc-fill-red { background: linear-gradient(90deg, #ef4444, #991b1b); border-radius: 0 4px 4px 0; }
    .sc-diff { font-size: 11px; font-weight: 900; color: #64748b; margin-top: 2px; } .sc-diff-pos { color: #34d399; } .sc-diff-neg { color: #f87171; }

    /* Power compare */
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
    .log-calc { color: #64748b; }
    .log-vs { color: #334155; }

    .play-picker { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); border-radius: 16px; padding: 24px; }
    .play-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; text-align: center; margin-bottom: 16px; }
    .play-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .play-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 12px; border-radius: 14px; cursor: pointer; background: rgba(30,41,59,0.4); border: 1px solid rgba(51,65,85,0.3); transition: all 0.12s; }
    .play-btn:hover { background: rgba(51,65,85,0.5); border-color: rgba(59,130,246,0.2); transform: scale(1.03); }
    .pb-icon { font-size: 26px; } .pb-name { font-size: 12px; font-weight: 900; color: #e2e8f0; }
    .pb-edge { font-size: 11px; font-weight: 900; color: #64748b; }
    .pb-stat { font-size: 10px; font-weight: 700; color: #64748b; }
    .pb-net { font-size: 12px; font-weight: 900; color: #64748b; margin-top: 2px; }
    .pb-edge-pos { color: #34d399; } .pb-edge-neg { color: #f87171; }

    .result-card { text-align: center; padding: 40px 24px; border-radius: 20px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); }
    .result-win { border-color: rgba(16,185,129,0.15); background: rgba(6,78,59,0.08); }
    .result-lose { border-color: rgba(239,68,68,0.15); background: rgba(127,29,29,0.06); }
    .result-icon { font-size: 40px; margin-bottom: 12px; }
    .result-title { font-size: 24px; font-weight: 900; margin-bottom: 8px; } .rt-win { color: #34d399; } .rt-lose { color: #f87171; }
    .result-sub { font-size: 12px; color: #94a3b8; }
    .result-reward { font-size: 22px; font-weight: 900; color: #60a5fa; margin-top: 12px; }
    .wealth-bonus { font-size: 13px; color: #38bdf8; font-weight: 700; }
    .sn-back-btn { padding: 12px 32px; border-radius: 12px; background: rgba(51,65,85,0.5); color: #94a3b8; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border: 1px solid rgba(71,85,105,0.4); cursor: pointer; transition: all 0.12s; }
    .sn-back-btn:hover { background: rgba(71,85,105,0.6); color: #e2e8f0; }

    /* Salary Cap Mode */
    .salary-header { margin-bottom: 20px; }
    .salary-budget-bar { background: rgba(12,16,28,0.6); border: 1px solid rgba(51,65,85,0.3); border-radius: 14px; padding: 16px 20px; }
    .sb-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; margin-bottom: 8px; }
    .sb-bar-track { height: 8px; background: rgba(30,41,59,0.6); border-radius: 99px; overflow: hidden; margin-bottom: 8px; }
    .sb-bar-fill { height: 100%; border-radius: 99px; transition: width 0.3s; }
    .sb-numbers { font-size: 12px; display: flex; align-items: center; }
    .salary-layout { display: grid; grid-template-columns: 240px 1fr; gap: 16px; }
    .salary-slots { display: flex; flex-direction: column; gap: 8px; }
    .salary-slot { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); cursor: pointer; position: relative; transition: border-color 0.15s; }
    .salary-slot:hover, .salary-slot-active { border-color: rgba(52,211,153,0.4); background: rgba(52,211,153,0.04); }
    .ss-role { font-size: 9px; font-weight: 900; text-transform: uppercase; color: #475569; min-width: 32px; }
    .ss-card-info { flex: 1; min-width: 0; }
    .ss-name { font-size: 13px; font-weight: 700; color: #e2e8f0; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ss-team { font-size: 10px; color: #64748b; }
    .ss-val { font-size: 10px; font-weight: 700; margin-left: 6px; }
    .ss-empty { font-size: 11px; color: #334155; flex: 1; }
    .ss-remove { font-size: 12px; color: #ef4444; cursor: pointer; padding: 4px; flex-shrink: 0; }
    .salary-actions { margin-top: 4px; }
    .salary-picker { background: rgba(12,16,28,0.5); border: 1px solid rgba(52,211,153,0.15); border-radius: 14px; padding: 16px; overflow: hidden; }
    .sp-title { font-size: 11px; font-weight: 900; color: #34d399; margin-bottom: 10px; }
    .sp-search { width: 100%; padding: 8px 12px; border-radius: 8px; background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3); color: #e2e8f0; font-size: 12px; margin-bottom: 10px; box-sizing: border-box; }
    .sp-list { max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .sp-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(30,41,59,0.3); cursor: pointer; transition: background 0.1s; font-size: 12px; }
    .sp-card:hover:not(.sp-over) { background: rgba(52,211,153,0.08); }
    .sp-over { opacity: 0.4; cursor: not-allowed; }
    .sp-name { font-weight: 700; color: #e2e8f0; flex: 1; }
    .sp-team { color: #64748b; font-size: 10px; }
    .sp-rat { font-size: 11px; font-weight: 700; }
    .sp-val { font-size: 10px; font-weight: 700; min-width: 56px; text-align: right; }
    .salary-hint { padding: 16px; }

    /* Salary Cap v2 — card pool layout */
    .salary-layout2 { display: grid; grid-template-columns: 230px 1fr; gap: 20px; align-items: start; }
    @media (max-width: 900px) { .salary-layout2 { grid-template-columns: 1fr; } }
    .salary-slots2 { display: flex; flex-direction: column; gap: 8px; }
    .ss2-header { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #475569; margin-bottom: 4px; }
    .salary-slot2 { border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.2); padding: 10px 12px; transition: all 0.15s; cursor: pointer; }
    .salary-slot2:hover { border-color: rgba(52,211,153,0.3); }
    .ss2-active { border-color: #34d399 !important; background: rgba(52,211,153,0.06) !important; box-shadow: 0 0 10px rgba(52,211,153,0.15); }
    .ss2-role-tag { font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569; letter-spacing: 1px; margin-bottom: 6px; }
    .ss2-card-area { display: flex; justify-content: center; margin-bottom: 6px; }
    .ss2-card-meta { display: flex; align-items: center; justify-content: space-between; }
    .ss2-cap-cost { font-size: 10px; font-weight: 700; color: #34d399; }
    .ss2-remove { font-size: 11px; color: #ef4444; background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
    .ss2-remove:hover { background: rgba(239,68,68,0.1); }
    .ss2-empty-slot { min-height: 50px; display: flex; align-items: center; justify-content: center; }
    .ss2-assign-hint { font-size: 10px; font-weight: 700; color: #34d399; text-align: center; }
    .ss2-placeholder { font-size: 10px; color: #334155; }
    .ss2-actions { margin-top: 4px; }

    .salary-pool-section { min-width: 0; }
    .spool-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
    .spool-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; white-space: nowrap; }
    .spool-search { padding: 7px 12px; border-radius: 8px; background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.3); color: #e2e8f0; font-size: 12px; width: 160px; }
    .salary-pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); gap: 10px; }
    .pool-card-wrap { position: relative; border-radius: 14px; overflow: hidden; border: 2px solid transparent; cursor: pointer; transition: all 0.15s; background: rgba(15,23,42,0.3); }
    .pool-card-wrap:hover:not(.pool-assigned):not(.pool-over) { border-color: rgba(52,211,153,0.4); box-shadow: 0 0 10px rgba(52,211,153,0.2); }
    .pool-assigned { opacity: 0.5; cursor: default; }
    .pool-over { opacity: 0.4; }
    .pool-card-footer { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 2px; }
    .pool-role-tag { font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569; }
    .pool-cost-tag { font-size: 9px; font-weight: 700; }
    .pool-badge { position: absolute; top: 6px; right: 6px; font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 4px; pointer-events: none; }
    .pool-badge-in { background: rgba(52,211,153,0.25); color: #34d399; border: 1px solid rgba(52,211,153,0.4); }
    .pool-badge-sel { background: rgba(59,130,246,0.25); color: #60a5fa; border: 1px solid rgba(59,130,246,0.4); }

    /* Rival Challenge */
    .rivals-list { display: flex; flex-direction: column; gap: 8px; }
    .rival-row { display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 14px; background: rgba(12,16,28,0.5); border: 1px solid rgba(245,158,11,0.1); }
    .rival-logo { font-size: 28px; flex-shrink: 0; }
    .rival-info { flex: 1; }
    .rival-name { font-size: 14px; font-weight: 900; color: #e2e8f0; display: block; }
    .rival-team { font-size: 11px; color: #64748b; }
    .rival-stats { display: flex; gap: 12px; }
    .rival-power { font-size: 12px; font-weight: 700; color: #60a5fa; }
    .rival-trophies { font-size: 12px; font-weight: 700; color: #fbbf24; }
</style>
