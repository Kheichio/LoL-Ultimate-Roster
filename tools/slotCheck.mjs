// ===========================================================================
//  slotCheck.mjs -- validates the save slot system
// ===========================================================================
//  Three save slots per gamemode, namespaced inside src/lib/utils/storage.js so
//  no caller has to know slots exist. That design is what makes it dangerous:
//  every failure mode is silent and every one of them destroys a real save.
//
//    1. Slot 1 MUST resolve to the bare key. Every save that existed before
//       slots shipped is slot 1; if that ever stops being true, every player
//       opens the game to an empty club and a career that never happened.
//    2. Writing in one slot must not touch another, in either direction.
//    3. Device preferences (theme, audio) must never be namespaced, or the
//       player's settings reset every time they switch save.
//    4. Deleting a slot must delete exactly that slot, in exactly one gamemode.
//    5. The two summary readers must read a slot WITHOUT switching to it -- a
//       picker that switched slot to draw a card would be a picker that loses
//       the save you were about to go back to.
//    6. The roster stores must actually reset between slots. initGame() merges
//       rather than loads, so without resetGameStores() slot A's club, essence
//       and quests bleed into slot B.
//
//  None of that shows up in a build, a render pass or a career smoke run.
//
//      node tools/slotCheck.mjs
//      node tools/slotCheck.mjs --verbose
// ===========================================================================

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
//  BROWSER SHIM -- must exist before any store is imported
//  Deliberately smaller than careerSmoke's: nothing here renders or plays a
//  sound. It does need length/key(), because clearStorage() enumerates.
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
win.navigator = { userAgent: 'slotCheck', language: 'en' };
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
//  stores/game.js validates every saved card against it, so a synthetic stub
//  would make the club round-trip test pass against nothing.
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
        + ' entries. game.js strips every saved card it cannot find in the database, so the club '
        + 'round-trip below would pass against nothing. Refusing to run.');
    process.exit(2);
}

// ---------------------------------------------------------------------------
//  MODULES
// ---------------------------------------------------------------------------
const load = (rel) => import(pathToFileURL(path.join(ROOT, 'src', rel)).href);
const S = await load('lib/utils/storage.js');
const K = await load('lib/career/constants.js');
const GAME = await load('lib/stores/game.js');
const CAREER = await load('lib/stores/career.js');

function readStore(s) { let out; const un = s.subscribe(v => { out = v; }); un(); return out; }

// ---------------------------------------------------------------------------
//  HARNESS
// ---------------------------------------------------------------------------
let failures = 0, checks = 0;

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

function section(name) {
    console.log('');
    console.log('=== ' + name + ' ' + '='.repeat(Math.max(4, 66 - name.length)));
}

console.log('');
console.log('=========================================================');
console.log('  LoL ULTIMATE -- save slot check');
console.log('  slots : ' + S.SLOT_IDS.join(', '));
console.log('  cards : ' + DB.length + ' loaded from public/database.js');
console.log('=========================================================');

// ---------------------------------------------------------------------------
section('key resolution');
// ---------------------------------------------------------------------------
S.setActiveSlot('roster', 1);
S.setActiveSlot('career', 1);

eq('roster slot 1 is the bare key', S.resolveKey('lur_be', 1), 'lur_be',
    'Every save that predates slots lives on the bare key. Namespacing slot 1 wipes them all.');
eq('career slot 1 is the bare key', S.resolveKey('lurc_career', 1), 'lurc_career',
    'Same for career. tools/careerRender.mjs also seeds this key by name.');
eq('roster slot 2 is namespaced', S.resolveKey('lur_be', 2), 'lur_be@2');
eq('career slot 3 is namespaced', S.resolveKey('lurc_career', 3), 'lurc_career@3');

eq('lurc_ is career, not roster', S.familyOf('lurc_career'), 'career',
    '"lurc_" starts with "lur", so it must be tested first or career saves land in the roster family.');
eq('lur_ is roster', S.familyOf('lur_club'), 'roster');

