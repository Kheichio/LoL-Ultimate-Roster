// ===========================================================================
//  LoL ULTIMATE CAREER -- the week/season orchestrator
// ===========================================================================
//  This module owns the flow of time. Every other career module is a library:
//  it answers a question or applies one effect. Nothing else decides when a
//  split ends or what happens when the player clicks "Advance Week".
//
//  The shape of a week:
//    startCareerWeek()  refill slots, pay wages, drift form, roll an event
//    doActivity() x N   the player spends their slots
//    startFixture() / simFixture() / completeMatch()   the games
//    advanceWeek()      auto-sim anything skipped, move the league, tick the
//                       clock, run phase transitions, then start the next week
//
//  Every store write goes through the primitive mutators in stores/career.js
//  or a career.update(), and saveCareer() follows any state change. This file
//  never touches localStorage.
//
//  ASCII only -- this repo has been corrupted by encoding round-trips before.

import {
    WEEKS_PER_YEAR, PHASES, phaseForWeek, ACTIVITY_BY_ID, CLUB_TRAINING_SLOTS,
    PATH_BY_ID, REGION_IDS, MMR_MAX, RETIREMENT_AGE_FORCED, ATTR_KEYS,
    teamById, DEFAULT_START_YEAR, ROLE_BY_ID, ATTR_BY_KEY, regularBestOf,
    MIN_AGE_INTERNATIONAL, soloTargetFor,
    LANGUAGE_BY_ID, LANGUAGE_MAX, LANGUAGE_FLUENT, LANGUAGE_SIGN_MIN,
    LANGUAGE_IMMERSION_WEEKLY, languageForRegion, languageLevelFor, languageBand,
    studyTargetFor, languageStudyGain,
    splitForWeek, CHAMPION_BY_ID, PROFICIENCY_GAMES, proficiency01, proficiencyBand,
} from './constants.js';
import {
    clamp, randInt, calcOVR, calcPotentialOVR, statusInfo, decayFor, rankFromMMR,
    fmtGold, fmtFollowers, rollTrait, traitPotentialBonus, traitEffects,
    revealAgeFor,
} from './ratings.js';
import {
    generateSchedule, blankStandings, simulateAIWeek, leagueTable,
    playoffSeeds, teamsInRegion, teamStrength, teamStrengthWithPlayer,
    winChance, ROSTER_SLOTS, clubRosterFor, signingFor,
    clubBlock, SCRIM_SEAT_CAP, SCRIM_SEAT_PER_SESSION,
} from './teams.js';
import {
    SOLOQ_GAIN, SCRIM_GAIN, VOD_GAIN, trainingMultiplier, restRecovery,
} from './training.js';
import {
    weeklyIncome, expireSponsors, expireBuffs, lifestyleEffects, perkEffects,
    gearEnergyBonus, followerMultiplier, reconcilePermanentPerks,
} from './economy.js';
import {
    pruneExpiredOffers, generateOffers, clubReview, promotionCheck,
    releaseFromClub, recordReview, enforceContract,
} from './contracts.js';
import {
    endOfSplitAwards, grantAwards, checkMilestones, grantMilestones, retire,
} from './awards.js';
import {
    rollWeeklyEvent, rollWeeklyEvents, rollPreGameEvent, firstTimeEvent, rollInterview,
} from './events.js';
import { buildMatch, quickSim, applyMatchResult } from './match.js';
import {
    career, matchState, careerOverlay, pushOverlay, absWeek, saveCareer, addNews,
    grantGold, spendGold, grantFollowers, adjustCondition, applyAttrGain, spendAction,
    logWeek, raisePotential, addTrait, applyAttrLoss, addProficiency,
} from '../stores/career.js';

// ---------------------------------------------------------------------------
//  TUNING
// ---------------------------------------------------------------------------

/** Energy that comes back on its own every week, before gear and lifestyle.
 *  A four-action week costs roughly 60-80, so this is a top-up, not a refill:
 *  Rest Day is still the only way to run a heavy week back to back. */
const BASE_ENERGY_REGEN = 14;

/** Form is elastic. Each week it moves this fraction of the way toward the
 *  baseline morale and recent results set for it, capped so a single week can
 *  never swing a player from crisis to red hot. */
const FORM_PULL = 0.28;
const FORM_MAX_DRIFT = 7;

/** Skipping a fixture is allowed -- the engine simulates it -- but the room
 *  notices when a player is not in the seat. */
const NOSHOW_MORALE = 2;
const NOSHOW_MORALE_CAP = 6;

/** Bo5 for every knockout tie in the mode. */
const PLAYOFF_BEST_OF = 5;

/** BREAKTHROUGHS -- the split-by-split way past your own ceiling.
 *
 *  The genetic trait is the LUCK lever on the ceiling; this is the EARNED one.
 *  It is deliberately the smaller of the two, and it is bounded for a career,
 *  not just per split. Without the lifetime budget a player who wins things for
 *  a decade gets two dozen chances at it and arrives at 99 in everything -- the
 *  first cut of this did exactly that, taking every smoke career to 94-99 and
 *  making the ceiling meaningless in the process. The budget is expressed in
 *  potential OVERALL points because that is the number the player actually
 *  reads; how it is spread across attributes is an implementation detail. */
const BREAKTHROUGH_MIN_GAMES = 10;    // a real split, not three games and an injury
const BREAKTHROUGH_RATING = 7.9;      // mean own-rating worth one point
const BREAKTHROUGH_RATING_HIGH = 8.4; // ...and worth two
const BREAKTHROUGH_MAX = 3;           // ceiling points from any one split
const BREAKTHROUGH_ATTRS = 3;         // how many attributes share them
/** Total potential OVR a whole career may gain this way. A decade of winning
 *  everything spends it; anything less never sees the end of it.
 *  Exported so tools/careerSmoke.mjs asserts the real budget rather than a
 *  copy of it that can quietly go stale. */
export const BREAKTHROUGH_CAREER_MAX = 4;
/** Fraction of a breakthrough that lands on the attribute straight away. The
 *  rest still has to be trained: the raise opens the room, it does not fill it. */
const BREAKTHROUGH_INSTANT = 0.6;

/** Championship points by finishing position in a domestic bracket. */
const CP_BY_PLACE = [140, 90, 55, 40, 25, 15];

/** Physio cover from a Gym & Physio week, in weeks. */
const PHYSIO_WEEKS = 4;

/**
 * Age decay weights. decayFor(age) hands back the total points a year takes
 * off a veteran; these split it across the eight attributes.
 *
 * Hands go first and they go fastest -- mechanics is the attribute a
 * twenty-nine-year-old actually loses. Laning and teamfighting follow it down
 * at a slower rate because execution under pressure decays with reactions.
 * Map awareness and composure barely move: they are habits, not reflexes.
 * Shotcalling and game knowledge are almost immune (0.15 / 0.10) -- a veteran
 * caller is worth more at thirty than at twenty-two, and the whole point of
 * the twilight band is that a player can survive it by leaning on the half of
 * the game that does not decay.
 *
 * The weights sum to 4.75, so decayFor() is a scale rather than a literal
 * point total: at 30 (decay 3.2) a career loses ~4.3 MEC and ~0.3 KNW.
 */
const DECAY_WEIGHTS = {
    mec: 1.35, lne: 1.00, tmf: 0.85, map: 0.55,
    cmp: 0.40, chp: 0.35, ldr: 0.15, knw: 0.10,
};

/** DECLINE -- the split-by-split way BACKWARD, and the exact mirror of the
 *  breakthrough dials above.
 *
 *  Until this existed, applyAgeDecay() was the only thing in the whole mode that
 *  ever took a point off a player, and decayFor() is zero for every age up to
 *  24. A nineteen-year-old could post a 3.5 mean for four straight splits and
 *  lose nothing: OVR by year was monotonically increasing for every measured
 *  career until a -1 or -2 in the final season.
 *
 *  A split UNDER PAR now costs attribute points -- but the loss is MAINTAINED
 *  AWAY by training (see DECLINE_TRAIN_OFFSET), which is what makes this a
 *  tactical system rather than a punitive one: the player is not being taxed for
 *  a bad split, they are being told which attributes they stopped looking after.
 *
 *  Bounded FOR THE CAREER, not merely priced, for the same reason
 *  BREAKTHROUGH_CAREER_MAX exists on the other side of the ledger: splits are
 *  renewable and a rating is not, so a repeatable loss with no budget grinds
 *  every long career into the floor exactly as the un-budgeted first cut of
 *  Breakthrough took every smoke career to 94-99. */
/*  PAR IS MEASURED, NOT GUESSED. The mode's mean match rating is ~7.4 with a
 *  per-game sd of ~1.05, and a split is ~18-20 games, so a SPLIT mean has an sd
 *  of only about 1.05/sqrt(19) = 0.24. Par at 6.6 is therefore three to four
 *  sigma under the mode and fires essentially never -- the first cut of this
 *  system was measured on --seed 42 and bit ZERO splits across eight full
 *  careers. A gate nobody can trip and a gate that was never wired look
 *  identical from the outside, which is the failure careerSmoke's inertness
 *  assertions exist to catch, so these two numbers must be RE-MEASURED against
 *  the MATCH RATINGS block whenever that block moves. */
const DECLINE_MIN_GAMES = 10;      // mirror BREAKTHROUGH_MIN_GAMES: a real split
const DECLINE_RATING = 6.90;       // at or below this mean, the split was under par
const DECLINE_RATING_BAD = 6.40;   // ...and at or below this it bites harder
const DECLINE_SLOPE = 4.0;         // attribute points per rating point under par
/*  ATTRIBUTE points, not OVR points, and the difference is the whole reason
 *  this number looks large. The share handed to each attribute is NORMALISED so
 *  the eight of them sum to this total, while OVR is a role-WEIGHTED MEAN whose
 *  weights sum to 1 -- so a split that takes N attribute points moves OVR by
 *  only about N/8. The first cut used 1.6 here and measured at -0.0 mean OVR
 *  across eight full careers: it fired in 8.1 splits each and cost nothing at
 *  all, which also meant flags.decline.ovrLost never rose and the career budget
 *  never bound. (Age decay avoids the trap by NOT normalising -- it multiplies
 *  each DECAY_WEIGHT, which sum to 4.75, so its yearly rate of 3.2 is really
 *  ~15 attribute points and lands as the 1-2 OVR a season a veteran feels.)
 *  6.0 here is about 0.75 OVR for a genuinely bad split. */
const DECLINE_MAX_SPLIT = 6.0;     // total attribute points one split may take
/** Total OVR a whole career may lose to DECLINE. Age decay is a separate,
 *  unbudgeted system and is not billed here.
 *  Exported so tools/careerSmoke.mjs asserts the real budget rather than a copy
 *  of it that can quietly go stale -- same reason BREAKTHROUGH_CAREER_MAX is. */
export const DECLINE_CAREER_MAX = 6;
/** How much one drill on an attribute protects it for the split it was run in.
 *  Three drills is 1.02, i.e. fully protected; nothing at all takes the full
 *  share. THIS is the "training maintains as well as improves" mechanic. */
const DECLINE_TRAIN_OFFSET = 0.34;

const PHASE_BY_ID = PHASES.reduce((m, p) => { m[p.id] = p; return m; }, {});

// ---------------------------------------------------------------------------
//  SMALL HELPERS
// ---------------------------------------------------------------------------
function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

/** Synchronous store read. A writable calls its subscriber immediately, so
 *  subscribe/unsubscribe is exactly what svelte's get() does. */
function snap() {
    let v = null;
    const un = career.subscribe(x => { v = x; });
    un();
    return v;
}

function liveMatch() {
    let v = null;
    const un = matchState.subscribe(x => { v = x; });
    un();
    return v;
}

function ok(msg, detail) { return { ok: true, msg, detail: detail || '' }; }
function no(msg) { return { ok: false, msg, detail: '' }; }

function safe(fn, fallback) {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

/** Stable 0-1 from a string. Used anywhere the UI re-renders a roll -- a
 *  forecast that flickers every keystroke is worse than no forecast. */
function hash01(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) / 4294967296;
}

function scheduleOf(c) {
    return Array.isArray(c && c.season && c.season.schedule) ? c.season.schedule : [];
}

function fixturesInWeek(c) {
    const w = num(c && c.time && c.time.week, 1);
    return scheduleOf(c).filter(f => f && num(f.week, -1) === w);
}

function findFixture(c, id) {
    return scheduleOf(c).find(f => f && f.id === id) || null;
}

function phaseName(id) {
    return PHASE_BY_ID[id] ? PHASE_BY_ID[id].name : 'Match';
}

function strengthOfId(c, id) {
    const t = teamById(id);
    if (!t) return 55;
    const year = num(c.time.year, DEFAULT_START_YEAR);
    if (id === c.player.clubId) return safe(() => teamStrengthWithPlayer(c, t), t.strength);
    return safe(() => teamStrength(t, year), t.strength);
}

/** The languages map, type-checked. A rotted save can carry null, an array or a
 *  string here, and spreading any of those would silently drop every level the
 *  player has earned. Same discipline as burnoutOf(). */
function languagesOf(c) {
    const m = c && c.player && c.player.languages;
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}

/** The phases where an ordinary schedule row is still a big game. A bracket row
 *  is one by definition; these cover the league fixtures that sit inside a
 *  tournament window, which is how a First Stand or MSI week reads. */
const MAJOR_PHASES = new Set(['spring_po', 'summer_po', 'first_stand', 'msi', 'worlds']);

/** The one game this week worth being nervous about, or null. UNPLAYED only:
 *  the pre-game roll must fire for the game the player is about to walk into,
 *  never for one they have already finished. */
function majorFixtureFor(c) {
    return fixturesInWeek(c).find(
        f => f && !f.played && (f.kind === 'bracket' || MAJOR_PHASES.has(f.phase)),
    ) || null;
}

function pushSchedule(rows) {
    if (!rows || !rows.length) return;
    career.update(c => {
        const have = new Set(scheduleOf(c).map(f => f.id));
        const add = rows.filter(r => r && !have.has(r.id));
        if (!add.length) return c;
        return { ...c, season: { ...c.season, schedule: [...scheduleOf(c), ...add] } };
    });
}

// ---------------------------------------------------------------------------
//  WEEK START
// ---------------------------------------------------------------------------

/** Baseline the week's form drift pulls toward: mostly morale, nudged by how
 *  the last four games actually went. */
function formBaseline(c) {
    const morale = clamp(num(c.player.morale, 50), 0, 100);
    let base = 34 + morale * 0.28;
    // Sorted before tailing, for the same reason tickClubMomentum() is: the
    // schedule array is not in week order once a carried MSI bracket has been
    // appended to a freshly drawn summer split.
    const played = scheduleOf(c)
        .filter(f => f && f.played)
        .sort((a, b) => num(a.week, 0) - num(b.week, 0))
        .slice(-4);
    if (played.length) {
        const rate = played.filter(f => f.won).length / played.length;
        base += (rate - 0.5) * 18;
    }
    return clamp(base, 10, 92);
}

/**
 * Begin a new week. Refills the activity slots, pays everything that pays,
 * clears the weekly ledgers, drifts the condition meters and rolls the week's
 * event. Idempotent within a week -- calling it twice never pays twice.
 */
