// ===========================================================================
//  LoL ULTIMATE CAREER -- scouting, contracts, transfers and role changes
// ===========================================================================
//  Everything that happens between "a club noticed you" and "you are on their
//  roster". scoutInterest() is the single source of truth for how badly a club
//  wants the player -- offers, negotiations, renewals and the Transfers screen
//  all read from it, so the weekly engine and the UI can never disagree about
//  who is watching.
//
//  Money in this file is weekly wage, not a lump sum. Forty weeks a year for
//  ten-plus years means a wage that looks small on the offer sheet is still the
//  dominant source of gold in a full career -- keep multipliers, not additions.

import {
    REGION_BY_ID, ROLE_BY_ID, PLAYSTYLES, PLAYSTYLE_BY_ID, CHAMPION_BY_ID,
    CLUB_TIERS, SQUAD_STATUS, PHASES, ATTR_KEYS,
    phaseForWeek, teamById, allTeams, championsForRole,
} from './constants.js';
import {
    calcOVR, calcPotentialOVR, deservedStatus, statusInfo, weeklySalaryFor,
    marketValueFor, SCOUT_MMR_GATE, clamp, clampAttr, emptyAttrs, fmtGold,
} from './ratings.js';
import {
    career, absWeek, addNews, grantGold, saveCareer,
} from '../stores/career.js';
import { teamsInRegion, allTeamsForPlayer, teamStrength } from './teams.js';
import { getDB, getEffectiveRating, getEra } from '../utils/cards.js';
import { showToast } from '../stores/toasts.js';
import { playSound } from '../utils/sound.js';

// ---------------------------------------------------------------------------
//  BALANCE DIALS
// ---------------------------------------------------------------------------

/** Four is enough to make a real choice and few enough that the screen still
 *  reads at a glance. A fifth club would only ever be noise. */
export const MAX_ACTIVE_OFFERS = 4;

/** Offers sit for three weeks. The offseason is five weeks long, so a player
 *  who sleeps on the first wave still gets a second one. */
const OFFER_LIFETIME_WEEKS = 3;

/** Below this a club is curious, not interested, and does not make the call. */
const MIN_OFFER_INTEREST = 35;

/** Turn a club down twice and they stop asking -- permanently. */
const REJECTIONS_BEFORE_BLACKLIST = 2;

/** The headline rule of the whole mode: nobody walks into a main-league
 *  starting seat under 72. Below it a tier-1 club will only ever promise a
 *  bench spot, and below 68 they will not promise anything at all. */
const T1_STARTER_FLOOR = 72;

/** An unsigned prospect needs Diamond (SCOUT_MMR_GATE) AND a real rating before
 *  an academy calls. A well-trained pre-comp player clears 50 at about 15. */
const ACADEMY_OVR_GATE = 50;

/** Signing an open-circuit side is the intended way off UNSIGNED_SOFT_CAP, so
 *  it must not be free: Platinum and a rating that is genuinely amateur-level
 *  first. Anything cheaper and the pre-comp path becomes strictly dominant. */
const AMATEUR_OVR_GATE = 48;
const AMATEUR_MMR_GATE = 1600;

/** Two rounds of haggling per offer. A third is just savescumming. */
const MAX_NEGOTIATIONS = 2;

/** Ask for more than 35% over their valuation and they may walk. */
const NEGOTIATION_TOLERANCE = 0.35;

/** Your own club values continuity, and prices it in on a renewal. */
const LOYALTY_BONUS = 10;

/** Role change costs, in attribute points, spread by role weight.
 *  ROLE_DECAY hits what the old role leaned on and the new one does not;
 *  ROLE_RUST hits the new role's key attributes because you are relearning
 *  them. Together they cost roughly 7-10 OVR -- a season of training for a
 *  16-year-old, most of what is left for a 22-year-old. */
const ROLE_DECAY_SCALE = 26;
const ROLE_RUST_SCALE = 20;

const STATUS_LADDER = ['benched', 'sub', 'rotation', 'starter', 'star'];

const OFFSEASON_FROM = (PHASES.find(p => p.id === 'offseason') || { from: 36 }).from;

// Punctuation the UI reuses. Written as escapes: this repo has been corrupted
// by encoding issues before, so nothing above U+007F goes in as a literal.
const DOT = ' \u{2022} ';
const ARROW = ' \u{2192} ';
const DASH = '\u{2014}';

// ---------------------------------------------------------------------------
//  STORE ACCESS
// ---------------------------------------------------------------------------

/** A snapshot of the career store. Exactly what svelte's get() does; this
 *  module's import surface is deliberately narrow so we do it by hand rather
 *  than pull in another dependency. */
function snap() {
    let v = null;
    const un = career.subscribe(x => { v = x; });
    un();
    return v;
}

// ---------------------------------------------------------------------------
//  TEAM PLUMBING
//  teams.js owns the world. constants.js is the floor we fall back to if a
//  helper ever hands back something unusable -- an empty transfer market is a
//  dead screen, and that is worse than a slightly stale team list.
// ---------------------------------------------------------------------------

function normTeam(t) {
    if (!t || !t.id) return null;
    return {
        id: t.id,
        name: t.name || String(t.id),
        tier: Number(t.tier) || 1,
        strength: Number.isFinite(Number(t.strength)) ? Number(t.strength) : 60,
        accent: t.accent || '#94a3b8',
        region: t.region || 'ALL',
    };
}

function candidatePool(c) {
    let pool = null;
    try { pool = allTeamsForPlayer(c); } catch (e) { pool = null; }
    if (!Array.isArray(pool) || !pool.length) {
        try { pool = teamsInRegion(c?.player?.region); } catch (e) { pool = null; }
    }
    if (!Array.isArray(pool) || !pool.length) pool = allTeams();
    const seen = new Set();
    const out = [];
    for (const raw of pool) {
        const t = normTeam(raw);
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
    }
    return out;
}

function strengthOf(team) {
    let s = NaN;
    try { s = Number(teamStrength(team)); } catch (e) { s = NaN; }
    if (!Number.isFinite(s)) s = Number(team?.strength);
    return Number.isFinite(s) ? s : 60;
}

function resolveTeam(id) {
    if (!id) return null;
    const known = teamById(id);
    if (known) return normTeam(known);
    // teams.js may mint sides constants.js has never heard of (promoted orgs,
    // regional qualifiers). Look through the live pool before giving up.
    const hit = candidatePool(snap()).find(t => t.id === id);
    return hit || null;
}

/** Amateur sides are region-agnostic, so wages and relocation blurbs use the
 *  player's own region for them. */
function offerRegionFor(team, c) {
    if (team && team.region && team.region !== 'ALL') return team.region;
    return c?.player?.region || 'LEC';
}

// ---------------------------------------------------------------------------
//  CARD DATABASE FLAVOUR
//  Naming the player currently sitting in the seat makes an offer feel like it
//  came from a real roster. It is decoration only: window.playerDatabase may
//  not have loaded, so every path here has to survive getDB() returning null.
// ---------------------------------------------------------------------------

