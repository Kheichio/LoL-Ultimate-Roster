// ===========================================================================
//  ULTIMATE MANAGER -- transfers and contracts
//
//  Transfers between clubs happen only in a WINDOW: the preseason and the
//  mid-season break. Free agents can be signed at any time. A deal needs two
//  yeses: the selling club (the fee) and the player (your club, his wage).
//  Outside a window the manager has ONE emergency signing a season (two with
//  the Board Diplomat perk maxed), at a premium.
//
//  Bids for the manager's players arrive when a window OPENS and expire when
//  it closes. A player on the transfer list draws offers from clubs that can
//  use him, every window, until he is sold or taken off the list.
//
//  Contracts run to the end of the year in `until`; a player whose contract
//  is not renewed leaves at the offseason -- and the offseason will not start
//  until the manager has decided, player by player, to renew or let go.
//
//  Money is only tracked for the manager's club (save.finance). The AI clubs
//  spend within their reputation, which keeps them from hoarding every star.
// ===========================================================================
import { ROLE_IDS, ROSTER_MAX, ROSTER_MIN, REGION_MONEY, CALENDAR, STEPS_PER_YEAR, EMERGENCY_PREMIUM, SQUAD_STATUS_BY_ID, WAGE_STEP, ECON_REF_LEVEL, SPONSOR_BASE, SPONSOR_REP, INVEST_ROOM, INVEST_DECAY } from './data.js';
import { ovrOf, ovrAs, wageDemand, marketValue, fx, ageOf } from './people.js';
import { bestLineup, lineupOf, bestTactic, teamStrength } from './match.js';

const teamStrengthOf = (save, t) => teamStrength(t, save.players);
import { signTo, release, regensFor } from './world.js';
import { clamp, pick, randInt, shuffle, rngFor } from './util.js';

// ---------------------------------------------------------------- money
/** The world's level: the mean OVR of every tier-1 starter. */
export function economyLevel(save) {
    const ovrs = [];
    for (const t of Object.values(save.teams || {})) {
        if (t.tier !== 1) continue;
        const lu = lineupOf(t, save.players);
        for (const r of ROLE_IDS) if (lu[r]) ovrs.push(ovrOf(lu[r]));
    }
    return ovrs.length ? Math.round(ovrs.reduce((s, v) => s + v, 0) / ovrs.length * 10) / 10 : ECON_REF_LEVEL;
}
/** Take the level once a year (at the start of a save and every new season), so
 *  a budget never moves week to week with a transfer. */
export function refreshEconomy(save) {
    save.econ = { year: save.time ? save.time.year : 0, level: economyLevel(save) };
    return save.econ;
}
/** How much richer the game is than at ECON_REF_LEVEL: the wage curve at the world's level. */
export function econIndex(save) {
    const lv = Number(save && save.econ && save.econ.level);
    return Number.isFinite(lv) ? clamp(Math.pow(WAGE_STEP, lv - ECON_REF_LEVEL), 0.3, 4) : 1;
}

export function sponsorIncome(save, team) {
    const mine = save.manager && team.id === save.manager.teamId;
    const perk = mine && save.manager.perks ? (save.manager.perks.commercial || 0) : 0;
    const rep = clamp(Number(team.rep) || 30, 0, 100) / 100;
    const base = (SPONSOR_BASE + SPONSOR_REP * rep * rep) * (REGION_MONEY[team.region] || 1) * econIndex(save);
    return Math.round(base * (1 + perk * 0.08) / 1000) * 1000;
}

export function wageBill(save, team) {
    return team.roster.reduce((s, id) => s + (save.players[id] ? save.players[id].wage || 0 : 0), 0);
}

// ---------------------------------------------------------------- ownership
/** How much of the manager's club the manager owns: 100 for a club they founded
 *  and never sold any of, less once they sell stakes, 0 for a club they were hired by. */
export function ownerStake(save) {
    const m = save.manager || {};
    const t = m.teamId ? save.teams[m.teamId] : null;
    if (!t || !t.custom || m.founded !== t.id) return 0;
    const v = Number(t.stake);
    return Number.isFinite(v) ? clamp(v, 0, 100) : 100;
}
/** The sole owner answers to nobody: no board, no objectives, no wage limit. */
export const soleOwner = (save) => ownerStake(save) >= 100;
/** A board exists unless the manager owns all of the club. */
export const hasBoard = (save) => !soleOwner(save);
/** Investors can only sack a manager who no longer holds a majority. */
export const boardCanSack = (save) => ownerStake(save) < 50;

