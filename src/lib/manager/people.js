// ===========================================================================
//  ULTIMATE MANAGER -- players
//
//  A player is either REAL (built from their standard card of the year, with
//  `real: true` and the card id kept for the photo) or RANDOM (generated for
//  this save, `real: false`, and labelled "Random player" everywhere it shows).
//
//  Attributes are stored fractionally -- a level-up point lands as a whole
//  number but the past-ceiling factor and age decline move them by fractions,
//  and rounding on write would stall growth. Round at display time only.
// ===========================================================================
import {
    ATTR_KEYS, ATTR_MAX, ATTR_MIN, ROLE_WEIGHTS, PERSONALITIES, PERSONALITY_BY_ID,
    XP_PER_LEVEL, POINTS_PER_LEVEL, PAST_CEILING_FACTOR, REGION_MONEY, WAGE_STEP, WAGE_KNEE, WAGE_TOP_STEP, champsFor,
    HANDLE_WORDS, HANDLE_REGIONAL, HANDLE_SUFFIX, ROLE_IDS,
} from './data.js';
import { clamp, pick, weightedPick, normal, randInt, shuffle, rngFor } from './util.js';

// ---------------------------------------------------------------- ratings
export function weightedOVR(a, role) {
    const w = ROLE_WEIGHTS[role] || ROLE_WEIGHTS.MID;
    let s = 0;
    for (const k of ATTR_KEYS) s += (Number(a && a[k]) || 0) * (w[k] || 0);
    return s;
}

export function ovrOf(p) {
    if (!p) return 0;
    return clamp(Math.round(weightedOVR(p.a, p.role) + (Number(p.adj) || 0)), 1, 99);
}

/** OVR if this player played another role (no off-role penalty included). */
export function ovrAs(p, role) {
    return clamp(Math.round(weightedOVR(p.a, role) + (Number(p.adj) || 0)), 1, 99);
}

export function ageOf(p, year) {
    return Math.max(15, year - (Number(p.born) || year - 20));
}

export function persOf(p) {
    return PERSONALITY_BY_ID[p && p.pers] || PERSONALITY_BY_ID.professional;
}
export function fx(p) {
    return persOf(p).effects || {};
}

/** What a potential reading looks like to this manager: exact once scouted (or
 *  with the full Scouting Network), otherwise a range that narrows with rank. */
export function potentialView(p, { scouted = false, scoutRank = 0 } = {}) {
    const pot = Math.round(p.pot);
    const cur = ovrOf(p);
    if (scouted || scoutRank >= 3) return { lo: pot, hi: pot, exact: true };
    const spread = [6, 4, 2][clamp(scoutRank, 0, 2)];
    // Stable per player, so the range does not jitter between renders.
    const off = (hashName(p.id) % (spread + 1)) - Math.floor(spread / 2);
    const lo = clamp(Math.max(cur, pot - spread + off), 1, 99);
    const hi = clamp(Math.max(lo, pot + spread + off), 1, 99);
    return { lo, hi, exact: false };
}

function hashName(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    return h;
}

// ---------------------------------------------------------------- money
/** How a wage grows with OVR (1 at 60): steep to WAGE_KNEE, gentler above it. */
export function wageCurve(ovr) {
    return ovr <= WAGE_KNEE
        ? Math.pow(WAGE_STEP, ovr - 60)
        : Math.pow(WAGE_STEP, WAGE_KNEE - 60) * Math.pow(WAGE_TOP_STEP, ovr - WAGE_KNEE);
}

/** Yearly wage a player asks for, before negotiation. */
export function wageDemand(p, year, region, { renewal = false } = {}) {
    const ovr = ovrOf(p);
    const age = ageOf(p, year);
    let w = 22000 * wageCurve(ovr);
    w *= REGION_MONEY[region] || 1;
    if (age <= 19) w *= 0.8;
    const e = fx(p);
    if (e.wageMult) w *= e.wageMult;
    if (renewal && e.renewMult) w *= e.renewMult;
    return Math.round(w / 1000) * 1000;
}

