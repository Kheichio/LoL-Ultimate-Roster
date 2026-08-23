// ===========================================================================
//  LoL ULTIMATE CAREER - match engine
// ===========================================================================
//  A match is played, not watched. Five in-game decisions per game, drawn from
//  a role-specific pool, each resolved against the player's attributes. Two
//  running numbers come out of that:
//
//    advantage - how the TEAM is doing because of you. Feeds the win roll.
//    personal  - how YOU are doing. Feeds the 0-10 match rating.
//
//  Balance intent for the whole file: team strength owns roughly two thirds of
//  a result and decisions the other third. A 60 OVR player cannot decision his
//  way past T1, because a 60 OVR player fails the plays that would let him -
//  the ceiling is enforced by the success curve, not by capping the reward.
//
//  ASCII only. Emoji are \u escapes; this repo has been corrupted before.
//
//  This file is LOGIC ONLY. Every prompt, option and piece of written flavour
//  for the decision pools lives in ./matchEvents.js and is imported below.

import {
    ROLE_BY_ID, PLAYSTYLE_BY_ID, CHAMPION_BY_ID, REGION_BY_ID, CLUB_TIERS,
    PHASES, phaseForWeek, teamById,
} from './constants.js';
import {
    clamp, randInt, pick, bell, calcOVR, statusInfo, fmtKDA,
} from './ratings.js';
import { teamStrength, teamStrengthWithPlayer, teammatesOf } from './teams.js';
import { career, addNews, grantGold, grantFollowers, adjustCondition, logWeek, saveCareer } from '../stores/career.js';
import { gearAttrBonus } from './economy.js';
import { getEffectiveRating } from '../utils/cards.js';
import { showToast } from '../stores/toasts.js';
import { playSound } from '../utils/sound.js';
import { DECISION_POOLS, eventsForRole } from './matchEvents.js';

/** Re-exported so a UI can render a role's whole decision pool without knowing
 *  which file the data happens to live in this week. */
export { DECISION_POOLS };

// ---------------------------------------------------------------------------
//  TUNING
// ---------------------------------------------------------------------------

/** Decisions per game. Five is enough to feel like a game and short enough to
 *  sit through five times in a Bo5. */
export const EVENTS_PER_GAME = 5;

// Win roll: score = teamTerm + decisionTerm, then a logistic. A 10 point team
// strength gap is worth 24 score (~28% win rate); a flawless decision run is
// worth about 19 (~8 points of team strength). That ratio is the whole game.
const TEAM_WEIGHT = 2.4;
const DECISION_WEIGHT = 0.42;
const LOGISTIC_SCALE = 26;

const ADV_CLAMP = 70;
const PERSONAL_CLAMP = 60;

// Success chance never leaves this band - the player must always be able to
// get unlucky, and a 99 in everything must still be able to whiff a flash.
const CHANCE_MIN = 0.08;
const CHANCE_MAX = 0.94;

// Attribute needed for a coin flip, by difficulty. 0.2 -> 39, 0.5 -> 59,
// 0.85 -> 82. Each point of attribute over that line is +1.05% success.
const DIFF_FLOOR = 26;
const DIFF_SPAN = 66;
const ATTR_PER_PCT = 0.0105;

// Outcome magnitude multipliers on reward/risk.
const MAG_MULT = { great: 1.35, good: 1.0, ok: 0.65, bad: 0.85, disaster: 1.4 };

// CS per event by role, before phase and option modifiers. Tuned so a full
// game lands an ADC near 310 and a support near 40.
const CS_BASE = { TOP: 56, JNG: 42, MID: 60, ADC: 64, SUP: 8 };
const CS_PHASE = { early: 0.85, mid: 1.0, late: 1.15 };

// How much of a role's kill participation is kills rather than assists.
const SOLO_SHARE = { TOP: 0.16, JNG: 0.10, MID: 0.22, ADC: 0.28, SUP: -0.15 };
const ASSIST_LEAN = { TOP: 0.15, JNG: 0.45, MID: 0.25, ADC: 0.25, SUP: 0.70 };

// Phase payout multipliers. Worlds pays triple a regular season game.
const PHASE_PAY = {
    preseason: 0.5, spring: 1.0, spring_po: 1.8, msi: 2.4,
    summer: 1.1, summer_po: 2.0, worlds: 3.0, offseason: 0.4,
};

// Championship points are a season currency here, not a real Riot formula.
const CP_TABLE = {
    preseason: 0, spring: 10, spring_po: 40, msi: 30,
    summer: 12, summer_po: 55, worlds: 70, offseason: 0,
};

const PHASE_BY_ID = PHASES.reduce((m, p) => { m[p.id] = p; return m; }, {});

/**
 * How a signature champion's archetype wants to be played. Matched against an
 * option's bias to decide whether the pick feels comfortable in that moment.
 */
const ARCHETYPE_BIAS = {
    Juggernaut: { aggression: 0.70, risk: 0.45, teamplay: 0.55 },
    Diver:      { aggression: 0.85, risk: 0.75, teamplay: 0.65 },
    Duelist:    { aggression: 0.72, risk: 0.62, teamplay: 0.25 },
    Skirmisher: { aggression: 0.75, risk: 0.65, teamplay: 0.40 },
    Warden:     { aggression: 0.30, risk: 0.25, teamplay: 0.95 },
    Vanguard:   { aggression: 0.80, risk: 0.70, teamplay: 0.90 },
    Battlemage: { aggression: 0.50, risk: 0.40, teamplay: 0.75 },
    Specialist: { aggression: 0.50, risk: 0.55, teamplay: 0.55 },
    Marksman:   { aggression: 0.45, risk: 0.45, teamplay: 0.60 },
    Assassin:   { aggression: 0.90, risk: 0.88, teamplay: 0.25 },
    Mage:       { aggression: 0.40, risk: 0.35, teamplay: 0.80 },
    Hypercarry: { aggression: 0.35, risk: 0.35, teamplay: 0.65 },
    Poke:       { aggression: 0.40, risk: 0.30, teamplay: 0.70 },
    'Lane Bully': { aggression: 0.85, risk: 0.65, teamplay: 0.35 },
    Utility:    { aggression: 0.30, risk: 0.30, teamplay: 0.90 },
    Catcher:    { aggression: 0.75, risk: 0.75, teamplay: 0.80 },
    Enchanter:  { aggression: 0.20, risk: 0.20, teamplay: 1.00 },
};

