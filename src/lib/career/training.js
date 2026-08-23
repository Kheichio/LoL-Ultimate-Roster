// ===========================================================================
//  LoL ULTIMATE CAREER -- training & drills
// ===========================================================================
//  This is the only place a career player permanently gets better on purpose.
//  A drill is one exercise for one attribute at one difficulty; the minigame
//  that owns that attribute (ATTRS[i].game) hands back a normalised score in
//  [0, 1] and everything below turns that score into attribute points.
//
//  Two layers on purpose:
//    runDrill()      -- pure maths, safe to call from a preview or a tooltip
//    completeDrill() -- the same maths, then writes the store exactly once
//
//  Balance intent for the whole file: a dedicated 16-year-old on the Academy
//  Debut path, training ~2 sessions a week with an average score, should need
//  roughly three in-game years (120 weeks) to walk 57 OVR up to about 80. The
//  numbers below are tuned against that walk -- see the note on baseGain.

import {
    ATTRS, ATTR_BY_KEY, ATTR_KEYS, ATTR_MAX,
    CLUB_TIERS, CLUB_TRAINING_SLOTS, UNSIGNED_SOFT_CAP,
    PATH_BY_ID, REGION_BY_ID, ACTIVITY_BY_ID,
} from './constants.js';
import {
    calcOVR, clamp, gainCurve, attrCeiling, environmentCap, growthFor,
    pick, randInt,
} from './ratings.js';
import {
    gearTrainingBonus, lifestyleTrainingBonus, perkEffects, buffValue,
} from './economy.js';
import {
    career, applyAttrGain, spendAction, spendGold, adjustCondition,
    addNews, logWeek, saveCareer,
} from '../stores/career.js';
import { getDB, getEffectiveRating } from '../utils/cards.js';
import { showToast } from '../stores/toasts.js';
import { playSound } from '../utils/sound.js';

// ---------------------------------------------------------------------------
//  LOCAL HELPERS
// ---------------------------------------------------------------------------

/** Synchronous read of the career store. svelte/store's `get()` in miniature --
 *  this module is restricted to career-local imports, and a subscribe/unsub
 *  pair is literally what `get` does anyway. */
function snap() {
    let value = null;
    const unsub = career.subscribe(v => { value = v; });
    unsub();
    return value;
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * economy.js may express its bonuses either as a fraction (+0.12) or as a
 * finished multiplier (1.12). Nothing in this economy hands out a flat +50%
 * training bonus, so anything below 0.5 can only be the fractional form.
 */
function bonusToMult(raw) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return 1;
    return v < 0.5 ? 1 + v : v;
}

/**
 * Legacy perks, as a single training multiplier. Two separate perk effects feed
 * training: Prodigy's growthMult ("everything you practise sticks 18% harder")
 * and Mentor's trainingMult. perkEffects() hands both back already folded onto a
 * 1.0 baseline, so the product is the whole perk contribution.
 */
function perkTrainingMult(s) {
    try {
        const e = perkEffects(s) || {};
        const g = Number(e.growthMult);
        const t = Number(e.trainingMult);
        const mult = (Number.isFinite(g) && g > 0 ? g : 1) * (Number.isFinite(t) && t > 0 ? t : 1);
        return Number.isFinite(mult) && mult > 0 ? mult : 1;
    } catch (e) { return 1; }
}

/** Live consumable buffs keyed `trainingMult` (Bootcamp, Dialled In), summed and
 *  folded onto a 1.0 baseline the same way the permanent bonuses are. */
function buffTrainingMult(s) {
    try {
        const v = Number(buffValue(s, 'trainingMult'));
        return Number.isFinite(v) ? Math.max(0, 1 + v) : 1;
    } catch (e) { return 1; }
}

/** Call an economy bonus function without letting a sibling module's signature
 *  choice take the whole training screen down with it. */
function safeBonus(fn, primary, fallback) {
    if (typeof fn !== 'function') return 1;
    try {
        const v = fn(primary);
        if (Number.isFinite(Number(v))) return bonusToMult(v);
    } catch (e) { /* try the other shape below */ }
    try {
        const v = fn(fallback);
        if (Number.isFinite(Number(v))) return bonusToMult(v);
    } catch (e) { /* give up, no bonus */ }
    return 1;
}

