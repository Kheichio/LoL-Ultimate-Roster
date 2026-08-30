#!/usr/bin/env node
// ===========================================================================
//  lifeCheck.mjs -- validates the life-event pools in career/events.js
// ===========================================================================
//  events.js was validated by NOTHING. eventCheck.mjs covers matchEvents.js,
//  the IN-MATCH decision pools, and has never so much as imported this file.
//  Meanwhile events.js is now ~180 authored entries across three pools, and
//  every single way it can be wrong is SILENT:
//
//    1. A duplicated id overwrites the other one's row in flags.eventLog, so
//       the 20-week cooldown leaks and one of the pair can fire twice a split
//       while the other is suppressed for a season.
//    2. A two-option event renders two buttons. The overlay is undismissable
//       until answered, so it still "works" -- it is just a coin flip that was
//       written as a decision.
//    3. A `when` that cannot be satisfied means nobody ever sees the event.
//       There is no error. The entry is simply dead content in a shipped save.
//    4. An effect key outside the CAP table is DROPPED by capEffects() without
//       a warning. That is exactly how five legacy perk effect keys shipped
//       doing nothing for months (see CLAUDE.md, the legacy economy block).
//    5. An authored value over its cap is silently clamped, so the option the
//       player reads and the option the save applies are different options.
//    6. A `type` outside NEWS_TYPES falls through to 'system' and the news
//       entry renders a grey badge instead of the one it was written for.
//    7. An apply() that mutates the career it was handed, or writes the store
//       directly, half-applies an outcome the UI can still cancel. The file
//       header promises apply() is pure and nothing has ever checked it.
//
//  It also owns the LANGUAGE table, because a region missing from
//  REGION_LANGUAGE makes languageForRegion() return null, null is read
//  everywhere as "no language required", and that region silently becomes free
//  to sign for from anywhere on the circuit.
//
//      node tools/lifeCheck.mjs
//      node tools/lifeCheck.mjs --list          (prints the pools)
//      node tools/lifeCheck.mjs --seed 4242     (apply() branches on chance())
//
//  Errors fail the build. Warnings print and do not.
//
//  ASCII only. This repo has been corrupted by encoding round-trips before.
// ===========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

function argOf(name, dflt) {
    const i = process.argv.indexOf('--' + name);
    if (i < 0 || i + 1 >= process.argv.length) return dflt;
    const n = Number(process.argv[i + 1]);
    return Number.isFinite(n) ? n : dflt;
}
const SEED = Math.round(argOf('seed', 4242));

// ---------------------------------------------------------------------------
//  SEEDED RNG
//  Half the apply() bodies in the pool branch on chance(), so an unseeded run
//  would exercise a different arm of a different option every time and a cap
//  violation behind a coin flip would be a flake rather than a failure.
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
Math.random = mulberry32(SEED);

// ---------------------------------------------------------------------------
//  BROWSER SHIM -- must exist before any career module is imported
//  (lifted from tools/careerSmoke.mjs so the harnesses agree). events.js pulls
//  in stores/career.js, which pulls in teams.js and utils/storage.js, so a bare
//  node import touches localStorage and the card database before this file gets
//  a chance to assert anything.
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

function makeElement(tag) {
    return {
        tagName: String(tag || 'div').toUpperCase(),
        style: {}, dataset: {}, children: [],
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        getContext() { return null; },
        click() {}, focus() {}, blur() {}, remove() {},
    };
}

const storage = new MemStorage();
const win = {};
win.localStorage = storage;
win.sessionStorage = new MemStorage();
win.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
win.scrollTo = () => {};
win.addEventListener = () => {};
win.removeEventListener = () => {};
win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
win.cancelAnimationFrame = (id) => clearTimeout(id);
win.navigator = { userAgent: 'lifeCheck', language: 'en' };
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
globalThis.requestAnimationFrame = win.requestAnimationFrame;
globalThis.cancelAnimationFrame = win.cancelAnimationFrame;

// The real card database. teams.js has a synthetic roster fallback that would
// silently mask the real code path, exactly as careerSmoke says.
const DB_PATH = path.join(ROOT, 'public', 'database.js');
if (!fs.existsSync(DB_PATH)) {
    console.error('FATAL: public/database.js not found at ' + DB_PATH);
    process.exit(2);
}
try {
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'localStorage', fs.readFileSync(DB_PATH, 'utf8'))(win, doc, storage);
} catch (e) {
    console.error('FATAL: could not evaluate public/database.js -- ' + e.message);
    process.exit(2);
}
if (!Array.isArray(win.playerDatabase) || win.playerDatabase.length < 1000) {
    console.error('FATAL: window.playerDatabase is empty or tiny. Refusing to run.');
    process.exit(2);
}

// ---------------------------------------------------------------------------
//  THE MODE
// ---------------------------------------------------------------------------
const load = (rel) => import(pathToFileURL(path.join(ROOT, 'src', rel)).href);
const K = await load('lib/career/constants.js');
const EV = await load('lib/career/events.js');
const ST = await load('lib/stores/career.js');

const EV_PATH = path.join(ROOT, 'src', 'lib', 'career', 'events.js');
const K_PATH = path.join(ROOT, 'src', 'lib', 'career', 'constants.js');
const evSrc = fs.readFileSync(EV_PATH, 'utf8');
const kSrc = fs.readFileSync(K_PATH, 'utf8');

// ---------------------------------------------------------------------------
//  LEDGER
// ---------------------------------------------------------------------------
let errors = 0, warns = 0;
function err(msg) { errors++; console.log('  ERROR  ' + msg); }
function warn(msg) { warns++; console.log('  warn   ' + msg); }

/** Print a list of findings, capped so one broken rule cannot bury the rest.
 *  Every finding is still counted -- only the printing is trimmed. */
function report(list, sink = err, cap = 24) {
    list.slice(0, cap).forEach(sink);
    if (list.length > cap) {
        list.slice(cap).forEach(() => { if (sink === err) errors++; else warns++; });
        console.log('         ... and ' + (list.length - cap) + ' more of the same rule (run with --list for the pools)');
    }
}

// ---------------------------------------------------------------------------
//  DEEP CLONE / DEEP COMPARE
//  Written out rather than leaning on JSON, because JSON.stringify drops an
//  `undefined` and flattens NaN to null -- both of which are mutations a pure
//  apply() must not make, and both of which a JSON round trip would hide.
// ---------------------------------------------------------------------------
function deepClone(v) {
    if (Array.isArray(v)) return v.map(deepClone);
    if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
        return out;
    }
    return v;
}

function deepDiff(a, b, trailIn) {
    const trail = trailIn || '';
    if (a === b) return '';
    if (typeof a === 'number' && typeof b === 'number'
        && Number.isNaN(a) && Number.isNaN(b)) return '';
    const aObj = a && typeof a === 'object';
    const bObj = b && typeof b === 'object';
    if (!aObj || !bObj) return trail + ': ' + short(a) + ' -> ' + short(b);
    if (Array.isArray(a) !== Array.isArray(b)) return trail + ': array/object swapped';
    if (Array.isArray(a)) {
        if (a.length !== b.length) return trail + ': length ' + a.length + ' -> ' + b.length;
        for (let i = 0; i < a.length; i++) {
            const d = deepDiff(a[i], b[i], trail + '[' + i + ']');
            if (d) return d;
        }
        return '';
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if (!(k in a)) return trail + '.' + k + ': key added';
        if (!(k in b)) return trail + '.' + k + ': key removed';
        const d = deepDiff(a[k], b[k], trail + '.' + k);
        if (d) return d;
    }
    return '';
}

function short(v) {
    if (typeof v === 'string') return JSON.stringify(v.length > 24 ? v.slice(0, 24) + '..' : v);
    if (v && typeof v === 'object') return Array.isArray(v) ? '[array]' : '{object}';
    return String(v);
}

/** The career store, read without importing svelte's get(). apply() is not
 *  supposed to touch it at all -- that is what applyEventOption() is for -- so
 *  a change here is a half-applied outcome the UI can still cancel out of. */
function storeSnapshot() {
    let v = null;
    const un = ST.career.subscribe(x => { v = x; });
    un();
    return deepClone(v);
}

// ---------------------------------------------------------------------------
//  SOURCE-PARSED TABLES
//  The caps are read out of events.js rather than restated here, for the same
//  reason eventCheck parses QUEUE_PLAN out of match.js: a calibration that
//  quotes numbers the file no longer has is worse than none.
// ---------------------------------------------------------------------------
function literalFrom(src, decl, openCh, closeCh, label) {
    const start = src.indexOf(decl);
    if (start < 0) throw new Error('lifeCheck: could not find `' + label + '` in events.js');
    const open = src.indexOf(openCh, start);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === openCh) depth++;
        else if (ch === closeCh) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('lifeCheck: `' + label + '` is not a closed literal');
    // eslint-disable-next-line no-new-func
    return new Function('return ' + src.slice(open, end + 1) + ';')();
}

