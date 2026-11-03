// ===========================================================================
//  ULTIMATE MANAGER -- academy, loans, scouting trips
//
//  ACADEMY  built and paid for (ACADEMY_LEVELS). Its players belong to the club
//           (p.team = club id, p.aca = true) but sit in `team.academy`, NOT in
//           `team.roster`: they never count toward the squad limit, never start
//           and never reach a lineup. The academy plays its own season (weekly
//           XP and a simulated record), takes a local intake every new year, and
//           players move up or down only while a transfer window is open.
//  LOANS    a young player who is not starting is lent to an AI club for the
//           rest of the season (p.loanFrom = the manager's club). He plays real
//           games there and comes home at the offseason. AI clubs never release,
//           sell or move a loanee (market.js and engine.js skip p.loanFrom).
//  SCOUTING TRIPS send scouts to a region: its free agents are scouted and a few
//           hidden prospects turn up, held for the manager through the window.
// ===========================================================================
import { ROLE_IDS, ROSTER_MAX, ROLE_MAX, REGION_LEVEL, REGION_IDS } from './data.js';
import { clamp, pick, randInt } from './util.js';
import { ovrOf, ageOf, grantXP, makeRandomPlayer, xpMultiplier, marketValue } from './people.js';
import { lineupOf } from './match.js';
import { sponsorIncome, roleCount, windowOpen } from './market.js';
import { nextGenId } from './world.js';

export const ACADEMY_LEVELS = [
    null,
    { slots: 4, xp: 30, intake: 1, cost: 0.35, upkeep: 0.03, name: 'Academy' },
    { slots: 6, xp: 45, intake: 2, cost: 0.5, upkeep: 0.05, name: 'Academy league side' },
    { slots: 8, xp: 60, intake: 2, cost: 0.75, upkeep: 0.07, name: 'Elite academy' },
];
const myTeam = (save) => (save.manager && save.manager.teamId ? save.teams[save.manager.teamId] : null);

export const academyLevel = (team) => clamp(Number(team && team.acaLevel) || 0, 0, 3);
export const academyIds = (save, team) => (team && Array.isArray(team.academy) ? team.academy.filter(id => save.players[id]) : []);
export function academyCost(save) {
    const t = myTeam(save);
    const lv = academyLevel(t);
    return lv >= 3 ? 0 : Math.round(sponsorIncome(save, t) * ACADEMY_LEVELS[lv + 1].cost / 10000) * 10000;
}
export function academyUpkeep(save) {
    const t = myTeam(save);
    const lv = academyLevel(t);
    return lv ? Math.round(sponsorIncome(save, t) * ACADEMY_LEVELS[lv].upkeep / 1000) * 1000 : 0;
}
export function buildAcademy(save) {
    const t = myTeam(save);
    if (!t) return { ok: false, msg: 'No club.' };
    const lv = academyLevel(t);
    if (lv >= 3) return { ok: false, msg: 'Your academy is already elite.' };
    const cost = academyCost(save);
    if (cost > save.finance.balance) return { ok: false, msg: `That costs ${Math.round(cost / 1000)}K. You cannot afford it.` };
    save.finance.balance -= cost;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: lv ? 'Academy upgrade' : 'Academy built', amount: -cost });
    t.acaLevel = lv + 1;
    if (!Array.isArray(t.academy)) t.academy = [];
    return { ok: true, msg: `${ACADEMY_LEVELS[lv + 1].name}: ${ACADEMY_LEVELS[lv + 1].slots} places.` };
}

