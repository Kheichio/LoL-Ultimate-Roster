// ===========================================================================
//  ULTIMATE MANAGER -- the clubs the manager does not run
//
//  AI clubs invest. Each has a war chest (`team.fund`): a share of its income every
//  year plus whatever it makes selling players. From it the club buys what the
//  manager buys: facility levels (`team.fac`, the same object), an academy
//  (`team.acaLevel`) and better staff (`team.staffLv` 0..3, which also moves its
//  coach). The club's personality decides what comes first.
//
//    training     more XP every week, exactly as at the manager's club
//    studio       more income
//    academy      a graduate most years, onto the roster as a young sub
//    staff        a better coach, and fewer injuries
//
//  Talent factories sell their best young players on for a profit once they are worth
//  something; dynasty builders train theirs and keep them (see market.js).
// ===========================================================================
import { REGION_LEVEL, ROLE_IDS, ROLE_MAX, ROSTER_MAX } from './data.js';
import { clamp, pick, randInt, shuffle, rngFor } from './util.js';
import { ovrOf, makeRandomPlayer } from './people.js';
import { sponsorIncome, clubStyle, roleCount, wageBill, baseWageBudget } from './market.js';
import { signTo, nextGenId } from './world.js';

const MAX = 3;
/** What each personality builds first. */
const PRIORITY = {
    balanced: ['training', 'staff', 'academy', 'studio', 'house'],
    youth: ['academy', 'training', 'staff', 'house', 'studio'],
    rich: ['studio', 'staff', 'training', 'house', 'academy'],
    loyal: ['house', 'staff', 'training', 'academy', 'studio'],
    stars: ['staff', 'studio', 'training', 'house', 'academy'],
    factory: ['training', 'academy', 'staff', 'studio', 'house'],
    dynasty: ['training', 'staff', 'house', 'academy', 'studio'],
};
const levelOf = (t, what) => (what === 'academy' ? Number(t.acaLevel) || 0 : what === 'staff' ? Number(t.staffLv) || 0 : Number((t.fac || {})[what]) || 0);
const costOf = (save, t, what) => sponsorIncome(save, t) * [0.3, 0.5, 0.75][levelOf(t, what)] * (what === 'academy' ? 1.1 : 1);

function raise(t, what) {
    if (what === 'academy') { t.acaLevel = levelOf(t, what) + 1; return; }
    if (what === 'staff') {
        t.staffLv = levelOf(t, what) + 1;
        if (t.coach) t.coach.rating = clamp((Number(t.coach.rating) || 70) + 2, 55, 96);
        return;
    }
    t.fac = { ...(t.fac || {}), [what]: levelOf(t, what) + 1 };
}

/**
 * Where a club stands at the start of a world: the big orgs are already built. An old
 * save (`restyle`) also gets its training clubs, because a club's style is stored and
 * the two training styles did not exist when it was drawn.
 */
export function seedClubs(save, { restyle = false } = {}) {
    for (const t of Object.values(save.teams)) {
        if (t.grown) continue;
        t.grown = true;
        if (t.id === (save.manager && save.manager.teamId)) continue;
        if (restyle && !t.custom && t.style === 'balanced') {
            const roll = rngFor('restyle:' + t.id)();
            if (roll < 0.25) t.style = 'factory';
            else if (roll < 0.45) t.style = 'dynasty';
        }
        const rep = Number(t.rep) || 30;
        const lv = rep >= 80 ? 2 : rep >= 55 ? 1 : 0;
        const order = PRIORITY[clubStyle(t).id] || PRIORITY.balanced;
        order.forEach((what, i) => {
            const n = clamp(lv + (i === 0 ? 1 : 0) - (i >= 3 ? 1 : 0), 0, MAX);
            if (levelOf(t, what) >= n) return;
            if (what === 'academy') t.acaLevel = n;
            else if (what === 'staff') t.staffLv = n;
            else t.fac = { ...(t.fac || {}), [what]: n };
        });
    }
}

/**
 * The year end for every AI club: income goes into the war chest, and the club
 * upgrades whatever comes first on its list that it can pay for. Returns news lines.
 */
export function clubsInvest(save, rng) {
    const me = save.manager && save.manager.teamId;
    const notes = [];
    for (const t of Object.values(save.teams)) {
        if (t.id === me) continue;
        // A club spending less than its wage limit has more to invest.
        const room = clamp(1 - wageBill(save, t) / Math.max(1, baseWageBudget(save, t)), 0, 0.6);
        t.fund = Math.round((Number(t.fund) || 0) + sponsorIncome(save, t) * (0.12 + room * 0.25));
        for (const what of PRIORITY[clubStyle(t).id] || PRIORITY.balanced) {
            if (levelOf(t, what) >= MAX) continue;
            const cost = costOf(save, t, what);
            if (cost > t.fund) break;      // saving up for the next thing on the list
            t.fund = Math.round(t.fund - cost);
            raise(t, what);
            if (t.tier === 1 && levelOf(t, what) === MAX && rng() < 0.5) {
                notes.push(`${t.name} complete a major upgrade to their ${what === 'staff' ? 'backroom staff' : what === 'academy' ? 'academy' : what === 'studio' ? 'streaming studio' : what === 'house' ? 'gaming house' : 'training centre'}.`);
            }
            break;                          // one project a year
        }
    }
    return notes;
}

/**
 * Every AI academy produces: most years a graduate joins the roster as a young sub,
 * and the better the academy the higher his ceiling. There is no academy squad to
 * store for 150 clubs, so he arrives when he is ready.
 */
export function academyGraduates(save, rng, taken) {
    const me = save.manager && save.manager.teamId;
    const year = save.time.year;
    const out = [];
    for (const t of Object.values(save.teams)) {
        if (t.id === me) continue;
        const lv = Number(t.acaLevel) || 0;
        if (!lv || t.roster.length >= ROSTER_MAX || rng() > 0.25 + lv * 0.2) continue;
        const open = shuffle(rng, ROLE_IDS).filter(r => roleCount(save, t, r) < ROLE_MAX);
        if (!open.length) continue;
        const role = pick(rng, open);
        const base = (REGION_LEVEL[t.region] || 78) - 13 + lv * 2;
        const p = makeRandomPlayer({ id: nextGenId(save), role, region: t.region, year, target: base + randInt(rng, -2, 3), age: randInt(rng, 17, 19), takenNames: taken }, rng);
        p.pot = Math.max(p.pot, ovrOf(p) + randInt(rng, 4, 8 + lv * 3));
        save.players[p.id] = p;
        signTo(save, p, t, { years: 2, rng });
        out.push({ p, t });
    }
    return out;
}

