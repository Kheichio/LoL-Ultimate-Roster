// ===========================================================================
//  LoL ULTIMATE CAREER -- server-side render harness
// ===========================================================================
//  Developer tool. Nothing in src/ imports it and vite never bundles it.
//
//    node tools/careerRender.mjs [--seed 12345] [--verbose] [--dump] [--json]
//
//  --dump writes every rendered page to tools/.render-dump/ for eyeballing.
//  --json writes tools/.careerRender.report.json. Neither is written by default.
//
//  careerSmoke.mjs proves the LOGIC. This file proves the TEMPLATES. It boots
//  the same browser-shaped environment, drives the real store and engine into
//  a matrix of career states, then renders every career .svelte component
//  through Vite's SSR loader and inspects the HTML that comes out.
//
//  onMount does not run under SSR. That is the point: what is being tested is
//  the markup and the reactive statements, which is exactly where unguarded
//  property access lives.
//
//  ASCII only. This repo has been corrupted by encoding round-trips before.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const SEED = Math.round(argOf('seed', 1337));
const VERBOSE = process.argv.includes('--verbose');
const DUMP = process.argv.includes('--dump');

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
function rpick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// ---------------------------------------------------------------------------
//  BROWSER SHIM -- must exist before any career module is imported
//  (lifted from tools/careerSmoke.mjs so the two harnesses agree)
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
    createGain() { return { gain: new FakeAudioParam(), connect() {}, disconnect() {} }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
}

function makeElement(tag) {
    return {
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
        hasAttribute() { return false; },
        appendChild(c) { this.children.push(c); return c; },
        removeChild() {}, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        contains() { return false; },
        getContext() { return null; },
        click() {}, focus() {}, blur() {}, remove() {},
    };
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
win.navigator = { userAgent: 'careerRender', language: 'en' };
win.location = { href: 'http://localhost/', hash: '', search: '' };
win.innerWidth = 1440;
win.innerHeight = 900;
win.devicePixelRatio = 1;
win.self = win;
win.window = win;
win.setTimeout = setTimeout;
win.clearTimeout = clearTimeout;
win.setInterval = setInterval;
win.clearInterval = clearInterval;

const doc = {
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    activeElement: null,
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
try {
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'localStorage', fs.readFileSync(DB_PATH, 'utf8'))(win, doc, storage);
} catch (e) {
    console.error('FATAL: could not evaluate public/database.js -- ' + e.message);
    process.exit(2);
}
const DB = win.playerDatabase;
if (!Array.isArray(DB) || DB.length < 1000) {
    console.error('FATAL: window.playerDatabase is empty or tiny (' +
        (Array.isArray(DB) ? DB.length : typeof DB) + '). Refusing to run.');
    process.exit(2);
}

// ---------------------------------------------------------------------------
//  VITE SSR LOADER
// ---------------------------------------------------------------------------
const { createServer } = await import('vite');
const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.js'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
});

const _modCache = new Map();
async function load(rel) {
    if (_modCache.has(rel)) return _modCache.get(rel);
    const m = await server.ssrLoadModule(rel);
    _modCache.set(rel, m);
    return m;
}

// Every module below MUST come through ssrLoadModule, not a bare import():
// the components hold references to the SSR-graph instance of the store, and
// a second copy loaded by node's own loader would be a different writable.
const K  = await load('/src/lib/career/constants.js');
const R  = await load('/src/lib/career/ratings.js');
const T  = await load('/src/lib/career/teams.js');
const TR = await load('/src/lib/career/training.js');
const M  = await load('/src/lib/career/match.js');
const E  = await load('/src/lib/career/economy.js');
const C  = await load('/src/lib/career/contracts.js');
const A  = await load('/src/lib/career/awards.js');
const EV = await load('/src/lib/career/events.js');
const G  = await load('/src/lib/career/engine.js');
const ST = await load('/src/lib/stores/career.js');
// The pure half of the global career board. Loaded here, with the rest, so the
// fixtures below are built by the SAME module instance the components import --
// board.js memoises nothing, but sanitizeDossier() -> reifyCareer() ends in
// hydrateForeignCareer(), and that has to be the SSR graph's career store.
const B  = await load('/src/lib/career/board.js');

function readStore(s) {
    let v = null;
    const un = s.subscribe(x => { v = x; });
    un();
    return v;
}
const cur = () => readStore(ST.career);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
//  FAILURE LEDGER
// ---------------------------------------------------------------------------
const failures = [];
const seen = new Map();

function attributeFile(stack, fallback) {
    if (!stack) return fallback;
    for (const ln of String(stack).split('\n')) {
        const m = ln.match(/[\\/]?src[\\/]((?:lib|data)[\\/][^\s):]+\.(?:svelte|js))/);
        if (m) return 'src/' + m[1].replace(/\\/g, '/');
    }
    return fallback;
}

function fail(severity, file, symptom, evidence, suggestedFix, key) {
    const k = key || (file + '|' + symptom);
    if (seen.has(k)) {
        const hit = seen.get(k);
        hit._count += 1;
        if (hit._where.length < 6 && evidence) {
            const first = String(evidence).split('\n')[0];
            if (!hit._where.includes(first)) hit._where.push(first);
        }
        return;
    }
    const rec = {
        _key: k, _count: 1, _where: [],
        severity, file, symptom,
        evidence: String(evidence),
        suggestedFix,
    };
    seen.set(k, rec);
    failures.push(rec);
}

// ---------------------------------------------------------------------------
//  HTML INSPECTION
// ---------------------------------------------------------------------------
const BAD_TOKENS = [
    { re: /\bundefined\b/, name: 'undefined' },
    { re: /\bNaN\b/, name: 'NaN' },
    { re: /\bnull\b/, name: 'null' },
    { re: /\[object Object\]/, name: '[object Object]' },
    { re: /-?Infinity/, name: 'Infinity' },
];

function stripComments(html) { return html.replace(/<!--[\s\S]*?-->/g, ''); }

