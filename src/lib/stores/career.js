// ═══════════════════════════════════════════════════════════════════════════
//  LoL ULTIMATE CAREER — game state
// ═══════════════════════════════════════════════════════════════════════════
//  One writable holds the entire career. Everything else in this file is
//  either a derived view of it or a small primitive mutator. The week-to-week
//  simulation lives in src/lib/career/engine.js and drives this store — the
//  store itself deliberately contains no game rules.
//
//  Persistence is local-only under the `lurc_` prefix, kept completely
//  separate from Ultimate Roster's `lur_` keys so the two modes can never
//  corrupt one another.

import { writable, derived, get } from 'svelte/store';
import { loadFromStorage, saveToStorage } from '../utils/storage.js';
import {
    CAREER_SAVE_VERSION, ATTR_KEYS, ATTR_MIN, ATTR_MAX, DEFAULT_START_YEAR,
    WEEKS_PER_YEAR, ENERGY_MAX, HEALTH_MAX, FORM_MAX, MORALE_MAX, phaseForWeek,
    teamById, PATH_BY_ID, REGION_BY_ID, ROLE_BY_ID, PLAYSTYLE_BY_ID, CHAMPION_BY_ID,
} from '../career/constants.js';
import {
    calcOVR, calcPotentialOVR, clamp, clampAttr, emptyAttrs, rollNewPlayer,
    gainCurve, attrCeiling, environmentCap, rankFromMMR, marketValueFor,
    weeklySalaryFor, pick,
} from '../career/ratings.js';
import { teamsInRegion, clearTeamCaches } from '../career/teams.js';

const SAVE_KEY = 'lurc_career';

// ─────────────────────────────────────────────────────────────────────────
//  DEFAULT STATE
// ─────────────────────────────────────────────────────────────────────────
export function blankCareer() {
    return {
        version: CAREER_SAVE_VERSION,
        created: false,

        player: {
            handle: '',
            region: 'LEC',
            role: 'MID',
            playstyle: '',
            champion: '',
            path: 'precomp',
            startAge: 13,
            age: 13,
            attrs: emptyAttrs(30),
            potential: emptyAttrs(75),

            form: 50,
            morale: 65,
            energy: ENERGY_MAX,
            health: HEALTH_MAX,
            hype: 0,

            clubId: null,
            clubTier: null,
            status: 'sub',
            contract: null,          // { teamId, tier, salary, years, startYear, endYear, status, bonus }
            chemistry: 50,           // how well the roster gets on with you
        },

        time: { year: DEFAULT_START_YEAR, week: 1 },

        money: { gold: 0, followers: 0, legacy: 0 },

        inventory: {
            gear: {},                // { mouse: 2, keyboard: 1, ... } → tier owned
            lifestyle: {},           // { apartment: 1, trainer: 1, ... }
            consumables: {},         // { energy_drink: 3, ... } → count held
            perks: [],               // permanent legacy unlocks (ids)
        },
        sponsors: [],                // [{ id, name, weekly, endWeekAbs }]

        season: {
            split: 'spring',         // 'spring' | 'summer'
            wins: 0, losses: 0,
            gameWins: 0, gameLosses: 0,
            schedule: [],            // [{ id, week, phase, opponentId, home, played, won, score, myRating }]
            standings: {},           // teamId → { w, l }
            champPoints: 0,
            bracket: null,           // active playoff/international bracket, engine-owned
            qualified: {},           // { msi: bool, worlds: bool }
        },

        soloq: { mmr: 300, peakMMR: 300, games: 0, wins: 0, losses: 0 },

        totals: {
            games: 0, wins: 0, losses: 0,
            kills: 0, deaths: 0, assists: 0,
            mvps: 0, pentakills: 0,
            ratingSum: 0,            // sum of per-match 0-10 ratings, for averages
        },

        history: [],                 // [{ year, split, teamId, w, l, placement, awards: [] }]
        awards: [],                  // [{ id, name, year, split, tier }]
        trophies: [],                // [{ id, name, year, kind }]
        news: [],                    // [{ id, ts, week, year, type, text }]
        offers: [],                  // pending contract offers, engine-owned

        weekly: {
            actionsLeft: 4,
            actionsMax: 4,
            trained: {},             // attrKey → sessions used this week
            clubSlotsLeft: 0,
            log: [],                 // [{ id, label, detail, accent }]
        },

        flags: {
            retired: false,
            hallOfLegends: false,
            seenIntro: false,
            everSigned: false,
        },

        lastMatch: null,             // full result object from the last match played
        pendingMatch: null,          // a match waiting to be played this week
    };
}