// ---------------------------------------------------------------------------
//  SECONDARY TUNING - how the numbers above turn into the running totals
// ---------------------------------------------------------------------------

// An option's `reward`/`risk` are written on a 2-15 scale. These scale them
// into advantage/personal points. A flawless five-decision run lands near 45
// advantage, which is the ~19 score the header promises once DECISION_WEIGHT
// has been applied.
const ADV_SCALE = 0.62;
const PERSONAL_SCALE = 0.55;
const PERSONAL_FAIL_SCALE = 0.60;

// How far each modifier may bend the raw attribute-vs-difficulty chance.
const FORM_SWING = 0.12;        // +/- 0.06 across the whole form range
const COMPOSURE_SWING = 0.18;   // only while the team is behind
const BIAS_SWING = 0.16;        // playing to your identity, or against it
const COMFORT_BONUS = 0.06;     // signature champion, bonus only - never a penalty
const WHEN_MATCH = 0.09;        // the option that reads the game state correctly
const WHEN_MISS = -0.07;        // ...and the price for the ones that do not

// Game state thresholds the `when` markers are tested against.
const AHEAD_AT = 8;
const FED_AT = 15;
const STRUGGLING_AT = -12;

// The win roll never becomes a certainty. Even a 30 point strength gap loses
// one game in thirty, which is what makes a Bo5 upset possible.
const WIN_FLOOR = 0.03;
const WIN_CEIL = 0.97;

// ---------------------------------------------------------------------------
//  SMALL HELPERS
// ---------------------------------------------------------------------------
function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

/** Synchronous store read without publishing an update. */
function snapshot() {
    let out = null;
    const un = career.subscribe(v => { out = v; });
    un();
    return out;
}

function st(c) {
    return c && typeof c === 'object' ? c : snapshot();
}

function roleOf(c) {
    return ROLE_BY_ID[c && c.player && c.player.role] ? c.player.role : 'MID';
}

function yearOf(c) {
    return Math.round(num(c && c.time && c.time.year, 2026));
}

function weekOf(c) {
    return Math.round(num(c && c.time && c.time.week, 1));
}

function phaseIdFor(c, given) {
    if (given && PHASE_BY_ID[given]) return given;
    return phaseForWeek(weekOf(c)).id;
}

function winsNeeded(bestOf) {
    const bo = Math.max(1, Math.round(num(bestOf, 1)));
    return Math.floor(bo / 2) + 1;
}

/** Mean absolute distance between two {aggression, risk, teamplay} triples. */
function biasDistance(a, b) {
    if (!a || !b) return 0.5;
    const keys = ['aggression', 'risk', 'teamplay'];
    let sum = 0;
    for (const k of keys) sum += Math.abs(num(a[k], 0.5) - num(b[k], 0.5));
    return sum / keys.length;
}

function weightedPick(list) {
    let total = 0;
    for (const e of list) total += Math.max(0.01, num(e.weight, 1));
    let roll = Math.random() * total;
    for (const e of list) {
        roll -= Math.max(0.01, num(e.weight, 1));
        if (roll <= 0) return e;
    }
    return list[list.length - 1];
}

// ---------------------------------------------------------------------------
//  OUTCOME COPY
//  One written consequence per band, per game phase. The engine never says
//  "Success!" - it says what happened on the rift because of that choice.
// ---------------------------------------------------------------------------
const OUTCOME_LINES = {
    early: {
        great: [
            'It lands perfectly: he loses the trade, the crash and the next two minutes of his lane.',
            'Clean. You come out of it a level up with the wave sitting exactly where you wanted it.',
            'Textbook. Their jungler arrives ten seconds late to a lane that is already gone.',
        ],
        good: [
            'It works. Nothing for the highlight reel, but you are ahead now and they have to answer it.',
            'The read was right. You bank the small lead and give nothing back for it.',
            'Solid. A little gold, a little tempo, and no summoners spent to get either.',
        ],
        ok: [
            'It half works. You get the plate, but you walk back to lane on a third of your health.',
            'Scrappy. The lane stays roughly even and you take chip damage for the privilege.',
            'It comes off, barely. The advantage is real and it is also very small.',
        ],
        bad: [
            'It does not come off. You give up the wave and walk back to lane a level down.',
            'He reads it. You lose the trade, lose the crash, and lose the next ninety seconds with it.',
            'Their jungler was already there. You live on a flash and the lane belongs to them now.',
        ],
        disaster: [
            'It falls apart instantly. First blood goes to them and the whole side of the map follows it.',
            'Everything goes at once: flash, summoners, and three plates while you are on the respawn timer.',
            'You die, they take the tower gold, and the caster starts using the phrase "difficult start".',
        ],
    },
    mid: {
        great: [
            'The call is perfect. They lose two, the objective is yours, and the map opens up behind it.',
            'It works exactly as drawn - three towers of tempo out of one thirty-second window.',
            'They never see it coming. The fight is over before their support finishes walking in.',
        ],
        good: [
            'It works. The objective is yours and nobody had to die for it.',
            'The trade lands your way. Not a highlight, but the gold graph moves and stays moved.',
            'You come out a step ahead, with vision where you need it for the next spawn.',
        ],
        ok: [
            'You get the objective and lose a body doing it. Nobody is thrilled, nobody is upset.',
            'It works in the least convincing way available. Even trade, tilted very slightly your way.',
            'It sort of lands, and they answer it thirty seconds later on the far side of the map.',
        ],
        bad: [
            'They collapse on it. The objective goes over and the vision that was buying you time goes with it.',
            'It is the wrong call and all five of you pay for it: two down, pit lost.',
            'You are four seconds late, which today is exactly four seconds too many.',
        ],
        disaster: [
            'A catastrophe. Three of you die on the wrong side of the river and they walk mid unopposed.',
            'The fight starts on their terms and ends on their terms - objective, tower and next spawn all theirs.',
            'The engage goes in with nobody behind it, and they cash it for the Baron and two towers.',
        ],
    },
    late: {
        great: [
            'You win the game right there. Their carry dies before doing anything and the base opens up.',
            'Perfect. The fight breaks your way for one second and never breaks back - inhibitor, nexus turrets, done.',
            'It is the play the highlight package leads with. They have nothing left that answers it.',
        ],
        good: [
            'It holds. The objective is yours and their timer starts running instead of yours.',
            'The right call, made on time. You take the fight you wanted and win it comfortably.',
            'Good enough. An objective up, everybody alive, and items on the way.',
        ],
        ok: [
            'You get it, and it costs two summoners and a very uncomfortable thirty seconds.',
            'Messy, and it works. The lead is bigger than it was and nobody is happy about how.',
            'A survivable version of the right idea: one down for one objective.',
        ],
        bad: [
            'They punish it. The objective goes to them and your base is suddenly the one under pressure.',
            'The wrong read at the worst possible time. Two dead, and the fight is theirs.',
            'You step in and nobody steps with you. They take the pit and the tempo behind it.',
        ],
        disaster: [
            'It ends the game. They ace you off the back of it and walk straight down mid.',
            'Nine seconds and the whole game is gone: Elder, Baron, and the nexus behind them.',
            'You die first, alone, in the fog, and the other four die trying to answer it.',
        ],
    },
};