// ---------------------------------------------------------------------------
//  DRILL TIERS
//  Basic is free and always available but stops mattering once an attribute is
//  respectable. Advanced carries you through the professional band. Elite is
//  the only route into the 90s, and it is deliberately expensive in gold,
//  energy and prerequisite rating.
// ---------------------------------------------------------------------------
export const DRILL_TIERS = {
    1: { id: 1, name: 'Basic',    short: 'I',   accent: '#64748b', blurb: 'Fundamentals. Free, light, and it stops teaching you at 72.' },
    2: { id: 2, name: 'Advanced', short: 'II',  accent: '#3b82f6', blurb: 'Pro-level reps. Costs a little, takes you to 89.' },
    3: { id: 3, name: 'Elite',    short: 'III', accent: '#eab308', blurb: 'The only drills that push an attribute into the 90s. Priced accordingly.' },
};

// Attribute ceiling each drill tier can reach on its own. 72 is not a
// coincidence -- it is UNSIGNED_SOFT_CAP, so an unsigned prospect grinding
// basics hits the environment wall and the drill wall at the same moment and
// gets one clear message instead of two vague ones.
const TIER_ATTR_CAP = { 1: UNSIGNED_SOFT_CAP, 2: 89, 3: ATTR_MAX };

// ---------------------------------------------------------------------------
//  DRILLS
//  Three per attribute, 24 total. baseGain is the pre-multiplier attribute
//  points a perfectly average session (score 0.5) is worth; at a typical mid-
//  career multiplier of ~1.7 an Advanced drill is worth ~1.6 raw points, which
//  the gain curve then throttles down to somewhere between 1.2 and 0.1 applied
//  points depending on how close the attribute already is to its ceiling.
//
//  Energy and gain move together on purpose: the cheap drills (KNW, LDR) gain
//  less per session, the expensive ones (MEC, TMF) gain more. Per slot the big
//  drills win, per unit of energy the small ones do -- so the choice is about
//  what your week's energy budget looks like, not about which attribute is
//  secretly the efficient one.
// ---------------------------------------------------------------------------
function drill(id, attr, difficulty, name, desc, energy, baseGain, reqOVR, goldCost) {
    return {
        id, attr, difficulty, name, desc,
        game: ATTR_BY_KEY[attr] ? ATTR_BY_KEY[attr].game : 'lasthit',
        energy, baseGain, reqOVR, goldCost,
        attrCap: TIER_ATTR_CAP[difficulty] || ATTR_MAX,
        tierName: DRILL_TIERS[difficulty].name,
        accent: ATTR_BY_KEY[attr] ? ATTR_BY_KEY[attr].color : '#94a3b8',
    };
}

