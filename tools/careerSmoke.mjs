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
const stats = {
    ratings: [],
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
        const pool = ['soloq', 'vod', 'stream', 'media', 'gym', 'rest'];
        if (c2.player.clubId) pool.push('scrim', 'scrim');
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
                `${ctxLine()} -> ${JSON.stringify(secs)}`, 'The shop must always render its five sections.');
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

    return {
        label, cfg, retired, weeks,
        ovrByYear,
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
        const champs = K.championsForRole(roleId);
        out.push({
            handle: `Smoke${i + 1}`,
            pathId,
            age: p.ages[i % p.ages.length],
            regionId,
            roleId,
            playstyleId: styles.length ? styles[i % styles.length].id : '',
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