/** Send a young player down: he leaves the main roster for the academy (window only). */
export function toAcademy(save, pid) {
    const t = myTeam(save);
    const p = save.players[pid];
    if (!t || !p || p.team !== t.id || !t.roster.includes(pid)) return { ok: false, msg: 'Not one of your players.' };
    if (!academyLevel(t)) return { ok: false, msg: 'Build an academy first (Staff screen).' };
    if (!windowOpen(save)) return { ok: false, msg: 'Players move between the academy and the main roster only in a transfer window.' };
    if (ageOf(p, save.time.year) > 21) return { ok: false, msg: 'The academy is for players 21 and under.' };
    if (academyIds(save, t).length >= ACADEMY_LEVELS[academyLevel(t)].slots) return { ok: false, msg: 'The academy is full.' };
    t.roster = t.roster.filter(id => id !== pid);
    for (const r of ROLE_IDS) if (t.lineup && t.lineup[r] === pid) delete t.lineup[r];
    t.academy = [...academyIds(save, t), pid];
    p.aca = true;
    return { ok: true, msg: `${p.name} goes down to the academy.` };
}
/** Call a player up from the academy (window only, needs room on the roster). */
export function fromAcademy(save, pid) {
    const t = myTeam(save);
    const p = save.players[pid];
    if (!t || !p || !academyIds(save, t).includes(pid)) return { ok: false, msg: 'Not in your academy.' };
    if (!windowOpen(save)) return { ok: false, msg: 'Players move between the academy and the main roster only in a transfer window.' };
    if (t.roster.length >= ROSTER_MAX) return { ok: false, msg: `Your roster is full (${ROSTER_MAX}).` };
    if (roleCount(save, t, p.role) >= ROLE_MAX) return { ok: false, msg: `You already have ${ROLE_MAX} ${p.role} players.` };
    t.academy = academyIds(save, t).filter(id => id !== pid);
    t.roster.push(pid);
    delete p.aca;
    p.until = Math.max(Number(p.until) || 0, save.time.year + 1);
    return { ok: true, msg: `${p.name} is called up to the main roster.` };
}
export function releaseAcademy(save, pid) {
    const t = myTeam(save);
    const p = save.players[pid];
    if (!t || !p || !academyIds(save, t).includes(pid)) return { ok: false, msg: 'Not in your academy.' };
    t.academy = academyIds(save, t).filter(id => id !== pid);
    delete p.aca;
    p.team = null; p.wage = 0;
    if (!save.freeAgents.includes(pid)) save.freeAgents.push(pid);
    return { ok: true, msg: `${p.name} leaves the academy.` };
}

/** A week of academy football: XP for every academy player, and a simulated result. */
export function academyWeek(save, rng, isLeagueStep) {
    const t = myTeam(save);
    const lv = academyLevel(t);
    if (!t || !lv) return;
    const ids = academyIds(save, t);
    t.academy = ids;
    let sum = 0;
    for (const id of ids) {
        const p = save.players[id];
        if (p.inj > 0 && --p.inj <= 0) { delete p.inj; delete p.injT; }
        grantXP(p, ACADEMY_LEVELS[lv].xp * xpMultiplier(p, save.time.year, { coach: 10 }));
        sum += ovrOf(p);
    }
    if (isLeagueStep && ids.length) {
        const rec = t.acaRec && t.acaRec.y === save.time.year ? t.acaRec : { y: save.time.year, w: 0, l: 0 };
        const edge = sum / ids.length - ((REGION_LEVEL[t.region] || 78) - 14);
        if (rng() < clamp(0.5 + edge / 20, 0.15, 0.85)) rec.w++; else rec.l++;
        t.acaRec = rec;
    }
}

/** A new year: the academy takes its local intake. */
export function academyIntake(save, rng, taken) {
    const t = myTeam(save);
    const lv = academyLevel(t);
    if (!t || !lv) return [];
    const out = [];
    for (let i = 0; i < ACADEMY_LEVELS[lv].intake && academyIds(save, t).length < ACADEMY_LEVELS[lv].slots; i++) {
        const p = makeRandomPlayer({ id: nextGenId(save), role: pick(rng, ROLE_IDS), region: t.region, year: save.time.year, target: (REGION_LEVEL[t.region] || 78) - 18 + randInt(rng, 0, 4) + lv, age: randInt(rng, 15, 17), takenNames: taken }, rng);
        p.pot = clamp(ovrOf(p) + randInt(rng, 10, 18 + lv * 3), ovrOf(p), 95);
        p.team = t.id; p.aca = true; p.wage = 0; p.until = save.time.year + 3; p.reg = t.region;
        save.players[p.id] = p;
        t.academy = [...academyIds(save, t), p.id];
        save.scouted = [...new Set([...(save.scouted || []), p.id])];
        out.push(p);
    }
    return out;
}