function visibleText(html) {
    return stripComments(html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&middot;|&mdash;|&ndash;|&times;|&ldquo;|&rdquo;/g, ' ')
        .replace(/&#x[0-9a-fA-F]+;|&#\d+;/g, ' ')
        .replace(/&\w+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** attribute values only (style="color:undefined" and friends) */
function attrText(html) {
    const out = [];
    const re = /\s(?:style|class|title|aria-label|href|src)="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out.join(' | ');
}

function contextAround(hay, re, span = 90) {
    const m = re.exec(hay);
    if (!m) return '';
    const i = Math.max(0, m.index - span);
    return '...' + hay.slice(i, Math.min(hay.length, m.index + span)) + '...';
}

// ---------------------------------------------------------------------------
//  RENDER
// ---------------------------------------------------------------------------
const COMPONENT_DIR = '/src/lib/components/career/';
let renders = 0, crashes = 0;
const SIZES = [];

async function renderComponent(rel) {
    const mod = await load(rel);
    if (!mod || !mod.default || typeof mod.default.render !== 'function') {
        throw new Error('module ' + rel + ' did not export an SSR component (default.render missing)');
    }
    return mod.default;
}

/**
 * Render one component in one state. `expect` describes what the screen owes
 * the player so a silent bail can be told apart from a deliberately terse box.
 *
 * `expect.component` is an ALREADY-LOADED SSR component, used instead of
 * loading `rel` off the shared graph. It exists for exactly one caller -- the
 * card-database-unloaded arm of CLUB SCOUT, which has to come out of a second,
 * throwaway module graph because utils/cards.js memoises the database in a
 * module-local cache with no reset. `rel` is still passed so the dump file, the
 * findings ledger and the size table all attribute it to the right file.
 */
async function render(name, rel, props, stateName, expect = {}) {
    const minChars = expect.minChars === undefined ? 200 : expect.minChars;
    const fileGuess = 'src' + rel.slice(4);
    let html = '';
    renders++;
    try {
        const Comp = expect.component || await renderComponent(rel);
        const out = Comp.render(props || {});
        html = out && typeof out.html === 'string' ? out.html : '';
    } catch (e) {
        crashes++;
        const stack = (e && e.stack) ? e.stack : String(e);
        const file = attributeFile(stack, fileGuess);
        const frame = stack.split('\n').slice(0, 5).join('\n');
        fail('crash', file,
            `${name} throws while rendering (${stateName})`,
            `state: ${stateName}\n${e && e.message}\n${frame}`,
            'Guard the property access named in the stack frame; the template reads it before checking it exists.',
            file + '|throw|' + (e && e.message ? String(e.message).slice(0, 120) : 'x'));
        if (VERBOSE) console.log(`    ! ${name} [${stateName}] THREW: ${e && e.message}`);
        return null;
    }

    if (DUMP) {
        const dir = path.join(ROOT, 'tools', '.render-dump');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}__${stateName}`.replace(/[^\w.-]+/g, '_') + '.html'), html, 'utf8');
    }

    const text = visibleText(html);
    SIZES.push({ name, state: stateName, html: html.length, text: visibleText(html).length });

    // A component that deliberately cleared its own driving store on boot (the
    // completed-series match, which finishes and hands control back to the
    // shell) is *supposed* to render nothing. That is not a silent bail.
    const selfCleared = typeof expect.allowEmptyIf === 'function' && expect.allowEmptyIf();

    if (html.length < minChars && !selfCleared) {
        fail('wrong', fileGuess,
            `${name} renders an all-but-empty page (${stateName})`,
            `state: ${stateName} -> ${html.length} chars of HTML, ${text.length} chars of visible text\n` +
            `html: ${html.slice(0, 300)}`,
            'The top-level {#if} bailed with no {:else}. Give this state a written empty state instead of a blank panel.',
            fileGuess + '|empty|' + stateName);
    } else if (expect.minText && text.length < expect.minText && !selfCleared) {
        fail('warning', fileGuess,
            `${name} renders almost no readable copy (${stateName})`,
            `state: ${stateName} -> only ${text.length} chars of visible text\ntext: ${text.slice(0, 220)}`,
            'A deliberate empty state needs explanatory copy, not just chrome.',
            fileGuess + '|thin|' + stateName);
    }

    for (const t of BAD_TOKENS) {
        const re = new RegExp(t.re.source);
        if (re.test(text)) {
            fail('wrong', fileGuess,
                `${name} prints the literal text "${t.name}" on screen (${stateName})`,
                `state: ${stateName}\n${contextAround(text, new RegExp(t.re.source))}`,
                `A binding resolves to ${t.name} and is interpolated straight into the markup. ` +
                'Default it, or hide the row when the value is missing.',
                fileGuess + '|token|' + t.name + '|' + stateName);
        }
    }

    const attrs = attrText(html);
    for (const t of BAD_TOKENS) {
        if (t.name === 'null') continue;   // class:x={null} is idiomatic and invisible
        const re = new RegExp(t.re.source);
        if (re.test(attrs)) {
            fail('warning', fileGuess,
                `${name} writes "${t.name}" into an HTML attribute (${stateName})`,
                `state: ${stateName}\n${contextAround(attrs, new RegExp(t.re.source))}`,
                'An undefined value reaches a style/title/aria attribute; the browser drops the declaration ' +
                'and the element loses its colour.',
                fileGuess + '|attr|' + t.name + '|' + stateName);
        }
    }

    if (VERBOSE) console.log(`    . ${name} [${stateName}] ${html.length}b / ${text.length} text`);
    return html;
}

// ---------------------------------------------------------------------------
//  STATE BUILDERS -- drive the real store + engine
// ---------------------------------------------------------------------------
function newCareer(cfg) {
    storage.clear();
    ST.resetCareer();
    ST.matchState.set(null);
    ST.careerOverlay.set(null);
    return ST.createCareer(cfg);
}

function baseCfg(over) {
    return {
        handle: 'Vex', pathId: 'precomp', age: 13, regionId: 'LEC', roleId: 'MID',
        playstyleId: (K.PLAYSTYLES.MID && K.PLAYSTYLES.MID[0]) ? K.PLAYSTYLES.MID[0].id : '',
        championId: (K.championsForRole('MID')[0] || {}).id || '',
        ...over,
    };
}

function safe(label, fn, fallback) {
    try { return fn(); } catch (e) {
        const file = attributeFile(e && e.stack, 'src/lib/career/engine.js');
        fail('crash', file, `harness driver step "${label}" threw`,
            `${e && e.message}\n${(e && e.stack ? e.stack : '').split('\n').slice(0, 4).join('\n')}`,
            'Reported so a driver failure is never mistaken for template health.',
            'driver|' + label + '|' + (e && e.message));
        return fallback;
    }
}

/** Sim weeks forward. Never plays a match by hand -- simFixture only. */
function driveWeeks(n, opts = {}) {
    for (let i = 0; i < n; i++) {
        const c0 = cur();
        if (c0.flags && c0.flags.retired) return;
        safe('startCareerWeek', () => G.startCareerWeek());

        // burn a couple of activity slots so news/logs/soloq populate
        let guard = 0;
        while (guard++ < 6) {
            const c = cur();
            if (!c.weekly || c.weekly.actionsLeft < 1) break;
            const pool = ['soloq', 'vod', 'stream', 'media', 'rest'];
            if (c.player.clubId) pool.push('scrim');
            const r = safe('doActivity', () => G.doActivity(rpick(pool)), null);
            ST.careerOverlay.set(null);
            if (!r || !r.ok) break;
        }

        // clear this week's fixtures
        let fg = 0;
        while (fg++ < 10) {
            const c = cur();
            const pending = (Array.isArray(c.season.schedule) ? c.season.schedule : [])
                .filter(f => f && Number(f.week) === Number(c.time.week) && !f.played);
            if (!pending.length) break;
            for (const f of pending) safe('simFixture', () => G.simFixture(f.id), null);
        }

        if (opts.offers && i % 3 === 1) {
            safe('generateOffers', () => {
                const fresh = C.generateOffers(cur());
                if (Array.isArray(fresh) && fresh.length) {
                    ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh] }));
                }
            });
        }

        const adv = safe('advanceWeek', () => G.advanceWeek(), null);
        ST.careerOverlay.set(null);
        ST.matchState.set(null);
        if (adv === null) break;
        if (opts.until && opts.until(cur())) return;
    }
}

/** Move the player onto a tier-1 seat through the real contract path. */
function signTier1() {
    const c = cur();
    const teams = safe('teamsInRegion', () => T.teamsInRegion(c.player.region, 1), []) || [];
    if (!teams.length) return false;
    const team = teams[0];
    const offer = safe('buildOffer', () => C.buildOffer(cur(), team, { status: 'starter', years: 3 }), null);
    if (!offer) return false;
    ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), offer] }));
    const r = safe('acceptOffer', () => C.acceptOffer(offer.id), null);
    return !!(r && r.ok);
}

const STATES = [];
// CareerShell hydrates from storage rather than from the store, so every state
// has to be written to the save key as well as set on the store. Asked for
// rather than hard-coded: save SLOTS resolve the real localStorage key inside
// utils/storage.js, and a literal here would go on silently writing a key
// nothing reads, leaving every shell render quietly testing a blank career.
const CAREER_KEY = typeof ST.careerSaveKey === 'function' ? ST.careerSaveKey() : 'lurc_career';

function pushState(name, note) {
    const snap = clone(cur());
    const rec = { name, note, snap };
    STATES.push(rec);
    return rec;
}

function applyState(snap) {
    ST.career.set(clone(snap));
    ST.matchState.set(null);
    ST.careerOverlay.set(null);
    ST.careerScreen.set('hub');
    // CareerShell hydrates from storage, so the save has to agree with the store
    storage.setItem(CAREER_KEY, JSON.stringify(snap));
}

// ---------------------------------------------------------------------------
//  SCOREBOARD FIXTURES
//  match.js hangs a `board` off every entry of the game log and finishMatch
//  persists the lot as result.games -- which is also what survives on
//  c.lastMatch.games. NO ORDINARY FIXTURE IN THIS FILE OWNS ONE: every state
//  built below is a saved career whose lastMatch was written by a path that
//  either predates boards or was benched, so the whole panel -- the tabs, the
//  two sides, the You chip, the champion column -- would render green while
//  being unreachable. That is precisely how the signature-slot perk shipped
//  with a correct model, correct markup and no fixture that could see it.
//
//  Module scope rather than block scope because FOUR readers need the exact
//  same shapes: the Hub's Last Match panel (through SINGLE_ROT), the result
//  overlay, MatchDay's end-of-series screen and MatchDay's per-game
//  interstitial. A second hand-written copy of these boards is a second thing
//  to keep in step with src/lib/career/scoreboard.js.
// ---------------------------------------------------------------------------
const CHAMP_IDS = Object.keys(K.CHAMPION_BY_ID || {});
const SB_ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
const SB_NAMES = ['Ledger', 'Kimchi', 'Aurora', 'Vantage', 'Halcyon',
    'Brick', 'Moonlit', 'Sable', 'Quill', 'Torrent'];

/** One valid ten-player board. `off` walks the champion pool so two boards
 *  in one series never collide, which is the rule the model guarantees. */
function sbBoard(off, myRole) {
    const champ = (i) => CHAMP_IDS[(off * 10 + i) % (CHAMP_IDS.length || 1)] || '';
    const side = (base, mine) => SB_ROLES.map((role, i) => {
        const row = {
            name: SB_NAMES[base + i] || 'Player',
            role,
            champ: champ(base + i),
            k: [2, 1, 4, 3, 0][i] + (mine ? 0 : 0),
            d: [1, 2, 1, 1, 2][i],
            a: [3, 4, 2, 1, 6][i],
        };
        if (mine && role === myRole) row.me = true;
        return row;
    });
    return { ally: side(0, true), enemy: side(5, false) };
}
function sbGameRow(n, won, off, myRole) {
    return {
        game: n, won, duration: 28 + n,
        kda: { k: 4, d: 1, a: 2 }, cs: 250, rating: 7.4, pentakills: 0,
        board: sbBoard(off, myRole || 'MID'),
    };
}
/** The same game with no board at all -- a benched game, or every save
 *  written before the feature existed. There is no version gate in this
 *  mode, so this shape is not legacy, it is permanent. */
function sbGameNoBoard(n, won) {
    const g = sbGameRow(n, won, 0, 'MID');
    delete g.board;
    return g;
}

const bo1 = [sbGameRow(1, true, 0, 'MID')];
const bo5 = [
    sbGameRow(1, true, 0, 'MID'), sbGameRow(2, false, 1, 'MID'),
    sbGameRow(3, true, 2, 'MID'), sbGameRow(4, false, 3, 'MID'),
    sbGameRow(5, true, 4, 'MID'),
];
/** A Bo3 whose MIDDLE game was benched: the tab strip has to survive a board
 *  missing from inside the list, not only off the end. */
const bo3Benched = [sbGameRow(1, true, 0, 'MID'), sbGameNoBoard(2, false), sbGameRow(3, true, 2, 'MID')];
/** Break exactly one thing on an otherwise valid Bo1. */
function rot(fn) {
    const games = clone(bo1);
    fn(games[0]);
    return games;
}

console.log('');
console.log('=========================================================');
console.log('  LoL ULTIMATE CAREER -- SSR template render');
console.log('  seed  : ' + SEED);
console.log('  cards : ' + DB.length + ' loaded from public/database.js');
console.log('  route : vite ssrLoadModule (real project svelte pipeline)');
console.log('=========================================================');

// ---- 1. brand-new PRE-COMPETITIVE, unsigned, nothing populated -------------
newCareer(baseCfg({ handle: 'Nyx', pathId: 'precomp', age: 13 }));
ST.career.update(c => ({
    ...c,
    news: [], history: [], offers: [], awards: [], trophies: [], sponsors: [],
    lastMatch: null, pendingMatch: null,
    season: { ...c.season, schedule: [], standings: {}, bracket: null },
}));
const S_PRECOMP = pushState('1-precomp-unsigned', 'brand new, no club, no schedule, no news');

// ---- 2. brand-new ACADEMY DEBUT, tier-2 club, week 1 -----------------------
newCareer(baseCfg({ handle: 'Rune', pathId: 'debut', age: 16, roleId: 'ADC' }));
safe('ensureSeason', () => G.ensureSeason());
safe('startCareerWeek', () => G.startCareerWeek());
const S_DEBUT = pushState('2-academy-debut-w1', 'signed tier-2, week 1');

// ---- 3. mid-season tier-1 starter ------------------------------------------
newCareer(baseCfg({ handle: 'Halo', pathId: 'debut', age: 18, roleId: 'MID' }));
safe('ensureSeason', () => G.ensureSeason());
signTier1();
ST.career.update(c => ({ ...c, player: { ...c.player, status: 'starter' } }));
safe('ensureSeason2', () => G.ensureSeason());
driveWeeks(11, { offers: true, until: (c) => c.time.week >= 11 });
// make sure the screens have offers, awards, news and a lastMatch to draw
safe('generateOffers', () => {
    const fresh = C.generateOffers(cur());
    if (Array.isArray(fresh) && fresh.length) {
        ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh] }));
    }
});
safe('checkMilestones', () => {
    const ms = A.checkMilestones(cur());
    if (Array.isArray(ms) && ms.length) A.grantMilestones(ms);
});
ST.careerOverlay.set(null);
const S_MID = pushState('3-midseason-tier1', 'tier-1 starter, played fixtures, standings, news, offers');

// ---- 4. playoffs -----------------------------------------------------------
driveWeeks(8, { until: (c) => !!(c.season && c.season.bracket) });
let S_PLAYOFF = null;
if (cur().season && cur().season.bracket) {
    S_PLAYOFF = pushState('4a-playoffs-bracket', 'playoff phase with a live bracket');
} else {
    // force the phase even when the bracket did not survive the week boundary
    ST.career.update(c => ({ ...c, time: { ...c.time, week: 15 } }));
    safe('runPlayoffs', () => G.runPlayoffs());
    S_PLAYOFF = pushState('4a-playoffs-bracket', 'playoff phase, bracket after runPlayoffs()');
}
// the same phase with the bracket missing -- an older save, or a bracket the
// engine cleared between rendering and reading
ST.career.set(clone(S_PLAYOFF.snap));
ST.career.update(c => ({ ...c, time: { ...c.time, week: 15 }, season: { ...c.season, bracket: null } }));
const S_PLAYOFF_NULL = pushState('4b-playoffs-no-bracket', 'playoff phase, season.bracket === null');

// ---- 4c. AT a tournament, with the player's own club in the draw ------------
// State 4a only reaches this if the club actually made the cut that run, so the
// tournament banner and the 'live' qualification chip could go permanently
// unrendered and nothing would say so. This builds the shape by hand: a First
// Stand semifinal in week 3, the player's club in one of the ties.
ST.career.set(clone(S_PLAYOFF.snap));
ST.career.update(c => {
    const mine = c.player.clubId || 'lec_g2';
    const me = { id: mine, name: 'Your Club', accent: '#22c55e', seed: 1 };
    const them = { id: 'lck_t1', name: 'T1', accent: '#e2012d', seed: 4 };
    const other = { id: 'lpl_jdg', name: 'JD Gaming', accent: '#c8102e', seed: 2 };
    const other2 = { id: 'lcs_c9', name: 'Cloud9', accent: '#00a1e1', seed: 3 };
    return {
        ...c,
        time: { ...c.time, week: 3 },
        flags: { ...c.flags, firstStandBerth: c.time.year },
        season: {
            ...c.season,
            bracket: {
                kind: 'first_stand', year: c.time.year, title: 'First Stand', bestOf: 5,
                window: { from: 2, to: 4 }, totalRounds: 3,
                rounds: [
                    { name: 'Semifinals', week: 3, ties: [
                        { id: 'fs_r0_t0', a: me, b: them, score: [0, 0], winner: null, bestOf: 5 },
                        { id: 'fs_r0_t1', a: other, b: other2, score: [2, 1], winner: other.id, bestOf: 5 },
                    ] },
                ],
                byes: [], champion: null, runnerUp: null, myPlacement: null, done: false,
            },
        },
    };
});
const S_TOURNEY = pushState('4c-at-a-tournament', 'First Stand week 3, player club live in the semifinal');

// ...and the same tournament finished with the player as champion, which is the
// banner's other branch and the 'won' chip.
ST.career.update(c => ({
    ...c,
    time: { ...c.time, week: 4 },
    season: {
        ...c.season,
        results: { ...(c.season.results || {}), first_stand: 'champion' },
        bracket: {
            ...c.season.bracket,
            done: true,
            myPlacement: 1,
            champion: { id: c.player.clubId || 'lec_g2', name: 'Your Club', accent: '#22c55e' },
            runnerUp: { id: 'lck_t1', name: 'T1', accent: '#e2012d' },
        },
    },
}));
pushState('4d-tournament-won', 'First Stand decided, player club champions');

// ---- 5a. offseason, contract in its final year, offers on the table --------
ST.career.set(clone(S_MID.snap));
driveWeeks(30, { offers: true, until: (c) => c.time.week >= 37 });
ST.career.update(c => ({
    ...c,
    time: { ...c.time, week: 37 },
    player: c.player.contract
        ? { ...c.player, contract: { ...c.player.contract, years: 1, endYear: c.time.year } }
        : c.player,
}));
safe('generateOffers', () => {
    const fresh = C.generateOffers(cur());
    if (Array.isArray(fresh) && fresh.length) {
        ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh] }));
    }
});
const S_FINALYEAR = pushState('5a-offseason-final-year', 'offseason, contract expiring, offers pending');

// ---- 5b. offseason FREE AGENT with pending offers --------------------------
safe('releaseFromClub', () => C.releaseFromClub('mutual'));
safe('generateOffers', () => {
    const fresh = C.generateOffers(cur());
    if (Array.isArray(fresh) && fresh.length) {
        ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh] }));
    }
});
ST.careerOverlay.set(null);
const S_FREEAGENT = pushState('5b-offseason-free-agent', 'offseason, unsigned, offers pending');

// ---- 7. veteran 30+ with a long history (built before retirement) ----------
newCareer(baseCfg({ handle: 'Atlas', pathId: 'debut', age: 18, roleId: 'TOP', regionId: 'LCK' }));
safe('ensureSeason', () => G.ensureSeason());
signTier1();
safe('ensureSeason2', () => G.ensureSeason());
driveWeeks(13 * K.WEEKS_PER_YEAR, { offers: true, until: (c) => c.player.age >= 31 });
const S_VETERAN = pushState('7-veteran-age31', 'age 30+, decayed attributes, long history');

// ---- 6. retired + hall of legends -----------------------------------------
safe('retire', () => A.retire({ force: true }));
ST.career.update(c => ({ ...c, flags: { ...c.flags, retired: true, hallOfLegends: true } }));
ST.careerOverlay.set(null);
const S_RETIRED = pushState('6-retired-hall-of-legends', 'retired, hallOfLegends, full history + honours');

// ---- 8. HOSTILE -- an old save that lost things ----------------------------
ST.career.set(clone(S_MID.snap));
ST.career.update(c => ({
    ...c,
    player: {
        ...c.player,
        contract: null,
        clubId: 'org_that_no_longer_exists',
        clubTier: null,
    },
    season: {
        ...c.season,
        standings: null,
        schedule: null,
        bracket: null,
    },
    lastMatch: null,
    offers: [
        ...(Array.isArray(c.offers) ? c.offers.slice(0, 1) : []),
        { id: 'malformed_offer' },        // no team, no salary, no years, no status
    ],
    news: Array.isArray(c.news) ? [...c.news, null] : [],
    history: Array.isArray(c.history) ? [...c.history, {}] : [],
}));
const S_HOSTILE = pushState('8-hostile-legacy-save', 'nulled contract/standings/schedule, dead club id, malformed offer');

// ---- 8b. a second flavour of rot: present-but-empty rather than null -------
//  hydrate() coerces news/offers/history/awards back to arrays but never looks
//  inside them, and it never touches season.bracket at all, so these shapes
//  survive a load intact.
ST.career.set(clone(S_MID.snap));
ST.career.update(c => ({
    ...c,
    player: { ...c.player, role: 'NOT_A_ROLE', region: 'NOT_A_REGION', playstyle: 'ghost', champion: 'ghost' },
    season: { ...c.season, bracket: {}, standings: {}, schedule: [null, { id: 'f0' }] },
    awards: [null, { id: 'aw' }],
    trophies: [null],
    sponsors: [null, { id: 's' }],
    history: [null, { year: null, w: null, l: null }],
    news: [null, { id: 'n', text: null }],
    lastMatch: { won: null, score: null, kda: null, rating: 'x' },
    inventory: { ...c.inventory, gear: { not_a_gear_id: 9 }, lifestyle: { not_a_lifestyle: 1 }, consumables: { nope: 2 }, perks: ['not_a_perk'] },
}));
const S_ROTTEN = pushState('8b-rotten-collections', 'unknown role/region, bracket {}, null entries in every list');

// ---- 8c. ONE corruption at a time, so a crash names exactly one cause ------
//  The combined states above prove the screens survive (or do not). These
//  prove *which* missing field did it, which is the difference between a
//  finding another agent can fix and a finding they have to bisect.
const SINGLE_ROT = [
    ['news-holds-a-null',        c => ({ ...c, news: [null, ...(c.news || [])] })],
    ['schedule-holds-a-null',    c => ({ ...c, season: { ...c.season, schedule: [null, ...(c.season.schedule || [])] } })],
    ['schedule-is-null',         c => ({ ...c, season: { ...c.season, schedule: null } })],
    ['standings-is-null',        c => ({ ...c, season: { ...c.season, standings: null } })],
    ['bracket-is-empty-object',  c => ({ ...c, season: { ...c.season, bracket: {} } })],
    ['bracket-has-no-rounds',    c => ({ ...c, season: { ...c.season, bracket: { kind: 'spring_po', rounds: null } } })],
    ['offers-hold-a-null',       c => ({ ...c, offers: [null, ...(c.offers || [])] })],
    ['offer-is-bare-id',         c => ({ ...c, offers: [{ id: 'bare' }] })],
    ['awards-hold-a-null',       c => ({ ...c, awards: [null, ...(c.awards || [])] })],
    ['trophies-hold-a-null',     c => ({ ...c, trophies: [null] })],
    ['sponsors-hold-a-null',     c => ({ ...c, sponsors: [null] })],
    ['history-holds-a-null',     c => ({ ...c, history: [null, ...(c.history || [])] })],
    ['history-holds-an-empty',   c => ({ ...c, history: [{}, ...(c.history || [])] })],
    ['weekly-log-holds-a-null',  c => ({ ...c, weekly: { ...c.weekly, log: [null] } })],
    ['contract-is-null',         c => ({ ...c, player: { ...c.player, contract: null } })],
    ['club-id-is-dead',          c => ({ ...c, player: { ...c.player, clubId: 'org_deleted_in_a_patch' } })],
    ['role-is-unknown',          c => ({ ...c, player: { ...c.player, role: 'NOT_A_ROLE' } })],
    ['region-is-unknown',        c => ({ ...c, player: { ...c.player, region: 'NOT_A_REGION' } })],
    ['lastMatch-is-malformed',   c => ({ ...c, lastMatch: { won: null, score: null, kda: null, rating: 'x' } })],
    ['inventory-ids-unknown',    c => ({ ...c, inventory: { gear: { nope: 9 }, lifestyle: { nope: 1 }, consumables: { nope: 2 }, perks: ['nope'] } })],
    // Traits are bare ids like player.champion, so a save can carry an id that
    // no longer exists, or the wrong type entirely. Both must render.
    ['traits-is-null',           c => ({ ...c, player: { ...c.player, traits: null } })],
    ['traits-hold-a-dead-id',    c => ({ ...c, player: { ...c.player, traits: ['no_such_trait'] } })],
    ['playstyle-is-unknown',     c => ({ ...c, player: { ...c.player, playstyle: 'NOT_A_STYLE' } })],
    // Proficiency is an id -> count map and the Profile screen renders a row per
    // entry, so a dead id or the wrong type both reach the template.
    ['proficiency-is-null',      c => ({ ...c, player: { ...c.player, proficiency: null } })],
    ['proficiency-dead-id',      c => ({ ...c, player: { ...c.player, proficiency: { no_such_champ: 12 } } })],
    ['proficiency-is-array',     c => ({ ...c, player: { ...c.player, proficiency: [1, 2, 3] } })],
    // career.club: the one place an AI roster is allowed to have a history, and
    // therefore the one AI roster a hand-edited save can break.
    ['club-is-null',             c => ({ ...c, club: null })],
    ['club-is-array',            c => ({ ...c, club: [1, 2] })],
    ['club-roster-holds-junk',   c => ({ ...c, club: { teamId: c.player.clubId, momentum: 0.4, roster: { MID: null, TOP: 'nope', JNG: {} }, changes: [null, {}] } })],
    ['club-momentum-is-nonsense', c => ({ ...c, club: { teamId: c.player.clubId, momentum: 'very high', roster: {}, changes: [] } })],
    ['club-belongs-to-another',  c => ({ ...c, club: { teamId: 'org_that_no_longer_exists', momentum: -1, roster: { TOP: { name: 'Ghost', role: 'TOP', rating: 91 } }, changes: [{ year: 2027, role: 'TOP', outName: 'X', inName: 'Ghost', reason: 'cut' }] } })],
    // Languages are a fractional id -> level map, so every rot shape proficiency
    // has is reachable here too, and Transfers renders a row per LANGUAGES entry
    // off the back of it. `studyLang` is a bare id like player.champion.
    ['languages-is-null',        c => ({ ...c, player: { ...c.player, languages: null } })],
    ['languages-is-array',       c => ({ ...c, player: { ...c.player, languages: ['ko', 'en'] } })],
    ['languages-hold-a-string',  c => ({ ...c, player: { ...c.player, languages: { ko: 'fluent', en: NaN, nope: 40 } } })],
    ['studylang-is-dead-id',     c => ({ ...c, player: { ...c.player, studyLang: 'klingon' } })],
    // weekly.counts is REBUILT from a literal every week by startCareerWeek, so
    // the only way a save carries a broken one is between the load and the first
    // week tick -- which is exactly when the Hub renders.
    ['weekly-counts-is-null',    c => ({ ...c, weekly: { ...c.weekly, counts: null } })],
    ['firstseen-is-array',       c => ({ ...c, flags: { ...c.flags, firstSeen: [1, 2] } })],

    // player.goalClubId is a bare club id persisted exactly like player.champion
    // and player.studyLang, so a renamed or deleted org lands here. It has ONE
    // reader -- contracts.goalProgress() -- and that function returns null both
    // for "no goal" and for "the goal does not resolve", so a rotten id and an
    // unset one are the same panel on screen unless both are actually driven.
    ['goalclub-is-a-dead-id',    c => ({ ...c, player: { ...c.player, goalClubId: 'org_deleted_in_a_patch' } })],
    ['goalclub-is-an-object',    c => ({ ...c, player: { ...c.player, goalClubId: { id: 'lec_g2' } } })],
    ['goalclub-is-null',         c => ({ ...c, player: { ...c.player, goalClubId: null } })],
    // The goal already reached: goalProgress short-circuits on p.clubId === t.id
    // before any of the gate arithmetic runs, so this is its own code path.
    ['goalclub-is-my-own-club',  c => ({ ...c, player: { ...c.player, goalClubId: c.player.clubId } })],

    // player.practiceChamp is the same shape again -- a bare champion id, read
    // by the Hub's activity row and by the Dossier's "In the lab" line, with a
    // fallback to the signature pick when it does not resolve.
    ['practicechamp-dead-id',    c => ({ ...c, player: { ...c.player, practiceChamp: 'no_such_champion' } })],
    ['practicechamp-is-object',  c => ({ ...c, player: { ...c.player, practiceChamp: { id: 'ahri' } } })],
    ['practicechamp-is-null',    c => ({ ...c, player: { ...c.player, practiceChamp: null } })],

    // career.club.scrim is a role -> fractional points map, scoped by
    // club.teamId exactly like momentum and roster, so every one of these has to
    // carry the player's own club id or the whole block is ignored and the rot
    // is never reached. teams.seatScrimDelta() clamps on READ, which is the
    // claim these shapes exist to check.
    ['club-scrim-holds-junk',    c => ({ ...c, club: { teamId: c.player.clubId, momentum: 0.2, roster: {}, changes: [], scrim: { TOP: 'sharp', JNG: NaN, MID: -4, ADC: 999, SUP: null } } })],
    ['club-scrim-unknown-role',  c => ({ ...c, club: { teamId: c.player.clubId, momentum: 0, roster: {}, changes: [], scrim: { NOT_A_ROLE: 6, TOP: 3.5 } } })],
    ['club-scrim-is-an-array',   c => ({ ...c, club: { teamId: c.player.clubId, momentum: 0, roster: {}, changes: [], scrim: [1, 2, 3] } })],
    ['club-scrim-is-a-string',   c => ({ ...c, club: { teamId: c.player.clubId, momentum: 0, roster: {}, changes: [], scrim: 'sharpened' } })],
    // ...and one HONEST block, so the seat chip actually renders. A rot state
    // that only ever proves nothing crashed cannot tell a guarded chip apart
    // from a chip that was never wired.
    ['club-scrim-is-real',       c => ({ ...c, club: { teamId: c.player.clubId, momentum: 0.35, roster: {}, changes: [], scrim: { TOP: 10, JNG: 7.4, MID: 2.2, ADC: 10, SUP: 0.55 } } })],

    // flags.decline is the split-close ledger. `attrs` is the per-attribute row
    // the Training screen reads through training.declinedThisSplit(), and it is
    // absent on every save written before decline existed -- so the populated
    // shape is the one that has to be built by hand.
    ['decline-is-a-string',      c => ({ ...c, flags: { ...c.flags, decline: 'a bad split' } })],
    ['decline-is-an-array',      c => ({ ...c, flags: { ...c.flags, decline: [1, 2] } })],
    ['decline-is-negative',      c => ({ ...c, flags: { ...c.flags, decline: { ovrLost: -4, splits: -1, heldTotal: -2, attrs: { mec: -1.5 } } } })],
    ['decline-is-populated',     c => ({ ...c, flags: { ...c.flags, decline: { ovrLost: 2.4, splits: 3, heldTotal: 11, attrs: { mec: 1.4, cmp: 0.6 } } } })],

    // flags.splitTrained is what decides the Held / Exposed chip on every
    // attribute row, and an empty map is the DEFAULT -- so without a populated
    // one the Held half of that pair has no coverage at all.
    ['splittrained-holds-junk',  c => ({ ...c, flags: { ...c.flags, splitTrained: { mec: 'twice', lne: NaN, map: -3, not_an_attr: 2 } } })],
    ['splittrained-is-an-array', c => ({ ...c, flags: { ...c.flags, splitTrained: [1, 2] } })],
    ['splittrained-populated',   c => ({ ...c, flags: { ...c.flags, splitTrained: { mec: 2, lne: 1, map: 1, tmf: 1, cmp: 4, ldr: 1, chp: 1, knw: 1 } } })],

    // flags.consumablesUsed is the per-career use ledger behind the Shop's cap
    // chrome. Driven here as well as in the SHOP TABS block because the Hub and
    // the Dossier read the same inventory around it.
    ['consumables-used-at-cap',  c => ({
        ...c,
        flags: { ...c.flags, consumablesUsed: { performance_camp: 3, energy_drink: 41 } },
        weekly: { ...c.weekly, counts: { ...(c.weekly && c.weekly.counts), 'cons:energy_drink': 2 } },
        inventory: { ...c.inventory, consumables: { ...(c.inventory && c.inventory.consumables), energy_drink: 2, performance_camp: 1 } },
    })],
    ['consumables-used-is-junk', c => ({ ...c, flags: { ...c.flags, consumablesUsed: 'lots of them' } })],

    // lastMatch.moraleNotes -- the breakdown behind the net morale figure.
    // ABSENT is the pre-change save shape and must keep rendering exactly as it
    // always did, so it is a state in its own right rather than an assumption.
    ['morale-notes-absent',      c => { const lm = { ...(c.lastMatch || {}) }; delete lm.moraleNotes; return { ...c, lastMatch: lm }; }],
    ['morale-notes-populated',   c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), moraleDelta: -6, moraleNotes: ['A 1.2 KDA across the series cost you.', 'Three straight losses before this one.'] } })],
    ['morale-notes-is-a-string', c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), moraleNotes: 'you played badly' } })],
    ['morale-notes-hold-objects', c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), moraleNotes: [{ text: 'x' }, null, '', 7] } })],
    ['morale-notes-is-null',     c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), moraleNotes: null } })],

    // lastMatch.games -- the ten-player boards, as the Hub's Last Match panel
    // reads them. BOTH ARMS have to be driven: a save whose last series carried
    // boards, and one whose lastMatch has no `games` key at all. The second is
    // not a curiosity, it is every result written before boards existed and
    // every benched game since, there is no version gate in this mode, and
    // ABSENT owes NOTHING on screen -- no empty table and no row of dashes. A
    // state that only ever proves nothing crashed cannot tell a guarded panel
    // apart from a panel that was never wired, so the populated arm is here to
    // be grepped for in --dump.
    ['lastmatch-carries-boards',  c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), played: true, won: true, score: [3, 2], games: clone(bo5) } })],
    ['lastmatch-one-board',       c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), played: true, won: true, score: [1, 0], games: clone(bo1) } })],
    ['lastmatch-has-no-games',    c => { const lm = { ...(c.lastMatch || {}) }; delete lm.games; return { ...c, lastMatch: lm }; }],
    ['lastmatch-games-are-junk',  c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), games: 'the five games' } })],
    ['lastmatch-board-is-rotted', c => ({ ...c, lastMatch: { ...(c.lastMatch || {}), played: true, games: rot(g => { g.board.ally = null; }) } })],
];
const SINGLE_STATES = [];
for (const [label, fn] of SINGLE_ROT) {
    ST.career.set(clone(S_MID.snap));
    ST.career.update(fn);
    SINGLE_STATES.push({ name: '9-' + label, note: 'state 3 with exactly one field broken', snap: clone(cur()) });
}

console.log('');
console.log('  states built: ' + STATES.map(s => s.name).join(', '));
console.log('');

// ---------------------------------------------------------------------------
//  SCREENS x STATES
// ---------------------------------------------------------------------------
const SCREENS = [
    ['Hub',        COMPONENT_DIR + 'Hub.svelte'],
    ['Training',   COMPONENT_DIR + 'Training.svelte'],
    ['Club',       COMPONENT_DIR + 'Club.svelte'],
    ['Calendar',   COMPONENT_DIR + 'Calendar.svelte'],
    ['Shop',       COMPONENT_DIR + 'Shop.svelte'],
    ['Transfers',  COMPONENT_DIR + 'Transfers.svelte'],
    ['Profile',    COMPONENT_DIR + 'Profile.svelte'],
    // The global board. Rendered with NO props, i.e. exactly the way CareerShell
    // mounts it: previewRows stays null and onMount never runs under SSR, so
    // boardState is still `idle` and this is the ANSWERED-AND-EMPTY arm. The
    // loading / error / offline arms are unreachable from here for the same
    // reason and are driven off the real store in the CAREER BOARD VIEWS block.
    //
    // CareerDossier is deliberately NOT in this list: it takes a required `c`
    // and the loop passes {}, so it would be tested against one shape it never
    // receives in production. It gets its own direct-drive block instead.
    ['CareerBoard', COMPONENT_DIR + 'CareerBoard.svelte'],
    ['CreatePlayer', COMPONENT_DIR + 'CreatePlayer.svelte'],
];

console.log('---- SCREENS ---------------------------------------------');
for (const st of [...STATES, ...SINGLE_STATES]) {
    console.log('  [' + st.name + ']');
    for (const [name, rel] of SCREENS) {
        applyState(st.snap);
        await render(name, rel, {}, st.name, { minText: 120 });
    }
    applyState(st.snap);
    await render('CareerShell', COMPONENT_DIR + 'CareerShell.svelte', {}, st.name, { minText: 120 });
}

// ---------------------------------------------------------------------------
//  SHOP TABS
//  `tab` is component-local, so the loop above only ever renders the gear arm
//  and every other section's markup was shipping untested. Each section is
//  rendered against the workhorse state and against both damaged saves, which
//  is where an unknown gear / lifestyle / perk id and a rotten inventory live.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- SHOP TABS -------------------------------------------');
const SHOP_TABS = ['gear', 'consumables', 'lifestyle', 'perks', 'exchange', 'sponsors'];

// ---- CAPPED CONSUMABLES ---------------------------------------------------
//  The consumable caps ship with markup that NO ordinary fixture can reach.
//  `limitOut()` needs a counter actually AT zero and `blockNote()` needs an
//  item that is held, affordable and still unusable -- and every state above
//  has an empty bag, an empty weekly.counts and an untouched ceiling budget, so
//  the c-limit-out chip and the whole block-note branch would render green
//  while being unreachable. That is the exact failure the signature-slot perk
//  shipped with: correct model, correct markup, no fixture that could see it.
//
//  Two shapes, because the two bounds are different clauses in
//  economy.consumableAllowance(): a COUNT at its cap, and the career ceiling
//  BUDGET spent while the count still has room.
const S_CONS_CAPPED = {
    name: 'shop-consumable-caps-reached',
    note: 'weekly and career consumable counters at their caps, bag stocked',
    snap: (() => {
        const x = clone(S_MID.snap);
        x.money = { ...(x.money || {}), gold: 400000 };
        x.weekly = {
            ...(x.weekly || {}),
            counts: {
                ...((x.weekly && x.weekly.counts) || {}),
                'cons:energy_drink': 2, 'cons:sleep_kit': 1, 'cons:psych_session': 1,
                'cons:all_nighter': 1, 'cons:meta_report': 1, 'cons:vod_package': 1,
                'cons:team_dinner': 1, 'cons:sports_massage': 1, 'cons:pr_blast': 2,
                'cons:private_coaching': 1,
            },
        };
        x.flags = { ...(x.flags || {}), consumablesUsed: { performance_camp: 3 } };
        x.inventory = {
            ...(x.inventory || {}),
            consumables: {
                ...((x.inventory && x.inventory.consumables) || {}),
                energy_drink: 3, sleep_kit: 1, psych_session: 1, all_nighter: 1,
                meta_report: 1, performance_camp: 1,
            },
        };
        return x;
    })(),
};
// The Performance Camp with its COUNT still open and the career ceiling budget
// spent: a full bag and a dead Use button, which is the one block with no other
// tell on the card and therefore the only thing blockNote() exists to say.
const S_CEILING_SPENT = {
    name: 'shop-ceiling-budget-spent',
    note: 'boughtCeilingOVR at CEILING_PURCHASE_MAX with camps still in the bag',
    snap: (() => {
        const x = clone(S_MID.snap);
        x.money = { ...(x.money || {}), gold: 400000 };
        x.flags = { ...(x.flags || {}), boughtCeilingOVR: 3 };
        x.inventory = {
            ...(x.inventory || {}),
            consumables: { ...((x.inventory && x.inventory.consumables) || {}), performance_camp: 2 },
        };
        return x;
    })(),
};

for (const st of [S_MID, S_HOSTILE, S_ROTTEN, S_RETIRED, S_PRECOMP, S_CONS_CAPPED, S_CEILING_SPENT]) {
    for (const tab of SHOP_TABS) {
        applyState(st.snap);
        await render('Shop(' + tab + ')', COMPONENT_DIR + 'Shop.svelte',
            { initialTab: tab }, st.name, { minText: 120 });
    }
}

// ---------------------------------------------------------------------------
//  TRANSFERS -- THE GOAL CLUB
//  The whole panel is behind `{#if !goalRow}`, and goalRow is null unless
//  player.goalClubId names a club that still resolves. No fixture above sets
//  one, so everything from the interest bar to the rejection counter would
//  render green and be unreachable.
//
//  Every status contracts.goalProgress() can return is driven, because they are
//  five different arms of that function and four of them return EARLY: reached
//  short-circuits on the club id, reached-in-the-past on flags.goalReached, lost
//  on the rejection counter and blocked on signingBlock(). Only `chase` and
//  `live` fall through to the "what is still in the way" ladder.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- TRANSFERS: THE GOAL CLUB ----------------------------');
{
    const TF = COMPONENT_DIR + 'Transfers.svelte';
    const ALL_T = safe('allTeams', () => K.allTeams(), []) || [];
    const own = (S_MID.snap.player && S_MID.snap.player.clubId) || null;
    const homeReg = (S_MID.snap.player && S_MID.snap.player.region) || 'LEC';
    const pick = (fn) => { const t = ALL_T.find(fn); return t ? t.id : null; };
    // A tier-1 club at home, a tier-1 club behind a language the player has not
    // studied, and an open-circuit side whose gate anybody clears.
    const G_HOME = pick(t => t && t.id !== own && Number(t.tier) === 1 && t.region === homeReg) || 'lec_g2';
    const G_FOREIGN = pick(t => t && Number(t.tier) === 1 && t.region === 'LCK') || G_HOME;
    const G_OPEN = pick(t => t && Number(t.tier) === 3) || 'am_pug1';

    const withGoal = (id, mutate) => {
        const x = clone(S_MID.snap);
        x.player = { ...x.player, goalClubId: id };
        if (typeof mutate === 'function') mutate(x);
        return x;
    };

    const GOALS = [
        // The ordinary case: a real club, still to be reached.
        ['tf-goal-chase', withGoal(G_HOME)],
        // REACHED, both ways it can be reached -- the club you are at now, and
        // one you signed for years ago and have since left.
        ['tf-goal-reached-now', withGoal(own || G_HOME)],
        ['tf-goal-reached-in-the-past', withGoal(G_HOME, x => {
            x.flags = { ...(x.flags || {}), goalReached: Number(x.time && x.time.year) || 2027 };
        })],
        // LOST. The rejection counter is a permanent, silent dead end in
        // generateOffers(); this panel is the only thing that ever says so.
        ['tf-goal-lost-to-rejections', withGoal(G_HOME, x => {
            x.player = { ...x.player, rejected: { ...(x.player.rejected || {}), [G_HOME]: 3 } };
        })],
        // One refusal on file but not yet a blacklist: the counter chip without
        // the dead-end panel.
        ['tf-goal-one-refusal', withGoal(G_HOME, x => {
            x.player = { ...x.player, rejected: { ...(x.player.rejected || {}), [G_HOME]: 1 } };
        })],
        // A hard signing gate. An LEC player with no Korean cannot be signed in
        // the LCK at all, which is signingBlock()'s language clause.
        ['tf-goal-behind-a-language', withGoal(G_FOREIGN, x => {
            x.player = { ...x.player, languages: { en: 100 } };
        })],
        // The window, open and shut, against a gate the player clears.
        ['tf-goal-window-open', withGoal(G_OPEN, x => {
            x.time = { ...(x.time || {}), week: 38 };
        })],
        ['tf-goal-window-shut', withGoal(G_OPEN, x => {
            x.time = { ...(x.time || {}), week: 10 };
        })],
        // A goal set by an unsigned thirteen-year-old, which is the state the
        // panel is really for and the one no signed fixture reaches.
        ['tf-goal-unsigned-rookie', (() => {
            const x = clone(S_PRECOMP.snap);
            x.player = { ...x.player, goalClubId: G_HOME };
            return x;
        })()],
    ];
    for (const [label, snapx] of GOALS) {
        applyState(snapx);
        await render('Transfers', TF, {}, label, { minText: 120 });
    }
}

// ---------------------------------------------------------------------------
//  TRAINING -- THE MAINTENANCE DRILL
//  training.canTrain() returns { ok: true, maintenance: true } for exactly one
//  shape: an attribute AT its ceiling that has NOT been drilled this split.
//  Every fixture above is mid-career with headroom left in the attribute the
//  screen opens on, so the Maintenance flag, the drill-note branch that
//  explains it and the Held/Exposed pair around it have no reachable state.
//
//  Built by hand rather than driven, because reaching a ceiling honestly takes
//  a twelve-year career and would still only cover whichever attribute that run
//  happened to max.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- TRAINING: THE MAINTENANCE DRILL ---------------------');
{
    const TRN = COMPONENT_DIR + 'Training.svelte';
    const AK = Array.isArray(K.ATTR_KEYS) ? K.ATTR_KEYS : ['mec', 'lne', 'map', 'tmf', 'cmp', 'ldr', 'chp', 'knw'];

    /** state 3 with every attribute pinned to its own ceiling, the week's slots
     *  free and the gold and energy in hand -- so the ONLY thing left deciding
     *  the gate is flags.splitTrained, which is the argument. */
    const atCeiling = (splitTrained) => {
        const x = clone(S_MID.snap);
        const pot = (x.player && x.player.potential) || {};
        x.player = { ...x.player, attrs: { ...(x.player.attrs || {}) }, energy: 100 };
        for (const k of AK) {
            const v = Number(pot[k]);
            if (Number.isFinite(v)) x.player.attrs[k] = v;
        }
        x.money = { ...(x.money || {}), gold: 400000 };
        x.weekly = { ...(x.weekly || {}), actionsLeft: 5, actionsMax: 5, trained: {} };
        x.flags = { ...(x.flags || {}), splitTrained };
        return x;
    };
    const everyAttrHeld = AK.reduce((m, k) => { m[k] = 2; return m; }, {});

    const MAINT = [
        // ok:true, maintenance:true -- the session that pays nothing and buys
        // the protection.
        ['tr-maintenance-available', atCeiling({})],
        // ...and the refusal on the other side of it: at the ceiling AND already
        // drilled, so the session would buy literally nothing.
        ['tr-maintenance-already-held', atCeiling(everyAttrHeld)],
        // The same screen with last split's bill actually on it, which is the
        // only state where the per-attribute decline readout has anything to say.
        ['tr-maintenance-after-a-decline', (() => {
            const x = atCeiling({});
            x.flags = { ...(x.flags || {}), decline: { ovrLost: 2.4, splits: 3, heldTotal: 11, attrs: { mec: 1.4, cmp: 0.6 } } };
            return x;
        })()],
    ];
    for (const [label, snapx] of MAINT) {
        applyState(snapx);
        await render('Training', TRN, {}, label, { minText: 120 });
    }
}

// ---------------------------------------------------------------------------
//  CAREER BOARD VIEWS
//  Same problem the SHOP TABS block solves: `view`, `sort` and the row list are
//  all component-local, so the SCREENS loop above only ever compiles the
//  signed-out, nothing-loaded arm and the entire table, the filters and the
//  dossier view ship untested.
//
//  The fixtures are REAL. Each one is a state the harness already built, run
//  through the actual publish path -- buildBoardDocs() -> sanitizeRow() /
//  sanitizeDossier() -- so what the template renders is byte-for-byte the
//  document Firestore would hold, not a hand-written approximation of one.
//  That is the whole point: the board's failure mode is a FOREIGN document
//  rendering `undefined`, and a hand-built fixture would be too tidy to catch it.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- CAREER BOARD VIEWS ----------------------------------');
const BOARD_FIXTURES = [];
{
    const CB = COMPONENT_DIR + 'CareerBoard.svelte';

    // A mid career, both damaged saves, a retired one and an unsigned rookie.
    // The damaged pair matter most: buildBoardDocs is the first thing in the
    // app that has to survive them without producing a null-bearing document.
    for (const st of [S_MID, S_HOSTILE, S_ROTTEN, S_RETIRED, S_PRECOMP]) {
        const uid = 'u_' + st.name;
        const docs = safe('buildBoardDocs(' + st.name + ')',
            () => B.buildBoardDocs(st.snap, { uid, displayName: 'Tester', slot: 1 }), null);
        if (!docs) {
            fail('wrong', 'src/lib/career/board.js',
                'buildBoardDocs() returned null for a created career (' + st.name + ')',
                'state: ' + st.name + ' -> created=' + (st.snap && st.snap.created),
                'Only an uncreated career may return null; a created one that cannot be published is silently unpublishable.',
                'board|buildnull|' + st.name);
            continue;
        }
        const row = safe('sanitizeRow(' + st.name + ')', () => B.sanitizeRow(uid, docs.row), null);
        const dossier = safe('sanitizeDossier(' + st.name + ')', () => B.sanitizeDossier(uid, docs.profile), null);
        if (!row) continue;
        if (!dossier) {
            fail('wrong', 'src/lib/career/board.js',
                'sanitizeDossier() rejected a profile this build just wrote (' + st.name + ')',
                'state: ' + st.name + ' -> blob ' + String(docs.blob || '').length + ' chars',
                'encodeBlob and reifyCareer disagree; a published career would open as an unreadable record.',
                'board|dossiernull|' + st.name);
        }
        BOARD_FIXTURES.push({ name: st.name, row, dossier, blobLen: String(docs.blob || '').length });
    }

    const ALL_ROWS = BOARD_FIXTURES.map(f => f.row);
    console.log('  fixtures: ' + BOARD_FIXTURES.map(f => f.name + '(' + f.blobLen + 'b)').join(', '));

    // (view x sort). `sort` picks the copy under the tab bar and nothing else,
    // but it is also the one prop the harness can steer, and a tab whose hint
    // string is missing would print "undefined" under the table.
    for (const s of B.BOARD_SORTS) {
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB, {
            initialView: 'list', initialSort: s.key, previewRows: ALL_ROWS,
        }, 'board-list-' + s.key, { minText: 120 });

        applyState(S_MID.snap);
        await render('CareerBoard(dossier)', CB, {
            initialView: 'dossier', initialSort: s.key,
            previewRows: ALL_ROWS,
            previewDossier: BOARD_FIXTURES.length ? BOARD_FIXTURES[0].dossier : null,
        }, 'board-dossier-' + s.key, { minText: 120 });
    }

    // One dossier view per fixture, so the retired career, the unsigned rookie
    // and both rotted saves each get drawn through CareerDossier in situ.
    for (const f of BOARD_FIXTURES) {
        applyState(S_MID.snap);
        await render('CareerBoard(dossier)', CB, {
            initialView: 'dossier', initialSort: 'earnedScore',
            previewRows: [f.row], previewDossier: f.dossier,
        }, 'board-dossier-of-' + f.name, { minText: 120 });
    }

    // The EMPTY board: the answer came back and nobody has published. Distinct
    // from loading and from offline, and the only one of the three reachable
    // from props alone -- the other two are driven off boardState below.
    applyState(S_MID.snap);
    await render('CareerBoard(list)', CB, { initialView: 'list', previewRows: [] },
        'board-empty', { minText: 120 });

    // A row list that is not rows at all. normRow() is supposed to push every
    // one of these back through sanitizeRow rather than dereference it.
    applyState(S_MID.snap);
    await render('CareerBoard(list)', CB, {
        initialView: 'list',
        previewRows: [null, undefined, {}, 'nope', 7, [], { handle: 5, teamName: null },
            { ...(ALL_ROWS[0] || {}), earnedScore: null, wins: NaN, losses: undefined, updatedAt: Infinity }],
    }, 'board-junk-rows', { minText: 120 });

    // The dossier view with no dossier: the document failed to arrive and the
    // ranking row is all that is left. This is the fallback panel.
    applyState(S_MID.snap);
    await render('CareerBoard(dossier)', CB, {
        initialView: 'dossier', previewRows: ALL_ROWS.length ? [ALL_ROWS[0]] : [], previewDossier: null,
    }, 'board-dossier-unavailable', { minText: 120 });

    // ... and with neither. previewRows [] means the harness still suppresses
    // the query, so this is the dossier arm with nothing behind it at all.
    applyState(S_MID.snap);
    await render('CareerBoard(dossier)', CB, {
        initialView: 'dossier', previewRows: [], previewDossier: null,
    }, 'board-dossier-nothing', { minText: 120 });

    // A dossier object that is NOT career-shaped. The component guards on
    // `previewDossier.player`, so this must fall through to the panel above
    // rather than reach CareerDossier.
    applyState(S_MID.snap);
    await render('CareerBoard(dossier)', CB, {
        initialView: 'dossier', previewRows: ALL_ROWS, previewDossier: { nope: true },
    }, 'board-dossier-not-a-career', { minText: 120 });

    // Bogus prop values, the way a future caller would get them wrong.
    applyState(S_MID.snap);
    await render('CareerBoard(list)', CB, {
        initialView: 'not_a_view', initialSort: 'not_a_sort', previewRows: ALL_ROWS,
    }, 'board-bogus-props', { minText: 120 });

    // ---- every boardState status ------------------------------------
    //  onMount never runs under SSR, so the screen above can only ever be the
    //  answered-and-empty arm: `loading`, `error` and `offline` are branches no
    //  prop can reach. They are also the three a player is most likely to see
    //  first, and each of them owes written copy rather than a blank panel --
    //  which is the whole reason those states are in the MARKUP and not
    //  assembled in script.
    //
    //  The store comes through ssrLoadModule, so this is the same writable the
    //  component subscribes to. It is put back to its published default at the
    //  end: everything after this block would otherwise render against whatever
    //  status was left behind, including CareerShell(screen=board).
    const CBS = await load('/src/lib/stores/careerBoard.js');
    const BOARD_DEFAULT = { status: 'idle', error: '', fetchedAt: 0, sort: B.BOARD_SORTS[0].key };
    const STATUSES = [
        ['idle', { status: 'idle', error: '', fetchedAt: 0 }],
        ['loading', { status: 'loading', error: '', fetchedAt: 0 }],
        ['loading-after-a-sync', { status: 'loading', error: '', fetchedAt: Date.now() - 5 * 60000 }],
        ['ready-empty', { status: 'ready', error: '', fetchedAt: Date.now() - 90 * 1000 }],
        ['offline', { status: 'offline', error: 'This browser cannot reach the board.', fetchedAt: 0 }],
        ['error', { status: 'error', error: 'The service is unavailable right now.', fetchedAt: 0 }],
        // A status this build has never heard of, and an error that is not a
        // string. Both are what a future store revision looks like from here.
        ['unknown-status', { status: 'weird', error: 7, fetchedAt: 'soon' }],
    ];
    for (const [label, patch] of STATUSES) {
        CBS.boardState.set({ ...BOARD_DEFAULT, ...patch });
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB, { initialView: 'list', previewRows: [] },
            'board-state-' + label, { minText: 120 });

        // ... and the same status with rows already in hand, because the table
        // wins over every one of these branches and the header does not.
        CBS.boardState.set({ ...BOARD_DEFAULT, ...patch });
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB, { initialView: 'list', previewRows: ALL_ROWS },
            'board-state-' + label + '-with-rows', { minText: 120 });
    }
    CBS.boardState.set({ ...BOARD_DEFAULT });

    // The signed-in half of "Your careers": three slot cards, each with its own
    // independent entry, the hidden state, and the refusal panel. currentUser,
    // myBoardEntries, myBoardHidden and boardSync are all plain writables, so
    // the whole panel is reachable without a network stub. Every one is put
    // back at the end.
    //
    // THE STATES THAT MATTER ARE THE ONES NO ORDINARY FIXTURE OWNS. Publication
    // is automatic now, so "unpublished" is a transient and "hidden" is the only
    // state a player can actually choose -- and neither the hidden card, the
    // stale-entry card nor the refused-upload panel is reachable from any
    // driven career. They are hand-built here for the same reason the signature
    // slot's cd-sig-* shapes are: a perk whose only proof is the model layer is
    // a perk nobody can spend.
    const AUTH = await load('/src/lib/stores/auth.js');
    const ME = { uid: 'me', displayName: 'Tester', email: 'x@y.z' };

    // SEED SLOTS 2 AND 3, or two thirds of this panel is untestable.
    //
    // applyState() writes only CAREER_KEY, which storage.js resolves to slot 1,
    // so careerSlotSummary(2) and careerSlotSummary(3) return null in every
    // other render in this file -- and every control on a slot card lives
    // behind `{#if s.summary || s.orphan}`. Without this, the three-slot states
    // below rendered ONE card with a body and two "No career in this slot", the
    // plural copy in the panel header had zero occurrences in --dump, and the
    // board-confirm-hide-2/-3 renders contained no confirmation markup at all
    // while being named as if they covered it. Written through storage.js so
    // the slot suffix is resolved by the code that owns it rather than by a
    // literal here; cleared at the end of the block so nothing downstream
    // inherits them.
    const STO = await load('/src/lib/utils/storage.js');
    for (const n of [2, 3]) {
        const alt = clone(S_MID.snap);
        alt.player.handle = 'Slot' + n;   // distinguishable in --dump
        try { STO.saveToSlot(CAREER_KEY, alt, n); } catch (e) { /* reported by the empty render */ }
    }
    const rowFor = (slot, patch) => (ALL_ROWS.length
        ? { ...ALL_ROWS[Math.min(slot - 1, ALL_ROWS.length - 1)], entryId: 'me__' + slot, uid: 'me', slot, isMe: true, ...(patch || {}) }
        : null);
    const NO_ENTRIES = { 1: null, 2: null, 3: null };
    const NO_HIDDEN = { 1: false, 2: false, 3: false };
    const SYNC_IDLE = { status: 'idle', error: '', at: 0, slot: 0 };

    const MINE = [
        ['signed-out', null, NO_ENTRIES, NO_HIDDEN, SYNC_IDLE],
        ['signed-in-nothing-up-yet', ME, NO_ENTRIES, NO_HIDDEN, { status: 'syncing', error: '', at: 0, slot: 0 }],
        ['signed-in-one-slot-up', ME, { ...NO_ENTRIES, 1: rowFor(1) }, NO_HIDDEN,
            { status: 'ok', error: '', at: Date.now() - 30000, slot: 0 }],
        ['signed-in-all-three-up', ME, { 1: rowFor(1), 2: rowFor(2), 3: rowFor(3) }, NO_HIDDEN,
            { status: 'ok', error: '', at: Date.now() - 30000, slot: 0 }],
        ['signed-in-one-hidden', ME, { ...NO_ENTRIES, 1: rowFor(1) }, { ...NO_HIDDEN, 2: true }, SYNC_IDLE],
        ['signed-in-all-hidden', ME, NO_ENTRIES, { 1: true, 2: true, 3: true }, SYNC_IDLE],
        // An entry for a slot the player has since deleted and started over in:
        // a row is up, but its careerId does not fingerprint-match the save.
        ['signed-in-stale-entry', ME, { ...NO_ENTRIES, 1: rowFor(1, { careerId: 'cNOTMINE' }) }, NO_HIDDEN, SYNC_IDLE],
        // The refused auto-upload. It has no press behind it and therefore no
        // toast, so this panel is the only place it is ever visible.
        ['signed-in-sync-denied', ME, NO_ENTRIES, NO_HIDDEN,
            { status: 'error', error: 'The server refused the publish.', at: Date.now(), slot: 2 }],
        // A future store revision, from here: a status nobody has heard of and
        // an error that is not a string.
        ['signed-in-sync-junk', ME, NO_ENTRIES, NO_HIDDEN, { status: 'weird', error: 7, at: 'soon', slot: null }],
        // A row that resolves to no slot and no careerId -- the shape an entry
        // written before per-slot ids leaves behind.
        ['signed-in-row-has-no-slot', ME, { ...NO_ENTRIES, 1: rowFor(1, { slot: 0, careerId: '', entryId: 'me' }) },
            NO_HIDDEN, SYNC_IDLE],
        ['signed-in-user-is-junk', { nope: true }, { ...NO_ENTRIES, 1: rowFor(1) }, NO_HIDDEN, SYNC_IDLE],
        // Rot: the stores themselves malformed. Every reader indexes these by
        // slot number and none of them may throw on a missing key.
        ['entries-are-junk', ME, {}, {}, SYNC_IDLE],
    ];
    for (const [label, user, entries, hidden, syncState] of MINE) {
        AUTH.currentUser.set(user);
        CBS.myBoardEntries.set(entries);
        CBS.myBoardHidden.set(hidden);
        CBS.boardSync.set(syncState);
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB, { initialView: 'list', previewRows: ALL_ROWS },
            'board-mine-' + label, { minText: 120 });
    }

    // THE HIDE CONFIRMATION. `confirmHide` is component-local and set only
    // inside a click handler, which SSR never runs -- the same position
    // MatchDay's copy of the scoreboard is in, and its markup had zero
    // occurrences in --dump while this harness reported green. It is the one
    // destructive action on this screen, so it gets a prop rather than a note.
    for (const n of [1, 2, 3]) {
        AUTH.currentUser.set(ME);
        CBS.myBoardEntries.set({ 1: rowFor(1), 2: rowFor(2), 3: rowFor(3) });
        CBS.myBoardHidden.set(NO_HIDDEN);
        CBS.boardSync.set(SYNC_IDLE);
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB,
            { initialView: 'list', previewRows: ALL_ROWS, initialConfirmHide: n },
            'board-confirm-hide-' + n, { minText: 120 });
    }
    // ...and a slot number that is not a slot, which must confirm nothing.
    for (const junk of [0, 4, -1, 'x', null]) {
        AUTH.currentUser.set(ME);
        CBS.myBoardEntries.set({ 1: rowFor(1), 2: rowFor(2), 3: rowFor(3) });
        CBS.myBoardHidden.set(NO_HIDDEN);
        CBS.boardSync.set(SYNC_IDLE);
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB,
            { initialView: 'list', previewRows: ALL_ROWS, initialConfirmHide: junk },
            'board-confirm-hide-junk-' + String(junk), { minText: 120 });
    }
    // AN ENTRY WITH NO LOCAL SAVE. The player wiped the slot from the main
    // menu, or signed in somewhere that never held that career: the row is
    // public, the uploader will not touch it, and the card has to keep its Hide
    // button or that career is on the board for ever. No driven fixture owns
    // this state -- every one of them writes the save it renders.
    for (const [label, hidden] of [['orphan', NO_HIDDEN], ['orphan-hidden', { ...NO_HIDDEN, 2: true }]]) {
        try { STO.clearSlot('career', 2); } catch (e) { /* nothing to clear */ }
        AUTH.currentUser.set(ME);
        CBS.myBoardEntries.set({ 1: rowFor(1), 2: rowFor(2), 3: rowFor(3) });
        CBS.myBoardHidden.set(hidden);
        CBS.boardSync.set(SYNC_IDLE);
        applyState(S_MID.snap);
        await render('CareerBoard(list)', CB, { initialView: 'list', previewRows: ALL_ROWS },
            'board-mine-' + label, { minText: 120 });
    }

    // SIGNED IN WITH NOTHING TO LIST. The panel header's fourth arm, and the
    // only one that cannot be reached while any slot holds a save -- which
    // every other state in this file arranges. It is what a new account sees
    // before it starts a career, so it is also the first thing a real player
    // reads on this screen.
    for (const n of [1, 2, 3]) {
        try { STO.clearSlot('career', n); } catch (e) { /* already gone */ }
    }
    AUTH.currentUser.set(ME);
    CBS.myBoardEntries.set(NO_ENTRIES);
    CBS.myBoardHidden.set(NO_HIDDEN);
    CBS.boardSync.set(SYNC_IDLE);
    ST.career.set(clone(S_MID.snap));   // the store, deliberately WITHOUT the saves
    await render('CareerBoard(list)', CB, { initialView: 'list', previewRows: ALL_ROWS },
        'board-mine-signed-in-no-careers', { minText: 120 });

    AUTH.currentUser.set(null);
    CBS.myBoardEntries.set(NO_ENTRIES);
    CBS.myBoardHidden.set(NO_HIDDEN);
    CBS.boardSync.set(SYNC_IDLE);
}

