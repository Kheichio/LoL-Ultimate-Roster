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
    PHASES, phaseForWeek, teamById, ARCHETYPE_BIAS, biasDistance,
    championsForRole, championsForStyle, championMatchup, matchupLabel,
    proficiency01, proficiencyBand,
} from './constants.js';
import {
    clamp, randInt, pick, bell, calcOVR, statusInfo, fmtKDA,
} from './ratings.js';
import { teamStrength, teamStrengthWithPlayer, teammatesOf, clubStrengthFor } from './teams.js';
import {
    career, addNews, grantGold, grantFollowers, adjustCondition, logWeek, saveCareer,
    addProficiency,
} from '../stores/career.js';
import { gearAttrBonus, perkEffects } from './economy.js';
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
    preseason: 0.5, first_stand: 2.1, spring: 1.0, spring_po: 1.8, msi: 2.4,
    summer: 1.1, summer_po: 2.0, worlds: 3.0, offseason: 0.4,
};

// Championship points are a season currency here, not a real Riot formula.
const CP_TABLE = {
    preseason: 0, first_stand: 25, spring: 10, spring_po: 40, msi: 30,
    summer: 12, summer_po: 55, worlds: 70, offseason: 0,
};

const PHASE_BY_ID = PHASES.reduce((m, p) => { m[p.id] = p; return m; }, {});

// ARCHETYPE_BIAS moved to constants.js: the comfort bonus below and
// championsForStyle() (which decides whether a champion is a legal signature
// pick for your playstyle) must read the same table or the two can disagree
// about what a champion is. biasDistance() came with it for the same reason.

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

// Condition. BOTH are penalties that fade, and that shape is measured, not
// assumed: morale across a simulated run means 93 out of 100, because fifteen
// things push it up (a match win alone is +12, twice a week) and almost nothing
// pushes it down. A term CENTRED on a neutral value would therefore have been a
// near-constant bonus on every game in the mode — it measured at +0.09 on the
// mean match rating, against a hard fail at 7.6.
//
// Written as floors instead, both are mathematically incapable of raising the
// mean, and both bite exactly when the thing they measure has gone wrong. That
// is what "more impactful" has to mean for a meter that normally sits near max:
// not a bigger bonus for being fine, a real cost for not being.
//
// Health also compounds with an existing rule — under 55 you lose 20% of your
// chance of being picked at all — which is intended: a broken player plays less
// often AND worse when he does.
const MORALE_SWING = 0.14;
const MORALE_FLOOR_AT = 75;
const HEALTH_SWING = 0.16;
const HEALTH_FLOOR_AT = 70;
// Signature champion. This used to be a flat 0.06 that applied in every single
// game, which made it the weakest term in the engine and something the player
// never had a reason to think about. It is now drafted for (see rollDraft) and
// worth twice as much on the games you actually get it, for roughly the same
// average. Getting your pick through is a real event; losing it costs you.
const COMFORT_BONUS = 0.12;
const WHEN_MATCH = 0.09;        // the option that reads the game state correctly
const WHEN_MISS = -0.07;        // ...and the price for the ones that do not

// ---------------------------------------------------------------------------
//  STAKES
//  clutchBonus and intlBonus have been aggregated by economy.perkEffects() since
//  the perk board was written and read by absolutely nothing, so Ice in the
//  Veins and Big Game Player were two of the most expensive perks in the mode
//  and did half of what they said. They are wired here, and they are wired
//  MULTIPLICATIVELY: the copy promises "15% more often", and 0.5 -> 0.575 is
//  literally that, where a flat +0.15 would have been a 30% swing at the
//  midpoint and a much bigger one at the bottom.
//
//  Capped, because four perks stack to 0.44 clutch plus 0.22 international and
//  careerSmoke fails a run outright above a 7.6 mean match rating. Knockouts are
//  a minority of games, but they are the games that decide awards - which are
//  what pay for the perks.
//
//  The two are capped SEPARATELY on purpose. A single shared cap looks tidier
//  and is wrong: with the clutch perks stacked it was already saturated, so Big
//  Game Player's "twelve percent better at MSI and Worlds" bought nothing at
//  all at MSI or Worlds - which is the exact class of silently-dead perk this
//  whole wiring pass existed to remove.
// ---------------------------------------------------------------------------
const CLUTCH_BONUS_CAP = 0.25;
const INTL_BONUS_CAP = 0.15;
const KNOCKOUT_PHASES = new Set(['spring_po', 'summer_po', 'first_stand', 'msi', 'worlds']);
const INTL_PHASES = new Set(['first_stand', 'msi', 'worlds']);

