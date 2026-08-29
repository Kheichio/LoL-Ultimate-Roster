// ===========================================================================
//  LoL ULTIMATE CAREER -- headless smoke harness
// ===========================================================================
//  Developer tool. Nothing in src/ imports it and vite never bundles it.
//
//    node tools/careerSmoke.mjs [--seed 12345] [--careers 8] [--years 12]
//
//  It boots a browser-shaped environment, loads the real card database, seeds
//  Math.random, then plays N full careers week by week -- training, activities,
//  real played matches, simulated matches, transfers, shopping, events,
//  interviews, awards -- asserting invariants after every single week.
//
//  ASCII only. This repo has been corrupted by encoding round-trips before.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
//  ARGS
// ---------------------------------------------------------------------------
function argOf(name, dflt) {
    const i = process.argv.indexOf('--' + name);
    if (i < 0 || i + 1 >= process.argv.length) return dflt;
    const n = Number(process.argv[i + 1]);
    return Number.isFinite(n) ? n : dflt;
}

const SEED = Math.round(argOf('seed', (Date.now() % 1000000)));
const N_CAREERS = Math.round(argOf('careers', 8));
const N_YEARS = Math.round(argOf('years', 12));
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
//  SEEDED RNG (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(a) {
    let s = a >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rand = mulberry32(SEED);
Math.random = rand;

function ri(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function rpick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// ---------------------------------------------------------------------------
//  BROWSER SHIM -- must exist before any career module is imported
// ---------------------------------------------------------------------------
class MemStorage {
    constructor() { this.m = new Map(); }
    get length() { return this.m.size; }
    key(i) { const ks = Array.from(this.m.keys()); return i >= 0 && i < ks.length ? ks[i] : null; }
    getItem(k) { const v = this.m.get(String(k)); return v === undefined ? null : v; }
    setItem(k, v) { this.m.set(String(k), String(v)); }
    removeItem(k) { this.m.delete(String(k)); }
    clear() { this.m.clear(); }
}

class FakeAudioParam {
    setValueAtTime() { return this; }
    exponentialRampToValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; }
    setTargetAtTime() { return this; }
}

class FakeAudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = { connect() {}, disconnect() {} };
    }
    resume() { this.state = 'running'; }
    suspend() {}
    close() {}
    createOscillator() {
        return {
            type: 'sine',
            frequency: new FakeAudioParam(),
            detune: new FakeAudioParam(),
            connect() {}, disconnect() {}, start() {}, stop() {},
        };
    }
    createGain() {
        return { gain: new FakeAudioParam(), connect() {}, disconnect() {} };
    }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
}

function makeElement(tag) {
    const el = {
        tagName: String(tag || 'div').toUpperCase(),
        style: {},
        dataset: {},
        children: [],
        classList: {
            _s: new Set(),
            add(...a) { a.forEach(x => this._s.add(x)); },
            remove(...a) { a.forEach(x => this._s.delete(x)); },
            toggle(x, on) { if (on === undefined) { this._s.has(x) ? this._s.delete(x) : this._s.add(x); } else if (on) { this._s.add(x); } else { this._s.delete(x); } },
            contains(x) { return this._s.has(x); },
        },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        getContext() { return null; },
        click() {}, focus() {}, blur() {}, remove() {},
    };
    return el;
}

const storage = new MemStorage();
const win = {};
win.localStorage = storage;
win.sessionStorage = new MemStorage();
win.matchMedia = () => ({
    matches: false, media: '',
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
});
win.AudioContext = FakeAudioContext;
win.webkitAudioContext = FakeAudioContext;
win.scrollTo = () => {};
win.addEventListener = () => {};
win.removeEventListener = () => {};
win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
win.cancelAnimationFrame = (id) => clearTimeout(id);
win.navigator = { userAgent: 'careerSmoke', language: 'en' };
win.location = { href: 'http://localhost/', hash: '', search: '' };
win.innerWidth = 1440;
win.innerHeight = 900;
win.devicePixelRatio = 1;
win.self = win;
win.window = win;

const doc = {
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    createElement: (t) => makeElement(t),
    createElementNS: (_ns, t) => makeElement(t),
    createTextNode: (t) => ({ nodeValue: String(t) }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    cookie: '',
};
win.document = doc;

globalThis.localStorage = storage;
globalThis.sessionStorage = win.sessionStorage;
globalThis.window = win;
globalThis.document = doc;
globalThis.navigator = globalThis.navigator || win.navigator;
globalThis.matchMedia = win.matchMedia;
globalThis.AudioContext = FakeAudioContext;
globalThis.requestAnimationFrame = win.requestAnimationFrame;
globalThis.cancelAnimationFrame = win.cancelAnimationFrame;

// ---- the real card database ------------------------------------------------
const DB_PATH = path.join(ROOT, 'public', 'database.js');
if (!fs.existsSync(DB_PATH)) {
    console.error('FATAL: public/database.js not found at ' + DB_PATH);
    process.exit(2);
}
const dbSrc = fs.readFileSync(DB_PATH, 'utf8');
try {
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'localStorage', dbSrc)(win, doc, storage);
} catch (e) {
    console.error('FATAL: could not evaluate public/database.js -- ' + e.message);
    console.error(e.stack);
    process.exit(2);
}

const DB = win.playerDatabase;
if (!Array.isArray(DB) || DB.length < 1000) {
    console.error('');
    console.error('##########################################################');
    console.error('##  FATAL: window.playerDatabase is empty or tiny       ##');
    console.error('##  (' + (Array.isArray(DB) ? DB.length : typeof DB) + ' entries). Every career module has a');
    console.error('##  synthetic roster fallback that would silently mask   ##');
    console.error('##  the real code path. Refusing to run.                 ##');
    console.error('##########################################################');
    process.exit(2);
}

// ---------------------------------------------------------------------------
//  IMPORT THE MODE
// ---------------------------------------------------------------------------
const load = (rel) => import(pathToFileURL(path.join(ROOT, 'src', rel)).href);

const K = await load('lib/career/constants.js');
const R = await load('lib/career/ratings.js');
const T = await load('lib/career/teams.js');
const TR = await load('lib/career/training.js');
const M = await load('lib/career/match.js');
const E = await load('lib/career/economy.js');
const C = await load('lib/career/contracts.js');
const A = await load('lib/career/awards.js');
const EV = await load('lib/career/events.js');
const G = await load('lib/career/engine.js');
const ST = await load('lib/stores/career.js');
// The career leaderboard. board.js is the PURE half -- no network, no store
// writes -- so building the two published documents out of a finished career is
// safe to do here, and it is the only way to measure what a real career
// actually publishes. AC carries the bounds those documents are validated
// against; a bound that is too tight denies the write, the client's catch
// swallows it, and an honest career never appears for anyone.
const BD = await load('lib/career/board.js');
const AC = await load('lib/utils/anticheat.js');

// svelte store read without importing svelte's get (keeps the dep surface tiny)
function readStore(s) {
    let v = null;
    const un = s.subscribe(x => { v = x; });
    un();
    return v;
}
const cur = () => readStore(ST.career);

// ---------------------------------------------------------------------------
//  FAILURE LEDGER
// ---------------------------------------------------------------------------
const failures = [];
const seen = new Set();

function attributeFile(stack, fallback) {
    if (!stack) return fallback;
    const lines = String(stack).split('\n');
    for (const ln of lines) {
        const m = ln.match(/src[\\/]((?:lib|data)[\\/][^\s):]+\.js)/);
        if (m) return 'src/' + m[1].replace(/\\/g, '/');
    }
    return fallback;
}

function fail(severity, file, symptom, evidence, suggestedFix, dedupeKey) {
    const key = dedupeKey || (file + '|' + symptom);
    if (seen.has(key)) {
        const hit = failures.find(f => f._key === key);
        if (hit) hit._count = (hit._count || 1) + 1;
        return;
    }
    seen.add(key);
    failures.push({
        _key: key, _count: 1,
        severity, file, symptom,
        evidence: String(evidence).slice(0, 900),
        suggestedFix,
    });
}

let CTX = { label: '?', week: 0, year: 0, cfg: null };
const FIRST_CLUB = new Map();   // career label -> tier of the first club actually joined
function ctxLine() {
    return `[${CTX.label}] year ${CTX.year} week ${CTX.week}`;
}

/** Run one call; record any throw as a crash and keep going. */
function step(label, fn, fallback) {
    try {
        return fn();
    } catch (e) {
        const file = attributeFile(e && e.stack, 'src/lib/career/engine.js');
        fail(
            'crash', file,
            `${label} threw: ${e && e.message}`,
            `${ctxLine()}\n${(e && e.stack ? e.stack : String(e)).split('\n').slice(0, 6).join('\n')}`,
            'Fix the throwing call site; see the stack frame above.',
            file + '|' + label + '|' + (e && e.message),
        );
        return fallback;
    }
}

// ---------------------------------------------------------------------------
//  INVARIANTS
// ---------------------------------------------------------------------------
const BLANK = ST.blankCareer();
const SHAPE = {
    player: Object.keys(BLANK.player),
    season: Object.keys(BLANK.season),
    totals: Object.keys(BLANK.totals),
    money: Object.keys(BLANK.money),
    soloq: Object.keys(BLANK.soloq),
    weekly: Object.keys(BLANK.weekly),
    time: Object.keys(BLANK.time),
};

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function badNum(where, v, file, fix) {
    if (isNum(v)) return false;
    fail('crash', file, `${where} is not a finite number`,
        `${ctxLine()} -> ${where} = ${JSON.stringify(v)}`, fix,
        file + '|nan|' + where);
    return true;
}

function checkRange(where, v, lo, hi, file, fix, severity) {
    if (!isNum(v)) return;
    if (v < lo - 1e-9 || v > hi + 1e-9) {
        fail(severity || 'wrong', file, `${where} left its legal range ${lo}..${hi}`,
            `${ctxLine()} -> ${where} = ${v}`, fix, file + '|range|' + where);
    }
}

let prevSnapshot = null;

