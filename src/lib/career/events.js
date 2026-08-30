// =========================================================================
//  LoL ULTIMATE CAREER - life events, drama and press
// =========================================================================
//  Everything in here is the stuff that happens to a player between the
//  scrim block and the stage: teammates, coaches, journalists, sponsors,
//  parents, and the patch notes.
//
//  Event definitions are DATA. An option's apply(c) reads the career and
//  returns { text, effects } - it never touches the store. This module is the
//  only thing that writes, which keeps every outcome replayable, testable and
//  free of half-applied side effects when a UI cancels mid-flow.
//
//  Balance contract (enforced by capEffects(), not just by good intentions):
//    - no single choice moves a condition meter by more than 12
//    - no single choice moves an attribute by more than 2
//    - no single choice pays more than one week's wage for a mid-tier
//      main-league pro (~1400g at 78 OVR), so events flavour a career and
//      never fund one
//    - no single choice moves a language by more than 8, which is a shade
//      under one tutored lesson at level 0. An event may nudge a language;
//      it must never substitute for the activity that teaches one.
//  Over a 10-year, 400-week career an event fires roughly every third week,
//  so these numbers compound into something real without ever being a shortcut.

import {
    NEWS_TYPES, ATTR_BY_KEY, ATTR_KEYS, SQUAD_STATUS, MMR_MAX,
    CHAMPION_BY_ID, phaseForWeek, REGION_BY_ID,
    LANGUAGE_BY_ID, LANGUAGE_IDS, LANGUAGE_MAX, LANGUAGE_FLUENT, LANGUAGE_SIGN_MIN,
    languageForRegion, languageLevelFor, languageBand,
} from './constants.js';
import { clamp, randInt, fmtGold, fmtFollowers } from './ratings.js';
import {
    career, absWeek, addNews, grantGold, grantFollowers, grantLegacy,
    spendLegacy, adjustCondition, applyAttrGain, setAttr, logWeek, saveCareer,
} from '../stores/career.js';

// -------------------------------------------------------------------------
//  TUNING
// -------------------------------------------------------------------------

/** Chance a week produces an event at all. ~1 in 3 weeks: often enough that a
 *  season has a story, rare enough that the player still reads them. */
export const WEEKLY_EVENT_CHANCE = 0.32;

/** Chance that a week which already produced an event produces a SECOND one.
 *  Deliberately an order of magnitude under WEEKLY_EVENT_CHANCE: two popups in
 *  one week is meant to read as a bad week, not as the format. At 0.32 x 0.10
 *  it lands about three times in a forty-week year. */
export const WEEKLY_SECOND_EVENT_CHANCE = 0.10;

/** An event may not repeat inside this many weeks. Half a season - long enough
 *  that nobody sees "your jungler blames you" twice in one split. */
export const EVENT_COOLDOWN_WEEKS = 20;

/** Chance of something happening in the hours before a playoff or international
 *  game. Much higher than the weekly roll because it is gated on the fixture
 *  rather than on the calendar: a career sees maybe fifteen of these a year at
 *  0.55, against roughly thirteen weekly events. */
export const PREGAME_CHANCE = 0.55;

/** Notable matches (playoffs, internationals, MVP games, blowout losses) draw
 *  press. Routine regular-season games rarely do. Blended across a split this
 *  lands near the intended one interview per four matches. */
export const INTERVIEW_CHANCE_NOTABLE = 0.55;
export const INTERVIEW_CHANCE_ROUTINE = 0.10;

/** Series KDA ratio below which the press has a question about your numbers.
 *  Sits under match.js's own KDA_SOUR_AT (1.6), so a line the match engine has
 *  already charged morale for is a line a journalist is allowed to ask about,
 *  and the marginal ones are not. Reads a ratio, never a raw death count: a
 *  support and a mid do not die the same number of times in a good game. */
const BAD_KDA_AT = 1.5;

/** Hard caps applied to every effects object before it reaches the store. */
const CAP = {
    meter: 12,       // form / morale / health / chemistry
    // Energy is spent and refilled every single week (one training drill costs
    // 24, a rest day returns 50), so it lives on a coarser scale than the
    // meters that persist across a season.
    energy: 18,
    attr: 2,
    gold: 1200,
    followers: 40000,
    legacy: 3,
    mmr: 150,
    // A language, either direction. One tutored lesson at level 0 is worth
    // LANGUAGE_STUDY_BASE (9), so an event can never be a cheaper teacher than
    // the activity - and the same cap on the negative side stops a bad week
    // erasing a month of study.
    language: 8,
};

const METERS = ['form', 'morale', 'energy', 'health'];

// -------------------------------------------------------------------------
//  STORE ACCESS
// -------------------------------------------------------------------------

/** get(career) without importing svelte/store - this module is restricted to
 *  the career/ratings/store import triangle. A writable calls its subscriber
 *  synchronously on subscribe, which is precisely what get() relies on. */
function snapshot() {
    let v = null;
    const un = career.subscribe(s => { v = s; });
    un();
    return v;
}

// -------------------------------------------------------------------------
//  GATE HELPERS
//  Every when(c) runs against a save that may predate the field it wants, so
//  these all read defensively.
// -------------------------------------------------------------------------
const PL = c => (c && c.player) || {};

function isSigned(c) { return !!PL(c).clubId; }
/** Age, or 16 when the save cannot supply one. Deliberately NOT `|| 16`: a save
 *  carrying age 0 or a non-numeric age used to read as 16, which quietly passed
 *  every maximum-age gate in the pool. `??` alone does not catch NaN either, so
 *  this tests for a finite number and nothing else. */
function ageOf(c) { const a = Number(PL(c).age); return Number.isFinite(a) ? a : 16; }
/** The two age gates every flavour-driven event wants. Written once so that a
 *  new event can say "this line only makes sense at 17" in four characters and
 *  never has to re-derive it. */
function agedAtLeast(c, n) { return ageOf(c) >= n; }
function agedBetween(c, min, max) { const a = ageOf(c); return a >= min && a <= max; }
function formOf(c) { return Number(PL(c).form) || 0; }
function moraleOf(c) { return Number(PL(c).morale) || 0; }
function energyOf(c) { return Number(PL(c).energy) || 0; }
function healthOf(c) { return Number(PL(c).health) || 0; }
function hypeOf(c) { return Number(PL(c).hype) || 0; }
function chemOf(c) { return Number(PL(c).chemistry ?? 50); }
function mmrOf(c) { return Number(c?.soloq?.mmr) || 0; }
function gamesOf(c) { return Number(c?.totals?.games) || 0; }
function phaseIdOf(c) { return phaseForWeek(c?.time?.week || 1).id; }
function flagOf(c, key) { return !!(c?.flags && c.flags[key]); }

const BIG_STAGE = ['spring_po', 'summer_po', 'first_stand', 'msi', 'worlds'];
const INTL_PHASES = ['first_stand', 'msi', 'worlds'];

/** This season's fixtures. Shape, from blankCareer() in stores/career.js and
 *  written by engine.js pushSchedule()/completeMatch():
 *  { id, week, phase, opponentId, home, played, won, score, myRating }. */
function scheduleOf(c) {
    return Array.isArray(c?.season?.schedule) ? c.season.schedule : [];
}

/** Completed split rows, from engine.js closeSplit():
 *  { year, split, teamId, teamName, w, l, placement, champPoints, awards }. */
function historyOf(c) {
    return Array.isArray(c?.history) ? c.history : [];
}

/** "The calendar says playoffs." Says nothing about whether the player is in
 *  them. Kept as its own helper because that is genuinely the right question
 *  for anything about the season rather than about the seat. */
function inBigStageWeek(c) { return BIG_STAGE.includes(phaseIdOf(c)); }

/**
 * Is the player actually playing on this stage? The calendar makes 13 of the 40
 * weeks a playoff or an international every single year whether or not the club
 * qualified, so a phase check on its own tells a bottom-of-the-table academy
 * player that eight thousand people booed them off a Worlds stage.
 *
 * Evidence, in the shapes engine.js really writes:
 *   - season.bracket, from openBracket(): { kind, rounds: [{ name, ties: [{ id,
 *     a, b, score, winner, bestOf }] }], byes: [{ id, name, seed }], ... }.
 *     `kind` is the phase id, and the player's club has to appear in it - a
 *     bracket is opened for the region even when the player missed the cut.
 *   - season.schedule: addBracketFixture() pushes a row stamped with the
 *     bracket's `phase` the moment a tie is the player's.
 * Anything missing or unreadable counts as not playing, which is the direction
 * that fails quietly rather than the one that lies.
 */
function onBigStage(c) {
    if (!isSigned(c)) return false;
    const phase = phaseIdOf(c);
    if (!BIG_STAGE.includes(phase)) return false;
    const clubId = PL(c).clubId;

    const b = c?.season?.bracket;
    if (b && typeof b === 'object' && String(b.kind || '') === phase) {
        const rounds = Array.isArray(b.rounds) ? b.rounds : [];
        for (const r of rounds) {
            const ties = r && Array.isArray(r.ties) ? r.ties : [];
            for (const t of ties) {
                if (!t) continue;
                if ((t.a && t.a.id === clubId) || (t.b && t.b.id === clubId)) return true;
            }
        }
        for (const s of (Array.isArray(b.byes) ? b.byes : [])) {
            if (s && s.id === clubId) return true;
        }
    }

    for (const f of scheduleOf(c)) {
        if (f && String(f.phase || '') === phase) return true;
    }
    return false;
}

/** True when the last `n` fixtures the engine marked played were all losses.
 *  Fewer than n played rows is not a streak, it is a short season. */
function losingStreak(c, n) {
    const played = scheduleOf(c).filter(f => f && f.played === true);
    if (played.length < n) return false;
    return played.slice(-n).every(f => f.won === false);
}

const INTL_AWARD_IDS = ['msi_champ', 'worlds_champ', 'worlds_finalist'];

/**
 * Has the player been to an international before this one? The engine keeps no
 * attendance ledger, so this reads every marker a save could plausibly carry:
 * international silverware in the awards list, the same filed against a past
 * split's history row, and any explicit international field a row happens to
 * hold. Partial by construction - it cannot see a quarter-final exit from three
 * years ago - so the one line that depends on it is bounded by age as well.
 */
function everPlayedInternational(c) {
    const isIntlAward = a => !!a && INTL_AWARD_IDS.includes(a.id);
    if ((Array.isArray(c?.awards) ? c.awards : []).some(isIntlAward)) return true;
    for (const h of historyOf(c)) {
        if (!h || typeof h !== 'object') continue;
        if ((Array.isArray(h.awards) ? h.awards : []).some(isIntlAward)) return true;
        if (h.msi || h.worlds || h.international || h.intl) return true;
        if (INTL_PHASES.includes(String(h.phase || ''))) return true;
    }
    return false;
}

function inSplit(c) { const p = phaseIdOf(c); return p === 'spring' || p === 'summer'; }
function offSeason(c) { const p = phaseIdOf(c); return p === 'offseason' || p === 'preseason'; }

/** True in the calendar year the contract expires - the year an agent starts
 *  making phone calls. */
function contractExpiring(c) {
    const ct = PL(c).contract;
    if (!ct) return false;
    const end = Number(ct.endYear) || 0;
    return end > 0 && (Number(c?.time?.year) || 0) >= end;
}

function championName(c) {
    const ch = CHAMPION_BY_ID[PL(c).champion];
    return ch ? ch.name : 'your comfort pick';
}

/** Coin flip helper so gamble options read as gambles in the source too. */
function chance(p) { return Math.random() < p; }

/** The balance, read defensively. Several older options reach `c.money.gold`
 *  straight through the chain, which throws on a save with no money block -
 *  every apply() is supposed to survive one, so new entries go through here. */
function goldOf(c) { return Number(c?.money?.gold) || 0; }

// -------------------------------------------------------------------------
//  LANGUAGE GATES
//  Two different regions live on a career: player.region is where you are FROM
//  and is never rewritten by a transfer, player.contract.region is where you
//  currently WORK. Everything in the language section reads the second against
//  the first, because "you cannot follow the review" is a lie to a player who
//  grew up speaking it.
// -------------------------------------------------------------------------

/** Level in one language, 0..100 and fractional. Delegated to constants so a
 *  rotted `languages` map (null, an array, a string) reads as 0 inside a gate
 *  rather than throwing and silently excluding the event. */
function langLevel(c, id) { return languageLevelFor(c, id); }

function langName(id) { const l = LANGUAGE_BY_ID[id]; return l ? l.name : 'the local language'; }
function leagueName(regionId) { const r = REGION_BY_ID[regionId]; return r ? r.league : 'the league'; }

/** The league the player actually plays in, or '' when unsigned. */
function playingRegion(c) {
    const ct = PL(c).contract;
    return ct && typeof ct === 'object' && typeof ct.region === 'string' ? ct.region : '';
}

/** Signed, and working somewhere other than where you are from. */
function abroad(c) {
    const r = playingRegion(c);
    return isSigned(c) && !!r && r !== PL(c).region;
}

/** The language the player's league runs on, or '' when unsigned or when the
 *  region needs none ('ALL', the amateur circuit). */
function workLang(c) { return languageForRegion(playingRegion(c)) || ''; }

/**
 * Level in the working language, and LANGUAGE_MAX when there is no working
 * language at all. The maximum is the safe direction on purpose: every gate
 * below asks "am I short of it", and an unsigned player or an amateur side has
 * nothing to be short OF. Reading the bare level would have made every
 * language event fire for a thirteen-year-old with no contract, because
 * languageLevelFor() honestly reports an unknown id as 0.
 */
function workLangLevel(c) { const id = workLang(c); return id ? langLevel(c, id) : LANGUAGE_MAX; }

/** The language of the region the player is FROM, or ''. */
function homeLang(c) { return languageForRegion(PL(c).region) || ''; }

/** The first language on the circuit the player could not be signed in, in
 *  LANGUAGE_IDS order, or '' when they clear the gate everywhere. This is the
 *  gap an agent keeps bringing up. */
function shortestLanguage(c) {
    for (const id of LANGUAGE_IDS) if (langLevel(c, id) < LANGUAGE_SIGN_MIN) return id;
    return '';
}

