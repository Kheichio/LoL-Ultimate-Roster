import { writable, derived, get } from 'svelte/store';
import { loadFromStorage, saveToStorage, loadFromSlot } from '../utils/storage.js';
import { getDB, getCardById } from '../utils/cards.js';
import { validateCard, clampNum, signSave, verifySave, BOUNDS } from '../utils/anticheat.js';

// === Core Game State ===
// Starting Blue Essence. Deliberately tight — exactly one Standard pack (100 BE) on top of
// the free Starter Pack, so a new manager can't buy their way to a good squad immediately.
export const STARTING_BE = 100;
export const blueEssence = writable(STARTING_BE);
export const club = writable([]);
export const squad = writable({ COACH: null, TOP: null, JNG: null, MID: null, ADC: null, SUP: null });
export const bench = writable([null, null, null]);
export const hasBoughtStarter = writable(false);
export const teamIdentity = writable({ name: 'My Team', logo: '🛡️', color: '#3b82f6', favouriteTeam: '', favouritePlayer: '', unlockedIcons: [], unlockedColors: [] });
export const showcasePicks = writable([]);

// === Progression ===
export const managerXP = writable(0);
export const managerLevel = writable(1);
export const skillPoints = writable(0);
export const skills = writable({ scouting: 0, tactics: 0, transfer: 0, conditioning: 0, stamina: 0, mentorship: 0, trading: 0, bench: 0, wealth: 0, clubhouse: 0, bulk: 0 });

// === Tracking ===
export const trackStats = writable({
    packs: 0, tournamentsWon: 0, goldenRoads: 0, soldCount: 0, soldBE: 0, matchesPlayed: {},
    cafeWins: 0, regionalSplitWon: 0, firstStandWon: 0, msiWon: 0, worldsWon: 0,
    losses: 0, draftModesPlayed: 0, draftModesWon: 0, upgradesPerformed: 0,
    splitsCompleted: 0, holographicPulled: 0, signaturesPulled: 0,
    // Written by Tower/RBC/Trade. Declared here so quests can read them before the
    // first run of each mode — the whole object is persisted as lur_stats, and
    // initGame merges saved values over these defaults.
    towerHighestFloor: 0, rbcCompleted: 0, tradesDone: 0,
});

// === Systems ===
export const collectionRegistry = writable({});
export const unlocks = writable({ firstStand: false, msi: false, worlds: false, draftMode: false, salaryCap: false, tower: false });
export const seasonData = writable({ currentSplit: 1, splitWins: 0, splitLosses: 0, trophyCase: [], opponents: [], matchResults: [] });
export const battlePass = writable({ season: 1, tier: 0, xp: 0, claimed: [] });

// === Daily Login ===
export const dailyLogin = writable({ lastClaim: null, streak: 0, totalDays: 0 });

// === Quests ===
export const questsClaimed = writable({});
export const questsRepeatableBaselines = writable({});
export const questsRepeatableCounts = writable({});
export const achievementsClaimed = writable({});

// === Archive Rewards ===
export const archiveRewards = writable({ claimedCards: {}, claimedTeams: {} });

// === Prestige ===
export const prestige = writable(0);

// === Milestone Cards ===
export const milestoneCards = writable([]);

// === Academy (auto-farming secondary team) ===
// 5 role slots (separate from the main squad) + sentAt epoch (0 = idle, >0 = farming since that time).
export const academy = writable({ TOP: null, JNG: null, MID: null, ADC: null, SUP: null, sentAt: 0 });

// Roster Building Challenges — which challenges have been completed on the current day.
export const rbcState = writable({ day: '', claimed: {} });

// Free packs earned from RBCs — { [storePackId]: count }. Opened for free in the Store.
export const freePacks = writable({});

// Transfer Market — rotating signings board. { window: <15-min index or null>, claimed: { [cardId]: true } }.
// Persisted alongside the club/BE so a sign and its claim record commit atomically in one save.
export const tradeMarket = writable({ window: null, claimed: {} });

// === Match History (recent results log, newest first, capped at 50) ===
export const matchHistory = writable([]);
export function logMatch(entry) {
    const e = { mode: 'match', result: 'loss', opponent: '', be: 0, xp: 0, ts: Date.now(), ...entry };
    matchHistory.update(list => [e, ...list].slice(0, 50));
}

