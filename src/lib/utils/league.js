// The competitive year, as pure functions: no stores, no DOM, so it can be unit-tested and so
// Season, Play and Home all read the same rules.
//
// FORMAT (seasonData.format === 2)
//   A year is three splits, like the real 2025-26 LoL calendar:
//     Winter → Regional Trophy → First Stand   (the champion qualifies)
//     Spring → Regional Trophy → MSI           (both finalists qualify)
//     Summer → Regional Trophy → Worlds        (both finalists qualify)
//   A split is a 10-team league — you plus nine CPU sides — where everyone plays everyone once
//   (9 matchdays, best of five). The other sides' games are simulated every matchday, so the
//   table is real. The top 4 play the Regional Trophy: semi-finals 1v4 / 2v3, then a final.
//   The Golden Road is no longer a separate event: it is winning all six titles of one year in
//   order (Winter Regional, First Stand, Spring Regional, MSI, Summer Regional, Worlds).
import { ALL_SPECIAL, MYTHIC_TIERS } from './cards.js';

export const SEASON_FORMAT = 2;
export const LEAGUE_SIZE = 10;
export const MATCHDAYS = LEAGUE_SIZE - 1;
export const PLAYOFF_SPOTS = 4;
export const WINS_NEEDED = 3;           // best of five, league and playoffs alike
export const ME = 'me';

export const SPLITS = [
    { id: 'winter', name: 'Winter', event: 'firststand', eventName: 'First Stand', qualify: 1 },
    { id: 'spring', name: 'Spring', event: 'msi',        eventName: 'MSI',         qualify: 2 },
    { id: 'summer', name: 'Summer', event: 'worlds',     eventName: 'Worlds',      qualify: 2 },
];
export const splitIndex = (n) => (Math.max(1, n || 1) - 1) % SPLITS.length;
export const splitInfo = (n) => SPLITS[splitIndex(n)];
export const seasonYear = (n) => Math.floor((Math.max(1, n || 1) - 1) / SPLITS.length) + 1;
/** Opponent strength still ramps every FOUR splits played, exactly as it did under the old
 *  four-split year — the calendar changed, the difficulty curve did not. */
export const difficultyLevel = (n) => Math.floor((Math.max(1, n || 1) - 1) / 4);

// ── Prizes ──
export const LEAGUE_PRIZES = [3000, 2200, 1700, 1300, 900, 700, 500, 400, 300, 200];
export const PLAYOFF_PRIZES = { champion: 1500, runnerUp: 500, semi: 0 };
export const PERFECT_LEAGUE_BONUS = 1000;   // 9-0

// ── RNG helpers ──
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// ── Fixtures ──
/** Circle-method single round robin. Returns `ids.length - 1` rounds of `ids.length / 2` pairs;
 *  every id meets every other id exactly once. ids[0] stays fixed. */
export function roundRobin(ids) {
    const n = ids.length;
    if (n % 2) throw new Error('roundRobin needs an even number of teams');
    let rot = ids.slice(1);
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
        const arr = [ids[0], ...rot];
        const pairs = [];
        for (let i = 0; i < n / 2; i++) {
            // Alternate who is listed first so no team is always "home".
            pairs.push(r % 2 === 0 ? [arr[i], arr[n - 1 - i]] : [arr[n - 1 - i], arr[i]]);
        }
        rounds.push(pairs);
        rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
    }
    return rounds;
}

// ── CPU sides ──
const TEAM_NAMES = ['Shadow Wolves', 'Storm Dragons', 'Iron Phoenix', 'Crystal Bears', 'Neon Tigers',
    'Dark Knights', 'Solar Flare', 'Frost Giants', 'Thunder Hawks', 'Crimson Vipers'];

/** Nine CPU sides for a split, ordered from the one you meet first (weakest) to the last
 *  (strongest) — the same difficulty curve the old ten-opponent split used. */