export const DRILLS = [
    // -- MECHANICS (lasthit) -------------------------------------------------
    drill('mec_1', 'mec', 1, 'Last Hit Ladder',
        'Custom game, no items, escalating waves. Miss two in a row and the count starts over.',
        16, 0.62, 0, 0),
    drill('mec_2', 'mec', 2, 'Combo Under Pressure',
        'Full rotation on a moving dummy while the coach calls out a new target every four seconds.',
        26, 0.98, 55, 80),
    drill('mec_3', 'mec', 3, 'Tempo Trial',
        'Perfect CS and a clean skillshot log, at 400 APM, for twelve straight minutes. Almost nobody passes.',
        38, 1.50, 76, 520),

    // -- LANING (wave) -------------------------------------------------------
    drill('lne_1', 'lne', 1, 'Slow Push Repeats',
        'Build a wave, hold it, crash it on a timer. The most boring hour in professional League.',
        15, 0.60, 0, 0),
    drill('lne_2', 'lne', 2, 'Trade Timing Lab',
        'Two players, one lane, one rule: you may only trade on a cooldown the other one just used.',
        24, 0.95, 55, 75),
    drill('lne_3', 'lne', 3, 'Matchup Gauntlet',
        'Eight counter-picks back to back. Win the lane in all eight or run the set again tomorrow.',
        35, 1.45, 74, 480),

    // -- MAP AWARENESS (ward) ------------------------------------------------
    drill('map_1', 'map', 1, 'Ward Route Loop',
        'Walk the ward map on a stopwatch until the timings are muscle memory rather than a decision.',
        14, 0.58, 0, 0),
    drill('map_2', 'map', 2, 'Jungle Tracker',
        'Replay with the enemy jungler hidden. Call his camp every thirty seconds and get scored on it.',
        22, 0.92, 55, 70),
    drill('map_3', 'map', 3, 'Blind Map Call',
        'Minimap covered. Name where all five of them are, from sound and wave state alone.',
        33, 1.42, 74, 460),

    // -- TEAMFIGHTING (focus) ------------------------------------------------
    drill('tmf_1', 'tmf', 1, 'Focus Fire Drill',
        'Five dummies, one correct target, one second to pick it. Repeat two hundred times.',
        16, 0.62, 0, 0),
    drill('tmf_2', 'tmf', 2, 'Cooldown Discipline',
        'Scripted 5v5 where your defensive summoners are logged and every wasted one is replayed to you.',
        26, 0.98, 55, 80),
    drill('tmf_3', 'tmf', 3, 'Five-Man Chaos',
        'Ten simultaneous ultimates, no comms, full fog. Positioning graded frame by frame afterwards.',
        38, 1.50, 76, 520),

    // -- COMPOSURE (clutch) --------------------------------------------------
    drill('cmp_1', 'cmp', 1, 'Breathing Reset',
        'Sports psych basics. Learn to get your heart rate back down between deaths instead of after them.',
        13, 0.56, 0, 0),
    drill('cmp_2', 'cmp', 2, 'Tilt Ladder',
        'Deliberately losing scrims with a stacked deck against you. The point is what you sound like at 0-8.',
        21, 0.90, 55, 65),
    drill('cmp_3', 'cmp', 3, 'Game Five Simulator',
        'Crowd noise, a running clock, and a coach who tells you the wrong thing on purpose once per game.',
        32, 1.40, 74, 440),

    // -- SHOTCALLING (shotcall) ----------------------------------------------
    drill('ldr_1', 'ldr', 1, 'Comms Clarity',
        'Say the same call in six words instead of twenty. Recorded, transcribed, and counted.',
        12, 0.55, 0, 0),
    drill('ldr_2', 'ldr', 2, 'Objective Timers',
        'Run the whole mid game from a spreadsheet of spawn timers you are not allowed to look at.',
        20, 0.88, 55, 60),
    drill('ldr_3', 'ldr', 3, 'Mid-Game Command',
        'You call for four professionals who are instructed to do exactly what you say, right or wrong.',
        30, 1.38, 72, 420),

    // -- CHAMPION POOL (pool) ------------------------------------------------
    drill('chp_1', 'chp', 1, 'One-Trick Detox',
        'Your comfort pick is banned for the whole block. Two new champions, twenty games each.',
        15, 0.60, 0, 0),
    drill('chp_2', 'chp', 2, 'Off-Meta Lab',
        'Take a pick nobody has drafted in eight patches and find out whether that was a mistake or an opening.',
        24, 0.95, 55, 90),
    drill('chp_3', 'chp', 3, 'Pocket Pick Vault',
        'Build three picks nobody expects to a stage-ready standard, and never show them in solo queue.',
        36, 1.46, 74, 560),

    // -- GAME KNOWLEDGE (knowledge) ------------------------------------------
    drill('knw_1', 'knw', 1, 'Patch Notes Homework',
        'Read the notes properly, then get quizzed on the three changes everyone else skimmed past.',
        10, 0.52, 0, 0),
    drill('knw_2', 'knw', 2, 'Item Math Quiz',
        'Damage thresholds, gold efficiency, exact powerspike timings. Written test, no calculator.',
        18, 0.85, 55, 55),
    drill('knw_3', 'knw', 3, 'Meta Forecast',
        'Predict the next patch from the PBE changes and defend the read to an analyst who disagrees.',
        28, 1.34, 72, 400),
];

const DRILL_BY_ID = DRILLS.reduce((m, d) => { m[d.id] = d; return m; }, {});

export function drillById(id) {
    return DRILL_BY_ID[id] || null;
}

/** The three drills for one attribute, easiest first. */
export function drillsForAttr(attrKey) {
    return DRILLS.filter(d => d.attr === attrKey).sort((a, b) => a.difficulty - b.difficulty);
}

// ---------------------------------------------------------------------------
//  NON-DRILL ACTIVITY GAINS
//  Raw (pre-multiplier, pre-curve) attribute points a single week's worth of
//  each activity is worth. engine.js multiplies these by trainingMultiplier()
//  and feeds each one through applyAttrGain, so they respect exactly the same
//  ceilings a drill does. Deliberately an order of magnitude smaller than a
//  drill: these are the trickle that keeps a lazy week from being a zero, not
//  a way to skip training.
// ---------------------------------------------------------------------------

/** Solo queue: mechanically sharpening and champion-pool broadening, and
 *  actively bad for the habits shotcalling needs. */
export const SOLOQ_GAIN = {
    mec: 0.30, chp: 0.22, lne: 0.20, map: 0.14, cmp: 0.12, tmf: 0.10, knw: 0.08, ldr: 0.02,
};

/** Scrims: the only activity that teaches the five-man half of the game, which
 *  is why an unsigned prospect stalls out no matter how much they queue. */
export const SCRIM_GAIN = {
    tmf: 0.34, ldr: 0.28, map: 0.20, cmp: 0.14, knw: 0.10, lne: 0.10, mec: 0.06, chp: 0.04,
};

