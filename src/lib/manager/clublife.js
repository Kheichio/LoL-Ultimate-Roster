// ===========================================================================
//  ULTIMATE MANAGER -- club life
//
//  The parts of running a club around the matches, all for the MANAGER's club:
//    FANS        team.fans 0..100. Results, titles and relegation move it; it
//                scales base revenue (fanFactor) and feeds sponsor appeal. An
//                angry crowd (under ANGRY_FANS) leans on the board.
//    RIVALS      save.rivals = { teamId: heat }. Knockout defeats and repeat
//                meetings build heat; a rivalry (RIVAL_HEAT+) makes the next
//                meeting worth more fans, board and morale either way.
//    SCOUTING    a paid report on the next opponent: likely bans, comfort
//                picks, plan (save.oppScout = 'year:step:teamId').
//    PATCH NOTES each split's strong and weak champions, in the inbox.
//    PRESS       before a knockout series: promise a win, or play it down.
//                The answer is judged when the series is applied.
// ===========================================================================
import { clamp } from './util.js';
import { ROLE_IDS, REGION_LANGUAGE } from './data.js';
import { metaFor, CHAMPION_BY_ID } from '../career/constants.js';
import { sponsorIncome } from './market.js';

export const ANGRY_FANS = 25;
export const RIVAL_HEAT = 3;

const myTeam = (save) => (save.manager && save.manager.teamId ? save.teams[save.manager.teamId] : null);

// ---------------------------------------------------------------- fans
export function fansOf(team) {
    const v = Number(team && team.fans);
    return Number.isFinite(v) ? clamp(v, 0, 100) : clamp(Number(team && team.rep) || 40, 10, 90);
}
export function moveFans(team, d) {
    if (!team) return;
    team.fans = Math.round(clamp(fansOf(team) + d, 0, 100) * 10) / 10;
}
/** Base revenue scales with the crowd: 0.85x with nobody watching, 1.15x with a full house. */
export function fanFactor(team) {
    return 0.85 + fansOf(team) / 100 * 0.3;
}
export function fanWord(v) {
    return v >= 80 ? ['Adoring', '#34d399'] : v >= 60 ? ['Loyal', '#a3e635'] : v >= 40 ? ['Steady', '#fbbf24'] : v >= ANGRY_FANS ? ['Restless', '#fb923c'] : ['Angry', '#f87171'];
}

// ---------------------------------------------------------------- rivals
export const rivalHeat = (save, teamId) => Number((save.rivals || {})[teamId]) || 0;
export const isRival = (save, teamId) => rivalHeat(save, teamId) >= RIVAL_HEAT;

/**
 * The manager's series is over: fans, rivalry heat, and what a rivalry or a press
 * promise adds on top. `big` is a knockout. Returns lines for the step report.
 */
export function afterMySeries(save, oppId, won, big, kind, boardMove) {
    const t = myTeam(save);
    if (!t) return [];
    const notes = [];
    const rival = isRival(save, oppId);
    moveFans(t, (won ? 0.8 : -0.6) * (big ? 2 : 1) * (rival ? 2 : 1));
    save.rivals = { ...(save.rivals || {}) };
    save.rivals[oppId] = rivalHeat(save, oppId) + (big && !won ? 2 : 0.5);
    if (rival) {
        const opp = save.teams[oppId];
        for (const id of t.roster) { const p = save.players[id]; if (p) p.mor = clamp((Number(p.mor) || 65) + (won ? 3 : -3), 0, 100); }
        boardMove(save, won ? 2 : -2);
        notes.push(won ? `Beating your rivals ${opp ? opp.name : ''} lifts everyone.` : `Losing to your rivals ${opp ? opp.name : ''} stings the fans and the board.`);
    }
    // A promise made to the press before this series.
    if (save.pressPromise && save.pressPromise.opp === oppId) {
        const pr = save.pressPromise;
        delete save.pressPromise;
        if (pr.kind === 'promise') {
            if (won) { moveFans(t, 3); notes.push('You promised a win and delivered. The fans love it.'); }
            else { moveFans(t, -5); boardMove(save, -5); notes.push('You promised a win and lost. The fans and the board remember.'); }
        }
    }
    return notes;
}

