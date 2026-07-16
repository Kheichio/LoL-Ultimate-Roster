// Shared squad-chemistry helpers, extracted from Tournament / Season / Tower so the
// chemistry rules live in ONE place — a balance tweak is now a single-file change.
// Each is a pure function of the starting five (+ coach). Legacy/award cards are
// treated as "wildcards" and excluded from region/era/team synergy.
import { LEGACY_TIERS, getEra } from './cards.js';

const nonLegacy = (starters) => starters.filter(c => !LEGACY_TIERS.includes(c.quality));

// Coach bonus: +1..+5 scaled by the coach's rating (0 if no coach).
export function calcCoachBonus(coach) {
    if (!coach) return 0;
    const r = coach.rating;
    return r >= 98 ? 5 : r >= 94 ? 4 : r >= 90 ? 3 : r >= 85 ? 2 : 1;
}

// Region synergy: the fewer distinct regions among non-legacy starters, the higher.
export function calcRegionChem(starters) {
    const nl = nonLegacy(starters);
    if (!nl.length) return 5;
    const s = new Set(nl.map(c => c.region)).size;
    return s <= 1 ? 5 : s <= 2 ? 3 : s <= 3 ? 2 : 1;
}

// Era synergy: the fewer distinct eras among non-legacy starters, the higher.
export function calcEraChem(starters) {
    const nl = nonLegacy(starters);
    if (!nl.length) return 5;
    const s = new Set(nl.map(c => getEra(c.year))).size;
    return s <= 1 ? 5 : s <= 2 ? 3 : s <= 3 ? 2 : 1;
}

// Same-team bonus: +2 when every non-legacy starter shares one team.
export function calcTeamChem(starters) {
    const nl = nonLegacy(starters);
    return (!nl.length || new Set(nl.map(c => c.team)).size === 1) ? 2 : 0;
}

// Legacy-card bonus: +1 for 2-3 legacy cards on the roster, +2 for 4 or more.
export function calcLegacyBonus(starters) {
    const n = starters.filter(c => LEGACY_TIERS.includes(c.quality)).length;
    return n >= 4 ? 2 : n >= 2 ? 1 : 0;
}
