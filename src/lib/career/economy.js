// ===========================================================================
//  LoL ULTIMATE CAREER - money, the shop, and everything you can buy
// ===========================================================================
//  Three currencies, three completely different pacings:
//
//    gold      - earned every week from wages, sponsors and streaming. Spent on
//                gear, consumables and lifestyle. Renewable, so the sinks here
//                are deliberately deep: a full tier-5 desk setup plus the top of
//                the lifestyle ladder is roughly 530k, which is several seasons
//                of a main-league wage and completely out of reach for anyone
//                still on an academy contract.
//    followers - never spent, only gated against. It is the reputation number
//                that unlocks lifestyle items and sponsors.
//    legacy    - only ever granted by awards and career milestones, so it is
//                the scarcest thing in the mode. Thirteen perks cost 107 LP in
//                total and a decade-long career earns nowhere near all of it.
//
//  Emoji are written as \u escapes on purpose - this repo has been bitten by
//  encoding corruption when files are rewritten by tooling.

import {
    ATTR_KEYS, ROLE_BY_ID, UNSIGNED_SOFT_CAP,
} from './constants.js';
import {
    fmtGold, fmtFollowers, weeklySalaryFor, calcOVR, clamp, pick, emptyAttrs,
} from './ratings.js';
import {
    career, absWeek, saveCareer, addNews,
    grantGold, spendGold, grantFollowers, spendLegacy,
    adjustCondition, applyAttrGain, raisePotential, setSoftCap,
    setGearTier, setLifestyle, addConsumable, addPerk,
} from '../stores/career.js';
import { getDB, getEffectiveRating, getEra } from '../utils/cards.js';
import { playSound } from '../utils/sound.js';

// ---------------------------------------------------------------------------
//  STORE ACCESS
// ---------------------------------------------------------------------------
/**
 * svelte/store's get() written out in three lines. Subscribing and immediately
 * unsubscribing reads the value without publishing a spurious update, which
 * career.update(c => c) would do for every subscriber on every price check.
 */
function snapshot() {
    let snap = null;
    const stop = career.subscribe(v => { snap = v; });
    stop();
    return snap;
}

/** Every public reader accepts an explicit state or falls back to the store. */
function st(c) {
    return c && typeof c === 'object' ? c : snapshot();
}

/** absWeek() without assuming c.time survived a hand-edited save. */
function weekOf(c) {
    return (c && c.time) ? absWeek(c) : 1;
}

function fail(msg) { return { ok: false, msg }; }
function done(msg) { return { ok: true, msg }; }

/** Summing fractions like 0.18 + 0.12 leaks binary noise straight into the UI. */
function r3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

// ---------------------------------------------------------------------------
//  GEAR
//  Six categories, five tiers each, bought strictly in order. Tiers replace
//  rather than stack - owning tier 4 gives you tier 4's numbers, not the sum of
//  1 through 4 - so the escalation in the data below is already cumulative.
//
//  trainingBonus is additive across categories and folded into a 1.0 baseline
//  by gearTrainingBonus(). A full tier-5 desk is +33.7% training, which is worth
//  roughly as much as a main-league club's facilities (CLUB_TIERS[1] = 1.25).
//
//  attrBonus is a MATCH-TIME performance bonus only. It never touches
//  player.attrs, never counts toward OVR, and vanishes the moment the gear is
//  replaced - see gearAttrBonus() for the full warning.
// ---------------------------------------------------------------------------
export const GEAR = [
    {
        id: 'mouse', name: 'Mouse', icon: '\u{1F5B1}',
        desc: 'The only piece of hardware your hands touch every single second of every game.',
        tiers: [
            { tier: 1, name: 'Office Mouse', cost: 120, trainingBonus: 0.005, attrBonus: {}, energyBonus: 0,
              desc: 'Came free with a desktop. The scroll wheel sticks and the sensor lies to you at speed.' },
            { tier: 2, name: 'Entry Gaming Mouse', cost: 500, trainingBonus: 0.010, attrBonus: { mec: 1 }, energyBonus: 0,
              desc: 'Six thousand DPI you will never use, and a sensor that finally tracks a flick.' },
            { tier: 3, name: 'Lightweight Wireless', cost: 1600, trainingBonus: 0.018, attrBonus: { mec: 2 }, energyBonus: 0,
              desc: 'Fifty-eight grams. Aiming stops feeling like pushing furniture across a desk.' },
            { tier: 4, name: 'Pro Series Wireless', cost: 4800, trainingBonus: 0.028, attrBonus: { mec: 3 }, energyBonus: 0,
              desc: 'Eight-kilohertz polling. The click registers before you have finished deciding to click.' },
            { tier: 5, name: 'Custom Shell Superlight', cost: 12000, trainingBonus: 0.040, attrBonus: { mec: 4 }, energyBonus: 1,
              desc: 'Drilled, magnet-switched and moulded to your grip. Nothing left between you and the mistake.' },
        ],
    },
    {
        id: 'keyboard', name: 'Keyboard', icon: '\u{2328}',
        desc: 'Actuation depth decides whether your combo comes out or your champion stands there.',
        tiers: [
            { tier: 1, name: 'Membrane Board', cost: 150, trainingBonus: 0.005, attrBonus: {}, energyBonus: 0,
              desc: 'Mushy, loud in the wrong way, and the W key has started double-typing.' },
            { tier: 2, name: 'Tenkeyless Mechanical', cost: 620, trainingBonus: 0.010, attrBonus: { mec: 1 }, energyBonus: 0,
              desc: 'No numpad, so the mouse hand finally sits at an angle a physio would sign off on.' },
            { tier: 3, name: 'Linear Hot-Swap', cost: 2000, trainingBonus: 0.018, attrBonus: { mec: 1, lne: 1 }, energyBonus: 0,
              desc: 'Lubed linears and a keymap that matches your hands rather than the factory default.' },
            { tier: 4, name: 'Rapid Trigger Analog', cost: 5600, trainingBonus: 0.028, attrBonus: { mec: 1, lne: 2 }, energyBonus: 0,
              desc: 'Actuation at 0.2mm. Animation cancels and stutter-steps stop costing you frames.' },
            { tier: 5, name: 'Bespoke Custom Build', cost: 14000, trainingBonus: 0.040, attrBonus: { mec: 2, lne: 2 }, energyBonus: 1,
              desc: 'Gasket mount, tuned springs, one of forty ever made. Every keypress lands where you put it.' },
        ],
    },
    {
        id: 'headset', name: 'Headset', icon: '\u{1F3A7}',
        desc: 'Half the information in a game of League arrives through your ears, and all of the comms do.',
        tiers: [
            { tier: 1, name: 'Stock Earbuds', cost: 180, trainingBonus: 0.008, attrBonus: {}, energyBonus: 0,
              desc: 'You can hear the game. Roughly. In one direction, and only if nobody speaks.' },
            { tier: 2, name: 'Wired Gaming Headset', cost: 750, trainingBonus: 0.015, attrBonus: { map: 1 }, energyBonus: 0,
              desc: 'Positional audio good enough to place a recall behind a wall you cannot see.' },
            { tier: 3, name: 'Studio Closed-Back', cost: 2400, trainingBonus: 0.024, attrBonus: { map: 1, ldr: 1 }, energyBonus: 0,
              desc: 'Flat response. Ward pops, footsteps and four people talking stop fighting each other.' },
            { tier: 4, name: 'Open-Back and DAC', cost: 6500, trainingBonus: 0.036, attrBonus: { map: 2, ldr: 1 }, energyBonus: 1,
              desc: 'A soundstage wide enough to hear the flank before the minimap is willing to admit it.' },
            { tier: 5, name: 'Custom IEM Set', cost: 16000, trainingBonus: 0.050, attrBonus: { map: 2, ldr: 2 }, energyBonus: 1,
              desc: 'Moulded to your ears. Stage noise disappears and the caller sounds like they are inside your head.' },
        ],
    },
    {
        id: 'monitor', name: 'Monitor', icon: '\u{1F4FA}',
        desc: 'The single upgrade every pro names when asked what an amateur should buy first.',
        tiers: [
            { tier: 1, name: '60Hz Office Panel', cost: 300, trainingBonus: 0.010, attrBonus: {}, energyBonus: 0,
              desc: 'Sixty frames of a game your machine is rendering at three hundred. You are watching a summary.' },
            { tier: 2, name: '144Hz TN', cost: 1200, trainingBonus: 0.020, attrBonus: { map: 1 }, energyBonus: 0,
              desc: 'The upgrade everyone feels immediately. Skillshots become objects you can dodge.' },
            { tier: 3, name: '240Hz IPS', cost: 3800, trainingBonus: 0.032, attrBonus: { map: 1, tmf: 1 }, energyBonus: 1,
              desc: 'Colour and speed at once. Reading the minimap stops being an act of faith.' },
            { tier: 4, name: '360Hz Esports Panel', cost: 10000, trainingBonus: 0.046, attrBonus: { map: 2, tmf: 1 }, energyBonus: 1,
              desc: 'Tournament standard. Four milliseconds of excuse quietly removed from your post-game.' },
            { tier: 5, name: '540Hz OLED', cost: 24000, trainingBonus: 0.062, attrBonus: { map: 2, tmf: 2 }, energyBonus: 2,
              desc: 'Past what most people can use. Your eyes stop working overtime to fill in the gaps.' },
        ],
    },
    {
        id: 'chair', name: 'Chair', icon: '\u{1FA91}',
        desc: 'Twelve-hour scrim blocks are a physical event. This is the item that decides how hour ten feels.',
        tiers: [
            { tier: 1, name: 'Kitchen Chair', cost: 260, trainingBonus: 0.006, attrBonus: {}, energyBonus: 0,
              desc: 'Free, wooden, and your lower back is quietly filing a complaint about it.' },
            { tier: 2, name: 'Budget Racing Chair', cost: 1000, trainingBonus: 0.014, attrBonus: { cmp: 1 }, energyBonus: 1,
              desc: 'Looks like a car seat and supports you like a car seat, which is to say barely.' },
            { tier: 3, name: 'Ergonomic Mesh', cost: 3200, trainingBonus: 0.024, attrBonus: { cmp: 1, knw: 1 }, energyBonus: 2,
              desc: 'Lumbar support that means it. Hour eight starts feeling like hour three.' },
            { tier: 4, name: 'Task Chair, Twelve-Year Warranty', cost: 8500, trainingBonus: 0.036, attrBonus: { cmp: 2, knw: 1 }, energyBonus: 3,
              desc: 'The pros who never mention their chair are, without exception, all sitting in one of these.' },
            { tier: 5, name: 'Fitted Ergonomic Rig', cost: 20000, trainingBonus: 0.050, attrBonus: { cmp: 3, knw: 1 }, energyBonus: 5,
              desc: 'Measured to your spine by somebody with a clipboard. Marathon blocks stop hurting entirely.' },
        ],
    },
    {
        id: 'pc', name: 'PC', icon: '\u{1F5A5}',
        desc: 'Frames are the floor everything else stands on. Losing them in a teamfight is losing them when it counts.',
        tiers: [
            { tier: 1, name: 'Family Desktop', cost: 900, trainingBonus: 0.015, attrBonus: {}, energyBonus: 0,
              desc: 'Integrated graphics and a fan that sounds like a hairdryer. It launches the client, eventually.' },
            { tier: 2, name: 'Budget Build', cost: 3400, trainingBonus: 0.030, attrBonus: { mec: 1 }, energyBonus: 0,
              desc: 'Last generation mid-range. Stable at 144 right up until the first teamfight starts.' },
            { tier: 3, name: 'Mid-Tier Rig', cost: 9500, trainingBonus: 0.050, attrBonus: { mec: 1, tmf: 1 }, energyBonus: 0,
              desc: 'Locked 240 in a five-man fight. Frame drops stop being part of your gameplan.' },
            { tier: 4, name: 'High-End Build', cost: 24000, trainingBonus: 0.070, attrBonus: { mec: 2, tmf: 2 }, energyBonus: 1,
              desc: 'Overkill on purpose. Nothing between your input and the server except the server.' },
            { tier: 5, name: 'Bootcamp-Spec Workstation', cost: 55000, trainingBonus: 0.095, attrBonus: { mec: 3, tmf: 3 }, energyBonus: 2,
              desc: 'The exact machine the Korean bootcamp runs, down to the RAM timings. No adjustment period.' },
        ],
    },
];