/** What the club is worth: its sponsor income, its players and its titles. */
export function clubValuation(save) {
    const t = save.teams[save.manager.teamId];
    if (!t) return 0;
    const year = save.time.year;
    const squad = t.roster.reduce((s, id) => s + (save.players[id] ? marketValue(save.players[id], year) : 0), 0);
    const titles = (save.manager.trophies || []).filter(x => x.teamId === t.id && x.kind !== 'promotion').length;
    const v = sponsorIncome(save, t) * 3 + squad * 0.5 + (titles * 400000 + (t.tier === 1 ? 1500000 : 400000)) * econIndex(save);
    return Math.round(v / 10000) * 10000;
}

/** How much the board raises the wage limit for a club that is doing well:
 *  confidence above 60, and titles won this year or last. 1 = no raise. */
export function wageBoost(save) {
    const t = save.teams[save.manager.teamId];
    if (!t) return 1;
    const conf = Number(save.board && save.board.confidence) || 60;
    const recent = (save.manager.trophies || []).filter(x => x.teamId === t.id && x.kind !== 'promotion' && x.year >= save.time.year - 1).length;
    return 1 + clamp((conf - 60) / 100, 0, 0.4) + Math.min(0.25, recent * 0.08);
}

/** The wage limit before any raise, which AI clubs spend to. */
export function baseWageBudget(save, team) {
    return Math.round((sponsorIncome(save, team) * 0.85 + 150000 * econIndex(save)) * ownerInvestment(team) / 1000) * 1000;
}

/** The owners' top-up on a club's wage limit (1 = none). */
export function ownerInvestment(team) {
    const v = Number(team && team.invest);
    return Number.isFinite(v) && v > 1 ? Math.min(v, 3) : 1;
}

/** What the owners pay in each year: the part of the wage limit their investment adds.
 *  Paid into the club week by week with the sponsors, so the limit is real money. */
export function ownerFunding(save, team) {
    const inv = ownerInvestment(team);
    return inv > 1 ? Math.round(baseWageBudget(save, team) * (1 - 1 / inv) / 1000) * 1000 : 0;
}

/** Give every club already paying more than its limit an owner investment that covers it
 *  (INVEST_ROOM of headroom). Run when a world is built and when an old save is repriced. */
export function settleInvestment(save) {
    for (const t of Object.values(save.teams || {})) {
        if (t.custom) continue;
        delete t.invest;
        const base = baseWageBudget(save, t);
        const need = base > 0 ? wageBill(save, t) * INVEST_ROOM / base : 1;
        if (need > 1) t.invest = Math.max(1.01, Math.ceil(need * 100) / 100);
    }
}

/** A new year: the investment fades toward none. */
export function fadeInvestment(team) {
    if (!(Number(team.invest) > 1)) { delete team.invest; return; }
    const v = 1 + (team.invest - 1) * INVEST_DECAY;
    if (v < 1.02) delete team.invest; else team.invest = Math.round(v * 100) / 100;
}

/** The most the club may spend on wages in a year. The manager's club gets a raise
 *  for doing well; a club the manager owns outright has no limit at all. */
export function wageBudget(save, team) {
    const base = baseWageBudget(save, team);
    if (!save.manager || team.id !== save.manager.teamId) return base;
    if (soleOwner(save)) return Infinity;
    return Math.round(base * wageBoost(save) / 1000) * 1000;
}

function negotiator(save) {
    return save.manager && save.manager.perks ? (save.manager.perks.negotiator || 0) : 0;
}

export function windowOpen(save) {
    const step = CALENDAR[save.time.step];
    return !!step && step.kind === 'window';
}

// ---------------------------------------------------------------- emergency signings
/** Emergency signings a season: one, or two with Board Diplomat maxed. */
export function emergencyAllowance(save) {
    return 1 + (((save.manager && save.manager.perks) || {}).boardroom >= 3 ? 1 : 0);
}
export function emergencyLeft(save) {
    const e = save.emergency || {};
    const used = e.year === save.time.year ? Number(e.used) || 0 : 0;
    return Math.max(0, emergencyAllowance(save) - used);
}
/** A deal for a player at another club right now would be an emergency signing. */
export function isEmergency(save, p) {
    return !!(p && p.team && p.team !== save.manager.teamId && !windowOpen(save));
}
function useEmergency(save) {
    const e = save.emergency && save.emergency.year === save.time.year ? save.emergency : { year: save.time.year, used: 0 };
    save.emergency = { year: save.time.year, used: (Number(e.used) || 0) + 1 };
}