// ---------------------------------------------------------------------------
//  DRAFT
//  Champion select, rolled once per GAME - so a Bo5 drafts five times and your
//  signature pick getting banned in game three is a thing that happens to you.
//  Three outcomes, and Champion Pool decides which side of the coin you land on
//  when the pick does not come back to you. This is the only place `chp` has a
//  mechanical job, which is why a one-trick is punished here and nowhere else.
// ---------------------------------------------------------------------------
const DRAFT_SIGNATURE_BASE = 0.62;   // your pick survives the ban phase
const DRAFT_CHP_ON_SIGNATURE = 0.20; // breadth also makes you harder to target
const DRAFT_POCKET_BASE = 0.68;      // of the games you lose it, how many have a real answer
const DRAFT_CHP_ON_POCKET = 0.70;    // ...and breadth is most of that
const DRAFT_TARGETING = 0.22;        // a top org scouts and bans what you are known for
const POCKET_COMFORT = 0.45;         // a prepared second pick keeps some of the comfort
const OFFSCRIPT_PENALTY = -0.035;    // playing something you do not really know

/** However many signatures you own, the draft still gets to take one off you
 *  sometimes. Without this ceiling a three-signature player never goes
 *  off-script, and off-script is the only place CHP is punished at all. */
const DRAFT_SIGNATURE_CAP = 0.90;

/** Champions offered in champion select. Three is a choice; four is a menu. */
export const DRAFT_OPTIONS = 3;

/**
 * Every champion this player is trusted on, first pick first.
 *
 * `player.champion` is the original and is never merged away — it is what
 * board.js publishes, what CareerDossier renders and what championCheck
 * validates. The extras ride alongside it and are unlocked by the Second and
 * Third Signature legacy perks.
 */
export function signatureIds(c) {
    const p = (st(c) || {}).player || {};
    const out = [];
    const push = (id) => {
        if (typeof id === 'string' && CHAMPION_BY_ID[id] && !out.includes(id)) out.push(id);
    };
    push(p.champion);
    if (Array.isArray(p.extraChampions)) for (const id of p.extraChampions) push(id);
    return out;
}

// ---------------------------------------------------------------------------
//  MATCHUP AND PROFICIENCY
//  Two terms, and they are deliberately built to cancel out across a career.
//
//  MATCHUP is symmetric: championMatchup() runs -2.5..+2.5 and a good lane pays
//  exactly what a bad one costs, so it adds variance and a real reason to think
//  in champion select without making anyone better on average.
//
//  PROFICIENCY is a PENALTY THAT FADES, measured against a neutral point rather
//  than from zero. Picking something cold costs you about 9%; mastering it
//  removes that and pays a little over. If it were a pure bonus, every career
//  would drift upward as it accumulated games - and careerSmoke fails a run
//  outright once the mean match rating passes 7.6, which currently has about a
//  tenth of a point of headroom.
// ---------------------------------------------------------------------------
const MATCHUP_STEP = 0.035;          // one counter step. A hard counter is +/-7%
const PROFICIENCY_SWING = 0.14;
const PROFICIENCY_NEUTRAL = 0.65;    // mastery at which proficiency stops costing
/** How much mastery protects you from a losing lane. Applied to BAD matchups
 *  only - knowing a champion inside out is what lets you survive a counter, but
 *  it does not make a favourable lane any more favourable than it already is. */
