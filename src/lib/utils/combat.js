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

// Team synergy: +1 for every PAIR of starters from the same team, max +2. It used to need all
// five from one team for anything at all, which pushed every squad toward a single org; pairs
// reward two duos from different teams just as much, and the cap is unchanged at +2, so no
// squad can reach more Power than it could before — it is only easier to get there.
//
// Legacy/award cards stay wildcards: each one completes a pair with any starter left without a
// teammate, and two leftover wildcards pair with each other. That keeps every squad that scored
// +2 under the old rule (e.g. three from one team + two legacy cards) at +2.
export const TEAM_SYNERGY_MAX = 2;

/** Uncapped number of same-team pairs in the starting five (wildcards included). */
export function teamPairs(starters) {
    const nl = nonLegacy(starters);
    let wild = starters.length - nl.length;
    const byTeam = {};
    for (const c of nl) byTeam[c.team] = (byTeam[c.team] || 0) + 1;
    let pairs = 0, singles = 0;
    for (const n of Object.values(byTeam)) { pairs += Math.floor(n / 2); singles += n % 2; }
    const filled = Math.min(singles, wild);
    pairs += filled;
    wild -= filled;
    pairs += Math.floor(wild / 2);
    return pairs;
}

export function calcTeamChem(starters) {
    return Math.min(TEAM_SYNERGY_MAX, teamPairs(starters));
}

// Legacy-card bonus: +1 for 2-3 legacy cards on the roster, +2 for 4 or more.
export function calcLegacyBonus(starters) {
    const n = starters.filter(c => LEGACY_TIERS.includes(c.quality)).length;
    return n >= 4 ? 2 : n >= 2 ? 1 : 0;
}