// ---------------------------------------------------------------- asking
/** What a club wants for a player. Outside a window, the emergency premium. */
export function askingPrice(save, p) {
    const base = baseAsking(save, p);
    return isEmergency(save, p) ? Math.round(base * EMERGENCY_PREMIUM / 5000) * 5000 : base;
}
function baseAsking(save, p) {
    const year = save.time.year;
    const team = p.team && save.teams[p.team];
    let v = marketValue(p, year);
    if (team) {
        const lu = lineupOf(team, save.players);
        if (ROLE_IDS.some(r => lu[r] && lu[r].id === p.id)) v *= 1.25;
        const left = (p.until || year) - year;
        v *= left <= 0 ? 0.65 : left === 1 ? 1 : 1.2;
        if (fx(p).hardToBuy) v *= 1.3;
    }
    v *= 1 - negotiator(save) * 0.05;
    return Math.max(10000, Math.round(v / 5000) * 5000);
}

/** The yearly wage a player asks of a given club. */
export function wageAsk(save, p, team, { renewal = false } = {}) {
    let w = wageDemand(p, save.time.year, team.region, { renewal });
    // Players take a little less to join a bigger club, and want more to drop down.
    const cur = p.team && save.teams[p.team];
    if (cur && !renewal) w *= clamp(1 + ((cur.rep || 50) - (team.rep || 50)) / 200, 0.85, 1.25);
    w *= 1 - negotiator(save) * 0.04;
    return Math.max(15000, Math.round(w / 1000) * 1000);
}

/** Would this player move to this club at all? Reasons are shown to the manager. */
export function willingness(save, p, team) {
    const e = fx(p);
    const cur = p.team && save.teams[p.team];
    const repGap = (team.rep || 50) - (cur ? cur.rep || 50 : 30);
    if (e.hardToBuy && cur && repGap < 15) return { ok: false, why: `${p.name} is loyal to ${cur.name} and will only leave for a much bigger club.` };
    if (e.wantsContender && (team.rep || 0) < 55 && ovrOf(p) >= 80) return { ok: false, why: `${p.name} is ambitious and wants to play for a contender.` };
    if (cur && repGap < -30 && ovrOf(p) >= 85) return { ok: false, why: `${p.name} will not step down to a club this much smaller.` };
    if (team.tier === 2 && ovrOf(p) >= 88) return { ok: false, why: `${p.name} will not play in a second-tier league.` };
    return { ok: true, why: '' };
}

// ---------------------------------------------------------------- the manager's deals
function userTeam(save) {
    return save.teams[save.manager.teamId];
}

function spend(save, amount, label) {
    save.finance.balance -= amount;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label, amount: -amount });
    save.finance.log.length = Math.min(save.finance.log.length, 60);
}
export function earn(save, amount, label) {
    save.finance.balance += amount;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label, amount });
    save.finance.log.length = Math.min(save.finance.log.length, 60);
}

/** Every check a signing must pass, so the screen and the action agree. */
export function signingCheck(save, p, { fee = 0, wage }) {
    const t = userTeam(save);
    if (!t) return 'No club.';
    if (p.team === t.id) return `${p.name} is already yours.`;
    if (p.team && !windowOpen(save) && emergencyLeft(save) <= 0) return `The transfer window is closed, and you have used your emergency signing for ${save.time.year}. Clubs sell again in the next window.`;
    if (t.roster.length >= ROSTER_MAX) return `Your roster is full (${ROSTER_MAX}). Release or sell someone first.`;
    if (soleOwner(save) && save.finance.balance < 0) return 'Your club is in debt. As the owner you cannot add wages until the balance is positive again.';
    if (fee > save.finance.balance) return 'You cannot afford the fee.';
    const bill = wageBill(save, t) + wage;
    if (bill > wageBudget(save, t)) return `The board caps your wage bill at ${Math.round(wageBudget(save, t) / 1000)}K a year.`;
    const w = willingness(save, p, t);
    if (!w.ok) return w.why;
    return '';
}

/**
 * Bid for a player at another club. Returns { ok, msg, counter? }. The club
 * accepts at its asking price, considers anything from 85% and counters, and
 * refuses below that.
 */
