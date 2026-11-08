// ===========================================================================
//  ULTIMATE MANAGER -- sponsors
//
//  The manager's club earns a base revenue (SPONSOR_BASE_SHARE of its market
//  income: streaming, merchandise, the league's share) plus the deals it lands.
//  Deals are pitched for, one slot at a time (SPONSOR_SLOTS), and brands only say
//  yes to a club that is winning: `sponsorAppeal` reads reputation, this year's
//  results, last year's finish and recent titles. Every deal asks for something
//  (a board objective id) and pays a bonus when it is met; a brand whose goal is
//  missed walks away at the end of the year. Titles bring brands to the club.
//
//  AI clubs and the board's wage limit still run on the market income
//  (market.sponsorIncome); only the manager's money flows through here.
// ===========================================================================
import {
    SPONSOR_SLOTS, SPONSOR_SLOT_BY_ID, SPONSOR_BRANDS, SPONSOR_GOALS, SPONSOR_BASE_SHARE, SPONSOR_PITCHES_PER_WEEK, SPLITS,
} from './data.js';
import { clamp, pick, randInt, shuffle } from './util.js';
import { sponsorIncome, earn } from './market.js';
import { leagueKey } from './season.js';
import { fansOf, fanFactor } from './clublife.js';

const myTeam = (save) => (save.manager && save.manager.teamId ? save.teams[save.manager.teamId] : null);
const stampOf = (save) => save.time.year * 100 + save.time.step;

export function blankSponsors() {
    return { deals: [], offers: [], pitched: { stamp: -1, n: 0 }, log: [] };
}

/** The club's series record in this year's league. */
function seasonRecord(save, team) {
    const S = save.season;
    const L = S && S.leagues ? S.leagues[leagueKey(team.region, team.tier)] : null;
    let w = 0, l = 0;
    for (const sp of SPLITS) {
        const r = L && L[sp] && L[sp].table ? L[sp].table[team.id] : null;
        if (r) { w += Number(r.w) || 0; l += Number(r.l) || 0; }
    }
    return { w, l };
}

/**
 * How attractive the club is to a brand, 0..1, and why: reputation, this year's
 * results (shrunk toward even early on), last year's best finish and titles won
 * in the last two years. A second-tier club is worth a fifth less.
 */
export function sponsorAppeal(save) {
    const t = myTeam(save);
    if (!t) return { value: 0, parts: [] };
    const rep = clamp(Number(t.rep) || 0, 0, 100) / 100;
    const { w, l } = seasonRecord(save, t);
    const form = (w + 2) / (w + l + 4);
    const last = (save.history || []).slice(-1)[0];
    const me = last && last.me && last.me.teamId === t.id ? last.me : null;
    const best = me ? Math.min(me.winter || 99, me.spring || 99, me.summer || 99) : 99;
    let lastYear = best === 1 ? 1 : best === 2 ? 0.8 : best <= 4 ? 0.6 : best <= 6 ? 0.35 : me ? 0.15 : 0.3;
    if (me && me.worlds) lastYear = Math.min(1, lastYear + 0.2);
    const titles = (save.manager.trophies || []).filter(x => x.teamId === t.id && x.kind !== 'promotion' && x.year >= save.time.year - 1).length;
    const titleBonus = Math.min(0.2, titles * 0.07);
    const fans = fansOf(t) / 100;
    let v = rep * 0.32 + form * 0.33 + fans * 0.1 + lastYear * 0.15 + titleBonus;
    if (t.tier === 2) v *= 0.8;
    v = clamp(v, 0, 1);
    return {
        value: Math.round(v * 100) / 100,
        parts: [
            { label: 'Reputation', value: Math.round(rep * 100), weight: 32 },
            { label: `This year ${w}-${l}`, value: Math.round(form * 100), weight: 33 },
            { label: 'Fans', value: Math.round(fans * 100), weight: 10 },
            { label: 'Last year\'s finish', value: Math.round(lastYear * 100), weight: 15 },
            { label: `Titles (last two years: ${titles})`, value: Math.round(titleBonus * 500), weight: 10 },
        ],
    };
}

/** What a slot is worth to this club at its appeal (a deal's value before the goal). */
function slotValue(save, slot, appeal) {
    const t = myTeam(save);
    return sponsorIncome(save, t) * slot.share * (0.6 + appeal * 0.9);
}

/** The chance a pitch to this slot lands at least one offer. */
export function pitchChance(save, slotId) {
    const slot = SPONSOR_SLOT_BY_ID[slotId];
    if (!slot) return 0;
    return clamp(sponsorAppeal(save).value * 1.3 - slot.diff, 0.05, 0.92);
}