// ─────────────────────────────────────────────────────────────────────────
//  STORES
// ─────────────────────────────────────────────────────────────────────────
export const career = writable(blankCareer());

/** Which career screen is showing. 'create' is the creation flow, 'match'
 *  takes over the whole shell while a game is being played. */
export const careerScreen = writable('hub');

/** Transient match-in-progress state — never persisted. */
export const matchState = writable(null);

/** Set by any screen that wants a full-screen career overlay (results, awards,
 *  season summary). `{ kind, payload }` or null. */
export const careerOverlay = writable(null);

// ── Derived views ────────────────────────────────────────────────────────
export const player        = derived(career, $c => $c.player);
export const careerOVR     = derived(career, $c => calcOVR($c.player.attrs, $c.player.role));
export const careerPotOVR  = derived(career, $c => calcPotentialOVR($c.player.potential, $c.player.role));
export const currentTeam   = derived(career, $c => ($c.player.clubId ? teamById($c.player.clubId) : null));
export const currentPhase  = derived(career, $c => phaseForWeek($c.time.week));
export const soloRank      = derived(career, $c => rankFromMMR($c.soloq.mmr));
export const hasCareer     = derived(career, $c => !!$c.created);
export const marketValue   = derived(career, $c => marketValueFor({
    ovr: calcOVR($c.player.attrs, $c.player.role),
    potentialOVR: calcPotentialOVR($c.player.potential, $c.player.role),
    age: $c.player.age,
    region: $c.player.region,
    hype: $c.player.hype,
}));

/** Absolute week counter — useful for anything with a duration (sponsors,
 *  injuries, contracts) that must survive a year rollover. */
export function absWeek(c) {
    return (c.time.year - DEFAULT_START_YEAR) * WEEKS_PER_YEAR + c.time.week;
}

// ─────────────────────────────────────────────────────────────────────────
//  PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────
let _debounce = null;

export function saveCareer() {
    if (_debounce) clearTimeout(_debounce);
    _debounce = setTimeout(() => {
        const c = get(career);
        // pendingMatch/lastMatch are large; keep lastMatch (the player sees it
        // on the hub) but drop the transient live-match object.
        saveToStorage(SAVE_KEY, { ...c, pendingMatch: c.pendingMatch || null });
    }, 120);
}

/** Immediate, non-debounced write. Used before navigating away from the mode. */
export function flushCareer() {
    if (_debounce) { clearTimeout(_debounce); _debounce = null; }
    saveToStorage(SAVE_KEY, get(career));
}

export function hasCareerSave() {
    const raw = loadFromStorage(SAVE_KEY);
    return !!(raw && raw.created);
}

/** Merge a loaded save over the blank shape so new fields added in later
 *  versions never come back undefined on an old save. */