// ---------------------------------------------------------------------------
//  BRACKET VIEW
//  A child of Calendar rather than a routed screen, so it gets no coverage from
//  the SCREENS loop. It owns every degenerate bracket shape the engine can
//  write, which makes it exactly the component worth driving directly.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- BRACKET VIEW ----------------------------------------');
{
    const BV = COMPONENT_DIR + 'BracketView.svelte';

    // Whatever the real states happen to be carrying.
    for (const st of [...STATES, ...SINGLE_STATES]) {
        applyState(st.snap);
        await render('BracketView', BV, {
            bracket: st.snap.season ? st.snap.season.bracket : null,
            myId: st.snap.player ? st.snap.player.clubId : null,
            myName: 'Your club',
            myAccent: '#3b82f6',
        }, st.name, { minText: 60 });
    }

    // Hand-built shapes the engine can produce but no state happens to hold.
    const SHAPES = [
        ['bv-null', null],
        ['bv-undefined', undefined],
        ['bv-empty-object', {}],
        ['bv-rounds-null', { kind: 'spring_po', rounds: null }],
        ['bv-rounds-empty', { kind: 'msi', title: 'Mid-Season Invitational', rounds: [] }],
        ['bv-byes-only', { kind: 'worlds', title: 'World Championship', bestOf: 5, rounds: [], byes: [{ id: 'lck_t1', name: 'T1', accent: '#e2012d', seed: 1 }] }],
        ['bv-tie-half-null', { kind: 'spring_po', title: 'Spring Playoffs', bestOf: 5, rounds: [{ name: 'Semifinals', ties: [{ id: 't0', a: null, b: { id: 'lec_g2', name: 'G2 Esports', accent: '#ee3a43', seed: 2 }, score: [0, 0], winner: null, bestOf: 5 }] }] }],
        ['bv-tie-both-null', { kind: 'spring_po', rounds: [{ name: 'Final', ties: [{ id: 't0', a: null, b: null }] }] }],
        // Duplicate keys. Both shapes are reachable from a hand-edited save:
        // two ties stamped with the same id, and two byes whose ids do not
        // resolve (they both come back named "TBD").
        //
        // NOTE THAT THESE TWO ARE NOT A REAL GATE. Svelte's SSR compiler
        // ignores each-block keys entirely and just iterates, so a duplicate key
        // renders fine here and only throws (dev) or silently reuses the wrong
        // block (prod) in the browser. They are here so the shapes are on the
        // record, not because passing proves anything -- keying an each block on
        // something that can collide has to be caught by reading.
        ['bv-duplicate-tie-ids', { kind: 'spring_po', title: 'Spring Playoffs', bestOf: 5, rounds: [{ name: 'Semifinals', ties: [
            { id: 'same', a: { id: 'lec_g2', name: 'G2', accent: '#ee3a43' }, b: { id: 'lec_fnc', name: 'Fnatic', accent: '#ff5900' }, score: [3, 0], winner: 'lec_g2', bestOf: 5 },
            { id: 'same', a: { id: 'lec_vit', name: 'Vitality', accent: '#ffdd00' }, b: { id: 'lec_kc', name: 'KC', accent: '#00b2ff' }, score: [1, 3], winner: 'lec_kc', bestOf: 5 },
        ] }] }],
        ['bv-duplicate-tbd-byes', { kind: 'worlds', title: 'World Championship', bestOf: 5, byes: ['ghost_a', 'ghost_b'], rounds: [{ name: 'Quarterfinals', ties: [
            { id: 'q0', a: { id: 'lec_g2', name: 'G2', accent: '#ee3a43' }, b: null, score: [0, 0], winner: null, bestOf: 5 },
        ] }] }],
        ['bv-scores-garbage', { kind: 'summer_po', title: 'Summer Playoffs', bestOf: 5, rounds: [{ name: 'Final', ties: [{ id: 't0', a: { id: 'lec_g2', name: 'G2', accent: '#ee3a43' }, b: { id: 'lec_fnc', name: 'Fnatic', accent: '#ff5900' }, score: ['x', null], winner: 'lec_g2', bestOf: 5 }] }] }],
        ['bv-dead-team-ids', { kind: 'msi', rounds: [{ name: 'Final', ties: [{ id: 't0', a: 'org_deleted', b: 'also_gone', score: [3, 1], winner: 'org_deleted', bestOf: 5 }] }] }],
        ['bv-finished', {
            kind: 'worlds', year: 2029, title: 'World Championship', bestOf: 5, done: true,
            myPlacement: 1,
            champion: { id: 'lec_g2', name: 'G2 Esports', accent: '#ee3a43' },
            runnerUp: { id: 'lck_t1', name: 'T1', accent: '#e2012d' },
            byes: [],
            rounds: [
                { name: 'Quarterfinals', ties: [
                    { id: 'q0', a: { id: 'lec_g2', name: 'G2 Esports', accent: '#ee3a43', seed: 1 }, b: { id: 'lcs_c9', name: 'Cloud9', accent: '#00a1e1', seed: 8 }, score: [3, 0], winner: 'lec_g2', bestOf: 5 },
                    { id: 'q1', a: { id: 'lck_t1', name: 'T1', accent: '#e2012d', seed: 2 }, b: { id: 'lpl_jdg', name: 'JDG', accent: '#c8102e', seed: 7 }, score: [3, 2], winner: 'lck_t1', bestOf: 5 },
                ] },
                { name: 'Final', ties: [
                    { id: 'f0', a: { id: 'lec_g2', name: 'G2 Esports', accent: '#ee3a43', seed: 1 }, b: { id: 'lck_t1', name: 'T1', accent: '#e2012d', seed: 2 }, score: [3, 2], winner: 'lec_g2', bestOf: 5 },
                ] },
            ],
        }],
        // A live sixteen-team draw carrying byes AND an unplayed tie belonging
        // to the player -- the shape the old inline panel drew as a four-team
        // bracket because it never looked at `byes`.
        ['bv-live-with-byes', {
            kind: 'worlds', year: 2030, title: 'World Championship', bestOf: 5, done: false,
            champion: null, runnerUp: null, myPlacement: null,
            byes: [
                { id: 'lck_t1', name: 'T1', accent: '#e2012d', seed: 1 },
                { id: 'lpl_blg', name: 'Bilibili Gaming', accent: '#1f8fff', seed: 2 },
            ],
            rounds: [{ name: 'Quarterfinals', ties: [
                { id: 'w0', a: { id: 'lec_g2', name: 'G2 Esports', accent: '#ee3a43', seed: 3 }, b: { id: 'lcs_tl', name: 'Team Liquid', accent: '#0a1723', seed: 6 }, score: [3, 1], winner: 'lec_g2', bestOf: 5 },
                { id: 'w1', a: { id: 'lec_vit', name: 'Team Vitality', accent: '#ffdd00', seed: 4 }, b: { id: 'lcp_cfo', name: 'CTBC Flying Oyster', accent: '#f0a500', seed: 5 }, score: [0, 0], winner: null, bestOf: 5 },
            ] }],
        }],
    ];

    for (const [label, shape] of SHAPES) {
        applyState(S_MID.snap);
        await render('BracketView', BV, {
            bracket: shape,
            myId: 'lec_vit',
            myName: 'Team Vitality',
            myAccent: '#ffdd00',
        }, label, { minText: 60 });
    }
}