for (const k of ['lur_sound_muted', 'lur_light_mode', 'lur_display_scale']) {
    eq('device pref ' + k + ' has no family', S.familyOf(k), null,
        'Namespacing a device preference resets the theme and unmutes the game on every slot switch.');
    eq('device pref ' + k + ' is never namespaced', S.resolveKey(k, 3), k);
}
eq('meta keys are never namespaced', S.resolveKey('lurmeta_roster_slot', 3), 'lurmeta_roster_slot',
    'The key that records the active slot cannot itself be slot-dependent.');

eq('an out-of-range slot falls back to 1', S.clampSlot(9), 1);
eq('a garbage slot falls back to 1', S.clampSlot('nonsense'), 1);

// ---------------------------------------------------------------------------
section('isolation between slots');
// ---------------------------------------------------------------------------
S.setActiveSlot('roster', 1);
S.saveToStorage('lur_be', 1111);
S.setActiveSlot('roster', 2);
S.saveToStorage('lur_be', 2222);
S.setActiveSlot('roster', 3);
S.saveToStorage('lur_be', 3333);

S.setActiveSlot('roster', 1);
eq('slot 1 kept its own value', S.loadFromStorage('lur_be'), 1111,
    'A write in slot 2 or 3 reached slot 1.');
S.setActiveSlot('roster', 2);
eq('slot 2 kept its own value', S.loadFromStorage('lur_be'), 2222);

eq('loadFromSlot reads another slot', S.loadFromSlot('lur_be', 3), 3333,
    'The slot picker previews every slot without switching to any of them.');
eq('loadFromSlot did not switch the active slot', S.activeSlot('roster'), 2,
    'A picker that switched slot to draw a card would strand the save it left.');

// The two families move independently.
S.setActiveSlot('career', 3);
eq('career slot moved', S.activeSlot('career'), 3);
eq('roster slot did not follow it', S.activeSlot('roster'), 2,
    'The two gamemodes share no state; their slots must not either.');

// Device prefs are shared across every slot.
S.setActiveSlot('roster', 1);
S.saveToStorage('lur_sound_muted', true);
S.setActiveSlot('roster', 3);
eq('device prefs survive a slot switch', S.loadFromStorage('lur_sound_muted'), true);

// ---------------------------------------------------------------------------
section('deleting a slot');
// ---------------------------------------------------------------------------
S.setActiveSlot('career', 1);
S.saveToStorage('lurc_career', { created: true, tag: 'career-one' });
S.setActiveSlot('career', 2);
S.saveToStorage('lurc_career', { created: true, tag: 'career-two' });

S.clearSlot('career', 2);
eq('the deleted career slot is empty', S.loadFromSlot('lurc_career', 2), null);
truthy('the other career slot survived', S.loadFromSlot('lurc_career', 1), null);
eq('the roster slots survived a career delete', S.loadFromSlot('lur_be', 1), 1111,
    'clearSlot takes a family; it must not reach across gamemodes.');

S.clearSlot('roster', 3);
eq('the deleted roster slot is empty', S.loadFromSlot('lur_be', 3), null);
eq('roster slot 1 survived', S.loadFromSlot('lur_be', 1), 1111);
eq('roster slot 2 survived', S.loadFromSlot('lur_be', 2), 2222);

truthy('slotHasData sees a used roster slot', S.slotHasData('roster', 1));
falsy('slotHasData sees an empty roster slot', S.slotHasData('roster', 3));
truthy('slotHasData sees a used career slot', S.slotHasData('career', 1));
falsy('slotHasData sees an empty career slot', S.slotHasData('career', 2));

// ---------------------------------------------------------------------------
section('the wipe button');
// ---------------------------------------------------------------------------
//  AuthPanel's wipeAccount() calls clearStorage(). It used to be
//  localStorage.clear(), which also destroyed the career save its copy never
//  mentioned and the player's theme.
S.setActiveSlot('roster', 1);
S.saveToStorage('lur_light_mode', true);
S.clearStorage();