function outcomeText(phase, magnitude) {
    const byPhase = OUTCOME_LINES[phase] || OUTCOME_LINES.mid;
    const lines = byPhase[magnitude] || byPhase.good;
    return pick(lines);
}

const BENCH_REASONS = [
    'The coach went with the starter for this one. You warmed up and then sat down.',
    'Rotation call. The staff wanted a specific matchup and it was not yours.',
    'You are still the substitute here. Nobody explained it and nobody had to.',
    'Scrim results went against you this week, so you watched it from the analyst desk.',
    'Benched. Forty minutes of somebody else playing your role, on your stage, in your jersey.',
];

// ---------------------------------------------------------------------------
//  TEAM CONTEXT
// ---------------------------------------------------------------------------
function myTeamFor(c) {
    const clubId = c && c.player && c.player.clubId;
    const club = clubId ? teamById(clubId) : null;
    if (club) return club;
    const region = REGION_BY_ID[c && c.player && c.player.region] || REGION_BY_ID.LEC;
    return {
        id: 'free_agent',
        name: (c && c.player && c.player.handle) || 'Free Agent',
        tier: 3,
        strength: Math.max(35, calcOVR(c && c.player && c.player.attrs, roleOf(c))),
        accent: region.accent,
        region: region.id,
    };
}

/** Does the player get a seat this week? Squad status decides it; a badly
 *  injured player loses the argument even when they are the franchise guy. */
function rollPlaysThisMatch(c) {
    // A free agent has no coach to sit him down. engine.benchOrStart() - which
    // the hub renders as this week's forecast - short-circuits the same way, and
    // the two must agree or the hub promises a game the engine refuses to give.
    if (!c || !c.player || !c.player.clubId) return true;
    const info = statusInfo(c.player.status);
    const health = clamp(num(c && c.player && c.player.health, 100), 0, 100);
    let chance = info.playChance;
    if (health < 30) chance *= 0.35;
    else if (health < 55) chance *= 0.8;
    return Math.random() < clamp(chance, 0, 1);
}

// ---------------------------------------------------------------------------
//  EVENT QUEUE
//  Five events, ordered early -> mid -> late, drawn by weight and never
//  repeated inside a series. `used` carries across the games of a Bo5 so game
//  five does not replay game one's decisions.
// ---------------------------------------------------------------------------
const QUEUE_PLAN = ['early', 'early', 'mid', 'mid', 'late'];

function drawQueue(role, usedIds) {
    const pool = (eventsForRole(role) || []).filter(e => e && Array.isArray(e.options) && e.options.length);
    const used = new Set(usedIds || []);
    const out = [];
    for (let i = 0; i < EVENTS_PER_GAME; i++) {
        const want = QUEUE_PLAN[i] || 'mid';
        const taken = new Set(out.map(e => e.id));
        let cands = pool.filter(e => e.phase === want && !used.has(e.id) && !taken.has(e.id));
        // A Bo5 can outlast a thin phase bucket. Relax the no-repeat rule before
        // relaxing the early/mid/late shape - the pacing matters more.
        if (!cands.length) cands = pool.filter(e => e.phase === want && !taken.has(e.id));
        if (!cands.length) cands = pool.filter(e => !used.has(e.id) && !taken.has(e.id));
        if (!cands.length) cands = pool.filter(e => !taken.has(e.id));
        if (!cands.length) break;
        const ev = weightedPick(cands);
        used.add(ev.id);
        out.push(ev);
    }
    return { queue: out, usedIds: Array.from(used) };
}

// ---------------------------------------------------------------------------
//  BUILD
// ---------------------------------------------------------------------------
/**
 * Assemble a live match object. Nothing here writes the store - the caller puts
 * the returned object into matchState and drives it with the functions below.
 *
 * opts = { opponentId, phase, bestOf = 1, label, id? }
 * `id` is optional and exists so a fixture from the schedule can hand its own
 * id down; applyMatchResult() uses it to find the right row to tick off.
 */
