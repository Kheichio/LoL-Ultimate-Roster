// ===========================================================================
//  boardCheck.mjs -- validates the global career leaderboard
// ===========================================================================
//  The board publishes one career per account to two PUBLIC-READ Firestore
//  collections and lets anybody, signed out included, open a stranger's full
//  dossier. Nothing else in this repo covers a line of it, and every one of its
//  failure modes is silent:
//
//    1. RULES DRIFT. firestore.rules is published BY HAND in the Firebase
//       console -- there is no CLI and no firebase.json -- so the rules and the
//       JS clamps drift apart by default rather than by accident. A rules bound
//       TIGHTER than the client's clamp denies the write, the client's catch
//       swallows it, and an honest career never appears on the board for
//       anybody, with no error anywhere.
//    2. FIELD-SET DRIFT. hasAll() + keys().size() is what makes the document
//       shape closed. If the list and the cap disagree, or if a helper reads a
//       key its own hasAll never named, the rule passes on a document that does
//       not contain the field -- which is the live defect in
//       validLeaderboardEntry, four keys named and seven read.
//    3. HOSTILE DOCUMENTS. Every board row and every dossier is a remote
//       document rendered by Svelte components that dereference without a
//       guard (Card.svelte does card.name.slice(0,2) and
//       card.quality.toLowerCase()). sanitizeRow/sanitizeDossier/safeSeatCard
//       are the only thing between a fabricated document and the screen.
//    4. SAVE WRITES. This project has ALREADY destroyed real player saves by
//       persisting a store that had not been loaded (CLAUDE.md, "Never persist
//       a store that has not been loaded"). Publishing reads a save slot. A
//       single stray saveCareer() in board code would be the same bug again,
//       with a network call in front of it.
//
//  None of that shows up in a build, a render pass or a career smoke run.
//
//      node tools/boardCheck.mjs
//      node tools/boardCheck.mjs --verbose
//      node tools/boardCheck.mjs --seed 42
// ===========================================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

function argOf(name, dflt) {
    const i = process.argv.indexOf(name);
    return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : dflt;
}

// ---------------------------------------------------------------------------
//  DETERMINISM
//  The career driven in section 3 is a real simulated career, so it has to be
//  seeded or a failure cannot be reproduced.
// ---------------------------------------------------------------------------
const SEED = (Number(argOf('--seed', '20260828')) || 20260828) >>> 0;

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(SEED);
Math.random = rand;
function rpick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// ---------------------------------------------------------------------------
//  BROWSER SHIM -- must exist before any store is imported
//  Lifted from tools/slotCheck.mjs. window.fbDb is deliberately NOT defined:
//  every network call in stores/careerBoard.js gates on it, and a harness that
//  handed it a database would stop testing that guard.
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
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
win.navigator = { userAgent: 'boardCheck', language: 'en' };
win.location = { href: 'http://localhost/', hash: '', search: '' };
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

// ---- the real card database ------------------------------------------------
//  safeSeatCard() reconstructs a club seat from the card database whenever the
//  id resolves, and boardDBReady() gates the whole dossier roster panel on it.
//  A synthetic stub would make every one of those checks pass against nothing.
const DB_PATH = path.join(ROOT, 'public', 'database.js');
if (!fs.existsSync(DB_PATH)) {
    console.error('FATAL: public/database.js is missing. Refusing to run.');
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
    console.error('FATAL: window.playerDatabase yielded ' + (Array.isArray(DB) ? DB.length : typeof DB)
        + ' entries. safeSeatCard rebuilds a seat FROM the database, so the hostile-card checks '
        + 'below would pass against nothing. Refusing to run.');
    process.exit(2);
}

// ---------------------------------------------------------------------------
//  MODULES
// ---------------------------------------------------------------------------
const load = (rel) => import(pathToFileURL(path.join(ROOT, 'src', rel)).href);
const AC = await load('lib/utils/anticheat.js');
const K = await load('lib/career/constants.js');
const R = await load('lib/career/ratings.js');
const A = await load('lib/career/awards.js');
const E = await load('lib/career/economy.js');
const G = await load('lib/career/engine.js');
const C = await load('lib/career/contracts.js');
const S = await load('lib/utils/storage.js');
const ST = await load('lib/stores/career.js');
const B = await load('lib/career/board.js');
const CB = await load('lib/stores/careerBoard.js');
const AUTH = await load('lib/stores/auth.js');

function readStore(s) { let out; const un = s.subscribe(v => { out = v; }); un(); return out; }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
//  HARNESS
// ---------------------------------------------------------------------------
let failures = 0, checks = 0;
const notes = [];

function ok(label) {
    checks++;
    if (VERBOSE) console.log('  pass   ' + label);
}

function bad(label, detail, why) {
    checks++; failures++;
    console.log('  FAIL   ' + label);
    console.log('         ' + detail);
    if (why) console.log('         -> ' + why);
}

function eq(label, got, want, why) {
    if (got === want) ok(label);
    else bad(label, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, why);
}

function truthy(label, v, why) {
    if (v) ok(label); else bad(label, `got ${JSON.stringify(v)}`, why);
}

function falsy(label, v, why) {
    if (!v) ok(label); else bad(label, `got ${JSON.stringify(v)}`, why);
}

function note(text) {
    notes.push(text);
    console.log('  note   ' + text);
}

function section(name) {
    console.log('');
    console.log('=== ' + name + ' ' + '='.repeat(Math.max(4, 66 - name.length)));
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function lpad(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

console.log('');
console.log('=========================================================');
console.log('  LoL ULTIMATE -- career leaderboard check');
console.log('  seed  : ' + SEED);
console.log('  cards : ' + DB.length + ' loaded from public/database.js');
console.log('  rows  : ' + AC.CAREER_ROW_KEYS + ' row fields, ' + AC.CAREER_DOSSIER_KEYS + ' dossier fields');
console.log('=========================================================');

// ===========================================================================
//  (1)  RULES  <->  JS PARITY
// ===========================================================================
section('rules / JS parity');

const RULES_PATH = path.join(ROOT, 'firestore.rules');
if (!fs.existsSync(RULES_PATH)) {
    console.error('FATAL: firestore.rules is missing. It is the published contract; refusing to run.');
    process.exit(2);
}
const RULES = fs.readFileSync(RULES_PATH, 'utf8');

/** Body of one rules function, by brace matching. The rules language nests, so
 *  a regex to the next '}' would stop inside a list literal. */
function rulesBody(name) {
    const idx = RULES.indexOf('function ' + name + '(');
    if (idx < 0) return null;
    const open = RULES.indexOf('{', idx);
    if (open < 0) return null;
    let depth = 0;
    for (let j = open; j < RULES.length; j++) {
        if (RULES[j] === '{') depth++;
        else if (RULES[j] === '}') { depth--; if (depth === 0) return RULES.slice(open + 1, j); }
    }
    return null;
}

for (const fn of ['validCareerRow', 'validCareerDossier']) {
    truthy('rules define ' + fn + '()', rulesBody(fn) !== null,
        'The published rules and this harness must describe the same document.');
}

const ROW_SRC = rulesBody('validCareerRow') || '';
const DOSSIER_SRC = rulesBody('validCareerDossier') || '';
const rowFlat = ROW_SRC.replace(/\s+/g, ' ');

// ---- THE SIMPLIFICATION MUST NOT CREEP BACK --------------------------------
//  These rules deliberately hold NO numeric ranges beyond the ranked field, no
//  cross-field rails, no enums and no clock window. Every one of those was a way
//  for an honest career to be denied silently and permanently the moment this
//  hand-pasted file drifted a literal from the client. Re-adding one without
//  re-reading that history is the regression this section exists to stop.
const BANNED = [
    ['a cross-field rail (years vs age)',   /d\.years\s*<=\s*d\.age/],
    ['a cross-field rail (record)',         /d\.wins\s*\+\s*d\.losses/],
    ['a cross-field rail (games vs years)', /d\.games\s*<=\s*d\.years/],
    ['a cross-field rail (score vs years)', /d\.earnedScore\s*<=\s*d\.years/],
    ['a cross-field rail (worlds vs years)', /d\.worlds\s*<=\s*d\.years/],
    ['a finishedScore derivation',          /d\.finishedScore\s*==\s*d\.earnedScore/],
    ['a role or region enum',               /\bin\s*\[\s*'/],
    ['a clock-freshness window',            /request\.time\.toMillis/],
];
for (const [what, re] of BANNED) {
    falsy('the career rules carry no ' + what, re.test(ROW_SRC + '\n' + DOSSIER_SRC),
        'It denies honest careers silently when it drifts, and the client already clamps and '
        + 'sanitises this. See the comment above validCareerRow in firestore.rules.');
}
truthy('rules no longer define freshTimestamp()', rulesBody('freshTimestamp') === null,
    'Nothing in the career rules uses it any more; leaving it defined invites its return.');

// ---- the one range that is kept --------------------------------------------
//  earnedScore is the field the board RANKS on, so it keeps an absolute ceiling.
//  It must sit at or ABOVE the client clamp: a rules cap below the client's is
//  the silent lockout this whole rewrite is about.
const earnedCap = /d\.earnedScore\s*<=\s*(\d+)/.exec(rowFlat);
truthy('the ranked field carries an absolute ceiling', !!earnedCap,
    'Without it a single write tops the board for ever.');
if (earnedCap) {
    truthy('the earnedScore ceiling is not below the client clamp ('
        + AC.CAREER_BOUNDS.earnedScore.max + ')',
    Number(earnedCap[1]) >= AC.CAREER_BOUNDS.earnedScore.max,
    'A rules cap under the client clamp denies an honest maxed career, silently and for ever.');
}
truthy('the ranked field cannot go negative', /d\.earnedScore\s*>=\s*0/.test(rowFlat));

// ---- the two rules files must not drift from each other --------------------
//  firestore.rules.minimal is the artifact that actually gets pasted into the
//  console. CLAUDE.md claimed this check existed for a long time before it did.
const MINIMAL_PATH = path.join(ROOT, 'firestore.rules.minimal');
truthy('firestore.rules.minimal exists', fs.existsSync(MINIMAL_PATH));
if (fs.existsSync(MINIMAL_PATH)) {
    const strip = (s) => s.split(/\r?\n/)
        .map(l => l.replace(/\/\/.*$/, '').trim())
        .filter(Boolean).join('\n');
    eq('firestore.rules and .minimal are identical modulo comments',
        strip(fs.readFileSync(MINIMAL_PATH, 'utf8')), strip(RULES),
        'The .minimal file is what gets published. If it drifts, the console runs rules nothing '
        + 'in this repo has ever checked.');
}

// ---- string caps -----------------------------------------------------------
function sizeCaps(src) {
    const out = {};
    // d.keys().size() is the field-set cap, not a string cap -- and it does not
    // match this shape anyway (d.keys() then .size(), not d.keys.size()).
    const re = /d\.([A-Za-z0-9_]+)\.size\(\)\s*<=\s*(\d+)/g;
    let m;
    while ((m = re.exec(src))) {
        if (m[1] === 'keys') continue;
        const n = Number(m[2]);
        if (out[m[1]] === undefined || n < out[m[1]]) out[m[1]] = n;
    }
    return out;
}

const rulesCaps = { ...sizeCaps(ROW_SRC), ...sizeCaps(DOSSIER_SRC) };
const jsCaps = AC.CAREER_STR_MAX;

// ONE DIRECTION ONLY. A rules cap ABOVE the client clamp is harmless -- the
// client simply never sends a string that long. A rules cap BELOW it denies a
// legal handle for ever, silently. So this asserts >=, not equality, and the
// rules are free to carry caps for fields the client has no clamp for (role,
// region) without that reading as drift.
for (const f of Object.keys(jsCaps)) {
    truthy('the rules cap ' + f, rulesCaps[f] !== undefined,
        'An uncapped string field is an unbounded document every reader downloads.');
    if (rulesCaps[f] === undefined) continue;
    truthy('rules cap ' + f + ' (' + rulesCaps[f] + ') is not below the client clamp (' + jsCaps[f] + ')',
        rulesCaps[f] >= jsCaps[f],
        'A rules cap below the client cap denies a legal value for ever, silently.');
}

// Every string the client actually publishes has to be capped by something.
truthy('the rules cap role', rulesCaps.role !== undefined);
truthy('the rules cap region', rulesCaps.region !== undefined);

// careerId no longer carries a MINIMUM: a short hash was a silent denial and
// the fingerprint is padded anyway. Assert the minimum is gone so it cannot
// return, and that the fingerprint still fits the cap.
falsy('careerId carries no minimum length', /d\.careerId\.size\(\)\s*>=/.test(ROW_SRC + DOSSIER_SRC),
    'It denied every publish for any career whose hash rounded short.');
const probeId = B.careerFingerprint({ player: { handle: 'x', startAge: 13, path: 'precomp', region: 'LEC' } });
truthy('careerFingerprint fits the careerId cap', probeId.length <= jsCaps.careerId);

// ---- the client's own enums are still the real game constants --------------
//  These no longer appear in the rules at all. They remain the CLIENT clamp
//  that normRole()/normRegion() fall back through, so they still have to track
//  the game -- but a new region is now a client-only change.
eq('CAREER_ENUMS.role is the real role list', AC.CAREER_ENUMS.role.join(','), K.ROLE_IDS.join(','));
eq('CAREER_ENUMS.region is the real region list', AC.CAREER_ENUMS.region.join(','), K.REGION_IDS.join(','));

// ---- anticheat.js stays parseable -----------------------------------------
const ACTEXT = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'utils', 'anticheat.js'), 'utf8');
falsy('anticheat.js still has zero imports', /^\s*import\s/m.test(ACTEXT),
    'It is documented as import-free so this harness can parse it as text; validateCard takes '
    + 'getCardByIdFn as a parameter for exactly that reason.');

// ===========================================================================
//  (2)  FIELD-SET PARITY
// ===========================================================================
section('field-set parity');

//  There is no hasAll any more. The TYPE CHECKS are the field list: rules deny
//  when they dereference a key a document does not carry, so `d.handle is
//  string` requires handle exactly as hasAll used to -- and unlike hasAll it
//  cannot name a field it never actually checks.
function typedKeys(src) {
    const out = new Set();
    const re = /d\.([A-Za-z0-9_]+)\s+is\s+(?:int|string|bool|number|float|list|map|timestamp)/g;
    let m;
    while ((m = re.exec(src))) out.add(m[1]);
    return [...out].sort();
}

function keysCap(src) {
    const m = /keys\(\)\.size\(\)\s*<=\s*(\d+)/.exec(src);
    return m ? Number(m[1]) : null;
}

const rowCap = keysCap(ROW_SRC);
const dosCap = keysCap(DOSSIER_SRC);

// A REAL published document, not a hand-typed list.
const sampleRaw = ST.blankCareer();
sampleRaw.created = true;
sampleRaw.player.handle = 'Sample';
const sampleDocs = B.buildBoardDocs(sampleRaw, { uid: 'u1', displayName: 'Sample Player', slot: 1 });
truthy('buildBoardDocs produced a sample document', !!sampleDocs);

const rowKeys = sampleDocs ? Object.keys(sampleDocs.row) : [];
const profKeys = sampleDocs ? Object.keys(sampleDocs.profile) : [];

eq('every published row field is type-checked, and no others',
    typedKeys(ROW_SRC).join(','), rowKeys.slice().sort().join(','),
    'A field the rules never type-check is an unbounded value on a document every reader '
    + 'downloads; a field the rules check but the client never sends denies every publish.');
eq('every published dossier field is type-checked, and no others',
    typedKeys(DOSSIER_SRC).join(','), profKeys.slice().sort().join(','));

eq('the row keys() cap equals the real field count', rowCap, rowKeys.length,
    'keys().size() is what makes the shape CLOSED. A cap above the field count lets a client '
    + 'staple arbitrary fields onto a valid document, and every reader downloads it 50 times '
    + 'per board load.');
eq('the dossier keys() cap equals the real field count', dosCap, profKeys.length);

eq('CAREER_ROW_KEYS agrees with the rules cap', AC.CAREER_ROW_KEYS, rowCap);
eq('CAREER_DOSSIER_KEYS agrees with the rules cap', AC.CAREER_DOSSIER_KEYS, dosCap);
eq('the row really is that many fields', rowKeys.length, AC.CAREER_ROW_KEYS);
eq('the dossier really is that many fields', profKeys.length, AC.CAREER_DOSSIER_KEYS);

// ---- every dereferenced key must actually be published ---------------------
//  Rules deny when they read a key the document does not carry, so a rule that
//  dereferences a field the client never sends denies EVERY publish, for ever.
function derefKeys(src) {
    const out = new Set();
    const re = /d\.([A-Za-z0-9_]+)/g;
    let m;
    while ((m = re.exec(src))) if (m[1] !== 'keys') out.add(m[1]);
    return [...out].sort();
}

for (const k of derefKeys(ROW_SRC)) {
    truthy('row rules only read a published key: ' + k, rowKeys.includes(k),
        'Reading a key the client does not send denies every publish, silently.');
}
for (const k of derefKeys(DOSSIER_SRC)) {
    truthy('dossier rules only read a published key: ' + k, profKeys.includes(k));
}

// The roster leaderboard is a different collection and out of scope for this
// harness, but the same parse can see its defect, so it is reported.
const lbSrc = rulesBody('validLeaderboardEntry') || '';
const lbHasAll = /hasAll\(\s*\[([^\]]*)\]\s*\)/.exec(lbSrc);
const lbList = lbHasAll ? lbHasAll[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
const lbMissing = derefKeys(lbSrc).filter(k => !lbList.includes(k));
if (lbMissing.length) {
    note('validLeaderboardEntry (roster board, out of scope) names ' + lbList.length
        + ' keys and reads ' + derefKeys(lbSrc).length + '; unnamed: ' + lbMissing.join(', '));
}

// ---- the sorts have to be real fields -------------------------------------
//  Every sort is a single-field orderBy that Firestore auto-indexes. A key that
//  is not a row field 400s the query and the board simply never loads.
for (const s of B.BOARD_SORTS) {
    truthy('sort "' + s.key + '" is a real row field', rowKeys.includes(s.key),
        'orderBy on a field no document carries returns nothing at all.');
    truthy('sort "' + s.key + '" has a label and a hint', !!s.label && !!s.hint);
}
eq('the default sort ranks on earned legacy', B.BOARD_SORTS[0].key, 'earnedScore',
    'RANK ON earnedScore, NEVER legacyScore: the monument ladder is purchasable.');
falsy('no sort ranks on a purchasable figure',
    B.BOARD_SORTS.some(s => s.key === 'boughtScore'),
    'boughtScore is 4350 legacy points of monuments. Ranking on it puts the top of the board up for sale.');

// ===========================================================================
//  (3)  BOUNDS vs REALITY
// ===========================================================================
section('bounds vs reality');

// ---- a real career, actually played ---------------------------------------
function makeCfg(roleId, regionId, pathId) {
    const styles = K.PLAYSTYLES[roleId] || [];
    const styleId = styles.length ? rpick(styles).id : '';
    const champs = styleId ? K.championsForStyle(roleId, styleId) : K.championsForRole(roleId);
    return {
        handle: 'BC' + roleId + regionId.slice(0, 2),
        pathId, age: pathId === 'precomp' ? 13 : 16,
        regionId, roleId, playstyleId: styleId,
        championId: champs.length ? champs[0].id : '',
    };
}

/** Play one career headlessly. Deliberately much lighter than careerSmoke's
 *  driver -- this harness needs a REALISTIC finished save, not the ~30
 *  per-week invariants careerSmoke already asserts. */
function driveCareer(cfg, years) {
    S.clearStorage();
    ST.resetCareer();
    ST.createCareer(cfg);
    try { G.ensureSeason(); } catch (e) { /* unsigned openers have no season yet */ }
    try { G.startCareerWeek(); } catch (e) { /* ditto */ }

    const endYear = readStore(ST.career).time.year + years;
    let guard = 0;
    while (guard++ < years * K.WEEKS_PER_YEAR + 8) {
        const c = readStore(ST.career);
        if (c.flags && c.flags.retired) break;
        if (c.time.year > endYear) break;

        let acts = 0;
        while (acts++ < 12) {
            const cc = readStore(ST.career);
            if (!cc.weekly || (Number(cc.weekly.actionsLeft) || 0) < 1) break;
            const pool = cc.player.clubId
                ? ['scrim', 'scrim', 'soloq', 'vod', 'gym', 'media']
                : ['soloq', 'soloq', 'vod', 'stream', 'gym'];
            let r = null;
            try { r = G.doActivity(rpick(pool)); } catch (e) { r = null; }
            if (!r || !r.ok) {
                let f = null;
                try { f = G.doActivity('rest'); } catch (e) { f = null; }
                if (!f || !f.ok) break;
            }
            ST.careerOverlay.set(null);
        }

        let fx = 0;
        while (fx++ < 12) {
            const cc = readStore(ST.career);
            const pending = (Array.isArray(cc.season.schedule) ? cc.season.schedule : [])
                .filter(x => x && Number(x.week) === Number(cc.time.week) && !x.played);
            if (!pending.length) break;
            for (const f of pending) { try { G.simFixture(f.id); } catch (e) { /* keep going */ } }
        }

        if (guard % 3 === 0) {
            try {
                const fresh2 = C.generateOffers(readStore(ST.career));
                if (Array.isArray(fresh2) && fresh2.length) {
                    ST.career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh2] }));
                }
                const offers = readStore(ST.career).offers || [];
                if (offers.length) C.acceptOffer(offers[0].id);
            } catch (e) { /* an unsigned career simply gets no offers */ }
        }
        if (guard % 9 === 4) {
            try {
                const ms = A.checkMilestones(readStore(ST.career));
                if (Array.isArray(ms) && ms.length) A.grantMilestones(ms);
            } catch (e) { /* ignore */ }
        }

        try { G.advanceWeek(); } catch (e) { break; }
        ST.careerOverlay.set(null);
    }

    try { A.retire({ force: true }); } catch (e) { /* already retired */ }
    ST.flushCareer();
    return ST.careerSlotRaw(S.activeSlot('career'));
}