// ---------------------------------------------------------------------------
//  CLUB SCOUT
//  A child of Club, Calendar and Hub rather than a routed screen -- exactly the
//  position BracketView holds under Calendar -- and it takes three required
//  props (teamId, year, onClose), so the SCREENS loop handing over {} gives it
//  no coverage of any kind. Rendered here for the same reason BracketView is.
//
//  It is also the ONLY panel in the mode that draws a club the player has never
//  played for, so the foreign-club arm of teams.rosterForClub() has no other
//  reader anywhere in the harness. Every tier is driven, because a tier-3
//  amateur side and a tier-1 org resolve their seats down different branches,
//  and the player's OWN club is driven because that id is the one case where
//  the panel delegates to the signings-and-form copy rather than the derived
//  roster.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- CLUB SCOUT ------------------------------------------');
{
    const CS = COMPONENT_DIR + 'ClubScout.svelte';
    const ALL_T = safe('allTeams', () => K.allTeams(), []) || [];
    const own = (S_MID.snap.player && S_MID.snap.player.clubId) || null;
    const pickTier = (tier) => {
        const t = ALL_T.find(x => x && x.id !== own && Number(x.tier) === tier);
        return t ? t.id : null;
    };
    const T1 = pickTier(1) || 'lec_g2';
    const T2 = pickTier(2) || 'lec_g2';
    const T3 = pickTier(3) || 'am_pug1';
    const YR = Number(S_MID.snap.time && S_MID.snap.time.year) || 2027;
    const noop = () => {};

    console.log('  clubs: t1=' + T1 + ' t2=' + T2 + ' t3=' + T3 + ' mine=' + own + ' year=' + YR);

    const SCOUTS = [
        ['cs-tier1-org',          { teamId: T1, year: YR, onClose: noop }],
        ['cs-tier2-academy',      { teamId: T2, year: YR, onClose: noop }],
        ['cs-tier3-amateur',      { teamId: T3, year: YR, onClose: noop }],
        // The delegating arm: teamId === player.clubId routes through
        // clubRosterFor(), which folds in signings, form and scrim sharpening.
        ['cs-my-own-club',        { teamId: own, year: YR, onClose: noop }],
        // An org that is not in the table any more. The panel owes a written
        // empty state here rather than a header over five blank seats.
        ['cs-unknown-team',       { teamId: 'org_that_no_longer_exists', year: YR, onClose: noop }],
        ['cs-team-is-null',       { teamId: null, year: YR, onClose: noop }],
        ['cs-team-is-a-number',   { teamId: 7, year: YR, onClose: noop }],
        ['cs-team-is-an-object',  { teamId: { id: T1 }, year: YR, onClose: noop }],
        // A non-finite year. Every seat is a derivation of (teamId, year), and
        // rosterForClub() reads the field through `Number(x) || DEFAULT`, so a
        // year the header rejects and the roster accepts would put a different
        // number on the cards from the one printed above them.
        ['cs-year-is-nan',        { teamId: T1, year: NaN, onClose: noop }],
        ['cs-year-is-infinity',   { teamId: T1, year: Infinity, onClose: noop }],
        ['cs-year-is-a-string',   { teamId: T1, year: 'soon', onClose: noop }],
        ['cs-year-is-negative',   { teamId: T1, year: -2027, onClose: noop }],
        ['cs-year-is-zero',       { teamId: T1, year: 0, onClose: noop }],
        // onClose is optional and gates the panel's own close control.
        ['cs-no-close-handler',   { teamId: T1, year: YR, onClose: null }],
        ['cs-close-is-not-a-fn',  { teamId: T1, year: YR, onClose: 'close' }],
    ];
    for (const [label, props] of SCOUTS) {
        applyState(S_MID.snap);
        await render('ClubScout', CS, props, label, { minText: 60 });
    }

    // The same panel over every damaged save. `mine` is derived from
    // $career.player.clubId, so a save whose own club id is dead is the one
    // shape where the delegating arm and the derived arm disagree.
    for (const st of [S_HOSTILE, S_ROTTEN, S_PRECOMP, S_RETIRED, S_VETERAN]) {
        applyState(st.snap);
        await render('ClubScout', CS, {
            teamId: (st.snap.player && st.snap.player.clubId) || T1,
            year: 0, onClose: noop,
        }, 'cs-on-' + st.name, { minText: 60 });
    }

    // ---- THE CARD DATABASE NOT LOADED ------------------------------------
    //  The panel gates its whole roster on board.boardDBReady(), because
    //  teams.getTeamRoster() invents five synthetic names when the database is
    //  missing and never visibly corrects itself -- five strangers presented as
    //  a real club's starting five.
    //
    //  That arm is UNREACHABLE from the graph above. utils/cards.js memoises the
    //  database in a module-local `_dbCache` the moment anything asks for a
    //  card, which the state builders did thousands of times before this block
    //  runs, and the module exports no reset. So it is rendered through a
    //  SECOND, throwaway Vite graph loaded while window.playerDatabase is
    //  absent. Nothing from that graph is kept: one component is rendered and
    //  the server is closed, so the real graph -- and the store every other
    //  render in this file subscribes to -- is never touched.
    {
        const savedDB = win.playerDatabase;
        let s2 = null;
        const Comp = await (async () => {
            try {
                win.playerDatabase = undefined;
                s2 = await createServer({
                    root: ROOT,
                    configFile: path.join(ROOT, 'vite.config.js'),
                    // An EXPLICIT hmr port, not `hmr: false` and not 0. Vite 4
                    // builds its websocket server in middleware mode whatever
                    // hmr says and falls back to a hardcoded 24678 for any
                    // falsy port, so a second server alive at the same time
                    // prints "Port is already in use" on stderr -- which in a
                    // tool whose whole output is a findings list reads like a
                    // failure. Derived from the pid so two runs of this harness
                    // side by side do not collide either.
                    server: { middlewareMode: true, hmr: { port: 24700 + (process.pid % 250) } },
                    appType: 'custom',
                    logLevel: 'error',
                    optimizeDeps: { noDiscovery: true },
                });
                const mod = await s2.ssrLoadModule(CS);
                return (mod && mod.default && typeof mod.default.render === 'function') ? mod.default : null;
            } catch (e) {
                fail('crash', 'src/lib/components/career/ClubScout.svelte',
                    'ClubScout cannot even be loaded without the card database',
                    (e && e.message) + '\n' + String((e && e.stack) || '').split('\n').slice(0, 4).join('\n'),
                    'Something on the import path dereferences window.playerDatabase at module scope; ' +
                    'the panel is supposed to render its own empty state instead.',
                    'clubscout|nodb|load');
                return null;
            }
        })();

        if (Comp) {
            for (const [label, props] of [
                ['cs-nodb-tier1', { teamId: T1, year: YR, onClose: noop }],
                ['cs-nodb-own-club', { teamId: own, year: YR, onClose: noop }],
                ['cs-nodb-unknown', { teamId: 'org_that_no_longer_exists', year: YR, onClose: noop }],
            ]) {
                await render('ClubScout', CS, props, label, { minText: 60, component: Comp });
            }
        }
        win.playerDatabase = savedDB;
        if (s2) await s2.close();
    }
}