function hydrate(raw) {
    const base = blankCareer();
    if (!raw || typeof raw !== 'object') return base;

    const out = {
        ...base, ...raw,
        player:    { ...base.player,    ...(raw.player || {}) },
        time:      { ...base.time,      ...(raw.time || {}) },
        money:     { ...base.money,     ...(raw.money || {}) },
        inventory: { ...base.inventory, ...(raw.inventory || {}) },
        season:    { ...base.season,    ...(raw.season || {}) },
        soloq:     { ...base.soloq,     ...(raw.soloq || {}) },
        totals:    { ...base.totals,    ...(raw.totals || {}) },
        weekly:    { ...base.weekly,    ...(raw.weekly || {}) },
        flags:     { ...base.flags,     ...(raw.flags || {}) },
    };

    // Attributes and potential are the only values worth guarding hard — a
    // corrupted or hand-edited save should degrade, not crash the mode.
    // Clamp without rounding: attributes are stored fractionally (training
    // gains and age decay both move them by tenths), so rounding here would
    // silently change the player every time a save is loaded.
    const fixAttrs = (src, fallback) => {
        const o = {};
        for (const k of ATTR_KEYS) {
            const v = Number(src?.[k]);
            o[k] = Number.isFinite(v) ? clamp(v, ATTR_MIN, ATTR_MAX) : fallback;
        }
        return o;
    };
    out.player.attrs = fixAttrs(raw.player?.attrs, 30);
    out.player.potential = fixAttrs(raw.player?.potential, 75);

    out.player.form   = clamp(out.player.form,   0, FORM_MAX);
    out.player.morale = clamp(out.player.morale, 0, MORALE_MAX);
    out.player.energy = clamp(out.player.energy, 0, ENERGY_MAX);
    out.player.health = clamp(out.player.health, 0, HEALTH_MAX);
    out.player.hype   = Math.max(0, Math.round(Number(out.player.hype) || 0));

    out.time.week = clamp(Math.round(out.time.week) || 1, 1, WEEKS_PER_YEAR);
    out.time.year = Math.max(DEFAULT_START_YEAR, Math.round(out.time.year) || DEFAULT_START_YEAR);

    for (const k of ['gold', 'followers', 'legacy']) {
        out.money[k] = Math.max(0, Math.round(Number(out.money[k]) || 0));
    }

    if (!Array.isArray(out.news))    out.news = [];
    if (!Array.isArray(out.offers))  out.offers = [];
    if (!Array.isArray(out.history)) out.history = [];
    if (!Array.isArray(out.awards))  out.awards = [];
    if (!Array.isArray(out.trophies)) out.trophies = [];
    if (!Array.isArray(out.sponsors)) out.sponsors = [];
    if (!Array.isArray(out.season.schedule)) out.season.schedule = [];
    if (!Array.isArray(out.inventory.perks)) out.inventory.perks = [];

    out.version = CAREER_SAVE_VERSION;
    return out;
}

export function initCareer() {
    const raw = loadFromStorage(SAVE_KEY);
    const state = hydrate(raw);
    career.set(state);
    careerScreen.set(state.created ? 'hub' : 'create');
    return state;
}

export function resetCareer() {
    clearTeamCaches();
    career.set(blankCareer());
    careerScreen.set('create');
    matchState.set(null);
    careerOverlay.set(null);
    saveToStorage(SAVE_KEY, get(career));
}

// ─────────────────────────────────────────────────────────────────────────
//  CREATION
// ─────────────────────────────────────────────────────────────────────────
/**
 * Turn a creation-screen config into a live career.
 * cfg = { handle, pathId, age, regionId, roleId, playstyleId, championId }
 */
