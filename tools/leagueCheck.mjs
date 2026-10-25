// node tools/leagueCheck.mjs — the season format in src/lib/utils/league.js (Ultimate Roster).
// Pure-function checks: the fixture list is a real round robin, you meet the CPU sides in
// difficulty order, the table adds up, the playoff bracket resolves every way it can, the
// qualification and Golden Road rules hold, and an old ten-opponent save converts without
// losing a result.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = await import(pathToFileURL(join(ROOT, 'src/lib/utils/league.js')).href);

// Seeded RNG so a failure reproduces.
let seed = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7) || 7);
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, 'public/database.js'), 'utf8'), ctx);
const db = ctx.window.playerDatabase;

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL ' + m); } };

// ── Fixtures ──
{
    const ids = Array.from({ length: 10 }, (_, i) => i);
    const rounds = L.roundRobin(ids);
    ok(rounds.length === 9, '9 rounds');
    const met = new Set();
    for (const [ri, pairs] of rounds.entries()) {
        ok(pairs.length === 5, `round ${ri} has 5 pairs`);
        const seen = new Set(pairs.flat());
        ok(seen.size === 10, `round ${ri}: every team plays exactly once`);
        for (const [a, b] of pairs) met.add([a, b].sort((x, y) => x - y).join('-'));
    }
    ok(met.size === 45, `every pair meets exactly once (${met.size}/45)`);
}

// ── League + difficulty order ──
const cpu = L.buildCpuTeams(db, 1, rng);
ok(cpu.length === 9, '9 CPU sides');
ok(cpu.every(t => Object.keys(t.cards).length === 5), 'every CPU side has five players');
let lg = L.createLeague(cpu);
for (let r = 0; r < 9; r++) {
    const f = L.myFixture(lg, r);
    ok(f && f.opponentId === `t${r + 1}`, `matchday ${r + 1}: you meet cpu[${r}] (got ${f && f.opponentId})`);
}
const late = L.buildCpuTeams(db, 40, rng);
ok(late.some(t => t.tag === 'BOSS' || t.tag === 'HARD'), 'a late split has HARD/BOSS sides');
for (let s = 1; s <= 120; s += 7) {
    const t = L.buildCpuTeams(db, s, rng);
    ok(t.length === 9 && t.every(x => x.avgRating > 0), `split ${s}: builds without hanging`);
}

// ── A full league ──
for (let r = 0; r < 9; r++) lg = L.recordMyMatch(lg, r, r % 3 === 0 ? 1 : 3, r % 3 === 0 ? 3 : 2, rng);
ok(L.myPlayed(lg) === 9, 'you played 9');
ok(lg.results.length === 45, `all 45 series recorded (${lg.results.length})`);
ok(L.leagueComplete(lg), 'league complete');
const before = lg.results.length;
lg = L.recordMyMatch(lg, 0, 3, 0, rng);
ok(lg.results.length === before, 'a matchday cannot be recorded twice');
const table = L.standings(lg, 95);
ok(table.length === 10, 'table has 10 rows');
ok(table.reduce((s, r) => s + r.w, 0) === 45 && table.reduce((s, r) => s + r.l, 0) === 45, 'wins and losses both sum to 45');
ok(table.every(r => r.p === 9), 'everyone played 9');
ok(table.reduce((s, r) => s + r.gw, 0) === table.reduce((s, r) => s + r.gl, 0), 'games won = games lost across the table');
ok(table.every((r, i) => i === 0 || table[i - 1].w >= r.w), 'sorted by wins');
ok(table.every(r => r.form.length <= 3), 'form is the last 3');
const me = table.find(r => r.id === L.ME);
ok(me.w === 6 && me.l === 3, `your record is 6-3 (got ${me.w}-${me.l})`);

// ── Playoffs, every path ──
const power = (id) => (id === L.ME ? 95 : lg.teams.find(t => t.id === id).avgRating);
function bracketWithMeSeeded(seedPos) {
    const rows = L.standings(lg, 95).filter(r => r.id !== L.ME);
    rows.splice(seedPos, 0, { id: L.ME });
    return L.seedPlayoffs(rows);
}
{   // win both
    let po = bracketWithMeSeeded(0);
    ok(po.semis[0].a === L.ME && po.semis[0].b === po.seeds[3], '1 v 4 and you are seed 1');
    ok(L.myPlayoffSeries(po)?.stage === 'semi', 'you play a semi first');
    po = L.advancePlayoffs(po, power, { me: 3, them: 1 }, rng);
    ok(po.final && (po.final.a === L.ME || po.final.b === L.ME), 'won the semi → in the final');
    ok(po.semis.every(m => m.sa !== null), 'both semis are decided');
    ok(L.myPlayoffSeries(po)?.stage === 'final', 'your next series is the final');
    po = L.advancePlayoffs(po, power, { me: 3, them: 2 }, rng);
    ok(po.champion === L.ME && L.myPlayoffResult(po) === 'champion', 'champion');
    ok(L.myPlayoffSeries(po) === null, 'nothing left to play');
}
{   // lose the semi
    let po = bracketWithMeSeeded(2);
    po = L.advancePlayoffs(po, power, { me: 1, them: 3 }, rng);
    ok(po.champion && po.champion !== L.ME, 'lost the semi → the final is simulated without you');
    ok(L.myPlayoffResult(po) === 'semi', 'result: semi-finalist');
}
{   // lose the final
    let po = bracketWithMeSeeded(1);
    po = L.advancePlayoffs(po, power, { me: 3, them: 0 }, rng);
    po = L.advancePlayoffs(po, power, { me: 2, them: 3 }, rng);
    ok(po.runnerUp === L.ME && L.myPlayoffResult(po) === 'runnerUp', 'runner-up');
}
{   // not in the bracket
    let po = L.seedPlayoffs(L.standings(lg, 95).filter(r => r.id !== L.ME));
    po = L.simulatePlayoffs(po, power, rng);
    ok(po.champion && L.myPlayoffResult(po) === null, 'a bracket without you resolves to a champion');
}