const PROFICIENCY_MATCHUP_DAMP = 0.60;

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
//  DRAFT
// ---------------------------------------------------------------------------
const DRAFT_LINES = {
    signature: [
        'They left it open. You are on it.',
        'Through the ban phase untouched.',
        'Last pick, and it was still there.',
        'They banned around it and gave it to you anyway.',
    ],
    pocket: [
        'Banned. You had the second one ready.',
        'Gone in the first rotation - you drafted the answer instead.',
        'Targeted out. The backup is one you have actually played.',
        'Taken. Not a problem, you prepared for that.',
    ],
    offscript: [
        'Banned, and the backup went with it. You are on something you barely play.',
        'Targeted out twice. This is a blind pick and everyone knows it.',
        'Nothing you wanted survived. You are improvising on stage.',
        'They read your whole pool. What is left is not really yours.',
    ],
    // Fearless: nobody banned you off it, you simply cannot play it twice in one
    // series. Saying "banned" here would be a lie the player can check.
    fearless: [
        'Already played it this series. Fearless means you find something else.',
        'Your pick is spent. Whatever comes next has to be a different one.',
        'Used in an earlier game, so it is off the board for the rest of the series.',
        'Fearless draft. The comfortable one went in game one and it is not coming back.',
    ],
};

/**
 * Champion select for one game. Returns what you ended up on and how much of
 * the comfort bonus it is worth.
 *
 * The odds move on two things and nothing else: how broad your champion pool
 * is, and how good the other team is at scouting you. A 20-CHP one-trick facing
 * a top org is off-script roughly a third of the time; an 80-CHP player almost
 * never is, because there is always another pick they can actually play.
 */