export function createCareer(cfg) {
    const path = PATH_BY_ID[cfg.pathId] || PATH_BY_ID.precomp;
    const region = REGION_BY_ID[cfg.regionId] || REGION_BY_ID.LEC;
    const role = ROLE_BY_ID[cfg.roleId] || ROLE_BY_ID.MID;
    const style = PLAYSTYLE_BY_ID[cfg.playstyleId] || null;
    const champ = CHAMPION_BY_ID[cfg.championId] || null;
    const age = clamp(cfg.age ?? path.ages[0], path.ages[0], path.ages[path.ages.length - 1]);

    const { attrs, potential } = rollNewPlayer({
        handle: cfg.handle, pathId: path.id, age,
        regionId: region.id, roleId: role.id,
        playstyleId: style?.id, championId: champ?.id,
    });

    const c = blankCareer();
    c.created = true;

    // A `signed` path arrives with a club already in place. Every other module
    // reads player.clubId, not path.signed, to decide whether a wage lands,
    // whether scrims are available, which training multiplier applies and
    // whether the unsigned soft cap bites, so the seat has to be real.
    let club = null;
    let contract = null;
    if (path.signed) {
        const options = teamsInRegion(region.id, 2);
        club = options.length ? pick(options) : null;
    }
    if (club) {
        const status = 'sub';
        contract = {
            teamId: club.id,
            tier: club.tier,
            salary: weeklySalaryFor({
                ovr: calcOVR(attrs, role.id),
                clubTier: club.tier,
                region: region.id,
                age,
                status,
                potentialOVR: calcPotentialOVR(potential, role.id),
            }),
            years: 2,
            startYear: c.time.year,
            endYear: c.time.year + 1,
            status,
            bonus: 0,
            releaseClause: 0,
            role: role.id,
            region: region.id,
            signedYear: c.time.year,
            signedWeek: c.time.week,
        };
    }

    c.player = {
        ...c.player,
        handle: (cfg.handle || 'Rookie').slice(0, 16),
        region: region.id,
        role: role.id,
        playstyle: style ? style.id : '',
        champion: champ ? champ.id : '',
        path: path.id,
        startAge: age,
        age,
        attrs,
        potential,
        form: 50,
        morale: path.signed ? 70 : 60,
        energy: ENERGY_MAX,
        health: HEALTH_MAX,
        hype: path.startHype,
        clubId: club ? club.id : null,
        clubTier: club ? club.tier : null,
        status: path.signed ? 'sub' : 'benched',
        contract,
        chemistry: 50,
    };
    c.money.gold = path.startGold;
    c.money.followers = path.startHype;
    c.soloq.mmr = path.signed ? 2500 : 700;
    c.soloq.peakMMR = c.soloq.mmr;
    c.weekly.actionsMax = path.weeklyActions;
    c.weekly.actionsLeft = path.weeklyActions;
    c.flags.everSigned = !!club;

    career.set(c);
    saveCareer();
    return c;
}

// ─────────────────────────────────────────────────────────────────────────
//  PRIMITIVE MUTATORS
//  The engine and every screen go through these rather than reaching into the
//  store shape directly, so clamping happens in exactly one place.
// ─────────────────────────────────────────────────────────────────────────
let _newsId = 0;

export function addNews(text, type = 'system') {
    career.update(c => {
        const entry = {
            id: `n${Date.now()}_${++_newsId}`,
            ts: Date.now(),
            week: c.time.week,
            year: c.time.year,
            type, text,
        };
        return { ...c, news: [entry, ...c.news].slice(0, 80) };
    });
}

export function grantGold(amount) {
    const n = Math.round(Number(amount) || 0);
    career.update(c => ({ ...c, money: { ...c.money, gold: Math.max(0, c.money.gold + n) } }));
    return n;
}

/** Returns false (and changes nothing) when the player cannot afford it. */
export function spendGold(amount) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    const c = get(career);
    if (c.money.gold < n) return false;
    career.update(x => ({ ...x, money: { ...x.money, gold: x.money.gold - n } }));
    return true;
}

export function grantFollowers(amount) {
    const n = Math.round(Number(amount) || 0);
    career.update(c => ({
        ...c,
        money: { ...c.money, followers: Math.max(0, c.money.followers + n) },
        player: { ...c.player, hype: Math.max(0, c.player.hype + n) },
    }));
    return n;
}

export function grantLegacy(amount) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    career.update(c => ({ ...c, money: { ...c.money, legacy: c.money.legacy + n } }));
    return n;
}

export function spendLegacy(amount) {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    const c = get(career);
    if (c.money.legacy < n) return false;
    career.update(x => ({ ...x, money: { ...x.money, legacy: x.money.legacy - n } }));
    return true;
}

