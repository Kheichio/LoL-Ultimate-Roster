// ===========================================================================
//  ULTIMATE MANAGER -- the manager's own money
//
//  `manager.bank` is the manager's personal account, separate from any club's
//  balance (`save.finance`), and it follows him from job to job.
//
//    SALARY     a hired manager is paid by his club, by its size and his reputation.
//               A sole owner pays himself what he likes, up to a limit, out of the
//               club's balance.
//    DEPOSITS   the manager can put his own money into the club he runs, and a sole
//               owner can take it back out.
//    STAKES     leaving a club does not sell what he owns of it: `manager.stakes`
//               ({ teamId: pct }) keeps it, and every year it pays a share of the
//               club's profit. It can be sold at the club's value, and a majority
//               holder can walk back into the club at any time.
//    FOUNDING   a new club costs FOUND_COST, paid from the bank. It buys the league
//               place of the weakest club of that tier in the region (see
//               foundNewClub in the engine), so it can happen at any point of a year.
//
//  Pure: the engine writes the inbox.
// ===========================================================================
import {
    STEPS_PER_YEAR, MANAGER_SALARY_SHARE, MANAGER_SALARY_MIN, OWNER_SALARY_MAX_SHARE, FOUND_COST, DIVIDEND_SHARE,
    PRIZES, SPLITS, TEAM_EMBLEM_BY_ID,
} from './data.js';
import { clamp } from './util.js';
import { sponsorIncome, ownerStake, setOwnerStake, soleOwner, econIndex, clubValueOf, fmtK } from './market.js';

const myTeam = (save) => (save.manager && save.manager.teamId ? save.teams[save.manager.teamId] : null);

export const bankOf = (save) => Number(save.manager && save.manager.bank) || 0;

/** Money in or out of the manager's own account. */
export function bankMove(save, amount, label) {
    const m = save.manager;
    m.bank = Math.round(bankOf(save) + amount);
    m.bankLog = [{ y: save.time.year, s: save.time.step, label, amount: Math.round(amount) }, ...(m.bankLog || [])].slice(0, 40);
}

// ---------------------------------------------------------------- salary
/** What a club pays a hired manager a year: its size, and how well known he is. */
export function hiredSalary(save, team) {
    const rep = clamp(Number(save.manager.rep) || 0, 0, 100);
    const v = sponsorIncome(save, team) * MANAGER_SALARY_SHARE * (0.6 + rep / 100);
    return Math.max(Math.round(MANAGER_SALARY_MIN * econIndex(save)), Math.round(v / 1000) * 1000);
}
export const ownerSalaryMax = (save, team) => Math.round(sponsorIncome(save, team) * OWNER_SALARY_MAX_SHARE / 1000) * 1000;

/** The manager's yearly pay at his current club. */
export function salaryOf(save) {
    const t = myTeam(save);
    if (!t) return 0;
    if (soleOwner(save)) return clamp(Math.round(Number(t.ownerPay) || 0), 0, ownerSalaryMax(save, t));
    return hiredSalary(save, t);
}
/** A sole owner sets his own pay. */
export function setOwnerSalary(save, amount) {
    const t = myTeam(save);
    if (!t || !soleOwner(save)) return { ok: false, msg: 'Only the sole owner sets their own salary.' };
    const v = clamp(Math.round((Number(amount) || 0) / 1000) * 1000, 0, ownerSalaryMax(save, t));
    t.ownerPay = v;
    return { ok: true, msg: `You now pay yourself ${fmtK(v)} a year.` };
}
/** A week's pay: out of the club, into the bank. An owner in debt does not get paid. */
export function paySalary(save) {
    const t = myTeam(save);
    if (!t) return 0;
    if (soleOwner(save) && save.finance.balance <= 0) return 0;
    const pay = Math.round(salaryOf(save) / STEPS_PER_YEAR);
    if (pay <= 0) return 0;
    save.manager.bank = bankOf(save) + pay;
    return pay;
}

// ---------------------------------------------------------------- the club's money
export function depositToClub(save, amount) {
    const t = myTeam(save);
    const v = Math.round(Number(amount) || 0);
    if (!t) return { ok: false, msg: 'You have no club.' };
    if (v <= 0) return { ok: false, msg: 'Enter an amount.' };
    if (v > bankOf(save)) return { ok: false, msg: `You have ${fmtK(bankOf(save))} in the bank.` };
    bankMove(save, -v, `Invested in ${t.name}`);
    save.finance.balance += v;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: 'Invested by the manager', amount: v });
    return { ok: true, msg: `You put ${fmtK(v)} of your own money into ${t.name}.` };
}
export function withdrawFromClub(save, amount) {
    const t = myTeam(save);
    const v = Math.round(Number(amount) || 0);
    if (!t || !soleOwner(save)) return { ok: false, msg: 'Only the sole owner can take money out of the club.' };
    if (v <= 0) return { ok: false, msg: 'Enter an amount.' };
    if (v > save.finance.balance) return { ok: false, msg: `The club only has ${fmtK(save.finance.balance)}.` };
    save.finance.balance -= v;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: 'Taken out by the owner', amount: -v });
    bankMove(save, v, `Taken out of ${t.name}`);
    return { ok: true, msg: `You took ${fmtK(v)} out of ${t.name}.` };
}