export function rollDraft(c, oppStrength, usedChampions = []) {
    const state = st(c);
    const p = (state && state.player) || {};
    // FEARLESS: everything already locked in this series is off the board.
    const used = new Set(Array.isArray(usedChampions) ? usedChampions.filter(Boolean) : []);
    const fresh = (ch) => !!ch && !used.has(ch.id);

    const sigIds = signatureIds(state);
    // Only the signatures that survive the series rule can still be "your pick".
    const sigChamps = sigIds.map(id => CHAMPION_BY_ID[id]).filter(ch => ch && fresh(ch));
    const champ = sigChamps[0] || null;

    const chp = clamp(num(p.attrs && p.attrs.chp, 40), 1, 99);
    const chpFactor = (chp - 50) / 100;                       // about -0.5 .. +0.5
    const targeting = clamp((num(oppStrength, 55) - 55) / 45, 0, 1) * DRAFT_TARGETING;

    const pSignatureOne = clamp(
        DRAFT_SIGNATURE_BASE + chpFactor * DRAFT_CHP_ON_SIGNATURE - targeting,
        0.20, 0.88,
    );
    // Every extra signature is another champion they have to ban. Independent
    // bans, so the chance at least one survives is 1 - (1-p)^n: 0.62 / 0.86 /
    // 0.95 at the base rate, which is precisely what "a third pick nobody can
    // ban you off" claims on the shop card.
    //
    // CAPPED at 0.90 on purpose. Left uncapped, a three-signature player almost
    // never goes off-script, and off-script is the ONLY place OFFSCRIPT_PENALTY
    // and the whole "CHP is punished here and nowhere else" design actually
    // bite — careerSmoke fails outright if any of the three outcomes stops
    // occurring.
    const pSignature = sigChamps.length > 1
        ? Math.min(DRAFT_SIGNATURE_CAP, 1 - Math.pow(1 - pSignatureOne, sigChamps.length))
        : pSignatureOne;
    const pocketShare = clamp(DRAFT_POCKET_BASE + chpFactor * DRAFT_CHP_ON_POCKET, 0.15, 0.92);

    // A signature already played this series cannot be the signature outcome —
    // and the reason matters for the copy. Being banned off it and having played
    // it in game two are different sentences, and DRAFT_LINES only knows how to
    // say the first one.
    const sigSpent = sigIds.length > 0 && sigChamps.length === 0;
    const r = Math.random();
    let outcome;
    if (!sigSpent && r < pSignature) outcome = 'signature';
    else if (r < pSignature + (1 - pSignature) * pocketShare) outcome = 'pocket';
    else outcome = 'offscript';

    // ---- who you are up against ------------------------------------------
    // A stronger org scouts you and picks last, so it counters more often. The
    // same `targeting` term that decides whether your signature survives the
    // ban phase decides whether you get to answer their pick or guess at it.
    const rolePool = championsForRole(p.role) || [];
    const enemy = rolePool.length ? pick(rolePool) : null;
    const counter = Math.random() >= clamp(0.55 - targeting, 0.20, 0.80);

    // ---- what you may pick ------------------------------------------------
    // CHP already decided whether your signature survived. It now decides what
    // is IN the three, which keeps chp's one mechanical job intact while making
    // it a choice rather than a roll.
    const stylePool = championsForStyle(p.role, p.playstyle) || rolePool;
    const bank = (stylePool.length >= DRAFT_OPTIONS ? stylePool : rolePool).slice();

    const options = [];
    const take = (ch) => {
        if (ch && !options.some(o => o.id === ch.id)) options.push(ch);
    };
    // On a surviving signature, which one got through is itself a roll — with
    // three of them the draft is genuinely negotiating with you.
    const survivor = outcome === 'signature' && sigChamps.length ? pick(sigChamps) : null;
    if (outcome === 'signature') take(survivor);
    // Off-script means banned out of everything you actually play, so the three
    // come from the whole role rather than from your style pool.
    // EVERY source is filtered through `fresh`, including both fallbacks. The
    // `(source.length ? source : rolePool)` fallback below is the easy one to
    // miss: unfiltered, it silently backfills game four from a pool that still
    // contains the champions already played, and the symptom is a repeat with no
    // error anywhere.
    const source = (outcome === 'offscript'
        ? rolePool.filter(ch => !stylePool.some(s => s.id === ch.id))
        : bank.filter(ch => !sigIds.includes(ch.id))
    ).filter(fresh);
    const shuffled = (source.length ? source : rolePool.filter(fresh)).slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    for (const ch of shuffled) {
        if (options.length >= DRAFT_OPTIONS) break;
        take(ch);
    }
    for (const ch of rolePool.filter(fresh)) {
        if (options.length >= DRAFT_OPTIONS) break;
        take(ch);
    }

    // POOL DRAIN. Returning fewer than DRAFT_OPTIONS is a hard careerSmoke
    // failure and would leave champion select half-empty, so the series rule is
    // the thing that gives way — not the screen. Unreachable at Bo5 with today's
    // 26-56 champion role pools; it becomes reachable if bestOf ever grows or
    // CHAMPIONS shrinks, and then it must degrade rather than break.
    const exhausted = options.length < DRAFT_OPTIONS;
    if (exhausted) {
        for (const ch of rolePool) {
            if (options.length >= DRAFT_OPTIONS) break;
            take(ch);
        }
    }

    return {
        outcome,
        // The name is only ever shown, never read back for maths.
        champion: survivor ? survivor.name : null,
        // WHY you are not on your signature. A fearless-spent pick is not a ban,
        // and DRAFT_LINES only knows how to say "banned".
        reason: outcome === 'signature' ? null : (sigSpent ? 'fearless' : 'ban'),
        line: (outcome !== 'signature' && sigSpent)
            ? pick(DRAFT_LINES.fearless)
            : pick(DRAFT_LINES[outcome]),

        // Champion select proper. `picked` stays null until the player chooses;
        // the match engine refuses to resolve a decision before it is set.
        options: options.map(ch => ch.id),
        enemyId: enemy ? enemy.id : null,
        counter,
        fearlessExhausted: exhausted,
        picked: null,
    };
}

/** Has champion select been answered for the game in progress? */
export function draftPending(match) {
    const d = match && match.draft;
    if (!d || !Array.isArray(d.options) || !d.options.length) return false;
    return !d.picked;
}

/**
 * Everything the champion select screen needs for one option, and everything
 * resolveOption reads back later. Pure - it writes nothing.
 */