/** Transfer value: what a club wants for a player under contract. */
export function marketValue(p, year) {
    const ovr = ovrOf(p);
    const age = ageOf(p, year);
    let v = 50000 * Math.pow(1.13, ovr - 60);
    const room = Math.max(0, p.pot - ovr);
    if (age <= 21) v *= 1 + room * 0.045;
    else if (age <= 24) v *= 1 + room * 0.02;
    if (age >= 28) v *= Math.max(0.35, 1 - (age - 27) * 0.12);
    return Math.max(10000, Math.round(v / 5000) * 5000);
}

// ---------------------------------------------------------------- champions
export function pickFavs(rng, role, year, n = 3) {
    const pool = champsFor(role, year);
    return shuffle(rng, pool).slice(0, n).map(c => c.id);
}

/** The wider pool: champions a player is comfortable on beyond his three
 *  signatures. Worth less than a signature, and what a fearless series runs on. */
export const POOL_SIZE = 4;
export function pickPool(rng, role, year, favs, n = POOL_SIZE) {
    const pool = champsFor(role, year).filter(c => !(favs || []).includes(c.id));
    return shuffle(rng, pool).slice(0, n).map(c => c.id);
}

/** A pool for a player saved before pools existed: stable per player, so it does
 *  not change between loads. */
export function ensurePool(p, year) {
    if (Array.isArray(p.pool) && p.pool.length) return;
    p.pool = pickPool(rngFor('pool:' + p.id), p.role, year, p.favs);
}

// ---------------------------------------------------------------- construction
export function pickPersonality(rng) {
    return weightedPick(rng, PERSONALITIES).id;
}

/** A real player, from one standard card (stats + rating) of the person. */
export function makeRealPlayer(person, card, year, rng) {
    const role = card.role;
    const a = {};
    for (const k of ATTR_KEYS) a[k] = clamp(Number(card.stats && card.stats[k]) || 60, ATTR_MIN, ATTR_MAX);
    const adj = clamp(card.rating - weightedOVR(a, role), -4, 4);
    const pot = clamp(Math.max(person.peak, card.rating) + randInt(rng, 0, 2), card.rating, 99);
    const roles = [...new Set(person.cards.map(c => c.role))];
    const born = person.born;
    const favs = pickFavs(rng, role, year);
    return {
        id: person.key,
        name: card.name,
        real: true,
        cid: card.id,
        role,
        roles: roles.includes(role) ? roles : [role, ...roles],
        nat: person.nat,
        flag: person.flag,
        born: Math.min(born, year - 17),
        a, adj: Math.round(adj * 10) / 10, pot,
        xp: 0, lv: 1 + Math.max(0, Math.floor((card.rating - 60) / 4)),
        focus: 'auto',
        pers: person.pers,
        favs,
        pool: pickPool(rng, role, year, favs),
        recent: [],
        mor: 70, form: 0,
        team: null, wage: 0, until: year,
        firstReal: person.firstYear, lastReal: person.lastYear,
        big: 0, last: [],
        st: blankStats(), car: { g: 0, w: 0, titles: 0 },
        joined: year,
    };
}

/**
 * A random player. `target` is the OVR to build around; `age` defaults to a
 * prospect's. Potential is mostly modest with the occasional real gem -- which
 * is what makes scouting worth anything.
 */