/** The manager leaves a club: its academy players have no home any more and become free agents. */
export function dissolveAcademy(save, team) {
    if (!team) return;
    for (const id of academyIds(save, team)) {
        const p = save.players[id];
        delete p.aca; p.team = null; p.wage = 0;
        if (!save.freeAgents.includes(id)) save.freeAgents.push(id);
    }
    team.academy = [];
}

// ---------------------------------------------------------------- loans
/** Lend a young non-starter to an AI club in the region for the rest of the season. */
export function loanOut(save, pid, rng = Math.random) {
    const t = myTeam(save);
    const p = save.players[pid];
    if (!t || !p || p.team !== t.id || !t.roster.includes(pid)) return { ok: false, msg: 'Not one of your players.' };
    if (!windowOpen(save)) return { ok: false, msg: 'Loans are arranged in a transfer window.' };
    if (ageOf(p, save.time.year) > 23) return { ok: false, msg: 'Clubs take young players on loan: 23 and under.' };
    const takers = Object.values(save.teams).filter(x => x.id !== t.id && x.region === t.region && x.roster.length < ROSTER_MAX && roleCount(save, x, p.role) < ROLE_MAX)
        .sort((a, b) => (a.tier === 2 ? 0 : 1) - (b.tier === 2 ? 0 : 1) || a.roster.length - b.roster.length);
    const to = takers[0];
    if (!to) return { ok: false, msg: 'No club in your region has room for him.' };
    t.roster = t.roster.filter(id => id !== pid);
    for (const r of ROLE_IDS) if (t.lineup && t.lineup[r] === pid) delete t.lineup[r];
    to.roster.push(pid);
    p.team = to.id;
    p.loanFrom = t.id;
    p.loanYear = save.time.year;
    return { ok: true, msg: `${p.name} joins ${to.name} on loan until the end of the season. They pay his wages and he plays for them.` };
}
/** Can the manager borrow this player? In a window, or any time as cover for an injured player of his role. */
export function loanInCheck(save, pid) {
    const t = myTeam(save);
    const p = save.players[pid];
    const from = p && save.teams[p.team];
    if (!t || !p || !from || from.id === t.id) return { ok: false, msg: 'He is not at another club.' };
    if (p.loanFrom) return { ok: false, msg: 'He is already on loan.' };
    if (p.aca || p.retiring) return { ok: false, msg: 'He is not available.' };
    const cover = t.roster.some(id => { const x = save.players[id]; return x && x.role === p.role && x.inj > 0; });
    if (!windowOpen(save) && !cover) return { ok: false, msg: 'Loans are arranged in a transfer window, or any time as cover for an injured player of the same role.' };
    if (t.roster.length >= ROSTER_MAX) return { ok: false, msg: `Your squad is full (${ROSTER_MAX}).` };
    if (roleCount(save, t, p.role) >= ROLE_MAX) return { ok: false, msg: `You already have ${ROLE_MAX} players for ${p.role}.` };
    const starters = new Set(Object.values(lineupOf(from, save.players)).map(x => x && x.id));
    if (starters.has(p.id) && ageOf(p, save.time.year) > 21) return { ok: false, msg: `${from.name} will not lend a starter.` };
    if (from.roster.length <= 5) return { ok: false, msg: `${from.name} cannot spare anyone.` };
    const fee = loanFee(save, p);
    if (fee > save.finance.balance) return { ok: false, msg: `The loan fee is ${Math.round(fee / 1000)}K. You cannot afford it.` };
    return { ok: true, fee, from };
}
export const loanFee = (save, p) => Math.max(5000, Math.round(marketValue(p, save.time.year) * 0.1 / 5000) * 5000);
/** Borrow a player until the offseason: a fee to his club, and you pay his wages. */
export function loanIn(save, pid) {
    const c = loanInCheck(save, pid);
    if (!c.ok) return c;
    const t = myTeam(save);
    const p = save.players[pid];
    c.from.roster = c.from.roster.filter(id => id !== pid);
    for (const r of ROLE_IDS) if (c.from.lineup && c.from.lineup[r] === pid) delete c.from.lineup[r];
    t.roster.push(pid);
    p.team = t.id;
    p.loanFrom = c.from.id;
    p.loanYear = save.time.year;
    save.finance.balance -= c.fee;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Loan: ${p.name}`, amount: -c.fee });
    return { ok: true, msg: `${p.name} joins on loan from ${c.from.name} until the offseason (fee ${Math.round(c.fee / 1000)}K; you pay his wages).` };
}

/** The offseason: every loanee comes home (to the roster, the academy, or free agency if there is no room). */
export function recallLoans(save) {
    const notes = [];
    for (const p of Object.values(save.players)) {
        if (!p.loanFrom) continue;
        const home = save.teams[p.loanFrom];
        const host = save.teams[p.team];
        if (host) { host.roster = host.roster.filter(id => id !== p.id); for (const r of ROLE_IDS) if (host.lineup && host.lineup[r] === p.id) delete host.lineup[r]; }
        delete p.loanFrom; delete p.loanYear;
        const me = save.manager && save.manager.teamId;
        const wasMine = host && host.id === me;
        if (home && home.roster.length < ROSTER_MAX) {
            // A host club that folded mid-loan already released him to free agency.
            save.freeAgents = save.freeAgents.filter(id => id !== p.id);
            home.roster.push(p.id); p.team = home.id;
            if (home.id === me) notes.push(`${p.name} is back from his loan${p.st && p.st.g ? ` (${p.st.g} games)` : ''}.`);
            else if (wasMine) notes.push(`${p.name}'s loan is over: he goes back to ${home.name}.`);
        } else {
            p.team = null; p.wage = 0;
            if (!save.freeAgents.includes(p.id)) save.freeAgents.push(p.id);
            if (home && (home.id === me || wasMine)) notes.push(`${p.name} came back from loan to a full roster and left as a free agent.`);
        }
    }
    return notes;
}