const CAREERS = [];
const t0 = Date.now();
// Both start paths, because they differ in age, club and ceiling -- and because
// a fingerprint that could not tell them apart would be a fingerprint that let
// auto-publish overwrite the wrong career.
eq('both start paths are still named what this harness thinks',
    K.START_PATHS.map(p => p.id).join(','), 'precomp,debut',
    'The driver below creates one career on each; a renamed path would silently make them identical.');

for (const [role, region, pathId, yrs] of [
    ['MID', 'LCK', 'precomp', 16],
    ['ADC', 'LEC', 'debut', 14],
    ['SUP', 'LPL', 'precomp', 12],
]) {
    const raw = driveCareer(makeCfg(role, region, pathId), yrs);
    if (raw) CAREERS.push({ label: `${role}/${region}/${pathId}`, raw });
}
console.log('  drove ' + CAREERS.length + ' careers in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

truthy('the driver produced careers at all', CAREERS.length === 3,
    'Without a real save, every margin printed below is fiction.');

for (const c of CAREERS) {
    const games = Number(c.raw.totals.games) || 0;
    const yrs = A.careerYears(c.raw);
    truthy(`${c.label}: played a real number of games (${games})`, games >= 60,
        'A career that never played is not evidence that the bounds fit real play.');
    truthy(`${c.label}: lasted real seasons (${yrs})`, yrs >= 6);
    if (VERBOSE) {
        console.log(`         ${c.label}: ${games} games, ${yrs}y, earned ${A.earnedLegacyScore(c.raw)}, `
            + `${(c.raw.awards || []).length} awards, ${(c.raw.trophies || []).length} trophies`);
    }
}

// Give one career the monument ladder, so the earned-vs-total distinction has
// something to be wrong about. `raw` is a fresh JSON.parse; mutating it cannot
// reach a save.
if (CAREERS[0]) {
    CAREERS[0].raw.inventory.monuments = E.MONUMENTS.map(m => m.id);
    CAREERS[0].monumented = true;
}

// ---- build, bound, rail ----------------------------------------------------
const marginRows = new Map();   // field -> tightest observed approach

function noteMargin(field, value) {
    const b = AC.CAREER_BOUNDS[field];
    if (!b) return;
    const span = b.max - b.min;
    const head = b.max - value;
    const prev = marginRows.get(field);
    if (!prev || head < prev.head) {
        marginRows.set(field, { field, value, min: b.min, max: b.max, head, pct: span > 0 ? head / span : 0 });
    }
}

/**
 * Every assertion the published rules make, run against a built row.
 *
 *   collect     feed the margin table below. Only REAL played careers may:
 *               a synthetic maxed fixture sits at 0% on every field by
 *               construction and would turn the one honest number in this file
 *               into noise.
 *   railsInert  the cross-field clamps must have been NO-OPS. True for anything
 *               that came out of the engine -- a rail that fires on an honest
 *               career is a rail that is too tight -- and false only for the
 *               deliberately corrupt fixtures, where firing is the point.
 */
function checkRowAgainstRules(label, row, raw, opts = {}) {
    const collect = opts.collect !== false;
    const railsInert = opts.railsInert !== false;
    for (const f of Object.keys(AC.CAREER_BOUNDS)) {
        const v = row[f];
        const b = AC.CAREER_BOUNDS[f];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            bad(label + ': ' + f + ' is a finite number', `got ${JSON.stringify(v)}`,
                'Firestore denies a non-int, the catch swallows it, the career never appears.');
            continue;
        }
        if (!Number.isInteger(v)) {
            bad(label + ': ' + f + ' is an integer', `got ${v}`,
                'inRange() in the rules requires `v is int`. A fractional value is denied.');
            continue;
        }
        if (v < b.min || v > b.max) {
            bad(label + ': ' + f + ' is inside its bound', `got ${v}, bound ${b.min}..${b.max}`,
                'A real career outside a published bound is a career that can never reach the board.');
            continue;
        }
        ok(label + ': ' + f + ' inside ' + b.min + '..' + b.max);
        // finishedScore is -1 by DERIVATION on a live career; that is a sentinel,
        // not a rail being approached, so it is only measured when retired.
        if (collect && (f !== 'finishedScore' || row.retired)) noteMargin(f, v);
    }

    // the same cross-field rails the rules enforce
    truthy(label + ': ovr <= peakOVR', row.ovr <= row.peakOVR);
    truthy(label + ': years <= age - 12', row.years <= row.age - 12);
    truthy(label + ': wins + losses <= games', row.wins + row.losses <= row.games);
    truthy(label + ': games <= years * 60 + 60', row.games <= row.years * 60 + 60,
        'The rail that stops a fabricated 3000-game rookie. It must never bite an honest career.');
    truthy(label + ': earnedScore <= years * 4000 + 400', row.earnedScore <= row.years * 4000 + 400,
        'The rail that stops a fourteen-year-old claiming a Hall of Legends score.');
    truthy(label + ': worlds <= years', row.worlds <= row.years);
    eq(label + ': finishedScore derivation', row.finishedScore,
        row.retired ? row.earnedScore : -1,
        'The rules enforce this exactly, which is what makes "Completed" a free single-field sort.');

    // enums and strings
    truthy(label + ': role is enumerated', AC.CAREER_ENUMS.role.includes(row.role));
    truthy(label + ': region is enumerated', AC.CAREER_ENUMS.region.includes(row.region));
    truthy(label + ': handle is non-empty', typeof row.handle === 'string' && row.handle.length > 0,
        'The rules require handle.size() > 0.');

    // ---- the rank metric ---------------------------------------------------
    eq(label + ': boughtScore IS monumentScore', row.boughtScore, E.monumentScore(raw),
        'The monument ladder is the only source of bought score and it is never railed.');
    if (!railsInert) return;

    const earnedExact = Math.round(A.earnedLegacyScore(raw));
    eq(label + ': earnedScore IS earnedLegacyScore', row.earnedScore, earnedExact,
        'If these differ a rail clamped an honest career, which is the silent failure this file exists for.');
    const total = A.legacyScore(raw);
    if (E.monumentScore(raw) > 0) {
        truthy(label + ': earnedScore is NOT the purchasable total (' + row.earnedScore + ' vs ' + total + ')',
            row.earnedScore !== total,
            'Ranking on legacyScore would put the top of the board up for sale.');
        eq(label + ': earned + bought reconstructs the total', row.earnedScore + row.boughtScore, total);
    }
}

