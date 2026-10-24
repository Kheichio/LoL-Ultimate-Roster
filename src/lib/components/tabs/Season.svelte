<script>
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import MatchArena from '../match/MatchArena.svelte';
    import MatchResult from '../match/MatchResult.svelte';
    import { drawPlays, seriesWinChance } from '../match/matchMath.js';
    import { pressFx } from '../../utils/fx.js';
    import { club, squad, bench, blueEssence, trackStats, seasonData, skills, teamIdentity, grantXP, grantBPXP, grantBE, saveGame, logMatch } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab, splitCooldownEnd } from '../../stores/ui.js';
    import { playSound } from '../../utils/sound.js';
    import { saveToStorage, loadFromStorage, removeFromStorage } from '../../utils/storage.js';
    import { getDB, LEGACY_TIERS, ALL_SPECIAL, MYTHIC_TIERS, getEffectiveStats, getEffectiveRating, getEra, TIER_COLORS } from '../../utils/cards.js';
    import { calcCoachBonus, calcRegionChem, calcEraChem, calcTeamChem, calcLegacyBonus } from '../../utils/combat.js';
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

    // Display only — keyed by title, which is also what trophyCase entries store.
    const TITLE_STYLE = {
        'Perfect Split':     { ico: 'crown',   c: '#facc15' },
        'Dominant':          { ico: 'trophy',  c: '#fbbf24' },
        'Elite':             { ico: 'star',    c: '#c084fc' },
        'Playoff Contender': { ico: 'target',  c: '#60a5fa' },
        'Playoff Qualifier': { ico: 'check',   c: '#34d399' },
        'Mid Table':         { ico: 'ranking', c: '#94a3b8' },
        'Struggling':        { ico: 'shield',  c: '#fb923c' },
        'Relegated':         { ico: 'skull',   c: '#f87171' },
    };
    const styleFor = (title) => TITLE_STYLE[title] || { ico: 'medal', c: '#94a3b8' };
    const ROLE_ICONS = { TOP: '/icons/Top_icon.png', JNG: '/icons/Jungle_icon.png', MID: '/icons/Middle_icon.png', ADC: '/icons/Bottom_icon.png', SUP: '/icons/Support_icon.png', COACH: '/icons/Specialist_icon.png' };

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
        const role = benchSwapRole;
        const currentCard = get(squad)[role];
        squad.update(s => ({ ...s, [role]: benchCard }));
        bench.update(b => { const n = [...b]; n[benchIdx] = currentCard; return n; });
        seasonData.update(s => ({ ...s, swapsUsed: (s.swapsUsed || 0) + 1 }));
        showBenchPicker = false;
        benchSwapRole = null;
        saveGame();
        showToast(`Swapped ${benchCard.name} into ${role}. ${currentCard ? currentCard.name + ' moved to bench.' : ''}`, 'success');
    }

    $: benchCandidates = (Array.isArray($bench) ? $bench : []).map((card, idx) => ({ card, idx })).filter(e => e.card !== null);

    $: powerDiff = currentOpponent ? totalPower - (currentOpponent.avgRating || 0) : 0;
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
        if (remaining <= 0) {
            splitCooldownEnd.set(0);
            if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
        }
    }
    function restoreCooldown() {
        // Back-compat: the timestamp used to be written raw via String(ms). A bare
        // number is valid JSON, so pre-slot cooldowns still decode here; Number()
        // covers both forms and anything unreadable falls through as 0 (no cooldown),
        // never as a permanent one.
        const end = Number(loadFromStorage('lur_split_cooldown')) || 0;
        if (end > 0) {
            if (end > Date.now()) {
                cooldownEnd = end;
                splitCooldownEnd.set(end);
                updateCooldown();
                if (cooldownTimer) clearInterval(cooldownTimer);
                cooldownTimer = setInterval(updateCooldown, 1000);
            } else {
                removeFromStorage('lur_split_cooldown');
            }
        }
    }
    restoreCooldown();
    onDestroy(() => { if (cooldownTimer) clearInterval(cooldownTimer); });

    function validateSeasonData() {
        const sd = get(seasonData);
        let needsReset = false;
        if (sd.opponents && sd.opponents.length > 0) {
            const valid = sd.opponents.every(o => o && typeof o === 'object' && o.cards && o.avgRating !== undefined);
            if (!valid) needsReset = true;
            if (sd.matchResults && !Array.isArray(sd.matchResults)) needsReset = true;
        }
        if (sd.meta && !Array.isArray(sd.meta)) needsReset = true;
        if (needsReset) {
            seasonData.update(s => ({
                ...s,
                opponents: [],
                matchResults: [],
                meta: [],
                lockedSquad: null,
                splitWins: 0,
                splitLosses: 0,
            }));
            saveGame();
        }
    }
    validateSeasonData();

    function rollRoundPlays() {
        roundPlays = drawPlays(PLAYS, 3);
    }

    $: starters = ['TOP','JNG','MID','ADC','SUP'].map(r => $squad[r]).filter(Boolean);
    $: squadReady = starters.length === 5;
    $: avgRating = squadReady ? Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length) : 0;
    $: coachBonus = calcCoachBonus($squad.COACH);
    $: regionChem = squadReady ? calcRegionChem(starters) : 0;
    $: eraChem = squadReady ? calcEraChem(starters) : 0;
    $: teamChem = squadReady ? calcTeamChem(starters) : 0;
    $: legacyBonus = calcLegacyBonus(starters);
    $: conditioningBonus = $skills.conditioning || 0;
    $: chemBonus = regionChem + eraChem + teamChem + coachBonus + legacyBonus + conditioningBonus;
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
    const oppStats = (opp) => {
        try {
            const cards = Object.values(opp.cards || {}).filter(c => c && c.stats);
            const r = {}; STAT_KEYS.forEach(s => {
                r[s] = cards.length > 0 ? Math.round(cards.reduce((sum, c) => sum + (c.stats[s]||0), 0) / cards.length) : 0;
            }); return r;
        } catch(e) { return {}; }
    };
    $: cpuStatAvgs = currentOpponent ? oppStats(currentOpponent) : {};
    $: splitName = SPLIT_NAMES[($seasonData.currentSplit - 1) % 4];
    $: splitIdx = ($seasonData.currentSplit - 1) % 4;
    $: splitYear = Math.floor(($seasonData.currentSplit - 1) / 4) + 1;
    $: matchIndex = ($seasonData.matchResults || []).filter(r => r === true || r === false).length;
    $: splitComplete = matchIndex >= GAMES_PER_SPLIT;
    $: wins = ($seasonData.matchResults || []).filter(r => r === true).length;
    $: losses = ($seasonData.matchResults || []).filter(r => r === false).length;
    $: remaining = Math.max(0, GAMES_PER_SPLIT - matchIndex);

    // --- Meta system ---
    $: metaPhase = matchIndex < 5 ? 0 : 1;
    $: currentMeta = (() => {
        const raw = ($seasonData.meta || [])[metaPhase];
        if (!raw) return null;
        if (raw.buffed && raw.buffed.length > 0 && typeof raw.buffed[0] === 'string') return null;
        return raw;
    })();
    $: splitActive = ($seasonData.opponents || []).length > 0 && !splitComplete;
    // Ten results are in but the reward was never claimed (the player left before the
    // results screen). Starting a new split from here would throw that reward away.
    $: unclaimed = ($seasonData.opponents || []).length > 0 && splitComplete;
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
    $: buffedMine = Object.values(affectedSquad.buffed).reduce((s, a) => s + a.length, 0);
    $: nerfedMine = Object.values(affectedSquad.nerfed).reduce((s, a) => s + a.length, 0);

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

    // --- Reward ladder: what this split can still finish as ---
    // floor = the finish already guaranteed by the wins so far; a tier is open while
    // wins + matches left can still reach it.
    $: floorTier = SPLIT_TITLES.find(t => wins >= t.wins) || SPLIT_TITLES[SPLIT_TITLES.length - 1];
    $: ladder = SPLIT_REWARDS.map(r => {
        const t = SPLIT_TITLES.find(x => x.wins === r.wins);
        // Relegated is the floor of every split, so it is never announced as "secured".
        const state = !splitActive ? 'idle'
            : r.wins === floorTier.wins && floorTier.wins > 0 ? 'floor'
            : r.wins < floorTier.wins ? 'passed'
            : r.wins <= wins + remaining ? 'open' : 'gone';
        return { ...r, title: t?.title || '—', ...styleFor(t?.title), req: r.wins === 0 ? '0–3 wins' : `${r.wins} wins`, state };
    });
    $: bestReachable = splitActive ? (SPLIT_TITLES.find(t => wins + remaining >= t.wins) || floorTier) : null;

    // --- Trophy case ---
    $: trophies = $seasonData.trophyCase || [];
    $: regionalCount = trophies.filter(t => t.wins >= 6).length;
    $: perfectCount = trophies.filter(t => t.wins === 10).length;
    $: totalEarned = trophies.reduce((s, t) => s + (t.reward || 0), 0);

    // --- Next fixture ---
    $: nextOpp = splitActive ? opponents[matchIndex] : null;
    const pct = (p) => (p >= 1 ? 100 : p <= 0 ? 0 : Math.min(99, Math.max(1, Math.round(p * 100))));
    $: nextOdds = (nextOpp && squadReady) ? (() => {
        const st = oppStats(nextOpp);
        return seriesWinChance({
            myPower: totalPower, cpuPower: nextOpp.avgRating, myStats: myPlayStats,
            cpuStatPool: PLAYS.map(p => st[p.stat] || 0), allStats: PLAYS.map(p => p.stat),
            offered: [], scoreBlue: 0, scoreRed: 0, winsNeeded: 3,
        });
    })() : null;
    $: nextLineup = nextOpp ? ['TOP', 'JNG', 'MID', 'ADC', 'SUP'].map(r => ({ role: r, card: nextOpp.cards?.[r] || null })) : [];

    function generateOpponents() {
        const db = getDB();
        if (!db) { showToast('Card database not loaded. Try refreshing.', 'error'); return false; }
        const regularPool = db.filter(p => p.role !== 'COACH' && !ALL_SPECIAL.includes(p.quality));
        // Mythic cards are perfect 100s — an unbeatable CPU roster, so keep them out even of BOSS teams
        const elitePool = db.filter(p => p.role !== 'COACH' && !MYTHIC_TIERS.includes(p.quality));
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        const teamNames = ['Shadow Wolves', 'Storm Dragons', 'Iron Phoenix', 'Crystal Bears', 'Neon Tigers',
                          'Dark Knights', 'Solar Flare', 'Frost Giants', 'Thunder Hawks', 'Crimson Vipers'];

        const splitNum = $seasonData.currentSplit || 1;
        const yr = Math.floor((splitNum - 1) / 4);
        const hardMin = Math.min(yr, 4);
        const hardMax = Math.min(1 + yr * 2, 8);
        // BOSS games live in the back third of the split (games 6-10 → slots 6-9),
        // so there are only ~4 slots to place them in. The boss count MUST be clamped
        // to that capacity: at high split numbers (e.g. split 50, yr 12) the old
        // bossMin = yr - 1 far exceeded bossMax, which (a) made randRange receive
        // min > max and return an inflated count, and (b) asked the fill loop below to
        // place more bosses than there are slots — an infinite loop that froze the whole
        // page for veteran players. Clamp both ends and cap the loop with an attempt limit.
        const bossSlotStart = Math.max(5, GAMES_PER_SPLIT - 4); // 6
        const bossSlotEnd = GAMES_PER_SPLIT - 1;                // 9
        const bossSlotCapacity = bossSlotEnd - bossSlotStart + 1; // 4
        const bossMax = Math.min(Math.floor(yr / 2), 3, bossSlotCapacity);
        const bossMin = Math.min(Math.max(0, yr - 1), bossMax); // never above bossMax
        const impossibleCount = yr <= 1 ? 0 : randRange(bossMin, bossMax);
        const impossibleSlots = new Set();
        let bossAttempts = 0;
        while (impossibleSlots.size < impossibleCount && bossAttempts < 100) {
            impossibleSlots.add(randRange(bossSlotStart, bossSlotEnd));
            bossAttempts++;
        }

        const availableHardSlots = GAMES_PER_SPLIT - 3 - impossibleSlots.size;
        const hardCount = yr === 0 ? 0 : Math.min(randRange(hardMin, hardMax), availableHardSlots);
        const hardSlots = new Set();
        let hardAttempts = 0;
        while (hardSlots.size < hardCount && hardAttempts < 100) {
            const s = randRange(3, GAMES_PER_SPLIT - 1);
            if (!impossibleSlots.has(s)) hardSlots.add(s);
            hardAttempts++;
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
        if (unclaimed) { phase = 'splitEnd'; return; }
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
            revealing = false;
            pendingPhase = null;
            rollRoundPlays();
            phase = 'match';
        } catch (e) {
            showToast('Error starting match: ' + e.message, 'error');
        }
    }

    // The match screen reveals each game before anything moves on. The result is recorded and
    // saved immediately (below); only the switch to the result screen waits for the reveal.
    let revealing = false;
    let pendingPhase = null;
    function goPhase(p) { if (revealing) pendingPhase = p; else phase = p; }
    function onRevealed() {
        revealing = false;
        if (pendingPhase) { phase = pendingPhase; pendingPhase = null; }
    }

    // What a play is actually resolved with: pickPlay folds each card's meta buff/nerf into
    // the stat, so the odds on screen must too.
    $: myPlayStats = squadReady ? Object.fromEntries(STAT_KEYS.map(s => [s,
        Math.round(starters.reduce((sum, c) => sum + (getEffectiveStats(c)[s] || 0) + getMetaModifier(c), 0) / starters.length) + tacticsLevel,
    ])) : {};
    const lineupOf = (cards, roles = ['TOP', 'JNG', 'MID', 'ADC', 'SUP', 'COACH']) => roles.map(role => ({ role, card: (cards && cards[role]) || null, flex: false }));
    // Frozen while a game is being revealed, like the Tournament screen.
    let blueSide = null;
    let redSide = null;
    $: if (!revealing || !blueSide) blueSide = { name: $teamIdentity.name, logo: $teamIdentity.logo, power: totalPower, lineup: lineupOf($squad), stats: myPlayStats };
    $: if (!revealing || !redSide) redSide = currentOpponent ? { name: currentOpponent.name, logo: currentOpponent.tag === 'BOSS' ? '💀' : '🛡️', power: currentOpponent.avgRating, lineup: lineupOf(currentOpponent.cards), stats: cpuStatAvgs } : null;
    $: metaChips = (() => {
        const out = [];
        if (currentOpponent && currentOpponent.tag) out.push({ text: currentOpponent.tag === 'BOSS' ? 'Boss opponent' : 'Hard opponent', tone: 'bad' });
        for (const [team, cards] of Object.entries(affectedSquad.buffed)) out.push({ text: `Meta buff · ${team} ×${cards.length}`, tone: 'good' });
        for (const [team, cards] of Object.entries(affectedSquad.nerfed)) out.push({ text: `Meta nerf · ${team} ×${cards.length}`, tone: 'bad' });
        return out;
    })();

    function pickPlay(play) {
        revealing = true;
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

            logMatch({ mode: 'season', result: matchWon ? 'win' : 'loss', opponent: currentOpponent.name, be: 0, xp: matchWon ? 150 : 60 });
            saveGame();
            goPhase('matchResult');
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
        const { total: earnedBE, bonus: wealthBonus } = grantBE(reward.be);
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
            trophyCase: [...(s.trophyCase || []), { split: s.currentSplit, name: splitName, year: splitYear, wins, losses, title: splitTitle.title, reward: earnedBE }]
        }));

        playSound('claim');
        showToast(`Split complete! ${splitTitle.title} — +${earnedBE} BE${wealthBonus > 0 ? ` (+${wealthBonus} Wealth)` : ''}`, 'success');
        saveGame();
        phase = 'overview';
    }