// ---------------------------------------------------------------- scouting trips
export function tripCost(save) {
    const t = myTeam(save);
    const scout = save.staff && save.staff.scout ? save.staff.scout.rating : 55;
    return t ? Math.round(sponsorIncome(save, t) * 0.03 * (1.3 - scout / 200) / 1000) * 1000 : 0;
}
/** Send scouts to a region: its free agents are scouted, and a few hidden prospects turn up. */
export function scoutingTrip(save, region, rng, taken) {
    const t = myTeam(save);
    if (!t || !REGION_IDS.includes(region)) return { ok: false, msg: 'Pick a region.' };
    const stamp = save.time.year * 100 + save.time.step;
    if (save.lastTrip === stamp) return { ok: false, msg: 'Your scouts are already out this week.' };
    const cost = tripCost(save);
    if (cost > save.finance.balance) return { ok: false, msg: `A scouting trip costs ${Math.round(cost / 1000)}K. You cannot afford it.` };
    save.finance.balance -= cost;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Scouting trip: ${region}`, amount: -cost });
    save.lastTrip = stamp;
    const scout = save.staff && save.staff.scout ? save.staff.scout.rating : 55;
    const n = scout >= 80 ? 3 : 2;
    const found = [];
    for (let i = 0; i < n; i++) {
        const p = makeRandomPlayer({ id: nextGenId(save), role: pick(rng, ROLE_IDS), region, year: save.time.year, target: (REGION_LEVEL[region] || 78) - 14 + randInt(rng, 0, 6), age: randInt(rng, 16, 19), takenNames: taken }, rng);
        p.pot = clamp(ovrOf(p) + randInt(rng, 8, 14 + Math.round((scout - 55) / 6)), ovrOf(p), 96);
        p.reg = region; p.prospectFor = t.id;
        save.players[p.id] = p;
        save.freeAgents.push(p.id);
        found.push(p);
    }
    const fa = save.freeAgents.filter(id => { const x = save.players[id]; return x && (x.reg || x.nat) === region; });
    save.scouted = [...new Set([...(save.scouted || []), ...fa])];
    return { ok: true, msg: `Your scouts found ${found.map(p => `${p.name} (${p.role}, ${ovrOf(p)}, potential ${p.pot})`).join(', ')}. They are held for you in free agency through this window, and every free agent in ${region} is scouted.`, found };
}