// ---------------------------------------------------------------------------
//  CAREER DOSSIER
//  A child of CareerBoard rather than a routed screen -- the same position
//  BracketView holds under Calendar -- so it gets no coverage at all from the
//  SCREENS loop, and Profile only ever drives it with mine=true. This block is
//  the ONLY place the stranger arm is exercised.
//
//  EVERY SHAPE IS RENDERED TWICE. Once through the real transport
//  (buildBoardDocs -> sanitizeDossier), which is what a downloaded career
//  actually is, and once RAW, with the sanitiser bypassed entirely. The second
//  pass is the one that matters: sanitizeDossier is a single function and the
//  day somebody adds a second caller that forgets it, the component is the last
//  thing standing between a hostile document and Card.svelte's unguarded
//  card.name.slice(0, 2).
//
//  What this is really testing is BAD_TOKENS. Every reader in awards.js opens
//  `const st = c || snapshot()`, so a dropped guard does not throw -- it prints
//  the VIEWER'S own numbers under a stranger's handle, or `undefined` where a
//  field never arrived. A crash is the easy failure here; a confident wrong
//  number is the expensive one, and the literal-token check is what catches the
//  `d.field || 0` half of it.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- CAREER DOSSIER --------------------------------------');
{
    const CD = COMPONENT_DIR + 'CareerDossier.svelte';
    const AK = Array.isArray(K.ATTR_KEYS) ? K.ATTR_KEYS : ['mec', 'lne', 'map', 'tmf', 'cmp', 'ldr', 'chp', 'knw'];

    /** state 3, deep-copied, with exactly one thing broken. Built off a REAL
     *  career for the same reason SINGLE_ROT is: a hand-written stub has no
     *  history, no awards and no club, so it never reaches the panels that
     *  actually dereference things. */
    const bust = (fn) => { const x = clone(S_MID.snap); fn(x); return x; };
    const fill = (v) => AK.reduce((m, k) => { m[k] = v; return m; }, {});

    /** The shape as it would arrive off the wire: encoded by the publisher and
     *  decoded by the reader. Anything the encoder will not take comes back
     *  null, which is itself a prop value the component has to render. */
    function throughBoard(label, shape) {
        if (!shape || typeof shape !== 'object' || Array.isArray(shape)) return null;
        const raw = { ...shape, created: true };
        const docs = safe('buildBoardDocs(' + label + ')',
            () => B.buildBoardDocs(raw, { uid: 'u_cd', displayName: 'Tester', slot: 1 }), null);
        if (!docs) return null;
        return safe('sanitizeDossier(' + label + ')', () => B.sanitizeDossier('u_cd', docs.profile), null);
    }

    const fxRetired = BOARD_FIXTURES.find(f => f.name === S_RETIRED.name);
    const fxRookie = BOARD_FIXTURES.find(f => f.name === S_PRECOMP.name);

    const SHAPES = [
        // Not a career at all. `c` is a prop with a default of null, so every
        // one of these is reachable from a caller that guessed wrong.
        ['cd-null', null],
        ['cd-undefined', undefined],
        ['cd-empty-object', {}],
        ['cd-array', []],
        ['cd-string', 'a career'],

        // The player object, missing or hostile.
        ['cd-no-player', (() => { const x = clone(S_MID.snap); delete x.player; return x; })()],
        ['cd-player-null', bust(x => { x.player = null; })],
        ['cd-player-is-array', bust(x => { x.player = []; })],
        ['cd-attrs-missing', bust(x => { delete x.player.attrs; delete x.player.potential; })],
        ['cd-attrs-are-strings', bust(x => { x.player.attrs = fill('sixty'); x.player.potential = fill('ninety'); })],
        ['cd-attrs-are-nan', bust(x => { x.player.attrs = fill(NaN); x.player.potential = fill(NaN); })],

        // Enum fields that no longer resolve. calcOVR() returns 0 on an
        // unresolvable role by design, so this is the state the dossier reports
        // an honest zero for rather than inventing a rating.
        ['cd-role-unknown', bust(x => { x.player.role = 'NOT_A_ROLE'; })],
        ['cd-region-bogus', bust(x => { x.player.region = 'ATLANTIS'; })],
        ['cd-club-id-dead', bust(x => { x.player.clubId = 'org_that_no_longer_exists'; })],

        // Collections.
        ['cd-history-holds-null', bust(x => { x.history = [null]; })],
        ['cd-history-not-array', bust(x => { x.history = 'fifteen seasons'; })],
        ['cd-awards-garbage', bust(x => { x.awards = [1, 'x', null]; })],
        ['cd-proficiency-is-array', bust(x => { x.player.proficiency = ['ahri', 'orianna']; })],
        ['cd-traits-null', bust(x => { x.player.traits = null; })],
        ['cd-club-is-array', bust(x => { x.club = [1, 2]; })],
        // A roster seat with a name and nothing else. This is the shape that
        // already crashed Card.svelte once -- card.quality.toLowerCase() on a
        // seat that has no quality.
        ['cd-roster-half-card', bust(x => {
            x.club = { teamId: x.player.clubId, momentum: 0.3, roster: { MID: { name: 'x' } }, changes: [] };
        })],

        // Strings a remote document can carry. The 5000-char handle proves no
        // layout depends on a bounded one; the bidi override proves nothing
        // remote reaches an attribute unescaped.
        ['cd-handle-5000-chars', bust(x => { x.player.handle = 'A'.repeat(5000); })],
        ['cd-handle-bidi-override', bust(x => {
            // U+202E RLO, U+202D LRO, U+200B ZWSP, built from code points so this
            // file stays ASCII (see the header). cleanText() strips all three.
            const RLO = String.fromCharCode(0x202E), LRO = String.fromCharCode(0x202D), ZWSP = String.fromCharCode(0x200B);
            x.player.handle = RLO + 'gnitaehc' + LRO + ZWSP + '<b>x</b>';
        })],

        // Numbers out of every sane range, both directions.
        ['cd-everything-negative', bust(x => {
            x.player.age = -30; x.player.startAge = -13; x.player.form = -100;
            x.player.hype = -5; x.player.chemistry = -50; x.player.valueMult = -3;
            x.player.attrs = fill(-40); x.player.potential = fill(-40);
            x.time = { year: -2027, week: -9 };
            x.money = { gold: -1000, followers: -1, legacy: -900 };
            x.soloq = { mmr: -1200, peakMMR: -1200, games: -10, wins: -4, losses: -6 };
            x.totals = { games: -60, wins: -30, losses: -30, kills: -1, deaths: -1, assists: -1, mvps: -1, pentakills: -1, ratingSum: -400, peakOVR: -80 };
        })],
        ['cd-infinity', bust(x => {
            x.player.age = Infinity; x.player.startAge = -Infinity; x.player.hype = Infinity;
            x.player.attrs = fill(Infinity); x.player.potential = fill(Infinity);
            x.time = { year: Infinity, week: Infinity };
            x.money = { gold: Infinity, followers: Infinity, legacy: Infinity };
            x.soloq = { mmr: Infinity, peakMMR: Infinity, games: Infinity, wins: Infinity, losses: Infinity };
            x.totals = { games: Infinity, wins: Infinity, losses: Infinity, kills: Infinity, deaths: Infinity, assists: Infinity, mvps: Infinity, pentakills: Infinity, ratingSum: Infinity, peakOVR: Infinity };
        })],

        // And the two shapes the screen is FOR: a finished Hall of Legends
        // career and a thirteen-year-old who has never been signed. Taken from
        // the board fixtures so they are the decoded documents, not snapshots.
        ['cd-well-formed-retired', fxRetired ? fxRetired.dossier : clone(S_RETIRED.snap)],
        ['cd-well-formed-rookie', fxRookie ? fxRookie.dossier : clone(S_PRECOMP.snap)],
    ];

    for (const [label, shape] of SHAPES) {
        // RAW -- the sanitiser bypassed.
        applyState(S_MID.snap);
        await render('CareerDossier(raw)', CD, { c: shape, mine: false, remote: null },
            label + '-raw', { minText: 120 });

        // ... and the same shape as a real downloaded document.
        const clean = throughBoard(label, shape);
        applyState(S_MID.snap);
        await render('CareerDossier(via board)', CD, { c: clean, mine: false, remote: null },
            label + '-sanitized', { minText: 120 });
    }

    // The remote-figures arm. `remote` overrides four displayed numbers, and a
    // row whose fields went missing must not print undefined where the score is.
    if (fxRetired) {
        applyState(S_MID.snap);
        await render('CareerDossier(remote)', CD, {
            c: fxRetired.dossier, mine: false, remote: B.remoteFiguresFrom(fxRetired.row),
        }, 'cd-remote-figures', { minText: 120 });

        applyState(S_MID.snap);
        await render('CareerDossier(remote)', CD, {
            c: fxRetired.dossier, mine: false, remote: B.remoteFiguresFrom(B.sanitizeRow('u_x', {})),
        }, 'cd-remote-empty-row', { minText: 120 });
    }

    // ---- SIGNATURE SLOTS, OWNER ARM --------------------------------------
    //  Every shape in the loop above renders with mine:false, and the panel
    //  that SPENDS a Second/Third Signature slot is gated on mine -- so without
    //  this block the markup that fills a slot has no render coverage at all.
    //  That is not a hypothetical: economy.signatureSlots() and
    //  contracts.addSignature() both shipped correct and the screen that calls
    //  them was never written, so buying both perks (740 legacy points) changed
    //  nothing anywhere and player.extraChampions could never leave []. The
    //  panel only draws once a slot is owned, which is exactly why no ordinary
    //  fixture reaches it -- none of them own the perks.
    {
        const champIds = Object.keys(K.CHAMPION_BY_ID || {});
        const sig = (perks, extras) => {
            const x = clone(S_MID.snap);
            x.inventory = (x.inventory && typeof x.inventory === 'object') ? x.inventory : {};
            x.inventory.perks = perks;
            x.player.extraChampions = extras;
            return x;
        };
        const SIG = [
            // One slot bought and free: the Add arm, enabled.
            ['cd-sig-slot-open', sig(['second_signature'], [])],
            // Both bought and both filled: the list arm, with Drop controls.
            ['cd-sig-slots-filled', sig(['second_signature', 'third_signature'], champIds.slice(0, 2))],
            // The champion-id rot shape. extraChampions is persisted as bare
            // ids exactly like player.champion, so a renamed champion lands
            // here, and the list must drop it rather than render a blank row.
            ['cd-sig-extras-dead-ids', sig(['second_signature', 'third_signature'], ['not_a_champion', null])],
            // Not an array at all -- the shape hydrate() would have clamped and
            // a hand-edited save would not.
            ['cd-sig-extras-not-array', sig(['second_signature'], 'ahri')],
            // Slots owned by a player who has retired: the panel must go read-only.
            ['cd-sig-slots-retired', (() => { const x = sig(['second_signature'], []); x.flags = { ...(x.flags || {}), retired: true }; return x; })()],
        ];
        for (const [label, shape] of SIG) {
            applyState(shape);
            await render('CareerDossier(mine)', CD, { c: shape, mine: true, remote: null },
                label, { minText: 120 });
        }
    }
}