export const GEAR_BY_ID = GEAR.reduce((m, g) => { m[g.id] = g; return m; }, {});
export const GEAR_MAX_TIER = 5;

/** Total potential OVR a career may BUY. Gold is renewable and a ceiling is
 *  not, so anything that sells headroom has to be bounded for the career rather
 *  than merely priced -- otherwise the answer to "am I at my ceiling" becomes
 *  "how many splits until I can afford another camp". */
export const CEILING_PURCHASE_MAX = 3;

// ---------------------------------------------------------------------------
//  CONSUMABLES
//  Single use. The `effect` block is the whole contract - useConsumable() reads
//  it generically, so adding an item here never means editing a switch anywhere.
//
//    condition  { energy, morale, health, form }  straight deltas via adjustCondition()
//    attrXP     { <attrKey|ROLE_PRIMARY|ALL>: points }  pre-curve, via applyAttrGain()
//    potentialXP { <attrKey|ROLE_PRIMARY|ALL>: points } raises the CEILING itself,
//               via raisePotential(). The only renewable way to buy headroom, so
//               anything using it must be priced like an endgame gold sink.
//    chemistry  flat points on player.chemistry
//    followers  granted, scaled by the player's follower multiplier
//    gold       granted (no consumable currently does, but the reader handles it)
//    actions    extra activity slots, this week only
//    buff       { key, value, weeks, name }  timed modifier other modules read
//    needsClub  refuses to apply while unsigned
//
//  attrXP is in ATTRIBUTE POINTS, not some separate XP scale: applyAttrGain()
//  multiplies it by gainCurve() and rounds, so anything under ~1.0 is eaten by
//  rounding and anything over ~3 trivialises a training week.
// ---------------------------------------------------------------------------
export const CONSUMABLES = [
    {
        id: 'energy_drink', name: 'Energy Drink', icon: '\u{1F964}', cost: 60,
        desc: 'Thirty energy now, a small bill from your body later.',
        effect: { condition: { energy: 30, health: -2 } },
    },
    {
        id: 'sleep_kit', name: 'Sleep Therapy Kit', icon: '\u{1F6CF}', cost: 220,
        desc: 'Blackout blinds, a blue-light filter and an alarm you actually respect.',
        effect: { condition: { energy: 45, morale: 4 } },
    },
    {
        id: 'sports_massage', name: 'Sports Massage', icon: '\u{1F486}', cost: 320,
        desc: 'Forty minutes of somebody undoing what the last three weeks did to your shoulders.',
        effect: { condition: { health: 20, energy: 8 } },
    },
    {
        id: 'wrist_brace', name: 'Wrist Brace', icon: '\u{1FA79}', cost: 260,
        desc: 'Unglamorous, slightly restrictive, and the reason careers reach twenty-six.',
        effect: {
            condition: { health: 12 },
            buff: { key: 'injuryResist', value: 0.25, weeks: 6, name: 'Braced' },
        },
    },
    {
        id: 'focus_supplement', name: 'Focus Supplement', icon: '\u{1F48A}', cost: 380,
        desc: 'Legal, tested, and worth about two weeks of noticeably sharper practice.',
        effect: {
            condition: { form: 6 },
            buff: { key: 'trainingMult', value: 0.12, weeks: 2, name: 'Dialled In' },
        },
    },
    {
        id: 'meta_report', name: 'Patch Meta Report', icon: '\u{1F4CA}', cost: 340,
        desc: 'Somebody else did the spreadsheet. Item math, powerspikes and what is about to be broken.',
        effect: { attrXP: { knw: 1.0, chp: 1.0 } },
    },
    {
        id: 'pr_blast', name: 'Social Media Push', icon: '\u{1F4E3}', cost: 400,
        desc: 'A clip package, a thumbnail, and forty-eight hours of somebody else pushing it.',
        effect: { followers: 1500 },
    },
    {
        id: 'team_dinner', name: 'Team Dinner', icon: '\u{1F35C}', cost: 480,
        desc: 'You pay, nobody talks about the split, and the scrim block goes better on Monday.',
        effect: {
            chemistry: 9,
            condition: { morale: 8, energy: -5 },
            needsClub: true,
        },
    },
    {
        id: 'vod_package', name: 'Analyst VOD Package', icon: '\u{1F4FC}', cost: 620,
        desc: 'Forty games cut down to the twenty minutes where somebody better than you made a decision.',
        effect: { attrXP: { knw: 1.6, map: 1.2 } },
    },
    {
        id: 'psych_session', name: 'Sports Psychologist Session', icon: '\u{1F9E0}', cost: 700,
        desc: 'An hour on why game five feels different, and what to do with your hands when it does.',
        effect: {
            condition: { morale: 22, form: 5 },
            attrXP: { cmp: 1.2 },
        },
    },
    {
        id: 'all_nighter', name: 'All-Nighter', icon: '\u{1F319}', cost: 900,
        desc: 'One more activity this week, paid for out of next week. The oldest bad idea in the scene.',
        effect: {
            actions: 1,
            condition: { energy: -25, health: -6, morale: -3 },
        },
    },
    {
        id: 'private_coaching', name: 'Private Coaching Session', icon: '\u{1F9D1}\u{200D}\u{1F3EB}', cost: 1100,
        desc: 'Two hours with somebody who has already done it, aimed straight at the attribute your role lives on.',
        effect: {
            attrXP: { ROLE_PRIMARY: 2.4 },
            condition: { energy: -8 },
        },
    },
    {
        id: 'bootcamp_pass', name: 'Bootcamp Day Pass', icon: '\u{1F3E2}', cost: 1400,
        desc: 'Three weeks of access to a facility that does not belong to you. Exhausting, and it works.',
        effect: {
            condition: { energy: -12 },
            buff: { key: 'trainingMult', value: 0.22, weeks: 3, name: 'Bootcamp' },
        },
    },
    {
        // The gold answer to "my ceiling is the problem". The most expensive
        // thing on the page, and repeatable only up to CEILING_PURCHASE_MAX for
        // a whole career -- gold is renewable and a ceiling is not, so without
        // that bound a veteran with a decade of wages simply buys 99 in
        // everything. The first cut of this had no bound and did exactly that.
        id: 'performance_camp', name: 'Performance Camp', icon: '\u{1F3D4}', cost: 26000,
        desc: 'Ten days at altitude with sports scientists, a biomechanist and nobody to scrim. You come back with a different upper limit.',
        effect: {
            potentialXP: { ALL: 1 },
            condition: { energy: -25, form: -4 },
        },
    },
    {
        id: 'agent_retainer', name: 'Agent Retainer', icon: '\u{1F4BC}', cost: 1800,
        desc: 'Somebody else makes the calls for two months. The next number on the table is a better number.',
        effect: {
            buff: { key: 'offerBonus', value: 0.18, weeks: 8, name: 'Agent Working' },
        },
    },
];