for (const c of CAREERS) {
    const docs = B.buildBoardDocs(c.raw, { uid: 'uid_' + c.label, displayName: 'A Player Name', slot: 2 });
    truthy(c.label + ': buildBoardDocs produced documents', !!docs);
    if (!docs) continue;
    c.docs = docs;
    checkRowAgainstRules(c.label, docs.row, c.raw);
}

// ---- an unfinished career, for the finishedScore = -1 arm ------------------
{
    const live = JSON.parse(JSON.stringify(CAREERS[0].raw));
    live.flags.retired = false;
    const d = B.buildBoardDocs(live, { uid: 'uid_live', displayName: 'Still Playing', slot: 1 });
    truthy('an active career still builds', !!d);
    if (d) {
        eq('an active career publishes finishedScore -1', d.row.finishedScore, -1,
            'Active careers sort below every finished one, which is the whole point of the field.');
        falsy('an active career is not marked retired', d.row.retired);
    }
}

// ---- refusals --------------------------------------------------------------
eq('buildBoardDocs(blankCareer()) is null',
    B.buildBoardDocs(ST.blankCareer(), { uid: 'u', displayName: 'n', slot: 1 }), null,
    'A blank store means "nothing is loaded", never "no save exists". Publishing one would put an '
    + 'empty career on the board under a real account.');
eq('buildBoardDocs(null) is null', B.buildBoardDocs(null, { uid: 'u', displayName: 'n', slot: 1 }), null);
eq('buildBoardDocs(undefined) is null', B.buildBoardDocs(undefined, {}), null);
eq('buildBoardDocs("nonsense") is null', B.buildBoardDocs('nonsense', {}), null);
eq('buildBoardDocs({created:false}) is null', B.buildBoardDocs({ created: false }, {}), null);

// ---- fingerprint stability -------------------------------------------------
{
    const raw = CAREERS[0].raw;
    const id0 = B.careerFingerprint(raw);
    eq('the same save fingerprints the same twice', B.careerFingerprint(JSON.parse(JSON.stringify(raw))), id0,
        'The fingerprint is the whole opt-in mechanism: it is compared to the published row instead '
        + 'of storing a flag in the save.');

    const champSwap = JSON.parse(JSON.stringify(raw));
    const otherChamp = Object.keys(K.CHAMPION_BY_ID).find(id => id !== raw.player.champion);
    champSwap.player.champion = otherChamp;
    eq('switchChampion() does NOT change the fingerprint', B.careerFingerprint(champSwap), id0,
        'contracts.switchChampion() is a supported mid-career move. A fingerprint that flipped would '
        + 'tell a published player they were unpublished and silently stop refreshing their row.');

    const roleSwap = JSON.parse(JSON.stringify(raw));
    roleSwap.player.role = K.ROLE_IDS.find(r => r !== raw.player.role);
    eq('changeRole() does NOT change the fingerprint', B.careerFingerprint(roleSwap), id0,
        'Same reason: contracts.changeRole() rewrites role by design.');

    const styleSwap = JSON.parse(JSON.stringify(raw));
    styleSwap.player.playstyle = 'something_else';
    eq('a playstyle change does NOT change the fingerprint', B.careerFingerprint(styleSwap), id0);

    for (const [what, mutate] of [
        ['handle', c => { c.player.handle = 'Someone Else'; }],
        ['startAge', c => { c.player.startAge = (Number(c.player.startAge) || 13) + 3; }],
        ['path', c => { c.player.path = c.player.path === 'precomp' ? 'debut' : 'precomp'; }],
        ['region', c => { c.player.region = K.REGION_IDS.find(r => r !== c.player.region); }],
    ]) {
        const v = JSON.parse(JSON.stringify(raw));
        mutate(v);
        truthy('a different ' + what + ' is a different career', B.careerFingerprint(v) !== id0,
            'Two different careers sharing a fingerprint means auto-refresh overwrites the wrong one.');
    }

    for (const shape of [null, undefined, {}, { player: null }, { player: [] }, 'x', 7]) {
        const fp = B.careerFingerprint(shape);
        truthy('careerFingerprint survives ' + JSON.stringify(shape),
            typeof fp === 'string' && fp.length >= 4 && fp.length <= AC.CAREER_STR_MAX.careerId);
    }
}

// ---- where each ceiling COMES FROM ----------------------------------------
//  Half of these bounds are a game constant restated, and a constant restated
//  is a constant that drifts. The other half are chosen headroom over a
//  measured careerSmoke figure, and those are the only ones whose tightness
//  means anything -- a field pinned to ATTR_MAX is SUPPOSED to sit at 0% margin
//  when a maxed career reaches its ceiling.
const BOUND_SOURCE = {
    v:             'schema version',
    slot:          'SLOT_IDS',
    age:           'RETIREMENT_AGE_FORCED',
    ovr:           'ATTR_MAX',
    peakOVR:       'ATTR_MAX',
    peakMMR:       'MMR_MAX',
    boughtScore:   'monument ladder sum',
    years:         'measured + headroom',
    games:         'measured + headroom',
    wins:          'measured + headroom',
    losses:        'measured + headroom',
    earnedScore:   'measured + headroom',
    finishedScore: 'measured + headroom',
    titles:        'measured + headroom',
    worlds:        'measured + headroom',
    trophies:      'measured + headroom',
};
eq('every bound declares where it came from',
    Object.keys(BOUND_SOURCE).sort().join(','), Object.keys(AC.CAREER_BOUNDS).sort().join(','));

eq('ovr.max IS ATTR_MAX', AC.CAREER_BOUNDS.ovr.max, K.ATTR_MAX,
    'A bound that restates a game constant has to track it, or a rebalance denies every top career.');
eq('peakOVR.max IS ATTR_MAX', AC.CAREER_BOUNDS.peakOVR.max, K.ATTR_MAX);
eq('peakMMR.max IS MMR_MAX', AC.CAREER_BOUNDS.peakMMR.max, K.MMR_MAX);
eq('age.max IS RETIREMENT_AGE_FORCED', AC.CAREER_BOUNDS.age.max, K.RETIREMENT_AGE_FORCED);
eq('slot.max IS the slot count', AC.CAREER_BOUNDS.slot.max, S.SLOT_IDS.length);
eq('boughtScore.max IS the whole monument ladder',
    AC.CAREER_BOUNDS.boughtScore.max, E.MONUMENTS.reduce((n, m) => n + (Number(m.score) || 0), 0),
    'The ladder is the only source of bought score, so its total IS the ceiling. A new monument '
    + 'without a matching bound denies every player who buys it.');
eq('finishedScore.max IS earnedScore.max', AC.CAREER_BOUNDS.finishedScore.max, AC.CAREER_BOUNDS.earnedScore.max,
    'finishedScore is exactly earnedScore when retired; a lower ceiling would deny the best careers only.');
eq('finishedScore.min is the -1 sentinel', AC.CAREER_BOUNDS.finishedScore.min, -1);
eq('BOARD_BLOB_BYTES_MAX IS the blob string cap', B.BOARD_BLOB_BYTES_MAX, AC.CAREER_STR_MAX.blob);

// ---- THE PRINT ------------------------------------------------------------
//  A bound too tight fails completely invisibly in production -- the write is
//  denied, the client's catch swallows it, and an honest career simply never
//  appears for anybody. So the margin is REPORTED, every run, rather than only
//  asserted.
console.log('');
console.log('  tightest margin to the ceiling, per field (across ' + CAREERS.length
    + ' real played careers)');
console.log('  ' + pad('field', 15) + lpad('value', 8) + lpad('min', 7) + lpad('max', 8)
    + lpad('headroom', 10) + lpad('% left', 9) + '   bound is');
const sortedMargins = [...marginRows.values()].sort((a, b) => a.pct - b.pct);
for (const m of sortedMargins) {
    const src = BOUND_SOURCE[m.field] || '?';
    const chosen = src === 'measured + headroom';
    const flag = (chosen && m.pct < 0.10) ? '  <-- TIGHT' : '';
    console.log('  ' + pad(m.field, 15) + lpad(m.value, 8) + lpad(m.min, 7) + lpad(m.max, 8)
        + lpad(m.head, 10) + lpad((m.pct * 100).toFixed(1) + '%', 9) + '   ' + src + flag);
    if (chosen && m.pct < 0.10) {
        note('bound ' + m.field + ' is chosen headroom and a career reached ' + m.value
            + ' of ' + m.max + ' (' + (m.pct * 100).toFixed(1) + '% left). Re-measure before the next '
            + 'balance change, and raise it in BOTH firestore.rules and anticheat.js.');
    }
}

// ===========================================================================
//  (4)  HOSTILE ROUND-TRIP
// ===========================================================================
section('hostile round trip');

// C0 controls, C1 controls, the bidi overrides and the bidi isolates -- exactly
// what cleanText() strips. Built from escapes so this file stays pure ASCII on
// disk: a harness carrying a raw NUL byte is one nothing can grep, diff or read.
const DIRTY = new RegExp(String.raw`[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]`);
const HOSTILE_HANDLE = '\u202ereversed\u0007ctrl\u2066iso\u0000nul';

/** Deep walk. The real check behind "no NaN, Infinity or undefined": those three
 *  do not survive JSON.stringify as themselves, so a text scan alone would miss
 *  every one of them. */
function deepBad(value, pathStr, out, seen) {
    if (out.length > 12) return;
    if (value === undefined) { out.push(pathStr + ' = undefined'); return; }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) out.push(pathStr + ' = ' + String(value));
        return;
    }
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) { out.push(pathStr + ' = circular'); return; }
    seen.add(value);
    if (Array.isArray(value)) value.forEach((v, i) => deepBad(v, pathStr + '[' + i + ']', out, seen));
    else for (const k of Object.keys(value)) deepBad(value[k], pathStr + '.' + k, out, seen);
}

function assertClean(label, obj) {
    const out = [];
    deepBad(obj, '', out, new Set());
    if (out.length) bad(label + ': no undefined / NaN / Infinity anywhere', out.join('; '),
        'careerRender treats these tokens as a render defect, and they are exactly what a `d.field || 0` '
        + 'over a foreign document produces.');
    else ok(label + ': no undefined / NaN / Infinity anywhere');

    // The literal text scan the spec asks for. Coarse -- these words can occur
    // legitimately inside a string -- so it backs up the walk rather than
    // replacing it.
    let text = '';
    try { text = JSON.stringify(obj); } catch (e) { text = ''; }
    truthy(label + ': serialised form carries no NaN/Infinity/undefined token',
        !/\b(NaN|Infinity|undefined)\b/.test(text));
}

function assertString(label, field, value, cap) {
    if (typeof value !== 'string') { bad(label + ': ' + field + ' is a string', `got ${typeof value}`); return; }
    const n = Array.from(value).length;
    if (n > cap) bad(label + ': ' + field + ' is within its cap', `${n} code points, cap ${cap}`,
        'An over-long string is denied by the rules on write and is unbounded page width on read.');
    else if (DIRTY.test(value)) bad(label + ': ' + field + ' is free of control/bidi characters',
        JSON.stringify(value).slice(0, 80),
        'A bidi override in a remote string reorders the text AROUND it on screen.');
    else ok(label + ': ' + field + ' is capped and clean');
}

// ---- the rot shapes --------------------------------------------------------
const BIG = 'x'.repeat(1000000);
const ROT = [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['an array', []],
    ['a string', 'not a document'],
    ['a number', 42],
    ['true', true],
    ['no player', { created: true, totals: { games: 5 } }],
    ['1e308', { age: 1e308, years: 1e308, games: 1e308, earnedScore: 1e308 }],
    ['-Infinity', { age: -Infinity, ovr: -Infinity, peakOVR: -Infinity, earnedScore: -Infinity }],
    ['Infinity', { games: Infinity, wins: Infinity, losses: Infinity, trophies: Infinity }],
    ['NaN', { age: NaN, ovr: NaN, years: NaN, peakMMR: NaN, updatedAt: NaN }],
    ['a 1MB handle', { handle: BIG }],
    ['a 5000-char handle', { handle: 'h'.repeat(5000) }],
    ['a bidi/control handle', { handle: HOSTILE_HANDLE }],
    ['a 5000-char displayName', { displayName: 'd'.repeat(5000) }],
    ['a bidi displayName', { displayName: '\u202dspoof\u202c' }],
    ['a dead teamId', { teamId: 'org_that_no_longer_exists' }],
    ['a 1MB teamId', { teamId: BIG }],
    ['bad enums', { role: 'NOT_A_ROLE', region: 'XX' }],
    ['numeric enums', { role: 7, region: {} }],
    ['v: 99', { v: 99 }],
    ['slot: 0 / slot: 99', { slot: 0 }],
    ['slot: 99', { slot: 99 }],
    ['string booleans', { retired: 'yes', hallOfLegends: 1 }],
    ['a string updatedAt', { updatedAt: 'tomorrow' }],
    ['a negative updatedAt', { updatedAt: -1e15 }],
    ['every field null', Object.fromEntries(rowKeys.map(k => [k, null]))],
    ['every field an object', Object.fromEntries(rowKeys.map(k => [k, {}]))],
    ['every field an array', Object.fromEntries(rowKeys.map(k => [k, []]))],
    ['every field a bad string', Object.fromEntries(rowKeys.map(k => [k, HOSTILE_HANDLE]))],
    ['attrs as [1,2]', { player: { attrs: [1, 2] } }],
    ['history as a number', { history: 5 }],
    ['history [null]', { history: [null] }],
    ['awards [1,"x",null]', { awards: [1, 'x', null] }],
    ['proficiency as an array', { player: { proficiency: [1, 2, 3] } }],
    ['traits null', { player: { traits: null } }],
    ['club as an array', { club: [] }],
    ['a half-card seat', { club: { roster: { MID: { name: 'x' } } } }],
];