// -------------------------------------------------------------------------
//  EVENT POOL
//  weight is relative inside whatever subset passes when(c). Common,
//  low-stakes texture sits at 10-14; career-defining moments sit at 4-6 so
//  they stay memorable.
// -------------------------------------------------------------------------
export const EVENT_POOL = [

    // ---- ROSTER & COACHING -------------------------------------------------
    {
        id: 'vod_blame',
        weight: 14,
        type: 'drama',
        icon: '\u{1F4FC}',
        title: 'Post-Game VOD Review',
        text: 'Your jungler pauses the replay on your death timer and leaves it on the screen. "That is the game. Right there." The coach says nothing, which is worse.',
        when: c => isSigned(c) && gamesOf(c) >= 3,
        options: [
            {
                id: 'own',
                label: 'Own it',
                desc: 'Take the death, name the fix, move on.',
                apply: () => ({
                    text: 'You say you should have warded the raptor entrance and you say it without adding a "but". The room moves on inside a minute. He talks to you again at dinner.',
                    effects: { morale: -4, chemistry: 7, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'push',
                label: 'Push back',
                desc: 'Point at the six minutes where nobody came bot.',
                apply: (c) => {
                    // A player the room already listens to can win this. Anybody
                    // else is just the guy who argued in review.
                    const heard = PL(c).status === 'star' || (PL(c).attrs?.ldr || 0) >= 70 || chemOf(c) >= 75;
                    return heard
                        ? {
                            text: 'You scrub back four minutes and show the pathing. He looks at it for a long time and then says "yeah, fair". The coach writes something down.',
                            effects: { morale: 6, chemistry: -3, attr: { ldr: 1 } },
                        }
                        : {
                            text: 'It turns into two people talking over a paused replay for eleven minutes. The analyst quietly moves on to the next game. Nothing is settled.',
                            effects: { morale: 3, chemistry: -9, form: -2 },
                        };
                },
            },
            {
                id: 'silent',
                label: 'Say nothing',
                desc: 'Let it land. Deal with it alone later.',
                apply: () => ({
                    text: 'You look at the screen until he moves on. It sits in you for the rest of the week and it is still there in the first game on Saturday.',
                    effects: { morale: -7, form: -3 },
                }),
            },
        ],
    },
    {
        id: 'coach_extra_block',
        weight: 13,
        type: 'training',
        icon: '\u{2694}',
        title: 'The Coach Wants Another Block',
        text: 'The scrim partner cancelled at seven and uncancelled at nine. The coach asks the room whether anyone is up for it, but he is looking at you.',
        when: c => isSigned(c),
        options: [
            {
                id: 'take',
                label: 'Take the block',
                desc: 'Four more games. Sleep is a later problem.',
                apply: () => ({
                    text: 'Four games, two of them useful, one of them the exact fight pattern you lose on stage. You get home at half two.',
                    effects: { energy: -12, chemistry: 6, attr: { tmf: 1 } },
                }),
            },
            {
                id: 'home',
                label: 'Go home',
                desc: 'You are already past useful for today.',
                apply: () => ({
                    text: 'You are asleep by eleven for the first time in three weeks. The group chat plays without you and mentions it twice.',
                    effects: { energy: 8, chemistry: -6, morale: 3 },
                }),
            },
            {
                id: 'trade',
                label: 'Yes, if you get the morning off',
                desc: 'Trade the late night for a late start.',
                apply: (c) => (chemOf(c) >= 60
                    ? {
                        text: 'He agrees before you finish the sentence. You play the block and nobody knocks on your door until noon.',
                        effects: { energy: -6, chemistry: 2, morale: 4 },
                    }
                    : {
                        text: 'He says "sure" in the voice that means he will remember this. You play the block anyway and the alarm goes at eight.',
                        effects: { energy: -12, chemistry: -4 },
                    }),
            },
        ],
    },
    {
        id: 'roster_trial',
        weight: 9,
        type: 'drama',
        icon: '\u{1F464}',
        title: 'Nobody Introduces Him',
        text: 'There is an account in your scrim block with a name you half recognise from the tier-two ladder. He is playing your role. Nobody introduces him.',
        when: c => isSigned(c) && (formOf(c) < 55 || ['rotation', 'sub', 'benched'].includes(PL(c).status)),
        options: [
            {
                id: 'outwork',
                label: 'Outwork him',
                desc: 'Be the first one in the room every day this week.',
                apply: () => ({
                    text: 'You are in at nine every morning and you make sure the coach sees it. By Friday the trial account stops showing up.',
                    effects: { energy: -12, form: 6, morale: -2, attr: { lne: 1 } },
                }),
            },
            {
                id: 'ask',
                label: 'Ask the coach directly',
                desc: 'Make him say it out loud.',
                apply: (c) => (formOf(c) >= 50
                    ? {
                        text: 'He says it is due diligence and that your seat is not in question. He is mostly telling the truth, and he respects that you asked.',
                        effects: { morale: 2, chemistry: 3, form: 2 },
                    }
                    : {
                        text: 'He does not lie to you, which is the problem. You now know exactly what the next two months look like.',
                        effects: { morale: -6, chemistry: 3, form: 3 },
                    }),
            },
            {
                id: 'agent',
                label: 'Call your agent',
                desc: 'Start covering the exit before it is one.',
                apply: () => ({
                    text: 'He tells you to keep your head down and lets two other orgs know you are contactable. Somebody in the building finds out within a week.',
                    effects: { morale: 4, chemistry: -4, flag: 'transferInterest' },
                }),
            },
        ],
    },
    {
        id: 'dead_comms',
        weight: 12,
        type: 'drama',
        icon: '\u{1F507}',
        title: 'Dead Air',
        text: 'Your bot laner has not said a word in comms for two days. Pings only. It survives exactly until the first game where somebody needs a call.',
        when: c => isSigned(c) && chemOf(c) <= 72,
        options: [
            {
                id: 'dinner',
                label: 'Take him to dinner',
                desc: 'No coach, no analyst, no review doc.',
                apply: () => ({
                    text: 'It takes ninety minutes and two entirely unrelated conversations before he tells you what it actually is. He talks in the next block.',
                    effects: { chemistry: 9, energy: -6 },
                }),
            },
            {
                id: 'coach',
                label: 'Raise it with the coach',
                desc: 'Make it a staff problem, not yours.',
                apply: () => ({
                    text: 'It gets handled the way staff handle things: a meeting, a document, and comms that are technically fine for a fortnight.',
                    effects: { chemistry: -3, form: 4, morale: 2 },
                }),
            },
            {
                id: 'mirror',
                label: 'Ping only, then',
                desc: 'If that is the standard, meet it.',
                apply: () => ({
                    text: 'Two people playing bot lane in silence is not a bot lane. You lose a 2v2 on Saturday that you were winning at level one.',
                    effects: { chemistry: -8, morale: -2, form: -4 },
                }),
            },
        ],
    },
    {
        id: 'academy_kid',
        weight: 8,
        type: 'drama',
        icon: '\u{1F393}',
        title: 'The Kid From The Academy',
        text: 'The seventeen-year-old on the academy roster went nine and zero against you in the practice room this week and apologised every single time.',
        when: c => isSigned(c) && ageOf(c) >= 21,
        options: [
            {
                id: 'mentor',
                label: 'Teach him',
                desc: 'He will pass you eventually. Decide how.',
                apply: () => ({
                    text: 'You spend two evenings on his wave patterns. He is not better than you yet, and now when he is, he will say your name in an interview.',
                    effects: { chemistry: 6, morale: 3, legacy: 1, attr: { ldr: 1 } },
                }),
            },
            {
                id: 'grind',
                label: 'Go back to the drills',
                desc: 'The answer to being outplayed is old and boring.',
                apply: () => ({
                    text: 'Two hundred practice-tool reps a day for a week. On Friday you take four of five off him and neither of you mentions it.',
                    effects: { energy: -14, form: 4, attr: { mec: 1 } },
                }),
            },
            {
                id: 'freeze',
                label: 'Freeze him out',
                desc: 'Stop scrimming him. Stop talking to him.',
                apply: () => ({
                    text: 'The practice room notices in about four days. He gets moved to the other block, and you get a reputation that follows you to your next org.',
                    effects: { chemistry: -8, morale: -3, form: 2 },
                }),
            },
        ],
    },
    {
        id: 'teammate_leaving',
        weight: 8,
        type: 'transfer',
        icon: '\u{1F6AA}',
        title: 'He Tells You First',
        text: 'Your support waits until everyone else has left the building. "I am not re-signing. I wanted you to hear it from me and not from a journalist."',
        when: c => isSigned(c) && gamesOf(c) >= 25,
        options: [
            {
                id: 'keep',
                label: 'Keep it to yourself',
                desc: 'He asked you to. That is the whole ask.',
                apply: () => ({
                    text: 'You carry it for five weeks. He knows you carried it, and after the announcement he says so where the rest of the roster can hear.',
                    effects: { chemistry: 6, morale: -4 },
                }),
            },
            {
                id: 'tell',
                label: 'Tell the coach',
                desc: 'The team can plan or the team can be surprised.',
                apply: () => ({
                    text: 'Staff start building around it a month early, which genuinely helps. He works out who told them inside a week.',
                    effects: { chemistry: -7, form: 3, morale: -2 },
                }),
            },
            {
                id: 'follow',
                label: 'Ask where he is going',
                desc: 'And whether they need somebody else.',
                apply: () => ({
                    text: 'He gives you a name and a number to call. You do not call it yet, but you save it, which is its own kind of decision.',
                    effects: { morale: 3, chemistry: -2, flag: 'transferInterest' },
                }),
            },
        ],
    },
    {
        id: 'scrim_leak',
        weight: 9,
        type: 'drama',
        icon: '\u{1F4E1}',
        title: 'The Scrim Leak',
        text: 'Somebody posted your scrim scoreline in a Discord with two thousand members. The coach has spent the entire morning working out who, and asking everyone.',
        when: c => isSigned(c),
        options: [
            {
                id: 'deny',
                label: 'Say it was not you and leave it',
                desc: 'Which is true and does not help.',
                apply: () => ({
                    text: 'Everyone says it was not them. The scrim partner cancels the rest of the week and the coach stays in a bad mood until Sunday.',
                    effects: { chemistry: -2, form: -2 },
                }),
            },
            {
                id: 'lockdown',
                label: 'Suggest locking the server down',
                desc: 'Fix the hole instead of hunting the rat.',
                apply: () => ({
                    text: 'Two accounts get removed, one of them a former analyst nobody had thought about in a year. You learn more about how scrim blocks are actually run than you wanted to.',
                    effects: { chemistry: 4, energy: -4, attr: { knw: 1 } },
                }),
            },
            {
                id: 'hunt',
                label: 'Find out who it was',
                desc: 'You have a guess. Guesses are the risk.',
                apply: () => (chance(0.5)
                    ? {
                        text: 'You were right, and you had the screenshots before you said the name. Staff handle it quietly and the room decides you are somebody who does not miss.',
                        effects: { chemistry: 8, morale: 3 },
                    }
                    : {
                        text: 'You were wrong, in front of four people, about somebody who had been in the building longer than you. The apology does not fully take.',
                        effects: { chemistry: -9, morale: -3 },
                    }),
            },
        ],
    },
    {
        id: 'role_swap_float',
        weight: 6,
        type: 'system',
        icon: '\u{1F504}',
        title: 'The Coach Floats A Role Swap',
        text: 'He says it at the end of a review, casually, like it is not the largest sentence anybody has said to you this year. "Have you ever thought about playing something else?"',
        when: c => isSigned(c) && formOf(c) <= 52 && PL(c).status !== 'star',
        options: [
            {
                id: 'refuse',
                label: 'Refuse',
                desc: 'You are what you are. Play me or do not.',
                apply: () => ({
                    text: 'He nods and does not raise it again. The certainty helps your own games and costs you something with the staff you cannot see yet.',
                    effects: { chemistry: -6, morale: 4, form: 2 },
                }),
            },
            {
                id: 'consider',
                label: 'Say you will think about it',
                desc: 'Buy a month. Keep the door open.',
                apply: () => ({
                    text: 'You spend a fortnight watching the other role properly for the first time and understand your own one slightly better for it.',
                    effects: { morale: -3, chemistry: 3, attr: { knw: 1 } },
                }),
            },
            {
                id: 'learn',
                label: 'Learn it in your own time',
                desc: 'Two hundred games on the other side of the map.',
                apply: () => ({
                    text: 'You do not swap. You do come out of it able to play four things you could not play in January, and the drafts get easier.',
                    effects: { energy: -12, form: -2, attr: { chp: 2 } },
                }),
            },
        ],
    },

    {
        id: 'captain_vote',
        weight: 10,
        type: 'drama',
        icon: '\u{1F4CB}',
        title: 'Five Names On Five Pieces Of Paper',
        text: 'The coach hands paper round at the end of review and asks everyone to write down who actually makes the calls in game. He collects them face down and does not open them in the room.',
        // "Who actually makes the calls" needs a room, and enough games for the
        // room to have formed an opinion about you rather than a first guess.
        when: c => isSigned(c) && gamesOf(c) >= 25,
        options: [
            {
                id: 'self',
                label: 'Write your own name',
                desc: 'Somebody has to and nobody else is going to.',
                apply: (c) => ((Number(PL(c).attrs?.ldr) || 0) >= 62
                    ? {
                        text: 'Three of the five papers have your name on them and one of those is not yours. The coach tells you privately and it changes how you talk in the next block.',
                        effects: { morale: 6, chemistry: 4, attr: { ldr: 1 } },
                    }
                    : {
                        text: 'Yours is the only paper with your name on it. Nobody says anything about it and you can tell exactly who read it out to whom.',
                        effects: { morale: -6, chemistry: -4, form: 2 },
                    }),
            },
            {
                id: 'veteran',
                label: 'Write the oldest player in the room',
                desc: 'He has done it before. Let him do it here.',
                apply: () => ({
                    text: 'He gets four of the five and takes the job properly. Comms get quieter and better, and you stop making one decision a game that used to be yours.',
                    effects: { chemistry: 8, form: 3, morale: -3 },
                }),
            },
            {
                id: 'blank',
                label: 'Hand it back blank',
                desc: 'Refuse the whole premise of the exercise.',
                apply: () => ({
                    text: 'You say out loud that a shotcaller you vote for is not a shotcaller. Two people agree with you and the coach does the thing where he writes it down.',
                    effects: { chemistry: -6, morale: 3, attr: { knw: 1 } },
                }),
            },
        ],
    },
    {
        id: 'analyst_leaves',
        weight: 9,
        type: 'system',
        icon: '\u{1F4CA}',
        title: 'The Analyst Is Leaving',
        text: 'The man who has written your matchup prep for every game you have played here is going to a bigger organisation. He tells you in the car park, before the announcement.',
        // "Every game you have played here" needs a club and a body of games.
        when: c => isSigned(c) && gamesOf(c) >= 20,
        options: [
            {
                id: 'documents',
                label: 'Ask him for everything he has written',
                desc: 'Two years of prep in one folder.',
                apply: () => ({
                    text: 'He sends four hundred pages at one in the morning with no message attached. You read the ones about you first and they are not comfortable reading.',
                    effects: { energy: -8, morale: -3, attr: { knw: 2 } },
                }),
            },
            {
                id: 'follow',
                label: 'Ask whether they need a player',
                desc: 'He is walking into a room you would like to be in.',
                apply: () => ({
                    text: 'He says he will mention you, in the tone of a man who has already mentioned you. Somebody in your building hears about the conversation before you get home.',
                    effects: { morale: 5, chemistry: -5, flag: 'transferInterest' },
                }),
            },
            {
                id: 'replace',
                label: 'Do the prep yourself until they hire',
                desc: 'Six hours a week nobody is paying you for.',
                apply: () => ({
                    text: 'You are worse for a fortnight and then better than you were, because reading a scouting document and writing one are not remotely the same job.',
                    effects: { energy: -12, form: -2, chemistry: 5, attr: { knw: 1 } },
                }),
            },
        ],
    },
    {
        id: 'scrim_sandbag',
        weight: 11,
        type: 'training',
        icon: '\u{1F3AD}',
        title: 'They Are Not Trying',
        text: 'The scrim partner has run the same troll composition three blocks in a row and laughed about it in lobby chat. Your coach is taking notes on it as though it were data.',
        // A scrim partner, a block and a coach: all three need a club, and the
        // fixture-week phases are when scrim blocks actually matter.
        when: c => isSigned(c) && inSplit(c),
        options: [
            {
                id: 'callout',
                label: 'Say it in the lobby',
                desc: 'Publicly, where both coaches can read it.',
                apply: () => ({
                    text: 'They play three serious games out of spite and you lose two of them, which is the most useful thing that has happened to you all week.',
                    effects: { form: 5, chemistry: -4, morale: -2 },
                }),
            },
            {
                id: 'serious',
                label: 'Play it completely straight',
                desc: 'Beat the troll comp properly, on the clock.',
                apply: () => ({
                    text: 'You win four games against something nobody will ever draft and learn nothing at all. The block finishes on time and everybody is in a good mood.',
                    effects: { morale: 4, chemistry: 4, form: -3 },
                }),
            },
            {
                id: 'find',
                label: 'Go and find a better partner',
                desc: 'Message every coach in the region tonight.',
                apply: () => ({
                    text: 'Eleven messages and one reply from a side two places above you who will give you Tuesdays. Your coach is annoyed that you did his job and takes the Tuesdays.',
                    effects: { energy: -8, form: 6, chemistry: -3 },
                }),
            },
        ],
    },
    {
        id: 'house_rules',
        weight: 10,
        type: 'drama',
        icon: '\u{1F3E0}',
        title: 'A Sheet Of Paper On The Fridge',
        text: 'Somebody has printed house rules and taped them to the fridge. Two of the eleven are obviously about you and one of them is about the kitchen at four in the morning.',
        // A shared building, and old enough to be living in it rather than at
        // home with the attendance record on the kitchen table.
        when: c => isSigned(c) && agedAtLeast(c, 17),
        options: [
            {
                id: 'sign',
                label: 'Sign it and keep to it',
                desc: 'Including the four in the morning one.',
                apply: () => ({
                    text: 'You are in bed by one for three weeks and the building is a considerably better place to live. You also play about forty fewer games a week.',
                    effects: { chemistry: 7, health: 6, mmr: -60, morale: -3 },
                }),
            },
            {
                id: 'amend',
                label: 'Add two rules of your own',
                desc: 'If it is a document, make it a document.',
                apply: () => ({
                    text: 'You put the practice room hours and the dishes on it in the same handwriting. Somebody adds a thirteenth about the volume of your keyboard and it is not a joke.',
                    effects: { chemistry: 4, morale: 3, energy: -2 },
                }),
            },
            {
                id: 'ignore',
                label: 'Take it down',
                desc: 'Nobody in this building is your landlord.',
                apply: () => ({
                    text: 'It goes back up the same evening with a name written next to the fourth rule. The fridge is a battleground for two months and everybody knows why.',
                    effects: { chemistry: -9, morale: 4, form: -2 },
                }),
            },
        ],
    },

    // ---- SCOUTING & CONTRACTS ---------------------------------------------
    {
        id: 'scout_dm',
        weight: 14,
        type: 'transfer',
        icon: '\u{1F50D}',
        title: 'A Scout Slides Into Your DMs',
        text: 'An account with an org tag messages you inside the practice tool, of all places. "Saw your last twelve games. Do you have representation?"',
        when: c => !isSigned(c) && mmrOf(c) >= 1600,
        options: [
            {
                id: 'professional',
                label: 'Answer like a professional',
                desc: 'Short, polite, no exclamation marks.',
                apply: () => ({
                    text: 'Four messages, one of them a question about your schedule. He adds you to a list you will never see and checks it in three months.',
                    effects: { morale: 6, followers: 400, flag: 'scoutContact' },
                }),
            },
            {
                id: 'money',
                label: 'Ask what they pay',
                desc: 'Bold. Some scouts like bold.',
                apply: () => (chance(0.5)
                    ? {
                        text: 'He laughs and answers honestly, then asks for your solo queue op.gg and your birth year. You are on a spreadsheet by the evening.',
                        effects: { morale: 4, followers: 900, flag: 'scoutContact' },
                    }
                    : {
                        text: 'He stops replying. Two days later he is watching your stream anyway, but you do not know that.',
                        effects: { morale: -6 },
                    }),
            },
            {
                id: 'ignore',
                label: 'Ignore it, it is probably a scam',
                desc: 'Half of them are. You queue instead.',
                apply: () => ({
                    text: 'You close the client and requeue. It might have been nothing. Eleven wins in the next two days is not nothing.',
                    effects: { morale: -2, mmr: 45 },
                }),
            },
        ],
    },
    {
        id: 'contract_final_year',
        weight: 11,
        type: 'transfer',
        icon: '\u{1F4DD}',
        title: 'Final Year',
        text: 'Your agent has the numbers up on a shared screen. "They will offer in January. If you play like this in October, they will offer considerably more."',
        when: c => isSigned(c) && contractExpiring(c),
        options: [
            {
                id: 'hold',
                label: 'Hold out for the raise',
                desc: 'Let the market set the price.',
                apply: () => ({
                    text: 'You tell them you are not signing anything until the offseason. The room finds out because rooms always find out.',
                    effects: { morale: 6, chemistry: -5, flag: 'holdingOut' },
                }),
            },
            {
                id: 'early',
                label: 'Tell them you will sign early',
                desc: 'Certainty is worth money too.',
                apply: () => ({
                    text: 'They put a loyalty bonus in front of you the same week and the coach stops planning around your absence.',
                    effects: { gold: 400, chemistry: 8, morale: -4 },
                }),
            },
            {
                id: 'market',
                label: 'Quietly test the market',
                desc: 'Nobody has to know. Somebody always does.',
                apply: () => ({
                    text: 'Three conversations, none of them written down, one of them very good indeed. It is on a rumour account by the Thursday.',
                    effects: { morale: 3, chemistry: -3, followers: 1200, flag: 'transferInterest' },
                }),
            },
        ],
    },
    {
        id: 'transfer_rumour',
        weight: 11,
        type: 'transfer',
        icon: '\u{1F4F0}',
        title: 'Sources Say',
        text: 'A journalist with an actual track record posts four words about you and an org two places above yours. Your group chat detonates before the scrim block ends.',
        when: c => isSigned(c) && gamesOf(c) >= 20,
        options: [
            {
                id: 'deny',
                label: 'Deny it publicly',
                desc: 'Kill it today, whatever it costs you later.',
                apply: () => ({
                    text: 'One sentence, no jokes, posted before the evening block. The room relaxes. Your agent is not thrilled.',
                    effects: { chemistry: 7, morale: -3, followers: 800 },
                }),
            },
            {
                id: 'nocomment',
                label: 'No comment',
                desc: 'Say nothing and let it work for you.',
                apply: () => ({
                    text: 'Silence reads as confirmation to everyone, which is exactly what you wanted and exactly what your teammates hear.',
                    effects: { chemistry: -4, morale: 5, followers: 2500, flag: 'transferInterest' },
                }),
            },
            {
                id: 'fuel',
                label: 'Like the tweet',
                desc: 'One tap. Forty thousand quote posts.',
                apply: () => ({
                    text: 'You unlike it eleven minutes later. Screenshots do not care. The coach asks about it in front of everybody the next morning.',
                    effects: { chemistry: -9, morale: 6, followers: 6000, flag: 'transferInterest' },
                }),
            },
        ],
    },
    {
        id: 'agency_offer',
        weight: 7,
        type: 'money',
        icon: '\u{1F4BC}',
        title: 'A Bigger Agency',
        text: 'The agency that represents two of the players you watched growing up wants twenty minutes. They already know your contract dates, which is the point of the call.',
        // "watched growing up", and an option about being scouted at fifteen.
        when: c => agedAtLeast(c, 17) && hypeOf(c) >= 8000,
        options: [
            {
                id: 'switch',
                label: 'Switch',
                desc: 'Bigger rooms, bigger percentage.',
                apply: () => ({
                    text: 'The buyout of your old deal costs you a month of savings. Within a fortnight you are in conversations you would never have been in.',
                    effects: { gold: -300, followers: 1500, morale: 4, flag: 'bigAgency' },
                }),
            },
            {
                id: 'loyal',
                label: 'Stay with the guy who found you',
                desc: 'He drove four hours to watch you play at fifteen.',
                apply: () => ({
                    text: 'You tell him about the call yourself. He works harder for you for the rest of your career, and he never once brings it up.',
                    effects: { morale: 7, legacy: 1 },
                }),
            },
            {
                id: 'leverage',
                label: 'Use it to get better terms',
                desc: 'Take the meeting. Take nothing else.',
                apply: () => ({
                    text: 'Your existing agent renegotiates his own cut within a day of hearing whose office you were in.',
                    effects: { gold: 500, morale: 2 },
                }),
            },
        ],
    },
    {
        id: 'late_salary',
        weight: 9,
        type: 'money',
        icon: '\u{1F4B8}',
        title: 'The Payment Is Late Again',
        text: 'Second month running. The manager says it is a banking issue, then that it is a sponsor issue, and then he stops replying in the evenings.',
        when: c => isSigned(c) && (PL(c).clubTier === 2 || PL(c).clubTier === 3),
        options: [
            {
                id: 'chase',
                label: 'Chase it every single day',
                desc: 'Be the problem they solve first.',
                apply: () => ({
                    text: 'Eleven messages and one phone call to somebody senior. You get paid on the Friday. Two teammates who said nothing do not.',
                    effects: { gold: 600, chemistry: -5, energy: -4 },
                }),
            },
            {
                id: 'wait',
                label: 'Wait it out',
                desc: 'They have always paid eventually.',
                apply: () => ({
                    text: 'It arrives eventually. The five weeks of not knowing whether it would arrive is the part you remember.',
                    effects: { morale: -8 },
                }),
            },
            {
                id: 'public',
                label: 'Post about it',
                desc: 'Nuclear. Effective. Permanent.',
                apply: () => ({
                    text: 'You are paid within six hours and the org never forgets it. Half the scene quietly thanks you and nobody does it publicly.',
                    effects: { gold: 400, followers: 5000, morale: 3, chemistry: -8, flag: 'contractDispute' },
                }),
            },
        ],
    },

    {
        id: 'release_clause_call',
        weight: 8,
        type: 'transfer',
        icon: '\u{1F513}',
        title: 'Somebody Read Your Release Clause',
        text: 'A club two places above you has asked, in writing, what it would take. Your agent forwards the email with no message attached to it at all.',
        // The email is about a number that has to exist on the deal. Without a
        // clause there is nothing for anybody to have read.
        when: c => isSigned(c) && Number(PL(c).contract?.releaseClause) > 0,
        options: [
            {
                id: 'trigger',
                label: 'Tell them to trigger it',
                desc: 'Say the number back and mean it.',
                apply: () => ({
                    text: 'Your agent replies with one line and a figure. Nothing happens for eleven days and then everything about the next four weeks is different.',
                    effects: { morale: 7, chemistry: -7, followers: 2000, flag: 'transferInterest' },
                }),
            },
            {
                id: 'leverage',
                label: 'Take it to your own club first',
                desc: 'Let them match it or let them lose you.',
                apply: (c) => (formOf(c) >= 60
                    ? {
                        text: 'They come back inside a week with a better deal than the one you were going to ask for, and a general manager who now checks your form on a Monday.',
                        effects: { gold: 700, morale: 5, chemistry: -3 },
                    }
                    : {
                        text: 'They look at how you are actually playing and they do not blink. The clause stays where it is and so do you, and now they know you looked.',
                        effects: { morale: -7, chemistry: -5 },
                    }),
            },
            {
                id: 'kill',
                label: 'Say no and say nothing',
                desc: 'Delete the email. Play the split.',
                apply: () => ({
                    text: 'Nobody in the building ever finds out, which is the point of doing it that way. You think about the number at least once a week until November.',
                    effects: { chemistry: 6, morale: -4, form: 3 },
                }),
            },
        ],
    },
    {
        id: 'bench_buyout',
        weight: 8,
        type: 'money',
        icon: '\u{1F4B0}',
        title: 'They Offer To Pay You To Go',
        text: 'The general manager puts a figure on the table to terminate early and leave quietly. It is most of what you are owed and none of what you came here for.',
        // Being paid to leave needs a seat already lost and a deal to buy out.
        when: c => isSigned(c) && ['sub', 'benched'].includes(PL(c).status) && !!PL(c).contract,
        options: [
            {
                id: 'take',
                label: 'Take it and go',
                desc: 'Money now, and a winter with nothing in it.',
                apply: () => ({
                    text: 'It clears on the Friday and you are a free agent in a month where nobody is signing anybody. You have never had that much money or that little to do.',
                    effects: { gold: 1100, morale: -6, form: -5, flag: 'transferInterest' },
                }),
            },
            {
                id: 'refuse',
                label: 'Refuse and turn up every day',
                desc: 'Make them pay all of it and see you doing it.',
                apply: () => ({
                    text: 'Nine weeks of being first into the practice room with nothing to practise for. Two people in the building start treating you differently and one of them writes the roster.',
                    effects: { morale: -5, form: 6, chemistry: 4, energy: -8 },
                }),
            },
            {
                id: 'loan',
                label: 'Ask to be loaned somewhere playing',
                desc: 'Anywhere. Any tier. Just games.',
                apply: (c) => (chance(0.45)
                    ? {
                        text: 'A tier below and a four-hour drive, and you play every game of the split. Nobody watches any of them and you come back a better player.',
                        effects: { form: 8, morale: 4, gold: -200, chemistry: -3 },
                    }
                    : {
                        text: 'Two calls and nothing. The window shuts on a Thursday and you spend the rest of the split as the best-prepared substitute in the league.',
                        effects: { morale: -8, attr: { knw: 1 } },
                    }),
            },
        ],
    },
    {
        id: 'agent_moves_on',
        weight: 7,
        type: 'transfer',
        icon: '\u{1F4C7}',
        title: 'Your Agent Takes A Staff Job',
        text: 'The man who has answered your phone at midnight for years is joining an organisation as a director. He cannot represent anybody from Monday and he has told you before his other clients.',
        // "For years", and a client list to be told after you: an adult player
        // with a professional history behind them.
        when: c => agedAtLeast(c, 18) && gamesOf(c) >= 30,
        options: [
            {
                id: 'new',
                label: 'Sign with the agency he recommends',
                desc: 'His word, and a stranger on the phone.',
                apply: () => ({
                    text: 'A competent woman who has read your contract more carefully than you ever did and who calls you back inside an hour. It is not the same and it is not worse.',
                    effects: { gold: -200, morale: -3, chemistry: 2 },
                }),
            },
            {
                id: 'alone',
                label: 'Represent yourself for a year',
                desc: 'Read the deal. Do the calls. Keep the cut.',
                apply: (c) => ((Number(PL(c).attrs?.knw) || 0) >= 70
                    ? {
                        text: 'You negotiate your own bonus schedule and get a clause moved that your agent had never got moved. It costs you eleven evenings.',
                        effects: { gold: 600, energy: -10, attr: { knw: 1 } },
                    }
                    : {
                        text: 'You sign something in March that you understand properly in August. It is not a disaster and it is not what somebody else would have got you.',
                        effects: { gold: -400, morale: -4, attr: { knw: 1 } },
                    }),
            },
            {
                id: 'wait',
                label: 'Ask him to place you somewhere first',
                desc: 'One last piece of work before he goes.',
                apply: () => ({
                    text: 'He spends his last fortnight in the job making phone calls about you instead of about himself. He never mentions it and you never forget it.',
                    effects: { morale: 6, legacy: 1, flag: 'transferInterest' },
                }),
            },
        ],
    },

    // ---- PRESS, SOCIAL & SPONSORS -----------------------------------------
    {
        id: 'flame_clip',
        weight: 13,
        type: 'social',
        icon: '\u{1F525}',
        title: 'The Clip',
        text: 'Ninety seconds of you in champion select at three in the morning. Four hundred thousand views and a title with your name in capital letters.',
        when: c => hypeOf(c) >= 500 || gamesOf(c) >= 5,
        options: [
            {
                id: 'apology',
                label: 'Post an apology',
                desc: 'The short one. Not the long one.',
                apply: () => ({
                    text: 'Three sentences, no explanation of what he said first. The sponsor team stops calling and the replies are about sixty percent kind.',
                    effects: { followers: 2500, morale: -5, chemistry: 3 },
                }),
            },
            {
                id: 'lean',
                label: 'Lean into it',
                desc: 'Make it the joke before anyone else does.',
                apply: () => ({
                    text: 'You put it in your banner. It doubles overnight, your teammates find it much less funny than the internet does, and a brand manager makes a note.',
                    effects: { followers: 12000, morale: 4, chemistry: -6, flag: 'reputationRisk' },
                }),
            },
            {
                id: 'silence',
                label: 'Say nothing and let it die',
                desc: 'It takes about nine days.',
                apply: () => ({
                    text: 'It takes about nine days. You read every quote post of all nine of them.',
                    effects: { followers: 4000, morale: -3 },
                }),
            },
        ],
    },
    {
        id: 'chat_restriction',
        weight: 10,
        type: 'social',
        icon: '\u{1F6AB}',
        title: 'Chat Restricted',
        text: 'Twenty-five games. The client tells you about it in a small grey box every time you log in, and the box is somehow the worst part.',
        when: c => flagOf(c, 'reputationRisk'),
        options: [
            {
                id: 'serve',
                label: 'Serve it quietly',
                desc: 'Play the games. Say nothing.',
                apply: () => ({
                    text: 'Twenty-five games without typing. Somewhere around game twelve you notice you are watching the minimap more.',
                    effects: { mmr: -40, morale: -3, attr: { cmp: 1 }, unflag: 'reputationRisk' },
                }),
            },
            {
                id: 'mute',
                label: 'Turn chat off permanently',
                desc: 'Not a punishment. A setting.',
                apply: () => ({
                    text: 'All chat off, ally chat off, pings only. Your win rate goes up four points over the next hundred games and you never turn it back on.',
                    effects: { mmr: 60, morale: 2, attr: { cmp: 1 }, unflag: 'reputationRisk' },
                }),
            },
            {
                id: 'appeal',
                label: 'Appeal it',
                desc: 'You have read the logs. You think you are fine.',
                apply: () => (chance(0.3)
                    ? {
                        text: 'It gets lifted with a two-line email that explains nothing. You take the win.',
                        effects: { morale: 4, unflag: 'reputationRisk' },
                    }
                    : {
                        text: 'The reply quotes four of your own messages back to you. Reading them in a support ticket is a specific kind of experience.',
                        effects: { morale: -4 },
                    }),
            },
        ],
    },
    {
        id: 'viral_highlight',
        weight: 12,
        type: 'social',
        icon: '\u{2728}',
        title: 'The Highlight',
        text: 'One flash, one flank, four people dead and a caster losing his voice on the third syllable of your name. Number one clip on the site by lunchtime.',
        when: c => formOf(c) >= 62 && gamesOf(c) >= 10,
        options: [
            {
                id: 'ride',
                label: 'Post it everywhere',
                desc: 'Every platform, twice, with the caster audio.',
                apply: () => ({
                    text: 'It runs for four days. Your notifications are unusable and two of your teammates make the same joke about who set it up.',
                    effects: { followers: 14000, morale: 6, chemistry: -2 },
                }),
            },
            {
                id: 'credit',
                label: 'Credit the setup',
                desc: 'Name the two people who made it possible.',
                apply: () => ({
                    text: 'You post the twelve seconds before the clip instead, with the vision and the two flashes that bought it. The room sees that. So does the coach.',
                    effects: { followers: 6000, chemistry: 8, morale: 4, legacy: 1 },
                }),
            },
            {
                id: 'nothing',
                label: 'Say nothing',
                desc: 'Watch it once. Go back to the drills.',
                apply: () => ({
                    text: 'You watch it once, on mute, and then queue. It is still the best thing you have ever done in a game of League.',
                    effects: { followers: 4000, form: 3 },
                }),
            },
        ],
    },
    {
        id: 'sponsor_energy_drink',
        weight: 11,
        type: 'money',
        icon: '\u{1F964}',
        title: 'Brand Partnership',
        text: 'An energy drink you have never tasted wants three posts and a visible can on stream. The contract is four pages and one of them is about what you may not say.',
        // Signing a beverage endorsement personally, and paid in months of rent.
        when: c => agedAtLeast(c, 17) && hypeOf(c) >= 2000,
        options: [
            {
                id: 'sign',
                label: 'Sign it',
                desc: 'Read page three later.',
                apply: () => ({
                    text: 'It tastes like a melted sweet and pays for a month of rent. You keep an open can in frame for six weeks.',
                    effects: { gold: 900, followers: 1500, morale: -3 },
                }),
            },
            {
                id: 'negotiate',
                label: 'Negotiate',
                desc: 'Ask for more and fewer clauses.',
                apply: () => (chance(0.55)
                    ? {
                        text: 'They come back up twice and drop the exclusivity clause entirely. Asking took one email.',
                        effects: { gold: 1200, followers: 1200 },
                    }
                    : {
                        text: 'They go silent, then sign the mid laner on the team below you. Your agent describes this as "a learning".',
                        effects: { morale: -4 },
                    }),
            },
            {
                id: 'decline',
                label: 'Decline',
                desc: 'You have never once drunk one of these.',
                apply: () => ({
                    text: 'You say no, politely, and the same brand comes back in two years with a better number because you are the one who said no.',
                    effects: { morale: 6, legacy: 1 },
                }),
            },
        ],
    },
    {
        id: 'betting_sponsor',
        weight: 6,
        type: 'money',
        icon: '\u{1F3B0}',
        title: 'A Betting Company Calls',
        text: 'The offer is larger than your salary. The only requirement is your face on a billboard in a city you have never visited.',
        // Gambling advertising, and an offer measured against a salary. Neither
        // is legal or coherent for a minor, and neither works without a club.
        when: c => isSigned(c) && agedAtLeast(c, 18) && hypeOf(c) >= 20000,
        options: [
            {
                id: 'take',
                label: 'Take the money',
                desc: 'It is legal. It is a lot. It is legal.',
                apply: () => ({
                    text: 'You shoot it in an afternoon. The billboard is genuinely enormous and you never once send anyone a picture of it.',
                    effects: { gold: 1200, followers: 3000, morale: -4, flag: 'bettingDeal' },
                }),
            },
            {
                id: 'decline',
                label: 'Decline',
                desc: 'Two people you know had a bad year with these.',
                apply: () => ({
                    text: 'You say no without a speech about it. Somebody in the industry notices anyway and remembers it a long time.',
                    effects: { morale: 5, legacy: 2 },
                }),
            },
            {
                id: 'counter',
                label: 'Ask for their non-gambling arm',
                desc: 'Same money, different logo.',
                apply: () => (chance(0.5)
                    ? {
                        text: 'They actually have one, and it does streaming hardware. Half the money and none of the billboard.',
                        effects: { gold: 700, followers: 1500 },
                    }
                    : {
                        text: 'There is no non-gambling arm. There is only the arm. The call ends politely.',
                        effects: { morale: -2 },
                    }),
            },
        ],
    },
    {
        id: 'stream_exclusive',
        weight: 7,
        type: 'money',
        icon: '\u{1F3A5}',
        title: 'Exclusivity Offer',
        text: 'A platform offers two years exclusive. The money is real. The clause about competitive commitments is vague in a way that is not accidental.',
        // A two-year exclusivity contract signed in person, twenty hours a week.
        when: c => agedAtLeast(c, 18) && hypeOf(c) >= 15000,
        options: [
            {
                id: 'take',
                label: 'Take the deal',
                desc: 'Twenty hours a week, minimum.',
                apply: () => ({
                    text: 'The first cheque clears and the twenty hours a week start immediately. Your solo queue becomes content, which is not the same as practice.',
                    effects: { gold: 1100, followers: 6000, energy: -8, form: -3 },
                }),
            },
            {
                id: 'protect',
                label: 'Take it, but protect your schedule',
                desc: 'Half the hours for half the money.',
                apply: () => ({
                    text: 'Ten hours a week, none of them on scrim days, and a clause your agent wrote himself. Less money and you still get to be a player.',
                    effects: { gold: 600, followers: 3000, energy: -3 },
                }),
            },
            {
                id: 'decline',
                label: 'Decline and focus on the game',
                desc: 'There will be other offers. Probably.',
                apply: () => ({
                    text: 'You turn the camera off for a whole split. Nobody watching notices. Your last-hitting under pressure does.',
                    effects: { morale: -2, form: 5, attr: { mec: 1 } },
                }),
            },
        ],
    },
    {
        id: 'analyst_callout',
        weight: 11,
        type: 'drama',
        icon: '\u{1F5E3}',
        title: 'The Weak Link',
        text: 'On the desk at halftime, an analyst with a whiteboard explains, politely and at some length, that the problem with your team is you.',
        // An outcome that measures the quiet against how your head was at fifteen.
        when: c => isSigned(c) && agedAtLeast(c, 17) && formOf(c) <= 56,
        options: [
            {
                id: 'stage',
                label: 'Answer on stage',
                desc: 'The only reply that has ever worked.',
                apply: () => ({
                    text: 'You do not mention it once. You go 8/1 in the next game and the same analyst says your name four times in the post-match.',
                    effects: { form: 7, morale: -4, energy: -6 },
                }),
            },
            {
                id: 'reply',
                label: 'Reply to him online',
                desc: 'You have written it three times already.',
                apply: () => ({
                    text: 'The quote post does eleven times the numbers of the original segment. Your press officer calls before you have put the phone down.',
                    effects: { followers: 5000, morale: 3, chemistry: -5, form: -3 },
                }),
            },
            {
                id: 'mute',
                label: 'Stop reading',
                desc: 'Delete the app off the phone for a month.',
                apply: () => ({
                    text: 'A month without reading anything about yourself. It is the quietest your head has been since you were fifteen.',
                    effects: { morale: 5, form: 2, attr: { cmp: 1 } },
                }),
            },
        ],
    },
    {
        id: 'boost_accusation',
        weight: 8,
        type: 'drama',
        icon: '\u{1F575}',
        title: 'Account Sharing Allegations',
        text: 'A thread with six screenshots claims somebody else played your account during the climb. Two of the screenshots are of an entirely different player.',
        // One option publishes nine hours of the player's own webcam footage.
        when: c => agedAtLeast(c, 16) && mmrOf(c) >= 2400,
        options: [
            {
                id: 'proof',
                label: 'Post the VODs',
                desc: 'All of them. Timestamped. Boring.',
                apply: () => ({
                    text: 'Nine hours of unedited webcam-on gameplay. The thread deletes itself by the evening and the receipts follow you around usefully for years.',
                    effects: { followers: 3000, energy: -6, morale: 2 },
                }),
            },
            {
                id: 'handle',
                label: 'Let somebody else handle it',
                desc: 'This is what press officers are for.',
                apply: (c) => (isSigned(c)
                    ? {
                        text: 'The org posts a statement with the word "unequivocally" in it and you never have to think about it again.',
                        effects: { morale: 4, followers: 1200 },
                    }
                    : {
                        text: 'There is no press officer. There is you, at one in the morning, typing and deleting a reply eleven times.',
                        effects: { morale: -8, followers: 2500 },
                    }),
            },
            {
                id: 'ignore',
                label: 'Ignore it',
                desc: 'Feeding it is what it wants.',
                apply: () => ({
                    text: 'It burns for a fortnight and then it is somebody else. A version of it still comes up in your replies two years later.',
                    effects: { morale: -5, followers: 4000 },
                }),
            },
        ],
    },
    {
        id: 'fan_meet',
        weight: 10,
        type: 'social',
        icon: '\u{1F58A}',
        title: 'Meet And Greet',
        text: 'The org has booked two hours of signings in a shopping centre on a scrim day. Four hundred people have been queuing since eight in the morning.',
        // The payoff is an adult looking down at an eleven-year-old fan.
        when: c => isSigned(c) && agedAtLeast(c, 17) && hypeOf(c) >= 1000,
        options: [
            {
                id: 'full',
                label: 'Stay until the last person',
                desc: 'Five hours. Every single one of them.',
                apply: () => ({
                    text: 'The last kid in the queue is eleven and has your name on a school pencil case. You are three hours late to the block and you would do it again.',
                    effects: { followers: 5000, energy: -12, morale: 6, form: -2 },
                }),
            },
            {
                id: 'short',
                label: 'Do the two hours and leave',
                desc: 'What was booked. Nothing more.',
                apply: () => ({
                    text: 'You sign for two hours, smile properly in every photo, and are back in the practice room by four.',
                    effects: { followers: 2000, energy: -6 },
                }),
            },
            {
                id: 'skip',
                label: 'Skip it, scrims matter more',
                desc: 'The queue finds out at half nine.',
                apply: () => ({
                    text: 'The org covers for you and the queue works it out anyway. You win the block. There is a photo of the empty chair.',
                    effects: { followers: -1500, chemistry: 3, form: 4, morale: -3 },
                }),
            },
        ],
    },
    {
        id: 'documentary',
        weight: 6,
        type: 'social',
        icon: '\u{1F3AC}',
        title: 'Camera Crew',
        text: 'A documentary team wants the whole split: the practice room, the flights, the losses. Especially the losses. They say that twice.',
        when: c => isSigned(c) && hypeOf(c) >= 5000,
        options: [
            {
                id: 'full',
                label: 'Give them everything',
                desc: 'Including the room after game five.',
                apply: () => ({
                    text: 'They get the argument in the back room and they use it in the trailer. It is the best thing anyone has made about your scene and your jungler has not watched it.',
                    effects: { followers: 9000, chemistry: -5, energy: -8 },
                }),
            },
            {
                id: 'limited',
                label: 'Practice room only',
                desc: 'No hotels, no back room, no phones.',
                apply: () => ({
                    text: 'It is a slightly boring documentary about five people being quiet at computers, which is also the honest one.',
                    effects: { followers: 3500, chemistry: -1 },
                }),
            },
            {
                id: 'no',
                label: 'No cameras',
                desc: 'Not this split.',
                apply: () => ({
                    text: 'The room is noticeably lighter for the rest of the season. The film gets made about the team you beat in the semi-final.',
                    effects: { followers: -800, chemistry: 5, form: 3 },
                }),
            },
        ],
    },
    {
        id: 'charity_stream',
        weight: 9,
        type: 'social',
        icon: '\u{1F49A}',
        title: 'Charity Stream',
        text: 'Twelve hours, a marathon of the champions you are worst at, and a total on screen that chat will not allow to stop climbing.',
        // Measures the total raised against a monthly wage, in a scrim week.
        when: c => isSigned(c) && hypeOf(c) >= 3000,
        options: [
            {
                id: 'do',
                label: 'Do the twelve hours',
                desc: 'All of them, on stream, badly.',
                apply: () => ({
                    text: 'You lose nine games in a row on champions you have never played and raise more in an afternoon than you earn in a month.',
                    effects: { followers: 8000, energy: -14, morale: 5, form: -2, legacy: 1 },
                }),
            },
            {
                id: 'donate',
                label: 'Donate quietly instead',
                desc: 'No overlay, no total, no clip.',
                apply: () => ({
                    text: 'Nobody ever finds out, which was the idea, and it still counts for exactly as much.',
                    effects: { gold: -500, morale: 4, legacy: 1 },
                }),
            },
            {
                id: 'pass',
                label: 'Pass',
                desc: 'It is a scrim week and you are cooked.',
                apply: () => ({
                    text: 'You pass. It is the correct competitive decision and you think about it twice during the following week.',
                    effects: { energy: 4, morale: -2 },
                }),
            },
        ],
    },

    {
        id: 'old_post_resurfaces',
        weight: 10,
        type: 'social',
        icon: '\u{1F5C3}',
        title: 'Something You Wrote At Fourteen',
        text: 'An account you had forgotten owning has been found and read in full by strangers. There are four hundred posts on it and about six of them are the reason it is trending.',
        // The copy is explicit that this is old, so the player has to be old
        // enough for "years ago" to be true, and visible enough for anybody to
        // have gone looking through an archive.
        when: c => agedAtLeast(c, 17) && hypeOf(c) >= 4000,
        options: [
            {
                id: 'own',
                label: 'Address all six of them, by name',
                desc: 'No context, no explanation of the era.',
                apply: () => ({
                    text: 'Four paragraphs that quote your own posts back and do not once say the words "at the time". It is over in nine days instead of nine weeks.',
                    effects: { followers: 6000, morale: -6, chemistry: 4 },
                }),
            },
            {
                id: 'delete',
                label: 'Delete the account',
                desc: 'All four hundred, tonight.',
                apply: () => ({
                    text: 'It is gone by midnight and archived by four different people before you started. The deletion is now the story and it has an easier headline than the posts did.',
                    effects: { followers: 2500, morale: -4, form: -3 },
                }),
            },
            {
                id: 'ignore',
                label: 'Say nothing at all',
                desc: 'Give it nothing and see whether it eats.',
                apply: (c) => (hypeOf(c) >= 20000
                    ? {
                        text: 'It runs for a fortnight because you are big enough to be worth a fortnight. Your press officer stops sleeping and you play some of the best games of your split.',
                        effects: { followers: 8000, form: 4, morale: -7 },
                    }
                    : {
                        text: 'It dies on the Thursday because something louder happens to somebody bigger. Two people in your own building read all four hundred anyway.',
                        effects: { chemistry: -4, morale: -3 },
                    }),
            },
        ],
    },
    {
        id: 'merch_royalty',
        weight: 10,
        type: 'money',
        icon: '\u{1F455}',
        title: 'Your Name On The Back Of A Shirt',
        text: 'Marketing send a mock-up of a jersey with your name across the shoulders and ask you to approve it by Friday. Somewhere in your contract there is a line about what you get from one.',
        // A club shirt with your name on it needs a club and an audience that
        // would buy one.
        when: c => isSigned(c) && hypeOf(c) >= 3000,
        options: [
            {
                id: 'read',
                label: 'Go and read the clause first',
                desc: 'Find out what a shirt is actually worth.',
                apply: (c) => ((Number(PL(c).attrs?.knw) || 0) >= 65
                    ? {
                        text: 'It is a fraction of a percentage point and the fraction is negotiable, which nobody expected you to know. You get it moved and the approval takes an extra fortnight.',
                        effects: { gold: 800, chemistry: -4, energy: -4 },
                    }
                    : {
                        text: 'Eleven pages and a percentage with three zeroes in front of it. You sign it because the alternative is a fortnight of email about a shirt.',
                        effects: { gold: 150, morale: -4 },
                    }),
            },
            {
                id: 'design',
                label: 'Redraw the whole thing yourself',
                desc: 'The mock-up is bad and everybody knows it.',
                apply: () => ({
                    text: 'Three evenings with somebody in the design team who is delighted anybody cares. It sells out in a weekend and marketing take the credit in a post.',
                    effects: { gold: 450, followers: 5000, energy: -8 },
                }),
            },
            {
                id: 'approve',
                label: 'Approve it and think about the game',
                desc: 'It is a shirt. Friday is a game.',
                apply: () => ({
                    text: 'You reply with one word inside a minute and go back to the VOD you had paused. It is an ugly shirt and about four thousand people buy it anyway.',
                    effects: { gold: 250, form: 3, followers: 1500 },
                }),
            },
        ],
    },
    {
        id: 'fan_at_the_door',
        weight: 9,
        type: 'drama',
        icon: '\u{1F510}',
        title: 'Somebody Works Out Where You Live',
        text: 'There is a person on the step at nine in the morning with a poster and a marker, and they are entirely polite about it. Two days later there are three of them and one has a camera.',
        // Being found at home needs a home address worth finding, which means a
        // recognisable player rather than a good one - the same tier of
        // visibility agency_offer asks for.
        when: c => agedAtLeast(c, 17) && hypeOf(c) >= 8000,
        options: [
            {
                id: 'sign',
                label: 'Sign it and ask them not to come back',
                desc: 'Politely, on the step, in your dressing gown.',
                apply: () => ({
                    text: 'They are apologetic and delighted and they post the photograph within the hour. Four more people have the address by the weekend.',
                    effects: { followers: 6000, morale: -6, energy: -4 },
                }),
            },
            {
                id: 'move',
                label: 'Move flats',
                desc: 'Break the lease. Tell nobody the new one.',
                apply: (c) => (goldOf(c) >= 900
                    ? {
                        text: 'Two weeks of boxes in the middle of a split and a deposit you do not get back. The new place is quiet and you sleep properly in it from the first night.',
                        effects: { gold: -900, morale: 5, health: 5, form: -4 },
                    }
                    : {
                        text: 'You price the lease break twice and it is more than a month of what you make. You stay, and you start using the back entrance.',
                        effects: { morale: -8, health: -3 },
                    }),
            },
            {
                id: 'org',
                label: 'Make it the club\'s problem',
                desc: 'It happened because of their announcement post.',
                apply: () => ({
                    text: 'They take it seriously in a meeting and then handle it with a paragraph asking fans to respect privacy. It works about as well as a paragraph works.',
                    effects: { chemistry: 3, morale: -3, followers: 2000 },
                }),
            },
        ],
    },

    // ---- THE GAME ITSELF ---------------------------------------------------
    {
        id: 'patch_gutted',
        weight: 13,
        type: 'training',
        icon: '\u{1F4C9}',
        title: 'Patch Notes',
        text: 'The notes land at four in the morning and your signature pick loses forty units of range and a second and a half off the ultimate. The subreddit has already called it unplayable.',
        when: c => !!PL(c).champion,
        options: [
            {
                id: 'force',
                label: 'Force it anyway',
                desc: 'It is not the champion, it is the player.',
                apply: (c) => ({
                    text: `You first-pick ${championName(c)} into a matchup that no longer exists. It goes badly, then badly again, and on the third attempt distinctly less badly.`,
                    effects: { form: -6, morale: 4, attr: { mec: 1 } },
                }),
            },
            {
                id: 'learn',
                label: 'Learn something new',
                desc: 'Two hundred games on a pick you hate.',
                apply: () => ({
                    text: 'Three weeks of being noticeably worse at your job in public. You come out the other side with a second pick you can be trusted on.',
                    effects: { energy: -10, form: -2, attr: { chp: 2 } },
                }),
            },
            {
                id: 'draft',
                label: 'Ask to be drafted around',
                desc: 'Make it the draft board\'s problem.',
                apply: (c) => (isSigned(c)
                    ? {
                        text: 'The coach builds two comps that hide the nerf and one that ignores it. It works. The rest of the roster plays slightly worse champions all split so that you do not have to.',
                        effects: { form: 5, morale: 3, chemistry: -6 },
                    }
                    : {
                        text: 'You do not have a coach. You have a duo partner, and he mutes you thirty seconds into the explanation.',
                        effects: { morale: -3, form: -2 },
                    }),
            },
        ],
    },
    {
        id: 'meta_shift',
        weight: 12,
        type: 'training',
        icon: '\u{1F300}',
        title: 'The Meta Moved',
        text: 'Three patches of drift and your role is now expected to do something else entirely. Half the league adapted last week and did not tell you.',
        when: c => gamesOf(c) >= 10,
        options: [
            {
                id: 'rebuild',
                label: 'Rebuild your pool',
                desc: 'Learn the four picks everyone is on.',
                apply: () => ({
                    text: 'Four new champions in eleven days, none of them comfortable and all of them in the top five presence. You stop being drafted against.',
                    effects: { energy: -10, form: -3, attr: { chp: 2 } },
                }),
            },
            {
                id: 'study',
                label: 'Watch every pro game on the patch',
                desc: 'Forty games. Notes. Timestamps.',
                apply: () => ({
                    text: 'Forty games at 1.5 speed with a notes document nobody asked you to write. You know why it moved, which turns out to matter more than knowing that it did.',
                    effects: { energy: -8, attr: { knw: 2 } },
                }),
            },
            {
                id: 'wait',
                label: 'Wait for it to swing back',
                desc: 'It usually does. Usually.',
                apply: () => (chance(0.3)
                    ? {
                        text: 'It swings back inside two patches and you are the only person in the league who never stopped practising it.',
                        effects: { form: 6, morale: 4, energy: 4 },
                    }
                    : {
                        text: 'It does not swing back. It is still like this at the end of the year and you spend the whole split half a step behind.',
                        effects: { form: -6, morale: -3, energy: 6 },
                    }),
            },
        ],
    },
    {
        id: 'duo_partner',
        weight: 11,
        type: 'social',
        icon: '\u{1F91D}',
        title: 'An Old Duo',
        text: 'The friend you climbed with at fourteen is online for the first time in a year. He is two divisions below where he used to be and he wants to queue.',
        // "The friend you climbed with at fourteen", who has since had a year off.
        when: c => agedAtLeast(c, 16) && (Number(c?.soloq?.games) || 0) >= 20,
        options: [
            {
                id: 'queue',
                label: 'Queue with him',
                desc: 'Six games. You will lose most of them.',
                apply: () => ({
                    text: 'You lose four of six and laugh more than you have all month. He tells you that you have got miserable, and he is not entirely wrong.',
                    effects: { mmr: -60, morale: 8, energy: -8 },
                }),
            },
            {
                id: 'alone',
                label: 'Politely climb alone',
                desc: 'You have a rank to hold.',
                apply: () => ({
                    text: 'You say you have a block in the morning, which is true, and you play until four anyway, which is the part that sits badly.',
                    effects: { mmr: 70, morale: -4 },
                }),
            },
            {
                id: 'coach',
                label: 'Review his games instead',
                desc: 'A whole evening on somebody else\'s VODs.',
                apply: () => ({
                    text: 'Explaining why he keeps dying on the third wave forces you to say out loud something you had only ever done by feel.',
                    effects: { energy: -8, morale: 4, attr: { ldr: 1, knw: 1 } },
                }),
            },
        ],
    },
    {
        id: 'bootcamp_offer',
        weight: 8,
        type: 'training',
        icon: '\u{2708}',
        title: 'Bootcamp Offer',
        text: 'Two weeks in a room in Seoul containing five computers and a rice cooker. The org will pay for the flights but not for what the fortnight costs you.',
        // Options that live away from family and rent a room abroad unsupervised.
        when: c => isSigned(c) && agedAtLeast(c, 17) && offSeason(c),
        options: [
            {
                id: 'go',
                label: 'Go',
                desc: 'Fourteen days of the hardest ladder there is.',
                apply: () => ({
                    text: 'Ninety games against people who do not know your name and do not care. You lose most of the first week and almost none of the second.',
                    effects: { energy: -16, morale: -4, mmr: 120, attr: { lne: 1, cmp: 1 } },
                }),
            },
            {
                id: 'stay',
                label: 'Stay home and rest',
                desc: 'It has been forty weeks.',
                apply: () => ({
                    text: 'You sleep for three days and then see people you are related to. You come back to preseason a step behind and a person again.',
                    effects: { energy: 18, morale: 8, form: -3 },
                }),
            },
            {
                id: 'solo',
                label: 'Go alone, on your own money',
                desc: 'No org, no schedule, no excuses.',
                apply: (c) => (c.money.gold >= 700
                    ? {
                        text: 'A PC bang, a room above it, and nobody checking whether you got up. You come home with hands nobody in your league has.',
                        effects: { gold: -700, energy: -14, legacy: 1, attr: { mec: 1, lne: 1 } },
                    }
                    : {
                        text: 'You price the flights, look at your balance twice, and close the tab. Preseason starts in nine days regardless.',
                        effects: { morale: -4 },
                    }),
            },
        ],
    },
    {
        id: 'hardware_failure',
        weight: 10,
        type: 'money',
        icon: '\u{1F5A5}',
        title: 'Blue Screen',
        text: 'Your rig dies eleven minutes into a scrim and refuses to come back. The spare machine in the building has a monitor from 2019 on it.',
        // A scrim, a building and a spare machine: all three need a club.
        when: c => isSigned(c),
        options: [
            {
                id: 'buy',
                label: 'Buy a new one today',
                desc: 'Same day, whatever it costs.',
                apply: (c) => (c.money.gold >= 650
                    ? {
                        text: 'Built by the evening, everything restored by midnight. Expensive, and you never think about it again.',
                        effects: { gold: -650, energy: -4, form: 3 },
                    }
                    : {
                        text: 'You cannot cover it this week. Three days on a borrowed laptop and everything feels half a frame late.',
                        effects: { form: -6, morale: -4 },
                    }),
            },
            {
                id: 'spare',
                label: 'Use the spare',
                desc: 'Sixty hertz. For a fortnight.',
                apply: () => ({
                    text: 'A fortnight of playing on something that feels like a different game. You learn to win on inputs you cannot trust, which is not nothing.',
                    effects: { form: -5, morale: -3, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'warranty',
                label: 'Fight the warranty',
                desc: 'Nine days of emails and a courier.',
                apply: () => ({
                    text: 'Nine days, four support agents and one genuinely helpful person on the phone. They pay out. You lose the nine days.',
                    effects: { gold: 250, energy: -6, form: -3 },
                }),
            },
        ],
    },
    {
        id: 'crowd_boo',
        weight: 9,
        type: 'drama',
        icon: '\u{1F3DF}',
        title: 'Booed Off',
        text: 'Eight thousand people watched you flash into a wall on a screen the size of a building. The walk from the stage to the back is forty metres and none of it is quiet.',
        when: c => isSigned(c) && onBigStage(c),
        options: [
            {
                id: 'press',
                label: 'Face the press anyway',
                desc: 'Nobody would blame you for skipping.',
                apply: () => ({
                    text: 'You sit down, you say it was your mistake, and you do not blink. The clip of that answer outlives the clip of the flash.',
                    effects: { morale: -4, followers: 3000, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'backroom',
                label: 'Go straight to the back',
                desc: 'Headphones on, eyes down.',
                apply: () => ({
                    text: 'You sit in a corridor for forty minutes with your hood up. Nobody comes and finds you, which you notice.',
                    effects: { morale: -2, form: -3, chemistry: -2 },
                }),
            },
            {
                id: 'draft',
                label: 'Point at the draft',
                desc: 'It was not a good draft. It was also not the reason.',
                apply: () => ({
                    text: 'You say the comp gave you no options, on camera, twenty minutes after the game. The coach hears it before you get back to the hotel.',
                    effects: { morale: 5, chemistry: -9, followers: 1500 },
                }),
            },
        ],
    },
    {
        id: 'allpro_snub',
        weight: 7,
        type: 'award',
        icon: '\u{1F3C5}',
        title: 'All-Pro Snub',
        text: 'The voted teams go up on the broadcast and you are on the third one, behind a player whose entire split you could recite from memory.',
        when: c => isSigned(c) && gamesOf(c) >= 30,
        options: [
            {
                id: 'pin',
                label: 'Screenshot it and pin it',
                desc: 'Leave it up all year.',
                apply: () => ({
                    text: 'It stays pinned for eleven months. You are noticeably, measurably better in the second half of the season and everyone knows why.',
                    effects: { form: 8, morale: -3, followers: 2000 },
                }),
            },
            {
                id: 'gracious',
                label: 'Congratulate him publicly',
                desc: 'And mean it, mostly.',
                apply: () => ({
                    text: 'You post something genuinely warm about a player you would like to beat. He replies. It reads well and it costs you nothing.',
                    effects: { morale: 4, chemistry: 2, followers: 900, legacy: 1 },
                }),
            },
            {
                id: 'shrug',
                label: 'It is a popularity contest',
                desc: 'Say it once and drop it.',
                apply: () => ({
                    text: 'You say it to two people and it stays there. It does not stop being annoying at four in the morning.',
                    effects: { morale: -2, form: 2 },
                }),
            },
        ],
    },
    {
        id: 'stage_nerves',
        weight: 8,
        type: 'system',
        icon: '\u{1F630}',
        title: 'The Night Before',
        text: 'Quarter-final tomorrow. It is half three in the morning, you have been lying still for four hours, and your heart rate is telling you something the room is not.',
        when: c => isSigned(c) && onBigStage(c),
        options: [
            {
                id: 'psych',
                label: 'Wake the sports psychologist',
                desc: 'That is literally why she travels.',
                apply: () => ({
                    text: 'Forty minutes in a hotel corridor doing breathing exercises you had privately decided were nonsense. You sleep from four until nine.',
                    effects: { energy: 6, morale: 5, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'review',
                label: 'Get up and review them again',
                desc: 'Third time through their bans.',
                apply: () => ({
                    text: 'You find one thing at five in the morning that is genuinely useful and pay for it with the last two hours of sleep.',
                    effects: { energy: -10, form: 4, attr: { knw: 1 } },
                }),
            },
            {
                id: 'lie',
                label: 'Lie there and wait for it',
                desc: 'It always passes eventually.',
                apply: () => ({
                    text: 'It passes at about six. You play the game on ninety minutes of sleep and the first twenty minutes are somebody else playing.',
                    effects: { energy: -8, form: -4, morale: -2 },
                }),
            },
        ],
    },

    {
        id: 'champion_rework',
        weight: 10,
        type: 'training',
        icon: '\u{1F528}',
        title: 'They Reworked It',
        text: 'Your signature pick keeps its name, its splash art and nothing else. What is on the test server is not the champion you have played four thousand games of.',
        when: c => !!PL(c).champion,
        options: [
            {
                id: 'relearn',
                label: 'Relearn it from nothing',
                desc: 'Two weeks in the practice tool. Again.',
                apply: (c) => ({
                    text: `Nine days on the test server before it goes live, most of them spent unlearning a combo your hands do without asking. You are the first person in the region who can play the new ${championName(c)}.`,
                    effects: { energy: -14, form: -3, attr: { mec: 1, chp: 1 } },
                }),
            },
            {
                id: 'abandon',
                label: 'Let it go',
                desc: 'It was a champion. There are others.',
                apply: (c) => ({
                    text: `You do not play ${championName(c)} again for a year. It is the correct decision and there is a fortnight in there where you are noticeably worse at your job.`,
                    effects: { form: -5, morale: -6, attr: { chp: 1 } },
                }),
            },
            {
                id: 'complain',
                label: 'Say what you think about it publicly',
                desc: 'You have played it more than they have.',
                apply: () => ({
                    text: 'Six hundred words, all of them specific, none of them rude. A designer replies to two of the six points and it changes exactly nothing in the patch.',
                    effects: { followers: 6000, morale: 4, energy: -6 },
                }),
            },
        ],
    },
    {
        id: 'ping_route',
        weight: 9,
        type: 'system',
        icon: '\u{1F4F6}',
        title: 'The Route Changed',
        text: 'The ladder has gone from forty milliseconds to ninety overnight and stayed there. Everything you do now lands slightly after the moment you decided to do it.',
        // A ping change is only a change to somebody with a baseline: enough
        // ladder games to know what the client normally feels like.
        when: c => (Number(c?.soloq?.games) || 0) >= 15,
        options: [
            {
                id: 'adapt',
                label: 'Play through it and adjust',
                desc: 'Learn to press everything earlier.',
                apply: () => ({
                    text: 'Three weeks of pressing everything a frame early, and then the route changes back and you are pressing everything a frame early. It takes another week to undo.',
                    effects: { form: -4, mmr: -70, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'fix',
                label: 'Pay for a routed connection',
                desc: 'There are companies that sell exactly this.',
                apply: (c) => (goldOf(c) >= 300
                    ? {
                        text: 'Forty-four milliseconds by the Wednesday and a monthly cost you will forget you are paying. Nobody who has not had this problem understands why it mattered.',
                        effects: { gold: -300, form: 4, morale: 4 },
                    }
                    : {
                        text: 'You read three pages about it, price it, and close the tab. Ninety milliseconds is not unplayable, it is just permanently slightly wrong.',
                        effects: { morale: -5, form: -3 },
                    }),
            },
            {
                id: 'stop',
                label: 'Stop laddering until it is fixed',
                desc: 'Play something else. Watch VODs.',
                apply: () => ({
                    text: 'Eleven days off the ladder with the client open on somebody else\'s games. Your rating does not move and neither does anything else.',
                    effects: { energy: 10, mmr: -40, morale: -3, attr: { knw: 1 } },
                }),
            },
        ],
    },
    {
        id: 'found_the_hole',
        weight: 10,
        type: 'training',
        icon: '\u{1F50E}',
        title: 'You Find Something In Their VODs',
        text: 'Four hours into somebody else\'s replays you notice the same rotation at the same minute in six games running. Nobody on any desk has said it out loud.',
        // Studying an upcoming opponent needs a fixture list to be studying for,
        // and a professional body of games to have a reference for what is odd.
        when: c => isSigned(c) && inSplit(c) && gamesOf(c) >= 15,
        options: [
            {
                id: 'share',
                label: 'Put it in the team document',
                desc: 'With the timestamps. All six.',
                apply: () => ({
                    text: 'The coach builds most of a game plan around it and it works twice before they patch their own habit. Everybody in the room knows where it came from.',
                    effects: { chemistry: 8, form: 5, morale: 4, energy: -6 },
                }),
            },
            {
                id: 'keep',
                label: 'Keep it for your own lane',
                desc: 'One player who knows is enough.',
                apply: () => ({
                    text: 'You are up forty in the matchup twice in three weeks and nobody quite works out how. It stops working the moment somebody else in the league notices it too.',
                    effects: { form: 7, chemistry: -4, attr: { map: 1 } },
                }),
            },
            {
                id: 'more',
                label: 'Go looking for the next one',
                desc: 'Another four hours. Then another four.',
                apply: () => ({
                    text: 'Twelve more hours of replays across the week and you find one more thing worth half of what the first one was worth. You are wrecked by Friday.',
                    effects: { energy: -16, attr: { knw: 2 }, form: -2 },
                }),
            },
        ],
    },

    // ---- BODY, HOME, HEAD --------------------------------------------------
    {
        id: 'no_sleep',
        weight: 12,
        type: 'drama',
        icon: '\u{1F634}',
        title: 'Nine Days',
        text: 'You have not slept properly in nine days. The block ends at two, the solo queue ends when you stop, and lately you have stopped noticing that you do not stop.',
        // The unsigned branch books and pays for a private appointment alone.
        when: c => agedAtLeast(c, 16) && (energyOf(c) <= 38 || healthOf(c) <= 55),
        options: [
            {
                id: 'doctor',
                label: 'See a doctor',
                desc: 'Say the nine days out loud to somebody.',
                apply: (c) => (isSigned(c)
                    ? {
                        text: 'The team doctor takes it seriously enough to email the coach the same evening. Your hours get capped for a fortnight and you hate how much it helps.',
                        effects: { health: 10, energy: 12, form: -3 },
                    }
                    : {
                        text: 'A private appointment you pay for yourself, and a very short conversation about the phrase "sixteen hours a day".',
                        effects: { gold: -180, health: 8, energy: 10, form: -2 },
                    }),
            },
            {
                id: 'schedule',
                label: 'Force a sleep schedule',
                desc: 'Client off at midnight. Every night.',
                apply: () => ({
                    text: 'Four days of lying awake at eleven, then it takes. The last game of the night was always the worst one anyway.',
                    effects: { energy: 10, health: 6, morale: -3, form: -2 },
                }),
            },
            {
                id: 'push',
                label: 'Push through it',
                desc: 'You are winning. Do not touch anything.',
                apply: () => ({
                    text: 'You win four in a row on nothing at all and then lose your hands for most of a week. Both halves of that were the same decision.',
                    effects: { form: 6, energy: -6, health: -9, attr: { cmp: 1 } },
                }),
            },
        ],
    },
    {
        id: 'wrist_warning',
        weight: 10,
        type: 'system',
        icon: '\u{1F91A}',
        title: 'Physio Flags Your Wrist',
        text: 'The physio holds your forearm, presses somewhere very specific, and watches your face rather than your arm. "How long has that been there?"',
        // There is no club physio holding your forearm without a club.
        when: c => isSigned(c) && healthOf(c) <= 80,
        options: [
            {
                id: 'rest',
                label: 'A week off the mouse',
                desc: 'No solo queue. No scrims. Nothing.',
                apply: () => ({
                    text: 'Seven days of watching other people play your role. You come back a step slow and with a wrist that stops being a countdown.',
                    effects: { health: 12, energy: 10, form: -6 },
                }),
            },
            {
                id: 'brace',
                label: 'Wear the brace and keep playing',
                desc: 'It changes how the mouse feels.',
                apply: () => ({
                    text: 'The brace works and it moves your grip by about four millimetres. Four millimetres turns out to be a lot.',
                    effects: { health: 4, form: -2, attr: { mec: -1 } },
                }),
            },
            {
                id: 'ignore',
                label: 'Ignore him',
                desc: 'It has been there for a year already.',
                apply: () => ({
                    text: 'You play the split you wanted to play. In February you cannot open a door with that hand for two days.',
                    effects: { health: -9, form: 3 },
                }),
            },
        ],
    },
    {
        id: 'parents_school',
        weight: 13,
        type: 'system',
        icon: '\u{1F393}',
        title: 'A Conversation At The Kitchen Table',
        text: 'Your parents have printed your attendance record and put it on the table between you. Nobody in this house has ever met a professional gamer.',
        when: c => PL(c).path === 'precomp' && ageOf(c) <= 16 && !isSigned(c),
        options: [
            {
                id: 'promise',
                label: 'Promise to keep the grades up',
                desc: 'And actually do it, which costs hours.',
                apply: () => ({
                    text: 'Two hours of homework before you are allowed to log in, every day, checked. You lose the hours and they stop standing in the doorway.',
                    effects: { energy: -10, morale: 3, attr: { knw: 1 } },
                }),
            },
            {
                id: 'ladder',
                label: 'Show them the ladder',
                desc: 'Open the client. Explain what the number is.',
                apply: (c) => (mmrOf(c) >= 2400
                    ? {
                        text: 'Your father asks how many people play this game. You tell him. He asks where you are on the list, and then he sits down.',
                        effects: { morale: 8, energy: 4 },
                    }
                    : {
                        text: 'They look at a number they have no way of understanding and then at each other. The conversation ends with the word "hobby".',
                        effects: { morale: -6 },
                    }),
            },
            {
                id: 'sneak',
                label: 'Play anyway, sneak the hours',
                desc: 'One in the morning to five.',
                apply: () => ({
                    text: 'Four hours a night with the brightness at minimum and the volume off. You climb. You are asleep in double maths for a term.',
                    effects: { energy: -6, morale: -4, mmr: 90, attr: { mec: 1 } },
                }),
            },
        ],
    },
    {
        id: 'family_call',
        weight: 9,
        type: 'system',
        icon: '\u{1F4DE}',
        title: 'A Call From Home',
        text: 'Your mother is doing the thing on the phone where she is trying not to worry you, which is exactly how you know.',
        // Flying home, telling the coach, and a building nobody in it knows.
        when: c => isSigned(c) && agedAtLeast(c, 17),
        options: [
            {
                id: 'fly',
                label: 'Fly home for the week',
                desc: 'Tell the coach after you have booked it.',
                apply: () => ({
                    text: 'Six days at home in the middle of a split. It is the correct decision and it costs you most of your form and the flights.',
                    effects: { gold: -400, morale: 10, energy: 6, form: -8, chemistry: -3 },
                }),
            },
            {
                id: 'call',
                label: 'Call every night after scrims',
                desc: 'Half an hour, every night, no exceptions.',
                apply: () => ({
                    text: 'Half an hour at midnight, every night for a month. She stops managing what she tells you, which is the thing you actually wanted.',
                    effects: { morale: 3, energy: -6 },
                }),
            },
            {
                id: 'bury',
                label: 'Say nothing to anybody',
                desc: 'Play the games. It is fine.',
                apply: () => ({
                    text: 'Nobody in the building knows. You play seven games that week and you play them exactly the same as always, which is its own skill and its own problem.',
                    effects: { morale: -9, form: -3, attr: { cmp: 1 } },
                }),
            },
        ],
    },
    {
        id: 'quit_thought',
        weight: 10,
        type: 'drama',
        icon: '\u{1F573}',
        title: 'You Think About Quitting',
        text: 'Not dramatically. Just a quiet twenty minutes at four in the morning working out what you would do instead, and it is not nothing.',
        // "For the first time since you were twelve" needs a gap worth naming.
        when: c => agedAtLeast(c, 16) && moraleOf(c) <= 34,
        options: [
            {
                id: 'psych',
                label: 'Talk to somebody',
                desc: 'A professional, not the group chat.',
                apply: (c) => (isSigned(c)
                    ? {
                        text: 'An hour a week with the club psychologist, which you had assumed was for other people. It is not a fix. It is a floor.',
                        effects: { morale: 12, energy: 4 },
                    }
                    : {
                        text: 'You pay for it yourself out of stream tips. It is an hour a week where you say things you have not said anywhere.',
                        effects: { gold: -300, morale: 10, energy: 4 },
                    }),
            },
            {
                id: 'week',
                label: 'Take a week completely off',
                desc: 'No client. No Discord. Nothing.',
                apply: () => ({
                    text: 'Seven days without opening the game for the first time since you were twelve. On day five you want to play again, which is the point.',
                    effects: { morale: 9, energy: 18, form: -7 },
                }),
            },
            {
                id: 'keep',
                label: 'Say nothing and keep going',
                desc: 'It has passed before.',
                apply: () => ({
                    text: 'It passes in about ten days. Something in the way you play game five of a series is different afterwards, and better.',
                    effects: { morale: -3, form: 3, attr: { cmp: 2 } },
                }),
            },
        ],
    },
    {
        id: 'visa_paperwork',
        weight: 7,
        type: 'system',
        icon: '\u{1F6C2}',
        title: 'Paperwork',
        text: 'Your visa appointment is on a Tuesday, in a building four hours away, and the alternative is missing the first fortnight of the split.',
        // A work visa needs legal working age, and a minor needs a guardian there.
        when: c => isSigned(c) && agedAtLeast(c, 18),
        options: [
            {
                id: 'queue',
                label: 'Go and sit in the queue',
                desc: 'Eight hours of a day you do not have.',
                apply: () => ({
                    text: 'Four hours there, three hours in a plastic chair, four hours back, and a stamp. Everyone else scrimmed.',
                    effects: { energy: -10, form: -2, morale: -2 },
                }),
            },
            {
                id: 'fixer',
                label: 'Pay somebody to expedite it',
                desc: 'They exist. They are not cheap.',
                apply: (c) => (c.money.gold >= 450
                    ? {
                        text: 'A courier, a form you did not have to read, and it is done inside a week. Money genuinely solved this one.',
                        effects: { gold: -450, energy: -2 },
                    }
                    : {
                        text: 'You cannot cover the fee this month. Tuesday it is.',
                        effects: { energy: -10, morale: -3, form: -2 },
                    }),
            },
            {
                id: 'delay',
                label: 'Push it to the offseason',
                desc: 'It will be someone else\'s problem by then.',
                apply: () => ({
                    text: 'It is not someone else\'s problem. It is the same problem in November with a deadline attached to it.',
                    effects: { form: -4, morale: -5, flag: 'visaTrouble' },
                }),
            },
        ],
    },
    {
        id: 'retirement_question',
        weight: 8,
        type: 'system',
        icon: '\u{23F3}',
        title: 'How Long Have You Got Left?',
        text: 'Somebody asks it as the last question of a long interview, in the polite voice people use for it. You are the oldest player on your roster by four years.',
        // "The oldest player on your roster" needs a roster to be oldest on.
        when: c => isSigned(c) && agedAtLeast(c, 26),
        options: [
            {
                id: 'years',
                label: '"Years."',
                desc: 'Say it flatly and let it sit.',
                apply: () => ({
                    text: 'One word, no smile. It is the clip of the week and you spend the next split having to be right about it.',
                    effects: { followers: 4000, form: 5, morale: 3 },
                }),
            },
            {
                id: 'honest',
                label: 'Answer honestly',
                desc: 'Say the thing you actually think.',
                apply: () => ({
                    text: 'You say you do not know, and that you will stop when you stop being useful. Three younger players quote it for the rest of their careers.',
                    effects: { morale: -3, legacy: 2, followers: 1500 },
                }),
            },
            {
                id: 'coach',
                label: 'Talk about coaching',
                desc: 'Say the word out loud for the first time.',
                apply: () => ({
                    text: 'You mention it once, half as a joke. Two organisations write it down properly and one of them calls in eighteen months.',
                    effects: { morale: 2, legacy: 1, attr: { ldr: 1 }, flag: 'coachingInterest' },
                }),
            },
        ],
    },
    {
        id: 'soloq_slump',
        weight: 11,
        type: 'match',
        icon: '\u{1F4C9}',
        title: 'Eleven Losses',
        text: 'Eleven in a row on the ladder. Two of them were genuinely nothing to do with you, which somehow makes the other nine worse.',
        when: c => (Number(c?.soloq?.games) || 0) >= 40 && formOf(c) <= 60,
        options: [
            {
                id: 'stop',
                label: 'Stop for the night',
                desc: 'The oldest advice there is.',
                apply: () => ({
                    text: 'You close the client at eleven for once. The next day you win six of eight and are furious about how simple that was.',
                    effects: { energy: 8, morale: 4, mmr: 40 },
                }),
            },
            {
                id: 'onemore',
                label: 'One more game',
                desc: 'It has never once been one more game.',
                apply: () => (chance(0.35)
                    ? {
                        text: 'You win it, and the two after it, and go to bed at five feeling like a genius. It works about a third of the time.',
                        effects: { mmr: 70, morale: 5, energy: -10 },
                    }
                    : {
                        text: 'Four more. All losses. You are down a division and it is light outside.',
                        effects: { mmr: -90, morale: -8, energy: -12 },
                    }),
            },
            {
                id: 'review',
                label: 'Review the eleven',
                desc: 'Watch your own losses. All of them.',
                apply: () => ({
                    text: 'Nine of the eleven have the same death in them at roughly the same minute. Seeing it nine times is the only thing that has ever fixed it.',
                    effects: { energy: -6, morale: -2, attr: { map: 1 } },
                }),
            },
        ],
    },
    {
        id: 'benched_notice',
        weight: 9,
        type: 'drama',
        icon: '\u{1FA91}',
        title: 'You Are Not In The Lineup',
        text: 'The lineup goes up in the team channel on Thursday morning and your name is in the second row of it. Nobody told you first.',
        when: c => isSigned(c) && ['sub', 'benched', 'rotation'].includes(PL(c).status) && inSplit(c),
        options: [
            {
                id: 'demand',
                label: 'Demand a conversation',
                desc: 'Today. Not after the weekend.',
                apply: () => ({
                    text: 'You get twenty minutes and a list of three specific things. It is the most useful conversation of your season and you do not enjoy any of it.',
                    effects: { morale: -4, chemistry: -3, form: 5, attr: { knw: 1 } },
                }),
            },
            {
                id: 'work',
                label: 'Be the best sub they have ever had',
                desc: 'Prep the other lineup. Every week.',
                apply: () => ({
                    text: 'You do the opposition prep nobody wanted to do and you do it well enough that the coach starts asking you for it directly.',
                    effects: { chemistry: 8, morale: -2, attr: { knw: 1 } },
                }),
            },
            {
                id: 'checkout',
                label: 'Check out',
                desc: 'Turn up. Do the minimum. Wait for November.',
                apply: () => ({
                    text: 'Nine weeks of turning up and playing solo queue in the back room. Everybody in the building can tell, including the people writing next year\'s roster.',
                    effects: { morale: -6, chemistry: -9, form: -5 },
                }),
            },
        ],
    },

    {
        id: 'back_pain',
        weight: 11,
        type: 'system',
        icon: '\u{1F9B4}',
        title: 'Your Back Goes',
        text: 'You stand up after a nine-hour day and something low in your back does not come up with you. It happens again on the Tuesday, getting out of a car.',
        // A body that has already taken something, and old enough that a decade
        // at a desk is behind it rather than in front of it. The health line
        // sits just above wrist_warning's 80 on purpose: a back goes before a
        // wrist does and this one fires without a club physio to catch it.
        when: c => agedAtLeast(c, 18) && (healthOf(c) <= 82 || energyOf(c) <= 50),
        options: [
            {
                id: 'physio',
                label: 'Go and get it looked at properly',
                desc: 'Scans, a programme, and a schedule.',
                apply: (c) => (isSigned(c)
                    ? {
                        text: 'Forty minutes with somebody who does this for a living and a sheet of six exercises. Four of the six are boring and all six work.',
                        effects: { health: 11, energy: 6, form: -3 },
                    }
                    : {
                        text: 'You pay for it yourself and it is more than a month of what you make streaming. The exercises are free and you do them for about three weeks.',
                        effects: { gold: -260, health: 8, energy: 4 },
                    }),
            },
            {
                id: 'desk',
                label: 'Rebuild the whole setup',
                desc: 'Chair, desk height, monitor arm.',
                apply: (c) => (goldOf(c) >= 500
                    ? {
                        text: 'A chair that costs more than your first computer and a desk that goes up. Two weeks of it feeling wrong and then you stop noticing your back at all.',
                        effects: { gold: -500, health: 8, form: 3 },
                    }
                    : {
                        text: 'You put two books under the monitor and move the chair up one notch. It is genuinely better and it is not a fix.',
                        effects: { health: 3, morale: -3 },
                    }),
            },
            {
                id: 'ignore',
                label: 'Sit differently and carry on',
                desc: 'It has been fine for six years.',
                apply: () => ({
                    text: 'You find a position that does not hurt and play in it for four months. It is a bad position and by February your neck has joined in.',
                    effects: { health: -9, form: 3, energy: -4 },
                }),
            },
        ],
    },
    {
        id: 'eye_strain',
        weight: 10,
        type: 'system',
        icon: '\u{1F453}',
        title: 'The Headaches Start At Six',
        text: 'Every day for a fortnight, at about the sixth hour, the screen begins to have an edge on it. You have never once had your eyes tested.',
        // Old enough to book an appointment and to have been playing long enough
        // for a sixth hour to be a normal day.
        when: c => agedAtLeast(c, 15),
        options: [
            {
                id: 'test',
                label: 'Get them tested',
                desc: 'An hour, and possibly glasses.',
                apply: () => ({
                    text: 'A very small prescription and a pair of glasses you resent for about nine days. The headaches stop and your last two hours a day come back.',
                    effects: { gold: -220, energy: 9, health: 5, morale: -2 },
                }),
            },
            {
                id: 'breaks',
                label: 'Take a break every hour',
                desc: 'A timer. Stand up. Look at something far away.',
                apply: () => ({
                    text: 'Ten minutes an hour, which over a fourteen-hour day is more than two hours of not playing. The headaches halve and so does the volume of games.',
                    effects: { health: 7, energy: 6, mmr: -70 },
                }),
            },
            {
                id: 'squint',
                label: 'Turn the brightness down and carry on',
                desc: 'It is a screen. Everyone has this.',
                apply: () => ({
                    text: 'The room gets darker over about a month until you are playing in the dark at four in the afternoon. The headaches get earlier rather than smaller.',
                    effects: { health: -6, energy: -6, morale: -3 },
                }),
            },
        ],
    },
    {
        id: 'wedding_clash',
        weight: 9,
        type: 'social',
        icon: '\u{1F48D}',
        title: 'You Said Yes In February',
        text: 'A wedding you promised to be at is on the same Saturday as a game. You said yes to it in February, when the schedule was still a rumour and the date was a joke.',
        // A wedding you were invited to as an adult, and a fixture list that
        // actually has games on it to clash with.
        when: c => isSigned(c) && agedAtLeast(c, 19) && inSplit(c),
        options: [
            {
                id: 'go',
                label: 'Go to the wedding',
                desc: 'Tell the coach on Monday, not Friday.',
                apply: () => ({
                    text: 'You watch the second half of your own game on a phone in a car park in a suit. Your substitute plays fine. Everybody at the table is delighted you came.',
                    effects: { morale: 10, form: -7, chemistry: -6 },
                }),
            },
            {
                id: 'game',
                label: 'Play the game',
                desc: 'Send something expensive and a long message.',
                apply: () => ({
                    text: 'You win it. The message you send at one in the morning is honest and long, and there is a photograph you are not in that goes up the next day.',
                    effects: { form: 4, morale: -8, chemistry: 3 },
                }),
            },
            {
                id: 'both',
                label: 'Do the ceremony and drive back',
                desc: 'Four hours of car on a game day.',
                apply: () => ({
                    text: 'You are at the church at eleven and in the booth at six with a shirt collar still in your bag. You play the worst game of your month and you were at both.',
                    effects: { morale: 4, energy: -12, form: -4, health: -3 },
                }),
            },
        ],
    },

    // ---- LANGUAGE, MOVING AND HOMESICKNESS ---------------------------------
    //  The circuit is six regions and three of them work in English, so a move
    //  is sometimes only a flight and sometimes two years of study. Everything
    //  below reads player.contract.region (where you WORK) against player.region
    //  (where you are FROM) and the level in the language that league actually
    //  runs on - never a proxy. "You cannot follow the review" is a lie to a
    //  player who grew up speaking it, and abroad(c) is what stops it being told.
    {
        id: 'arrival_week',
        weight: 12,
        type: 'system',
        icon: '\u{1F6EB}',
        title: 'The First Fortnight',
        text: 'A flat with somebody else\'s furniture in it, a supermarket where you photograph the labels to read them later, and a bus with a destination on the front you cannot make out.',
        // Living somewhere you are not from, in a league whose working language
        // you are still short of. Both halves have to be read directly: a player
        // who moved LEC to LCS is abroad and has nothing to learn.
        when: c => abroad(c) && workLangLevel(c) < LANGUAGE_FLUENT,
        options: [
            {
                id: 'tutor',
                label: 'Book a tutor for the fortnight',
                desc: 'Two hours a day before the block.',
                apply: (c) => ({
                    text: 'Ten mornings of a patient woman correcting the same four sounds. By the second week you can order food and read a bus, which is more than most imports manage in a season.',
                    effects: { gold: -240, energy: -8, language: { [workLang(c)]: 5 } },
                }),
            },
            {
                id: 'teammate',
                label: 'Lean on the teammate who speaks both',
                desc: 'He will translate. He has offered twice.',
                apply: () => ({
                    text: 'He does your bank, your contract for the flat and half your conversations for a fortnight. You are settled inside ten days and you have learned nothing at all.',
                    effects: { chemistry: 8, morale: 5, form: 2 },
                }),
            },
            {
                id: 'inside',
                label: 'Stay in and play',
                desc: 'The client is the same in every country.',
                apply: () => ({
                    text: 'Two weeks of leaving the flat for the building and the building for the flat. Your rating is the best it has been all year and you could not name the street you live on.',
                    effects: { mmr: 90, morale: -8, energy: -6 },
                }),
            },
        ],
    },
    {
        id: 'comms_language',
        weight: 12,
        type: 'drama',
        icon: '\u{1F4E2}',
        title: 'The Call Was Not In English',
        text: 'The engage happens, four people say the same word at the same time, and you are the only one in the lobby who does not know what it was. You die on the wrong side of it.',
        // The player must actually be short of the language the room calls in.
        when: c => abroad(c) && workLangLevel(c) < LANGUAGE_FLUENT,
        options: [
            {
                id: 'ask',
                label: 'Ask the room to call in English',
                desc: 'Four people slower so that one is faster.',
                apply: () => ({
                    text: 'They agree in the meeting and they do it for eleven days. In the fights it goes back to what it was, because nobody thinks in a second language at nineteen minutes.',
                    effects: { chemistry: -7, form: 4, morale: 2 },
                }),
            },
            {
                id: 'twenty',
                label: 'Learn the twenty words that get shouted',
                desc: 'Not the language. The fight vocabulary.',
                apply: (c) => ({
                    text: `Twenty words on a card taped to the bottom of the monitor: go, back, wait, mine, theirs. It is not ${langName(workLang(c))} and it is the half of it you needed on Saturday.`,
                    effects: { energy: -6, form: 5, language: { [workLang(c)]: 4 } },
                }),
            },
            {
                id: 'map',
                label: 'Stop listening and read the map',
                desc: 'If you cannot hear it, see it.',
                apply: () => ({
                    text: 'You play off five sets of feet and a minimap for a month and you get genuinely good at it. You are also the last person in every fight to know what the plan was.',
                    effects: { attr: { map: 1 }, form: -3, morale: -5, chemistry: -3 },
                }),
            },
        ],
    },
    {
        id: 'facility_tutor',
        weight: 11,
        type: 'training',
        icon: '\u{1F4D6}',
        title: 'A Tutor In The Meeting Room',
        text: 'The club has put two hours a week on the schedule with a teacher who has taught four imports before you. It sits between the gym and the afternoon block and nobody is checking that you go.',
        // A club-funded tutor needs a club, and a working language that is not
        // already finished - a domestic player has nothing to be taught.
        when: c => isSigned(c) && workLangLevel(c) < LANGUAGE_FLUENT,
        options: [
            {
                id: 'attend',
                label: 'Go to every session',
                desc: 'And do the homework she sets.',
                apply: (c) => ({
                    text: 'Eight weeks of two hours and a folder of exercises. You are noticeably behind in the block on Wednesdays and you can hold a conversation by the end of the split.',
                    effects: { energy: -8, form: -2, language: { [workLang(c)]: 6 } },
                }),
            },
            {
                id: 'trade',
                label: 'Trade the slot for another block',
                desc: 'Two more hours of scrims a week.',
                apply: () => ({
                    text: 'The coach takes the hours without asking twice. You are better at the game by March and you still need somebody in the room to tell you what was said.',
                    effects: { form: 6, chemistry: 3, energy: -6 },
                }),
            },
            {
                id: 'half',
                label: 'Turn up and do nothing',
                desc: 'Present. Phone under the table.',
                apply: (c) => ({
                    text: 'You attend all eight and absorb about one in three. She notices in week two and stops setting you homework, which is worse than being told off.',
                    effects: { energy: -3, morale: -3, language: { [workLang(c)]: 2 } },
                }),
            },
        ],
    },
    {
        id: 'import_slot',
        weight: 10,
        type: 'social',
        icon: '\u{1F9F3}',
        title: 'Whose Slot Are You In',
        text: 'A journalist in the mixed zone asks whether a domestic player could have done what you did tonight. He is not being unkind about it. He asks somebody this every single year.',
        // Only an import can be asked this, and only about a league they are
        // actually in: abroad(c), which reads the contract and not the passport.
        when: c => abroad(c),
        options: [
            {
                id: 'honest',
                label: 'Say no, and say why',
                desc: 'Name the thing you do that they do not.',
                apply: () => ({
                    text: 'You are specific for ninety seconds about one part of the game and it is the most interesting thing anybody says all night. Half the region reads it as arrogance.',
                    effects: { followers: 5000, morale: 4, chemistry: -4 },
                }),
            },
            {
                id: 'cost',
                label: 'List what it cost you to be here',
                desc: 'The flight, the flat, the language, the year.',
                apply: (c) => ({
                    text: `You describe a fortnight in a flat you could not heat and a supermarket you photographed. It runs in three languages by the morning and one of them is ${langName(homeLang(c) || 'en')}.`,
                    effects: { followers: 3500, morale: 6, legacy: 1 },
                }),
            },
            {
                id: 'refuse',
                label: 'Tell him it is not your question',
                desc: 'The org signed you. Ask the org.',
                apply: () => ({
                    text: 'Eleven words, and you walk. It reads as cold on video and every import in the league sends you the clip within a day.',
                    effects: { followers: 2000, chemistry: 3, morale: -3 },
                }),
            },
        ],
    },
    {
        id: 'homesick_offseason',
        weight: 11,
        type: 'system',
        icon: '\u{1F3E1}',
        title: 'Six Weeks And A Flight Home',
        text: 'The season is finished, the building is shut until January, and the flight home is nine hours and most of a month of what you are paid.',
        // Homesick needs a home you are not in, and an offseason to be in it.
        when: c => abroad(c) && offSeason(c),
        options: [
            {
                id: 'fly',
                label: 'Go home for the whole break',
                desc: 'Every day of it. Buy the flight tonight.',
                apply: () => ({
                    text: 'Six weeks of a kitchen you know the sound of. You come back in January soft and slow and having remembered why any of this was supposed to be worth it.',
                    effects: { gold: -600, morale: 11, energy: 8, form: -5 },
                }),
            },
            {
                id: 'stay',
                label: 'Stay and use the empty building',
                desc: 'Nobody here. Nothing on the schedule.',
                apply: (c) => ({
                    text: 'Six weeks of a city you now know the buses of, on your own, with a key to a practice room. You come back a step ahead of everybody and you did not speak to anyone for most of December.',
                    effects: { form: 7, morale: -7, language: { [workLang(c)]: 3 } },
                }),
            },
            {
                id: 'bring',
                label: 'Fly your family out instead',
                desc: 'Show them the city. Pay for all of it.',
                apply: () => ({
                    text: 'Nine days of translating menus for people who are proud of you and slightly frightened of the place. Your mother takes a photograph of the building from outside.',
                    effects: { gold: -900, morale: 9, energy: 4 },
                }),
            },
        ],
    },
    {
        id: 'foreign_ladder',
        weight: 11,
        type: 'match',
        icon: '\u{1F524}',
        title: 'The Lobby Is Not In Your Language',
        text: 'Nine other people typing in a language you are a few hundred words into. Half of it is a plan and half of it is about you and there is no way to tell which is which.',
        // Deliberately NOT gated under LANGUAGE_SIGN_MIN: signingBlock() refuses
        // a foreign club below 40, so a player who legitimately signed abroad is
        // never under it and the whole entry would have been dead content. The
        // honest line is fluency - at 40-70 you can order food and still cannot
        // read nine strangers arguing at nineteen minutes.
        when: c => abroad(c) && workLangLevel(c) < LANGUAGE_FLUENT,
        options: [
            {
                id: 'mute',
                label: 'Mute everybody and play',
                desc: 'No chat, no pings, nothing but the game.',
                apply: () => ({
                    text: 'Eleven games in silence and you win seven of them. It is the most efficient the ladder has ever been and you do not learn one word.',
                    effects: { mmr: 80, morale: -4, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'translate',
                label: 'Keep a translator open on the second monitor',
                desc: 'Paste, read, answer, die.',
                apply: (c) => ({
                    text: 'You spend most of every laning phase reading a browser window. Your rating goes backwards and by Sunday you are recognising the words before you paste them.',
                    effects: { mmr: -50, energy: -4, language: { [workLang(c)]: 3 } },
                }),
            },
            {
                id: 'type',
                label: 'Type badly and let them correct you',
                desc: 'Get it wrong in front of nine strangers.',
                apply: (c) => ({
                    text: `You write something in ${langName(workLang(c))} that means almost what you meant, and a support with a low rating and enormous patience rewrites it for you twice a night.`,
                    effects: { mmr: -30, morale: -3, language: { [workLang(c)]: 5 } },
                }),
            },
        ],
    },
    {
        id: 'agent_learn_it',
        weight: 10,
        type: 'transfer',
        icon: '\u{1F310}',
        title: 'He Says It Is The Language',
        text: 'Your agent has had two conversations about you this month and both of them ended on the same sentence. Nobody is going to run a review through a translator for two years.',
        // Three things the copy asserts, each read directly: somebody is having
        // conversations about you (a club, or a scout who has actually made
        // contact), you are old enough for a move to be a real prospect, and
        // there is a language on the circuit you could not currently sign in.
        when: c => agedAtLeast(c, 16) && !!shortestLanguage(c)
            && (isSigned(c) || flagOf(c, 'scoutContact')),
        options: [
            {
                id: 'course',
                label: 'Pay for a proper course',
                desc: 'Four evenings a week, for months.',
                apply: (c) => {
                    const id = shortestLanguage(c);
                    return {
                        text: `Four evenings a week of ${langName(id)} on top of everything else you already do. It is the least glamorous thing in your calendar and it is the one that moves.`,
                        effects: { gold: -420, energy: -10, language: { [id]: 6 } },
                    };
                },
            },
            {
                id: 'apps',
                label: 'Do it for free at two in the morning',
                desc: 'An app, a streak, and no teacher.',
                apply: (c) => {
                    const id = shortestLanguage(c);
                    return {
                        text: `Eleven weeks of a streak and about four hundred words of ${langName(id)}, none of which are the ones people actually say to each other. It is not nothing.`,
                        effects: { energy: -8, morale: -2, language: { [id]: 3 } },
                    };
                },
            },
            {
                id: 'home',
                label: 'Decide you are staying home',
                desc: 'One region, one language, one career.',
                apply: (c) => ({
                    text: `You tell him to stop taking the calls. There is a version of the next five years in ${leagueName(PL(c).region)} that is entirely fine and you have just chosen it on purpose.`,
                    effects: { morale: 7, form: 4, chemistry: 3 },
                }),
            },
        ],
    },
    {
        id: 'translator_quits',
        weight: 8,
        type: 'drama',
        icon: '\u{1F9CD}',
        title: 'The Translator Hands In Her Notice',
        text: 'She has sat between you and every conversation in this building for a year and she is going to a bigger club. There are eleven weeks of the split left after she goes.',
        // Somebody only sits between you and the room while you are short of the
        // language the room uses.
        when: c => abroad(c) && workLangLevel(c) < LANGUAGE_FLUENT,
        options: [
            {
                id: 'lean',
                label: 'Lean on a teammate instead',
                desc: 'Ask the one who has been doing it anyway.',
                apply: (c) => ({
                    text: 'He is happy to do it and he is not a translator, so about a fifth of every meeting arrives as a summary. You get on better and you know less.',
                    effects: { chemistry: 6, morale: -3, language: { [workLang(c)]: 2 } },
                }),
            },
            {
                id: 'solo',
                label: 'Stop using one at all',
                desc: 'Sit in every meeting and understand a third.',
                apply: (c) => ({
                    text: 'Two months of nodding at things and asking about them afterwards. You are worse in the meetings and by the end of it you are not asking afterwards.',
                    effects: { form: -5, morale: -4, language: { [workLang(c)]: 6 } },
                }),
            },
            {
                id: 'hire',
                label: 'Pay for your own',
                desc: 'The club will not. You can.',
                apply: (c) => (goldOf(c) >= 700
                    ? {
                        text: 'A man who has done this for two other imports and who tells you what was meant as well as what was said. It costs you what a month of the flat costs.',
                        effects: { gold: -700, form: 5, morale: 4, chemistry: 2 },
                    }
                    : {
                        text: 'You price it, and it is a month of the flat. The club says they are hiring in January and January is on the other side of the playoffs.',
                        effects: { morale: -6, form: -3 },
                    }),
            },
        ],
    },
    {
        id: 'press_their_language',
        weight: 9,
        type: 'social',
        icon: '\u{1F3A4}',
        title: 'You Answer The First Question Yourself',
        text: 'The translator leans in and you put a hand up. You get through the first answer and most of the second before you have to give it back to her.',
        // Answering at all needs enough of the language for a club here to have
        // signed you, and something still left to learn.
        when: c => abroad(c) && workLangLevel(c) >= LANGUAGE_SIGN_MIN && workLangLevel(c) < LANGUAGE_MAX,
        options: [
            {
                id: 'keep',
                label: 'Do it every week from now on',
                desc: 'Badly, in public, until it is not badly.',
                apply: (c) => ({
                    text: 'Eleven weeks of getting the tenses wrong on camera in front of a country that finds it charming for about six of them and then simply stops noticing.',
                    effects: { followers: 6000, energy: -4, language: { [workLang(c)]: 4 } },
                }),
            },
            {
                id: 'back',
                label: 'Give it back to the translator',
                desc: 'Say what you mean instead of what you can.',
                apply: () => ({
                    text: 'You answer the rest properly and precisely and it is a much better interview. Somebody clips the twenty seconds before that anyway.',
                    effects: { followers: 1500, form: 3, morale: -2 },
                }),
            },
            {
                id: 'full',
                label: 'Do the whole thing alone next week',
                desc: 'No safety net and eight minutes of it.',
                apply: (c) => (chance(0.55)
                    ? {
                        text: 'Eight minutes, two words you have to work around, and a room that applauds at the end of it. It is the most popular you have ever been in this country.',
                        effects: { followers: 11000, morale: 8, language: { [workLang(c)]: 3 } },
                    }
                    : {
                        text: 'You lose a sentence in the middle of the fourth answer and cannot find the end of it. The silence is nine seconds long and all of it is on the broadcast.',
                        effects: { followers: 3000, morale: -8, form: -3 },
                    }),
            },
        ],
    },
    {
        id: 'first_language_slips',
        weight: 8,
        type: 'system',
        icon: '\u{1F4AD}',
        title: 'You Lose A Word In Your Own Language',
        text: 'On the phone to your mother you reach for an ordinary word and it is not there. You use the other one instead and she goes quiet for about a second.',
        // Two languages in one head: you are working in one that is not the one
        // you grew up in, and you have been at it long enough for it to show.
        when: c => abroad(c) && !!homeLang(c) && homeLang(c) !== workLang(c) && agedAtLeast(c, 19),
        options: [
            {
                id: 'call',
                label: 'Call home every night in your own language',
                desc: 'Half an hour. Nothing about work.',
                apply: (c) => ({
                    text: 'Thirty minutes a night of the language you learned first, about nothing at all. It comes back inside a fortnight and it costs you the last half hour of every day.',
                    effects: { morale: 6, energy: -4, language: { [homeLang(c)]: 3 } },
                }),
            },
            {
                id: 'accept',
                label: 'Let it happen',
                desc: 'You live here now. Live here.',
                apply: (c) => ({
                    text: 'You stop translating in your head somewhere around March, which is the thing every import is told will happen and does not always. Something else goes quiet to make room for it.',
                    effects: { form: 4, language: { [workLang(c)]: 4, [homeLang(c)]: -3 } },
                }),
            },
            {
                id: 'read',
                label: 'Read a book from home',
                desc: 'Forty minutes a night, on paper.',
                apply: (c) => ({
                    text: 'Four hundred pages of somebody writing the way people at home actually talk. It is the first thing you have read for pleasure since you were fifteen.',
                    effects: { morale: 4, energy: -3, language: { [homeLang(c)]: 2 } },
                }),
            },
        ],
    },

    // ---- THE BEDROOM YEARS -------------------------------------------------
    //  Nobody has signed you, nobody is paying you, and there is homework on
    //  the desk. Everything above this line needs a club, a wage, a physio or a
    //  past; these are gated to the unsigned pre-competitive years so the early
    //  game has texture of its own instead of borrowed professional drama.
    {
        id: 'school_hall_lan',
        weight: 12,
        type: 'match',
        icon: '\u{1F3C6}',
        title: 'A Tournament In A School Hall',
        text: 'Somebody has booked a school hall, forty machines and a projector for the Saturday. Entry is fifteen a head, the prize is two hundred, and the bracket is on a spreadsheet.',
        when: c => !isSigned(c) && agedBetween(c, 13, 16),
        options: [
            {
                id: 'team',
                label: 'Enter with the Discord five',
                desc: 'Four people you have never seen standing up.',
                apply: (c) => (mmrOf(c) >= 1400
                    ? {
                        text: 'You win it in front of about sixty people and one hired microphone. Two of the teams you beat add you that night.',
                        effects: { gold: 260, followers: 900, morale: 9, energy: -8, attr: { tmf: 1 } },
                    }
                    : {
                        text: 'Out in the second round to five boys who have obviously played together for a year. You learn more in that hour than in the month before it.',
                        effects: { gold: -60, morale: -4, energy: -8, attr: { tmf: 1, knw: 1 } },
                    }),
            },
            {
                id: 'solo',
                label: 'Turn up alone and fill in',
                desc: 'Whoever arrives a man short takes you.',
                apply: () => ({
                    text: 'You play for three different teams in one afternoon on three different roles. Nobody in the hall knows your name and four people ask for it.',
                    effects: { gold: -60, followers: 400, energy: -10, attr: { chp: 1 } },
                }),
            },
            {
                id: 'stay',
                label: 'Stay in and queue',
                desc: 'Ranked does not cost fifteen.',
                apply: () => ({
                    text: 'Eleven games on the Saturday while it happens without you. The rating is real and the room was not, which is either the right call or the one you tell yourself.',
                    effects: { mmr: 90, energy: -12, morale: -3 },
                }),
            },
        ],
    },
    {
        id: 'bedroom_rig',
        weight: 12,
        type: 'money',
        icon: '\u{1F5A5}',
        title: 'Thirty Frames',
        text: 'The machine in the corner of the living room drops to thirty frames every time five people are on the screen, and it has done for two years. Nobody in this house thinks that is a real problem.',
        when: c => PL(c).path === 'precomp' && !isSigned(c) && agedBetween(c, 13, 16),
        options: [
            {
                id: 'save',
                label: 'Save for a second-hand card',
                desc: 'Months of birthday money and a marketplace listing.',
                apply: () => ({
                    text: 'It arrives in a box with somebody else\'s dust in it and it works. Every teamfight you have ever played was happening slightly before you saw it.',
                    effects: { gold: -320, mmr: 110, morale: 6, attr: { mec: 1 } },
                }),
            },
            {
                id: 'ask',
                label: 'Ask them to go halves',
                desc: 'You have to explain what a frame is first.',
                apply: (c) => (mmrOf(c) >= 1800
                    ? {
                        text: 'You show them the ladder and the machine and the gap between the two. Your mother pays half of it on the Thursday and says nothing about maths for a fortnight.',
                        effects: { gold: -160, mmr: 110, morale: 7, attr: { mec: 1 } },
                    }
                    : {
                        text: 'They ask what it would change and you do not have an answer that survives being said out loud. The machine stays as it is.',
                        effects: { morale: -7 },
                    }),
            },
            {
                id: 'settle',
                label: 'Learn to play at thirty',
                desc: 'It is what you have. Work inside it.',
                apply: () => ({
                    text: 'You stop blaming the machine and start playing around it. It costs you a handful of kills a week and it teaches you where to stand instead.',
                    effects: { mmr: -40, morale: -2, attr: { cmp: 1, map: 1 } },
                }),
            },
        ],
    },
    {
        id: 'discord_five',
        weight: 12,
        type: 'training',
        icon: '\u{1F4AC}',
        title: 'The Discord Five',
        text: 'Five of you in a voice channel every night at seven, none of you old enough to drive, one of you in a different country. Somebody has put the word "team" in the channel name.',
        when: c => !isSigned(c) && agedBetween(c, 13, 16) && (Number(c?.soloq?.games) || 0) >= 10,
        options: [
            {
                id: 'call',
                label: 'Take the calls',
                desc: 'Be the voice. Nobody else wants it.',
                apply: () => ({
                    text: 'You do the drakes, the timers and the arguing. It is the first time four other people have done what you said, and that turns out to be a skill of its own.',
                    effects: { energy: -8, morale: 4, attr: { ldr: 2 } },
                }),
            },
            {
                id: 'scrim',
                label: 'Book games against older teams',
                desc: 'Message every amateur roster in the region.',
                apply: () => ({
                    text: 'Two replies out of thirty and both of them beat you comfortably. You watch the second one back four times and write down what they did at fourteen minutes.',
                    effects: { energy: -10, morale: -3, attr: { knw: 1, map: 1 } },
                }),
            },
            {
                id: 'leave',
                label: 'Leave and go back to the ladder',
                desc: 'They are not going anywhere and you might be.',
                apply: () => ({
                    text: 'You mute the channel on a Tuesday and nobody asks why. The ladder is lonelier and it climbs faster, and you think about the channel most nights.',
                    effects: { mmr: 120, morale: -6, attr: { mec: 1 } },
                }),
            },
        ],
    },
    {
        id: 'paid_coach_dm',
        weight: 11,
        type: 'money',
        icon: '\u{1F4B3}',
        title: 'Forty A Session',
        text: 'A coach with a Challenger tag in his display name offers to review two of your games for forty. His own account has not been ranked in three seasons.',
        when: c => PL(c).path === 'precomp' && !isSigned(c) && agedBetween(c, 13, 16),
        options: [
            {
                id: 'pay',
                label: 'Book a session',
                desc: 'It is your money and it is a lot of it.',
                apply: () => (chance(0.55)
                    ? {
                        text: 'Ninety minutes, of which about eleven are worth the forty. He shows you one wave pattern you have been misplaying since the day you started.',
                        effects: { gold: -160, morale: 2, attr: { lne: 1, knw: 1 } },
                    }
                    : {
                        text: 'Ninety minutes of a man reading your own minimap back to you in a tone. You pay, you thank him, and you do not book the second one.',
                        effects: { gold: -160, morale: -6 },
                    }),
            },
            {
                id: 'free',
                label: 'Do it yourself for nothing',
                desc: 'A pro on your champion, and a notebook.',
                apply: () => ({
                    text: 'Six hours of somebody else\'s replays with a notebook next to the keyboard. Slower than being told and it stays in your head considerably longer.',
                    effects: { energy: -12, attr: { knw: 1 } },
                }),
            },
            {
                id: 'queue',
                label: 'Ignore it and queue',
                desc: 'Games are the only free coaching there is.',
                apply: () => ({
                    text: 'Twenty more games instead. You are no wiser and you are a division higher, and this far down the ladder those are nearly the same thing.',
                    effects: { mmr: 100, energy: -10, morale: 2 },
                }),
            },
        ],
    },
    {
        id: 'final_from_the_bedroom',
        weight: 11,
        type: 'system',
        icon: '\u{1F4FA}',
        title: 'The Final, From Your Bedroom',
        text: 'The stage you are not on is on the second monitor at eleven at night, and somebody four years older than you is holding a trophy on it and cannot speak.',
        when: c => !isSigned(c) && agedBetween(c, 13, 16) && inBigStageWeek(c),
        options: [
            {
                id: 'study',
                label: 'Watch it like homework',
                desc: 'Pause it. Rewind the draft. Write it down.',
                apply: () => ({
                    text: 'You watch the same twelve minutes five times and understand about half of what the winning side did. It is the useful half.',
                    effects: { energy: -8, morale: 2, attr: { knw: 1, map: 1 } },
                }),
            },
            {
                id: 'play',
                label: 'Turn it off and queue',
                desc: 'Watching is not playing.',
                apply: () => ({
                    text: 'Nine games while the confetti falls somewhere else. You are not on that stage this year and there is exactly one route to it.',
                    effects: { mmr: 90, energy: -12, morale: -3, attr: { mec: 1 } },
                }),
            },
            {
                id: 'sit',
                label: 'Just watch it',
                desc: 'No notebook. No client open.',
                apply: () => ({
                    text: 'Two hours of wanting it very badly and nothing else. You are still awake at three working out how old you would be the year it comes to your region.',
                    effects: { morale: 8, energy: -4 },
                }),
            },
        ],
    },
];

export const EVENT_BY_ID = EVENT_POOL.reduce((m, e) => { m[e.id] = e; return m; }, {});

// -------------------------------------------------------------------------
//  PRE-GAME POOL
//  The hours before a playoff tie or an international: the bus, the booth, the
//  crowd through the wall, a message from home. Same entry shape as EVENT_POOL
//  with two differences - `when` takes (c, ctx), and `text` may be a function of
//  the same pair so a line can name the opponent or the stage.
//
//  Effects here are SMALL on purpose. These fire hours before a game that is
//  about to be played, so a +12 form swing would not be an event, it would be a
//  free win; nothing in this pool moves form or morale by more than 6 and most
//  entries cut both ways. Everything the caller can supply in `ctx` is already
//  defaulted by engine.js, and every text function defaults again anyway,
//  because careerRender fails a render containing the word 'undefined'.
// -------------------------------------------------------------------------
export const PREGAME_POOL = [
    {
        id: 'pg_bus',
        weight: 12,
        type: 'system',
        icon: '\u{1F68C}',
        title: 'The Bus To The Venue',
        text: 'Forty minutes in traffic with four other people who have all separately decided to be quiet about it. Somebody\'s headphones are leaking the same eight bars over and over.',
        // A team bus needs a team.
        when: (c, ctx) => !!ctx && isSigned(c),
        options: [
            {
                id: 'notes',
                label: 'Go through the notes one more time',
                desc: 'Their last six drafts, on a phone, in traffic.',
                apply: () => ({
                    text: 'You read the same document for the fourth time and find one thing in it you had not registered. You arrive slightly carsick and slightly better prepared.',
                    effects: { form: 3, energy: -4 },
                }),
            },
            {
                id: 'window',
                label: 'Look out of the window',
                desc: 'Forty minutes of not thinking about it.',
                apply: () => ({
                    text: 'You watch a city you have not looked at properly in three months go past. You get off the bus calmer than anybody else on it.',
                    effects: { morale: 4, energy: 5 },
                }),
            },
            {
                id: 'talk',
                label: 'Get the bus talking',
                desc: 'Break it. Somebody has to.',
                apply: () => ({
                    text: 'Ten minutes of an argument about something entirely unrelated and the whole vehicle changes temperature. Your support tells you afterwards that he needed that.',
                    effects: { chemistry: 6, morale: 3 },
                }),
            },
        ],
    },
    {
        id: 'pg_booth',
        weight: 12,
        type: 'training',
        icon: '\u{1F4BB}',
        title: 'Tech Check',
        text: 'Twenty minutes in the booth while they let the crowd in behind the glass. Your chair is two notches lower than the one you practise on and there is no time to argue about it.',
        when: (c, ctx) => !!ctx && isSigned(c),
        options: [
            {
                id: 'fix',
                label: 'Make them fix the chair',
                desc: 'Hold the whole check up over two notches.',
                apply: () => ({
                    text: 'It takes six minutes and a man with a trolley and everybody in the booth watches you do it. The chair is right and you are the player who delayed the tech check.',
                    effects: { form: 4, chemistry: -3 },
                }),
            },
            {
                id: 'adapt',
                label: 'Play on it',
                desc: 'It is two notches. Adjust.',
                apply: () => ({
                    text: 'Your wrist sits about a centimetre high for five hours. You stop noticing it in game two and your hands remember it on Monday.',
                    effects: { form: -3, attr: { cmp: 1 } },
                }),
            },
            {
                id: 'drill',
                label: 'Use the twenty minutes on keybinds',
                desc: 'Practice tool until they take the machines.',
                apply: () => ({
                    text: 'Twenty minutes of the same four inputs while a building fills up ten metres away. It is the calmest you feel all day and it costs you the warm-up you usually do.',
                    effects: { form: 3, energy: -5 },
                }),
            },
        ],
    },
    {
        id: 'pg_crowd_wall',
        weight: 11,
        type: 'drama',
        icon: '\u{1F50A}',
        title: 'You Can Hear Them From The Back Room',
        text: 'The wall between the green room and the arena is not thick. Every time the crowd goes up at something on the screen the table moves slightly.',
        // A crowd on the other side of a wall means a real bracket tie, not a
        // league game in a studio.
        when: (c, ctx) => !!ctx && ctx.kind === 'bracket',
        options: [
            {
                id: 'watch',
                label: 'Go and watch the game before yours',
                desc: 'Stand at the back of the tunnel for ten minutes.',
                apply: () => ({
                    text: 'You stand where the players walk out and watch about four minutes of somebody else being taken apart by that noise. It is either the best or the worst preparation available.',
                    effects: { morale: 4, form: -3 },
                }),
            },
            {
                id: 'headphones',
                label: 'Headphones on until they call you',
                desc: 'Do not hear any of it.',
                apply: () => ({
                    text: 'Ninety minutes of the same album and no idea what the score is next door. You walk out into a wall of sound you had not adjusted to at all.',
                    effects: { form: 3, morale: -3 },
                }),
            },
            {
                id: 'room',
                label: 'Get the five of you talking about the plan',
                desc: 'Out loud, over the noise.',
                apply: () => ({
                    text: 'Twenty minutes of saying the same six things to each other until they are boring. Boring is the point and everybody knows it is the point.',
                    effects: { chemistry: 5, form: 2, energy: -3 },
                }),
            },
        ],
    },
    {
        id: 'pg_message_home',
        weight: 12,
        type: 'social',
        icon: '\u{1F4F1}',
        title: 'A Message From Home',
        text: 'Your phone goes forty minutes before the walk-on. It is a photograph of six people in a front room you know, sitting in a row facing a television.',
        when: (c, ctx) => !!ctx,
        options: [
            {
                id: 'reply',
                label: 'Reply properly',
                desc: 'Five minutes you do not really have.',
                apply: () => ({
                    text: 'You write something longer than you meant to and it is the last thing you do before the phones go in the box. You are still thinking about it in champion select.',
                    effects: { morale: 5, form: -2 },
                }),
            },
            {
                id: 'later',
                label: 'Leave it until after',
                desc: 'Phone in the box. Answer it tonight.',
                apply: () => ({
                    text: 'You put it face down and it sits in the box for six hours. Whatever you send afterwards will read differently depending on the result and you know it.',
                    effects: { form: 3, morale: -2 },
                }),
            },
            {
                id: 'show',
                label: 'Show it to the room',
                desc: 'Pass the phone round the green room.',
                apply: () => ({
                    text: 'Three of them get their own phones out and it becomes six photographs of six front rooms. Nobody says anything about it and the room is different afterwards.',
                    effects: { chemistry: 5, morale: 4 },
                }),
            },
        ],
    },
    {
        id: 'pg_corridor',
        weight: 11,
        type: 'drama',
        icon: '\u{1F6B6}',
        title: 'Their Mid Laner In The Corridor',
        text: (c, ctx) => `You come out of the bathroom and somebody from ${String((ctx && ctx.opponentName) || 'the other team')} is standing in the corridor with a water bottle. Neither of you had planned for this.`,
        // The line names an opponent, so there has to be one.
        when: (c, ctx) => !!ctx && !!ctx.opponentName,
        options: [
            {
                id: 'nod',
                label: 'Nod and keep walking',
                desc: 'Three seconds. Nothing said.',
                apply: () => ({
                    text: 'He nods back. You are both entirely normal about it and you think about the exact angle of the nod twice during the first draft.',
                    effects: { form: 2, morale: 2 },
                }),
            },
            {
                id: 'talk',
                label: 'Say something to him',
                desc: 'A sentence. Any sentence.',
                apply: () => ({
                    text: 'You ask him how the flight was and he tells you, at some length, and it is impossible to want to beat somebody less than in the ninety seconds after that.',
                    effects: { morale: 5, form: -3 },
                }),
            },
            {
                id: 'stare',
                label: 'Look straight at him and say nothing',
                desc: 'Let it be uncomfortable for both of you.',
                apply: () => ({
                    text: 'Four seconds of a corridor. Somebody films the end of it on a phone and it is on the internet before the first game finishes.',
                    effects: { form: 4, followers: 3000, morale: -2 },
                }),
            },
        ],
    },
    {
        id: 'pg_worlds_walk',
        weight: 12,
        type: 'award',
        icon: '\u{1F31F}',
        title: 'The Walk-On',
        text: 'They hold you in a corridor under the stage while the announcer says the name of your organisation to a building you cannot see yet. It is extremely cold down there and extremely loud above.',
        // Only Worlds does the under-stage hold and the announcer.
        when: (c, ctx) => !!ctx && ctx.phase === 'worlds',
        options: [
            {
                id: 'look',
                label: 'Look up at it on the way out',
                desc: 'Take the four seconds. See the building.',
                apply: () => ({
                    text: 'You look up at forty thousand people and it is not frightening, it is just very large and it is real. You sit down and your hands are completely steady.',
                    effects: { morale: 6, form: 3 },
                }),
            },
            {
                id: 'floor',
                label: 'Watch the floor to the chair',
                desc: 'Do not look at any of it.',
                apply: () => ({
                    text: 'Forty metres of looking at somebody else\'s heels. You are in the chair before you have registered where you are, which is the whole idea and it works.',
                    effects: { form: 5, morale: -3 },
                }),
            },
            {
                id: 'crowd',
                label: 'Find the block with your flag in it',
                desc: 'They travelled a long way to be in it.',
                apply: () => ({
                    text: 'It takes you most of the walk to find them and they see you find them. You will not be able to hear anything they do for the next five hours and it does not matter.',
                    effects: { morale: 6, energy: 4, form: -2 },
                }),
            },
        ],
    },
    {
        id: 'pg_msi_jetlag',
        weight: 11,
        type: 'system',
        icon: '\u{23F0}',
        title: 'Your Body Thinks It Is Four In The Morning',
        text: 'Eight time zones and three days is not enough of a run-up. The game is at seven in the evening here and at four in the morning wherever you slept last week.',
        when: (c, ctx) => !!ctx && ctx.phase === 'msi',
        options: [
            {
                id: 'coffee',
                label: 'Fix it with caffeine',
                desc: 'Whatever it takes to be awake at seven.',
                apply: () => ({
                    text: 'You are extremely awake for game one and two and there is a version of you in game four that is neither awake nor asleep and cannot be relied on.',
                    effects: { energy: 8, form: -3, health: -3 },
                }),
            },
            {
                id: 'sleep',
                label: 'Sleep through the morning session',
                desc: 'Miss the last block. Be a person at seven.',
                apply: () => ({
                    text: 'You skip the morning entirely and nobody minds. You wake at two feeling like yourself for the first time since the plane.',
                    effects: { energy: 10, health: 4, form: -2, chemistry: -3 },
                }),
            },
            {
                id: 'push',
                label: 'Keep the schedule you flew in on',
                desc: 'Everybody else is doing the same thing.',
                apply: () => ({
                    text: 'Five people all pretending to be in the right time zone. It is nearly fine for two games and it is very obviously not fine in the fourth.',
                    effects: { form: 3, energy: -8, health: -3 },
                }),
            },
        ],
    },
    {
        id: 'pg_first_stand_cold',
        weight: 11,
        type: 'system',
        icon: '\u{1F9E5}',
        title: 'February, And Nobody Is Ready',
        text: 'Three weeks of the year have been played and the six teams in this building are the champions of six regions. Half of them have not slept in the same time zone twice.',
        when: (c, ctx) => !!ctx && ctx.phase === 'first_stand',
        options: [
            {
                id: 'patch',
                label: 'Spend the morning on the patch',
                desc: 'Nobody knows what is strong. Find out.',
                apply: () => ({
                    text: 'Four hours of a patch two days old with three other people who also do not know what is good. You come out of it with a pick nobody has prepared for.',
                    effects: { form: 5, energy: -6 },
                }),
            },
            {
                id: 'known',
                label: 'Play only what you already know',
                desc: 'February is not the month to be clever.',
                apply: () => ({
                    text: 'You lock in the things your hands have done a thousand times and let everybody else be inventive on the second patch of the year.',
                    effects: { form: 3, morale: 3, chemistry: -2 },
                }),
            },
            {
                id: 'watch',
                label: 'Watch the other five teams warm up',
                desc: 'Everybody is in one building for two days.',
                apply: () => ({
                    text: 'You learn more about what the year is going to look like in one afternoon of standing behind other people than in six weeks of preseason.',
                    effects: { attr: { knw: 1 }, form: -2, morale: 2 },
                }),
            },
        ],
    },
    {
        id: 'pg_playoff_seed',
        weight: 12,
        type: 'match',
        icon: '\u{1F3AF}',
        title: 'The Whole Split In One Afternoon',
        text: (c, ctx) => `Eighteen weeks of league games and it comes down to ${String((ctx && ctx.label) || 'this one')}. Nobody in the room says that out loud and everybody in it has done the arithmetic.`,
        when: (c, ctx) => !!ctx && (ctx.phase === 'spring_po' || ctx.phase === 'summer_po'),
        options: [
            {
                id: 'name',
                label: 'Say out loud what is at stake',
                desc: 'Put it on the table before somebody else does.',
                apply: () => ({
                    text: 'You name it in one sentence and then nobody has to carry it privately for four hours. Two of them look relieved and one of them looks worse.',
                    effects: { chemistry: 5, morale: 3, form: -2 },
                }),
            },
            {
                id: 'routine',
                label: 'Treat it as a Tuesday',
                desc: 'Same warm-up. Same food. Same everything.',
                apply: () => ({
                    text: 'The same four hours you have run every week since January, on the one day it is not the same. It holds for about two games.',
                    effects: { form: 4, morale: -2 },
                }),
            },
            {
                id: 'alone',
                label: 'Get an hour on your own first',
                desc: 'Find an empty room in the building.',
                apply: () => ({
                    text: 'You sit in a storage corridor with a coat on for an hour and nobody comes to find you. You are the calmest person in the booth and the room noticed you were gone.',
                    effects: { form: 4, morale: 3, chemistry: -3 },
                }),
            },
        ],
    },
    {
        id: 'pg_long_day',
        weight: 10,
        type: 'system',
        icon: '\u{1F35D}',
        title: 'Eat Now Or Do Not Eat',
        text: 'A best of five is five hours if it goes the distance. The catering shuts at six and nobody has ever played a good game five on nothing at all.',
        // Only a Bo5 is a five-hour day.
        when: (c, ctx) => !!ctx && Number(ctx.bestOf) >= 5,
        options: [
            {
                id: 'proper',
                label: 'Eat a proper meal now',
                desc: 'Even though you are not hungry at four.',
                apply: () => ({
                    text: 'You eat something sensible two hours before a game you do not want to eat before. In game four you are the only person at the table who is not empty.',
                    effects: { energy: 9, form: 3 },
                }),
            },
            {
                id: 'light',
                label: 'Something small and keep it light',
                desc: 'Heavy food and a Bo5 do not mix.',
                apply: () => ({
                    text: 'Half a plate at half four and a bag of something in the booth. It is exactly right until about the fourth hour and then it is not.',
                    effects: { energy: 4, morale: 2 },
                }),
            },
            {
                id: 'nothing',
                label: 'Nothing until it is over',
                desc: 'You cannot eat before a game like this.',
                apply: () => ({
                    text: 'Five hours on coffee and a banana somebody put in your hand. You are perfectly fine for three games and you are not there for the fifth.',
                    effects: { energy: -10, form: -3, health: -3 },
                }),
            },
        ],
    },
    {
        id: 'pg_warmup',
        weight: 13,
        type: 'match',
        icon: '\u{1F3AE}',
        title: 'The Warm-Up Game',
        text: 'One custom against the coaching staff that nobody needs. You go zero and four in eight minutes and everybody in the booth carefully pretends not to have seen it.',
        when: (c, ctx) => !!ctx,
        options: [
            {
                id: 'laugh',
                label: 'Be first to laugh at it',
                desc: 'Say it out loud before the room does.',
                apply: () => ({
                    text: 'You call yourself something rude on the open comms and the whole booth goes. It stops being a thing anybody is going to bring up later.',
                    effects: { chemistry: 5, morale: 4, form: -2 },
                }),
            },
            {
                id: 'again',
                label: 'Ask for one more custom',
                desc: 'Do not walk on stage after that.',
                apply: () => ({
                    text: 'Eleven more minutes and you win the lane comfortably against a coach who is not trying. It should not help and it does.',
                    effects: { form: 4, energy: -4 },
                }),
            },
            {
                id: 'stop',
                label: 'Stop warming up entirely',
                desc: 'The last thing you do should not be bad.',
                apply: () => ({
                    text: 'You close the client twenty minutes early and sit with your hands on the desk. Your first ten minutes on stage are slow and everything after them is not.',
                    effects: { form: -3, morale: 4, energy: 5 },
                }),
            },
        ],
    },
    {
        id: 'pg_coach_note',
        weight: 12,
        type: 'training',
        icon: '\u{1F4A1}',
        title: 'One Sentence On The Whiteboard',
        text: 'The coach writes a single line on the board, puts the pen down and leaves the room. It is either the most useful thing anybody has said all week or it means nothing at all.',
        when: (c, ctx) => !!ctx && isSigned(c),
        options: [
            {
                id: 'build',
                label: 'Build the whole game around it',
                desc: 'If he wrote it, play it.',
                apply: () => ({
                    text: 'Everything you do for five hours points at one sentence. It is right in three games out of five, which is a better hit rate than most plans get.',
                    effects: { form: 5, chemistry: 4, morale: -2 },
                }),
            },
            {
                id: 'ask',
                label: 'Go and ask him what he meant',
                desc: 'Find him. Make him say it in full.',
                apply: () => ({
                    text: 'Nine minutes in a corridor and it turns out to mean something quite specific about the second drake. Nobody else in the room asked.',
                    effects: { attr: { knw: 1 }, form: 3, energy: -3 },
                }),
            },
            {
                id: 'own',
                label: 'Play your own game',
                desc: 'You know your lane better than the board does.',
                apply: () => ({
                    text: 'You do the thing you were going to do anyway and it works, twice. He does not mention it and he writes a different sentence next week.',
                    effects: { form: 3, chemistry: -4, morale: 3 },
                }),
            },
        ],
    },
    {
        id: 'pg_press_row',
        weight: 10,
        type: 'social',
        icon: '\u{1F4F8}',
        title: 'Caught On The Way In',
        text: (c, ctx) => `Somebody with a lanyard gets thirty seconds with you between the car and the door and asks how exactly you intend to beat ${String((ctx && ctx.opponentName) || 'them')}.`,
        when: (c, ctx) => !!ctx && !!ctx.opponentName,
        options: [
            {
                id: 'specific',
                label: 'Answer it specifically',
                desc: 'Tell him the actual plan. Some of it.',
                apply: () => ({
                    text: 'You give him two real sentences about the map and it is the only interesting thing on the pre-show. Their analyst watches it in the other green room.',
                    effects: { followers: 4000, form: -3, morale: 3 },
                }),
            },
            {
                id: 'nothing',
                label: 'Say nothing worth clipping',
                desc: 'Four words about respect and walk.',
                apply: () => ({
                    text: 'You say the thing everybody says. Nobody uses it, nobody learns anything, and you are inside the building eleven seconds sooner.',
                    effects: { form: 3, followers: 500 },
                }),
            },
            {
                id: 'bold',
                label: 'Say you are going to win 3-0',
                desc: 'On camera, with your name under it.',
                apply: () => ({
                    text: 'It is the graphic on the broadcast within the hour and it is on the screen behind the desk whatever the score ends up being.',
                    effects: { followers: 7000, morale: 5, form: -3, chemistry: -3 },
                }),
            },
        ],
    },
    {
        id: 'pg_hotel_alarm',
        weight: 9,
        type: 'drama',
        icon: '\u{1F6A8}',
        title: 'The Fire Alarm At Four',
        text: 'The hotel empties into a car park at ten past four in the morning for eleven minutes. The game is at two in the afternoon and nobody in the group gets back to sleep.',
        // A hotel means a bracket tie somewhere that is not home.
        when: (c, ctx) => !!ctx && ctx.kind === 'bracket',
        options: [
            {
                id: 'sleep',
                label: 'Go back up and force four more hours',
                desc: 'Curtains, phone off, nothing.',
                apply: () => ({
                    text: 'You get about two and a half of the four and they are bad ones. It is still two and a half more than the three of them who went for breakfast at five.',
                    effects: { energy: 5, form: -2 },
                }),
            },
            {
                id: 'write',
                label: 'Stay up and go through their draft',
                desc: 'You are awake anyway. Use it.',
                apply: () => ({
                    text: 'Four in the morning in a hotel lobby with a laptop and one other person who could not sleep either. You find something. You are wrecked by game three.',
                    effects: { form: 4, energy: -9, chemistry: 3 },
                }),
            },
            {
                id: 'nap',
                label: 'Move the whole day back two hours',
                desc: 'Tell the coach. Push everything.',
                apply: () => ({
                    text: 'The warm-up, the food and the meeting all slide and the staff are not happy about any of it. The five of you walk out having slept, which is the only number that mattered.',
                    effects: { energy: 8, chemistry: -4, morale: 3 },
                }),
            },
        ],
    },
];

// -------------------------------------------------------------------------
//  FIRST TIME AT A TOURNAMENT
//  One GUARANTEED entry per tournament kind - not weighted, not rolled, and no
//  `when` gate, because the engine owns the "have I seen this" fact and fires
//  it from addBracketFixture(), the one place the player's own tie becomes a
//  playable row. It happens once per career per tournament and the player has
//  spent real years getting to it, so there is no "nothing happens" option in
//  any of them.
//
//  The five keys are the five bracket kinds. Adding an event to the calendar
//  means adding it here too, or a whole tournament arrives silently the first
//  time somebody reaches it.
// -------------------------------------------------------------------------
export const FIRST_TIME_EVENTS = {
    spring_po: {
        id: 'first_time_spring_po',
        type: 'award',
        icon: '\u{1F3AB}',
        title: 'Your First Playoff Game',
        text: 'The table stops mattering on Friday. Everything you have done since January is now one bracket with your organisation somewhere in it, and the season is as long as you keep winning.',
        options: [
            {
                id: 'prepare',
                label: 'Spend every hour left on the opponent',
                desc: 'Sleep less. Know more. It is one week.',
                apply: () => ({
                    text: 'Four nights of their VODs and a page of notes nobody asked you for. You walk in knowing their jungler better than you know your own and you have not slept properly since Monday.',
                    effects: { form: 7, energy: -14, attr: { knw: 1 } },
                }),
            },
            {
                id: 'normal',
                label: 'Keep the week exactly as it was',
                desc: 'Same hours, same food, same everything.',
                apply: () => ({
                    text: 'You do the ordinary week on purpose, which takes more discipline than the other thing would have. On Friday you are the only person on the roster who is not visibly different.',
                    effects: { morale: 6, form: 4, chemistry: 4 },
                }),
            },
            {
                id: 'tell',
                label: 'Tell everybody at home to come',
                desc: 'Tickets, trains, a hotel you pay for.',
                apply: () => ({
                    text: 'Six people who have never been to one of these in a block of seats you bought. You can see exactly where they are from the stage and it does not settle you at all.',
                    effects: { gold: -400, morale: 9, form: -3 },
                }),
            },
        ],
    },
    summer_po: {
        id: 'first_time_summer_po',
        type: 'award',
        icon: '\u{1F947}',
        title: 'The Bracket That Decides The Year',
        text: 'Summer playoffs, and everything on the far side of them is decided in this building. Nobody in the room mentions what qualifying would mean and every single person in it has looked up the format.',
        options: [
            {
                id: 'say',
                label: 'Say the word out loud in the meeting',
                desc: 'Name what is actually on the other side.',
                apply: () => ({
                    text: 'You are the one who says it and the room goes completely quiet for about four seconds. Afterwards two of them thank you and one of them plays worse for a week.',
                    effects: { chemistry: 5, morale: 5, form: -3 },
                }),
            },
            {
                id: 'work',
                label: 'Put the whole thing into the practice room',
                desc: 'Ten-hour days until it is decided.',
                apply: () => ({
                    text: 'Nine days of the longest hours of your career and a scrim record nobody outside the building will ever see. Whatever happens on Saturday, you did the part that was yours.',
                    effects: { form: 8, energy: -16, health: -4 },
                }),
            },
            {
                id: 'steady',
                label: 'Make yourself the calm one',
                desc: 'Somebody has to be, and it is not the coach.',
                apply: () => ({
                    text: 'You take the two youngest players out of the building on the Wednesday and talk about nothing for three hours. One of them plays the best series of his life on Saturday.',
                    effects: { chemistry: 8, morale: 4, attr: { ldr: 1 }, energy: -5 },
                }),
            },
        ],
    },
    first_stand: {
        id: 'first_time_first_stand',
        type: 'award',
        icon: '\u{1F386}',
        title: 'First Stand',
        text: 'Six champions, one from each region, in February, before anybody has worked out what the patch is. You won a summer nine months ago and this is the thing it bought you.',
        options: [
            {
                id: 'scout',
                label: 'Watch all five of the others properly',
                desc: 'Two days of the whole year in one room.',
                apply: () => ({
                    text: 'You spend the first two days behind other people\'s chairs writing down what the rest of the world thinks is strong. It is worth most of the season to you.',
                    effects: { attr: { knw: 2 }, energy: -8, form: 3 },
                }),
            },
            {
                id: 'prove',
                label: 'Treat it as the final it is',
                desc: 'Six champions. One of them wins in February.',
                apply: () => ({
                    text: 'You play it like October and it is not October and that turns out not to matter. Whatever the result, nobody who watches it thinks your region got here by accident.',
                    effects: { form: 7, morale: 5, energy: -10 },
                }),
            },
            {
                id: 'enjoy',
                label: 'Let it be the first one',
                desc: 'Look at it. You are allowed to.',
                apply: () => ({
                    text: 'You take photographs like somebody who has not done this before, because you have not. The other five champions do exactly the same thing and pretend they are not.',
                    effects: { morale: 10, followers: 5000, form: -3 },
                }),
            },
        ],
    },
    msi: {
        id: 'first_time_msi',
        type: 'award',
        icon: '\u{1F30D}',
        title: 'Mid-Season',
        text: 'You won a split and the prize is a plane ticket in May. Half the teams you are about to meet have never heard of you and the other half have already watched every game you have played this year.',
        options: [
            {
                id: 'study',
                label: 'Learn the two regions you have never played',
                desc: 'A month of games in three days.',
                apply: () => ({
                    text: 'Sixty games at one and a half speed on a plane and in a hotel. You arrive understanding roughly what they do and having no idea at all what it feels like.',
                    effects: { attr: { knw: 2 }, energy: -10, form: 3 },
                }),
            },
            {
                id: 'scrim',
                label: 'Ask the best side here for scrims',
                desc: 'Be beaten by them privately first.',
                apply: () => ({
                    text: 'Two blocks against the best team in the tournament in which you win exactly one game. It is the most useful nine hours of the whole year and it is not enjoyable.',
                    effects: { form: 6, morale: -5, energy: -10, attr: { lne: 1 } },
                }),
            },
            {
                id: 'city',
                label: 'Go and look at the city for a day',
                desc: 'One day. You may never come back.',
                apply: () => ({
                    text: 'Eleven hours of somewhere you had only ever seen on a map, with two teammates and no phone signal. You are behind on prep and you remember the day for twenty years.',
                    effects: { morale: 10, energy: 5, form: -4 },
                }),
            },
        ],
    },
    worlds: {
        id: 'first_time_worlds',
        type: 'award',
        icon: '\u{1F3C6}',
        title: 'You Are Going To Worlds',
        text: (c) => `The bracket goes up with your organisation in it and you read your own name on it twice to be sure. You are ${ageOf(c)}, and every year of that has been pointed at this one thing.`,
        options: [
            {
                id: 'call',
                label: 'Call the people who bought the first computer',
                desc: 'The call you have been drafting since you were twelve.',
                apply: () => ({
                    text: 'It takes four attempts to say it in a sentence and the person on the other end is not able to say anything at all for a while. You are on the phone until three in the morning.',
                    effects: { morale: 10, energy: -4, legacy: 1 },
                }),
            },
            {
                id: 'work',
                label: 'Go straight back into the practice room',
                desc: 'Twenty-two teams. You are not here to attend.',
                apply: () => ({
                    text: 'You are the first one back in the building the next morning and you stay in it until the flights. Half the players who go to this tournament are there to have gone to it.',
                    effects: { form: 9, energy: -14, morale: -3, attr: { knw: 1 } },
                }),
            },
            {
                id: 'sit',
                label: 'Sit outside on your own for an hour',
                desc: 'No phone, nobody, just the fact of it.',
                apply: () => ({
                    text: 'An hour on a wall outside a building in the dark, not doing anything. Everything since you were thirteen was for a piece of paper with your organisation on it and now there is one.',
                    effects: { morale: 7, form: 5, attr: { cmp: 1 } },
                }),
            },
        ],
    },
};

// -------------------------------------------------------------------------
//  EVENT ROLLING
// -------------------------------------------------------------------------

/** Make sure the cooldown ledger exists on older saves. */
function ensureEventLog(c) {
    if (Array.isArray(c?.flags?.eventLog)) return c.flags.eventLog;
    career.update(x => (Array.isArray(x.flags?.eventLog)
        ? x
        : { ...x, flags: { ...x.flags, eventLog: [] } }));
    return [];
}

/** Weeks since this event last fired, or Infinity if it never has. */
export function weeksSinceEvent(c, id) {
    const log = (c?.flags?.eventLog) || [];
    let latest = -Infinity;
    for (const row of log) {
        if (row && row.id === id && Number(row.week) > latest) latest = Number(row.week);
    }
    if (!Number.isFinite(latest)) return Infinity;
    return absWeek(c) - latest;
}

/** Everything that could fire this week, cooldowns already applied. */
export function eligibleEvents(c) {
    return EVENT_POOL.filter(ev => {
        if (weeksSinceEvent(c, ev.id) < EVENT_COOLDOWN_WEEKS) return false;
        try { return ev.when ? !!ev.when(c) : true; } catch (_) { return false; }
    });
}

function weightedPick(pool) {
    let total = 0;
    for (const e of pool) total += Math.max(0, e.weight || 1);
    if (total <= 0) return pool[0] || null;
    let roll = Math.random() * total;
    for (const e of pool) {
        roll -= Math.max(0, e.weight || 1);
        if (roll <= 0) return e;
    }
    return pool[pool.length - 1];
}

/**
 * Roll the between-weeks event. Returns the event definition (not a copy) so
 * the caller can pass it straight back into applyEventOption(), or null on the
 * two weeks in three where nothing happens.
 */
export function rollWeeklyEvent(c, opts) {
    const state = c || snapshot();
    if (!state || !state.created || state.flags?.retired) return null;
    ensureEventLog(state);

    // A named event, demanded rather than rolled for. Burnout uses this to put
    // the crisis event in front of a player who needs it: its escape branches
    // are already written, and behind the ordinary weekly chance somebody in
    // real trouble might simply never see them. Skips the roll and the cooldown
    // but NOT the `when` gate - an event whose own conditions do not hold is
    // still the wrong event.
    const forceId = opts && typeof opts.forceId === 'string' ? opts.forceId : '';
    if (forceId) {
        const forced = EVENT_POOL.find(e => e && e.id === forceId);
        if (!forced) return null;
        if (typeof forced.when === 'function' && !forced.when(state)) return null;
        return forced;
    }

    if (Math.random() >= WEEKLY_EVENT_CHANCE) return null;
    const pool = eligibleEvents(state);
    if (!pool.length) return null;
    return weightedPick(pool);
}

/**
 * Every event this week, 0 to 2 of them, never null and never holding a falsy
 * entry. The first is exactly rollWeeklyEvent(); the second is a WEEKLY_SECOND_
 * EVENT_CHANCE roll off the same eligible pool with the id already drawn taken
 * out, so a bad week can be two things and can never be the same thing twice.
 *
 * rollWeeklyEvent keeps its own signature and behaviour unchanged: careerSmoke
 * and careerRender both call it directly, and the forced-event path (burnout)
 * still goes through it.
 */
export function rollWeeklyEvents(c, opts) {
    const first = rollWeeklyEvent(c, opts);
    if (!first) return [];

    if (Math.random() >= WEEKLY_SECOND_EVENT_CHANCE) return [first];
    const state = c || snapshot();
    const pool = eligibleEvents(state).filter(ev => ev && ev.id !== first.id);
    if (!pool.length) return [first];
    const second = weightedPick(pool);
    return second ? [first, second] : [first];
}

/**
 * A pool entry's `text` may be a function so a pre-game line can name the
 * opponent or the stage. It is resolved HERE rather than at render time,
 * because the shallow copy is what the UI keeps and a function left inside it
 * would be re-run later against a career that has already moved on. Anything
 * that throws or hands back a non-string falls back to the entry's own title,
 * which is never empty - careerRender fails a render containing the literal
 * word 'undefined'.
 */
function resolveText(entry, c, ctx) {
    const t = entry && entry.text;
    if (typeof t === 'string' && t) return t;
    if (typeof t === 'function') {
        try {
            const s = t(c, ctx);
            if (typeof s === 'string' && s) return s;
        } catch (_) { /* falls through to the title */ }
    }
    return (entry && entry.title) || '';
}

/**
 * The hours before a major game. `ctx` is built by engine.js from the fixture
 * itself - { phase, phaseName, label, opponentId, opponentName, bestOf, kind } -
 * and every field is already defaulted there, so a gate may read it directly.
 *
 * Returns a SHALLOW COPY with `text` resolved to a string and a `pregame`
 * marker, never the pool object. rollWeeklyEvent hands back the live definition
 * and that is documented above as a hazard; writing a resolved `text` onto it
 * would mutate the pool for the rest of the session and pin one opponent's name
 * into every future firing of the same entry.
 */
export function rollPreGameEvent(c, ctx) {
    const state = c || snapshot();
    if (!state || !state.created || state.flags?.retired) return null;
    if (!ctx || typeof ctx !== 'object') return null;
    if (Math.random() >= PREGAME_CHANCE) return null;

    const pool = PREGAME_POOL.filter(ev => {
        if (!ev) return false;
        if (weeksSinceEvent(state, ev.id) < EVENT_COOLDOWN_WEEKS) return false;
        try { return ev.when ? !!ev.when(state, ctx) : true; } catch (_) { return false; }
    });
    if (!pool.length) return null;

    const pick = weightedPick(pool);
    if (!pick) return null;
    return { ...pick, text: resolveText(pick, state, ctx), pregame: true };
}

/**
 * The guaranteed one, the first time a career reaches a given tournament. No
 * roll, no cooldown and no `when` - the engine writes flags.firstSeen[kind] and
 * that flag is the whole gate. Shallow copy for the same reason as above.
 */
export function firstTimeEvent(c, kind) {
    const def = FIRST_TIME_EVENTS[kind];
    if (!def) return null;
    const state = c || snapshot();
    return { ...def, text: resolveText(def, state, null), firstTime: true };
}

function recordEvent(id) {
    career.update(c => {
        const log = Array.isArray(c.flags?.eventLog) ? c.flags.eventLog : [];
        const week = absWeek(c);
        // 60 entries is comfortably more than the cooldown window needs, and
        // keeps the save from growing forever across a ten-year career.
        return { ...c, flags: { ...c.flags, eventLog: [...log, { id, week }].slice(-60) } };
    });
}

// -------------------------------------------------------------------------
//  EFFECTS
// -------------------------------------------------------------------------

/** Clamp an authored effects object to the balance contract. A typo in a pool
 *  entry should cost the player a point, not a career. */
function capEffects(raw) {
    const e = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const m of METERS) {
        const lim = m === 'energy' ? CAP.energy : CAP.meter;
        if (typeof e[m] === 'number' && e[m] !== 0) out[m] = Math.round(clamp(e[m], -lim, lim));
    }
    if (typeof e.chemistry === 'number' && e.chemistry !== 0) {
        out.chemistry = Math.round(clamp(e.chemistry, -CAP.meter, CAP.meter));
    }
    if (typeof e.gold === 'number' && e.gold !== 0) out.gold = Math.round(clamp(e.gold, -CAP.gold, CAP.gold));
    if (typeof e.followers === 'number' && e.followers !== 0) {
        out.followers = Math.round(clamp(e.followers, -CAP.followers, CAP.followers));
    }
    if (typeof e.hype === 'number' && e.hype !== 0) out.hype = Math.round(clamp(e.hype, -CAP.followers, CAP.followers));
    if (typeof e.legacy === 'number' && e.legacy !== 0) out.legacy = Math.round(clamp(e.legacy, -CAP.legacy, CAP.legacy));
    if (typeof e.mmr === 'number' && e.mmr !== 0) out.mmr = Math.round(clamp(e.mmr, -CAP.mmr, CAP.mmr));

    if (e.attr && typeof e.attr === 'object') {
        const attr = {};
        for (const k of ATTR_KEYS) {
            const v = Number(e.attr[k]);
            if (Number.isFinite(v) && v !== 0) attr[k] = Math.round(clamp(v, -CAP.attr, CAP.attr));
        }
        if (Object.keys(attr).length) out.attr = attr;
    }

    // Same shape discipline as `attr`: an OBJECT keyed by language id, and an
    // id outside LANGUAGE_IDS is dropped rather than written. Dropping is the
    // right direction - a typo becomes nothing instead of becoming a language
    // nobody can see, learn or spend.
    if (e.language && typeof e.language === 'object') {
        const lang = {};
        for (const id of LANGUAGE_IDS) {
            const v = Number(e.language[id]);
            if (Number.isFinite(v) && v !== 0) lang[id] = Math.round(clamp(v, -CAP.language, CAP.language));
        }
        if (Object.keys(lang).length) out.language = lang;
    }

    if (e.statusChange && SQUAD_STATUS[e.statusChange]) out.statusChange = e.statusChange;
    if (typeof e.flag === 'string' && e.flag) out.flag = e.flag;
    if (typeof e.unflag === 'string' && e.unflag) out.unflag = e.unflag;
    return out;
}

function readSnapshotFields(c) {
    const p = PL(c);
    const attrs = {};
    for (const k of ATTR_KEYS) attrs[k] = Number(p.attrs?.[k]) || 0;
    // Read through languageLevelFor so a save that predates the field, or one
    // whose map has rotted, reads as a row of zeroes rather than making the
    // whole before/after diff NaN.
    const languages = {};
    for (const id of LANGUAGE_IDS) languages[id] = languageLevelFor(c, id);
    return {
        gold: Number(c?.money?.gold) || 0,
        followers: Number(c?.money?.followers) || 0,
        legacy: Number(c?.money?.legacy) || 0,
        form: Number(p.form) || 0,
        morale: Number(p.morale) || 0,
        energy: Number(p.energy) || 0,
        health: Number(p.health) || 0,
        chemistry: Number(p.chemistry) || 0,
        hype: Number(p.hype) || 0,
        mmr: Number(c?.soloq?.mmr) || 0,
        status: p.status || 'sub',
        attrs,
        languages,
    };
}

/**
 * Push an effects object through the store's primitive mutators and report what
 * actually landed. The report is a diff of before/after rather than a copy of
 * the request, so a meter that was already at 100 or an attribute already at its
 * potential ceiling honestly shows as no change.
 */
function applyEffects(rawEffects) {
    const e = capEffects(rawEffects);
    const before = readSnapshotFields(snapshot());

    if (e.gold) grantGold(e.gold);
    if (e.followers) grantFollowers(e.followers);
    if (e.legacy > 0) grantLegacy(e.legacy);
    else if (e.legacy < 0) spendLegacy(-e.legacy);

    for (const m of METERS) if (e[m]) adjustCondition(m, e[m]);

    if (e.attr) {
        for (const k of Object.keys(e.attr)) {
            const n = e.attr[k];
            // Positive gains go through the same curve training uses, so an
            // event can never push a player past their potential ceiling.
            if (n > 0) applyAttrGain(k, n);
            else setAttr(k, before.attrs[k] + n);
        }
    }

    if (e.chemistry) {
        career.update(c => ({
            ...c,
            player: { ...c.player, chemistry: clamp((c.player.chemistry || 0) + e.chemistry, 0, 100) },
        }));
    }

    // A plain clamped write in both directions, and the existing level is added
    // to UNROUNDED: languages are fractional for the same reason attrs are, and
    // rounding here would throw away the tenths that weekly immersion pays in.
    if (e.language) {
        career.update(c => {
            const cur = c.player && c.player.languages && typeof c.player.languages === 'object'
                ? c.player.languages : {};
            const next = { ...cur };
            for (const id of Object.keys(e.language)) {
                const base = Number(next[id]);
                next[id] = clamp((Number.isFinite(base) ? base : 0) + e.language[id], 0, LANGUAGE_MAX);
            }
            return { ...c, player: { ...c.player, languages: next } };
        });
    }

    // grantFollowers already moves hype in lockstep; a bare `hype` effect is for
    // the rarer case of visibility moving without the follower count following.
    if (e.hype) {
        career.update(c => ({
            ...c,
            player: { ...c.player, hype: Math.max(0, (c.player.hype || 0) + e.hype) },
        }));
    }

    if (e.mmr) {
        career.update(c => {
            const next = clamp((c.soloq.mmr || 0) + e.mmr, 0, MMR_MAX);
            return { ...c, soloq: { ...c.soloq, mmr: next, peakMMR: Math.max(c.soloq.peakMMR || 0, next) } };
        });
    }

    if (e.statusChange) {
        career.update(c => ({ ...c, player: { ...c.player, status: e.statusChange } }));
    }

    if (e.flag) career.update(c => ({ ...c, flags: { ...c.flags, [e.flag]: true } }));
    if (e.unflag) career.update(c => ({ ...c, flags: { ...c.flags, [e.unflag]: false } }));

    const after = readSnapshotFields(snapshot());

    const applied = {};
    for (const k of ['gold', 'followers', 'legacy', 'form', 'morale', 'energy', 'health', 'chemistry', 'hype', 'mmr']) {
        const d = Math.round(after[k] - before[k]);
        if (d !== 0) applied[k] = d;
    }
    const attrDiff = {};
    for (const k of ATTR_KEYS) {
        const d = Math.round(after.attrs[k] - before.attrs[k]);
        if (d !== 0) attrDiff[k] = d;
    }
    if (Object.keys(attrDiff).length) applied.attr = attrDiff;
    const langDiff = {};
    for (const id of LANGUAGE_IDS) {
        const d = Math.round(after.languages[id] - before.languages[id]);
        if (d !== 0) langDiff[id] = d;
    }
    if (Object.keys(langDiff).length) applied.language = langDiff;
    if (after.status !== before.status) applied.statusChange = after.status;
    if (e.flag) applied.flag = e.flag;
    if (e.unflag) applied.unflag = e.unflag;

    return applied;
}

const METER_LABEL = {
    form: 'Form', morale: 'Morale', energy: 'Energy',
    health: 'Health', chemistry: 'Chemistry',
};

function signed(n) { return (n > 0 ? '+' : '-') + Math.abs(Math.round(n)); }

/**
 * Human label for a single effect. Accepts the effects-object keys and, for
 * convenience, a bare attribute key ('mec', 1) so a UI can render one line at
 * a time without unpacking `attr` first.
 *
 * `language` takes both forms for the same reason: describeEffect('language',
 * { ko: 5 }) renders "Korean +5" and joins a multi-language map with commas,
 * and a bare language id (describeEffect('ko', 5)) renders the same single
 * chip. Language ids and attribute keys cannot collide - one set is en/ko/zh/pt
 * and the other is the eight three-letter attributes.
 */
export function describeEffect(key, value) {
    if (value === 0 || value == null) return '';
    if (METER_LABEL[key]) return `${METER_LABEL[key]} ${signed(value)}`;
    if (key === 'gold') return `${value > 0 ? '+' : '-'}${fmtGold(Math.abs(value))} gold`;
    if (key === 'followers') return `Followers ${value > 0 ? '+' : '-'}${fmtFollowers(Math.abs(value))}`;
    if (key === 'hype') return `Hype ${value > 0 ? '+' : '-'}${fmtFollowers(Math.abs(value))}`;
    if (key === 'legacy') return `Legacy ${signed(value)}`;
    if (key === 'mmr') return `MMR ${signed(value)}`;
    if (key === 'statusChange') return `Now ${(SQUAD_STATUS[value] || {}).name || value}`;
    if (key === 'attr' && value && typeof value === 'object') {
        return ATTR_KEYS
            .filter(k => value[k])
            .map(k => `${ATTR_BY_KEY[k].abbr} ${signed(value[k])}`)
            .join(', ');
    }
    if (key === 'language' && value && typeof value === 'object') {
        return LANGUAGE_IDS
            .filter(id => value[id])
            .map(id => `${LANGUAGE_BY_ID[id].name} ${signed(value[id])}`)
            .join(', ');
    }
    if (ATTR_BY_KEY[key]) return `${ATTR_BY_KEY[key].abbr} ${signed(value)}`;
    if (LANGUAGE_BY_ID[key]) return `${LANGUAGE_BY_ID[key].name} ${signed(value)}`;
    return '';
}

/**
 * "Morale +6, Chemistry -4". Meters first because that is what the player is
 * watching, then attributes, then the accounting. Flags are deliberately
 * invisible - they are narrative bookkeeping, not a stat change.
 */
export function effectsSummary(effects) {
    const e = effects && typeof effects === 'object' ? effects : {};
    const parts = [];

    for (const k of ['form', 'morale', 'energy', 'health', 'chemistry']) {
        if (e[k]) parts.push(describeEffect(k, e[k]));
    }
    if (e.attr) {
        const s = describeEffect('attr', e.attr);
        if (s) parts.push(s);
    }
    // Sits with the attributes rather than with the accounting: a language is a
    // thing the player got better at, not a thing they were paid.
    if (e.language) {
        const s = describeEffect('language', e.language);
        if (s) parts.push(s);
    }
    if (e.gold) parts.push(describeEffect('gold', e.gold));
    if (e.followers) parts.push(describeEffect('followers', e.followers));
    // followers and hype move together through grantFollowers - reporting both
    // would just say the same thing twice.
    if (e.hype && e.hype !== e.followers) parts.push(describeEffect('hype', e.hype));
    if (e.legacy) parts.push(describeEffect('legacy', e.legacy));
    if (e.mmr) parts.push(describeEffect('mmr', e.mmr));
    if (e.statusChange) parts.push(describeEffect('statusChange', e.statusChange));

    const out = parts.filter(Boolean).join(', ');
    return out || 'No change';
}

function accentFor(type) {
    return (NEWS_TYPES[type] || NEWS_TYPES.system).accent;
}

// -------------------------------------------------------------------------
//  RESOLVING AN EVENT
// -------------------------------------------------------------------------

/**
 * Resolve the player's choice: run the option's pure apply(), push the effects
 * through the store, write the news entry and the week log, and put the event
 * on cooldown. Returns { text, effects, applied, summary } - `effects` is what
 * the option promised, `applied` is what the save actually took.
 */
export function applyEventOption(event, optionId) {
    if (!event || !Array.isArray(event.options) || !event.options.length) return null;
    const opt = event.options.find(o => o.id === optionId) || event.options[0];
    const c = snapshot();

    let outcome = {};
    try {
        outcome = (typeof opt.apply === 'function' ? opt.apply(c) : null) || {};
    } catch (_) {
        outcome = {};
    }

    const effects = outcome.effects || {};
    const text = outcome.text || opt.desc || '';
    const applied = applyEffects(effects);
    const summary = effectsSummary(applied);

    recordEvent(event.id);
    const type = NEWS_TYPES[event.type] ? event.type : 'system';
    addNews(`${event.title} - ${text}`, type);
    logWeek(event.title, opt.label, accentFor(type));
    saveCareer();

    return { text, effects, applied, summary };
}

// -------------------------------------------------------------------------
//  INTERVIEWS
//  A press conference is a smaller, faster event: no branching apply(), just a
//  tone and a base effects object. The context (won, lost, MVP, big stage) is
//  what makes the same answer smart or stupid, and that lives in the tone layer
//  below rather than being written out four times per question.
// -------------------------------------------------------------------------
export const INTERVIEW_POOL = [
    {
        id: 'iv_win_comfortable',
        when: (c, ctx) => !!ctx?.won,
        question: 'That looked comfortable from the desk. Did it feel comfortable?',
        options: [
            { label: 'We were nervous until the second baron, honestly.', tone: 'humble', effects: { followers: 900, chemistry: 4, morale: 2 } },
            { label: 'It was comfortable. We knew the matchup.', tone: 'confident', effects: { followers: 2200, morale: 4, form: 2 } },
            { label: 'People had us losing 0-2 today. Ask them.', tone: 'defiant', effects: { followers: 3400, morale: 5, chemistry: -3 } },
            { label: 'Ask the coach. He drafted it, we just played it.', tone: 'deflect', effects: { followers: 700, chemistry: 6 } },
        ],
    },
    {
        id: 'iv_loss_game_three',
        // There is no game three in a regular-season Bo1. Ask for a series, or
        // failing a scoreline to read, for the stage that only plays series.
        when: (c, ctx) => !!ctx?.lost && (!!ctx?.series || !!ctx?.big),
        question: 'What went wrong in game three?',
        options: [
            { label: 'I threw it. That is the answer.', tone: 'humble', effects: { morale: -3, chemistry: 6, followers: 1200 } },
            { label: 'Nothing structural. We were better and we lost.', tone: 'confident', effects: { followers: 1400, form: 2 } },
            { label: 'We will beat them in three weeks. Write that down.', tone: 'defiant', effects: { followers: 2600, morale: 4, form: 3 } },
            { label: 'The draft put us in a bad spot before we started.', tone: 'deflect', effects: { followers: 1100, chemistry: -5, morale: 2 } },
        ],
    },
    {
        id: 'iv_mvp',
        // "MVP again" needs a second one. The defiant answer claims last year's
        // league MVP as well, and the options carry no gate of their own - the
        // index into this array is what applyInterviewAnswer resolves - so the
        // completed-prior-season term has to live up here on the question.
        when: (c, ctx) => !!ctx?.mvp
            && (Number(c?.totals?.mvps) || 0) >= 2
            && historyOf(c).length >= 2,
        question: 'MVP again. Are you the best player in this league right now?',
        options: [
            { label: 'No. I am playing well on a team that is playing well.', tone: 'humble', effects: { followers: 1400, chemistry: 7, morale: 3 } },
            { label: 'Right now, on this form, yes.', tone: 'confident', effects: { followers: 4200, morale: 6, form: 3, chemistry: -2 } },
            { label: 'I was the best player in this league last year too.', tone: 'defiant', effects: { followers: 5200, morale: 5, chemistry: -5 } },
            { label: 'My support has been the best player on this team all split.', tone: 'deflect', effects: { followers: 1600, chemistry: 9, morale: 2 } },
        ],
    },
    {
        id: 'iv_losing_streak',
        // "That is three in a row" - so read three in a row off the schedule.
        when: (c, ctx) => !!ctx?.lost && losingStreak(c, 3) && formOf(c) <= 45,
        question: 'That is three in a row. Is something broken in this team?',
        options: [
            { label: 'Something is broken and most of it is me.', tone: 'humble', effects: { morale: -5, chemistry: 8, followers: 1800 } },
            { label: 'Nothing is broken. We are two patches from being fine.', tone: 'confident', effects: { followers: 1500, chemistry: 3 } },
            { label: 'Come back and ask me this in playoffs.', tone: 'defiant', effects: { followers: 3000, morale: 4, form: 3, chemistry: -4 } },
            { label: 'That is a question for the coaching staff.', tone: 'deflect', effects: { followers: 900, chemistry: -6, morale: 1 } },
        ],
    },
    {
        id: 'iv_semifinal_preview',
        when: (c, ctx) => !!ctx?.big,
        question: 'You play them in the semi-final. How do you beat them?',
        options: [
            { label: 'By being better than we were the last time.', tone: 'humble', effects: { followers: 1000, chemistry: 4, form: 2 } },
            { label: 'Their jungle pathing is readable. We have read it.', tone: 'confident', effects: { followers: 3200, form: 4, morale: 3, chemistry: -2 } },
            { label: 'The same way we beat them in the group stage.', tone: 'defiant', effects: { followers: 3600, morale: 4, chemistry: -3 } },
            { label: 'The analysts have a plan. I just play my lane.', tone: 'deflect', effects: { followers: 800, chemistry: 5 } },
        ],
    },
    {
        id: 'iv_worlds_stage',
        // "First time on this stage" fired every year of a fifteen-year career,
        // to four-time champions, and to players whose club never qualified.
        // Needs a seat at this international, no international behind it, and a
        // player young enough for "the veterans carried us" to be true.
        when: c => INTL_PHASES.includes(phaseIdOf(c))
            && onBigStage(c)
            && !everPlayedInternational(c)
            && ageOf(c) <= 23,
        question: 'First time on this stage. Is it bigger than you expected?',
        options: [
            { label: 'It is enormous. I could not hear my own keyboard.', tone: 'humble', effects: { followers: 2600, morale: 4, chemistry: 3 } },
            { label: 'It is a computer in a chair. Same game.', tone: 'confident', effects: { followers: 3000, form: 3, morale: 3 } },
            { label: 'We are not here to enjoy the venue.', tone: 'defiant', effects: { followers: 3400, form: 4, chemistry: -3, morale: 2 } },
            { label: 'The veterans on the team carried us through the nerves.', tone: 'deflect', effects: { followers: 1200, chemistry: 8 } },
        ],
    },
    {
        id: 'iv_rival_bo5',
        // "Still never beaten him" and "that is the record" need a record. Sixty
        // professional games is roughly two full splits of one.
        when: (c, ctx) => !!ctx?.big && !!ctx?.lost && gamesOf(c) >= 60,
        question: 'You have still never beaten him in a best-of-five.',
        options: [
            { label: 'He is better than me in a Bo5. That is the record.', tone: 'humble', effects: { morale: -4, followers: 2000, chemistry: 4, attr: { cmp: 1 } } },
            { label: 'There will be another one. I am fine about it.', tone: 'confident', effects: { followers: 1600, form: 2 } },
            { label: 'Ask me that at the end of next year.', tone: 'defiant', effects: { followers: 4000, morale: 5, form: 4, chemistry: -3 } },
            { label: 'It is five people against five people, not two.', tone: 'deflect', effects: { followers: 1000, chemistry: 5, morale: 1 } },
        ],
    },
    {
        id: 'iv_benched',
        when: c => ['sub', 'benched', 'rotation'].includes(PL(c).status),
        question: 'You have been out of the starting lineup. What changed?',
        options: [
            { label: 'I was not good enough. I am closer now.', tone: 'humble', effects: { chemistry: 7, morale: -3, followers: 1200 } },
            { label: 'Nothing changed. I should have been playing.', tone: 'confident', effects: { followers: 2400, morale: 5, chemistry: -4 } },
            { label: 'Somebody made a decision. It was the wrong one.', tone: 'defiant', effects: { followers: 3600, morale: 6, chemistry: -9 } },
            { label: 'That is between me and the coach.', tone: 'deflect', effects: { followers: 700, chemistry: 3, morale: 1 } },
        ],
    },
    {
        id: 'iv_transfer_rumour',
        when: c => contractExpiring(c) || flagOf(c, 'transferInterest'),
        question: 'There are rumours. Are you here next year?',
        options: [
            { label: 'I am here now. That is all I can tell you.', tone: 'humble', effects: { followers: 1500, chemistry: 3 } },
            { label: 'I will play wherever I am the most useful.', tone: 'confident', effects: { followers: 2800, chemistry: -3, morale: 3 } },
            { label: 'That depends entirely on the offer in front of me.', tone: 'defiant', effects: { followers: 4400, chemistry: -7, morale: 5, flag: 'transferInterest' } },
            { label: 'You would have to ask my agent.', tone: 'deflect', effects: { followers: 1300, chemistry: -2 } },
        ],
    },
    {
        id: 'iv_teenager',
        // The question hardcodes seventeen and asserts a starting spot in a
        // league, so it fires at exactly seventeen and only with a club.
        when: c => isSigned(c) && ageOf(c) === 17,
        question: 'You are seventeen and you are starting in this league. Does it feel too fast?',
        options: [
            { label: 'Every day. I am mostly trying to keep up.', tone: 'humble', effects: { followers: 2200, chemistry: 5, morale: 3 } },
            { label: 'No. I have been ready for two years.', tone: 'confident', effects: { followers: 3600, morale: 5, form: 2, chemistry: -2 } },
            { label: 'Ask the people who said I was too young.', tone: 'defiant', effects: { followers: 4200, morale: 4, chemistry: -4 } },
            { label: 'The older guys have made it easy for me.', tone: 'deflect', effects: { followers: 1300, chemistry: 8, morale: 2 } },
        ],
    },
    {
        id: 'iv_veteran',
        when: c => ageOf(c) >= 26,
        question: 'You are the oldest player on this roster now. What does that change?',
        options: [
            { label: 'My hands. Everything else got better.', tone: 'humble', effects: { followers: 2000, chemistry: 6, legacy: 1 } },
            { label: 'Nothing. I am still the best player in this room.', tone: 'confident', effects: { followers: 3000, morale: 5, form: 3, chemistry: -3 } },
            { label: 'People have been writing me off for four years.', tone: 'defiant', effects: { followers: 3800, morale: 5, form: 3, chemistry: -3 } },
            { label: 'It means I do the talking so they can play.', tone: 'deflect', effects: { followers: 1200, chemistry: 8, attr: { ldr: 1 } } },
        ],
    },
    {
        id: 'iv_banned_out',
        // Nine professional bans in a row need nine professional games. Hype
        // alone is earnable from a bedroom with zero of them.
        when: c => !!PL(c).champion && gamesOf(c) >= 9 && hypeOf(c) >= 3000,
        question: 'They have banned your signature pick nine games in a row. Respect, or a problem?',
        options: [
            { label: 'A problem. I need more than one champion.', tone: 'humble', effects: { followers: 1200, chemistry: 3, attr: { chp: 1 } } },
            { label: 'It is respect, and they are still losing.', tone: 'confident', effects: { followers: 2800, morale: 4, form: 2 } },
            { label: 'They can ban it. It does not fix their bot lane.', tone: 'defiant', effects: { followers: 4000, morale: 4, chemistry: -4 } },
            { label: 'It opens something up for somebody else on my team.', tone: 'deflect', effects: { followers: 1000, chemistry: 7 } },
        ],
    },
    {
        id: 'iv_call_credit',
        // A jungler cannot be quoted praising their own jungler.
        when: (c, ctx) => !!ctx?.won && !!ctx?.big && PL(c).role !== 'JNG',
        question: 'Your jungler said the baron call was yours. Was it?',
        options: [
            { label: 'We all said it at the same time, honestly.', tone: 'humble', effects: { followers: 1100, chemistry: 7, morale: 2 } },
            { label: 'It was mine, and it was the right one.', tone: 'confident', effects: { followers: 2600, morale: 4, attr: { ldr: 1 }, chemistry: -2 } },
            { label: 'It was mine. It is usually mine.', tone: 'defiant', effects: { followers: 3200, morale: 4, chemistry: -6 } },
            { label: 'He set it up. I just said the word.', tone: 'deflect', effects: { followers: 900, chemistry: 8 } },
        ],
    },
    {
        id: 'iv_crowd',
        when: (c, ctx) => !!ctx?.big,
        question: 'The crowd was extremely loud tonight. Do you hear them at all?',
        options: [
            { label: 'Only between games. It is why we do it.', tone: 'humble', effects: { followers: 2400, morale: 5, chemistry: 3 } },
            { label: 'I heard them when I hit the flank.', tone: 'confident', effects: { followers: 3400, morale: 5, form: 2 } },
            { label: 'They were loud for the other team. That helped.', tone: 'defiant', effects: { followers: 3000, morale: 3, form: 3, chemistry: -2 } },
            { label: 'The headsets are very good these days.', tone: 'deflect', effects: { followers: 1500, morale: 2 } },
        ],
    },
    {
        id: 'iv_slump',
        when: c => formOf(c) <= 38 && ageOf(c) >= 23,
        question: 'Your numbers are the worst of your career. What do you say to the people who think you are finished?',
        options: [
            { label: 'That the numbers are real and I have to fix them.', tone: 'humble', effects: { morale: -4, chemistry: 6, form: 3, followers: 1800 } },
            { label: 'I have been through a worse split than this one.', tone: 'confident', effects: { followers: 2200, morale: 4, form: 2 } },
            { label: 'I will still be here when they have moved on to somebody else.', tone: 'defiant', effects: { followers: 4200, morale: 6, form: 4, chemistry: -4 } },
            { label: 'Nothing. I do not read it.', tone: 'deflect', effects: { followers: 900, morale: 2, attr: { cmp: 1 } } },
        ],
    },
    {
        id: 'iv_bad_numbers',
        // "You died more times than anybody" is a question about a scoreline, so
        // it reads the series KDA the match engine summed rather than the result.
        // `rating > 0` is the same guard `heavy` uses: a result that carries no
        // per-match rating is a player who did not play, and ctx.kda would read
        // as 0 for them.
        when: (c, ctx) => !!ctx?.lost && !!ctx?.badKda && (Number(ctx?.rating) || 0) > 0,
        question: 'You died more times tonight than anybody on either team. What happened?',
        options: [
            { label: 'I was too far forward all night. That is the whole answer.', tone: 'humble', effects: { morale: -3, chemistry: 6, followers: 1300 } },
            { label: 'Look at the map at those timers, not the scoreboard.', tone: 'confident', effects: { followers: 1800, morale: 3, chemistry: -2 } },
            { label: 'Count the ones that bought us something. Then ask me again.', tone: 'defiant', effects: { followers: 2600, morale: 4, chemistry: -5 } },
            { label: 'I played the only role that draft left for me.', tone: 'deflect', effects: { followers: 1000, chemistry: -6, morale: 2 } },
        ],
    },
    {
        id: 'iv_ugly_win',
        // Won it and still had the worst line on the team. The only version of
        // this question that is not simply an insult after a defeat.
        when: (c, ctx) => !!ctx?.won && !!ctx?.badKda && (Number(ctx?.rating) || 0) > 0,
        question: 'You won, and your own numbers were the worst on your team. Does that sit badly?',
        options: [
            { label: 'It sits badly. We won and I was carried.', tone: 'humble', effects: { morale: -4, chemistry: 8, followers: 1400 } },
            { label: 'The four of them needed somebody to soak it. That was the plan.', tone: 'confident', effects: { followers: 1700, chemistry: 4, morale: 2 } },
            { label: 'There is one number on the broadcast at the end and we were on the right side of it.', tone: 'defiant', effects: { followers: 2400, morale: 4, chemistry: -4 } },
            { label: 'Ask the coach what my job was tonight.', tone: 'deflect', effects: { followers: 900, chemistry: 3, morale: 1 } },
        ],
    },
];

export const INTERVIEW_BY_ID = INTERVIEW_POOL.reduce((m, q) => { m[q.id] = q; return m; }, {});

/**
 * Normalise whatever the match engine hands back. The engine is a sibling
 * module written in parallel, so this reads every plausible field name rather
 * than assuming one.
 */
function matchCtx(matchResult, c) {
    const m = matchResult && typeof matchResult === 'object' ? matchResult : {};
    // Explicit, not inferred from the normalised fields below: a genuine engine
    // result that happens to report nothing is still a game that was played,
    // while doMedia() in a week with no match hands this a null. Without the
    // distinction the calendar alone made week 33 a "big stage" and an unsigned
    // thirteen-year-old got asked how they planned to win the semi-final.
    const played = matchResult != null && typeof matchResult === 'object';

    const won = m.won === true || m.win === true || m.result === 'win' || m.outcome === 'win';
    const lost = m.won === false || m.win === false || m.result === 'loss' || m.outcome === 'loss';
    const rating = Number(m.myRating ?? m.rating ?? m.playerRating ?? m.score ?? 0) || 0;
    const mvp = !!(m.mvp || m.isMVP || m.playerOfTheGame) || rating >= 9;
    const phase = m.phase || m.phaseId || phaseIdOf(c);
    // The phase only speaks for a match that exists. A missing result cannot
    // borrow the week's importance.
    const big = played
        && (!!(m.big || m.playoff || m.international) || BIG_STAGE.includes(phase));
    // Was this a series rather than a single game? completeMatch() writes
    // `score` as a [myGames, theirGames] pair for a Bo5 tie and null for a Bo1.
    const score = Array.isArray(m.score) ? m.score : null;
    const gameCount = score
        ? score.reduce((n, v) => n + (Number(v) || 0), 0)
        : Number(m.games) || 0;
    const series = played && (gameCount >= 3 || (Number(m.bestOf) || 0) >= 3);
    // A "heavy" defeat is a 0-x sweep or a personal disaster. An engine that
    // reports no per-match rating gets only the sweep, otherwise every routine
    // loss would draw a camera and interviews would fire twice as often as
    // intended.
    const heavy = (lost && rating > 0 && rating <= 4) || m.sweep === true;
    // The SERIES kda finishMatch already summed across every game of the tie:
    // { k, d, a }. Deaths of zero is a real scoreline rather than a divide by
    // zero, so it reads as the raw kills-plus-assists. Absent entirely reads as
    // 0, which means badKda is also true for a result that carries no numbers -
    // a benched player, say - so the two gates that use it below pair it with
    // `rating > 0`, the same "did this player actually play" test `heavy` uses.
    const kdaObj = m.kda && typeof m.kda === 'object' ? m.kda : null;
    const kdaK = Number(kdaObj?.k) || 0;
    const kdaD = Number(kdaObj?.d) || 0;
    const kdaA = Number(kdaObj?.a) || 0;
    const kda = kdaObj ? (kdaD > 0 ? (kdaK + kdaA) / kdaD : (kdaK + kdaA)) : 0;
    const badKda = played && kda < BAD_KDA_AT;
    return { played, won, lost, mvp, rating, phase, big, series, heavy, kda, badKda };
}

/**
 * Press after the game. Playoffs, internationals, MVP games and hammerings draw
 * a camera; a routine Tuesday in the regular season usually does not. Averaged
 * over a split this comes out near one interview every four matches.
 */
export function rollInterview(c, matchResult) {
    const state = c || snapshot();
    if (!state || !state.created || state.flags?.retired) return null;

    const ctx = matchCtx(matchResult, state);
    const notable = ctx.big || ctx.mvp || ctx.heavy;
    const chanceOf = notable ? INTERVIEW_CHANCE_NOTABLE : INTERVIEW_CHANCE_ROUTINE;
    if (Math.random() >= chanceOf) return null;

    const pool = INTERVIEW_POOL.filter(q => {
        try { return q.when ? !!q.when(state, ctx) : true; } catch (_) { return false; }
    });
    if (!pool.length) return null;

    const q = pool[randInt(0, pool.length - 1)];
    return { ...q, ctx };
}

// How the room reacts, by tone and by whether you just won. Used for the
// returned narration - the numbers are handled separately in toneAdjust().
const TONE_REACTION = {
    humble: {
        win: 'It is a dull answer and nobody misquotes a dull answer. Your coach reposts it.',
        loss: 'You take it on the chin in front of a camera, which the room notices and the internet mostly does not.',
    },
    confident: {
        win: 'It runs as the headline inside twenty minutes and the clip does numbers all evening.',
        loss: 'It reads very differently under a scoreline. The quote follows you for a fortnight.',
    },
    defiant: {
        win: 'Four thousand quote posts and one very annoyed opposing coach.',
        loss: 'The internet loves it. Two people in your own team are asked about it the next day.',
    },
    deflect: {
        win: 'A non-answer, delivered smoothly. The desk moves on and your teammates hear their names.',
        loss: 'You point at somebody else without saying a name, which everybody in the building can decode.',
    },
};

/**
 * Context turns an answer smart or stupid. The rules, in one place:
 *   - bragging after a loss costs morale and chemistry
 *   - defiance after a loss buys reach and a chip on the shoulder, at a price
 *   - humility never backfires: after a big win it just converts to followers
 *     more slowly than the loud answer would have
 *   - deflecting blame after a defeat annoys the room; deflecting credit after a
 *     win is the cheapest chemistry in the mode
 * Reach also scales with hype - the same sentence from a player with 200k
 * followers travels several times further than from a rookie.
 */
function toneAdjust(base, tone, ctx, c) {
    const e = { ...base };
    if (e.attr) e.attr = { ...e.attr };

    let followerMult = 1;
    const bump = (key, n) => { e[key] = (e[key] || 0) + n; };

    if (tone === 'confident') {
        if (ctx.lost) { bump('morale', -5); bump('chemistry', -4); followerMult *= 0.8; }
        else if (ctx.won) followerMult *= 1.25;
    } else if (tone === 'defiant') {
        if (ctx.lost) { bump('chemistry', -5); bump('form', 2); followerMult *= 1.4; }
        else { bump('chemistry', -2); followerMult *= 1.3; }
    } else if (tone === 'humble') {
        if (ctx.won && ctx.big) followerMult *= 0.6;
        // A humble answer never leaves the player worse off in the room.
        if ((e.chemistry || 0) < 0) e.chemistry = 0;
        if ((e.morale || 0) < -4) e.morale = -4;
    } else if (tone === 'deflect') {
        followerMult *= 0.7;
        if (ctx.lost) bump('chemistry', -3);
        if (ctx.won) bump('chemistry', 2);
    }

    if (ctx.mvp) followerMult *= 1.2;
    // Reach compounds: capped at 3x so a superstar's press week is loud without
    // becoming the only follower source that matters.
    followerMult *= 1 + Math.min(2, hypeOf(c) / 60000);

    if (e.followers) e.followers = Math.round(e.followers * followerMult);
    return e;
}

/**
 * Answer the question. Same contract as applyEventOption(): effects go through
 * the store, the answer lands in the news feed and the week log, and the caller
 * gets back what actually changed.
 */
export function applyInterviewAnswer(interview, optionIndex) {
    if (!interview || !Array.isArray(interview.options) || !interview.options.length) return null;
    const idx = clamp(Math.round(Number(optionIndex) || 0), 0, interview.options.length - 1);
    const opt = interview.options[idx];
    const c = snapshot();
    const ctx = interview.ctx || matchCtx(null, c);

    const base = typeof opt.effects === 'function' ? (opt.effects(c, ctx) || {}) : (opt.effects || {});
    const tuned = toneAdjust(base, opt.tone, ctx, c);

    const applied = applyEffects(tuned);
    const summary = effectsSummary(applied);
    const reaction = (TONE_REACTION[opt.tone] || TONE_REACTION.humble)[ctx.won ? 'win' : 'loss'];
    const text = `"${opt.label}" ${reaction}`;

    if (interview.id) recordEvent(interview.id);
    addNews(`Press conference - "${opt.label}"`, 'social');
    logWeek('Press Conference', opt.label, accentFor('social'));
    saveCareer();

    return { text, effects: tuned, applied, summary };
}