/** A title or a relegation for the manager's club. */
export const fansForTitle = (save, kind) => moveFans(myTeam(save), kind === 'worlds' ? 12 : kind === 'msi' ? 8 : kind === 'down' ? -10 : kind === 'promotion' ? 6 : 5);

// ---------------------------------------------------------------- opponent scouting
export function scoutCostFor(save) {
    const t = myTeam(save);
    const scoutRating = save.staff && save.staff.scout ? save.staff.scout.rating : 60;
    return t ? Math.round(sponsorIncome(save, t) * 0.004 * (1.3 - scoutRating / 200) / 1000) * 1000 : 0;
}
export const oppScoutKey = (save, oppId) => `${save.time.year}:${save.time.step}:${oppId}`;
export const oppScouted = (save, oppId) => save.oppScout === oppScoutKey(save, oppId);

// ---------------------------------------------------------------- patch notes
/** The split's strong and weak champions per role, as inbox text. */
export function patchNotes(year, split) {
    const meta = metaFor(year, split);
    const lines = [];
    for (const r of ROLE_IDS) {
        const ids = Object.entries(meta.byId || {});
        const of = (v) => ids.filter(([id, t]) => t === v && CHAMPION_BY_ID[id] && CHAMPION_BY_ID[id].roles[0] === r).map(([id]) => CHAMPION_BY_ID[id].name).slice(0, 4);
        const up = of(1), down = of(-1);
        if (up.length || down.length) lines.push(`${r}: ↑ ${up.join(', ') || '—'} · ↓ ${down.join(', ') || '—'}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------- staff
// Four backroom roles beside the head coach (team.coach). Each has a rating and a wage
// paid weekly with the bill. Candidates are drawn per transfer window and stay the same
// all window (seeded), so the list is a market, not a slot machine.
export const STAFF_ROLES = [
    { id: 'coach', name: 'Head coach', icon: 'academy', blurb: 'Training XP for everyone, and an edge in every game.' },
    { id: 'analyst', name: 'Analyst', icon: 'video', blurb: 'Reads the opponent: a small edge in every game (up to +0.5).' },
    { id: 'scout', name: 'Head scout', icon: 'search', blurb: 'Cheaper scouting reports on opponents and players.' },
    { id: 'psych', name: 'Sports psychologist', icon: 'heart', blurb: 'Lifts the morale of players who are down, every week.' },
    { id: 'physio', name: 'Physio', icon: 'shield', blurb: 'Fewer injuries, and quicker recoveries.' },
];
export const STAFF_ROLE_BY_ID = Object.fromEntries(STAFF_ROLES.map(x => [x.id, x]));
const STAFF_NAMES = ['Mentor', 'Atlas', 'Sage', 'Compass', 'Beacon', 'Keel', 'Forge', 'Lantern', 'Pilot', 'Harbor', 'Summit', 'Orion', 'Vale', 'Cairn', 'Quill', 'Ridge', 'Ember', 'North', 'Hollow', 'Drift'];
export function staffWage(save, rating) {
    const idx = Number(save.econ && save.econ.level) ? Math.pow(1.118, save.econ.level - 80) : 1;
    return Math.round(30000 * Math.pow(1.075, rating - 60) * idx / 1000) * 1000;
}
/** Who is available this window (or this half of the season outside one). */
export function staffCandidates(save, rngFor) {
    const half = save.time.step < 16 ? 'a' : 'b';
    const rng = rngFor('staff:' + save.seed + ':' + save.time.year + ':' + half);
    const out = {};
    for (const role of STAFF_ROLES) {
        out[role.id] = [0, 1, 2].map(i => {
            const rating = Math.round(55 + rng() * 37);
            const name = STAFF_NAMES[Math.floor(rng() * STAFF_NAMES.length)] + ['', '', 'x', 'o', ' Jr', 'Prime'][Math.floor(rng() * 6)];
            return { id: role.id + '-' + i, name, rating, wage: staffWage(save, rating) };
        }).sort((a, b) => b.rating - a.rating);
    }
    return out;
}
export const staffOf = (save, role) => (role === 'coach' ? (myTeam(save) || {}).coach || null : (save.staff || {})[role] || null);
export const staffRating = (save, role) => { const st = staffOf(save, role); return st ? Number(st.rating) || 60 : 50; };
/** What the backroom costs a year (the head coach included once hired through here). */
export function staffWages(save) {
    let w = 0;
    for (const r of STAFF_ROLES) { const st = staffOf(save, r.id); if (st && st.wage) w += st.wage; }
    return w;
}
export function hireStaff(save, roleId, cand) {
    const t = myTeam(save);
    if (!t || !STAFF_ROLE_BY_ID[roleId] || !cand) return { ok: false, msg: 'Nobody to hire.' };
    const signOn = Math.round(cand.wage * 0.25 / 1000) * 1000;
    if (signOn > save.finance.balance) return { ok: false, msg: `Hiring ${cand.name} costs ${Math.round(signOn / 1000)}K up front. You cannot afford it.` };
    save.finance.balance -= signOn;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Hired ${cand.name} (${STAFF_ROLE_BY_ID[roleId].name})`, amount: -signOn });
    const st = { name: cand.name, rating: cand.rating, wage: cand.wage, real: false, cid: null };
    if (roleId === 'coach') t.coach = st;
    else save.staff = { ...(save.staff || {}), [roleId]: st };
    return { ok: true, msg: `${cand.name} joins as your ${STAFF_ROLE_BY_ID[roleId].name.toLowerCase()} (${cand.rating}).` };
}
export function fireStaff(save, roleId) {
    if (roleId === 'coach') return { ok: false, msg: 'Hire a new head coach to replace this one.' };
    if (!(save.staff || {})[roleId]) return { ok: false, msg: 'Nobody in that role.' };
    const st = save.staff[roleId];
    save.staff = { ...save.staff };
    delete save.staff[roleId];
    return { ok: true, msg: `${st.name} has left the club.` };
}
/** The analyst's edge in a game, for the manager's side (sideFor). */
export const analystEdge = (save) => (save.staff && save.staff.analyst ? clamp((save.staff.analyst.rating - 60) / 60, 0, 0.5) : 0);