export function bidForPlayer(save, pid, fee, rng = Math.random) {
    const p = save.players[pid];
    const t = userTeam(save);
    if (!p || !p.team) return { ok: false, msg: 'That player is not at a club.' };
    const wage = wageAsk(save, p, t);
    const err = signingCheck(save, p, { fee, wage });
    if (err) return { ok: false, msg: err };
    const ask = askingPrice(save, p);
    const seller = save.teams[p.team];
    const emergency = isEmergency(save, p);
    // An emergency deal is a straight yes or no: there is no time to haggle.
    if (emergency && fee < ask) return { ok: false, msg: `${seller.name} know you are desperate. It is ${fmtK(ask)} or nothing.`, counter: ask };
    if (fee < ask * 0.85) return { ok: false, msg: `${seller.name} turn it down flat. They value ${p.name} at around ${fmtK(ask)}.`, counter: ask };
    if (fee < ask && rng() > (fee - ask * 0.85) / (ask * 0.15)) return { ok: false, msg: `${seller.name} want ${fmtK(ask)} for ${p.name}.`, counter: ask };
    spend(save, fee, `${emergency ? 'Emergency signing: ' : 'Signed '}${p.name} from ${seller.name}`);
    signTo(save, p, t, { years: 2, wage, rng });
    seller.lineup = bestLineup(seller, save.players);
    if (emergency) useEmergency(save);
    p.mor = clamp((p.mor || 70) + 6, 0, 100);
    return { ok: true, msg: `${p.name} joins from ${seller.name} for ${fmtK(fee)}, on ${fmtK(wage)} a year until ${p.until}.${emergency ? ' That was your emergency signing for the season.' : ''}` };
}

export function signFreeAgent(save, pid, years = 1, rng = Math.random) {
    const p = save.players[pid];
    const t = userTeam(save);
    if (!p || p.team) return { ok: false, msg: 'That player is not a free agent.' };
    const wage = wageAsk(save, p, t);
    const err = signingCheck(save, p, { fee: 0, wage });
    if (err) return { ok: false, msg: err };
    signTo(save, p, t, { years: clamp(years, 0, 2), wage, rng });
    delete p.prospectFor;
    p.mor = clamp((p.mor || 70) + 4, 0, 100);
    return { ok: true, msg: `${p.name} signs on ${fmtK(wage)} a year until ${p.until}.` };
}

// ---------------------------------------------------------------- renewals
// A renewal is a negotiation. The player has a DEMAND that depends on the
// length (youngsters want short deals because a bigger one is coming, veterans
// want security), on the squad status promised (the ambitious take less to be
// a key player and want more to sit in the rotation) and on a signing bonus
// (cash now). The manager offers a wage; the closer to the demand, and the
// happier he is, the likelier a yes. One attempt per player per week.

/** What he asks for, a year, for this length and status. */
export function renewalDemand(save, p, years = 2, status = 'regular') {
    const t = userTeam(save);
    let w = wageAsk(save, p, t, { renewal: true });
    const age = ageOf(p, save.time.year);
    if (age <= 21) w *= years >= 3 ? 1.1 : years === 1 ? 0.96 : 1;
    else if (age >= 27) w *= years === 1 ? 1.1 : years >= 3 ? 0.94 : 1;
    const wantsPlay = !!fx(p).wantsContender || p.pers === 'showman' || p.pers === 'prodigy';
    const easy = p.pers === 'teamplayer' || p.pers === 'laidback';
    if (status === 'key') w *= wantsPlay ? 0.92 : 0.97;
    else if (status === 'rotation') w *= wantsPlay ? 1.15 : easy ? 0.95 : 1.04;
    return Math.max(15000, Math.round(w / 1000) * 1000);
}

/** The old one-click terms: two more years at the demand. */
export function renewalTerms(save, p) {
    return { wage: renewalDemand(save, p, 2, p.status || 'regular'), years: 2 };
}

/** Why he will not even talk, or ''. */
export function renewalBlock(save, p) {
    const t = userTeam(save);
    if (!p || !t || p.team !== t.id) return 'Not your player.';
    if ((p.mor || 0) < 35 && !fx(p).renewMult) return `${p.name} is unhappy and will not talk about a new contract. Raise his morale first.`;
    if (fx(p).wantsContender && (t.rep || 0) < 55 && ovrOf(p) >= 80) return `${p.name} wants to play for a contender and will not sign a new deal here.`;
    if (p.retiring === save.time.year) return `${p.name} has decided to retire at the end of the season.`;
    return '';
}