function assertInvariants(c, tally) {
    if (!c) return;

    // ---- shape -----------------------------------------------------------
    for (const grp of Object.keys(SHAPE)) {
        const obj = c[grp];
        if (!obj || typeof obj !== 'object') {
            fail('crash', 'src/lib/stores/career.js', `career.${grp} is missing`,
                `${ctxLine()} -> career.${grp} = ${JSON.stringify(obj)}`,
                'A mutator replaced the block with a non-object.');
            continue;
        }
        for (const k of SHAPE[grp]) {
            if (!(k in obj)) {
                fail('crash', 'src/lib/stores/career.js', `career.${grp}.${k} was deleted from the state`,
                    `${ctxLine()} -> keys now: ${Object.keys(obj).join(',')}`,
                    'Some career.update() spread dropped this key; keep the block whole.');
            }
        }
    }

    const p = c.player || {};

    // ---- attributes ------------------------------------------------------
    for (const k of K.ATTR_KEYS) {
        const v = p.attrs ? p.attrs[k] : undefined;
        if (badNum(`player.attrs.${k}`, v, 'src/lib/stores/career.js',
            'applyAttrGain/setAttr let a non-number through.')) continue;
        checkRange(`player.attrs.${k}`, v, K.ATTR_MIN, K.ATTR_MAX, 'src/lib/stores/career.js',
            'Clamp through clampAttr on every write.', 'crash');

        const pot = p.potential ? p.potential[k] : undefined;
        if (badNum(`player.potential.${k}`, pot, 'src/lib/career/ratings.js',
            'rollNewPlayer or changeRole produced a non-number ceiling.')) continue;
        checkRange(`player.potential.${k}`, pot, K.ATTR_MIN, K.ATTR_MAX, 'src/lib/career/ratings.js',
            'Clamp potential through clampAttr.', 'crash');

        if (isNum(v) && isNum(pot) && v > pot + 0.51) {
            fail('wrong', 'src/lib/stores/career.js',
                `attribute ${k} rose above its potential ceiling`,
                `${ctxLine()} -> attrs.${k}=${v} potential.${k}=${pot}`,
                'applyAttrGain must never round past attrCeiling(); clamp to Math.floor(ceiling).',
                'ceiling|' + k);
        }
    }

    // ---- meters ----------------------------------------------------------
    for (const f of ['form', 'morale', 'energy', 'health']) {
        if (badNum(`player.${f}`, p[f], 'src/lib/stores/career.js',
            'adjustCondition let a non-number through.')) continue;
        checkRange(`player.${f}`, p[f], 0, 100, 'src/lib/stores/career.js',
            'adjustCondition clamps to 0..cap; something wrote the field directly.', 'crash');
    }

    // Condition is now a real lever (it reaches successChance directly), so it
    // needs to be MEASURABLE. Without this block "morale matters more" cannot be
    // verified at all, and the match-rating mean cannot be attributed.
    // THE LEAGUE TABLE IS REAL. Every club in a division plays the same fixture
    // list now, so no two rows may drift apart by more than the games a single
    // week can add. Before the division round robin existed, a 70%-win-rate
    // player reached playoff seeding on 18 games against AI sides on 23-26 and
    // missed the cut -- and nothing in this harness noticed, because nothing
    // ever compared the rows.
    {
        const phaseNow = (c.time && K.phaseForWeek(c.time.week).id) || '';
        if (phaseNow === 'spring' || phaseNow === 'summer') {
            const rows = (() => { try { return T.leagueTable(c) || []; } catch (e) { return []; } })();
            const played = rows.map(r => (Number(r.w) || 0) + (Number(r.l) || 0));
            if (played.length > 1) {
                const spread = Math.max(...played) - Math.min(...played);
                // One week can add at most MATCHES_PER_REG_WEEK to a club, and
                // the player's own game may not be committed yet, so two weeks
                // of slack is the honest bound.
                const bound = K.MATCHES_PER_REG_WEEK * 2;
                if (spread > bound) {
                    fail('wrong', 'src/lib/career/teams.js',
                        'the league table drifted out of step',
                        `${ctxLine()} -> games played per club range ${Math.min(...played)}..${Math.max(...played)} (spread ${spread}, bound ${bound})`,
                        'divisionRounds() is the one fixture list; simulateAIWeek must play only its pairs for '
                        + 'THIS week, and completeMatch must mirror the player result onto the opponent.',
                        'table-spread');
                }
            }
        }
    }

    // ---- the tournament CALENDAR -------------------------------------------
    // A bracket phase owns a multi-week window and its rounds are pinned one per
    // week. Two failures are silent: rounds sharing a week (a field bigger than
    // its window -- adding a sixth region did exactly this to Worlds), and a
    // round landing outside the window entirely.
    {
        const b = c.season && c.season.bracket;
        if (b && Array.isArray(b.rounds) && b.window) {
            const from = Math.round(Number(b.window.from) || 0);
            const to = Math.round(Number(b.window.to) || 0);
            const byWeek = {};
            for (const r of b.rounds) {
                const w = Math.round(Number(r && r.week) || 0);
                if (!w) continue;
                byWeek[w] = (byWeek[w] || 0) + 1;
                if (w < from || w > to) {
                    fail('wrong', 'src/lib/career/engine.js',
                        'a bracket round is scheduled outside its own phase window',
                        `${ctxLine()} -> ${b.kind} round "${r.name}" on week ${w}, window ${from}-${to}`,
                        'roundWeekFor() must clamp every round into the phase window.',
                        'brwindow|' + b.kind);
                }
            }
            for (const [w, n] of Object.entries(byWeek)) {
                if (n > 1) {
                    fail('wrong', 'src/lib/career/engine.js',
                        'two rounds of one bracket share a week',
                        `${ctxLine()} -> ${b.kind} has ${n} rounds on week ${w} (window ${from}-${to}, ${b.totalRounds} rounds)`,
                        'openBracket must trim the field to 2^(window weeks) so one round fits per week.',
                        'brcollide|' + b.kind);
                }
            }
            stats.bracketWeeks = stats.bracketWeeks || {};
            const seen = stats.bracketWeeks[b.kind] || new Set();
            for (const w of Object.keys(byWeek)) seen.add(Number(w));
            stats.bracketWeeks[b.kind] = seen;
        }
    }

    // ---- the regular-season FORMAT -----------------------------------------
    // Korea, China and the Pacific play a Bo3 league; Europe, NA and Brazil a
    // Bo1; tier 3 is always Bo1 because the amateur circuit is scrims. The
    // schedule is what the match engine reads, so a row whose bestOf disagrees
    // with its own division is a game played under the wrong rules -- and it
    // would be invisible, because a Bo1 and a Bo3 both just resolve to a W.
    {
        const club = c.player.clubId ? K.teamById(c.player.clubId) : null;
        if (club) {
            const want = K.regularBestOf(club.region, club.tier);
            for (const f of (c.season && c.season.schedule) || []) {
                if (!f || f.kind === 'bracket') continue;
                const got = Math.round(Number(f.bestOf) || 0);
                if (got !== want) {
                    fail('wrong', 'src/lib/career/teams.js',
                        'a league fixture carries the wrong match format',
                        `${ctxLine()} -> ${club.region} tier ${club.tier} wants Bo${want}, row "${f.id}" is Bo${got || 'unset'}`,
                        'generateSchedule must stamp regularBestOf(region, tier) onto every league row.',
                        'boformat|' + club.region + '|' + club.tier);
                }
                // A finished series has to have a legal scoreline for its own
                // format: a Bo3 is 2-0, 2-1 or the reverse and NEVER 3-2.
                if (f.played && Array.isArray(f.score) && want > 1) {
                    const need = Math.floor(want / 2) + 1;
                    const [a, b] = f.score.map(v => Math.round(Number(v) || 0));
                    const games = a + b;
                    if (Math.max(a, b) !== need || games < need || games > want) {
                        fail('wrong', 'src/lib/career/match.js',
                            'a finished series has an impossible scoreline for its format',
                            `${ctxLine()} -> Bo${want} row "${f.id}" ended ${a}-${b}`,
                            'winsNeeded(bestOf) decides when a series is over; it must agree with the row.',
                            'boscore|' + want);
                    }
                    stats.seriesGames = (stats.seriesGames || 0) + games;
                    stats.seriesPlayed = (stats.seriesPlayed || 0) + 1;
                }
            }
            stats.regFormat = stats.regFormat || {};
            stats.regFormat[want] = (stats.regFormat[want] || 0) + 1;
        }
    }

    if (c.player.clubId && !FIRST_CLUB.has(CTX.label)) {
        const t = K.teamById(c.player.clubId);
        FIRST_CLUB.set(CTX.label, t ? Number(t.tier) || 0 : Number(c.player.clubTier) || 0);
    }

    if (COND.on) {
        const mo = Number(p.morale), he = Number(p.health);
        if (Number.isFinite(mo) && Number.isFinite(he)) {
            COND.n++;
            COND.morale += mo;
            COND.health += he;
            if (mo < COND.minMorale) COND.minMorale = mo;
            if (he < COND.minHealth) COND.minHealth = he;
            if (mo < 30) COND.lowMoraleWeeks++;
            if (mo > 80) COND.everHigh = true;
            if (mo < 40) COND.everLow = true;
        }
    }
    badNum('player.hype', p.hype, 'src/lib/stores/career.js', 'grantFollowers guard.');
    badNum('player.age', p.age, 'src/lib/career/engine.js', 'rolloverYear increments age.');
    badNum('player.chemistry', p.chemistry, 'src/lib/career/match.js', 'applyMatchResult writes chemistry.');
    checkRange('player.chemistry', p.chemistry, 0, 100, 'src/lib/career/match.js', 'clamp chemistry 0..100.');

    // ---- money -----------------------------------------------------------
    for (const f of ['gold', 'followers', 'legacy']) {
        if (badNum(`money.${f}`, c.money ? c.money[f] : undefined, 'src/lib/stores/career.js',
            'grant/spend mutators guard.')) continue;
        if (c.money[f] < 0) {
            fail('crash', 'src/lib/stores/career.js', `money.${f} went negative`,
                `${ctxLine()} -> money.${f} = ${c.money[f]}`,
                'spendGold/spendLegacy must refuse rather than overdraw.',
                'neg|' + f);
        }
    }

    // ---- soloq / ovr / market value --------------------------------------
    badNum('soloq.mmr', c.soloq && c.soloq.mmr, 'src/lib/career/engine.js', 'doSoloQueue writes mmr.');
    checkRange('soloq.mmr', c.soloq && c.soloq.mmr, 0, K.MMR_MAX, 'src/lib/career/engine.js', 'clamp mmr 0..MMR_MAX.');

    const ovr = step('calcOVR', () => R.calcOVR(p.attrs, p.role), NaN);
    if (!badNum('OVR', ovr, 'src/lib/career/ratings.js', 'calcOVR guard.')) {
        checkRange('OVR', ovr, 1, 99, 'src/lib/career/ratings.js', 'clampAttr the weighted sum.');
        tally.ovr = ovr;
    }

    const mv = step('marketValueFor', () => R.marketValueFor({
        ovr, potentialOVR: R.calcPotentialOVR(p.potential, p.role),
        age: p.age, region: p.region, hype: p.hype,
    }), NaN);
    if (!badNum('marketValue', mv, 'src/lib/career/ratings.js', 'marketValueFor guard.')) {
        if (mv < 0) {
            fail('wrong', 'src/lib/career/ratings.js', 'market value went negative',
                `${ctxLine()} -> marketValue = ${mv}`, 'Clamp market value at zero.');
        }
    }

    // ---- weekly ----------------------------------------------------------
    const w = c.weekly || {};
    badNum('weekly.actionsLeft', w.actionsLeft, 'src/lib/stores/career.js', 'spendAction guard.');
    if (isNum(w.actionsLeft) && w.actionsLeft < 0) {
        fail('crash', 'src/lib/stores/career.js', 'weekly.actionsLeft went negative',
            `${ctxLine()} -> actionsLeft = ${w.actionsLeft}`,
            'spendAction must refuse when actionsLeft < n.');
    }

    // ---- clock -----------------------------------------------------------
    const t = c.time || {};
    checkRange('time.week', t.week, 1, K.WEEKS_PER_YEAR, 'src/lib/career/engine.js',
        'advanceWeek must roll the year rather than exceed WEEKS_PER_YEAR.', 'crash');
    if (prevSnapshot) {
        if (isNum(t.year) && isNum(prevSnapshot.year) && t.year < prevSnapshot.year) {
            fail('crash', 'src/lib/career/engine.js', 'time.year went backwards',
                `${ctxLine()} -> ${prevSnapshot.year} then ${t.year}`,
                'rolloverYear must only ever increment the year.');
        }
        if (isNum(t.year) && t.year === prevSnapshot.year + 1) {
            const dAge = (Number(p.age) || 0) - prevSnapshot.age;
            if (dAge !== 1) {
                fail('wrong', 'src/lib/career/engine.js', 'age did not advance by exactly one on a year rollover',
                    `${ctxLine()} -> age ${prevSnapshot.age} -> ${p.age} across ${prevSnapshot.year} -> ${t.year}`,
                    'rolloverYear increments age once per calendar year.');
            }
        }
        if (isNum(t.year) && t.year === prevSnapshot.year && Number(p.age) !== prevSnapshot.age) {
            fail('wrong', 'src/lib/career/engine.js', 'age changed without a year rollover',
                `${ctxLine()} -> age ${prevSnapshot.age} -> ${p.age} inside year ${t.year}`,
                'Only rolloverYear may touch player.age.');
        }
    }
    prevSnapshot = { year: Number(t.year) || 0, age: Number(p.age) || 0 };

    // ---- genetic traits ---------------------------------------------------
    //  Rolled once, on the birthday the start path names. Everything about this
    //  system is about WHEN: revealed early it is something players restart
    //  careers for, revealed twice it doubles a potential bonus, revealed with a
    //  dead id it prints "undefined" on the Profile screen.
    const traits = p.traits;
    if (!Array.isArray(traits)) {
        fail('crash', 'src/lib/stores/career.js', 'player.traits is not an array',
            `${ctxLine()} -> ${JSON.stringify(traits)}`,
            'blankCareer declares traits: [] and hydrate must coerce it back.');
    } else {
        if (traits.length > 1) {
            fail('wrong', 'src/lib/career/engine.js', 'a career carries more than one genetic trait',
                `${ctxLine()} -> ${JSON.stringify(traits)}`,
                'revealTrait must return early once player.traits is non-empty.');
        }
        for (const id of traits) {
            if (!K.TRAIT_BY_ID[id]) {
                fail('wrong', 'src/lib/career/constants.js', 'player.traits holds an unknown trait id',
                    `${ctxLine()} -> "${id}"`,
                    'Trait ids are persisted like player.champion; never rename or delete one.',
                    'traitid|' + id);
            }
        }
        const revealAt = R.revealAgeFor(p);
        if (traits.length && isNum(p.age) && p.age < revealAt) {
            fail('wrong', 'src/lib/career/engine.js', 'a genetic trait was revealed before its reveal age',
                `${ctxLine()} -> age ${p.age}, path ${p.path}, reveal age ${revealAt}`,
                'The whole point of the late reveal is that it cannot be rerolled for.');
        }
        if (!traits.length && isNum(p.age) && p.age >= revealAt + 1 && !(c.flags && c.flags.retired)) {
            fail('wrong', 'src/lib/career/engine.js', 'a career passed its reveal age with no trait',
                `${ctxLine()} -> age ${p.age}, path ${p.path}, reveal age ${revealAt}`,
                'rolloverYear calls revealTrait() after the age bump; check it is still wired.',
                'traitmissing');
        }
    }

    // ---- earned and bought ceiling ---------------------------------------
    //  Both are bounded for a whole career. Unbounded, either one takes every
    //  player to 99 in everything and the ceiling stops meaning anything -- the
    //  first cut of both did exactly that.
    const btOVR = Number(c.flags && c.flags.breakthroughOVR) || 0;
    // One split may overshoot the budget on its final grant, so the assertion is
    // the budget plus one split's worth rather than the budget exactly.
    if (btOVR > G.BREAKTHROUGH_CAREER_MAX + 3) {
        fail('wrong', 'src/lib/career/engine.js', 'breakthroughs raised the ceiling past their career budget',
            `${ctxLine()} -> flags.breakthroughOVR=${btOVR} budget=${G.BREAKTHROUGH_CAREER_MAX}`,
            'checkBreakthrough must return early once the budget is spent.',
            'btbudget');
    }
    const boughtOVR = Number(c.flags && c.flags.boughtCeilingOVR) || 0;
    if (boughtOVR > E.CEILING_PURCHASE_MAX + 1) {
        fail('wrong', 'src/lib/career/economy.js', 'purchased ceiling ran past CEILING_PURCHASE_MAX',
            `${ctxLine()} -> flags.boughtCeilingOVR=${boughtOVR} cap=${E.CEILING_PURCHASE_MAX}`,
            'useConsumable checks the budget before consuming the item.',
            'campbudget');
    }

    // ---- signature champion vs playstyle ---------------------------------
    //  The comfort bonus in the match engine is scored on the agreement between
    //  the champion archetype and the playstyle, so a mismatch is a career that
    //  is quietly worse at the game for a reason nobody could ever see.
    if (p.champion && p.playstyle && K.PLAYSTYLE_BY_ID[p.playstyle] && K.ROLE_BY_ID[p.role]) {
        if (!K.championFitsStyle(p.champion, p.role, p.playstyle)) {
            fail('wrong', 'src/lib/career/contracts.js',
                'signature champion is illegal for the playstyle',
                `${ctxLine()} -> ${p.role}/${p.playstyle} holding ${p.champion}`,
                'createCareer coerces and changeRole picks from championsForStyle; one of them regressed.',
                'champfit|' + p.role + '|' + p.playstyle);
        }
    }

    // ---- schedule --------------------------------------------------------
    const sch = (c.season && Array.isArray(c.season.schedule)) ? c.season.schedule : [];
    for (const f of sch) {
        if (!f) {
            fail('crash', 'src/lib/career/teams.js', 'schedule contains a null fixture',
                `${ctxLine()} -> schedule length ${sch.length}`, 'generateSchedule/pushSchedule must not push holes.');
            continue;
        }
        if (!f.opponentId) {
            fail('wrong', 'src/lib/career/teams.js', 'a fixture lost its opponent',
                `${ctxLine()} -> ${JSON.stringify(f).slice(0, 220)}`,
                'Every schedule row needs a resolvable opponentId.');
        }
        if (f.played) {
            const hasScore = Array.isArray(f.score) && f.score.length === 2
                && isNum(f.score[0]) && isNum(f.score[1]);
            if (typeof f.won !== 'boolean' || !hasScore) {
                fail('wrong', 'src/lib/career/engine.js', 'a played fixture has no usable result',
                    `${ctxLine()} -> ${JSON.stringify(f).slice(0, 220)}`,
                    'completeMatch must write won + score on every fixture it ticks off.');
            }
            if (f.myRating !== null && f.myRating !== undefined && !isNum(f.myRating)) {
                fail('wrong', 'src/lib/career/engine.js', 'a played fixture has a non-numeric rating',
                    `${ctxLine()} -> myRating = ${JSON.stringify(f.myRating)}`,
                    'Write null for a benched game, a number otherwise.');
            }
        }
    }

    // ---- totals ----------------------------------------------------------
    for (const k of ['games', 'wins', 'losses', 'kills', 'deaths', 'assists', 'mvps', 'ratingSum']) {
        badNum(`totals.${k}`, c.totals ? c.totals[k] : undefined, 'src/lib/career/match.js',
            'applyMatchResult accumulates totals.');
    }
}