export function startCareerWeek() {
    const notes = [];
    const start = snap();
    if (!start || !start.created) return { event: null, events: [], income: null, notes };

    const stamp = absWeek(start);
    if (num(start.weekly && start.weekly.stamp, -1) === stamp) {
        return { event: null, events: [], income: weeklyIncome(start), notes };
    }

    // ---- upkeep: sponsors, buffs and stale offers --------------------------
    const liveSponsors = expireSponsors(start);
    const liveBuffs = expireBuffs(start);
    const lostSponsors = (Array.isArray(start.sponsors) ? start.sponsors.length : 0) - liveSponsors.length;
    career.update(c => ({ ...c, sponsors: liveSponsors, buffs: liveBuffs }));
    if (lostSponsors > 0) {
        notes.push(lostSponsors === 1 ? 'A sponsorship ran out.' : `${lostSponsors} sponsorships ran out.`);
        addNews(lostSponsors === 1
            ? 'A sponsorship deal reached the end of its term.'
            : `${lostSponsors} sponsorship deals reached the end of their terms.`, 'money');
    }
    const dropped = safe(() => pruneExpiredOffers(), 0);
    if (dropped > 0) notes.push(dropped === 1 ? 'An offer lapsed.' : `${dropped} offers lapsed.`);

    // Perks whose effect is a one-off write rather than a live multiplier. This
    // is idempotent and cheap, and it is what gives a save that bought Evergreen
    // while the perk was inert the ceiling it paid fourteen legacy points for.
    safe(() => reconcilePermanentPerks(), null);

    // ---- slots -------------------------------------------------------------
    const c = snap();
    const path = PATH_BY_ID[c.player.path] || PATH_BY_ID.debut;
    const life = lifestyleEffects(c);
    const perks = perkEffects(c);
    const actions = Math.max(1, Math.round(
        num(path.weeklyActions, 3) + num(life.extraActions, 0) + num(perks.extraActions, 0),
    ));
    const clubSlots = c.player.clubId
        ? (CLUB_TRAINING_SLOTS[c.player.clubTier] || CLUB_TRAINING_SLOTS[3])
        : actions;

    career.update(x => ({
        ...x,
        weekly: {
            actionsLeft: actions,
            actionsMax: actions,
            trained: {},
            did: {},
            // REBUILT FROM A LITERAL, so every weekly key has to be named here or
            // it is deleted every week and careerSmoke's shape check fails on it.
            // counts is the per-activity repeat ledger doSoloQueue prices its
            // grind off; `did` above stays the once-a-week boolean ledger.
            counts: {},
            clubSlotsLeft: clubSlots,
            log: [],
            stamp,
        },
        totals: {
            ...x.totals,
            peakOVR: Math.max(num(x.totals.peakOVR, 0), calcOVR(x.player.attrs, x.player.role)),
        },
    }));

    // ---- energy ------------------------------------------------------------
    const regen = Math.round(
        BASE_ENERGY_REGEN + num(gearEnergyBonus(c), 0)
        + num(life.energyRegen, 0) + num(perks.energyRegen, 0),
    );
    if (regen > 0) adjustCondition('energy', regen);

    // ---- immersion: the language the room actually works in ----------------
    // Living somewhere teaches you it slowly whether you study or not, which is
    // what makes an existing foreign signing converge on fluent instead of
    // sitting at whatever the arrival boost gave them for six years. Scaled by
    // the room left, so it converges rather than accumulating.
    //
    // DELIBERATELY BEFORE the four condition steps below rather than anywhere
    // inside them. Those four are one ordered block -- form drift, seat morale
    // pull, purchased floors, tickBurnout -- and their order is load-bearing; a
    // language level is not a condition meter and must not be dropped between
    // the pull and the floors just because that is where there was room.
    const liveLang = c.player.clubId && c.player.contract
        ? languageForRegion(c.player.contract.region)
        : null;
    if (liveLang) {
        const lvl = languageLevelFor(c, liveLang);
        if (lvl < LANGUAGE_MAX) {
            // Fractional on write, like attrs: immersion pays in tenths and
            // rounding each week down would never move the level at all.
            const soaked = clamp(lvl + LANGUAGE_IMMERSION_WEEKLY * (1 - lvl / LANGUAGE_MAX), 0, LANGUAGE_MAX);
            career.update(x => ({
                ...x,
                player: { ...x.player, languages: { ...languagesOf(x), [liveLang]: soaked } },
            }));
        }
    }

    // ---- form drift and the floors money buys ------------------------------
    const target = formBaseline(c);
    const drift = clamp(Math.round((target - num(c.player.form, 50)) * FORM_PULL), -FORM_MAX_DRIFT, FORM_MAX_DRIFT);
    if (drift !== 0) adjustCondition('form', drift);

    // ---- what the seat does to you -----------------------------------------
    // Sitting on a bench is its own slow pressure, and a franchise player's seat
    // is its own slow reassurance. A PULL toward the seat's target, capped per
    // week, so it converges instead of accumulating — see SQUAD_STATUS.
    //
    // ORDER IS LOAD-BEARING: form drift, then this pull, then the floors money
    // buys. The floor has to be applied LAST or a purchased moraleFloor stops
    // protecting the thing it promises to protect.
    // Applies to the UNSIGNED too. Left to the club-only branch, a free agent
    // grinding solo queue with nobody calling drifted to 90+ and stayed there,
    // which made the whole meter a constant. UNSIGNED_MORALE_TARGET is the
    // "nobody has called yet" baseline.
    // SUPPRESSED while burnout has you benched. The bench target is 34, below
    // the burnout clear line, so leaving the pull running would hold a recovering
    // player under the threshold for ever and re-bite him the moment the bench
    // lifted. tickBurnout() grants its own relief in those weeks instead.
    if (!burnoutBenched(c)) {
        const seat = c.player.clubId ? statusInfo(c.player.status) : null;
        const target = seat ? num(seat.moraleTarget, 55) : UNSIGNED_MORALE_TARGET;
        const pullCap = seat ? Math.max(0, num(seat.moralePull, 3)) : UNSIGNED_MORALE_PULL;
        const gap = target - num(c.player.morale, 50);
        const step = clamp(Math.round(gap * MORALE_PULL_RATE), -pullCap, pullCap);
        if (step !== 0) adjustCondition('morale', step);
    }

    const moraleFloor = Math.max(num(life.moraleFloor, 0), num(perks.moraleFloor, 0));
    const formFloor = num(perks.formFloor, 0);
    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            morale: Math.max(x.player.morale, moraleFloor),
            form: Math.max(x.player.form, formFloor),
        },
    }));

    // ---- burnout -----------------------------------------------------------
    // LAST, and after the floors on purpose: a purchased moraleFloor has to be
    // able to prevent this outright, which is what makes the psych retainer a
    // real thing to have bought rather than a number on a shop card.
    safe(() => tickBurnout(), null);

    // ---- money -------------------------------------------------------------
    const income = weeklyIncome(snap());
    if (income.total > 0) {
        grantGold(income.total);
        const parts = [];
        if (income.salary > 0) parts.push(`${fmtGold(income.salary)} wage`);
        if (income.sponsors > 0) parts.push(`${fmtGold(income.sponsors)} sponsors`);
        addNews(`Weekly income: ${fmtGold(income.total)} gold (${parts.join(', ')}).`, 'money');
        notes.push(`+${fmtGold(income.total)} gold`);
    }

    // ---- who is calling ----------------------------------------------------
    const fresh = safe(() => generateOffers(snap()), []);
    if (fresh.length) {
        career.update(x => ({ ...x, offers: [...(Array.isArray(x.offers) ? x.offers : []), ...fresh] }));
        for (const o of fresh) {
            addNews(`${o.teamName} have made you an offer: ${fmtGold(o.salary)}/wk, ${o.years} year(s).`, 'transfer');
        }
        notes.push(fresh.length === 1 ? 'A club made you an offer.' : `${fresh.length} clubs made you an offer.`);
    }

    // ---- the week's story --------------------------------------------------
    // rollWeeklyEvents, not rollWeeklyEvent: a bad week can now be two things.
    // It always hands back an array and never a falsy entry.
    const events = safe(() => rollWeeklyEvents(snap()), []);

    // ---- the hours before a big game ---------------------------------------
    // AT WEEK START, and deliberately NOT in startFixture().
    //
    // startFixture is bypassed by all three sim paths -- the Hub's Sim button,
    // the Calendar's Sim button and simSkippedFixtures() inside advanceWeek --
    // so an event rolled there simply would not exist for a player who sims,
    // which over a twelve-year career is most of them. And its last statement is
    // matchState.set(m): past that line CareerShell has already swapped to
    // MatchDay and buildMatch has ALREADY BUILT the match object, so an effect
    // applied there could not touch the game it was announcing.
    //
    // Here the form and morale land before the player presses Play, on every
    // path, with no deadlock risk and nothing layered over MatchDay.
    const major = safe(() => majorFixtureFor(snap()), null);
    if (major) {
        // Every ctx field defaulted to a real string or number here, because the
        // pool's gates and its text functions read them directly.
        const majorPhase = major.phase || phaseForWeek(num(major.week, 1)).id;
        const oppTeam = major.opponentId ? teamById(major.opponentId) : null;
        const pre = safe(() => rollPreGameEvent(snap(), {
            phase: majorPhase,
            phaseName: phaseName(majorPhase),
            label: major.label || phaseName(majorPhase),
            opponentId: major.opponentId || '',
            opponentName: oppTeam ? oppTeam.name : 'an opponent',
            bestOf: bestOfFor(major, snap()),
            kind: major.kind || 'league',
        }), null);
        if (pre) events.push(pre);
    }

    saveCareer();
    // `event` is kept as the first entry for the callers that predate the array:
    // careerSmoke reads it and the two UI call sites are widened separately.
    return { event: events.length ? events[0] : null, events, income, notes };
}

// ---------------------------------------------------------------------------
//  READ-ONLY VIEWS
// ---------------------------------------------------------------------------

/** Everything the hub and the season screen render for the current week.
 *  Pure: safe to call on every render, never writes. */
export function weekSummary(c) {
    const s = c || snap();
    const week = num(s && s.time && s.time.week, 1);
    const year = num(s && s.time && s.time.year, DEFAULT_START_YEAR);
    const phase = phaseForWeek(week);
    const fixtures = fixturesInWeek(s);
    const gate = canAdvanceWeek(s);

    return {
        week,
        year,
        phase: phase.id,
        phaseName: phase.name,
        fixtures,
        nextFixture: fixtures.find(f => !f.played) || null,
        actionsLeft: num(s && s.weekly && s.weekly.actionsLeft, 0),
        actionsMax: num(s && s.weekly && s.weekly.actionsMax, 0),
        income: safe(() => weeklyIncome(s), { salary: 0, sponsors: 0, total: 0 }),
        canAdvance: gate.ok,
        blockers: gate.ok ? [] : [gate.reason],
    };
}

/** The week cannot end while a game is waiting to be played. */
export function canAdvanceWeek(c) {
    const s = c || snap();
    if (!s || !s.created) return { ok: false, reason: 'No career in progress.' };
    if (s.flags && s.flags.retired) return { ok: false, reason: 'You have retired. The calendar has stopped.' };
    if (liveMatch()) return { ok: false, reason: 'There is a match in progress. Finish it first.' };

    const pending = fixturesInWeek(s).filter(f => !f.played);
    if (pending.length) {
        const t = teamById(pending[0].opponentId);
        return {
            ok: false,
            reason: pending.length === 1
                ? `You still have a fixture this week against ${t ? t.name : 'an opponent'}.`
                : `You still have ${pending.length} fixtures to play this week.`,
        };
    }
    return { ok: true, reason: '' };
}

// ---------------------------------------------------------------------------
//  WEEKLY ACTIVITIES
// ---------------------------------------------------------------------------

/** Spread one activity's raw gain table through applyAttrGain, scaled by the
 *  player's full training multiplier so an activity respects exactly the same
 *  ceilings, curves and environment caps a drill does. */
function applyGainTable(c, table, scale) {
    const mult = safe(() => trainingMultiplier(c), 1) * (scale || 1);
    const gained = [];
    for (const k of ATTR_KEYS) {
        const raw = num(table[k], 0);
        if (raw <= 0) continue;
        const applied = applyAttrGain(k, raw * mult);
        if (applied > 0) gained.push(`${k.toUpperCase()} +${applied.toFixed(2)}`);
    }
    return gained;
}

function physioActive(c) {
    return num(c.flags && c.flags.physioUntil, 0) > absWeek(c);
}

/** A recovery week buys longer cover than a gym session. */
const RECOVERY_PHYSIO_WEEKS = 6;

// How hard the seat pulls morale each week. Fifteen things in this mode push
// morale UP (a match win alone is +12) and almost nothing pushed it down, so
// before this the meter measured at a mean of 93 out of 100 and was a lever in
// name only. The pull has to be strong enough to matter against that, and being
// a PULL rather than a subtraction is what stops it becoming a spiral.
const MORALE_PULL_RATE = 0.5;
const UNSIGNED_MORALE_TARGET = 52;
const UNSIGNED_MORALE_PULL = 4;

// ---------------------------------------------------------------------------
//  BURNOUT
//  Low morale left unmanaged, and the only thing in the mode that takes a seat
//  away without the club having decided anything about your ability.
//
//  THE THRESHOLD IS SET WHERE THE SEAT PULL ACTUALLY REACHES. Morale measures at
//  a mean of 93 across a simulated run, so a threshold pulled out of the air is
//  dead code. The SQUAD_STATUS targets are what make this reachable: a BENCHED
//  player converges on 34 and a SUB on 44, so 40 is the line that means "being
//  benched for a long time burns you out, being a rotation player does not".
//  That is the mechanic, stated as a number.
//
//  CLEAR is 10 above BITE deliberately — an 8-to-10 point hysteresis band stops
//  a player oscillating on the line from flickering in and out of a crisis.
const BURNOUT_MORALE = 40;
const BURNOUT_CLEAR = 50;
const BURNOUT_WARN_1 = 2;      // weeks -> first warning
const BURNOUT_WARN_2 = 4;      // weeks -> second warning, and the training penalty starts
const BURNOUT_BITE = 6;        // weeks -> it takes something
const BURNOUT_BENCH_WEEKS = 3;
/** Morale back per benched week. Has to clear the bench's own gravity — the
 *  benched seat target is 34 and the no-show penalty is up to -6 — or the
 *  "rest and come back" weeks would leave the player worse than they started. */
const BURNOUT_BENCH_RELIEF = 7;
/** What a burnt-out player's training is worth. Shown as a row in the training
 *  breakdown, never subtracted invisibly. */
export const BURNOUT_TRAINING_MULT = 0.85;

/** Activities that cannot themselves hurt you. Everything else rolls for it. */
const NO_INJURY_ACTIVITIES = new Set(['rest', 'gym', 'recover', 'therapy', 'friends']);

/**
 * THE ONE GATE. Every rule about whether an activity can be done this week
 * lives here, and both callers use it: doActivity() enforces it and the Hub
 * renders the reason.
 *
 * They used to be two lists — three rules written out inline in engine.js and
 * the same three again in Hub.svelte. Adding gold, an age, a once-a-week limit
 * and a conditional to only one of them is how you ship a button that renders
 * enabled and then fails on click, or worse, one that renders disabled for a
 * perfectly legal action.
 */
export function activityGate(c, act) {
    const deny = (reason) => ({ ok: false, reason });
    if (!c || !c.created) return deny('No career in progress.');
    if (c.flags && c.flags.retired) return deny('You are retired. Enjoy it.');
    if (!act) return deny('That is not something you can do this week.');

    if (num(c.weekly && c.weekly.actionsLeft, 0) < 1) return deny('No activity slots left this week.');
    if (act.needsClub && !c.player.clubId) return deny(`${act.name} needs a club. Get signed first.`);

    const minAge = num(act.minAge, 0);
    const age = Number(c.player.age);
    if (minAge && Number.isFinite(age) && age < minAge) {
        return deny(`Not until you are ${minAge}.`);
    }

    if (act.once && activityDone(c, act.id)) return deny(`${act.name} is once a week, and you have had it.`);

    if (typeof act.when === 'function' && !safe(() => act.when(c), true)) {
        return deny(act.whenReason || 'Not something you need right now.');
    }

    const gold = num(act.gold, 0);
    if (gold > 0 && num(c.money && c.money.gold, 0) < gold) {
        return deny(`${act.name} costs ${fmtGold(gold)}.`);
    }

    const cost = num(act.energy, 0);
    if (cost > 0 && num(c.player.energy, 0) < cost) {
        return deny(`Not enough energy -- ${act.name} costs ${cost}.`);
    }

    return { ok: true, reason: '' };
}

/** Has this once-a-week activity already been used this week? */
function activityDone(c, id) {
    const did = c && c.weekly && c.weekly.did;
    return !!(did && typeof did === 'object' && did[id]);
}

function markActivityDone(id) {
    career.update(x => ({
        ...x,
        weekly: {
            ...x.weekly,
            did: { ...(x.weekly && typeof x.weekly.did === 'object' && x.weekly.did ? x.weekly.did : {}), [id]: true },
        },
    }));
}

/** The burnout block, type-checked. Every reader goes through here so a rotted
 *  save can never reach a comparison against a string. */
export function burnoutOf(c) {
    const b = c && c.flags && typeof c.flags.burnout === 'object' && !Array.isArray(c.flags.burnout)
        ? c.flags.burnout : null;
    const n = (v) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
    return b
        ? { weeks: n(b.weeks), strikes: n(b.strikes), benchedUntil: n(b.benchedUntil), peak: n(b.peak) }
        : { weeks: 0, strikes: 0, benchedUntil: 0, peak: 0 };
}

/** True while the club has taken the player out of the firing line. */
export function burnoutBenched(c) {
    return burnoutOf(c).benchedUntil > absWeek(c);
}

/** Is the training penalty live? Read by training.js for the visible row. */
export function burnoutBiting(c) {
    return burnoutOf(c).weeks >= BURNOUT_WARN_2;
}

/**
 * One week of the burnout clock. Runs at the END of startCareerWeek, AFTER the
 * morale floors, so a purchased moraleFloor genuinely prevents it — the psych
 * retainer at 42 makes burnout structurally impossible, which is a legible thing
 * to have bought.
 *
 * THE TELEGRAPH IS THE FEATURE. Two warnings and a visible training penalty
 * before anything is taken, and every escape reachable from the Hub in the week
 * the first warning fires: the Psychologist activity, the psych_session
 * consumable, the forced quit_thought event, a Rest Day, or simply playing well.
 */