eq('wipe cleared roster slot 1', S.loadFromSlot('lur_be', 1), null);
eq('wipe cleared roster slot 2', S.loadFromSlot('lur_be', 2), null);
eq('wipe cleared career slot 1', S.loadFromSlot('lurc_career', 1), null);
eq('wipe kept the theme', S.loadFromStorage('lur_light_mode'), true,
    'clearStorage is "wipe my game", not "wipe my browser".');

// ---------------------------------------------------------------------------
section('career slots end to end');
// ---------------------------------------------------------------------------
function makeCareer(handle, roleId) {
    const styles = K.PLAYSTYLES[roleId] || [];
    const styleId = styles.length ? styles[0].id : '';
    const champs = styleId ? K.championsForStyle(roleId, styleId) : K.championsForRole(roleId);
    return CAREER.createCareer({
        handle, pathId: 'precomp', age: 13, regionId: 'LEC', roleId,
        playstyleId: styleId,
        championId: champs.length ? champs[0].id : '',
    });
}

S.setActiveSlot('career', 1);
CAREER.resetCareer();
makeCareer('SlotOne', 'MID');
CAREER.flushCareer();
const oneHandle = readStore(CAREER.career).player.handle;

S.setActiveSlot('career', 2);
const blank = CAREER.initCareer();
eq('a fresh career slot loads empty', blank.created, false,
    'Switching slot must load the new slot, not carry the old one.');
makeCareer('SlotTwo', 'ADC');
CAREER.flushCareer();

S.setActiveSlot('career', 1);
const back = CAREER.initCareer();
eq('the first career came back intact', back.player.handle, oneHandle,
    'Creating a career in slot 2 overwrote slot 1.');
eq('and it is still its own role', back.player.role, 'MID');

const sum2 = CAREER.careerSlotSummary(2);
truthy('careerSlotSummary reads the other slot', sum2 && sum2.handle === 'SlotTwo',
    'The picker draws every slot card without switching slot.');
eq('careerSlotSummary did not switch slot', S.activeSlot('career'), 1);
truthy('hasCareerSave(slot) sees slot 2', CAREER.hasCareerSave(2));
falsy('hasCareerSave(slot) sees empty slot 3', CAREER.hasCareerSave(3));
eq('careerSlotSummary on an empty slot is null', CAREER.careerSlotSummary(3), null);

eq('careerSaveKey is the logical key', CAREER.careerSaveKey(), 'lurc_career',
    'tools/careerRender.mjs asks for this rather than hard-coding it.');

// ---------------------------------------------------------------------------
section('roster slots end to end');
// ---------------------------------------------------------------------------
S.clearStorage();

S.setActiveSlot('roster', 1);
GAME.resetGameStores();
GAME.blueEssence.set(54321);
GAME.managerLevel.set(7);
GAME.club.set([]);
GAME.trackStats.update(t => ({ ...t, worldsWon: 2, packs: 40 }));
GAME.teamIdentity.update(t => ({ ...t, name: 'Slot One FC' }));
GAME.flushGame();

S.setActiveSlot('roster', 2);
GAME.resetGameStores();
GAME.initGame();
eq('a fresh roster slot has starting essence', readStore(GAME.blueEssence), GAME.STARTING_BE,
    'initGame MERGES rather than resets; without resetGameStores the old slot bleeds through.');
eq('a fresh roster slot has no manager level', readStore(GAME.managerLevel), 1);
eq('a fresh roster slot has no worlds titles', readStore(GAME.trackStats).worldsWon || 0, 0,
    'trackStats is merged over get(trackStats), which is exactly how slot A leaks into slot B.');
GAME.blueEssence.set(999);
GAME.flushGame();

S.setActiveSlot('roster', 1);
GAME.resetGameStores();
GAME.initGame();
eq('the first roster slot came back intact', readStore(GAME.blueEssence), 54321,
    'Playing slot 2 overwrote slot 1.');
eq('and kept its level', readStore(GAME.managerLevel), 7);
eq('and kept its stats', readStore(GAME.trackStats).worldsWon, 2);