// ---------------------------------------------------------------- facilities
export const FACILITIES = [
    { id: 'training', name: 'Training centre', icon: 'dumbbell', blurb: 'Every player earns more XP from training: +7% a level.' },
    { id: 'house', name: 'Gaming house', icon: 'home', blurb: 'Better living: morale recovers every week, and players like signing for you.' },
    { id: 'studio', name: 'Streaming studio', icon: 'video', blurb: 'More streams and content: +6% base revenue a level.' },
];
export const FACILITY_MAX = 3;
export const facLevel = (team, id) => (team && team.fac ? clamp(Number(team.fac[id]) || 0, 0, FACILITY_MAX) : 0);
export function facilityCost(save, id) {
    const t = myTeam(save);
    const lv = facLevel(t, id);
    return lv >= FACILITY_MAX ? 0 : Math.round(sponsorIncome(save, t) * [0.25, 0.45, 0.7][lv] / 10000) * 10000;
}
/** What the facilities cost to run, a year. */
export function facilityUpkeep(save) {
    const t = myTeam(save);
    if (!t) return 0;
    const levels = FACILITIES.reduce((s, f) => s + facLevel(t, f.id), 0);
    return Math.round(sponsorIncome(save, t) * 0.015 * levels / 1000) * 1000;
}
export function upgradeFacility(save, id) {
    const t = myTeam(save);
    const f = FACILITIES.find(x => x.id === id);
    if (!t || !f) return { ok: false, msg: 'No such facility.' };
    if (facLevel(t, id) >= FACILITY_MAX) return { ok: false, msg: `${f.name} is already at its best.` };
    const cost = facilityCost(save, id);
    if (cost > save.finance.balance) return { ok: false, msg: `Upgrading the ${f.name.toLowerCase()} costs ${Math.round(cost / 1000)}K. You cannot afford it.` };
    save.finance.balance -= cost;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `${f.name} upgrade`, amount: -cost });
    t.fac = { ...(t.fac || {}), [id]: facLevel(t, id) + 1 };
    return { ok: true, msg: `${f.name} is now level ${t.fac[id]}.` };
}