export function buildCpuTeams(db, splitNum, rng = Math.random, count = MATCHDAYS) {
    const regularPool = db.filter(p => p.role !== 'COACH' && !ALL_SPECIAL.includes(p.quality));
    // Mythic cards are perfect 100s — an unbeatable CPU roster, so keep them out even of BOSS sides.
    const elitePool = db.filter(p => p.role !== 'COACH' && !MYTHIC_TIERS.includes(p.quality));
    const roles = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const yr = difficultyLevel(splitNum);

    // BOSS sides live in the back stretch; the count is clamped to the slots that exist there
    // (see the old Season.svelte note: an unclamped count once froze the page in a loop).
    const bossStart = Math.max(4, count - 4), bossEnd = count - 1;
    const bossMax = Math.min(Math.floor(yr / 2), 3, bossEnd - bossStart + 1);
    const bossMin = Math.min(Math.max(0, yr - 1), bossMax);
    const bossCount = yr <= 1 ? 0 : randInt(rng, bossMin, bossMax);
    const boss = new Set();
    for (let g = 0; boss.size < bossCount && g < 100; g++) boss.add(randInt(rng, bossStart, bossEnd));
    const hardCount = yr === 0 ? 0 : Math.min(randInt(rng, Math.min(yr, 4), Math.min(1 + yr * 2, 7)), count - 3 - boss.size);
    const hard = new Set();
    for (let g = 0; hard.size < hardCount && g < 100; g++) { const s = randInt(rng, 3, count - 1); if (!boss.has(s)) hard.add(s); }

    const names = [...TEAM_NAMES];
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }

    const teams = [];
    for (let i = 0; i < count; i++) {
        const isBoss = boss.has(i), isHard = hard.has(i);
        const difficulty = isBoss ? randInt(rng, 110, 120) : isHard ? randInt(rng, 88, 100) : Math.min(95, 60 + i * 3 + yr * 4);
        const pool = isBoss || isHard || yr >= 3 ? elitePool : regularPool;
        const team = {};
        const used = new Set();
        for (const role of roles) {
            let rp;
            if (isBoss) {
                rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= 95);
                if (rp.length < 2) rp = pool.filter(p => p.role === role && !used.has(p.id)).sort((a, b) => b.rating - a.rating).slice(0, 5);
            } else if (isHard) {
                rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating >= 85);
                if (rp.length < 3) rp = pool.filter(p => p.role === role && !used.has(p.id)).sort((a, b) => b.rating - a.rating).slice(0, 10);
            } else {
                rp = pool.filter(p => p.role === role && !used.has(p.id) && p.rating <= difficulty + 10);
                if (rp.length < 3) rp = pool.filter(p => p.role === role && !used.has(p.id));
            }
            rp.sort((a, b) => b.rating - a.rating);
            const cutoff = Math.max(1, Math.min(rp.length, isBoss ? 3 : isHard ? 5 : Math.floor(rp.length * 0.5)));
            const pick = rp[Math.floor(rng() * cutoff)];
            if (pick) { team[role] = pick; used.add(pick.id); }
        }
        const cards = Object.values(team);
        let avg = cards.length ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : difficulty;
        if (isBoss) avg = Math.max(avg, randInt(rng, 110, 120));
        teams.push({ name: names[i % names.length], cards: team, avgRating: avg, tag: isBoss ? 'BOSS' : isHard ? 'HARD' : null });
    }
    return teams;
}

/** A fresh league. `cpuTeams` is ordered by when you meet them; the fixture list is laid out so
 *  you meet cpuTeams[0] on matchday 1, cpuTeams[1] on matchday 2, and so on. */
export function createLeague(cpuTeams) {
    const slots = Array.from({ length: LEAGUE_SIZE }, (_, i) => i);   // 0 = you
    const rounds = roundRobin(slots);
    // Which slot you face each round → that slot gets the round's CPU side.
    const slotForRound = rounds.map(pairs => { const p = pairs.find(x => x.includes(0)); return p[0] === 0 ? p[1] : p[0]; });
    const idOf = { 0: ME };
    slotForRound.forEach((slot, r) => { idOf[slot] = `t${r + 1}`; });
    const teams = [{ id: ME }];
    cpuTeams.slice(0, MATCHDAYS).forEach((t, r) => teams.push({ id: `t${r + 1}`, name: t.name, cards: t.cards, avgRating: t.avgRating, tag: t.tag || null }));
    return {
        teams,
        rounds: rounds.map(pairs => pairs.map(([a, b]) => [idOf[a], idOf[b]])),
        results: [],
    };
}