export function draftOption(c, match, championId) {
    const state = st(c);
    const p = (state && state.player) || {};
    const mine = CHAMPION_BY_ID[championId] || null;
    const d = (match && match.draft) || {};
    const theirs = CHAMPION_BY_ID[d.enemyId] || null;

    const games = num(p.proficiency && p.proficiency[championId], 0);
    const prof = proficiency01(games);
    // A blind pick cannot be scored against a lane you have not seen yet.
    const matchup = (d.counter && mine && theirs) ? championMatchup(mine, theirs) : 0;

    return {
        id: championId,
        champion: mine,
        // Any of your signatures, not just the first — otherwise a second pick
        // never shows the Signature chip in champion select or on the locked-in
        // strip, which is most of what "it does not work" looked like.
        isSignature: !!(mine && signatureIds(state).includes(mine.id)),
        games,
        proficiency: prof,
        band: proficiencyBand(prof),
        matchup,
        matchupLabel: matchupLabel(matchup),
        // What the two terms are worth on this pick, so the screen can show the
        // real numbers rather than a vibe.
        matchupSwing: matchupSwingFor(matchup, prof),
        proficiencySwing: (prof - PROFICIENCY_NEUTRAL) * PROFICIENCY_SWING,
    };
}

/** Is the club currently resting this player for burnout? Read off the save
 *  rather than imported from engine.js, which already imports this file. */
function burnoutBenchedNow(state) {
    const b = state && state.flags && state.flags.burnout;
    const until = Number(b && b.benchedUntil) || 0;
    if (!until) return false;
    const t = (state && state.time) || {};
    return until > (Number(t.year) || 0) * 40 + (Number(t.week) || 1);
}

/** A losing lane hurts less the better you know the champion. A winning one is
 *  not improved by it - mastery is protection, not amplification. */
function matchupSwingFor(matchup, prof) {
    const damp = matchup < 0 ? (1 - clamp(prof, 0, 1) * PROFICIENCY_MATCHUP_DAMP) : 1;
    return matchup * MATCHUP_STEP * damp;
}

/** Commit champion select. Returns the updated match; the caller stores it. */
export function chooseDraft(match, championId) {
    if (!match || !match.draft) return match;
    const opts = Array.isArray(match.draft.options) ? match.draft.options : [];
    if (!opts.includes(championId)) return match;
    return { ...match, draft: { ...match.draft, picked: championId } };
}

/** How much of the comfort bonus this game's draft is worth. Old saves have no
 *  `draft` on their in-progress match, so they keep the previous behaviour.
 *
 *  The Second Signature perk ("a second champion you are trusted on - the
 *  comfort-pick bonus follows you through one more ban") is what its own
 *  description always said it was: on the games your signature is banned, the
 *  pocket pick keeps nearly all of the comfort instead of under half of it. */