let rotSeq = 0;
for (const [label, data] of ROT) {
    // The uid is a fixed synthetic string, NOT the label: a label like
    // "-Infinity" would end up inside row.uid and trip the token scan below on
    // the harness's own text rather than on anything sanitizeRow produced.
    const uid = 'rot' + (++rotSeq);
    let row = null;
    try { row = B.sanitizeRow(uid, data); }
    catch (e) { bad('sanitizeRow survives ' + label, 'threw: ' + e.message,
        'A board page is 50 foreign documents; one throw takes the whole screen down.'); continue; }
    if (!row || typeof row !== 'object') { bad('sanitizeRow returns a row for ' + label, String(row)); continue; }
    ok('sanitizeRow survives ' + label);

    const L = 'row[' + label + ']';
    for (const f of Object.keys(AC.CAREER_BOUNDS)) {
        const v = row[f];
        const b = AC.CAREER_BOUNDS[f];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < b.min || v > b.max) {
            bad(L + ': ' + f + ' is finite and bounded', `got ${JSON.stringify(v)}, bound ${b.min}..${b.max}`,
                'sanitizeRow is documented to leave NO field null, undefined, NaN or Infinity except `team`.');
        }
    }
    assertString(L, 'handle', row.handle, AC.CAREER_STR_MAX.handle);
    assertString(L, 'displayName', row.displayName, AC.CAREER_STR_MAX.displayName);
    assertString(L, 'teamId', row.teamId, AC.CAREER_STR_MAX.teamId);
    assertString(L, 'careerId', row.careerId, AC.CAREER_STR_MAX.careerId);
    assertString(L, 'teamName', row.teamName, 64);
    truthy(L + ': handle is never empty', row.handle.length > 0,
        'The rules require handle.size() > 0, and an empty cell is an unreadable board row.');
    truthy(L + ': role is enumerated', AC.CAREER_ENUMS.role.includes(row.role));
    truthy(L + ': region is enumerated', AC.CAREER_ENUMS.region.includes(row.region));
    eq(L + ': retired is a real boolean', typeof row.retired, 'boolean');
    eq(L + ': hallOfLegends is a real boolean', typeof row.hallOfLegends, 'boolean');
    eq(L + ': isMe defaults false', row.isMe, false);
    truthy(L + ': team is an object or null', row.team === null || typeof row.team === 'object',
        'The one field allowed to be null -- an unresolvable org.');
    assertClean(L, row);

    // remoteFiguresFrom is what the dossier trusts over anything recomputed off
    // the blob, so it must be as safe as the row it reads.
    const fig = B.remoteFiguresFrom(row);
    truthy(L + ': remoteFiguresFrom produced figures', !!fig);
    if (fig) assertClean(L + '.figures', fig);
}
eq('remoteFiguresFrom(null) is null', B.remoteFiguresFrom(null), null);
eq('remoteFiguresFrom(undefined) is null', B.remoteFiguresFrom(undefined), null);

// ---- an unresolvable org names itself as unknown ---------------------------
{
    const r = B.sanitizeRow('u', { teamId: 'org_that_no_longer_exists', handle: 'X' });
    eq('a fabricated org reads "Unknown Org"', r.teamName, 'Unknown Org',
        'IDS TRAVEL, NAMES DO NOT. No remote string may reach the screen as an org name.');
    eq('a fabricated org resolves to no team object', r.team, null);
    const r2 = B.sanitizeRow('u', { teamId: '', handle: 'X' });
    eq('an unsigned career reads "Free Agent"', r2.teamName, 'Free Agent');
    const real = K.allTeams()[0];
    const r3 = B.sanitizeRow('u', { teamId: real.id, handle: 'X' });
    eq('a real org resolves locally', r3.teamName, real.name);
}

// ---- sanitizeDossier -------------------------------------------------------
function checkCareerShape(label, c) {
    if (!c || typeof c !== 'object') { bad(label + ': is a career object', String(c)); return; }
    eq(label + ': created is true', c.created, true,
        'hallOfLegendsEligible() and every other awards.js reader gates on it.');

    const attrs = c.player && c.player.attrs;
    const keys = attrs ? Object.keys(attrs) : [];
    eq(label + ': exactly 8 attributes', keys.length, 8);
    let attrsOk = keys.length === 8;
    for (const k of K.ATTR_KEYS) {
        const v = attrs ? attrs[k] : undefined;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < K.ATTR_MIN || v > K.ATTR_MAX) {
            bad(label + ': attr ' + k + ' is finite and in range', `got ${JSON.stringify(v)}`,
                'Every OVR, wage and market value on the dossier is computed off these.');
            attrsOk = false;
        }
    }
    if (attrsOk) ok(label + ': 8 finite in-range attributes');

    for (const k of K.ATTR_KEYS) {
        const v = c.player.potential[k];
        if (!Number.isFinite(v) || !Number.isInteger(v)) {
            bad(label + ': potential ' + k + ' is an integer', `got ${JSON.stringify(v)}`,
                'potential is integral by design -- only raisePotential() writes it.');
        }
    }

    truthy(label + ': role is enumerated', K.ROLE_IDS.includes(c.player.role));
    truthy(label + ': region is enumerated', K.REGION_IDS.includes(c.player.region));
    assertString(label, 'player.handle', c.player.handle, AC.CAREER_STR_MAX.handle);
    truthy(label + ': handle is non-empty', c.player.handle.length > 0);
    truthy(label + ': champion is a known id or blank',
        c.player.champion === '' || !!K.CHAMPION_BY_ID[c.player.champion],
        'A fabricated champion id would render as a blank name with no fallback.');
    truthy(label + ': every trait is a known id',
        (c.player.traits || []).every(t => !!K.TRAIT_BY_ID[t]));
    truthy(label + ': every perk is a known id',
        (c.inventory.perks || []).every(id => !!E.PERK_BY_ID[id]));
    truthy(label + ': every monument is a known id',
        (c.inventory.monuments || []).every(id => !!E.MONUMENT_BY_ID[id]));
    truthy(label + ': every milestone is a known id',
        (c.flags.milestones || []).every(id => !!A.MILESTONE_BY_ID[id]));
    truthy(label + ': every award is a known id',
        (c.awards || []).every(a => a && !!A.AWARD_BY_ID[a.id]),
        'Award NAMES come from AWARD_BY_ID, never off the wire.');

    // Remote org ids reach the screen as TEXT when they do not resolve
    // (CareerDossier renders `teamById(h.teamId) || String(h.teamId)`), so they
    // are strings on a hostile document and must be capped and clean.
    (c.history || []).forEach((h, i) => {
        if (h.teamId !== null) assertString(label, `history[${i}].teamId`, h.teamId, AC.CAREER_STR_MAX.teamId);
    });
    (c.awards || []).forEach((a, i) => {
        if (a.teamId !== null) assertString(label, `awards[${i}].teamId`, a.teamId, AC.CAREER_STR_MAX.teamId);
    });
    if (c.club.teamId !== null) assertString(label, 'club.teamId', c.club.teamId, AC.CAREER_STR_MAX.teamId);
    (c.club.changes || []).forEach((x, i) => {
        assertString(label, `club.changes[${i}].inName`, x.inName, 24);
        assertString(label, `club.changes[${i}].outName`, x.outName, 24);
        assertString(label, `club.changes[${i}].reason`, x.reason, 40);
        truthy(label + `: club.changes[${i}].role is enumerated`, K.ROLE_IDS.includes(x.role));
    });

    for (const [seat, card] of Object.entries(c.club.roster || {})) {
        checkCard(label + ' seat ' + seat, card, 1);
    }

    assertClean(label, c);
}

/** Card.svelte does card.name.slice(0,2) and card.quality.toLowerCase() with NO
 *  guard, so "complete" is a hard requirement, not padding.
 *
 *  `minRating` is 0 by default and 1 for a club seat. A rating of 0 is the
 *  house convention for "this career does not resolve" -- CareerDossier
 *  deliberately prints calcOVR's honest 0 rather than boardOVR's floor-at-1,
 *  because a confident 67 under an unresolvable role is worse than a blank.
 *  safeSeatCard is the opposite case: it clamps a seat to 1..99 itself. */
function checkCard(label, card, minRating = 0) {
    if (!card || typeof card !== 'object') { bad(label + ': is a card object', String(card)); return; }
    let good = true;
    for (const f of ['name', 'quality', 'role', 'team', 'region']) {
        if (typeof card[f] !== 'string' || !card[f]) { bad(label + ': ' + f + ' is a non-empty string', JSON.stringify(card[f])); good = false; }
    }
    if (!Number.isFinite(card.rating) || card.rating < minRating || card.rating > 99) {
        bad(label + `: rating is ${minRating}..99`, JSON.stringify(card.rating)); good = false;
    }
    if (!Number.isFinite(card.year)) { bad(label + ': year is a number', JSON.stringify(card.year)); good = false; }
    if (!card.stats || typeof card.stats !== 'object') { bad(label + ': has a stats block', JSON.stringify(card.stats)); good = false; }
    else {
        for (const s of ['mec', 'tmf', 'frm', 'cmp', 'map', 'ldr']) {
            if (!Number.isFinite(Number(card.stats[s]))) { bad(label + ': stats.' + s + ' is a number', JSON.stringify(card.stats[s])); good = false; }
        }
    }
    try {
        card.name.slice(0, 2);
        card.quality.toLowerCase();
    } catch (e) {
        bad(label + ': survives Card.svelte\'s unguarded reads', e.message,
            'card.name.slice(0,2) and card.quality.toLowerCase() run with no guard in Card.svelte.');
        good = false;
    }
    if (good) ok(label + ': is a complete, renderable card');
}

// documents that must be REFUSED outright
const REFUSE = [
    ['null', null],
    ['undefined', undefined],
    ['empty', {}],
    ['no blob', { v: 1, careerId: 'cabc', updatedAt: 1 }],
    ['blob is a number', { blob: 5 }],
    ['blob is an object', { blob: {} }],
    ['blob is empty', { blob: '' }],
    ['blob is not JSON', { blob: 'not json at all' }],
    ['blob is a JSON array', { blob: '[1,2,3]' }],
    ['blob is JSON null', { blob: 'null' }],
    ['blob is JSON 5', { blob: '5' }],
    ['blob is 2x over budget', { blob: '{"v":1,"hd":"' + 'x'.repeat(B.BOARD_BLOB_BYTES_MAX * 2) + '"}' }],
    ['blob from a newer client', { blob: JSON.stringify({ v: 99, hd: 'Future' }) }],
];
for (const [label, data] of REFUSE) {
    let out;
    try { out = B.sanitizeDossier('u', data); }
    catch (e) { bad('sanitizeDossier refuses ' + label + ' without throwing', 'threw: ' + e.message); continue; }
    eq('sanitizeDossier DROPS ' + label, out, null,
        'A malformed document must be dropped, never propagated and never thrown.');
}

// documents that are structurally fine but rotten inside
const ROTTEN_BLOBS = [
    ['minimal blob', { v: 1 }],
    ['attrs as [1,2]', { v: 1, at: [1, 2], pt: 'nope' }],
    ['attrs as strings', { v: 1, at: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }],
    ['attrs with NaN', { v: 1, at: [NaN, 1e308, -Infinity, null, undefined, {}, [], 'x'] }],
    ['history as a number', { v: 1, hi: 5 }],
    ['history [null]', { v: 1, hi: [null, undefined, 3, 'x'] }],
    // Not BIG here: a 1MB member would push the whole document past the
    // 2x-budget refusal in sanitizeDossier and test that instead of this.
    ['history rows of junk', { v: 1, hi: [[{}, [], 'z'.repeat(400), NaN, Infinity, -1]] }],
    ['awards [1,"x",null]', { v: 1, aw: [1, 'x', null] }],
    ['awards with a dead id', { v: 1, aw: [['not_an_award', 2030, 0, 'lec_g2']] }],
    ['awards with a 1MB teamId', { v: 1, aw: [['worlds_champ', 2030, 0, BIG.slice(0, 5000)]] }],
    ['history with a bidi teamId', { v: 1, hi: [[2030, 0, HOSTILE_HANDLE + 'y'.repeat(300), 1, 2, 3]] }],
    ['proficiency as an array', { v: 1, pr: [1, 2, 3] }],
    ['proficiency as a string', { v: 1, pr: 'nope' }],
    ['traits null', { v: 1, tr: null }],
    ['traits of junk', { v: 1, tr: [null, 7, {}, 'no_such_trait'] }],
    ['club as an array', { v: 1, cb: [] }],
    ['club of junk', { v: 1, cb: { t: BIG.slice(0, 400), mo: Infinity, se: 5, ch: 'x' } }],
    ['a half-card seat', { v: 1, cb: { se: { MID: ['x'] } } }],
    ['a seat that is an object', { v: 1, cb: { se: { MID: { name: 'x' } } } }],
    ['a seat under a bogus key', { v: 1, cb: { se: { NOT_A_ROLE: [1, 'x', 50] } } }],
    ['a 5000-char handle', { v: 1, hd: 'h'.repeat(5000) }],
    ['a bidi handle', { v: 1, hd: HOSTILE_HANDLE }],
    ['a blank handle', { v: 1, hd: '   ' }],
    ['bad enums', { v: 1, rl: 'NOT_A_ROLE', rg: 'XX', stt: 'emperor' }],
    ['dead ids everywhere', { v: 1, ch: 'no_champ', pa: 'no_path', pk: ['no_perk'], mo2: ['no_mon'], ms: ['no_ms'] }],
    ['numbers as 1e308', { v: 1, ag: 1e308, sa: -1e308, yr: 1e308, wk: -5, hy: 1e308, vm: 1e308 }],
    ['totals as junk', { v: 1, to: 'nope', sq: {}, mn: [NaN, Infinity, -Infinity] }],
    ['flags as junk', { v: 1, fl: 'nope' }],
    ['board figures as junk', { v: 1, tp: 1e308, le: -Infinity, lb: NaN }],
];
for (const [label, blob] of ROTTEN_BLOBS) {
    let out;
    try { out = B.sanitizeDossier('u', { v: 1, careerId: 'cabc', blob: JSON.stringify(blob), updatedAt: 1 }); }
    catch (e) { bad('sanitizeDossier survives ' + label, 'threw: ' + e.message,
        'sanitizeDossier is documented to never throw: a corrupt document is a null, not an exception.'); continue; }
    if (out === null) { bad('sanitizeDossier decoded ' + label, 'got null',
        'These are structurally valid documents with rotten CONTENTS; they must decode to a safe career.'); continue; }
    ok('sanitizeDossier survives ' + label);
    checkCareerShape('dossier[' + label + ']', out);
}