const ORG_SUFFIX = /\s+(global academy|academy|challengers|challenger|youth|junior|young|next|prime|rise|blue|white|toyama|tq|fenix|bee)$/i;

function orgName(name) {
    return String(name || '').replace(ORG_SUFFIX, '').trim();
}

const _incumbentCache = new Map();

function incumbentAt(team, role) {
    if (!team || !role) return null;
    const key = team.id + '|' + role;
    if (_incumbentCache.has(key)) return _incumbentCache.get(key);

    const db = getDB();
    if (!db) return null;   // never cache a miss caused by a database that has not loaded

    const org = orgName(team.name).toLowerCase();
    let best = null;
    for (const card of db) {
        if (!card || card.role !== role || !card.team) continue;
        const cardTeam = String(card.team).toLowerCase();
        // Exact match, or a containment match once the name is long enough that
        // a substring cannot collide ("T1" would match half the league).
        const match = cardTeam === org
            || (org.length >= 4 && (cardTeam.includes(org) || org.includes(cardTeam)));
        if (!match) continue;
        if (getEra(card.year) < 5) continue;   // current-ish rosters only
        if (!best || getEffectiveRating(card) > getEffectiveRating(best)) best = card;
    }

    const out = best ? { name: best.name, rating: getEffectiveRating(best) } : null;
    _incumbentCache.set(key, out);
    return out;
}

// ---------------------------------------------------------------------------
//  SQUAD STATUS HELPERS
// ---------------------------------------------------------------------------

function statusIndex(id) {
    const i = STATUS_LADDER.indexOf(id);
    return i < 0 ? 1 : i;
}

function stepStatus(id, delta) {
    return STATUS_LADDER[clamp(statusIndex(id) + delta, 0, STATUS_LADDER.length - 1)];
}

/** Enforces the tier-1 floor everywhere at once, so no code path can quietly
 *  hand a 69 OVR player a starting seat in the main league. */
function capStatusForTier(statusId, tier, ovr) {
    const s = SQUAD_STATUS[statusId] ? statusId : 'sub';
    if (Number(tier) !== 1) return s;
    if (ovr < T1_STARTER_FLOOR - 4) return 'benched';
    if (ovr < T1_STARTER_FLOOR) return statusIndex(s) > 1 ? 'sub' : s;
    return s;
}

function offerStatus(c, team, interest) {
    const p = c.player;
    const ovr = calcOVR(p.attrs, p.role);
    const pot = calcPotentialOVR(p.potential, p.role);
    let s = deservedStatus(ovr, strengthOf(team));

    // Academies sell minutes rather than money. A teenager with a real ceiling
    // gets promised a seat they have not earned yet -- that promise is the
    // entire recruiting pitch at tier 2.
    if (team.tier >= 2 && p.age <= 17 && pot - ovr >= 12) s = stepStatus(s, 1);

    // A club that has made you their first choice says so on the sheet.
    if (interest >= 85) s = stepStatus(s, 1);

    return capStatusForTier(s, team.tier, ovr);
}

// ---------------------------------------------------------------------------
//  SCOUTING
// ---------------------------------------------------------------------------

/**
 * How much a club wants this player right now, 0-100. Deterministic: the
 * Transfers screen can call it every render and generateOffers() can roll
 * against it without the two ever disagreeing.
 */
export function scoutInterest(c, team) {
    const t = normTeam(team);
    if (!c || !c.player || !t) return 0;

    const p = c.player;
    const ovr = calcOVR(p.attrs, p.role);
    const pot = calcPotentialOVR(p.potential, p.role);
    const str = strengthOf(t);
    const age = Number(p.age) || 18;
    const mmr = Number(c.soloq?.mmr) || 0;
    const hype = Math.max(0, Number(p.hype) || 0);

    // 50 means "you are exactly the level of this roster".
    let v = 50 + (ovr - str) * 3.1;

    // Upside. A 15-year-old with twenty points of headroom is chased harder
    // than a finished 22-year-old of the same rating. This is the single
    // biggest term for a prospect and it is worth nothing by the mid-twenties.
    const upside = Math.max(0, pot - ovr);
    const youth = age <= 16 ? 0.90 : age <= 18 ? 0.70 : age <= 20 ? 0.45 : age <= 23 ? 0.20 : 0;
    v += Math.min(30, upside) * youth;

    // Solo queue is nearly all a scout has on an unsigned kid and only a sanity
    // check on a pro whose games are on stage twice a week.
    const soloWeight = p.clubId ? 0.55 : 1.35;
    v += clamp((mmr - SCOUT_MMR_GATE) / 100 * 1.25, -22, 13) * soloWeight;

    v += clamp((p.form ?? 50) - 50, -50, 50) * 0.18;

    // Reputation. Square-rooted so the first ten thousand followers matter far
    // more than the next million -- fame gets you looked at, not signed.
    const fame = Math.min(12, Math.sqrt(hype) / 25);
    v += fame;

    // Age, separate from upside: even a maxed 27-year-old is a depreciating
    // asset and clubs price that in on top of the growth curve.
    v += age <= 17 ? 6 : age <= 21 ? 3 : age <= 24 ? 0 : age <= 26 ? -5 : age <= 28 ? -11 : -19;

    // Moving region costs you. Fame is what buys an import slot back.
    if (t.region !== 'ALL' && t.region !== p.region) v += -14 + Math.min(9, fame);

    // Already contracted somewhere better? They will not waste the call.
    const cur = p.clubId ? resolveTeam(p.clubId) : null;
    if (cur && cur.id !== t.id) {
        const step = str - strengthOf(cur);
        if (step < 0) v += Math.max(-25, step * 1.8);
    }

    // A public transfer request is an open door, and it expires with the year
    // it was handed in.
    if (p.transferRequested && (p.transferRequestYear == null || p.transferRequestYear === c.time?.year)) {
        v += 12;
    }

    // LCP raids academies for anything that moves; the LCS waits for a
    // highlight reel to be handed to it.
    v *= (REGION_BY_ID[t.region]?.scoutMult) || 1;

    return Math.round(clamp(v, 0, 100));
}

/** Who is watching, best first. Drives the Transfers screen. */
export function interestedTeams(c, limit = 8) {
    if (!c || !c.player) return [];
    const mine = c.player.clubId;
    const n = Math.max(1, Math.round(Number(limit)) || 8);
    return candidatePool(c)
        .filter(t => t.id !== mine)
        .map(t => ({ team: t, interest: scoutInterest(c, t), tier: t.tier }))
        .filter(row => row.interest > 0)
        .sort((a, b) => b.interest - a.interest || a.team.name.localeCompare(b.team.name))
        .slice(0, n);
}

// ---------------------------------------------------------------------------
//  OFFERS
// ---------------------------------------------------------------------------