export function pitchesLeft(save) {
    const sp = save.sponsors || blankSponsors();
    return sp.pitched && sp.pitched.stamp === stampOf(save) ? Math.max(0, SPONSOR_PITCHES_PER_WEEK - sp.pitched.n) : SPONSOR_PITCHES_PER_WEEK;
}

function makeOffer(save, slot, appeal, rng, inbound = false) {
    const t = myTeam(save);
    const taken = new Set([...(save.sponsors.deals || []), ...(save.sponsors.offers || [])].map(d => d.brand));
    const brand = shuffle(rng, (SPONSOR_BRANDS[slot.id] || ['Sponsor']).slice()).find(b => !taken.has(b)) || pick(rng, SPONSOR_BRANDS[slot.id]);
    // A stronger club is asked for more, and paid more for it.
    const goals = SPONSOR_GOALS[t.tier === 2 ? 2 : 1];
    const maxTier = appeal >= 0.7 ? 2 : appeal >= 0.45 ? 1 : 0;
    const goal = pick(rng, goals.filter(g => g.tier <= maxTier && g.tier >= Math.max(0, maxTier - 1)));
    const mult = goal.tier === 2 ? 1.25 : goal.tier === 1 ? 1.05 : 0.9;
    const value = Math.round(slotValue(save, slot, appeal) * mult * (0.85 + rng() * 0.3) * (inbound ? 1.1 : 1) / 1000) * 1000;
    const years = randInt(rng, 1, 3);
    return {
        id: 'so' + stampOf(save) + '-' + slot.id + '-' + Math.floor(rng() * 1e6),
        slot: slot.id, brand, value, years, goal: { id: goal.id, text: goal.text },
        bonus: Math.round(value * 0.3 / 1000) * 1000, exp: stampOf(save) + 2, inbound,
    };
}

/** Ask brands for a slot. Winning clubs get offers; others get told why not. */
export function pitchSponsor(save, slotId, rng = Math.random) {
    const t = myTeam(save);
    const slot = SPONSOR_SLOT_BY_ID[slotId];
    if (!t || !slot) return { ok: false, msg: 'No club to pitch for.' };
    ensureSponsors(save);
    if (save.sponsors.deals.some(d => d.slot === slotId)) return { ok: false, msg: `You already have a ${slot.name.toLowerCase()}.` };
    if (pitchesLeft(save) <= 0) return { ok: false, msg: 'You have pitched to enough brands this week. Try again next week.' };
    const sp = save.sponsors;
    sp.pitched = sp.pitched && sp.pitched.stamp === stampOf(save) ? { stamp: sp.pitched.stamp, n: sp.pitched.n + 1 } : { stamp: stampOf(save), n: 1 };
    const appeal = sponsorAppeal(save).value;
    if (rng() >= pitchChance(save, slotId)) {
        const why = appeal < 0.35 ? 'they want a club that is winning' : appeal < 0.55 ? 'they want to see better results first' : 'they went with another club this time';
        return { ok: false, msg: `No brand bit for the ${slot.name.toLowerCase()}: ${why}.` };
    }
    const n = appeal >= 0.75 ? 3 : appeal >= 0.5 ? 2 : 1;
    const made = [];
    for (let i = 0; i < n; i++) made.push(makeOffer(save, slot, appeal, rng));
    sp.offers = [...sp.offers.filter(o => o.slot !== slotId), ...made];
    return { ok: true, msg: `${made.length} brand${made.length === 1 ? '' : 's'} want${made.length === 1 ? 's' : ''} to talk about the ${slot.name.toLowerCase()}.`, offers: made };
}

export function acceptSponsor(save, offerId) {
    ensureSponsors(save);
    const sp = save.sponsors;
    const o = sp.offers.find(x => x.id === offerId);
    if (!o) return { ok: false, msg: 'That offer is gone.' };
    if (sp.deals.some(d => d.slot === o.slot)) return { ok: false, msg: 'That slot is already taken.' };
    const year = save.time.year;
    sp.deals.push({ id: o.id, slot: o.slot, brand: o.brand, value: o.value, from: year, until: year + o.years - 1, goal: o.goal, bonus: o.bonus });
    sp.offers = sp.offers.filter(x => x.slot !== o.slot);
    return { ok: true, msg: `${o.brand} sign on as your ${SPONSOR_SLOT_BY_ID[o.slot].name.toLowerCase()}: ${Math.round(o.value / 1000)}K a year until ${year + o.years - 1}.` };
}

export function declineSponsor(save, offerId) {
    ensureSponsors(save);
    save.sponsors.offers = save.sponsors.offers.filter(x => x.id !== offerId);
    return { ok: true, msg: 'Offer declined.' };
}