/** How an offer would be received: the demand, the chance of a yes and a word. */
export function renewalOdds(save, p, { years = 2, wage = 0, bonus = 0, status = 'regular' } = {}) {
    const demand = renewalDemand(save, p, years, status);
    const block = renewalBlock(save, p);
    // Cash now is worth a little more than the same money spread over the deal.
    const value = (Number(wage) || 0) + (Number(bonus) || 0) * 1.25 / Math.max(1, years);
    let chance = clamp((value / demand - 0.88) / 0.14, 0, 1);
    const mor = Number(p.mor) || 65;
    if (block) chance = 0;
    else if (mor < 50) chance *= 0.75;
    else if (mor >= 80) chance = Math.min(1, chance + 0.15);
    const word = chance >= 0.95 ? 'Will accept' : chance >= 0.6 ? 'Likely to accept' : chance >= 0.25 ? 'Might accept' : chance > 0 ? 'Unlikely' : 'Will refuse';
    return { demand, chance, word, value, block };
}

/** Make an offer. Returns { ok, msg }. */
export function negotiateRenewal(save, pid, terms, rng = Math.random) {
    const p = save.players[pid];
    const t = userTeam(save);
    const block = renewalBlock(save, p);
    if (block) return { ok: false, msg: block };
    const years = clamp(Math.round(Number(terms.years) || 2), 1, 3);
    const wage = Math.max(0, Math.round((Number(terms.wage) || 0) / 1000) * 1000);
    const bonus = Math.max(0, Math.round((Number(terms.bonus) || 0) / 1000) * 1000);
    const status = SQUAD_STATUS_BY_ID[terms.status] ? terms.status : 'regular';
    const stamp = save.time.year * 100 + save.time.step;
    if (p.negot === stamp) return { ok: false, msg: `${p.name} wants time to think. Try again next week.` };
    // A renewal that does not raise the bill is always allowed, so a club already over
    // its limit can still keep the players it has.
    const bill = wageBill(save, t) - (p.wage || 0) + wage;
    if (wage > (p.wage || 0) && bill > wageBudget(save, t)) return { ok: false, msg: `That would take your wage bill past the board's limit of ${fmtK(wageBudget(save, t))}.` };
    if (bonus > save.finance.balance) return { ok: false, msg: 'You cannot afford that signing bonus.' };
    const odds = renewalOdds(save, p, { years, wage, bonus, status });
    if (rng() >= odds.chance) {
        p.negot = stamp;
        const hurt = odds.value < odds.demand * 0.92 ? 4 : 2;
        p.mor = clamp((p.mor || 65) - hurt, 0, 100);
        return { ok: false, msg: `${p.name} turns it down. He wants about ${fmtK(odds.demand)} a year for that. Try again next week.` };
    }
    if (bonus) spend(save, bonus, `Signing bonus: ${p.name}`);
    p.wage = wage;
    p.until = save.time.year + years;
    p.status = status;
    delete p.leaving;
    delete p.negot;
    p.mor = clamp((p.mor || 70) + 4 + (status === 'key' ? 2 : 0), 0, 100);
    return { ok: true, msg: `${p.name} signs until ${p.until} on ${fmtK(wage)} a year${bonus ? ` with a ${fmtK(bonus)} bonus` : ''}.` };
}

/** The one-click renewal: two years at his demand. Meeting his ask is a yes
 *  unless something blocks the talks (renewalBlock). */
export function renewContract(save, pid) {
    const p = save.players[pid];
    if (!p) return { ok: false, msg: 'Not your player.' };
    const { wage, years } = renewalTerms(save, p);
    return negotiateRenewal(save, pid, { years, wage, bonus: 0, status: p.status || 'regular' }, () => 0);
}

/** Renew everyone whose contract ends this year at his asking terms. */
export function renewAllExpiring(save) {
    const t = userTeam(save);
    if (!t) return { ok: false, msg: 'No club.', done: [], failed: [] };
    const year = save.time.year;
    const done = [], failed = [];
    for (const id of t.roster.slice()) {
        const p = save.players[id];
        if (!p || (p.until || 0) > year || p.leaving === year || p.retiring === year) continue;
        const r = renewContract(save, id);
        (r.ok ? done : failed).push({ name: p.name, msg: r.msg });
    }
    const msg = done.length
        ? `Renewed ${done.map(x => x.name).join(', ')}.${failed.length ? ` Not ${failed.map(x => x.name).join(', ')}: ${failed[0].msg}` : ''}`
        : failed.length ? failed[0].msg : 'Nobody is out of contract this year.';
    return { ok: done.length > 0, msg, done, failed };
}

