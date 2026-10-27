// ===========================================================================
//  ULTIMATE MANAGER -- the store
//
//  One save object per slot under `lurm_manager` (storage.js namespaces the
//  slot). The engine mutates the save in place; `mutate()` runs a change,
//  re-publishes the object and schedules a write.
//
//  NEVER PERSIST A STORE THAT HAS NOT BEEN LOADED. `manager` is null until
//  ManagerShell mounts and calls initManager(); both savers refuse to write a
//  null or uncreated save over a created one. Same guard as the career store,
//  for the same reason: a blank store means "nothing is loaded", never "no save".
//
//  Local only: Ultimate Manager is not part of the Firebase cloud save.
// ===========================================================================
import { writable, get } from 'svelte/store';
import { saveToStorage, loadFromStorage, loadFromSlot, removeFromStorage } from '../utils/storage.js';
import { getDB } from '../utils/cards.js';
import { setDB, previewWorld, finalizeSave, advance, userFixture, blockInfo, currentStep, phaseCard, applyPrestige } from '../manager/engine.js';
import { showToast } from './toasts.js';
import { MANAGER_SAVE_VERSION, CALENDAR, ROLE_IDS, phaseOfStep, WAGE_KNEE, WAGE_STEP, WAGE_TOP_STEP } from '../manager/data.js';
import { teamName } from '../manager/world.js';
import { ensurePool, ovrOf } from '../manager/people.js';
import { trackClub } from '../manager/history.js';
import { soleOwner, refreshEconomy, settleInvestment } from '../manager/market.js';

const SAVE_KEY = 'lurm_manager';

export const manager = writable(null);
export const mgrScreen = writable('home');
/** The live series (transient, never saved). */
export const mgrMatch = writable(null);
/** { kind: 'player', id } | { kind: 'team', id } | { kind: 'step', summary } | null */
export const mgrModal = writable(null);
/** The club the History screen should open on (set by a club's popup). Transient. */
export const mgrHistTeam = writable(null);
/**
 * Full-screen cards played over everything, one at a time: a title, an
 * achievement, the start of a new stage of the year. Transient.
 */
export const mgrFx = writable([]);
export function pushFx(...items) {
    const list = items.filter(Boolean);
    if (list.length) mgrFx.update(q => [...q, ...list]);
}
export function popFx() {
    mgrFx.update(q => q.slice(1));
}

let _debounce = null;

function safeToPersist(s) {
    if (s && s.created) return true;
    const existing = loadFromStorage(SAVE_KEY);
    if (existing && existing.created) {
        console.warn('[LUR] Refused to overwrite a saved manager career with an empty one.');
        return false;
    }
    return true;
}

export function saveManager() {
    if (_debounce) clearTimeout(_debounce);
    _debounce = setTimeout(() => {
        _debounce = null;
        const s = get(manager);
        if (!s || !safeToPersist(s)) return;
        saveToStorage(SAVE_KEY, s);
    }, 250);
}

export function flushManager() {
    if (_debounce) { clearTimeout(_debounce); _debounce = null; }
    const s = get(manager);
    if (!s || !safeToPersist(s)) return;
    saveToStorage(SAVE_KEY, s);
}

/** Run a change against the live save, publish it, and schedule a write. */
export function mutate(fn) {
    const s = get(manager);
    if (!s) return undefined;
    const r = fn(s);
    manager.set(s);
    saveManager();
    return r;
}

/**
 * Play the current step for the whole world (with the manager's own series if
 * they played it by hand), save, and open the week's report. Titles and
 * achievements play at once; the card for a new stage of the year waits until
 * the report is closed (closeReport).
 */
export function playStep(series = null) {
    const s = get(manager);
    if (!s) return null;
    const before = phaseOfStep(currentStep(s));
    const beforeYear = s.time.year;
    const summary = advance(s, series);
    manager.set(s);
    flushManager();
    if (!summary || summary.blocked) return summary;
    const after = phaseOfStep(currentStep(s));
    summary.phase = before !== after || s.time.year !== beforeYear ? { kind: 'phase', ...phaseCard(s), newYear: s.time.year !== beforeYear } : null;
    if (summary.fx && summary.fx.length) pushFx(...summary.fx);
    if (summary.offseason) mgrModal.set({ kind: 'offseason', report: summary.offseason, summary });
    else mgrModal.set({ kind: 'step', summary });
    return summary;
}