const CAP = literalFrom(evSrc, 'const CAP = {', '{', '}', 'CAP');
const METERS = literalFrom(evSrc, 'const METERS = [', '[', ']', 'METERS');

/** The body of capEffects(), so the key set below can be checked against the
 *  function that actually does the dropping instead of against a memory of it. */
const CAP_BODY = (() => {
    const start = evSrc.indexOf('function capEffects(');
    if (start < 0) throw new Error('lifeCheck: capEffects() not found in events.js');
    const open = evSrc.indexOf('{', evSrc.indexOf(')', start));
    let depth = 0;
    for (let i = open; i < evSrc.length; i++) {
        if (evSrc[i] === '{') depth++;
        else if (evSrc[i] === '}') { depth--; if (depth === 0) return evSrc.slice(open, i + 1); }
    }
    throw new Error('lifeCheck: capEffects() is not a closed function');
})();

/** Every key capEffects() will carry through to applyEffects(). Anything else
 *  in an authored `effects` object is dropped in silence. */
const EFFECT_KEYS = [
    ...METERS, 'chemistry', 'gold', 'followers', 'hype', 'legacy', 'mmr',
    'attr', 'language', 'statusChange', 'flag', 'unflag',
];

/** Per-key ceiling, mirroring capEffects() exactly -- including `hype` riding
 *  on CAP.followers, which is deliberate there: hype and followers move on the
 *  same scale and grantFollowers() moves them in lockstep. */
const EFFECT_LIMIT = {
    chemistry: CAP.meter, gold: CAP.gold, followers: CAP.followers,
    hype: CAP.followers, legacy: CAP.legacy, mmr: CAP.mmr,
};
for (const m of METERS) EFFECT_LIMIT[m] = (m === 'energy' ? CAP.energy : CAP.meter);