/** VOD review: cheapest activity on the board and the best knowledge per hour
 *  in the game. Watching replays has never improved anybody's hands. */
export const VOD_GAIN = {
    knw: 0.40, map: 0.28, lne: 0.16, ldr: 0.12, tmf: 0.08, cmp: 0.06, chp: 0.04, mec: 0.02,
};

// ---------------------------------------------------------------------------
//  TRAINING MULTIPLIER
// ---------------------------------------------------------------------------

/** 0.85 at rock bottom, 1.12 at loving it. Morale is a modifier, never the
 *  whole story -- a miserable player still improves, just slower. */
function moraleFactor(morale) {
    return 0.85 + clamp(morale, 0, 100) / 100 * 0.27;
}

/** Smooth 0.86 -> 1.08 across the energy bar, then a hard cliff: training below
 *  25 energy halves everything. Burning your last drop on another drill is
 *  supposed to be a visibly bad idea, not a slightly worse one. */
function energyFactor(energy) {
    const e = clamp(energy, 0, 100);
    const smooth = 0.86 + e / 100 * 0.22;
    return e < 25 ? smooth * 0.5 : smooth;
}

/** Sore wrists cost you more than a bad mood does. */
function healthFactor(health) {
    return 0.55 + clamp(health, 0, 100) / 100 * 0.47;
}

/**
 * Every component of the player's training effectiveness, in the order the UI
 * should list them. Multiply the `mult` column together and you get exactly
 * what trainingMultiplier() returns -- that is the point of this function.
 */
export function trainingMultiplierBreakdown(c) {
    const s = c || snap();
    const p = (s && s.player) || {};

    const path = PATH_BY_ID[p.path] || PATH_BY_ID.debut;
    const region = REGION_BY_ID[p.region] || REGION_BY_ID.LEC;
    const clubTier = p.clubId ? (CLUB_TIERS[p.clubTier] || CLUB_TIERS[3]) : null;

    const gearMult = safeBonus(gearTrainingBonus, s, s && s.inventory && s.inventory.gear);
    const lifeMult = safeBonus(lifestyleTrainingBonus, s, s && s.inventory && s.inventory.lifestyle);

    return [
        { key: 'path',      label: path.name,                       mult: path.trainingMult,      note: 'Start path' },
        { key: 'region',    label: region.name,                     mult: region.trainingMult,    note: 'Regional practice culture' },
        // Unsigned is worse than the worst club: no coach, no VOD staff, no
        // structured block. 0.9 rather than 0.5 because the pre-comp path is
        // supposed to be viable, just slower.
        { key: 'club',      label: clubTier ? clubTier.name : 'No club',
                                                                    mult: clubTier ? clubTier.trainingMult : 0.9,
                                                                    note: clubTier ? 'Club facilities' : 'Training alone' },
        { key: 'gear',      label: 'Gear',                          mult: gearMult,               note: 'Peripherals and setup' },
        { key: 'lifestyle', label: 'Lifestyle',                     mult: lifeMult,               note: 'Sleep, diet, coaching staff' },
        { key: 'perks',     label: 'Legacy perks',                  mult: perkTrainingMult(s),    note: 'What the career has taught you' },
        { key: 'buffs',     label: 'Active buffs',                  mult: buffTrainingMult(s),    note: 'Bootcamps and supplements' },
        { key: 'age',       label: `Age ${Math.round(p.age || 18)}`, mult: growthFor(p.age),      note: 'How fast you still learn' },
        { key: 'morale',    label: 'Morale',                        mult: moraleFactor(p.morale), note: 'Wanting to be there' },
        { key: 'energy',    label: 'Energy',                        mult: energyFactor(p.energy), note: (p.energy || 0) < 25 ? 'Exhausted -- gains halved' : 'Freshness' },
        { key: 'health',    label: 'Health',                        mult: healthFactor(p.health), note: 'Wrists, back, sleep debt' },
    ].map(row => ({ ...row, mult: round2(row.mult) }));
}

/** Total training effectiveness. Everything in the breakdown, multiplied. */
export function trainingMultiplier(c) {
    const s = c || snap();
    let total = 1;
    for (const row of trainingMultiplierBreakdown(s)) total *= row.mult;
    // Floor of 0.15: an exhausted, injured, miserable, unsigned 33-year-old
    // should be wasting their time, not mathematically unable to move at all.
    return round2(clamp(total, 0.15, 6));
}

// ---------------------------------------------------------------------------
//  SCORE -> GAIN
// ---------------------------------------------------------------------------