// ── Qualification ──
const [W, S, Su] = L.SPLITS;
ok(L.qualifiesFor(W, 'champion') && !L.qualifiesFor(W, 'runnerUp'), 'First Stand: champion only');
ok(L.qualifiesFor(S, 'runnerUp') && L.qualifiesFor(Su, 'runnerUp'), 'MSI and Worlds: both finalists');
ok(!L.qualifiesFor(Su, 'semi') && !L.qualifiesFor(Su, null), 'semi-finalists and non-qualifiers stay home');
ok(L.splitInfo(1).id === 'winter' && L.splitInfo(2).id === 'spring' && L.splitInfo(3).id === 'summer' && L.splitInfo(4).id === 'winter', 'calendar cycles Winter → Spring → Summer');
ok(L.seasonYear(3) === 1 && L.seasonYear(4) === 2, 'three splits a year');
ok(L.difficultyLevel(4) === 0 && L.difficultyLevel(5) === 1, 'difficulty still ramps every four splits');
ok(L.splitPrize(1, 'champion', true).total === 3000 + 1500 + 1000, 'prize: 1st + champion + perfect');
ok(L.splitPrize(10, null, false).total === 200, 'prize: 10th');

// ── Golden Road ──
{
    let g = L.grFresh(1);
    const keys = L.GR_STEPS.map(s => s.key);
    let res;
    for (const k of keys) { res = L.grRecord(g, 1, k, true); g = res.gr; }
    ok(res.completed && g.done.length === 6, 'six titles in order completes the road');
    let h = L.grFresh(1);
    h = L.grRecord(h, 1, 'firststand', true).gr;
    ok(h.done.length === 0 && !h.broken, 'an out-of-order title is ignored');
    h = L.grRecord(h, 1, 'regional-winter', false).gr;
    ok(h.broken, 'losing the next step breaks the road');
    h = L.grRecord(h, 1, 'regional-winter', true).gr;
    ok(h.broken && h.done.length === 0, 'a broken road stays broken for the year');
    const fresh = L.grRecord(h, 2, 'regional-winter', true);
    ok(!fresh.gr.broken && fresh.gr.done.length === 1 && fresh.gr.year === 2, 'a new year starts a fresh road');
}

// ── Old save conversion ──
{
    const old = { currentSplit: 5, opponents: L.buildCpuTeams(db, 5, rng).concat(L.buildCpuTeams(db, 5, rng).slice(0, 1)).map((t, i) => ({ ...t, index: i })), matchResults: [true, false, true, null, null, null, null, null, null, null], trophyCase: [{ name: 'Spring' }], meta: [], lockedSquad: { TOP: null } };
    const m = L.migrateSeason(old, rng);
    ok(m.format === 2 && m.stage === 'league', 'mid-split save becomes a league in progress');
    ok(L.myPlayed(m.league) === 3, `three results kept (${L.myPlayed(m.league)})`);
    ok(m.league.results.length === 15, 'the other sides\' games for those matchdays were simulated');
    ok(m.trophyCase.length === 1 && m.currentSplit === 5, 'trophy case and split number kept');
    ok(L.myFixture(m.league, 0).result.won === true && L.myFixture(m.league, 1).result.won === false, 'results kept in order');
    ok(m.goldenRoad.broken === true, 'a mid-year conversion cannot claim this year\'s road');
    const done = L.migrateSeason({ ...old, matchResults: Array(10).fill(true) }, rng);
    ok(L.myPlayed(done.league) === 9, 'a finished old split keeps nine results');
    const idle = L.migrateSeason({ currentSplit: 4, opponents: [], matchResults: [], trophyCase: [] }, rng);
    ok(idle.stage === 'idle' && idle.league === null && idle.goldenRoad.broken === false, 'no split in progress → idle; split 4 is a Winter, the road is open');
    ok(L.migrateSeason(m, rng) === m, 'a format-2 save is left alone');
}

console.log(`${checks - fails}/${checks} league checks passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