// ---------------------------------------------------------------------------
//  SECTION MAP
//  Which `// ---- SECTION ----` block each event was authored in. Used by the
//  weight report: a batch of new entries dropped into one section shifts what
//  that section is worth against every other, and nothing else measures it.
//
//  Anchored on the FIRST `id: '<the id>'` in the file. Event ids are asserted
//  unique below, and an entry is always declared before its own options, so the
//  first hit is the entry even if an option happens to share the string.
// ---------------------------------------------------------------------------
const SECTION_RE = /^\s*\/\/\s*-{3,}\s*([^-\s][^-]*?)\s*-{3,}\s*$/;
const RULE_RE = /^\s*\/\/\s*-{5,}\s*$/;
const BANNER_RE = /^\s*\/\/\s{2}([A-Z][A-Z0-9 ,&'/-]{3,})\s*$/;
const evLines = evSrc.split('\n');
const SECTION_MARKS = [];
evLines.forEach((l, i) => {
    const m = l.match(SECTION_RE);
    if (m) { SECTION_MARKS.push({ line: i, name: m[1].trim() }); return; }
    // The pool-level banners ("PRE-GAME POOL", "FIRST TIME AT A TOURNAMENT")
    // are a full dash rule followed by an all-caps line rather than an inline
    // `// ---- NAME ----`, so without this every pre-game entry inherits the
    // LAST section of EVENT_POOL and the share report reads 100% "THE BEDROOM
    // YEARS" for a pool that has nothing to do with it.
    const b = l.match(BANNER_RE);
    if (b && i > 0 && RULE_RE.test(evLines[i - 1])) SECTION_MARKS.push({ line: i, name: b[1].trim() });
});
const LINE_AT = (() => {
    const offs = [];
    let n = 0;
    for (const l of evLines) { offs.push(n); n += l.length + 1; }
    return (charIdx) => {
        let lo = 0, hi = offs.length - 1, best = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (offs[mid] <= charIdx) { best = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return best;
    };
})();
function sectionOf(id) {
    const at = evSrc.indexOf("id: '" + id + "'");
    if (at < 0) return '(not found in source)';
    const line = LINE_AT(at);
    let name = '(top of file)';
    for (const m of SECTION_MARKS) { if (m.line < line) name = m.name; else break; }
    return name;
}

// ---------------------------------------------------------------------------
//  SYNTHETIC CAREERS
//  Built off the real blankCareer() rather than hand-written stubs, so every
//  block an apply() or a `when` can dereference is the shape the store actually
//  writes. Each one exists to unlock a different family of gates -- an unsigned
//  gate, a big-stage gate, a language gate, an offseason gate -- because an
//  event whose gate passes for none of them is reported as possibly unreachable
//  and a thin career list would make that warning meaningless.
// ---------------------------------------------------------------------------

/** A week the calendar really puts this phase in. Hard-coding one would drift
 *  the day PHASES moves, and First Stand moved every phase once already. */
function weekOfPhase(phaseId, dflt) {
    for (let w = 1; w <= K.WEEKS_PER_YEAR; w++) {
        try { if (K.phaseForWeek(w).id === phaseId) return w; } catch (_) { /* keep looking */ }
    }
    return dflt;
}
const W_SPRING = weekOfPhase('spring', 8);
const W_SUMMER = weekOfPhase('summer', 24);
const W_SPRING_PO = weekOfPhase('spring_po', 15);
const W_WORLDS = weekOfPhase('worlds', 37);
const W_OFFSEASON = weekOfPhase('offseason', 39);

const MID_CHAMP = (K.championsForRole('MID')[0] || {}).id || '';
const MID_STYLE = ((K.PLAYSTYLES.MID || [])[0] || {}).id || '';

function careerBase(week) {
    const c = ST.blankCareer();
    c.created = true;
    c.time = { year: 2029, week };
    c.player.handle = 'Probe';
    c.player.playstyle = MID_STYLE;
    c.player.champion = MID_CHAMP;
    c.money = { gold: 5000, followers: 20000, legacy: 400 };
    return c;
}

function contractFor(teamId, region, tier, salary, endYear, releaseClause) {
    return {
        teamId, region, tier, salary, years: 2,
        startYear: 2028, endYear, status: 'starter', bonus: 0,
        releaseClause: releaseClause || 0,
    };
}

function playedRows(n, wonFn, phase) {
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({
            id: 'f' + i, week: i + 1, phase: phase || 'spring',
            opponentId: 'lec_fnc', home: i % 2 === 0, played: true,
            won: wonFn(i), score: wonFn(i) ? [2, 1] : [0, 2], myRating: 6.8,
        });
    }
    return rows;
}

const CAREERS = [];
function addCareer(name, c, opts) {
    CAREERS.push({ name, c, ...(opts || {}) });
}

// 1. The thirteen-year-old. Unsigned, no contract, no history, one language.
//    This is the career that catches an event whose copy assumes a club.
{
    const c = careerBase(W_SPRING);
    c.player.age = 13; c.player.startAge = 13; c.player.path = 'precomp';
    c.player.region = 'LEC';
    c.player.languages = { en: K.LANGUAGE_MAX };
    c.money = { gold: 250, followers: 0, legacy: 0 };
    c.soloq = { mmr: 900, peakMMR: 900, games: 40, wins: 21, losses: 19 };
    addCareer('unsigned-13yo', c);
}

// 2. Academy debut. Signed, tier 2, mid-split, a short played record.
{
    const c = careerBase(W_SPRING);
    c.player.age = 16; c.player.startAge = 16; c.player.path = 'debut';
    c.player.region = 'LEC';
    c.player.clubId = 'lec_g2'; c.player.clubTier = 2; c.player.status = 'sub';
    c.player.contract = contractFor('lec_g2', 'LEC', 2, 900, 2031);
    c.player.languages = { en: K.LANGUAGE_MAX };
    c.season.clubId = 'lec_g2'; c.season.clubTier = 2;
    c.season.schedule = playedRows(6, i => i % 2 === 0);
    c.totals = { ...c.totals, games: 12, wins: 6, losses: 6, kills: 40, deaths: 30, assists: 70, ratingSum: 80 };
    addCareer('academy-16-signed', c);
}

// 3. Tier-1 starter in form. High morale and form, so an event gated on a
//    player who is going well is reachable at all.
{
    const c = careerBase(W_SUMMER);
    c.player.age = 21; c.player.startAge = 13; c.player.path = 'precomp';
    c.player.region = 'LEC';
    c.player.clubId = 'lec_g2'; c.player.clubTier = 1; c.player.status = 'starter';
    // The release clause is set deliberately: an event gated on one existing is
    // otherwise unreachable, and contractFor() defaults it to 0.
    c.player.contract = contractFor('lec_g2', 'LEC', 1, 5200, 2031, 26000);
    c.player.form = 78; c.player.morale = 84; c.player.energy = 90; c.player.health = 92;
    c.player.hype = 40000; c.player.chemistry = 72;
    c.player.languages = { en: K.LANGUAGE_MAX, ko: 12 };
    c.player.attrs = Object.fromEntries(K.ATTR_KEYS.map(k => [k, 78]));
    c.player.potential = Object.fromEntries(K.ATTR_KEYS.map(k => [k, 90]));
    c.season.clubId = 'lec_g2'; c.season.clubTier = 1; c.season.split = 'summer';
    c.season.schedule = playedRows(14, i => i % 3 !== 0, 'summer');
    c.season.standings = { lec_g2: { w: 10, l: 4 }, lec_fnc: { w: 8, l: 6 } };
    c.history = [{ year: 2028, split: 'spring', teamId: 'lec_g2', teamName: 'G2 Esports', w: 12, l: 6, placement: 3, awards: [] }];
    c.totals = { ...c.totals, games: 240, wins: 140, losses: 100, kills: 900, deaths: 500, assists: 1400, mvps: 22, pentakills: 2, ratingSum: 1700 };
    c.soloq = { mmr: 2600, peakMMR: 2700, games: 900, wins: 480, losses: 420 };
    c.flags.everSigned = true;
    addCareer('tier1-starter-21', c);
}

// 4. The same seat in a bad month, in a live playoff bracket. Low form, low
//    morale, a real losing streak and onBigStage() true -- three gate families
//    that nothing else in this list satisfies.
{
    const c = careerBase(W_SPRING_PO);
    c.player.age = 23; c.player.startAge = 16; c.player.path = 'debut';
    c.player.region = 'LCS';
    c.player.clubId = 'lcs_c9'; c.player.clubTier = 1; c.player.status = 'starter';
    c.player.contract = contractFor('lcs_c9', 'LCS', 1, 4100, 2030);
    c.player.form = 28; c.player.morale = 33; c.player.energy = 24; c.player.health = 55;
    c.player.chemistry = 34; c.player.hype = 9000;
    c.player.languages = { en: K.LANGUAGE_MAX };
    c.season.clubId = 'lcs_c9'; c.season.clubTier = 1;
    c.season.schedule = [
        ...playedRows(9, i => i < 4),
        { id: 'po0', week: W_SPRING_PO, phase: 'spring_po', opponentId: 'lcs_tl', home: true, played: false, won: null, score: null, myRating: 0 },
    ];
    c.season.bracket = {
        kind: 'spring_po', year: 2029, title: 'Spring Playoffs', bestOf: 5,
        window: { from: W_SPRING_PO, to: W_SPRING_PO + 2 }, totalRounds: 2,
        rounds: [{ name: 'Semifinals', week: W_SPRING_PO, ties: [
            { id: 'po_t0', a: { id: 'lcs_c9', name: 'Cloud9', accent: '#00a1e1', seed: 3 }, b: { id: 'lcs_tl', name: 'Team Liquid', accent: '#0a1723', seed: 2 }, score: [0, 0], winner: null, bestOf: 5 },
        ] }],
        byes: [], champion: null, runnerUp: null, myPlacement: null, done: false,
    };
    c.totals = { ...c.totals, games: 300, wins: 150, losses: 150, kills: 1000, deaths: 900, assists: 1500, ratingSum: 1950 };
    c.flags.everSigned = true;
    c.flags.burnout = { weeks: 3, strikes: 1, benchedUntil: 0, peak: 5 };
    // Narrative flags are written by earlier events and read by later ones, so
    // a career carrying none makes every follow-up event look unreachable.
    c.flags.reputationRisk = true;
    addCareer('tier1-slump-in-playoffs', c);
}

// 5. A veteran abroad, at Worlds. player.region is LEC and the contract region
//    is LCK, which is the ONLY shape that makes abroad() true -- every language
//    and homesickness gate in the pool hangs off it.
{
    const c = careerBase(W_WORLDS);
    c.player.age = 28; c.player.startAge = 16; c.player.path = 'debut';
    c.player.region = 'LEC';
    c.player.clubId = 'lck_t1'; c.player.clubTier = 1; c.player.status = 'star';
    c.player.contract = contractFor('lck_t1', 'LCK', 1, 9000, 2030);
    c.player.languages = { en: K.LANGUAGE_MAX, ko: 52, zh: 6 };
    c.player.studyLang = 'ko';
    c.player.hype = 400000; c.player.chemistry = 60;
    c.season.clubId = 'lck_t1'; c.season.clubTier = 1; c.season.split = 'summer';
    c.season.schedule = [
        ...playedRows(16, i => i % 4 !== 0, 'summer'),
        { id: 'wc0', week: W_WORLDS, phase: 'worlds', opponentId: 'lpl_blg', home: false, played: false, won: null, score: null, myRating: 0 },
    ];
    c.season.bracket = {
        kind: 'worlds', year: 2029, title: 'World Championship', bestOf: 5,
        window: { from: W_WORLDS, to: W_WORLDS + 2 }, totalRounds: 3,
        rounds: [{ name: 'Quarterfinals', week: W_WORLDS, ties: [
            { id: 'wc_t0', a: { id: 'lck_t1', name: 'T1', accent: '#e2012d', seed: 1 }, b: { id: 'lpl_blg', name: 'Bilibili Gaming', accent: '#1f8fff', seed: 8 }, score: [0, 0], winner: null, bestOf: 5 },
        ] }],
        byes: [], champion: null, runnerUp: null, myPlacement: null, done: false,
    };
    c.awards = [{ id: 'msi_champ', name: 'MSI Champion', tier: 'legendary', year: 2028, split: 'spring', legacyPoints: 300 }];
    c.history = [
        { year: 2027, split: 'summer', teamId: 'lec_g2', teamName: 'G2 Esports', w: 14, l: 4, placement: 1, awards: [] },
        { year: 2028, split: 'spring', teamId: 'lck_t1', teamName: 'T1', w: 13, l: 5, placement: 2, awards: [{ id: 'msi_champ' }] },
    ];
    c.totals = { ...c.totals, games: 900, wins: 540, losses: 360, kills: 3200, deaths: 1800, assists: 5000, mvps: 90, pentakills: 6, ratingSum: 6600 };
    c.money = { gold: 400000, followers: 900000, legacy: 4200 };
    c.flags.everSigned = true;
    addCareer('veteran-abroad-worlds', c);
}

// 6. Out of contract in the offseason, and abroad while it happens. offSeason()
//    and contractExpiring() are both true here and nowhere else in this list,
//    and abroad() + offSeason() together is what the homesickness material
//    hangs off - a Brazilian in the LCS is the shape that satisfies all three.
{
    const c = careerBase(W_OFFSEASON);
    c.player.age = 25; c.player.startAge = 13; c.player.path = 'precomp';
    c.player.region = 'CBLOL';
    c.player.clubId = 'lcs_c9'; c.player.clubTier = 1; c.player.status = 'starter';
    c.player.contract = contractFor('lcs_c9', 'LCS', 1, 2200, 2029);
    c.player.languages = { pt: K.LANGUAGE_MAX, en: 34 };
    c.season.clubId = 'lcs_c9'; c.season.clubTier = 1; c.season.split = 'summer';
    c.season.schedule = playedRows(18, i => i % 2 === 1, 'summer');
    c.totals = { ...c.totals, games: 400, wins: 205, losses: 195, ratingSum: 2700 };
    c.flags.everSigned = true;
    addCareer('expiring-offseason', c);
}

// 7. Retired. rollWeeklyEvent refuses this one outright, but a `when` is still
//    handed it by anything that forgets to check, and an apply() must survive
//    being called on a career that has stopped.
{
    const c = careerBase(1);
    c.player.age = 32; c.player.startAge = 16;
    c.player.clubId = null; c.player.contract = null;
    c.player.languages = { en: K.LANGUAGE_MAX, ko: 71 };
    c.flags.retired = true;
    c.flags.everSigned = true;
    c.totals = { ...c.totals, games: 1100, wins: 620, losses: 480, ratingSum: 7700 };
    addCareer('retired-32', c);
}

// 8. The unsigned prospect who has climbed. High solo queue MMR while still
//    not on a roster is what makes a club notice you, and being fifteen in a
//    tournament week is what makes the bedroom-years material land. Nothing
//    else in this list is unsigned AND rated AND in a big-stage week, and each
//    of those three gates a real event on its own.
{
    const c = careerBase(W_WORLDS);
    c.player.age = 15; c.player.startAge = 13; c.player.path = 'precomp';
    c.player.region = 'LCK';
    c.player.languages = { ko: K.LANGUAGE_MAX };
    c.player.form = 62; c.player.morale = 58; c.player.hype = 2500;
    c.soloq = { mmr: 1900, peakMMR: 1950, games: 1400, wins: 760, losses: 640 };
    c.money = { gold: 900, followers: 3000, legacy: 0 };
    addCareer('unsigned-prospect-15', c);
}

// 9. Rotten VALUES. Every block is present because hydrate() rebuilds the
//    blocks on load, and every value inside one is hostile because hydrate()
//    does not look inside news / offers / history / season.bracket at all. This
//    is the shape a real damaged save arrives in.
{
    const c = careerBase(11);
    c.player.age = 'seventeen';
    c.player.region = 'ATLANTIS';
    c.player.role = 'NOT_A_ROLE';
    c.player.champion = 'no_such_champ';
    c.player.playstyle = 'ghost';
    c.player.attrs = Object.fromEntries(K.ATTR_KEYS.map(k => [k, 'sixty']));
    c.player.potential = null;
    c.player.languages = ['ko', 'en'];
    c.player.studyLang = 'klingon';
    c.player.contract = 'LCK';
    c.player.clubId = 'org_deleted_in_a_patch';
    c.player.form = NaN; c.player.morale = null; c.player.chemistry = undefined;
    c.player.proficiency = [1, 2, 3];
    c.player.traits = null;
    c.money = { gold: NaN, followers: null, legacy: 'lots' };
    c.season.schedule = [null, { id: 'f0' }, { played: true, won: 'maybe' }];
    c.season.standings = null;
    c.season.bracket = {};
    c.history = [null, {}];
    c.awards = [null, 7];
    c.news = [null];
    c.weekly.log = [null];
    c.time = { year: null, week: 'nine' };
    c.flags.eventLog = [null, { id: 5 }];
    c.flags.firstSeen = [1, 2];
    addCareer('rotten-values', c);
}

// 10. Whole blocks missing. hydrate() REBUILDS money / soloq / totals / season
//    from blankCareer(), so this state cannot come off a load -- it is what a
//    caller passing a half-built object looks like. Findings from this career
//    are reported as warnings for exactly that reason, and the required six
//    above all error.
{
    const c = careerBase(20);
    c.player.contract = null;
    c.money = null;
    c.soloq = null;
    c.totals = null;
    c.season = null;
    c.weekly = null;
    c.flags = null;
    c.player.languages = null;
    addCareer('hostile-blocks', c, { softFail: true });
}

const HARD_CAREERS = CAREERS.filter(x => !x.softFail);
function CAREER_BY_NAME(name) {
    const hit = CAREERS.find(x => x.name === name);
    if (!hit) throw new Error('lifeCheck: no synthetic career named "' + name + '"');
    return hit.c;
}

// ---------------------------------------------------------------------------
//  PRE-GAME CONTEXTS
//  engine.js builds ctx from the fixture and defaults every field there, so a
//  gate may read ctx.phase directly. These are the shapes it really produces;
//  the hostile pair below are what a future caller getting it wrong looks like,
//  and they are used for the throws check only -- a gate is not expected to
//  PASS for a ctx with no phase in it.
// ---------------------------------------------------------------------------
const REAL_CTXS = [
    { phase: 'worlds', phaseName: 'Worlds', label: 'Quarterfinal', opponentId: 'lpl_blg', opponentName: 'Bilibili Gaming', bestOf: 5, kind: 'bracket' },
    { phase: 'msi', phaseName: 'Mid-Season Invitational', label: 'Semifinal', opponentId: 'lck_t1', opponentName: 'T1', bestOf: 5, kind: 'bracket' },
    { phase: 'first_stand', phaseName: 'First Stand', label: 'Final', opponentId: 'lcs_c9', opponentName: 'Cloud9', bestOf: 5, kind: 'bracket' },
    { phase: 'spring_po', phaseName: 'Spring Playoffs', label: 'Semifinal', opponentId: 'lec_fnc', opponentName: 'Fnatic', bestOf: 5, kind: 'bracket' },
    { phase: 'summer_po', phaseName: 'Summer Playoffs', label: 'Final', opponentId: 'lec_g2', opponentName: 'G2 Esports', bestOf: 5, kind: 'bracket' },
    { phase: 'summer', phaseName: 'Summer Split', label: 'Week 9', opponentId: 'lec_fnc', opponentName: 'Fnatic', bestOf: 3, kind: 'league' },
];
const HOSTILE_CTXS = [
    {},
    { phase: null, phaseName: null, label: null, opponentId: null, opponentName: null, bestOf: null, kind: null },
    { phase: 'not_a_phase', phaseName: 7, label: [], opponentId: {}, opponentName: 0, bestOf: 'five', kind: 'league' },
];

// ---------------------------------------------------------------------------
//  RULE ENGINES
//  Rules 1 and 5 are written as functions that RETURN findings rather than
//  calling err() directly, because both carry positive/negative controls at the
//  bottom of this file. A lint that matches nothing looks exactly like a clean
//  codebase, which is why boardCheck's lints carry their own controls too.
// ---------------------------------------------------------------------------

/** RULE 1. Ids unique across every pool, and lower_snake_case. */
function findIdProblems(entries) {
    const out = [];
    const seen = new Map();
    for (const { tag, id } of entries) {
        if (typeof id !== 'string' || !id) {
            out.push(tag + ': no id at all - flags.eventLog is keyed by id, so an event with none can never be '
                + 'put on cooldown and would be free to fire every week for ever');
            continue;
        }
        if (!/^[a-z0-9_]+$/.test(id)) {
            out.push(tag + ': id "' + id + '" must match /^[a-z0-9_]+$/ - ids are persisted save data, and a '
                + 'mixed-case or spaced one is a permanent string nobody can safely rename later');
        }
        if (seen.has(id)) {
            out.push(tag + ': duplicate id "' + id + '" (also ' + seen.get(id) + ') - both write the SAME row in '
                + 'flags.eventLog, so the 20-week cooldown leaks: one of the pair can fire twice inside a split '
                + 'while the other is suppressed for a season, with no error either way');
        } else {
            seen.set(id, tag);
        }
    }
    return out;
}

const APPLY_ROLLS = 4;   // apply() branches on chance(); one call only ever
                         // exercises one arm. Four rolls per career across the
                         // nine careers is 36 samples of every option.

/**
 * RULE 5. apply(c) must return an object, must not throw, must not mutate the
 * career it was handed, and must not write the store. The last one is not in
 * the spec's wording but is the same promise: the file header says this module
 * is the only thing that writes, which is what makes a cancelled overlay safe.
 */
function findPurityProblems(tag, applyFn, careers) {
    const out = [];
    if (typeof applyFn !== 'function') {
        out.push(tag + ': apply is not a function - applyEventOption() falls through to an empty outcome, so the '
            + 'option renders, resolves, and does absolutely nothing');
        return out;
    }
    for (const { name, c, softFail } of careers) {
        for (let roll = 0; roll < APPLY_ROLLS; roll++) {
            const arg = deepClone(c);
            const pristine = deepClone(c);
            const storeBefore = storeSnapshot();
            let res = null;
            try {
                res = applyFn(arg);
            } catch (e) {
                out.push({
                    soft: !!softFail,
                    msg: tag + ': apply() threw on career "' + name + '" (' + (e && e.message) + ') - '
                        + 'applyEventOption() swallows this into an empty outcome, so the player picks an option, '
                        + 'reads its promise, and the save takes none of it',
                });
                break;
            }
            if (!res || typeof res !== 'object' || Array.isArray(res)) {
                out.push({
                    soft: !!softFail,
                    msg: tag + ': apply() returned ' + short(res) + ' on career "' + name + '" - the contract is '
                        + '{ text, effects }, and anything else resolves to the option label and no effects at all',
                });
                break;
            }
            const diff = deepDiff(pristine, arg, 'career');
            if (diff) {
                out.push({
                    soft: !!softFail,
                    msg: tag + ': apply() MUTATED the career it was handed on "' + name + '" (' + diff + ') - the pool '
                        + 'contract is that apply() is pure and this module is the only writer, so a mutation here '
                        + 'lands even when the player cancels and is never reported in the applied diff',
                });
                break;
            }
            const storeDiff = deepDiff(storeBefore, storeSnapshot(), 'store');
            if (storeDiff) {
                out.push({
                    soft: !!softFail,
                    msg: tag + ': apply() WROTE THE STORE on career "' + name + '" (' + storeDiff + ') - only '
                        + 'applyEffects() may write, so this is a half-applied outcome that survives a cancelled '
                        + 'overlay and never appears in the before/after diff the player is shown',
                });
                break;
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
//  COLLECT THE POOLS
// ---------------------------------------------------------------------------
const FIRST_TIME_KEYS = Object.keys(EV.FIRST_TIME_EVENTS || {});
const POOLS = [
    { name: 'EVENT_POOL', weighted: true, takesCtx: false, entries: (EV.EVENT_POOL || []).map(e => ({ e })) },
    { name: 'PREGAME_POOL', weighted: true, takesCtx: true, entries: (EV.PREGAME_POOL || []).map(e => ({ e })) },
    {
        name: 'FIRST_TIME_EVENTS', weighted: false, takesCtx: false,
        entries: FIRST_TIME_KEYS.map(k => ({ e: EV.FIRST_TIME_EVENTS[k], key: k })),
    },
];
const ALL = [];
for (const p of POOLS) {
    p.entries.forEach((row, i) => {
        const id = row.e && row.e.id;
        ALL.push({
            pool: p.name, weighted: p.weighted, takesCtx: p.takesCtx,
            e: row.e, key: row.key,
            tag: p.name + '/' + (id || ('#' + i)),
        });
    });
}

console.log('');
console.log('=== life event pools ===============================================');
console.log('  seed  : ' + SEED);
for (const p of POOLS) {
    const opts = p.entries.reduce((s, r) => s + ((r.e && Array.isArray(r.e.options)) ? r.e.options.length : 0), 0);
    console.log('  ' + p.name.padEnd(19) + String(p.entries.length).padStart(4) + ' entries, ' + String(opts).padStart(4) + ' options');
}
console.log('  careers: ' + CAREERS.map(x => x.name).join(', '));
console.log('  caps   : ' + Object.keys(CAP).map(k => k + ' ' + CAP[k]).join(', '));

if (LIST) {
    console.log('');
    for (const p of POOLS) {
        console.log('  ---- ' + p.name + ' ----');
        let section = '';
        for (const row of p.entries) {
            const e = row.e || {};
            const s = sectionOf(e.id);
            if (s !== section) { section = s; console.log('    [' + s + ']'); }
            console.log('      ' + String(e.id).padEnd(28) + ' w' + String(e.weight || '-').padStart(3)
                + '  ' + String(e.type).padEnd(9) + ' ' + String(e.title || ''));
        }
    }
}

// ---------------------------------------------------------------------------
//  1. IDS
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 1. ids =========================================================');
report(findIdProblems(ALL.map(r => ({ tag: r.tag, id: r.e && r.e.id }))));
console.log('  ' + ALL.length + ' ids across ' + POOLS.length + ' pools');

// ---------------------------------------------------------------------------
//  2. OPTIONS
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 2. options =====================================================');
// Catches an empty or placeholder label, NOT a short one. The first cut of this
// rule used 6 and immediately failed two labels that have shipped since the pool
// was written -- charity_stream's "Pass" and bootcamp_offer's "Go" -- which are
// the correct words for what those buttons do. A lint that tells you to pad good
// copy to hit a character count is a lint that gets disabled.
const OPT_LABEL_MIN = 2;
const OPT_LABEL_MAX = 96;   // it has to fit the overlay button, same bound eventCheck uses
{
    const bad = [];
    for (const r of ALL) {
        const e = r.e;
        if (!e || typeof e !== 'object') { bad.push(r.tag + ': not an object'); continue; }
        const opts = Array.isArray(e.options) ? e.options : [];
        if (opts.length !== 3) {
            bad.push(r.tag + ': ' + opts.length + ' options - the rule is exactly three. Two renders two buttons, '
                + 'which is a coin flip wearing a decision\'s clothes, and the overlay is undismissable until one '
                + 'is pressed so nothing anywhere reports it');
            continue;
        }
        const ids = new Set();
        for (const o of opts) {
            const ot = r.tag + '.' + (o && o.id ? o.id : '?');
            if (!o || typeof o !== 'object') { bad.push(ot + ': option is not an object'); continue; }
            if (typeof o.id !== 'string' || !o.id) {
                bad.push(ot + ': missing option id - applyEventOption() matches on it and falls back to options[0], '
                    + 'so the player presses the third button and the first one resolves');
            } else if (ids.has(o.id)) {
                bad.push(ot + ': duplicate option id inside the event - applyEventOption() finds the FIRST match, so '
                    + 'the second button silently resolves as the first');
            }
            if (o && o.id) ids.add(o.id);
            const label = typeof o.label === 'string' ? o.label : '';
            if (label.trim().length < OPT_LABEL_MIN) {
                bad.push(ot + ': label "' + label + '" is under ' + OPT_LABEL_MIN + ' chars - the button is the only '
                    + 'thing the player reads before committing');
            } else if (label.length > OPT_LABEL_MAX) {
                bad.push(ot + ': label is ' + label.length + ' chars, over ' + OPT_LABEL_MAX + ' - it has to fit the button');
            }
            if (typeof o.desc !== 'string' || !o.desc.trim()) {
                bad.push(ot + ': empty desc - it is the sub-line under the button and renders as an empty element, '
                    + 'not as a missing one');
            }
            if (typeof o.apply !== 'function') {
                bad.push(ot + ': apply is not callable - the option resolves to no effects and no text');
            }
        }
    }
    report(bad);
}

// ---------------------------------------------------------------------------
//  3. PRESENTATION
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 3. type / icon / title / text ==================================');
const TITLE_MAX = 60;
const TEXT_MIN = 40;
const TEXT_MAX = 400;

/** One glyph. A variation selector rides along with plenty of emoji and a ZWJ
 *  sequence is genuinely one picture, so both are allowed through; anything
 *  else with more than one code point is two icons in a one-icon slot.
 *  Written as escapes rather than as the characters themselves for the same
 *  reason rule 11 exists at all. */
const VS16 = String.fromCharCode(0xFE0F);
const VS15 = String.fromCharCode(0xFE0E);
const ZWJ = String.fromCharCode(0x200D);
function glyphCount(s) {
    const cps = Array.from(String(s)).filter(ch => ch !== VS16 && ch !== VS15);
    if (cps.indexOf(ZWJ) >= 0) return 1;
    return cps.length;
}

/** Resolve a `text` that may be a function, the way resolveText() does inside
 *  events.js. Returns { text, threw } -- a throw there falls back to the title
 *  in complete silence, which is a whole event losing its copy. */
function resolveText(e, c, ctx) {
    const t = e && e.text;
    if (typeof t === 'string') return { text: t, threw: false };
    if (typeof t === 'function') {
        try {
            const s = t(c, ctx);
            return { text: typeof s === 'string' ? s : null, threw: false };
        } catch (_) { return { text: null, threw: true }; }
    }
    return { text: null, threw: false };
}

{
    const bad = [];
    for (const r of ALL) {
        const e = r.e;
        if (!e || typeof e !== 'object') continue;

        if (!K.NEWS_TYPES[e.type]) {
            bad.push(r.tag + ': type "' + e.type + '" is not a NEWS_TYPES key - accentFor() falls through to '
                + '"system", so the news entry ships with a grey Career badge instead of the one it was written for '
                + 'and nothing reports the substitution');
        }
        const g = glyphCount(e.icon);
        if (typeof e.icon !== 'string' || !e.icon) {
            bad.push(r.tag + ': no icon - the overlay renders an empty badge');
        } else if (g !== 1) {
            bad.push(r.tag + ': icon is ' + g + ' glyphs - the badge is sized for one and the rest overflows it');
        } else if (/^[\x00-\x7F]$/.test(e.icon)) {
            bad.push(r.tag + ': icon "' + e.icon + '" is an ASCII character - icons are emoji written as \\u{...} '
                + 'escapes, and a letter in the badge reads as a rendering failure');
        }

        const title = typeof e.title === 'string' ? e.title : '';
        if (!title.trim()) {
            bad.push(r.tag + ': empty title - applyEventOption() writes "<title> - <text>" into the news feed, so '
                + 'the entry starts with a dash');
        } else if (title.length > TITLE_MAX) {
            bad.push(r.tag + ': title is ' + title.length + ' chars, over ' + TITLE_MAX + ' - it is the overlay heading '
                + 'and the news feed line');
        }

        // `text` may be a function in PREGAME_POOL and FIRST_TIME_EVENTS, so it
        // is resolved against every career (and every ctx, where one applies)
        // rather than measured once.
        const ctxs = r.takesCtx ? REAL_CTXS : [null];
        const lens = [];
        let threw = 0, nulls = 0;
        for (const { c } of HARD_CAREERS) {
            for (const ctx of ctxs) {
                const got = resolveText(e, c, ctx);
                if (got.threw) threw++;
                else if (got.text === null) nulls++;
                else lens.push(got.text.length);
            }
        }
        if (threw) {
            bad.push(r.tag + ': text() threw on ' + threw + ' career/ctx combinations - resolveText() catches it and '
                + 'substitutes the TITLE, so the event ships with its heading printed twice and no copy');
        }
        if (nulls) {
            bad.push(r.tag + ': text() returned a non-string on ' + nulls + ' combinations - same silent fallback to '
                + 'the title');
        }
        if (lens.length) {
            const lo = Math.min.apply(null, lens), hi = Math.max.apply(null, lens);
            if (lo < TEXT_MIN) {
                bad.push(r.tag + ': text resolves to ' + lo + ' chars, under ' + TEXT_MIN + ' - an event with no scene '
                    + 'is three buttons with nothing to decide between');
            }
            if (hi > TEXT_MAX) {
                bad.push(r.tag + ': text resolves to ' + hi + ' chars, over ' + TEXT_MAX + ' - the overlay scrolls and '
                    + 'the options go below the fold');
            }
        }
    }
    report(bad);
}

// ---------------------------------------------------------------------------
//  4. WEIGHTS
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 4. weights =====================================================');
const WEIGHT_MIN = 6, WEIGHT_MAX = 14;
{
    const bad = [];
    for (const r of ALL) {
        if (!r.weighted) continue;   // FIRST_TIME_EVENTS are guaranteed, never rolled
        const w = r.e && r.e.weight;
        if (!Number.isFinite(w) || !Number.isInteger(w)) {
            bad.push(r.tag + ': weight ' + w + ' is not an integer - weightedPick() falls back to 1 for a missing '
                + 'one, so the entry becomes a twelfth as likely as its neighbours without saying so');
        } else if (w < WEIGHT_MIN || w > WEIGHT_MAX) {
            bad.push(r.tag + ': weight ' + w + ' is outside the ' + WEIGHT_MIN + '-' + WEIGHT_MAX + ' band the pool '
                + 'uses - one entry outside it silently re-prices every other entry in its pool');
        }
    }
    report(bad);
    for (const r of ALL) {
        if (r.weighted) continue;
        if (r.e && r.e.weight !== undefined) {
            warn(r.tag + ': carries a weight, but FIRST_TIME_EVENTS is never rolled - the number does nothing and '
                + 'reads as though it does');
        }
    }
}

// ---------------------------------------------------------------------------
//  5. PURITY
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 5. apply() purity ==============================================');
{
    const hard = [], soft = [];
    let calls = 0;
    for (const r of ALL) {
        const opts = (r.e && Array.isArray(r.e.options)) ? r.e.options : [];
        for (const o of opts) {
            const tag = r.tag + '.' + (o && o.id ? o.id : '?');
            for (const f of findPurityProblems(tag, o && o.apply, CAREERS)) {
                if (typeof f === 'string') hard.push(f);
                else if (f.soft) soft.push(f.msg);
                else hard.push(f.msg);
            }
            calls += CAREERS.length * APPLY_ROLLS;
        }
    }
    console.log('  ' + calls + ' apply() calls across ' + CAREERS.length + ' careers x ' + APPLY_ROLLS + ' rolls');
    report(hard);
    if (soft.length) {
        console.log('  (the "hostile-blocks" career has money / soloq / totals / season / flags set to null. '
            + 'hydrate() rebuilds all five from blankCareer(), so no LOADED save can be this shape - these are '
            + 'reported as warnings rather than errors for that reason alone.)');
        report(soft, warn);
    }
}

// ---------------------------------------------------------------------------
//  6. EFFECT CAPS AND UNKNOWN KEYS
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 6. effects vs the CAP table ====================================');
{
    // Both directions, the boardCheck idiom: every key this file knows about
    // must be one capEffects() actually reads, and every key capEffects() reads
    // must be one this file knows about. A key added there and not here would
    // widen the pool's licence with nothing saying so.
    const readsInCap = new Set();
    let m;
    const re = /\be\.([a-zA-Z_$][\w$]*)/g;
    while ((m = re.exec(CAP_BODY))) readsInCap.add(m[1]);
    for (const k of EFFECT_KEYS) {
        if (METERS.includes(k)) continue;   // reached through the METERS loop, not as e.<key>
        if (!readsInCap.has(k)) {
            err('lifeCheck knows an effect key "' + k + '" that capEffects() never reads - this file has drifted '
                + 'from events.js and is validating a contract that no longer exists');
        }
    }
    for (const k of readsInCap) {
        if (!EFFECT_KEYS.includes(k)) {
            err('capEffects() reads an effect key "' + k + '" that lifeCheck does not know about - add it to '
                + 'EFFECT_KEYS and EFFECT_LIMIT, or authored values for it ship unchecked');
        }
    }

    // Which careers each entry's own gate ADMITS. apply() is only ever reached
    // for a career the gate let through, so measuring an option against one it
    // would have rejected invents violations that cannot happen: the language
    // options build their effect key from workLang(c), which is legitimately ''
    // on an unsigned career -- and `abroad(c) && workLangLevel(c) < FLUENT` is
    // exactly the gate that guarantees it never is. An entry whose gate admits
    // nobody is skipped here and reported by rule 7 instead, which is the
    // actionable finding for that case.
    function admittedCareers(r) {
        const gate = r.e && r.e.when;
        if (typeof gate !== 'function') return HARD_CAREERS;
        const ctxs = r.takesCtx ? REAL_CTXS : [null];
        const out = [];
        for (const row of HARD_CAREERS) {
            for (const ctx of ctxs) {
                let pass = false;
                try { pass = !!gate(row.c, ctx); } catch (_) { pass = false; }
                if (pass) { out.push(row); break; }
            }
        }
        return out;
    }

    const bad = [];
    const seenKeys = new Map();
    let skipped = 0;
    function checkNumber(tag, key, v, limit) {
        if (!Number.isFinite(v)) {
            bad.push(tag + ': effects.' + key + ' is ' + short(v) + ' - capEffects() drops a non-number, so the '
                + 'option promises a change the save never takes');
            return;
        }
        if (!Number.isInteger(v)) {
            bad.push(tag + ': effects.' + key + ' is ' + v + ', not an integer - capEffects() rounds it, so the '
                + 'authored number and the applied number are different numbers');
        }
        if (Math.abs(v) > limit) {
            bad.push(tag + ': effects.' + key + ' is ' + v + ', over the CAP of ' + limit + ' - capEffects() clamps '
                + 'it in silence, so the option the player reads and the option the save applies are not the same '
                + 'option');
        }
    }

    for (const r of ALL) {
        const opts = (r.e && Array.isArray(r.e.options)) ? r.e.options : [];
        const admitted = admittedCareers(r);
        if (!admitted.length) { skipped++; continue; }
        for (const o of opts) {
            if (!o || typeof o.apply !== 'function') continue;
            const tag = r.tag + '.' + (o.id || '?');
            for (const { c } of admitted) {
                for (let roll = 0; roll < APPLY_ROLLS; roll++) {
                    let res = null;
                    try { res = o.apply(deepClone(c)); } catch (_) { break; }
                    const fx = res && res.effects;
                    if (fx === undefined || fx === null) continue;
                    if (typeof fx !== 'object' || Array.isArray(fx)) {
                        bad.push(tag + ': effects is ' + short(fx) + ' - capEffects() reads it as {} and the option '
                            + 'does nothing at all');
                        continue;
                    }
                    for (const key of Object.keys(fx)) {
                        seenKeys.set(key, (seenKeys.get(key) || 0) + 1);
                        if (!EFFECT_KEYS.includes(key)) {
                            bad.push(tag + ': unknown effect key "' + key + '" - capEffects() DROPS it without a '
                                + 'warning, which is exactly how five legacy perk effect keys shipped doing nothing');
                            continue;
                        }
                        const v = fx[key];
                        if (key === 'attr') {
                            if (!v || typeof v !== 'object') { bad.push(tag + ': effects.attr is not an object'); continue; }
                            for (const ak of Object.keys(v)) {
                                if (!K.ATTR_KEYS.includes(ak)) {
                                    bad.push(tag + ': effects.attr."' + ak + '" is not an ATTR_KEYS entry - it is '
                                        + 'dropped silently and the attribute the copy names never moves');
                                } else {
                                    checkNumber(tag, 'attr.' + ak, Number(v[ak]), CAP.attr);
                                }
                            }
                        } else if (key === 'language') {
                            if (!v || typeof v !== 'object') { bad.push(tag + ': effects.language is not an object'); continue; }
                            for (const lk of Object.keys(v)) {
                                if (!K.LANGUAGE_IDS.includes(lk)) {
                                    bad.push(tag + ': effects.language."' + lk + '" is not a LANGUAGE_IDS entry - it '
                                        + 'is dropped silently, so the lesson the copy describes is never banked');
                                } else {
                                    checkNumber(tag, 'language.' + lk, Number(v[lk]), CAP.language);
                                }
                            }
                        } else if (key === 'statusChange') {
                            if (!K.SQUAD_STATUS[v]) {
                                bad.push(tag + ': statusChange "' + v + '" is not a SQUAD_STATUS key - dropped, so '
                                    + 'the promotion or benching the copy announces never happens');
                            }
                        } else if (key === 'flag' || key === 'unflag') {
                            if (typeof v !== 'string' || !v) {
                                bad.push(tag + ': ' + key + ' must be a non-empty string');
                            }
                        } else {
                            checkNumber(tag, key, Number(v), EFFECT_LIMIT[key]);
                        }
                    }
                }
            }
        }
    }
    report(bad);
    const used = [...seenKeys.keys()].filter(k => EFFECT_KEYS.includes(k)).sort();
    console.log('  effect keys in use: ' + used.join(', '));
    if (skipped) {
        console.log('  ' + skipped + ' entr' + (skipped === 1 ? 'y' : 'ies') + ' not cap-checked: their own when() '
            + 'admitted none of the synthetic careers, so there is no state their apply() is reachable in. '
            + 'Rule 7 lists them.');
    }
    for (const k of EFFECT_KEYS) {
        if (!seenKeys.has(k)) {
            warn('no option in any pool ever pays "' + k + '" - capEffects() and applyEffects() both handle it, so '
                + 'this is a wired effect with no content behind it');
        }
    }
}

// ---------------------------------------------------------------------------
//  7. GATES
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 7. when() gates ================================================');
{
    const bad = [], unreachable = [];
    for (const r of ALL) {
        const e = r.e;
        if (!e || typeof e !== 'object') continue;

        if (r.pool === 'PREGAME_POOL' && typeof e.when !== 'function') {
            bad.push(r.tag + ': no when() at all - a pre-game entry with no gate can fire before a Bo1 league game '
                + 'in a studio and before a Worlds quarterfinal, which is the one thing this pool exists to tell '
                + 'apart');
            continue;
        }
        if (typeof e.when !== 'function') continue;   // FIRST_TIME_EVENTS have none by design

        const ctxs = r.takesCtx ? [...REAL_CTXS, ...HOSTILE_CTXS] : [null];
        let passes = 0, threw = 0;
        for (const { c } of CAREERS) {
            for (const ctx of ctxs) {
                try {
                    if (e.when(c, ctx)) {
                        // Only a well-formed ctx counts towards reachability: a
                        // gate is not supposed to pass for a ctx with no phase.
                        if (!r.takesCtx || REAL_CTXS.includes(ctx)) passes++;
                    }
                } catch (err2) {
                    threw++;
                    if (threw === 1) {
                        bad.push(r.tag + ': when() threw (' + (err2 && err2.message) + ') - eligibleEvents() and '
                            + 'rollPreGameEvent() both catch it and return false, so the event is silently excluded '
                            + 'from every roll for the rest of the save');
                    }
                }
            }
        }
        if (!passes) {
            unreachable.push(r.tag + ': when() passed for NONE of ' + CAREERS.length + ' synthetic careers'
                + (r.takesCtx ? ' x ' + REAL_CTXS.length + ' contexts' : '')
                + ' - it may be unreachable, and an unreachable event is content nobody will ever see with nothing '
                + 'anywhere reporting it. Check the gate against the copy, or widen the career list in lifeCheck');
        }
    }
    report(bad);
    report(unreachable, warn);
    console.log('  ' + ALL.filter(r => typeof (r.e && r.e.when) === 'function').length + ' of ' + ALL.length
        + ' entries carry a gate');
}

// ---------------------------------------------------------------------------
//  8. WEIGHT DISTRIBUTION
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 8. weight distribution =========================================');
const DOMINANT_SHARE = 0.05;   // no single event may be more than a twentieth
                               // of its pool: at 0.32 a week that is already
                               // once every 60 weeks, i.e. twice a career
{
    for (const p of POOLS) {
        if (!p.weighted) continue;
        const rows = p.entries.map(r => r.e).filter(Boolean);
        const total = rows.reduce((s, e) => s + (Number(e.weight) || 0), 0);
        console.log('  ' + p.name + ': total weight ' + total + ' across ' + rows.length
            + ' entries (an even share would be ' + (100 / Math.max(1, rows.length)).toFixed(1) + '%)');

        const bySection = new Map();
        for (const e of rows) {
            const s = sectionOf(e.id);
            bySection.set(s, (bySection.get(s) || 0) + (Number(e.weight) || 0));
        }
        for (const [s, w] of [...bySection.entries()].sort((a, b) => b[1] - a[1])) {
            console.log('      ' + String((w / Math.max(1, total) * 100).toFixed(1) + '%').padStart(7) + '  '
                + String(w).padStart(4) + '  ' + s);
        }

        const hot = rows.filter(e => (Number(e.weight) || 0) / Math.max(1, total) > DOMINANT_SHARE)
            .sort((a, b) => (b.weight || 0) - (a.weight || 0));
        if (hot.length) {
            warn(p.name + ': ' + hot.length + ' entr' + (hot.length === 1 ? 'y is' : 'ies are') + ' over '
                + (DOMINANT_SHARE * 100) + '% of the pool weight ('
                + hot.slice(0, 4).map(e => e.id + ' ' + (e.weight / total * 100).toFixed(1) + '%').join(', ')
                + ') - a dominant entry repeats inside its own 20-week cooldown window and reads as the only thing '
                + 'that ever happens. In a pool this small that is structural rather than a mistake: an even share '
                + 'is already ' + (100 / Math.max(1, rows.length)).toFixed(1) + '%');
        }
    }
}

// ---------------------------------------------------------------------------
//  9. FIRST_TIME_EVENTS KEYS
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 9. first-time tournament events ================================');
const EXPECTED_FIRST_TIME = ['spring_po', 'summer_po', 'first_stand', 'msi', 'worlds'];
{
    for (const k of EXPECTED_FIRST_TIME) {
        if (!FIRST_TIME_KEYS.includes(k)) {
            err('FIRST_TIME_EVENTS has no "' + k + '" entry - engine.addBracketFixture() stamps '
                + 'flags.firstSeen[kind] and then asks for the event, so the flag is written and NOTHING is shown: '
                + 'a whole tournament arrives silently the first time a career reaches it, once, for ever');
        }
    }
    for (const k of FIRST_TIME_KEYS) {
        if (!EXPECTED_FIRST_TIME.includes(k)) {
            err('FIRST_TIME_EVENTS has an extra key "' + k + '" - the five keys are the five bracket kinds, and '
                + 'anything else is an entry firstTimeEvent() can be asked for but the engine never asks about');
        }
    }
    // The engine hands whatever bracket.kind holds straight through, so a kind
    // it does not know must come back null rather than throwing.
    for (const junk of [null, undefined, '', 'not_a_kind', 7, {}]) {
        let got;
        try { got = EV.firstTimeEvent(CAREER_BY_NAME('tier1-starter-21'), junk); } catch (e) {
            err('firstTimeEvent(c, ' + short(junk) + ') threw (' + e.message + ') - addBracketFixture() calls it with '
                + 'bracket.kind unvalidated, so a bracket written by a future build would break the week');
            continue;
        }
        if (got !== null) err('firstTimeEvent(c, ' + short(junk) + ') returned something instead of null');
    }
    // ... and every real key must come back with its text already a string.
    for (const k of EXPECTED_FIRST_TIME) {
        if (!FIRST_TIME_KEYS.includes(k)) continue;
        const got = EV.firstTimeEvent(CAREER_BY_NAME('tier1-starter-21'), k);
        if (!got || typeof got !== 'object') { err('firstTimeEvent(c, "' + k + '") returned nothing'); continue; }
        if (typeof got.text !== 'string' || !got.text) {
            err('firstTimeEvent(c, "' + k + '") did not resolve text to a string - CareerOverlay interpolates it '
                + 'straight into the markup and careerRender fails a render containing the word "undefined"');
        }
        if (got.firstTime !== true) err('firstTimeEvent(c, "' + k + '") did not set the firstTime marker');
        if (got === EV.FIRST_TIME_EVENTS[k]) {
            err('firstTimeEvent(c, "' + k + '") returned the POOL OBJECT rather than a shallow copy - the resolved '
                + 'text is written onto it and pins one career\'s wording into every later firing');
        }
    }
    console.log('  ' + FIRST_TIME_KEYS.length + ' keys: ' + FIRST_TIME_KEYS.join(', '));
}

// ---------------------------------------------------------------------------
//  10. LANGUAGES
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 10. languages ==================================================');
{
    const seen = new Set();
    for (const l of K.LANGUAGES) {
        if (!l || typeof l.id !== 'string' || !l.id) { err('LANGUAGES holds an entry with no id'); continue; }
        if (seen.has(l.id)) {
            err('LANGUAGES has a duplicate id "' + l.id + '" - LANGUAGE_BY_ID keeps the last one, so one of the two '
                + 'names and blurbs is unreachable while both still appear in the study list');
        }
        seen.add(l.id);
        if (typeof l.name !== 'string' || !l.name) err('LANGUAGES."' + l.id + '" has no name');
        if (typeof l.blurb !== 'string' || !l.blurb) err('LANGUAGES."' + l.id + '" has no blurb');
    }

    for (const rid of K.REGION_IDS) {
        const lang = K.REGION_LANGUAGE[rid];
        if (lang === undefined) {
            err('REGION_LANGUAGE has no entry for region "' + rid + '" - languageForRegion() returns null, null is '
                + 'read everywhere as "no language required", and that region silently becomes free to sign for '
                + 'from anywhere on the circuit');
        } else if (!K.LANGUAGE_IDS.includes(lang)) {
            err('REGION_LANGUAGE["' + rid + '"] is "' + lang + '", which is not a LANGUAGE_IDS entry - '
                + 'languageForRegion() rejects it and returns null, with the same silent consequence');
        }
    }
    for (const extra of Object.keys(K.REGION_LANGUAGE)) {
        if (!K.REGION_IDS.includes(extra)) {
            warn('REGION_LANGUAGE names a region "' + extra + '" that is not in REGION_IDS - it gates nothing');
        }
    }
    const usedLangs = new Set(K.REGION_IDS.map(r => K.REGION_LANGUAGE[r]));
    for (const id of K.LANGUAGE_IDS) {
        if (!usedLangs.has(id)) {
            err('language "' + id + '" is not the working language of any region - it can be studied, it costs gold '
                + 'and an activity slot, and it unlocks nothing anywhere in the game');
        }
    }
    for (const rid of K.REGION_IDS) {
        console.log('  ' + rid.padEnd(6) + ' -> ' + String(K.REGION_LANGUAGE[rid] || '(none)').padEnd(3)
            + '  ' + ((K.LANGUAGE_BY_ID[K.REGION_LANGUAGE[rid]] || {}).name || ''));
    }
    console.log('  gate ' + K.LANGUAGE_SIGN_MIN + '/100 to sign, ' + K.LANGUAGE_FLUENT + '/100 fluent, band at 0 = "'
        + K.languageBand(0) + '"');
}

// ---------------------------------------------------------------------------
//  11. ASCII
// ---------------------------------------------------------------------------
console.log('');
console.log('=== 11. ascii ======================================================');
function asciiReport(label, src, hard) {
    const lines = src.split('\n');
    const hits = [];
    const chars = new Map();
    lines.forEach((line, i) => {
        let first = null;
        for (const ch of line) {
            const cp = ch.codePointAt(0);
            if (cp > 127) {
                chars.set(cp, (chars.get(cp) || 0) + 1);
                if (first === null) first = cp;
            }
        }
        if (first !== null) hits.push((i + 1) + ':U+' + first.toString(16).toUpperCase().padStart(4, '0'));
    });
    if (!hits.length) { console.log('  ' + label + ': clean'); return; }
    const byChar = [...chars.entries()].sort((a, b) => b[1] - a[1])
        .map(([cp, n]) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ' x' + n).join(', ');
    const msg = label + ' contains ' + hits.length + ' non-ASCII line(s) [' + byChar + '] - emoji belong in '
        + '\\u{...} escapes and prose in plain ASCII. This repo has been corrupted by encoding round-trips '
        + 'before, and the symptom is invisible in a diff and permanent in a rendered save. Lines: '
        + hits.slice(0, 8).join(', ') + (hits.length > 8 ? ', ...' : '');
    if (hard) err(msg); else warn(msg);
}

// events.js is the file this harness owns and it is ASCII-clean, so it is held
// to a hard error -- that is the file where new authored copy lands.
asciiReport('src/lib/career/events.js', evSrc, true);
// constants.js is REPORTED, not failed. Its 3,037 U+2500 and 150 U+2550 are the
// box-drawing section banners the file has always used, and the remainder are
// real displayed strings -- 'Leviatan' with an acute, and six curly apostrophes
// in club names and playstyle blurbs. Every one predates this work. Failing on
// them would mean either editing the 108-club table to spell an org's name wrong
// or shipping a harness that is red on the day it lands, and a red harness gets
// disabled. The count is printed so a NEW violation is visible against it.
asciiReport('src/lib/career/constants.js', kSrc, false);

// ---------------------------------------------------------------------------
//  SELF-TEST
//  A lint that matches nothing looks exactly like a clean codebase. Both rules
//  that are written as reusable finders get a positive and a negative control,
//  so a refactor that quietly breaks the finder fails HERE rather than passing
//  a broken pool through in silence.
// ---------------------------------------------------------------------------
console.log('');
console.log('=== self-test ======================================================');
{
    let ok = 0, broken = 0;
    function control(label, cond) {
        if (cond) { ok++; return; }
        broken++;
        err('SELF-TEST: ' + label + ' - the rule engine itself is broken, so every pass above is meaningless');
    }

    // Rule 1, both directions.
    control('a duplicate id is caught',
        findIdProblems([{ tag: 'a', id: 'same_id' }, { tag: 'b', id: 'same_id' }])
            .some(m => m.indexOf('duplicate') >= 0));
    control('a bad id shape is caught',
        findIdProblems([{ tag: 'a', id: 'Not Snake Case' }]).length > 0);
    control('a clean id list is left alone',
        findIdProblems([{ tag: 'a', id: 'one' }, { tag: 'b', id: 'two' }]).length === 0);

    // Rule 5, all four failure modes plus the clean case.
    const cleanApply = () => ({ text: 'Nothing moved.', effects: { morale: 1 } });
    const mutatingApply = (c) => { c.player.morale = 3; return { text: 'x', effects: {} }; };
    const deepMutatingApply = (c) => {
        if (c && c.player && c.player.languages && typeof c.player.languages === 'object') {
            c.player.languages.ko = 99;
        }
        return { text: 'x', effects: {} };
    };
    const throwingApply = () => { throw new Error('boom'); };
    const nonObjectApply = () => 'not an object';
    const storeWritingApply = () => {
        ST.career.update(c => ({ ...c, money: { ...(c.money || {}), gold: (c.money ? c.money.gold : 0) + 1 } }));
        return { text: 'x', effects: {} };
    };
    const msgs = (fn) => findPurityProblems('control', fn, HARD_CAREERS)
        .map(f => (typeof f === 'string' ? f : f.msg));

    control('a pure apply passes', msgs(cleanApply).length === 0);
    control('a top-level mutation is caught', msgs(mutatingApply).some(m => m.indexOf('MUTATED') >= 0));
    control('a nested mutation is caught', msgs(deepMutatingApply).some(m => m.indexOf('MUTATED') >= 0));
    control('a throwing apply is caught', msgs(throwingApply).some(m => m.indexOf('threw') >= 0));
    control('a non-object return is caught', msgs(nonObjectApply).some(m => m.indexOf('returned') >= 0));
    control('a store write is caught', msgs(storeWritingApply).some(m => m.indexOf('WROTE THE STORE') >= 0));

    // The store-writing control really did write; put it back so nothing after
    // this block is measured against a moved store.
    ST.career.set(ST.blankCareer());

    // deepDiff itself, since every purity verdict rests on it.
    control('deepDiff sees an equal pair as equal', deepDiff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }) === '');
    control('deepDiff sees NaN as equal to NaN', deepDiff({ a: NaN }, { a: NaN }) === '');
    control('deepDiff sees a removed key', deepDiff({ a: 1, b: 2 }, { a: 1 }) !== '');
    control('deepDiff sees undefined replacing a value', deepDiff({ a: 1 }, { a: undefined }) !== '');

    console.log('  ' + ok + ' controls passed' + (broken ? ', ' + broken + ' BROKEN' : ''));
}

// ---------------------------------------------------------------------------
//  REPORT
// ---------------------------------------------------------------------------
console.log('');
if (errors) {
    console.log('FAILED -- ' + errors + ' error' + (errors === 1 ? '' : 's')
        + (warns ? ', ' + warns + ' warning' + (warns === 1 ? '' : 's') : '') + '.');
    process.exit(1);
}
console.log('All life-event checks passed'
    + (warns ? ' (' + warns + ' warning' + (warns === 1 ? '' : 's') + ')' : '') + '.');