/**
 * Turn a minigame score into a gain multiplier.
 *   0.00 - 0.25  a wasted rep, worth almost nothing
 *   0.50         the reference average session, worth exactly 1x
 *   1.00         2.4x -- a session you remember
 * The last half is mildly convex so the difference between "good" and
 * "perfect" is felt rather than just noted.
 */
export function scoreFactor(score01) {
    const s = clamp(score01, 0, 1);
    if (s <= 0.25) return (s / 0.25) ** 2 * 0.18;
    if (s <= 0.5) return 0.18 + ((s - 0.25) / 0.25) * 0.82;
    return 1 + 1.4 * (((s - 0.5) / 0.5) ** 1.25);
}

/** Composite read of how the session went, graded against what was attempted --
 *  a scrappy 0.6 on an Elite drill is a better afternoon than a 0.6 on a Basic
 *  one. Drives the blurb, the form nudge and the morale nudge. */
function sharpnessOf(score01, difficulty) {
    return clamp(clamp(score01, 0, 1) * (0.90 + 0.10 * (difficulty || 1)), 0, 1);
}

/** How far this attribute can actually move today: the lower of the player's
 *  own potential and the drill tier's own ceiling. */
function headroomFor(player, d) {
    const cur = (player.attrs && player.attrs[d.attr]) || 0;
    const ceiling = attrCeiling(player, d.attr);
    return Math.max(0, Math.min(d.attrCap, ceiling) - cur);
}

/**
 * PURE. Everything a single run of `drill` at `score01` would cost and produce,
 * with nothing written anywhere. completeDrill() calls this and then applies it.
 *
 *  rawGain     pre-curve attribute points to hand to applyAttrGain
 *  energyCost  energy this session actually burns
 *  injuryRisk  probability in [0, 0.35] of taking a health hit
 *  goldCost    the drill's fee
 *  sharpness   0-1 quality of the session, difficulty-adjusted
 */
export function runDrill(c, drill_, score01) {
    const s = c || snap();
    const p = (s && s.player) || {};
    const d = typeof drill_ === 'string' ? drillById(drill_) : drill_;
    if (!d) return { rawGain: 0, energyCost: 0, injuryRisk: 0, goldCost: 0, sharpness: 0 };

    const mult = trainingMultiplier(s);
    const cur = (p.attrs && p.attrs[d.attr]) || 0;
    const ceiling = attrCeiling(p, d.attr);
    const curve = gainCurve(cur, ceiling, environmentCap(p));

    let rawGain = d.baseGain * scoreFactor(score01) * mult;

    // A Basic drill must not be able to carry an attribute past 72 in one
    // lucky session. Convert the remaining headroom back through the curve so
    // applyAttrGain lands exactly on the wall rather than through it.
    const headroom = headroomFor(p, d);
    if (headroom <= 0 || curve <= 0) rawGain = 0;
    else rawGain = Math.min(rawGain, headroom / curve);

    // Sore hands come from grinding while empty, not from grinding hard.
    const energyCost = Math.round(d.energy * (1 + (100 - clamp(p.health, 0, 100)) / 100 * 0.25));

    const baseRisk = { 1: 0.020, 2: 0.045, 3: 0.080 }[d.difficulty] || 0.04;
    let injuryRisk = baseRisk;
    const energy = clamp(p.energy, 0, 100);
    const health = clamp(p.health, 0, 100);
    if (energy < 40) injuryRisk *= 1 + ((40 - energy) / 40) * 1.5;
    if (health < 60) injuryRisk *= 1 + ((60 - health) / 60) * 1.0;
    if (clamp(score01, 0, 1) < 0.30) injuryRisk *= 1.15;  // flailing through reps is how wrists go

    return {
        rawGain: round2(rawGain),
        energyCost,
        injuryRisk: round2(clamp(injuryRisk, 0, 0.35)),
        goldCost: d.goldCost || 0,
        sharpness: round2(sharpnessOf(score01, d.difficulty)),
    };
}

/**
 * What a poor run and a perfect run would each be worth right now, in real
 * applied attribute points -- i.e. after gainCurve, the potential ceiling and
 * the drill tier's own cap. `min` uses 0.30, which is a genuinely bad session
 * rather than a rage-quit.
 */
export function expectedGain(c, drill_) {
    const s = c || snap();
    const p = (s && s.player) || {};
    const d = typeof drill_ === 'string' ? drillById(drill_) : drill_;
    if (!d) return { min: 0, max: 0, mult: 1, capped: true };

    const cur = (p.attrs && p.attrs[d.attr]) || 0;
    const ceiling = attrCeiling(p, d.attr);
    const curve = gainCurve(cur, ceiling, environmentCap(p));
    const mult = trainingMultiplier(s);

    const apply = score => {
        const raw = runDrill(s, d, score).rawGain;
        return round2(Math.min(raw * curve, headroomFor(p, d)));
    };

    const capped = cur >= ceiling
        || cur >= d.attrCap
        || (!p.clubId && cur >= UNSIGNED_SOFT_CAP);

    return { min: apply(0.30), max: apply(1.0), mult, capped };
}

