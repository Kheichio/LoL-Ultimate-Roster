// ═══════════════════════════════════════════════════════════════════════════
//  LOCAL STORAGE — with save slots
// ═══════════════════════════════════════════════════════════════════════════
//  Every persisted value in the game goes through saveToStorage/loadFromStorage,
//  which is why the save-slot system lives here rather than in each store: one
//  resolver namespaces every key at once and no caller has to know slots exist.
//
//  Two independent slot families, because the two gamemodes already share
//  nothing:
//    roster  — Ultimate Roster,  keys prefixed `lur_`
//    career  — Ultimate Career,  keys prefixed `lurc_`
//
//  SLOT 1 USES THE BARE KEY. That is deliberate: every save that existed before
//  slots shipped is already slot 1, so nobody's club or career needs migrating
//  and nothing can be lost by a migration that goes wrong. Slots 2+ append `@n`.
//
//  Three keys are DEVICE preferences, not save data. They are never namespaced —
//  a player who switches slot should not lose their theme and get their audio
//  unmuted.

const DEVICE_KEYS = new Set(['lur_sound_muted', 'lur_light_mode', 'lur_display_scale']);

// Slot bookkeeping lives under its own prefix so it can never be namespaced by
// its own resolver (`lurmeta_` matches neither `lur_` nor `lurc_`).
const META_ROSTER_SLOT = 'lurmeta_roster_slot';
const META_CAREER_SLOT = 'lurmeta_career_slot';
const META_KEY_INDEX   = 'lurmeta_key_index';

export const SLOT_IDS = [1, 2, 3];
export const SLOT_COUNT = SLOT_IDS.length;

// ─────────────────────────────────────────────────────────────────────────
//  RAW ACCESS
//  localStorage can throw (private mode, quota, a shimmed store in the headless
//  harnesses), and this module is imported at boot by stores that must not
//  explode. Every raw call is guarded.
// ─────────────────────────────────────────────────────────────────────────
function rawGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function rawSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { console.warn(`Failed to save ${key}:`, e); }
}

function rawRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* nothing worth doing */ }
}

// ─────────────────────────────────────────────────────────────────────────
//  SLOT RESOLUTION
// ─────────────────────────────────────────────────────────────────────────
export function clampSlot(n) {
    const v = Math.round(Number(n));
    return SLOT_IDS.includes(v) ? v : 1;
}

/** Which slot family a key belongs to, or null for device prefs / meta keys. */
export function familyOf(key) {
    const k = String(key == null ? '' : key);
    if (DEVICE_KEYS.has(k)) return null;
    if (k.startsWith('lurc_')) return 'career';   // must be tested before `lur_`
    if (k.startsWith('lur_')) return 'roster';
    return null;
}

let _slots = {
    roster: clampSlot(rawGet(META_ROSTER_SLOT)),
    career: clampSlot(rawGet(META_CAREER_SLOT)),
};

export function activeSlot(family) {
    return family === 'career' || family === 'roster' ? _slots[family] : 1;
}

/**
 * Point a family at a different slot. Returns true when the slot actually
 * changed — callers use that to decide whether a reload is needed.
 */
export function setActiveSlot(family, slot) {
    if (family !== 'career' && family !== 'roster') return false;
    const next = clampSlot(slot);
    if (_slots[family] === next) return false;
    _slots[family] = next;
    rawSet(family === 'career' ? META_CAREER_SLOT : META_ROSTER_SLOT, String(next));
    return true;
}

/** The real localStorage key for a logical key, in a given slot (default: active). */
export function resolveKey(key, slotOverride) {
    const fam = familyOf(key);
    if (!fam) return key;
    const slot = slotOverride == null ? activeSlot(fam) : clampSlot(slotOverride);
    return slot === 1 ? key : `${key}@${slot}`;
}

// ─────────────────────────────────────────────────────────────────────────
//  KEY REGISTRY
//  Deleting a slot means deleting every key that belongs to it, and the headless
//  harnesses shim localStorage with an object that has no length/key(i). So the
//  set of logical keys the game uses is recorded as it is written, and
//  enumeration is only ever an extra source of candidates, never the only one.
// ─────────────────────────────────────────────────────────────────────────
let _knownKeys = null;