let _offerSeq = 0;
function nextOfferId() {
    return 'of' + Date.now().toString(36) + '_' + (++_offerSeq).toString(36);
}

function defaultYears(p, interest) {
    if (p.age <= 17) return 3;              // lock the prospect down before a rival sees it
    if (p.age >= 28) return 1;              // nobody guarantees a veteran a third season
    if (p.age <= 21) return interest >= 70 ? 3 : 2;
    return 2;
}

function offerBlurb(c, t, tier, status, region, interest) {
    const p = c.player;
    const roleShort = ROLE_BY_ID[p.role]?.short || p.role;
    const lines = [];

    switch (status) {
        case 'star':
            lines.push(`${t.name} want to build the roster around you.`);
            break;
        case 'starter':
            lines.push(`${t.name} are offering the starting ${roleShort} seat from day one.`);
            break;
        case 'rotation':
            lines.push(`${t.name} will rotate you in and let the split decide who keeps the seat.`);
            break;
        case 'sub':
            lines.push(`${t.name} want you on the bench first. The wage reflects that, and so does the stage time.`);
            break;
        default:
            lines.push(`${t.name} would take you as depth. Do not expect to play this split.`);
            break;
    }

    const inc = incumbentAt(t, p.role);
    if (inc) {
        lines.push(statusIndex(status) >= 3
            ? `${inc.name} is the one making way.`
            : `${inc.name} is ahead of you there.`);
    }

    if (tier === 2) lines.push('Academy terms: small money, real coaching, and a route upstairs if you take it.');
    if (tier === 3) lines.push('Open-circuit terms. Barely a wage, but it is a club, a coach, and a soft cap you no longer have.');
    if (region !== p.region) {
        lines.push(`Relocating to ${REGION_BY_ID[region]?.name || region}. New language, new solo queue, no friends.`);
    }
    if (interest >= 88) lines.push('You are their first choice and they are not hiding it.');

    return lines.join(' ');
}

/**
 * Build a complete offer sheet. Deterministic apart from the generated id, so
 * renewalOffer() and the negotiation revisions can both re-derive the same
 * numbers without the screen jittering.
 *
 * opts may override any of: id, interest, role, tier, region, status, salary,
 * years, signingBonus, releaseClause, expiresWeek.
 */
export function buildOffer(c, team, opts = {}) {
    const t = normTeam(team);
    if (!c || !c.player || !t) return null;

    const p = c.player;
    const ovr = calcOVR(p.attrs, p.role);
    const pot = calcPotentialOVR(p.potential, p.role);

    const tier = Number(opts.tier) || t.tier || 1;
    const region = opts.region || offerRegionFor(t, c);
    const role = opts.role || p.role;
    const interest = Number.isFinite(opts.interest)
        ? Math.round(clamp(opts.interest, 0, 100))
        : scoutInterest(c, t);

    const status = (opts.status && SQUAD_STATUS[opts.status])
        ? capStatusForTier(opts.status, tier, ovr)
        : offerStatus(c, t, interest);

    const fair = weeklySalaryFor({ ovr, clubTier: tier, region, age: p.age, status, potentialOVR: pot });
    // Clubs that badly want you open above their own valuation; the ones going
    // through the motions open below it and expect to be haggled with. Both
    // sides of that spread are inside one negotiation round of `fair`.
    const eagerness = 0.88 + (interest / 100) * 0.30;
    const salary = Math.max(25, Math.round(Number.isFinite(opts.salary) ? opts.salary : fair * eagerness));

    const years = Math.round(clamp(
        Number.isFinite(opts.years) ? opts.years : defaultYears(p, interest), 1, 4));

    // Two to seven weeks of wages up front, damped hard below tier 1 -- an
    // academy side does not have a war chest to hand a sixteen-year-old.
    const bonusWeeks = (2 + interest / 20) * (tier === 1 ? 1 : tier === 2 ? 0.55 : 0.20);
    const signingBonus = Math.max(0, Math.round(
        Number.isFinite(opts.signingBonus) ? opts.signingBonus : salary * bonusWeeks));

    // The keener the club, the harder they make it to take you away again.
    const mv = marketValueFor({ ovr, potentialOVR: pot, age: p.age, region, hype: p.hype });
    const releaseClause = Math.max(0, Math.round(
        Number.isFinite(opts.releaseClause)
            ? opts.releaseClause
            : mv * (1.4 + (interest / 100) * 1.6) * (tier === 1 ? 1 : 0.45)));

    const expiresWeek = Number.isFinite(opts.expiresWeek)
        ? Math.round(opts.expiresWeek)
        : absWeek(c) + OFFER_LIFETIME_WEEKS;

    return {
        id: opts.id || nextOfferId(),
        teamId: t.id,
        teamName: t.name,
        teamAccent: t.accent,
        tier,
        region,
        role,
        salary,
        years,
        signingBonus,
        status,
        releaseClause,
        expiresWeek,
        interest,
        blurb: offerBlurb(c, t, tier, status, region, interest),
        negotiations: 0,
    };
}

/** Pure. The offers still on the table this week. */
export function expireOffers(c) {
    if (!c || !Array.isArray(c.offers)) return [];
    const now = absWeek(c);
    return c.offers.filter(o => {
        if (!o) return false;
        if (!Number.isFinite(o.expiresWeek)) return true;   // hand-built offers never lapse
        return o.expiresWeek >= now;
    });
}

/** expireOffers() applied to the live store. Returns how many lapsed. */
export function pruneExpiredOffers() {
    let dropped = 0;
    career.update(c => {
        const keep = expireOffers(c);
        dropped = (Array.isArray(c.offers) ? c.offers.length : 0) - keep.length;
        return dropped > 0 ? { ...c, offers: keep } : c;
    });
    if (dropped > 0) saveCareer();
    return dropped;
}

function eligibleClub(c, t, ovr, cur, curStrength, midSeasonScout) {
    const p = c.player;
    const str = strengthOf(t);

    // The only offers that reach a player outside the window are academy calls
    // for an unsigned prospect. Everything else waits for the offseason.
    if (midSeasonScout && t.tier !== 2) return false;

    // Six under the starting floor is the absolute limit of what a main roster
    // will carry as depth.
    if (t.tier === 1 && ovr < T1_STARTER_FLOOR - 6) return false;

    if (t.tier === 3) {
        if (p.clubId) return false;                                  // signed players do not drop to the open circuit
        if (ovr < AMATEUR_OVR_GATE) return false;
        if ((Number(c.soloq?.mmr) || 0) < AMATEUR_MMR_GATE) return false;
    }

    if (cur) {
        // Under contract you only hear from clubs that are a clear step up.
        // Tier counts for more than raw strength: an academy-to-main move is a
        // promotion even when the numbers look sideways.
        const tierUp = t.tier < cur.tier;
        if (!tierUp && (t.tier > cur.tier || str < curStrength + 4)) return false;
    }
    return true;
}

