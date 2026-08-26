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
 */
async function render(name, rel, props, stateName, expect = {}) {
    const minChars = expect.minChars === undefined ? 200 : expect.minChars;
    const fileGuess = 'src' + rel.slice(4);
    let html = '';
    renders++;
    try {
        const Comp = await renderComponent(rel);
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
for (const st of [S_MID, S_HOSTILE, S_ROTTEN, S_RETIRED, S_PRECOMP]) {
    for (const tab of SHOP_TABS) {
        applyState(st.snap);
        await render('Shop(' + tab + ')', COMPONENT_DIR + 'Shop.svelte',
            { initialTab: tab }, st.name, { minText: 120 });
    }
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
//  CAREER OVERLAY -- every kind, valid and malformed
// ---------------------------------------------------------------------------
console.log('');
console.log('---- CAREER OVERLAY --------------------------------------');

function overlayPayloads() {
    applyState(S_MID.snap);
    const c = cur();
    const out = [];

    const ev = safe('rollWeeklyEvent', () => EV.rollWeeklyEvent(cur()), null) || EV.EVENT_POOL[0];
    out.push(['event-valid', 'event', ev]);

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
        trait: trait || { id: 'x', name: 'Talented', rarity: 'uncommon', icon: '✨', blurb: 'A trait.' },
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

// ---------------------------------------------------------------------------
//  MINIGAMES
// ---------------------------------------------------------------------------
console.log('');
console.log('---- MINIGAMES -------------------------------------------');

const MINIGAMES = [
    ['LastHitGame',     'lasthit',   'mec'],
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