// ---------------------------------------------------------------------------
//  SAVE ROUND TRIP
// ---------------------------------------------------------------------------
function roundTrip() {
    const before = cur();
    const snapshot = {
        ovr: R.calcOVR(before.player.attrs, before.player.role),
        age: before.player.age,
        gold: before.money.gold,
        attrs: { ...before.player.attrs },
        week: before.time.week,
        year: before.time.year,
    };
    step('flushCareer', () => ST.flushCareer());
    const after = step('initCareer', () => ST.initCareer(), null);
    if (!after) return;

    const now = {
        ovr: R.calcOVR(after.player.attrs, after.player.role),
        age: after.player.age,
        gold: after.money.gold,
        attrs: { ...after.player.attrs },
        week: after.time.week,
        year: after.time.year,
    };

    const diffs = [];
    if (now.ovr !== snapshot.ovr) diffs.push(`OVR ${snapshot.ovr} -> ${now.ovr}`);
    if (now.age !== snapshot.age) diffs.push(`age ${snapshot.age} -> ${now.age}`);
    if (now.gold !== snapshot.gold) diffs.push(`gold ${snapshot.gold} -> ${now.gold}`);
    if (now.week !== snapshot.week) diffs.push(`week ${snapshot.week} -> ${now.week}`);
    if (now.year !== snapshot.year) diffs.push(`year ${snapshot.year} -> ${now.year}`);
    for (const k of K.ATTR_KEYS) {
        if (now.attrs[k] !== snapshot.attrs[k]) diffs.push(`${k} ${snapshot.attrs[k]} -> ${now.attrs[k]}`);
    }
    if (diffs.length) {
        fail('wrong', 'src/lib/stores/career.js',
            'the career save does not round-trip through saveCareer/initCareer',
            `${ctxLine()} -> ${diffs.slice(0, 8).join(', ')}`,
            'hydrate() rewrites values it loads; keep the loaded numbers as they were stored.',
            'roundtrip');
    }
}

// ---------------------------------------------------------------------------
//  WEEK DRIVERS
// ---------------------------------------------------------------------------
// Condition accumulator, sampled once per player-week by the invariant walker.
// `on` guards the setup careers the harness builds before the real run.
// Fearless coverage. A run where usedChampions never exceeds length 1 means the
// set is threaded but nothing ever reads it -- wired and dead.
const COND = {
    on: true, n: 0, morale: 0, health: 0,
    minMorale: 101, minHealth: 101, lowMoraleWeeks: 0,
    everHigh: false, everLow: false,
};

const stats = {
    ratings: [],
    fearlessSeen: 0,
    fearlessMax: 0,
    offersSeen: 0,
    offersAccepted: 0,
    matchesPlayedManually: 0,
    matchesSimmed: 0,
    benchedGames: 0,
    // Champion select, rolled once per game by match.js rollDraft(). Counted
    // here because a draft that silently stops rolling reads as `signature`
    // everywhere and hands out double the comfort bonus with nothing to show
    // for it - no crash, no visible symptom, just a quietly easier game.
    draft: { signature: 0, pocket: 0, offscript: 0, missing: 0 },
    draftPicks: 0,
    awardsGranted: 0,
    milestonesGranted: 0,
    legacyEnd: 0,
    eventsApplied: 0,
    interviewsApplied: 0,
    roleChanges: 0,
    shopBuys: 0,
    unsignedGames: 0,
    unsignedBench: 0,
    signedGames: 0,
    signedBench: 0,
    drills: 0,
    drillsZeroGain: 0,
    drillGainSum: 0,
    awardIds: new Map(),
    perfectRatings: 0,
};

/** Record whether the player actually got a seat, split by club status. */
function noteAppearance(hadClub, played) {
    if (hadClub) {
        stats.signedGames++;
        if (!played) stats.signedBench++;
    } else {
        stats.unsignedGames++;
        if (!played) stats.unsignedBench++;
    }
}

function spendActions() {
    let guard = 0;
    while (guard++ < 24) {
        const c = cur();
        if (!c.weekly || (Number(c.weekly.actionsLeft) || 0) < 1) break;
        if (c.flags && c.flags.retired) break;

        let res = null;
        if (rand() < 0.5) {
            const drills = TR.DRILLS.filter(d => step('canTrain', () => TR.canTrain(c, d).ok, false));
            if (drills.length) {
                const d = rpick(drills);
                const roll = rand();
                const score = roll < 0.08 ? 0 : roll > 0.92 ? 1 : rand();
                res = step('training.completeDrill', () => TR.completeDrill(d, score), null);
                if (res && res.ok) {
                    stats.drills++;
                    if (isNum(res.gain)) {
                        stats.drillGainSum += res.gain;
                        if (res.gain <= 0) stats.drillsZeroGain++;
                    }
                    if (!isNum(res.gain)) {
                        fail('wrong', 'src/lib/career/training.js', 'completeDrill returned a non-numeric gain',
                            `${ctxLine()} -> drill ${d.id} score ${score} gain ${JSON.stringify(res.gain)}`,
                            'runDrill/applyAttrGain must always resolve to a number.');
                    }
                    continue;
                }
            }
        }

        const c2 = cur();
        // EVERY non-training activity id belongs here. This loop is the only
        // thing in the whole harness that executes an activity's body, so an id
        // missing from this list ships completely untested — a null club, a NaN
        // hype or an absent flag inside it would go green.
        const pool = [
            'soloq', 'vod', 'stream', 'media', 'gym', 'rest',
            'friends', 'therapy', 'recover', 'fans', 'sponsorday',
        ];
        if (c2.player.clubId) pool.push('scrim', 'scrim', 'coach1on1');
        const act = rpick(pool);
        res = step('engine.doActivity(' + act + ')', () => G.doActivity(act), null);
        if (res && res.ok) {
            drainOverlay();
            continue;
        }

        const fallback = step('engine.doActivity(rest)', () => G.doActivity('rest'), null);
        if (!fallback || !fallback.ok) break;
    }
}

function drainOverlay() {
    const ov = readStore(ST.careerOverlay);
    if (!ov) return;
    if (ov.kind === 'interview' && ov.payload) {
        const iv = ov.payload;
        const n = Array.isArray(iv.options) ? iv.options.length : 0;
        if (n > 0) {
            step('events.applyInterviewAnswer', () => EV.applyInterviewAnswer(iv, ri(0, n - 1)));
            stats.interviewsApplied++;
        }
    }
    ST.careerOverlay.set(null);
}

function playFixtureManually(f) {
    const hadClub = !!cur().player.clubId;
    const m0 = step('engine.startFixture', () => G.startFixture(f.id), null);
    if (!m0) {
        const simmed = step('engine.simFixture(fallback)', () => G.simFixture(f.id), null);
        if (simmed) stats.matchesSimmed++;
        return;
    }

    // A benched player never drafts, so those games are simply not counted.
    function noteDraft(mm) {
        if (!mm || mm.playerPlays === false) return;
        const o = mm.draft && mm.draft.outcome;
        if (o === 'signature' || o === 'pocket' || o === 'offscript') stats.draft[o]++;
        else stats.draft.missing++;
    }

    let m = m0;
    ST.matchState.set(m);
    if (m.playerPlays === false) stats.benchedGames++;
    noteAppearance(hadClub, m.playerPlays !== false);
    noteDraft(m);

    let guard = 0;
    while (guard++ < 30) {
        let over = step('match.isMatchOver', () => M.isMatchOver(m), true);
        if (over) break;

        if (m.playerPlays !== false) {
            // Champion select, once per game, before any decision resolves. The
            // harness picks at random from the three on offer - it is testing
            // that the draft is answerable and that everything downstream reads
            // the pick, not that the pick is a good one.
            if (step('match.draftPending', () => M.draftPending(m), false)) {
                const opts = (m.draft && Array.isArray(m.draft.options)) ? m.draft.options : [];
                if (opts.length !== M.DRAFT_OPTIONS) {
                    fail('wrong', 'src/lib/career/match.js', 'champion select did not offer the right number of picks',
                        `${ctxLine()} -> ${opts.length} options, expected ${M.DRAFT_OPTIONS}`,
                        'rollDraft tops the list up from the role pool; it must never come up short.');
                }
                // FEARLESS. The invariant IS the feature: nothing already
                // locked in this series may be offered again. Without this the
                // whole thing can regress to stateless rolls with no symptom.
                const already = Array.isArray(m.usedChampions) ? m.usedChampions : [];
                for (const id of opts) {
                    if (already.includes(id)) {
                        fail('wrong', 'src/lib/career/match.js',
                            'champion select offered a champion already played this series',
                            `${ctxLine()} -> "${id}" with used=[${already.join(',')}] at game ${m.game}`,
                            'rollDraft must filter bank, source AND both fallbacks through the used set.',
                            'fearless|' + id);
                    }
                }
                if (already.length) stats.fearlessSeen++;
                stats.fearlessMax = Math.max(stats.fearlessMax || 0, already.length);

                for (const id of opts) {
                    const view = step('match.draftOption', () => M.draftOption(cur(), m, id), null);
                    if (!view || !view.champion) {
                        fail('wrong', 'src/lib/career/match.js', 'a champion select option does not resolve',
                            `${ctxLine()} -> "${id}"`, 'rollDraft must only ever offer real champion ids.',
                            'draftopt|' + id);
                    } else if (!isNum(view.matchupSwing) || !isNum(view.proficiencySwing)) {
                        fail('wrong', 'src/lib/career/match.js', 'champion select produced a non-numeric swing',
                            `${ctxLine()} -> ${id} ${JSON.stringify({ m: view.matchupSwing, p: view.proficiencySwing })}`,
                            'championMatchup/proficiency01 must always resolve to a number.');
                    }
                }
                if (opts.length) {
                    m = step('match.chooseDraft', () => M.chooseDraft(m, rpick(opts)), m);
                    ST.matchState.set(m);
                    stats.draftPicks++;
                    if (!m.draft || !m.draft.picked) {
                        fail('crash', 'src/lib/career/match.js', 'chooseDraft did not record the pick',
                            `${ctxLine()}`, 'Every decision after this reads match.draft.picked.');
                    }
                }
            }

            let ev = step('match.nextEvent', () => M.nextEvent(m), null);
            let inner = 0;
            while (ev && inner++ < M.EVENTS_PER_GAME + 3) {
                const opts = Array.isArray(ev.options) ? ev.options : [];
                if (!opts.length) {
                    fail('wrong', 'src/lib/career/matchEvents.js', 'a decision event has no options',
                        `${ctxLine()} -> event ${ev.id}`, 'Every pool entry needs a non-empty options array.');
                    break;
                }
                const opt = rpick(opts);
                const out = step('match.resolveDecision', () => M.resolveDecision(cur(), m, opt.id), null);
                if (!out || !out.match) break;
                if (out.outcome) {
                    for (const kk of ['advantageDelta', 'personalDelta', 'csDelta']) {
                        if (!isNum(out.outcome[kk])) {
                            fail('wrong', 'src/lib/career/match.js', `resolveDecision produced a non-numeric ${kk}`,
                                `${ctxLine()} -> event ${ev.id} option ${opt.id} -> ${JSON.stringify(out.outcome[kk])}`,
                                'Guard option.reward/risk with num().');
                        }
                    }
                }
                m = out.match;
                ST.matchState.set(m);
                ev = step('match.nextEvent', () => M.nextEvent(m), null);
            }
        }

        const fg = step('match.finishGame', () => M.finishGame(cur(), m), null);
        if (!fg || !fg.match) break;
        if (!fg.match.done) noteDraft(fg.match);
        if (fg.game) {
            if (!isNum(fg.game.rating)) {
                fail('crash', 'src/lib/career/match.js', 'finishGame produced a non-numeric game rating',
                    `${ctxLine()} -> ${JSON.stringify(fg.game).slice(0, 200)}`, 'gameRating must always return a number.');
            } else {
                checkRange('game.rating', fg.game.rating, 0, 10, 'src/lib/career/match.js',
                    'Clamp the per-game rating to 0..10.');
                if (m.playerPlays !== false) stats.ratings.push(fg.game.rating);
            }
        }
        m = fg.match;
        ST.matchState.set(m);
    }

    const result = step('match.finishMatch', () => M.finishMatch(cur(), m), null);
    if (!result) {
        ST.matchState.set(null);
        return;
    }
    if (!isNum(result.rating)) {
        fail('crash', 'src/lib/career/match.js', 'finishMatch produced a non-numeric match rating',
            `${ctxLine()} -> ${JSON.stringify(result.rating)}`, 'Guard the rating average.');
    }
    const done = step('engine.completeMatch', () => G.completeMatch(result), null);
    stats.matchesPlayedManually++;
    if (done && done.interview) {
        const iv = done.interview;
        const n = Array.isArray(iv.options) ? iv.options.length : 0;
        if (n > 0) {
            step('events.applyInterviewAnswer', () => EV.applyInterviewAnswer(iv, ri(0, n - 1)));
            stats.interviewsApplied++;
        }
    }
    if (done && Array.isArray(done.milestones) && done.milestones.length) {
        stats.milestonesGranted += done.milestones.length;
    }
    // The match screen always clears it; make sure the engine did.
    if (readStore(ST.matchState)) {
        fail('wrong', 'src/lib/career/engine.js', 'matchState was left populated after completeMatch',
            `${ctxLine()} -> the week can never be advanced again`, 'completeMatch must clear matchState.');
        ST.matchState.set(null);
    }
}