/** End a deal early: the brand is gone, nothing more is paid. */
export function dropSponsor(save, dealId) {
    ensureSponsors(save);
    const d = save.sponsors.deals.find(x => x.id === dealId);
    if (!d) return { ok: false, msg: 'No such deal.' };
    save.sponsors.deals = save.sponsors.deals.filter(x => x.id !== dealId);
    return { ok: true, msg: `${d.brand} is no longer your sponsor.` };
}

/** What the deals pay in a year. */
export function dealIncome(save) {
    return ((save.sponsors && save.sponsors.deals) || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
}
/** The club's base revenue: streaming, merchandise and the league's share. */
export function baseRevenue(save, team) {
    return Math.round(sponsorIncome(save, team) * SPONSOR_BASE_SHARE * fanFactor(team) * facilityRevenue(team) / 1000) * 1000;
}
/** The streaming studio adds to base revenue (facilities, clublife). */
function facilityRevenue(team) {
    const lv = team && team.fac ? Number(team.fac.studio) || 0 : 0;
    return 1 + lv * 0.06;
}
/** The manager's yearly income from the club's commercial side. */
export function clubIncome(save, team) {
    return baseRevenue(save, team) + dealIncome(save);
}

/** Offers expire after two weeks. */
export function expireSponsorOffers(save) {
    if (!save.sponsors) return;
    save.sponsors.offers = save.sponsors.offers.filter(o => o.exp >= stampOf(save));
}

/** A title, or a club in form at the start of the year: a brand comes knocking for an empty slot. */
export function inboundSponsor(save, rng = Math.random) {
    const t = myTeam(save);
    if (!t) return null;
    ensureSponsors(save);
    const free = SPONSOR_SLOTS.filter(s => !save.sponsors.deals.some(d => d.slot === s.id) && !save.sponsors.offers.some(o => o.slot === s.id));
    if (!free.length) return null;
    const slot = free[0];
    const o = makeOffer(save, slot, Math.max(0.6, sponsorAppeal(save).value), rng, true);
    o.exp = stampOf(save) + 4;
    save.sponsors.offers.push(o);
    return o;
}

/**
 * The year is over: each deal's goal is judged (`met(goalId)` is the board's own
 * objective check). Met pays the bonus; missed sends the brand away; a deal at the
 * end of its term ends. Returns lines for the season review.
 */
export function settleSponsors(save, met) {
    ensureSponsors(save);
    const year = save.time.year;
    const lines = [];
    const keep = [];
    for (const d of save.sponsors.deals) {
        const ok = d.goal ? met({ id: d.goal.id }) : true;
        if (d.goal && ok && d.bonus) { earn(save, d.bonus, `${d.brand} bonus`); lines.push({ brand: d.brand, kind: 'bonus', text: `${d.goal.text}: met, ${Math.round(d.bonus / 1000)}K bonus` }); }
        if (d.goal && !ok) { lines.push({ brand: d.brand, kind: 'left', text: `${d.goal.text}: missed, they walk away` }); continue; }
        if (d.until <= year) { lines.push({ brand: d.brand, kind: 'ended', text: 'contract ended' }); continue; }
        keep.push(d);
    }
    save.sponsors.deals = keep;
    save.sponsors.offers = [];
    save.sponsors.log = [...lines.map(l => ({ y: year, ...l })), ...(save.sponsors.log || [])].slice(0, 24);
    return lines;
}

/**
 * A save or a club without a sponsors block gets one. A club the manager takes over
 * arrives with its current shirt and hardware partners until the end of the year, so
 * nobody starts at half income; a founded club starts with none.
 */
export function ensureSponsors(save, { fresh = false } = {}) {
    if (!fresh && save.sponsors && Array.isArray(save.sponsors.deals)) {
        if (!Array.isArray(save.sponsors.offers)) save.sponsors.offers = [];
        if (!save.sponsors.pitched) save.sponsors.pitched = { stamp: -1, n: 0 };
        return save.sponsors;
    }
    save.sponsors = blankSponsors();
    const t = myTeam(save);
    if (t && !t.custom) {
        const year = save.time.year;
        for (const id of ['shirt', 'hardware']) {
            const slot = SPONSOR_SLOT_BY_ID[id];
            save.sponsors.deals.push({
                id: 'start-' + id + '-' + year, slot: id, brand: SPONSOR_BRANDS[id][(t.id.length + year) % SPONSOR_BRANDS[id].length],
                value: Math.round(sponsorIncome(save, t) * slot.share / 1000) * 1000, from: year, until: year, goal: null, bonus: 0, legacy: true,
            });
        }
    }
    return save.sponsors;
}