function draftComfort(match, state) {
    const o = match && match.draft && match.draft.outcome;
    // POCKET_COMFORT is flat. `extraChampion` used to widen it here, which was
    // the whole of what the Second and Third Signature perks did — a scalar on
    // one third of games, invisible on every screen. Those perks now buy real
    // signature picks (see signatureIds/rollDraft); paying them here as well
    // would be paying twice, and the mean match rating has very little headroom
    // against careerSmoke's 7.6 hard fail.
    if (o === 'pocket') return POCKET_COMFORT;
    if (o === 'offscript') return 0;
    return 1;
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
        // Benched, the player's own seat contribution comes out - but the
        // CLUB's does not. Its signings and its momentum belong to the club
        // whether or not you are in the chair, so the benched branch reads
        // clubStrengthFor() rather than the written table value.
        myStrength: plays ? teamStrengthWithPlayer(state, myTeam) : clubStrengthFor(state, myTeam),

        seriesScore: [0, 0],
        game: 1,

        advantage: 0,
        personal: 0,
        kda: { k: 0, d: 0, a: 0 },
        cs: 0,

        queue: drawn.queue,
        usedIds: drawn.usedIds,
        eventIndex: 0,

        // FEARLESS. Every champion locked in so far THIS SERIES, threaded
        // exactly the way usedIds already threads decision events. Never
        // persisted — matchState is deliberately not part of the save — so a
        // reload cannot arrive holding a half-used set.
        usedChampions: [],

        // Champion select for game one. Re-rolled every game in finishGame().
        draft: plays ? rollDraft(state, teamStrength(oppTeam, year), []) : null,

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

    // MORALE. Wanting to be there reached a match only through form before this
    // — 28 points of form baseline across morale's whole range, worth about 3pp
    // of a single decision. Now a slump costs directly, and only a slump does.
    const morale = clamp(num(p.morale, 50), 0, 100);
    if (morale < MORALE_FLOOR_AT) {
        chance -= ((MORALE_FLOOR_AT - morale) / MORALE_FLOOR_AT) * MORALE_SWING;
    }

    // HEALTH, and it is a PENALTY THAT FADES, never a bonus. A player at 3
    // health used to play exactly as well as one at 100 the moment he got on
    // stage. Zero at HEALTH_FLOOR_AT and above, so it is mathematically
    // incapable of pushing the mean rating up — which is why health gets this
    // shape and morale gets the centred one.
    const health = clamp(num(p.health, 100), 0, 100);
    if (health < HEALTH_FLOOR_AT) {
        chance -= ((HEALTH_FLOOR_AT - health) / HEALTH_FLOOR_AT) * HEALTH_SWING;
    }

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

    // Comfort pick. On the games the draft actually gave you your champion,
    // the plays it was built for get easier. On the games you were banned out
    // of your whole pool, you are on something you do not know and it costs.
    // The champion actually locked in, if champion select has been answered.
    // Falls back to the signature pick so an in-progress save from before
    // champion select existed keeps behaving exactly as it did.
    const draft = (match && match.draft) || null;
    const playing = CHAMPION_BY_ID[(draft && draft.picked) || p.champion] || null;

    const scale = draftComfort(match, state);
    if (scale > 0) {
        const arche = playing ? ARCHETYPE_BIAS[playing.archetype] : null;
        if (arche && option.bias) {
            const comfort = Math.max(0, 1 - 2 * biasDistance(arche, option.bias));
            chance += comfort * COMFORT_BONUS * scale;
        }
    } else {
        chance += OFFSCRIPT_PENALTY;
    }

    // Lane matchup and how well you know the pick. Both only apply once a
    // champion has actually been chosen.
    if (playing && draft && draft.picked) {
        const prof = proficiency01(num(p.proficiency && p.proficiency[playing.id], 0));
        chance += (prof - PROFICIENCY_NEUTRAL) * PROFICIENCY_SWING;

        // A blind pick is not scored against a lane you could not see.
        const theirs = draft.counter ? CHAMPION_BY_ID[draft.enemyId] : null;
        if (theirs) chance += matchupSwingFor(championMatchup(playing, theirs), prof);
    }

    // The map read. Nothing in the option text says which one this is.
    if (option.when) {
        chance += gameStateTags(match).has(option.when) ? WHEN_MATCH : WHEN_MISS;
    }

    // Stakes. Multiplicative and applied last, so it scales whatever the other
    // terms left rather than papering over a bad matchup.
    const stakes = stakesBonus(state, match);
    if (stakes > 0) chance *= 1 + stakes;

    return clamp(chance, CHANCE_MIN, CHANCE_MAX);
}

/**
 * The clutch / international premium for this particular game, 0 when none
 * applies. A knockout is any bracket PHASE; the phase set is what catches a Bo1
 * group game at Worlds, and the Bo5 arm catches a tie the schedule labelled
 * unusually.
 *
 * IT USED TO READ `bestOf >= 3`, WHICH IS NOW WRONG. Korea, China and the
 * Pacific play a Bo3 regular season, so that arm would hand every owner of the
 * clutch perks their full knockout premium in every ordinary league game — a
 * flat rating rise across two thirds of a career, paid for nothing, straight at
 * careerSmoke's 7.6 mean-rating failure line. A Bo5 is only ever a knockout;
 * a Bo3 no longer implies anything at all.
 */
