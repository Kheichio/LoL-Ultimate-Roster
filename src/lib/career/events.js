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
//  Over a 10-year, 400-week career an event fires roughly every third week,
//  so these numbers compound into something real without ever being a shortcut.

import {
    NEWS_TYPES, ATTR_BY_KEY, ATTR_KEYS, SQUAD_STATUS, MMR_MAX,
    CHAMPION_BY_ID, phaseForWeek,
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

/** An event may not repeat inside this many weeks. Half a season - long enough
 *  that nobody sees "your jungler blames you" twice in one split. */
export const EVENT_COOLDOWN_WEEKS = 20;

/** Notable matches (playoffs, internationals, MVP games, blowout losses) draw
 *  press. Routine regular-season games rarely do. Blended across a split this
 *  lands near the intended one interview per four matches. */
export const INTERVIEW_CHANCE_NOTABLE = 0.55;
export const INTERVIEW_CHANCE_ROUTINE = 0.10;

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
    // but NOT the `when` gate — an event whose own conditions do not hold is
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

    if (e.statusChange && SQUAD_STATUS[e.statusChange]) out.statusChange = e.statusChange;
    if (typeof e.flag === 'string' && e.flag) out.flag = e.flag;
    if (typeof e.unflag === 'string' && e.unflag) out.unflag = e.unflag;
    return out;
}

function readSnapshotFields(c) {
    const p = PL(c);
    const attrs = {};
    for (const k of ATTR_KEYS) attrs[k] = Number(p.attrs?.[k]) || 0;
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
    if (ATTR_BY_KEY[key]) return `${ATTR_BY_KEY[key].abbr} ${signed(value)}`;
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
    return { played, won, lost, mvp, rating, phase, big, series, heavy };
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