/** Close a week or season report: back to the club home, and announce the next
 *  stage of the year if the calendar moved into one. */
export function closeReport(summary) {
    mgrModal.set(null);
    const s = get(manager);
    mgrScreen.set(s && s.jobless ? 'club' : 'home');
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0 });
    if (summary && summary.phase) pushFx(summary.phase);
}

/**
 * The Continue button. It only ever runs from the club home: anywhere else it
 * takes the manager there first, so nothing is played past an unread inbox.
 * Something that needs the manager (blockInfo) sends them to fix it.
 */
export function goNext() {
    const s = get(manager);
    if (!s) return;
    if (s.jobless) { mgrModal.set(null); mgrScreen.set('club'); return; }
    if (get(mgrScreen) !== 'home') { mgrModal.set(null); mgrScreen.set('home'); return; }
    const b = blockInfo(s);
    if (b) { mgrModal.set(null); showToast(b.msg, 'error', 4500); mgrScreen.set(b.go || 'home'); return; }
    if (userFixture(s)) { mgrModal.set(null); mgrMatch.set({ open: true }); return; }
    playStep(null);
}

/** A saved object is usable if it has the bones of a save; anything else is no save. */
export function hydrate(raw) {
    if (!raw || typeof raw !== 'object' || !raw.created) return null;
    if (!raw.teams || typeof raw.teams !== 'object' || !raw.players || typeof raw.players !== 'object') return null;
    if (!raw.manager || !raw.time || !raw.season) return null;
    const s = raw;
    s.v = MANAGER_SAVE_VERSION;
    s.time.step = Math.max(0, Math.min(CALENDAR.length - 1, Math.round(Number(s.time.step) || 0)));
    s.time.year = Math.round(Number(s.time.year) || 2013);
    for (const k of ['inbox', 'news', 'offers', 'scouted', 'freeAgents', 'history', 'jobOffers', 'seen']) if (!Array.isArray(s[k])) s[k] = [];
    if (!s.finance || typeof s.finance !== 'object') s.finance = { balance: 0, log: [] };
    if (!Number.isFinite(Number(s.finance.balance))) s.finance.balance = 0;
    if (!Array.isArray(s.finance.log)) s.finance.log = [];
    if (!s.board || typeof s.board !== 'object') s.board = { confidence: 60, objectives: [], expected: 5 };
    if (!s.settings || typeof s.settings !== 'object') s.settings = { autoCalls: false, autoDraft: false, fearless: false };
    s.settings.fearless = !!s.settings.fearless;
    if (!s.emergency || typeof s.emergency !== 'object') s.emergency = { year: s.time.year, used: 0 };
    const m = s.manager;
    m.perks = m.perks && typeof m.perks === 'object' ? m.perks : {};
    for (const k of ['level', 'xp', 'points', 'rep', 'wins', 'losses', 'titles', 'sacked']) m[k] = Number.isFinite(Number(m[k])) ? Number(m[k]) : 0;
    if (m.level < 1) m.level = 1;
    if (!Array.isArray(m.history)) m.history = [];
    if (!Array.isArray(m.trophies)) m.trophies = [];
    if (!m.ach || typeof m.ach !== 'object') m.ach = {};
    if (!Array.isArray(m.tier2Clubs)) m.tier2Clubs = [];
    if (m.teamId && !s.teams[m.teamId]) { m.teamId = null; s.jobless = true; }
    // Rosters and players must agree; a dangling id is dropped rather than crashing a screen.
    for (const t of Object.values(s.teams)) {
        t.roster = (Array.isArray(t.roster) ? t.roster : []).filter(id => s.players[id]);
        t.lineup = t.lineup && typeof t.lineup === 'object' ? t.lineup : {};
        for (const r of ROLE_IDS) if (t.lineup[r] && !t.roster.includes(t.lineup[r])) delete t.lineup[r];
    }
    // Saves from before champion pools: every player gets one, stable per player.
    for (const p of Object.values(s.players)) {
        if (!p || typeof p !== 'object') continue;
        if (!Array.isArray(p.favs)) p.favs = [];
        ensurePool(p, s.time.year);
        if (!Array.isArray(p.recent)) p.recent = [];
        if (!Number.isFinite(Number(p.ovr0))) p.ovr0 = ovrOf(p);
    }
    s.freeAgents = s.freeAgents.filter(id => s.players[id] && !s.players[id].team);
    s.offers = s.offers.filter(o => o && s.players[o.pid] && s.teams[o.from]);
    // Saves from before club history: start the record book now.
    const mine = m.teamId ? s.teams[m.teamId] : null;
    if (mine && (!mine.hist || typeof mine.hist !== 'object')) trackClub(s, mine);
    // A club founded before ownership existed is owned outright: no board.
    if (soleOwner(s) && s.board.objectives.length) s.board.objectives = [];
    // Saves from before 1.8.10's economy: wages above WAGE_KNEE are repriced to the gentler
    // top of the curve, the money is scaled to the world's level, real orgs get their
    // prestige, and a club still over its limit gets owner investment. Once: `econ` marks it.
    if (!s.econ || typeof s.econ !== 'object' || !Number.isFinite(Number(s.econ.level))) {
        for (const p of Object.values(s.players)) {
            if (!p || !p.team || !(Number(p.wage) > 0)) continue;
            const over = ovrOf(p) - WAGE_KNEE;
            if (over > 0) p.wage = Math.round(p.wage * Math.pow(WAGE_TOP_STEP / WAGE_STEP, over) / 1000) * 1000;
        }
        applyPrestige(getDB(), s, Number(s.time.startYear) || s.time.year);
        refreshEconomy(s);
        settleInvestment(s);
    }
    return s;
}