export function buildMatch(c, opts = {}) {
    const state = st(c);
    const year = yearOf(state);
    const week = weekOf(state);
    const phase = phaseIdFor(state, opts.phase);
    const bestOf = Math.max(1, Math.round(num(opts.bestOf, 1)));

    const oppTeam = teamById(opts.opponentId) || {
        id: opts.opponentId || 'unknown',
        name: 'Unknown Org',
        accent: '#64748b',
        strength: 55,
        tier: 2,
        region: state.player.region,
    };
    const myTeam = myTeamFor(state);

    const plays = rollPlaysThisMatch(state);
    const drawn = drawQueue(roleOf(state), []);

    return {
        id: opts.id || `match_${year}_w${week}_${oppTeam.id}_${Math.random().toString(36).slice(2, 7)}`,
        week,
        year,
        phase,
        label: opts.label || (PHASE_BY_ID[phase] ? PHASE_BY_ID[phase].name : 'Match'),
        bestOf,

        opponentId: oppTeam.id,
        opponentName: oppTeam.name,
        opponentAccent: oppTeam.accent || '#64748b',
        oppStrength: teamStrength(oppTeam, year),

        myTeamId: myTeam.id,
        myTeamName: myTeam.name,
        myAccent: myTeam.accent || '#3b82f6',
        myStrength: plays ? teamStrengthWithPlayer(state, myTeam) : teamStrength(myTeam, year),

        seriesScore: [0, 0],
        game: 1,

        advantage: 0,
        personal: 0,
        kda: { k: 0, d: 0, a: 0 },
        cs: 0,

        queue: drawn.queue,
        usedIds: drawn.usedIds,
        eventIndex: 0,

        timeline: [],
        gameLog: [],
        done: false,

        playerPlays: plays,
        benchReason: plays ? null : pick(BENCH_REASONS),
    };
}

// ---------------------------------------------------------------------------
//  DECISIONS
// ---------------------------------------------------------------------------
/** The decision waiting for an answer, or null when this game's five are done. */
export function nextEvent(match) {
    if (!match || match.done) return null;
    const q = Array.isArray(match.queue) ? match.queue : [];
    const i = Math.max(0, Math.round(num(match.eventIndex, 0)));
    return i < q.length ? q[i] : null;
}

/** Where the game currently stands, for the `when` markers to be read against. */
function gameStateTags(match) {
    const adv = num(match && match.advantage, 0);
    const per = num(match && match.personal, 0);
    const tags = new Set();
    if (adv >= AHEAD_AT) tags.add('ahead');
    else if (adv <= -AHEAD_AT) tags.add('behind');
    else tags.add('even');
    if (per >= FED_AT) tags.add('fed');
    if (per <= STRUGGLING_AT) tags.add('struggling');
    return tags;
}

/**
 * Chance one option comes off. The attribute mean against the option's
 * difficulty is the spine of it; everything after that is the player's identity,
 * their condition and whether they read the map correctly.
 */
export function successChance(c, match, option, event) {
    const state = st(c);
    const p = state.player || {};
    const attrs = p.attrs || {};
    const gear = gearAttrBonus(state);

    const keys = Array.isArray(option.attrs) && option.attrs.length ? option.attrs : ['knw'];
    let mean = 0;
    for (const k of keys) mean += clamp(num(attrs[k], 40) + num(gear[k], 0), 1, 110);
    mean /= keys.length;

    const need = DIFF_FLOOR + DIFF_SPAN * clamp(num(option.difficulty, 0.5), 0, 1);
    let chance = 0.5 + (mean - need) * ATTR_PER_PCT;

    // Form. A player in crisis misses plays a red hot version of himself makes.
    chance += ((clamp(num(p.form, 50), 0, 100) - 50) / 100) * FORM_SWING;

    // Composure only shows up when the game is going badly. That is the point
    // of the attribute and it is the only place it gets to prove it.
    const adv = num(match && match.advantage, 0);
    if (adv < 0) {
        const behind = Math.min(1, -adv / 30);
        chance += behind * ((clamp(num(attrs.cmp, 40) + num(gear.cmp, 0), 1, 110) - 50) / 100) * COMPOSURE_SWING;
    }

    // Identity. A Split Pusher told to group and an Engage support told to sit
    // back are both being asked to play somebody else's game.
    const style = PLAYSTYLE_BY_ID[p.playstyle];
    if (style && style.bias && option.bias) {
        const fit = clamp(1 - 2 * biasDistance(style.bias, option.bias), -1, 1);
        chance += fit * BIAS_SWING;
    }

    // Comfort pick. The signature champion makes the plays it was built for
    // easier and never makes anything harder.
    const champ = CHAMPION_BY_ID[p.champion];
    const arche = champ ? ARCHETYPE_BIAS[champ.archetype] : null;
    if (arche && option.bias) {
        const comfort = Math.max(0, 1 - 2 * biasDistance(arche, option.bias));
        chance += comfort * COMFORT_BONUS;
    }

    // The map read. Nothing in the option text says which one this is.
    if (option.when) {
        chance += gameStateTags(match).has(option.when) ? WHEN_MATCH : WHEN_MISS;
    }

    return clamp(chance, CHANCE_MIN, CHANCE_MAX);
}

function rollMagnitude(success, chance, option) {
    const r = Math.random();
    if (success) {
        const greatAt = clamp(0.22 + (chance - 0.5) * 0.35, 0.10, 0.45);
        if (r < greatAt) return 'great';
        if (r > 0.78) return 'ok';
        return 'good';
    }
    const disasterAt = clamp(0.12 + num(option.risk, 6) / 55, 0.10, 0.45);
    return r < disasterAt ? 'disaster' : 'bad';
}