function tickBurnout() {
    const c = snap();
    if (!c || !c.created || (c.flags && c.flags.retired)) return;

    const b = burnoutOf(c);
    const morale = num(c.player.morale, 50);
    const write = (patch) => career.update(x => ({
        ...x, flags: { ...x.flags, burnout: { ...burnoutOf(x), ...patch } },
    }));

    // Relief while benched. The bench target is 34, which is UNDER the clear
    // line, so without this the benched player never recovers and re-bites for
    // ever — the trap this mechanic must not become.
    if (burnoutBenched(c)) {
        adjustCondition('morale', BURNOUT_BENCH_RELIEF);
        write({ weeks: 0 });
        return;
    }

    // THE WEEK THE BENCH LIFTS. Coming back off it still under the threshold
    // would restart the counter immediately and walk the player straight into
    // the second bite — the spiral this mechanic must not be. Three weeks out of
    // the rotation is supposed to have worked, so it does: morale comes back
    // above the clear line, once, and the bench is closed out.
    if (b.benchedUntil > 0) {
        write({ benchedUntil: 0, weeks: 0 });
        if (morale < BURNOUT_CLEAR) adjustCondition('morale', BURNOUT_CLEAR - morale);
        addNews('Back in the rotation, and it feels survivable again.', 'system');
        return;
    }

    if (morale >= BURNOUT_CLEAR) {
        if (b.weeks > 0) {
            write({ weeks: 0 });
            if (b.weeks >= BURNOUT_WARN_1) addNews('Feeling like yourself again. Whatever that was, it has passed.', 'system');
        }
        return;
    }
    if (morale >= BURNOUT_MORALE) return;   // in the hysteresis band: hold, do not count

    const weeks = b.weeks + 1;
    write({ weeks, peak: Math.max(b.peak, weeks) });

    if (weeks === BURNOUT_WARN_1) {
        addNews('You are not enjoying this. Two weeks of it now, and it is starting to show in the room.', 'drama');
        logWeek('Struggling', 'Morale has been low for two weeks', '#ef4444');
        return;
    }
    if (weeks === BURNOUT_WARN_2) {
        addNews('Four weeks. Practice is not going in, and everyone can see it. Do something about this.', 'drama');
        logWeek('Burning out', `Training is worth ${Math.round(BURNOUT_TRAINING_MULT * 100)}% while this lasts`, '#ef4444');
        // Force the crisis event. Its three branches are already written and two
        // of them are real escapes; behind the ordinary 0.32 weekly roll a player
        // in trouble might simply never see it.
        safe(() => rollWeeklyEvent(snap(), { forceId: 'quit_thought' }), null);
        return;
    }
    if (weeks < BURNOUT_BITE) return;

    // Benching a player from a competition that is not running is punishment
    // with no mechanical content. The counter keeps running; the bite waits.
    if (phaseForWeek(num(c.time.week, 1)).id === 'offseason') return;

    bite(c, b);
}

function bite(c, b) {
    const write = (patch) => career.update(x => ({
        ...x, flags: { ...x.flags, burnout: { ...burnoutOf(x), ...patch } },
    }));

    // An unsigned player has no seat to lose and no contract to tear up. Ending
    // a fourteen-year-old's career because a meter ran low is exactly the
    // "career that ends without warning" this must never be.
    if (!c.player.clubId) {
        addNews('You have not wanted to queue in weeks. Nobody is going to make you, which is its own problem.', 'drama');
        write({ weeks: BURNOUT_WARN_2 });   // hold at the penalty, never escalate
        return;
    }

    const team = teamById(c.player.clubId);
    const name = team ? team.name : 'The club';

    if (b.strikes < 1) {
        career.update(x => ({ ...x, player: { ...x.player, status: 'benched' } }));
        write({ weeks: 0, strikes: 1, benchedUntil: absWeek(c) + BURNOUT_BENCH_WEEKS });
        addNews(
            `${name} have taken you out of the rotation for ${BURNOUT_BENCH_WEEKS} weeks to get your head right. `
            + 'The seat is still yours if you come back from this.',
            'drama',
        );
        logWeek('Benched', 'Burnout — out of the rotation', '#ef4444');
        return;
    }

    // Second bite: the club stops waiting. Routed through the same termination
    // path item 18 built, so there is one way a contract ends for cause.
    write({ weeks: 0, strikes: 2 });
    safe(() => releaseFromClub('burnout'), null);
    career.update(x => ({
        ...x, flags: { ...x.flags, terminations: num(x.flags && x.flags.terminations, 0) + 1 },
    }));
    // THERE IS NO THIRD ESCALATION. No forced retirement, ever.
}

/** Take weeks off the burnout counter. */
function relieveBurnout(weeks) {
    const n = Math.max(0, Math.round(Number(weeks) || 0));
    if (!n) return;
    career.update(x => {
        const b = x.flags && typeof x.flags.burnout === 'object' && x.flags.burnout ? x.flags.burnout : null;
        if (!b) return x;
        return {
            ...x,
            flags: { ...x.flags, burnout: { ...b, weeks: Math.max(0, (Number(b.weeks) || 0) - n) } },
        };
    });
}

/**
 * The shared health check. Called after any activity that puts hours on the
 * wrists, and available to anything else that needs the same numbers.
 */
export function injuryRoll(c) {
    const s = c || snap();
    const p = s.player || {};
    const health = clamp(num(p.health, 100), 0, 100);
    const energy = clamp(num(p.energy, 100), 0, 100);

    let risk = 0.05;
    risk *= 1 + ((100 - health) / 100) * 0.8;
    if (energy < 35) risk *= 1.6;
    else if (energy < 55) risk *= 1.2;

    const resist = clamp(
        num(lifestyleEffects(s).injuryResist, 0) + num(perkEffects(s).injuryResist, 0), 0, 0.8,
    );
    risk *= 1 - resist;
    if (physioActive(s)) risk *= 0.5;
    risk = clamp(risk, 0, 0.4);

    if (Math.random() >= risk) return { injured: false, healthLost: 0, risk };

    const lost = randInt(4, 12) + (health < 50 ? 3 : 0);
    adjustCondition('health', -lost);
    adjustCondition('form', -3);
    addNews(`A flare-up in the practice room costs ${lost} health. The physio wants a quiet week.`, 'drama');
    logWeek('Knock picked up', `-${lost} health`, '#ef4444');
    return { injured: true, healthLost: lost, risk };
}

// ---------------------------------------------------------------------------
//  SOLO QUEUE HAS A PRICE NOW
//  It was the one activity that could be spammed for free: MMR, attributes and
//  followers, with nothing attached to how the session actually went and nothing
//  attached to doing it four times in a week.
//
//  Both halves are sized against the seat pull, which caps the weekly morale
//  move at 3 (SQUAD_STATUS.moralePull) -- not against the 0-100 range. A sink
//  sized against the range would walk every career into the burnout ladder.
// ---------------------------------------------------------------------------

/** Morale per NET win over the session. Net rather than wins, so a 3-3 is
 *  neutral and only a genuinely bad night costs anything. */
const SOLOQ_MORALE_PER_NET = 0.9;
/** A good session is a small lift and no more. Solo queue must not become a
 *  morale farm: it is the cheapest activity in the mode and would out-earn the
 *  psychologist at a third of the price. */
const SOLOQ_MORALE_UP_CAP = 2;
/** A bad session, before tilt. Looser than the up cap on purpose -- that
 *  asymmetry IS feature C.
 *
 *  DEFENSIVE BOUND, not a live dial: games = randInt(4, 6), so the worst
 *  possible net is -6 and Math.round(-6 * SOLOQ_MORALE_PER_NET) is -5. Nothing
 *  can reach -6 today. It is deliberately NOT set to -5, because the day the
 *  session length or the per-net rate changes this is the rail that stops a
 *  redesign silently doubling the sink -- and raising the session game count to
 *  make it bind would move MMR velocity, attribute gain and follower income all
 *  at once. */
const SOLOQ_MORALE_DOWN_CAP = -6;
/** Extra morale lost per session already played this week, LOSING sessions
 *  only. Queueing again after a bad one is the thing being priced, not
 *  queueing at all. */
const SOLOQ_TILT_PER_REPEAT = 1.2;
const SOLOQ_TILT_MAX = 4;
/** Health per REPEAT session. The first session of a week is free; the second
 *  costs 2, the third 4, and it caps before a single week can put a healthy
 *  player near the benching line. */
const SOLOQ_GRIND_HEALTH_PER = 2;
const SOLOQ_GRIND_HEALTH_MAX = 7;

/** "Second", "Third"... for the grind line. Defaulted past the end of the table
 *  so a seventh session in one week can never print `undefined` at the player. */
const SESSION_ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
function sessionOrdinal(prior) {
    const i = Math.max(0, Math.round(Number(prior) || 0));
    return SESSION_ORDINALS[i] || `${i + 1}th`;
}

/**
 * What the NEXT solo queue session of this week will cost, before it is played.
 *
 * The model half of the sink was already correct; the player was simply never
 * told, which is the "a meter that moves with no line explaining it reads as a
 * bug" rule failing one step earlier than usual. Hub.svelte renders this.
 *
 * The SOLOQ_* constants stay private deliberately: exporting the dials would
 * give the UI a second place to do this arithmetic, and the previewed number and
 * the charged number must come from ONE place. doSoloQueue() reads this same
 * helper, so a divergence is not possible.
 *
 * Pure and null-safe on a rotted save: an absent or non-object weekly.counts
 * reads as a first session. `maxTilt` is the WORST case (it is only charged on a
 * losing session) and is signed negative, the way the week log prints it.
 */
export function soloQueueCost(c) {
    const s = c || snap();
    const weekly = (s && s.weekly && typeof s.weekly === 'object' && !Array.isArray(s.weekly)) ? s.weekly : {};
    const counts = (weekly.counts && typeof weekly.counts === 'object' && !Array.isArray(weekly.counts))
        ? weekly.counts
        : {};
    const prior = Math.max(0, num(counts.soloq, 0));
    return {
        prior,
        grindHealth: Math.min(SOLOQ_GRIND_HEALTH_MAX, prior * SOLOQ_GRIND_HEALTH_PER),
        maxTilt: -Math.min(SOLOQ_TILT_MAX, Math.round(prior * SOLOQ_TILT_PER_REPEAT)),
        benched: !!safe(() => burnoutBenched(s), false),
    };
}

function doSoloQueue(c) {
    // Sessions already played this week, and what they make this one cost.
    // doActivity increments weekly.counts AFTER the handler returns, so this is
    // strictly the ones that came before this one and the first session of a
    // week reads 0. Read through soloQueueCost() so the number the Hub previewed
    // and the number charged here are computed in exactly one place.
    const cost = soloQueueCost(c);
    const prior = cost.prior;
    const games = randInt(4, 6);
    const ovr = calcOVR(c.player.attrs, c.player.role);
    const mmr = clamp(num(c.soloq.mmr, 300), 0, MMR_MAX);
    // The ladder this rating actually belongs on — see soloTargetFor(). A fresh
    // prospect settles at Gold IV rather than Iron I; 74 OVR is Diamond IV, 85
    // near Grandmaster, 95 in Challenger, all unchanged.
    //
    // Deliberately NOT clamped on the WRITE below: an existing Iron save has to
    // CLIMB out through the ordinary promotion line, not be yanked to Gold the
    // first time it queues.
    const targetMMR = soloTargetFor(ovr);
    const p = clamp(1 / (1 + Math.pow(10, (mmr - targetMMR) / 320)), 0.14, 0.86);

    let wins = 0;
    let delta = 0;
    for (let i = 0; i < games; i++) {
        const won = Math.random() < p;
        if (won) wins++;
        delta += won ? randInt(14, 24) : -randInt(12, 22);
    }

    const before = rankFromMMR(mmr);
    const next = clamp(mmr + delta, 0, MMR_MAX);
    career.update(x => ({
        ...x,
        soloq: {
            ...x.soloq,
            mmr: next,
            peakMMR: Math.max(num(x.soloq.peakMMR, 0), next),
            games: num(x.soloq.games, 0) + games,
            wins: num(x.soloq.wins, 0) + wins,
            losses: num(x.soloq.losses, 0) + (games - wins),
        },
    }));

    const after = rankFromMMR(next);
    if (after.tierId !== before.tierId) {
        const up = next > mmr;
        addNews(up
            ? `Promoted to ${after.label} on the solo queue ladder.`
            : `Demoted to ${after.label}. The ladder is not sentimental.`, up ? 'training' : 'drama');
    }

    applyGainTable(c, SOLOQ_GAIN, games / 5);
    const followers = Math.round((6 + wins * 7) * followerMultiplier(c));
    if (followers > 0) grantFollowers(followers);

    // What the session did to your head. SUPPRESSED while burnout has you
    // benched, for exactly the reason simSkippedFixtures' no-show penalty is:
    // the three-week bench is a recovery, and a morale sink running through it
    // would hold the player under the clear line and turn the bench into a trap.
    const net = wins - (games - wins);
    let tilt = 0;
    if (!burnoutBenched(c)) {
        const base = clamp(Math.round(net * SOLOQ_MORALE_PER_NET), SOLOQ_MORALE_DOWN_CAP, SOLOQ_MORALE_UP_CAP);
        tilt = net < 0 ? cost.maxTilt : 0;
        if (base + tilt !== 0) adjustCondition('morale', base + tilt);
    }

    // What it did to your body, charged ALWAYS -- bench or no bench, the body
    // does not care whose decision it was. Note that 'soloq' is deliberately
    // absent from NO_INJURY_ACTIVITIES, so every session ALSO takes the ordinary
    // ~5% injury roll on top of this; this is the visible, predictable half of
    // the cost and there is no second risk roll anywhere for it.
    const grind = cost.grindHealth;
    if (grind > 0) adjustCondition('health', -grind);

    // The player is TOLD, in the week log, both times. A meter that moves with
    // no line explaining it reads as a bug and gets reported as one.
    const detail = `${wins}W-${games - wins}L, ${delta >= 0 ? '+' : ''}${delta} MMR, now ${after.label}`
        + (tilt < 0 ? `, tilted (${tilt} morale)` : '')
        + (grind > 0 ? `. ${sessionOrdinal(prior)} session this week - you are grinding through it (-${grind} health)` : '');
    logWeek('Solo Queue', detail, '#22c55e');
    return ok(`Solo queue: ${wins}-${games - wins}. ${after.label}.`, detail);
}

function doScrim(c) {
    applyGainTable(c, SCRIM_GAIN, 1);
    career.update(x => ({
        ...x,
        player: { ...x.player, chemistry: clamp(num(x.player.chemistry, 50) + randInt(2, 5), 0, 100) },
    }));
    adjustCondition('form', randInt(2, 5));
    adjustCondition('morale', 1);

    // THE ROOM GETS BETTER TOO. A scrim block is the one activity whose payload
    // is not entirely about the player: the other four seats are permanently
    // sharpened by it, which is what makes scrimming a way to raise the club you
    // are actually at rather than a slightly worse training drill.
    //
    // NEVER the player's own seat. teamStrengthWithPlayer() already prices that
    // from calcOVR, so paying it here would count the player twice; the
    // "everything except my role" idiom is runRosterChurn's.
    //
    // clubBlock() is the guard on BOTH halves at once. It returns null when the
    // career is unsigned AND when the stored block still describes a club the
    // player has left, so a transfer resets the ledger with no hook and an
    // unsigned career (careerSmoke drives the activity pool directly and reaches
    // here) writes nothing at all.
    const clubId = (c.player && c.player.clubId) || null;
    const block = clubId ? safe(() => clubBlock(c), null) : null;
    let moved = 0;
    if (block) {
        const myRole = ROLE_BY_ID[c.player.role] ? c.player.role : 'MID';
        const seats = ROSTER_SLOTS.filter(r => r !== myRole);
        const cur = (block.scrim && typeof block.scrim === 'object' && !Array.isArray(block.scrim))
            ? block.scrim
            : {};
        const scrim = { ...cur };
        for (const role of seats) {
            const before = Math.max(0, num(scrim[role], 0));
            // Stored FRACTIONALLY, like every other accumulating number in the
            // mode -- rounding to whole points would stall a seat two sessions
            // short of the cap forever. Two decimals only to keep float dust out
            // of the save. The min() here merely keeps the stored number tidy;
            // teams.seatScrimDelta() clamps on READ and is the only authority on
            // the cap, which is what makes a hand-edited save harmless too.
            const after = Math.min(SCRIM_SEAT_CAP, Math.round((before + SCRIM_SEAT_PER_SESSION) * 100) / 100);
            scrim[role] = after;
            if (after > before) moved++;
        }
        writeClub({ teamId: clubId, scrim });
    }

    const detail = 'Five-man practice: teamfighting, shotcalling and chemistry'
        + (block
            ? (moved
                ? `. The room is sharper for it: ${moved} seat${moved === 1 ? '' : 's'} +${SCRIM_SEAT_PER_SESSION} rating`
                : '. The other four have had everything scrims can give them')
            : '');
    logWeek('Scrim Block', detail, '#f59e0b');
    return ok('Scrim block done. The room played better on the second half of it.', detail);
}

/** Games banked by one lab session. The same 4-6 a solo queue night plays, so
 *  the two activities read as the same amount of time; PROFICIENCY_GAMES is 40,
 *  which puts a champion at Practised in one session and Mastered in six. */
const CHAMP_LAB_GAMES = [4, 6];

/** The lab's only attribute payload. Champion pool is CHP by definition, and it
 *  is deliberately smaller than a training drill's -- this activity is bought
 *  for the proficiency, not as a cheaper way to raise an attribute. */
const CHAMP_LAB_GAIN = { chp: 0.30 };

/**
 * Hours in a custom game on ONE champion.
 *
 * The only activity that moves player.proficiency, which until now was written
 * exclusively by finishGame() -- i.e. the only way to warm up a cold pick was to
 * take it into a real game and eat the proficiency penalty while you learned it.
 * That made the champion pool something that happened to a career rather than
 * something a player could decide to widen.
 *
 * Banked through stores/career.js's addProficiency, the single write path, on
 * player.practiceChamp and falling back to the signature. A save written before
 * practiceChamp existed hydrates it to null, so the fallback is what keeps this
 * activity usable on every old career without auto-assigning anything.
 */