export function initManager() {
    const db = getDB();
    if (db) setDB(db);
    const raw = loadFromStorage(SAVE_KEY);
    const repriced = !!(raw && raw.created && !raw.econ);
    const s = hydrate(raw);
    manager.set(s);
    // A save that hydrate just moved to the new economy is written back at once.
    if (s && repriced) flushManager();
    mgrScreen.set('home');
    mgrMatch.set(null);
    mgrModal.set(null);
    mgrFx.set([]);
    return s;
}

/** Wipe the active slot (a new game over an old one, after a confirm). */
export function resetManager() {
    if (_debounce) { clearTimeout(_debounce); _debounce = null; }
    removeFromStorage(SAVE_KEY);
    manager.set(null);
    mgrScreen.set('home');
    mgrMatch.set(null);
    mgrModal.set(null);
    mgrFx.set([]);
}

/** Build the world for the setup screen. */
export function previewManagerWorld(startYear, seed) {
    const db = getDB();
    if (!db) return null;
    setDB(db);
    return previewWorld(db, startYear, seed);
}

export function createManager(world, cfg) {
    const db = getDB();
    if (db) setDB(db);
    const s = finalizeSave(world, cfg);
    manager.set(s);
    mgrScreen.set('home');
    saveToStorage(SAVE_KEY, s);
    pushFx({ kind: 'phase', ...phaseCard(s), newYear: true });
    return s;
}

export function managerSaveKey() {
    return SAVE_KEY;
}

/** Enough of a slot to draw a save card, without switching to it. */
export function managerSlotSummary(slot) {
    const raw = loadFromSlot(SAVE_KEY, slot);
    if (!raw || !raw.created || !raw.manager || !raw.teams) return null;
    const t = raw.manager.teamId ? raw.teams[raw.manager.teamId] : null;
    const step = CALENDAR[Math.max(0, Math.min(CALENDAR.length - 1, Number(raw.time && raw.time.step) || 0))];
    return {
        name: String(raw.manager.name || 'Manager').slice(0, 18),
        team: t ? t.name : 'Between jobs',
        short: t ? t.short : '—',
        color: t ? t.color : '#64748b',
        region: t ? t.region : null,
        tier: t ? t.tier : null,
        year: Math.round(Number(raw.time && raw.time.year) || 0),
        startYear: Math.round(Number(raw.time && raw.time.startYear) || 0),
        stage: step ? step.short : '',
        level: Math.max(1, Math.round(Number(raw.manager.level) || 1)),
        trophies: Array.isArray(raw.manager.trophies) ? raw.manager.trophies.length : 0,
    };
}

export function hasManagerSave(slot) {
    const raw = slot == null ? loadFromStorage(SAVE_KEY) : loadFromSlot(SAVE_KEY, slot);
    return !!(raw && raw.created);
}

export { teamName };
