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
    teamById, DEFAULT_START_YEAR,
} from './constants.js';
import {
    clamp, randInt, calcOVR, statusInfo, decayFor, rankFromMMR,
    fmtGold, fmtFollowers,
} from './ratings.js';
import {
    generateSchedule, blankStandings, simulateAIWeek, leagueTable,
    playoffSeeds, teamsInRegion, teamStrength, teamStrengthWithPlayer,
    winChance,
} from './teams.js';
import {
    SOLOQ_GAIN, SCRIM_GAIN, VOD_GAIN, trainingMultiplier, restRecovery,
} from './training.js';
import {
    weeklyIncome, expireSponsors, expireBuffs, lifestyleEffects, perkEffects,
    gearEnergyBonus, followerMultiplier,
} from './economy.js';
import {
    pruneExpiredOffers, generateOffers, clubReview, promotionCheck,
    releaseFromClub,
} from './contracts.js';
import {
    endOfSplitAwards, grantAwards, checkMilestones, grantMilestones, retire,
} from './awards.js';
import { rollWeeklyEvent, rollInterview } from './events.js';
import { buildMatch, quickSim, applyMatchResult } from './match.js';
import {
    career, matchState, careerOverlay, absWeek, saveCareer, addNews,
    grantGold, grantFollowers, adjustCondition, applyAttrGain, spendAction,
    logWeek,
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

/** Which split a calendar week belongs to. Preseason is spring's build-up;
 *  everything from MSI onward is booked against summer. */
const SPLIT_BY_PHASE = {
    preseason: 'spring', spring: 'spring', spring_po: 'spring',
    msi: 'summer', summer: 'summer', summer_po: 'summer',
    worlds: 'summer', offseason: 'summer',
};

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

function splitForWeek(week) {
    return SPLIT_BY_PHASE[phaseForWeek(week).id] || 'spring';
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
    const played = scheduleOf(c).filter(f => f && f.played).slice(-4);
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
    if (!start || !start.created) return { event: null, income: null, notes };

    const stamp = absWeek(start);
    if (num(start.weekly && start.weekly.stamp, -1) === stamp) {
        return { event: null, income: weeklyIncome(start), notes };
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

    // ---- form drift and the floors money buys ------------------------------
    const target = formBaseline(c);
    const drift = clamp(Math.round((target - num(c.player.form, 50)) * FORM_PULL), -FORM_MAX_DRIFT, FORM_MAX_DRIFT);
    if (drift !== 0) adjustCondition('form', drift);

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
    const event = safe(() => rollWeeklyEvent(snap()), null);

    saveCareer();
    return { event, income, notes };
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

function doSoloQueue(c) {
    const games = randInt(4, 6);
    const ovr = calcOVR(c.player.attrs, c.player.role);
    const mmr = clamp(num(c.soloq.mmr, 300), 0, MMR_MAX);
    // The ladder the player's rating actually belongs on. 72 OVR lands near
    // Diamond I, 85 near Grandmaster, 95 in Challenger.
    const targetMMR = clamp((ovr - 35) * 62, 300, MMR_MAX);
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

    const detail = `${wins}W-${games - wins}L, ${delta >= 0 ? '+' : ''}${delta} MMR, now ${after.label}`;
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
    const detail = 'Five-man practice: teamfighting, shotcalling and chemistry';
    logWeek('Scrim Block', detail, '#f59e0b');
    return ok('Scrim block done. The room played better on the second half of it.', detail);
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
    // overlay exactly as it would after a match.
    const iv = safe(() => rollInterview(snap(), snap().lastMatch), null);
    if (iv) careerOverlay.set({ kind: 'interview', payload: iv });

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

/**
 * Spend one activity slot. `train` is deliberately not handled here -- a drill
 * runs through a minigame and training.completeDrill() owns that whole flow.
 */
export function doActivity(activityId, payload) {
    const before = snap();
    if (!before || !before.created) return no('No career in progress.');
    if (before.flags && before.flags.retired) return no('You are retired. Enjoy it.');

    const act = ACTIVITY_BY_ID[activityId];
    if (!act) return no('That is not something you can do this week.');
    if (activityId === 'train') return no('Training drills are run from the Training screen.');
    if (num(before.weekly.actionsLeft, 0) < 1) return no('No activity slots left this week.');
    if (act.needsClub && !before.player.clubId) return no(`${act.name} needs a club. Get signed first.`);

    const cost = num(act.energy, 0);
    if (cost > 0 && num(before.player.energy, 0) < cost) {
        return no(`Not enough energy -- ${act.name} costs ${cost}.`);
    }

    if (!spendAction(1)) return no('No activity slots left this week.');
    if (cost > 0) adjustCondition('energy', -cost);

    const c = snap();
    let res;
    switch (activityId) {
        case 'soloq':  res = doSoloQueue(c); break;
        case 'scrim':  res = doScrim(c); break;
        case 'vod':    res = doVod(c); break;
        case 'stream': res = doStream(c); break;
        case 'media':  res = doMedia(c); break;
        case 'gym':    res = doGym(c); break;
        case 'rest':   res = doRest(c); break;
        default:       res = ok(`${act.name} done.`, '');
    }

    // Hours on the hands carry a risk; the two activities that exist to repair
    // the player obviously do not.
    if (activityId !== 'rest' && activityId !== 'gym') {
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

function bestOfFor(fixture) {
    return Math.max(1, Math.round(num(fixture && fixture.bestOf, 1)));
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
        bestOf: bestOfFor(f),
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
        bestOf: bestOfFor(f),
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
        const next = rows.slice();
        next[i] = {
            ...next[i],
            played: true,
            won: !!result.won,
            score: Array.isArray(result.score) ? result.score.slice() : null,
            myRating: result.played === false ? null : num(result.rating, 0),
        };
        return { ...c, season: { ...c.season, schedule: next } };
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
export function ensureSeason() {
    const c = snap();
    if (!c || !c.created) return null;

    const split = splitForWeek(num(c.time.week, 1));
    const stamp = `${c.time.year}:${split}:${c.player.clubId || 'free'}`;
    if (c.season.stamp === stamp && scheduleOf(c).length) return c.season;

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
    const ids = (seedIds || []).filter(Boolean);
    if (ids.length < 2) return null;

    const seeded = ids.map((id, i) => seedTeam(c, id, i + 1));
    // Byes to the top seeds until the field is a power of two.
    let size = 2;
    while (size < seeded.length) size *= 2;
    const byes = size - seeded.length;
    const resting = seeded.slice(0, byes);
    const playing = seeded.slice(byes);

    const bracket = {
        kind,
        year: num(c.time.year, DEFAULT_START_YEAR),
        title: title || phaseName(kind),
        bestOf: PLAYOFF_BEST_OF,
        rounds: [{ name: roundLabel(playing.length / 2), ties: pairSeeds(playing) }],
        byes: resting,
        champion: null,
        runnerUp: null,
        myPlacement: null,
        done: false,
    };
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
    pushSchedule([{
        id: tie.id,
        week: num(c.time.week, 1),
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
}

function writeBracket(bracket) {
    career.update(x => ({ ...x, season: { ...x.season, bracket } }));
}

/**
 * Drive the bracket forward. Returns as soon as it hits a tie the player is
 * in; everything else resolves immediately.
 */
function stepBracket() {
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

        b.rounds.push({ name: roundLabel(field.length / 2), ties: pairSeeds(field) });
        stampTieIds(b);
        writeBracket(b);
    }
    return snap().season.bracket;
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

    // Qualification. Only a main-league side travels.
    if (num(c.player.clubTier, 0) === 1 && placement) {
        if (b.kind === 'spring_po' && placement <= 1) {
            career.update(x => ({ ...x, season: { ...x.season, qualified: { ...(x.season.qualified || {}), msi: true } } }));
            addNews('Qualified for the Mid-Season Invitational.', 'award');
        }
        if (b.kind === 'summer_po' && placement <= 2) {
            career.update(x => ({ ...x, season: { ...x.season, qualified: { ...(x.season.qualified || {}), worlds: true } } }));
            addNews('Qualified for the World Championship.', 'award');
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
    if (kind !== 'msi' && kind !== 'worlds') return null;
    if (!q[kind] || !c.player.clubId) return null;
    if (c.season.bracket && c.season.bracket.kind === kind) return c.season.bracket;

    const perRegion = kind === 'worlds' ? 3 : 2;   // 15-16 at Worlds, 10 at MSI
    const year = num(c.time.year, DEFAULT_START_YEAR);
    const pool = [];
    for (const rid of REGION_IDS) {
        const rows = safe(() => teamsInRegion(rid, 1), [])
            .map(t => ({ id: t.id, power: safe(() => teamStrength(t, year), t.strength) }))
            .sort((a, b) => b.power - a.power)
            .slice(0, perRegion);
        for (const r of rows) pool.push(r);
    }
    // The player's club travels whether or not the strength table rates it.
    if (!pool.some(r => r.id === c.player.clubId)) {
        pool.push({ id: c.player.clubId, power: strengthOfId(c, c.player.clubId) });
    }

    const cap = kind === 'worlds' ? 16 : 8;
    const seeds = pool
        .sort((a, b) => b.power - a.power)
        .slice(0, cap)
        .map(r => r.id);
    if (seeds.length < 4) return null;

    const title = kind === 'worlds' ? 'World Championship' : 'Mid-Season Invitational';
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

    const rows = safe(() => leagueTable(c), []);
    const mine = rows.find(r => r && r.isMine) || null;
    const awards = safe(() => endOfSplitAwards(c, rows), []);
    if (awards.length) safe(() => grantAwards(awards), '');

    const team = c.player.clubId ? teamById(c.player.clubId) : null;
    let row = null;
    career.update(x => {
        row = {
            year: num(x.time.year, DEFAULT_START_YEAR),
            split: splitId,
            teamId: x.player.clubId || null,
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
    if (awards.length) careerOverlay.set({ kind: 'awards', payload: awards });
    else if (row) careerOverlay.set({ kind: 'season', payload: row });

    if (!c.player.clubId) { saveCareer(); return; }

    const review = safe(() => clubReview(snap()), null);
    if (review) {
        addNews(review.text, review.verdict === 'cutting' || review.verdict === 'concerned' ? 'drama' : 'system');
        if (review.statusChange) {
            career.update(x => ({ ...x, player: { ...x.player, status: review.statusChange } }));
        }
    }
    safe(() => promotionCheck(snap()), null);
    saveCareer();
}

/** How much of decayFor() each attribute takes. See DECAY_WEIGHTS. */
function applyAgeDecay() {
    const c = snap();
    const rate = num(decayFor(c.player.age), 0) * num(perkEffects(c).decayMult, 1);
    if (rate <= 0) return [];

    const lost = [];
    career.update(x => {
        const attrs = { ...x.player.attrs };
        for (const k of ATTR_KEYS) {
            const drop = rate * num(DECAY_WEIGHTS[k], 0.5);
            if (drop <= 0) continue;
            const next = clamp(Math.round((attrs[k] - drop) * 10) / 10, 1, 99);
            if (next < attrs[k]) lost.push(`${k.toUpperCase()} -${(attrs[k] - next).toFixed(1)}`);
            attrs[k] = next;
        }
        return { ...x, player: { ...x.player, attrs } };
    });
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
        if (summary) careerOverlay.set({ kind: 'retire', payload: summary });
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
    if (health < 55) reason = 'You are not fit enough to be put on stage this week.';
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
    if (skipped > 0) {
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

    // 5. the new week
    const started = startCareerWeek();

    const after = snap();
    const added = Array.isArray(after.news) ? after.news.length - newsBefore : 0;
    const news = added > 0 ? after.news.slice(0, added) : [];

    saveCareer();
    return {
        events: started.event ? [started.event] : [],
        news,
        phaseChanged,
        yearRolled,
        summary: weekSummary(after),
    };
}