function playWeekFixtures() {
    let guard = 0;
    while (guard++ < 12) {
        const c = cur();
        if (c.flags && c.flags.retired) return;
        const pending = (Array.isArray(c.season.schedule) ? c.season.schedule : [])
            .filter(f => f && Number(f.week) === Number(c.time.week) && !f.played);
        if (!pending.length) return;
        for (const f of pending) {
            if (rand() < 0.55) playFixtureManually(f);
            else {
                const hadClub = !!cur().player.clubId;
                const out = step('engine.simFixture', () => G.simFixture(f.id), null);
                if (out) {
                    stats.matchesSimmed++;
                    if (out.played !== false && isNum(out.rating)) stats.ratings.push(out.rating);
                    if (out.played === false) stats.benchedGames++;
                    noteAppearance(hadClub, out.played !== false);
                }
            }
        }
    }
    fail('wrong', 'src/lib/career/engine.js', 'a week never runs out of unplayed fixtures',
        `${ctxLine()} -> 12 passes and pending fixtures remain`,
        'simFixture/completeMatch is not ticking a fixture off.');
}

function exerciseContracts(allowAccept) {
    const c = cur();
    const offers = Array.isArray(c.offers) ? c.offers : [];
    if (!offers.length) return;
    stats.offersSeen += offers.length;

    for (const o of offers.slice()) {
        for (const kk of ['salary', 'years', 'signingBonus', 'releaseClause', 'interest']) {
            if (!isNum(o[kk])) {
                fail('wrong', 'src/lib/career/contracts.js', `an offer carries a non-numeric ${kk}`,
                    `${ctxLine()} -> ${JSON.stringify(o).slice(0, 240)}`, 'buildOffer must produce numbers.');
            }
        }
    }

    const roll = rand();
    const o = rpick(offers);
    if (roll < 0.25) {
        step('contracts.negotiateOffer', () => C.negotiateOffer(o.id, {
            salary: Math.round((Number(o.salary) || 100) * (1 + rand() * 0.4)),
            years: ri(1, 4),
        }));
    } else if (roll < 0.4 && !allowAccept) {
        step('contracts.rejectOffer', () => C.rejectOffer(o.id));
    } else if (allowAccept || rand() < 0.6) {
        const r = step('contracts.acceptOffer', () => C.acceptOffer(o.id), null);
        if (r && r.ok) stats.offersAccepted++;
    } else {
        step('contracts.rejectOffer', () => C.rejectOffer(o.id));
    }
}

function exerciseEconomy() {
    const c = cur();
    step('economy.shopSections', () => {
        const secs = E.shopSections(c);
        if (!Array.isArray(secs) || !secs.length) {
            fail('wrong', 'src/lib/career/economy.js', 'shopSections returned nothing',
                `${ctxLine()} -> ${JSON.stringify(secs)}`, 'The shop must always render its six sections.');
        }
        return secs;
    });

    const gear = rpick(E.GEAR);
    const owned = Math.round(Number(c.inventory.gear[gear.id]) || 0);
    const r1 = step('economy.buyGear', () => E.buyGear(gear.id, owned + 1), null);
    if (r1 && r1.ok) stats.shopBuys++;

    const con = rpick(E.CONSUMABLES);
    const r2 = step('economy.buyConsumable', () => E.buyConsumable(con.id, 1), null);
    if (r2 && r2.ok) {
        stats.shopBuys++;
        step('economy.useConsumable', () => E.useConsumable(con.id));
    }

    const life = rpick(E.LIFESTYLE);
    const r3 = step('economy.buyLifestyle', () => E.buyLifestyle(life.id), null);
    if (r3 && r3.ok) stats.shopBuys++;

    const perk = rpick(E.LEGACY_PERKS);
    const r4 = step('economy.buyPerk', () => E.buyPerk(perk.id), null);
    if (r4 && r4.ok) stats.shopBuys++;

    // The legacy exchange. Rolled rarely on purpose: a career that dumped every
    // spare point into trades would never buy a perk, and the perk board is the
    // thing whose pricing this run is meant to measure. Both paths still fire
    // hundreds of times across eight careers, which is what matters -- an
    // untested purchase path is how a shop function ships broken.
    if (Math.random() < 0.25) {
        const trade = rpick(E.LEGACY_TRADES);
        const r5 = step('economy.buyTrade', () => E.buyTrade(trade.id), null);
        if (r5 && r5.ok) stats.shopBuys++;
        step('economy.tradeCost', () => E.tradeCost(cur(), trade.id), 0);
    }
    if (Math.random() < 0.12) {
        const mon = rpick(E.MONUMENTS);
        const r6 = step('economy.buyMonument', () => E.buyMonument(mon.id), null);
        if (r6 && r6.ok) stats.shopBuys++;
    }

    const avail = step('economy.availableSponsors', () => E.availableSponsors(cur()), []);
    if (Array.isArray(avail) && avail.length) {
        step('economy.signSponsor', () => E.signSponsor(rpick(avail).id));
    }

    const inc = step('economy.weeklyIncome', () => E.weeklyIncome(cur()), null);
    if (inc && !isNum(inc.total)) {
        fail('wrong', 'src/lib/career/economy.js', 'weeklyIncome.total is not a number',
            `${ctxLine()} -> ${JSON.stringify(inc)}`, 'Guard the salary/sponsor sum.');
    }
}

function exerciseAwards() {
    const c = cur();
    const ms = step('awards.checkMilestones', () => A.checkMilestones(c), []);
    if (Array.isArray(ms) && ms.length) {
        step('awards.grantMilestones', () => A.grantMilestones(ms));
        stats.milestonesGranted += ms.length;
    }
    const ls = step('awards.legacyScore', () => A.legacyScore(cur()), NaN);
    badNum('legacyScore', ls, 'src/lib/career/awards.js', 'legacyScore must always resolve to a number.');
    const cs = step('awards.careerSummary', () => A.careerSummary(cur()), null);
    if (cs && !isNum(cs.legacyScore ?? cs.score ?? 0)) {
        fail('wrong', 'src/lib/career/awards.js', 'careerSummary carries a non-numeric legacy score',
            `${ctxLine()} -> ${JSON.stringify(cs).slice(0, 240)}`, 'Guard the score field.');
    }
    step('teams.leagueTable', () => {
        const rows = T.leagueTable(cur());
        if (!Array.isArray(rows)) {
            fail('wrong', 'src/lib/career/teams.js', 'leagueTable did not return an array',
                `${ctxLine()} -> ${JSON.stringify(rows)}`, 'Always return rows, even unsigned.');
        }
        return rows;
    });
}

function maybeChangeRole() {
    const c = cur();
    const gate = step('contracts.canChangeRole', () => C.canChangeRole(c), { ok: false });
    if (!gate || !gate.ok) return;
    const other = K.ROLE_IDS.filter(r => r !== c.player.role);
    const to = rpick(other);
    const r = step('contracts.changeRole', () => C.changeRole(to, null, null), null);
    if (r && r.ok) stats.roleChanges++;
}

// ---------------------------------------------------------------------------
//  ONE CAREER
// ---------------------------------------------------------------------------
function runCareer(cfg, label) {
    storage.clear();
    step('resetCareer', () => ST.resetCareer());
    prevSnapshot = null;

    CTX = { label, week: 1, year: K.DEFAULT_START_YEAR, cfg };

    const created = step('createCareer', () => ST.createCareer(cfg), null);
    if (!created) {
        fail('crash', 'src/lib/stores/career.js', 'createCareer returned nothing',
            `cfg = ${JSON.stringify(cfg)}`, 'Creation must always produce a career.');
        return null;
    }
    step('engine.ensureSeason', () => G.ensureSeason());
    step('engine.startCareerWeek', () => G.startCareerWeek());

    const ovrByYear = new Map();
    // Highest each attribute ever reached. The ceiling check below has to use
    // this, not the value at retirement: applyAgeDecay() strips MEC/LNE/TMF
    // down every year past the prime band, so a retirement-time reading
    // measures the age curve, not what training was able to reach.
    const peakAttrs = {};
    for (const k of K.ATTR_KEYS) peakAttrs[k] = 0;
    const startYear = cur().time.year;
    const endYear = startYear + N_YEARS;
    let retired = false;
    let roleSwitched = false;
    let weeks = 0;
    const tally = { ovr: 0 };

    while (weeks < N_YEARS * K.WEEKS_PER_YEAR + 4) {
        const c0 = cur();
        CTX.week = c0.time.week;
        CTX.year = c0.time.year;
        if (c0.flags && c0.flags.retired) { retired = true; break; }
        if (c0.time.year > endYear) break;

        step('engine.weekSummary', () => {
            const s = G.weekSummary(cur());
            if (!s || !isNum(s.week) || !isNum(s.actionsLeft)) {
                fail('wrong', 'src/lib/career/engine.js', 'weekSummary returned an unusable object',
                    `${ctxLine()} -> ${JSON.stringify(s).slice(0, 240)}`, 'weekSummary must always return numbers.');
            }
            return s;
        });

        spendActions();
        playWeekFixtures();

        if (weeks % 3 === 0) {
            const unsigned = !cur().player.clubId;
            step('contracts.generateOffers', () => {
                const fresh = C.generateOffers(cur());
                if (Array.isArray(fresh) && fresh.length) {
                    ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh] }));
                }
                return fresh;
            });
            exerciseContracts(unsigned);
        }
        if (weeks % 7 === 3) exerciseEconomy();
        if (weeks % 11 === 5) exerciseAwards();
        // A role switch throws attributes away on purpose, so only one career
        // in the matrix does it and that career sits out the progression check.
        if (cfg.tryRoleChange && !roleSwitched && weeks > 20 && !cur().player.clubId) {
            const n0 = stats.roleChanges;
            maybeChangeRole();
            if (stats.roleChanges > n0) roleSwitched = true;
        }

        if (weeks % 23 === 7) {
            const ev = step('events.rollWeeklyEvent', () => EV.rollWeeklyEvent(cur()), null);
            if (ev && Array.isArray(ev.options) && ev.options.length) {
                step('events.applyEventOption', () => EV.applyEventOption(ev, rpick(ev.options).id));
                stats.eventsApplied++;
            }
            const iv = step('events.rollInterview', () => EV.rollInterview(cur(), cur().lastMatch), null);
            if (iv && Array.isArray(iv.options) && iv.options.length) {
                step('events.applyInterviewAnswer', () => EV.applyInterviewAnswer(iv, ri(0, iv.options.length - 1)));
                stats.interviewsApplied++;
            }
        }

        const adv = step('engine.advanceWeek', () => G.advanceWeek(), null);
        if (adv && Array.isArray(adv.events) && adv.events.length) {
            for (const ev of adv.events) {
                if (ev && Array.isArray(ev.options) && ev.options.length) {
                    step('events.applyEventOption', () => EV.applyEventOption(ev, rpick(ev.options).id));
                    stats.eventsApplied++;
                }
            }
        }
        drainOverlay();

        const c1 = cur();
        CTX.week = c1.time.week;
        CTX.year = c1.time.year;
        assertInvariants(c1, tally);
        if (tally.ovr) ovrByYear.set(c1.time.year, tally.ovr);
        for (const k of K.ATTR_KEYS) {
            const v = Number(c1.player.attrs[k]) || 0;
            if (v > peakAttrs[k]) peakAttrs[k] = v;
        }

        if (weeks % 40 === 13) roundTrip();

        if (adv === null && !(c1.flags && c1.flags.retired)) {
            fail('crash', 'src/lib/career/engine.js', 'advanceWeek returned null on a live career',
                `${ctxLine()} -> the calendar is stuck`, 'A live match or an unplayed fixture blocked the week.');
            break;
        }

        weeks++;
        if (c1.flags && c1.flags.retired) { retired = true; break; }
    }

    // ---- retirement ------------------------------------------------------
    const summary = step('awards.retire', () => A.retire({ force: true }), null);
    const end = cur();
    stats.awardsGranted += Array.isArray(end.awards) ? end.awards.length : 0;
    for (const a of (Array.isArray(end.awards) ? end.awards : [])) {
        if (a && a.id) stats.awardIds.set(a.id, (stats.awardIds.get(a.id) || 0) + 1);
    }

    // How much of the hidden ceiling a full career of training actually reached.
    const headroom = K.ATTR_KEYS.map(k => ({
        k,
        v: Number(end.player.attrs[k]) || 0,
        peak: Number(peakAttrs[k]) || 0,
        cap: Number(end.player.potential[k]) || 0,
    }));
    stats.legacyEnd = Math.max(stats.legacyEnd, Number(end.money.legacy) || 0);

    if (!summary) {
        fail('crash', 'src/lib/career/awards.js', 'retire() returned nothing',
            `${ctxLine()}`, 'retire must always hand back a career summary.');
    } else {
        for (const kk of ['years', 'legacyScore']) {
            if (kk in summary && !isNum(summary[kk])) {
                fail('wrong', 'src/lib/career/awards.js', `careerSummary.${kk} is not a number`,
                    `${ctxLine()} -> ${JSON.stringify(summary[kk])}`, 'Guard the summary numbers.');
            }
        }
    }

    // ---- per-career plausibility ----------------------------------------
    const history = Array.isArray(end.history) ? end.history : [];
    let splitW = 0, splitL = 0;
    let extremeSplits = 0, countedSplits = 0;
    for (const h of history) {
        const w = Number(h.w) || 0;
        const l = Number(h.l) || 0;
        splitW += w; splitL += l;
        if (w + l >= 10) {
            countedSplits++;
            if (w === 0 || l === 0) extremeSplits++;
        }
    }

    // ---- board entry -----------------------------------------------------
    //  The two documents this career would publish to the global career board,
    //  built the same way stores/careerBoard.js builds them, so the sizes and
    //  the margins reported later are the ones a real player would send.
    //  buildBoardDocs is pure -- it reads `end`, writes nothing and cannot reach
    //  a store -- and the try/catch is only so a throw inside it cannot cost us
    //  the whole career's results.
    const boardDocs = (() => {
        try { return BD.buildBoardDocs(end, { uid: 'smoke', displayName: 'Smoke', slot: 1 }); }
        catch (e) { return null; }
    })();
    // The UNCLAMPED truth behind the fields buildBoardDocs clamps on the way
    // out. Bounds-checking the built row alone can never fail -- every field
    // went through bounded() -- so the only way to see a rail actually bite a
    // real career is to compare what it PUBLISHED against what it WAS.
    const boardRaw = (() => {
        try {
            const aw = Array.isArray(end.awards) ? end.awards : [];
            return {
                age: Math.round(Number(end.player.age) || 0),
                years: A.careerYears(end),
                games: Math.round(Number(end.totals.games) || 0),
                wins: Math.round(Number(end.totals.wins) || 0),
                losses: Math.round(Number(end.totals.losses) || 0),
                earnedScore: A.earnedLegacyScore(end),
                boughtScore: E.monumentScore(end),
                peakOVR: A.peakOVR(end),
                peakMMR: Math.round(Number(end.soloq.peakMMR) || 0),
                worlds: aw.filter(a => a && a.id === 'worlds_champ').length,
                titles: aw.filter(a => a && (a.id === 'worlds_champ' || a.id === 'msi_champ' || a.id === 'regional_champ')).length,
                trophies: Array.isArray(end.trophies) ? end.trophies.filter(Boolean).length : 0,
            };
        } catch (e) { return null; }
    })();

    return {
        label, cfg, retired, weeks,
        ovrByYear,
        // Career saves are backed up to Firestore, which hard-caps a document at
        // 1 MiB and simply refuses the write at the limit. Three career slots
        // plus the whole roster save share that budget, so the size of one
        // finished career is a number worth watching rather than discovering.
        saveBytes: (() => { try { return JSON.stringify(end).length; } catch (e) { return 0; } })(),
        saveBytesTrimmed: (() => {
            // Mirrors exportCareerSlots(): everything except the transient
            // half-played match.
            try { return JSON.stringify({ ...end, pendingMatch: null }).length; }
            catch (e) { return 0; }
        })(),
        // The board documents and what they weigh on the wire. Measured with
        // .length, which is what stores/careerBoard.js preflights against
        // BOARD_ROW_BYTES_MAX / BOARD_BLOB_BYTES_MAX before it writes.
        boardDocs,
        boardRaw,
        boardRowBytes: (() => {
            try { return boardDocs ? JSON.stringify(boardDocs.row).length : 0; }
            catch (e) { return 0; }
        })(),
        boardBlobBytes: (boardDocs && typeof boardDocs.blob === 'string') ? boardDocs.blob.length : 0,
        traits: Array.isArray(end.player.traits) ? end.player.traits.slice() : [],
        proficiency: (end.player.proficiency && typeof end.player.proficiency === 'object')
            ? { ...end.player.proficiency } : {},
        // The tier of the FIRST club this career ever joined. Item 12 says it must
        // be an amateur one for anybody who was not signed at creation.
        firstClubTier: FIRST_CLUB.get(label) || 0,
        everSigned: !!(end.flags && end.flags.everSigned),
        terminations: Number(end.flags && end.flags.terminations) || 0,
        endStrikes: Number(end.player && end.player.contract && end.player.contract.strikes) || 0,
        breakthroughOVR: Number(end.flags && end.flags.breakthroughOVR) || 0,
        boughtCeilingOVR: Number(end.flags && end.flags.boughtCeilingOVR) || 0,
        // Roster churn and club momentum. club.changes belongs to a CLUB and is
        // wiped by a transfer, so the lifetime total has to come off the flag.
        rosterChanges: Number(end.flags && end.flags.rosterMoves) || 0,
        rosterSeats: (end.club && end.club.roster && typeof end.club.roster === 'object')
            ? Object.keys(end.club.roster).length : 0,
        changes: (end.club && Array.isArray(end.club.changes)) ? end.club.changes.slice() : [],
        momentum: Number(end.club && end.club.momentum) || 0,
        monuments: (end.inventory && Array.isArray(end.inventory.monuments))
            ? end.inventory.monuments.length : 0,
        trades: (end.inventory && end.inventory.trades && typeof end.inventory.trades === 'object')
            ? Object.values(end.inventory.trades).reduce((s, v) => s + (Number(v) || 0), 0) : 0,
        perksOwned: (end.inventory && Array.isArray(end.inventory.perks)) ? end.inventory.perks.length : 0,
        endOVR: R.calcOVR(end.player.attrs, end.player.role),
        potOVR: R.calcPotentialOVR(end.player.potential, end.player.role),
        age: end.player.age,
        gold: end.money.gold,
        legacy: end.money.legacy,
        awards: Array.isArray(end.awards) ? end.awards.length : 0,
        milestones: Array.isArray(end.flags.milestones) ? end.flags.milestones.length : 0,
        games: Number(end.totals.games) || 0,
        wins: Number(end.totals.wins) || 0,
        losses: Number(end.totals.losses) || 0,
        splitW, splitL, extremeSplits, countedSplits,
        headroom,
        peakOVR: Math.max(...Array.from(ovrByYear.values()), 0),
        everSigned: !!end.flags.everSigned || !!end.player.clubId || history.some(h => h.teamId),
        summary,
    };
}