function doChampLab(c) {
    const p = (c && c.player) || {};
    const pick = (typeof p.practiceChamp === 'string' && CHAMPION_BY_ID[p.practiceChamp])
        ? p.practiceChamp
        : ((typeof p.champion === 'string' && CHAMPION_BY_ID[p.champion]) ? p.champion : null);
    // activityGate() has already run the row's own when(). Reached only by a
    // direct doActivity('champ_lab') call on a career with no resolvable
    // champion at all, and the slot is spent by then -- so say what happened
    // rather than logging practice that did not take place. Same shape as
    // doLanguage's unresolvable-language bail.
    if (!pick) return no('You have not set a champion to practise, and there is no signature to fall back on.');

    const def = CHAMPION_BY_ID[pick];
    const games = randInt(CHAMP_LAB_GAMES[0], CHAMP_LAB_GAMES[1]);
    const total = num(safe(() => addProficiency(pick, games), 0), 0);
    const band = safe(() => proficiencyBand(proficiency01(total)), null);

    applyGainTable(c, CHAMP_LAB_GAIN, 1);
    adjustCondition('form', 1);

    const detail = `${def.name} +${games} games (${Math.min(total, PROFICIENCY_GAMES)}/${PROFICIENCY_GAMES})`
        + (band ? ` - ${band.name}` : '');
    logWeek('Champion Practice', detail, (band && band.color) || '#f472b6');
    return ok(`A block of customs on ${def.name}. ${detail}.`, detail);
}

function doVod(c) {
    const gained = applyGainTable(c, VOD_GAIN, 1);
    adjustCondition('morale', 1);
    const detail = gained.length ? gained.slice(0, 3).join(', ') : 'Nothing new left to learn from these';
    logWeek('VOD Review', detail, '#a855f7');
    return ok('VOD review logged. Cheap hours, reliable knowledge.', detail);
}

function doStream(c) {
    const reach = Math.sqrt(Math.max(0, num(c.player.hype, 0)));
    const fmult = followerMultiplier(c);
    const gold = Math.round((60 + reach * 4) * fmult * (0.85 + Math.random() * 0.3));
    const followers = Math.round((40 + reach * 2.2) * fmult * (0.8 + Math.random() * 0.5));

    grantGold(gold);
    grantFollowers(followers);
    adjustCondition('form', -2);
    adjustCondition('morale', 2);

    const detail = `+${fmtGold(gold)} gold, +${fmtFollowers(followers)} followers`;
    logWeek('Stream', detail, '#ec4899');
    return ok(`Went live. ${detail}.`, detail);
}

function doMedia(c) {
    const reach = Math.sqrt(Math.max(0, num(c.player.hype, 0)));
    const followers = Math.round((90 + reach * 1.8) * followerMultiplier(c));
    grantFollowers(followers);

    const swing = randInt(-6, 8);
    adjustCondition('morale', swing);

    // Press follows content. If a camera turns up, the interview goes to the
    // overlay exactly as it would after a match -- but only for a player the
    // press has a reason to point one at. This activity needs no club, so an
    // unsigned thirteen-year-old can spend a slot here, and every question in
    // the pool is written for somebody with a team and a professional record.
    // The followers are paid either way; only the press conference is skipped.
    const now = snap();
    const pressWorthy = !!(now && now.player && now.player.clubId)
        && num(now.totals && now.totals.games, 0) > 0;
    const iv = pressWorthy ? safe(() => rollInterview(now, now.lastMatch), null) : null;
    if (iv) pushOverlay('interview', iv);

    const detail = `+${fmtFollowers(followers)} followers, morale ${swing >= 0 ? '+' : ''}${swing}`;
    logWeek('Media & Content', detail, '#22d3ee');
    return ok(iv ? 'Media day, and the press wanted a word.' : `Media day done. ${detail}.`, detail);
}

function doGym(c) {
    const health = randInt(9, 16);
    adjustCondition('health', health);
    adjustCondition('morale', 2);
    career.update(x => ({
        ...x,
        flags: { ...x.flags, physioUntil: absWeek(x) + PHYSIO_WEEKS },
    }));
    const detail = `+${health} health, injury risk halved for ${PHYSIO_WEEKS} weeks`;
    logWeek('Gym & Physio', detail, '#14b8a6');
    return ok(`Wrists, back and sleep. ${detail}.`, detail);
}

function doRest(c) {
    const r = restRecovery(c);
    adjustCondition('energy', r.energy);
    adjustCondition('morale', r.morale);
    adjustCondition('health', r.health);
    const detail = `+${r.energy} energy, +${r.morale} morale, +${r.health} health`;
    logWeek('Rest Day', detail, '#64748b');
    return ok(`Did nothing on purpose. ${detail}.`, detail);
}

// ---------------------------------------------------------------------------
//  CONDITION ACTIVITIES
//  The morale and health half of the week. Deliberately NOT scaled by the
//  lifestyle training bonus the way restRecovery() is: a rich veteran already
//  buys a morale FLOOR, and scaling these too would make managing the meter
//  free for exactly the players who least need it, which is how the whole
//  condition layer went inert in the first place.
// ---------------------------------------------------------------------------

function doFriends(c) {
    const morale = randInt(9, 14);
    adjustCondition('morale', morale);
    adjustCondition('health', 2);
    adjustCondition('form', -2);
    const detail = `+${morale} morale, +20 energy, -2 form`;
    logWeek('Day Off With Friends', detail, '#f472b6');
    return ok(`A day with people who do not care what your KDA was. ${detail}.`, detail);
}

function doTherapy(c) {
    adjustCondition('morale', 16);
    adjustCondition('form', 3);
    // The burnout escape hatch. Two weeks off the counter is what makes a bad
    // run recoverable by a decision rather than by waiting.
    relieveBurnout(2);
    const detail = '+16 morale, +3 form, burnout eased';
    logWeek('Sports Psychologist', detail, '#a78bfa');
    return ok(`An hour on the parts of this that are not mechanics. ${detail}.`, detail);
}

function doRecover(c) {
    const health = randInt(18, 24);
    adjustCondition('health', health);
    adjustCondition('morale', 4);
    adjustCondition('form', -6);
    career.update(x => ({
        ...x,
        flags: { ...x.flags, physioUntil: absWeek(x) + RECOVERY_PHYSIO_WEEKS },
    }));
    const detail = `+${health} health, +35 energy, -6 form, injury risk halved for ${RECOVERY_PHYSIO_WEEKS} weeks`;
    logWeek('Recovery Week', detail, '#2dd4bf');
    return ok(`No scrims, no ranked, a lot of sleep. ${detail}.`, detail);
}

function doFans(c) {
    const reach = Math.sqrt(Math.max(0, num(c.player.hype, 0)));
    const followers = Math.round((900 + reach * 2) * followerMultiplier(c));
    grantFollowers(followers);
    adjustCondition('morale', 5);
    // Standing in the room, for a player who has one. chemistry is not one of
    // adjustCondition's four meters, so it is written directly.
    if (c.player.clubId) {
        career.update(x => ({
            ...x,
            player: { ...x.player, chemistry: clamp(num(x.player.chemistry, 50) + 1, 0, 100) },
        }));
    }
    const detail = `+${fmtFollowers(followers)} followers, +5 morale`;
    logWeek('Fan Event', detail, '#fb923c');
    return ok(`A signing queue and a room that likes you. ${detail}.`, detail);
}

function doSponsorDay(c) {
    const reach = Math.sqrt(Math.max(0, num(c.player.hype, 0)));
    const gold = Math.round((250 + reach * 6) * followerMultiplier(c));
    grantGold(gold);
    adjustCondition('morale', -3);
    adjustCondition('form', -1);
    const detail = `+${fmtGold(gold)} gold, -3 morale`;
    logWeek('Sponsor Day', detail, '#eab308');
    return ok(`A shoot, a stack of cards, and a cheque. ${detail}.`, detail);
}

function doCoach1on1(c) {
    adjustCondition('morale', 6);
    // Chemistry is the real payload: clubReview() already reads it at 0.12 a
    // point and benchOrStart() at 0.08, so this is a seat-security lever with
    // no new readers at all.
    career.update(x => ({
        ...x,
        player: { ...x.player, chemistry: clamp(num(x.player.chemistry, 50) + 6, 0, 100) },
    }));
    const gained = applyGainTable(c, { knw: 0.12, ldr: 0.10, cmp: 0.08 }, 1);
    const detail = `+6 chemistry, +6 morale${gained.length ? `, ${gained.slice(0, 2).join(', ')}` : ''}`;
    logWeek('One-on-One With The Coach', detail, '#60a5fa');
    return ok(`Your VODs, their notes, an hour of being told the truth. ${detail}.`, detail);
}

/**
 * The only activity that buys nothing on the attribute sheet. It opens REGIONS:
 * contracts.signingBlock() will not let a club in a language you are under
 * LANGUAGE_SIGN_MIN in sign you at all, and scoutInterest() refunds the foreign
 * penalty in proportion to fluency above that.
 */
function doLanguage(c, payload) {
    // The player's explicit pick wins; otherwise studyTargetFor() picks the one
    // they are furthest through, because finishing a language is what opens a
    // region and three half-learned ones open nothing.
    const lang = (payload && typeof payload.lang === 'string' && LANGUAGE_BY_ID[payload.lang])
        ? payload.lang
        : studyTargetFor(c);
    // activityGate() runs the row's own when() and should already have caught
    // this. Reached only by a direct doActivity('language') call, and the slot
    // is already spent by then, so say what happened rather than logging a
    // lesson that never took place. Resolved through LANGUAGE_BY_ID a second
    // time so every `def.name` below is a real string: a null here would print
    // the word `undefined` at the player, which careerRender fails a build for.
    const def = lang ? LANGUAGE_BY_ID[lang] : null;
    if (!def) return no('There is nothing left for you to study.');

    const before = languageLevelFor(c, lang);
    // FRACTIONAL on write, exactly like attrs. A lesson is worth 2-9 points and
    // rounding each one would stall a language short of the band it earned.
    const after = clamp(before + languageStudyGain(c, lang), 0, LANGUAGE_MAX);
    career.update(x => ({
        ...x,
        player: { ...x.player, languages: { ...languagesOf(x), [lang]: after } },
    }));

    // A news line every single lesson is noise -- it is fourteen of them to
    // fluency. Only the two crossings that change what the player can actually
    // DO, and the band, which is the label they read on the Transfers panel.
    const bandAfter = languageBand(after);
    if (before < LANGUAGE_FLUENT && after >= LANGUAGE_FLUENT) {
        addNews(`${def.name} is fluent now. Clubs in that language deal with you like anybody else.`, 'system');
    } else if (before < LANGUAGE_SIGN_MIN && after >= LANGUAGE_SIGN_MIN) {
        addNews(`${def.name} has passed ${LANGUAGE_SIGN_MIN}. Clubs in that language will take the call now.`, 'system');
    } else if (bandAfter !== languageBand(before)) {
        addNews(`${def.name} is ${bandAfter.toLowerCase()}. It is starting to stick.`, 'system');
    }

    const detail = `${def.name} ${Math.round(after)}/100 - ${bandAfter}`;
    logWeek('Language Lessons', `${def.name} ${Math.round(after)}/100`, def.accent || '#818cf8');
    return ok(`An hour of ${def.name} with a tutor. ${detail}.`, detail);
}

/**
 * Spend one activity slot. `train` is deliberately not handled here -- a drill
 * runs through a minigame and training.completeDrill() owns that whole flow.
 */
export function doActivity(activityId, payload) {
    const before = snap();
    const act = ACTIVITY_BY_ID[activityId];
    if (!act) return no('That is not something you can do this week.');
    if (activityId === 'train') return no('Training drills are run from the Training screen.');

    const gate = activityGate(before, act);
    if (!gate.ok) return no(gate.reason);

    const cost = num(act.energy, 0);
    const gold = num(act.gold, 0);

    if (!spendAction(1)) return no('No activity slots left this week.');
    // Slot, then gold, then energy — and BAIL if the gold fails. Reversed, a
    // purchase the player cannot afford still eats the slot. Same order and the
    // same bail as completeDrill().
    if (gold > 0 && !spendGold(gold)) return no(`${act.name} costs ${fmtGold(gold)} and you do not have it.`);
    if (cost > 0) adjustCondition('energy', -cost);
    if (act.once) markActivityDone(activityId);

    const c = snap();
    let res;
    switch (activityId) {
        case 'soloq':     res = doSoloQueue(c); break;
        case 'scrim':     res = doScrim(c); break;
        case 'champ_lab': res = doChampLab(c); break;
        case 'vod':       res = doVod(c); break;
        case 'stream':    res = doStream(c); break;
        case 'media':     res = doMedia(c); break;
        case 'gym':       res = doGym(c); break;
        case 'rest':      res = doRest(c); break;
        case 'friends':   res = doFriends(c); break;
        case 'therapy':   res = doTherapy(c); break;
        case 'recover':   res = doRecover(c); break;
        case 'fans':      res = doFans(c); break;
        case 'sponsorday': res = doSponsorDay(c); break;
        case 'coach1on1': res = doCoach1on1(c); break;
        case 'language': res = doLanguage(c, payload); break;
        // An activity with no case here would silently do NOTHING while
        // charging a slot, the gold and the energy. careerSmoke asserts every
        // id has a case for exactly that reason.
        default:          res = ok(`${act.name} done.`, '');
    }

    // The generic repeat ledger, incremented AFTER the handler has run. That
    // order is the mechanic, not an implementation detail: a handler reading
    // weekly.counts[id] sees the sessions that came BEFORE it, which is exactly
    // what "you have already done this three times this week" means. Counting
    // first would charge the first session of the week for itself.
    career.update(x => {
        const cur = (x.weekly && typeof x.weekly.counts === 'object' && x.weekly.counts
            && !Array.isArray(x.weekly.counts)) ? x.weekly.counts : {};
        return {
            ...x,
            weekly: { ...x.weekly, counts: { ...cur, [activityId]: num(cur[activityId], 0) + 1 } },
        };
    });

    // Hours on the hands carry a risk; the activities that exist to repair the
    // player obviously do not.
    if (!NO_INJURY_ACTIVITIES.has(activityId)) {
        const hurt = injuryRoll(snap());
        if (hurt.injured) res = ok(`${res.msg} You felt something go in your wrist afterwards.`, res.detail);
    }

    saveCareer();
    return res;
}

// ---------------------------------------------------------------------------
//  FIXTURES
// ---------------------------------------------------------------------------

/** Results already committed this session. applyMatchResult() is not
 *  idempotent, and both the match screen and the season screen may reach for
 *  the same result object. */
const _committed = new Set();

/**
 * A fixture's format. The row carries it, but a save written before the regular
 * season had a format does not — and rebuilding the schedule to add the field
 * would throw away a half-played split for a purely cosmetic difference. So a
 * league row with no `bestOf` resolves its region's format instead. Brackets
 * always write theirs explicitly, so they fall through to 1 only if malformed.
 */
function bestOfFor(fixture, c) {
    const raw = Math.round(num(fixture && fixture.bestOf, 0));
    if (raw >= 1) return Math.max(1, raw);
    if (!fixture || fixture.kind === 'bracket') return 1;
    const st = c || snap();
    const club = st && st.player && st.player.clubId ? teamById(st.player.clubId) : null;
    const region = (club && club.region) || (st && st.player && st.player.region) || null;
    const tier = club ? club.tier : num(st && st.player && st.player.clubTier, 3);
    return regularBestOf(region, tier);
}

/** Build the live match for a fixture and hand it to the match screen. */
export function startFixture(fixtureId) {
    const c = snap();
    if (!c || !c.created || (c.flags && c.flags.retired)) return null;

    const f = findFixture(c, fixtureId);
    if (!f || f.played) return null;

    const m = buildMatch(c, {
        id: f.id,
        opponentId: f.opponentId,
        phase: f.phase || phaseForWeek(f.week).id,
        bestOf: bestOfFor(f, c),
        label: f.label || phaseName(f.phase || phaseForWeek(f.week).id),
    });
    if (!m) return null;

    matchState.set(m);
    career.update(x => ({ ...x, pendingMatch: { id: f.id, week: f.week } }));
    saveCareer();
    return m;
}

/** Play a fixture without a UI. Commits the result, exactly as if it had been
 *  played through the match screen. */
export function simFixture(fixtureId) {
    const c = snap();
    if (!c || !c.created) return null;

    const f = findFixture(c, fixtureId);
    if (!f || f.played) return null;

    const result = quickSim(c, {
        id: f.id,
        opponentId: f.opponentId,
        phase: f.phase || phaseForWeek(f.week).id,
        bestOf: bestOfFor(f, c),
        label: f.label || phaseName(f.phase || phaseForWeek(f.week).id),
    });
    if (!result) return null;

    const done = completeMatch(result);
    const out = (done && done.result) || result;
    if (done && done.interview) out.interview = done.interview;
    return out;
}

/** Commit a finished result: apply it, tick the fixture off, roll the press,
 *  bank any milestone it just unlocked and clear the live match. */