export const CONSUMABLE_BY_ID = CONSUMABLES.reduce((m, x) => { m[x.id] = x; return m; }, {});

// ---------------------------------------------------------------------------
//  LIFESTYLE
//  Permanent, one-per-career, gated on followers rather than only on gold: a
//  rich academy player still cannot buy a penthouse nobody has heard of them in.
//  Some items chain via `requires` so the ladder reads as a life, not a menu.
//
//  effects keys:
//    energyRegen  flat energy back each week (summed)
//    extraActions flat weekly activity slots (summed - only one source exists)
//    moraleFloor  morale can never fall below this (MAX across owned items)
//    injuryResist 0..1 fraction of injury risk removed (summed, capped)
//    followerMult additive fraction, folded into a 1.0 baseline multiplier
//    trainingMult additive fraction, folded into a 1.0 baseline multiplier
//    offerBonus   additive fraction on incoming contract offers
// ---------------------------------------------------------------------------
export const LIFESTYLE = [
    {
        // reqAge: the career can start at thirteen. Moving out of the family home
        // and buying a car are not things the mode should sell to a child, and
        // the random-event pool has copy that assumes both.
        id: 'studio_flat', name: 'Studio Apartment', icon: '\u{1F3E0}', cost: 3500, reqFollowers: 0, reqAge: 17,
        desc: 'Out of the family living room. A door that closes is worth more than any peripheral on this page.',
        effects: { energyRegen: 3, moraleFloor: 20 },
    },
    {
        id: 'streaming_setup', name: 'Streaming Setup', icon: '\u{1F3A5}', cost: 9000, reqFollowers: 2000,
        desc: 'Lights, a real microphone and an encoder that does not eat your frames. Every hour live now counts for more.',
        effects: { followerMult: 0.30 },
    },
    {
        id: 'nutritionist', name: 'Nutritionist', icon: '\u{1F957}', cost: 11000, reqFollowers: 3000,
        desc: 'Somebody decides what is in the fridge. Boring, measurable, and the first thing every org pays for.',
        effects: { energyRegen: 4, injuryResist: 0.10 },
    },
    {
        id: 'personal_trainer', name: 'Personal Trainer', icon: '\u{1F3CB}', cost: 15000, reqFollowers: 6000,
        desc: 'Three sessions a week you will resent and then stop being able to play without.',
        effects: { energyRegen: 4, injuryResist: 0.18 },
    },
    {
        id: 'home_gym', name: 'Home Gym', icon: '\u{1F4AA}', cost: 17000, reqFollowers: 9000,
        desc: 'No commute, no excuse. Wrists, shoulders and back get their twenty minutes whether you feel like it or not.',
        effects: { energyRegen: 3, injuryResist: 0.20 },
    },
    {
        id: 'city_apartment', name: 'City Apartment', icon: '\u{1F3E2}', cost: 20000, reqFollowers: 20000,
        requires: 'studio_flat',
        desc: 'Two rooms, one of them for work. The first place that has ever felt like it was built for this job.',
        effects: { energyRegen: 4, moraleFloor: 32, trainingMult: 0.04 },
    },
    {
        id: 'psych_retainer', name: 'Psychologist on Retainer', icon: '\u{1F9E0}', cost: 28000, reqFollowers: 40000,
        desc: 'On call, not on a schedule. The bad weeks stop turning into bad splits.',
        effects: { moraleFloor: 42, trainingMult: 0.05 },
    },
    {
        id: 'gaming_house', name: 'Gaming House Suite', icon: '\u{1F3E1}', cost: 34000, reqFollowers: 60000,
        desc: 'A room in the team house with your name on the door. The commute is nine steps, and the nine steps are the point.',
        effects: { extraActions: 1, energyRegen: 3, trainingMult: 0.06 },
    },
    {
        id: 'private_chef', name: 'Private Chef', icon: '\u{1F468}\u{200D}\u{1F373}', cost: 38000, reqFollowers: 90000,
        requires: 'nutritionist',
        desc: 'The nutritionist writes it, somebody else cooks it, and you stop eating at two in the morning.',
        effects: { energyRegen: 5, injuryResist: 0.12, moraleFloor: 35 },
    },
    {
        id: 'car', name: 'The Car', icon: '\u{1F697}', cost: 45000, reqFollowers: 120000, reqAge: 18,
        desc: 'Nobody needs it. Everybody who can afford it buys it, and the garage photo does numbers.',
        effects: { moraleFloor: 30, followerMult: 0.10, energyRegen: 2 },
    },
    {
        id: 'manager', name: 'Personal Manager', icon: '\u{1F454}', cost: 65000, reqFollowers: 150000,
        desc: 'Contracts, sponsors, press and the people who want twenty minutes of your day. None of it reaches you first.',
        effects: { followerMult: 0.22, offerBonus: 0.12 },
    },
    {
        id: 'penthouse', name: 'Penthouse', icon: '\u{1F306}', cost: 120000, reqFollowers: 400000,
        requires: 'city_apartment',
        desc: 'The address is the point. You have won enough that where you sleep is now part of the story.',
        effects: { energyRegen: 6, moraleFloor: 45, trainingMult: 0.07, followerMult: 0.10 },
    },
];

export const LIFESTYLE_BY_ID = LIFESTYLE.reduce((m, x) => { m[x.id] = x; return m; }, {});