// ---------------------------------------------------------------------------
//  THE MATRIX
// ---------------------------------------------------------------------------
function buildConfigs(n) {
    const roles = K.ROLE_IDS;
    const regions = K.REGION_IDS;
    const paths = K.START_PATHS.map(p => p.id);
    const out = [];
    for (let i = 0; i < n; i++) {
        const pathId = paths[i % paths.length];
        const roleId = roles[i % roles.length];
        const regionId = regions[i % regions.length];
        const p = K.PATH_BY_ID[pathId];
        const styles = K.PLAYSTYLES[roleId] || [];
        const styleId = styles.length ? styles[i % styles.length].id : '';
        // The champion has to be legal for the PLAYSTYLE, not just the role.
        // Picking the two from independent modular indices used to mint
        // combinations createCareer now has to coerce, which would have quietly
        // stopped the harness testing the config it thought it was testing.
        const champs = styleId ? K.championsForStyle(roleId, styleId) : K.championsForRole(roleId);
        out.push({
            handle: `Smoke${i + 1}`,
            pathId,
            age: p.ages[i % p.ages.length],
            regionId,
            roleId,
            playstyleId: styleId,
            championId: champs.length ? champs[i % champs.length].id : '',
            tryRoleChange: i === 2,
        });
    }
    return out;
}

// ---------------------------------------------------------------------------
//  RUN
// ---------------------------------------------------------------------------
console.log('');
console.log('=========================================================');
console.log('  LoL ULTIMATE CAREER -- headless smoke run');
console.log('  seed    : ' + SEED + '   (reproduce with --seed ' + SEED + ')');
console.log('  careers : ' + N_CAREERS + '   years each: ' + N_YEARS);
console.log('  cards   : ' + DB.length + ' loaded from public/database.js');
console.log('=========================================================');
console.log('');

const results = [];
for (const cfg of buildConfigs(N_CAREERS)) {
    const label = `${cfg.handle}/${cfg.pathId}/${cfg.roleId}/${cfg.regionId}`;
    const t0 = Date.now();
    const r = runCareer(cfg, label);
    if (r) {
        results.push(r);
        console.log(
            `  ${label.padEnd(30)} ` +
            `OVR ${String(r.endOVR).padStart(2)}/${String(r.potOVR).padStart(2)} ` +
            `age ${r.age} games ${String(r.games).padStart(4)} ` +
            `${r.wins}-${r.losses} ` +
            `awards ${String(r.awards).padStart(2)} ms ${String(r.milestones).padStart(2)} ` +
            `legacy ${String(r.legacy).padStart(5)} ` +
            `signed ${r.everSigned ? 'Y' : 'N'} ` +
            `(${((Date.now() - t0) / 1000).toFixed(1)}s)`,
        );
    }
}

// ---- OVR by year table -----------------------------------------------------
console.log('');
console.log('---- OVR BY YEAR -----------------------------------------');
const allYears = new Set();
for (const r of results) for (const y of r.ovrByYear.keys()) allYears.add(y);
const years = Array.from(allYears).sort((a, b) => a - b);
console.log('  career'.padEnd(32) + years.map(y => String(y).slice(2).padStart(4)).join(''));
for (const r of results) {
    console.log('  ' + r.label.slice(0, 29).padEnd(30) + years.map(y => {
        const v = r.ovrByYear.get(y);
        return (v === undefined ? '-' : String(v)).padStart(4);
    }).join(''));
}

// ---------------------------------------------------------------------------
//  PLAUSIBILITY
// ---------------------------------------------------------------------------
CTX = { label: 'PLAUSIBILITY', week: 0, year: 0, cfg: null };

// 1. progression curve
for (const r of results) {
    if (r.cfg.tryRoleChange) continue;   // a deliberate role switch is not a fair sample
    const seq = years.map(y => r.ovrByYear.get(y)).filter(v => v !== undefined);
    if (seq.length < 3) continue;
    const first = seq[0];
    const peak = Math.max(...seq);
    // Judge the gain against the headroom the player actually had, not against
    // a flat +3. A `debut` start rolls a nearly finished player -- OVR 69 with
    // a potential of 72 -- so demanding +3 asks for growth the roll never made
    // available and fails the run on the start path rather than on a defect.
    const room = r.potOVR - first;
    if (room < 5) continue;             // nothing to prove; already near its ceiling
    if (peak - first < room * 0.5) {
        fail('wrong', 'src/lib/stores/career.js',
            'a full career of dedicated training barely moves the overall rating',
            `${r.label}: OVR by year ${seq.join(' -> ')} (start ${first}, peak ${peak}, ` +
            `+${peak - first} over ${seq.length} years against a potential OVR of ${r.potOVR} ` +
            `-- ${room} points of headroom, less than half of it captured)`,
            'Check applyAttrGain: clampAttr() rounds the new value, so any weekly gain under 0.5 is discarded entirely.',
            'progression');
    }
}
{
    const declines = results.filter(r => {
        const seq = years.map(y => r.ovrByYear.get(y)).filter(v => v !== undefined);
        if (seq.length < 4) return false;
        const peak = Math.max(...seq);
        return seq[seq.length - 1] < peak;
    });
    if (results.length && declines.length === 0) {
        fail('wrong', 'src/lib/career/engine.js',
            'no career ever declines with age -- the age curve never bites',
            `${results.length} careers, every one finished at its own peak OVR`,
            'applyAgeDecay/decayFor should pull a veteran back down after the prime band.',
            'nodecline');
    }
}

// 1b. can a career ever actually reach its own hidden ceiling?
{
    console.log('');
    console.log('---- TRAINING THROUGHPUT ---------------------------------');
    console.log(`  drills completed       : ${stats.drills}`);
    console.log(`  of those, +0.00 gain   : ${stats.drillsZeroGain}` +
        (stats.drills ? `  (${((stats.drillsZeroGain / stats.drills) * 100).toFixed(0)}% of paid sessions moved nothing)` : ''));
    console.log(`  mean gain per drill    : ${stats.drills ? (stats.drillGainSum / stats.drills).toFixed(3) : '-'}`);
    console.log('  peak attribute vs ceiling (peak, not retirement -- age decay is not a training stall):');
    for (const r of results) {
        const line = r.headroom.map(h => `${h.k}${h.peak.toFixed(1)}/${h.cap}`).join(' ');
        console.log('    ' + r.label.slice(0, 26).padEnd(27) + line);
    }

    if (stats.drills >= 200 && stats.drillsZeroGain / stats.drills > 0.25) {
        fail('wrong', 'src/lib/stores/career.js',
            'a large share of paid training sessions raise nothing at all',
            `${stats.drillsZeroGain} of ${stats.drills} successful drills ` +
            `(${((stats.drillsZeroGain / stats.drills) * 100).toFixed(0)}%) returned gain 0 after spending an ` +
            `action slot, the energy and the gold. applyAttrGain() does ` +
            `next = clampAttr(min(ceiling, cur + gain)) -- clampAttr() rounds, so every sub-0.5 gain is ` +
            `discarded and never accumulates. Mean applied gain per drill: ` +
            `${(stats.drillGainSum / stats.drills).toFixed(3)}.`,
            'Keep attributes fractional inside applyAttrGain (clamp without Math.round) and round only for display, ' +
            'or carry the discarded remainder forward.',
            'zerogain');
    }

    // Compare the PEAK each attribute reached against its ceiling. Reading the
    // retirement value instead would flag the age curve as a training bug:
    // applyAgeDecay() takes 1.35x the yearly decay rate off MEC alone, so a
    // player who genuinely maxed mechanics at 24 still retires 5 points under
    // it at 30. What this is meant to catch is training that cannot close the
    // gap in the first place.
    const stalled = results.filter(r => {
        if (r.cfg.tryRoleChange) return false;
        return r.headroom.some(h => h.cap - h.peak >= 3);
    });
    if (stalled.length >= Math.ceil(results.length / 2)) {
        const ex = stalled[0];
        fail('wrong', 'src/lib/stores/career.js',
            'attributes hard-stop several points below their potential ceiling and can never close the gap',
            `${stalled.length}/${results.length} careers never got at least one attribute within 3 of its ceiling ` +
            `at any point in ${N_YEARS} years. Example ${ex.label}: ` +
            ex.headroom.filter(h => h.cap - h.peak >= 3).map(h => `${h.k} peaked ${h.peak.toFixed(1)}/${h.cap}`).join(', ') +
            `; career OVR peaked at ${ex.peakOVR} against a potential OVR of ${ex.potOVR}.`,
            'gainCurve() chokes to ~0.1x over the last points of headroom, so the remaining gain never accumulates.',
            'ceilingstall');
    }
}

// 1c. does the decline stay inside anything recognisable as a career?
{
    const wrecked = results.filter(r => r.age >= 32 && r.peakOVR - r.endOVR >= 20);
    if (wrecked.length) {
        const ex = wrecked.sort((a, b) => (b.peakOVR - b.endOVR) - (a.peakOVR - a.endOVR))[0];
        const seq = years.map(y => ex.ovrByYear.get(y)).filter(v => v !== undefined);
        fail('warning', 'src/lib/career/constants.js',
            'age decay runs away past 35 and leaves veterans rated below amateur',
            `${wrecked.length}/${results.length} careers lost 20+ OVR from their peak. Worst: ${ex.label} ` +
            `peaked at ${ex.peakOVR} and finished at ${ex.endOVR} aged ${ex.age}; OVR by year ${seq.join(' ')}. ` +
            `Final attributes ${ex.headroom.map(h => `${h.k} ${Math.round(h.v)}/${h.cap}`).join(', ')}. ` +
            `AGE_CURVE stops at age 35 (decay 7.5) and ageCurveFor() returns that last row for every later age, ` +
            `so engine.js DECAY_WEIGHTS.mec (1.35) removes 10.1 mechanics every single year from 35 to the ` +
            `forced retirement at 38, while growthFor(35) = 0.04 makes training unable to answer any of it.`,
            'Extend AGE_CURVE past 35 with a decay that tapers, or cap the yearly per-attribute drop.',
            'runawaydecay');
    }
}

