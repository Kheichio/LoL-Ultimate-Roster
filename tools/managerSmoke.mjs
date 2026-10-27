// ===========================================================================
//  managerSmoke.mjs -- plays Ultimate Manager headlessly
// ===========================================================================
//  Builds the world for every start year, takes a club, and sims whole seasons
//  through the real engine (the same advance() the Continue button calls),
//  asserting the invariants that would otherwise only show up as a broken
//  table or a vanished player weeks into a save:
//
//    - every league has its size, every roster its minimum, every role covered
//    - a player is in exactly one roster or in free agency, never both
//    - no special-tier card is ever used: real players come from standard cards
//    - random players never take a real pro's name
//    - brackets crown champions; MSI is 8 teams, Worlds 16, with no repeats
//    - promotion and relegation keep both tiers at size
//    - attributes stay finite and in range; money stays finite
//
//  It also prints the shape of the world over time (mean OVR by region, real
//  vs random share, debuts and retirements), because a league that slowly
//  inflates or empties is a tuning problem no pass/fail line catches.
//
//      node tools/managerSmoke.mjs [--years 6] [--seed 7] [--start 2013] [--verbose]
// ===========================================================================
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const YEARS = Number(arg('years', 4));
const SEED = Number(arg('seed', 7));
const ONLY_START = arg('start', null);
const VERBOSE = argv.includes('--verbose');
/** Sim every series, none by hand: separates drafting skill from any hidden edge. */
const NO_HAND = argv.includes('--nohand');
/** Never touch the market: the club as the board judged it. */
const NO_MARKET = argv.includes('--nomarket');

// ---- browser shim -----------------------------------------------------------
class MemStorage {
    constructor() { this.m = new Map(); }
    get length() { return this.m.size; }
    key(i) { return [...this.m.keys()][i] ?? null; }
    getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
    setItem(k, v) { this.m.set(String(k), String(v)); }
    removeItem(k) { this.m.delete(String(k)); }
    clear() { this.m.clear(); }
}
const win = { localStorage: new MemStorage(), sessionStorage: new MemStorage() };
win.window = win;
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.window = win;
globalThis.localStorage = win.localStorage;
globalThis.sessionStorage = win.sessionStorage;
globalThis.document = { createElement: () => ({ style: {} }), addEventListener() {}, querySelector: () => null, documentElement: { style: {} }, body: { style: {} } };

new Function('window', fs.readFileSync(path.join(ROOT, 'public', 'database.js'), 'utf8'))(win);
if (!Array.isArray(win.playerDatabase) || win.playerDatabase.length < 1000) { console.error('FATAL: card database did not load'); process.exit(2); }

// Seed Math.random so a failure reproduces.
const load = (rel) => import(pathToFileURL(path.join(ROOT, 'src', rel)).href);
const U = await load('lib/manager/util.js');
Math.random = U.mulberry32(SEED * 7919 + 13);

const CARDS = await load('lib/utils/cards.js');
const D = await load('lib/manager/data.js');
const PE = await load('lib/manager/people.js');
const M = await load('lib/manager/match.js');
const W = await load('lib/manager/world.js');
const SE = await load('lib/manager/season.js');
const MK = await load('lib/manager/market.js');
const E = await load('lib/manager/engine.js');

const STORE = await load('lib/stores/manager.js');
const db = CARDS.getDB();
E.setDB(db);
const cardById = new Map(db.map(c => [c.id, c]));
const dbNames = new Set(db.map(c => String(c.name).toLowerCase()));

// ---- harness ------------------------------------------------------------------
let failures = 0, checks = 0;
const fails = new Map();
function check(label, cond, detail) {
    checks++;
    if (cond) return true;
    failures++;
    const n = (fails.get(label) || 0) + 1;
    fails.set(label, n);
    if (n <= 3) console.log(`  FAIL  ${label}${detail ? ' -- ' + detail : ''}`);
    return false;
}

function invariants(save, where) {
    const P = save.players, T = save.teams;
    const seenIn = new Map();
    for (const t of Object.values(T)) {
        for (const id of t.roster) {
            check('roster ids exist', !!P[id], `${where}: ${t.name} holds missing ${id}`);
            if (!P[id]) continue;
            check('player.team matches roster', P[id].team === t.id, `${where}: ${P[id].name} in ${t.name} but team=${P[id].team}`);
            check('no player in two rosters', !seenIn.has(id), `${where}: ${P[id].name} in ${t.name} and ${seenIn.get(id)}`);
            seenIn.set(id, t.name);
        }
        check('roster within max', t.roster.length <= D.ROSTER_MAX + 1, `${where}: ${t.name} has ${t.roster.length}`);
    }
    for (const id of save.freeAgents) {
        check('free agents exist', !!P[id], `${where}: FA ${id}`);
        if (P[id]) check('free agents have no team', !P[id].team, `${where}: FA ${P[id].name} team=${P[id].team}`);
        check('free agent not also rostered', !seenIn.has(id), `${where}: ${id}`);
    }
    for (const p of Object.values(P)) {
        if (p.team) check('player team exists', !!T[p.team], `${where}: ${p.name} -> ${p.team}`);
        else check('teamless player is a free agent', save.freeAgents.includes(p.id), `${where}: ${p.name}`);
        for (const k of D.ATTR_KEYS) {
            const v = p.a[k];
            if (!check('attributes finite and in range', Number.isFinite(v) && v >= D.ATTR_MIN - 0.001 && v <= D.ATTR_MAX + 0.001, `${where}: ${p.name}.${k}=${v}`)) break;
        }
        check('ovr finite', Number.isFinite(PE.ovrOf(p)) && PE.ovrOf(p) >= 1, `${where}: ${p.name}`);
        check('potential finite', Number.isFinite(p.pot) && p.pot >= 1 && p.pot <= 99, `${where}: ${p.name} pot=${p.pot}`);
        if (p.real) {
            const c = cardById.get(p.cid);
            check('real players come from standard cards', !!c && CARDS.TIER_ORDER.includes(c.quality), `${where}: ${p.name} card ${p.cid} ${c && c.quality}`);
        } else {
            check('random players never take a real name', !dbNames.has(String(p.name).toLowerCase()), `${where}: ${p.name}`);
        }
        check('favs are 1-3 known champions', Array.isArray(p.favs) && p.favs.length >= 1 && p.favs.length <= 3, `${where}: ${p.name} ${JSON.stringify(p.favs)}`);
    }
    if (save.season) {
        for (const [key, L] of Object.entries(save.season.leagues)) {
            const want = L.tier === 1 ? D.TIER1_SIZE : D.TIER2_SIZE;
            check('league size', L.teams.length === want, `${where}: ${key} has ${L.teams.length}`);
            for (const id of L.teams) check('league team tier matches', T[id] && T[id].tier === L.tier && T[id].region === L.region, `${where}: ${key} ${id}`);
        }
    }
    check('balance finite', Number.isFinite(save.finance.balance), `${where}: ${save.finance.balance}`);
}