export function completeMatch(result) {
    if (!result) return null;

    const already = _committed.has(result.id)
        || !!(findFixture(snap(), result.id) || {}).played;
    if (!already) {
        _committed.add(result.id);
        if (_committed.size > 400) _committed.clear();
        safe(() => applyMatchResult(result), null);
    }

    // applyMatchResult ticks the schedule row when it can find one. A bracket
    // tie added mid-week is the case it cannot, so make sure either way.
    career.update(c => {
        const rows = scheduleOf(c);
        const i = rows.findIndex(f => f && f.id === result.id);
        if (i < 0 || rows[i].played) return c;
        const row = rows[i];
        const next = rows.slice();
        next[i] = {
            ...row,
            played: true,
            won: !!result.won,
            score: Array.isArray(result.score) ? result.score.slice() : null,
            myRating: result.played === false ? null : num(result.rating, 0),
        };

        // THE MIRROR. Whoever the player just played has to have that game on
        // their own record, or every opponent silently loses the two games a
        // season they play against the player and the table is fiction. The
        // `rows[i].played` guard above is the idempotency proof — do not add a
        // second one.
        //
        // LEAGUE ROWS ONLY. applyMatchResult is also reached for bracket ties
        // and for results with no schedule row at all; standings must move for
        // division games and nothing else.
        let standings = c.season.standings;
        if (row.kind !== 'bracket' && row.opponentId) {
            const prev = (standings && standings[row.opponentId]) || { w: 0, l: 0 };
            standings = {
                ...standings,
                [row.opponentId]: {
                    w: num(prev.w, 0) + (result.won ? 0 : 1),
                    l: num(prev.l, 0) + (result.won ? 1 : 0),
                },
            };
        }

        return { ...c, season: { ...c.season, schedule: next, standings } };
    });

    matchState.set(null);
    career.update(c => ({ ...c, pendingMatch: null }));

    // A knockout tie the player just played moves the bracket on.
    advanceBracket(result);

    const after = snap();
    const interview = safe(() => rollInterview(after, result), null);
    const milestones = safe(() => checkMilestones(after), []);
    if (milestones.length) safe(() => grantMilestones(milestones), '');

    saveCareer();
    return { result, interview, milestones };
}

// ---------------------------------------------------------------------------
//  SEASON SETUP
// ---------------------------------------------------------------------------

/**
 * Make sure a schedule and a standings table exist for the split the calendar
 * is currently in. Idempotent: the stamp records the year, split and club the
 * current schedule was drawn for, so this only rebuilds when one of those
 * three actually changed.
 */
/** Do the stored league rows look like the ones this division would generate?
 *  Compared on WEEK+OPPONENT rather than on ids, because a played row keeps its
 *  id but a rebuilt list must not throw away results the player already earned
 *  in a matching fixture. */
function scheduleMatchesDivision(c) {
    const stored = scheduleOf(c).filter(f => f && f.kind !== 'bracket');
    if (!stored.length) return true;
    const wanted = safe(() => generateSchedule(c), []) || [];
    if (wanted.length !== stored.length) return false;
    const key = (f) => `${f.week}:${f.opponentId}`;
    const want = new Set(wanted.map(key));
    return stored.every(f => want.has(key(f)));
}

export function ensureSeason() {
    const c = snap();
    if (!c || !c.created) return null;

    const split = splitForWeek(num(c.time.week, 1));
    const stamp = `${c.time.year}:${split}:${c.player.clubId || 'free'}`;

    // MIXED-SCHEME GUARD. divisionRounds() is a pure function of (division,
    // year, split) and does not read season.schedule, so a save written by the
    // old player-centric generator would have its stored fixtures play against a
    // round list that never contained them — the player could be handed a league
    // game in a week the division gives them a bye. If the stored rows do not
    // match the fixture list this division would produce now, rebuild once.
    const stale = c.season.stamp === stamp
        && scheduleOf(c).length
        && !scheduleMatchesDivision(c);
    if (c.season.stamp === stamp && scheduleOf(c).length && !stale) return c.season;

    // ONLY REDRAW IN A PHASE THAT ACTUALLY HAS LEAGUE FIXTURES.
    //
    // The stamp carries the club id so that a transfer redraws the fixture
    // list, which is right while there are still games to play and destructive
    // once there are not. A split is BANKED at its close -- spring at the MSI
    // boundary, summer inside rolloverYear() -- and both of those happen well
    // after the last league game. Every phase in between is one where a move
    // used to silently zero the season that had just been played:
    //
    //   * transfer in the playoffs (14-16) -> spring rebuilt, then closeSplit
    //     ('spring') filed 0-0 under the new club at week 17
    //   * transfer in the window (36-40)   -> the same for summer at rollover
    //
    // Measured before this guard: a 13-8 summer filed as "0-0 G2 Esports" for a
    // player who had never played a game for them, trophies re-credited too.
    // careerSmoke asserts both halves now (`histclub` / `histempty`).
    //
    // Preseason draws the spring list early, which is why it is in the set.
    const DRAWING_PHASES = new Set(['preseason', 'spring', 'summer']);
    if (!DRAWING_PHASES.has(phaseForWeek(num(c.time.week, 1)).id)) return c.season;

    // A bracket belonging to the phase the calendar is in right now was opened
    // for this moment, not for the split being drawn. MSI is the case that
    // matters: it starts under spring's stamp and sits in summer's, so the
    // rebuild that draws the summer schedule would otherwise delete the tie the
    // player is about to play. Carry that bracket and its fixtures across.
    const phaseNow = phaseForWeek(num(c.time.week, 1)).id;
    const liveBracket = c.season.bracket && c.season.bracket.kind === phaseNow
        ? c.season.bracket
        : null;
    const keepRows = liveBracket
        ? scheduleOf(c).filter(f => f && f.kind === 'bracket' && f.phase === phaseNow)
        : [];

    career.update(x => ({ ...x, season: { ...x.season, split } }));
    const cur = snap();
    const schedule = safe(() => generateSchedule(cur), []);
    const rows = safe(() => leagueTable(cur), []);
    const standings = blankStandings(rows.map(r => r.team));

    career.update(x => ({
        ...x,
        season: {
            ...x.season,
            split,
            stamp,
            // WHOSE season this is. Written once, when the season is drawn, so
            // that closeSplit and the awards can file the split under the club
            // it was actually played at rather than whoever the player happens
            // to be contracted to by the time the split is banked.
            clubId: x.player.clubId || null,
            clubTier: x.player.clubTier || null,
            schedule: keepRows.length ? [...schedule, ...keepRows] : schedule,
            standings,
            wins: 0, losses: 0, gameWins: 0, gameLosses: 0,
            champPoints: 0,
            bracket: liveBracket,
        },
    }));
    saveCareer();
    return snap().season;
}

// ---------------------------------------------------------------------------
//  THE CLUB: MOMENTUM AND ROSTER CHURN
//  The four people sitting next to the player were, until this existed, a pure
//  function of (teamId, year) that never once reacted to a season. They now do
//  two things:
//
//    * scale  - a club on a run plays above its written line and every teammate
//               a few rating points above theirs; a club falling apart does the
//               reverse. Written weekly into career.club.momentum.
//    * change - in the offseason the org acts on the year it just had. A bad
//               one gets people cut; a good one gets them poached.
//
//  The maths and the read side live in teams.js (clubMomentum, clubRosterFor,
//  clubStrengthDelta). This file only decides WHEN, so there is exactly one
//  place that knows what a teammate's rating is.
//
//  FEEDBACK IS THE RISK HERE. Momentum raises club strength, which wins games,
//  which raises momentum. It is bounded because the TARGET is a win rate, which
//  cannot exceed 1 no matter how strong the club gets: at a 100% record the
//  target is +1 and momentum simply parks there. MOMENTUM_PULL controls how
//  fast, not how far.
// ---------------------------------------------------------------------------

/** How much of the gap to the target momentum closes each week. */
const MOMENTUM_PULL = 0.30;

/** With nothing played, momentum drifts back toward neutral at this rate. */
const MOMENTUM_DECAY = 0.86;

/** How many recent results the room is judged on. */
const MOMENTUM_WINDOW = 6;

/** A signing older than this is somebody who has aged out of the seat, and the
 *  club goes back to whoever the database says plays there. */
const SIGNING_TENURE_YEARS = 6;

function blankClubBlock(teamId) {
    // `scrim` is here rather than left undefined so the shape written on a
    // transfer or an unsigned reset matches blankCareer()'s club block exactly.
    // teams.seatScrimDelta() type-checks the map anyway, but a block that is a
    // different shape depending on how it was created is how a "sometimes it
    // works" bug gets written six months from now.
    return { teamId: teamId || null, momentum: 0, roster: {}, changes: [], scrim: {} };
}

function writeClub(patch) {
    career.update(c => {
        const cur = (c.club && typeof c.club === 'object' && !Array.isArray(c.club))
            ? c.club
            : blankClubBlock(c.player.clubId);
        return { ...c, club: { ...cur, ...patch } };
    });
}

/**
 * Move career.club.momentum toward what the last few results deserve.
 *
 * A club the player has just joined starts from zero rather than inheriting the
 * last room's mood - that reset is free, because the block is keyed on teamId
 * and a mismatch means "this is not our club".
 */
function tickClubMomentum() {
    const c = snap();
    if (!c || !c.created) return;
    const clubId = c.player.clubId || null;

    const block = (c.club && typeof c.club === 'object' && !Array.isArray(c.club)) ? c.club : null;
    if (!clubId) {
        // Unsigned. Drop anything left over from the last club so a save never
        // carries a roster for a team the player does not play for.
        if (block && block.teamId) career.update(x => ({ ...x, club: blankClubBlock(null) }));
        return;
    }
    if (!block || block.teamId !== clubId) {
        career.update(x => ({ ...x, club: blankClubBlock(clubId) }));
        return;
    }

    // SORTED, then tailed. season.schedule is not chronological: ensureSeason()
    // rebuilds it as [...freshSplitRows, ...carriedBracketRows], and MSI is
    // carried into the summer split from weeks 17-19 - so the array tail holds
    // the OLDEST games of the half-year, not the newest. Taking the raw tail
    // pinned up to three MSI results in the six-slot window from week 20 all the
    // way to Worlds: a club that then won every league game it played still read
    // as 50% and its momentum never left neutral.
    const played = scheduleOf(c)
        .filter(f => f && f.played === true)
        .sort((a, b) => num(a.week, 0) - num(b.week, 0))
        .slice(-MOMENTUM_WINDOW);
    const cur = clamp(num(block.momentum, 0), -1, 1);

    let next;
    if (played.length < 3) {
        next = cur * MOMENTUM_DECAY;
    } else {
        const rate = played.filter(f => f.won === true).length / played.length;
        const target = clamp((rate - 0.5) * 2, -1, 1);
        next = cur + (target - cur) * MOMENTUM_PULL;
    }

    next = clamp(Math.round(next * 1000) / 1000, -1, 1);
    if (Math.abs(next) < 0.005) next = 0;
    if (next !== cur) writeClub({ momentum: next });
}

/** -1 (a disaster of a season) .. +1 (won the league). */
function seasonGrade(c) {
    const rows = safe(() => leagueTable(c), []);
    const mine = rows.find(r => r && r.isMine) || null;
    const size = Math.max(1, rows.length);
    const rank01 = mine && size > 1 ? 1 - ((num(mine.rank, 1) - 1) / (size - 1)) : 0.5;

    const w = num(c.season && c.season.wins, 0);
    const l = num(c.season && c.season.losses, 0);
    const winRate = (w + l) > 0 ? w / (w + l) : 0.5;

    return clamp(((rank01 - 0.5) * 2) * 0.6 + ((winRate - 0.5) * 2) * 0.4, -1, 1);
}

/**
 * The org's offseason. Reads the year it just had and acts on it.
 *
 * Deliberately never touches the player's own seat - that is what contracts.js
 * is for, and an org replacing you without a word would be a different feature
 * with much sharper edges.
 */
function runRosterChurn() {
    const c = snap();
    if (!c || !c.created || (c.flags && c.flags.retired)) return;
    const clubId = c.player.clubId;
    if (!clubId) return;
    const team = teamById(clubId);
    if (!team) return;

    const year = num(c.time.year, DEFAULT_START_YEAR);
    const myRole = ROLE_BY_ID[c.player.role] ? c.player.role : 'MID';
    const seats = ROSTER_SLOTS.filter(r => r !== myRole);

    const block = (c.club && typeof c.club === 'object' && !Array.isArray(c.club) && c.club.teamId === clubId)
        ? c.club
        : blankClubBlock(clubId);
    const roster = { ...(block.roster && typeof block.roster === 'object' ? block.roster : {}) };
    const changes = Array.isArray(block.changes) ? block.changes.slice() : [];
    // The scrim ledger moves with the SEAT, and a seat that changes hands starts
    // again from zero: the sharpening belongs to the five people who did the
    // hours, not to the chair. Without this a cut player's ten points are
    // inherited by the rookie who replaced him on his first day.
    const scrim = { ...(block.scrim && typeof block.scrim === 'object' && !Array.isArray(block.scrim) ? block.scrim : {}) };

    // 1. Anyone the club signed long enough ago that they have aged out. The
    //    seat goes back to whoever the card database says plays there, which is
    //    also what keeps a twelve-year career from freezing five seats forever.
    for (const role of Object.keys(roster)) {
        const held = roster[role];
        const since = num(held && held.signedYear, year);
        if (year - since < SIGNING_TENURE_YEARS) continue;
        delete roster[role];
        delete scrim[role];
        changes.unshift({ year, role, outName: (held && held.name) || 'A veteran', inName: '', reason: 'retired' });
        addNews(`${(held && held.name) || 'A veteran'} has retired. ${team.name} go back to the market for a ${role}.`, 'transfer');
    }

    // 2. How many seats move.
    const grade = seasonGrade(c);
    let moves;
    if (grade <= -0.45) moves = Math.random() < 0.55 ? 2 : 1;
    else if (grade <= 0.05) moves = Math.random() < 0.60 ? 1 : 0;
    else moves = Math.random() < 0.30 ? 1 : 0;
    // Winning does not make you safe: a title side loses somebody to a bigger
    // cheque about a third of the time.
    const poaching = grade > 0.55 && Math.random() < 0.35;
    if (poaching) moves = Math.max(moves, 1);
    moves = Math.min(moves, seats.length);

    if (!moves) {
        writeClub({ teamId: clubId, roster, scrim, changes: changes.slice(0, 12) });
        if (changes.length !== (Array.isArray(block.changes) ? block.changes.length : 0)) saveCareer();
        return;
    }

    // 3. Which seats. A bad year gets the worst players cut; a good year loses
    //    the best one to somebody richer.
    //
    //    Read against the POST-EXPIRY roster, not the snapshot. `c` was taken
    //    before step 1 deleted the aged-out overrides, so reading it back would
    //    offer a player the club has just announced the retirement of as a
    //    candidate for replacement - two contradictory news lines and two
    //    change entries for one seat in one week, and worse, the replacement
    //    would be priced against the dead card's rating rather than the
    //    incumbent who now actually holds the seat.
    const live = safe(() => clubRosterFor({ ...c, club: { ...block, teamId: clubId, roster } }), {}) || {};

    //    Reading post-expiry is necessary but NOT sufficient. clubRosterFor()
    //    REFILLS a seat whose override step 1 just deleted, from the derived
    //    roster -- so the expired seat comes back looking like an ordinary
    //    incumbent and is a perfectly good candidate for step 3 to churn again.
    //    That produces the two-entries-for-one-seat-in-one-offseason the comment
    //    above says it prevents. A seat that has already moved this year is out.
    const movedThisYear = new Set(
        changes.filter(ch => ch && ch.year === year).map(ch => ch.role)
    );
    const ranked = seats
        .filter(role => !movedThisYear.has(role))
        .map(role => ({ role, card: live[role] || null }))
        .filter(x => x.card)
        .sort((a, b) => {
            const ra = num(a.card.baseRating, num(a.card.rating, 50));
            const rb = num(b.card.baseRating, num(b.card.rating, 50));
            return poaching ? rb - ra : ra - rb;
        });
    if (!ranked.length) return;

    // Both, and the names are the half that matters - see signingFor(). The
    // player's own handle is in here too: an org signing somebody with your name
    // reads as a bug even though the pools are unrelated.
    const taken = new Set(Object.values(live).map(x => x && x.id).filter(v => v !== null && v !== undefined));
    const takenNames = new Set(
        Object.values(live).map(x => x && x.name).filter(Boolean).concat([c.player.handle || '']),
    );

    let done = 0;
    for (const { role, card } of ranked) {
        if (done >= moves) break;
        const outRating = Math.round(num(card.baseRating, num(card.rating, 55)));

        // A rebuilding club shops cheap and hopes; a winning one can attract.
        const swing = grade > 0.05 ? randInt(-2, 5) : randInt(-4, 3);
        const target = clamp(outRating + swing, 30, 96);

        const replacement = safe(
            () => signingFor(team, role, year, target, done + year, [...taken], [...takenNames]),
            null,
        );
        if (!replacement) continue;

        roster[role] = { ...replacement, signedYear: year };
        // New person in the chair, so the room's hours on that seat are gone.
        scrim[role] = 0;
        taken.add(replacement.id);
        takenNames.add(replacement.name);
        done++;

        const reason = poaching && done === 1 ? 'poached' : (grade <= -0.45 ? 'cut' : 'replaced');
        changes.unshift({
            year, role,
            outName: card.name || 'A player',
            inName: replacement.name || 'A rookie',
            reason,
        });

        if (reason === 'poached') {
            addNews(`${card.name} has been bought out of the ${role} seat. ${team.name} bring in ${replacement.name}.`, 'transfer');
        } else if (reason === 'cut') {
            addNews(`${team.name} have moved ${card.name} on after that season. ${replacement.name} takes the ${role} seat.`, 'drama');
        } else {
            addNews(`${team.name} replace ${card.name} with ${replacement.name} at ${role}.`, 'transfer');
        }
    }

    if (done) {
        // A room that has just changed is not the room the player built
        // chemistry in, and its momentum is no longer about these five.
        //
        // flags.rosterMoves is the LIFETIME count. club.changes cannot be it:
        // that list belongs to a club, so signing for somebody else resets it,
        // and a career that moved five times would report almost no churn at
        // all. careerSmoke reads this one.
        career.update(x => ({
            ...x,
            player: { ...x.player, chemistry: clamp(num(x.player.chemistry, 50) - 4 * done, 0, 100) },
            flags: { ...x.flags, rosterMoves: num(x.flags && x.flags.rosterMoves, 0) + done },
        }));
        writeClub({
            teamId: clubId,
            roster,
            scrim,
            changes: changes.slice(0, 12),
            momentum: clamp(num(block.momentum, 0) * 0.5, -1, 1),
        });
    } else {
        writeClub({ teamId: clubId, roster, scrim, changes: changes.slice(0, 12) });
    }
    saveCareer();
}