export function makeRandomPlayer({ id, role, region, year, target, age, takenNames }, rng) {
    const r = role || pick(rng, ROLE_IDS);
    const ag = age || randInt(rng, 17, 22);
    const w = ROLE_WEIGHTS[r];
    const a = {};
    for (const k of ATTR_KEYS) {
        // Strong where the role is weighted, weaker elsewhere, plus noise.
        const tilt = (w[k] - 1 / 6) * 30;
        a[k] = clamp(Math.round(target + tilt + normal(rng) * 3.2), ATTR_MIN, ATTR_MAX - 4);
    }
    const ovr = Math.round(weightedOVR(a, r));
    let gap;
    if (ag <= 17) gap = randInt(rng, 6, 22);
    else if (ag <= 19) gap = randInt(rng, 3, 17);
    else if (ag <= 22) gap = randInt(rng, 1, 10);
    else gap = randInt(rng, 0, 4);
    if (ag <= 20 && rng() < 0.05) gap += randInt(rng, 6, 12);       // a wonderkid
    const pot = clamp(ovr + gap, ovr, 97);
    const name = makeHandle(rng, region, takenNames);
    const xp = randInt(rng, 0, 200);
    const pers = pickPersonality(rng);
    const favs = pickFavs(rng, r, year);
    return {
        id,
        name,
        real: false,
        cid: null,
        role: r,
        roles: [r],
        nat: region,
        flag: null,
        born: year - ag,
        a, adj: 0, pot,
        xp, lv: 1 + Math.max(0, Math.floor((ovr - 55) / 4)),
        focus: 'auto',
        pers,
        favs,
        pool: pickPool(rng, r, year, favs),
        recent: [],
        mor: 70, form: 0,
        team: null, wage: 0, until: year,
        firstReal: null, lastReal: null,
        big: 0, last: [],
        st: blankStats(), car: { g: 0, w: 0, titles: 0 },
        joined: year,
    };
}

export function blankStats() {
    return { g: 0, w: 0, k: 0, d: 0, as: 0, rs: 0, mvp: 0 };
}

/** A handle nobody in the card database or this save already uses. */
export function makeHandle(rng, region, taken) {
    const regional = HANDLE_REGIONAL[region] || [];
    for (let i = 0; i < 40; i++) {
        const base = rng() < 0.45 && regional.length ? pick(rng, regional) : pick(rng, HANDLE_WORDS);
        const name = base + pick(rng, HANDLE_SUFFIX);
        const key = name.toLowerCase();
        if (!taken || !taken.has(key)) {
            if (taken) taken.add(key);
            return name;
        }
    }
    const name = pick(rng, HANDLE_WORDS) + randInt(rng, 100, 999);
    if (taken) taken.add(name.toLowerCase());
    return name;
}

// ---------------------------------------------------------------- the level system
/** Which attribute a level-up point goes into. */
export function focusAttr(p) {
    if (p.focus && p.focus !== 'auto' && ATTR_KEYS.includes(p.focus)) return p.focus;
    // Auto: the most important attribute for the role that is furthest behind
    // the player's own OVR, so points fill gaps that actually cost rating.
    const w = ROLE_WEIGHTS[p.role] || ROLE_WEIGHTS.MID;
    const e = fx(p);
    let best = null, bestScore = -Infinity;
    for (const k of ATTR_KEYS) {
        let score = w[k] * 10 + (ovrOf(p) - (p.a[k] || 0)) * 0.35;
        if (e.focusBias === k) score += 1.2;
        if ((p.a[k] || 0) >= ATTR_MAX) score = -Infinity;
        if (score > bestScore) { bestScore = score; best = k; }
    }
    return best || 'mec';
}

/** One attribute point. Full value below potential, a quarter past it. */
export function applyPoint(p, key) {
    const k = ATTR_KEYS.includes(key) ? key : focusAttr(p);
    const atCeiling = ovrOf(p) >= p.pot;
    const gain = atCeiling ? PAST_CEILING_FACTOR : 1;
    p.a[k] = clamp((p.a[k] || 0) + gain, ATTR_MIN, ATTR_MAX);
    return { key: k, gain };
}

/** Add XP; every XP_PER_LEVEL is a level and POINTS_PER_LEVEL points, spent on
 *  the player's focus. Returns how many levels were gained. */
export function grantXP(p, amount) {
    const n = Math.max(0, Math.round(amount));
    if (!n) return 0;
    p.xp = (Number(p.xp) || 0) + n;
    p.xpy = (Number(p.xpy) || 0) + n;     // this season's XP, for the development screen
    let levels = 0;
    while (p.xp >= XP_PER_LEVEL) {
        p.xp -= XP_PER_LEVEL;
        p.lv = (Number(p.lv) || 1) + 1;
        levels++;
        for (let i = 0; i < POINTS_PER_LEVEL; i++) applyPoint(p, focusAttr(p));
    }
    return levels;
}