function rosterCover(save, where) {
    for (const t of Object.values(save.teams)) {
        // The manager's own club may sit short after the offseason until they sign
        // someone; blockReason stops a match being played that way.
        if (t.id === save.manager.teamId) continue;
        check('team has at least five', t.roster.length >= 5, `${where}: ${t.name} ${t.roster.length}`);
        const lu = M.lineupOf(t, save.players);
        check('lineup fills five seats', D.ROLE_IDS.every(r => lu[r]), `${where}: ${t.name}`);
    }
}

// ---- the draft ------------------------------------------------------------------
/** Every rule a finished draft must obey. */
function checkDraft(ds, year, locked, where) {
    const log = ds.log.filter(x => !x.skipped);
    check('a draft has twenty actions', log.length === 20, `${where}: ${log.length}`);
    check('the draft follows the tournament order', log.every((x, i) => x.side === D.DRAFT_ORDER[i].side && x.type === D.DRAFT_ORDER[i].type), `${where}: ${log.map(x => x.side[0] + x.type[0]).join(' ')}`);
    for (const k of ['a', 'b']) {
        check('five bans a side', ds.bans[k].length === 5, `${where}: ${k} ${ds.bans[k].length}`);
        check('five picks a side, one per role', D.ROLE_IDS.every(r => ds.picks[k][r]), `${where}: ${k} ${JSON.stringify(ds.picks[k])}`);
        for (const r of D.ROLE_IDS) {
            const c = M.CHAMPION_BY_ID[ds.picks[k][r]];
            check('a pick plays its role', !!c && c.roles.includes(r), `${where}: ${ds.picks[k][r]} as ${r}`);
            check('a pick was released by then', !!c && D.champReleased(c.id, year), `${where}: ${c && c.id} in ${year}`);
        }
    }
    const picks = [...Object.values(ds.picks.a), ...Object.values(ds.picks.b)];
    const bans = [...ds.bans.a, ...ds.bans.b];
    check('ten different champions in a game', new Set(picks).size === 10, `${where}: ${picks.join(',')}`);
    check('no banned champion is picked', picks.every(c => !bans.includes(c)), where);
    check('no champion banned twice', new Set(bans).size === bans.length, `${where}: ${bans.join(',')}`);
    if (locked && locked.length) check('fearless: nothing played earlier in the series is played again', picks.every(c => !locked.includes(c)), `${where}: ${picks.filter(c => locked.includes(c)).join(',')}`);
}

// ---- the hand-played path ---------------------------------------------------------
//  MatchFlow plays a series game by game: a step-by-step draft against the AI,
//  then every in-game call, with the detailed feed, and commits it through
//  advance(). The sim path never builds a feed, so this is the only cover.
const ratingStats = { n: 0, sum: 0, lo: 99, hi: 0, win: 0, winN: 0, lose: 0, loseN: 0 };
const callStats = { games: 0, late: 0, calls: 0, byStage: {} };
function playByHand(save, rng = Math.random) {
    const f = E.userFixture(save);
    if (!f) return null;
    const me = save.manager.teamId;
    const opp = f.tie.a === me ? f.tie.b : f.tie.a;
    const A0 = E.sideFor(save, me, rng), B0 = E.sideFor(save, opp, rng);
    const ctx0 = E.matchContext(save, f.kind);
    const need = Math.ceil(f.tie.bo / 2);
    const wins = [0, 0], games = [];
    const locked = [];
    let blue = f.tie.a === me ? 'a' : 'b';
    let g = 0;
    while (wins[0] < need && wins[1] < need) {
        const ctx = { ...ctx0, decider: wins[0] === need - 1 && wins[1] === need - 1, blue };
        // The draft, one action at a time: the AI for them, the best-scored choice for us.
        const ds = M.newDraft(blue, ctx.fearless ? locked : []);
        let guard = 0;
        while (!M.draftDone(ds) && guard++ < 30) {
            const turn = M.draftTurn(ds);
            let act;
            if (turn.key === 'a') {
                if (turn.type === 'ban') { const b = M.banScores(ds, 'a', A0, B0, ctx)[g % 2]; act = b ? { champ: b.id } : null; }
                else { const p = M.pickScores(ds, 'a', A0, B0, ctx)[0]; act = p ? { champ: p.id, role: p.role } : null; }
            } else act = M.aiDraftAction(ds, A0, B0, ctx, rng);
            if (!check('every draft turn has a legal action', !!act && M.applyDraft(ds, act, ctx.year), `${turn.key} ${turn.type} ${JSON.stringify(act)}`)) break;
        }
        checkDraft(ds, ctx.year, ctx.fearless ? locked : null, `${save.time.year} ${f.comp} g${g + 1}`);
        if (ctx.fearless) locked.push(...Object.values(ds.picks.a), ...Object.values(ds.picks.b));
        const A = { ...A0, picks: ds.picks.a }, B = { ...B0, picks: ds.picks.b };
        const st = M.startGame(A, B, ctx, rng, { detail: true });
        check('synergy is a number', Number.isFinite(st.synA.total) && Number.isFinite(st.synB.total));
        let calls = 0, shownFeed = 0, prevT = -1;
        while (!st.done && calls < 6) {
            const sit = M.gameSituation(st, 'a', A, B);
            check('every decision has options', sit && sit.opts.length >= 3, JSON.stringify(sit && sit.stage));
            for (const o of sit.opts) check('every option has a finite chance', Number.isFinite(M.callChance(o, st.lead, A.shot)), `${sit.stage} ${o.id}`);
            check('decisions come in time order', M.STAGE_T[sit.stage] > prevT, `${sit.stage}`);
            prevT = M.STAGE_T[sit.stage];
            callStats.byStage[sit.stage] = (callStats.byStage[sit.stage] || 0) + 1;
            const mine = sit.opts[(g + calls) % sit.opts.length].id;
            const theirs = M.bestCall(M.gameSituation(st, 'b', A, B), -st.lead, B.shot).id;
            M.resolveStage(st, A, B, ctx, rng, { callA: mine, callB: theirs });
            calls++;
            if (!st.done) {
                check('the feed stops at the next decision', st.feed.every(e => e.t <= M.STAGE_T[M.gameStage(st)] + 0.001), `${M.gameStage(st)}`);
                check('the feed only grows', st.feed.length >= shownFeed);
                shownFeed = st.feed.length;
            }
        }
        check('a game ends', st.done && st.res, `${calls} calls`);
        const res = st.res;
        callStats.games++; callStats.calls += calls;
        if (st.calls.some(c => c.stage === 'late')) callStats.late++;
        check('three or four calls a game', calls >= 3 && calls <= 4, `${calls}`);
        check('the result feed starts with what was shown', res.feed.slice(0, st.feed.length).every((e, i) => e === st.feed[i]));
        const last = res.feed[res.feed.length - 1];
        check('feed ends on the Nexus, for the winner', last && last.type === 'end' && last.s === res.winner, last && last.text);
        check('feed is in time order', res.feed.every((e, i) => i === 0 || e.t >= res.feed[i - 1].t - 0.001));
        check('the game lasts past its last call', res.duration > st.calls[st.calls.length - 1].t + 3, `${res.duration} vs ${st.calls[st.calls.length - 1].t}`);
        for (const side of ['a', 'b']) {
            check('five lines a side', res.lines[side].length === 5);
            for (const l of res.lines[side]) {
                check('ratings in range', l.rating >= 2.5 && l.rating <= 9.9, `${l.name} ${l.rating}`);
                check('assists never exceed team kills', l.a <= res.lines[side].reduce((s, x) => s + x.k, 0));
                check('every line carries its champion', !!l.champ);
                ratingStats.n++; ratingStats.sum += l.rating; ratingStats.lo = Math.min(ratingStats.lo, l.rating); ratingStats.hi = Math.max(ratingStats.hi, l.rating);
                if (side === res.winner) { ratingStats.win += l.rating; ratingStats.winN++; } else { ratingStats.lose += l.rating; ratingStats.loseN++; }
            }
        }
        check('the MVP is on the winning side', res.lines[res.winner].some(l => l.id === res.mvp));
        if (res.winner === 'a') wins[0]++; else wins[1]++;
        games.push({ w: res.winner, ratings: res.ratings, mvp: res.mvp, lines: res.lines, blue, picks: ds.picks, bans: ds.bans });
        blue = res.winner === 'a' ? 'b' : 'a';
        g++;
    }
    return { score: wins.slice(), winner: wins[0] > wins[1] ? 'a' : 'b', games };
}

