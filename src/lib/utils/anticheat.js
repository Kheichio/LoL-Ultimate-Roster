// FNV-1a 32-bit hash — fast, decent distribution for save integrity
function _fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

const _S = 'lur2\x24sig\x40v2';

export function signSave(be, level, prestige, clubLen) {
    return _fnv(_S + [be | 0, level | 0, prestige | 0, clubLen | 0].join('\x3a'));
}

export function verifySave(sig, be, level, prestige, clubLen) {
    return sig === signSave(be, level, prestige, clubLen);
}

// Clamp a loaded numeric value to safe bounds
export function clampNum(val, min, max, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

// Reconstruct a card from DB data to prevent stat injection.
// Returns null if the card ID doesn't exist in the database.
export function validateCard(raw, getCardByIdFn, dbLoaded) {
    if (!raw || typeof raw !== 'object') return null;
    // Non-numeric IDs are fabricated
    if (typeof raw.id !== 'number' || !Number.isFinite(raw.id)) return null;

    if (!dbLoaded) {
        // DB not yet loaded — accept but sanitise to prevent obviously invalid cards
        if (raw.rating > 100 || raw.rating < 1) return null;
        return raw;
    }

    const dbCard = getCardByIdFn(raw.id);
    if (!dbCard) return null; // Not in database → fabricated card

    // Reconstruct from DB: prevents stat boosting, rating hacking, quality spoofing
    return {
        id:       dbCard.id,
        name:     dbCard.name,
        role:     dbCard.role,
        team:     dbCard.team,
        year:     dbCard.year,
        rating:   dbCard.rating,
        quality:  dbCard.quality,
        region:   dbCard.region,
        stats:    { ...dbCard.stats },
        // Only preserve user-earned cosmetic/meta flags
        uniqueId: (typeof raw.uniqueId === 'string' && /^[\w\-]{1,72}$/.test(raw.uniqueId))
            ? raw.uniqueId
            : `lur_${dbCard.id}_${Math.random().toString(36).slice(2, 8)}`,
        signature:   raw.signature === true,
        holographic: raw.holographic === true,
        favorite:    raw.favorite === true,
        locked:      raw.locked === true,
    };
}

/**
 * Round-and-clamp, for values published to the career leaderboard.
 *
 * clampNum() above FLOORS. That is right for blue essence but wrong for
 * anything derived from a career attribute: attributes are stored fractionally
 * on purpose, so an OVR computed off 54.5 would publish as 54 and disagree with
 * the 55 the owner sees on their own Profile.
 */
export function clampInt(val, min, max, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/**
 * Make a user-authored string safe to render and safe to store.
 *
 * Strips C0/C1 controls and the bidi overrides (U+202A-202E, U+2066-2069) that
 * let a remote string reorder the text around it, collapses whitespace, and
 * clamps length BY CODE POINT so slicing can never leave a lone surrogate.
 *
 * `player.handle` is the only user-authored string in a career save and the
 * career hydrate() never touches it, so this runs on WRITE as well as on read:
 * sanitising only on read would let a legacy save with an over-long handle be
 * denied by the rules forever, silently.
 */
export function cleanText(s, max) {
    if (typeof s !== 'string') return '';
    let out = '';
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;      // C0 / C1 controls
        if (cp >= 0x202a && cp <= 0x202e) continue;                  // bidi overrides
        if (cp >= 0x2066 && cp <= 0x2069) continue;                  // bidi isolates
        out += ch;
    }
    out = out.replace(/\s+/g, ' ').trim();
    const cap = Math.max(0, Math.floor(Number(max) || 0));
    const cps = Array.from(out);
    return cps.length <= cap ? out : cps.slice(0, cap).join('');
}

/**
 * The JS mirror of validCareerRow() in firestore.rules.
 *
 * Those rules are published BY HAND in the Firebase console — there is no CLI
 * and no firebase.json — so drift between the two is the default state, not a
 * hypothetical. tools/boardCheck.mjs parses the literals out of BOTH files and
 * fails if they disagree.
 *
 * A bound that is too TIGHT fails silently and permanently: the write is
 * denied, the client's catch swallows it, and an honest career simply never
 * appears on the board, for anyone, with no error anywhere. Every ceiling here
 * is a measured careerSmoke figure with wide headroom, and careerSmoke prints
 * the tightest margin per field so a rail creeping toward a real career is
 * visible BEFORE it fires.
 *
 * Sources: ATTR_MIN/ATTR_MAX 1..99 and MMR_MAX 4000 and RETIREMENT_AGE_FORCED
 * 38 (career/constants.js) — the monument ladder's +2600 (career/economy.js) —
 * and measured maxima, from `careerSmoke --seed 42 --careers 12 --years 22`:
 * 966 games, 21,913 earned legacy, 160 trophies, 47 titles, 6 Worlds. Four caps
 * are already touched by a real career — age 38, ovr and peakOVR 99, peakMMR
 * 4000 — and every one of those IS the engine constant, so it cannot be
 * exceeded. Re-measure in careerSmoke before changing any of the rest.
 *
 * This file deliberately has ZERO imports (validateCard takes getCardByIdFn as
 * a parameter for exactly that reason), because boardCheck.mjs parses it as
 * text. Keep the members below literal; anything needing career constants
 * belongs in career/board.js.
 */
export const CAREER_BOUNDS = {
    v:             { min: 1,  max: 9 },
    slot:          { min: 1,  max: 3 },
    age:           { min: 13, max: 38 },
    years:         { min: 1,  max: 26 },
    ovr:           { min: 1,  max: 99 },
    peakOVR:       { min: 1,  max: 99 },
    peakMMR:       { min: 0,  max: 4000 },
    games:         { min: 0,  max: 3000 },
    wins:          { min: 0,  max: 3000 },
    losses:        { min: 0,  max: 3000 },
    earnedScore:   { min: 0,  max: 70000 },
    boughtScore:   { min: 0,  max: 2600 },
    finishedScore: { min: -1, max: 70000 },
    titles:        { min: 0,  max: 200 },
    worlds:        { min: 0,  max: 26 },
    trophies:      { min: 0,  max: 300 },
};

export const CAREER_STR_MAX = {
    handle: 16, displayName: 64, teamId: 32, careerId: 16, blob: 24000,
};

// These must stay identical, IN ORDER, to ROLE_IDS / REGION_IDS in career
// constants and to the `in [...]` lists in firestore.rules — boardCheck asserts
// all three against each other. Adding a region is therefore a TWO-STAGE deploy,
// exactly like adding a row field: re-publish the rules in the Firebase console
// FIRST, then ship the client. Ship it the other way round and every publish
// from a player in the new region is denied and the error swallowed.
export const CAREER_ENUMS = {
    role:   ['TOP', 'JNG', 'MID', 'ADC', 'SUP'],
    region: ['LCK', 'LPL', 'LEC', 'LCS', 'LCP', 'CBLOL'],
};

// hasAll(<these many names>) + keys().size() <= <this> is what makes the rules'
// field set CLOSED. Without the cap a client can staple anything up to the 1MiB
// document limit onto a doc that otherwise validates, and every reader then
// downloads it 50 times on every board load.
export const CAREER_ROW_KEYS = 25;
export const CAREER_DOSSIER_KEYS = 4;

// Maximum realistic values — generous enough for legit play, low enough to flag hacks
export const BOUNDS = {
    be:        { min: 0,   max: 50_000_000 },
    level:     { min: 1,   max: 1000       },
    xp:        { min: 0,   max: 50_000_000 },
    sp:        { min: 0,   max: 500        },
    prestige:  { min: 0,   max: 50         },
    skill:     { min: 0,   max: 20         },
    trophies:  { min: 0,   max: 100_000    },
    totalPower:{ min: 0,   max: 145        }, // ~99 base + max chemistry
};