// 2. win rates
for (const r of results) {
    if (r.countedSplits >= 4 && r.extremeSplits > r.countedSplits / 2) {
        fail('wrong', 'src/lib/career/match.js',
            'most splits finish at a 0% or 100% win rate',
            `${r.label}: ${r.extremeSplits}/${r.countedSplits} splits were whitewashes (season totals ${r.splitW}-${r.splitL})`,
            'winProbability clamps to 0.03/0.97 but team strength gaps may be saturating it.',
            'winrate');
    }
    if (r.games >= 40 && (r.wins === 0 || r.losses === 0)) {
        fail('wrong', 'src/lib/career/match.js',
            'a whole career never won or never lost a series',
            `${r.label}: ${r.wins}-${r.losses} across ${r.games} series`,
            'Check the win roll inputs (myStrength vs oppStrength).',
            'winrate-career');
    }
}

// 3. rating spread
if (stats.ratings.length > 50) {
    const n = stats.ratings.length;
    const mean = stats.ratings.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(stats.ratings.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const buckets = new Map();
    for (const v of stats.ratings) {
        const b = Math.round(v);
        buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    const top = Math.max(...buckets.values());
    const lo = Math.min(...stats.ratings);
    const hi = Math.max(...stats.ratings);
    console.log('');
    console.log('---- MATCH RATINGS ---------------------------------------');
    console.log(`  n=${n} mean=${mean.toFixed(2)} sd=${sd.toFixed(2)} min=${lo.toFixed(1)} max=${hi.toFixed(1)}`);
    const hist = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])
        .map(([b, cnt]) => `${b}:${cnt}`).join('  ');
    console.log('  ' + hist);
    if (sd < 0.5) {
        fail('wrong', 'src/lib/career/match.js', 'match ratings barely vary',
            `n=${n} mean=${mean.toFixed(2)} sd=${sd.toFixed(2)} range ${lo.toFixed(1)}..${hi.toFixed(1)}`,
            'gameRating should spread across 0-10; personal/KDA inputs may be saturating.',
            'ratingspread');
    }
    if (top / n > 0.6) {
        fail('wrong', 'src/lib/career/match.js', 'most match ratings land on one value',
            `${((top / n) * 100).toFixed(0)}% of ${n} ratings share a single integer bucket; histogram ${hist}`,
            'Widen the personal/KDA contribution in gameRating.',
            'ratingcluster');
    }

    const perfect = stats.ratings.filter(v => v >= 9.95).length;
    const atCeiling = perfect / n;
    console.log(`  exactly 10.0: ${perfect} (${(atCeiling * 100).toFixed(0)}%)`);
    // What actually makes a rating scale broken is saturation: games piling up
    // against the 10.0 clamp so the top of the range stops distinguishing
    // anything. That is the `atCeiling` arm. The mean is deliberately loose --
    // this sample is one professional starter's own games, usually the best
    // player on the roster, so it sits above the replacement level by design.
    // A tight bound here (the old one was 7.2) lands inside the seed-to-seed
    // spread and fails honest runs at random rather than reporting a defect.
    if (mean > 7.6 || atCeiling > 0.06) {
        fail('wrong', 'src/lib/career/match.js',
            'match ratings are inflated and pile up against the 10.0 clamp',
            `n=${n} mean=${mean.toFixed(2)} sd=${sd.toFixed(2)} max=${hi.toFixed(1)}; ` +
            `${perfect} games (${(atCeiling * 100).toFixed(0)}%) scored a flat 10.0; histogram by integer ${hist}.`,
            'gameRating() should scale the personal term against PERSONAL_CLAMP so the best game arithmetically ' +
            'available lands near 9.2 and a flat 10.0 stays out of reach.',
            'ratinginflation');
    }
} else if (stats.ratings.length === 0) {
    fail('crash', 'src/lib/career/match.js', 'no match rating was ever produced',
        'the harness played and simmed matches but collected zero ratings',
        'finishGame/finishMatch never returned a usable rating.');
}

// 4. did anyone get signed off the pre-competitive path?
{
    const precomp = results.filter(r => r.cfg.pathId === 'precomp');
    if (precomp.length && !precomp.some(r => r.everSigned)) {
        fail('wrong', 'src/lib/career/contracts.js',
            'no pre-competitive career was ever offered a contract',
            `${precomp.length} precomp careers trained for ${N_YEARS} years and none was ever signed ` +
            `(offers seen across all careers: ${stats.offersSeen})`,
            'generateOffers gates on SCOUT_MMR_GATE + ACADEMY_OVR_GATE; one of them is unreachable.',
            'nosign');
    }
    if (stats.offersSeen === 0) {
        fail('wrong', 'src/lib/career/contracts.js', 'no contract offer was generated in any career',
            `${results.length} careers, ${N_YEARS} years each, zero offers`,
            'generateOffers never produced a row.', 'nooffers');
    }
}

// 4b. a free agent cannot be dropped by a club he does not have
if (stats.unsignedGames >= 20) {
    const pct = stats.unsignedBench / stats.unsignedGames;
    if (pct > 0.25) {
        fail('wrong', 'src/lib/career/match.js',
            'an unsigned player is benched from his own games',
            `${stats.unsignedBench} of ${stats.unsignedGames} fixtures played with clubId === null came back ` +
            `playerPlays === false (${(pct * 100).toFixed(0)}%). engine.benchOrStart() short-circuits with ` +
            `{ plays: true } when there is no club, but match.js rollPlaysThisMatch() reads statusInfo(status) ` +
            `only -- an unsigned career carries status 'benched' (playChance 0.05), so the hub promises a game ` +
            `and the match engine sits the player down.`,
            "rollPlaysThisMatch() needs the same guard benchOrStart() has: if (!c.player.clubId) return true.",
            'unsignedbench');
    }
}

// 5. awards / milestones / legacy
{
    if (stats.awardsGranted === 0) {
        fail('wrong', 'src/lib/career/awards.js', 'no award was ever granted in any career',
            `${results.length} careers x ${N_YEARS} years, awards granted: 0`,
            'endOfSplitAwards never fires.', 'noawards');
    }
    if (stats.milestonesGranted === 0) {
        fail('wrong', 'src/lib/career/awards.js', 'no milestone ever fired',
            `${results.length} careers x ${N_YEARS} years, milestones: 0`,
            'checkMilestones never returns anything.', 'nomilestones');
    }
    if (results.length && results.every(r => (Number(r.legacy) || 0) === 0)) {
        fail('wrong', 'src/lib/career/awards.js', 'no legacy points were ever awarded',
            `${results.length} careers ended with 0 legacy currency`,
            'grantMilestones/grantAwards should pay legacy.', 'nolegacy');
    }
}