// ---------------------------------------------------------------------------
//  BRACKETS
//  One state machine drives playoffs and both internationals. Ties the player
//  is not in are simulated on the spot; a tie the player IS in becomes a real
//  Bo5 fixture on the schedule and the bracket waits for it.
// ---------------------------------------------------------------------------

function seedTeam(c, id, seed) {
    const t = teamById(id);
    return {
        id,
        name: t ? t.name : (id === c.player.clubId ? (c.player.handle || 'Your club') : 'TBD'),
        accent: t ? t.accent : '#475569',
        seed,
    };
}

/** Pair a seeded list best-against-worst. */
function pairSeeds(list) {
    const ties = [];
    const n = list.length;
    for (let i = 0; i < Math.floor(n / 2); i++) {
        ties.push({ a: list[i], b: list[n - 1 - i], score: [0, 0], winner: null, bestOf: PLAYOFF_BEST_OF });
    }
    return ties;
}

function roundLabel(count) {
    if (count <= 1) return 'Final';
    if (count === 2) return 'Semifinals';
    if (count <= 4) return 'Quarterfinals';
    return 'Opening Round';
}

/**
 * WHICH WEEK A ROUND IS PLAYED IN.
 *
 * Every bracket phase owns a multi-week window -- playoffs 14-16, MSI 17-19,
 * Worlds 32-35 -- and the bracket used to ignore all of it. openBracket() ran on
 * the phase-change tick and stepBracket() recursed through every round in that
 * one call, so a player who went to the final played a quarter, a semi and a
 * final, fifteen games of Bo5, inside week 14; weeks 15 and 16 then had nothing
 * in them at all. A tournament that resolves in an afternoon does not read as a
 * tournament.
 *
 * So rounds are spread across the window, the FINAL always landing on its last
 * week. The count is known when the bracket opens (a field padded to a power of
 * two plays exactly log2(size) rounds), which is what lets round 0 know where
 * the end is.
 */
function roundWeekFor(bracket, index) {
    const win = (bracket && bracket.window) || null;
    const from = Math.round(num(win && win.from, 1));
    const to = Math.max(from, Math.round(num(win && win.to, from)));
    const n = Math.max(1, Math.round(num(bracket && bracket.totalRounds, 1)));
    if (n <= 1) return to;
    const i = Math.max(0, Math.min(n - 1, Math.round(num(index, 0))));
    return from + Math.round((i * (to - from)) / (n - 1));
}

/** The week the round currently being played belongs to. */
function currentRoundWeek(bracket) {
    if (!bracket || !Array.isArray(bracket.rounds) || !bracket.rounds.length) return 0;
    const i = bracket.rounds.length - 1;
    const stored = Math.round(num(bracket.rounds[i].week, 0));
    return stored > 0 ? stored : roundWeekFor(bracket, i);
}

function stampTieIds(bracket) {
    bracket.rounds.forEach((r, ri) => {
        r.ties.forEach((t, ti) => {
            if (!t.id) t.id = `${bracket.kind}_${bracket.year}_r${ri}_t${ti}`;
        });
    });
}

/** Open a bracket for a seeded field and immediately run it as far as it can
 *  go without the player. */
function openBracket(kind, seedIds, title) {
    const c = snap();
    let ids = (seedIds || []).filter(Boolean);
    if (ids.length < 2) return null;

    // THE FIELD HAS TO FIT ITS WINDOW. One round per week is the whole point of
    // pinning rounds to weeks, and a field of 2^n needs n weeks.
    //
    // Every caller already sizes its own field -- runInternational caps Worlds at
    // 16 for its four weeks and MSI at 8 for its three -- so this trims nothing
    // today and is not fixing a live bug. It is here because those caps are hand
    // -written numbers sitting in a different function from the window they have
    // to agree with, and nothing else would notice them drifting apart: a field
    // one team too big silently doubles up a round and the tournament quietly
    // stops being spread at all. Deriving the bound from the window makes the
    // agreement structural.
    const winFor = PHASES.find(p => p.id === kind) || phaseForWeek(num(c.time.week, 1));
    const weeks = Math.max(1, num(winFor.to, 1) - num(winFor.from, 1) + 1);
    const maxField = Math.pow(2, weeks);
    if (ids.length > maxField) {
        const kept = ids.slice(0, maxField);
        // A club that qualified plays, full stop. If the seeding cut ours, it
        // takes the last slot rather than being told to stay home after the
        // news post already said it was going.
        const mine = c.player.clubId;
        if (mine && ids.includes(mine) && !kept.includes(mine)) kept[kept.length - 1] = mine;
        ids = kept;
    }

    const seeded = ids.map((id, i) => seedTeam(c, id, i + 1));
    // Byes to the top seeds until the field is a power of two.
    let size = 2;
    while (size < seeded.length) size *= 2;
    const byes = size - seeded.length;
    const resting = seeded.slice(0, byes);
    const playing = seeded.slice(byes);

    // The phase's own calendar window, and the exact number of rounds this
    // field will play. Both are fixed for the life of the bracket and both are
    // persisted, so a save reloaded mid-tournament resumes on the right week.
    const win = PHASES.find(p => p.id === kind) || phaseForWeek(num(c.time.week, 1));
    const bracket = {
        kind,
        year: num(c.time.year, DEFAULT_START_YEAR),
        title: title || phaseName(kind),
        bestOf: PLAYOFF_BEST_OF,
        window: { from: num(win.from, num(c.time.week, 1)), to: num(win.to, num(c.time.week, 1)) },
        totalRounds: Math.max(1, Math.round(Math.log2(size))),
        rounds: [{ name: roundLabel(playing.length / 2), ties: pairSeeds(playing) }],
        byes: resting,
        champion: null,
        runnerUp: null,
        myPlacement: null,
        done: false,
    };
    bracket.rounds[0].week = roundWeekFor(bracket, 0);
    stampTieIds(bracket);

    career.update(x => ({ ...x, season: { ...x.season, bracket } }));
    return stepBracket();
}

function isMyTie(tie, clubId) {
    return !!clubId && ((tie.a && tie.a.id === clubId) || (tie.b && tie.b.id === clubId));
}

/** Simulate one Bo5 between two AI sides. */
function simulateTie(c, tie) {
    if (!tie.a) { tie.winner = tie.b ? tie.b.id : null; return; }
    if (!tie.b) { tie.winner = tie.a.id; return; }

    const need = Math.floor(tie.bestOf / 2) + 1;
    const pa = clamp(winChance(strengthOfId(c, tie.a.id), strengthOfId(c, tie.b.id)), 0.05, 0.95);
    let a = 0, b = 0;
    let guard = 0;
    while (a < need && b < need && guard++ < 12) {
        if (Math.random() < pa) a++; else b++;
    }
    tie.score = [a, b];
    tie.winner = a > b ? tie.a.id : tie.b.id;
}

function addBracketFixture(bracket, tie, c) {
    const clubId = c.player.clubId;
    const opp = tie.a && tie.a.id === clubId ? tie.b : tie.a;
    if (!opp) return;
    // The ROUND's week, not the current one. They are the same whenever the gate
    // in stepBracket let this round open, but a forced finish resolves rounds
    // out of their window and a fixture stamped with the wrong week would sit in
    // the calendar under a phase it was never played in.
    const week = Math.max(1, currentRoundWeek(bracket) || num(c.time.week, 1));
    pushSchedule([{
        id: tie.id,
        week,
        phase: bracket.kind,
        opponentId: opp.id,
        home: true,
        kind: 'bracket',
        bestOf: tie.bestOf,
        label: `${bracket.title} ${bracket.rounds[bracket.rounds.length - 1].name}`,
        played: false,
        won: null,
        score: null,
        myRating: null,
    }]);

    // THE FIRST TIME. This is the only place in the mode where "the player is
    // actually in this tournament" becomes a fact: openBracket() only knows the
    // CLUB qualified, and both internationals are separately age-gated, so a
    // sixteen-year-old whose club goes to MSI has not been to MSI.
    //
    // Year-stamped on flags.firstSeen rather than left to the event cooldown
    // ledger: flags.eventLog is truncated to its last 60 entries, so a first
    // Worlds would fall off it inside two seasons and fire again.
    const kind = bracket.kind;
    const seen = c.flags && typeof c.flags.firstSeen === 'object' && c.flags.firstSeen
        && !Array.isArray(c.flags.firstSeen) ? c.flags.firstSeen : {};
    if (kind && !num(seen[kind], 0)) {
        career.update(x => {
            const cur = (x.flags && typeof x.flags.firstSeen === 'object' && x.flags.firstSeen
                && !Array.isArray(x.flags.firstSeen)) ? x.flags.firstSeen : {};
            return {
                ...x,
                flags: { ...x.flags, firstSeen: { ...cur, [kind]: num(x.time.year, DEFAULT_START_YEAR) } },
            };
        });
        // pushOverlay, never careerOverlay.set -- a set here would clobber the
        // panel the bracket draw has already queued. And note that tickBurnout's
        // forced quit_thought roll DISCARDS its return value, so that crisis
        // event is currently never shown to anybody: it is not a template.
        const ev = safe(() => firstTimeEvent(snap(), kind), null);
        if (ev) pushOverlay('event', ev);
    }
}

function writeBracket(bracket) {
    career.update(x => ({ ...x, season: { ...x.season, bracket } }));
}

/**
 * Drive the bracket forward. Returns as soon as it hits a tie the player is
 * in; everything else resolves immediately.
 */
function stepBracket(force) {
    let guard = 0;
    // Two passes per round (resolve, then draw the next one) plus the final,
    // so a 16-team bracket with a bye round needs a dozen at the outside.
    while (guard++ < 16) {
        const c = snap();
        const bracket = c.season.bracket;
        if (!bracket || bracket.done) return bracket || null;

        const b = JSON.parse(JSON.stringify(bracket));
        const round = b.rounds[b.rounds.length - 1];
        const clubId = c.player.clubId;

        // THE WEEK GATE. A round that has not come around yet does not get
        // played, which is the whole of item 10: without this the loop runs the
        // entire tournament on the tick the phase opened. `force` is the escape
        // hatch for the calendar leaving the window with the bracket unfinished
        // -- an unresolved bracket blocks Worlds qualification and the awards, so
        // it must never be able to hang.
        if (!force && currentRoundWeek(b) > num(c.time.week, 1)) return bracket;

        const open = round.ties.filter(t => !t.winner);
        if (open.length) {
            const mine = open.find(t => isMyTie(t, clubId)) || null;
            for (const t of open) {
                if (t === mine) continue;
                simulateTie(c, t);
            }
            writeBracket(b);
            if (mine) {
                if (!findFixture(snap(), mine.id)) addBracketFixture(b, mine, c);
                saveCareer();
                return b;
            }
            continue;
        }

        // Round complete. Winners, plus anyone still on a bye, go through.
        const through = round.ties
            .map(t => (t.winner === (t.a && t.a.id) ? t.a : t.b))
            .filter(Boolean);
        const field = (b.byes || []).concat(through).sort((x, y) => x.seed - y.seed);
        b.byes = [];

        if (field.length <= 1) {
            finishBracket(b, field[0] || null, round);
            return snap().season.bracket;
        }

        b.rounds.push({
            name: roundLabel(field.length / 2),
            ties: pairSeeds(field),
            week: roundWeekFor(b, b.rounds.length),
        });
        stampTieIds(b);
        writeBracket(b);
    }
    return snap().season.bracket;
}

/**
 * Weekly bracket tick. stepBracket() now stops at a round whose week has not
 * arrived, so something has to knock on the door once the calendar moves --
 * otherwise a bracket the player is not in stalls after round one and never
 * crowns a champion.
 */
function tickBracket() {
    const c = snap();
    const b = c && c.season && c.season.bracket;
    if (!b || b.done) return;
    if (b.kind !== phaseForWeek(num(c.time.week, 1)).id) return;
    stepBracket();
}

/** Resolve whatever is left of a bracket the calendar has walked out of. */
function forceFinishBracket() {
    const c = snap();
    const b = c && c.season && c.season.bracket;
    if (!b || b.done) return;
    stepBracket(true);
}

function finishBracket(b, winner, finalRound) {
    const c = snap();
    const clubId = c.player.clubId;
    const final = finalRound.ties[0] || null;
    const loser = final
        ? (final.winner === (final.a && final.a.id) ? final.b : final.a)
        : null;

    b.done = true;
    b.champion = winner ? { id: winner.id, name: winner.name, accent: winner.accent } : null;
    b.runnerUp = loser ? { id: loser.id, name: loser.name, accent: loser.accent } : null;

    // Where the player's club finished: champion, runner-up, or the round they
    // went out in, counted back from the final.
    let placement = 0;
    if (clubId) {
        if (winner && winner.id === clubId) placement = 1;
        else if (loser && loser.id === clubId) placement = 2;
        else {
            for (let i = b.rounds.length - 1; i >= 0; i--) {
                const tie = b.rounds[i].ties.find(t => isMyTie(t, clubId));
                if (tie) { placement = Math.pow(2, b.rounds.length - i - 1) + 1; break; }
            }
        }
    }
    b.myPlacement = placement || null;

    const outcome = placement === 1 ? 'champion' : placement === 2 ? 'finalist' : null;
    const cp = placement ? num(CP_BY_PLACE[Math.min(CP_BY_PLACE.length - 1, placement - 1)], 10) : 0;

    career.update(x => ({
        ...x,
        season: {
            ...x.season,
            bracket: b,
            champPoints: num(x.season.champPoints, 0) + cp,
            // results survives the bracket being replaced by the next event,
            // which is what awards.bracketResult() reads at the split boundary.
            results: { ...(x.season.results || {}), [b.kind]: outcome || 'out' },
        },
    }));

    if (winner) addNews(`${winner.name} win the ${b.title}.`, placement === 1 ? 'award' : 'match');
    if (placement === 1) {
        addNews(`Champions. ${b.title} decided, and the banner is yours.`, 'award');
    } else if (placement === 2) {
        addNews(`Runners-up at the ${b.title}. One series short.`, 'match');
    }

    // Qualification. Only a main-league side travels, and only a player old
    // enough to travel with it.
    //
    // When the CLUB qualifies and the PLAYER does not, the club still goes —
    // and the news line SAYS SO, naming the age and when he becomes eligible.
    // A silent non-qualification reads as a bug and gets reported as one.
    //
    // Note a real and correct consequence: a sixteen-year-old who qualifies at
    // spring playoffs (weeks 14-16) still misses MSI three weeks later, because
    // age only moves at rollover in week 40.
    if (num(c.player.clubTier, 0) === 1 && placement) {
        const age = num(c.player.age, 18);
        const oldEnough = age >= MIN_AGE_INTERNATIONAL;
        const missedLine = `Your club are going. You are not: ${MIN_AGE_INTERNATIONAL} is the minimum and you are ${age}.`;

        if (b.kind === 'spring_po' && placement <= 1) {
            if (oldEnough) {
                career.update(x => ({ ...x, season: { ...x.season, qualified: { ...(x.season.qualified || {}), msi: true } } }));
                addNews('Qualified for the Mid-Season Invitational.', 'award');
            } else {
                addNews(`Mid-Season Invitational. ${missedLine}`, 'drama');
            }
        }
        if (b.kind === 'summer_po' && placement <= 2) {
            if (oldEnough) {
                career.update(x => ({ ...x, season: { ...x.season, qualified: { ...(x.season.qualified || {}), worlds: true } } }));
                addNews('Qualified for the World Championship.', 'award');
            } else {
                addNews(`World Championship. ${missedLine}`, 'drama');
            }
        }
        // The First Stand berth. Won by the CHAMPION only, and played in
        // February of the FOLLOWING year, so it is stamped with that year and
        // kept on flags -- rolloverYear() empties the season block on its way
        // past. No age gate here: the check that matters is the player's age in
        // the year they actually play it, which runInternational applies.
        if (b.kind === 'summer_po' && placement === 1) {
            const nextYear = num(c.time.year, DEFAULT_START_YEAR) + 1;
            career.update(x => ({ ...x, flags: { ...x.flags, firstStandBerth: nextYear } }));
            addNews(`Regional champions. That is a First Stand berth in ${nextYear}.`, 'award');
        }
    }
    saveCareer();
}

/** A finished result that belongs to a bracket tie records the winner and
 *  hands control back to the state machine. */
function advanceBracket(result) {
    const c = snap();
    const bracket = c.season.bracket;
    if (!bracket || bracket.done || !result) return;

    let hit = false;
    const b = JSON.parse(JSON.stringify(bracket));
    for (const round of b.rounds) {
        for (const tie of round.ties) {
            if (tie.id !== result.id || tie.winner) continue;
            const mineIsA = tie.a && tie.a.id === c.player.clubId;
            const my = num(result.score && result.score[0], result.won ? 3 : 0);
            const opp = num(result.score && result.score[1], result.won ? 0 : 3);
            tie.score = mineIsA ? [my, opp] : [opp, my];
            tie.winner = result.won
                ? (mineIsA ? tie.a.id : tie.b.id)
                : (mineIsA ? (tie.b ? tie.b.id : null) : (tie.a ? tie.a.id : null));
            hit = true;
        }
    }
    if (!hit) return;
    writeBracket(b);
    stepBracket();
}