function kdaFor(role, success, magnitude, option) {
    const solo = num(SOLO_SHARE[role], 0.15);
    const lean = num(ASSIST_LEAN[role], 0.3);
    const mult = num(MAG_MULT[magnitude], 1);

    if (success) {
        const impact = (num(option.reward, 7) / 7) * mult;
        const k = Math.max(0, Math.round(impact * (0.35 + solo) * (0.55 + Math.random() * 0.95)));
        const a = Math.max(0, Math.round(impact * (0.45 + lean) * (0.55 + Math.random() * 0.95)));
        const d = magnitude === 'ok' && Math.random() < 0.28 ? 1 : 0;
        return { k, d, a };
    }

    const heavy = magnitude === 'disaster';
    const d = heavy ? (Math.random() < 0.35 ? 2 : 1) : (Math.random() < 0.82 ? 1 : 0);
    const a = !heavy && Math.random() < 0.30 ? 1 : 0;
    return { k: 0, d, a };
}

function csFor(role, phase, success, magnitude) {
    const base = num(CS_BASE[role], 45) * num(CS_PHASE[phase], 1);
    const mood = success ? (magnitude === 'great' ? 1.12 : magnitude === 'ok' ? 0.98 : 1.05)
        : (magnitude === 'disaster' ? 0.74 : 0.88);
    return Math.max(0, Math.round(base * mood * (0.86 + Math.random() * 0.28)));
}

/**
 * Resolve one decision. Returns a brand new match object plus the outcome the
 * UI animates - the argument is never mutated.
 */
export function resolveDecision(c, match, optionId) {
    const state = st(c);
    const event = nextEvent(match);
    if (!event) return { match, outcome: null };

    const option = event.options.find(o => o.id === optionId) || event.options[0];
    const role = roleOf(state);
    const phase = event.phase || 'mid';

    const chance = successChance(state, match, option, event);
    const success = Math.random() < chance;
    const magnitude = rollMagnitude(success, chance, option);
    const mult = num(MAG_MULT[magnitude], 1);

    const advantageDelta = success
        ? Math.round(num(option.reward, 7) * mult * ADV_SCALE)
        : -Math.round(num(option.risk, 6) * mult * ADV_SCALE);
    const personalDelta = success
        ? Math.round(num(option.reward, 7) * mult * PERSONAL_SCALE)
        : -Math.round(num(option.risk, 6) * mult * PERSONAL_FAIL_SCALE);

    const kdaDelta = kdaFor(role, success, magnitude, option);
    const csDelta = csFor(role, phase, success, magnitude);
    const text = outcomeText(phase, magnitude);

    const outcome = {
        success, magnitude, text,
        advantageDelta, personalDelta, kdaDelta, csDelta,
        chance: Math.round(chance * 100) / 100,
    };

    const entry = {
        id: `${match.id}_g${match.game}_${event.id}`,
        game: match.game,
        eventId: event.id,
        phase,
        prompt: event.prompt,
        optionId: option.id,
        optionLabel: option.label,
        success, magnitude, text,
        advantageDelta, personalDelta,
    };

    const next = {
        ...match,
        advantage: clamp(num(match.advantage, 0) + advantageDelta, -ADV_CLAMP, ADV_CLAMP),
        personal: clamp(num(match.personal, 0) + personalDelta, -PERSONAL_CLAMP, PERSONAL_CLAMP),
        kda: {
            k: num(match.kda && match.kda.k, 0) + kdaDelta.k,
            d: num(match.kda && match.kda.d, 0) + kdaDelta.d,
            a: num(match.kda && match.kda.a, 0) + kdaDelta.a,
        },
        cs: num(match.cs, 0) + csDelta,
        eventIndex: Math.round(num(match.eventIndex, 0)) + 1,
        timeline: match.timeline.concat([entry]),
    };

    return { match: next, outcome };
}

// ---------------------------------------------------------------------------
//  GAME RESOLUTION
// ---------------------------------------------------------------------------
function winProbability(myStrength, oppStrength, advantage) {
    const score = TEAM_WEIGHT * (num(myStrength, 50) - num(oppStrength, 50))
        + DECISION_WEIGHT * num(advantage, 0);
    const p = 1 / (1 + Math.exp(-score / LOGISTIC_SCALE));
    return clamp(p, WIN_FLOOR, WIN_CEIL);
}

// The personal line is scaled against its own clamp rather than by a loose
// per-point coefficient, so the arithmetic can never run off the end of the
// scale: 5.6 + 1.5 + 1.6 + 0.5 = 9.2 is the best game arithmetically available.
// A flat 10.0 stays out of reach and an 8.5 (the player-of-the-match gate) is a
// genuinely big night. The measured mean is about 7.2, comfortably above the 6.5
// replacement level awards.js judges a split against -- note that the sample is
// one professional starter's own games, not a league-wide population, so it is
// expected to sit above replacement rather than on it.
const PERSONAL_RATING_SPAN = 1.5;

/** 0.0 - 10.0 for one game. Personal play is the spine, KDA is the visible
 *  half of it, and the result is worth about half a point either way. */
function gameRating(personal, kda, won) {
    const ratio = fmtKDA(kda.k, kda.d, kda.a).ratio;
    let r = 5.6;
    r += (clamp(num(personal, 0), -PERSONAL_CLAMP, PERSONAL_CLAMP) / PERSONAL_CLAMP)
        * PERSONAL_RATING_SPAN;
    r += clamp((ratio - 2.4) * 0.28, -1.5, 1.6);
    r += won ? 0.5 : -0.5;
    return Math.round(clamp(r, 0, 10) * 10) / 10;
}

const PENTA_KILL_GATE = 6;