// === Derived ===
export const clubCapacity = derived(skills, $s => 100 + ($s.clubhouse || 0) * 50);
// Bulk Opening skill — how many packs of one type can be opened in a single click.
export const bulkOpenMax = derived(skills, $s => 1 + ($s.bulk || 0));
export const isClubFull = derived([club, clubCapacity], ([$c, $cap]) => $c.length >= $cap);
export const weightedTrophies = derived(trackStats, $ts =>
    (($ts.worldsWon || 0) * 6) + (($ts.msiWon || 0) * 4) + (($ts.firstStandWon || 0) * 2) +
    (($ts.regionalSplitWon || 0) * 1) + (($ts.goldenRoads || 0) * 10)
);

// === XP System ===
export function grantXP(amount) {
    const mentorLevel = get(skills).mentorship || 0;
    const bonus = Math.round(amount * mentorLevel * 0.1);
    const total = amount + bonus;
    managerXP.update(xp => {
        let newXP = xp + total;
        let lvl = get(managerLevel);
        let sp = get(skillPoints);
        let leveled = false;
        while (newXP >= lvl * 500) {
            newXP -= lvl * 500;
            lvl++;
            sp++;
            leveled = true;
        }
        if (leveled) {
            managerLevel.set(lvl);
            skillPoints.set(sp);
        }
        return newXP;
    });
}

// === Wealth Bonus BE ===
export function grantBE(amount) {
    const wealthLevel = get(skills).wealth || 0;
    const bonus = Math.round(amount * wealthLevel * 0.1);
    const total = amount + bonus;
    blueEssence.update(v => v + total);
    // Returns { total, bonus } — bonus > 0 when Wealth Management is levelled
    return { total, bonus };
}

// === Battle Pass XP ===
export function grantBPXP(amount) {
    battlePass.update(bp => {
        let xp = (bp.xp || 0) + amount;
        let tier = bp.tier || 0;
        const XP_PER_TIER = 1000;
        while (xp >= XP_PER_TIER) {
            xp -= XP_PER_TIER;
            tier++;
        }
        return { ...bp, xp, tier };
    });
}

// === Prestige ===
export function prestigeManager() {
    const lvl = get(managerLevel);
    if (lvl < 100) return false;
    const p = get(prestige) + 1;
    prestige.set(p);
    managerLevel.set(1);
    managerXP.set(0);
    skillPoints.set(0);
    skills.set({ scouting: 0, tactics: 0, transfer: 0, conditioning: 0, stamina: 0, mentorship: 0, trading: 0, bench: 0, wealth: 0, clubhouse: 0, bulk: 0 });
    return true;
}

// === Milestone Cards ===
const MILESTONE_DEFS = [
    { id: 'first_worlds', check: ts => (ts.worldsWon || 0) >= 1, name: 'World Champion', role: 'TOP', rating: 99, quality: 'MILESTONE' },
    { id: 'first_msi', check: ts => (ts.msiWon || 0) >= 1, name: 'MSI Champion', role: 'MID', rating: 97, quality: 'MILESTONE' },
    { id: 'tower_100', check: ts => (ts.towerHighestFloor || 0) >= 100, name: 'Tower Climber', role: 'JNG', rating: 95, quality: 'MILESTONE' },
    { id: 'packs_100', check: ts => (ts.packs || 0) >= 100, name: 'Pack Addict', role: 'ADC', rating: 90, quality: 'MILESTONE' },
    { id: 'golden_road', check: ts => (ts.goldenRoads || 0) >= 1, name: 'Golden Road', role: 'SUP', rating: 99, quality: 'MILESTONE' },
    { id: 'prestige_1', check: (ts, p) => p >= 1, name: 'Prestige I', role: 'COACH', rating: 99, quality: 'MILESTONE' },
    { id: 'splits_10', check: ts => (ts.splitsCompleted || 0) >= 10, name: 'Season Veteran', role: 'MID', rating: 94, quality: 'MILESTONE' },
];