</script>

<section class="sn">
    {#if phase === 'overview'}
        <!-- ═══ Hero ═══ -->
        <header class="snh">
            <div class="snh-glow" aria-hidden="true"></div>
            <div class="snh-ring">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle class="ring-bg" cx="60" cy="60" r="52" />
                    <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {(splitActive || unclaimed ? matchIndex / GAMES_PER_SPLIT : 0) * 326.7} 999;" />
                </svg>
                {#if splitActive || unclaimed}
                    <span class="rg-n">{wins}–{losses}</span><span class="rg-l">{matchIndex}/{GAMES_PER_SPLIT} played</span>
                {:else}
                    <span class="rg-n">#{$seasonData.currentSplit}</span><span class="rg-l">split</span>
                {/if}
            </div>
            <div class="snh-text">
                <span class="snh-eyebrow"><Icon name="calendar" size={12} stroke={2.2} /> Season · Year {splitYear}</span>
                <h2 class="snh-title">{splitName} Split</h2>
                <p class="snh-sub">
                    {#if unclaimed}All ten matches played — your {splitTitle?.title || 'split'} reward is waiting.
                    {:else if splitActive}{remaining} match{remaining === 1 ? '' : 'es'} left.
                        {#if floorTier.wins > 0}<b style="color: {styleFor(floorTier.title).c};">{floorTier.title}</b> is secured{#if bestReachable && bestReachable.wins > floorTier.wins}, <b style="color: {styleFor(bestReachable.title).c};">{bestReachable.title}</b> is still on{/if}.
                        {:else if bestReachable}<b style="color: {styleFor(bestReachable.title).c};">{bestReachable.title}</b> is still on the table.{/if}
                    {:else}Ten best-of-five matches against sides that get tougher as the split goes on. Win six for a Regional Trophy.{/if}
                </p>
                <div class="year" aria-label="Splits this year">
                    {#each SPLIT_NAMES as n, i}
                        <span class="yr" class:yr-done={i < splitIdx} class:yr-now={i === splitIdx}>{n}</span>
                    {/each}
                </div>
            </div>
            <div class="snh-cta">
                {#if unclaimed}
                    <button class="cta cta-claim" on:click={() => phase = 'splitEnd'} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}><Icon name="gift" size={16} stroke={2.2} /> Claim split rewards</button>
                    <span class="cta-note">{wins}–{losses} · {splitTitle?.title}</span>
                {:else if splitActive}
                    <button class="cta" on:click={() => phase = 'schedule'} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}>Continue split <Icon name="arrow" size={16} /></button>
                    {#if nextOpp}<span class="cta-note">Next: {nextOpp.name} · {nextOpp.avgRating} power</span>{/if}
                {:else if !squadReady}
                    <button class="cta cta-warn" on:click={() => switchTab('squad')}>Build your squad <Icon name="arrow" size={16} /></button>
                    <span class="cta-note">Fill all five positions to start</span>
                {:else}
                    <button class="cta" on:click={startSplit} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name="play" size={15} stroke={2.2} /> Start {splitName} split</button>
                    <span class="cta-note">Your squad · {totalPower} power · locks for the split</span>
                {/if}
            </div>
        </header>

        <div class="sn-stats">
            <div class="ss" style="--c: #818cf8;"><span class="ss-ico"><Icon name="calendar" size={16} /></span><span class="ss-t"><span class="ss-n">{trophies.length}</span><span class="ss-l">Splits played</span></span></div>
            <div class="ss" style="--c: #34d399;"><span class="ss-ico"><Icon name="flag" size={16} /></span><span class="ss-t"><span class="ss-n">{regionalCount}</span><span class="ss-l">Regional trophies</span></span></div>
            <div class="ss" style="--c: #facc15;"><span class="ss-ico"><Icon name="crown" size={16} /></span><span class="ss-t"><span class="ss-n">{perfectCount}</span><span class="ss-l">Perfect splits</span></span></div>
            <div class="ss" style="--c: #38bdf8;"><span class="ss-ico"><Icon name="gem" size={16} /></span><span class="ss-t"><span class="ss-n">{totalEarned.toLocaleString()}</span><span class="ss-l">BE earned</span></span></div>
        </div>

        <div class="sn-grid">
            <!-- Reward ladder -->
            <section class="panel">
                <div class="p-head">
                    <span class="p-ico" style="--c: #fbbf24;"><Icon name="trophy" size={15} /></span>
                    <span class="p-title">Split rewards</span>
                    <span class="p-note">Your finish is your wins out of 10</span>
                </div>
                <div class="ladder">
                    {#each ladder as t (t.wins)}
                        <div class="ld ld-{t.state}" style="--c: {t.c};">
                            <span class="ld-ico"><Icon name={t.ico} size={16} stroke={2.1} /></span>
                            <span class="ld-text"><span class="ld-title">{t.title}</span><span class="ld-req">{t.req}{t.wins >= 6 ? ' · Regional Trophy' : ''}</span></span>
                            {#if t.state === 'floor'}<span class="ld-badge">Secured</span>{:else if t.state === 'gone'}<span class="ld-badge ld-badge-gone">Out of reach</span>{/if}
                            <span class="ld-be"><Icon name="gem" size={12} stroke={2.3} /> {t.be.toLocaleString()}</span>
                        </div>
                    {/each}
                </div>
            </section>

            <!-- Trophy case -->
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
                        <span class="empty-s">Every split you finish is kept here — win six to earn a Regional Trophy.</span>
                    </div>
                {:else}
                    <div class="trophies">
                        {#each [...trophies].reverse() as trophy}
                            {@const st = styleFor(trophy.title)}
                            <div class="tr" style="--c: {st.c};">
                                <span class="tr-ico"><Icon name={st.ico} size={16} stroke={2.1} /></span>
                                <span class="tr-info">
                                    <span class="tr-name">{trophy.name} Split · Year {trophy.year}</span>
                                    <span class="tr-sub"><b>{trophy.title}</b> · {trophy.wins}–{trophy.losses}</span>
                                </span>
                                {#if trophy.wins >= 6}<span class="tr-flag" title="Regional Trophy"><Icon name="flag" size={13} stroke={2.3} /></span>{/if}
                                <span class="tr-be">+{(trophy.reward || 0).toLocaleString()}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        </div>

    {:else if phase === 'schedule'}
        <!-- ═══ Split header ═══ -->
        <header class="sh">
            <div class="sh-nav">
                <button class="nav-btn" on:click={goOverview}><span class="flip"><Icon name="chevron" size={14} stroke={2.4} /></span> Season</button>
                <button class="nav-btn" on:click={goPlayMenu}><Icon name="play" size={12} stroke={2.4} /> Play menu</button>
            </div>
            <div class="sh-main">
                <div class="sh-titles">
                    <span class="snh-eyebrow"><Icon name="calendar" size={12} stroke={2.2} /> Season · Year {splitYear}</span>
                    <h2 class="sh-title">{splitName} Split</h2>
                    <p class="sh-sub"><b class="w">{wins}W</b> <b class="l">{losses}L</b> · {splitComplete ? 'all ten played' : `match ${matchIndex + 1} of ${GAMES_PER_SPLIT}`}</p>
                </div>
                <div class="pips" aria-label="Split results">
                    {#each opponents as o, i}
                        {@const r = ($seasonData.matchResults || [])[i]}
                        <span class="pip" class:pip-w={r === true} class:pip-l={r === false} class:pip-next={i === matchIndex && !splitComplete} class:pip-boss={o.tag === 'BOSS'} class:pip-hard={o.tag === 'HARD'} title="{i + 1}. {o.name}{o.tag ? ` (${o.tag})` : ''}">
                            {#if r === true}<Icon name="check" size={12} stroke={3} />{:else if r === false}<Icon name="close" size={11} stroke={3} />{:else}{i + 1}{/if}
                        </span>
                    {/each}
                </div>
            </div>
        </header>

        {#if opponents.length === 0}
            <div class="empty">
                <span class="empty-ico"><Icon name="calendar" size={24} /></span>
                <span class="empty-t">No fixtures yet</span>
                <span class="empty-s">Start a new split from the Season page.</span>
                <button class="cta cta-sm" on:click={goOverview}>Go to Season</button>
            </div>
        {:else}
            <!-- ═══ Next match ═══ -->
            {#if nextOpp}
                <section class="next" class:next-boss={nextOpp.tag === 'BOSS'} class:next-hard={nextOpp.tag === 'HARD'}>
                    <div class="nx-left">
                        <span class="nx-kicker">Next match · {matchIndex + 1} of {GAMES_PER_SPLIT}
                            {#if nextOpp.tag === 'BOSS'}<span class="tag tag-boss">Boss</span>{:else if nextOpp.tag === 'HARD'}<span class="tag tag-hard">Hard</span>{/if}
                        </span>
                        <h3 class="nx-name">{nextOpp.name}</h3>
                        <div class="nx-line">
                            {#each nextLineup as p}
                                <span class="nx-p" title="{p.role}: {p.card ? p.card.name : '—'}" style="--t: {p.card ? (TIER_COLORS[p.card.quality] || '#64748b') : '#334155'};">
                                    <img src={ROLE_ICONS[p.role]} alt={p.role}>
                                    <b>{p.card ? p.card.rating : '–'}</b>
                                    <span>{p.card ? p.card.name : '—'}</span>
                                </span>
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
                            <div class="nx-odds">
                                <span class="nx-odds-n" class:odds-good={nextOdds >= 0.6} class:odds-bad={nextOdds < 0.4}>{pct(nextOdds)}%</span>
                                <span class="nx-odds-l">to win the match</span>
                                <div class="nx-odds-bar"><div style="width: {pct(nextOdds)}%;"></div></div>
                            </div>
                        {/if}
                        {#if onCooldown}
                            <div class="nx-cd">
                                <svg viewBox="0 0 40 40" aria-hidden="true"><circle class="cd-bg" cx="20" cy="20" r="17" /><circle class="cd-fg" cx="20" cy="20" r="17" style="stroke-dasharray: {(cooldownLeft / cooldownSecs) * 106.8} 999;" /></svg>
                                <span>Ready in <b>{cooldownLeft}s</b></span>
                            </div>
                        {:else}
                            <button class="cta cta-play" on:click={() => startMatch(matchIndex)} use:pressFx={{ color: 'rgba(255,255,255,0.4)' }}><Icon name="play" size={15} stroke={2.2} /> Play match</button>
                        {/if}
                    </div>
                </section>
            {:else if splitComplete}
                <section class="next next-done">
                    <div class="nx-left">
                        <span class="nx-kicker">Split complete</span>
                        <h3 class="nx-name">{wins}–{losses} · {splitTitle?.title}</h3>
                    </div>
                    <div class="nx-right"><button class="cta cta-claim" on:click={() => phase = 'splitEnd'}><Icon name="gift" size={16} stroke={2.2} /> View split results</button></div>
                </section>
            {/if}

            <div class="sch-grid">
                <!-- Fixtures -->
                <section class="panel">
                    <div class="p-head">
                        <span class="p-ico" style="--c: #818cf8;"><Icon name="calendar" size={15} /></span>
                        <span class="p-title">Fixtures</span>
                        <span class="p-note">best of 5 · first to 3</span>
                    </div>
                    <div class="fx-list">
                        {#each opponents as opp, i}
                            {@const result = ($seasonData.matchResults || [])[i]}
                            {@const isNext = i === matchIndex}
                            {@const played = result !== null && result !== undefined}
                            <div class="fx" class:fx-win={played && result} class:fx-loss={played && !result} class:fx-next={isNext && !played} class:fx-future={!played && !isNext}>
                                <span class="fx-num">{i + 1}</span>
                                <span class="fx-name">{opp.name}</span>
                                {#if opp.tag === 'BOSS'}<span class="tag tag-boss">Boss</span>{:else if opp.tag === 'HARD'}<span class="tag tag-hard">Hard</span>{/if}
                                <span class="fx-pwr" class:fx-pwr-up={opp.avgRating > totalPower}>{opp.avgRating}</span>
                                {#if played}
                                    <span class="fx-res" class:fx-res-w={result}>{result ? 'Win' : 'Loss'}</span>
                                {:else if isNext}
                                    <span class="fx-res fx-res-next">Up next</span>
                                {:else}
                                    <span class="fx-res fx-res-dim">—</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <p class="p-foot">Power column: the opponent's power — shown in red when it is above your {totalPower}.</p>
                </section>

                <!-- Meta + bench -->
                <section class="panel">
                    <div class="p-head">
                        <span class="p-ico" style="--c: #a78bfa;"><Icon name="trend" size={15} /></span>
                        <span class="p-title">Team meta</span>
                        <span class="p-note">{#if currentMeta}Phase {metaPhase + 1} of 2 · {metaPhase === 0 ? 'changes after match 5' : 'final phase'}{:else}—{/if}</span>
                    </div>
                    {#if currentMeta}
                        <p class="meta-sum">
                            Real teams are in and out of form this split, and it moves your players' stats in every play.
                            {#if buffedMine || nerfedMine}Your squad: {#if buffedMine}<b class="w">{buffedMine} buffed</b>{/if}{#if buffedMine && nerfedMine} · {/if}{#if nerfedMine}<b class="l">{nerfedMine} slumping</b>{/if}.{:else}None of your players are affected right now.{/if}
                        </p>
                        <div class="meta-cols">
                            <div class="meta-col">
                                <div class="mc-label mc-buff"><Icon name="trend" size={12} stroke={2.4} /> In form</div>
                                {#each currentMeta.buffed as entry}
                                    {@const mine = affectedSquad.buffed[entry.team] || []}
                                    <div class="mt mt-buff" class:mt-mine={mine.length}>
                                        <div class="mt-head"><span class="mt-name">{entry.team}</span><span class="mt-amt">+{entry.amount}</span></div>
                                        {#if mine.length}<div class="mt-players">{#each mine as c}<span class="mt-p">{c.role} · {c.name}</span>{/each}</div>{/if}
                                    </div>
                                {/each}
                            </div>
                            <div class="meta-col">
                                <div class="mc-label mc-nerf"><span class="flipv"><Icon name="trend" size={12} stroke={2.4} /></span> Slumping</div>
                                {#each currentMeta.nerfed as entry}
                                    {@const mine = affectedSquad.nerfed[entry.team] || []}
                                    <div class="mt mt-nerf" class:mt-mine={mine.length}>
                                        <div class="mt-head"><span class="mt-name">{entry.team}</span><span class="mt-amt">−{entry.amount}</span></div>
                                        {#if mine.length}<div class="mt-players">{#each mine as c}<span class="mt-p">{c.role} · {c.name}</span>{/each}</div>{/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {:else}
                        <p class="meta-sum">No meta for this split.</p>
                    {/if}

                    {#if splitActive}
                        <div class="swap">
                            <div class="swap-head"><Icon name="lock" size={13} stroke={2.3} /> Squad locked for this split
                                {#if canSwap}<span class="swap-ok">{benchPlayers.length} bench player{benchPlayers.length > 1 ? 's' : ''} ready</span>
                                {:else if benchLevel > 0}<span class="swap-hint">Add bench players in Squad Builder to swap mid-split.</span>
                                {:else}<span class="swap-hint">Unlock bench slots with Bench Management.</span>{/if}
                            </div>
                            {#if canSwap}
                                <div class="swap-btns">
                                    {#each ['TOP','JNG','MID','ADC','SUP'] as role}
                                        <button class="swap-btn" on:click={() => openBenchPicker(role)}>
                                            <img src={ROLE_ICONS[role]} alt="">
                                            <span class="sw-text"><span class="sw-role">{role}</span><span class="sw-name">{$squad[role]?.name || 'Empty'}</span></span>
                                            <Icon name="trade" size={13} stroke={2.2} />
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </section>
            </div>
        {/if}

        <!-- Bench picker -->
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

    {:else if phase === 'match' && currentOpponent && blueSide && redSide}
        <MatchArena
            title={`${splitName} Split · Year ${splitYear}`}
            subtitle={`Match ${currentOpponent.index + 1} of ${GAMES_PER_SPLIT}`}
            accent="#818cf8"
            icon="calendar"
            blue={blueSide}
            red={redSide}
            plays={roundPlays}
            allPlays={PLAYS}
            scoreBlue={playerScore}
            scoreRed={cpuScore}
            winsNeeded={3}
            log={matchLog}
            tactics={tacticsLevel}
            chips={metaChips}
            on:pick={(e) => pickPlay(e.detail)}
            on:revealed={onRevealed}
        />

    {:else if phase === 'matchResult'}
        {@const matchWon = playerScore >= 3}
        {@const left = GAMES_PER_SPLIT - matchIndex}
        <MatchResult
            outcome={matchWon ? 'win' : 'lose'}
            kicker={`${splitName} Split · Match ${(currentOpponent?.index ?? 0) + 1}`}
            title={matchWon ? 'Match won' : 'Match lost'}
            subtitle={left > 0 ? `Split record ${wins}–${losses} · ${left} match${left === 1 ? '' : 'es'} to go` : `Split complete at ${wins}–${losses}`}
            icon={matchWon ? 'trophy' : 'shield'}
            blueName={$teamIdentity.name}
            redName={currentOpponent?.name || 'CPU'}
            scoreBlue={playerScore}
            scoreRed={cpuScore}
            rewards={[{ label: 'XP', value: `+${matchWon ? 150 : 60}`, tone: 'xp' }, { label: 'Battle Pass XP', value: `+${matchWon ? 75 : 25}`, tone: 'xp' }]}
        >
            <button class="mr-btn" on:click={backToSchedule}>
                {matchIndex >= GAMES_PER_SPLIT ? 'View split results' : 'Back to schedule'} <Icon name="arrow" size={15} />
            </button>
        </MatchResult>

    {:else if phase === 'splitEnd'}
        {@const st = styleFor(splitTitle?.title)}
        <MatchResult
            outcome={wins === 10 ? 'gold' : wins >= 6 ? 'win' : wins === 5 ? 'neutral' : 'lose'}
            kicker={`${splitName} Split · Year ${splitYear}`}
            title={splitTitle?.title || 'Split complete'}
            subtitle={wins >= 6 ? 'A Regional Trophy for the cabinet.' : wins === 5 ? 'Right in the middle of the table.' : 'Not this time — the next split starts fresh.'}
            icon={st.ico}
            blueName="Wins"
            redName="Losses"
            scoreBlue={wins}
            scoreRed={losses}
            rewards={splitReward ? [{ label: `BE · ${splitReward.label}`, value: `+${splitReward.be.toLocaleString()}`, tone: 'be' }, ...(wins >= 6 ? [{ label: 'Regional Trophy', value: '+1', tone: 'good' }] : [])] : []}
        >
            <button class="mr-btn" on:click={claimSplitReward}>Claim & start next split <Icon name="arrow" size={15} /></button>
        </MatchResult>
    {/if}
</section>

<style>
    .sn { display: flex; flex-direction: column; gap: 16px; max-width: 1400px; margin: 0 auto; padding-bottom: 40px; }

    /* ── Hero ── */
    .snh {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(129,140,248,0.18), transparent 65%), linear-gradient(120deg, #0f1027, #0b0e1a 60%);
        border: 1px solid rgba(129,140,248,0.28);
    }
    .snh-glow { position: absolute; right: -90px; top: -130px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, rgba(56,189,248,0.12), transparent 65%); }
    .snh-ring { position: relative; width: 112px; height: 112px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .snh-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 10; }
    .ring-fg { fill: none; stroke: #818cf8; stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(129,140,248,0.6)); transition: stroke-dasharray 0.6s ease; }
    .rg-n { position: relative; font-size: 24px; font-weight: 900; color: #eef2ff; line-height: 1; font-variant-numeric: tabular-nums; }
    .rg-l { position: relative; font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
    .snh-text { position: relative; flex: 1; min-width: 240px; }
    .snh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #818cf8; }
    .snh-title { font-size: clamp(26px, 3.2vw, 36px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .snh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; max-width: 560px; }
    .year { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
    .yr { padding: 4px 11px; border-radius: 100px; font-size: 11px; font-weight: 800; color: #475569; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.3); }
    .yr-done { color: #94a3b8; border-color: rgba(129,140,248,0.25); }
    .yr-now { color: #0b1020; background: #a5b4fc; border-color: #a5b4fc; }
    .snh-cta { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .cta-note { font-size: 11px; color: #64748b; font-weight: 700; text-align: right; }

    .cta { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 24px; border-radius: 14px; cursor: pointer; font-size: 14px; font-weight: 900; color: #fff; border: none; background: linear-gradient(135deg, #6366f1, #818cf8); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
    .cta:hover { transform: translateY(-1px); }
    .cta-warn { color: #1c1404; background: linear-gradient(135deg, #fcd34d, #f59e0b); box-shadow: 0 8px 24px rgba(245,158,11,0.3); }
    .cta-claim { color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 8px 24px rgba(16,185,129,0.4); animation: claimPulse 2.2s ease-in-out infinite; }
    @keyframes claimPulse { 50% { box-shadow: 0 8px 32px rgba(16,185,129,0.7); } }
    .cta-sm { padding: 10px 18px; font-size: 13px; margin-top: 8px; }
    .cta-play { width: 100%; }

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
    .p-foot { margin-top: 10px; font-size: 11px; color: #64748b; }

    /* Ladder */
    .ladder { display: flex; flex-direction: column; gap: 5px; }
    .ld { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 12px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); transition: opacity 0.2s; }
    .ld-ico { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); }
    .ld-text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .ld-title { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .ld-req { font-size: 11px; color: #64748b; }
    .ld-be { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 900; color: #7dd3fc; font-variant-numeric: tabular-nums; }
    .ld-badge { font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 100px; color: #0b1020; background: var(--c); }
    .ld-badge-gone { color: #64748b; background: none; border: 1px solid rgba(71,85,105,0.4); }
    .ld-floor { border-color: color-mix(in srgb, var(--c) 55%, transparent); background: linear-gradient(90deg, color-mix(in srgb, var(--c) 14%, transparent), rgba(15,23,42,0.55) 70%); }
    .ld-floor .ld-title { color: var(--c); }
    .ld-open { border-color: color-mix(in srgb, var(--c) 22%, rgba(51,65,85,0.3)); }
    .ld-passed { opacity: 0.4; }
    .ld-gone { opacity: 0.4; }
    .ld-gone .ld-title { text-decoration: line-through; text-decoration-color: rgba(148,163,184,0.5); }

    /* Trophies */
    .trophies { display: flex; flex-direction: column; gap: 5px; max-height: 470px; overflow-y: auto; }
    .tr { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 12px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .tr-ico { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); }
    .tr-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .tr-name { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .tr-sub { font-size: 11px; color: #64748b; }
    .tr-sub b { color: var(--c); font-weight: 800; }
    .tr-flag { width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #34d399; background: rgba(52,211,153,0.12); }
    .tr-be { font-size: 13px; font-weight: 900; color: #6ee7b7; font-variant-numeric: tabular-nums; }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 36px 16px; text-align: center; border-radius: 16px; border: 1px dashed rgba(71,85,105,0.4); }
    .empty-ico { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #818cf8; background: rgba(129,140,248,0.1); border: 1px solid rgba(129,140,248,0.25); margin-bottom: 4px; }
    .empty-t { font-size: 15px; font-weight: 900; color: #e2e8f0; }
    .empty-s { font-size: 12px; color: #64748b; max-width: 320px; }

    /* ── Split header ── */
    .sh { display: flex; flex-direction: column; gap: 12px; padding: 16px 20px 18px; border-radius: 22px; background: radial-gradient(60% 160% at 0% 0%, rgba(129,140,248,0.14), transparent 60%), rgba(12,16,28,0.7); border: 1px solid rgba(129,140,248,0.25); }
    .sh-nav { display: flex; gap: 6px; }
    .nav-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 800; color: #94a3b8; background: rgba(2,6,23,0.5); border: 1px solid rgba(71,85,105,0.35); }
    .nav-btn:hover { color: #fff; border-color: rgba(129,140,248,0.5); }
    .flip { display: inline-flex; transform: scaleX(-1); }
    .flipv { display: inline-flex; transform: scaleY(-1); }
    .sh-main { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .sh-title { font-size: clamp(24px, 3vw, 32px); font-weight: 900; color: #fff; margin-top: 4px; }
    .sh-sub { font-size: 13px; color: #94a3b8; margin-top: 2px; }
    .w { color: #34d399; font-weight: 900; }
    .l { color: #f87171; font-weight: 900; }
    .pips { display: flex; gap: 6px; flex-wrap: wrap; }
    .pip { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #475569; background: rgba(2,6,23,0.55); border: 1px solid rgba(71,85,105,0.35); }
    .pip-hard { border-color: rgba(245,158,11,0.45); }
    .pip-boss { border-color: rgba(239,68,68,0.55); }
    .pip-w { color: #052e16; background: #34d399; border-color: #34d399; }
    .pip-l { color: #fff; background: #ef4444; border-color: #ef4444; }
    .pip-next { color: #fff; border-color: #818cf8; background: rgba(99,102,241,0.35); box-shadow: 0 0 0 3px rgba(129,140,248,0.2); }

    /* ── Next match ── */
    .next {
        display: grid; grid-template-columns: minmax(0, 1.5fr) auto minmax(220px, 0.8fr); align-items: center; gap: 20px;
        padding: 20px 22px; border-radius: 22px;
        background: radial-gradient(70% 140% at 100% 50%, rgba(239,68,68,0.1), transparent 60%), radial-gradient(70% 140% at 0% 50%, rgba(59,130,246,0.12), transparent 60%), rgba(12,16,28,0.75);
        border: 1px solid rgba(129,140,248,0.3);
    }
    .next-hard { border-color: rgba(245,158,11,0.45); }
    .next-boss { border-color: rgba(239,68,68,0.55); background: radial-gradient(70% 140% at 100% 50%, rgba(239,68,68,0.2), transparent 60%), rgba(20,10,14,0.8); }
    .next-done { grid-template-columns: 1fr auto; border-color: rgba(52,211,153,0.4); }
    .nx-left { min-width: 0; }
    .nx-kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #818cf8; }
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

    .tag { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px; border-radius: 6px; }
    .tag-hard { color: #fbbf24; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); }
    .tag-boss { color: #fca5a5; background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.45); animation: bossPulse 2s ease-in-out infinite; }
    @keyframes bossPulse { 50% { opacity: 0.6; } }

    /* ── Fixtures + meta ── */
    .sch-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .fx-list { display: flex; flex-direction: column; gap: 5px; }
    .fx { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 12px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .fx-num { width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #64748b; background: rgba(2,6,23,0.5); }
    .fx-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 800; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fx-pwr { font-size: 12px; font-weight: 900; color: #94a3b8; font-variant-numeric: tabular-nums; min-width: 30px; text-align: right; }
    .fx-pwr-up { color: #f87171; }
    .fx-res { min-width: 62px; text-align: center; font-size: 11px; font-weight: 900; padding: 3px 8px; border-radius: 8px; color: #fca5a5; background: rgba(239,68,68,0.12); }
    .fx-res-w { color: #6ee7b7; background: rgba(52,211,153,0.12); }
    .fx-res-next { color: #c7d2fe; background: rgba(99,102,241,0.2); }
    .fx-res-dim { color: #334155; background: none; }
    .fx-win { border-color: rgba(52,211,153,0.2); }
    .fx-win .fx-num { color: #052e16; background: #34d399; }
    .fx-loss { border-color: rgba(239,68,68,0.2); }
    .fx-loss .fx-num { color: #fff; background: #ef4444; }
    .fx-next { border-color: rgba(129,140,248,0.55); background: rgba(99,102,241,0.12); }
    .fx-next .fx-num { color: #fff; background: #6366f1; }
    .fx-future { opacity: 0.6; }

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
    }
    @media (max-width: 900px) {
        .sn-grid, .sch-grid { grid-template-columns: 1fr; }
        .sn-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .snh-cta { align-items: flex-start; width: 100%; }
        .cta-note { text-align: left; }
    }
    @media (max-width: 600px) {
        .snh { padding: 18px; gap: 16px; }
        .snh-ring { width: 90px; height: 90px; }
        .rg-n { font-size: 19px; }
        .ss { padding: 12px; gap: 10px; }
        .ss-n { font-size: 19px; }
        .next { grid-template-columns: 1fr; padding: 16px; }
        .nx-vs { justify-content: flex-start; }
        .nx-right { flex-direction: column; align-items: stretch; }
        .cta-play { width: 100%; }
        .pips { gap: 4px; }
        .pip { width: 27px; height: 27px; border-radius: 8px; }
        .meta-cols { grid-template-columns: 1fr; }
    }
</style>
