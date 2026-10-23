<script>
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { club, squad, blueEssence, trackStats, unlocks, skills, grantXP, grantBPXP, grantBE, saveGame, logMatch } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { switchTab, pendingChallenge } from '../../stores/ui.js';
    import { getDB, makeUniqueId, LEGACY_TIERS, AWARD_TIERS, MYTHIC_TIERS, getEffectiveStats, getEffectiveRating, getEra } from '../../utils/cards.js';
    import { calcCoachBonus, calcRegionChem, calcEraChem, calcTeamChem, calcLegacyBonus } from '../../utils/combat.js';
    import { playSound } from '../../utils/sound.js';
    import { saveToStorage, loadFromStorage } from '../../utils/storage.js';
    import { get } from 'svelte/store';
    import { onMount } from 'svelte';

    // A friend challenge queued from the Friends tab: start it as a Rival Challenge.
    onMount(() => {
        const pc = get(pendingChallenge);
        if (pc) { pendingChallenge.set(null); startRivalChallenge(pc); }
    });

    let phase = 'lobby';
    let activeMode = null;
    let round = 0;
    let enemies = [];
    let currentEnemy = null;
    let matchLog = [];

    // Tiers a CPU opponent may never be built from: award cards are reserved for the top pools and
    // mythic (Hall of Legends) cards are perfect-100s that would be unbeatable in anyone's hands.
    const CPU_EXCLUDED_TIERS = [...AWARD_TIERS, ...MYTHIC_TIERS];

    // Salary Cap Mode state
    // Balance target: 85,000 CAP buys ~4 strong natural picks (91-94) plus a cheap fifth, or
    // 3 superstars (95+) plus two budget fillers. Five 95+ naturals costs 120,000 — and 90,000
    // even with every pick flexed — so an all-superstar squad stays impossible while flex is a
    // strategic option rather than a requirement. No coach on either side in this mode.
    const SALARY_BASE_BUDGET = 85000;
    let salaryBudget = SALARY_BASE_BUDGET;   // lifted per-run only if the club is too elite to fit
    const FLEX_DISCOUNT = 0.75;   // flex picks cost 25% less salary
    const FLEX_STAT_PCT = 0.10;   // flex picks get -10% to all stats in match
    // Rating bands priced in 4,000 steps so the base price AND its 25% flex discount both land on
    // a round 1,000 (20,000 -> 15,000) — a squad's cost can be added up in your head.
    const SALARY_BANDS = [
        { min: 99, cost: 32000 },
        { min: 97, cost: 28000 },
        { min: 95, cost: 24000 },
        { min: 93, cost: 20000 },
        { min: 91, cost: 16000 },
        { min: 88, cost: 12000 },
        { min: 85, cost: 8000 },
        { min: 0,  cost: 4000 },
    ];
    const SALARY_MIN_COST = 4000;   // cheapest band — every slot costs at least this much
    const ERA_OPTIONS = [
        { value: 'all', label: 'All Eras' },
        { value: 1, label: 'Era 1 (≤2013)' },
        { value: 2, label: 'Era 2 (2014-2016)' },
        { value: 3, label: 'Era 3 (2017-2019)' },
        { value: 4, label: 'Era 4 (2020-2022)' },
        { value: 5, label: 'Era 5 (2023-2025)' },
        { value: 6, label: 'Era 6 (2026+)' },
    ];
    let salarySquad = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
    let salaryPool = [];
    let salaryPickingRole = null;
    let salarySearch = '';
    let salaryEra = 'all';
    let _originalSquad = null;

    function salaryValue(rating) {
        const band = SALARY_BANDS.find(b => rating >= b.min);
        return band ? band.cost : SALARY_MIN_COST;
    }
    function flexSalaryValue(card, slotRole) {
        const base = salaryValue(card.rating);
        return card.role !== slotRole ? Math.round(base * FLEX_DISCOUNT) : base;
    }

    $: salaryUsed = ['TOP','JNG','MID','ADC','SUP'].reduce((s, role) => {
        const c = salarySquad[role];
        return c ? s + flexSalaryValue(c, role) : s;
    }, 0);
    $: salaryRemaining = salaryBudget - salaryUsed;
    $: salaryComplete = ['TOP','JNG','MID','ADC','SUP'].every(r => salarySquad[r]);
    $: salaryCardPool = (() => {
        const q = salarySearch.trim().toLowerCase();
        const roleOrder = ['TOP','JNG','MID','ADC','SUP'];
        // Text search also matches the year, so typing "2019" surfaces that year's cards.
        // Era dropdown and text search combine with AND.
        let cards = salaryPool.filter(c => {
            const hitText = !q || c.name.toLowerCase().includes(q) || c.team.toLowerCase().includes(q) || String(c.year || '').includes(q);
            const hitEra = salaryEra === 'all' || getEra(c.year) === salaryEra;
            return hitText && hitEra;
        });
        if (salaryPickingRole) {
            // same-role cards first, then flex options — no longer filtered out
            return cards.sort((a, b) => {
                const am = a.role === salaryPickingRole ? 0 : 1;
                const bm = b.role === salaryPickingRole ? 0 : 1;
                if (am !== bm) return am - bm;
                return b.rating - a.rating;
            });
        }
        return cards.sort((a,b) => { const ri = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role); return ri !== 0 ? ri : b.rating - a.rating; });
    })();

    // Cheapest legal five in a pool: the five cheapest cards with every pick flexed. A role
    // derangement always exists unless all five play the same role, in which case one of them
    // has to sit natural at full price.
    function cheapestSquadCost(pool) {
        const five = [...pool].sort((a, b) => salaryValue(a.rating) - salaryValue(b.rating)).slice(0, 5);
        if (five.length < 5) return Infinity;
        let cost = five.reduce((s, c) => s + Math.round(salaryValue(c.rating) * FLEX_DISCOUNT), 0);
        if (new Set(five.map(c => c.role)).size === 1) {
            const base = salaryValue(five[0].rating);
            cost += base - Math.round(base * FLEX_DISCOUNT);
        }
        return cost;
    }

    function startSalaryCap() {
        salarySquad = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
        salaryPickingRole = null;
        salarySearch = '';
        salaryEra = 'all';
        const nonCoach = get(club).filter(c => c.role !== 'COACH');
        const shuffled = [...nonCoach].sort(() => Math.random() - 0.5);
        const pool = shuffled.slice(0, 15);
        // A random draw from an elite club can hold no affordable five, and there is no reroll —
        // that would dead-end the mode. Swap the priciest draws for the club's cheapest cards until
        // a legal squad exists; only if the club itself has nothing cheaper is the cap lifted.
        const byCost = [...nonCoach].sort((a, b) => salaryValue(a.rating) - salaryValue(b.rating));
        for (const cheap of byCost) {
            if (cheapestSquadCost(pool) <= SALARY_BASE_BUDGET) break;
            if (pool.some(p => p.uniqueId === cheap.uniqueId)) continue;
            let priciest = 0;
            pool.forEach((c, i) => { if (salaryValue(c.rating) > salaryValue(pool[priciest].rating)) priciest = i; });
            pool[priciest] = cheap;
        }
        const floorCost = cheapestSquadCost(pool);
        salaryBudget = Number.isFinite(floorCost)
            ? Math.max(SALARY_BASE_BUDGET, Math.ceil(floorCost / 5000) * 5000)
            : SALARY_BASE_BUDGET;
        salaryPool = pool;
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
        const val = flexSalaryValue(card, role);
        // Cost freed from target slot's current occupant
        const currentInRoleVal = salarySquad[role] ? flexSalaryValue(salarySquad[role], role) : 0;
        // Cost freed from this card's current slot (if already assigned somewhere else)
        let freedFromCurrentSlot = 0;
        for (const r of ['TOP','JNG','MID','ADC','SUP']) {
            if (salarySquad[r] && salarySquad[r].uniqueId === card.uniqueId) {
                freedFromCurrentSlot = flexSalaryValue(card, r);
                break;
            }
        }
        if (salaryUsed - currentInRoleVal - freedFromCurrentSlot + val > salaryBudget) {
            // Already flexed? The discount hint is useless — tell them to free up salary instead.
            showToast(card.role !== role
                ? 'Over budget! Drop a pricier pick to free up salary.'
                : 'Over budget! Try a flex pick (off-role) for a 25% discount.', 'error');
            return;
        }
        const newSquad = { ...salarySquad };
        for (const r of ['TOP','JNG','MID','ADC','SUP']) {
            if (newSquad[r] && newSquad[r].uniqueId === card.uniqueId) newSquad[r] = null;
        }
        newSquad[role] = card;
        salarySquad = newSquad;
        salaryPickingRole = null;
    }

    function generateSalaryCpuTeam(roundIdx = 0) {
        const db = getDB();
        if (!db) return generateCpuTeam('worlds', 2);
        const roles = ['TOP','JNG','MID','ADC','SUP'];
        // Fill the slots in random order and jitter how much each one may spend, so the CPU
        // sometimes splurges on a star and pads with budget cards instead of always buying five
        // identical mid-tier players. It can never overspend: every unfilled slot keeps one
        // cheapest-band card in reserve. No coach — the player cannot draft one either.
        const order = [...roles].sort(() => Math.random() - 0.5);
        let remaining = salaryBudget;
        const team = {};
        const used = new Set();
        order.forEach((role, i) => {
            const reserve = (order.length - i - 1) * SALARY_MIN_COST;
            const evenShare = remaining / (order.length - i);
            const maxForSlot = Math.min(remaining - reserve, Math.max(SALARY_MIN_COST, Math.round(evenShare * (0.75 + Math.random() * 0.9))));
            const pool = db.filter(p => p.role === role && !used.has(p.id) && p.rating >= 80
                    && !CPU_EXCLUDED_TIERS.includes(p.quality) && salaryValue(p.rating) <= maxForSlot)
                .sort((a, b) => b.rating - a.rating);
            let pick = pool.length > 0 ? pool[Math.floor(Math.random() * Math.min(6, pool.length))] : null;
            if (!pick) {
                pick = db.filter(p => p.role === role && !used.has(p.id)
                        && !CPU_EXCLUDED_TIERS.includes(p.quality) && salaryValue(p.rating) <= remaining - reserve)
                    .sort((a, b) => b.rating - a.rating)[0];
            }
            if (pick) { team[role] = pick; used.add(pick.id); remaining -= salaryValue(pick.rating); }
        });
        const cards = Object.values(team).filter(Boolean);
        const rawAvg = cards.length > 0 ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : 85;
        // Same round-by-round escalation the other modes get, so the 5-round run still ramps up.
        const m = MODES.salarycap;
        const roundBonus = Math.round((m.cpuBonus || 0) * (roundIdx / Math.max(1, m.rounds - 1)));
        return { name: 'Cap Challenger', cards: team, avgRating: rawAvg + roundBonus };
    }

    function startSalaryTournament() {
        if (!salaryComplete) { showToast('Fill all 5 positions first.', 'error'); return; }
        _originalSquad = get(squad);
        // Salary Cap never lets you draft a coach, so the main squad's coach must NOT come along
        // for the ride — both sides run coach-less. calcCoachBonus(null) is 0.
        const builtSquad = { COACH: null };
        // Apply flex stat debuff (-10% all stats) for cards playing out of position
        for (const role of ['TOP','JNG','MID','ADC','SUP']) {
            const card = salarySquad[role];
            if (!card) continue;
            if (card.role !== role) {
                const debuffedStats = {};
                for (const [k, v] of Object.entries(card.stats || {})) {
                    debuffedStats[k] = Math.round(v * (1 - FLEX_STAT_PCT));
                }
                builtSquad[role] = { ...card, stats: debuffedStats, _flexPick: true };
            } else {
                builtSquad[role] = card;
            }
        }
        squad.set(builtSquad);
        activeMode = 'salarycap';
        enemies = [];
        for (let i = 0; i < MODES.salarycap.rounds; i++) enemies.push(generateSalaryCpuTeam(i));
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
        saveToStorage('lur_gr_cooldown', grCooldownEnd);
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
        // Back-compat: written raw via String(ms) before slots. A bare number is valid
        // JSON, so Number() reads both forms; an unreadable value becomes 0, which
        // means no cooldown rather than one that never expires.
        grCooldownEnd = Number(loadFromStorage('lur_gr_cooldown')) || 0;
        if (grCooldownEnd > Date.now()) {
            updateGRCooldown();
            grTimer = setInterval(updateGRCooldown, 1000);
        }
    }
    initGRCooldown();
    // Leaving the tab mid-run must give the real squad (and its coach) back, or Salary Cap's
    // coach-less five would stick around as the player's actual squad.
    onDestroy(() => {
        if (grTimer) clearInterval(grTimer);
        // Save too: the 10-minute autosave may already have written the temporary squad to disk.
        if (_originalSquad) { squad.set(_originalSquad); _originalSquad = null; saveGame(); }
    });

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
    $: coachBonus = calcCoachBonus($squad.COACH);
    $: regionChem = squadReady ? calcRegionChem(starters) : 0;
    $: eraChem = squadReady ? calcEraChem(starters) : 0;
    $: teamChem = squadReady ? calcTeamChem(starters) : 0;
    $: legacyBonus = calcLegacyBonus(starters);
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

    // ── The Play menu ──
    // The five standalone tournaments, in the order a club actually climbs them. The menu
    // draws them as one road, so this order IS the layout. Lock hints restate the can*
    // rules above in words — change one, change the other.
    $: circuit = [
        { id: 'cafe',       icon: 'coffee', name: 'Gaming Cafe',        detail: '3 rounds · CPU capped at Gold', unlocked: true,          hint: '',                                                     wins: ts.cafeWins || 0 },
        { id: 'regional',   icon: 'flag',   name: 'Regional Trophy',    detail: '5 rounds · Mixed tiers',        unlocked: canRegional,   hint: 'Finish one Season split',                              wins: ts.regionalSplitWon || 0 },
        { id: 'firststand', icon: 'flame',  name: 'First Stand',        detail: '5 rounds · Tough opponents',    unlocked: canFirstStand, hint: 'Win a Regional title — the Trophy or a 6-win split',  wins: ts.firstStandWon || 0 },
        { id: 'msi',        icon: 'waves',  name: 'MSI',                detail: '7 rounds · Elite competition',  unlocked: canMSI,        hint: 'Reach the Regional final, or win a Regional title',   wins: ts.msiWon || 0 },
        { id: 'worlds',     icon: 'trophy', name: 'World Championship', detail: '7 rounds · The ultimate test',  unlocked: canWorlds,     hint: 'Reach the First Stand final, or win a Regional title', wins: ts.worldsWon || 0 },
    ].map((s, i) => ({ ...s, step: i + 1, mode: MODES[s.id] }));
    // How far along the road the club is, for the progress line: the last unlocked stage.
    $: circuitReach = circuit.reduce((n, s, i) => s.unlocked ? i : n, 0);
    // The stage worth pointing at: the furthest one that is open but never won.
    $: recommendedId = ([...circuit].reverse().find(s => s.unlocked && !s.wins) || {}).id || null;

    const GR_PATH = [
        { icon: 'flag', label: 'Regional' }, { icon: 'flame', label: 'First Stand' }, { icon: 'flag', label: 'Regional' },
        { icon: 'waves', label: 'MSI' }, { icon: 'flag', label: 'Regional' }, { icon: 'trophy', label: 'Worlds' },
    ];

    $: salaryReady = $club.filter(c => c.role !== 'COACH').length >= 5;

    function enterStage(s) {
        if (!s.unlocked) return;
        if (!squadReady) { showToast('Fill all 5 starting positions first.', 'error'); switchTab('squad'); return; }
        playSound('click');
        startTournament(s.id);
    }

    const MODES = {
        cafe: { name: 'Gaming Cafe', icon: '☕', rounds: 3, minRating: 55, maxRating: 78, pool: 'regular', cpuBonus: 0, reward: 300, second: 150, color: '#10b981' },
        regional: { name: 'Regional Trophy', icon: '🏟️', rounds: 5, minRating: 70, maxRating: 90, pool: 'all', cpuBonus: 3, reward: 1500, second: 500, color: '#3b82f6', statKey: 'regionalSplitWon' },
        firststand: { name: 'First Stand', icon: '🟠', rounds: 5, minRating: 85, maxRating: 98, pool: 'elite', cpuBonus: 10, reward: 3000, second: 1000, color: '#f97316', statKey: 'firstStandWon' },
        msi: { name: 'MSI', icon: '🌊', rounds: 7, minRating: 90, maxRating: 99, pool: 'elite', cpuBonus: 15, reward: 5000, second: 2000, color: '#06b6d4', statKey: 'msiWon' },
        worlds: { name: 'World Championship', icon: '🏆', rounds: 7, minRating: 93, maxRating: 99, pool: 'elite', cpuBonus: 20, reward: 10000, second: 4000, color: '#f59e0b', statKey: 'worldsWon' },
        salarycap: { name: 'Salary Cap', icon: '💰', rounds: 5, minRating: 85, maxRating: 99, pool: 'elite', cpuBonus: 12, reward: 8000, second: 3000, color: '#34d399' },
        rival: { name: 'Rival Challenge', icon: '⚔️', rounds: 5, minRating: 88, maxRating: 99, pool: 'elite', cpuBonus: 15, reward: 3000, second: 1000, color: '#f59e0b' },
    };

    const GOLDEN_STAGES = [
        { mode: 'regional',   rounds: 3 },
        { mode: 'firststand', rounds: 3 },
        { mode: 'regional',   rounds: 3 },
        { mode: 'msi',        rounds: 3 },
        { mode: 'regional',   rounds: 3 },
        { mode: 'worlds',     rounds: 4 },
    ];

    function generateCpuTeam(mode, roundIdx) {
        const db = getDB();
        if (!db) return null;
        const m = MODES[mode];
        const rating = m.minRating + Math.round((m.maxRating - m.minRating) * (roundIdx / Math.max(1, m.rounds - 1)));
        const ratingCap = m.maxRating;
        let pool;
        if (m.pool === 'regular') pool = db.filter(p => p.role !== 'COACH' && ['Bronze','Silver','Gold'].includes(p.quality));
        else if (m.pool === 'elite') pool = db.filter(p => p.role !== 'COACH' && !MYTHIC_TIERS.includes(p.quality));
        else pool = db.filter(p => p.role !== 'COACH' && !CPU_EXCLUDED_TIERS.includes(p.quality));
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
        let totalAvg = rawAvg + roundBonus + grStageBonus;
        // Golden Road world final: the last Worlds stage used to reach ~140+ total power, which is
        // effectively unbeatable since a maxed squad tops out around 120. Keep the gauntlet winnable
        // but give its climax some variance — the FINAL game's headline power is randomised between
        // 115 (a beatable peak) and 130 (a genuine wall), so some runs end on a breather and others
        // on a nail-biter, and the difficulty scales differently each attempt. The lead-up Worlds
        // games ramp up toward the low end of that band. Enemy card stats are already fair (~98 raw),
        // so only the inflated headline power needs adjusting down to match.
        if (activeMode === 'goldenroad' && mode === 'worlds') {
            const grRounds = GOLDEN_STAGES[goldenRoadStage]?.rounds || m.rounds;
            const isFinalGame = roundIdx >= grRounds - 1;
            if (isFinalGame) {
                const finalPower = 115 + Math.floor(Math.random() * 16); // 115–130 inclusive
                totalAvg = Math.min(totalAvg, finalPower);
            } else {
                const ramp = 110 + Math.round((118 - 110) * (roundIdx / Math.max(1, grRounds - 1)));
                totalAvg = Math.min(totalAvg, ramp);
            }
        }
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
        const { mode: grMode0, rounds: grRounds0 } = GOLDEN_STAGES[0];
        const m = MODES[grMode0];
        enemies = [];
        for (let i = 0; i < grRounds0; i++) enemies.push(generateCpuTeam(grMode0, i));
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
        const mode = activeMode === 'goldenroad' ? GOLDEN_STAGES[goldenRoadStage].mode : activeMode;
        const m = MODES[mode];
        const isFinalist = !won && round >= enemies.length - 2;

        if (activeMode === 'goldenroad') {
            if (!won) {
                trackStats.update(s => ({ ...s, losses: (s.losses || 0) + 1 }));
                grantXP(100);
                playSound('lose');
                tournamentResult = { won: false, reward: 0, round: round + 1, isFinalist: false, goldenRoadFailed: true, stage: goldenRoadStage };
                phase = 'result';
                logMatch({ mode: 'goldenroad', result: 'loss', opponent: currentEnemy?.name || 'Golden Road', be: 0, xp: 100 });
                startGRCooldown();
                saveGame();
                return;
            }
            if (goldenRoadStage < GOLDEN_STAGES.length - 1) {
                goldenRoadStage++;
                const { mode: nextMode, rounds: nextRounds } = GOLDEN_STAGES[goldenRoadStage];
                const nm = MODES[nextMode];
                enemies = [];
                for (let i = 0; i < nextRounds; i++) enemies.push(generateCpuTeam(nextMode, i));
                round = 0; roundResults = []; matchLog = [];
                showToast(`Golden Road: Stage ${goldenRoadStage + 1}/6 — ${nm.name}!`, 'success');
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
            logMatch({ mode: 'goldenroad', result: 'win', opponent: 'Golden Road', be: grTotal, xp: 2000 });
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

        logMatch({ mode, result: won ? 'win' : isFinalist ? 'finalist' : 'loss', opponent: currentEnemy?.name || m?.name || 'Tournament', be: reward, xp: won ? (xpTable[mode] || 100) : Math.round((xpTable[mode] || 100) * 0.4) });
        saveGame();
        tournamentResult = { won, reward, bonus: rewardBonus || 0, round: round + 1, isFinalist };
        phase = 'result';
    }

    function backToLobby() {
        if (_originalSquad) { squad.set(_originalSquad); _originalSquad = null; saveGame(); }
        phase = 'lobby'; activeMode = null; tournamentResult = null; enemies = []; matchLog = [];
    }

    $: currentModeName = activeMode === 'goldenroad' ? `Golden Road — ${MODES[GOLDEN_STAGES[goldenRoadStage]?.mode]?.name || ''}` : (MODES[activeMode]?.name || '');
    $: currentModeColor = activeMode === 'goldenroad' ? '#fbbf24' : (MODES[activeMode]?.color || '#10b981');
</script>

<section class="trn">
    {#if phase === 'lobby'}
        <!-- ═══ PLAY MENU ═══
             Read top to bottom it is the shape of the game: the Season you grind, the five-stage
             circuit it opens (drawn as one road, in unlock order), the Golden Road that runs the
             whole circuit without a loss, and the side modes that sit outside the climb. -->
        <div class="pl">
            <header class="pl-hero">
                <div class="pl-hero-text">
                    <span class="pl-eyebrow"><Icon name="play" size={12} stroke={2.4} /> Play</span>
                    <h2 class="pl-title">Choose your stage</h2>
                    <p class="pl-sub">Every title opens the next one. Climb from a café bracket to the Summoner's Cup — or try the side modes for something different.</p>
                </div>
                <button class="pl-power" class:pl-power-off={!squadReady} on:click={() => switchTab('squad')} use:pressFx={{ color: 'rgba(96,165,250,0.35)' }}>
                    <span class="pp-ring" style="--pct: {squadReady ? Math.min(100, Math.round((totalPower / 130) * 100)) : 0}%;">
                        <span class="pp-val">{squadReady ? totalPower : '—'}</span>
                    </span>
                    <span class="pp-text">
                        <span class="pp-label">Squad power</span>
                        <span class="pp-state">{squadReady ? `${avgRating} avg · +${chemBonus} chemistry` : `${starters.length}/5 starters set`}</span>
                        <span class="pp-cta">{squadReady ? 'Manage squad' : 'Finish your squad'} <Icon name="arrow" size={13} /></span>
                    </span>
                </button>
            </header>

            <!-- Season — the main loop, so it gets the widest surface on the page -->
            <button class="pl-season" on:click={() => { playSound('click'); switchTab('season'); }} use:pressFx={{ color: 'rgba(129,140,248,0.35)' }}>
                <span class="ps-art" aria-hidden="true">
                    <span class="ps-orbit"></span>
                    <span class="ps-emblem"><Icon name="calendar" size={30} /></span>
                </span>
                <span class="ps-body">
                    <span class="ps-kicker">Your main climb</span>
                    <span class="ps-title">Season Splits</span>
                    <span class="ps-sub">10 opponents a split · {ts.splitsCompleted || 0} split{(ts.splitsCompleted || 0) === 1 ? '' : 's'} played · {ts.regionalSplitWon || 0} regional title{(ts.regionalSplitWon || 0) === 1 ? '' : 's'}</span>
                </span>
                <span class="ps-go">Open Season <Icon name="arrow" size={15} /></span>
            </button>

            <!-- The circuit -->
            <section class="pl-section">
                <div class="pl-sec-head">
                    <h3 class="pl-sec-title">The Circuit</h3>
                    <span class="pl-sec-note">{circuit.filter(s => s.unlocked).length}/5 stages open</span>
                </div>
                <div class="circuit" style="--reach: {circuitReach / (circuit.length - 1)};">
                    <div class="cr-track" aria-hidden="true"><div class="cr-track-fill"></div></div>
                    {#each circuit as s (s.id)}
                        <button
                            class="stage"
                            class:stage-locked={!s.unlocked}
                            class:stage-won={s.wins > 0}
                            class:stage-rec={recommendedId === s.id}
                            style="--c: {s.mode.color};"
                            aria-disabled={!s.unlocked}
                            on:click={() => enterStage(s)}
                            use:pressFx={{ color: `${s.mode.color}55` }}
                        >
                            <span class="st-glow" aria-hidden="true"></span>
                            {#if recommendedId === s.id && squadReady}<span class="st-ribbon">Up next</span>{/if}
                            <span class="st-emblem">
                                <Icon name={s.unlocked ? s.icon : 'lock'} size={26} />
                                <span class="st-step">{String(s.step).padStart(2, '0')}</span>
                            </span>
                            <span class="st-name">{s.name}</span>
                            <span class="st-detail">{s.unlocked ? s.detail : s.hint}</span>
                            {#if s.unlocked}
                                <span class="st-prizes">
                                    <span class="st-prize st-prize-w"><Icon name="gem" size={11} /> {s.mode.reward.toLocaleString()}</span>
                                    <span class="st-prize">2nd {s.mode.second.toLocaleString()}</span>
                                </span>
                            {/if}
                            <span class="st-foot">
                                <span class="st-diff" title="Opponent strength">
                                    {#each Array(5) as _, i}<span class="st-pip" class:st-pip-on={i < s.step}></span>{/each}
                                </span>
                                {#if s.wins > 0}<span class="st-wins"><Icon name="trophy" size={12} /> ×{s.wins}</span>{/if}
                            </span>
                            <span class="st-cta">
                                {#if !s.unlocked}<Icon name="lock" size={13} /> Locked
                                {:else if !squadReady}Set your squad
                                {:else}Enter <Icon name="chevron" size={14} stroke={2.4} />{/if}
                            </span>
                        </button>
                    {/each}
                </div>
            </section>

            <!-- Golden Road -->
            <section class="gold" class:gold-locked={!canGoldenRoad}>
                <div class="gold-sheen" aria-hidden="true"></div>
                <div class="gold-main">
                    <span class="gold-crown"><Icon name="crown" size={34} /></span>
                    <div class="gold-text">
                        <span class="gold-kicker">The gauntlet{#if (ts.goldenRoads || 0) > 0} · completed ×{ts.goldenRoads}{/if}</span>
                        <h3 class="gold-title">Golden Road</h3>
                        <p class="gold-sub">{canGoldenRoad ? 'The whole circuit back to back — 19 games, and a single loss ends the run.' : 'Finish one Season split to open the road.'}</p>
                    </div>
                    <div class="gold-act">
                        {#if canGoldenRoad}<span class="gold-prize">25,000 BE + Glory</span>{/if}
                        {#if grOnCooldown}
                            <span class="mode-cooldown">{grCooldownDisplay}</span>
                        {:else if !canGoldenRoad}
                            <span class="gold-lock"><Icon name="lock" size={14} /> Locked</span>
                        {:else if !squadReady}
                            <span class="mode-need">Need squad</span>
                        {:else}
                            <button class="gold-btn" on:click={() => { playSound('click'); startGoldenRoad(); }} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>Begin the road</button>
                        {/if}
                    </div>
                </div>
                <ol class="gold-path">
                    {#each GR_PATH as g, i}
                        <li class="gp-node" class:gp-final={i === GR_PATH.length - 1}>
                            <span class="gp-dot"><Icon name={g.icon} size={15} /></span>
                            <span class="gp-label">{g.label}</span>
                            <span class="gp-games">{i === GR_PATH.length - 1 ? 4 : 3} games</span>
                        </li>
                    {/each}
                </ol>
            </section>

            <!-- Side modes -->
            <section class="pl-section">
                <div class="pl-sec-head">
                    <h3 class="pl-sec-title">Challenge Modes</h3>
                    <span class="pl-sec-note">Outside the climb — play any time</span>
                </div>
                <div class="tiles">
                    <button class="tile" style="--c: #f87171;" on:click={() => { playSound('click'); switchTab('tower'); }} use:pressFx={{ color: 'rgba(248,113,113,0.4)' }}>
                        <span class="tl-art" aria-hidden="true"><Icon name="tower" size={40} stroke={1.5} /></span>
                        <span class="tl-name">Infinity Tower</span>
                        <span class="tl-sub">Endless floors, an upgrade after every fight. How high can you go?</span>
                        <span class="tl-meta">{#if (ts.towerHighestFloor || 0) > 0}Best: floor {ts.towerHighestFloor}{:else}BE every 10 floors{/if}</span>
                    </button>
                    <button class="tile" style="--c: #c084fc;" on:click={() => { playSound('click'); switchTab('draft'); }} use:pressFx={{ color: 'rgba(192,132,252,0.4)' }}>
                        <span class="tl-art" aria-hidden="true"><Icon name="cards" size={40} stroke={1.5} /></span>
                        <span class="tl-name">Draft Mode</span>
                        <span class="tl-sub">15 random cards, 5 bans each — build a five on the spot. Off-role picks take −10.</span>
                        <span class="tl-meta">Win 2,000 · Loss 500</span>
                    </button>
                    <button class="tile" class:tile-off={!salaryReady} style="--c: #34d399;" aria-disabled={!salaryReady} on:click={() => { if (!salaryReady) { showToast('You need at least 5 non-coach cards in your club.', 'error'); return; } playSound('click'); startSalaryCap(); }} use:pressFx={{ color: 'rgba(52,211,153,0.4)' }}>
                        <span class="tl-art" aria-hidden="true"><Icon name="coins" size={40} stroke={1.5} /></span>
                        <span class="tl-name">Salary Cap</span>
                        <span class="tl-sub">Build a five inside an 85,000 CAP budget, priced by rating. No coach.</span>
                        <span class="tl-meta">{salaryReady ? 'Win 8,000 · 2nd 3,000' : 'Needs 5+ cards'}</span>
                    </button>
                    <button class="tile" class:tile-off={!squadReady} style="--c: #f59e0b;" aria-disabled={!squadReady} on:click={() => { if (!squadReady) { showToast('Fill all 5 starting positions first.', 'error'); return; } playSound('click'); phase = 'rival_lobby'; loadRivals(); }} use:pressFx={{ color: 'rgba(245,158,11,0.4)' }}>
                        <span class="tl-art" aria-hidden="true"><Icon name="swords" size={40} stroke={1.5} /></span>
                        <span class="tl-name">Rival Challenge</span>
                        <span class="tl-sub">Take on another manager's saved squad from the leaderboard. First to three.</span>
                        <span class="tl-meta">{squadReady ? 'Win 3,000 · 2nd 1,000' : 'Needs a full squad'}</span>
                    </button>
                </div>
            </section>
        </div>

    {:else if phase === 'salary_lobby'}
        <div class="trn-head">
            <h2 class="trn-title" style="color:#34d399;">💰 Salary Cap Mode</h2>
            <p class="trn-desc">Click a role slot, then pick a card. Budget: {salaryBudget.toLocaleString()} CAP · Cost is banded by rating, 4,000 → 32,000. No coach in this mode. <span style="color:#38bdf8;">Flex picks (wrong role) cost 25% less but get −10% stats in match.</span></p>
        </div>
        <div class="salary-header">
            <div class="salary-budget-bar">
                <div class="sb-label">Budget</div>
                <div class="sb-bar-track">
                    <div class="sb-bar-fill" style="width:{Math.min(100,(salaryUsed/salaryBudget)*100)}%; background:{salaryUsed > salaryBudget ? '#ef4444' : '#34d399'};"></div>
                </div>
                <div class="sb-numbers">
                    <span style="color:{salaryUsed > salaryBudget ? '#ef4444' : '#34d399'};">{salaryUsed.toLocaleString()} used</span>
                    <span style="color:#64748b;"> / </span>
                    <span>{salaryBudget.toLocaleString()} CAP</span>
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
                            {@const slotCard = salarySquad[role]}
                            {@const isFlexSlot = slotCard.role !== role}
                            <div class="ss2-card-area">
                                <Card card={slotCard} mini={true} onclick={() => {}} />
                            </div>
                            <div class="ss2-card-meta">
                                <span class="ss2-cap-cost" style="color:{isFlexSlot ? '#38bdf8' : '#34d399'};">{flexSalaryValue(slotCard, role).toLocaleString()} CAP{isFlexSlot ? ' (flex)' : ''}</span>
                                {#if isFlexSlot}<span class="flex-slot-badge">FLEX −10%</span>{/if}
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
                        {@const nativeCount = salaryCardPool.filter(c => c.role === salaryPickingRole).length}
                        {@const flexCount = salaryCardPool.length - nativeCount}
                        <span class="spool-title" style="color:#34d399;">Picking {salaryPickingRole} — {nativeCount} native · <span style="color:#38bdf8;">{flexCount} flex (−25% cost)</span></span>
                    {:else}
                        <span class="spool-title">All {salaryPool.length} cards · Click a slot first</span>
                    {/if}
                    <div class="spool-filters">
                        <select class="spool-search spool-era" bind:value={salaryEra}>
                            {#each ERA_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
                        </select>
                        <input class="spool-search" type="text" placeholder="Name, team or year..." bind:value={salarySearch} />
                    </div>
                </div>
                <div class="salary-pool-grid">
                    {#each salaryCardPool as card}
                        {@const assigned = Object.values(salarySquad).some(c => c && c.uniqueId === card.uniqueId)}
                        {@const isFlex = salaryPickingRole !== null && card.role !== salaryPickingRole}
                        {@const targetRole = salaryPickingRole || card.role}
                        {@const val = flexSalaryValue(card, targetRole)}
                        {@const swapCost = salaryPickingRole && salarySquad[salaryPickingRole] ? flexSalaryValue(salarySquad[salaryPickingRole], salaryPickingRole) : 0}
                        {@const overBudget = !assigned && (val - swapCost) > salaryRemaining}
                        <!-- svelte-ignore a11y-click-events-have-key-events --><!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div class="pool-card-wrap" class:pool-assigned={assigned} class:pool-over={overBudget && !assigned} class:pool-flex={isFlex && !assigned} on:click={() => clickPoolCard(card)}>
                            <Card card={card} mini={true} onclick={() => {}} />
                            <div class="pool-card-footer">
                                <span class="pool-role-tag" style="color:{isFlex ? '#38bdf8' : ''};">{card.role}{isFlex ? ' →FLEX' : ''}</span>
                                <span class="pool-cost-tag" style="color:{assigned ? '#94a3b8' : overBudget ? '#ef4444' : isFlex ? '#38bdf8' : '#34d399'};">{val.toLocaleString()}</span>
                            </div>
                            {#if assigned}
                                <div class="pool-badge pool-badge-in">IN SQUAD</div>
                            {:else if isFlex}
                                <div class="pool-badge pool-badge-flex">FLEX −10%</div>
                            {/if}
                        </div>
                    {/each}
                    {#if salaryCardPool.length === 0}
                        <p style="color:#475569; font-size:12px; padding:12px;">No cards match your filters.</p>
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
                        <span class="gr-stage" class:gr-done={si < goldenRoadStage} class:gr-active={si === goldenRoadStage} class:gr-future={si > goldenRoadStage}>{MODES[stg.mode].icon}</span>
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
                {:else if tournamentResult?.goldenRoadFailed}Golden Road Failed — Stage {(tournamentResult?.stage||0)+1}/6
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

    /* ═══ PLAY MENU ═══ */
    .pl { display: flex; flex-direction: column; gap: 22px; }

    /* Hero */
    .pl-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    .pl-hero-text { max-width: 640px; }
    .pl-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #818cf8; padding: 4px 10px; border-radius: 100px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.22); }
    .pl-title { font-size: clamp(26px, 3.2vw, 38px); font-weight: 900; color: #f1f5f9; letter-spacing: -0.5px; margin-top: 10px; line-height: 1.05; }
    .pl-sub { font-size: 13px; color: #7c8aa0; margin-top: 8px; line-height: 1.55; }

    .pl-power {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px;
        padding: 12px 20px 12px 12px; border-radius: 18px; cursor: pointer; text-align: left;
        background: linear-gradient(140deg, rgba(30,58,138,0.32), rgba(12,16,28,0.75));
        border: 1px solid rgba(96,165,250,0.22);
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    }
    .pl-power:hover { border-color: rgba(96,165,250,0.45); transform: translateY(-2px); }
    .pl-power-off { background: linear-gradient(140deg, rgba(127,29,29,0.25), rgba(12,16,28,0.75)); border-color: rgba(248,113,113,0.25); }
    .pp-ring {
        position: relative; z-index: 1; width: 66px; height: 66px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: conic-gradient(#60a5fa var(--pct), rgba(51,65,85,0.45) 0);
    }
    .pp-ring::after { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: #0b1020; }
    .pp-val { position: relative; z-index: 1; font-size: 20px; font-weight: 900; color: #e0f2fe; }
    .pp-text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; }
    .pp-label { font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #60a5fa; }
    .pl-power-off .pp-label { color: #f87171; }
    .pp-state { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .pp-cta { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; color: #93c5fd; }

    /* Season */
    .pl-season {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 22px;
        width: 100%; padding: 22px 26px; border-radius: 22px; cursor: pointer; text-align: left;
        background:
            radial-gradient(500px 220px at var(--mx, 15%) var(--my, 50%), rgba(129,140,248,0.18), transparent 70%),
            linear-gradient(120deg, #18185a 0%, #10163a 45%, #0b1020 100%);
        border: 1px solid rgba(129,140,248,0.28);
        box-shadow: 0 16px 40px rgba(30,27,75,0.35);
    }
    .pl-season:hover { transform: translateY(-2px); border-color: rgba(165,180,252,0.5); box-shadow: 0 20px 50px rgba(67,56,202,0.3); }
    .ps-art { position: relative; z-index: 1; width: 76px; height: 76px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .ps-orbit { position: absolute; inset: 0; border-radius: 50%; border: 1.5px dashed rgba(165,180,252,0.45); animation: plSpin 18s linear infinite; }
    .ps-emblem { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #e0e7ff; background: linear-gradient(140deg, #6366f1, #4338ca); box-shadow: 0 0 26px rgba(99,102,241,0.55); }
    .ps-body { position: relative; z-index: 1; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .ps-kicker { font-size: 9px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #a5b4fc; }
    .ps-title { font-size: 24px; font-weight: 900; color: #fff; letter-spacing: -0.3px; }
    .ps-sub { font-size: 12px; color: #a5b4fc; opacity: 0.85; }
    .ps-go { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 14px; font-size: 13px; font-weight: 900; color: #1e1b4b; background: linear-gradient(135deg, #e0e7ff, #a5b4fc); flex-shrink: 0; box-shadow: 0 6px 18px rgba(99,102,241,0.35); }
    .pl-season:hover .ps-go { box-shadow: 0 8px 26px rgba(129,140,248,0.55); }
    @keyframes plSpin { to { transform: rotate(360deg); } }

    /* Section heads */
    .pl-section { display: flex; flex-direction: column; gap: 12px; }
    .pl-sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .pl-sec-title { font-size: 13px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #cbd5e1; }
    .pl-sec-note { font-size: 11px; font-weight: 700; color: #56637a; }

    /* The circuit — one road, five stops */
    .circuit { position: relative; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .cr-track { position: absolute; left: 10%; right: 10%; top: 47px; height: 3px; border-radius: 3px; background: rgba(51,65,85,0.5); z-index: 0; }
    .cr-track-fill { height: 100%; width: calc(var(--reach) * 100%); border-radius: 3px; background: linear-gradient(90deg, #10b981, #3b82f6, #f97316, #06b6d4, #f59e0b); box-shadow: 0 0 12px rgba(245,158,11,0.35); transition: width 0.6s ease; }
    .stage {
        position: relative; overflow: hidden; z-index: 1;
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px;
        padding: 18px 14px 14px; border-radius: 20px; cursor: pointer;
        background: linear-gradient(180deg, color-mix(in srgb, var(--c) 11%, #0c1120) 0%, #0a0e1a 70%);
        border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
        transition: transform 0.18s cubic-bezier(.2,.8,.3,1.2), box-shadow 0.18s, border-color 0.18s;
    }
    .stage:hover:not(.stage-locked) { transform: translateY(-5px); border-color: color-mix(in srgb, var(--c) 65%, transparent); box-shadow: 0 16px 34px color-mix(in srgb, var(--c) 22%, transparent); }
    .stage:active:not(.stage-locked) { transform: translateY(-1px) scale(0.98); }
    .st-glow { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.2s; background: radial-gradient(180px 140px at var(--mx, 50%) var(--my, 30%), color-mix(in srgb, var(--c) 28%, transparent), transparent 70%); }
    .stage:hover .st-glow { opacity: 1; }
    .st-ribbon { position: absolute; top: 10px; right: -28px; transform: rotate(35deg); padding: 3px 30px; font-size: 8px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #0b1020; background: var(--c); z-index: 2; }
    .st-emblem {
        position: relative; z-index: 1; width: 58px; height: 58px; border-radius: 18px; transform: rotate(45deg);
        display: flex; align-items: center; justify-content: center; color: #fff;
        background: linear-gradient(140deg, var(--c), color-mix(in srgb, var(--c) 55%, #000));
        box-shadow: 0 0 0 4px #0a0e1a, 0 0 22px color-mix(in srgb, var(--c) 55%, transparent);
        /* Rotated 45°, the square's corners stick out ~12px past its box — and the step badge
           hangs off the bottom one — so the gap below has to cover both. */
        margin: 6px 0 20px;
    }
    .st-emblem > :global(svg) { transform: rotate(-45deg); }
    .st-step { position: absolute; bottom: -6px; right: -6px; transform: rotate(-45deg); font-size: 9px; font-weight: 900; color: var(--c); background: #0a0e1a; border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); border-radius: 7px; padding: 1px 4px; }
    .st-name { position: relative; z-index: 1; font-size: 15px; font-weight: 900; color: #f1f5f9; line-height: 1.15; }
    .st-detail { position: relative; z-index: 1; font-size: 11px; color: #7c8aa0; line-height: 1.4; min-height: 30px; }
    .st-prizes { position: relative; z-index: 1; display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .st-prize { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; color: #94a3b8; padding: 2px 8px; border-radius: 100px; background: rgba(15,23,42,0.7); border: 1px solid rgba(71,85,105,0.3); }
    .st-prize-w { color: #6ee7b7; border-color: rgba(52,211,153,0.3); }
    .st-foot { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; margin-top: 2px; min-height: 16px; }
    .st-diff { display: inline-flex; gap: 3px; }
    .st-pip { width: 6px; height: 6px; border-radius: 2px; background: rgba(71,85,105,0.5); transform: rotate(45deg); }
    .st-pip-on { background: var(--c); }
    .st-wins { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 900; color: #fbbf24; }
    .st-cta {
        position: relative; z-index: 1; margin-top: auto; width: 100%;
        display: inline-flex; align-items: center; justify-content: center; gap: 4px;
        padding: 9px 10px; border-radius: 12px; font-size: 12px; font-weight: 900; letter-spacing: 0.5px;
        color: #0b1020; background: var(--c);
        box-shadow: 0 4px 14px color-mix(in srgb, var(--c) 35%, transparent);
    }
    .stage-won .st-emblem { box-shadow: 0 0 0 4px #0a0e1a, 0 0 0 6px color-mix(in srgb, #fbbf24 60%, transparent), 0 0 24px color-mix(in srgb, var(--c) 55%, transparent); }
    .stage-rec { border-color: color-mix(in srgb, var(--c) 70%, transparent); animation: stRec 2.6s ease-in-out infinite; }
    @keyframes stRec { 0%,100% { box-shadow: 0 0 0 color-mix(in srgb, var(--c) 0%, transparent); } 50% { box-shadow: 0 0 26px color-mix(in srgb, var(--c) 35%, transparent); } }
    .stage-locked { cursor: not-allowed; background: #0a0d17; border-color: rgba(51,65,85,0.3); }
    .stage-locked .st-emblem { background: #141a2a; color: #475569; box-shadow: 0 0 0 4px #0a0e1a; }
    .stage-locked .st-step { color: #475569; border-color: rgba(71,85,105,0.4); }
    .stage-locked .st-name { color: #64748b; }
    .stage-locked .st-detail { color: #94a3b8; font-weight: 600; }
    .stage-locked .st-pip-on { background: #334155; }
    .stage-locked .st-cta { background: rgba(30,41,59,0.6); color: #64748b; box-shadow: none; }

    /* Golden Road */
    .gold {
        position: relative; overflow: hidden; border-radius: 22px; padding: 22px 26px;
        background: linear-gradient(120deg, #2a1d05 0%, #1a1306 45%, #0d0b07 100%);
        border: 1px solid rgba(251,191,36,0.32);
        box-shadow: 0 16px 40px rgba(120,80,10,0.18), inset 0 1px 0 rgba(255,230,160,0.12);
    }
    .gold-sheen { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 35%, rgba(255,226,140,0.10) 48%, rgba(255,240,190,0.16) 50%, rgba(255,226,140,0.10) 52%, transparent 65%); background-size: 250% 100%; animation: goldSheen 6s ease-in-out infinite; }
    @keyframes goldSheen { 0% { background-position: 150% 0; } 60%, 100% { background-position: -100% 0; } }
    .gold-main { position: relative; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .gold-crown { width: 64px; height: 64px; border-radius: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #1c1405; background: linear-gradient(140deg, #fde68a, #f59e0b 55%, #b45309); box-shadow: 0 0 30px rgba(251,191,36,0.45); }
    .gold-text { flex: 1; min-width: 220px; }
    .gold-kicker { font-size: 9px; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; color: #d4a54a; }
    .gold-title { font-size: 26px; font-weight: 900; letter-spacing: -0.3px; background: linear-gradient(135deg, #fef3c7, #fbbf24 50%, #f59e0b); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .gold-sub { font-size: 12px; color: #c8a96a; margin-top: 2px; }
    .gold-act { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .gold-prize { font-size: 12px; font-weight: 900; color: #fde68a; padding: 6px 12px; border-radius: 100px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); }
    .gold-btn { position: relative; overflow: hidden; padding: 12px 26px; border-radius: 14px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; letter-spacing: 0.5px; color: #1c1405; background: linear-gradient(135deg, #fde68a, #fbbf24 45%, #f59e0b); box-shadow: 0 6px 22px rgba(245,158,11,0.4); }
    .gold-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(245,158,11,0.55); }
    .gold-lock { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #8a7448; }
    .gold-path { position: relative; list-style: none; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 20px; }
    .gold-path::before { content: ''; position: absolute; left: 8.33%; right: 8.33%; top: 16px; height: 2px; background: linear-gradient(90deg, rgba(251,191,36,0.25), rgba(251,191,36,0.75)); }
    .gp-node { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
    .gp-dot { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fbbf24; background: #1a1306; border: 1.5px solid rgba(251,191,36,0.55); }
    .gp-final .gp-dot { color: #1c1405; background: linear-gradient(140deg, #fde68a, #f59e0b); box-shadow: 0 0 18px rgba(251,191,36,0.55); }
    .gp-label { font-size: 11px; font-weight: 800; color: #e7cf94; }
    .gp-games { font-size: 9px; font-weight: 700; color: #8a7448; }
    .gold-locked { filter: saturate(0.35); opacity: 0.7; }
    .gold-locked .gold-sheen { animation: none; }

    /* Side-mode tiles */
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .tile {
        position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 6px; text-align: left;
        min-height: 190px; padding: 18px; border-radius: 20px; cursor: pointer;
        background:
            radial-gradient(220px 160px at var(--mx, 85%) var(--my, 10%), color-mix(in srgb, var(--c) 20%, transparent), transparent 70%),
            linear-gradient(160deg, color-mix(in srgb, var(--c) 9%, #0c1120), #0a0e1a 75%);
        border: 1px solid color-mix(in srgb, var(--c) 24%, transparent);
        transition: transform 0.18s cubic-bezier(.2,.8,.3,1.2), border-color 0.18s, box-shadow 0.18s;
    }
    .tile:hover { transform: translateY(-4px) rotate(-0.4deg); border-color: color-mix(in srgb, var(--c) 60%, transparent); box-shadow: 0 16px 34px color-mix(in srgb, var(--c) 18%, transparent); }
    .tl-art { position: relative; z-index: 1; width: 62px; height: 62px; border-radius: 18px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); margin-bottom: 6px; transition: transform 0.25s cubic-bezier(.2,.8,.3,1.4); }
    .tile:hover .tl-art { transform: scale(1.08) rotate(-6deg); }
    .tl-name { position: relative; z-index: 1; font-size: 16px; font-weight: 900; color: #f1f5f9; }
    .tl-sub { position: relative; z-index: 1; font-size: 11px; color: #7c8aa0; line-height: 1.5; }
    .tl-meta { position: relative; z-index: 1; margin-top: auto; font-size: 11px; font-weight: 900; color: var(--c); }
    .tile-off { opacity: 0.55; }
    .tile-off:hover { transform: none; box-shadow: none; }

    @media (max-width: 1250px) {
        .circuit { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .cr-track { display: none; }
        .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 700px) {
        .circuit { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pl-season { flex-wrap: wrap; padding: 18px; }
        .ps-go { width: 100%; justify-content: center; }
        .gold { padding: 18px; }
        .gold-path { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 14px; }
        .gold-path::before { display: none; }
        .pl-power { width: 100%; }
    }
    @media (max-width: 440px) {
        .circuit, .tiles { grid-template-columns: 1fr; }
        /* One column of five tall cards is a long scroll on a phone — lay each stop on its
           side instead: emblem on the left, the details beside it, the button underneath. */
        .stage { display: grid; grid-template-columns: 64px 1fr; column-gap: 12px; row-gap: 3px; align-items: center; justify-items: start; text-align: left; padding: 14px; }
        .st-emblem { grid-row: 1 / span 4; justify-self: center; width: 44px; height: 44px; border-radius: 13px; margin: 0; }
        .st-step { bottom: -7px; right: -7px; }
        .st-detail { min-height: 0; }
        .st-prizes { justify-content: flex-start; }
        .st-cta { grid-column: 1 / -1; margin-top: 8px; }
        .tile { min-height: 0; }
    }

    .mode-enter-btn {
        padding: 10px 24px; border-radius: 10px; color: white; font-weight: 900;
        font-size: 12px; border: none; cursor: pointer; flex-shrink: 0;
        transition: all 0.15s; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .mode-enter-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
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
    .ss2-cap-cost { font-size: 10px; font-weight: 700; }
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
    .spool-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .spool-era { width: auto; font-family: inherit; font-weight: 700; cursor: pointer; }
    .salary-pool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); gap: 10px; }
    .pool-card-wrap { position: relative; border-radius: 14px; overflow: hidden; border: 2px solid transparent; cursor: pointer; transition: all 0.15s; background: rgba(15,23,42,0.3); }
    .pool-card-wrap:hover:not(.pool-assigned):not(.pool-over) { border-color: rgba(52,211,153,0.4); box-shadow: 0 0 10px rgba(52,211,153,0.2); }
    .pool-assigned { opacity: 0.5; cursor: default; }
    .pool-over { opacity: 0.4; }
    .pool-card-footer { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 2px; }
    .pool-role-tag { font-size: 8px; font-weight: 900; text-transform: uppercase; color: #475569; }
    .pool-cost-tag { font-size: 9px; font-weight: 700; }
    .pool-badge { position: absolute; top: 6px; right: 6px; font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 4px; pointer-events: none; }
    .pool-badge-in   { background: rgba(52,211,153,0.25); color: #34d399; border: 1px solid rgba(52,211,153,0.4); }
    .pool-badge-sel  { background: rgba(59,130,246,0.25); color: #60a5fa; border: 1px solid rgba(59,130,246,0.4); }
    .pool-badge-flex { background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); }
    .pool-flex { border-color: rgba(56,189,248,0.25) !important; }
    .pool-flex:hover { border-color: rgba(56,189,248,0.5) !important; box-shadow: 0 0 10px rgba(56,189,248,0.15); }
    .flex-slot-badge { font-size: 8px; font-weight: 900; color: #38bdf8; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); border-radius: 4px; padding: 1px 5px; letter-spacing: 0.5px; }

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