// ---- AI drafts ----------------------------------------------------------------------
//  Bans used to be the opponents' best players' first favourites, every game.
//  Now they read form, recent picks, the meta and counters, with a little
//  judgement: the same two teams must not ban the same five every time.
function draftVariety(save) {
    const me = E.myTeam(save);
    const opp = Object.values(save.teams).find(t => t.id !== me.id && t.region === me.region && t.tier === me.tier);
    const A = E.sideFor(save, me.id), B = E.sideFor(save, opp.id);
    const ctx = E.matchContext(save, 'league');
    const sets = new Set(), firsts = new Set();
    for (let i = 0; i < 24; i++) {
        const ds = M.autoDraft(A, B, { ...ctx, blue: i % 2 ? 'b' : 'a' }, Math.random, []);
        checkDraft(ds, ctx.year, null, `variety ${i}`);
        sets.add([...ds.bans.b].sort().join(','));
        firsts.add(ds.bans.b[0]);
    }
    return { sets: sets.size, firsts: firsts.size };
}

/** Fearless across a whole AI series: no champion twice, for either side. */
function fearlessSeries(save) {
    const ts = Object.values(save.teams).filter(t => t.tier === 1).slice(0, 2);
    const A = E.sideFor(save, ts[0].id), B = E.sideFor(save, ts[1].id);
    const ctx = { ...E.matchContext(save, 'playoffs'), fearless: true };
    let worst = 0;
    for (let i = 0; i < 6; i++) {
        const r = M.quickSeries(A, B, 5, ctx, Math.random);
        const seen = new Set();
        let dup = 0;
        for (const g of r.games) for (const c of [...Object.values(g.picks.a), ...Object.values(g.picks.b)]) { if (seen.has(c)) dup++; seen.add(c); }
        worst = Math.max(worst, dup);
        check('fearless: an AI series never repeats a champion', dup === 0, `${dup} repeats over ${r.games.length} games`);
        check('the loser of a game takes blue side next', r.games.every((g, k) => k === 0 || g.blue === (r.games[k - 1].w === 'a' ? 'b' : 'a')));
    }
    return worst;
}

/** One emergency signing a season outside a window: the first can go through,
 *  the second must not. Run on a copy, so the real run is untouched. */
function emergencyTest(save0) {
    const save = JSON.parse(JSON.stringify(save0));
    const me = E.myTeam(save);
    save.finance.balance = 1e9;
    for (const id of me.roster.slice(5)) W.release(save, save.players[id]);
    const cheap = Object.values(save.players).filter(p => p.team && p.team !== me.id && !PE.fx(p).hardToBuy && PE.ovrOf(p) < 72)
        .filter(p => MK.willingness(save, p, me).ok).slice(0, 2);
    if (cheap.length < 2) return 'skipped';
    check('outside a window a signing is an emergency', MK.isEmergency(save, cheap[0]));
    check('one emergency signing is available', MK.emergencyLeft(save) === 1, `${MK.emergencyLeft(save)}`);
    const r1 = MK.bidForPlayer(save, cheap[0].id, MK.askingPrice(save, cheap[0]));
    check('the emergency signing goes through', r1.ok, r1.msg);
    const r2 = MK.bidForPlayer(save, cheap[1].id, MK.askingPrice(save, cheap[1]));
    check('a second emergency signing is refused', !r2.ok && /emergency/.test(r2.msg), r2.msg);
    return r1.ok && !r2.ok ? 'ok' : 'failed';
}

/** A save as it was written before this version: no pools, no recent picks,
 *  no achievements, no fearless setting. It must load and play. */
function oldShape(save) {
    const old = JSON.parse(JSON.stringify(save));
    delete old.emergency;
    delete old.settings.fearless;
    delete old.manager.ach;
    delete old.manager.tier2Clubs;
    for (const p of Object.values(old.players)) { delete p.pool; delete p.recent; }
    const back = STORE.hydrate(old);
    check('an old save hydrates', !!back);
    if (back) {
        check('old players get a champion pool', Object.values(back.players).every(p => Array.isArray(p.pool) && p.pool.length >= 1));
        check('old pools never repeat a signature', Object.values(back.players).every(p => p.pool.every(c => !p.favs.includes(c))));
        const again = STORE.hydrate(JSON.parse(JSON.stringify(old)));
        const k = Object.keys(back.players)[0];
        check('an old pool is stable across loads', JSON.stringify(again.players[k].pool) === JSON.stringify(back.players[k].pool));
        check('an old save can play a step', !!E.advance(back));
    }
}

