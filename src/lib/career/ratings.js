// ═══════════════════════════════════════════════════════════════════════════
//  LoL ULTIMATE CAREER — rating & progression maths
// ═══════════════════════════════════════════════════════════════════════════
//  Every number that turns raw attributes into something the player sees —
//  overall rating, tier, wage, market value, solo queue rank — is derived here.
//  Pure functions only: nothing in this file reads or writes a store.

import {
    ATTR_KEYS, ATTR_MAX, ATTR_MIN, ROLE_BY_ID, REGION_BY_ID, PLAYSTYLE_BY_ID,
    CHAMPION_BY_ID, PATH_BY_ID, AGE_TRADE, AGE_CURVE, RANK_TIERS, MMR_MAX,
    CLUB_TIERS, UNSIGNED_SOFT_CAP, SQUAD_STATUS,
    TRAITS, TRAIT_BY_ID, ROLE_KEY_ATTR_WEIGHT,
} from './constants.js';
import { ratingToQuality, TIER_COLORS } from '../utils/cards.js';

// ─────────────────────────────────────────────────────────────────────────
//  SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────
export function clamp(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

export function clampAttr(n) {
    return Math.round(clamp(n, ATTR_MIN, ATTR_MAX));
}

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Roughly-normal roll in [-1, 1] — three uniforms averaged. Keeps random
 *  rolls clustered around the middle instead of uniformly spraying. */
export function bell() {
    return ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2;
}

export function emptyAttrs(fill = 0) {
    const o = {};
    for (const k of ATTR_KEYS) o[k] = fill;
    return o;
}

/** Merge a partial `{mec: 3, tmf: -1}` modifier object onto a full attr set. */
export function applyMods(attrs, mods) {
    const out = { ...attrs };
    if (!mods) return out;
    for (const k of ATTR_KEYS) {
        if (typeof mods[k] === 'number') out[k] = (out[k] || 0) + mods[k];
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  OVERALL RATING
// ─────────────────────────────────────────────────────────────────────────
/** Role-weighted overall. Returns an integer on the same 1-99 scale the card
 *  database uses, so a career player can be compared to any roster card. */
export function calcOVR(attrs, roleId) {
    const role = ROLE_BY_ID[roleId];
    if (!attrs || !role) return 0;
    let sum = 0;
    for (const k of ATTR_KEYS) sum += (attrs[k] || 0) * (role.weights[k] || 0);
    return clampAttr(sum);
}

/** What this player becomes if every attribute reaches its ceiling. */
export function calcPotentialOVR(potential, roleId) {
    return calcOVR(potential, roleId);
}

/** Tier label + colour for an overall rating. Reuses the roster tier ladder so
 *  a 94 OVR career player reads as "Master" exactly like a 94 card does. */
export function ovrTier(ovr) {
    const quality = ratingToQuality(Math.round(ovr || 0));
    return { quality, color: TIER_COLORS[quality] || '#94a3b8' };
}

/** Human label for where a player sits in the professional pecking order. */
export function ovrLabel(ovr) {
    const v = Math.round(ovr || 0);
    if (v >= 95) return 'Generational';
    if (v >= 90) return 'World Class';
    if (v >= 85) return 'Elite';
    if (v >= 80) return 'Star Player';
    if (v >= 74) return 'Established Pro';
    if (v >= 68) return 'Squad Player';
    if (v >= 60) return 'Academy Prospect';
    if (v >= 50) return 'Amateur';
    if (v >= 40) return 'Hopeful';
    return 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────
//  AGE CURVE
// ─────────────────────────────────────────────────────────────────────────
export function ageCurveFor(age) {
    const a = Math.round(Number(age) || 18);
    if (a <= AGE_CURVE[0].age) return AGE_CURVE[0];
    const last = AGE_CURVE[AGE_CURVE.length - 1];
    if (a >= last.age) return last;
    return AGE_CURVE.find(e => e.age === a) || last;
}

export function growthFor(age) { return ageCurveFor(age).growth; }
export function decayFor(age)  { return ageCurveFor(age).decay; }

/** A short read on where the player sits on the age curve. */
export function ageBand(age) {
    const a = Math.round(Number(age) || 18);
    if (a <= 15) return { id: 'prospect', name: 'Prospect',  desc: 'Everything is still ahead of you. Gains come fast.' };
    if (a <= 18) return { id: 'rookie',   name: 'Rookie',    desc: 'The window where careers are decided. Train hard.' };
    if (a <= 21) return { id: 'rising',   name: 'Rising',    desc: 'Still improving quickly, and now good enough to matter.' };
    if (a <= 24) return { id: 'prime',    name: 'Prime',     desc: 'Peak years. Growth slows, results are everything.' };
    if (a <= 27) return { id: 'veteran',  name: 'Veteran',   desc: 'Reactions dull, reads sharpen. Lean on knowledge.' };
    return { id: 'twilight', name: 'Twilight', desc: 'Every split could be the last. Play for the legacy.' };
}

// ─────────────────────────────────────────────────────────────────────────
//  TRAINING GAIN CURVE
//  Shared by training.js, solo queue, scrims and match experience so all of
//  them respect the same ceiling.
// ─────────────────────────────────────────────────────────────────────────
/**
 * Diminishing-returns multiplier for raising one attribute.
 *   current  — the attribute's value right now
 *   ceiling  — the player's hidden potential for that attribute
 *   softCap  — an environment cap (e.g. UNSIGNED_SOFT_CAP while unsigned)
 * Returns a multiplier in [0, 1]: full value while there is headroom, choked
 * to almost nothing as the attribute approaches its ceiling.
 */
export function gainCurve(current, ceiling, softCap = ATTR_MAX) {
    const cur = clamp(current, 0, ATTR_MAX);
    const cap = clamp(Math.min(ceiling, ATTR_MAX), 1, ATTR_MAX);

    // Above the environment soft cap you can still improve, but barely.
    let envMult = 1;
    if (cur >= softCap) envMult = 0.15;
    else if (cur >= softCap - 5) envMult = 0.55;

    const room = cap - cur;
    if (room <= 0) return 0;
    if (room >= 22) return 1 * envMult;
    // Smooth ease-out over the last 22 points of headroom. The exponent was
    // 1.35, which made the final five points cost roughly twenty times what the
    // first ones did and left a fifth of all paid drill sessions returning
    // +0.00. 1.15 keeps the shape — approaching your ceiling still slows down
    // hard — while leaving something on the table for the session you paid for.
    return (room / 22) ** 1.15 * envMult;
}

/** The highest an attribute can go for this player right now.
 *
 *  This reads player.potential and nothing else, on purpose. Everything that
 *  raises the roof — genetic traits, the Evergreen perk, a breakthrough season,
 *  a performance camp — writes into player.potential rather than sitting beside
 *  it as a derived bonus, so there is exactly one number that means "ceiling"
 *  and training, the UI, wages and market value can never disagree about it. */
export function attrCeiling(player, key) {
    const pot = player?.potential?.[key] ?? ATTR_MAX;
    return clamp(pot, ATTR_MIN, ATTR_MAX);
}

/** Environment cap: unsigned players stall out at UNSIGNED_SOFT_CAP.
 *  `player.softCap` is written when the Self-Made perk is bought, which is what
 *  that perk always claimed to do and never did. */
export function environmentCap(player) {
    if (!player) return ATTR_MAX;
    if (player.clubId) return ATTR_MAX;
    const own = Number(player.softCap);
    return clamp(Number.isFinite(own) && own > 0 ? own : UNSIGNED_SOFT_CAP, ATTR_MIN, ATTR_MAX);
}

// ─────────────────────────────────────────────────────────────────────────
//  GENETIC TRAITS
//  Rolled once, on the birthday named by the path's revealAge. The potential
//  bonus is baked into player.potential at that moment (see engine.revealTrait);
//  the multipliers below are read live, every time they matter.
// ─────────────────────────────────────────────────────────────────────────

/** Weighted random trait. Legendary is a bit over one career in a hundred. */
export function rollTrait() {
    let total = 0;
    for (const t of TRAITS) total += Math.max(0.01, Number(t.weight) || 1);
    let roll = Math.random() * total;
    for (const t of TRAITS) {
        roll -= Math.max(0.01, Number(t.weight) || 1);
        if (roll <= 0) return t;
    }
    return TRAITS[TRAITS.length - 1];
}

/** The per-attribute potential a trait is worth to this role. */
export function traitPotentialBonus(traitId, roleId) {
    const trait = TRAIT_BY_ID[traitId];
    const out = emptyAttrs(0);
    if (!trait) return out;
    const fx = trait.effects || {};
    const role = ROLE_BY_ID[roleId];
    const flat = Number(fx.pot) || 0;
    const roleBonus = Number(fx.potRole) || 0;
    for (const k of ATTR_KEYS) {
        let v = flat;
        if (roleBonus && role && (role.weights[k] || 0) >= ROLE_KEY_ATTR_WEIGHT) v += roleBonus;
        if (fx.potKeys && typeof fx.potKeys[k] === 'number') v += fx.potKeys[k];
        out[k] = v;
    }
    return out;
}

/**
 * Live multipliers from whatever traits a player carries. Aggregated the same
 * way perkEffects() aggregates perks, so the two stack multiplicatively rather
 * than fighting over one slot.
 */
export function traitEffects(player) {
    const out = { trainMult: 1, decayMult: 1 };
    const ids = Array.isArray(player?.traits) ? player.traits : [];
    const age = Number(player?.age);
    for (const id of ids) {
        const fx = TRAIT_BY_ID[id]?.effects;
        if (!fx) continue;
        if (Number.isFinite(fx.trainMult)) out.trainMult *= fx.trainMult;
        if (Number.isFinite(fx.decayMult)) out.decayMult *= fx.decayMult;
        // A penalty that expires: Late Bloomer trains slowly until it does not.
        if (Number.isFinite(fx.earlyTrainMult) && Number.isFinite(fx.earlyUntilAge)) {
            if (Number.isFinite(age) && age < fx.earlyUntilAge) out.trainMult *= fx.earlyTrainMult;
        }
    }
    return out;
}

/** The traits a player carries, as full definitions, unknown ids dropped. */
export function traitsOf(player) {
    const ids = Array.isArray(player?.traits) ? player.traits : [];
    return ids.map(id => TRAIT_BY_ID[id]).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────
//  CONDITION LABELS
// ─────────────────────────────────────────────────────────────────────────
function band(value, table) {
    const v = clamp(value, 0, 100);
    for (const row of table) if (v >= row.min) return row;
    return table[table.length - 1];
}

export function formLabel(form) {
    return band(form, [
        { min: 90, name: 'Unstoppable', color: '#eab308' },
        { min: 75, name: 'Red Hot',     color: '#f97316' },
        { min: 60, name: 'Good',        color: '#22c55e' },
        { min: 42, name: 'Steady',      color: '#3b82f6' },
        { min: 28, name: 'Shaky',       color: '#f59e0b' },
        { min: 12, name: 'Poor',        color: '#ef4444' },
        { min: 0,  name: 'Crisis',      color: '#dc2626' },
    ]);
}

export function moraleLabel(morale) {
    return band(morale, [
        { min: 88, name: 'Loving It',    color: '#22c55e' },
        { min: 70, name: 'Happy',        color: '#4ade80' },
        { min: 52, name: 'Content',      color: '#3b82f6' },
        { min: 34, name: 'Restless',     color: '#f59e0b' },
        { min: 18, name: 'Unhappy',      color: '#f97316' },
        { min: 0,  name: 'Wants Out',    color: '#ef4444' },
    ]);
}

export function energyLabel(energy) {
    return band(energy, [
        { min: 80, name: 'Fresh',    color: '#22c55e' },
        { min: 55, name: 'Fine',     color: '#3b82f6' },
        { min: 35, name: 'Tired',    color: '#f59e0b' },
        { min: 18, name: 'Drained',  color: '#f97316' },
        { min: 0,  name: 'Burnt Out', color: '#ef4444' },
    ]);
}

export function healthLabel(health) {
    return band(health, [
        { min: 88, name: 'Healthy',     color: '#22c55e' },
        { min: 68, name: 'Niggles',     color: '#3b82f6' },
        { min: 45, name: 'Sore Wrists', color: '#f59e0b' },
        { min: 22, name: 'Injured',     color: '#f97316' },
        { min: 0,  name: 'Serious Injury', color: '#ef4444' },
    ]);
}

// ─────────────────────────────────────────────────────────────────────────
//  SOLO QUEUE RANK
// ─────────────────────────────────────────────────────────────────────────
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/** Turn a raw MMR number into a displayable rank. */
export function rankFromMMR(mmr) {
    const v = clamp(mmr, 0, MMR_MAX);
    let idx = 0;
    for (let i = 0; i < RANK_TIERS.length; i++) {
        if (v >= RANK_TIERS[i].floorMMR) idx = i;
    }
    const tier = RANK_TIERS[idx];
    const nextFloor = idx + 1 < RANK_TIERS.length ? RANK_TIERS[idx + 1].floorMMR : MMR_MAX;
    const span = Math.max(1, nextFloor - tier.floorMMR);
    const into = clamp(v - tier.floorMMR, 0, span);
    const progress = into / span;

    let division = 0;
    let label = tier.name;
    if (tier.divisions > 1) {
        // IV at the bottom of the tier, I at the top.
        division = clamp(tier.divisions - Math.floor(progress * tier.divisions), 1, tier.divisions);
        label = `${tier.name} ${ROMAN[division] || division}`;
    }

    // LP is cosmetic: how far through the current division you are.
    const divSpan = span / tier.divisions;
    const lp = tier.divisions > 1
        ? Math.round(((into % divSpan) / divSpan) * 100)
        : Math.round(into);

    return { tierId: tier.id, tierName: tier.name, color: tier.color, division, label, lp, progress, mmr: v };
}

/** Minimum MMR a scout expects before they take a prospect seriously. */
export const SCOUT_MMR_GATE = 2400; // Diamond IV

// ─────────────────────────────────────────────────────────────────────────
//  MONEY
// ─────────────────────────────────────────────────────────────────────────
export function fmtGold(n) {
    const v = Math.round(Number(n) || 0);
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + 'M';
    if (Math.abs(v) >= 10_000)    return Math.round(v / 1000) + 'k';
    return v.toLocaleString();
}

export function fmtFollowers(n) {
    const v = Math.round(Number(n) || 0);
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(v >= 10_000 ? 0 : 1) + 'k';
    return String(v);
}

/**
 * Weekly wage a club would pay. Steeply convex in OVR — the difference between
 * an 80 and a 90 is far more than the difference between a 60 and a 70.
 */
export function weeklySalaryFor({ ovr, clubTier = 1, region = 'LEC', age = 18, status = 'starter', potentialOVR = 0 }) {
    const base = Math.max(40, Math.pow(Math.max(0, ovr - 45), 2.1) * 0.9);
    const tierMult = (CLUB_TIERS[clubTier] || CLUB_TIERS[1]).salaryMult;
    const regionMult = (REGION_BY_ID[region] || { salaryMult: 1 }).salaryMult;
    const statusMult = { star: 1.45, starter: 1.00, rotation: 0.72, sub: 0.55, benched: 0.45 }[status] || 1;

    // Young players with a big ceiling get paid on promise, veterans on results.
    const upside = Math.max(0, (potentialOVR || ovr) - ovr);
    const youthMult = age <= 18 ? 1 + Math.min(0.30, upside * 0.012) : age >= 28 ? 0.85 : 1;

    return Math.max(25, Math.round(base * tierMult * regionMult * statusMult * youthMult));
}

/**
 * Rough transfer valuation — what an org would pay to buy this contract out.
 *
 * `valueMult` is the additive premium the Market Darling / Living Legend legacy
 * perks write onto player.valueMult. It arrives as a parameter rather than being
 * looked up because this module is imported BY economy.js: reading the perk
 * table here would be an import cycle. Every caller passes `player.valueMult`.
 */
export function marketValueFor({ ovr, potentialOVR, age, region = 'LEC', hype = 0, valueMult = 0 }) {
    const wage = weeklySalaryFor({ ovr, clubTier: 1, region, age, potentialOVR });
    const yearly = wage * 40;
    const upside = Math.max(0, (potentialOVR || ovr) - ovr);
    const ageMult = age <= 17 ? 2.4 : age <= 20 ? 2.0 : age <= 23 ? 1.6 : age <= 26 ? 1.1 : age <= 29 ? 0.6 : 0.25;
    const hypeMult = 1 + Math.min(0.6, (hype || 0) / 900_000);
    const premium = 1 + clamp(Number(valueMult) || 0, 0, 5);
    return Math.round(yearly * ageMult * hypeMult * (1 + upside * 0.02) * premium);
}

// ─────────────────────────────────────────────────────────────────────────
//  CARD COMPATIBILITY
//  Career players render through the existing <Card> component, so they need a
//  card-shaped object. The eight career attributes fold into the six card
//  stats: CHP and KNW have no slot of their own, so they blend with live form
//  into `frm`, which is exactly what that stat means on a roster card.
// ─────────────────────────────────────────────────────────────────────────
export function toCardStats(player) {
    const a = player?.attrs || emptyAttrs(50);
    const form = clamp(player?.form ?? 50, 0, 100);
    return {
        mec: clampAttr(a.mec),
        tmf: clampAttr(a.tmf),
        frm: clampAttr(((a.chp + a.knw) / 2) * 0.55 + form * 0.45),
        cmp: clampAttr(a.cmp),
        map: clampAttr(a.map),
        ldr: clampAttr(a.ldr),
    };
}

/**
 * Build a <Card>-compatible object for the career player.
 * The id is a negative number so it can never collide with — or be mistaken
 * for — a real database card by validateCard().
 */
export function toCareerCard(player, teamName = 'Free Agent', year = 2026) {
    const ovr = calcOVR(player.attrs, player.role);
    return {
        id: -1,
        uniqueId: 'career_self',
        name: player.handle || 'Rookie',
        role: player.role,
        team: teamName,
        year,
        rating: ovr,
        quality: ratingToQuality(ovr),
        region: player.region,
        stats: toCardStats(player),
        signature: false,
        holographic: false,
        locked: true,
    };
}

// ─────────────────────────────────────────────────────────────────────────
//  PLAYER CREATION
//  Rolls the starting attribute set and the hidden potential ceiling from the
//  creation choices. Everything is additive and visible in the creator preview
//  so the player can see exactly what each choice is worth before committing.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Deterministic *preview* of the base attributes for a set of choices — no
 * randomness, so the creation screen can show live numbers that do not jitter
 * every time a radio button changes.
 */
export function previewAttrs({ pathId, age, regionId, roleId, playstyleId, championId }) {
    const path = PATH_BY_ID[pathId] || PATH_BY_ID.precomp;
    const region = REGION_BY_ID[regionId] || REGION_BY_ID.LEC;
    const style = PLAYSTYLE_BY_ID[playstyleId];
    const champ = CHAMPION_BY_ID[championId];

    const minAge = path.ages[0];
    const yearsOlder = clamp((age || minAge) - minAge, 0, 4);

    let attrs = emptyAttrs(path.baseAttr + yearsOlder * AGE_TRADE.attrPerYear);
    attrs = applyMods(attrs, region.mods);
    if (style) attrs = applyMods(attrs, style.mods);
    if (champ) attrs = applyMods(attrs, champ.mods);

    for (const k of ATTR_KEYS) attrs[k] = clampAttr(attrs[k]);
    return attrs;
}

/** Deterministic preview of the potential ceiling for the same choices. */
export function previewPotential({ pathId, age, roleId }) {
    const path = PATH_BY_ID[pathId] || PATH_BY_ID.precomp;
    const minAge = path.ages[0];
    const yearsOlder = clamp((age || minAge) - minAge, 0, 4);
    const mean = path.potentialBase + path.potentialBonus + yearsOlder * AGE_TRADE.potentialPerYear;
    const out = emptyAttrs(clampAttr(mean));
    return out;
}

/**
 * Roll the real player. Same shape as previewAttrs(), plus per-attribute
 * variance and a hidden potential ceiling that is always at least a little
 * above the current value so nobody starts already maxed out.
 */
export function rollNewPlayer({ handle, pathId, age, regionId, roleId, playstyleId, championId }) {
    const path = PATH_BY_ID[pathId] || PATH_BY_ID.precomp;
    const role = ROLE_BY_ID[roleId] || ROLE_BY_ID.MID;

    const baseAttrs = previewAttrs({ pathId, age, regionId, roleId, playstyleId, championId });
    const attrs = {};
    for (const k of ATTR_KEYS) {
        attrs[k] = clampAttr(baseAttrs[k] + bell() * path.spread);
    }

    const potMean = previewPotential({ pathId, age, roleId }).mec;
    const potential = {};
    for (const k of ATTR_KEYS) {
        // Weighted toward the role's key attributes: a support's map awareness
        // ceiling should be higher than their mechanics ceiling.
        const weight = role.weights[k] || 0;
        const roleBonus = (weight - 0.125) * 42;   // ~+4 on a 0.22 weight, ~-4 on a 0.02 weight
        const rolled = potMean + roleBonus + bell() * path.potentialSpread;
        // The floor was +4, which on the oldest Academy Debut start bound on
        // nearly every attribute and left the whole career about four rating
        // points of growth in it. +7 keeps a late start meaningfully worse than
        // an early one without making it a career that ends before it begins.
        potential[k] = clampAttr(Math.max(attrs[k] + 7, rolled));
    }

    return { attrs, potential };
}

/**
 * The age at which this player's genetic trait shows itself.
 *
 * Path-driven — 16 pre-competitive, 18 Academy Debut — but never the age the
 * career started on. A player who begins at 18 on the Academy path would
 * otherwise be handed their trait before they had played a single week, which
 * is exactly the reroll loop the late reveal exists to prevent.
 */
export function revealAgeFor(player) {
    const path = PATH_BY_ID[player?.path] || PATH_BY_ID.precomp;
    const base = Number(path.revealAge) || 16;
    const start = Number(player?.startAge);
    return Math.max(base, (Number.isFinite(start) ? start : base) + 1);
}

// ─────────────────────────────────────────────────────────────────────────
//  SQUAD STATUS HELPERS
// ─────────────────────────────────────────────────────────────────────────
export function statusInfo(id) {
    return SQUAD_STATUS[id] || SQUAD_STATUS.sub;
}

/**
 * Where the player deserves to sit in the roster, given their rating against
 * the team's baseline strength. Clubs use this every week to decide whether
 * you start.
 */
export function deservedStatus(ovr, teamStrength) {
    const diff = ovr - teamStrength;
    if (diff >= 6)  return 'star';
    if (diff >= -2) return 'starter';
    if (diff >= -7) return 'rotation';
    if (diff >= -14) return 'sub';
    return 'benched';
}

// ─────────────────────────────────────────────────────────────────────────
//  FORMATTING
// ─────────────────────────────────────────────────────────────────────────
export function fmtRecord(w, l) { return `${w || 0}-${l || 0}`; }

export function fmtKDA(k, d, a) {
    const kills = k || 0, deaths = d || 0, assists = a || 0;
    const ratio = deaths === 0 ? (kills + assists) : (kills + assists) / deaths;
    return { line: `${kills}/${deaths}/${assists}`, ratio: Math.round(ratio * 100) / 100 };
}

export function ordinal(n) {
    const v = Math.round(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const m = v % 100;
    return v + (s[(m - 20) % 10] || s[m] || s[0]);
}