// ── Simulation ──
/** One series between two CPU sides. Every game: power plus noise, the closer the powers the
 *  likelier an upset. Returns the games each side won. */
export function simulateSeries(powerA, powerB, rng = Math.random, winsNeeded = WINS_NEEDED) {
    let a = 0, b = 0;
    while (a < winsNeeded && b < winsNeeded) {
        const ra = powerA + randInt(rng, -8, 8), rb = powerB + randInt(rng, -8, 8);
        if (ra > rb || (ra === rb && rng() < 0.5)) a++; else b++;
    }
    return { a, b };
}

const teamById = (league, id) => league.teams.find(t => t.id === id);
export const playedResult = (league, r, a, b) => league.results.find(x => x.r === r && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));

/** Simulates every unplayed CPU-vs-CPU pair of round `r`. Returns a NEW league. */
export function simulateRound(league, r, rng = Math.random) {
    const results = [...league.results];
    for (const [a, b] of league.rounds[r] || []) {
        if (a === ME || b === ME) continue;
        if (results.some(x => x.r === r && x.a === a && x.b === b)) continue;
        const s = simulateSeries(teamById(league, a).avgRating, teamById(league, b).avgRating, rng);
        results.push({ r, a, b, sa: s.a, sb: s.b });
    }
    return { ...league, results };
}

/** Records your series for round `r` and simulates the rest of that matchday. */
export function recordMyMatch(league, r, scoreMe, scoreThem, rng = Math.random) {
    const pair = (league.rounds[r] || []).find(p => p.includes(ME));
    if (!pair) return league;
    const opp = pair[0] === ME ? pair[1] : pair[0];
    if (league.results.some(x => x.r === r && (x.a === ME || x.b === ME))) return league;   // already played
    const withMine = { ...league, results: [...league.results, { r, a: ME, b: opp, sa: scoreMe, sb: scoreThem }] };
    return simulateRound(withMine, r, rng);
}

/** Your fixture for round r: { r, opponentId, result: {sa, sb, won} | null }. */
export function myFixture(league, r) {
    const pair = (league.rounds[r] || []).find(p => p.includes(ME));
    if (!pair) return null;
    const opp = pair[0] === ME ? pair[1] : pair[0];
    const res = league.results.find(x => x.r === r && (x.a === ME || x.b === ME));
    let result = null;
    if (res) { const mine = res.a === ME ? res.sa : res.sb, theirs = res.a === ME ? res.sb : res.sa; result = { sa: mine, sb: theirs, won: mine > theirs }; }
    return { r, opponentId: opp, result };
}

/** How many of your matchdays are played. */
export const myPlayed = (league) => league ? league.results.filter(x => x.a === ME || x.b === ME).length : 0;
export const leagueComplete = (league) => !!league && myPlayed(league) >= MATCHDAYS && league.results.length >= MATCHDAYS * (LEAGUE_SIZE / 2);

/** The table. `myPower` is only used to break a dead heat. Rows are sorted and carry `pos`. */
export function standings(league, myPower = 0) {
    const rows = {};
    for (const t of league.teams) rows[t.id] = { id: t.id, name: t.name, tag: t.tag || null, power: t.id === ME ? myPower : t.avgRating, p: 0, w: 0, l: 0, gw: 0, gl: 0, form: [] };
    const ordered = [...league.results].sort((x, y) => x.r - y.r);
    for (const res of ordered) {
        const A = rows[res.a], B = rows[res.b];
        if (!A || !B) continue;
        A.p++; B.p++; A.gw += res.sa; A.gl += res.sb; B.gw += res.sb; B.gl += res.sa;
        if (res.sa > res.sb) { A.w++; B.l++; A.form.push('W'); B.form.push('L'); }
        else { B.w++; A.l++; B.form.push('W'); A.form.push('L'); }
    }
    const h2h = (a, b) => {
        const r = league.results.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        if (!r) return 0;
        const aWon = r.a === a ? r.sa > r.sb : r.sb > r.sa;
        return aWon ? -1 : 1;
    };
    const list = Object.values(rows);
    list.sort((x, y) => (y.w - x.w) || ((y.gw - y.gl) - (x.gw - x.gl)) || h2h(x.id, y.id) || (y.power - x.power) || String(x.name || '').localeCompare(String(y.name || '')));
    list.forEach((row, i) => { row.pos = i + 1; row.form = row.form.slice(-3); });
    return list;
}