// ---- ownership, history, training, renewals ------------------------------------------
const H = await load('lib/manager/history.js');
function ownershipHistoryTraining() {
    // A founded club is owned outright: no board, no limit, no sack.
    const fw = E.previewWorld(db, 2017, SEED + 3);
    const f = E.finalizeSave(fw, { name: 'Owner', startYear: 2017, seed: SEED + 3, custom: { name: 'Owned FC', short: 'OWN', color: '#10b981', region: 'LCS', tier: 1 } });
    const ft = E.myTeam(f);
    check('a founded club is owned outright', MK.ownerStake(f) === 100 && MK.soleOwner(f) && !MK.hasBoard(f));
    check('a sole owner has no objectives', f.board.objectives.length === 0, JSON.stringify(f.board.objectives));
    check('a sole owner has no wage limit', MK.wageBudget(f, ft) === Infinity);
    check('AI clubs keep their wage limit', Number.isFinite(MK.wageBudget(f, Object.values(f.teams).find(t => t.id !== ft.id))));
    const debt = JSON.parse(JSON.stringify(f));
    debt.finance.balance = -1000;
    const fa = debt.freeAgents.map(id => debt.players[id])[0];
    check('an owner in debt cannot add wages', /debt/.test(MK.signingCheck(debt, fa, { fee: 0, wage: 10000 })));
    const bal = f.finance.balance;
    const r1 = E.sellStake(f, 10);
    check('selling a stake pays', r1.ok && f.finance.balance > bal, r1.msg);
    check('selling a stake brings a board', MK.ownerStake(f) === 90 && MK.hasBoard(f) && f.board.objectives.length > 0);
    check('a board means a wage limit', Number.isFinite(MK.wageBudget(f, ft)));
    check('a majority owner cannot be sacked', !MK.boardCanSack(f));
    E.sellStake(f, 25); E.sellStake(f, 25);
    check('selling a majority lets the board sack you', MK.ownerStake(f) === 40 && MK.boardCanSack(f));
    E.sellStake(f, 25);
    check('you always keep a stake', MK.ownerStake(f) >= 10, `${MK.ownerStake(f)}`);
    f.finance.balance = 1e9;
    for (let i = 0; i < 6 && MK.ownerStake(f) < 100; i++) E.buyStake(f, 25);
    check('buying it all back dissolves the board', MK.ownerStake(f) === 100 && !MK.hasBoard(f) && f.board.objectives.length === 0, `${MK.ownerStake(f)}`);
    // A save from 1.8.8: a founded club with no stake recorded is owned outright.
    const old = JSON.parse(JSON.stringify(f));
    delete old.teams[ft.id].stake;
    old.board.objectives = [{ id: 'survive', text: 'x', met: null }];
    delete old.teams[ft.id].hist;
    const back = STORE.hydrate(old);
    check('an old founded club loads owner-run', MK.soleOwner(back) && back.board.objectives.length === 0);
    check('an old save starts its club record book', !!back.teams[ft.id].hist);

    // A club doing well gets a bigger wage limit.
    const hw = E.previewWorld(db, 2017, SEED);
    const skt = Object.values(hw.teams).find(t => t.region === 'LCK' && t.short === 'SKT');
    const h = E.finalizeSave(hw, { name: 'Hist', teamId: skt.id, startYear: 2017, seed: SEED });
    const base = MK.baseWageBudget(h, skt);
    h.board.confidence = 90;
    check('a confident board raises the wage limit', MK.wageBudget(h, skt) > base, `${MK.wageBudget(h, skt)} vs ${base}`);
    h.board.confidence = 40;
    check('a doubtful board never cuts below the base', MK.wageBudget(h, skt) === base);
    h.manager.trophies.push({ year: 2017, name: 'x', kind: 'league', teamId: skt.id });
    check('a recent title raises the wage limit', MK.wageBudget(h, skt) > base);
    h.manager.trophies.pop();
    h.board.confidence = 60;

    // Real history before the save: SKT's Worlds and MSI titles, credited to Faker.
    const real = H.realHistory(db, skt, 2017);
    const faker = real.players.find(p => p.n.toLowerCase() === 'faker');
    check('real history finds a club legend', !!faker && faker.s >= 3, JSON.stringify(faker && { s: faker.s, t: faker.t }));
    check('real titles come from the champion prints', real.honours.filter(x => x.kind === 'worlds').length >= 3 && real.honours.some(x => x.kind === 'msi'), JSON.stringify(real.honours));
    check('real titles are credited to the players', faker && (faker.t.worlds || 0) >= 2, JSON.stringify(faker && faker.t));
    const custom = H.realHistory(db, ft, 2017);
    check('a founded club has no real history', custom.players.length === 0 && custom.honours.length === 0);

    // Training: sessions, bootcamps, the forecast.
    const me = E.myTeam(h);
    h.finance.balance = 1e8;
    const p = h.players[me.roster[0]];
    const xp0 = (p.lv * 300) + p.xp;
    const s1 = E.runSession(h, 'coach', p.id);
    check('a coaching session grows a player', s1.ok && (p.lv * 300 + p.xp) > xp0, s1.msg);
    const pool0 = p.pool.length;
    const s2 = E.runSession(h, 'pool', p.id);
    check('champion practice adds to the pool', s2.ok && (p.pool.length > pool0 || p.pool.length === 6), s2.msg);
    check('two sessions a week, no more', !E.runSession(h, 'vod').ok && E.sessionsLeft(h) === 0);
    const b1 = E.runBootcamp(h, 'retreat');
    check('a bootcamp runs', b1.ok, b1.msg);
    check('a bootcamp runs once a split', !E.runBootcamp(h, 'retreat').ok);
    E.setIntensity(h, p.id, 'intense');
    E.setBenchProgram(h, 'academy');
    check('intensity and the bench programme are set', p.intensity === 'intense' && me.bench === 'academy');
    for (const id of me.roster) {
        const d = E.devForecast(h, h.players[id]);
        check('the development forecast is finite', Number.isFinite(d.week) && d.week >= 0 && (d.weeks == null || d.weeks >= 1) && Number.isFinite(d.ovrDelta), JSON.stringify(d));
    }
    // A season, then the record book.
    for (let i = 0; i < 12; i++) { E.autoLineup(h); for (const m of h.inbox) if (m.options && !m.answered && !E.answerEvent(h, m.id, m.options[0].id).ok) E.answerEvent(h, m.id, m.options[m.options.length - 1].id); E.advance(h); }
    const rec = Object.values(me.hist || {});
    check('the record book counts games', rec.some(e => e.g > 0 && e.s >= 1), `${rec.length} entries`);
    {
        // A title goes to the five and to anyone who played that year, never to a sub who did not.
        const t = { roster: ['a', 'b', 'c'], lineup: { TOP: 'a' }, hist: {} };
        const w = { time: { year: 2030 }, players: { a: { id: 'a', name: 'A', role: 'TOP' }, b: { id: 'b', name: 'B', role: 'MID' }, c: { id: 'c', name: 'C', role: 'ADC' } } };
        H.histGame(t, w.players.c, 2030, true, false);
        H.histTitle(w, t, 'league');
        check('a title goes to those who played for it', t.hist.a.t.league === 1 && t.hist.c.t.league === 1 && !(t.hist.b && t.hist.b.t.league), JSON.stringify(t.hist));
    }
    const ch = H.clubHistory(h, db, me);
    check('club history merges real and saved players', ch.players.some(e => e.pre && e.inSave), `${ch.players.length} players`);
    check('club history ranks legends', ch.players[0] && ch.players[0].tier, JSON.stringify(ch.players[0] && { n: ch.players[0].n, s: ch.players[0].score }));
    // Renewals: everyone at their ask, in one click.
    for (const id of me.roster.slice(0, 3)) h.players[id].until = h.time.year;
    const ra = MK.renewAllExpiring(h);
    check('renew all signs everyone it can', ra.done.length >= 1 && ra.done.every(x => { const q = Object.values(h.players).find(pp => pp.name === x.name); return q && q.until > h.time.year; }), ra.msg);
    console.log(`  SKT legends: ${ch.players.slice(0, 3).map(e => `${e.n} (${Math.round(e.score)})`).join(', ')}; real honours ${real.honours.map(x => x.kind + ' ' + x.year).join(', ')}`);
}