// ---- safeSeatCard ----------------------------------------------------------
const realCard = DB.find(c => Number.isFinite(c.id) && c.id > 0 && typeof c.name === 'string');
const SEATS = [
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
    ['a string', 'x'],
    ['[]', []],
    ['[NaN]', [NaN]],
    ['name only', ['x']],
    ['["x"] with no rating', ['x', 'y']],
    ['1e308 id', [1e308, 'Name', 50]],
    ['-Infinity rating', [1, 'Name', -Infinity]],
    ['null fields', [null, null, null]],
    ['objects', [{}, {}, {}]],
    ['a 1MB name', [-1, BIG, 50]],
    ['a bidi name', [-1, HOSTILE_HANDLE, 50]],
    ['a blank name', [-1, '   ', 50]],
    ['rating 200', [-1, 'Overrated', 200]],
    ['rating -5', [-1, 'Underrated', -5]],
    ['an unresolvable id', [999999999, 'Ghost', 60]],
    ['a real card id', [realCard ? realCard.id : 1, 'Whatever They Claim', 88]],
];
for (const [label, seat] of SEATS) {
    let card;
    try { card = B.safeSeatCard(seat, 'MID', 'G2 Esports', 2031, 'LEC'); }
    catch (e) { bad('safeSeatCard survives ' + label, 'threw: ' + e.message); continue; }
    if (card === null) { ok('safeSeatCard DROPS ' + label); continue; }
    checkCard('seat[' + label + ']', card, 1);
    assertString('seat[' + label + ']', 'name', card.name, 24);
    assertClean('seat[' + label + ']', card);
}
{
    const c = B.safeSeatCard([realCard.id, 'A Fabricated Name', 88], 'MID', 'G2 Esports', 2031, 'LEC');
    eq('a resolvable seat takes its NAME from the database', c.name, realCard.name,
        'IDS TRAVEL, NAMES DO NOT -- the validateCard() idiom. A remote name on a resolvable id is ignored.');
    eq('a resolvable seat keeps the published rating', c.rating, 88,
        'The rating is form-shifted by the club, so it is the one thing that travels.');
    eq('a seat is never treated as owned', c.signature, false);
}
truthy('boardDBReady() sees the loaded database', B.boardDBReady() === true);

// ---- cardFromDossier -------------------------------------------------------
for (const [label, shape] of [
    ['null', null], ['undefined', undefined], ['{}', {}],
    ['player: []', { player: [] }], ['player: null', { player: null }],
    ['rotten player', { player: { handle: HOSTILE_HANDLE, role: 'NOT_A_ROLE', region: 'XX', attrs: [1, 2] }, time: 'x' }],
]) {
    let card;
    try { card = B.cardFromDossier(shape); }
    catch (e) { bad('cardFromDossier survives ' + label, 'threw: ' + e.message); continue; }
    checkCard('cardFromDossier[' + label + ']', card);
}
{
    // The real call path always hands it a reified career, whose attributes are
    // eight finite values at or above ATTR_MIN -- so the hero card of an actual
    // dossier is never the degenerate zero above.
    const back = B.sanitizeDossier('u', {
        v: 1, careerId: CAREERS[0].docs.row.careerId, blob: CAREERS[0].docs.blob, updatedAt: 1,
    });
    const hero = B.cardFromDossier(back);
    checkCard('cardFromDossier[a real dossier]', hero, 1);
    eq('the hero card is named for the handle', hero.name, back.player.handle,
        'toCareerCard is the only safe builder: it sets name off the handle and quality through '
        + 'ratingToQuality, both of which Card.svelte dereferences with no guard.');
}

// ---- the structural caps inside encodeBlob ---------------------------------
//  Not exported, so they are read out of the source rather than quoted from
//  memory -- clutchSim's lesson: a calibration that names numbers the code no
//  longer holds is worse than no calibration at all.
const BOARD_SRC = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'career', 'board.js'), 'utf8');
function boardConst(name) {
    const m = new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)').exec(BOARD_SRC);
    return m ? Number(m[1]) : null;
}
const HISTORY_MAX = boardConst('HISTORY_MAX');
const AWARDS_MAX = boardConst('AWARDS_MAX');
const PROFICIENCY_MAX = boardConst('PROFICIENCY_MAX');
const CHANGES_MAX = boardConst('CHANGES_MAX');
for (const [n, v] of [['HISTORY_MAX', HISTORY_MAX], ['AWARDS_MAX', AWARDS_MAX],
    ['PROFICIENCY_MAX', PROFICIENCY_MAX], ['CHANGES_MAX', CHANGES_MAX]]) {
    truthy('board.js still declares ' + n + ' (' + v + ')', Number.isFinite(v) && v > 0,
        'These decide how much of a career the itemised lists can carry; this harness reads them '
        + 'rather than restating them.');
}

// ---- the real round trip ---------------------------------------------------
for (const c of CAREERS) {
    if (!c.docs) continue;
    const L = 'round trip[' + c.label + ']';
    const back = B.sanitizeDossier('u', {
        v: B.BOARD_VERSION, careerId: c.docs.row.careerId, blob: c.docs.blob, updatedAt: Date.now(),
    });
    truthy(L + ': decoded', !!back);
    if (!back) continue;
    checkCareerShape(L, back);

    const trimmed = c.docs.blob.length >= B.BOARD_BLOB_BYTES_MAX;
    falsy(L + ': a real career fits without trimming', trimmed,
        'If a normal career trims, the itemised award and season lists a viewer reads are incomplete.');

    // HISTORY_MAX and AWARDS_MAX are structural caps inside encodeBlob, applied
    // before the trim loop ever runs.
    const allHistory = (c.raw.history || []).filter(Boolean).length;
    const allAwards = (c.raw.awards || []).filter(a => a && A.AWARD_BY_ID[a.id]).length;
    const keptHistory = Math.min(HISTORY_MAX, allHistory);
    const keptAwards = Math.min(AWARDS_MAX, allAwards);
    eq(L + `: every season row within the ${HISTORY_MAX} cap survived`, back.history.length, keptHistory);
    eq(L + `: every award within the ${AWARDS_MAX} cap survived`, back.awards.length, keptAwards);
    eq(L + `: proficiency is within the ${PROFICIENCY_MAX} cap`,
        Object.keys(back.player.proficiency).length <= PROFICIENCY_MAX, true);
    eq(L + `: club changes are within the ${CHANGES_MAX} cap`,
        back.club.changes.length <= CHANGES_MAX, true);
    if (allAwards > AWARDS_MAX || allHistory > HISTORY_MAX) {
        note(`${c.label}: a real career overflows an itemised list `
            + `(${allAwards} awards -> ${keptAwards}, ${allHistory} seasons -> ${keptHistory}). `
            + 'The oldest entries are dropped by design; at2 and tp keep the counts honest.');
    }
    eq(L + ': the trophy COUNT survived', back.boardTrophyCount, (c.raw.trophies || []).length,
        'tp carries the authoritative count so a trimmed award list still reports the truth.');
    eq(L + ': the earned score survived', back.boardEarned, Math.round(A.earnedLegacyScore(c.raw)));
    eq(L + ': the bought score survived', back.boardBought, E.monumentScore(c.raw));
    eq(L + ': games survived', back.totals.games, Math.round(Number(c.raw.totals.games) || 0));
    eq(L + ': wins survived', back.totals.wins, Math.round(Number(c.raw.totals.wins) || 0));
    eq(L + ': the handle survived', back.player.handle, c.raw.player.handle);
    eq(L + ': the role survived', back.player.role, c.raw.player.role);
    eq(L + ': the region survived', back.player.region, c.raw.player.region);
    eq(L + ': the traits survived', (back.player.traits || []).join(','), (c.raw.player.traits || []).join(','));
    eq(L + ': the milestones survived',
        (back.flags.milestones || []).length, Array.from(A.claimedMilestoneIds(c.raw)).length);

    // Attributes are fractional ON PURPOSE. Rounding them on the wire would
    // stall a stranger's dossier several points below what its owner sees.
    let worst = 0;
    for (const k of K.ATTR_KEYS) worst = Math.max(worst, Math.abs(back.player.attrs[k] - c.raw.player.attrs[k]));
    truthy(L + ': attributes survive to 3dp (worst drift ' + worst.toFixed(4) + ')', worst <= 0.0005,
        'Attributes are stored fractionally on purpose; the blob is the one place that could round them away.');

    // The figures a dossier DISPLAYS come off the row, not off the blob.
    const figs = B.remoteFiguresFrom(B.sanitizeRow('u', c.docs.row));
    eq(L + ': remote earnedScore agrees with the row', figs.earnedScore, c.docs.row.earnedScore);
    eq(L + ': remote trophyCount agrees with the row', figs.trophyCount, c.docs.row.trophies);
    eq(L + ': remote peakOVR agrees with the row', figs.peakOVR, c.docs.row.peakOVR);
}

// ===========================================================================
//  (5)  SIZE
// ===========================================================================
section('size');

function maxedCareer({ teamIdLen = 6 } = {}) {
    const teamIds = K.allTeams().map(t => t.id);
    const bigId = (i) => (teamIdLen <= 8 ? teamIds[i % teamIds.length] : ('t' + String(i)).padEnd(teamIdLen, 'q'));

    const c = ST.blankCareer();
    c.created = true;
    c.player.handle = 'MaximumHandle16';        // 15 -- the cap is 16
    c.player.role = 'MID';
    c.player.region = 'LCK';
    c.player.playstyle = (K.PLAYSTYLES.MID && K.PLAYSTYLES.MID[0]) ? K.PLAYSTYLES.MID[0].id : '';
    c.player.champion = Object.keys(K.CHAMPION_BY_ID)[0];
    c.player.path = 'precomp';
    c.player.startAge = 13;
    c.player.age = 38;
    c.player.clubId = teamIds[0];
    c.player.clubTier = 1;
    c.player.status = 'star';
    for (const k of K.ATTR_KEYS) { c.player.attrs[k] = 98.765; c.player.potential[k] = 99; }
    c.player.traits = K.TRAITS.slice(0, 1).map(t => t.id);
    // Every champion, so the top-12 cap has something to cut.
    c.player.proficiency = {};
    Object.keys(K.CHAMPION_BY_ID).forEach((id, i) => { c.player.proficiency[id] = 500 - i; });

    c.time = { year: K.DEFAULT_START_YEAR + 25, week: 40 };
    c.money = { gold: 99999999, followers: 99999999, legacy: 99999999 };
    c.totals = {
        games: 2900, wins: 1900, losses: 1000, kills: 99999, deaths: 99999,
        assists: 99999, mvps: 999, pentakills: 999, ratingSum: 99999, peakOVR: 99,
    };
    c.soloq = { mmr: 4000, peakMMR: 4000, games: 99999, wins: 60000, losses: 39999 };

    c.history = [];
    for (let i = 0; i < 80; i++) {
        c.history.push({
            year: K.DEFAULT_START_YEAR + Math.floor(i / 2), split: i % 2 ? 'summer' : 'spring',
            teamId: bigId(i), w: 18, l: 0, placement: 1, awards: [],
        });
    }

    c.awards = [];
    for (let copy = 0; copy < 6; copy++) {
        for (const def of A.AWARD_DEFS) {
            c.awards.push({
                id: def.id, name: def.name, tier: def.tier,
                year: K.DEFAULT_START_YEAR + copy, split: copy % 2 ? 'summer' : 'spring',
                teamId: bigId(copy),
            });
        }
    }
    c.trophies = c.awards.filter(a => A.AWARD_BY_ID[a.id] && A.AWARD_BY_ID[a.id].tier !== 'minor')
        .map(a => ({ id: a.id, name: a.name, year: a.year, kind: A.AWARD_BY_ID[a.id].tier }));

    c.inventory.perks = E.LEGACY_PERKS.map(p => p.id);
    c.inventory.monuments = E.MONUMENTS.map(m => m.id);
    c.flags.milestones = A.MILESTONES.map(m => m.id);
    c.flags.retired = true;
    c.flags.hallOfLegends = true;
    c.flags.everSigned = true;

    c.club.teamId = teamIds[0];
    c.club.momentum = 0.87;
    c.club.roster = {};
    ['TOP', 'JNG', 'MID', 'ADC', 'SUP'].forEach((seat, i) => {
        c.club.roster[seat] = { id: DB[i].id, name: DB[i].name, rating: 90, role: seat };
    });
    c.club.changes = [];
    for (let i = 0; i < 30; i++) {
        c.club.changes.push({
            year: K.DEFAULT_START_YEAR + i, role: 'SUP',
            inName: 'An Incoming Player Name Too Long', outName: 'An Outgoing Player Name Too Long',
            reason: 'A very long reason string that goes past the forty character cap',
        });
    }
    return c;
}

const LONG_NAME = 'D'.repeat(AC.CAREER_STR_MAX.displayName);