/**
 * A pentakill is an event, not a stat line: it takes a game that was already
 * going your way and one teamfight that broke completely open. Rolled off the
 * `great` outcomes this game actually produced, so it can only ever happen on
 * the back of plays the player made. Deliberately rare - roughly one game in
 * 250 - because awards.js hangs a one-off milestone on the first one.
 */
function pentakillRoll(match, kda, won) {
    if (!match || match.playerPlays === false) return 0;
    const kills = num(kda && kda.k, 0);
    if (kills < PENTA_KILL_GATE) return 0;
    const rows = Array.isArray(match.timeline) ? match.timeline : [];
    let greats = 0;
    for (const e of rows) {
        if (e && e.game === match.game && e.magnitude === 'great' && e.phase !== 'early') greats++;
    }
    if (!greats) return 0;
    const chance = clamp(0.02 * greats * (kills / 8) * (won ? 1 : 0.3), 0, 0.10);
    return Math.random() < chance ? 1 : 0;
}

/**
 * Close the current game out: roll the win, log it, then either deal a fresh
 * five decisions for the next game or mark the series finished.
 */
export function finishGame(c, match) {
    const state = st(c);
    const p = winProbability(match.myStrength, match.oppStrength, match.advantage);
    const won = Math.random() < p;

    const gap = num(match.myStrength, 50) - num(match.oppStrength, 50);
    const duration = Math.round(clamp(
        31 + bell() * 6 - Math.abs(num(match.advantage, 0)) * 0.10 - Math.abs(gap) * 0.14,
        20, 52,
    ));

    const kda = {
        k: num(match.kda && match.kda.k, 0),
        d: num(match.kda && match.kda.d, 0),
        a: num(match.kda && match.kda.a, 0),
    };
    const game = {
        game: match.game,
        won,
        duration,
        kda,
        cs: Math.round(num(match.cs, 0)),
        // A game the player watched from the bench has no rating to give.
        rating: match.playerPlays === false ? 0 : gameRating(match.personal, kda, won),
        pentakills: pentakillRoll(match, kda, won),
    };

    const seriesScore = [
        num(match.seriesScore && match.seriesScore[0], 0) + (won ? 1 : 0),
        num(match.seriesScore && match.seriesScore[1], 0) + (won ? 0 : 1),
    ];
    const need = winsNeeded(match.bestOf);
    const over = seriesScore[0] >= need || seriesScore[1] >= need;

    let next = {
        ...match,
        seriesScore,
        gameLog: match.gameLog.concat([game]),
        done: over,
    };

    if (over) {
        next.eventIndex = EVENTS_PER_GAME;
    } else {
        const drawn = drawQueue(roleOf(state), match.usedIds);
        next = {
            ...next,
            game: num(match.game, 1) + 1,
            advantage: 0,
            personal: 0,
            kda: { k: 0, d: 0, a: 0 },
            cs: 0,
            queue: drawn.queue,
            usedIds: drawn.usedIds,
            eventIndex: 0,
        };
    }

    return { match: next, game };
}

export function isMatchOver(match) {
    if (!match) return true;
    if (match.done) return true;
    const need = winsNeeded(match.bestOf);
    const s = Array.isArray(match.seriesScore) ? match.seriesScore : [0, 0];
    return num(s[0], 0) >= need || num(s[1], 0) >= need;
}

// ---------------------------------------------------------------------------
//  RESULT
// ---------------------------------------------------------------------------
function seriesTightness(bestOf, seriesScore) {
    const need = winsNeeded(bestOf);
    const margin = Math.abs(num(seriesScore[0], 0) - num(seriesScore[1], 0));
    if (need <= 1) return 1;
    return clamp(1 - (margin - 1) / Math.max(1, need), 0, 1);
}

function mvpRoll(c, rating, won) {
    if (!won || rating < 8.5) return false;
    const state = st(c);
    const mates = teammatesOf(state).starters || [];
    let best = 0;
    for (const m of mates) best = Math.max(best, getEffectiveRating(m));
    const myOVR = calcOVR(state.player && state.player.attrs, roleOf(state));
    // Being the best player on the pitch is most of it; being the best player
    // on your own roster is the rest.
    const chance = clamp(0.28 + (rating - 8.5) * 0.30 + (myOVR - best) * 0.02, 0.05, 0.92);
    return Math.random() < chance;
}

/**
 * Turn a finished live match into the permanent result record. Pure - it reads
 * the career and hands back an object; applyMatchResult() does the writing.
 */