// ---- the economy: wage limits that fit the wages of their era --------------------
function economy() {
    const idx = {};
    for (const { year } of D.START_YEARS) {
        const w = E.previewWorld(db, year, SEED);
        idx[year] = MK.econIndex(w);
        const clubs = Object.values(w.teams).filter(t => !t.custom);
        const over = clubs.filter(t => MK.wageBill(w, t) > MK.baseWageBudget(w, t));
        check('no club starts over its wage limit', over.length === 0, `${year}: ${over.map(t => `${t.short} ${Math.round(MK.wageBill(w, t) / 1000)}K/${Math.round(MK.baseWageBudget(w, t) / 1000)}K`).join(', ')}`);
        const inv = clubs.filter(t => t.invest);
        check('owner investment only where it is needed', inv.every(t => t.invest > 1 && t.invest <= 3), inv.map(t => t.short + ' ' + t.invest).join(', '));
        for (const t of inv) check('owners pay what they invest', MK.ownerFunding(w, t) > 0, t.short);
        const ratios = clubs.filter(t => t.tier === 1).map(t => MK.wageBill(w, t) / MK.baseWageBudget(w, t));
        const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        check('a typical top-league club has room under its limit', mean > 0.3 && mean < 0.75, `${year}: mean ${mean.toFixed(2)}`);
        if (year === 2026) {
            const t1 = clubs.find(t => t.region === 'LCK' && t.short === 'T1');
            check('T1 is a big club in 2026 (prestige)', t1 && t1.prestige >= 6 && t1.rep >= 90, JSON.stringify(t1 && { rep: t1.rep, prestige: t1.prestige }));
            check('T1 2026 fits its limit with room', t1 && MK.wageBill(w, t1) <= MK.baseWageBudget(w, t1) * 0.95, t1 && `${MK.wageBill(w, t1)} / ${MK.baseWageBudget(w, t1)}`);
        }
        console.log(`  ${year}: level ${w.econ.level} index ${idx[year].toFixed(2)} | t1 bill/limit mean ${mean.toFixed(2)} worst ${Math.max(...ratios).toFixed(2)} | invested: ${inv.map(t => `${t.short} +${Math.round((t.invest - 1) * 100)}%`).join(', ') || 'none'}`);
    }
    check('club money grows from 2013 to 2026', idx[2026] > idx[2013] * 1.5, JSON.stringify(idx));
    check('a 99 asks at most 2.5x an 88', PE.wageCurve(99) / PE.wageCurve(88) < 2.5 && PE.wageCurve(99) / PE.wageCurve(88) > 1.5);
    check('the wage curve is continuous at the knee', Math.abs(PE.wageCurve(D.WAGE_KNEE + 0.001) / PE.wageCurve(D.WAGE_KNEE) - 1) < 0.01);

    // Investment fades a year at a time.
    const t = { invest: 1.5 };
    MK.fadeInvestment(t);
    check('owner investment fades', t.invest > 1 && t.invest < 1.5, JSON.stringify(t));
    for (let i = 0; i < 20; i++) MK.fadeInvestment(t);
    check('owner investment ends', t.invest === undefined, JSON.stringify(t));

    // A club over its limit can still renew at the same money, never at more.
    const w = E.previewWorld(db, 2026, SEED);
    const t1 = Object.values(w.teams).find(t => t.region === 'LCK' && t.short === 'T1');
    const s = E.finalizeSave(w, { name: 'Econ', teamId: t1.id, startYear: 2026, seed: SEED });
    const me = E.myTeam(s);
    const pl = s.players[me.roster[0]];
    pl.until = s.time.year;
    me.invest = undefined;
    s.board.confidence = 60;
    pl.wage = MK.wageBudget(s, me);          // the bill is now far over the limit
    const keep = MK.negotiateRenewal(s, pl.id, { years: 2, wage: pl.wage, bonus: 0, status: 'regular' }, () => 0);
    check('a club over its limit can renew at the same wage', keep.ok, keep.msg);
    pl.until = s.time.year; delete pl.negot;
    const more = MK.negotiateRenewal(s, pl.id, { years: 2, wage: pl.wage + 100000, bonus: 0, status: 'regular' }, () => 0);
    check('a club over its limit cannot renew for more', !more.ok && /limit/.test(more.msg), more.msg);

    // A save from before the economy: repriced once, scaled, and nobody over the line.
    const w2 = E.previewWorld(db, 2026, SEED + 1);
    const t2 = Object.values(w2.teams).find(t => t.region === 'LPL' && t.tier === 1);
    const old = E.finalizeSave(w2, { name: 'Old', teamId: t2.id, startYear: 2026, seed: SEED + 1 });
    const star = Object.values(old.players).filter(x => x.team).sort((a, b) => PE.ovrOf(b) - PE.ovrOf(a))[0];
    for (const x of Object.values(old.players)) if (x.team && PE.ovrOf(x) > D.WAGE_KNEE) x.wage = Math.round(x.wage * Math.pow(D.WAGE_STEP / D.WAGE_TOP_STEP, PE.ovrOf(x) - D.WAGE_KNEE));
    for (const x of Object.values(old.teams)) { delete x.invest; delete x.prestige; }
    delete old.econ;
    const before = star.wage;
    const back = STORE.hydrate(JSON.parse(JSON.stringify(old)));
    check('an old save gets the economy', back.econ && Number.isFinite(back.econ.level));
    check('an old save reprices the top wages', back.players[star.id].wage < before, `${back.players[star.id].wage} vs ${before}`);
    const overOld = Object.values(back.teams).filter(x => !x.custom && MK.wageBill(back, x) > MK.baseWageBudget(back, x));
    check('an old save has nobody over the limit', overOld.length === 0, overOld.map(x => x.short).join(', '));
    const again = STORE.hydrate(JSON.parse(JSON.stringify(back)));
    check('the repricing happens once', again.players[star.id].wage === back.players[star.id].wage);
    console.log(`  old-save repricing: ${star.name} ${PE.ovrOf(star)} OVR ${Math.round(before / 1000)}K -> ${Math.round(back.players[star.id].wage / 1000)}K`);
}

// ---- run ------------------------------------------------------------------------
const STARTS = ONLY_START ? [Number(ONLY_START)] : D.START_YEARS.map(s => s.year);
const upsets = { games: 0, upset: 0 };
// Places above (+) or below (-) the board's preseason expectation, for a manager
// who only auto-picks. Well above zero means the manager's club has a hidden edge.
const overPerf = { n: 0, sum: 0 };
const market = { bids: 0, bought: 0, sold: 0, listed: 0, listedOffers: 0, listedSold: 0, expired: 0 };
const contracts = { renewed: 0, letGo: 0, blocked: 0, left: 0, retiredAnnounced: 0 };
const variety = [];
const achTotals = {};
const t0 = Date.now();

