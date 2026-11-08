// ===========================================================================
//  ULTIMATE MANAGER -- the job market
//
//  Clubs part with their managers: after a bad season (offseason), a poor spring
//  (the mid-season break) and now and then mid-split. Each opening is a vacancy
//  in `save.vacancies` = [{ teamId, from, until, why, applied, offered }], where
//  from/until are absolute steps (year * STEPS_PER_YEAR + step). The manager can
//  apply once per vacancy, employed or jobless; a club that says yes goes into
//  `save.jobOffers`, which `acceptJob` already takes. Unfilled vacancies expire
//  (the club appoints someone else). Pure: the engine writes the inbox and news.
// ===========================================================================
import { STEPS_PER_YEAR } from './data.js';
import { clamp } from './util.js';
import { ownerStake } from './market.js';

export const VACANCY_WEEKS = 14;
const absStep = (save) => save.time.year * STEPS_PER_YEAR + save.time.step;

/** Live vacancies, newest first: not the manager's own club and not a folded one. */
export function vacancies(save) {
    const me = save.manager && save.manager.teamId;
    return (save.vacancies || []).filter(v => save.teams[v.teamId] && v.teamId !== me).sort((a, b) => b.from - a.from);
}
export const weeksLeft = (save, v) => Math.max(0, v.until - absStep(save));

/** Open `n` new vacancies, mostly at clubs that finished low last split. */
export function refreshVacancies(save, rng, n, why) {
    const me = save.manager && save.manager.teamId;
    const have = new Set((save.vacancies || []).map(v => v.teamId));
    const pressure = (t) => {
        const rows = Array.isArray(t.sh) ? t.sh : [];
        const last = rows[rows.length - 1];
        const size = t.tier === 1 ? 10 : 8;
        return (last ? (last.p || size / 2) / size : 0.5) + rng() * 0.7;
    };
    const pool = Object.values(save.teams).filter(t => t.id !== me && !t.custom && !have.has(t.id))
        .map(t => ({ t, s: pressure(t) })).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.t);
    const now = absStep(save);
    save.vacancies = [...(save.vacancies || []), ...pool.map(t => ({ teamId: t.id, from: now, until: now + VACANCY_WEEKS, why, applied: false, offered: false }))];
    return pool;
}

/** Drop vacancies whose time ran out; returns the clubs that appointed someone else. */
export function expireVacancies(save) {
    const now = absStep(save);
    const gone = (save.vacancies || []).filter(v => v.until <= now || !save.teams[v.teamId]);
    save.vacancies = (save.vacancies || []).filter(v => v.until > now && save.teams[v.teamId]);
    // An offer that came from an expired vacancy lapses with it.
    const lapsed = new Set(gone.filter(v => v.offered).map(v => v.teamId));
    if (lapsed.size) save.jobOffers = (save.jobOffers || []).filter(id => !lapsed.has(id));
    return gone.map(v => save.teams[v.teamId]).filter(Boolean);
}

/** The chance a club says yes: your reputation against theirs, titles, and how you left your last job. */
export function applyChance(save, teamId) {
    const t = save.teams[teamId];
    if (!t) return 0;
    const m = save.manager;
    const sackedNow = (m.history || []).some(h => h.left === 'sacked' && h.year === save.time.year);
    const c = 0.55 + ((m.rep || 0) - (t.rep || 50)) / 35 + (t.tier === 2 ? 0.15 : 0) + 0.02 * Math.min(5, m.titles || 0) - (sackedNow ? 0.1 : 0);
    return clamp(c, 0.03, 0.95);
}

export function applyForJob(save, teamId, rng = Math.random) {
    const v = (save.vacancies || []).find(x => x.teamId === teamId);
    const t = save.teams[teamId];
    if (!v || !t) return { ok: false, msg: 'That job is gone.' };
    if (v.applied) return { ok: false, msg: `You have already applied to ${t.name}.` };
    if (save.manager.teamId && ownerStake(save) >= 50) return { ok: false, msg: 'You own your club. Sell your majority stake before looking elsewhere.' };
    v.applied = true;
    if (rng() < applyChance(save, teamId)) {
        v.offered = true;
        save.jobOffers = [...new Set([...(save.jobOffers || []), teamId])];
        return { ok: true, offered: true, msg: `${t.name} want you! Their offer is on the Jobs screen until the vacancy closes.` };
    }
    return { ok: true, offered: false, msg: `${t.name} thanked you for your interest and went another way.` };
}