// ---------------------------------------------------------------------------
//  LEGACY PERKS
//  Bought with legacy points, which only awards and milestones grant. 107 LP
//  buys all thirteen and a full decade of winning does not get you there, so
//  these are the shape of the career you chose rather than a checklist.
//
//  effect keys are read by whichever module owns the mechanic - training.js
//  reads growthMult/ceilingBonus, transfers.js reads offerBonus/salaryMult,
//  the match engine reads clutchBonus/intlBonus. perkEffects() aggregates them.
// ---------------------------------------------------------------------------
export const LEGACY_PERKS = [
    {
        id: 'self_made', name: 'Self-Made', icon: '\u{1F4AA}', cost: 5, currency: 'legacy',
        desc: 'The unsigned soft cap moves from ' + UNSIGNED_SOFT_CAP + ' to ' + (UNSIGNED_SOFT_CAP + 8) + '. For the ones who never wanted a badge on the door.',
        effect: { unsignedCapBonus: 8 },
    },
    {
        id: 'crowd_favourite', name: 'Crowd Favourite', icon: '\u{1F4E3}', cost: 5, currency: 'legacy',
        desc: 'Followers arrive 35% faster and the crowd will not let your morale fall below 30.',
        effect: { followerMult: 0.35, moraleFloor: 30 },
    },
    {
        id: 'iron_wrists', name: 'Iron Wrists', icon: '\u{1F9BE}', cost: 6, currency: 'legacy',
        desc: 'Thirty percent less injury risk, permanently, and five energy back every week.',
        effect: { injuryResist: 0.30, energyRegen: 5 },
    },
    {
        id: 'mentor', name: 'Mentor', icon: '\u{1F393}', cost: 6, currency: 'legacy',
        desc: 'Rookies listen to you. Chemistry starts twelve points higher everywhere you sign, and teaching sharpens your own practice.',
        effect: { chemistryBonus: 12, trainingMult: 0.06 },
    },
    {
        id: 'hard_bargainer', name: 'Hard Bargainer', icon: '\u{1F4C4}', cost: 7, currency: 'legacy',
        desc: 'Every offer that reaches you is 20% better and every wage 10% higher. You read the whole contract now.',
        effect: { offerBonus: 0.20, salaryMult: 0.10 },
    },
    {
        id: 'market_darling', name: 'Market Darling', icon: '\u{1F4C8}', cost: 7, currency: 'legacy',
        desc: 'Your valuation carries a 25% premium orgs have stopped arguing about.',
        effect: { valueMult: 0.25, offerBonus: 0.10 },
    },
    {
        id: 'prodigy', name: 'Prodigy', icon: '\u{1F31F}', cost: 8, currency: 'legacy',
        desc: 'Everything you practise sticks 18% harder. Buy it early or do not buy it at all.',
        effect: { growthMult: 0.18 },
    },
    {
        id: 'ice_veins', name: 'Ice in the Veins', icon: '\u{2744}', cost: 8, currency: 'legacy',
        desc: 'Fifteen percent better in elimination games, and your form has a floor of 30 no matter what the split did to you.',
        effect: { clutchBonus: 0.15, formFloor: 30 },
    },
    {
        id: 'second_signature', name: 'Second Signature', icon: '\u{1F3AE}', cost: 9, currency: 'legacy',
        desc: 'A second champion you are trusted on. The comfort-pick bonus follows you through one more ban.',
        effect: { extraChampion: 1 },
    },
    {
        id: 'big_game', name: 'Big Game Player', icon: '\u{1F3C6}', cost: 10, currency: 'legacy',
        desc: 'Twelve percent better at MSI and Worlds. Some players are simply different in October.',
        effect: { intlBonus: 0.12, clutchBonus: 0.05 },
    },
    {
        id: 'late_bloomer', name: 'Late Bloomer', icon: '\u{1F551}', cost: 10, currency: 'legacy',
        desc: 'Age decay runs at 60% speed. Two or three extra seasons at a level worth watching.',
        effect: { decayMult: 0.60 },
    },
    {
        id: 'extra_hour', name: 'The Extra Hour', icon: '\u{23F0}', cost: 12, currency: 'legacy',
        desc: 'One more activity every single week, forever. The most expensive perk per word and the best one.',
        effect: { extraActions: 1 },
    },
    {
        id: 'evergreen', name: 'Evergreen', icon: '\u{1F332}', cost: 14, currency: 'legacy',
        desc: 'Three points of headroom added to every attribute ceiling. The only thing in the mode that raises the roof.',
        effect: { ceilingBonus: 3 },
    },
];

export const PERK_BY_ID = LEGACY_PERKS.reduce((m, x) => { m[x.id] = x; return m; }, {});

// ---------------------------------------------------------------------------
//  SPONSORS
//  Timed deals: a signing bonus up front and a weekly cheque until the term
//  runs out. Gated on followers and OVR together so a popular streamer and a
//  quiet world champion unlock different halves of the board.
//
//  Three at a time. Unlimited concurrent deals would out-earn a main-league
//  wage on their own and make the transfer market pointless.
// ---------------------------------------------------------------------------
export const MAX_ACTIVE_SPONSORS = 3;

export const SPONSORS = [
    {
        id: 'pcbang', name: 'Neon PC Bang', icon: '\u{1F5A5}', tier: 'Local', currency: 'sponsor',
        reqFollowers: 1000, reqOVR: 0, weekly: 120, signingBonus: 400, lengthWeeks: 20,
        desc: 'Free seat nine and your face on the window. Your first deal, and you will keep the photo.',
    },
    {
        id: 'voltcan', name: 'Voltcan Energy', icon: '\u{26A1}', tier: 'Local', currency: 'sponsor',
        reqFollowers: 6000, reqOVR: 55, weekly: 300, signingBonus: 1200, lengthWeeks: 20,
        desc: 'A pallet of cans a month and a clause about drinking them on camera.',
    },
    {
        id: 'apex_seating', name: 'Apex Seating', icon: '\u{1FA91}', tier: 'Regional', currency: 'sponsor',
        reqFollowers: 20000, reqOVR: 62, weekly: 700, signingBonus: 3000, lengthWeeks: 30,
        desc: 'They want the chair in frame. It is a good chair, so this is not a difficult ask.',
    },
    {
        id: 'klack_labs', name: 'Klack Labs', icon: '\u{2328}', tier: 'Regional', currency: 'sponsor',
        reqFollowers: 45000, reqOVR: 68, weekly: 1100, signingBonus: 6000, lengthWeeks: 30,
        desc: 'A boutique keyboard house that wants a real pro on the box. Switches tuned to your spec.',
    },
    {
        id: 'meridian', name: 'Meridian Telecom', icon: '\u{1F4F6}', tier: 'National', currency: 'sponsor',
        reqFollowers: 90000, reqOVR: 74, weekly: 1800, signingBonus: 12000, lengthWeeks: 40,
        desc: 'National carrier money. Two shoots a year and a billboard your parents will photograph.',
    },
    {
        id: 'fifth_wave', name: 'Fifth Wave Apparel', icon: '\u{1F455}', tier: 'National', currency: 'sponsor',
        reqFollowers: 160000, reqOVR: 78, weekly: 2400, signingBonus: 18000, lengthWeeks: 40,
        desc: 'A capsule collection with your handle on the hem. It sells out and nobody is more surprised than you.',
    },
    {
        id: 'vantage_tv', name: 'Vantage.tv Exclusive', icon: '\u{1F3A5}', tier: 'Global', currency: 'sponsor',
        reqFollowers: 400000, reqOVR: 0, weekly: 3000, signingBonus: 25000, lengthWeeks: 40,
        desc: 'Platform exclusivity. Pure audience play - they do not care what you place, only who watches.',
    },
    {
        id: 'kestrel', name: 'Kestrel Motors', icon: '\u{1F697}', tier: 'Global', currency: 'sponsor',
        reqFollowers: 320000, reqOVR: 84, weekly: 3400, signingBonus: 30000, lengthWeeks: 40,
        desc: 'The kind of deal that used to go to footballers. One car, one advert, one very long contract.',
    },
    {
        id: 'solstice', name: 'Solstice Bank', icon: '\u{1F3E6}', tier: 'Global', currency: 'sponsor',
        reqFollowers: 500000, reqOVR: 87, weekly: 4200, signingBonus: 45000, lengthWeeks: 40,
        desc: 'A bank has decided you are respectable. Somewhere, an eighteen-year-old is laughing at you.',
    },
    {
        id: 'hyperax', name: 'HYPERAX Peripherals', icon: '\u{1F5B1}', tier: 'Global', currency: 'sponsor',
        reqFollowers: 750000, reqOVR: 90, weekly: 5500, signingBonus: 70000, lengthWeeks: 40,
        desc: 'A signature line. Your name is on hardware that will outlast your career, which is the actual prize.',
    },
];

export const SPONSOR_BY_ID = SPONSORS.reduce((m, x) => { m[x.id] = x; return m; }, {});

// ---------------------------------------------------------------------------
//  FLAVOUR - real cards for news copy
//  The VOD package headline names an actual pro. window.playerDatabase is loaded
//  by a plain <script> tag and career mode can be opened before it lands, so
//  getDB() returning null is a normal state, not an error.
// ---------------------------------------------------------------------------
const FALLBACK_PROS = {
    LCK: ['Faker', 'Chovy', 'Zeus', 'Keria', 'Peanut'],
    LPL: ['Bin', 'Knight', 'Ruler', 'JackeyLove', 'Xiaohu'],
    LEC: ['Caps', 'Rekkles', 'Jankos', 'Hans Sama', 'Mikyx'],
    LCS: ['Bjergsen', 'CoreJJ', 'Blaber', 'Doublelift', 'Impact'],
    LCP: ['Maple', 'Levi', 'Betty', 'Karsa', 'Evi'],
};

function sampleProName(region) {
    const db = getDB();
    if (db && db.length) {
        // Era 5+ keeps the reference contemporary; 88+ keeps it worth studying.
        let pool = db.filter(x => x && x.role !== 'COACH' && x.region === region
            && getEra(x.year) >= 5 && getEffectiveRating(x) >= 88);
        if (!pool.length) pool = db.filter(x => x && x.role !== 'COACH' && getEffectiveRating(x) >= 92);
        if (pool.length) return pick(pool).name;
    }
    const list = FALLBACK_PROS[region] || FALLBACK_PROS.LEC;
    return pick(list);
}