/**
 * The offers arriving this week. Pure apart from the dice -- the caller is
 * expected to append the result to c.offers.
 */
export function generateOffers(c) {
    const out = [];
    if (!c || !c.created || c.flags?.retired) return out;

    const p = c.player;
    const ovr = calcOVR(p.attrs, p.role);
    const phase = phaseForWeek(c.time.week).id;
    const inWindow = phase === 'offseason' || phase === 'preseason';
    const unsigned = !p.clubId;

    // The one hole in the transfer window: an unsigned kid who has clearly
    // outgrown solo queue gets a phone call whenever a scout notices, because
    // academies recruit year-round and a free agent costs nothing to sign.
    const scoutable = unsigned
        && (Number(c.soloq?.mmr) || 0) >= SCOUT_MMR_GATE
        && ovr >= ACADEMY_OVR_GATE;

    if (!inWindow && !scoutable) return out;

    const live = expireOffers(c);
    let room = MAX_ACTIVE_OFFERS - live.length;
    if (room <= 0) return out;

    // The club's own renewal jumps the queue -- it is the offer the player is
    // actually waiting on, and it should never be crowded out by rivals.
    const renew = renewalOffer(c);
    if (renew && !live.some(o => o.id === renew.id)) {
        out.push(renew);
        room -= 1;
    }
    if (room <= 0) return out;

    const taken = new Set(live.map(o => o.teamId).concat(out.map(o => o.teamId)));
    const rejected = p.rejected || {};
    const cur = p.clubId ? resolveTeam(p.clubId) : null;
    const curStrength = cur ? strengthOf(cur) : 0;
    const midSeasonScout = !inWindow;

    // Per-candidate call rate. At an interest of 60 the offseason produces
    // roughly one offer per two clubs watching, which fills the four slots over
    // the five offseason weeks without flooding them in week one.
    const rate = inWindow ? (phase === 'offseason' ? 0.34 : 0.14) : 0.10;

    const rows = interestedTeams(c, 14).filter(row => {
        const t = row.team;
        if (taken.has(t.id)) return false;
        if ((rejected[t.id] || 0) >= REJECTIONS_BEFORE_BLACKLIST) return false;
        if (row.interest < MIN_OFFER_INTEREST) return false;
        return eligibleClub(c, t, ovr, cur, curStrength, midSeasonScout);
    });

    for (const row of rows) {
        if (room <= 0) break;
        if (Math.random() * 100 >= row.interest * rate) continue;
        const offer = buildOffer(c, row.team, { interest: row.interest });
        if (!offer) continue;
        out.push(offer);
        room -= 1;
    }

    return out;
}

// ---------------------------------------------------------------------------
//  ACCEPT / REJECT / NEGOTIATE
// ---------------------------------------------------------------------------

/** Accepts an id, or an offer object that has not been written into c.offers
 *  yet (renewalOffer() hands one of those straight to the screen). */
function findOffer(c, ref) {
    if (!ref) return null;
    const id = typeof ref === 'string' ? ref : ref.id;
    const hit = (Array.isArray(c?.offers) ? c.offers : []).find(o => o && o.id === id);
    if (hit) return hit;
    if (typeof ref === 'object' && ref.teamId) return ref;
    return null;
}

/** Writes an offer back, inserting it if the store had not seen it yet. */
function patchOffer(offer, patch) {
    const next = { ...offer, ...patch };
    career.update(c => {
        const offers = Array.isArray(c.offers) ? c.offers.slice() : [];
        const i = offers.findIndex(o => o && o.id === next.id);
        if (i >= 0) offers[i] = next; else offers.push(next);
        return { ...c, offers };
    });
    return next;
}

/** A deal signed during the offseason starts next season, not this one. */
function signingStartYear(c) {
    return c.time.week >= OFFSEASON_FROM ? c.time.year + 1 : c.time.year;
}

export function acceptOffer(offerId) {
    const c = snap();
    if (c.flags?.retired) return { ok: false, msg: 'You have retired. Nobody is signing you now.' };

    const offer = findOffer(c, offerId);
    if (!offer) return { ok: false, msg: 'That offer is no longer on the table.' };

    const team = resolveTeam(offer.teamId) || normTeam({
        id: offer.teamId, name: offer.teamName, tier: offer.tier,
        accent: offer.teamAccent, region: offer.region, strength: 60,
    });
    if (!team) return { ok: false, msg: 'That club no longer exists.' };

    const renewal = !!offer.renewal && c.player.clubId === team.id;
    const startYear = signingStartYear(c);
    const contract = {
        teamId: team.id,
        tier: offer.tier,
        salary: offer.salary,
        years: offer.years,
        startYear,
        endYear: startYear + offer.years - 1,
        status: offer.status,
        bonus: offer.signingBonus,
        releaseClause: offer.releaseClause,
        role: offer.role,
        region: offer.region,
        signedYear: c.time.year,
        signedWeek: c.time.week,
    };

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            clubId: team.id,
            clubTier: offer.tier,
            status: offer.status,
            contract,
            // Low but not hostile on a move: nobody in the room knows you, and
            // the player you just replaced knows exactly who you are. A renewal
            // keeps whatever you already built.
            chemistry: renewal
                ? clamp((x.player.chemistry ?? 50) + 6, 0, 100)
                : 38,
            morale: clamp((x.player.morale ?? 50) + (renewal ? 6 : 10), 0, 100),
            transferRequested: false,
        },
        offers: [],
        flags: { ...x.flags, everSigned: true },
    }));

    if (offer.signingBonus > 0) grantGold(offer.signingBonus);

    const term = offer.years === 1 ? '1 year' : `${offer.years} years`;
    const msg = renewal
        ? `Re-signed with ${team.name} ${DASH} ${statusInfo(offer.status).name}, ${fmtGold(offer.salary)}/wk for ${term}.`
        : `Signed for ${team.name} ${DASH} ${statusInfo(offer.status).name}, ${fmtGold(offer.salary)}/wk for ${term}.`;

    addNews(msg, 'transfer');
    if (offer.signingBonus > 0) {
        addNews(`${team.name} paid a ${fmtGold(offer.signingBonus)} signing bonus.`, 'money');
    }
    showToast(renewal ? 'Contract renewed' : `Signed for ${team.name}`, 'success');
    playSound(offer.tier === 1 ? 'rare' : 'claim');
    saveCareer();

    return { ok: true, msg };
}

