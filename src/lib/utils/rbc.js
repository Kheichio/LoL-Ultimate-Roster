// Roster Building Challenges (RBCs) — SBC-inspired daily puzzles.
// You submit a set of players that meet a challenge's requirements; the cards are
// consumed and you receive a free 5-card reward pack. Harder challenges (more
// investment) grant a better reward pack. Challenges reset once per calendar day.
import { getEra, getEffectiveRating, LEGACY_TIERS, AWARD_TIERS } from './cards.js';

// Legacy + award tiers count as "special" for the Hall of Legends requirement.
export const SPECIAL_SET = new Set([...LEGACY_TIERS, ...AWARD_TIERS]);

// Reward packs — each grants 5 cards. Slightly juicier top-end than the Store packs
// of the same name, because you paid for them in cards. Sums per pack = 100.
export const REWARD_PACKS = {
    premium:    { label: 'Premium',     color: '#3b82f6', top: 'Diamond',
        drops: [{ tier: 'Diamond', pct: 4 }, { tier: 'Platinum', pct: 16 }, { tier: 'Gold', pct: 35 }, { tier: 'Silver', pct: 25 }, { tier: 'Bronze', pct: 20 }] },
    elite:      { label: 'Elite',       color: '#a855f7', top: 'Master',
        drops: [{ tier: 'Master', pct: 6 }, { tier: 'Diamond', pct: 22 }, { tier: 'Platinum', pct: 32 }, { tier: 'Gold', pct: 25 }, { tier: 'Silver', pct: 15 }] },
    firststand: { label: 'First Stand', color: '#fb923c', top: 'FirstStand',
        drops: [{ tier: 'FirstStand', pct: 1.5 }, { tier: 'Challenger', pct: 2 }, { tier: 'Grandmaster', pct: 4 }, { tier: 'Master', pct: 8 }, { tier: 'Diamond', pct: 20 }, { tier: 'Platinum', pct: 29.5 }, { tier: 'Gold', pct: 35 }] },
    msi:        { label: 'MSI',         color: '#2dd4bf', top: 'MSI',
        drops: [{ tier: 'MSI', pct: 1.5 }, { tier: 'Challenger', pct: 2 }, { tier: 'Grandmaster', pct: 4 }, { tier: 'Master', pct: 8 }, { tier: 'Diamond', pct: 20 }, { tier: 'Platinum', pct: 29.5 }, { tier: 'Gold', pct: 35 }] },
    ewc:        { label: 'EWC',         color: '#ffd24a', top: 'EWC',
        drops: [{ tier: 'EWC', pct: 1.5 }, { tier: 'Challenger', pct: 2 }, { tier: 'Grandmaster', pct: 4 }, { tier: 'Master', pct: 8 }, { tier: 'Diamond', pct: 20 }, { tier: 'Platinum', pct: 29.5 }, { tier: 'Gold', pct: 35 }] },
};

// The daily challenge catalog. Requirements scale with difficulty, and so does the
// reward pack. Every challenge asks for exactly 5 players.
export const CHALLENGES = [
    { id: 'rbc_warmup',  name: 'Warm-Up',        difficulty: 1, color: '#4ade80', icon: '🌱',
      blurb: 'Any five decent players.',
      req: { count: 5, minAvg: 78 },
      reward: { pack: 'premium', count: 5 } },
    { id: 'rbc_region',  name: 'Regional Pride', difficulty: 2, color: '#60a5fa', icon: '🌍',
      blurb: 'Five from a single region.',
      req: { count: 5, minAvg: 84, sameRegion: true },
      reward: { pack: 'elite', count: 5 } },
    { id: 'rbc_era',     name: 'Era Dynasty',    difficulty: 3, color: '#fb923c', icon: '⏳',
      blurb: 'Five from a single era.',
      req: { count: 5, minAvg: 87, sameEra: true },
      reward: { pack: 'firststand', count: 5 } },
    { id: 'rbc_team',    name: 'Hometown Heroes', difficulty: 4, color: '#2dd4bf', icon: '🏠',
      blurb: 'Five from one team.',
      req: { count: 5, minAvg: 88, sameTeam: true },
      reward: { pack: 'msi', count: 5 } },
    { id: 'rbc_legends', name: 'Hall of Legends', difficulty: 5, color: '#ffd24a', icon: '👑',
      blurb: 'Elite five with real pedigree.',
      req: { count: 5, minAvg: 90, minSpecial: 2 },
      reward: { pack: 'ewc', count: 5 } },
];

// Local calendar-day key. Challenges reset when this changes (matches Daily Login).
export function todayKey(now) {
    const d = new Date(now);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Milliseconds until the next local midnight (the reset boundary).
export function msUntilReset(now) {
    const d = new Date(now);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - now;
}

// Which challenges are claimed for `today`. Any other day → nothing claimed (reset).
export function claimedToday(rbcState, today) {
    return rbcState && rbcState.day === today ? (rbcState.claimed || {}) : {};
}

// Human-readable requirement chips for a challenge (for the UI).
export function requirementChips(challenge) {
    const r = challenge.req;
    const chips = [`${r.count} players`];
    if (r.minAvg) chips.push(`Avg rating ≥ ${r.minAvg}`);
    if (r.sameRegion) chips.push('Same region');
    if (r.sameEra) chips.push('Same era');
    if (r.sameTeam) chips.push('Same team');
    if (r.minSpecial) chips.push(`${r.minSpecial}+ Legacy/Award cards`);
    return chips;
}

// Validate a submission (an array of exactly req.count card objects, some may be null
// while the player is still filling slots). Returns { valid, avg, checks:[{label,ok}] }.
export function validateSubmission(challenge, cards) {
    const r = challenge.req;
    const filled = cards.filter(Boolean);
    const complete = filled.length === r.count;
    const avg = filled.length ? Math.round(filled.reduce((s, c) => s + getEffectiveRating(c), 0) / filled.length) : 0;

    const checks = [];
    checks.push({ label: `${r.count} players submitted`, ok: complete });
    if (r.minAvg) checks.push({ label: `Average rating ≥ ${r.minAvg} (${avg})`, ok: complete && avg >= r.minAvg });
    if (r.sameRegion) checks.push({ label: 'All from the same region', ok: complete && new Set(filled.map(c => c.region)).size === 1 });
    if (r.sameEra) checks.push({ label: 'All from the same era', ok: complete && new Set(filled.map(c => getEra(c.year))).size === 1 });
    if (r.sameTeam) checks.push({ label: 'All from the same team', ok: complete && new Set(filled.map(c => c.team)).size === 1 });
    if (r.minSpecial) {
        const n = filled.filter(c => SPECIAL_SET.has(c.quality)).length;
        checks.push({ label: `${r.minSpecial}+ Legacy/Award cards (${n})`, ok: n >= r.minSpecial });
    }

    return { valid: complete && checks.every(c => c.ok), avg, checks };
}