// ---------------------------------------------------------------------------
//  WEEKLY SLOTS
// ---------------------------------------------------------------------------

/**
 * Club sessions used and available this week.
 *
 * `used` is summed from weekly.trained rather than read from weekly.clubSlotsLeft
 * because trained is what this module writes and blankCareer() resets it -- a
 * counter that defaults to 0 would silently lock training out if the engine ever
 * forgot to stock it. clubSlotsLeft is still kept in sync for anything reading it.
 */
export function weeklyTrainingSlots(c) {
    const s = c || snap();
    const p = (s && s.player) || {};
    const trained = (s && s.weekly && s.weekly.trained) || {};
    let used = 0;
    for (const k of ATTR_KEYS) used += Number(trained[k]) || 0;

    if (!p.clubId) return { used, max: Infinity };
    const max = CLUB_TRAINING_SLOTS[p.clubTier] || CLUB_TRAINING_SLOTS[3];
    return { used, max };
}

// ---------------------------------------------------------------------------
//  ELIGIBILITY
// ---------------------------------------------------------------------------

/** Everything that can stop a drill, in the order the player should hear it. */
export function canTrain(c, drill_) {
    const s = c || snap();
    const d = typeof drill_ === 'string' ? drillById(drill_) : drill_;
    if (!d) return { ok: false, reason: 'That drill does not exist.' };
    if (!s || !s.created) return { ok: false, reason: 'No career in progress.' };

    const p = s.player;
    if (s.flags && s.flags.retired) return { ok: false, reason: 'You are retired. Enjoy it.' };

    if ((s.weekly.actionsLeft || 0) < 1) {
        return { ok: false, reason: 'No activity slots left this week.' };
    }

    const slots = weeklyTrainingSlots(s);
    if (slots.used >= slots.max) {
        return { ok: false, reason: `Club schedule is full -- ${slots.max} training sessions a week at this tier.` };
    }

    const ovr = calcOVR(p.attrs, p.role);
    if (ovr < d.reqOVR) {
        return { ok: false, reason: `Requires ${d.reqOVR} OVR. You are ${ovr}.` };
    }

    const res = runDrill(s, d, 0.5);
    if ((p.energy || 0) < res.energyCost) {
        return { ok: false, reason: `Not enough energy -- this drill needs ${res.energyCost}.` };
    }

    if (d.goldCost > 0 && (s.money.gold || 0) < d.goldCost) {
        return { ok: false, reason: `Costs ${d.goldCost} gold. You have ${Math.round(s.money.gold || 0)}.` };
    }

    // Blocking rather than allowing a guaranteed zero: the player should be
    // pointed at the next drill tier, not at a session that cannot pay out.
    const cur = (p.attrs && p.attrs[d.attr]) || 0;
    const attrName = ATTR_BY_KEY[d.attr] ? ATTR_BY_KEY[d.attr].name : d.attr;
    if (cur >= attrCeiling(p, d.attr)) {
        return { ok: false, reason: `${attrName} has reached your potential ceiling.` };
    }
    if (cur >= d.attrCap) {
        const next = drillsForAttr(d.attr).find(x => x.difficulty > d.difficulty);
        return {
            ok: false,
            reason: next
                ? `${d.tierName} drills top out at ${d.attrCap}. Run ${next.name} instead.`
                : `${attrName} cannot go any higher.`,
        };
    }

    return { ok: true, reason: '' };
}

// ---------------------------------------------------------------------------
//  COACH FEEDBACK
// ---------------------------------------------------------------------------
const BLURBS = [
    {
        min: 0.85, band: 'elite', lines: [
            'That was the best rep anybody has run in this building today.',
            'Do that on stage and somebody writes an article about it.',
            'Perfect. Do not change a single thing before tomorrow.',
            'I am putting that one in the coaching deck.',
            'Nothing left to correct. Go again in the morning.',
        ],
    },
    {
        min: 0.65, band: 'sharp', lines: [
            'Now we are talking. That is a starter\'s session.',
            'Sharp. You held the pattern under pressure.',
            'That is the version of you we put on stage.',
            'Clean reps, clean decisions. Logged.',
            'Better than last week and you know it.',
        ],
    },
    {
        min: 0.45, band: 'solid', lines: [
            'Solid rep. That is what a normal Tuesday looks like.',
            'Textbook, right up until the last third.',
            'Consistent. Boring. Exactly what we wanted.',
            'Good session. Nothing to fix, nothing to frame.',
            'Fine work. Do it forty more times.',
        ],
    },
    {
        min: 0.25, band: 'sloppy', lines: [
            'Sloppy. The idea was right, the execution was late.',
            'Half of those were clean. We will not discuss the other half.',
            'You rushed it. Slow down and the numbers fix themselves.',
            'Not good, not a disaster. Somewhere in between.',
            'Your third rep was excellent. The other nineteen were not.',
        ],
    },
    {
        min: 0, band: 'wasted', lines: [
            'That was not practice, that was you sitting at a computer.',
            'Nothing landed. Stand up, get water, come back.',
            'We are calling that a warm-up so it does not go in the log.',
            'Your hands were somewhere else the entire session.',
            'Zero reps worth keeping. It happens. Not twice.',
        ],
    },
];