export function rejectOffer(offerId) {
    const c = snap();
    const offer = findOffer(c, offerId);
    if (!offer) return { ok: false, msg: 'That offer is no longer on the table.' };

    const before = (c.player.rejected || {})[offer.teamId] || 0;
    const count = before + 1;
    const renewal = !!offer.renewal;

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            rejected: { ...(x.player.rejected || {}), [offer.teamId]: count },
            // Turning your own club down in front of the room has a price.
            chemistry: renewal ? clamp((x.player.chemistry ?? 50) - 8, 0, 100) : (x.player.chemistry ?? 50),
        },
        offers: (Array.isArray(x.offers) ? x.offers : []).filter(o => o && o.id !== offer.id),
    }));

    const msg = count >= REJECTIONS_BEFORE_BLACKLIST
        ? `${offer.teamName} have crossed you off. They will not ask again.`
        : `You turned ${offer.teamName} down.`;

    addNews(msg, renewal ? 'drama' : 'transfer');
    playSound('click');
    saveCareer();
    return { ok: true, msg };
}

/**
 * Haggle. Two rounds per offer; ask far enough over their valuation and they
 * pull the sheet off the table entirely.
 *
 * Returns { ok, offer, msg, outcome } where outcome is one of
 * 'improved' | 'partial' | 'firm' | 'withdrawn' | 'gone'. `ok` means the terms
 * actually moved; `offer` is the current sheet, or null once it is withdrawn.
 */
export function negotiateOffer(offerId, ask = {}) {
    const c = snap();
    const found = findOffer(c, offerId);
    if (!found) return { ok: false, offer: null, outcome: 'gone', msg: 'That offer is no longer on the table.' };

    if ((found.negotiations || 0) >= MAX_NEGOTIATIONS) {
        return {
            ok: false, offer: found, outcome: 'firm',
            msg: `${found.teamName} have heard enough. Sign it or walk.`,
        };
    }

    const p = c.player;
    const ovr = calcOVR(p.attrs, p.role);
    const pot = calcPotentialOVR(p.potential, p.role);

    const reqStatus = (ask.status && SQUAD_STATUS[ask.status]) ? ask.status : found.status;
    const reqYears = Math.round(clamp(Number(ask.years) || found.years, 1, 4));
    const reqSalary = Math.max(25, Math.round(Number(ask.salary) || found.salary));

    // Asking for a seat the rating cannot support is not a negotiation, and it
    // still burns one of the two rounds.
    if (capStatusForTier(reqStatus, found.tier, ovr) !== reqStatus) {
        const bumped = patchOffer(found, { negotiations: (found.negotiations || 0) + 1 });
        saveCareer();
        return {
            ok: false, offer: bumped, outcome: 'firm',
            msg: `${found.teamName} are not promising a ${statusInfo(reqStatus).name.toLowerCase()} seat to a ${ovr} rated ${ROLE_BY_ID[p.role]?.short || p.role}.`,
        };
    }

    const fair = weeklySalaryFor({
        ovr, clubTier: found.tier, region: found.region, age: p.age,
        status: reqStatus, potentialOVR: pot,
    });
    const statusReach = statusIndex(reqStatus) - statusIndex(found.status);
    // Everything asked for, priced as one number against the club's own
    // valuation. 1.00 is "exactly what we think you are worth".
    const greed = (reqSalary / Math.max(25, fair)) + Math.max(0, statusReach) * 0.10;

    let odds = 62 - (greed - 1) * 130;
    odds += (found.interest - 55) * 0.45;                                   // wanting you badly buys flexibility
    odds += Math.min(12, Math.sqrt(Math.max(0, p.hype || 0)) / 26);         // reputation at the table
    odds += ((p.form ?? 50) - 50) * 0.12;
    odds -= (found.negotiations || 0) * 12;                                  // round two is harder than round one
    if (reqYears > found.years) odds -= 6 * (reqYears - found.years);        // more guaranteed money
    if (reqYears < found.years && p.age <= 19) odds -= 8;                    // clubs want prospects tied down

    const walkFloor = 1 + NEGOTIATION_TOLERANCE;
    let walk = 0;
    if (greed > walkFloor) {
        walk = clamp((greed - walkFloor) * 130 + 12, 0, 72) - (found.interest - 55) * 0.5;
    }

    if (walk > 0 && Math.random() * 100 < walk) {
        career.update(x => ({
            ...x,
            player: {
                ...x.player,
                morale: clamp((x.player.morale ?? 50) - 6, 0, 100),
                // Their walk-out counts the same as your refusal: blow up two
                // negotiations with the same club and they stop calling.
                rejected: {
                    ...(x.player.rejected || {}),
                    [found.teamId]: ((x.player.rejected || {})[found.teamId] || 0) + 1,
                },
            },
            offers: (Array.isArray(x.offers) ? x.offers : []).filter(o => o && o.id !== found.id),
        }));
        const msg = `${found.teamName} withdrew the offer. That was more than they were ever going to pay.`;
        addNews(msg, 'drama');
        showToast('Offer withdrawn', 'error');
        playSound('lose');
        saveCareer();
        return { ok: false, offer: null, outcome: 'withdrawn', msg };
    }

    const roll = Math.random() * 100;
    let outcome, terms;
    if (roll < odds) {
        outcome = 'improved';
        terms = { salary: reqSalary, years: reqYears, status: reqStatus };
    } else if (roll < odds + 34 && reqSalary > found.salary) {
        outcome = 'partial';
        terms = {
            salary: Math.max(found.salary, Math.round((found.salary + reqSalary) / 2)),
            years: found.years,
            status: found.status,
        };
    } else {
        outcome = 'firm';
        terms = null;
    }

    if (!terms) {
        const held = patchOffer(found, { negotiations: (found.negotiations || 0) + 1 });
        saveCareer();
        return {
            ok: false, offer: held, outcome,
            msg: `${found.teamName} will not move. The offer stands as written.`,
        };
    }

    const revised = buildOffer(c, resolveTeam(found.teamId) || {
        id: found.teamId, name: found.teamName, tier: found.tier,
        accent: found.teamAccent, region: found.region, strength: 60,
    }, {
        id: found.id,
        interest: found.interest,
        tier: found.tier,
        region: found.region,
        role: found.role,
        expiresWeek: found.expiresWeek,
        ...terms,
    });

    const saved = patchOffer(found, {
        ...revised,
        renewal: found.renewal,
        negotiations: (found.negotiations || 0) + 1,
    });
    saveCareer();
    playSound('claim');

    const msg = outcome === 'improved'
        ? `${found.teamName} met the ask: ${fmtGold(saved.salary)}/wk, ${saved.years} year(s), ${statusInfo(saved.status).name}.`
        : `${found.teamName} met you part way ${DASH} ${fmtGold(saved.salary)}/wk, terms otherwise unchanged.`;

    return { ok: true, offer: saved, outcome, msg };
}

// ---------------------------------------------------------------------------
//  CONTRACT STATE
// ---------------------------------------------------------------------------

/** Seasons remaining. 0 means unsigned, or the deal expires at the end of the
 *  current year -- which is exactly the renewal window. */
export function contractYearsLeft(c) {
    const k = c?.player?.contract;
    if (!k || !c.player.clubId) return 0;
    const end = Number(k.endYear);
    if (!Number.isFinite(end)) return 0;
    return Math.max(0, end - (Number(c.time?.year) || 0));
}