export function checkMilestoneCards() {
    const ts = get(trackStats);
    const p = get(prestige);
    const existing = get(milestoneCards);
    const existingIds = new Set(existing.map(c => c.milestoneId));
    const newCards = [];
    for (const def of MILESTONE_DEFS) {
        if (!existingIds.has(def.id) && def.check(ts, p)) {
            newCards.push({ ...def, id: def.id + '_card', milestoneId: def.id, uniqueId: 'milestone_' + def.id, team: 'Milestone', year: new Date().getFullYear(), region: 'Legacy', locked: true, stats: { mec: def.rating - 2, tmf: def.rating - 1, frm: def.rating, cmp: def.rating, map: def.rating - 1, ldr: def.rating + 1 } });
        }
    }
    if (newCards.length > 0) {
        milestoneCards.update(m => [...m, ...newCards]);
        return newCards;
    }
    return [];
}

// === Team Name Generator ===
const _ADJ  = ['Apex','Azure','Blazing','Crimson','Crystal','Dark','Frozen','Ghost','Golden','Iron','Jade','Neon','Nova','Obsidian','Phantom','Prime','Scarlet','Shadow','Silver','Solar','Storm','Thunder','Toxic','Void'];
const _NOUN = ['Bears','Cobras','Dragons','Eagles','Falcons','Foxes','Hawks','Hydras','Jaguars','Knights','Lions','Panthers','Phoenix','Ravens','Serpents','Sharks','Tigers','Titans','Vipers','Wolves'];
const _LOGO = ['🐉','🦁','🐺','🦅','🐯','🦊','🦈','🐍','🦉','🦇','⚡','🔥','💎','🌊','🌪️','🗡️','🎯','👑','🔮','🏹'];
const _COLOR = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#14b8a6','#a855f7'];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateTeamIdentity() {
    return {
        name: `${_pick(_ADJ)} ${_pick(_NOUN)}`,
        logo: _pick(_LOGO),
        color: _pick(_COLOR),
        favouriteTeam: '',
        favouritePlayer: '',
        unlockedIcons: [],
        unlockedColors: [],
    };
}

// === Save / Load ===
let _saveDebounce = null;

// Single source of truth: every persisted store → its storage key. Shared by local
// save (saveGame), cloud save, and cloud load so the three can never drift apart.
export function snapshotState() {
    return {
        lur_be: get(blueEssence),
        lur_club: get(club),
        lur_squad: get(squad),
        lur_bench: get(bench),
        lur_starter: get(hasBoughtStarter),
        lur_showcase: get(showcasePicks),
        lur_identity: get(teamIdentity),
        lur_stats: get(trackStats),
        lur_progression: { xp: get(managerXP), level: get(managerLevel), sp: get(skillPoints), skills: get(skills) },
        lur_collection: get(collectionRegistry),
        lur_unlocks: get(unlocks),
        lur_season: get(seasonData),
        lur_battlepass: get(battlePass),
        lur_dailylogin: get(dailyLogin),
        lur_quests_claimed: get(questsClaimed),
        lur_quests_rbase: get(questsRepeatableBaselines),
        lur_quests_rcounts: get(questsRepeatableCounts),
        lur_achievements_claimed: get(achievementsClaimed),
        lur_archive_rewards: get(archiveRewards),
        lur_prestige: get(prestige),
        lur_milestone_cards: get(milestoneCards),
        lur_academy: get(academy),
        lur_rbc: get(rbcState),
        lur_freepacks: get(freePacks),
        lur_trademarket: get(tradeMarket),
        lur_matchhistory: get(matchHistory),
    };
}

// The module defaults of every persisted store, captured at load time — before
// initGame() has had any chance to overwrite them. Taking them from snapshotState()
// rather than re-typing each default means the reset table below cannot drift from the
// store declarations at the top of this file, and adding a store to the save
// automatically adds it here.
const _DEFAULTS = snapshotState();

// Defaults are handed out as copies: several are objects/arrays, and a store handed the
// same reference twice would let one slot's mutation follow the player into the next.
function _defaultFor(key) {
    const v = _DEFAULTS[key];
    return (v === null || typeof v !== 'object') ? v : JSON.parse(JSON.stringify(v));
}