/** What a manager does before a step: lineup, plan, inbox, market, contracts. */
function manage(save, step, guard, year) {
    const me = E.myTeam(save);
    if (!me) return;
    E.autoLineup(save);
    me.tactic = M.bestTactic(M.lineupOf(me, save.players));
    me.training = ['balanced', 'individual', 'scrims', 'draft', 'rest'][guard % 5];
    for (const m of save.inbox) if (m.options && !m.answered && !E.answerEvent(save, m.id, m.options[0].id).ok) E.answerEvent(save, m.id, m.options[m.options.length - 1].id);
    // Starters are renewed in the summer; everyone else waits for the deadline.
    const starters = new Set(Object.values(M.lineupOf(me, save.players)).map(x => x.id));
    for (const id of me.roster) {
        const p = save.players[id];
        if (p && p.until <= year && step.id === 'summer_w5' && starters.has(id)) { if (MK.renewContract(save, id).ok) contracts.renewed++; }
    }
    if (step.kind === 'window' && !NO_MARKET) {
        // Buy the best affordable upgrade at the asking price.
        const lu = M.lineupOf(me, save.players);
        const weakest = D.ROLE_IDS.slice().sort((a, b) => PE.ovrOf(lu[a]) - PE.ovrOf(lu[b]))[0];
        const target = Object.values(save.players)
            .filter(p => p.team && p.team !== me.id && p.role === weakest && PE.ovrOf(p) > PE.ovrOf(lu[weakest]) + 2)
            .filter(p => !MK.signingCheck(save, p, { fee: MK.askingPrice(save, p), wage: MK.wageAsk(save, p, me) }))
            .sort((a, b) => PE.ovrOf(b) - PE.ovrOf(a))[0];
        if (target) {
            const fee = MK.askingPrice(save, target);
            const bal = save.finance.balance;
            const r = MK.bidForPlayer(save, target.id, fee);
            market.bids++;
            if (r.ok) {
                market.bought++;
                check('a bought player joins your roster', me.roster.includes(target.id) && target.team === me.id);
                check('the fee leaves your balance', Math.abs(bal - fee - save.finance.balance) < 1, `${bal} - ${fee} != ${save.finance.balance}`);
            }
        }
        // List the weakest bench player cheaply; take offers as they come.
        const five = new Set(Object.values(M.lineupOf(me, save.players)).map(p => p.id));
        const spare = me.roster.map(id => save.players[id]).filter(p => p && !five.has(p.id) && !p.listed).sort((a, b) => PE.ovrOf(a) - PE.ovrOf(b))[0];
        if (spare && me.roster.length > 6) {
            const before = (save.offers || []).length;
            const r = MK.listPlayer(save, spare.id, PE.marketValue(spare, save.time.year) * 0.8);
            check('listing a player works', r.ok && spare.listed > 0, r.msg);
            market.listed++;
            market.listedOffers += (save.offers || []).length - before;
        }
        for (const o of (save.offers || []).slice()) {
            if (market.sold % 2 === 0 || Math.random() < 0.5 || o.listed) {
                const p = save.players[o.pid];
                if (!p || p.team !== me.id) continue;
                const bal = save.finance.balance;
                const r = MK.acceptBid(save, o.id);
                if (r.ok) {
                    market.sold++;
                    if (o.listed) market.listedSold++;
                    check('a sold player leaves your roster', !me.roster.includes(p.id) && p.team === o.from);
                    check('the fee arrives', Math.abs(save.finance.balance - bal - o.fee) < 1);
                    check('a sold player is off the list', !p.listed);
                }
            }
        }
    }
    // Fill a hole from free agency, which is what a player would do.
    for (let k = 0; k < 5; k++) {
        const lu = M.lineupOf(me, save.players);
        const need = D.ROLE_IDS.find(r => !lu[r]);
        if (!need) break;
        const fa = save.freeAgents.map(id => save.players[id]).filter(p => p.role === need && !MK.signingCheck(save, p, { fee: 0, wage: MK.wageAsk(save, p, me) }))
            .sort((a, b) => PE.ovrOf(b) - PE.ovrOf(a))[0]
            || save.freeAgents.map(id => save.players[id]).filter(p => p.role === need).sort((a, b) => MK.wageAsk(save, a, me) - MK.wageAsk(save, b, me))[0];
        if (!fa) break;
        MK.signFreeAgent(save, fa.id, 1);
    }
    // The contract deadline: renew who you can, let the rest go.
    if (step.kind === 'offseason') {
        // Make sure the deadline has something to wait for, every year.
        if (!E.undecidedContracts(save).length) {
            const p = me.roster.map(id => save.players[id]).find(x => x && !x.retiring && x.until > save.time.year);
            if (p) p.until = save.time.year;
        }
        const open = E.undecidedContracts(save);
        if (open.length) {
            const b = E.blockInfo(save);
            check('the offseason waits for contract decisions', !!b && b.go === 'squad', JSON.stringify(b));
            contracts.blocked++;
        }
        for (const p of open) {
            const five = new Set(Object.values(M.lineupOf(me, save.players)).map(x => x.id));
            if (five.has(p.id) && MK.renewContract(save, p.id).ok) contracts.renewed++;
            else { MK.letContractRun(save, p.id); contracts.letGo++; }
        }
        check('every contract is decided before the offseason', E.undecidedContracts(save).length === 0);
    }
}