function stakesBonus(state, match) {
    if (!match) return 0;
    const perks = perkEffects(state);
    const phase = String(match.phase || '');
    let bonus = 0;
    if (KNOCKOUT_PHASES.has(phase) || num(match.bestOf, 1) >= 5) {
        bonus += clamp(num(perks.clutchBonus, 0), 0, CLUTCH_BONUS_CAP);
    }
    if (INTL_PHASES.has(phase)) {
        bonus += clamp(num(perks.intlBonus, 0), 0, INTL_BONUS_CAP);
    }
    return bonus;
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

    // Bank the game on whatever was actually locked in. Not on player.champion:
    // the signature pick is a preference, proficiency is a record of what you
    // have played. A benched game teaches you nothing.
    if (match.playerPlays !== false && match.draft && match.draft.picked) {
        addProficiency(match.draft.picked, 1);
    }

    const seriesScore = [
        num(match.seriesScore && match.seriesScore[0], 0) + (won ? 1 : 0),
        num(match.seriesScore && match.seriesScore[1], 0) + (won ? 0 : 1),
    ];
    const need = winsNeeded(match.bestOf);
    const over = seriesScore[0] >= need || seriesScore[1] >= need;

    // FEARLESS. Banked on what was LOCKED IN, never on player.champion — the
    // same rule the proficiency line above states, for the same reason.
    const prevUsed = Array.isArray(match.usedChampions) ? match.usedChampions : [];
    const lockedIn = match.draft && match.draft.picked;
    const usedChampions = (lockedIn && !prevUsed.includes(lockedIn))
        ? prevUsed.concat([lockedIn])
        : prevUsed.slice();

    let next = {
        ...match,
        seriesScore,
        usedChampions,
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
            // Every game drafts again, and now it drafts against everything
            // already played this series. Losing your pick in game three of a
            // Bo5 is still the reason this is per game and not per series; being
            // unable to play it twice is the reason it takes the used set.
            draft: match.playerPlays ? rollDraft(state, match.oppStrength, usedChampions) : null,
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

// POST-MATCH MORALE. KDA and a lost series already reach morale twice over
// before any of the below: gameRating folds the series ratio in as
// clamp((ratio - 2.4) * 0.28, -1.5, 1.6), moraleDelta then reads that rating
// back as (rating - 6) * 1.4, and a lost series is a flat -5 on top. These two
// terms are therefore sized as a TOP-UP on a charge already being made, not as
// the whole price of a bad night - a term written as if nothing else existed
// would be paid three times.
//
// PENALTY-ONLY, for exactly the reason the condition block in successChance
// gives: morale measures near 93 across a simulated run, it feeds the morale
// FLOOR in successChance, and careerSmoke fails a run outright above a 7.6 mean
// match rating. A KDA bonus here would raise morale, raise that floor and lift
// every rating in the mode; a penalty that fades can only bite when the thing
// it measures has actually gone wrong.
//
// Both are capped at 3, against SQUAD_STATUS.moralePull's weekly cap of 3 and
// the existing +/-12 clamp on moraleDelta - a sink that could swallow the whole
// clamp on its own would make a bad series indistinguishable from a catastrophe.
const KDA_SOUR_AT = 1.6;        // series KDA ratio at or above which nothing is charged
const KDA_MORALE_STEP = 1.6;    // morale per point of ratio below the line
const KDA_MORALE_MAX = 3.0;     // hard cap on the KDA term alone
const LOSS_STREAK_STEP = 0.9;   // morale per consecutive prior loss
const LOSS_STREAK_MAX = 3.0;    // hard cap on the streak term alone
/** How far back the streak scan reads. A split is 18 league rows plus a
 *  bracket, so twelve covers the whole of a bad run while bounding the sort on
 *  a schedule that rot could have made enormous. */
const LOSS_STREAK_SCAN = 12;

/**
 * Consecutive losses immediately BEFORE this match. finishMatch() runs before
 * applyMatchResult() ticks this fixture off, so the tail of the played rows is
 * genuinely the run that led into this one and never includes it.
 *
 * SORTED before tailing, the same as formBaseline() and tickClubMomentum():
 * season.schedule is NOT in week order - ensureSeason() rebuilds it as
 * [...freshSplitRows, ...carriedBracketRows] and MSI is carried into summer, so
 * the raw tail holds the OLDEST games of the half-year. Wrapped, because a
 * rotten schedule must cost the player nothing rather than break a match.
 */
function priorLossStreak(state) {
    try {
        const rows = (state && state.season && Array.isArray(state.season.schedule))
            ? state.season.schedule : [];
        const played = rows
            .filter(f => f && f.played === true)
            .sort((a, b) => num(a.week, 0) - num(b.week, 0))
            .slice(-LOSS_STREAK_SCAN);
        let n = 0;
        for (let i = played.length - 1; i >= 0; i--) {
            // Anything that is not an explicit loss ends the run, so a row whose
            // `won` never got written cannot be counted as one.
            if (played[i].won !== false) break;
            n++;
        }
        return n;
    } catch (e) {
        return 0;
    }
}

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
        // A sour stat line and a run of defeats are the two things a player
        // takes home, and neither was charged for on its own: the rating buries
        // the first (a 0/6/2 and a 2/6/8 differ by about half a point of rating
        // and by nothing at all afterwards) and the flat -5 treats the fifth
        // loss in a row exactly like the first. Both are floors - see the block
        // above KDA_SOUR_AT for why neither may ever pay out.
        const ratio = fmtKDA(kda.k, kda.d, kda.a).ratio;
        const kdaTerm = ratio >= KDA_SOUR_AT ? 0
            : -clamp((KDA_SOUR_AT - ratio) * KDA_MORALE_STEP, 0, KDA_MORALE_MAX);
        const streakTerm = won ? 0
            : -clamp(priorLossStreak(state) * LOSS_STREAK_STEP, 0, LOSS_STREAK_MAX);
        moraleDelta = Math.round(clamp(
            (won ? 5 : -5) + (rating - 6) * 1.4 + (mvp ? 4 : 0) + kdaTerm + streakTerm,
            -12, 12,
        ));
    } else {
        formDelta = won ? 0 : -1;
        // Watching from the bench costs morale — unless the club is the one that
        // took you out of the rotation to recover. Charging that player for
        // every game he was told not to play would out-run the relief the bench
        // exists to give, and the "rest and come back" weeks would leave him
        // worse than they found him.
        moraleDelta = burnoutBenchedNow(state) ? 0 : -(4 + randInt(0, 3));
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

/**
 * Champion select, answered by the game rather than the player.
 *
 * quickSim used to skip this entirely, and the consequences were invisible: with
 * `draft.picked` left null, successChance falls back to `p.champion`, the
 * proficiency and matchup terms are both skipped, and finishGame banks no
 * proficiency at all. Roughly half of every career's games are simmed, so half
 * of every career silently bypassed three mechanics — and fearless draft, which
 * keys off what was locked in, would have quietly done nothing in any of them.
 */
function autoDraft(state, match) {
    if (!draftPending(match)) return match;
    const opts = Array.isArray(match.draft.options) ? match.draft.options : [];
    let best = null, bestScore = -Infinity;
    for (const id of opts) {
        const o = draftOption(state, match, id);
        const score = num(o.matchupSwing, 0) + num(o.proficiencySwing, 0) + (o.isSignature ? 0.001 : 0);
        if (score > bestScore) { bestScore = score; best = id; }
    }
    return best ? chooseDraft(match, best) : match;
}

export function quickSim(c, opts = {}) {
    const state = st(c);
    let match = autoDraft(state, buildMatch(state, opts));

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
        // Every game after the first drafts again, so the sim has to answer
        // again — otherwise fearless would apply to hand-played series only and
        // the same fixture would play differently depending on which button was
        // pressed.
        match = autoDraft(state, match);
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