export function contractStatusLine(c) {
    if (!c || !c.player) return 'No career in progress.';
    const p = c.player;

    if (!p.clubId || !p.contract) {
        if (c.flags?.everSigned) {
            return `Free agent ${DASH} no club, no wage, and a phone that has stopped ringing.`;
        }
        return `Unsigned ${DASH} nobody has written your name on a contract yet.`;
    }

    const team = resolveTeam(p.clubId);
    const name = team ? team.name : (p.contract.teamId || 'Unknown club');
    const tier = CLUB_TIERS[p.contract.tier || p.clubTier || 1];
    const left = contractYearsLeft(c);
    const term = left <= 0 ? 'final year' : left === 1 ? '1 year left' : `${left} years left`;

    return [
        name,
        tier ? tier.name : '',
        statusInfo(p.status).name,
        `${fmtGold(p.contract.salary)}/wk`,
        term,
    ].filter(Boolean).join(DOT);
}

/**
 * The club's renewal, offered only in the final year of a deal. Deterministic
 * id so the Transfers screen can re-render it all day without spawning copies.
 * Returns null when the club has decided to move on.
 */
export function renewalOffer(c) {
    if (!c || !c.player || c.flags?.retired) return null;
    const p = c.player;
    if (!p.clubId || !p.contract) return null;
    if (contractYearsLeft(c) > 0) return null;

    const team = resolveTeam(p.clubId);
    if (!team) return null;

    const review = clubReview(c);
    if (review.verdict === 'cutting') return null;      // they are already letting you go

    const ovr = calcOVR(p.attrs, p.role);
    // Eight under the starting floor and the main league has simply moved on.
    if (team.tier === 1 && ovr < T1_STARTER_FLOOR - 8) return null;

    const verdictBonus = review.verdict === 'untouchable' ? 14 : review.verdict === 'happy' ? 7 : 0;
    const interest = Math.round(clamp(scoutInterest(c, team) + LOYALTY_BONUS + verdictBonus, 0, 100));
    if (interest < MIN_OFFER_INTEREST) return null;

    const offer = buildOffer(c, team, {
        interest,
        status: review.statusChange || p.status,
        id: `renew_${team.id}_${c.time.year}`,
        // Your own club gives you longer to think about it than a rival does.
        expiresWeek: absWeek(c) + OFFER_LIFETIME_WEEKS + 2,
    });
    if (!offer) return null;

    offer.renewal = true;
    offer.blurb = `${team.name} want to keep you. ${offer.blurb}`;
    return offer;
}

// ---------------------------------------------------------------------------
//  LEAVING
// ---------------------------------------------------------------------------

export function requestTransfer() {
    const c = snap();
    const p = c.player;
    if (c.flags?.retired) return { ok: false, msg: 'You have retired.' };
    if (!p.clubId) return { ok: false, msg: 'You are a free agent. There is nobody to ask.' };
    if (p.transferRequested && p.transferRequestYear === c.time.year) {
        return { ok: false, msg: 'You have already asked to leave this year. Asking twice only makes the room worse.' };
    }

    const team = resolveTeam(p.clubId);
    const name = team ? team.name : 'your club';

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            transferRequested: true,
            transferRequestYear: x.time.year,
            // The roster finds out roughly nine seconds after the front office
            // does, and scrims are never the same again.
            chemistry: clamp((x.player.chemistry ?? 50) - 25, 0, 100),
            morale: clamp((x.player.morale ?? 50) - 14, 0, 100),
        },
    }));

    const msg = `${name} know you want out. So does every scout in the region.`;
    addNews(`You handed in a transfer request at ${name}. It leaked within the hour.`, 'drama');
    showToast('Transfer request submitted', 'info');
    playSound('lose');
    saveCareer();
    return { ok: true, msg };
}

const RELEASE_REASONS = {
    mutual:  { hit: 14, type: 'transfer', text: (n) => `${n} and you tore the contract up. No hard feelings, and no wage either.` },
    cut:     { hit: 30, type: 'drama',    text: (n) => `${n} cut you. The seat went to somebody cheaper and younger.` },
    expired: { hit: 18, type: 'transfer', text: (n) => `Your contract at ${n} ran out and nobody picked up the phone about a new one.` },
    request: { hit: 10, type: 'transfer', text: (n) => `${n} let you go rather than keep a player who wanted out.` },
};

export function releaseFromClub(reason = 'mutual') {
    const c = snap();
    const p = c.player;
    if (!p.clubId) return { ok: false, msg: 'You do not have a club to leave.' };

    const team = resolveTeam(p.clubId);
    const name = team ? team.name : 'your club';
    const r = RELEASE_REASONS[reason] || RELEASE_REASONS.mutual;
    const text = r.text(name);

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            clubId: null,
            clubTier: null,
            contract: null,
            // No roster, no seat. 'benched' is what an unsigned player carries
            // from creation, so free agency reads the same either way.
            status: 'benched',
            chemistry: 50,
            morale: clamp((x.player.morale ?? 50) - r.hit, 0, 100),
            transferRequested: false,
        },
        // Rival offers survive -- a released player wants them. The old club's
        // renewal obviously does not.
        offers: (Array.isArray(x.offers) ? x.offers : []).filter(o => o && o.teamId !== x.player.clubId),
    }));

    addNews(text, r.type);
    showToast(reason === 'cut' ? 'Released by your club' : 'Contract terminated', reason === 'cut' ? 'error' : 'info');
    playSound('lose');
    saveCareer();
    return { ok: true, msg: text };
}

// ---------------------------------------------------------------------------
//  ROLE CHANGES
// ---------------------------------------------------------------------------

export function canChangeRole(c) {
    if (!c || !c.created) return { ok: false, reason: 'No career in progress.' };
    if (c.flags?.retired) return { ok: false, reason: 'Your playing career is over.' };

    const p = c.player;
    if (p.clubId) {
        const team = resolveTeam(p.clubId);
        const roleName = ROLE_BY_ID[p.role]?.name || p.role;
        return {
            ok: false,
            reason: `${team ? team.name : 'Your club'} signed a ${roleName}, and that is the seat they pay for. Run the contract out, request a transfer, or agree a release first.`,
        };
    }
    return { ok: true, reason: 'Free agent. Nobody is paying you to stay where you are.' };
}

/**
 * The honest number, before they commit. Two separate losses: habits built for
 * a role nobody is asking you to play any more rot away, and the attributes the
 * new role actually leans on come back rusty.
 */