{
    const maxed = maxedCareer();
    const docs = B.buildBoardDocs(maxed, { uid: 'u'.repeat(64), displayName: LONG_NAME, slot: 3 });
    truthy('the maxed career builds', !!docs);
    const rowBytes = JSON.stringify(docs.row).length;
    const blobBytes = docs.blob.length;

    console.log('  maxed career : row ' + rowBytes + ' B of ' + B.BOARD_ROW_BYTES_MAX
        + ' (' + Math.round(100 * rowBytes / B.BOARD_ROW_BYTES_MAX) + '%), blob '
        + blobBytes + ' B of ' + B.BOARD_BLOB_BYTES_MAX
        + ' (' + Math.round(100 * blobBytes / B.BOARD_BLOB_BYTES_MAX) + '%)');
    for (const c of CAREERS) {
        if (!c.docs) continue;
        console.log('  ' + pad(c.label, 21) + ': row ' + JSON.stringify(c.docs.row).length
            + ' B, blob ' + c.docs.blob.length + ' B');
    }

    truthy('the maxed row fits the row budget', rowBytes <= B.BOARD_ROW_BYTES_MAX,
        'publishCareerSlot preflights this and refuses with "too-big"; a row over budget is a career '
        + 'that can never publish.');
    truthy('the maxed blob fits the blob budget', blobBytes <= B.BOARD_BLOB_BYTES_MAX);
    eq('the maxed row is still the closed field set', Object.keys(docs.row).length, AC.CAREER_ROW_KEYS);
    assertString('maxed row', 'handle', docs.row.handle, AC.CAREER_STR_MAX.handle);
    assertString('maxed row', 'displayName', docs.row.displayName, AC.CAREER_STR_MAX.displayName);
    eq('a 64-char displayName survives whole', docs.row.displayName.length, AC.CAREER_STR_MAX.displayName,
        'The cap is a cap, not a truncation of legal input.');
    checkRowAgainstRules('maxed', docs.row, maxed, { collect: false });

    // A page of the board is BOARD_LIMIT of these on every load and on every
    // sort switch.
    const page = B.BOARD_LIMIT * rowBytes;
    console.log('  a full page  : ' + B.BOARD_LIMIT + ' x ' + rowBytes + ' B = '
        + Math.round(page / 1024) + ' kB');
    truthy('a full page of maxed rows stays sane (' + Math.round(page / 1024) + ' kB)', page <= 60000,
        'Every sort tab is a fresh 50-document read. A heavy row is paid for on every one of them.');

    // And the maxed career must still SURVIVE the round trip.
    const back = B.sanitizeDossier('u', { v: 1, careerId: docs.row.careerId, blob: docs.blob, updatedAt: 1 });
    truthy('the maxed career decodes', !!back);
    if (back) checkCareerShape('maxed dossier', back);
}

// ---- the rails have to survive each other ---------------------------------
//  REGRESSION. `years` is the denominator of the games, earnedScore and worlds
//  rails, so a save whose years is clamped DOWN by the age rail has to have
//  those three re-checked against the clamped figure. Clamping years last left
//  every one of them measured against a number the published row did not carry,
//  and the rules then denied the write -- silently, permanently, with the
//  client's catch swallowing it.
//
//  Shape: a twenty-year-old (8 legal years) carrying a thirty-year history and
//  a veteran's record. Absurd as a save; trivial as a corrupt one.
{
    const young = maxedCareer();
    young.player.age = 20;
    young.player.startAge = 13;
    young.totals.games = 2000;
    young.totals.wins = 1200;
    young.totals.losses = 800;
    // Enough honours to clear years * 4000 + 400 at eight years but not at 26.
    young.awards = [];
    for (let copy = 0; copy < 20; copy++) {
        for (const def of A.AWARD_DEFS) {
            young.awards.push({ id: def.id, name: def.name, tier: def.tier, year: 2030 + copy, split: 'spring', teamId: 'lec_g2' });
        }
    }

    const yr = A.careerYears(young);
    truthy('the young-veteran fixture really does over-claim its years (' + yr + ')', yr > 8,
        'If careerYears already agreed with the age rail this fixture would prove nothing.');
    const earnedRaw = A.earnedLegacyScore(young);
    truthy('and really does over-claim its legacy (' + earnedRaw + ')', earnedRaw > 8 * 4000 + 400);

    const d = B.buildBoardDocs(young, { uid: 'u', displayName: LONG_NAME, slot: 1 });
    truthy('the young-veteran career builds', !!d);
    if (d) {
        eq('years is clamped by the age rail', d.row.years, d.row.age - 12);
        truthy('games is re-checked against the CLAMPED years (' + d.row.games + ' <= '
            + (d.row.years * 60 + 60) + ')', d.row.games <= d.row.years * 60 + 60,
            'Clamping years after the games rail publishes a row Firestore refuses.');
        truthy('earnedScore is re-checked against the CLAMPED years (' + d.row.earnedScore + ' <= '
            + (d.row.years * 4000 + 400) + ')', d.row.earnedScore <= d.row.years * 4000 + 400,
            'Same ordering, and this is the rail that stops a fourteen-year-old claiming a Hall of '
            + 'Legends score -- so it must be measured against the years actually published.');
        truthy('wins + losses still fits the clamped games', d.row.wins + d.row.losses <= d.row.games,
            'Raising games to cover the record and THEN capping it by the years rail leaves the '
            + 'record hanging over its own total unless wins/losses come down too.');
        eq('finishedScore still equals the FINAL earnedScore', d.row.finishedScore,
            d.row.retired ? d.row.earnedScore : -1,
            'The rules compare the two for exact equality, so it has to be derived after the last '
            + 'clamp on earnedScore, not before it.');
        checkRowAgainstRules('young veteran', d.row, young, { collect: false, railsInert: false });
    }
}

// ---- the trim loop ---------------------------------------------------------
//  Driven with over-long org ids, which is the one field encodeBlob copies from
//  the local save without a length cap -- i.e. exactly the shape a hand-edited
//  save produces. TRIM ORDER: awards oldest-first, then history oldest-first,
//  then proficiency. at2 and tp are never trimmed.
{
    const huge = maxedCareer({ teamIdLen: 220 });
    const fullTrophies = huge.trophies.length;
    const fullAwards = huge.awards.filter(a => A.AWARD_BY_ID[a.id]).length;

    // Prove it really does start over budget, or the assertion below is vacuous.
    const untrimmed = JSON.stringify(huge.history).length + JSON.stringify(huge.awards).length;
    truthy('the over-budget fixture is genuinely over budget (' + untrimmed + ' B of raw rows)',
        untrimmed > B.BOARD_BLOB_BYTES_MAX);

    const docs = B.buildBoardDocs(huge, { uid: 'u', displayName: LONG_NAME, slot: 1 });
    truthy('an over-budget career still builds', !!docs);
    truthy('the trim loop brought it back under budget (' + docs.blob.length + ' B)',
        docs.blob.length <= B.BOARD_BLOB_BYTES_MAX,
        'Without the trim loop Firestore refuses the write, the catch swallows it, and the career '
        + 'silently never appears.');

    const parsed = JSON.parse(docs.blob);
    truthy('the trim loop ACTUALLY FIRED (aw ' + parsed.aw.length + ' of ' + Math.min(100, fullAwards) + ')',
        parsed.aw.length < Math.min(100, fullAwards),
        'If nothing was dropped this fixture never exercised the loop and the check is vacuous.');

    // The whole reason at2 and tp exist: the COUNTS a viewer reads stay correct
    // however much of the itemised list had to go.
    const at2Total = Object.values(parsed.at2).reduce((n, v) => n + v, 0);
    eq('the at2 tally still carries every award', at2Total, fullAwards,
        'at2 is the FULL tally precisely so a trimmed award list still reports the right numbers.');
    eq('the tp count still carries every trophy', parsed.tp, fullTrophies);
    eq('le still carries the full earned score', parsed.le, A.earnedLegacyScore(huge));
    eq('lb still carries the full bought score', parsed.lb, E.monumentScore(huge));

    const back = B.sanitizeDossier('u', { v: 1, careerId: docs.row.careerId, blob: docs.blob, updatedAt: 1 });
    truthy('a trimmed career still decodes', !!back);
    if (back) {
        checkCareerShape('trimmed dossier', back);
        eq('the decoded trophy COUNT is the uncapped one', back.boardTrophyCount, fullTrophies,
            'The itemised list is short; the count must not be.');
        truthy('the decoded itemised list really is shorter', back.awards.length < fullAwards);
    }
}

// ===========================================================================
//  (6)  SAVE SAFETY
// ===========================================================================
section('save safety');

//  THE CHECK NOTHING ELSE IN THE REPO WOULD CATCH. This project has already
//  destroyed real player saves by persisting a store that had not been loaded.
//  Publishing READS a save slot; if any line of board code ever writes one back,
//  the failure is silent and terminal.

function makeSlotCareer(handle, roleId, regionId) {
    const styles = K.PLAYSTYLES[roleId] || [];
    const styleId = styles.length ? styles[0].id : '';
    const champs = styleId ? K.championsForStyle(roleId, styleId) : K.championsForRole(roleId);
    return ST.createCareer({
        handle, pathId: 'precomp', age: 13, regionId, roleId,
        playstyleId: styleId, championId: champs.length ? champs[0].id : '',
    });
}

S.clearStorage();
S.setActiveSlot('career', 1);
ST.resetCareer();
makeSlotCareer('SlotOne', 'TOP', 'LCK');
ST.grantGold(4321);
ST.flushCareer();

S.setActiveSlot('career', 2);
ST.resetCareer();
makeSlotCareer('SlotTwo', 'JNG', 'LCS');
ST.grantGold(1234);
ST.flushCareer();

// Play from slot 1 while publishing slot 2 -- the case where a stray write is
// most destructive, because it lands in whichever slot happens to be active.
// initCareer() alone, with NO resetCareer() in front of it: resetCareer writes
// a blank career straight through saveToStorage, which is deliberate deletion.
S.setActiveSlot('career', 1);
const backIn1 = ST.initCareer();
eq('slot 1 is loaded and is its own career', backIn1.player.handle, 'SlotOne');
ST.flushCareer();
await sleep(200);
ST.flushCareer();