/** Adjust one of the four condition meters. Field is form|morale|energy|health. */
export function adjustCondition(field, delta) {
    const caps = { form: FORM_MAX, morale: MORALE_MAX, energy: ENERGY_MAX, health: HEALTH_MAX };
    if (!(field in caps)) return;
    career.update(c => ({
        ...c,
        player: { ...c.player, [field]: clamp((c.player[field] || 0) + delta, 0, caps[field]) },
    }));
}

/**
 * Raise one attribute, respecting the potential ceiling and the unsigned soft
 * cap. `raw` is the pre-curve gain — the actual applied gain is returned so the
 * UI can report what really happened.
 */
export function applyAttrGain(key, raw) {
    if (!ATTR_KEYS.includes(key)) return 0;
    let applied = 0;
    career.update(c => {
        const p = c.player;
        const cur = p.attrs[key] || 0;
        const ceiling = attrCeiling(p, key);
        const envCap = environmentCap(p);
        const mult = gainCurve(cur, ceiling, envCap);
        const gain = Math.max(0, raw) * mult;
        // Attributes are kept fractional. Rounding the stored value to a whole
        // number would throw away every sub-0.5 session, and gainCurve() throttles
        // hard enough near the ceiling that those are almost all of them, so the
        // attribute would stall several points short of its potential forever.
        // Rounding happens at display time (calcOVR already rounds).
        const next = clamp(Math.min(ceiling, cur + gain), ATTR_MIN, ATTR_MAX);
        if (!(next > cur)) return c;
        // Three decimals so a real-but-tiny gain is still reported as a gain
        // rather than as the nothing the old two-decimal rounding turned it into.
        applied = Math.round((next - cur) * 1000) / 1000;
        return { ...c, player: { ...p, attrs: { ...p.attrs, [key]: next } } };
    });
    return applied;
}

/** Directly set an attribute (used by role changes and decay). */
export function setAttr(key, value) {
    if (!ATTR_KEYS.includes(key)) return;
    career.update(c => ({
        ...c,
        player: { ...c.player, attrs: { ...c.player.attrs, [key]: clampAttr(value) } },
    }));
}

/** Consume one weekly activity slot. Returns false when none are left. */
export function spendAction(n = 1) {
    const c = get(career);
    if (c.weekly.actionsLeft < n) return false;
    career.update(x => ({ ...x, weekly: { ...x.weekly, actionsLeft: x.weekly.actionsLeft - n } }));
    return true;
}

export function logWeek(label, detail, accent = '#3b82f6') {
    career.update(c => ({
        ...c,
        weekly: { ...c.weekly, log: [...c.weekly.log, { id: `w${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, detail, accent }].slice(-12) },
    }));
}

// ── Inventory ────────────────────────────────────────────────────────────
export function setGearTier(id, tier) {
    career.update(c => ({ ...c, inventory: { ...c.inventory, gear: { ...c.inventory.gear, [id]: tier } } }));
}

export function setLifestyle(id, level = 1) {
    career.update(c => ({ ...c, inventory: { ...c.inventory, lifestyle: { ...c.inventory.lifestyle, [id]: level } } }));
}

export function consumableCount(id) {
    return get(career).inventory.consumables[id] || 0;
}

export function addConsumable(id, n = 1) {
    career.update(c => {
        const cur = c.inventory.consumables[id] || 0;
        return { ...c, inventory: { ...c.inventory, consumables: { ...c.inventory.consumables, [id]: Math.max(0, cur + n) } } };
    });
}

export function addPerk(id) {
    career.update(c => c.inventory.perks.includes(id)
        ? c
        : { ...c, inventory: { ...c.inventory, perks: [...c.inventory.perks, id] } });
}

// ── Awards / trophies ────────────────────────────────────────────────────
export function addAward(award) {
    career.update(c => ({ ...c, awards: [...c.awards, award] }));
}

export function addTrophy(trophy) {
    career.update(c => ({ ...c, trophies: [...c.trophies, trophy] }));
}