// ---------------------------------------------------------------------------
//  CAREER SHELL
// ---------------------------------------------------------------------------
console.log('');
console.log('---- CAREER SHELL ----------------------------------------');
// created === false -> CreatePlayer branch
applyState(S_PRECOMP.snap);
{
    const blank = ST.blankCareer();
    ST.career.set(blank);
    storage.setItem('lurc_career', JSON.stringify(blank));
    await render('CareerShell', COMPONENT_DIR + 'CareerShell.svelte', {}, 'shell-created-false', { minText: 120 });
}

// each careerScreen value (CareerShell re-hydrates on mount, so also render the
// screen component directly for the same value -- covered above)
for (const s of K.CAREER_SCREENS) {
    applyState(S_MID.snap);
    ST.careerScreen.set(s.id);
    await render('CareerShell(screen=' + s.id + ')', COMPONENT_DIR + 'CareerShell.svelte', {}, 'shell-screen-' + s.id, { minText: 120 });
}

// ---------------------------------------------------------------------------
//  MATCH DAY -- every stage of $matchState
// ---------------------------------------------------------------------------
console.log('');
console.log('---- MATCH DAY -------------------------------------------');

function buildMatchStages() {
    const stages = [];
    applyState(S_MID.snap);
    const c = cur();

    const opp = (Array.isArray(c.season.schedule) ? c.season.schedule : [])
        .map(f => f && f.opponentId).find(Boolean) || null;

    const fresh = safe('buildMatch bo1', () => M.buildMatch(cur(), { opponentId: opp, bestOf: 1 }), null);
    if (fresh) {
        const f2 = clone(fresh);
        f2.playerPlays = true;
        stages.push(['fresh', f2]);

        // Champion select, which is what a fresh game actually opens on now.
        // Three variants because the screen changes shape between them: a
        // counter pick shows the enemy champion and a matchup verdict, a blind
        // pick shows neither, and a draft carrying dead ids must not strand the
        // player on an empty panel.
        // buildMatch only rolls a draft when the player is actually in the
        // lineup, and this fixture can come back benched - so the draft is
        // rolled explicitly rather than relying on which way that fell.
        if (!f2.draft || !Array.isArray(f2.draft.options)) {
            f2.draft = safe('rollDraft', () => M.rollDraft(cur(), f2.oppStrength), null) || f2.draft;
        }

        if (f2.draft && Array.isArray(f2.draft.options)) {
            const counter = clone(f2);
            counter.draft = { ...counter.draft, counter: true, picked: null };
            stages.push(['draft-counter', counter]);

            const blind = clone(f2);
            blind.draft = { ...blind.draft, counter: false, enemyId: null, picked: null };
            stages.push(['draft-blind', blind]);

            const rotten = clone(f2);
            rotten.draft = { ...rotten.draft, options: ['no_such_champ', 'also_fake'], enemyId: 'ghost', picked: null };
            stages.push(['draft-dead-ids', rotten]);

            // ---- THE META CHIP -------------------------------------------
            //  Champion select prints where each option sits in THIS split's
            //  meta, and the tone comes from constants.metaTierFor(champion,
            //  year, split) -- a property of the ROLE POOL and the calendar, not
            //  of the match object. So which of the three tones a run renders is
            //  decided by the seed: a draft can easily come back three
            //  Contested picks and leave the strong and weak arms unrendered.
            //
            //  Extending the existing draft states rather than inventing a path:
            //  the same match object, the same `draft.options` array of bare
            //  champion ids, only the ids chosen so each band is guaranteed.
            const cNow = cur();
            const yearNow = Number(cNow.time && cNow.time.year) || 2027;
            const splitNow = safe('splitForWeek', () => K.splitForWeek(Number(cNow.time && cNow.time.week) || 1), 'spring');
            const roleNow = (cNow.player && cNow.player.role) || 'MID';
            const poolNow = (safe('championsForRole', () => K.championsForRole(roleNow), []) || [])
                .map(ch => ch && ch.id).filter(Boolean);
            const band = (tier) => poolNow.filter(id => {
                const t = safe('metaTierFor', () => K.metaTierFor(id, yearNow, splitNow), 0);
                return tier > 0 ? t > 0 : (tier < 0 ? t < 0 : t === 0);
            });
            const strongIds = band(1), evenIds = band(0), weakIds = band(-1);
            const META_DRAFTS = [
                ['draft-meta-strong', strongIds.slice(0, 3)],
                ['draft-meta-weak', weakIds.slice(0, 3)],
                ['draft-meta-mixed', [strongIds[0], evenIds[0], weakIds[0]].filter(Boolean)],
            ];
            for (const [label, ids] of META_DRAFTS) {
                if (ids.length < 2) continue;   // this split's pool has no such band
                const v = clone(f2);
                v.draft = { ...v.draft, counter: true, picked: null, options: ids };
                stages.push([label, v]);
            }

            // ...and the same chip on the LOCKED-IN strip, which is a different
            // reader (MatchDay's `lockedIn`, via draftOption) on a different
            // stage -- an answered champion select is no longer stage 'draft'.
            const lockedIds = strongIds.length ? strongIds : (evenIds.length ? evenIds : poolNow);
            if (lockedIds.length) {
                const locked = clone(f2);
                locked.draft = { ...locked.draft, counter: true, picked: lockedIds[0] };
                stages.push(['draft-locked-in', locked]);

                const lockedBlind = clone(f2);
                lockedBlind.draft = { ...lockedBlind.draft, counter: false, enemyId: null, picked: lockedIds[0] };
                stages.push(['draft-locked-in-blind', lockedBlind]);
            }
            // A pick that no longer resolves, locked in. draftOption() has to
            // come back null and the strip has to disappear rather than print a
            // nameless champion with an undefined meta band.
            const lockedDead = clone(f2);
            lockedDead.draft = { ...lockedDead.draft, counter: true, picked: 'no_such_champ' };
            stages.push(['draft-locked-in-dead-id', lockedDead]);
        }

        // mid-game: two decisions resolved
        let m = clone(f2);
        for (let i = 0; i < 2; i++) {
            const ev = safe('nextEvent', () => M.nextEvent(m), null);
            if (!ev || !Array.isArray(ev.options) || !ev.options.length) break;
            const out = safe('resolveDecision', () => M.resolveDecision(cur(), m, ev.options[0].id), null);
            if (!out || !out.match) break;
            m = out.match;
        }
        stages.push(['mid-game', clone(m)]);

        // queue exhausted before finishGame
        let q = clone(m);
        let guard = 0;
        while (guard++ < 20) {
            const ev = safe('nextEvent', () => M.nextEvent(q), null);
            if (!ev || !Array.isArray(ev.options) || !ev.options.length) break;
            const out = safe('resolveDecision', () => M.resolveDecision(cur(), q, ev.options[0].id), null);
            if (!out || !out.match) break;
            q = out.match;
        }
        stages.push(['queue-exhausted', clone(q)]);

        // benched series
        const b = clone(f2);
        b.playerPlays = false;
        b.benchReason = b.benchReason || 'The coach went with somebody else.';
        stages.push(['benched', b]);
    }

    // Bo5 between games, and a completed series
    const bo5 = safe('buildMatch bo5', () => M.buildMatch(cur(), { opponentId: opp, bestOf: 5, phase: 'spring_po' }), null);
    if (bo5) {
        const m = clone(bo5);
        m.playerPlays = true;
        const fg = safe('finishGame', () => M.finishGame(cur(), m), null);
        if (fg && fg.match) stages.push(['bo5-between-games', clone(fg.match)]);

        const doneM = clone(bo5);
        doneM.playerPlays = true;
        doneM.seriesScore = [3, 1];
        doneM.game = 5;
        doneM.done = true;
        stages.push(['series-complete', doneM]);
    }

    // and an engine-built one straight off the schedule
    applyState(S_MID.snap);
    const cc = cur();
    const next = (Array.isArray(cc.season.schedule) ? cc.season.schedule : []).find(f => f && !f.played);
    if (next) {
        const m0 = safe('startFixture', () => G.startFixture(next.id), null);
        if (m0) stages.push(['engine-startFixture', clone(m0)]);
    }

    // and the shapes a stale save can hand over
    stages.push(['match-empty-object', {}]);
    return stages;
}