// ── Playoffs ──
/** Seeds 1v4 and 2v3 from the final table. */
export function seedPlayoffs(table) {
    const s = table.slice(0, PLAYOFF_SPOTS).map(r => r.id);
    return { seeds: s, semis: [{ a: s[0], b: s[3], sa: null, sb: null }, { a: s[1], b: s[2], sa: null, sb: null }], final: null, champion: null, runnerUp: null };
}

const winnerOf = (m) => (m && m.sa !== null ? (m.sa > m.sb ? m.a : m.b) : null);
const loserOf = (m) => (m && m.sa !== null ? (m.sa > m.sb ? m.b : m.a) : null);

/** Your current playoff series, or null when you are out / done. */
export function myPlayoffSeries(po) {
    if (!po) return null;
    if (po.final) return po.final.sa === null && (po.final.a === ME || po.final.b === ME) ? { stage: 'final', match: po.final } : null;
    const mine = po.semis.find(m => m.a === ME || m.b === ME);
    return mine && mine.sa === null ? { stage: 'semi', match: mine } : null;
}

/** Applies your series result (when you are in this stage) and simulates every other series of
 *  that stage; builds the final once both semis are in; crowns the champion. Returns NEW playoffs. */
export function advancePlayoffs(po, powerOf, mine = null, rng = Math.random) {
    let next = { ...po, semis: po.semis.map(m => ({ ...m })), final: po.final ? { ...po.final } : null };
    const sim = (m) => { const s = simulateSeries(powerOf(m.a), powerOf(m.b), rng); m.sa = s.a; m.sb = s.b; };
    const put = (m) => { if (m.a === ME) { m.sa = mine.me; m.sb = mine.them; } else { m.sa = mine.them; m.sb = mine.me; } };
    if (!next.final) {
        for (const m of next.semis) {
            if (m.sa !== null) continue;
            if (m.a === ME || m.b === ME) { if (mine) put(m); else continue; } else sim(m);
        }
        if (next.semis.every(m => m.sa !== null)) next.final = { a: winnerOf(next.semis[0]), b: winnerOf(next.semis[1]), sa: null, sb: null };
        else return next;
        // You lost your semi: the final plays out without you straight away.
        if (next.final.a !== ME && next.final.b !== ME) sim(next.final);
        else return next;
    } else if (next.final.sa === null) {
        if (next.final.a === ME || next.final.b === ME) { if (mine) put(next.final); else return next; } else sim(next.final);
    }
    next.champion = winnerOf(next.final);
    next.runnerUp = loserOf(next.final);
    return next;
}

/** Plays out a whole bracket with no human in it (you missed the playoffs). */
export function simulatePlayoffs(po, powerOf, rng = Math.random) {
    let next = advancePlayoffs(po, powerOf, null, rng);
    if (!next.champion) next = advancePlayoffs(next, powerOf, null, rng);
    return next;
}

/** 'champion' | 'runnerUp' | 'semi' | null (did not make the bracket). */
export function myPlayoffResult(po) {
    if (!po || !po.seeds.includes(ME)) return null;
    if (po.champion === ME) return 'champion';
    if (po.runnerUp === ME) return 'runnerUp';
    const semi = po.semis.find(m => m.a === ME || m.b === ME);
    if (semi && semi.sa !== null && winnerOf(semi) !== ME) return 'semi';
    return po.champion ? 'semi' : null;
}

/** Whether a playoff result sends you to the split's international event. */
export function qualifiesFor(split, playoffResult) {
    if (playoffResult === 'champion') return true;
    if (playoffResult === 'runnerUp') return split.qualify >= 2;
    return false;
}