// ---------------------------------------------------------------- injuries
// A small weekly chance per player at the manager's club: more for intense training
// and older players, less with a good physio. An injured player (p.inj, steps left)
// sits out (match.lineupOf) unless nobody healthy can cover.
/** Injury types (ids are save data in `p.injT`): weight, weeks out [min, max], and what raises the odds. */
export const INJURIES = [
    { id: 'illness', name: 'Illness', w: 30, weeks: [1, 2] },
    { id: 'wrist', name: 'Wrist strain', w: 24, weeks: [1, 3], hands: true },
    { id: 'back', name: 'Back pain', w: 18, weeks: [1, 4], age: true },
    { id: 'tendon', name: 'Tendonitis', w: 14, weeks: [3, 6], hands: true },
    { id: 'burnout', name: 'Burnout', w: 10, weeks: [2, 4], mood: true },
    { id: 'surgery', name: 'Hand surgery', w: 4, weeks: [6, 10], hands: true },
];
export const INJURY_BY_ID = Object.fromEntries(INJURIES.map(i => [i.id, i]));
export const injuryName = (p) => (p && p.inj > 0 ? (INJURY_BY_ID[p.injT] || INJURIES[0]).name : null);

/** A week of injuries for one club. `ai` clubs use an average physio and normal intensity. */
export function rollInjuries(save, team, rng, intensityXp, ai = false) {
    const notes = [];
    const physio = ai ? 60 : staffRating(save, 'physio');
    const rest = team.training === 'rest' ? 0.5 : 1;
    for (const id of team.roster) {
        const p = save.players[id];
        if (!p) continue;
        if (p.inj > 0) {
            // A good physio sometimes takes a week off the recovery.
            p.inj -= !ai && physio >= 75 && rng() < (physio - 70) / 60 ? 2 : 1;
            if (p.inj <= 0) { delete p.inj; delete p.injT; notes.push(`${p.name} is fit again.`); }
            continue;
        }
        const age = save.time.year - (Number(p.born) || save.time.year - 22);
        const ix = ai ? 1 : intensityXp(p);
        const chance = 0.005 * (ix > 1 ? 1.8 : ix < 1 ? 0.6 : 1) * (age >= 27 ? 1.3 : 1) * ((p.mor || 60) < 30 ? 1.4 : 1) * (1.2 - physio / 125) * rest;
        if (rng() < chance) {
            const pool = INJURIES.map(i => ({ i, w: i.w * (i.age && age >= 26 ? 2 : 1) * (i.mood && (p.mor || 60) < 35 ? 3 : 1) * (i.hands && ix > 1 ? 1.5 : 1) }));
            let r = rng() * pool.reduce((a, x) => a + x.w, 0);
            const inj = (pool.find(x => (r -= x.w) < 0) || pool[0]).i;
            const weeks = Math.max(1, Math.round((inj.weeks[0] + rng() * (inj.weeks[1] - inj.weeks[0])) * (1.2 - physio / 150)));
            p.inj = weeks;
            p.injT = inj.id;
            notes.push(`${p.name} is out with ${inj.name.toLowerCase()} for ${weeks} week${weeks === 1 ? '' : 's'}.`);
        }
    }
    return notes;
}

export { REGION_LANGUAGE };