/** Decide a player will leave when his contract ends (no more reminders). */
export function letContractRun(save, pid, leaving = true) {
    const p = save.players[pid];
    const t = userTeam(save);
    if (!p || !t || p.team !== t.id) return { ok: false, msg: 'Not your player.' };
    if (leaving) p.leaving = save.time.year; else delete p.leaving;
    return { ok: true, msg: leaving ? `${p.name} will leave as a free agent when his contract ends after ${p.until}.` : `You will try to keep ${p.name}.` };
}

export function releaseCost(save, p) {
    const left = Math.max(0, (p.until || save.time.year) - save.time.year) + (1 - save.time.step / STEPS_PER_YEAR);
    return Math.round((p.wage || 0) * left * 0.5 / 1000) * 1000;
}

export function releasePlayer(save, pid) {
    const p = save.players[pid];
    const t = userTeam(save);
    if (!p || p.team !== t.id) return { ok: false, msg: 'Not your player.' };
    const cost = releaseCost(save, p);
    if (cost > save.finance.balance) return { ok: false, msg: 'You cannot afford the payout.' };
    if (cost) spend(save, cost, `Released ${p.name}`);
    release(save, p);
    clearPlayerOffers(save, p.id);
    delete p.listed;
    return { ok: true, msg: `${p.name} is released${cost ? ` (payout ${fmtK(cost)})` : ''}.` };
}

/** Accept an AI club's bid for one of your players. Only while a window is open. */
export function acceptBid(save, offerId) {
    const o = (save.offers || []).find(x => x.id === offerId);
    if (!o) return { ok: false, msg: 'That offer has expired.' };
    if (!windowOpen(save)) { removeOffer(save, offerId); return { ok: false, msg: 'The transfer window has closed. The offer is gone.' }; }
    const p = save.players[o.pid];
    const buyer = save.teams[o.from];
    if (!p || !buyer || p.team !== save.manager.teamId) { removeOffer(save, offerId); return { ok: false, msg: 'That offer is no longer valid.' }; }
    earn(save, o.fee, `Sold ${p.name} to ${buyer.name}`);
    signTo(save, p, buyer, { years: 2 });
    buyer.lineup = bestLineup(buyer, save.players);
    delete p.listed;
    delete p.leaving;
    delete p.status;
    clearPlayerOffers(save, p.id);
    return { ok: true, msg: `${p.name} is sold to ${buyer.name} for ${fmtK(o.fee)}.` };
}

export function removeOffer(save, offerId) {
    save.offers = (save.offers || []).filter(x => x.id !== offerId);
}
function clearPlayerOffers(save, pid) {
    save.offers = (save.offers || []).filter(x => x.pid !== pid);
}

/** Close the window: every open bid lapses. Returns how many did. */
export function expireOffers(save) {
    const n = (save.offers || []).length;
    save.offers = [];
    return n;
}

// ---------------------------------------------------------------- the transfer list
/** Put a player on the list at a price. Clubs that can use him make offers in
 *  every window (straight away, if one is open). */
export function listPlayer(save, pid, price, rng = Math.random) {
    const p = save.players[pid];
    const t = userTeam(save);
    if (!p || !t || p.team !== t.id) return { ok: false, msg: 'Not your player.', offers: 0 };
    p.listed = Math.max(10000, Math.round((Number(price) || marketValue(p, save.time.year)) / 5000) * 5000);
    let made = 0;
    if (windowOpen(save)) made = listingOffers(save, rng, [p.id]).length;
    const msg = `${p.name} is on the transfer list at ${fmtK(p.listed)}.` + (windowOpen(save)
        ? (made ? ` ${made} club${made === 1 ? ' has' : 's have'} made an offer.` : ' Nobody has bitten yet at that price.')
        : ' Clubs will make offers when the next window opens.');
    return { ok: true, msg, offers: made };
}

export function unlistPlayer(save, pid) {
    const p = save.players[pid];
    if (!p) return { ok: false, msg: 'No such player.' };
    delete p.listed;
    save.offers = (save.offers || []).filter(x => !(x.pid === pid && x.listed));
    return { ok: true, msg: `${p.name} is off the transfer list.` };
}

/** Clubs that would buy this player: room on the roster, the wages to pay him,
 *  and a reason (he starts for them, or he is young with a ceiling). */