function runSave(save, label, years, measure = true) {
    let expectedAtStart = save.board.expected;
    for (let y = 0; y < years; y++) {
        const year = save.time.year;
        let guard = 0;
        while (save.time.year === year && guard++ < 70) {
            if (save.jobless) {
                const offer = save.jobOffers[0];
                check('a sacked manager gets job offers', !!offer, `${year}`);
                if (!offer) break;
                E.acceptJob(save, offer);
                continue;
            }
            const step = E.currentStep(save);
            manage(save, step, guard, year);
            const block = E.blockInfo(save);
            if (block) { check('never blocked after managing', false, `${label} ${year} ${step.id}: ${block.msg}`); break; }
            // Who is announced to retire, and who of mine should still be here after the offseason.
            const me = E.myTeam(save);
            const flagged = step.kind === 'offseason' && me ? me.roster.filter(id => save.players[id] && save.players[id].retiring === year) : [];
            const staying = step.kind === 'offseason' && me ? me.roster.filter(id => save.players[id] && !save.players[id].retiring && save.players[id].until > year) : [];
            // Every third match of the manager's is played by hand, through the same
            // commit the screen uses; the rest are simmed.
            let mine = null;
            const fx = E.userFixture(save);
            if (fx && guard % 3 === 0 && !NO_HAND) mine = playByHand(save);
            const sum = E.advance(save, mine);
            if (mine && fx) {
                const tie = sum.mine && sum.mine.tie;
                const meId = save.manager.teamId;
                const myScore = tie ? (tie.a === meId ? tie.score : [tie.score[1], tie.score[0]]) : null;
                check('a hand-played series is recorded as played', !!tie && myScore && myScore[0] === mine.score[0] && myScore[1] === mine.score[1],
                    `${JSON.stringify(myScore)} vs ${JSON.stringify(mine.score)}`);
            }
            if (sum.mine) {
                const t = sum.mine.tie;
                const sa = M.teamStrength(save.teams[t.a], save.players), sb = M.teamStrength(save.teams[t.b], save.players);
                upsets.games++;
                if ((sa > sb && t.winner === t.b) || (sb > sa && t.winner === t.a)) upsets.upset++;
                check('the series keeps its drafts', Array.isArray(sum.mine.draft) && sum.mine.draft.length === sum.mine.games && sum.mine.draft.every(d => d.mine && d.theirs));
            }
            if (step.kind === 'window') {
                check('bids lapse when the window closes', (save.offers || []).length === 0 || E.currentStep(save).kind === 'window', `${save.offers.length} open after ${step.id}`);
            }
            if (step.kind === 'offseason') {
                contracts.retiredAnnounced += flagged.length;
                for (const id of flagged) check('an announced retirement happens', !save.players[id] || !save.players[id].team, id);
                for (const id of staying) check('nobody under contract retires unannounced', !!save.players[id], id);
                if (VERBOSE) console.log(`    offseason: ${sum.offseason.debuts.length} debuts, ${sum.offseason.retired.length} notable retirements`);
            }
            if (step.id === 'msi_qf') {
                const msi = save.season.msi;
                check('MSI has 8 teams', msi && msi.teams.length === 8, `${year}: ${msi && msi.teams.length}`);
                check('MSI has no repeats', msi && new Set(msi.teams).size === msi.teams.length);
            }
            if (step.id === 'worlds_r16') {
                const w = save.season.worlds;
                check('Worlds has 16 teams', w && w.teams.length === 16, `${year}: ${w && w.teams.length}`);
                check('Worlds has no repeats', w && new Set(w.teams).size === w.teams.length);
                const byRegion = {};
                for (const id of w.teams) byRegion[save.teams[id].region] = (byRegion[save.teams[id].region] || 0) + 1;
                check('Worlds slots add up', Object.values(byRegion).reduce((s, v) => s + v, 0) === 16);
            }
        }
        check('a year completes', save.time.year === year + 1, `${label} ${year}: stuck at ${save.time.year} step ${save.time.step}`);
        {
            const h0 = save.history[save.history.length - 1];
            if (measure && h0 && h0.me && expectedAtStart) {
                for (const sp of ['spring', 'summer']) if (h0.me[sp]) { overPerf.n++; overPerf.sum += expectedAtStart - h0.me[sp]; }
            }
            expectedAtStart = save.board.expected;
        }
        invariants(save, `${label} ${year} end`);
        rosterCover(save, `${label} ${year} end`);
        const h = save.history[save.history.length - 1];
        const champ = (id) => (id && save.teams[id] ? save.teams[id].short : '—');
        check('worlds crowned', !!(h && h.worlds), `${year}`);
        check('msi crowned', !!(h && h.msi), `${year}`);
        for (const r of D.REGION_IDS) {
            check('spring champion', !!(h && h.champs[r + ':1:spring']), `${year} ${r}`);
            check('summer champion', !!(h && h.champs[r + ':1:summer']), `${year} ${r}`);
        }
        const P = Object.values(save.players);
        const rostered = P.filter(p => p.team);
        const mean = (r) => { const xs = rostered.filter(p => save.teams[p.team].region === r && save.teams[p.team].tier === 1).map(PE.ovrOf); return xs.length ? (xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1) : '-'; };
        const realShare = Math.round(100 * rostered.filter(p => p.real).length / Math.max(1, rostered.length));
        const me = h && h.me;
        console.log(`  ${year}: Worlds ${champ(h.worlds)}  MSI ${champ(h.msi)}  | t1 OVR ${D.REGION_IDS.map(r => r + ' ' + mean(r)).join(' ')} | real ${realShare}% | FA ${save.freeAgents.length} | you ${me ? `${me.teamName} sp ${me.spring ?? '-'} su ${me.summer ?? '-'}${me.worlds ? ' W' + me.worlds : ''}` : 'jobless'} $${Math.round(save.finance.balance / 1000)}K conf ${Math.round(save.board.confidence)} lv ${save.manager.level}`);
        const t1s = Object.values(save.teams).filter(t => t.tier === 1 && !t.custom);
        const ratios = t1s.map(t => MK.wageBill(save, t) / MK.baseWageBudget(save, t));
        console.log(`         economy level ${save.econ && save.econ.level} index ${MK.econIndex(save).toFixed(2)} | t1 wage bill / limit: mean ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)}, over ${ratios.filter(r => r > 1).length}/${ratios.length}, worst ${Math.max(...ratios).toFixed(2)} | invested ${t1s.filter(t => t.invest).length}`);
        check('the economy level is taken every year', save.econ && save.econ.year === save.time.year && Number.isFinite(save.econ.level), JSON.stringify(save.econ));
    }
    for (const [id, a] of Object.entries(save.manager.ach || {})) achTotals[id] = (achTotals[id] || 0) + a.n;
    check('achievement counts are whole numbers', Object.values(save.manager.ach || {}).every(a => Number.isInteger(a.n) && a.n >= 1 && Array.isArray(a.years)));
}