// ---------------------------------------------------------------------------
//  PLAYOFFS & INTERNATIONALS
// ---------------------------------------------------------------------------

/** Draw and run the domestic bracket for the split that has just ended. */
export function runPlayoffs() {
    const c = snap();
    if (!c || !c.created || (c.flags && c.flags.retired)) return null;
    if (!c.player.clubId) return null;                 // no club, no postseason

    const kind = phaseForWeek(num(c.time.week, 1)).id === 'summer_po' ? 'summer_po' : 'spring_po';
    if (c.season.bracket && c.season.bracket.kind === kind) return c.season.bracket;

    const seeds = safe(() => playoffSeeds(c), []).filter(id => id && teamById(id));
    if (seeds.length < 2) return null;

    const title = `${c.season.split === 'summer' ? 'Summer' : 'Spring'} Playoffs`;
    if (!seeds.includes(c.player.clubId)) {
        addNews(`${title}: you finished outside the top six and the split is over for you.`, 'match');
    }
    return openBracket(kind, seeds, title);
}

/** Build an international field from the strongest sides in every region and
 *  run it. Only reachable when the season block says the club qualified. */
export function runInternational(kind) {
    const c = snap();
    if (!c || !c.created || (c.flags && c.flags.retired)) return null;
    const q = c.season.qualified || {};
    if (kind !== 'msi' && kind !== 'worlds' && kind !== 'first_stand') return null;
    if (!c.player.clubId) return null;
    // First Stand is the one event whose berth is won in a DIFFERENT YEAR from
    // the one it is played in -- you qualify by winning the summer, and you play
    // it the following February. season.qualified cannot carry that: rolloverYear
    // wipes the whole season block. So the berth lives on `flags`, which does
    // not, and it names the year it is good for rather than being a bare boolean
    // that would let one title qualify a club forever.
    if (kind === 'first_stand') {
        if (num(c.flags && c.flags.firstStandBerth, 0) !== num(c.time.year, 0)) return null;
    } else if (!q[kind]) return null;
    // Re-checked here as well as at qualification, and this line is the entire
    // migration story: a save written by an older build can already be carrying
    // season.qualified.worlds === true on a sixteen-year-old.
    if (num(c.player.age, 18) < MIN_AGE_INTERNATIONAL) return null;
    if (c.season.bracket && c.season.bracket.kind === kind) return c.season.bracket;

    // First Stand fields ONE club per region -- the champions, and nobody else.
    // That is what makes it feel different from MSI sitting three weeks later
    // with the same names in it.
    const perRegion = kind === 'worlds' ? 3 : kind === 'first_stand' ? 1 : 2;
    const year = num(c.time.year, DEFAULT_START_YEAR);
    const pool = [];
    for (const rid of REGION_IDS) {
        const rows = safe(() => teamsInRegion(rid, 1), [])
            .map(t => ({ id: t.id, power: safe(() => teamStrength(t, year), t.strength) }))
            .sort((a, b) => b.power - a.power)
            .slice(0, perRegion);
        for (const r of rows) pool.push(r);
    }
    // The player's club travels whether or not the strength table rates it — so
    // it is seeded OUTSIDE the cut rather than merely added to a pool that is
    // then cut. Adding it first and slicing the top `cap` sliced it straight
    // back out again, and for the weakest regions that happened EVERY year: the
    // best club in the CBLOL or the LCP sits below the global cut line, so the
    // mode granted the qualification, announced "you are in the draw", then
    // simulated the whole tournament without them and returned a null placement.
    // The club is scored through strengthOfId on both paths so the pool is not
    // half player-aware and half not.
    const cap = kind === 'worlds' ? 16 : 8;   // must stay <= 2^(phase window weeks)
    const mineId = c.player.clubId;
    const seeds = pool
        .filter(r => r.id !== mineId)
        .sort((a, b) => b.power - a.power)
        .slice(0, cap - 1)
        .concat([{ id: mineId, power: strengthOfId(c, mineId) }])
        .sort((a, b) => b.power - a.power)
        .map(r => r.id);
    if (seeds.length < 4) return null;

    const title = kind === 'worlds' ? 'World Championship'
        : kind === 'first_stand' ? 'First Stand'
        : 'Mid-Season Invitational';
    addNews(`${title}: ${seeds.length} teams, one trophy, and you are in the draw.`, 'match');
    return openBracket(kind, seeds, title);
}

// ---------------------------------------------------------------------------
//  SPLIT & YEAR BOUNDARIES
// ---------------------------------------------------------------------------

/** Awards, a history row and the club's verdict. Runs at the end of spring
 *  (when MSI starts) and again inside rolloverYear() for summer. */
function closeSplit(splitId) {
    const c = snap();
    if (!c || !c.created) return;

    // THE CLUB THIS SPLIT BELONGS TO, which is not necessarily the one the
    // player is at now. closeSplit('summer') runs inside rolloverYear(), and the
    // transfer window is weeks 36-40 -- BEFORE it. Filing the split under
    // player.clubId credited a whole season, its placement and its trophies to a
    // club the player had not played a single game for.
    //
    // The season block records its own club when it is drawn, so use that and
    // fall back only for a save written before it did.
    const seasonClubId = (c.season && c.season.clubId) || c.player.clubId || null;
    const seasonClubTier = (c.season && c.season.clubTier) || c.player.clubTier || null;

    // The table has to be read as that club too, or a player who moved leagues
    // gets their old season's placement out of their new division's table.
    const tableCtx = seasonClubId === c.player.clubId
        ? c
        : { ...c, player: { ...c.player, clubId: seasonClubId, clubTier: seasonClubTier } };

    const rows = safe(() => leagueTable(tableCtx), []);
    const mine = rows.find(r => r && r.isMine) || null;
    const awards = safe(() => endOfSplitAwards(tableCtx, rows), []);
    if (awards.length) safe(() => grantAwards(awards), '');

    const team = seasonClubId ? teamById(seasonClubId) : null;
    let row = null;
    career.update(x => {
        row = {
            year: num(x.time.year, DEFAULT_START_YEAR),
            split: splitId,
            teamId: seasonClubId,
            teamName: team ? team.name : 'Unsigned',
            w: num(x.season.wins, 0),
            l: num(x.season.losses, 0),
            placement: mine ? mine.rank : null,
            champPoints: num(x.season.champPoints, 0),
            awards: awards.map(a => ({ id: a.id, name: a.name, icon: a.icon })),
        };
        return {
            ...x,
            history: [...(Array.isArray(x.history) ? x.history : []), row].slice(-60),
        };
    });

    // The split does not just end in the news feed. The overlay holds one panel
    // at a time, so a split that produced silverware opens the ceremony -- it
    // lists the same awards the review would have -- and a quiet one opens the
    // season review instead.
    if (awards.length) pushOverlay('awards', awards);
    else if (row) pushOverlay('season', row);

    // A season good enough to move the ceiling. Checked before the season block
    // is reset, because it reads the split's own per-match ratings.
    safe(() => checkBreakthrough(c, awards, mine), null);
    // ...and the other half of the ledger. Same pre-reset snapshot, for the same
    // reason plus one more: it reads flags.splitTrained, which is emptied on the
    // very next line and must be consumed before it is.
    safe(() => checkDecline(c, splitId), null);

    // The split's training record has now been spent. Reset AFTER checkDecline,
    // never before -- the map IS the protection, and clearing it first would
    // charge a player who drilled every week the full loss.
    career.update(x => ({ ...x, flags: { ...x.flags, splitTrained: {} } }));

    if (!c.player.clubId) { saveCareer(); return; }

    const review = safe(() => clubReview(snap()), null);
    if (review) {
        addNews(review.text, review.verdict === 'cutting' || review.verdict === 'concerned' ? 'drama' : 'system');
        if (review.statusChange) {
            career.update(x => ({ ...x, player: { ...x.player, status: review.statusChange } }));
        }
        // Strike accounting, then enforcement, in that order and both AFTER the
        // verdict has been shown. recordReview is engine-only on purpose —
        // clubReview() is re-run by the Club screen on every reactive update,
        // so counting inside it would fire the player for opening a tab.
        safe(() => recordReview(snap(), splitId, review), null);
        safe(() => enforceContract(snap()), null);
    }
    // promotionCheck only after enforcement: a terminated player has no club to
    // be promoted from, and the gate reads clubId.
    safe(() => promotionCheck(snap()), null);
    saveCareer();
}

// ---------------------------------------------------------------------------
//  RAISING THE ROOF
//  Two things in this file move player.potential upward. Everywhere else in the
//  mode the ceiling is fixed at creation, which is why a career plateaus in its
//  early twenties and then has nothing left to give for a decade.
//
//  Both raise POTENTIAL rather than letting an attribute pass it. That is not a
//  style preference: attrs > potential is a hard failure in
//  tools/careerSmoke.mjs, and potential is also what wages, market value,
//  scouting interest and every ceiling readout in the UI are computed from, so
//  moving the real number keeps all of them honest for free.
// ---------------------------------------------------------------------------

/** Mean of the player's own match ratings inside the split just finished. */
function splitMeanRating(c) {
    const rows = Array.isArray(c && c.season && c.season.schedule) ? c.season.schedule : [];
    let sum = 0, n = 0;
    for (const f of rows) {
        if (!f || !f.played) continue;
        const r = Number(f.myRating);
        if (!Number.isFinite(r)) continue;
        sum += r; n++;
    }
    return { mean: n ? sum / n : 0, games: n };
}

/** How many ceiling points a split earned. 0 means it was just a season. */
function breakthroughPoints(c, awards, standing) {
    const { mean, games } = splitMeanRating(c);
    if (games < BREAKTHROUGH_MIN_GAMES) return 0;

    let pts = 0;
    if (mean >= BREAKTHROUGH_RATING_HIGH) pts += 2;
    else if (mean >= BREAKTHROUGH_RATING) pts += 1;
    pts += Math.min(2, Array.isArray(awards) ? awards.length : 0);
    if (standing && Number(standing.rank) === 1) pts += 1;

    return Math.min(BREAKTHROUGH_MAX, pts);
}

/**
 * A split that was genuinely outstanding permanently raises the ceiling.
 *
 * The points land on the attributes with the LEAST headroom left, because those
 * are the ones the player is actually walled by — raising a ceiling they were
 * nowhere near would read as nothing happening. Part of the gain is applied to
 * the attribute immediately: you did not just unlock the room, you are already
 * standing in some of it, which is what "something clicked this split" means.
 */
function checkBreakthrough(c, awards, standing) {
    if (!c || !c.created || (c.flags && c.flags.retired)) return null;

    const spent = num(c.flags && c.flags.breakthroughOVR, 0);
    if (spent >= BREAKTHROUGH_CAREER_MAX) return null;

    const pts = breakthroughPoints(c, awards, standing);
    if (pts <= 0) return null;

    const p = c.player;
    const potBefore = calcPotentialOVR(p.potential, p.role);
    const role = ROLE_BY_ID[p.role];
    const ranked = ATTR_KEYS
        .map(k => ({
            k,
            room: Math.max(0, num(p.potential[k], 99) - num(p.attrs[k], 0)),
            weight: role ? num(role.weights[k], 0) : 0,
        }))
        // Least headroom first; ties broken toward what the role actually needs.
        .sort((a, b) => (a.room - b.room) || (b.weight - a.weight));

    const targets = ranked.slice(0, BREAKTHROUGH_ATTRS);
    const bonus = {};
    for (const t of targets) bonus[t.k] = pts;
    const applied = raisePotential(bonus);

    const keys = Object.keys(applied);
    if (!keys.length) return null;

    // Bill the career budget in the same units the player reads the ceiling in.
    const potAfter = calcPotentialOVR(snap().player.potential, p.role);
    career.update(x => ({
        ...x,
        flags: { ...x.flags, breakthroughOVR: spent + Math.max(0, potAfter - potBefore) },
    }));

    // Close most of the gap the raise just opened, without rounding: attributes
    // are fractional on purpose and rounding here would throw the remainder away.
    career.update(x => {
        const attrs = { ...x.player.attrs };
        for (const k of keys) {
            const cap = num(x.player.potential[k], 99);
            const head = Math.min(cap, num(attrs[k], 0) + applied[k] * BREAKTHROUGH_INSTANT);
            if (head > attrs[k]) attrs[k] = clamp(head, 1, 99);
        }
        return { ...x, player: { ...x.player, attrs } };
    });

    const named = keys.map(k => (ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].abbr : k.toUpperCase())).join(', ');
    addNews(
        `Something clicked this split. Your ceiling moved: ${named} +${pts}. Coaches call it a level; nobody can tell you where it came from.`,
        'training',
    );
    logWeek('Breakthrough', `${named} ceiling +${pts}`, '#eab308');
    pushOverlay('breakthrough', {
        points: pts,
        applied,
        attrs: keys.map(k => ({
            key: k,
            name: ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].name : k.toUpperCase(),
            abbr: ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].abbr : k.toUpperCase(),
            color: ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].color : '#94a3b8',
            gained: applied[k],
            ceiling: num(snap().player.potential[k], 99),
        })),
        potOVR: calcPotentialOVR(snap().player.potential, p.role),
    });
    return { pts, applied };
}

// ---------------------------------------------------------------------------
//  LOSING GROUND
//  The mirror image of the block above, and the answer to the oldest complaint
//  about this mode: players only ever got better. applyAgeDecay() was the ONLY
//  thing that ever took a point off anybody, and decayFor() is zero for every
//  age up to 24 -- so a nineteen-year-old could post a 3.5 mean for four
//  straight splits and lose nothing at all.
//
//  Three rules keep this from being a punishment mechanic:
//    * it needs a REAL split (DECLINE_MIN_GAMES), which is also what keeps a
//      burnout-benched player off the hook: he has barely any games.
//    * TRAINING MAINTAINS. Every drill run on an attribute this split buys back
//      DECLINE_TRAIN_OFFSET of that attribute's share, so three drills protect
//      it completely and a neglected one takes the whole thing. The player is
//      not being taxed for a bad split, they are being shown which attributes
//      they stopped looking after.
//    * it is BOUNDED FOR THE CAREER by flags.decline.ovrLost, not merely priced.
//      Splits are renewable and a rating is not.
// ---------------------------------------------------------------------------

/** How many attribute points a split under par costs, before protection. */
function declinePoints(c) {
    const { mean, games } = splitMeanRating(c);
    if (games < DECLINE_MIN_GAMES) return { pts: 0, mean, games };
    if (mean >= DECLINE_RATING) return { pts: 0, mean, games };

    // Linear in how far under par the split was, with a second, steeper term
    // below DECLINE_RATING_BAD. Symmetric in spirit with breakthroughPoints():
    // one band for "not good enough", a harder one for "genuinely bad".
    let pts = (DECLINE_RATING - mean) * DECLINE_SLOPE;
    if (mean <= DECLINE_RATING_BAD) pts += (DECLINE_RATING_BAD - mean) * DECLINE_SLOPE * 1.4;
    return { pts: Math.min(DECLINE_MAX_SPLIT, pts), mean, games };
}

/**
 * A split that was genuinely under par takes points back off the player.
 *
 * Spread by DECAY_WEIGHTS, so it lands in the same shape age decay does -- the
 * hands go first here too, and shotcalling and game knowledge barely move.
 * Everything is spent through applyAttrLoss, the single downward writer, so the
 * two systems can never drift on rounding.
 *
 * MUST be called on the PRE-RESET snapshot: it reads the split's own per-match
 * ratings out of season.schedule and flags.splitTrained out of the split that
 * just finished. closeSplit() empties splitTrained immediately after this
 * returns, never before.
 */