// ---------------------------------------------------------------------------
//  REPORT
// ---------------------------------------------------------------------------
console.log('');
console.log('---- SURFACE COVERAGE ------------------------------------');
console.log(`  matches played by hand : ${stats.matchesPlayedManually}`);
console.log(`  matches simulated      : ${stats.matchesSimmed}`);
console.log(`  benched appearances    : ${stats.benchedGames}`);
{
    const d = stats.draft;
    const total = d.signature + d.pocket + d.offscript + d.missing;
    const share = (n) => total ? ((n / total) * 100).toFixed(1) + '%' : '-';
    console.log(`  champion select        : ${d.signature} signature (${share(d.signature)}) / `
        + `${d.pocket} pocket (${share(d.pocket)}) / ${d.offscript} off-script (${share(d.offscript)})`);
    // Regular-season format. Both arms must appear: if every division resolves
    // to Bo1 the region table has gone flat and the Bo3 leagues are a comment,
    // and if none does, tier 3 has stopped being scrims.
    {
        const rf = stats.regFormat || {};
        const bo1 = rf[1] || 0, bo3 = rf[3] || 0;
        const mean = stats.seriesPlayed ? (stats.seriesGames / stats.seriesPlayed) : 0;
        console.log(`  regular season format  : ${bo1} club-weeks Bo1 / ${bo3} Bo3`
            // The scoreline check re-reads every finished row every week, so this
            // is a count of CHECKS, not of distinct series. The mean is a weighted
            // mean over the same rows and is unaffected.
            + (stats.seriesPlayed ? `, ${stats.seriesPlayed} series scorelines checked averaging ${mean.toFixed(2)} games` : ''));
        if (!bo1 || !bo3) {
            fail('wrong', 'src/lib/career/constants.js',
                'the regular season has only one match format',
                `Bo1 club-weeks ${bo1}, Bo3 ${bo3}`,
                'regularBestOf() must return 3 for LCK/LPL/LCP at tiers 1-2 and 1 everywhere else.',
                'boflat');
        }
        // A Bo3 whose games never vary is a Bo3 that always sweeps, i.e. the
        // series loop is resolving on the first game.
        if (stats.seriesPlayed && (mean < 2.05 || mean > 2.95)) {
            fail('wrong', 'src/lib/career/match.js',
                'Bo3 series are not going the distance',
                `${stats.seriesPlayed} series averaged ${mean.toFixed(2)} games`,
                'A Bo3 should land between 2 and 3 games; a mean pinned to either end means the '
                + 'series loop is not running per game.',
                'bomean');
        }
    }
    // Tournament calendar. Inertness matters as much as correctness here: if
    // every bracket resolves on one week the spread is wired and dead, which is
    // precisely the state this system was in before rounds had weeks at all.
    {
        const bw = stats.bracketWeeks || {};
        const parts = Object.entries(bw).map(([k, s]) => `${k} ${[...s].sort((a, b) => a - b).join('/')}`);
        console.log(`  tournament calendar    : ${parts.join('  ') || '(no bracket reached)'}`);
        const widest = Object.values(bw).reduce((n, s) => Math.max(n, s.size), 0);
        if (Object.keys(bw).length && widest < 3) {
            fail('wrong', 'src/lib/career/engine.js',
                'brackets are not spread across their calendar window',
                `widest bracket occupied ${widest} week(s)`,
                'stepBracket must wait for each round\'s week; tickBracket must advance it weekly.',
                'brflat');
        }
        // Inertness per EVENT. Eight careers over 12-24 years each reach all four
        // of these; an event that never appears is an event nobody can play, and
        // First Stand in particular hangs off a flag that survives the year
        // rollover -- exactly the kind of wiring that breaks without a symptom.
        for (const kind of ['spring_po', 'summer_po', 'msi', 'worlds', 'first_stand']) {
            if (!bw[kind] || !bw[kind].size) {
                fail('wrong', 'src/lib/career/engine.js',
                    `the ${kind} bracket never ran in any career`,
                    `events reached: ${Object.keys(bw).join(', ') || 'none'}`,
                    kind === 'first_stand'
                        ? 'The berth is flags.firstStandBerth, set at a summer title and read the NEXT year; '
                          + 'rolloverYear must not clear it and runInternational must accept the kind.'
                        : 'handlePhaseChange must open this bracket when the calendar enters its phase.',
                    'brmissing|' + kind);
            }
        }
    }
    console.log(`  fearless draft         : ${stats.fearlessSeen} selects made against a non-empty used set`
        + `, longest ${stats.fearlessMax} champions spent in one series`);
    // Inertness, the same argument as roster churn and club momentum: a used set
    // that never grows past one means the series rule is threaded and dead.
    if (stats.fearlessMax < 2) {
        fail('wrong', 'src/lib/career/match.js',
            'the fearless used-champion set never grew past one',
            `longest series spend was ${stats.fearlessMax}, over ${stats.draftPicks} picks`,
            'finishGame must concat match.draft.picked onto usedChampions and pass it to the next '
            + 'rollDraft. If every series is a Bo1 this is expected -- check a Bo5 is actually reached.');
    }
    if (!total) {
        fail('wrong', 'src/lib/career/match.js', 'no champion select was ever rolled',
            'buildMatch/finishGame produced no draft on any hand-played game',
            'rollDraft() must set match.draft for every game the player actually plays.');
    } else if (d.missing) {
        fail('wrong', 'src/lib/career/match.js', 'a played game had no draft outcome',
            `${d.missing} of ${total} games had match.draft missing or unrecognised`,
            'A missing draft silently reads as "signature" in successChance and doubles the comfort bonus.');
    } else {
        // All three outcomes must actually occur, or one branch of the feature
        // is dead and nobody would notice.
        for (const k of ['signature', 'pocket', 'offscript']) {
            if (!d[k]) {
                fail('wrong', 'src/lib/career/match.js', `champion select never produced "${k}"`,
                    `over ${total} games: ${JSON.stringify(d)}`,
                    'Check the probability split in rollDraft() - one outcome is unreachable.');
            }
        }
        if (d.signature < total * 0.30) {
            fail('wrong', 'src/lib/career/match.js', 'players almost never get their signature champion',
                `${share(d.signature)} of ${total} games`,
                'DRAFT_SIGNATURE_BASE is too low - the signature pick should be the common case.');
        }
    }
}
console.log(`  unsigned games/benched : ${stats.unsignedGames} / ${stats.unsignedBench}`);
console.log(`  signed games/benched   : ${stats.signedGames} / ${stats.signedBench}`);
console.log(`  offers seen / accepted : ${stats.offersSeen} / ${stats.offersAccepted}`);
console.log(`  shop purchases         : ${stats.shopBuys}`);
console.log(`  events / interviews    : ${stats.eventsApplied} / ${stats.interviewsApplied}`);
console.log(`  role changes           : ${stats.roleChanges}`);
{
    const kb = n => (n / 1024).toFixed(0) + 'kb';
    const worst = Math.max(0, ...results.map(r => r.saveBytes || 0));
    const worstTrim = Math.max(0, ...results.map(r => r.saveBytesTrimmed || 0));
    console.log(`  career save size       : ${kb(worst)} worst, ${kb(worstTrim)} as backed up`
        + `  (3 slots = ${kb(worstTrim * 3)} of a 1024kb Firestore document)`);
    // The roster save shares that document, so three career slots must not eat
    // the whole budget on their own.
    if (worstTrim * 3 > 600 * 1024) {
        fail('wrong', 'src/lib/stores/career.js',
            'three career slots would not leave room for the roster save in one Firestore document',
            `worst trimmed career ${kb(worstTrim)}, x3 = ${kb(worstTrim * 3)}`,
            'Trim more in exportCareerSlots (CLOUD_NEWS_KEEP), or split careers into their own document.',
            'cloudsize');
    }
}
// The global career board. Every published career travels as two documents --
// a 25-field ranking ROW and a JSON dossier BLOB -- and both are validated by
// hand-published Firestore rules whose every literal is mirrored by
// CAREER_BOUNDS in anticheat.js.
//
// A bound that is too TIGHT fails completely invisibly in production: the rule
// denies the write, the client's catch swallows it, and an honest player's
// career simply never appears, for anyone, with no error anywhere. Nothing in
// the game would ever report it. So this block does two things a pass/fail line
// cannot: it asserts that no real career trips a rail, and it PRINTS THE
// TIGHTEST MARGIN to every rail whether or not anything failed, so a limit
// creeping toward a real career is visible BEFORE it fires.
{
    const kb = n => (n / 1024).toFixed(1) + 'kb';
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const withDocs = results.filter(r => r && r.boardDocs && r.boardDocs.row);

    for (const r of results) {
        if (!r.boardDocs || !r.boardDocs.row) {
            fail('crash', 'src/lib/career/board.js',
                'a finished career produced no board documents',
                `${r.label}: buildBoardDocs() returned null or threw for a created, retired career`,
                'buildBoardDocs returns null only for a career with created !== true; anything else is a throw inside it.',
                'boarddocs');
        }
    }

    if (!withDocs.length) {
        console.log('  board entry            : no career produced a board document');
    } else {
        // ---- size -------------------------------------------------------
        const rowBytes = withDocs.map(r => Number(r.boardRowBytes) || 0);
        const blobBytes = withDocs.map(r => Number(r.boardBlobBytes) || 0);
        const worstRow = Math.max(...rowBytes);
        const worstBlob = Math.max(...blobBytes);
        console.log(`  board row bytes        : ${worstRow} worst, ${Math.round(mean(rowBytes))} mean`
            + `  (cap ${BD.BOARD_ROW_BYTES_MAX}, ${((worstRow / BD.BOARD_ROW_BYTES_MAX) * 100).toFixed(0)}% used)`);
        console.log(`  board dossier bytes    : ${worstBlob} worst, ${Math.round(mean(blobBytes))} mean`
            + `  (cap ${BD.BOARD_BLOB_BYTES_MAX}, ${((worstBlob / BD.BOARD_BLOB_BYTES_MAX) * 100).toFixed(0)}% used)`);
        console.log(`  one ${BD.BOARD_LIMIT}-row board page  : ${kb(worstRow * BD.BOARD_LIMIT)} at the worst measured row`
            + `, + ${kb(worstBlob)} for each dossier opened`);

        for (const r of withDocs) {
            if (r.boardRowBytes > BD.BOARD_ROW_BYTES_MAX) {
                fail('wrong', 'src/lib/career/board.js',
                    'a real career builds a board row over BOARD_ROW_BYTES_MAX',
                    `${r.label}: ${r.boardRowBytes} bytes against a ${BD.BOARD_ROW_BYTES_MAX} budget`,
                    'The row is a fixed 25 fields, so this means a string field grew; re-check CAREER_STR_MAX.',
                    'boardrowbytes');
            }
            if (r.boardBlobBytes > BD.BOARD_BLOB_BYTES_MAX) {
                fail('wrong', 'src/lib/career/board.js',
                    'a real career builds a dossier blob over BOARD_BLOB_BYTES_MAX',
                    `${r.label}: ${r.boardBlobBytes} bytes against a ${BD.BOARD_BLOB_BYTES_MAX} budget`,
                    'encodeBlob trims awards, then history, then proficiency; one of those loops stopped short.',
                    'boardblobbytes');
            }
        }

        // ---- every bounded field ----------------------------------------
        //  Note what this can and cannot catch on its own: buildBoardDocs puts
        //  every field through bounded(), so the built row is inside the bounds
        //  BY CONSTRUCTION. The check below is therefore cheap insurance against
        //  a field going missing or non-integer -- the second loop, comparing
        //  the published number against the unclamped truth, is the one that can
        //  actually see a rail bite a real career.
        const track = new Map();
        const note = (field, v, label) => {
            const t = track.get(field) || { lo: Infinity, hi: -Infinity, loLabel: '-', hiLabel: '-' };
            if (v < t.lo) { t.lo = v; t.loLabel = label; }
            if (v > t.hi) { t.hi = v; t.hiLabel = label; }
            track.set(field, t);
        };

        for (const r of withDocs) {
            const row = r.boardDocs.row;
            for (const field of Object.keys(AC.CAREER_BOUNDS)) {
                const b = AC.CAREER_BOUNDS[field];
                const v = row[field];
                if (typeof v !== 'number' || !Number.isFinite(v)) {
                    fail('crash', 'src/lib/career/board.js',
                        `board row field "${field}" is missing or not a finite number`,
                        `${r.label}: ${field} = ${JSON.stringify(v)}`,
                        'Every field the rules name must exist on the row; a missing one denies the whole write.',
                        'boardfield|' + field);
                    continue;
                }
                if (!Number.isInteger(v)) {
                    fail('wrong', 'src/lib/career/board.js',
                        `board row field "${field}" is not an integer`,
                        `${r.label}: ${field} = ${v}`,
                        'Every numeric rail in firestore.rules is `v is int`; a fractional field is denied outright.',
                        'boardint|' + field);
                }
                if (v < b.min || v > b.max) {
                    fail('wrong', 'src/lib/utils/anticheat.js',
                        `board row field "${field}" fell outside CAREER_BOUNDS`,
                        `${r.label}: ${field} = ${v}, bound ${b.min}..${b.max}`,
                        `Raise CAREER_BOUNDS.${field} in anticheat.js AND the matching literal in firestore.rules -- they are asserted to agree.`,
                        'boardbound|' + field);
                }
                note(field, v, r.label);
            }
        }

        // ---- did a rail actually bite? -----------------------------------
        //  The published figure against what the career really was. A difference
        //  here means a clamp fired: the board is showing a number the player
        //  did not earn, which is the quiet half of a bound being too tight.
        for (const r of withDocs) {
            if (!r.boardRaw) continue;
            const row = r.boardDocs.row;
            for (const field of Object.keys(r.boardRaw)) {
                const was = Math.round(Number(r.boardRaw[field]) || 0);
                const pub = Number(row[field]);
                if (!Number.isFinite(pub) || pub === was) continue;
                const b = AC.CAREER_BOUNDS[field];
                fail('wrong', 'src/lib/utils/anticheat.js',
                    `the published board row understates "${field}" -- a bound or a rail clamped a real career`,
                    `${r.label}: the career's ${field} is ${was}, the row publishes ${pub}`
                    + (b ? ` (bound ${b.min}..${b.max})` : ''),
                    `Raise CAREER_BOUNDS.${field} in anticheat.js AND firestore.rules, or loosen the cross-field rail that clamped it in buildBoardDocs.`,
                    'boardclamp|' + field);
            }
        }

        // ---- cross-field rails -------------------------------------------
        //  The same rails firestore.rules enforces, evaluated against a real
        //  career rather than quoted. Slack is how much further a career could
        //  have gone before the write was denied.
        const RAILS = [
            { id: 'ovr <= peakOVR',                  slack: d => d.peakOVR - d.ovr },
            { id: 'years <= age - 12',               slack: d => (d.age - 12) - d.years },
            { id: 'wins + losses <= games',          slack: d => d.games - (d.wins + d.losses) },
            { id: 'games <= years * 60 + 60',        slack: d => (d.years * 60 + 60) - d.games },
            { id: 'earnedScore <= years*4000 + 400', slack: d => (d.years * 4000 + 400) - d.earnedScore },
            { id: 'worlds <= years',                 slack: d => d.years - d.worlds },
        ];
        const railRows = RAILS.map(rl => ({ id: rl.id, slack: Infinity, label: '-' }));

        for (const r of withDocs) {
            const row = r.boardDocs.row;
            RAILS.forEach((rl, i) => {
                const s = rl.slack(row);
                if (!Number.isFinite(s)) return;
                if (s < railRows[i].slack) { railRows[i].slack = s; railRows[i].label = r.label; }
                if (s < 0) {
                    fail('wrong', 'src/lib/career/board.js',
                        `a real career trips the cross-field rail "${rl.id}"`,
                        `${r.label}: slack ${s} on ${rl.id} -- row ${JSON.stringify({
                            age: row.age, years: row.years, games: row.games, wins: row.wins,
                            losses: row.losses, ovr: row.ovr, peakOVR: row.peakOVR,
                            earnedScore: row.earnedScore, worlds: row.worlds,
                        })}`,
                        'Loosen the rail in firestore.rules and the matching clamp in buildBoardDocs; a denied write is silent.',
                        'boardrail|' + rl.id);
                }
            });

            // finishedScore is exactly derived, and the rules enforce the
            // derivation -- which is what makes the "Completed" sort a free
            // single-field orderBy. Get it wrong and every retired career is
            // denied, silently, forever.
            const okFinished = row.retired
                ? row.finishedScore === row.earnedScore
                : row.finishedScore === -1;
            if (!okFinished) {
                fail('wrong', 'src/lib/career/board.js',
                    'the finishedScore derivation does not hold for a real career',
                    `${r.label}: retired=${row.retired} finishedScore=${row.finishedScore} earnedScore=${row.earnedScore}`,
                    'finishedScore must be earnedScore when retired and exactly -1 otherwise.',
                    'boardfinished');
            }
        }

        // ---- the margin table --------------------------------------------
        const marginRows = Object.keys(AC.CAREER_BOUNDS).map(field => {
            const b = AC.CAREER_BOUNDS[field];
            const t = track.get(field) || { lo: 0, hi: 0, loLabel: '-', hiLabel: '-' };
            const span = b.max - b.min;
            return {
                field, b,
                lo: t.lo, hi: t.hi, hiLabel: t.hiLabel,
                capGap: b.max - t.hi,
                floorGap: t.lo - b.min,
                used: span > 0 ? (t.hi - b.min) / span : 1,
            };
        }).sort((a, b2) => b2.used - a.used);

        // A few caps are not judgement calls at all -- they ARE an engine
        // constant, and a real career reaching one is the game working rather
        // than a rail about to lock somebody out. Marked with a star, and
        // DERIVED rather than listed, so that raising ATTR_MAX without touching
        // CAREER_BOUNDS drops the star and turns that zero back into an alarm.
        const HARD = {
            age:     ['RETIREMENT_AGE_FORCED', K.RETIREMENT_AGE_FORCED],
            ovr:     ['ATTR_MAX', K.ATTR_MAX],
            peakOVR: ['ATTR_MAX', K.ATTR_MAX],
            peakMMR: ['MMR_MAX', K.MMR_MAX],
        };
        const hardOf = (m) => (HARD[m.field] && HARD[m.field][1] === m.b.max) ? HARD[m.field][0] : '';

        console.log('  tightest margin to every rail (worst of ' + withDocs.length + ' careers). A cap that a real');
        console.log('  career can reach is a silent lockout, so headroom is the number to watch:');
        console.log('      ' + 'field'.padEnd(14) + 'bound'.padEnd(13)
            + 'lowest'.padStart(8) + 'highest'.padStart(9)
            + 'headroom'.padStart(10) + 'floor'.padStart(8) + 'used'.padStart(7)
            + '  worst career');
        for (const m of marginRows) {
            console.log('      ' + (m.field + (hardOf(m) ? '*' : '')).padEnd(14)
                + `${m.b.min}..${m.b.max}`.padEnd(13)
                + String(m.lo).padStart(8)
                + String(m.hi).padStart(9)
                + String(m.capGap).padStart(10)
                + String(m.floorGap).padStart(8)
                + ((m.used * 100).toFixed(0) + '%').padStart(7)
                + '  ' + String(m.hiLabel).slice(0, 30));
        }
        {
            const starred = marginRows.filter(m => hardOf(m));
            if (starred.length) {
                console.log('      * cap IS an engine constant ('
                    + starred.map(m => `${m.field} = ${hardOf(m)} ${m.b.max}`).join(', ')
                    + '), so 0 headroom there is the game working, not a lockout.');
            }
        }

        console.log('  cross-field rails, slack at the tightest career (0 = sitting exactly on the rail;');
        console.log('  wins+losses <= games is 0 by construction, every other 0 is worth a look):');
        for (const rl of railRows) {
            console.log('      ' + rl.id.padEnd(34)
                + (Number.isFinite(rl.slack) ? String(rl.slack) : '-').padStart(10)
                + '  ' + String(rl.label).slice(0, 30));
        }
    }
}
// Champion select and what it taught the player. A run where nobody ever picks,
// or where proficiency never accumulates, means the feature is wired but inert.
{
    const pools = results.map(r => Object.keys(r.proficiency || {}).length);
    const best = results.map(r => Math.max(0, ...Object.values(r.proficiency || {})));
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    console.log(`  champion select picks  : ${stats.draftPicks}`);
    console.log(`  champions played       : ${mean(pools).toFixed(1)} mean per career`
        + `, most-played has ${mean(best).toFixed(0)} games`);
    if (stats.draftPicks < 100) {
        fail('wrong', 'src/lib/career/match.js', 'champion select barely fired',
            `${stats.draftPicks} picks across the whole run`,
            'Every played game should offer a draft; draftPending/rollDraft may have stopped producing options.');
    }
    if (mean(pools) < 2) {
        fail('wrong', 'src/lib/career/match.js', 'careers only ever play one champion',
            `mean pool ${mean(pools).toFixed(2)}`,
            'rollDraft should be offering a varied three, and finishGame should bank each one played.');
    }
}
// Traits and the two ceiling budgets. Not an assertion -- the invariants above
// cover correctness. This is the balance readout: a run where every career is a
// Legend, or where nobody ever earns a breakthrough, is a tuning problem the
// pass/fail line will never catch.
{
    const traitRows = results
        .map(r => (Array.isArray(r.traits) && r.traits[0]) || 'none')
        .reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());
    console.log('  traits revealed        : ' + Array.from(traitRows.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${K.TRAIT_BY_ID[id] ? K.TRAIT_BY_ID[id].name : id} x${n}`).join(', '));
    const bt = results.map(r => Number(r.breakthroughOVR) || 0);
    const camp = results.map(r => Number(r.boughtCeilingOVR) || 0);
    const mean = a => (a.length ? (a.reduce((s, v) => s + v, 0) / a.length) : 0);
    console.log(`  ceiling earned / bought: +${mean(bt).toFixed(1)} / +${mean(camp).toFixed(1)} mean OVR`
        + ` (budgets ${G.BREAKTHROUGH_CAREER_MAX} / ${E.CEILING_PURCHASE_MAX})`);
}
// Condition. Morale and health reach successChance directly now, so these are
// the numbers that make the match-rating mean attributable — and the two-sided
// inertness check is the one that matters: a meter that never moves has been
// flattened by its own pull constants and is a lever in name only.
{
    const meanMorale = COND.n ? COND.morale / COND.n : 0;
    const meanHealth = COND.n ? COND.health / COND.n : 0;
    console.log(`  condition              : morale mean ${meanMorale.toFixed(1)} (min ${COND.minMorale})`
        + `, health mean ${meanHealth.toFixed(1)} (min ${COND.minHealth})`
        + `, ${COND.lowMoraleWeeks} player-weeks under 30 morale`);
    // The inertness test that matches the mechanic: morale and health both cost
    // a match only BELOW a floor, so what has to be proven is that a career
    // actually gets there. If nobody ever drops under the floor, the penalty is
    // dead code and "morale matters" is a claim with no mechanism behind it.
    if (COND.minMorale >= 75) {
        fail('wrong', 'src/lib/career/engine.js',
            'morale never fell below the level where it costs anything',
            `lowest morale seen was ${COND.minMorale} over ${COND.n} player-weeks (penalty starts under 75)`,
            'Either the SQUAD_STATUS pull is too weak against the +12 a match win pays, or a purchased '
            + 'moraleFloor is pinning the meter. A penalty nobody can reach is not a lever.');
    }
    if (COND.minHealth >= 70) {
        fail('wrong', 'src/lib/career/engine.js',
            'health never fell below the level where it costs anything',
            `lowest health seen was ${COND.minHealth} over ${COND.n} player-weeks (penalty starts under 70)`,
            'injuryRoll and the drill injury risk should both be reachable; check PHYSIO cover is not permanent.');
    }
    for (const id of Object.keys(K.SQUAD_STATUS)) {
        const t = K.SQUAD_STATUS[id];
        if (!Number.isFinite(t.moraleTarget) || !Number.isFinite(t.moralePull)) {
            fail('wrong', 'src/lib/career/constants.js',
                `SQUAD_STATUS.${id} has no usable morale pull`,
                `moraleTarget=${t.moraleTarget} moralePull=${t.moralePull}`,
                'A typo here reads as undefined, num() defaults it, and the lever silently turns off.');
        }
    }
}
// The ladder into the game. A first club that is not an amateur one breaks the
// rule outright; a career that never signs at all is the PACING regression this
// change most plausibly causes, and it would otherwise pass every other check.
{
    const precomp = results.filter(r => r.cfg && r.cfg.pathId === 'precomp');
    const debut = results.filter(r => r.cfg && r.cfg.pathId === 'debut');
    const neverSigned = results.filter(r => !r.everSigned);
    const badFirst = precomp.filter(r => r.firstClubTier && r.firstClubTier !== 3);
    console.log(`  first club             : ${precomp.length} precomp (first tier ${[...new Set(precomp.map(r => r.firstClubTier))].sort().join('/')})`
        + `, ${debut.length} debut, ${neverSigned.length} never signed`);
    if (badFirst.length) {
        fail('wrong', 'src/lib/career/contracts.js',
            'a pre-competitive career signed above the open circuit first',
            badFirst.map(r => `${r.label} -> tier ${r.firstClubTier}`).join('; '),
            'signingBlock() clause (a) must block tier < 3 while flags.everSigned is false.');
    }
    if (neverSigned.length) {
        fail('wrong', 'src/lib/career/contracts.js',
            'a career finished having never been signed by anybody',
            neverSigned.map(r => r.label).join('; '),
            'The amateur ladder is now compulsory, so it must be REACHABLE: check AMATEUR_OVR_GATE / '
            + 'AMATEUR_MMR_GATE against soloTargetFor(), and that generateOffers still reaches a tier-3 side.');
    }
}
// Solo queue. The ladder is the only progress bar an unsigned career has, and
// its floor moved from Iron to Gold -- these pin the three things that could
// silently break: the start rank, the ladder still moving with skill, and the
// scouting gate staying where it was.
{
    const goldIdx = K.RANK_TIERS.findIndex(t => t.id === 'GOLD');
    for (const p of K.START_PATHS) {
        const rank = R.rankFromMMR(Number(p.startMMR) || 0);
        const idx = K.RANK_TIERS.findIndex(t => t.id === rank.tierId);
        console.log(`  solo queue start       : ${p.name} -> ${rank.label}`);
        if (idx < goldIdx) {
            fail('wrong', 'src/lib/career/constants.js',
                'a start path begins below Gold',
                `${p.name} starts on ${rank.label} (${p.startMMR} MMR)`,
                'START_PATHS.startMMR must land at or above SOLOQ_FLOOR_MMR.');
        }
        // The start must also be a rank the path can HOLD. Starting above the
        // equilibrium is the original bug wearing a different number.
        const settles = K.soloTargetFor(Number(p.baseAttr) || 32);
        if (Number(p.startMMR) > settles + 400) {
            fail('wrong', 'src/lib/career/constants.js',
                'a start path begins on a rank it immediately demotes out of',
                `${p.name} starts ${p.startMMR} but settles at ${Math.round(settles)}`,
                'Set startMMR near soloTargetFor(path.baseAttr) or the career demotes every fortnight.');
        }
    }
    let rising = true;
    for (let o = K.SOLOQ_FLOOR_OVR + 1; o <= 99; o++) {
        if (K.soloTargetFor(o) <= K.soloTargetFor(o - 1)) rising = false;
    }
    if (!rising) {
        fail('wrong', 'src/lib/career/constants.js', 'the solo queue ladder stopped rewarding skill',
            'soloTargetFor() is not strictly increasing above the floor',
            'A flat segment freezes the rank for every OVR in it, and the scout-gate meter never moves.');
    }
    const firstAt = (g) => { for (let o = 1; o <= 99; o += 0.1) if (K.soloTargetFor(o) >= g) return o; return 999; };
    if (firstAt(K.MMR_MAX * 0.8625) > 99) {
        fail('wrong', 'src/lib/career/constants.js', 'Challenger became unreachable',
            'no OVR maps to 3450 MMR',
            'ms_challenger and every retirement peakRank line depend on the top of the curve being reachable.');
    }
    const scoutAt = firstAt(R.SCOUT_MMR_GATE);
    console.log(`  solo queue gates       : scout gate at OVR ${scoutAt.toFixed(1)}, Challenger at OVR ${firstAt(3450).toFixed(1)}`);
    if (Math.abs(scoutAt - 73.7) > 1.5) {
        fail('wrong', 'src/lib/career/constants.js', 'the scouting gate moved',
            `SCOUT_MMR_GATE now needs OVR ${scoutAt.toFixed(1)}, was 73.7`,
            'The curve is pinned at SOLOQ_JOINT_OVR precisely so everything above it is unchanged.');
    }
}
// Early contract termination. A club that can never fire you is the thing this
// replaced, so ZERO terminations across every career means the system is wired
// and dead; more than about 1.5 a career means the mode has become unplayable.
{
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const terms = results.map(r => Number(r.terminations) || 0);
    const total = terms.reduce((s, v) => s + v, 0);
    console.log(`  terminations           : ${mean(terms).toFixed(2)} per career (${total} total)`
        + `, ${mean(results.map(r => Number(r.endStrikes) || 0)).toFixed(2)} strikes carried at the end`);
    // NOT a failure at zero. This harness drives near-optimal careers -- they
    // train every week, so ovr outruns the club strength and clubReview returns
    // 'happy' almost every split. The mechanism is proven separately, by a probe
    // that builds a deliberately failing career; what this line is here to catch
    // is the OTHER direction, a mode that fires everybody.
    if (total === 0) {
        console.log('                           (none this run -- these careers all review well; '
            + 'the firing path is proven by the underperformance probe, not here)');
    } else if (mean(terms) > 1.5) {
        fail('wrong', 'src/lib/career/contracts.js',
            'clubs are firing players constantly',
            `${mean(terms).toFixed(2)} terminations per career`,
            'STRIKES_BEFORE_TERMINATION is too low, or recordReview is counting the same split twice.');
    }
}
// Club momentum and roster churn. Both are balance readouts, but two of them
// are also inertness checks with a hard line: a roster system that never moves a
// seat, or a momentum that never leaves zero, is wired and dead - which is the
// exact failure mode this file exists to catch, and the one a pass/fail on
// attributes would never see.
{
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const changes = results.map(r => Number(r.rosterChanges) || 0);
    const seats = results.map(r => Number(r.rosterSeats) || 0);
    const mom = results.map(r => Math.abs(Number(r.momentum) || 0));
    const totalChanges = changes.reduce((s, v) => s + v, 0);
    console.log(`  roster churn           : ${mean(changes).toFixed(1)} teammates replaced per career`
        + `, ${mean(seats).toFixed(1)} seats currently held by a signing`
        + `, |momentum| ${mean(mom).toFixed(2)} at retirement`);
    if (totalChanges === 0) {
        fail('wrong', 'src/lib/career/engine.js', 'no club ever changed its roster',
            `${results.length} careers, 0 logged roster changes`,
            'runRosterChurn() is hooked to the offseason phase change; check handlePhaseChange and that the career had a club.');
    }
    if (mean(mom) === 0) {
        fail('warning', 'src/lib/career/engine.js', 'club momentum never left zero',
            'mean |momentum| 0.00 across every career',
            'tickClubMomentum() runs in advanceWeek; it needs three played fixtures in season.schedule before it moves.');
    }

    // One seat, one move, one offseason. runRosterChurn() used to read the
    // roster from a snapshot taken BEFORE it expired the aged-out signings in
    // the same run, so a seat could be retired and replaced in the same week --
    // two contradictory news lines, and the replacement priced against the dead
    // card. Nothing else checks this.
    for (const r of results) {
        const rows = Array.isArray(r.changes) ? r.changes : [];
        const seen = new Set();
        for (const ch of rows) {
            if (!ch || !ch.role) continue;
            const key = `${ch.year}:${ch.role}`;
            if (seen.has(key)) {
                fail('wrong', 'src/lib/career/engine.js',
                    'one seat changed twice in a single offseason',
                    `${r.name}: ${key} appears more than once in club.changes`,
                    'runRosterChurn() must read `live` from the post-expiry roster, not from the snapshot it took at entry.');
                break;
            }
            seen.add(key);
        }
    }
}
// signingFor() has to land on the rating it was asked for. The synthetic
// fallback used to pass a SEAT target into syntheticPlayer()'s `strength`, which
// is a ROSTER MEAN and adds SYN_ROLE_TILT on top -- so a club replacing a
// support with an equal support always signed one two points worse, and a mid
// two points better, purely as a function of the seat. Deterministic given the
// seeded RNG, and an ALL-region club is used so the synthetic path always fires.
step('teams.signingFor hits its target', () => {
    const club = K.teamById('am_pug3') || K.teamById(K.AMATEUR_TEAMS?.[0]?.id) || null;
    if (!club) return null;
    const TARGET = 60;
    const N = 300;
    for (const role of T.ROSTER_SLOTS) {
        let sum = 0;
        let n = 0;
        for (let salt = 0; salt < N; salt++) {
            const card = T.signingFor(club, role, 2032, TARGET, salt, [], []);
            if (!card) continue;
            sum += Number(card.rating) || 0;
            n++;
        }
        if (!n) continue;
        const got = sum / n;
        if (Math.abs(got - TARGET) > 0.8) {
            fail('wrong', 'src/lib/career/teams.js',
                'signingFor misses the rating it was asked for',
                `${role}: asked ${TARGET}, delivered ${got.toFixed(2)} over ${n} salts`,
                'The synthetic fallback must back SYN_ROLE_TILT[role] out of the target -- syntheticPlayer treats `strength` as a roster mean, not a seat rating.');
        }
    }
    return true;
}, null);
// The legacy economy. The board was repriced against exactly these numbers, so
// a run where every career retires holding thousands means the prices in
// economy.js are stale again.
{
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const perks = results.map(r => Number(r.perksOwned) || 0);
    const left = results.map(r => Number(r.legacy) || 0);
    const mons = results.reduce((s, r) => s + (Number(r.monuments) || 0), 0);
    const trades = results.reduce((s, r) => s + (Number(r.trades) || 0), 0);
    console.log(`  legacy economy         : ${mean(perks).toFixed(1)}/${E.LEGACY_PERKS.length} perks owned`
        + `, ${mean(left).toFixed(0)} LP unspent at retirement`
        + ` (board costs ${E.PERK_BOARD_COST} LP)`
        + `, ${mons} monuments + ${trades} trades bought`);
}
console.log(`  awards / milestones    : ${stats.awardsGranted} / ${stats.milestonesGranted}`);
console.log('  award ids granted      : ' + Array.from(stats.awardIds.entries())
    .sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} x${n}`).join(', '));

console.log('');
console.log('---- FAILURES --------------------------------------------');
if (!failures.length) {
    console.log('  none. clean run.');
} else {
    const order = { crash: 0, wrong: 1, warning: 2 };
    failures.sort((a, b) => (order[a.severity] - order[b.severity]));
    for (const f of failures) {
        console.log('');
        console.log(`  [${f.severity.toUpperCase()}] ${f.file}  (x${f._count})`);
        console.log(`    symptom : ${f.symptom}`);
        console.log(`    evidence: ${f.evidence.split('\n').join('\n              ')}`);
        console.log(`    fix     : ${f.suggestedFix}`);
    }
}
console.log('');
console.log(`  ${failures.length} distinct problem(s).`);
console.log('');

if (VERBOSE) {
    console.log(JSON.stringify(failures.map(f => ({
        severity: f.severity, file: f.file, symptom: f.symptom,
        evidence: f.evidence, suggestedFix: f.suggestedFix, count: f._count,
    })), null, 2));
}

process.exitCode = failures.length ? 1 : 0;