function buyersFor(save, p) {
    const me = save.manager.teamId;
    const year = save.time.year;
    const out = [];
    for (const t of Object.values(save.teams)) {
        if (t.id === me || t.roster.length >= ROSTER_MAX) continue;
        if (wageBill(save, t) + wageDemand(p, year, t.region) > wageBudget(save, t)) continue;
        if (t.tier === 2 && ovrOf(p) >= 88) continue;
        const lu = lineupOf(t, save.players);
        const cur = lu[p.role];
        const starts = !cur || ovrOf(p) >= ovrAs(cur, p.role) + 1;
        const project = ageOf(p, year) <= 20 && p.pot >= ovrOf(cur || p);
        if (!starts && !project) continue;
        out.push(t);
    }
    return out;
}

/**
 * Offers for listed players. A price far above what he is worth draws nothing;
 * at or under his value, clubs compete. The Super Agent perk brings more clubs
 * and better fees. Returns the new offers.
 */
export function listingOffers(save, rng = Math.random, only = null) {
    const t = userTeam(save);
    if (!t) return [];
    const agent = ((save.manager.perks || {}).agent) || 0;
    const made = [];
    for (const id of t.roster) {
        const p = save.players[id];
        if (!p || !p.listed || (only && !only.includes(id))) continue;
        const value = marketValue(p, save.time.year);
        const ratio = p.listed / Math.max(1, value);
        if (ratio > 1.6) continue;
        const want = ratio <= 0.8 ? 3 : ratio <= 1.05 ? 2 : 1;
        const buyers = shuffle(rng, buyersFor(save, p)).filter(b => !(save.offers || []).some(o => o.pid === p.id && o.from === b.id));
        for (const b of buyers.slice(0, want + agent)) {
            if (rng() < (ratio > 1.25 ? 0.45 : 0.85)) {
                const fee = Math.round(p.listed * (0.85 + rng() * 0.25) * (1 + agent * 0.05) / 5000) * 5000;
                const o = { id: 'l' + save.time.year + '-' + save.time.step + '-' + b.id + '-' + p.id, pid: p.id, from: b.id, fee, y: save.time.year, s: save.time.step, listed: true };
                save.offers = [...(save.offers || []), o];
                made.push(o);
            }
        }
    }
    return made;
}

export function fmtK(n) {
    const v = Math.round(Number(n) || 0);
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    return '$' + Math.round(v / 1000) + 'K';
}

// ---------------------------------------------------------------- the AI
function regionOf(save, p) {
    if (p.team && save.teams[p.team]) return save.teams[p.team].region;
    return p.reg || p.nat;
}