function knownKeys() {
    if (_knownKeys) return _knownKeys;
    _knownKeys = new Set();
    try {
        const raw = rawGet(META_KEY_INDEX);
        const arr = raw ? JSON.parse(raw) : null;
        if (Array.isArray(arr)) for (const k of arr) if (typeof k === 'string') _knownKeys.add(k);
    } catch (e) { /* a corrupt index is not worth failing a save over */ }
    return _knownKeys;
}

function rememberKey(key) {
    const set = knownKeys();
    if (set.has(key)) return;
    set.add(key);
    try { rawSet(META_KEY_INDEX, JSON.stringify([...set])); } catch (e) { /* ignore */ }
}

/** Every real localStorage key we can see, when the environment allows it. */
function enumerateKeys() {
    const out = [];
    try {
        const n = Number(localStorage.length);
        if (!Number.isFinite(n)) return out;
        for (let i = 0; i < n; i++) {
            const k = localStorage.key(i);
            if (typeof k === 'string') out.push(k);
        }
    } catch (e) { /* shimmed store without length/key — registry only */ }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────────────
export function saveToStorage(key, value) {
    const resolved = resolveKey(key);
    try {
        localStorage.setItem(resolved, JSON.stringify(value));
    } catch (e) {
        console.warn(`Failed to save ${key}:`, e);
        return;
    }
    if (familyOf(key)) rememberKey(key);
}

export function loadFromStorage(key) {
    try {
        const raw = rawGet(resolveKey(key));
        return raw !== null ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn(`Failed to load ${key}:`, e);
        return null;
    }
}

export function removeFromStorage(key) {
    rawRemove(resolveKey(key));
}

/** Write one key into a specific slot without switching to it. Used by the
 *  cloud restore, which puts every backed-up career slot back where it came
 *  from rather than dropping them all into whichever slot happens to be open. */
export function saveToSlot(key, value, slot) {
    try {
        localStorage.setItem(resolveKey(key, slot), JSON.stringify(value));
    } catch (e) {
        console.warn(`Failed to save ${key} to slot ${slot}:`, e);
        return false;
    }
    if (familyOf(key)) rememberKey(key);
    return true;
}

/** Read one key out of a specific slot without switching to it — used by the
 *  slot picker to preview what each save contains. */
export function loadFromSlot(key, slot) {
    try {
        const raw = rawGet(resolveKey(key, slot));
        return raw !== null ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/** Logical keys belonging to a family, from the registry plus whatever the real
 *  store will admit to holding. */
function keysForFamily(family) {
    const out = new Set();
    for (const k of knownKeys()) if (familyOf(k) === family) out.add(k);
    for (const real of enumerateKeys()) {
        const base = real.includes('@') ? real.slice(0, real.lastIndexOf('@')) : real;
        if (familyOf(base) === family) out.add(base);
    }
    return [...out];
}

/** Erase one slot of one gamemode. Nothing else is touched. */
export function clearSlot(family, slot) {
    if (family !== 'career' && family !== 'roster') return;
    const n = clampSlot(slot);
    for (const key of keysForFamily(family)) rawRemove(resolveKey(key, n));
}

export function slotHasData(family, slot) {
    const probe = family === 'career' ? 'lurc_career' : 'lur_club';
    const v = loadFromSlot(probe, slot);
    if (family === 'career') return !!(v && v.created);
    // A roster slot counts as used once anything at all has been written to it.
    if (Array.isArray(v) && v.length) return true;
    return loadFromSlot('lur_progression', slot) !== null || loadFromSlot('lur_be', slot) !== null;
}

/**
 * Erase every save in both gamemodes, in every slot. Device preferences and the
 * slot bookkeeping survive — this is "wipe my game", not "wipe my browser".
 * Replaces a blanket localStorage.clear(), which also destroyed the player's
 * theme, their audio setting and the career save the copy never mentioned.
 */
export function clearStorage() {
    for (const family of ['roster', 'career']) {
        for (const key of keysForFamily(family)) {
            for (const slot of SLOT_IDS) rawRemove(resolveKey(key, slot));
        }
    }
}