const rs2 = GAME.rosterSlotSummary(2);
truthy('rosterSlotSummary reads the other slot', rs2 && rs2.be === 999,
    'The picker draws every slot card without switching slot.');
eq('rosterSlotSummary did not switch slot', S.activeSlot('roster'), 1);
eq('rosterSlotSummary on an empty slot is null', GAME.rosterSlotSummary(3), null);

const rs1 = GAME.rosterSlotSummary(1);
truthy('rosterSlotSummary carries the identity', rs1 && rs1.name === 'Slot One FC');
eq('rosterSlotSummary weights trophies', rs1 ? rs1.trophies : -1, 12,
    'Two Worlds titles is 2 x 6 on the same weighting the Leaderboard uses.');

// ---------------------------------------------------------------------------
section('an empty store must never overwrite a real save');
// ---------------------------------------------------------------------------
//  REGRESSION. The career store is blankCareer() from module load until
//  CareerShell mounts and calls initCareer(). The save-slot picker flushed it
//  from the MAIN MENU, before anything had been loaded, so opening the slot list
//  and choosing your own career wrote an empty save over it and then loaded the
//  empty one back. It destroyed real player saves.
//
//  The original 58 checks in this file all missed it because every one of them
//  persisted a store that had just been populated. This is the case that
//  matters: persisting a store that has NOT been loaded.
S.setActiveSlot('career', 1);
CAREER.resetCareer();
makeCareer('Guarded', 'MID');
CAREER.flushCareer();
truthy('a career is saved to begin with', CAREER.hasCareerSave(1));

// Exactly the state the store is in at the main menu.
CAREER.career.set(CAREER.blankCareer());

CAREER.flushCareer();
truthy('flushCareer did NOT wipe the saved career', CAREER.hasCareerSave(1),
    'This is the bug: a blank in-memory career means "nothing is loaded", not "no career exists".');

CAREER.saveCareer();
await new Promise(r => setTimeout(r, 220));   // outlast the 120ms debounce
truthy('the debounced saveCareer did NOT wipe it either', CAREER.hasCareerSave(1),
    'saveCareer runs on a timer, so it can fire after the player has already left the screen.');

const survived = CAREER.careerSlotSummary(1);
eq('the career survived intact', survived && survived.handle, 'Guarded');

// The guard must not block DELIBERATE destruction.
CAREER.resetCareer();
falsy('resetCareer can still clear a slot on purpose', CAREER.hasCareerSave(1),
    'Starting a new career has to work; the guard is only about accidental writes.');

// And a genuinely empty slot must still be writable.
S.setActiveSlot('career', 3);
CAREER.career.set(CAREER.blankCareer());
CAREER.flushCareer();
ok('flushing a blank career into an empty slot is allowed');

// ---------------------------------------------------------------------------
section('flush before switch');
// ---------------------------------------------------------------------------
//  saveGame/saveCareer are debounced. Switching slot mid-debounce would land
//  the OLD slot's snapshot under the NEW slot's keys.
S.setActiveSlot('roster', 1);
GAME.blueEssence.set(777);
GAME.saveGame();                      // debounced, not yet on disk
GAME.flushGame();                     // must write NOW
eq('flushGame drains the debounce', S.loadFromSlot('lur_be', 1), 777,
    'Without a synchronous flush the pending write lands in whichever slot is active when it fires.');

S.setActiveSlot('career', 1);
CAREER.initCareer();
CAREER.grantGold(1234);
CAREER.saveCareer();
CAREER.flushCareer();
const flushed = S.loadFromSlot('lurc_career', 1);
truthy('flushCareer drains the debounce', flushed && flushed.money && flushed.money.gold >= 1234);

// ---------------------------------------------------------------------------
console.log('');
if (failures) {
    console.log('FAILED -- ' + failures + ' of ' + checks + ' checks.');
    process.exit(1);
}
console.log('All ' + checks + ' slot checks passed.');