for (const start of STARTS) {
    console.log('');
    console.log(`=== start ${start} ${'='.repeat(60)}`);
    const tb = Date.now();
    const world = E.previewWorld(db, start, SEED);
    const buildMs = Date.now() - tb;
    const regionInfo = D.REGION_IDS.map(r => `${r}:${world.dataYears[r]}`).join(' ');
    console.log(`  world built in ${buildMs}ms  data years ${regionInfo}`);
    // Take a mid-table tier 1 club in the first region with real data.
    const region = D.REGION_IDS[(SEED + start) % D.REGION_IDS.length];
    const t1 = Object.values(world.teams).filter(t => t.region === region && t.tier === 1);
    const pickTeam = t1[Math.min(t1.length - 1, 4)];
    const save = E.finalizeSave(world, { name: 'Smoke', teamId: pickTeam.id, startYear: start, seed: SEED });
    console.log(`  managing ${pickTeam.name} (${region}), ${Object.keys(save.players).length} players, ${Object.keys(save.teams).length} teams`);
    invariants(save, `${start} start`);
    rosterCover(save, `${start} start`);
    {
        const ages = Object.values(save.players).filter(p => p.real && p.team).map(p => PE.ageOf(p, start));
        const hist = {};
        for (const a of ages) hist[a] = (hist[a] || 0) + 1;
        const mean = ages.reduce((s, v) => s + v, 0) / Math.max(1, ages.length);
        console.log(`  real player ages: mean ${mean.toFixed(1)}, ${Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([a, n]) => a + ':' + n).join(' ')}`);
        check('real players are not all one age', Object.keys(hist).length >= 5, JSON.stringify(hist));
        check('real player ages are plausible', mean >= 18.5 && mean <= 23.5, mean.toFixed(1));
        check('every player has a champion pool', Object.values(save.players).every(p => Array.isArray(p.pool) && p.pool.length >= 1 && p.pool.every(c => !p.favs.includes(c))));
    }
    // A save must survive a trip through storage exactly as the store writes and reads it.
    {
        const back = STORE.hydrate(JSON.parse(JSON.stringify(save)));
        check('a fresh save hydrates', !!back && back.created, 'hydrate returned nothing');
        if (back) {
            check('hydrate keeps every player', Object.keys(back.players).length === Object.keys(save.players).length);
            check('hydrate keeps every team', Object.keys(back.teams).length === Object.keys(save.teams).length);
            check('hydrate keeps the manager', back.manager.teamId === save.manager.teamId);
        }
        check('a junk save hydrates to nothing', STORE.hydrate({ created: true }) === null && STORE.hydrate(null) === null);
        oldShape(save);
    }
    const v = draftVariety(save);
    variety.push(v);
    check('AI bans vary between games', v.sets >= 6 && v.firsts >= 3, JSON.stringify(v));
    if (start >= D.FEARLESS_FROM) check('fearless is compulsory from ' + D.FEARLESS_FROM, E.fearlessOn(save) && E.matchContext(save, 'league').fearless);
    else check('fearless is a setting before ' + D.FEARLESS_FROM, !E.fearlessOn(save));
    fearlessSeries(save);
    runSave(save, String(start), YEARS);
    // The emergency signing, mid-split, on a copy.
    {
        while (E.currentStep(save).kind !== 'league' && save.time.step < 5) { manage(save, E.currentStep(save), 0, save.time.year); E.advance(save); }
        if (E.myTeam(save)) check('the emergency signing test ran', emergencyTest(save) !== 'failed');
    }
    const size = JSON.stringify(save).length;
    console.log(`  save size ${Math.round(size / 1024)}kb, ${Object.keys(save.players).length} players, manager trophies ${save.manager.trophies.length}, achievements ${Object.keys(save.manager.ach || {}).length}`);
    check('save stays under 1.5MB', size < 1.5 * 1024 * 1024, `${Math.round(size / 1024)}kb`);
}

console.log('');
console.log(`=== ownership, history, training ${'='.repeat(46)}`);
ownershipHistoryTraining();
console.log('');
console.log(`=== the economy ${'='.repeat(63)}`);
economy();

// ---- a club built from nothing ------------------------------------------------------
{
    const start = Number(ONLY_START) || 2017;
    console.log('');
    console.log(`=== a founded club, ${start} ${'='.repeat(50)}`);
    for (const [region, tier] of [['LEC', 2], ['LCK', 1]]) {
        const world = E.previewWorld(db, start, SEED + 1);
        const save = E.finalizeSave(world, { name: 'Founder', startYear: start, seed: SEED + 1, custom: { name: 'Smoke Rising', short: 'SMK', color: '#10b981', region, tier } });
        const me = E.myTeam(save);
        check('a founded club exists', !!me && me.custom && me.region === region && me.tier === tier, JSON.stringify(me && { r: me.region, t: me.tier }));
        check('a founded club starts empty', me.roster.length === 0);
        const L = save.season.leagues[region + ':' + tier];
        check('a founded club takes a league place', L.teams.includes(me.id) && L.teams.length === (tier === 1 ? D.TIER1_SIZE : D.TIER2_SIZE), `${L.teams.length}`);
        const b = E.blockInfo(save);
        check('an empty club cannot close the window', !!b && b.go === 'transfers', JSON.stringify(b));
        const fas = save.freeAgents.map(id => save.players[id]).filter(p => (p.reg || p.nat) === region);
        console.log(`  ${region} tier ${tier} free agency: ${fas.length} players, ${fas.filter(p => p.real).length} real`);
        check('free agency is deep enough to found a club', fas.length >= 15, `${fas.length}`);
        for (const role of D.ROLE_IDS) check('free agency covers every role', fas.filter(p => p.role === role).length >= 2, role);
        invariants(save, `founded ${region} start`);
        manage(save, E.currentStep(save), 0, start);
        check('a founded club can sign a full five', D.ROLE_IDS.every(r => M.lineupOf(me, save.players)[r]), me.roster.map(id => save.players[id].role).join(','));
        console.log(`  ${region} tier ${tier}: signed ${me.roster.length}, team OVR ${M.teamStrength(me, save.players).toFixed(1)}, objectives ${save.board.objectives.map(o => o.id).join(',')}`);
        runSave(save, `founded-${region}`, Math.min(2, YEARS), false);
    }
}

console.log('');
if (ratingStats.n) {
    console.log(`  hand-played ratings: mean ${(ratingStats.sum / ratingStats.n).toFixed(2)} (winners ${(ratingStats.win / Math.max(1, ratingStats.winN)).toFixed(2)}, losers ${(ratingStats.lose / Math.max(1, ratingStats.loseN)).toFixed(2)}), range ${ratingStats.lo}-${ratingStats.hi}`);
    check('ratings spread sensibly', ratingStats.win / ratingStats.winN < 8.6 && ratingStats.lose / ratingStats.loseN > 4.2, 'winner/loser means out of band');
}
if (callStats.games) {
    console.log(`  in-game calls: ${(callStats.calls / callStats.games).toFixed(2)} a game, the late call in ${Math.round(100 * callStats.late / callStats.games)}% of games (${JSON.stringify(callStats.byStage)})`);
    check('the late call comes up, but not every game', callStats.late > 0 && callStats.late < callStats.games, `${callStats.late}/${callStats.games}`);
}
console.log(`  AI ban variety (distinct ban sets / first bans in 24 drafts): ${variety.map(v => `${v.sets}/${v.firsts}`).join(' ')}`);
console.log(`  market: ${market.bids} bids at the asking price, ${market.bought} signings, ${market.sold} sales; ${market.listed} listings drew ${market.listedOffers} offers, ${market.listedSold} sold`);
check('the market works both ways', market.bought > 0 && market.sold > 0, JSON.stringify(market));
check('the transfer list draws offers', market.listedOffers > 0, JSON.stringify(market));
console.log(`  contracts: ${contracts.renewed} renewed, ${contracts.letGo} let go, the offseason waited ${contracts.blocked} time(s), ${contracts.retiredAnnounced} announced retirements`);
check('the contract deadline fires', contracts.blocked > 0);
console.log(`  achievements: ${Object.entries(achTotals).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
check('achievements are earned', Object.keys(achTotals).length > 0);
if (overPerf.n) {
    console.log(`  passive manager vs board expectation: ${(overPerf.sum / overPerf.n).toFixed(2)} places a split (positive = better than expected), ${overPerf.n} splits`);
}
if (upsets.games) {
    console.log(`  manager's series won by the weaker side: ${upsets.upset} of ${upsets.games} (${Math.round(100 * upsets.upset / upsets.games)}%)`);
    check('upsets happen', upsets.upset > 0);
}
console.log(`ran ${STARTS.length} start(s) x ${YEARS} year(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures) {
    console.log(`FAILED -- ${failures} of ${checks} checks`);
    for (const [k, n] of fails) console.log(`  ${n} x ${k}`);
    process.exit(1);
}
console.log(`All ${checks} checks passed.`);

