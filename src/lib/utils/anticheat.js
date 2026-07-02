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