// ---------------------------------------------------------------------------
//  BUFFS
//  Timed modifiers dropped by consumables. Stored on c.buffs, which blankCareer()
//  does not declare - it is created lazily so an old save picks it up for free.
// ---------------------------------------------------------------------------
export function activeBuffs(c) {
    const s = st(c);
    const w = weekOf(s);
    const list = Array.isArray(s && s.buffs) ? s.buffs : [];
    return list.filter(b => b && (Number(b.endWeekAbs) || 0) > w);
}

/** Total value of every live buff with this key. Absent keys read as 0. */
export function buffValue(c, key) {
    return activeBuffs(c).reduce((sum, b) => sum + (b.key === key ? (Number(b.value) || 0) : 0), 0);
}

/** Pure: the buff list with everything finished stripped out. */
export function expireBuffs(c) {
    const s = st(c);
    const w = weekOf(s);
    const list = Array.isArray(s && s.buffs) ? s.buffs : [];
    return list.filter(b => b && (Number(b.endWeekAbs) || 0) > w);
}

function pushBuff(spec) {
    career.update(c => {
        const w = weekOf(c);
        const live = (Array.isArray(c.buffs) ? c.buffs : []).filter(b => b && (Number(b.endWeekAbs) || 0) > w);
        const entry = {
            id: `b${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            key: spec.key,
            name: spec.name || spec.key,
            value: Number(spec.value) || 0,
            startWeekAbs: w,
            endWeekAbs: w + Math.max(1, Math.round(Number(spec.weeks) || 1)),
        };
        // Re-buying the same buff refreshes rather than stacks - otherwise ten
        // bootcamp passes in one week is a 220% training multiplier.
        return { ...c, buffs: [...live.filter(b => b.key !== entry.key), entry] };
    });
}

// ---------------------------------------------------------------------------
//  AGGREGATED EFFECTS
// ---------------------------------------------------------------------------
/** Owned tier object for one gear category, or null if nothing is owned. */
export function ownedGear(c, categoryId) {
    const s = st(c);
    const cat = GEAR_BY_ID[categoryId];
    if (!cat) return null;
    const tier = Math.round(Number(s?.inventory?.gear?.[categoryId]) || 0);
    if (tier < 1) return null;
    return cat.tiers[Math.min(tier, GEAR_MAX_TIER) - 1] || null;
}

/**
 * Training multiplier from gear, 1.0 baseline. A full tier-5 desk is ~1.34,
 * which sits deliberately just above a main-league club's 1.25 facility bonus:
 * hardware you own should matter about as much as the building you train in.
 */
export function gearTrainingBonus(c) {
    const s = st(c);
    let mult = 1;
    for (const cat of GEAR) {
        const t = ownedGear(s, cat.id);
        if (t) mult += Number(t.trainingBonus) || 0;
    }
    return Math.round(mult * 1000) / 1000;
}

/**
 * Flat attribute bonus from gear, as a full eight-key map.
 *
 * IMPORTANT: this is a MATCH-TIME PERFORMANCE bonus. It is never written into
 * player.attrs, it does not raise OVR, it does not count toward a potential
 * ceiling, and it disappears the instant the gear changes. The match engine adds
 * it to the attributes it scores a game with and nothing else may apply it -
 * anything that persists it is a bug that will inflate the player permanently.
 *
 * A complete tier-5 desk is worth about +4 effective OVR in-game for ~137k gold.
 */
export function gearAttrBonus(c) {
    const s = st(c);
    const out = emptyAttrs(0);
    for (const cat of GEAR) {
        const t = ownedGear(s, cat.id);
        if (!t || !t.attrBonus) continue;
        for (const k of ATTR_KEYS) {
            if (typeof t.attrBonus[k] === 'number') out[k] += t.attrBonus[k];
        }
    }
    return out;
}

/** Flat weekly energy returned by gear alone. Full tier-5 desk is +12. */
export function gearEnergyBonus(c) {
    const s = st(c);
    let total = 0;
    for (const cat of GEAR) {
        const t = ownedGear(s, cat.id);
        if (t) total += Number(t.energyBonus) || 0;
    }
    return total;
}

function ownedLifestyleItems(c) {
    const s = st(c);
    const owned = (s && s.inventory && s.inventory.lifestyle) || {};
    return LIFESTYLE.filter(x => !!owned[x.id]);
}

/**
 * Everything the lifestyle ladder does, aggregated.
 *
 * followerMult and trainingMult come back as MULTIPLIERS with a 1.0 baseline;
 * every other number is flat. moraleFloor takes the maximum rather than the sum
 * (floors do not add), injuryResist sums but is capped at 0.75 so no amount of
 * money makes a player literally unbreakable.
 *
 * Fully kitted, energyRegen reaches +34/week on top of gear's +12. That is close
 * to fatigue-neutral for a four-action week and it is meant to be: it costs the
 * better part of 400k gold and several hundred thousand followers to get there.
 */
export function lifestyleEffects(c) {
    const items = ownedLifestyleItems(c);
    const out = {
        energyRegen: 0, extraActions: 0, moraleFloor: 0,
        injuryResist: 0, followerMult: 1, trainingMult: 1, offerBonus: 0,
    };
    let followerAdd = 0;
    let trainingAdd = 0;
    for (const it of items) {
        const e = it.effects || {};
        out.energyRegen += Number(e.energyRegen) || 0;
        out.extraActions += Number(e.extraActions) || 0;
        out.injuryResist += Number(e.injuryResist) || 0;
        out.offerBonus += Number(e.offerBonus) || 0;
        followerAdd += Number(e.followerMult) || 0;
        trainingAdd += Number(e.trainingMult) || 0;
        if ((Number(e.moraleFloor) || 0) > out.moraleFloor) out.moraleFloor = Number(e.moraleFloor) || 0;
    }
    out.injuryResist = r3(clamp(out.injuryResist, 0, 0.75));
    out.offerBonus = r3(out.offerBonus);
    out.followerMult = r3(1 + followerAdd);
    out.trainingMult = r3(1 + trainingAdd);
    return out;
}

/** Same number lifestyleEffects().trainingMult reports, as its own export. */
export function lifestyleTrainingBonus(c) {
    return lifestyleEffects(c).trainingMult;
}

/**
 * Legacy perks, aggregated. Same convention as lifestyleEffects(): growthMult,
 * trainingMult and followerMult are multipliers on a 1.0 baseline, decayMult is
 * a multiplier where LOWER is better (Late Bloomer makes it 0.60), floors take
 * the maximum, everything else is flat or an additive fraction.
 */
export function perkEffects(c) {
    const s = st(c);
    const owned = Array.isArray(s?.inventory?.perks) ? s.inventory.perks : [];
    const out = {
        growthMult: 1, trainingMult: 1, followerMult: 1, decayMult: 1,
        unsignedCapBonus: 0, ceilingBonus: 0, extraActions: 0,
        offerBonus: 0, salaryMult: 0, valueMult: 0, extraChampion: 0,
        injuryResist: 0, energyRegen: 0, chemistryBonus: 0,
        moraleFloor: 0, formFloor: 0, clutchBonus: 0, intlBonus: 0,
    };
    let growthAdd = 0, trainingAdd = 0, followerAdd = 0;
    for (const id of owned) {
        const perk = PERK_BY_ID[id];
        if (!perk) continue;
        const e = perk.effect || {};
        growthAdd += Number(e.growthMult) || 0;
        trainingAdd += Number(e.trainingMult) || 0;
        followerAdd += Number(e.followerMult) || 0;
        if (typeof e.decayMult === 'number') out.decayMult *= e.decayMult;
        out.unsignedCapBonus += Number(e.unsignedCapBonus) || 0;
        out.ceilingBonus += Number(e.ceilingBonus) || 0;
        out.extraActions += Number(e.extraActions) || 0;
        out.offerBonus += Number(e.offerBonus) || 0;
        out.salaryMult += Number(e.salaryMult) || 0;
        out.valueMult += Number(e.valueMult) || 0;
        out.extraChampion += Number(e.extraChampion) || 0;
        out.injuryResist += Number(e.injuryResist) || 0;
        out.energyRegen += Number(e.energyRegen) || 0;
        out.chemistryBonus += Number(e.chemistryBonus) || 0;
        out.clutchBonus += Number(e.clutchBonus) || 0;
        out.intlBonus += Number(e.intlBonus) || 0;
        if ((Number(e.moraleFloor) || 0) > out.moraleFloor) out.moraleFloor = Number(e.moraleFloor) || 0;
        if ((Number(e.formFloor) || 0) > out.formFloor) out.formFloor = Number(e.formFloor) || 0;
    }
    out.growthMult = r3(1 + growthAdd);
    out.trainingMult = r3(1 + trainingAdd);
    out.followerMult = r3(1 + followerAdd);
    out.decayMult = r3(out.decayMult);
    out.injuryResist = r3(clamp(out.injuryResist, 0, 0.75));
    out.offerBonus = r3(out.offerBonus);
    out.salaryMult = r3(out.salaryMult);
    out.valueMult = r3(out.valueMult);
    out.clutchBonus = r3(out.clutchBonus);
    out.intlBonus = r3(out.intlBonus);
    return out;
}

/** Combined multiplier on anything that grants followers. */
export function followerMultiplier(c) {
    const s = st(c);
    return Math.round(lifestyleEffects(s).followerMult * perkEffects(s).followerMult * 1000) / 1000;
}

/** The unsigned attribute soft cap this player actually runs into. Reads the
 *  value written onto the player when Self-Made was bought, so it agrees with
 *  ratings.environmentCap() rather than being a second opinion. */
export function unsignedCapFor(c) {
    const s = st(c);
    const own = Number(s && s.player && s.player.softCap);
    if (Number.isFinite(own) && own > 0) return own;
    return UNSIGNED_SOFT_CAP + perkEffects(s).unsignedCapBonus;
}

// ---------------------------------------------------------------------------
//  INCOME
// ---------------------------------------------------------------------------
/** Sponsor deals whose term has not run out yet. */
export function activeSponsors(c) {
    const s = st(c);
    const w = weekOf(s);
    const list = Array.isArray(s && s.sponsors) ? s.sponsors : [];
    return list.filter(x => x && (Number(x.endWeekAbs) || 0) > w);
}

/** Pure: the sponsor list with finished deals removed. */
export function expireSponsors(c) {
    return activeSponsors(c);
}

/**
 * What lands in the bank at the end of this week.
 * Reads the signed contract's salary when there is one - the negotiated number
 * beats the theoretical one - and falls back to weeklySalaryFor() so a club
 * placement made by the engine without a contract object still pays.
 */
export function weeklyIncome(c) {
    const s = st(c);
    const p = (s && s.player) || {};
    let salary = 0;

    const contracted = Number(p.contract && p.contract.salary);
    if (Number.isFinite(contracted) && contracted > 0) {
        salary = Math.round(contracted);
    } else if (p.clubId) {
        salary = weeklySalaryFor({
            ovr: calcOVR(p.attrs, p.role),
            clubTier: p.clubTier || 2,
            region: p.region,
            age: p.age,
            status: p.status,
            potentialOVR: calcOVR(p.potential, p.role),
        });
    }

    salary = Math.round(salary * (1 + perkEffects(s).salaryMult));
    const sponsors = activeSponsors(s).reduce((sum, x) => sum + (Number(x.weekly) || 0), 0);
    return { salary, sponsors, total: salary + sponsors };
}

// ---------------------------------------------------------------------------
//  PURCHASING - GEAR
// ---------------------------------------------------------------------------
/**
 * Buy the next tier of one gear category. Tiers must be bought in order: you
 * cannot jump a 12-year-old straight onto a 55k workstation, and paying through
 * every rung is most of what makes the ladder cost anything.
 */
export function buyGear(categoryId, tier) {
    const cat = GEAR_BY_ID[categoryId];
    if (!cat) return fail('No such gear.');

    const c = snapshot();
    const owned = Math.round(Number(c?.inventory?.gear?.[categoryId]) || 0);
    const want = Math.round(Number(tier) || 0);

    if (want < 1 || want > GEAR_MAX_TIER) return fail('That tier does not exist.');
    if (want <= owned) return fail(`You already own ${cat.tiers[want - 1].name}.`);
    if (want !== owned + 1) {
        return fail(`Buy ${cat.tiers[owned].name} first - gear upgrades one tier at a time.`);
    }

    const item = cat.tiers[want - 1];
    if (!spendGold(item.cost)) {
        return fail(`Not enough gold. ${cat.name} tier ${want} costs ${fmtGold(item.cost)}.`);
    }

    setGearTier(categoryId, want);
    addNews(`Upgraded to a ${item.name} (${cat.name}, tier ${want}) for ${fmtGold(item.cost)} gold.`, 'money');
    playSound(want >= GEAR_MAX_TIER ? 'rare' : 'claim');
    saveCareer();
    return done(`${item.name} installed. ${cat.name} is now tier ${want}.`);
}

// ---------------------------------------------------------------------------
//  PURCHASING - CONSUMABLES
// ---------------------------------------------------------------------------
export function buyConsumable(id, qty = 1) {
    const item = CONSUMABLE_BY_ID[id];
    if (!item) return fail('No such item.');

    const n = Math.max(1, Math.round(Number(qty) || 1));
    const total = item.cost * n;
    if (!spendGold(total)) {
        return fail(`Not enough gold. ${n} x ${item.name} costs ${fmtGold(total)}.`);
    }

    addConsumable(id, n);
    playSound('claim');
    saveCareer();
    return done(n > 1
        ? `Bought ${n} x ${item.name} for ${fmtGold(total)} gold.`
        : `Bought ${item.name} for ${fmtGold(total)} gold.`);
}

/** The attribute a role's rating leans on hardest - the ROLE_PRIMARY target. */
function rolePrimaryAttr(roleId) {
    const role = ROLE_BY_ID[roleId] || ROLE_BY_ID.MID;
    let best = ATTR_KEYS[0];
    let bestW = -1;
    for (const k of ATTR_KEYS) {
        const w = role.weights[k] || 0;
        if (w > bestW) { bestW = w; best = k; }
    }
    return best;
}

/** Expand the attrXP map's special keys into concrete { attrKey: points }. */
function resolveAttrXP(map, roleId) {
    const out = {};
    if (!map) return out;
    for (const rawKey of Object.keys(map)) {
        const points = Number(map[rawKey]) || 0;
        if (points === 0) continue;
        if (rawKey === 'ALL') {
            for (const k of ATTR_KEYS) out[k] = (out[k] || 0) + points;
        } else if (rawKey === 'ROLE_PRIMARY') {
            const k = rolePrimaryAttr(roleId);
            out[k] = (out[k] || 0) + points;
        } else if (ATTR_KEYS.includes(rawKey)) {
            out[rawKey] = (out[rawKey] || 0) + points;
        }
    }
    return out;
}

/**
 * Consume one of `id` and apply its effect block. Everything is driven off the
 * data in CONSUMABLES - there is no per-item branching here, so a new item is a
 * data edit and nothing else.
 */
export function useConsumable(id) {
    const item = CONSUMABLE_BY_ID[id];
    if (!item) return fail('No such item.');

    const c = snapshot();
    const held = Math.round(Number(c?.inventory?.consumables?.[id]) || 0);
    if (held < 1) return fail(`You have no ${item.name} left.`);

    const eff = item.effect || {};
    if (eff.needsClub && !c.player.clubId) {
        return fail(`${item.name} needs a roster to use it on.`);
    }

    // Bought ceiling is bounded for a whole career. Checked BEFORE the item is
    // consumed, so a player at the limit keeps the item and their gold rather
    // than paying for nothing.
    const ceilingSpent = Math.max(0, Number(c?.flags?.boughtCeilingOVR) || 0);
    if (eff.potentialXP && ceilingSpent >= CEILING_PURCHASE_MAX) {
        return fail(`There is nothing left for a camp to find. You have taken ${CEILING_PURCHASE_MAX} rating of ceiling this way already.`);
    }

    const parts = [];

    // Condition meters.
    if (eff.condition) {
        for (const field of ['energy', 'morale', 'health', 'form']) {
            const d = Number(eff.condition[field]) || 0;
            if (!d) continue;
            adjustCondition(field, d);
            parts.push(`${d > 0 ? '+' : ''}${d} ${field}`);
        }
    }

    // Attribute points. applyAttrGain() puts them through the same diminishing
    // curve as training, so a consumable is worthless once you are at your
    // ceiling - exactly like a drill would be.
    const xp = resolveAttrXP(eff.attrXP, c.player.role);
    for (const k of Object.keys(xp)) {
        const applied = applyAttrGain(k, xp[k]);
        if (applied > 0) parts.push(`+${applied} ${k.toUpperCase()}`);
    }

    // Ceiling points. Unlike attrXP these are NOT put through gainCurve - they
    // move potential itself, which is the whole reason to buy them.
    if (eff.potentialXP) {
        const potBefore = calcOVR(c.player.potential, c.player.role);
        const rose = raisePotential(resolveAttrXP(eff.potentialXP, c.player.role));
        const roseKeys = Object.keys(rose);
        if (roseKeys.length) {
            const potAfter = calcOVR(snapshot().player.potential, c.player.role);
            career.update(x => ({
                ...x,
                flags: { ...x.flags, boughtCeilingOVR: ceilingSpent + Math.max(0, potAfter - potBefore) },
            }));
            parts.push(roseKeys.length === ATTR_KEYS.length
                ? `+${rose[roseKeys[0]]} to every ceiling`
                : roseKeys.map(k => `+${rose[k]} ${k.toUpperCase()} ceiling`).join(', '));
        }
    }

    if (eff.chemistry) {
        const d = Number(eff.chemistry) || 0;
        career.update(x => ({
            ...x,
            player: { ...x.player, chemistry: clamp((x.player.chemistry || 0) + d, 0, 100) },
        }));
        parts.push(`${d > 0 ? '+' : ''}${d} chemistry`);
    }

    if (eff.followers) {
        const gained = Math.round((Number(eff.followers) || 0) * followerMultiplier(c));
        grantFollowers(gained);
        parts.push(`+${fmtFollowers(gained)} followers`);
    }

    if (eff.gold) {
        const g = grantGold(eff.gold);
        parts.push(`${g > 0 ? '+' : ''}${fmtGold(g)} gold`);
    }

    if (eff.actions) {
        const n = Math.max(1, Math.round(Number(eff.actions) || 1));
        career.update(x => ({
            ...x,
            weekly: { ...x.weekly, actionsLeft: (x.weekly.actionsLeft || 0) + n },
        }));
        parts.push(`+${n} activity slot${n > 1 ? 's' : ''}`);
    }

    if (eff.buff && eff.buff.key) {
        pushBuff(eff.buff);
        parts.push(`${eff.buff.name || eff.buff.key} for ${Math.max(1, Math.round(Number(eff.buff.weeks) || 1))}w`);
    }

    addConsumable(id, -1);

    // The one place the card database earns its keep in this module.
    if (id === 'vod_package') {
        addNews(`Watched a cut of ${sampleProName(c.player.region)} VODs until the patterns stopped looking like luck.`, 'training');
    } else {
        addNews(`Used ${item.name}.`, 'system');
    }

    playSound('click');
    saveCareer();
    return done(parts.length ? `${item.name}: ${parts.join(', ')}.` : `${item.name} used.`);
}

// ---------------------------------------------------------------------------
//  PURCHASING - LIFESTYLE
// ---------------------------------------------------------------------------
/** Why an age-gated lifestyle item is not available yet, or null. Exported so
 *  the shop can render the same reason it would refuse the purchase with. */
export function lifestyleAgeGate(c, item) {
    const need = Number(item && item.reqAge) || 0;
    if (!need) return null;
    const age = Math.round(Number(c && c.player && c.player.age) || 0);
    if (age >= need) return null;
    return `${item.name} is not something you can sign for at ${age}. Come back at ${need}.`;
}

export function buyLifestyle(id) {
    const item = LIFESTYLE_BY_ID[id];
    if (!item) return fail('No such upgrade.');

    const c = snapshot();
    if (c?.inventory?.lifestyle?.[id]) return fail(`You already have the ${item.name}.`);

    if (item.requires) {
        const need = LIFESTYLE_BY_ID[item.requires];
        if (need && !c?.inventory?.lifestyle?.[item.requires]) {
            return fail(`${item.name} needs the ${need.name} first.`);
        }
    }

    const followers = Math.max(0, Math.round(Number(c?.money?.followers) || 0));
    if (followers < item.reqFollowers) {
        return fail(`${item.name} needs ${fmtFollowers(item.reqFollowers)} followers - you have ${fmtFollowers(followers)}.`);
    }

    const ageGate = lifestyleAgeGate(c, item);
    if (ageGate) return fail(ageGate);

    if (!spendGold(item.cost)) {
        return fail(`Not enough gold. ${item.name} costs ${fmtGold(item.cost)}.`);
    }

    setLifestyle(id, 1);
    addNews(`${item.name} - ${fmtGold(item.cost)} gold. Permanent.`, 'money');
    playSound('rare');
    saveCareer();
    return done(`${item.name} is yours. That one is permanent.`);
}

// ---------------------------------------------------------------------------
//  PURCHASING - LEGACY PERKS
// ---------------------------------------------------------------------------
/**
 * Perks whose effect is a ONE-OFF WRITE rather than a multiplier read live.
 *
 * ceilingBonus and unsignedCapBonus were aggregated by perkEffects() and then
 * read by nothing at all, which made Evergreen (14 legacy, the most expensive
 * perk in the mode, sold as "the only thing that raises the roof") and Self-Made
 * (8 points of unsigned soft cap) do literally nothing. They are applied here
 * instead of being derived, so that player.potential stays the single source of
 * truth for the ceiling and the two systems can never disagree.
 */
function isPermanentPerk(id) {
    const e = (PERK_BY_ID[id] && PERK_BY_ID[id].effect) || {};
    return (Number(e.ceilingBonus) || 0) > 0 || (Number(e.unsignedCapBonus) || 0) > 0;
}

function applyPermanentPerk(id) {
    const e = (PERK_BY_ID[id] && PERK_BY_ID[id].effect) || {};
    const ceil = Number(e.ceilingBonus) || 0;
    if (ceil > 0) {
        const bonus = {};
        for (const k of ATTR_KEYS) bonus[k] = ceil;
        raisePotential(bonus);
    }
    const cap = Number(e.unsignedCapBonus) || 0;
    if (cap > 0) setSoftCap(UNSIGNED_SOFT_CAP + cap);
}

/**
 * Apply any permanent perk the save owns but has never had applied. Idempotent
 * and cheap, and it is what backfills a career that bought Evergreen back when
 * the perk did nothing. There is no save migration mechanism in this mode, so
 * the reconciliation has to be inferable from the state itself.
 */
export function reconcilePermanentPerks() {
    const c = snapshot();
    if (!c || !c.created) return [];
    const owned = Array.isArray(c.inventory && c.inventory.perks) ? c.inventory.perks : [];
    const already = Array.isArray(c.flags && c.flags.perksApplied) ? c.flags.perksApplied : [];
    const todo = owned.filter(id => isPermanentPerk(id) && !already.includes(id));
    if (!todo.length) return [];

    for (const id of todo) applyPermanentPerk(id);
    career.update(x => ({
        ...x,
        flags: { ...x.flags, perksApplied: [...already, ...todo] },
    }));
    return todo;
}

export function buyPerk(id) {
    const perk = PERK_BY_ID[id];
    if (!perk) return fail('No such perk.');

    const c = snapshot();
    const owned = Array.isArray(c?.inventory?.perks) ? c.inventory.perks : [];
    if (owned.includes(id)) return fail(`${perk.name} is already unlocked.`);

    const have = Math.max(0, Math.round(Number(c?.money?.legacy) || 0));
    if (!spendLegacy(perk.cost)) {
        return fail(`${perk.name} costs ${perk.cost} legacy - you have ${have}.`);
    }

    addPerk(id);
    if (isPermanentPerk(id)) {
        applyPermanentPerk(id);
        career.update(x => {
            const already = Array.isArray(x.flags && x.flags.perksApplied) ? x.flags.perksApplied : [];
            return already.includes(id)
                ? x
                : { ...x, flags: { ...x.flags, perksApplied: [...already, id] } };
        });
    }
    addNews(`Legacy perk unlocked: ${perk.name}.`, 'award');
    playSound('rare');
    saveCareer();
    return done(`${perk.name} unlocked.`);
}

// ---------------------------------------------------------------------------
//  SPONSORS
// ---------------------------------------------------------------------------
function sponsorGate(c, s) {
    const followers = Math.max(0, Math.round(Number(c?.money?.followers) || 0));
    const ovr = calcOVR(c?.player?.attrs, c?.player?.role);
    if (followers < s.reqFollowers) {
        return `Needs ${fmtFollowers(s.reqFollowers)} followers (you have ${fmtFollowers(followers)}).`;
    }
    if (s.reqOVR && ovr < s.reqOVR) {
        return `Needs ${s.reqOVR} OVR (you are ${ovr}).`;
    }
    return null;
}

/**
 * Deals the player qualifies for and is not currently signed to. An expired deal
 * becomes available again on purpose - renewing a sponsor at the end of a term
 * is how the real thing works and it gives lapsed veterans something to chase.
 */
export function availableSponsors(c) {
    const s = st(c);
    const signed = new Set(activeSponsors(s).map(x => x.id));
    return SPONSORS.filter(x => !signed.has(x.id) && sponsorGate(s, x) === null);
}

export function signSponsor(id) {
    const deal = SPONSOR_BY_ID[id];
    if (!deal) return fail('No such sponsor.');

    const c = snapshot();
    const live = activeSponsors(c);
    if (live.some(x => x.id === id)) return fail(`You are already signed with ${deal.name}.`);
    if (live.length >= MAX_ACTIVE_SPONSORS) {
        return fail(`You can only carry ${MAX_ACTIVE_SPONSORS} sponsors at once. Wait for one to run out.`);
    }

    const gate = sponsorGate(c, deal);
    if (gate) return fail(gate);

    const startWeekAbs = weekOf(c);
    const entry = {
        id: deal.id,
        name: deal.name,
        icon: deal.icon,
        tier: deal.tier,
        weekly: deal.weekly,
        signingBonus: deal.signingBonus,
        startWeekAbs,
        endWeekAbs: startWeekAbs + deal.lengthWeeks,
    };

    career.update(x => {
        const kept = (Array.isArray(x.sponsors) ? x.sponsors : [])
            .filter(sp => sp && (Number(sp.endWeekAbs) || 0) > startWeekAbs && sp.id !== deal.id);
        return { ...x, sponsors: [...kept, entry] };
    });

    grantGold(deal.signingBonus);
    addNews(
        `Signed with ${deal.name} - ${fmtGold(deal.signingBonus)} up front, ${fmtGold(deal.weekly)} a week for ${deal.lengthWeeks} weeks.`,
        'money',
    );
    playSound('rare');
    saveCareer();
    return done(`${deal.name} deal signed. ${fmtGold(deal.signingBonus)} gold banked.`);
}

// ---------------------------------------------------------------------------
//  SHOP VIEW MODEL
//  shopSections() hands the Shop screen a finished object: every gate is already
//  resolved so the component only ever renders flags, never re-derives rules.
// ---------------------------------------------------------------------------
function gearSection(c) {
    const gold = Math.max(0, Math.round(Number(c?.money?.gold) || 0));
    const items = GEAR.map(cat => {
        const ownedTier = Math.round(Number(c?.inventory?.gear?.[cat.id]) || 0);
        const next = ownedTier < GEAR_MAX_TIER ? cat.tiers[ownedTier] : null;
        const maxed = ownedTier >= GEAR_MAX_TIER;

        const tiers = cat.tiers.map(t => {
            const isOwned = t.tier <= ownedTier;
            const isNext = t.tier === ownedTier + 1;
            const affordable = gold >= t.cost;
            let lockReason = '';
            if (!isOwned && !isNext) lockReason = `Buy tier ${t.tier - 1} first`;
            else if (isNext && !affordable) lockReason = `Need ${fmtGold(t.cost - gold)} more gold`;
            return {
                ...t,
                currency: 'gold',
                owned: isOwned,
                current: t.tier === ownedTier,
                next: isNext,
                affordable,
                locked: !isOwned && !(isNext && affordable),
                lockReason,
            };
        });

        return {
            kind: 'gear',
            id: cat.id,
            name: cat.name,
            icon: cat.icon,
            desc: cat.desc,
            currency: 'gold',
            ownedTier,
            maxTier: GEAR_MAX_TIER,
            current: ownedTier > 0 ? cat.tiers[ownedTier - 1] : null,
            tier: next,
            cost: next ? next.cost : 0,
            owned: maxed,
            affordable: !!next && gold >= next.cost,
            locked: maxed || !next || gold < next.cost,
            lockReason: maxed ? 'Fully upgraded' : (next && gold < next.cost ? `Need ${fmtGold(next.cost - gold)} more gold` : ''),
            tiers,
        };
    });

    return {
        id: 'gear',
        name: 'Gear',
        blurb: 'Six things on your desk, five tiers each, bought in order. Hardware raises training and how you perform in a game - it never raises your rating on its own.',
        currency: 'gold',
        items,
    };
}

function consumableSection(c) {
    const gold = Math.max(0, Math.round(Number(c?.money?.gold) || 0));
    const hasClub = !!(c && c.player && c.player.clubId);

    const items = CONSUMABLES.map(item => {
        const held = Math.round(Number(c?.inventory?.consumables?.[item.id]) || 0);
        const affordable = gold >= item.cost;
        const needsClub = !!(item.effect && item.effect.needsClub);
        const clubLocked = needsClub && !hasClub;
        let lockReason = '';
        if (clubLocked) lockReason = 'Needs a club';
        else if (!affordable) lockReason = `Need ${fmtGold(item.cost - gold)} more gold`;
        return {
            kind: 'consumable',
            ...item,
            currency: 'gold',
            held,
            usable: held > 0 && !clubLocked,
            owned: held > 0,
            affordable,
            locked: clubLocked || !affordable,
            lockReason,
        };
    });

    return {
        id: 'consumables',
        name: 'Consumables',
        blurb: 'Single use, bought in bulk, kept in the bag until the week you need them. Nothing here is a substitute for training - it is a way to survive the week you cannot train.',
        currency: 'gold',
        items,
    };
}

function lifestyleSection(c) {
    const gold = Math.max(0, Math.round(Number(c?.money?.gold) || 0));
    const followers = Math.max(0, Math.round(Number(c?.money?.followers) || 0));
    const ownedMap = (c && c.inventory && c.inventory.lifestyle) || {};

    const items = LIFESTYLE.map(item => {
        const owned = !!ownedMap[item.id];
        const prereq = item.requires ? LIFESTYLE_BY_ID[item.requires] : null;
        const prereqMissing = !!(prereq && !ownedMap[item.requires]);
        const famous = followers >= item.reqFollowers;
        const affordable = gold >= item.cost;

        let lockReason = '';
        if (owned) lockReason = '';
        else if (prereqMissing) lockReason = `Needs ${prereq.name}`;
        else if (!famous) lockReason = `Needs ${fmtFollowers(item.reqFollowers)} followers`;
        else if (!affordable) lockReason = `Need ${fmtGold(item.cost - gold)} more gold`;

        return {
            kind: 'lifestyle',
            ...item,
            currency: 'gold',
            owned,
            affordable,
            locked: !owned && (prereqMissing || !famous || !affordable),
            lockReason,
        };
    });

    return {
        id: 'lifestyle',
        name: 'Lifestyle',
        blurb: 'Permanent, one each, and gated on how many people know your name as much as on what is in the bank. This is where the money you never spend goes.',
        currency: 'gold',
        items,
    };
}

function perkSection(c) {
    const legacy = Math.max(0, Math.round(Number(c?.money?.legacy) || 0));
    const ownedPerks = Array.isArray(c?.inventory?.perks) ? c.inventory.perks : [];

    const items = LEGACY_PERKS.map(perk => {
        const owned = ownedPerks.includes(perk.id);
        const affordable = legacy >= perk.cost;
        return {
            kind: 'perk',
            ...perk,
            currency: 'legacy',
            owned,
            affordable,
            locked: !owned && !affordable,
            lockReason: owned ? '' : (!affordable ? `Need ${perk.cost - legacy} more legacy` : ''),
        };
    });

    return {
        id: 'perks',
        name: 'Legacy Perks',
        blurb: 'Bought with legacy points, which only trophies and awards pay out. Permanent, career-defining, and there is not enough legacy in a decade to buy them all.',
        currency: 'legacy',
        items,
    };
}

function sponsorSection(c) {
    const live = activeSponsors(c);
    const signedIds = new Set(live.map(x => x.id));
    const slotsFull = live.length >= MAX_ACTIVE_SPONSORS;
    const w = weekOf(c);

    const items = SPONSORS.map(deal => {
        const active = live.find(x => x.id === deal.id) || null;
        const gate = sponsorGate(c, deal);
        let lockReason = '';
        if (active) lockReason = '';
        else if (gate) lockReason = gate;
        else if (slotsFull) lockReason = `All ${MAX_ACTIVE_SPONSORS} sponsor slots are full`;

        return {
            kind: 'sponsor',
            ...deal,
            currency: 'sponsor',
            owned: !!active,
            weeksLeft: active ? Math.max(0, (Number(active.endWeekAbs) || 0) - w) : 0,
            // Sponsors pay the player, so affordability never gates them - the
            // requirement gates are the whole story.
            affordable: true,
            locked: !active && (!!gate || slotsFull),
            lockReason,
        };
    });

    return {
        id: 'sponsors',
        name: 'Sponsorships',
        blurb: `A signing bonus now and a cheque every week until the term runs out. ${MAX_ACTIVE_SPONSORS} deals at a time, and an expired deal can always be renewed.`,
        currency: 'sponsor',
        items,
    };
}

/** Everything the Shop screen renders, in tab order. */
export function shopSections(c) {
    const s = st(c);
    return [
        gearSection(s),
        consumableSection(s),
        lifestyleSection(s),
        perkSection(s),
        sponsorSection(s),
    ];
}

/** Price chip text. Reads item.currency so gold, legacy and sponsor deals can
 *  share one label helper without the UI knowing which list an item came from. */
export function priceLabel(item) {
    if (!item) return '';
    if (item.currency === 'legacy') return `${Math.round(Number(item.cost) || 0)} LP`;
    if (item.currency === 'sponsor') return `${fmtGold(item.weekly)} G/wk`;
    const cost = Number(item.cost);
    // A maxed-out gear category reports cost 0 because there is no next tier -
    // it gets a blank chip rather than a misleading "0 G".
    if (!Number.isFinite(cost) || cost <= 0) return '';
    return `${fmtGold(cost)} G`;
}