export function finishMatch(c, match) {
    const state = st(c);
    const played = match.playerPlays !== false;
    const games = Array.isArray(match.gameLog) ? match.gameLog : [];
    const score = [
        num(match.seriesScore && match.seriesScore[0], 0),
        num(match.seriesScore && match.seriesScore[1], 0),
    ];
    const won = score[0] > score[1];

    const kda = { k: 0, d: 0, a: 0 };
    let cs = 0;
    let ratingSum = 0;
    let pentakills = 0;
    for (const g of games) {
        kda.k += num(g.kda && g.kda.k, 0);
        kda.d += num(g.kda && g.kda.d, 0);
        kda.a += num(g.kda && g.kda.a, 0);
        cs += num(g.cs, 0);
        ratingSum += num(g.rating, 0);
        pentakills += num(g.pentakills, 0);
    }

    let rating = 0;
    if (played && games.length) {
        const mean = ratingSum / games.length;
        rating = Math.round(clamp(mean + (won ? 0.15 : -0.15), 0, 10) * 10) / 10;
    }

    const mvp = played ? mvpRoll(state, rating, won) : false;
    const phase = match.phase || phaseIdFor(state, null);
    const pay = num(PHASE_PAY[phase], 1);
    const tight = seriesTightness(match.bestOf, score);

    // Form. A 3-2 that went the distance says more about a player than a 3-0
    // either way, so the tight series is the one that moves the needle.
    let formDelta = 0;
    let moraleDelta = 0;
    if (played) {
        const base = (rating - 5.6) * 1.8 + (won ? 4 : -4);
        formDelta = Math.round(clamp(base * (0.78 + 0.42 * tight), -14, 14));
        moraleDelta = Math.round(clamp(
            (won ? 5 : -5) + (rating - 6) * 1.4 + (mvp ? 4 : 0),
            -12, 12,
        ));
    } else {
        formDelta = won ? 0 : -1;
        moraleDelta = -(4 + randInt(0, 3));
    }

    // Money. A win bonus, scaled by the stage and by how much the club is
    // actually worth playing for.
    const tierMult = (CLUB_TIERS[state.player && state.player.clubTier] || CLUB_TIERS[3]).salaryMult;
    const region = REGION_BY_ID[state.player && state.player.region] || REGION_BY_ID.LEC;
    let goldDelta = Math.round(140 * pay * (0.35 + tierMult * 0.9)
        * (won ? 1.35 : 0.8) * (0.7 + (played ? rating : 5) / 12));
    let hypeDelta = Math.round(90 * pay * region.hypeMult * (won ? 1.6 : 0.8)
        * (0.5 + (played ? rating : 4) / 8) * (mvp ? 1.7 : 1));
    if (!played) {
        goldDelta = Math.round(goldDelta * 0.15);
        hypeDelta = Math.round(hypeDelta * 0.10);
    }

    // Championship points belong to the club's season, so they land whether or
    // not the player was in the seat for them.
    const cp = num(CP_TABLE[phase], 0);
    const champPoints = won ? cp : Math.round(cp * 0.25);

    const result = {
        id: match.id,
        week: match.week,
        year: match.year,
        phase,
        label: match.label,

        opponentId: match.opponentId,
        opponentName: match.opponentName,
        myTeamId: match.myTeamId,
        myTeamName: match.myTeamName,

        won,
        score,
        games,

        kda,
        cs,
        rating,
        mvp,
        pentakills: played ? pentakills : 0,

        played,
        benchReason: played ? null : (match.benchReason || pick(BENCH_REASONS)),

        formDelta,
        moraleDelta,
        hypeDelta,
        goldDelta,
        champPoints,

        decisionLog: Array.isArray(match.timeline) ? match.timeline.slice() : [],
        headline: '',
    };

    result.headline = headlineFor(result);
    return result;
}

// ---------------------------------------------------------------------------
//  QUICK SIM
//  The same engine with nobody at the keyboard. Used for benched weeks, for
//  "sim the rest of the split", and for anything that needs a result without a
//  UI attached to it.
// ---------------------------------------------------------------------------
/** How an AI version of this player would answer one decision. */
function autoPick(c, match, event) {
    let best = event.options[0];
    let bestScore = -Infinity;
    for (const opt of event.options) {
        const chance = successChance(c, match, opt, event);
        // Expected value on the advantage line, with a small pull toward the
        // choices that suit the player's declared identity.
        let value = chance * num(opt.reward, 7) - (1 - chance) * num(opt.risk, 6);
        const style = PLAYSTYLE_BY_ID[c.player && c.player.playstyle];
        if (style && style.bias && opt.bias) {
            value += (1 - 2 * biasDistance(style.bias, opt.bias)) * 1.6;
        }
        value += (Math.random() - 0.5) * 1.4;
        if (value > bestScore) { bestScore = value; best = opt; }
    }
    return best;
}

export function quickSim(c, opts = {}) {
    const state = st(c);
    let match = buildMatch(state, opts);

    let guard = 0;
    while (!isMatchOver(match) && guard++ < 40) {
        if (match.playerPlays) {
            let ev = nextEvent(match);
            let inner = 0;
            while (ev && inner++ < EVENTS_PER_GAME + 2) {
                const opt = autoPick(state, match, ev);
                match = resolveDecision(state, match, opt.id).match;
                ev = nextEvent(match);
            }
        }
        match = finishGame(state, match).match;
    }

    return finishMatch(state, match);
}

