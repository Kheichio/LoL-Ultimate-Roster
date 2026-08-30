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
import {
    loadFromStorage, saveToStorage, loadFromSlot, saveToSlot, SLOT_IDS,
} from '../utils/storage.js';
import {
    CAREER_SAVE_VERSION, ATTR_KEYS, ATTR_MIN, ATTR_MAX, DEFAULT_START_YEAR,
    WEEKS_PER_YEAR, ENERGY_MAX, HEALTH_MAX, FORM_MAX, MORALE_MAX, phaseForWeek,
    teamById, PATH_BY_ID, REGION_BY_ID, ROLE_BY_ID, PLAYSTYLE_BY_ID, CHAMPION_BY_ID,
    TRAIT_BY_ID, championsForStyle, PROFICIENCY_SIGNATURE_HEAD_START,
    LANGUAGE_IDS, LANGUAGE_MAX, languageForRegion,
} from '../career/constants.js';
import {
    calcOVR, calcPotentialOVR, clamp, clampAttr, emptyAttrs, rollNewPlayer,
    gainCurve, attrCeiling, environmentCap, rankFromMMR, marketValueFor,
    weeklySalaryFor, pick, traitsOf,
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
            // Signature picks two and three, unlocked by the Second/Third
            // Signature legacy perks. `champion` stays the FIRST one and is
            // never merged into this list: board.js, CareerDossier, careerSmoke
            // and championCheck all read that single field, and every save that
            // exists has it. Capacity is derived from the perks, never stored —
            // see economy.signatureSlots().
            extraChampions: [],
            path: 'precomp',
            startAge: 13,
            age: 13,
            attrs: emptyAttrs(30),
            potential: emptyAttrs(75),

            // Genetic traits. Rolled and revealed on the birthday named by the
            // path's revealAge, never at creation — see engine.revealTrait().
            // Stored as bare ids, exactly like `champion`, so the ids in
            // constants.TRAITS are permanent.
            traits: [],
            // Environment soft cap override, written by the Self-Made perk. 0
            // means "use UNSIGNED_SOFT_CAP".
            softCap: 0,

            // Market-value premium, written by the valueMult legacy perks the
            // same way softCap is written by Self-Made. It lives on the player
            // rather than being derived from inventory.perks because the only
            // live reader is the marketValue store in THIS file, and importing
            // economy.js here would be a cycle. Additive fraction, 0 = none.
            valueMult: 0,

            // Champion proficiency: championId -> games played on it. Raw counts,
            // not a derived mastery value, so the curve in constants.js can be
            // retuned later without invalidating every save. The signature pick
            // is seeded with a head start at creation - that is where the hours
            // already went.
            proficiency: {},

            // Languages spoken: languageId -> 0..100. FRACTIONAL for the same
            // reason attrs are - passive immersion pays 1.1 a week and a lesson
            // pays a decaying curve, so rounding on write or on load would shave
            // a tenth off every gain and park a language short of fluent
            // forever. Round at display time only.
            languages: {},
            // The language the player has chosen to study, or null. null is not
            // "studying nothing": constants.studyTargetFor() falls back to the
            // language closest to done, so the default lives there rather than
            // being baked into this field.
            studyLang: null,

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
            trades: {},              // { lx_appearance: 4, ... } → times bought; the
                                     // count IS the price ladder, so it must persist
            monuments: [],           // legacy-score monuments, in the order bought
        },
        sponsors: [],                // [{ id, name, weekly, endWeekAbs }]

        // The player's own club, and only theirs. Every other org in the mode is
        // a pure derivation of (teamId, year) out of the card database and stays
        // that way — this block is the one place a roster is allowed to have a
        // history. `teamId` is what scopes it: if it does not match
        // player.clubId the whole block is ignored, which is how a transfer
        // resets momentum and roster changes without needing a hook.
        club: {
            teamId: null,
            momentum: 0,             // -1..1, how the room is going right now
            roster: {},              // ROLE → a replacement card that overrides the derived seat
            changes: [],             // [{ year, role, inName, outName, reason }] newest first
        },

        season: {
            split: 'spring',         // 'spring' | 'summer'
            // The club this season is being played FOR, stamped when the season
            // is drawn. closeSplit files the split under this rather than under
            // player.clubId, because the transfer window opens before the summer
            // split is banked -- see ensureSeason / closeSplit.
            clubId: null,
            clubTier: null,
            wins: 0, losses: 0,
            gameWins: 0, gameLosses: 0,
            schedule: [],            // [{ id, week, phase, opponentId, home, played, won, score, myRating }]
            standings: {},           // teamId → { w, l }
            champPoints: 0,
            bracket: null,           // active playoff/international bracket, engine-owned
            qualified: {},           // { msi: bool, worlds: bool }
        },

        // 300 (Iron I) deliberately, even though no new career starts there any
        // more: this object's only remaining job is the hydrate() merge base,
        // i.e. "this save carried no value". Raising it would make a save whose
        // soloq exists but lacks mmr jump six tiers on load. createCareer()
        // overwrites it from the path's startMMR.
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
            did: {},                 // activityId → true, for once-a-week activities
            // activityId -> how many times it has been done THIS week. Separate
            // from `did`, which is the once-a-week boolean ledger and must not
            // be repurposed into a counter: anything reading it as a flag would
            // start seeing 0 as "not done".
            counts: {},
            clubSlotsLeft: 0,
            log: [],                 // [{ id, label, detail, accent }]
        },

        flags: {
            // Lifetime count of contracts torn up for underperformance. Kept on
            // flags rather than the contract, which is rebuilt on every move.
            terminations: 0,
            // Burnout. `weeks` is the consecutive run under the threshold,
            // `strikes` how many times it has bitten this career, `benchedUntil`
            // an ABSOLUTE week (the physioUntil idiom, so it survives rollover),
            // and `peak` the longest run, for the retirement line.
            burnout: { weeks: 0, strikes: 0, benchedUntil: 0, peak: 0 },
            // The YEAR a First Stand berth is good for, or 0. It lives here
            // rather than in season.qualified because the berth is won in the
            // summer and played the following February, and rolloverYear()
            // empties the whole season block on the way between them.
            firstStandBerth: 0,
            // tournamentKind -> the YEAR the player first reached it, which is
            // what makes the guaranteed first-time popup fire exactly once a
            // career. Year-stamped rather than boolean, copying firstStandBerth:
            // it reads as truthy identically and a year is strictly more
            // informative than a `true` nobody can date. Deliberately NOT stored
            // in flags.eventLog - that cooldown ledger is truncated to its last
            // 60 entries, so a first Worlds would fall off it and fire again.
            firstSeen: {},
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

// One advance-week can produce several things worth interrupting the player for:
// closing a split raises an awards or season panel, a year rollover can reveal a
// genetic trait, and the weekly random event lands last of all. The overlay is a
// single slot, so before this queue existed the last writer won and everything
// before it was silently thrown away — split awards in particular almost never
// reached the player.
const _overlayQueue = [];

/** Show an overlay now, or line it up behind whatever is already showing. */
export function pushOverlay(kind, payload) {
    if (!kind) return;
    if (get(careerOverlay)) _overlayQueue.push({ kind, payload });
    else careerOverlay.set({ kind, payload });
}

/** Advance to the next queued overlay. Returns false when nothing is waiting,
 *  which is the signal to close. Transient by design: a queue that survived a
 *  reload would re-interrupt the player about a week they already finished. */
export function nextOverlay() {
    const next = _overlayQueue.shift();
    careerOverlay.set(next || null);
    return !!next;
}

export function clearOverlays() {
    _overlayQueue.length = 0;
    careerOverlay.set(null);
}

// ── Derived views ────────────────────────────────────────────────────────
export const player        = derived(career, $c => $c.player);
export const careerOVR     = derived(career, $c => calcOVR($c.player.attrs, $c.player.role));
export const careerPotOVR  = derived(career, $c => calcPotentialOVR($c.player.potential, $c.player.role));
export const currentTeam   = derived(career, $c => ($c.player.clubId ? teamById($c.player.clubId) : null));
export const currentPhase  = derived(career, $c => phaseForWeek($c.time.week));
export const soloRank      = derived(career, $c => rankFromMMR($c.soloq.mmr));
export const hasCareer     = derived(career, $c => !!$c.created);
export const careerTraits  = derived(career, $c => traitsOf($c.player));
export const marketValue   = derived(career, $c => marketValueFor({
    ovr: calcOVR($c.player.attrs, $c.player.role),
    potentialOVR: calcPotentialOVR($c.player.potential, $c.player.role),
    age: $c.player.age,
    region: $c.player.region,
    hype: $c.player.hype,
    valueMult: $c.player.valueMult,
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

/**
 * REFUSE TO WRITE AN EMPTY CAREER OVER A REAL ONE.
 *
 * The `career` store is initialised to blankCareer() at module load and only
 * becomes the player's actual save when CareerShell mounts and calls
 * initCareer(). Anything that persists the store BEFORE that point is not
 * saving "no career" - it is destroying whatever is in the slot.
 *
 * That is not hypothetical. The save-slot picker called flushCareer() from the
 * main menu, before the career had ever been loaded, so opening the slot list
 * and choosing your own save wrote a blank career over it and then loaded the
 * blank back. It read to the player as the game forcing them to start again,
 * and it destroyed real saves.
 *
 * `created` is the flag that separates the two states, so it is the guard.
 * Deliberate destruction still works: resetCareer() writes through
 * saveToStorage directly and does not come past here.
 */
function safeToPersist(c) {
    if (c && c.created) return true;
    const existing = loadFromStorage(SAVE_KEY);
    if (existing && existing.created) {
        console.warn('[LUR] Refused to overwrite a saved career with an empty one.');
        return false;
    }
    return true;
}

export function saveCareer() {
    if (_debounce) clearTimeout(_debounce);
    _debounce = setTimeout(() => {
        const c = get(career);
        if (!safeToPersist(c)) return;
        // pendingMatch/lastMatch are large; keep lastMatch (the player sees it
        // on the hub) but drop the transient live-match object.
        saveToStorage(SAVE_KEY, { ...c, pendingMatch: c.pendingMatch || null });
    }, 120);
}

/** Immediate, non-debounced write. Used before navigating away from the mode. */
export function flushCareer() {
    if (_debounce) { clearTimeout(_debounce); _debounce = null; }
    const c = get(career);
    if (!safeToPersist(c)) return;
    saveToStorage(SAVE_KEY, c);
}

// ─────────────────────────────────────────────────────────────────────────
//  CLOUD BACKUP
//  Career saves were local-only and had no backup of any kind, which made a
//  single bad write terminal. These two functions are what makes them
//  transferable between devices.
//
//  Both read and write STORAGE, never the in-memory store. That is not a style
//  choice: the career store is blankCareer() until CareerShell mounts, so
//  uploading it from anywhere else would push an empty career over a real cloud
//  backup - the same mistake that destroyed local saves.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every career slot that holds a real save, keyed by slot number.
 *
 * Backed up WHOLE, including the full news feed. An earlier cut trimmed the
 * feed to twenty entries to save room, but a finished twelve-year career
 * measures 64kb and three slots come to 162kb of a 1024kb Firestore document
 * (tools/careerSmoke.mjs reports and asserts this). There is no space pressure
 * worth throwing away a player's career history for. `pendingMatch` is the only
 * thing dropped, because a half-played match is transient by definition.
 */
export function exportCareerSlots() {
    const out = {};
    for (const slot of SLOT_IDS) {
        const raw = loadFromSlot(SAVE_KEY, slot);
        if (!raw || !raw.created) continue;
        out[slot] = { ...raw, pendingMatch: null };
    }
    return out;
}

/**
 * Restore backed-up career slots into local storage, each one back into the
 * slot it came from. Returns the slot numbers actually written.
 *
 * Refuses to write anything that is not a created career, so a malformed or
 * empty entry can never clear a local save.
 */
export function importCareerSlots(map) {
    const written = [];
    if (!map || typeof map !== 'object') return written;
    for (const slot of SLOT_IDS) {
        const incoming = map[slot] != null ? map[slot] : map[String(slot)];
        if (!incoming || typeof incoming !== 'object' || !incoming.created) continue;
        // Through hydrate() so a cloud save is validated and clamped exactly
        // like a local one - no unvalidated writes.
        if (saveToSlot(SAVE_KEY, hydrate(incoming), slot)) written.push(slot);
    }
    return written;
}

/** How many career slots currently hold a save. For the cloud UI. */
export function careerSlotCount() {
    return SLOT_IDS.filter(n => hasCareerSave(n)).length;
}

/** The logical save key. Save SLOTS are applied inside storage.js, so this is
 *  the same string for every slot — tools/careerRender.mjs asks for it rather
 *  than hard-coding the literal, so a future rename cannot silently desync it. */
export function careerSaveKey() {
    return SAVE_KEY;
}

/** Whether a slot holds a real career. With no argument, the active slot. */
export function hasCareerSave(slot) {
    const raw = slot == null ? loadFromStorage(SAVE_KEY) : loadFromSlot(SAVE_KEY, slot);
    return !!(raw && raw.created);
}

/** Enough of a slot's career to draw a save-slot card, without switching to it. */
export function careerSlotSummary(slot) {
    const raw = loadFromSlot(SAVE_KEY, slot);
    if (!raw || !raw.created || !raw.player) return null;
    const p = raw.player;
    const team = p.clubId ? teamById(p.clubId) : null;
    return {
        handle: String(p.handle || 'Rookie').slice(0, 16),
        role: ROLE_BY_ID[p.role] ? p.role : 'MID',
        region: p.region || 'LEC',
        age: Math.max(0, Math.round(Number(p.age) || 0)),
        ovr: calcOVR(p.attrs, p.role),
        team: team ? team.name : (raw.flags && raw.flags.everSigned ? 'Free Agent' : 'Unsigned'),
        year: Math.round(Number(raw.time?.year) || DEFAULT_START_YEAR),
        week: Math.round(Number(raw.time?.week) || 1),
        retired: !!(raw.flags && raw.flags.retired),
        trophies: Array.isArray(raw.trophies) ? raw.trophies.length : 0,
    };
}

/**
 * One slot's raw save, or null. Does NOT hydrate, does NOT switch slot, does
 * NOT write.
 *
 * loadFromSlot() returns a fresh JSON.parse, so a caller physically cannot
 * reach the live store object through here — which is the entire point. The
 * career leaderboard publisher reads through this function, so mutating the
 * player's career from board code is impossible rather than merely forbidden.
 */
export function careerSlotRaw(slot) {
    const raw = loadFromSlot(SAVE_KEY, slot);
    return (raw && raw.created) ? raw : null;
}

/**
 * hydrate() for a career that arrived over the network, for DISPLAY ONLY.
 *
 * hydrate is pure — it merges over blankCareer(), clamps, and writes neither
 * the store nor storage — which makes it the right normaliser for a stranger's
 * career, and means a downloaded career goes through the exact same
 * fractional-preserving fixAttrs, TRAIT_BY_ID filter and proficiency filter
 * that importCareerSlots() already trusts.
 *
 * It must NEVER be followed by a save. Do not reach this through initCareer()
 * (which calls career.set and would replace the viewer's own career) or through
 * importCareerSlots() (which writes localStorage).
 *
 * NOTE: hydrate does not sanitise player.handle and does not filter nulls out
 * of history/awards. career/board.js does both before calling this.
 */
export function hydrateForeignCareer(raw) {
    return hydrate(raw);
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

    // Traits are bare ids. A save can carry null, a string, an object or an id
    // from a trait that no longer exists — none of which the player spread at
    // the top of this function would catch, and any of which would render as
    // the literal text "undefined" on the Profile screen.
    out.player.traits = Array.isArray(raw.player?.traits)
        ? raw.player.traits.filter(t => typeof t === 'string' && TRAIT_BY_ID[t])
        : [];

    // Extra signatures are bare champion ids and need the identical treatment,
    // plus two rules of their own: never the same champion twice, and never a
    // duplicate of `champion` itself (which would show the same pick twice in
    // champion select). Sliced to 2 because that is the most the perks can buy.
    //
    // Deliberately NOT filtered by championsForStyle() on load — CLAUDE.md's
    // "existing saves are grandfathered, never auto-reassign a saved champion"
    // applies to these exactly as it does to the first pick.
    {
        const seen = new Set([out.player.champion]);
        out.player.extraChampions = (Array.isArray(raw.player?.extraChampions) ? raw.player.extraChampions : [])
            .filter(id => {
                if (typeof id !== 'string' || !CHAMPION_BY_ID[id] || seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .slice(0, 2);
    }
    // hydrate() does not validate anything nested inside flags, and every reader
    // of burnout compares numbers against it. A hand-edited or cloud-round-
    // tripped save carrying flags.burnout = 'yes' would otherwise reach all of
    // them. Same treatment the club block gets, for the same reason.
    {
        const raw = out.flags && typeof out.flags.burnout === 'object' && !Array.isArray(out.flags.burnout)
            ? out.flags.burnout : {};
        const n = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
        out.flags = {
            ...out.flags,
            burnout: {
                weeks: n(raw.weeks), strikes: Math.min(2, n(raw.strikes)),
                benchedUntil: n(raw.benchedUntil), peak: n(raw.peak),
            },
            // A year, so rot cannot turn into a permanent berth. Anything that
            // is not a plausible year reads as "no berth".
            firstStandBerth: (() => {
                const y = Math.round(Number(out.flags && out.flags.firstStandBerth));
                return Number.isFinite(y) && y >= 2000 && y <= 3000 ? y : 0;
            })(),
            // Normalised inside this literal rather than in a block of its own:
            // this assignment is the last writer of out.flags, so it is the one
            // place a flag is safely cleaned. Rot reads as "never reached",
            // which costs at worst one repeated popup - a rot value that
            // SURVIVED would suppress a first Worlds for the life of the save
            // with nothing to show the player why.
            firstSeen: (() => {
                const src = out.flags && out.flags.firstSeen;
                const clean = {};
                if (src && typeof src === 'object' && !Array.isArray(src)) {
                    for (const [kind, v] of Object.entries(src)) {
                        const y = Number(v);
                        if (Number.isFinite(y)) clean[kind] = y;
                    }
                }
                return clean;
            })(),
        };
    }
    out.player.softCap = clamp(Math.round(Number(out.player.softCap) || 0), 0, ATTR_MAX);
    // Fractional on purpose (0.25 + 0.40), so it is clamped and not rounded.
    out.player.valueMult = clamp(Number(out.player.valueMult) || 0, 0, 5);

    // Inventory shapes hydrate() never used to look inside. `trades` is the
    // price ladder for a repeatable purchase and `monuments` feeds the
    // retirement score, so a save carrying a string, an array or a negative
    // count must degrade to "nothing bought", never to a free ladder reset.
    {
        const rawTrades = out.inventory.trades;
        const clean = {};
        if (rawTrades && typeof rawTrades === 'object' && !Array.isArray(rawTrades)) {
            for (const [id, v] of Object.entries(rawTrades)) {
                const n = Math.floor(Number(v));
                if (Number.isFinite(n) && n > 0) clean[id] = Math.min(n, 9999);
            }
        }
        out.inventory.trades = clean;
        out.inventory.monuments = Array.isArray(out.inventory.monuments)
            ? out.inventory.monuments.filter(x => typeof x === 'string')
            : [];
    }

    // The club block. Defensive to the same standard as inventory: an absent or
    // hand-edited block must read as "no roster history", never crash a screen.
    {
        const raw = (out.club && typeof out.club === 'object' && !Array.isArray(out.club)) ? out.club : {};
        const roster = (raw.roster && typeof raw.roster === 'object' && !Array.isArray(raw.roster)) ? raw.roster : {};
        const seats = {};
        for (const [role, card] of Object.entries(roster)) {
            if (card && typeof card === 'object' && typeof card.name === 'string') seats[role] = card;
        }
        out.club = {
            teamId: typeof raw.teamId === 'string' ? raw.teamId : null,
            momentum: clamp(Number(raw.momentum) || 0, -1, 1),
            roster: seats,
            changes: Array.isArray(raw.changes) ? raw.changes.filter(Boolean).slice(0, 24) : [],
        };
    }

    // Proficiency is a plain id -> count map. A save can carry null, an array,
    // counts for champions that no longer exist, or negative/NaN values, none of
    // which the player spread at the top of this function would catch.
    {
        const raw = out.player.proficiency;
        const clean = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            for (const [id, v] of Object.entries(raw)) {
                if (!CHAMPION_BY_ID[id]) continue;
                const n = Math.floor(Number(v));
                if (Number.isFinite(n) && n > 0) clean[id] = Math.min(n, 9999);
            }
        }
        out.player.proficiency = clean;
    }

    // Languages get the proficiency treatment plus one rule of their own: they
    // are clamped and NOT rounded. Immersion pays 1.1 a week and a lesson pays a
    // fraction, so rounding on load would throw away part of every week the save
    // is opened in, the same way rounding attrs would.
    {
        const rawLangs = out.player.languages;
        const clean = {};
        if (rawLangs && typeof rawLangs === 'object' && !Array.isArray(rawLangs)) {
            for (const [id, v] of Object.entries(rawLangs)) {
                if (!LANGUAGE_IDS.includes(id)) continue;
                const n = Number(v);
                if (Number.isFinite(n)) clean[id] = clamp(n, 0, LANGUAGE_MAX);
            }
        }

        // GRANDFATHERING. Every career saved before languages existed carries no
        // `languages` key at all, and every one of those careers is already from
        // somewhere and most are already under contract somewhere. Loading them
        // with an empty map would invent a problem they never had: unable to
        // renew, and unable to justify the club they have played three years
        // for. So a save that carried no map is seeded fluent in the language of
        // where they are FROM and of where they PLAY.
        //
        // player.contract.region is a plain persisted string and is the only
        // thing read for the second half - resolving the club through teams.js
        // would mean importing it here, which this file deliberately does not do
        // for anything but teamsInRegion/clearTeamCaches.
        //
        // One-way and one-shot: it can only ever fire for a save written before
        // this field existed, because every save written after carries the map.
        const rawLangSrc = raw.player && raw.player.languages;
        const hadMap = !!rawLangSrc && typeof rawLangSrc === 'object';
        if (!hadMap) {
            const home = languageForRegion(out.player.region);
            if (home) clean[home] = LANGUAGE_MAX;
            const contract = out.player.contract;
            if (contract && typeof contract === 'object' && typeof contract.region === 'string') {
                const playing = languageForRegion(contract.region);
                if (playing) clean[playing] = LANGUAGE_MAX;
            }
        }
        out.player.languages = clean;

        // A study target for a language that does not exist would reach
        // studyTargetFor() as an id nothing resolves; null is the honest value
        // for "no choice made", and the default lives in constants.js.
        out.player.studyLang = LANGUAGE_IDS.includes(out.player.studyLang)
            ? out.player.studyLang : null;
    }

    // weekly.counts is the "how many times already this week" ledger the soloq
    // grind cost is priced off. engine.startCareerWeek rebuilds it from a
    // literal every week, so this only has to survive a save reloaded mid-week -
    // but a rotten entry must read as zero sessions, never as a negative or a
    // NaN that would flow straight into a health cost.
    {
        const rawCounts = out.weekly.counts;
        const clean = {};
        if (rawCounts && typeof rawCounts === 'object' && !Array.isArray(rawCounts)) {
            for (const [id, v] of Object.entries(rawCounts)) {
                const n = Math.round(Number(v));
                if (Number.isFinite(n)) clean[id] = Math.max(0, n);
            }
        }
        out.weekly.counts = clean;
    }

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
    clearTeamCaches();
    career.set(state);
    careerScreen.set(state.created ? 'hub' : 'create');
    // Overlays are transient and belong to the save that raised them. Loading a
    // save — including switching slot — must not inherit the last one's queue.
    // matchState is deliberately NOT touched here: it is transient too, but
    // initCareer also runs as a save round-trip check mid-session.
    clearOverlays();
    return state;
}

export function resetCareer() {
    clearTeamCaches();
    career.set(blankCareer());
    careerScreen.set('create');
    matchState.set(null);
    clearOverlays();
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

    // Your signature pick has to be a champion your playstyle would actually
    // play — the comfort bonus in the match engine is scored on exactly that
    // agreement. The creator only offers legal picks, so this is a backstop for
    // anything that calls createCareer directly; it COERCES to the nearest legal
    // champion rather than refusing, so a bad config still produces a career.
    let champ = CHAMPION_BY_ID[cfg.championId] || null;
    if (style && role) {
        const legal = championsForStyle(role.id, style.id);
        if (legal.length && !legal.some(c => c.id === (champ && champ.id))) champ = legal[0];
    }
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
        // Your signature pick is the one you already have the hours on. Every
        // other champion starts cold.
        proficiency: champ ? { [champ.id]: PROFICIENCY_SIGNATURE_HEAD_START } : {},
        // You already speak the language of where you grew up, at full. Nothing
        // else on the circuit comes for free - and because three regions share
        // English, what that buys you depends entirely on where you are from: a
        // European can already sign in NA and LCP, a Korean can sign nowhere but
        // the LCK until they study. Guarded because languageForRegion() returns
        // null for a region with no working language.
        languages: (() => {
            const home = languageForRegion(region.id);
            return home ? { [home]: LANGUAGE_MAX } : {};
        })(),
        studyLang: null,
    };
    c.money.gold = path.startGold;
    c.money.followers = path.startHype;
    // The old literals are kept as the fallback so a hand-built cfg still works.
    c.soloq.mmr = Number(path.startMMR) || (path.signed ? 2500 : 700);
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

/**
 * Raise the ceiling. `bonus` is a partial or full attribute map of points to ADD
 * to potential; anything missing or non-positive is left alone.
 *
 * This is the only way potential ever goes up, and everything that raises the
 * roof goes through it: a revealed genetic trait, the Evergreen perk, a
 * breakthrough season, a performance camp. Potential is stored as integers
 * (clampAttr rounds, and tools/careerSmoke.mjs asserts it stays inside 1..99),
 * unlike attrs which are deliberately fractional.
 *
 * Returns the map of points actually applied, so callers can report the truth
 * rather than what they asked for.
 */
export function raisePotential(bonus) {
    const applied = {};
    if (!bonus || typeof bonus !== 'object') return applied;
    career.update(c => {
        const pot = { ...c.player.potential };
        let moved = false;
        for (const k of ATTR_KEYS) {
            const add = Number(bonus[k]);
            if (!Number.isFinite(add) || add <= 0) continue;
            const before = pot[k] || 0;
            const after = clampAttr(before + add);
            if (after > before) {
                pot[k] = after;
                applied[k] = after - before;
                moved = true;
            }
        }
        if (!moved) return c;
        return { ...c, player: { ...c.player, potential: pot } };
    });
    return applied;
}

/** Raise the environment soft cap an unsigned player runs into. */
export function setSoftCap(value) {
    const v = clamp(Math.round(Number(value) || 0), 0, ATTR_MAX);
    career.update(c => (c.player.softCap === v ? c : { ...c, player: { ...c.player, softCap: v } }));
}

/** Add to the market-value premium. Additive because two perks grant it, and
 *  called exactly once per perk by economy.applyPermanentPerk() - which is
 *  guarded by flags.perksApplied, so it can never double-apply. */
export function addValueMult(delta) {
    const d = Number(delta) || 0;
    if (d <= 0) return;
    career.update(c => ({
        ...c,
        player: { ...c.player, valueMult: clamp((Number(c.player.valueMult) || 0) + d, 0, 5) },
    }));
}

/**
 * Bank games played on a champion. Called once per game played, on whatever was
 * actually picked in champion select — not on the signature pick, which is a
 * preference rather than a record of what you have played.
 */
export function addProficiency(championId, games = 1) {
    if (!CHAMPION_BY_ID[championId]) return 0;
    const n = Math.max(1, Math.round(Number(games) || 1));
    let total = 0;
    career.update(c => {
        const cur = c.player.proficiency || {};
        total = Math.min(9999, (Number(cur[championId]) || 0) + n);
        return {
            ...c,
            player: { ...c.player, proficiency: { ...cur, [championId]: total } },
        };
    });
    return total;
}

/** Games played on one champion. */
export function proficiencyGames(player, championId) {
    const v = Number(player?.proficiency?.[championId]);
    return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Give the player a trait. Idempotent — a trait is never granted twice. */
export function addTrait(id) {
    if (!TRAIT_BY_ID[id]) return false;
    let added = false;
    career.update(c => {
        const cur = Array.isArray(c.player.traits) ? c.player.traits : [];
        if (cur.includes(id)) return c;
        added = true;
        return { ...c, player: { ...c.player, traits: [...cur, id] } };
    });
    return added;
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

/** Bump the times-bought counter for a repeatable legacy trade. The counter IS
 *  the price ladder, so it is never reset by anything short of a new career. */
export function addTrade(id, n = 1) {
    if (!id) return 0;
    let total = 0;
    career.update(c => {
        const cur = (c.inventory.trades && typeof c.inventory.trades === 'object') ? c.inventory.trades : {};
        total = Math.min(9999, Math.max(0, Math.round(Number(cur[id]) || 0) + Math.round(Number(n) || 1)));
        return { ...c, inventory: { ...c.inventory, trades: { ...cur, [id]: total } } };
    });
    return total;
}

export function addMonument(id) {
    if (!id) return;
    career.update(c => {
        const cur = Array.isArray(c.inventory.monuments) ? c.inventory.monuments : [];
        return cur.includes(id) ? c : { ...c, inventory: { ...c.inventory, monuments: [...cur, id] } };
    });
}

// ── Awards / trophies ────────────────────────────────────────────────────
export function addAward(award) {
    career.update(c => ({ ...c, awards: [...c.awards, award] }));
}

export function addTrophy(trophy) {
    career.update(c => ({ ...c, trophies: [...c.trophies, trophy] }));
}