// How each snapshotState() key maps back onto its store(s). Keyed by storage key so
// resetGameStores() can walk snapshotState()'s own key list and warn about anything
// persisted that it does not know how to reset.
const _RESETTERS = {
    lur_be:                   d => blueEssence.set(d),
    lur_club:                 d => club.set(d),
    lur_squad:                d => squad.set(d),
    lur_bench:                d => bench.set(d),
    lur_starter:              d => hasBoughtStarter.set(d),
    lur_showcase:             d => showcasePicks.set(d),
    lur_identity:             d => teamIdentity.set(d),
    lur_stats:                d => trackStats.set(d),
    lur_progression:          d => { managerXP.set(d.xp); managerLevel.set(d.level); skillPoints.set(d.sp); skills.set(d.skills); },
    lur_collection:           d => collectionRegistry.set(d),
    lur_unlocks:              d => unlocks.set(d),
    lur_season:               d => seasonData.set(d),
    lur_battlepass:           d => battlePass.set(d),
    lur_dailylogin:           d => dailyLogin.set(d),
    lur_quests_claimed:       d => questsClaimed.set(d),
    lur_quests_rbase:         d => questsRepeatableBaselines.set(d),
    lur_quests_rcounts:       d => questsRepeatableCounts.set(d),
    lur_achievements_claimed: d => achievementsClaimed.set(d),
    lur_archive_rewards:      d => archiveRewards.set(d),
    lur_prestige:             d => prestige.set(d),
    lur_milestone_cards:      d => milestoneCards.set(d),
    lur_academy:              d => academy.set(d),
    lur_rbc:                  d => rbcState.set(d),
    lur_freepacks:            d => freePacks.set(d),
    lur_trademarket:          d => tradeMarket.set(d),
    lur_matchhistory:         d => matchHistory.set(d),
};

/**
 * Put every persisted store back to its module default.
 *
 * WHY THIS EXISTS: initGame() is a MERGE, not a load. Every read is guarded by
 * `if (raw)` with no else-branch, and several of them merge over `get(store)` — the
 * store's CURRENT value — rather than over a default. That is exactly right when there
 * is only ever one save, but with save slots it means loading slot B on top of slot A
 * carries A's club, BE, squad, quests, unlocks and stats straight into B for every key
 * B happens not to have written. Call this first and initGame() merges over defaults
 * instead of over the previous slot.
 *
 * Component-local keys (lur_tower_run, the pity counters, the cooldowns,
 * lur_redeemed_codes) are not stores and are not reset here — they are slot-namespaced
 * in storage.js and re-read from the active slot when their component next mounts.
 */
export function resetGameStores() {
    for (const key of Object.keys(_DEFAULTS)) {
        const reset = _RESETTERS[key];
        if (reset) reset(_defaultFor(key));
        else console.warn(`[LUR] resetGameStores: no default for ${key} — it will leak between save slots.`);
    }
}

// The write itself. saveGame() defers it, flushGame() runs it now — factored out so the
// two can never disagree about which keys a save covers.
/**
 * Set once initGame() has actually loaded a save into the stores.
 *
 * Until then the stores hold their module defaults, and persisting THOSE is not
 * saving an empty game - it is destroying whatever is in the slot. The career
 * store had exactly this bug: the save-slot picker flushed it from the main
 * menu before anything had been loaded, wrote a blank career over the player's
 * save and then loaded the blank back. The roster side is not reachable the same
 * way today, because App.svelte calls initGame() at boot, but the guard costs
 * nothing and the failure mode is unrecoverable data loss.
 */
let _hydrated = false;

function writeSave() {
    if (!_hydrated && loadFromStorage('lur_progression') !== null) {
        console.warn('[LUR] Refused to overwrite a saved club before initGame() had loaded it.');
        return;
    }
    const state = snapshotState();
    for (const [k, v] of Object.entries(state)) saveToStorage(k, v);
    // Integrity signature — written last so it covers all values above
    saveToStorage('lur_s', signSave(get(blueEssence), get(managerLevel), get(prestige), get(club).length));
}

export function saveGame() {
    if (_saveDebounce) clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(() => { _saveDebounce = null; writeSave(); }, 100);
}