function snapshotStorage() {
    return JSON.stringify([...storage.m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

AUTH.currentUser.set({ uid: 'boardcheck-uid', displayName: 'Board Tester' });

/**
 * Records every collection/doc/set/delete/get, AND remembers what was written.
 *
 * It used to remember nothing, and that turned out to hide the thing most worth
 * checking. The uploader decides whether to write by comparing a signature of
 * what it is about to send against a signature of what the server already
 * holds -- so a stub whose get() always answers "no such document" makes every
 * sweep look like a first publish, and the entire skip-if-unchanged path goes
 * untested while reporting green. The same amnesia hides the cross-device case,
 * where a row disappearing between two reads is the whole signal.
 *
 * `docs` is shared between stubs on purpose: the blocks below are one
 * continuous session against one world, and a fresh Map per block would put
 * every one of them back in the amnesiac state.
 */
function makeDbStub(docs) {
    const store = docs instanceof Map ? docs : new Map();
    const calls = [];
    const key = (c, id) => c + '/' + id;
    const api = {
        collection(name) {
            calls.push({ op: 'collection', name });
            return {
                doc(id) {
                    calls.push({ op: 'doc', collection: name, id });
                    return {
                        async set(data) {
                            calls.push({ op: 'set', collection: name, id, data });
                            // A deep copy, because Firestore hands back a fresh
                            // object and the caller is free to mutate what it
                            // sent. Sharing the instance would let a later edit
                            // silently rewrite history.
                            store.set(key(name, id), JSON.parse(JSON.stringify(data)));
                        },
                        async delete() {
                            calls.push({ op: 'delete', collection: name, id });
                            store.delete(key(name, id));
                        },
                        async get() {
                            calls.push({ op: 'get', collection: name, id });
                            const has = store.has(key(name, id));
                            const data = has ? store.get(key(name, id)) : {};
                            return { exists: has, id, data: () => JSON.parse(JSON.stringify(data)) };
                        },
                    };
                },
                orderBy() { return this; },
                limit() { return this; },
                async get() { calls.push({ op: 'query', collection: name }); return { forEach() {} }; },
            };
        },
    };
    return { api, calls, store };
}

/** The one world every stub in this section writes into. */
const DB_WORLD = new Map();

const beforeStorage = snapshotStorage();
const beforeStore = JSON.stringify(readStore(ST.career));
const beforeSlot = S.activeSlot('career');
// Read rather than assumed: createCareer seeds gold from the start path, so a
// literal here would pin this harness to a balance number it has no business
// knowing about.
const goldBefore = { 1: ST.careerSlotRaw(1).money.gold, 2: ST.careerSlotRaw(2).money.gold };
truthy('the two slots hold different gold to begin with', goldBefore[1] !== goldBefore[2],
    'If both slots looked identical, reading the wrong one would be invisible below.');

const stub = makeDbStub(DB_WORLD);
win.fbDb = stub.api;

const pub = await CB.publishCareerSlot(2);

eq('publishCareerSlot(2) succeeded', pub.code, 'ok');
truthy('publishCareerSlot(2) reports ok', pub.ok === true);

eq('LOCAL STORAGE IS BYTE-IDENTICAL AFTER PUBLISHING', snapshotStorage(), beforeStorage,
    'This is the bug class that destroyed real player saves. Board code reads a slot through '
    + 'careerSlotRaw(), which is a fresh JSON.parse -- it must never write one back.');
eq('THE CAREER STORE IS BYTE-IDENTICAL AFTER PUBLISHING', JSON.stringify(readStore(ST.career)), beforeStore,
    'Publishing slot 2 must not disturb the slot 1 career the player is actually in.');
eq('the active slot did not move', S.activeSlot('career'), beforeSlot,
    'A publisher that switched slot to read one would strand the save it left.');

const sets = stub.calls.filter(c => c.op === 'set');
eq('exactly two documents were written', sets.length, 2);
eq('the DOSSIER is written first', sets[0] && sets[0].collection, 'careerBoardProfiles',
    'There are no batches or transactions in this codebase, so write ORDER is the whole anti-desync '
    + 'mechanism. A failed row write leaves a dossier nobody can rank -- harmless. The reverse leaves '
    + 'a ranked row pointing at a stale dossier.');
eq('the RANKING ROW is written second', sets[1] && sets[1].collection, 'careerBoard');
eq('both documents are keyed by uid AND SLOT', (sets[0] && sets[0].id) + '/' + (sets[1] && sets[1].id),
    'boardcheck-uid__2/boardcheck-uid__2',
    'ONE DOCUMENT PER SAVE SLOT. Keying on the uid alone is what made a second career replace the '
    + 'first. The path is still the ownership proof -- firestore.rules rebuilds these three ids from '
    + 'request.auth.uid rather than parsing this one.');
eq('the client and the rules build the SAME entry id', B.entryIdFor('boardcheck-uid', 2),
    'boardcheck-uid__2',
    'ownsCareerSlot() in firestore.rules is three literal comparisons against uid + "__1".."__3". '
    + 'A separator that disagreed with entryIdFor would deny every publish, silently and for ever.');
falsy('nothing was deleted', stub.calls.some(c => c.op === 'delete'),
    'The legacy pre-slot document is only purged when a read actually FOUND one. A blind delete '
    + 'would spend two writes a session on every account that has never published, and would make '
    + 'this assertion untestable.');

// The document that actually went over the wire is the one the rules judge.
if (sets[1]) {
    eq('the published row is the closed field set', Object.keys(sets[1].data).length, AC.CAREER_ROW_KEYS);
    eq('the published row names the right slot', sets[1].data.slot, 2,
        'The published slot is a FIELD; publishing slot 2 while playing slot 1 must say 2.');
    eq('the published row is the right career', sets[1].data.handle, 'SlotTwo',
        'Reading the wrong slot would put the career the player is IN on the board under the other one\'s id.');
    checkRowAgainstRules('published', sets[1].data, ST.careerSlotRaw(2), { collect: false });
}
if (sets[0]) {
    eq('the published dossier is the closed field set', Object.keys(sets[0].data).length, AC.CAREER_DOSSIER_KEYS);
    eq('the dossier careerId matches the row', sets[0].data.careerId, sets[1] && sets[1].data.careerId,
        'A dossier under a different careerId is a board entry whose numbers disagree with what it opens.');
}

// ---- "am I published" is DERIVED, never stored -----------------------------
truthy('isSlotPublished(2) is true after publishing slot 2', CB.isSlotPublished(2),
    'Derived by comparing careerFingerprint(save) to the row Firestore handed back.');
falsy('isSlotPublished(1) is false', CB.isSlotPublished(1));
truthy('isCareerPublished() is false for the loaded slot-1 career', CB.isCareerPublished(readStore(ST.career)) === false);
eq('asking the question wrote nothing', snapshotStorage(), beforeStorage,
    'A published FLAG in the save would survive a slot delete, a cloud restore and a sign-out, and '
    + 'every one of those makes it a lie.');

// ---- hide, and the automatic uploader -------------------------------------
//  HIDE IS NOT UNPUBLISH. It deletes the ranking row -- that is what takes the
//  career off the board -- and then REWRITES the dossier with hidden:true. If it
//  deleted both, the career would be back within a minute: publication is
//  automatic now, so the only thing that can keep a career down is a durable
//  marker the uploader consults. That marker cannot live in the save (this file
//  is read-side machinery) and it cannot live on the row (the row is gone), so
//  it lives in the one document that is left.
{
    const stub2 = makeDbStub(DB_WORLD);
    win.fbDb = stub2.api;
    const un = await CB.hideCareerSlot(2);
    truthy('hideCareerSlot succeeded', un.ok === true);

    const dels = stub2.calls.filter(c => c.op === 'delete');
    eq('exactly one document was deleted', dels.length, 1);
    eq('the RANKING ROW is what gets deleted', dels[0] && dels[0].collection, 'careerBoard',
        'The row is what makes a career visible and rankable, so it goes first and unconditionally.');
    eq('the deleted row is the right SLOT', dels[0] && dels[0].id, 'boardcheck-uid__2',
        'Hiding slot 2 must not touch slot 1 or slot 3. They are three independent entries.');

    const hideSets = stub2.calls.filter(c => c.op === 'set');
    eq('the dossier is REWRITTEN, not deleted', hideSets.length, 1);
    eq('...in the dossier collection', hideSets[0] && hideSets[0].collection, 'careerBoardProfiles');
    eq('...at the same slot', hideSets[0] && hideSets[0].id, 'boardcheck-uid__2');
    truthy('...carrying hidden: true', hideSets[0] && hideSets[0].data.hidden === true,
        'This flag IS the feature. Without it the uploader re-lists the career on the next sweep, '
        + 'and on every other device the player signs in on.');
    eq('...with the blob emptied', hideSets[0] && hideSets[0].data.blob, '',
        'A hidden career must not leave a readable copy of itself at a guessable public path. The '
        + 'rules no longer require blob.size() > 0 for exactly this write.');
    eq('the hidden dossier is still the closed field set',
        hideSets[0] ? Object.keys(hideSets[0].data).length : 0, AC.CAREER_DOSSIER_KEYS);
    truthy('isSlotHidden(2) is true after hiding it', CB.isSlotHidden(2));
    falsy('isSlotHidden(1) is unaffected', CB.isSlotHidden(1),
        'Hiding one slot must say nothing about the others.');
    eq('hiding wrote nothing to disk', snapshotStorage(), beforeStorage);
    eq('hiding did not touch the career store', JSON.stringify(readStore(ST.career)), beforeStore);
}
{
    // A HIDDEN SLOT IS NEVER RE-PUBLISHED BY THE UPLOADER. This is the whole
    // contract of the Hide button, and it is silent when broken -- the career
    // simply reappears a minute later and the player cannot tell whether they
    // mis-clicked.
    const stub3 = makeDbStub(DB_WORLD);
    win.fbDb = stub3.api;
    const fired = await CB.maybeAutoPublish(ST.careerSlotRaw(2), 2);
    falsy('maybeAutoPublish REFUSES a hidden slot', fired);
    eq('...and wrote nothing at all', stub3.calls.filter(c => c.op === 'set').length, 0);
    eq('...and wrote nothing to disk', snapshotStorage(), beforeStorage);

    // And it comes back on a press, because clearing the flag alone would leave
    // the button looking broken for a minute.
    const stub3b = makeDbStub(DB_WORLD);
    win.fbDb = stub3b.api;
    const shown = await CB.showCareerSlot(2, { silent: true });
    truthy('showCareerSlot re-publishes immediately', shown.ok === true);
    const backSets = stub3b.calls.filter(c => c.op === 'set');
    eq('...writing both documents again', backSets.length, 2);
    truthy('...with hidden back to false', backSets[0] && backSets[0].data.hidden === false);
    truthy('...and a real blob', !!(backSets[0] && backSets[0].data.blob.length > 10));
    falsy('isSlotHidden(2) is false again', CB.isSlotHidden(2));
    eq('showing wrote nothing to disk', snapshotStorage(), beforeStorage);
}
{
    // PUBLICATION IS NO LONGER AN OPT-IN. The old contract was the exact
    // opposite -- "nothing may FIRST publish from the background refresh" -- and
    // it is asserted here in its new form so the change is deliberate rather
    // than a regression somebody has to guess at.
    const stub4 = makeDbStub(DB_WORLD);
    win.fbDb = stub4.api;
    const fired = await CB.maybeAutoPublish(ST.careerSlotRaw(1), 1);
    truthy('maybeAutoPublish DOES publish a slot that has never been up', fired,
        'Every career goes on the board on its own now; the only decision left to the player is Hide.');
    const autoSets = stub4.calls.filter(c => c.op === 'set');
    eq('...writing exactly two documents', autoSets.length, 2);
    eq('...the dossier first', autoSets[0] && autoSets[0].collection, 'careerBoardProfiles');
    eq('...both at slot 1', (autoSets[0] && autoSets[0].id) + '/' + (autoSets[1] && autoSets[1].id),
        'boardcheck-uid__1/boardcheck-uid__1');
    eq('...for the career actually in slot 1', autoSets[1] && autoSets[1].data.handle, 'SlotOne',
        'Reading the wrong slot would put one career on the board under the other one\'s id.');
    eq('the automatic upload wrote nothing to disk', snapshotStorage(), beforeStorage);
    eq('the automatic upload did not touch the career store',
        JSON.stringify(readStore(ST.career)), beforeStore);

    // ...and having just written it, it must not write it again. THE CONTENT
    // SIGNATURE IS THE REAL GATE, and this proves that rather than the timer:
    // autoSyncBoard({force:true}) skips both rate limits, so anything that
    // still refuses is refusing on content. A timer alone would upload three
    // unchanged documents a minute for ever, and a signature that never matched
    // -- which is what hashing the objects wholesale would give, since
    // sanitizeRow adds fields buildBoardDocs never wrote -- would look
    // identical from the outside.
    const stub4b = makeDbStub(DB_WORLD);
    win.fbDb = stub4b.api;
    const again = await CB.autoSyncBoard({ force: true });
    falsy('a forced sweep does NOT rewrite unchanged documents', again);
    eq('...writing nothing at all', stub4b.calls.filter(c => c.op === 'set').length, 0,
        'The signature must read the same for a row built by buildBoardDocs and the same row read '
        + 'back through sanitizeRow, or "Sync now" becomes a write amplifier.');
    truthy('...but it did re-read', stub4b.calls.some(c => c.op === 'get'),
        'A sweep that skipped the read as well would never notice a change made on another device.');
}
{
    // THE THREE SLOTS ARE INDEPENDENT. This is the bug the whole change exists
    // to fix: publishing a second career used to delete the first.
    const stub5 = makeDbStub(DB_WORLD);
    win.fbDb = stub5.api;
    await CB.publishCareerSlot(1, { silent: true });
    await CB.publishCareerSlot(2, { silent: true });
    const ids = stub5.calls.filter(c => c.op === 'set' && c.collection === 'careerBoard').map(c => c.id);
    eq('two slots published to two different documents', ids.join(','),
        'boardcheck-uid__1,boardcheck-uid__2',
        'One document per uid meant the second career overwrote the first and the board could only '
        + 'ever show one of a player\'s three.');
    falsy('publishing a second slot deleted nothing', stub5.calls.some(c => c.op === 'delete'),
        'The old flow deleted the previous entry, by design. Nothing may do that now.');
    const entries = readStore(CB.myBoardEntries);
    truthy('both entries are held at once', !!entries[1] && !!entries[2]);
    eq('...under their own slot numbers', entries[1].slot + '/' + entries[2].slot, '1/2');
    truthy('...and remember which account they belong to',
        entries[1].uid === 'boardcheck-uid' && entries[2].uid === 'boardcheck-uid',
        'sanitizeRow parses the account out of the path so all three of a player\'s rows can be '
        + 'marked "(You)" -- markMine compares on uid, not on the entry id.');
    eq('publishing two slots wrote nothing to disk', snapshotStorage(), beforeStorage);
}
{
    // ANOTHER DEVICE HID IT. This is the one case a device-local flag cannot
    // cover and the reason `hidden` is a field on the dossier at all: the
    // player hides a career on their phone, and the desktop that is still open
    // must not put it back inside the minute.
    //
    // Reaching in and editing the world directly is the point -- it is exactly
    // what a second client does, and there is no other way to express "somebody
    // else changed this" from inside one session.
    DB_WORLD.delete('careerBoard/boardcheck-uid__1');
    DB_WORLD.set('careerBoardProfiles/boardcheck-uid__1',
        { v: 1, careerId: 'cWHATEVER', blob: '', hidden: true, updatedAt: 1 });

    const stub6 = makeDbStub(DB_WORLD);
    win.fbDb = stub6.api;
    const wrote = await CB.autoSyncBoard({ force: true });

    falsy('a career hidden on ANOTHER device is not re-listed', wrote);
    falsy('...and no row was written for it',
        stub6.calls.some(c => c.op === 'set' && c.collection === 'careerBoard'
            && c.id === 'boardcheck-uid__1'),
        'The session believed slot 1 was up and not hidden. A row it had disappearing is the only '
        + 'signal that belief is stale, and it must trigger a dossier re-read rather than a re-publish.');
    truthy('...the dossier WAS re-read to find that out',
        stub6.calls.some(c => c.op === 'get' && c.collection === 'careerBoardProfiles'
            && c.id === 'boardcheck-uid__1'),
        'Skipping the read because the flag was already "known" is precisely the bug: what was known '
        + 'is now out of date.');
    truthy('isSlotHidden(1) now reports the other device\'s decision', CB.isSlotHidden(1));
    eq('learning that wrote nothing to disk', snapshotStorage(), beforeStorage);

    // And a slot whose row vanished with NO hidden marker is a genuinely
    // deleted entry, which SHOULD go back up -- otherwise a lost write is
    // permanent. The two cases are told apart by the dossier and nothing else.
    DB_WORLD.delete('careerBoard/boardcheck-uid__2');
    DB_WORLD.delete('careerBoardProfiles/boardcheck-uid__2');
    const stub7 = makeDbStub(DB_WORLD);
    win.fbDb = stub7.api;
    await CB.autoSyncBoard({ force: true });
    truthy('a row that vanished with no hidden marker IS re-published',
        stub7.calls.some(c => c.op === 'set' && c.collection === 'careerBoard'
            && c.id === 'boardcheck-uid__2'),
        'Treating every disappearance as a hide would make one lost write permanent, and the player '
        + 'would have no button that fixes it.');
}
{
    // The entry id round trip, with the shapes that actually reach it.
    const cases = [
        ['abc__1', 'abc', 1],
        ['abc__3', 'abc', 3],
        // A uid containing a single underscore -- legal in a Firebase uid, and
        // the reason the separator is two of them.
        ['a_b__2', 'a_b', 2],
        // Pre-slot documents: a bare uid, which must still resolve and render.
        ['abc', 'abc', 0],
        // Out of range, and not a number. Neither may be trusted as a slot.
        ['abc__4', 'abc__4', 0],
        ['abc__0', 'abc__0', 0],
        ['abc__x', 'abc__x', 0],
        ['__1', '__1', 0],
    ];
    for (const [id, uid, slot] of cases) {
        const got = B.parseEntryId(id);
        eq('parseEntryId(' + JSON.stringify(id) + ')', got.uid + '/' + got.slot, uid + '/' + slot,
            'A doc id is remote input on every row but the viewer\'s own. It is parsed for DISPLAY '
            + 'only -- the rules already proved ownership from the path -- but a mis-parse still '
            + 'mislabels whose career a row is.');
    }
    for (const n of [1, 2, 3]) {
        eq('entryIdFor round trips slot ' + n, B.parseEntryId(B.entryIdFor('someuid', n)).slot, n);
    }
    // Rot: sanitizeRow must never throw on an id it cannot make sense of.
    for (const junk of [null, undefined, '', 7, {}, [], '__', 'x'.repeat(400)]) {
        let r = null;
        try { r = B.sanitizeRow(junk, {}); }
        catch (e) { bad('sanitizeRow survives id ' + JSON.stringify(junk), 'threw: ' + e.message); continue; }
        truthy('sanitizeRow(' + JSON.stringify(junk) + ') yields string ids',
            typeof r.entryId === 'string' && typeof r.uid === 'string');
    }
}
{
    // And it must survive every rot shape careerRender parks in the store.
    const stub4 = makeDbStub(DB_WORLD);
    win.fbDb = stub4.api;
    for (const shape of [null, undefined, {}, 'x', 7, { created: true }, { created: true, player: null },
        { created: true, history: null }, { created: true, flags: null }]) {
        let out;
        try { out = await CB.maybeAutoPublish(shape, 1); }
        catch (e) { bad('maybeAutoPublish survives ' + JSON.stringify(shape), 'threw: ' + e.message,
            'It runs on the week tick from CareerShell with whatever is in the store.'); continue; }
        falsy('maybeAutoPublish declines ' + JSON.stringify(shape), out);
    }
    eq('rot shapes wrote nothing to disk', snapshotStorage(), beforeStorage);
}

// ---- with Firestore absent, everything must still be inert -----------------
{
    delete win.fbDb;
    const r = await CB.publishCareerSlot(2);
    eq('publishing with no database reports offline', r.code, 'offline',
        'careerRender defines globalThis.window and never defines fbDb, so `typeof window` is NOT '
        + 'a sufficient guard. Every call site gates on window.fbDb itself.');
    const rows = await CB.loadBoardPage('earnedScore');
    truthy('loadBoardPage returns an array offline', Array.isArray(rows));
    eq('boardState reports offline', readStore(CB.boardState).status, 'offline');
    eq('fetchedAt is NEVER stamped by a failed read', readStore(CB.boardState).fetchedAt, 0,
        'Leaderboard.svelte stamps lastSync after a catch that swallows the error, so "offline" and '
        + '"synced and genuinely empty" render identically. This board must be able to tell them apart.');
    eq('an offline session wrote nothing to disk', snapshotStorage(), beforeStorage);
    truthy('openDossier is inert offline', (await CB.openDossier('someone')) === null);
    eq('publishing with no save reports no-save', (await CB.publishCareerSlot(3)).code, 'offline');
}
{
    // signed out
    AUTH.currentUser.set(null);
    win.fbDb = makeDbStub(DB_WORLD).api;
    eq('publishing signed out is refused', (await CB.publishCareerSlot(2)).code, 'signed-out');
    eq('an empty slot is refused', (await (async () => {
        AUTH.currentUser.set({ uid: 'boardcheck-uid', displayName: 'Board Tester' });
        return CB.publishCareerSlot(3);
    })()).code, 'no-save', 'Slot 3 holds nothing; publishing it must not invent a career.');
    delete win.fbDb;
    AUTH.currentUser.set(null);
    eq('every refusal wrote nothing to disk', snapshotStorage(), beforeStorage);
}

// ---- the saves are all still there ----------------------------------------
eq('slot 1 still holds its career', ST.careerSlotSummary(1) && ST.careerSlotSummary(1).handle, 'SlotOne');
eq('slot 2 still holds its career', ST.careerSlotSummary(2) && ST.careerSlotSummary(2).handle, 'SlotTwo');
eq('slot 1 still holds its gold', ST.careerSlotRaw(1).money.gold, goldBefore[1]);
eq('slot 2 still holds its gold', ST.careerSlotRaw(2).money.gold, goldBefore[2]);
falsy('slot 3 is still empty', ST.hasCareerSave(3));

// ===========================================================================
//  (7)  LINT
// ===========================================================================
section('lint');

/** Strip comments so the prose in these files' headers -- which NAMES the
 *  forbidden functions in order to forbid them -- cannot trip the lint. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const WRITERS = [
    'saveCareer', 'flushCareer', 'initCareer', 'resetCareer', 'importCareerSlots',
    'setActiveSlot', 'saveToStorage', 'saveToSlot', 'retire', 'grantAwards',
    'grantMilestones', 'checkMilestones',
];

const LINT_FILES = [
    'lib/career/board.js',
    'lib/stores/careerBoard.js',
    'lib/components/career/CareerBoard.svelte',
];

/** A CALL, dotted or bare. `A.retire()` is exactly as forbidden as `retire()`,
 *  so a preceding dot is NOT an escape -- but the trailing paren is what makes
 *  this a call site, which is what keeps `import { blankCareer }` legal. */
function writerCall(fn) { return new RegExp('(^|[^\\w$])' + fn + '\\s*\\(', 'm'); }
/** A store write on the career store specifically. Here a preceding dot DOES
 *  matter: myBoardEntries.set() and _pages.set() are legitimate and constant. */
function storeCall(prop) { return new RegExp('(^|[^\\w.$])career\\s*\\.\\s*' + prop + '\\s*\\(', 'm'); }

// A lint that matches nothing is indistinguishable from a clean codebase, which
// is the wired-and-dead failure careerSmoke's inertness assertions exist for.
// Every pattern below is proved against a positive and a negative control.
{
    truthy('lint self-test: a bare call is caught', writerCall('saveCareer').test('  saveCareer();'));
    truthy('lint self-test: a dotted call is caught', writerCall('retire').test('const s = A.retire({ force: true });'));
    truthy('lint self-test: a spaced call is caught', writerCall('flushCareer').test('flushCareer ()'));
    falsy('lint self-test: a plain import is NOT caught',
        writerCall('saveCareer').test("import { saveCareer, blankCareer } from '../stores/career.js';"),
        'Matching by call site is what lets board.js legally import blankCareer and hydrateForeignCareer.');
    falsy('lint self-test: a longer name is NOT caught',
        writerCall('activeSlot').test('const n = setActiveSlot("career", 2);'));
    falsy('lint self-test: a property read is NOT caught', writerCall('retire').test('if (flags.retired) {}'));
    truthy('lint self-test: career.set is caught', storeCall('set').test('career.set(blankCareer());'));
    truthy('lint self-test: career.update is caught', storeCall('update').test('  career.update(x => x);'));
    falsy('lint self-test: another store\'s set is NOT caught', storeCall('set').test('myBoardEntries.set(row);'));
    falsy('lint self-test: a namespaced career.set is NOT confused',
        storeCall('set').test('_pages.set(key, rows);'));
    truthy('lint self-test: comments are stripped',
        stripComments('// never call saveCareer() here\nconst x = 1;').indexOf('saveCareer') < 0,
        'These files NAME the forbidden functions in prose in order to forbid them.');
    falsy('lint self-test: a URL is not mistaken for a comment',
        stripComments("const u = 'http://x/y';").indexOf('http') < 0);
}

for (const rel of LINT_FILES) {
    const file = path.join(ROOT, 'src', rel);
    if (!fs.existsSync(file)) { bad('lint: ' + rel + ' exists', 'file not found'); continue; }
    const code = stripComments(fs.readFileSync(file, 'utf8'));

    for (const fn of WRITERS) {
        // BY CALL SITE. `import { blankCareer, hydrateForeignCareer }` stays
        // legal, and so does the word appearing in a comment.
        falsy('lint ' + rel + ': never calls ' + fn + '()', writerCall(fn).test(code),
            'Board code is read-side machinery. This project has already destroyed real player saves '
            + 'by persisting a store that had not been loaded.');
    }
    falsy('lint ' + rel + ': never calls localStorage.setItem', /localStorage\s*\.\s*setItem\s*\(/.test(code));
    falsy('lint ' + rel + ': never calls sessionStorage.setItem', /sessionStorage\s*\.\s*setItem\s*\(/.test(code));
    falsy('lint ' + rel + ': never calls career.set(', storeCall('set').test(code));
    falsy('lint ' + rel + ': never calls career.update(', storeCall('update').test(code));
    falsy('lint ' + rel + ': never calls localStorage.clear', /localStorage\s*\.\s*clear\s*\(/.test(code));
}

// Svelte components must have no module-scope side effects: onMount never runs
// under SSR, which is why every empty/loading/error state lives in the markup.
{
    const cbv = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'components', 'career', 'CareerBoard.svelte'), 'utf8');
    const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(cbv);
    const body = script ? stripComments(script[1]) : '';
    for (const [what, re] of [
        ['setInterval', /(^|[^\w.$])setInterval\s*\(/m],
        ['setTimeout at module scope', /^\s*setTimeout\s*\(/m],
        ['a bare fetch', /(^|[^\w.$])fetch\s*\(/m],
    ]) {
        falsy('lint CareerBoard.svelte: no ' + what, re.test(body),
            'No module-scope or script-body side effects: onMount never runs under SSR.');
    }
    truthy('CareerBoard.svelte guards on window.fbDb, not typeof window',
        /window\s*&&\s*window\.fbDb|window\.fbDb/.test(body),
        'careerRender sets globalThis.window and never defines fbDb.');
}

// ---- the ranked table may never be keyed on the ACCOUNT --------------------
//  NO OTHER HARNESS CAN SEE THIS. Svelte's SSR generator discards each-block
//  keys entirely, so careerRender compiles the same file with zero occurrences
//  of validate_each_keys and 1356 clean renders prove nothing about it; and
//  svelteCheck compiles in SSR mode too, while a duplicate key is a RUNTIME
//  error. So it is a text lint, and it is here because one account now
//  legitimately owns up to three rows that all carry the same uid: keying on
//  the account throws "Cannot have duplicate keys in a keyed each" in dev, and
//  in a production build mounts one shared block twice and silently drops a
//  career out of the table. This shipped once already.
{
    const cbv = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'components', 'career', 'CareerBoard.svelte'), 'utf8');
    const eachKeys = [];
    const re = /\{#each\s+([^}]*?)\s+as\s+[^}(]*\(\s*([A-Za-z0-9_$.]+)\s*\)\s*\}/g;
    let m;
    while ((m = re.exec(cbv))) eachKeys.push({ list: m[1].trim(), key: m[2] });

    truthy('the lint found the keyed each blocks at all', eachKeys.length >= 3,
        'A lint that matches nothing is indistinguishable from a clean codebase.');

    const rowBlocks = eachKeys.filter(e => /shownRows|boardRows|\brows\b/.test(e.list));
    truthy('the ranked table is a keyed each over the rows', rowBlocks.length >= 1);
    for (const e of rowBlocks) {
        falsy('the ranked table is NOT keyed on the account (' + e.list + ')', /\buid$/.test(e.key),
            'One account holds up to three rows and sanitizeRow gives all three the same uid. '
            + 'decorate() de-duplicates entryId for exactly this.');
        eq('the ranked table is keyed on the ENTRY id (' + e.list + ')', e.key, 'r.entryId');
    }
    // Positive and negative controls for the pattern itself.
    truthy('lint self-test: a uid key IS caught',
        /\{#each\s+([^}]*?)\s+as\s+[^}(]*\(\s*([A-Za-z0-9_$.]+)\s*\)\s*\}/.test('{#each shownRows as r (r.uid)}'));
    {
        const t = /\{#each\s+([^}]*?)\s+as\s+[^}(]*\(\s*([A-Za-z0-9_$.]+)\s*\)\s*\}/.exec('{#each shownRows as r (r.uid)}');
        eq('lint self-test: it extracts the key expression', t && t[2], 'r.uid');
        falsy('lint self-test: an unkeyed each is not matched',
            /\{#each\s+([^}]*?)\s+as\s+[^}(]*\(\s*([A-Za-z0-9_$.]+)\s*\)\s*\}/.test('{#each shownRows as r}'));
    }
}

// ---- CareerDossier: no reader may fall through to snapshot() ---------------
//  Every one of these does `const st = c || snapshot()`. Called with a bare `c`
//  that happens to be null, they silently return THE VIEWER'S OWN numbers,
//  printed under a stranger's handle.
{
    const dossierPath = path.join(ROOT, 'src', 'lib', 'components', 'career', 'CareerDossier.svelte');
    if (!fs.existsSync(dossierPath)) {
        bad('lint: CareerDossier.svelte exists', 'file not found');
    } else {
        const src = fs.readFileSync(dossierPath, 'utf8');
        const FALLTHROUGH = [
            'legacyScore', 'earnedLegacyScore', 'peakOVR', 'careerYears', 'claimedMilestoneIds',
            'awardHistoryByYear', 'canRetire', 'careerSummary', 'hallOfLegendsEligible',
            'clubRosterFor', 'monumentScore',
        ];
        /** The argument must be exactly `c`. `c0` is the guarded one and is the
         *  whole point, so the character after it decides everything. */
        const bareC = (fn) => new RegExp('(^|[^\\w$])' + fn + '\\s*\\(\\s*c\\s*[,)]', 'm');
        truthy('lint self-test: a bare c IS caught', bareC('peakOVR').test('$: peak = peakOVR(c);'));
        truthy('lint self-test: a bare c with a second arg IS caught', bareC('legacyScore').test('legacyScore(c, 1)'));
        truthy('lint self-test: a spaced bare c IS caught', bareC('careerYears').test('careerYears( c )'));
        falsy('lint self-test: the guarded c0 is NOT caught', bareC('careerYears').test('$: years = careerYears(c0);'));
        falsy('lint self-test: a different variable is NOT caught', bareC('peakOVR').test('peakOVR(career)'));
        falsy('lint self-test: a remote field read is NOT caught',
            bareC('peakOVR').test('$: peak = remote ? remote.peakOVR : peakOVR(c0);'));

        for (const fn of FALLTHROUGH) {
            falsy('lint CareerDossier: ' + fn + '() never takes a bare `c`', bareC(fn).test(src),
                'These fall back to `c || snapshot()`. A bare `c` that is null renders the VIEWER\'S '
                + 'own career under a stranger\'s handle -- and that is a data leak the reader cannot see.');
        }
        truthy('CareerDossier guards its prop into c0',
            /c\s*&&\s*typeof\s+c\s*===\s*'object'/.test(src),
            'The guard is what makes every reader above safe: `c0 = (c && typeof c === "object") ? c : BLANK`.');
        truthy('CareerDossier takes `c` as a prop', /export\s+let\s+c\s*=/.test(src));
        truthy('CareerDossier takes `remote` as a prop', /export\s+let\s+remote\s*=/.test(src));
        truthy('CareerDossier gates owner-only behaviour on `mine`', /export\s+let\s+mine\s*=/.test(src));
    }
}

// ---------------------------------------------------------------------------
console.log('');
if (notes.length) {
    console.log('  ' + notes.length + ' note' + (notes.length === 1 ? '' : 's') + ' above are informational, not failures.');
}
if (failures) {
    console.log('FAILED -- ' + failures + ' of ' + checks + ' checks.');
    process.exitCode = 1;
} else {
    console.log('All ' + checks + ' career board checks passed.');
    process.exitCode = 0;
}