export function roleChangePreview(c, newRoleId) {
    const p = c?.player;
    const from = ROLE_BY_ID[p?.role];
    const to = ROLE_BY_ID[newRoleId];
    const attrDeltas = emptyAttrs(0);

    if (!p || !from || !to) {
        return { fromOVR: 0, toOVR: 0, attrDeltas, warning: 'That is not a role.', newAttrs: emptyAttrs(0), totalLoss: 0 };
    }

    const fromOVR = calcOVR(p.attrs, from.id);
    if (from.id === to.id) {
        return {
            fromOVR, toOVR: fromOVR, attrDeltas,
            warning: `You already play ${to.name}.`,
            newAttrs: { ...p.attrs }, totalLoss: 0,
        };
    }

    for (const k of ATTR_KEYS) {
        const oldW = from.weights[k] || 0;
        const newW = to.weights[k] || 0;
        const atrophy = Math.max(0, oldW - newW) * ROLE_DECAY_SCALE;
        const rust = newW * ROLE_RUST_SCALE;
        attrDeltas[k] = -Math.round(atrophy + rust);
    }

    const newAttrs = {};
    for (const k of ATTR_KEYS) newAttrs[k] = clampAttr((p.attrs[k] || 0) + attrDeltas[k]);
    const toOVR = calcOVR(newAttrs, to.id);
    const loss = Math.max(0, fromOVR - toOVR);
    const age = Number(p.age) || 18;

    let warning;
    if (age <= 16) {
        warning = `${loss} rating gone today and about a season of training to earn it back. At ${age} you have the season to spare.`;
    } else if (age <= 19) {
        warning = `${loss} rating gone, and most of a year relearning fundamentals you already had. Expensive, survivable.`;
    } else if (age <= 22) {
        warning = `${loss} rating gone at ${age}, with your growth curve already flattening. You may never see the old number again.`;
    } else {
        warning = `${loss} rating gone at ${age}, and the age curve is working against you. This is not a role change, it is a second career, and a shorter one.`;
    }

    return { fromOVR, toOVR, attrDeltas, warning, newAttrs, totalLoss: loss };
}

export function changeRole(newRoleId, newPlaystyleId, newChampionId) {
    const c = snap();
    const gate = canChangeRole(c);
    if (!gate.ok) return { ok: false, msg: gate.reason };

    const to = ROLE_BY_ID[newRoleId];
    if (!to) return { ok: false, msg: 'That is not a role.' };

    const p = c.player;
    const from = ROLE_BY_ID[p.role];
    if (!from) return { ok: false, msg: 'Your current role is unreadable.' };
    if (from.id === to.id) return { ok: false, msg: `You already play ${to.name}.` };

    const preview = roleChangePreview(c, to.id);
    const newAttrs = preview.newAttrs;

    // A playstyle or signature champion from the old role is meaningless now.
    // Fall back to the first legal option rather than leaving the field blank --
    // the match engine reads both every game.
    const styleList = PLAYSTYLES[to.id] || [];
    const wantStyle = PLAYSTYLE_BY_ID[newPlaystyleId];
    const style = (wantStyle && styleList.some(s => s.id === wantStyle.id)) ? wantStyle : styleList[0];

    const champList = championsForRole(to.id);
    const wantChamp = CHAMPION_BY_ID[newChampionId];
    const champ = (wantChamp && wantChamp.roles.includes(to.id)) ? wantChamp : champList[0];

    // The hidden ceiling was rolled around the old role's weights (see
    // rollNewPlayer). Re-centre it on the new role with the same scale factor,
    // or the switch silently caps them forever in whatever now matters most.
    const potential = {};
    for (const k of ATTR_KEYS) {
        const shift = ((to.weights[k] || 0) - (from.weights[k] || 0)) * 42;
        potential[k] = clampAttr(Math.max(newAttrs[k] + 3, (p.potential[k] || 0) + shift));
    }

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            role: to.id,
            playstyle: style ? style.id : '',
            champion: champ ? champ.id : '',
            attrs: newAttrs,
            potential,
            // Nothing about you is match-sharp in a role you started last week.
            form: clamp((x.player.form ?? 50) - 12, 0, 100),
        },
    }));

    const msg = `Switched from ${from.name} to ${to.name}. ${preview.fromOVR}${ARROW}${preview.toOVR} overall.`;
    addNews(`${p.handle || 'You'} moved to ${to.name}. ${preview.warning}`, 'transfer');
    showToast(`Now playing ${to.short}`, 'info');
    playSound('pack');
    saveCareer();

    return { ok: true, msg };
}

// ---------------------------------------------------------------------------
//  CLUB REVIEW & PROMOTION
// ---------------------------------------------------------------------------

function seasonRatings(c) {
    const sched = Array.isArray(c?.season?.schedule) ? c.season.schedule : [];
    let sum = 0, n = 0;
    for (const m of sched) {
        if (!m || !m.played || !Number.isFinite(m.myRating)) continue;
        sum += m.myRating;
        n += 1;
    }
    if (n > 0) return { avg: sum / n, games: n };

    // No schedule yet (a mid-season signing, or a save from before the split
    // was drawn) -- fall back to the career average.
    const t = c?.totals;
    if (t && t.games > 0 && Number.isFinite(t.ratingSum)) {
        return { avg: t.ratingSum / t.games, games: t.games };
    }
    return { avg: 5.5, games: 0 };   // no evidence either way
}

const REVIEW_TEXT = {
    untouchable: (n) => `${n} are not listening to offers. You are the piece they build around and the front office has told everybody so.`,
    happy:       (n) => `${n} are happy. You did the job you were signed to do and the staff said as much in the debrief.`,
    watching:    (n) => `${n} are neither impressed nor worried. Another split like that and somebody else makes the decision for you.`,
    concerned:   (n) => `${n} sat you down. The ratings are not there, the room has noticed, and your minutes are under review.`,
    cutting:     (n) => `${n} have run out of patience. Unless something changes before the window they are moving you on.`,
};

/**
 * The club's end-of-split verdict. This is what promotes an academy player onto
 * the main roster and what gets a passenger benched.
 */