/** A line of coach feedback keyed to how the session actually went. */
export function trainingBlurb(score01) {
    const s = clamp(score01, 0, 1);
    const row = BLURBS.find(b => s >= b.min) || BLURBS[BLURBS.length - 1];
    return pick(row.lines);
}

/** The band id only -- useful for colouring the result panel. */
export function trainingBand(score01) {
    const s = clamp(score01, 0, 1);
    const row = BLURBS.find(b => s >= b.min) || BLURBS[BLURBS.length - 1];
    return row.band;
}

// ---------------------------------------------------------------------------
//  REST
// ---------------------------------------------------------------------------
const FALLBACK_SPARRING = [
    'a Challenger ladder regular', 'the academy starter', 'a retired mid laner',
    'the analyst', 'last year\'s rookie of the year', 'a scrim partner from the LDL',
];

/** A name to hang the news line on. The card database is loaded lazily by the
 *  roster mode and may simply not be there yet, hence the fallback. */
function sparringName(c) {
    const db = getDB();
    if (!db || !db.length) return pick(FALLBACK_SPARRING);
    const role = c && c.player ? c.player.role : null;
    const pool = db.filter(card => card && card.name && getEffectiveRating(card) >= 82 && (!role || card.role === role));
    const fallbackPool = pool.length ? pool : db.filter(card => card && card.name);
    if (!fallbackPool.length) return pick(FALLBACK_SPARRING);
    return pick(fallbackPool).name;
}

/**
 * What a Rest Day is worth. The base +50 energy comes straight from the
 * activity table; lifestyle purchases (a real bed, a physio, a chef) scale the
 * whole recovery, and anybody past 26 stops bouncing back the way they did.
 */
export function restRecovery(c) {
    const s = c || snap();
    const p = (s && s.player) || {};
    const base = Math.abs((ACTIVITY_BY_ID.rest && ACTIVITY_BY_ID.rest.energy) || -50);
    const lifeMult = safeBonus(lifestyleTrainingBonus, s, s && s.inventory && s.inventory.lifestyle);
    const ageMult = (p.age || 18) >= 27 ? 0.88 : (p.age || 18) >= 24 ? 0.95 : 1;

    return {
        energy: Math.round(base * lifeMult * ageMult),
        morale: Math.round(6 * lifeMult),
        // Rest repairs wrists slowly. Gym & Physio is the real fix; this is the
        // free trickle so a light injury does not need a purchase to heal.
        health: Math.round(3 * lifeMult),
    };
}

// ---------------------------------------------------------------------------
//  THE STORE-WRITING VERSION
// ---------------------------------------------------------------------------

/**
 * Run a drill for real: spend the slot, the gold and the energy, apply the
 * attribute gain, roll for injury, nudge form and morale, and write the log.
 * Returns what the result screen needs to render.
 */