/** AI clubs fill holes, upgrade weak seats and occasionally buy from a smaller club. */
export function aiWindow(save, rng, { poach = true, taken = new Set() } = {}) {
    const me = save.manager.teamId;
    const year = save.time.year;
    const faBy = (region) => save.freeAgents.map(id => save.players[id]).filter(p => p && regionOf(save, p) === region && !p.prospectFor);
    const news = [];
    // Who is the class of each league: the strongest side never poaches, so a
    // dynasty has to be built, not bought every window.
    const leagueRank = {};
    for (const region of new Set(Object.values(save.teams).map(t => t.region))) {
        Object.values(save.teams).filter(t => t.region === region && t.tier === 1)
            .sort((a, b) => teamStrengthOf(save, b) - teamStrengthOf(save, a))
            .forEach((t, i) => { leagueRank[t.id] = i + 1; });
    }
    const affordable = (t, p) => wageBill(save, t) + wageDemand(p, year, t.region) <= wageBudget(save, t);
    for (const t of Object.values(save.teams)) {
        if (t.id === me) continue;
        const has = (role) => t.roster.some(id => save.players[id] && save.players[id].role === role);
        // 1. Every role covered, and a minimum squad.
        for (const role of ROLE_IDS) {
            if (has(role)) continue;
            const fa = faBy(t.region).filter(p => p.role === role).sort((a, b) => ovrOf(b) - ovrOf(a))[0]
                || regensFor(save, t.region, 1, year, rng, taken).map(p => { p.role = role; p.roles = [role]; return p; })[0];
            if (fa) signTo(save, fa, t, { rng });
        }
        while (t.roster.length < ROSTER_MIN) {
            const fa = faBy(t.region).sort((a, b) => ovrOf(b) - ovrOf(a))[0] || regensFor(save, t.region, 1, year, rng, taken)[0];
            if (!fa) break;
            signTo(save, fa, t, { rng });
        }
        // 2. Upgrade a weak starter from free agency.
        const lu = lineupOf(t, save.players);
        for (const role of ROLE_IDS) {
            const cur = lu[role];
            const curV = cur ? ovrAs(cur, role) : 50;
            const fa = faBy(t.region).filter(p => p.role === role && ovrOf(p) >= curV + 3 && affordable(t, p)).sort((a, b) => ovrOf(b) - ovrOf(a))[0];
            if (fa && rng() < 0.6) {
                signTo(save, fa, t, { rng });
                if (t.tier === 1 && ovrOf(fa) >= 80) news.push(`${t.name} sign free agent ${fa.name}.`);
            }
        }
        // 3. A tier-1 contender buys a star from a smaller club in its region.
        if (poach && t.tier === 1 && (t.rep || 0) >= 65 && (leagueRank[t.id] || 1) >= 2 && (leagueRank[t.id] || 1) <= 6 && rng() < 0.18) {
            const lu2 = lineupOf(t, save.players);
            const weakest = ROLE_IDS.slice().sort((a, b) => (lu2[a] ? ovrAs(lu2[a], a) : 0) - (lu2[b] ? ovrAs(lu2[b], b) : 0))[0];
            const curV = lu2[weakest] ? ovrAs(lu2[weakest], weakest) : 50;
            const target = Object.values(save.players)
                .filter(p => p.team && p.team !== t.id && p.team !== me && p.role === weakest
                    && save.teams[p.team].region === t.region && (save.teams[p.team].rep || 0) < (t.rep || 0) - 8
                    && ovrOf(p) >= curV + 4 && affordable(t, p) && !(fx(p).hardToBuy && rng() < 0.7))
                .sort((a, b) => ovrOf(b) - ovrOf(a))[0];
            if (target) {
                const from = save.teams[target.team];
                signTo(save, target, t, { years: 2, rng });
                from.lineup = bestLineup(from, save.players);
                news.push(`${t.name} buy ${target.name} from ${from.name}.`);
            }
        }
        // 4. Trim to the roster limit: release the weakest who is not in the five.
        while (t.roster.length > ROSTER_MAX) {
            const five = new Set(Object.values(bestLineup(t, save.players)));
            const out = t.roster.map(id => save.players[id]).filter(p => !five.has(p.id)).sort((a, b) => ovrOf(a) - ovrOf(b))[0];
            if (!out) break;
            release(save, out);
            out.reg = t.region;
        }
        t.lineup = bestLineup(t, save.players);
        t.pref = bestTactic(lineupOf(t, save.players));
    }
    return news;
}

/** At the offseason: AI clubs renew who they want and let the rest go. */
export function aiRenewals(save, rng) {
    const me = save.manager.teamId;
    const year = save.time.year;      // the year that is ending
    for (const t of Object.values(save.teams)) {
        if (t.id === me) continue;
        const five = new Set(Object.values(bestLineup(t, save.players)));
        const avg = t.roster.reduce((s, id) => s + ovrOf(save.players[id]), 0) / Math.max(1, t.roster.length);
        for (const id of t.roster.slice()) {
            const p = save.players[id];
            if (!p || (p.until || 0) > year) continue;
            const keep = five.has(p.id) || ovrOf(p) >= avg - 3 || (ageOf(p, year) <= 20 && p.pot >= avg);
            if (keep && rng() < 0.9) {
                p.until = year + randInt(rng, 1, 2);
                p.wage = Math.round(wageDemand(p, year + 1, t.region, { renewal: true }) * (0.9 + rng() * 0.1) / 1000) * 1000;
            } else {
                release(save, p);
                p.reg = t.region;
            }
        }
    }
}

/** During a window, AI clubs bid for the manager's players. */
export function aiBidsForUser(save, rng) {
    const me = save.teams[save.manager.teamId];
    if (!me) return [];
    const out = [];
    const mine = me.roster.map(id => save.players[id]).filter(Boolean);
    for (const p of mine) {
        if (rng() > 0.16) continue;
        const buyers = Object.values(save.teams).filter(t => t.id !== me.id && t.tier === 1 && (t.rep || 0) >= (me.rep || 0) - 5
            && t.roster.length < ROSTER_MAX);
        if (!buyers.length) continue;
        const b = pick(rng, buyers);
        const fee = Math.round(askingPrice(save, p) * (0.8 + rng() * 0.45) / 5000) * 5000;
        const o = { id: 'o' + save.time.year + '-' + save.time.step + '-' + p.id, pid: p.id, from: b.id, fee, y: save.time.year, s: save.time.step };
        if (!(save.offers || []).some(x => x.pid === p.id)) {
            save.offers = [...(save.offers || []), o];
            out.push(o);
        }
    }
    return out;
}