export function clubReview(c) {
    const p = c?.player;
    if (!p) return { verdict: 'watching', text: 'No career in progress.', statusChange: null, score: 0 };
    if (!p.clubId) {
        return { verdict: 'watching', text: 'No club, no review. Nobody grades a free agent.', statusChange: null, score: 0 };
    }

    const team = resolveTeam(p.clubId);
    const name = team ? team.name : 'Your club';
    const tier = team ? team.tier : (p.clubTier || 1);
    const str = team ? strengthOf(team) : 60;
    const ovr = calcOVR(p.attrs, p.role);

    const { avg, games } = seasonRatings(c);
    const w = Number(c.season?.wins) || 0;
    const l = Number(c.season?.losses) || 0;
    const winRate = (w + l) > 0 ? w / (w + l) : 0.5;

    // 5.5 is a par match rating, so a 7.0 split is worth about +13 on its own.
    let score = 0;
    score += (avg - 5.5) * 9;
    score += ((p.form ?? 50) - 50) * 0.22;
    score += (ovr - str) * 2.4;
    score += ((p.chemistry ?? 50) - 50) * 0.12;
    score += (winRate - 0.5) * 20;
    // Academies are patient with teenagers in a way main rosters are not, and
    // impatient with anybody the wrong side of the age curve.
    score += p.age <= 17 ? 8 : p.age <= 19 ? 4 : p.age >= 27 ? -4 : 0;
    // Fewer than six games and there is nothing to judge, so the verdict pulls
    // back toward neutral instead of hanging a career on three matches.
    if (games < 6) score = score * 0.45 + 4;
    if (p.transferRequested) score -= 12;

    let verdict, statusChange;
    const deserved = capStatusForTier(deservedStatus(ovr, str), tier, ovr);
    if (score >= 26) {
        verdict = 'untouchable';
        statusChange = STATUS_LADDER[clamp(Math.max(statusIndex(deserved), statusIndex(p.status) + 1), 0, 4)];
    } else if (score >= 10) {
        verdict = 'happy';
        statusChange = statusIndex(deserved) > statusIndex(p.status) ? stepStatus(p.status, 1) : null;
    } else if (score >= -6) {
        verdict = 'watching';
        statusChange = null;
    } else if (score >= -20) {
        verdict = 'concerned';
        statusChange = stepStatus(p.status, -1);
    } else {
        verdict = 'cutting';
        statusChange = 'benched';
    }

    if (statusChange) statusChange = capStatusForTier(statusChange, tier, ovr);
    if (statusChange === p.status) statusChange = null;

    let text = REVIEW_TEXT[verdict](name);
    if (games > 0) text += ` Average match rating ${avg.toFixed(1)} across ${games} games.`;
    if (statusChange) {
        text += ` Squad status: ${statusInfo(p.status).name}${ARROW}${statusInfo(statusChange).name}.`;
    }

    return { verdict, text, statusChange, score: Math.round(score) };
}

/** Academy sides in constants.js carry their parent org's accent colour --
 *  the only field that survives every naming convention in the file. */
function parentClubFor(team) {
    if (!team || team.tier !== 2) return null;

    let mains = [];
    try { mains = teamsInRegion(team.region, 1) || []; } catch (e) { mains = []; }
    mains = mains.map(normTeam).filter(t => t && t.tier === 1 && t.region === team.region);
    if (!mains.length) {
        mains = allTeams().map(normTeam).filter(t => t && t.tier === 1 && t.region === team.region);
    }
    if (!mains.length) return null;

    const byAccent = mains.filter(t => t.accent.toLowerCase() === team.accent.toLowerCase());
    if (byAccent.length === 1) return byAccent[0];

    const org = orgName(team.name).toLowerCase();
    const byName = mains.find(t => {
        const n = t.name.toLowerCase();
        return n === org || (org.length >= 4 && (n.includes(org) || org.includes(n)));
    });
    if (byName) return byName;
    if (byAccent.length) return byAccent[0];

    // Genuinely independent academies exist. The weakest main-league side in
    // the region is the one with a seat going spare.
    return mains.slice().sort((a, b) => strengthOf(a) - strengthOf(b))[0];
}

/** Pure predicate behind promotionCheck(). Safe for the UI to call on render. */
export function promotionEligible(c) {
    const fail = (reason) => ({ ok: false, team: null, reason });
    const p = c?.player;
    if (!p || !p.clubId) return fail('You are not at a club.');
    if (c.flags?.retired) return fail('Your playing career is over.');

    const club = resolveTeam(p.clubId);
    if (!club || club.tier !== 2) return fail('Only academy players get promoted.');

    const parent = parentClubFor(club);
    if (!parent) return fail('No main-league side is attached to this academy.');

    const ovr = calcOVR(p.attrs, p.role);
    const floor = T1_STARTER_FLOOR - 4;   // 68: the lowest rating a main roster will carry as depth
    if (ovr < floor) return fail(`The main roster does not take a ${ovr} rated player. Get to ${floor}.`);

    const parentStrength = strengthOf(parent);
    if (ovr < parentStrength - 9) {
        return fail(`${parent.name} run at about ${Math.round(parentStrength)}. You are not close enough yet.`);
    }

    const review = clubReview(c);
    const { avg } = seasonRatings(c);
    const performing = review.verdict === 'happy' || review.verdict === 'untouchable' || avg >= 6.6;
    if (!performing) return fail('The academy staff want another split of evidence first.');

    // Two splits of it -- unless the rating alone already makes the argument,
    // in which case keeping them downstairs is just wasting a year.
    const splits = (Array.isArray(c.history) ? c.history : [])
        .filter(h => h && h.teamId === club.id).length;
    if (splits < 2 && ovr < parentStrength) {
        return fail('One good split is a hot streak. They want two.');
    }

    return { ok: true, team: parent, reason: `${parent.name} are ready to move you up.` };
}

/**
 * Runs the promotion. NOT a pure check despite the name -- when it returns
 * promoted:true the player is already on the tier-1 roster. Call it once at the
 * end of a split; use promotionEligible() for anything the UI renders.
 */
export function promotionCheck(c) {
    const state = c || snap();
    const gate = promotionEligible(state);
    if (!gate.ok) return { promoted: false, team: null, msg: gate.reason };

    const parent = gate.team;
    const p = state.player;
    const ovr = calcOVR(p.attrs, p.role);
    const pot = calcPotentialOVR(p.potential, p.role);
    const region = parent.region !== 'ALL' ? parent.region : p.region;

    // The tier-1 floor still applies: a promoted academy player normally
    // arrives as a substitute and plays their way up from there.
    const status = capStatusForTier(deservedStatus(ovr, strengthOf(parent)), 1, ovr);
    const salary = weeklySalaryFor({ ovr, clubTier: 1, region, age: p.age, status, potentialOVR: pot });
    // A promotion always comes with at least two years of security -- the org
    // is not moving you upstairs to cut you in November.
    const years = Math.max(2, contractYearsLeft(state));
    const startYear = state.time.year;

    const contract = {
        teamId: parent.id,
        tier: 1,
        salary,
        years,
        startYear,
        endYear: startYear + years - 1,
        status,
        bonus: 0,
        releaseClause: Math.round(marketValueFor({
            ovr, potentialOVR: pot, age: p.age, region, hype: p.hype,
        }) * 2.0),
        role: p.role,
        region,
        signedYear: startYear,
        signedWeek: state.time.week,
    };

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            clubId: parent.id,
            clubTier: 1,
            status,
            contract,
            // A new room, but the org already knows your name. Nothing like the
            // cold start a transfer to a rival would be.
            chemistry: clamp((x.player.chemistry ?? 50) * 0.75 + 12, 0, 100),
            morale: clamp((x.player.morale ?? 50) + 16, 0, 100),
            transferRequested: false,
        },
        offers: [],
    }));

    const msg = `${parent.name} promoted you to the main roster ${DASH} ${statusInfo(status).name} on ${fmtGold(salary)}/wk.`;
    addNews(msg, 'transfer');
    showToast('Promoted to the main roster', 'success');
    playSound('rare');
    saveCareer();

    return { promoted: true, team: parent, msg };
}