export function completeDrill(drill_, score01) {
    const d = typeof drill_ === 'string' ? drillById(drill_) : drill_;
    const before = snap();
    const attrName = d && ATTR_BY_KEY[d.attr] ? ATTR_BY_KEY[d.attr].name : '';

    const gate = canTrain(before, d);
    if (!gate.ok) {
        return {
            ok: false, gain: 0, attr: d ? d.attr : '', attrName,
            energyCost: 0, injured: false, levelUp: false, message: gate.reason, blurb: gate.reason,
        };
    }

    const score = clamp(score01, 0, 1);
    const res = runDrill(before, d, score);
    const ovrBefore = calcOVR(before.player.attrs, before.player.role);

    // Pay first. Either of these failing means the state moved under us between
    // canTrain and here, so bail without half-applying the session.
    if (!spendAction(1)) {
        return { ok: false, gain: 0, attr: d.attr, attrName, energyCost: 0, injured: false, levelUp: false, message: 'No activity slots left this week.', blurb: '' };
    }
    if (d.goldCost > 0 && !spendGold(d.goldCost)) {
        return { ok: false, gain: 0, attr: d.attr, attrName, energyCost: 0, injured: false, levelUp: false, message: 'Could not cover the drill fee.', blurb: '' };
    }

    adjustCondition('energy', -res.energyCost);
    const gain = applyAttrGain(d.attr, res.rawGain);

    // Book the session against this week's club schedule. clubSlotsLeft is
    // mirrored so any screen reading it stays truthful.
    career.update(c => ({
        ...c,
        weekly: {
            ...c.weekly,
            trained: { ...c.weekly.trained, [d.attr]: (c.weekly.trained[d.attr] || 0) + 1 },
            clubSlotsLeft: Math.max(0, (c.weekly.clubSlotsLeft || 0) - 1),
        },
    }));

    // Injury roll. Difficulty drives severity as well as probability -- a
    // Tempo Trial that goes wrong costs a fortnight, a ward loop costs an evening.
    let injured = false;
    let healthLost = 0;
    if (Math.random() < res.injuryRisk) {
        injured = true;
        healthLost = randInt(4, 9) + d.difficulty * 2;
        adjustCondition('health', -healthLost);
        adjustCondition('form', -4);
    }

    // Form and morale move on how the session felt, not on the points earned --
    // a great rep against a ceiling still feels great.
    adjustCondition('form', Math.round((res.sharpness - 0.5) * 7));
    adjustCondition('morale', Math.round(clamp((res.sharpness - 0.40) * 4, -2, 3)));

    const after = snap();
    const ovrAfter = calcOVR(after.player.attrs, after.player.role);
    const levelUp = ovrAfter > ovrBefore;

    const blurb = trainingBlurb(score);
    const gainText = gain > 0 ? `+${gain.toFixed(2)} ${attrName}` : `no measurable ${attrName} gain`;
    const message = `${blurb} (${gainText})`;

    // News: only the sessions worth reading about. A mediocre Basic drill in
    // week nine is not a headline, and the feed only holds 80 entries.
    if (levelUp || injured || d.difficulty === 3 || gain >= 0.8) {
        if (injured) {
            addNews(`${attrName} session cut short -- ${healthLost} health lost to a flare-up during ${d.name}.`, 'drama');
        } else if (levelUp) {
            addNews(`${d.name} pays off: overall rating up to ${ovrAfter} after a ${attrName} breakthrough.`, 'training');
        } else if (d.difficulty === 3) {
            addNews(`Ran ${d.name} against ${sparringName(after)}. ${gainText}.`, 'training');
        } else {
            addNews(`Strong ${attrName} block: ${d.name}, ${gainText}.`, 'training');
        }
    }

    logWeek(
        d.name,
        injured ? `${gainText} -- picked up a knock` : gainText,
        injured ? '#ef4444' : (ATTR_BY_KEY[d.attr] ? ATTR_BY_KEY[d.attr].color : '#3b82f6'),
    );

    if (injured) {
        playSound('lose');
        showToast(`Injury during ${d.name} -- health down ${healthLost}.`, 'error');
    } else if (levelUp) {
        playSound('rare');
        showToast(`Overall rating up to ${ovrAfter}.`, 'success');
    } else {
        playSound(gain > 0 ? 'claim' : 'click');
    }

    saveCareer();

    return {
        ok: true,
        gain,
        attr: d.attr,
        attrName,
        energyCost: res.energyCost,
        injured,
        healthLost,
        message,
        blurb,
        levelUp,
        ovrBefore,
        ovrAfter,
        sharpness: res.sharpness,
        band: trainingBand(score),
        goldSpent: d.goldCost || 0,
    };
}

// ---------------------------------------------------------------------------
//  SMALL CONVENIENCES FOR THE TRAINING SCREEN
// ---------------------------------------------------------------------------

/** Every attribute with the numbers the training screen wants on one row. */
export function trainingOverview(c) {
    const s = c || snap();
    const p = (s && s.player) || {};
    return ATTRS.map(a => {
        const cur = (p.attrs && p.attrs[a.key]) || 0;
        const ceiling = attrCeiling(p, a.key);
        return {
            ...a,
            value: cur,
            ceiling,
            headroom: Math.max(0, ceiling - cur),
            trainedThisWeek: (s && s.weekly && s.weekly.trained && s.weekly.trained[a.key]) || 0,
            // Above the soft cap an unsigned player is running at 15% of normal.
            throttled: !p.clubId && cur >= UNSIGNED_SOFT_CAP,
            drills: drillsForAttr(a.key),
        };
    });
}