/** Immediate, non-debounced write. Must run before the active roster slot changes: a
 *  save still sitting in the 100ms debounce resolves its keys when it FIRES, so it
 *  would otherwise write this slot's snapshot into whichever slot is selected by then. */
export function flushGame() {
    if (_saveDebounce) { clearTimeout(_saveDebounce); _saveDebounce = null; }
    writeSave();
}

/**
 * Enough of one slot's save to draw a save-slot card, read without switching to it.
 * Returns null for an empty slot. Everything is treated as untrusted — a slot can hold
 * a partial, hand-edited or half-written save.
 */
export function rosterSlotSummary(slot) {
    const rawProg = loadFromSlot('lur_progression', slot);
    const rawClub = loadFromSlot('lur_club', slot);
    const rawBE   = loadFromSlot('lur_be', slot);
    // Empty means nothing has ever been written here — no progression, no club, no BE.
    if (rawProg === null && rawClub === null && rawBE === null) return null;

    const rawId = loadFromSlot('lur_identity', slot);
    const id = (rawId && typeof rawId === 'object' && !Array.isArray(rawId)) ? rawId : {};
    // Fall back to the identity store's own defaults rather than re-typing them.
    const fallback = _defaultFor('lur_identity');

    const rawStats = loadFromSlot('lur_stats', slot);
    const stat = k => {
        const n = Math.floor(Number(rawStats && rawStats[k]));
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    // Same weighting as the weightedTrophies derived store above.
    const trophies = (stat('worldsWon') * 6) + (stat('msiWon') * 4) + (stat('firstStandWon') * 2) +
        (stat('regionalSplitWon') * 1) + (stat('goldenRoads') * 10);

    return {
        name:      (typeof id.name === 'string' && id.name.trim()) ? id.name.trim().slice(0, 24) : fallback.name,
        // Length-checked rather than sliced: the logo is a single glyph made of several
        // UTF-16 units, and cutting one in half renders as a broken box.
        logo:      (typeof id.logo === 'string' && id.logo.trim() && id.logo.trim().length <= 8) ? id.logo.trim() : fallback.logo,
        color:     (typeof id.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(id.color)) ? id.color : fallback.color,
        level:     clampNum(rawProg && rawProg.level, BOUNDS.level.min, BOUNDS.level.max, BOUNDS.level.min),
        prestige:  clampNum(loadFromSlot('lur_prestige', slot), BOUNDS.prestige.min, BOUNDS.prestige.max, 0),
        be:        clampNum(rawBE, BOUNDS.be.min, BOUNDS.be.max, 0),
        clubSize:  Array.isArray(rawClub) ? rawClub.length : 0,
        trophies:  clampNum(trophies, BOUNDS.trophies.min, BOUNDS.trophies.max, 0),
    };
}

// Write a full snapshot (key → value) into localStorage, then re-hydrate every store
// via initGame() so cloud loads get the exact same validation/clamping as local loads.
//
// CLOUD SYNC TRACKS THE ACTIVE ROSTER SLOT ONLY. There is one Firestore document per
// user (see cloudSave/cloudLoad in stores/auth.js), and these bare `lur_*` names resolve
// through storage.js's slot resolver, so a cloud save uploads whichever slot is selected
// now and a cloud load restores into it. The other slots — and the whole career
// gamemode, which never syncs at all — are untouched.
export function applyState(state) {
    if (!state || typeof state !== 'object') return;
    // Reset first, because initGame() merges: without this, anything the cloud blob is
    // missing would be silently kept from whatever was already in this slot.
    resetGameStores();
    for (const [k, v] of Object.entries(state)) {
        if (v !== undefined) saveToStorage(k, v);
    }
    initGame();
    saveGame();
}

// NOTE: this MERGES, it does not reset. Every read below is guarded by `if (raw)` with
// no else-branch, and several merge over `get(store)`, so any key the save does not hold
// keeps whatever the store already had. That is deliberate — it is how a save from an
// older version picks up newly added defaults. Its companion is resetGameStores(): call
// that first whenever the stores may be holding a DIFFERENT save (a slot switch, a cloud
// load), or the previous one bleeds through.
export function initGame() {
    // From here on the stores reflect a real load, so persisting them is safe.
    _hydrated = true;
    const dbLoaded = !!getDB();

    // Helpers
    const sanitiseCards = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map(c => validateCard(c, getCardById, dbLoaded)).filter(Boolean);
    };
    const sanitiseSquad = (obj) => {
        const blank = { COACH: null, TOP: null, JNG: null, MID: null, ADC: null, SUP: null };
        if (!obj || typeof obj !== 'object') return blank;
        const result = { ...blank };
        for (const role of Object.keys(blank)) {
            if (obj[role]) result[role] = validateCard(obj[role], getCardById, dbLoaded) || null;
        }
        return result;
    };

    // Read raw values that the integrity hash covers
    const rawBE   = loadFromStorage('lur_be');
    const rawProg = loadFromStorage('lur_progression');
    const rawPt   = loadFromStorage('lur_prestige');
    const rawClub = loadFromStorage('lur_club');

    // Integrity check — only runs if a signature was previously saved
    const savedSig = loadFromStorage('lur_s');
    if (savedSig) {
        const checkBE      = Math.floor(Number(rawBE) || 0);
        const checkLevel   = rawProg ? Math.floor(Number(rawProg.level) || 1) : 1;
        const checkPrestige= Math.floor(Number(rawPt) || 0);
        const checkLen     = Array.isArray(rawClub) ? rawClub.length : 0;
        if (!verifySave(savedSig, checkBE, checkLevel, checkPrestige, checkLen)) {
            console.warn('[LUR] Save integrity mismatch — values will be clamped.');
        }
    }

    // Blue Essence — hard cap prevents economic exploits
    if (rawBE !== null) blueEssence.set(clampNum(rawBE, BOUNDS.be.min, BOUNDS.be.max, STARTING_BE));

    // Club / squad / bench — strip any card not in the database
    if (rawClub) club.set(sanitiseCards(rawClub));

    const rawSquad = loadFromStorage('lur_squad');
    if (rawSquad) squad.set(sanitiseSquad(rawSquad));

    const rawBench = loadFromStorage('lur_bench');
    if (rawBench && Array.isArray(rawBench)) {
        bench.set(rawBench.map(c => c ? (validateCard(c, getCardById, dbLoaded) || null) : null));
    }

    const sc = loadFromStorage('lur_showcase');
    if (sc) showcasePicks.set(sanitiseCards(sc));

    const st = loadFromStorage('lur_starter');
    if (st !== null) hasBoughtStarter.set(st === true || st === 'true');

    const id = loadFromStorage('lur_identity');
    if (!id) {
        // Brand-new save — give them a unique generated identity
        teamIdentity.set(generateTeamIdentity());
    } else if (id.name === 'My Team' && id.logo === '🛡️') {
        // Never customised — generate a unique name but keep any colour they may have changed
        const gen = generateTeamIdentity();
        teamIdentity.set({ ...gen, color: id.color !== '#3b82f6' ? id.color : gen.color, favouriteTeam: id.favouriteTeam || '', favouritePlayer: id.favouritePlayer || '', unlockedIcons: id.unlockedIcons || [], unlockedColors: id.unlockedColors || [] });
    } else {
        teamIdentity.set({ unlockedIcons: [], unlockedColors: [], ...id });
    }

    const ts = loadFromStorage('lur_stats');
    if (ts) trackStats.set({ ...get(trackStats), ...ts });

    // Progression — clamp numeric fields so level/XP can't be inflated
    if (rawProg) {
        managerXP.set(clampNum(rawProg.xp, BOUNDS.xp.min, BOUNDS.xp.max, 0));
        managerLevel.set(clampNum(rawProg.level, BOUNDS.level.min, BOUNDS.level.max, 1));
        skillPoints.set(clampNum(rawProg.sp, BOUNDS.sp.min, BOUNDS.sp.max, 0));
        if (rawProg.skills) {
            const clamped = {};
            for (const [k, v] of Object.entries({ ...get(skills), ...rawProg.skills })) {
                clamped[k] = clampNum(v, BOUNDS.skill.min, BOUNDS.skill.max, 0);
            }
            skills.set(clamped);
        }
    }

    const col = loadFromStorage('lur_collection');
    if (col) collectionRegistry.set(col);

    const u = loadFromStorage('lur_unlocks');
    if (u) unlocks.set({ ...get(unlocks), ...u });

    const sd = loadFromStorage('lur_season');
    if (sd) seasonData.set({ ...get(seasonData), ...sd });

    const bp = loadFromStorage('lur_battlepass');
    if (bp) battlePass.set({ ...get(battlePass), ...bp });

    const dl = loadFromStorage('lur_dailylogin');
    if (dl) dailyLogin.set({ ...get(dailyLogin), ...dl });

    const qc = loadFromStorage('lur_quests_claimed');
    if (qc) questsClaimed.set(qc);

    const qrb = loadFromStorage('lur_quests_rbase');
    if (qrb) questsRepeatableBaselines.set(qrb);

    const qrc = loadFromStorage('lur_quests_rcounts');
    if (qrc) questsRepeatableCounts.set(qrc);

    const ac = loadFromStorage('lur_achievements_claimed');
    if (ac) achievementsClaimed.set(ac);

    const ar = loadFromStorage('lur_archive_rewards');
    if (ar) archiveRewards.set({ ...get(archiveRewards), ...ar });

    if (rawPt !== null) prestige.set(clampNum(rawPt, BOUNDS.prestige.min, BOUNDS.prestige.max, 0));

    // Milestone cards — reconstruct from definitions so stats can't be boosted
    const rawMC = loadFromStorage('lur_milestone_cards');
    if (rawMC && Array.isArray(rawMC)) {
        const valid = rawMC.filter(card => card && card.milestoneId && MILESTONE_DEFS.some(d => d.id === card.milestoneId))
            .map(card => {
                const def = MILESTONE_DEFS.find(d => d.id === card.milestoneId);
                return { ...def, id: def.id + '_card', milestoneId: def.id, uniqueId: 'milestone_' + def.id,
                    team: 'Milestone', year: new Date().getFullYear(), region: 'Legacy', locked: true,
                    stats: { mec: def.rating - 2, tmf: def.rating - 1, frm: def.rating, cmp: def.rating, map: def.rating - 1, ldr: def.rating + 1 } };
            });
        milestoneCards.set(valid);
    }

    // Academy — validate the 5 assigned cards against the DB; keep the farming timestamp
    const rawAcademy = loadFromStorage('lur_academy');
    if (rawAcademy && typeof rawAcademy === 'object') {
        const result = { TOP: null, JNG: null, MID: null, ADC: null, SUP: null, sentAt: 0 };
        for (const role of ['TOP', 'JNG', 'MID', 'ADC', 'SUP']) {
            if (rawAcademy[role]) result[role] = validateCard(rawAcademy[role], getCardById, dbLoaded) || null;
        }
        result.sentAt = Math.max(0, Math.floor(Number(rawAcademy.sentAt) || 0));
        academy.set(result);
    }

    const rawMH = loadFromStorage('lur_matchhistory');
    if (rawMH && Array.isArray(rawMH)) matchHistory.set(rawMH.slice(0, 50));

    const rawRbc = loadFromStorage('lur_rbc');
    if (rawRbc && typeof rawRbc === 'object') {
        rbcState.set({
            day: typeof rawRbc.day === 'string' ? rawRbc.day : '',
            claimed: (rawRbc.claimed && typeof rawRbc.claimed === 'object') ? rawRbc.claimed : {},
        });
    }

    const rawFp = loadFromStorage('lur_freepacks');
    if (rawFp && typeof rawFp === 'object' && !Array.isArray(rawFp)) {
        const clean = {};
        for (const [k, v] of Object.entries(rawFp)) {
            const n = Math.max(0, Math.floor(Number(v) || 0));
            if (n > 0) clean[k] = Math.min(n, 999);
        }
        freePacks.set(clean);
    }

    const rawTM = loadFromStorage('lur_trademarket');
    if (rawTM && typeof rawTM === 'object' && !Array.isArray(rawTM)) {
        tradeMarket.set({
            window: typeof rawTM.window === 'number' ? rawTM.window : null,
            claimed: (rawTM.claimed && typeof rawTM.claimed === 'object' && !Array.isArray(rawTM.claimed)) ? rawTM.claimed : {},
        });
    }
}