// ---------------------------------------------------------------------------
//  APPLYING A RESULT
//  The one function in this file that writes anything.
// ---------------------------------------------------------------------------
export function applyMatchResult(result) {
    if (!result) return null;

    const won = !!result.won;
    const gamesWon = num(result.score && result.score[0], 0);
    const gamesLost = num(result.score && result.score[1], 0);
    const played = result.played !== false;

    career.update(c => {
        const totals = { ...c.totals };
        totals.games = num(totals.games, 0) + 1;
        if (won) totals.wins = num(totals.wins, 0) + 1;
        else totals.losses = num(totals.losses, 0) + 1;
        if (played) {
            totals.kills = num(totals.kills, 0) + num(result.kda && result.kda.k, 0);
            totals.deaths = num(totals.deaths, 0) + num(result.kda && result.kda.d, 0);
            totals.assists = num(totals.assists, 0) + num(result.kda && result.kda.a, 0);
            totals.ratingSum = Math.round((num(totals.ratingSum, 0) + num(result.rating, 0)) * 10) / 10;
            if (result.mvp) totals.mvps = num(totals.mvps, 0) + 1;
            if (num(result.pentakills, 0) > 0) {
                totals.pentakills = num(totals.pentakills, 0) + num(result.pentakills, 0);
            }
        }

        const season = { ...c.season };
        if (won) season.wins = num(season.wins, 0) + 1;
        else season.losses = num(season.losses, 0) + 1;
        season.gameWins = num(season.gameWins, 0) + gamesWon;
        season.gameLosses = num(season.gameLosses, 0) + gamesLost;
        season.champPoints = num(season.champPoints, 0) + num(result.champPoints, 0);

        // Tick off the fixture this result belongs to: by id when the caller
        // built the match from a schedule row, otherwise by week and opponent.
        const schedule = Array.isArray(season.schedule) ? season.schedule.slice() : [];
        let idx = schedule.findIndex(f => f && f.id === result.id);
        if (idx < 0) {
            idx = schedule.findIndex(f => f && !f.played
                && f.week === result.week && f.opponentId === result.opponentId);
        }
        if (idx >= 0) {
            schedule[idx] = {
                ...schedule[idx],
                played: true,
                won,
                score: [gamesWon, gamesLost],
                myRating: played ? num(result.rating, 0) : null,
                // awards.js reads the split's MVP count and KDA off these rows.
                // Without them splitMVPs() is permanently zero and splitKDA()
                // silently falls through to lifetime totals.
                mvp: played ? !!result.mvp : false,
                myK: played ? num(result.kda && result.kda.k, 0) : 0,
                myD: played ? num(result.kda && result.kda.d, 0) : 0,
                myA: played ? num(result.kda && result.kda.a, 0) : 0,
            };
        }
        season.schedule = schedule;

        const chemDelta = (won ? 1 : -1) + (result.mvp ? 2 : 0)
            + (played && num(result.rating, 6) < 5 ? -2 : 0);

        return {
            ...c,
            totals,
            season,
            player: {
                ...c.player,
                chemistry: clamp(num(c.player.chemistry, 50) + chemDelta, 0, 100),
            },
            lastMatch: result,
            pendingMatch: null,
        };
    });

    // Meters, money and reach go through the store's own clamping mutators.
    adjustCondition('form', num(result.formDelta, 0));
    adjustCondition('morale', num(result.moraleDelta, 0));

    const energyCost = played
        ? -(6 + (Array.isArray(result.games) ? result.games.length : 1) * 4)
        : -2;
    adjustCondition('energy', energyCost);

    if (num(result.goldDelta, 0) !== 0) grantGold(result.goldDelta);
    if (num(result.hypeDelta, 0) !== 0) grantFollowers(result.hypeDelta);

    addNews(result.headline, 'match');
    logWeek(
        won ? 'Match won' : 'Match lost',
        `${result.myTeamName} ${gamesWon}-${gamesLost} ${result.opponentName}`
            + (played ? ` (${num(result.rating, 0).toFixed(1)})` : ' (did not play)'),
        won ? '#22c55e' : '#ef4444',
    );

    if (played && result.mvp) {
        showToast('Player of the Match - ' + num(result.rating, 0).toFixed(1), 'success');
        playSound('rare');
    } else {
        playSound(won ? 'win' : 'lose');
    }

    saveCareer();
    return result;
}

// ---------------------------------------------------------------------------
//  PRESENTATION
// ---------------------------------------------------------------------------
export function matchRatingLabel(rating) {
    const r = num(rating, 0);
    if (r >= 9.5) return { label: 'Legendary',   color: '#eab308' };
    if (r >= 8.5) return { label: 'Outstanding', color: '#22c55e' };
    if (r >= 7.5) return { label: 'Very Good',   color: '#4ade80' };
    if (r >= 6.5) return { label: 'Solid',       color: '#3b82f6' };
    if (r >= 5.5) return { label: 'Average',     color: '#94a3b8' };
    if (r >= 4.5) return { label: 'Off the Pace', color: '#f59e0b' };
    if (r >= 3.0) return { label: 'Poor',        color: '#f97316' };
    return { label: 'Disaster', color: '#ef4444' };
}

/** One line for the news feed. Reads only the result object. */
export function headlineFor(result) {
    if (!result) return 'A game of League of Legends was played.';

    const my = result.myTeamName || 'Your team';
    const opp = result.opponentName || 'the opposition';
    const s = `${num(result.score && result.score[0], 0)}-${num(result.score && result.score[1], 0)}`;
    const r = num(result.rating, 0).toFixed(1);
    const won = !!result.won;

    if (result.played === false) {
        return won
            ? pick([
                `${my} beat ${opp} ${s} without you. The bench has a very good view of that.`,
                `${my} take it ${s} against ${opp}. You clapped, and you meant most of it.`,
            ])
            : pick([
                `${my} lose ${s} to ${opp}. You were not asked to help and it showed either way.`,
                `${opp} win ${s}. You watched all of it from the bench and said nothing afterwards.`,
            ]);
    }

    if (won && result.mvp) {
        return pick([
            `Player of the match: ${r} as ${my} take down ${opp} ${s}.`,
            `${my} beat ${opp} ${s} and there is only one name in the post-game - a ${r} performance.`,
            `A ${r} carry job. ${my} ${s} ${opp}, and the highlight package is all yours.`,
        ]);
    }

    if (won && num(result.rating, 0) >= 8) {
        return pick([
            `${my} see off ${opp} ${s}, with a ${r} from the ${result.label || 'stage'}.`,
            `Comfortable in the end: ${my} ${s} ${opp}, ${r} rating.`,
        ]);
    }

    if (won) {
        return pick([
            `${my} grind out a ${s} win over ${opp}. Nobody will remember how.`,
            `${my} beat ${opp} ${s}. A ${r} is not the story and the win is.`,
        ]);
    }

    if (num(result.rating, 0) >= 8) {
        return pick([
            `${opp} win ${s} despite a ${r} from you. Four other people had a worse night.`,
            `${my} fall ${s} to ${opp}. Your ${r} was the only thing that worked.`,
        ]);
    }

    if (num(result.rating, 0) <= 4.5) {
        return pick([
            `${opp} take it ${s}. A ${r} rating, and the VOD review is going to be quiet.`,
            `${s} to ${opp}, and a ${r} next to your name. That one is on the tape forever.`,
        ]);
    }

    return pick([
        `${opp} beat ${my} ${s}. A ${r} for you and a long bus back.`,
        `${my} lose ${s} to ${opp}. Nothing broke, nothing worked.`,
    ]);
}