const MATCH_STAGES = buildMatchStages();
for (const [stage, m] of MATCH_STAGES) {
    applyState(S_MID.snap);
    ST.matchState.set(clone(m));
    await render('MatchDay', COMPONENT_DIR + 'MatchDay.svelte', {}, 'match-' + stage, {
        minText: 60,
        // boot() finishes an already-complete series and clears matchState; the
        // shell then unmounts this screen, so an empty render is the right answer.
        allowEmptyIf: () => readStore(ST.matchState) === null,
    });
}
// MatchDay with no match at all -- the state after a crash-reload
applyState(S_MID.snap);
ST.matchState.set(null);
await render('MatchDay', COMPONENT_DIR + 'MatchDay.svelte', {}, 'match-null', { minChars: 0, minText: 0 });

// MatchDay against the hostile save
applyState(S_HOSTILE.snap);
if (MATCH_STAGES.length) {
    ST.matchState.set(clone(MATCH_STAGES[0][1]));
    await render('MatchDay', COMPONENT_DIR + 'MatchDay.svelte', {}, 'match-fresh-on-hostile-save', { minText: 60 });
}

// ---------------------------------------------------------------------------
//  MATCH DAY -- THE RESULT SCREEN AND THE PER-GAME INTERSTITIAL
//
//  These are the two screens a player who plays a match BY HAND actually ends
//  on, and until this block neither of them had ever been rendered by this
//  harness. `finalResult` and `gameCard` are component-locals assigned only
//  inside event handlers -- doFinishMatch() and doFinishGame() -- and SSR runs
//  no handlers, so `stage` never left 'decision' and the entire end-of-series
//  screen plus the whole per-game card appeared in ZERO of 1207 dump files.
//  Every state above stops at champion select, a decision, an outcome or the
//  bench.
//
//  That hole is what shipped the bug: a player finished a hand-played game, saw
//  the interstitial -- won/lost, their own KDA, CS and rating and nothing else
//  -- and reported that the scoreboard was missing. It was not missing, it was
//  one click further on, and no check in this repo could see either panel.
//
//  MatchDay now takes `initialStage` ('game' | 'result') and `initialResult`,
//  the same harness-only idiom as Shop.svelte's `initialTab` above: boot() calls
//  harnessBoot() instead of the live path, builds the two locals from a plain
//  object and lands on the named stage. Absent -- which is every real caller --
//  is ordinary play, completely unchanged.
//
//  BOTH props are required, AND a non-null $matchState: the whole screen sits
//  behind {#if m} and the result markup still reads m.myTeamName as its second
//  fallback. The board fixtures are the hoisted ones, so what these two screens
//  are driven with is byte-identical to what the result overlay and the Hub get.
// ---------------------------------------------------------------------------
console.log('');
console.log('---- MATCH DAY: RESULT SCREEN + INTERSTITIAL -------------');
{
    const MD = COMPONENT_DIR + 'MatchDay.svelte';
    // A real built match where one exists, so the header, the series pips and
    // the team names around both panels are the engine's own and not a stub.
    const LIVE = MATCH_STAGES.length ? clone(MATCH_STAGES[0][1]) : {};

    /** A finishMatch()-shaped result. Every field the two screens read, so a
     *  state that breaks one thing breaks exactly that one thing. */
    const mdRes = (over) => ({
        won: true,
        played: true,
        score: [3, 2],
        rating: 7.4,
        kda: { k: 12, d: 4, a: 9 },
        cs: 268,
        myTeamName: 'Your Team',
        opponentName: 'T1',
        week: 9,
        year: 2029,
        headline: 'A series that went the distance.',
        moraleDelta: 4,
        ...over,
    });
    const noGames = (over) => { const r = mdRes(over); delete r.games; return r; };

    const MD_STATES = [
        // ---- the shapes the model actually produces --------------------
        ['bo1-with-a-board', mdRes({ games: clone(bo1), score: [1, 0] })],
        ['bo5-five-boards', mdRes({ games: clone(bo5) })],
        // One game of a series benched: on the result screen the tab strip has
        // to skip it, and on the interstitial the LAST game is the one that
        // just ended, so this drives a real board there.
        ['bo3-middle-game-benched', mdRes({ games: clone(bo3Benched), score: [2, 1] })],
        // ---- absent, which is legal and permanent ----------------------
        ['games-empty', mdRes({ games: [] })],
        // No `games` key at all: every result written before boards existed.
        // Absent must render NOTHING -- not an empty table, not a row of dashes.
        ['games-key-absent', noGames({})],
        ['benched-result', noGames({ played: false, won: false, score: [0, 3], rating: 0, cs: 0, kda: { k: 0, d: 0, a: 0 }, benchReason: 'The coach went with somebody else.' })],
        // The model never writes a benched result carrying a board, which is
        // exactly why it is here: the bench copy and the scoreboard are two
        // independent branches of the same panel.
        ['benched-with-a-board-anyway', mdRes({ played: false, won: false, benchReason: 'The coach went with somebody else.', games: clone(bo1) })],
        ['a-loss-with-boards', mdRes({ won: false, score: [1, 3], rating: 4.9, games: clone(bo5) })],

        // ---- rot on the PROP ITSELF, which is a brand new surface -------
        //  initialResult is whatever a future caller passes. harnessBoot()
        //  coerces a non-object to {}, and every one of these still has to land
        //  on a written screen rather than a blank one.
        ['result-is-null', null],
        ['result-is-a-string', 'a result'],
        ['result-is-an-array', []],
        ['result-is-a-number', 7],
        ['result-is-an-empty-object', {}],

        // ---- rot INSIDE the board --------------------------------------
        ['board-is-a-string', mdRes({ games: rot(g => { g.board = 'ally 5 enemy 5'; }) })],
        ['board-is-an-array', mdRes({ games: rot(g => { g.board = [{ name: 'x' }]; }) })],
        ['board-is-null', mdRes({ games: rot(g => { g.board = null; }) })],
        ['ally-is-null', mdRes({ games: rot(g => { g.board.ally = null; }) })],
        ['enemy-is-null', mdRes({ games: rot(g => { g.board.enemy = null; }) })],
        ['ally-is-a-string', mdRes({ games: rot(g => { g.board.ally = 'five players'; }) })],
        ['row-missing-kda', mdRes({ games: rot(g => { delete g.board.ally[1].k; delete g.board.ally[1].d; delete g.board.ally[1].a; }) })],
        ['row-kda-is-junk', mdRes({ games: rot(g => { g.board.enemy[2].k = 'lots'; g.board.enemy[2].d = null; g.board.enemy[2].a = NaN; }) })],
        // A champion id is permanent save data, so a renamed or retired one is
        // the one rot shape that can arrive from an HONEST save. It must print
        // nothing -- never the raw id.
        ['dead-champion-id', mdRes({ games: rot(g => { g.board.ally[0].champ = 'champion_that_never_was'; }) })],
        ['champion-is-not-a-string', mdRes({ games: rot(g => { g.board.enemy[0].champ = 7; }) })],
        ['six-rows-on-one-side', mdRes({ games: rot(g => {
            g.board.ally.push({ name: 'Sixth', role: 'TOP', champ: CHAMP_IDS[60] || '', k: 0, d: 0, a: 0 });
        }) })],
        ['four-rows-on-one-side', mdRes({ games: rot(g => { g.board.enemy.pop(); }) })],
        // The `me` flag is what puts the You chip on a row. Missing, and both
        // panels still owe ten players rather than nothing.
        ['me-flag-missing', mdRes({ games: rot(g => { for (const r of g.board.ally) delete r.me; }) })],
        ['me-flag-on-every-row', mdRes({ games: rot(g => { for (const r of g.board.ally) r.me = true; }) })],
        ['me-flag-on-the-enemy', mdRes({ games: rot(g => { g.board.enemy[2].me = true; }) })],
        ['rows-are-null', mdRes({ games: rot(g => { g.board.ally = [null, undefined, 0, '', false]; }) })],
        ['row-has-no-role', mdRes({ games: rot(g => { delete g.board.enemy[1].role; g.board.enemy[2].role = 'BOTTOM'; }) })],
        ['row-name-is-blank', mdRes({ games: rot(g => { g.board.ally[4].name = '   '; g.board.enemy[4].name = 42; }) })],
        ['games-is-a-string', mdRes({ games: 'the five games' })],
        ['games-holds-junk', mdRes({ games: [null, 7, 'game one', { board: {} }] })],
        // The interstitial reads the LAST entry of the log, so a junk tail is
        // its own shape rather than a repeat of the one above.
        ['last-game-is-junk', mdRes({ games: [sbGameRow(1, true, 0, 'MID'), null] })],
        // Numbers the two screens print directly.
        ['scores-are-garbage', mdRes({ score: ['x', null], rating: 'good', cs: NaN, kda: { k: 'a', d: undefined, a: Infinity }, games: clone(bo1) })],
    ];

    for (const [label, res] of MD_STATES) {
        for (const stage of ['result', 'game']) {
            applyState(S_MID.snap);
            ST.matchState.set(clone(LIVE));
            await render('MatchDay(' + stage + ')', MD,
                { initialStage: stage, initialResult: res },
                'md-' + stage + '-' + label, { minText: 60 });
        }
    }

    // Both screens on the hostile save, where the club, the contract and the
    // schedule are all gone. The result markup falls through to `m` and then to
    // a literal for both team names, and this is the state that proves it.
    for (const stage of ['result', 'game']) {
        applyState(S_HOSTILE.snap);
        ST.matchState.set(clone(LIVE));
        await render('MatchDay(' + stage + ')', MD,
            { initialStage: stage, initialResult: mdRes({ games: clone(bo5) }) },
            'md-' + stage + '-on-hostile-save', { minText: 60 });
    }

    // The prop surface, got wrong three ways by a future caller.
    //  - a stage this build has never heard of falls back to ORDINARY play,
    //    which is the behaviour that keeps the seam inert in the shipped app;
    //  - initialStage alone, with no result, is the {} coercion;
    //  - and a null $matchState is the one case that renders nothing at all,
    //    because the whole screen is behind {#if m}. That is correct, so it is
    //    driven with the empty-page check turned off rather than left untested.
    applyState(S_MID.snap);
    ST.matchState.set(clone(LIVE));
    await render('MatchDay', MD, { initialStage: 'not_a_stage', initialResult: mdRes({ games: clone(bo1) }) },
        'md-stage-is-unknown', { minText: 60 });

    for (const stage of ['result', 'game']) {
        applyState(S_MID.snap);
        ST.matchState.set(clone(LIVE));
        await render('MatchDay(' + stage + ')', MD, { initialStage: stage },
            'md-' + stage + '-no-result-prop', { minText: 60 });

        applyState(S_MID.snap);
        ST.matchState.set(null);
        await render('MatchDay(' + stage + ')', MD,
            { initialStage: stage, initialResult: mdRes({ games: clone(bo1) }) },
            'md-' + stage + '-no-matchstate', { minChars: 0, minText: 0 });
    }

    // A match object that is a bare {} underneath a full result: the shape a
    // stale save hands over, with both panels drawing over the top of it.
    for (const stage of ['result', 'game']) {
        applyState(S_MID.snap);
        ST.matchState.set({});
        await render('MatchDay(' + stage + ')', MD,
            { initialStage: stage, initialResult: mdRes({ games: clone(bo5) }) },
            'md-' + stage + '-empty-match-object', { minText: 60 });
    }
    ST.matchState.set(null);
}

// ---------------------------------------------------------------------------
//  CAREER OVERLAY -- every kind, valid and malformed
// ---------------------------------------------------------------------------
console.log('');
console.log('---- CAREER OVERLAY --------------------------------------');

// The pre-game and first-time-at-a-tournament popups both ride the EXISTING
// `event` kind -- no new overlay branch, no new accent, no new dismissible rule
// -- so what they add here is the same markup driven by content the weekly roll
// can never produce. Hoisted out of overlayPayloads() so the hostile-save loop
// below can reach them without rebuilding the fixtures.
let PREGAME_PAYLOAD = null, FIRSTTIME_PAYLOAD = null;

function overlayPayloads() {
    applyState(S_MID.snap);
    const c = cur();
    const out = [];

    const ev = safe('rollWeeklyEvent', () => EV.rollWeeklyEvent(cur()), null) || EV.EVENT_POOL[0];
    out.push(['event-valid', 'event', ev]);

    // A real pre-game draw. rollPreGameEvent() rolls PREGAME_CHANCE before it
    // filters, so it is asked repeatedly rather than once: a single call comes
    // back null on nearly half the seeds and the harness would silently fall
    // through to the pool object, which is the one shape that has NOT had its
    // `text` resolved.
    const PREGAME_CTX = {
        phase: 'worlds', phaseName: 'Worlds', label: 'Quarterfinal',
        opponentId: 'lck_t1', opponentName: 'T1', bestOf: 5, kind: 'bracket',
    };
    for (let i = 0; i < 12 && !PREGAME_PAYLOAD; i++) {
        PREGAME_PAYLOAD = safe('rollPreGameEvent', () => EV.rollPreGameEvent(cur(), PREGAME_CTX), null);
    }
    if (!PREGAME_PAYLOAD) PREGAME_PAYLOAD = EV.PREGAME_POOL[0];
    out.push(['event-pregame', 'event', PREGAME_PAYLOAD]);

    FIRSTTIME_PAYLOAD = safe('firstTimeEvent', () => EV.firstTimeEvent(cur(), 'worlds'), null)
        || EV.FIRST_TIME_EVENTS.worlds;
    out.push(['event-first-time-worlds', 'event', FIRSTTIME_PAYLOAD]);

    const iv = safe('rollInterview', () => EV.rollInterview(cur(), c.lastMatch), null)
        || (EV.INTERVIEW_POOL[0] && { ...EV.INTERVIEW_POOL[0], question: EV.INTERVIEW_POOL[0].question || 'How did it feel?' });
    out.push(['interview-valid', 'interview', iv]);

    out.push(['result-valid', 'result', c.lastMatch || {
        won: true, score: [2, 1], rating: 7.4, kda: { k: 5, d: 2, a: 8 }, cs: 260,
        myTeamName: 'Your team', opponentName: 'Opponent', played: true, week: 9, year: c.time.year,
    }]);

    const offer = (Array.isArray(c.offers) && c.offers[0]) || null;
    out.push(['offer-valid', 'offer', offer || { id: 'x1', teamName: 'Some Org', salary: 1200, years: 2, signingBonus: 0, releaseClause: 0, interest: 60, status: 'starter', role: 'MID', region: 'LEC', tier: 1 }]);

    const awards = (Array.isArray(c.awards) && c.awards.length) ? c.awards : [
        { id: 'a1', name: 'Rookie of the Split', tier: 'major', year: c.time.year, split: 'spring', legacyPoints: 120 },
        { id: 'a2', name: 'All-Pro Second Team', tier: 'minor', year: c.time.year, split: 'spring', legacyPoints: 40 },
    ];
    out.push(['awards-valid', 'awards', awards]);

    out.push(['season-valid', 'season', {
        year: c.time.year, split: 'spring', record: { w: 12, l: 6 }, placement: 3, teams: 10,
        avgRating: 7.12, awards, headline: 'A third place finish and a playoff run.',
    }]);

    out.push(['retire-valid', 'retire', null]);

    // A revealed genetic trait, and a breakthrough split. Both are raised by the
    // engine at a year rollover / split close, so neither is reachable from a
    // static snapshot -- they are built here from the real tables.
    const trait = (K.TRAITS && K.TRAITS[0]) || null;
    out.push(['trait-valid', 'trait', {
        trait: trait || { id: 'x', name: 'Talented', rarity: 'uncommon', icon: '\u2728', blurb: 'A trait.' },
        applied: { mec: 4, lne: 2, cmp: 2 },
        potBefore: 84, potAfter: 88, age: 16,
    }]);
    out.push(['breakthrough-valid', 'breakthrough', {
        points: 2,
        applied: { mec: 2, cmp: 2, knw: 2 },
        attrs: [
            { key: 'mec', name: 'Mechanics', abbr: 'MEC', color: '#ef4444', gained: 2, ceiling: 88 },
            { key: 'cmp', name: 'Composure', abbr: 'CMP', color: '#a855f7', gained: 2, ceiling: 81 },
        ],
        potOVR: 89,
    }]);

    // malformed / missing payloads
    for (const kind of ['event', 'interview', 'result', 'offer', 'awards', 'season', 'retire', 'trait', 'breakthrough']) {
        out.push([kind + '-payload-null', kind, null]);
        out.push([kind + '-payload-garbage', kind, kind === 'awards' ? [null, undefined, 7] : { nope: true, options: [] }]);
    }

    // ... and the two ways the new pools go wrong specifically. A pre-game entry
    // pushed RAW still has `text` as the FUNCTION rollPreGameEvent() is supposed
    // to resolve, which the template would interpolate; a first-time entry that
    // lost its options is the undismissable overlay with nothing to press.
    const rawFn = EV.PREGAME_POOL.find(e => e && typeof e.text === 'function') || EV.PREGAME_POOL[0];
    out.push(['event-pregame-text-unresolved', 'event', rawFn]);
    out.push(['event-first-time-no-options', 'event', { ...(EV.FIRST_TIME_EVENTS.worlds || {}), options: [] }]);

    out.push(['unknown-kind', 'not_a_kind', { a: 1 }]);
    return out;
}

