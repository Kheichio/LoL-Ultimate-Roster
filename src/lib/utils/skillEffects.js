// The two skills whose effect lives outside a single store value. Kept here, not in the
// screens that apply them, so the Skills page, the Store and the Transfer Market can never
// disagree about what a level buys. Both used to cost Skill Points and do nothing at all:
// Scouting's bonus was printed in the pack preview and never reached the roll, and Trade
// Mastery described trade slots and refresh fees from a trading system that no longer exists.

// ── Scouting Network ──
// +5% (relative) to every tier above a pack's floor per level, paid for out of the floor.
// Relative on purpose: an absolute shift of the roll would turn the Awards Vault's 0.001%
// Hall of Legends into ~1.25% at level 5. Relative, it is 0.00125% — rarer cards come a
// little more often, and the rarest stay rare.
export const SCOUT_STEP = 0.05;

/** `drops` is a pack table ordered rarest first with the floor tier LAST (every table in
 *  Store.svelte is). Returns a new table; the input is never mutated. */
export function applyScouting(drops, level) {
    const lv = Math.max(0, Math.floor(level || 0));
    if (!lv || !Array.isArray(drops) || drops.length < 2) return drops;
    const m = 1 + SCOUT_STEP * lv;
    const last = drops.length - 1;
    const total = drops.reduce((s, d) => s + d.pct, 0);
    const out = drops.map((d, i) => (i === last ? d : { ...d, pct: Number((d.pct * m).toPrecision(4)) }));
    const above = out.slice(0, last).reduce((s, d) => s + d.pct, 0);
    out[last] = { ...drops[last], pct: Number(Math.max(0, total - above).toFixed(3)) };
    return out;
}

// ── Trade Mastery ──
// Lv1 +1 listing · Lv2 −1 card · Lv3 +2 listings · Lv4 −2 cards · Lv5 +3 listings,
// and −5% BE on every signing per level. A signing always costs at least one card.
export const TRADE_BE_STEP = 0.05;

export function tradeMastery(level) {
    const lv = Math.max(0, Math.floor(level || 0));
    return {
        extraListings: Math.ceil(lv / 2),
        cardDiscount: Math.floor(lv / 2),
        beDiscount: TRADE_BE_STEP * lv,
    };
}

/** A listing's price after Trade Mastery. BE rounds to the nearest 10. */
export function tradePrice(cardCost, beCost, level) {
    const t = tradeMastery(level);
    return {
        cardCost: Math.max(1, cardCost - t.cardDiscount),
        beCost: Math.round((beCost * (1 - t.beDiscount)) / 10) * 10,
    };
}