function checkDecline(c, splitId) {
    if (!c || !c.created || (c.flags && c.flags.retired)) return null;
    // An unsigned career has no split to be under par in. The compulsory
    // first-club ladder runs through the amateur sides and a player between
    // clubs is not being judged on games he did not play.
    if (!(c.player && c.player.clubId)) return null;

    const ledger = (c.flags && c.flags.decline && typeof c.flags.decline === 'object'
        && !Array.isArray(c.flags.decline)) ? c.flags.decline : {};
    const spent = num(ledger.ovrLost, 0);
    if (spent >= DECLINE_CAREER_MAX) return null;

    const { pts, mean, games } = declinePoints(c);
    if (pts <= 0) return null;

    // The same two multipliers age decay reads, and they are read HERE for a
    // reason: late_bloomer / unbreakable (economy.js) and Iron Wrists / Legend
    // (ratings.js) are sold as covering decay, and until this existed decay was
    // one yearly function. A perk that quietly stopped covering half the decline
    // in the mode is the "every effect key must have a reader" failure one layer
    // along.
    const mult = num(perkEffects(c).decayMult, 1) * num(traitEffects(c.player).decayMult, 1);
    const total = pts * mult;
    if (total <= 0) return null;

    let wsum = 0;
    for (const k of ATTR_KEYS) wsum += Math.max(0, num(DECAY_WEIGHTS[k], 0));
    if (wsum <= 0) return null;

    const trained = (c.flags && c.flags.splitTrained && typeof c.flags.splitTrained === 'object'
        && !Array.isArray(c.flags.splitTrained)) ? c.flags.splitTrained : {};

    const p = c.player;

    const applied = {};
    const held = [];
    for (const k of ATTR_KEYS) {
        // Normalised, so the shares sum to `total` and DECLINE_MAX_SPLIT is a
        // real cap on the whole split rather than on one attribute.
        const share = total * (Math.max(0, num(DECAY_WEIGHTS[k], 0)) / wsum);
        if (share <= 0) continue;
        const drills = Math.max(0, num(trained[k], 0));
        const guard = Math.max(0, 1 - drills * DECLINE_TRAIN_OFFSET);
        if (guard <= 0) { held.push(k); continue; }
        const lost = applyAttrLoss(k, share * guard);
        if (lost > 0) applied[k] = lost;
    }

    const keys = Object.keys(applied).sort((a, b) => applied[b] - applied[a]);
    if (!keys.length) return null;

    // Billed in the units the player actually reads, exactly as
    // checkBreakthrough bills the ceiling in potential OVR -- but billed
    // UNROUNDED, from the role weights directly, rather than from the difference
    // of two calcOVR() calls.
    //
    // calcOVR rounds, and a single split rarely moves a rounded OVR by a whole
    // point. Billing the rounded difference therefore charged ZERO for almost
    // every split, which measured as -0.0 mean OVR lost per career while decline
    // was in fact firing 8.1 times each: the budget never bound, so the one
    // thing standing between a long career and the floor was doing nothing.
    // Tenths accumulate honestly here and DECLINE_CAREER_MAX means what it says.
    const roleW = (ROLE_BY_ID[p.role] || {}).weights || {};
    let ovrLost = 0;
    for (const k of ATTR_KEYS) ovrLost += (num(applied[k], 0) * num(roleW[k], 0));
    ovrLost = Math.max(0, Math.round(ovrLost * 1000) / 1000);
    career.update(x => {
        const cur = (x.flags && x.flags.decline && typeof x.flags.decline === 'object'
            && !Array.isArray(x.flags.decline)) ? x.flags.decline : {};
        return {
            ...x,
            flags: {
                ...x.flags,
                decline: {
                    ...cur,
                    ovrLost: num(cur.ovrLost, 0) + ovrLost,
                    splits: num(cur.splits, 0) + 1,
                    // Lifetime count of attribute-shares that training held at
                    // ZERO. This is the only persisted evidence that the
                    // "maintained by training" half of the system fires at all:
                    // decline firing and decline firing UNOPPOSED look
                    // identical from a rating readout, and a protection nobody
                    // can ever earn is the same dead lever as a gate nobody can
                    // trip. careerSmoke asserts it is non-zero.
                    heldTotal: num(cur.heldTotal, 0) + held.length,
                    // The LAST split's per-attribute record, overwritten rather
                    // than accumulated: it answers "what did that split cost
                    // me", which is the question the Training screen asks.
                    // training.declinedThisSplit() already reads this key and
                    // returns 0 while it is absent, so an old save is correct
                    // rather than merely safe.
                    attrs: applied,
                },
            },
        };
    });

    // THE CLUB THAT PLAYED THE SPLIT, never the one the player is at now --
    // closeSplit() files the history row, the placement and every award under
    // season.clubId for the same reason, and getting this wrong is the bug that
    // once filed a 13-8 summer as "0-0, G2 Esports".
    const teamId = (c.season && c.season.clubId) || c.player.clubId || null;
    const team = teamId ? teamById(teamId) : null;
    const clubName = team ? team.name : 'the club';
    const abbr = k => (ATTR_BY_KEY[k] ? ATTR_BY_KEY[k].abbr : String(k).toUpperCase());
    const lostLine = keys.map(k => `${abbr(k)} -${applied[k].toFixed(1)}`).join(', ');
    const heldLine = held.length ? held.map(abbr).join(', ') : '';
    const when = splitId === 'summer' ? 'summer' : (splitId === 'spring' ? 'spring' : 'that split');

    addNews(
        `A ${when} under par at ${clubName}: ${mean.toFixed(1)} across ${games} games. ${lostLine}.`
        + (heldLine ? ` ${heldLine} held -- you kept drilling those.` : ' Nothing you drilled was protected, because you drilled nothing.'),
        'drama',
    );
    logWeek('Losing ground', lostLine, '#ef4444');

    // kind:'event', pushOverlay, one acknowledging option. No new overlay kind
    // is ever added -- the "undismissable until answered" rule and every
    // valid/accent/markup branch come free, and careerSmoke's drainOverlay
    // already knows how to answer an event.
    pushOverlay('event', {
        id: 'decline_split',
        type: 'drama',
        icon: '\u{1F4C9}',
        title: 'You have lost a step',
        text: `${mean.toFixed(1)} across ${games} games for ${clubName}. The coaching staff have gone through it `
            + `and the sheet is honest: ${lostLine}.`
            + (heldLine
                ? ` ${heldLine} came through it untouched -- those are the ones you kept drilling.`
                : ' You drilled none of it this split, so none of it was protected.'),
        options: [
            {
                id: 'ack',
                label: 'Take the notes',
                desc: 'There is nothing to decide. The split is already in the books.',
                apply: () => ({
                    text: 'You sit through all of it. Nothing more comes off tonight -- the next split is where it goes back on.',
                    effects: {},
                }),
            },
        ],
    });

    return { pts, mean, games, applied, held, ovrLost };
}

/**
 * Roll and reveal the player's genetic trait, once, on the birthday the path
 * says. Deliberately late — a trait you can see at creation is a trait people
 * restart careers for until they get the one they wanted.
 *
 * Gated on player.age directly rather than on any proxy (games played, being
 * signed, MMR). Proxies are how a thirteen-year-old ends up being told about the
 * friend they climbed with at fourteen.
 *
 * Idempotent, and safe on a save that predates traits: a career already past its
 * reveal age simply gets the roll on its next birthday.
 */
export function revealTrait() {
    const c = snap();
    if (!c || !c.created) return null;
    const p = c.player;
    if (Array.isArray(p.traits) && p.traits.length) return null;
    if (num(p.age, 0) < revealAgeFor(p)) return null;

    const trait = rollTrait();
    if (!trait || !addTrait(trait.id)) return null;

    const potBefore = calcPotentialOVR(p.potential, p.role);
    const applied = raisePotential(traitPotentialBonus(trait.id, p.role));
    const after = snap();
    const potAfter = calcPotentialOVR(after.player.potential, after.player.role);

    addNews(`${trait.name}. ${trait.blurb}`, 'award');
    logWeek('Trait revealed', trait.name, trait.accent || '#eab308');
    pushOverlay('trait', {
        trait,
        applied,
        potBefore,
        potAfter,
        age: num(after.player.age, 16),
    });
    return trait;
}

/**
 * How much of decayFor() each attribute takes. See DECAY_WEIGHTS.
 *
 * Writes through stores/career.js's applyAttrLoss rather than an inline
 * career.update, and that is not tidying: this and checkDecline() are the two
 * things in the mode that ever take a point off a player, and two downward
 * writers rounding independently is exactly how applyAttrGain and setAttr came
 * to disagree. One writer, one rounding rule, attributes stay FRACTIONAL.
 *
 * Behaviour is unchanged -- applyAttrLoss uses the same Math.round(x * 10) / 10
 * and the same 1..99 clamp this function used to do by hand.
 */
function applyAgeDecay() {
    const c = snap();
    const rate = num(decayFor(c.player.age), 0)
        * num(perkEffects(c).decayMult, 1)
        * num(traitEffects(c.player).decayMult, 1);
    if (rate <= 0) return [];

    const lost = [];
    for (const k of ATTR_KEYS) {
        const drop = rate * num(DECAY_WEIGHTS[k], 0.5);
        if (drop <= 0) continue;
        const applied = applyAttrLoss(k, drop);
        if (applied > 0) lost.push(`${k.toUpperCase()} -${applied.toFixed(1)}`);
    }
    if (lost.length) {
        addNews(`Another year on the body: ${lost.slice(0, 3).join(', ')}. The hands go first.`, 'system');
    }
    return lost;
}

/**
 * Week 40 into week 1 of the next year: close the summer split, age the
 * player, decay them, run the contracts down, reset the season block and see
 * whether the club still wants them.
 */
export function rolloverYear() {
    const before = snap();
    if (!before || !before.created) return null;

    closeSplit('summer');

    const ovrBefore = calcOVR(before.player.attrs, before.player.role);
    career.update(x => ({
        ...x,
        time: { year: num(x.time.year, DEFAULT_START_YEAR) + 1, week: 1 },
        player: { ...x.player, age: num(x.player.age, 18) + 1 },
    }));
    applyAgeDecay();
    _committed.clear();

    const c = snap();
    addNews(`${c.time.year} preseason. You are ${c.player.age}.`, 'system');

    // A birthday is the only place a genetic trait can show itself, and the only
    // place player.age ever changes. Runs after the preseason line so the news
    // feed reads "you are sixteen" and then what that turned out to mean.
    safe(() => revealTrait(), null);

    // Contracts tick down; a deal whose final year has passed becomes free
    // agency, and the club's verdict decides whether they cut you first.
    if (c.player.clubId && c.player.contract) {
        const left = num(c.player.contract.endYear, c.time.year) - c.time.year;
        career.update(x => ({
            ...x,
            player: {
                ...x.player,
                contract: { ...x.player.contract, years: Math.max(0, left + 1) },
            },
        }));
        if (left < 0) {
            safe(() => releaseFromClub('expired'), null);
        } else {
            const review = safe(() => clubReview(snap()), null);
            if (review && review.verdict === 'cutting' && left <= 0) {
                safe(() => releaseFromClub('cut'), null);
            }
        }
    }

    // Fresh season block. The schedule itself is rebuilt by ensureSeason().
    career.update(x => ({
        ...x,
        season: {
            ...x.season,
            split: 'spring',
            stamp: '',
            // Cleared with the rest of it: the new year's season belongs to
            // whichever club draws it, and a stale id here would file the
            // FOLLOWING spring under last year's team.
            clubId: null,
            clubTier: null,
            wins: 0, losses: 0, gameWins: 0, gameLosses: 0,
            schedule: [],
            standings: {},
            champPoints: 0,
            bracket: null,
            qualified: {},
            results: {},
        },
        player: { ...x.player, transferRequested: false },
    }));

    ensureSeason();
    safe(() => promotionCheck(snap()), null);

    const after = snap();
    const ovrAfter = calcOVR(after.player.attrs, after.player.role);
    if (ovrAfter !== ovrBefore) {
        addNews(`Overall rating ${ovrBefore} to ${ovrAfter} across the offseason.`, 'system');
    }

    if (num(after.player.age, 0) >= RETIREMENT_AGE_FORCED && !(after.flags && after.flags.retired)) {
        const summary = safe(() => retire({ force: true }), null);
        if (summary) pushOverlay('retire', summary);
    }

    saveCareer();
    return snap();
}

// ---------------------------------------------------------------------------
//  BENCH OR START
// ---------------------------------------------------------------------------

/**
 * Whether the coach puts the player on stage this week. Deterministic for a
 * given week so the hub can render it as a forecast without it flickering on
 * every re-render; the match engine rolls its own on the day.
 */
export function benchOrStart(c) {
    const s = c || snap();
    const p = (s && s.player) || {};
    if (!p.clubId) return { plays: true, reason: '' };

    const info = statusInfo(p.status);
    const health = clamp(num(p.health, 100), 0, 100);
    let chance = num(info.playChance, 0.5);
    if (health < 30) chance *= 0.35;
    else if (health < 55) chance *= 0.8;
    chance += ((clamp(num(p.form, 50), 0, 100) - 50) / 100) * 0.10;
    chance += ((clamp(num(p.chemistry, 50), 0, 100) - 50) / 100) * 0.08;
    chance = clamp(chance, 0, 1);

    const roll = hash01(`${s.time.year}:${s.time.week}:${p.clubId}:${p.status}:${Math.round(health / 10)}`);
    const plays = roll < chance;
    if (plays) return { plays: true, reason: '' };

    let reason;
    // Burnout first, or the player is told exactly why he is out and then told
    // on the next line that nobody has told him why.
    if (burnoutBenched(s)) reason = 'The club have taken you out of the rotation while you get your head right.';
    else if (health < 55) reason = 'You are not fit enough to be put on stage this week.';
    else if (p.status === 'benched') reason = 'You are benched. Nobody has told you why and nobody has to.';
    else reason = `The coach has you down as ${info.name.toLowerCase()} for this one.`;
    return { plays: false, reason };
}

// ---------------------------------------------------------------------------
//  ADVANCE WEEK
//  The main entry. Everything above exists so this stays readable.
// ---------------------------------------------------------------------------

/** Auto-sim anything the player left unplayed, including a bracket tie that
 *  only appeared once an earlier one resolved. */
function simSkippedFixtures() {
    let skipped = 0;
    let guard = 0;
    while (guard++ < 8) {
        const pending = fixturesInWeek(snap()).filter(f => !f.played);
        if (!pending.length) break;
        for (const f of pending) {
            if (simFixture(f.id)) skipped++;
        }
    }
    // Not while the club has benched you for burnout. That penalty is for
    // letting the staff run a game you could have played; being taken out of the
    // rotation is the club's decision, and charging morale for it would fight
    // the relief that makes the bench recoverable instead of a spiral.
    if (skipped > 0 && !burnoutBenched(snap())) {
        const hit = -Math.min(NOSHOW_MORALE_CAP, NOSHOW_MORALE * skipped);
        adjustCondition('morale', hit);
        addNews(skipped === 1
            ? 'You let the staff run the game without you. It was played anyway.'
            : `${skipped} games went ahead without you at the desk.`, 'drama');
    }
    return skipped;
}

/** Everything that happens when the calendar crosses into a new phase. */
function handlePhaseChange(fromId, toId) {
    if (fromId === toId) return;

    // Leaving a bracket phase with the bracket still running. Rounds are pinned
    // to weeks now, so a field too big for its window (or a save carrying a
    // bracket from an older build with no window at all) could otherwise sit
    // unfinished forever -- and an unfinished summer bracket never awards the
    // championship points that decide who goes to Worlds.
    const leftBracketPhase = fromId === 'spring_po' || fromId === 'summer_po'
        || fromId === 'msi' || fromId === 'worlds' || fromId === 'first_stand';
    if (leftBracketPhase) {
        const b = snap().season.bracket;
        if (b && !b.done && b.kind === fromId) safe(() => forceFinishBracket(), null);
    }

    if (toId === 'first_stand') {
        runInternational('first_stand');
        return;
    }
    if (toId === 'spring_po' || toId === 'summer_po') {
        runPlayoffs();
        return;
    }
    if (toId === 'msi') {
        // Spring is over the moment MSI starts: award it before the schedule
        // is redrawn for summer.
        closeSplit('spring');
        runInternational('msi');
        career.update(x => ({
            ...x,
            season: { ...x.season, qualified: { ...(x.season.qualified || {}), msi: false } },
        }));
        return;
    }
    if (toId === 'worlds') {
        runInternational('worlds');
        return;
    }
    if (toId === 'summer' || toId === 'spring') {
        ensureSeason();
        return;
    }
    if (toId === 'offseason') {
        addNews('Offseason. Contracts, transfers and the only weeks of the year that are yours.', 'system');
        // The transfer window is the one moment the club is allowed to change
        // who is sitting next to you. Runs before rolloverYear() bumps the year,
        // so a signing is stamped with the season it was made in.
        safe(() => runRosterChurn(), null);
    }
}

/**
 * End the week and begin the next one. Returns everything a screen needs to
 * narrate what just happened.
 */
export function advanceWeek() {
    const start = snap();
    if (!start || !start.created) return null;
    if (start.flags && start.flags.retired) {
        return {
            events: [], news: [], phaseChanged: false, yearRolled: false,
            summary: weekSummary(start),
        };
    }
    if (liveMatch()) return null;

    const newsBefore = Array.isArray(start.news) ? start.news.length : 0;
    ensureSeason();

    // 1. anything the player did not turn up for
    simSkippedFixtures();

    // 2. the rest of the division plays its week
    const standings = safe(() => simulateAIWeek(snap()), null);
    if (standings) {
        career.update(c => ({ ...c, season: { ...c.season, standings } }));
    }

    // 2b. how the room is going. After the week's results are committed and
    // before the clock moves, so momentum always describes the week just played.
    safe(() => tickClubMomentum(), null);

    // 3. the clock
    const before = snap();
    const fromPhase = phaseForWeek(num(before.time.week, 1)).id;
    const nextWeek = num(before.time.week, 1) + 1;

    let yearRolled = false;
    if (nextWeek > WEEKS_PER_YEAR) {
        rolloverYear();
        yearRolled = true;
    } else {
        career.update(c => ({ ...c, time: { ...c.time, week: nextWeek } }));
    }

    // 4. phase transitions
    const mid = snap();
    const toPhase = phaseForWeek(num(mid.time.week, 1)).id;
    const phaseChanged = toPhase !== fromPhase || yearRolled;
    if (!yearRolled) handlePhaseChange(fromPhase, toPhase);
    ensureSeason();

    // 4b. the bracket's own clock. A round waits for its week, so the new week
    // has to come and get it -- and this must run AFTER ensureSeason, which is
    // what carries a live bracket across the MSI/summer boundary.
    safe(() => tickBracket(), null);

    // 5. the new week
    const started = startCareerWeek();

    const after = snap();
    const added = Array.isArray(after.news) ? after.news.length - newsBefore : 0;
    const news = added > 0 ? after.news.slice(0, added) : [];

    saveCareer();
    return {
        // EVERY event the week produced, in order: the weekly roll (0-2 of
        // them) and then the pre-game one. Taking only the first is what made
        // the second weekly roll and the whole pre-game pool invisible.
        events: Array.isArray(started.events) ? started.events.filter(Boolean) : [],
        news,
        phaseChanged,
        yearRolled,
        summary: weekSummary(after),
    };
}