// ---------------------------------------------------------------- stakes in clubs he has left
/** What he owns of clubs he does not run: [{ team, pct, value, dividend }]. */
export function holdings(save) {
    return Object.entries(save.manager.stakes || {}).map(([id, pct]) => {
        const team = save.teams[id];
        if (!team) return null;
        return { team, pct, value: Math.round(clubValueOf(save, team) * pct / 100 / 10000) * 10000, dividend: Math.round(yearProfit(save, team) * pct / 100 / 1000) * 1000 };
    }).filter(Boolean);
}
/** He is leaving his club: what he owns of it stays his. */
export function keepStake(save) {
    const t = myTeam(save);
    const own = ownerStake(save);
    if (!t || own <= 0) return;
    save.manager.stakes = { ...(save.manager.stakes || {}), [t.id]: own };
}
/** He has just joined a club he owns some of: the stake is working again. */
export function restoreStake(save) {
    const t = myTeam(save);
    const held = t && (save.manager.stakes || {})[t.id];
    if (!held) return;
    setOwnerStake(save, held);
    const rest = { ...save.manager.stakes };
    delete rest[t.id];
    save.manager.stakes = rest;
}
/** A club's profit for the year, for its owners: a share of its income, and what it won. */
export function yearProfit(save, team) {
    let v = sponsorIncome(save, team) * DIVIDEND_SHARE;
    const S = save.season;
    if (S) {
        const pl = S.places[team.id] || {};
        const table = team.tier === 1 ? PRIZES.league : PRIZES.tier2;
        for (const sp of SPLITS) v += (table[pl[sp]] || 0) * econIndex(save) * 0.5;
        for (const [ev, table2] of [['firststand', PRIZES.firststand], ['msi', PRIZES.msi], ['worlds', PRIZES.worlds]]) {
            const b = S[ev];
            const place = b && b.places ? b.places[team.id] : null;
            if (place) v += (table2[place <= 2 ? place : place <= 4 ? 3 : place <= 8 ? 5 : 9] || 0) * econIndex(save) * 0.5;
        }
    }
    return Math.round(v);
}
/** The year end: every held stake pays its share of that club's profit. Returns what was paid. */
export function payDividends(save) {
    const out = [];
    for (const h of holdings(save)) {
        if (h.dividend <= 0) continue;
        bankMove(save, h.dividend, `${h.pct}% of ${h.team.name}'s profit`);
        out.push({ name: h.team.name, pct: h.pct, amount: h.dividend });
    }
    return out;
}
export function sellHolding(save, teamId) {
    const h = holdings(save).find(x => x.team.id === teamId);
    if (!h) return { ok: false, msg: 'You do not own any of that club.' };
    bankMove(save, h.value, `Sold ${h.pct}% of ${h.team.name}`);
    const rest = { ...save.manager.stakes };
    delete rest[teamId];
    save.manager.stakes = rest;
    return { ok: true, msg: `You sold your ${h.pct}% of ${h.team.name} for ${fmtK(h.value)}.` };
}

// ---------------------------------------------------------------- founding and rebranding
export const foundCost = (save, tier) => Math.round((FOUND_COST[tier] || FOUND_COST[2]) * econIndex(save) / 10000) * 10000;

/** Clean a club's new name and tag, and make sure the tag is not somebody else's. */
export function cleanIdentity(save, { name, short }, selfId = null) {
    const nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    const sh = String(short || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 5).toUpperCase();
    if (nm.length < 2) return { ok: false, msg: 'Give the club a name.' };
    if (sh.length < 2) return { ok: false, msg: 'Give the club a tag of two to five letters.' };
    const clash = Object.values(save.teams).find(t => t.id !== selfId && (t.short.toUpperCase() === sh || t.name.toLowerCase() === nm.toLowerCase()));
    if (clash) return { ok: false, msg: `${clash.name} already goes by that.` };
    return { ok: true, name: nm, short: sh };
}
/** Give a club a new identity, keeping a record of the old one. */
export function renameClub(save, team, { name, short, color, emblem }) {
    if (name !== team.name) team.names = [...(team.names || []), { y: save.time.year, name: team.name, short: team.short }].slice(-8);
    team.name = name;
    team.short = short;
    if (color) team.color = color;
    if (emblem !== undefined) team.emblem = TEAM_EMBLEM_BY_ID[emblem] ? emblem : null;
}
/** A sole owner can rebrand his club, founded or not. */
export function rebrandClub(save, cfg) {
    const t = myTeam(save);
    if (!t || !soleOwner(save)) return { ok: false, msg: 'Only the sole owner can rebrand the club.' };
    const c = cleanIdentity(save, cfg, t.id);
    if (!c.ok) return c;
    const old = t.name;
    renameClub(save, t, { name: c.name, short: c.short, color: cfg.color, emblem: cfg.emblem });
    t.rebranded = true;      // the real-world renames leave it alone from now on
    return { ok: true, msg: old === c.name ? `${t.name} has a new look.` : `${old} are now ${t.name}.` };
}