// ── Split outcome ──
export const SPLIT_OUTCOMES = {
    champion: { title: 'Regional Champion', ico: 'trophy', c: '#facc15' },
    runnerUp: { title: 'Runner-up', ico: 'medal', c: '#cbd5e1' },
    semi:     { title: 'Semi-finalist', ico: 'target', c: '#60a5fa' },
    mid:      { title: 'Mid Table', ico: 'ranking', c: '#94a3b8' },
    low:      { title: 'Struggling', ico: 'shield', c: '#fb923c' },
    bottom:   { title: 'Relegation Zone', ico: 'skull', c: '#f87171' },
};
export function splitOutcome(position, playoffResult) {
    if (playoffResult) return SPLIT_OUTCOMES[playoffResult];
    if (position <= 6) return SPLIT_OUTCOMES.mid;
    if (position <= 8) return SPLIT_OUTCOMES.low;
    return SPLIT_OUTCOMES.bottom;
}
export function splitPrize(position, playoffResult, perfect) {
    const league = LEAGUE_PRIZES[Math.max(0, Math.min(LEAGUE_PRIZES.length - 1, position - 1))] || 0;
    const playoff = playoffResult ? (PLAYOFF_PRIZES[playoffResult] || 0) : 0;
    return { league, playoff, perfect: perfect ? PERFECT_LEAGUE_BONUS : 0, total: league + playoff + (perfect ? PERFECT_LEAGUE_BONUS : 0) };
}

// ── Golden Road ──
export const GR_STEPS = [
    { key: 'regional-winter', label: 'Winter Regional', icon: 'flag' },
    { key: 'firststand',      label: 'First Stand',     icon: 'flame' },
    { key: 'regional-spring', label: 'Spring Regional', icon: 'flag' },
    { key: 'msi',             label: 'MSI',             icon: 'waves' },
    { key: 'regional-summer', label: 'Summer Regional', icon: 'flag' },
    { key: 'worlds',          label: 'Worlds',          icon: 'trophy' },
];
export const GOLDEN_ROAD_PRIZE = 25000;
export const regionalKey = (splitNum) => `regional-${splitInfo(splitNum).id}`;

export function grFresh(year, broken = false) { return { year, done: [], broken }; }

/** Records one title of the year. Out-of-order or repeated keys are ignored; losing the step
 *  that was next breaks the road for the rest of that year. */
export function grRecord(gr, year, key, won) {
    let g = gr && gr.year === year ? { ...gr, done: [...gr.done] } : grFresh(year);
    if (g.broken) return { gr: g, completed: false, advanced: false };
    const expected = GR_STEPS[g.done.length];
    if (!expected || expected.key !== key) return { gr: g, completed: false, advanced: false };
    if (!won) { g.broken = true; return { gr: g, completed: false, advanced: false }; }
    g.done.push(key);
    return { gr: g, completed: g.done.length === GR_STEPS.length, advanced: true };
}

// ── Old saves ──
/** Converts a pre-format-2 season (ten fixed opponents) into a league, keeping every result
 *  already played. Opponents 1-9 become the league's nine sides in the order you met them; a
 *  tenth is dropped. Your old results become matchday results (3-1 / 1-3, as the old format
 *  did not keep series scores) and the other sides' games for those matchdays are simulated. */
export function migrateSeason(sd, rng = Math.random) {
    if (sd && sd.format === SEASON_FORMAT) return sd;
    const base = { ...sd, format: SEASON_FORMAT, opponents: [], matchResults: [], splitWins: 0, splitLosses: 0, splitComplete: false };
    const n = sd?.currentSplit || 1;
    const opps = Array.isArray(sd?.opponents) ? sd.opponents.filter(o => o && o.cards && o.avgRating !== undefined) : [];
    // Mid-year conversion: the Winter Regional of this year was never played under these rules.
    base.goldenRoad = grFresh(seasonYear(n), splitIndex(n) > 0);
    base.qualified = null;
    base.playoffs = null;
    base.summary = null;
    if (opps.length < MATCHDAYS) { base.stage = 'idle'; base.league = null; return base; }
    let league = createLeague(opps.slice(0, MATCHDAYS));
    const results = Array.isArray(sd.matchResults) ? sd.matchResults : [];
    for (let r = 0; r < MATCHDAYS; r++) {
        const res = results[r];
        if (res !== true && res !== false) break;
        league = recordMyMatch(league, r, res ? 3 : 1, res ? 1 : 3, rng);
    }
    base.league = league;
    base.stage = 'league';
    return base;
}