/** The multiplier on every XP grant: age, personality, the coach and the perk. */
export function xpMultiplier(p, year, { coach = 0, developer = 0 } = {}) {
    // Teenagers grow fast, players in their mid-twenties have mostly become who
    // they are. A starter earns ~1,700 XP a year at 1.0x, which is ~11 points:
    // about +3 OVR at 18, +1 at 22, almost nothing past 25.
    const age = ageOf(p, year);
    let m = age <= 19 ? 1.3 : age <= 21 ? 0.85 : age <= 23 ? 0.45 : age <= 25 ? 0.25 : age <= 27 ? 0.12 : 0.06;
    const e = fx(p);
    if (e.xpMult) m *= e.xpMult;
    if (e.youngXpMult && age <= 21) m *= e.youngXpMult;
    m *= 1 + clamp(coach, 0, 99) / 400;
    m *= 1 + developer * 0.1;
    return m;
}

// ---------------------------------------------------------------- the offseason
/** One year older: decline from 25, faster from 29, hands first. */
export function ageDecline(p, year, rng) {
    const age = ageOf(p, year);
    if (age < 25) return 0;
    const e = fx(p);
    const base = age >= 31 ? 2.2 : age >= 29 ? 1.5 : age >= 27 ? 1.0 : 0.5;
    const mult = (e.declineMult || 1) * (0.7 + rng() * 0.6);
    const weights = { mec: 1.4, frm: 1.0, tmf: 0.9, cmp: 0.5, map: 0.3, ldr: 0.1 };
    let lost = 0;
    for (const k of ATTR_KEYS) {
        const d = base * mult * weights[k];
        p.a[k] = clamp((p.a[k] || 0) - d, ATTR_MIN, ATTR_MAX);
        lost += d;
    }
    // A ceiling is not a promise: once a player is past their best, it comes down too.
    if (age >= 28) p.pot = Math.max(ovrOf(p), p.pot - Math.round(base));
    return lost;
}

/**
 * Whether a player retires this offseason. Real careers are protected while the
 * card database says the player still played: a pro with a card next year does
 * not retire this year (short of 34), which keeps the history recognisable.
 */
export function retiresNow(p, year, rng, hasCardAfter) {
    const age = ageOf(p, year);
    if (p.real && hasCardAfter && age < 34) return false;
    if (age < 24) return false;
    const ovr = ovrOf(p);
    let chance = age >= 33 ? 0.6 : age >= 30 ? 0.3 : age >= 27 ? 0.12 : 0.04;
    if (ovr >= 88) chance *= 0.5;
    if (ovr < 68) chance *= 1.8;
    if (!p.team) chance *= 1.6;
    return rng() < clamp(chance, 0, 0.95);
}

/**
 * History pulls a real player toward his real card of the year, if he has one:
 * hard at an AI club (the world follows what really happened), gently at the
 * manager's (your training still shows). Returns true when a card applied.
 */
export function anchorToCard(p, card, strength) {
    if (!card || !card.stats || !(strength > 0)) return false;
    for (const k of ATTR_KEYS) {
        const target = clamp(Number(card.stats[k]) || p.a[k], ATTR_MIN, ATTR_MAX);
        p.a[k] = clamp(p.a[k] + (target - p.a[k]) * strength, ATTR_MIN, ATTR_MAX);
    }
    const adjTarget = clamp(card.rating - weightedOVR(card.stats, card.role), -4, 4);
    p.adj = Math.round(((Number(p.adj) || 0) + (adjTarget - (Number(p.adj) || 0)) * strength) * 10) / 10;
    if (!p.roles.includes(card.role)) p.roles = [...p.roles, card.role];
    p.cid = card.id;
    p.pot = Math.max(p.pot, ovrOf(p));
    return true;
}

/** Recent form, -3..3, from the last three series ratings. */
export function formFrom(last) {
    if (!Array.isArray(last) || !last.length) return 0;
    const avg = last.reduce((s, x) => s + x, 0) / last.length;
    return clamp(Math.round((avg - 6.4) * 2), -3, 3);
}
