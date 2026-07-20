// Shared pack-rolling helpers. Used by the RBC reward packs and the Trade market so
// the "roll N random cards from a weighted tier table" logic lives in ONE place.
// Rolled instances are never holographic/signature — those are pull-time flags only.
import { makeUniqueId, ALL_SPECIAL } from './cards.js';

// Weighted pick of a tier name from a drops array: [{ tier, pct }, ...].
export function rollTier(drops) {
    const total = drops.reduce((s, d) => s + d.pct, 0);
    let r = Math.random() * total;
    for (const d of drops) { r -= d.pct; if (r < 0) return d.tier; }
    return drops[drops.length - 1].tier;
}

// Build the card pool for a tier. The pseudo-tier 'SPECIAL' matches ANY legacy/award
// card (Champion, MVP, Finalist, MSI, FirstStand, EWC, POTY, ...).
export function poolForTier(db, tier, { includeCoach = true } = {}) {
    let pool;
    if (tier === 'SPECIAL') pool = db.filter(p => ALL_SPECIAL.includes(p.quality));
    else pool = db.filter(p => p.quality === tier);
    if (!includeCoach) pool = pool.filter(p => p.role !== 'COACH');
    return pool;
}

// Roll `count` fresh card instances from a drops table. Falls back to commons if a
// tier's pool is somehow empty so a roll never returns nothing.
export function rollCardsFromDrops(db, drops, count, prefix = 'card_', opts = {}) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const tier = rollTier(drops);
        let pool = poolForTier(db, tier, opts);
        if (pool.length === 0) pool = db.filter(p => ['Bronze', 'Silver', 'Gold'].includes(p.quality));
        if (pool.length === 0) continue;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        out.push({ ...pick, uniqueId: makeUniqueId(prefix), signature: false, holographic: false });
    }
    return out;
}