for (const [label, kind, payload] of overlayPayloads()) {
    applyState(kind === 'retire' && label === 'retire-valid' ? S_VETERAN.snap : S_MID.snap);
    ST.careerOverlay.set({ kind, payload });
    await render('CareerOverlay(' + kind + ')', COMPONENT_DIR + 'CareerOverlay.svelte', {}, 'overlay-' + label, { minText: 40 });
}
// retire overlay on an already-retired save takes the retrospective branch
applyState(S_RETIRED.snap);
ST.careerOverlay.set({ kind: 'retire', payload: null });
await render('CareerOverlay(retire)', COMPONENT_DIR + 'CareerOverlay.svelte', {}, 'overlay-retire-retrospective', { minText: 120 });

// every overlay kind against the hostile save
for (const kind of ['event', 'interview', 'result', 'offer', 'awards', 'season', 'retire', 'trait', 'breakthrough']) {
    applyState(S_HOSTILE.snap);
    ST.careerOverlay.set({ kind, payload: kind === 'awards' ? [{ id: 'z' }] : { id: 'malformed_offer' } });
    await render('CareerOverlay(' + kind + ')', COMPONENT_DIR + 'CareerOverlay.svelte', {}, 'overlay-hostile-' + kind, { minText: 40 });
}

// ... and the two new payloads against it as well. The loop above only ever
// hands `event` a bare id, so a pre-game or first-time popup raised on a save
// whose club, contract and schedule are all gone gets no coverage from it.
for (const [label, payload] of [['pregame', PREGAME_PAYLOAD], ['first-time', FIRSTTIME_PAYLOAD]]) {
    applyState(S_HOSTILE.snap);
    ST.careerOverlay.set({ kind: 'event', payload });
    await render('CareerOverlay(event)', COMPONENT_DIR + 'CareerOverlay.svelte', {}, 'overlay-hostile-' + label, { minText: 40 });
}

// ---- THE MORALE-NOTE BREAKDOWN ------------------------------------------
//  match.finishMatch writes ready-to-print sentences into result.moraleNotes,
//  and the RESULT OVERLAY is the only thing in the app that renders them:
//  MatchDay owns a second copy of the same list, but it hangs off `finalResult`,
//  which is assigned inside an event handler SSR never runs.
//
//  ABSENT is the pre-change save shape -- every result persisted before the
//  field existed carries none -- so it is driven as a state of its own rather
//  than assumed, alongside the rot shapes a hand-edited save can hold.
{
    const CO = COMPONENT_DIR + 'CareerOverlay.svelte';
    const cM = clone(S_MID.snap);
    const RES_BASE = (cM.lastMatch && typeof cM.lastMatch === 'object' && !Array.isArray(cM.lastMatch))
        ? clone(cM.lastMatch)
        : {
            won: false, score: [1, 2], rating: 5.4, kda: { k: 2, d: 7, a: 3 }, cs: 190,
            myTeamName: 'Your team', opponentName: 'Opponent', played: true,
            week: 9, year: Number(cM.time && cM.time.year) || 2027,
        };
    const NOTES = [
        // The state that has to keep rendering exactly as it always did.
        ['absent', undefined],
        ['populated', ['A 1.2 KDA across the series cost you.', 'Three straight losses before this one.']],
        ['a-string', 'you played badly'],
        ['holds-objects', [{ text: 'x' }, null, '', 7]],
        ['is-null', null],
        ['is-empty', []],
        ['holds-whitespace', ['   ', '\t']],
    ];
    for (const [label, notes] of NOTES) {
        const res = { ...RES_BASE, moraleDelta: -6 };
        if (notes === undefined) delete res.moraleNotes; else res.moraleNotes = notes;
        applyState(S_MID.snap);
        ST.careerOverlay.set({ kind: 'result', payload: res });
        await render('CareerOverlay(result)', CO, {}, 'overlay-morale-notes-' + label, { minText: 40 });
    }
    // A net of exactly zero WITH notes attached is the one case the row must not
    // paint as a loss, and it is unreachable from any result the engine wrote.
    {
        const res = { ...RES_BASE, moraleDelta: 0, moraleNotes: ['A 1.4 KDA is not what won that.'] };
        applyState(S_MID.snap);
        ST.careerOverlay.set({ kind: 'result', payload: res });
        await render('CareerOverlay(result)', CO, {}, 'overlay-morale-notes-net-zero', { minText: 40 });
    }

    // ---- THE TEN-PLAYER SCOREBOARD --------------------------------------
    //  match.js hangs a `board` off every entry of the game log and finishMatch
    //  persists the lot as result.games. NO ORDINARY FIXTURE IN THIS FILE OWNS
    //  ONE: every state above is a saved career whose lastMatch was written by a
    //  path that either predates boards or was benched, so the whole panel --
    //  the tabs, the two sides, the You chip, the champion column -- would
    //  render green while being unreachable. That is precisely how the
    //  signature-slot perk shipped with a correct model, correct markup and no
    //  fixture that could see it.
    //
    //  Driven through the RESULT OVERLAY here. MatchDay's own two copies of the
    //  panel -- the end-of-series screen and the per-game interstitial -- hang
    //  off `finalResult` / `gameCard`, locals assigned inside event handlers SSR
    //  never runs, and they are driven through the harness props in the MATCH
    //  DAY: RESULT SCREEN block further down. The overlay is also the panel most
    //  players actually see, because roughly half a career's games are simmed
    //  from the Hub or the Calendar.
    //
    //  The board fixtures themselves are hoisted to module scope (see SCOREBOARD
    //  FIXTURES) so this block, the Hub states and MatchDay all drive the exact
    //  same shapes.
    const SB_STATES = [
        // ---- the shapes the model actually produces --------------------
        ['bo1-full', bo1],
        ['bo5-series', bo5],
        // A series where one game was benched: the tab strip must survive a
        // board missing from the MIDDLE of the list, not only off the end.
        ['bo3-one-game-benched', bo3Benched],
        // ---- absent, which is legal and permanent -----------------------
        ['board-absent', [sbGameNoBoard(1, true)]],
        ['games-absent', undefined],
        ['games-empty', []],
        // ---- rot --------------------------------------------------------
        ['board-is-a-string', rot(g => { g.board = 'ally 5 enemy 5'; })],
        ['board-is-an-array', rot(g => { g.board = [{ name: 'x' }]; })],
        ['board-is-null', rot(g => { g.board = null; })],
        ['ally-null', rot(g => { g.board.ally = null; })],
        ['enemy-null', rot(g => { g.board.enemy = null; })],
        ['ally-is-a-string', rot(g => { g.board.ally = 'five players'; })],
        ['row-missing-kda', rot(g => { delete g.board.ally[1].k; delete g.board.ally[1].d; delete g.board.ally[1].a; })],
        ['row-kda-is-junk', rot(g => { g.board.enemy[2].k = 'lots'; g.board.enemy[2].d = null; g.board.enemy[2].a = NaN; })],
        // A champion id is permanent save data, so a renamed or retired one is
        // the one rot shape that can arrive from an HONEST save.
        ['dead-champion-id', rot(g => { g.board.ally[0].champ = 'champion_that_never_was'; })],
        ['champion-is-not-a-string', rot(g => { g.board.enemy[0].champ = 7; })],
        ['no-champion-at-all', rot(g => { g.board.ally[3].champ = ''; })],
        ['six-rows-on-one-side', rot(g => {
            g.board.ally.push({ name: 'Sixth', role: 'TOP', champ: CHAMP_IDS[60] || '', k: 0, d: 0, a: 0 });
        })],
        ['four-rows-on-one-side', rot(g => { g.board.enemy.pop(); })],
        // The `me` flag is what puts the You chip on a row. Missing, and the
        // panel must still render ten players rather than nothing.
        ['me-flag-missing', rot(g => { for (const r of g.board.ally) delete r.me; })],
        ['me-flag-on-every-row', rot(g => { for (const r of g.board.ally) r.me = true; })],
        ['me-flag-on-the-enemy', rot(g => { g.board.enemy[2].me = true; })],
        ['rows-are-null', rot(g => { g.board.ally = [null, undefined, 0, '', false]; })],
        ['row-has-no-role', rot(g => { delete g.board.enemy[1].role; g.board.enemy[2].role = 'BOTTOM'; })],
        ['row-name-is-blank', rot(g => { g.board.ally[4].name = '   '; g.board.enemy[4].name = 42; })],
        ['games-is-a-string', 'the five games'],
        ['games-holds-junk', [null, 7, 'game one', { board: {} }]],
    ];

    for (const [label, games] of SB_STATES) {
        const res = { ...RES_BASE, played: true, won: true, score: [3, 2] };
        if (games === undefined) delete res.games; else res.games = games;
        applyState(S_MID.snap);
        ST.careerOverlay.set({ kind: 'result', payload: res });
        await render('CareerOverlay(result)', CO, {}, 'overlay-scoreboard-' + label, { minText: 40 });
    }

    // A benched result carrying a full board anyway. The model never writes
    // this, which is exactly why it is here: the bench interstitial and the
    // scoreboard are two independent branches of the same panel.
    {
        const res = { ...RES_BASE, played: false, benchReason: 'The coach went with somebody else.', games: bo1 };
        applyState(S_MID.snap);
        ST.careerOverlay.set({ kind: 'result', payload: res });
        await render('CareerOverlay(result)', CO, {}, 'overlay-scoreboard-benched-with-board', { minText: 40 });
    }
    // ...and the whole thing on the hostile save, where the club, the contract
    // and the schedule are all gone and res.myTeamName is whatever was in it.
    for (const [label, games] of [['bo5', bo5], ['rot', rot(g => { g.board.ally = null; })]]) {
        applyState(S_HOSTILE.snap);
        ST.careerOverlay.set({ kind: 'result', payload: { ...RES_BASE, games } });
        await render('CareerOverlay(result)', CO, {}, 'overlay-scoreboard-hostile-' + label, { minText: 40 });
    }

    // The same payloads on MatchDay. Its own copy of the panel hangs off
    // `finalResult` and SSR cannot reach it, but sbGame/sbRow and the `boards`
    // reactive statement are the SAME code compiled into a second component, so
    // a match whose game log carries boards still drives the normaliser and
    // proves the template compiles around it.
    for (const [label, log] of [['bo1', bo1], ['bo5', bo5], ['rot', rot(g => { g.board = 'x'; })]]) {
        if (!MATCH_STAGES.length) break;
        applyState(S_MID.snap);
        const m = clone(MATCH_STAGES[0][1]);
        m.gameLog = clone(log);
        m.games = clone(log);
        ST.matchState.set(m);
        await render('MatchDay', COMPONENT_DIR + 'MatchDay.svelte', {}, 'match-scoreboard-' + label, {
            minText: 60,
            allowEmptyIf: () => readStore(ST.matchState) === null,
        });
    }
    ST.matchState.set(null);
}

// ---------------------------------------------------------------------------
//  MINIGAMES
// ---------------------------------------------------------------------------
console.log('');
console.log('---- MINIGAMES -------------------------------------------');

const MINIGAMES = [
    ['ComboGame',       'combo',     'mec'],
    ['WaveControlGame', 'wave',      'lne'],
    ['WardMemoryGame',  'ward',      'map'],
    ['FocusFireGame',   'focus',     'tmf'],
    ['ClutchGame',      'clutch',    'cmp'],
    ['ShotcallGame',    'shotcall',  'ldr'],
    ['ChampPoolGame',   'pool',      'chp'],
    ['KnowledgeGame',   'knowledge', 'knw'],
];
// Every minigame must be reachable from a real DRILLS row, or the matrix below
// is quietly testing the fallback path instead of the real one.
for (const [name, , attr] of MINIGAMES) {
    if (!TR.DRILLS.some(d => d && d.attr === attr)) {
        console.error('HARNESS BUG: no DRILLS row for attr "' + attr + '" (' + name + ')');
        process.exit(2);
    }
}

function drillFor(attrPrefix, difficulty) {
    const exact = TR.DRILLS.find(d => d && d.attr === attrPrefix && Number(d.tier) === difficulty);
    if (exact) return exact;
    const byAttr = TR.DRILLS.filter(d => d && d.attr === attrPrefix);
    if (byAttr.length) return byAttr[Math.min(byAttr.length - 1, difficulty - 1)];
    return TR.DRILLS[Math.min(TR.DRILLS.length - 1, difficulty - 1)] || null;
}

applyState(S_MID.snap);
for (const [name, gameId, attr] of MINIGAMES) {
    const rel = COMPONENT_DIR + 'minigames/' + name + '.svelte';
    for (const difficulty of [1, 2, 3]) {
        const drill = drillFor(attr, difficulty);
        applyState(S_MID.snap);
        await render(name, rel, { difficulty, drill, onComplete: () => {}, onQuit: () => {} },
            `d${difficulty}-drill-${drill ? drill.id : 'none'}`, { minText: 40 });
    }
    applyState(S_MID.snap);
    await render(name, rel, { difficulty: 1, drill: null, onComplete: () => {}, onQuit: () => {} },
        'd1-drill-null', { minText: 40 });
    // and one out-of-range difficulty, the way a corrupt drill row would arrive
    applyState(S_MID.snap);
    await render(name, rel, { difficulty: 0, drill: { id: 'weird', attr: '', name: '', desc: '' }, onComplete: () => {}, onQuit: () => {} },
        'd0-drill-blank', { minText: 40 });
}

// MinigameHost resolves the game itself from the drill
const HOST = COMPONENT_DIR + 'minigames/MinigameHost.svelte';
for (const [, gameId, attr] of MINIGAMES) {
    for (const difficulty of [1, 2, 3]) {
        const base = drillFor(attr, difficulty);
        const drill = base ? { ...base, game: gameId, difficulty } : { id: attr + '_' + difficulty, attr, game: gameId, difficulty, name: 'Drill', desc: '' };
        applyState(S_MID.snap);
        await render('MinigameHost', HOST, { drill, onComplete: () => {}, onQuit: () => {} },
            `host-${gameId}-d${difficulty}`, { minText: 40 });
    }
}
applyState(S_MID.snap);
await render('MinigameHost', HOST, { drill: null, onComplete: () => {}, onQuit: () => {} }, 'host-drill-null', { minText: 40 });
applyState(S_MID.snap);
await render('MinigameHost', HOST, { drill: { id: 'nope', game: 'does_not_exist', attr: 'zzz' }, onComplete: () => {}, onQuit: () => {} }, 'host-unknown-game', { minText: 40 });

// ---------------------------------------------------------------------------
//  REPORT
// ---------------------------------------------------------------------------
console.log('');
console.log('---- RENDER SIZES (html bytes / visible text chars) ------');
{
    const byComp = new Map();
    for (const s of SIZES) {
        if (!byComp.has(s.name)) byComp.set(s.name, []);
        byComp.get(s.name).push(s);
    }
    for (const [name, rows] of byComp) {
        const min = rows.reduce((a, b) => (b.html < a.html ? b : a));
        const max = rows.reduce((a, b) => (b.html > a.html ? b : a));
        console.log('  ' + name.slice(0, 28).padEnd(29)
            + String(rows.length).padStart(3) + ' renders   '
            + ('min ' + min.html + 'b/' + min.text + 't @' + min.state).padEnd(48)
            + 'max ' + max.html + 'b/' + max.text + 't');
    }
}

console.log('');
console.log('=========================================================');
console.log('  renders : ' + renders);
console.log('  crashes : ' + crashes);
console.log('  findings: ' + failures.length);
console.log('=========================================================');
for (const f of failures) {
    console.log('');
    console.log(`[${f.severity.toUpperCase()}] ${f.file}`);
    console.log(`  ${f.symptom}` + (f._count > 1 ? `   (x${f._count})` : ''));
    for (const line of String(f.evidence).split('\n').slice(0, 6)) console.log('    ' + line);
    if (f._where.length) console.log('    also: ' + f._where.slice(0, 5).join(' | '));
}

if (process.argv.includes('--json')) fs.writeFileSync(
    path.join(ROOT, 'tools', '.careerRender.report.json'),
    JSON.stringify({
        seed: SEED, renders, crashes,
        failures: failures.map(f => ({
            severity: f.severity, file: f.file, symptom: f.symptom,
            evidence: f.evidence, suggestedFix: f.suggestedFix, count: f._count, where: f._where,
        })),
    }, null, 2),
    'utf8',
);

await server.close();
process.exit(failures.some(f => f.severity === 'crash') ? 1 : 0);
