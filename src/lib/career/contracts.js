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

import { get } from 'svelte/store';
import {
    REGION_BY_ID, ROLE_BY_ID, PLAYSTYLES, PLAYSTYLE_BY_ID, CHAMPION_BY_ID,
    CLUB_TIERS, SQUAD_STATUS, PHASES, ATTR_KEYS, ATTR_MIN, ATTR_MAX,
    phaseForWeek, teamById, allTeams, championsForRole, championsForStyle,
    championFit, MIN_AGE_BY_TIER, PROFICIENCY_SIGNATURE_HEAD_START,
    LANGUAGE_BY_ID, LANGUAGE_MAX, LANGUAGE_FLUENT, LANGUAGE_SIGN_MIN,
    LANGUAGE_ARRIVAL_BOOST, LANGUAGE_INTEREST_REFUND,
    languageForRegion, languageLevelFor, languageBand, fluencyForRegion,
    speaksForRegion, TIER_OVR_CEILING,
} from './constants.js';
import {
    calcOVR, calcPotentialOVR, deservedStatus, statusInfo, weeklySalaryFor,
    marketValueFor, SCOUT_MMR_GATE, clamp, clampAttr, emptyAttrs, fmtGold,
    rankFromMMR,
} from './ratings.js';
import {
    career, matchState, absWeek, addNews, grantGold, saveCareer,
} from '../stores/career.js';
import { teamsInRegion, allTeamsForPlayer, teamStrength, cardTagsFor } from './teams.js';
// economy.js imports constants/ratings/stores/utils and nothing from here, so
// this direction is the safe one. Do NOT import contracts.js from economy.js.
import { perkEffects, lifestyleEffects, buffValue, signatureSlots } from './economy.js';
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

/**
 * Ceiling on the stacked offer premium.
 *
 * `offerBonus` is granted by three legacy perks (0.45), five lifestyle items
 * (0.42) and the Agent Retainer consumable (0.18) — 1.05 unstacked, i.e. a
 * fully-built veteran negotiating against double money. It was aggregated by
 * economy.perkEffects()/lifestyleEffects() and read by NOTHING until this
 * constant existed, which is why nobody noticed. Wiring it up without a cap
 * would have been worse than leaving it dead.
 */
const OFFER_BONUS_CAP = 0.60;

/** Everything the player has bought that makes an offer sheet better. */
function offerMultiplier(c) {
    const total = (Number(perkEffects(c).offerBonus) || 0)
        + (Number(lifestyleEffects(c).offerBonus) || 0)
        + (Number(buffValue(c, 'offerBonus')) || 0);
    return 1 + clamp(total, 0, OFFER_BONUS_CAP);
}

/** Chemistry the player walks into a new room with. Base is the hostile 38 a
 *  transfer has always started on; Mentor and The Voice buy it back. */
function startingChemistry(c, base) {
    const bonus = Math.max(0, Math.round(Number(perkEffects(c).chemistryBonus) || 0));
    return clamp(base + bonus, 0, 100);
}

/** Turn a club down twice and they stop asking -- permanently. */
const REJECTIONS_BEFORE_BLACKLIST = 2;

/**
 * Where you are from, priced. Read by scoutInterest().
 *
 * These are deliberately a matched pair rather than one signed number: for a
 * long time only the penalty existed, so a home club and an amateur side both
 * simply went un-penalised and "home region" meant nothing at all.
 *
 * Kept SEPARATE from REGION_BY_ID.scoutMult, which multiplies at the end of the
 * same function. That value is the DESTINATION league's recruiting aggression
 * (the LCP raids academies, the LCS waits for a highlight reel); folding home
 * preference into it would make one number mean two different things.
 */
const HOME_REGION_BONUS = 8;         // your league watched you climb
const FOREIGN_REGION_PENALTY = -14;  // an import slot has to be worth spending
const FOREIGN_FAME_REFUND = 9;       // and fame is what buys it back

/** Home clubs also CALL sooner, which is a different thing from paying more.
 *  Applied to the per-week offer roll, never to the wage: buildOffer() derives
 *  eagerness from `interest`, so putting this in the roll keeps money honest. */
const HOME_REGION_CALL_RATE = 1.25;

/** And a foreign club calls sooner once it can talk to you. Deliberately under
 *  HOME_REGION_CALL_RATE-1 so fluency never makes a foreign league keener than
 *  the player's own: at zero fluency this is worth exactly 1, i.e. the rate the
 *  foreign branch has always run at, so nothing regresses for a save that has
 *  never studied. Same split as HOME_REGION_CALL_RATE -- frequency here, never
 *  in scoutInterest(), because interest reprices the entire offer sheet. */
const FLUENT_CALL_RATE_BONUS = 0.35;

/** The headline rule of the whole mode: nobody walks into a main-league
 *  starting seat under 72. Below it a tier-1 club will only ever promise a
 *  bench spot, and below 68 they will not promise anything at all. */
const T1_STARTER_FLOOR = 72;

/** BEING TOO GOOD FOR A CLUB.
 *
 *  For a long time interest was `50 + (ovr - str) * 3.1` clamped to 0-100, and
 *  clamping is not a curve: at 98 OVR roughly ninety-five of the hundred and
 *  eight clubs in the world tied on exactly 100 while T1 (strength 88) scored
 *  81. interestedTeams() sorts on that number and breaks ties on club NAME, so
 *  an elite free agent's fourteen candidates were the alphabetically-first
 *  fourteen of the weakest sides on the circuit and no real org ever reached
 *  generateOffers(). The ranking was inverted precisely where it mattered most.
 *
 *  So the slope holds for OVERQUALIFIED_TURN points of gap and then TURNS OVER.
 *  Past the turn a club is not being told it can afford you, it is being told
 *  you would be wasted on it -- which is the honest reading of a 98 looking at
 *  an open-circuit roster.
 *
 *  OVR_OVER_QUALIFIED is the separate, blunter line the SIGNING rules use:
 *  at or above it a club is simply beneath the player and will not pretend
 *  otherwise (signingBlock's tier 2 / tier 3 clauses, eligibleClub's free-agent
 *  rail). Kept apart from the decay because one is a price and one is a wall.
 */
const OVERQUALIFIED_TURN = 10;             // where the interest curve rolls over
export const OVR_OVER_QUALIFIED = 18;      // ovr - strength at or above this means the club is beneath the player
export const OVERQUALIFIED_DECAY = 1.2;    // interest lost per point of gap past the turnover

/** The club you told the game you were aiming for calls sooner. FREQUENCY only,
 *  exactly like HOME_REGION_CALL_RATE and FLUENT_CALL_RATE_BONUS: putting a goal
 *  into scoutInterest() would raise the wage, the years, the signing bonus and
 *  the release clause, so wanting a club would quietly make it pay you more. */
export const GOAL_CALL_RATE_BONUS = 1.6;

// ---------------------------------------------------------------------------
//  SIGNING STANDARDS, PER CLUB
//
//  A tier used to be one number: every academy in the world wanted exactly the
//  same rating and exactly the same rank, and the open circuit asked for more
//  than some academies did. Both were wrong. T1 Academy and the bottom of the
//  LCS Challengers scene are twenty-seven strength points apart and should not
//  be reading the same CV, and an amateur side that is WEAKER than the player
//  has no business turning them away.
//
//  So the gate is derived from the club: `base` is what the weakest club in the
//  tier asks, and it climbs with that club's own strength up to `swing`. The
//  measured bands are tier 1 59-88 (median 75), tier 2 43-70 (median 59),
//  tier 3 38-58 (median 50) -- `ref` is the anchor each tier scales from.
//
//  It is DETERMINISTIC. signingBlock() is called once per club on every
//  reactive render of the transfer screen, so a gate that rolled a random
//  number would flicker a club in and out of your list while you looked at it.
//  The jitter is hashed from the club id and the YEAR: two academies of equal
//  strength still differ, and a club that passed on you last winter can have
//  moved its bar by the next one.
// ---------------------------------------------------------------------------

/** ACADEMY (tier 2). 60 and Platinum is the floor the weakest academy asks;
 *  the strongest ask about eight points and five hundred MMR more. */
const ACADEMY_OVR_GATE = 60;
const ACADEMY_MMR_GATE = 1600;          // Platinum IV (RANK_TIERS floor)

/** OPEN CIRCUIT (tier 3). Deliberately BELOW the academy bar and below where it
 *  used to sit (48 / 2000 -- Emerald, which was above the academy MMR gate for
 *  anyone already on a roster). These are the weakest organised teams in the
 *  mode; a side rated 38 asking for a 48-rated player was the open circuit
 *  gatekeeping harder than the league above it. */
const AMATEUR_OVR_GATE = 40;
const AMATEUR_MMR_GATE = 1250;          // Gold IV-ish

/** Per-tier scaling. `ref` is the weakest club in the band, so the base IS the
 *  floor and every club climbs from it; `swing` caps the total climb. */
const GATE_SCALE = {
    2: { ref: 43, ovrPer: 0.30, mmrPer: 19, ovrSwing: 8, mmrSwing: 520 },
    3: { ref: 38, ovrPer: 0.28, mmrPer: 17, ovrSwing: 6, mmrSwing: 350 },
};

/** Deterministic jitter, so two clubs of identical strength are not identical.
 *  Local copy of the same hash awards.js and teams.js each keep. */
function gateHash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
}

/** The rank a gate MMR actually names, so the refusal tells the player what to
 *  go and do rather than quoting a number the ladder never shows them. */
function rankNameFor(mmr) {
    try {
        const r = rankFromMMR(mmr);
        return (r && (r.label || r.name)) || 'a higher rank';
    } catch (e) {
        return 'a higher rank';
    }
}

/**
 * What THIS club asks for, as { ovr, mmr }. Pure, cheap, and never touches the
 * card database -- `strength` is the written number on the team record, not a
 * derived roster read.
 */
function clubGate(c, team, tier) {
    const base = tier === 2
        ? { ovr: ACADEMY_OVR_GATE, mmr: ACADEMY_MMR_GATE }
        : { ovr: AMATEUR_OVR_GATE, mmr: AMATEUR_MMR_GATE };
    const sc = GATE_SCALE[tier];
    if (!sc) return base;

    const strength = Number(team && team.strength);
    const over = Number.isFinite(strength) ? Math.max(0, strength - sc.ref) : 0;
    const year = Math.round(Number(c && c.time && c.time.year) || 0);
    // -1..1, stable for a club within a season.
    const j = gateHash(`${(team && team.id) || '?'}:${year}`) * 2 - 1;

    // The base is a FLOOR, not a midpoint. 60 and Platinum is the stated
    // minimum for an academy, so the jitter is only ever allowed to push a club
    // above it -- otherwise the weakest academy in the world plus an unlucky
    // hash would quietly sign a 58-rated player and the rule would not hold.
    return {
        ovr: Math.max(base.ovr, Math.round(base.ovr + Math.min(sc.ovrSwing, over * sc.ovrPer) + j * 2)),
        mmr: Math.max(base.mmr, Math.round(base.mmr + Math.min(sc.mmrSwing, over * sc.mmrPer) + j * 110)),
    };
}

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

    // TEAM_ALIASES is the only authority on which cards belong to which club.
    // This used to match a card's team against the club's DISPLAY NAME by
    // substring, which looks equivalent and is not: "Cloud9" contains "LOUD",
    // "Nongshim RedForce" contains "RED", "paiN Gaming" contains "GAM", and
    // "RED Canids Kalunga" contains "AL". Adding the Brazilian clubs turned that
    // into 44 offer sheets naming a real professional as the incumbent of a club
    // he has never played for. All 60 main-league clubs have an alias list, so
    // nothing loses a line it was entitled to; the 46 academy sides that have no
    // list now correctly say nothing instead of naming their senior team's star
    // as the holder of an academy seat.
    const tags = cardTagsFor(team.id);
    if (!tags) { _incumbentCache.set(key, null); return null; }
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    let best = null;
    for (const card of db) {
        if (!card || card.role !== role || !card.team) continue;
        if (!tagSet.has(String(card.team).toLowerCase())) continue;
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

    // 50 means "you are exactly the level of this roster". The slope is
    // unchanged for the first OVERQUALIFIED_TURN points of gap and then turns
    // over: past that a bigger gap means LESS interest, not more. See the
    // OVR_OVER_QUALIFIED comment for why clamping at 100 was not enough -- it
    // inverted the ranking at the top and handed elite free agents a shortlist
    // of the weakest clubs in the world, in alphabetical order.
    //
    // Do NOT "fix" this by raising the clamp: 0-100 is a documented display band
    // and Transfers.svelte's interestBand reads it.
    const gap = ovr - str;
    let v = 50 + Math.min(gap, OVERQUALIFIED_TURN) * 3.1;

    // YOUR OWN CLUB IS EXEMPT from the turn. renewalOffer() prices a renewal off
    // this number and returns null under MIN_OFFER_INTEREST, so decaying it here
    // would make an elite player at a mid-table club unrenewable by the club he
    // already plays for -- a far worse bug than the one being fixed. Same rule
    // and the same reason as signingBlock()'s first clause: over-qualification
    // is a statement about ARRIVING somewhere, not about staying.
    if (gap > OVERQUALIFIED_TURN && !(p.clubId && t.id === p.clubId)) {
        v -= (gap - OVERQUALIFIED_TURN) * OVERQUALIFIED_DECAY;
    }

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

    // WHERE YOU ARE FROM. Home clubs watched you climb their own solo queue, so
    // they bid for you first; a foreign roster is spending an import slot and
    // wants fame in return for it. Both directions are written down because for
    // a long time only the penalty existed, which made "home" mean nothing more
    // than "not abroad".
    //
    // +8 is deliberately modest. The home-vs-foreign gap is 22 raw points before
    // fame and about 13 after a famous player buys the import slot back; much
    // above that and the foreign market closes entirely for anyone without hype,
    // which is not what prioritising the home region should mean.
    //
    // LANGUAGE is the second half of the import slot. A club that can actually
    // talk to you is buying a player, not a project, and fluency buys back
    // LANGUAGE_INTEREST_REFUND of the penalty: -14 at nothing, -4.2 at fluent.
    // At zero fluency the arithmetic is EXACTLY what it has always been, which
    // is what keeps every save that predates languages priced where it was.
    //
    // Raising interest here also raises the wage, the contract length, the
    // signing bonus and the release clause -- buildOffer() derives all four from
    // it -- and that is intended in this one case: a club that can talk to you
    // wants you more and pays accordingly. Call FREQUENCY is a different thing
    // and lives in generateOffers().
    if (t.region === 'ALL' || t.region === p.region) {
        v += HOME_REGION_BONUS;
    } else {
        const need = languageForRegion(t.region);
        const fl = need ? fluencyForRegion(c, t.region) : 1;   // 0..1
        v += FOREIGN_REGION_PENALTY * (1 - fl * LANGUAGE_INTEREST_REFUND) + Math.min(FOREIGN_FAME_REFUND, fame);
    }

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
        .map(t => {
            // Carried so the screen can say WHY a club that clearly rates the
            // player is not going to call. Silently omitting them is what makes
            // an age or first-club rule read as the game being broken.
            //
            // This board deliberately does NOT run eligibleClub(): that is the
            // OFFER rail (window, step-up, mid-season academy calls) and a
            // scouting screen is allowed to show a club that will call in the
            // window. Over-qualification is the one part of it a player must be
            // told about, and it lives in signingBlock() rather than here, so
            // this row picks it up with no change to the shape.
            const block = signingBlock(c, t);
            return { team: t, interest: scoutInterest(c, t), tier: t.tier, blocked: block.blocked, blockReason: block.reason };
        })
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
    if (tier === 3) {
        lines.push('Open-circuit terms. Barely a wage, but it is a club, a coach, and a soft cap you no longer have.');
        // The freedom is invisible unless it is written down.
        lines.push('Walking away from an open-circuit roster costs you nothing, whenever something better calls.');
    }
    if (region !== p.region) {
        // This line used to read "New language, new solo queue, no friends" and
        // promised a mechanic that did not exist. It does now, so the sheet
        // names the language the room actually works in and says where the
        // player stands on it -- the same number signingBlock() gates on.
        const regionName = REGION_BY_ID[region]?.name || region;
        const need = languageForRegion(region);
        const langName = need ? ((LANGUAGE_BY_ID[need] && LANGUAGE_BY_ID[need].name) || need) : '';
        if (!need) {
            lines.push(`Relocating to ${regionName}. Nothing to learn before you go but the roads.`);
        } else if (speaksForRegion(c, region)) {
            lines.push(`Relocating to ${regionName}. You already have the ${langName} for it, so the move is a visa and a flight.`);
        } else {
            lines.push(`Relocating to ${regionName}. The room works in ${langName} and you are at ${Math.round(languageLevelFor(c, need))}/100 ${DASH} ${LANGUAGE_SIGN_MIN} before anybody there signs you.`);
        }
    } else if (tier <= 2) {
        // The only place a player ever learns the home-region rule exists.
        lines.push('They have watched you since you were climbing their own solo queue.');
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
    // An agent, a manager, a reputation. Applied to the club's opening number
    // rather than to `fair`, so haggling still works from the same place.
    const premium = offerMultiplier(c);
    const salary = Math.max(25, Math.round(Number.isFinite(opts.salary) ? opts.salary : fair * eagerness * premium));

    const years = Math.round(clamp(
        Number.isFinite(opts.years) ? opts.years : defaultYears(p, interest), 1, 4));

    // Two to seven weeks of wages up front, damped hard below tier 1 -- an
    // academy side does not have a war chest to hand a sixteen-year-old.
    const bonusWeeks = (2 + interest / 20) * (tier === 1 ? 1 : tier === 2 ? 0.55 : 0.20);
    // NOT multiplied by `premium` again: it is a number of weeks of `salary`,
    // and `salary` already carries it. Doing both squares the bonus.
    const signingBonus = Math.max(0, Math.round(
        Number.isFinite(opts.signingBonus) ? opts.signingBonus : salary * bonusWeeks));

    // The keener the club, the harder they make it to take you away again.
    const mv = marketValueFor({ ovr, potentialOVR: pot, age: p.age, region, hype: p.hype, valueMult: p.valueMult });
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

/**
 * Is this academy the one attached to the club the player already plays for?
 *
 * Card-database-free and only ever reached behind an `ovr > TIER_OVR_CEILING[2]`
 * short circuit, so signingBlock() stays cheap enough for the transfer screen to
 * call once per club per render. Uses the same two signals parentClubFor() does
 * -- academies carry their parent org's accent, and orgName() strips the suffix
 * every naming convention in constants.js appends.
 */
function isOwnAcademy(c, t) {
    const p = c && c.player;
    if (!p || !p.clubId || Number(t.tier) !== 2) return false;
    const cur = resolveTeam(p.clubId);
    if (!cur || Number(cur.tier) !== 1) return false;
    if (String(t.accent).toLowerCase() === String(cur.accent).toLowerCase()) return true;
    const org = orgName(t.name).toLowerCase();
    const mine = String(cur.name).toLowerCase();
    return !!org && (org === mine || (org.length >= 4 && (mine.includes(org) || org.includes(mine))));
}

/**
 * WHY A CLUB WILL NOT SIGN YOU, as a sentence.
 *
 * One predicate, exported, so the transfer screens can print the reason instead
 * of silently omitting the club. A fourteen-year-old should SEE that a
 * main-league side rates him and cannot sign him yet — a club that just never
 * appears reads as the game being broken.
 *
 * SCOPED BY flags.everSigned, never by a path test. Academy Debut is exempt by
 * construction: it signs the player at creation and sets the flag, and its whole
 * premise is starting on an academy roster at 16. A `path === 'precomp'` test
 * would also misfire on any save whose flag was lost.
 *
 * PURE and cheap — the transfer screen calls this once per club on every
 * reactive render, so nothing in here may touch the card database.
 */
export function signingBlock(c, team) {
    const t = normTeam(team);
    const p = c && c.player;
    if (!p || !t) return { blocked: true, reason: 'No club.' };

    // The club you already play for can always renew with you. Inert today --
    // nothing calls this with the current club, interestedTeams() filters it out
    // by id -- and it exists so the language clause below can never evict a
    // player from a room he is already sitting in. A signing gate is a rule
    // about ARRIVING somewhere.
    if (t.id === p.clubId) return { blocked: false, reason: '' };

    const tier = Number(t.tier) || 1;
    const ovr = calcOVR(p.attrs, p.role);
    const mmr = Number(c.soloq?.mmr) || 0;
    const everSigned = !!(c.flags && c.flags.everSigned);

    // (a) YOUR FIRST CLUB IS ALWAYS AN AMATEUR ONE. Nobody at academy level or
    // above signs a player with no record at all.
    if (!everSigned && tier < 3) {
        return { blocked: true, reason: 'Nobody at this level signs a player with no record. Get on an amateur roster first.' };
    }
    // (b) AND IT IS IN YOUR OWN REGION. Vacuous today — the amateur sides are
    // region 'ALL' — but it is the rule as asked for, and it becomes load-bearing
    // the moment the open circuit gets regions.
    if (!everSigned && t.region !== 'ALL' && t.region !== p.region) {
        return { blocked: true, reason: 'Your first team is a local one. Nobody is flying an unproven player across the world.' };
    }
    // (b2) LANGUAGE. The sibling rule to (b), and unlike (b) it is load-bearing
    // from day one: a club whose league does not work in a language you can hold
    // a review in will not sign you however good you are.
    //
    // REGION_LANGUAGE maps LEC, LCS and LCP all to 'en' ON PURPOSE, so moving
    // from Europe to North America is free while a Korean has to learn English
    // to move west at all and a European has to learn Korean for the LCK. That
    // asymmetry is the mechanic; a language per region would just be a tax.
    //
    // 'ALL' is NEVER blocked -- languageForRegion() returns null for it and for
    // anything unknown, and normTeam() defaults an unknown club's region to
    // 'ALL'. The compulsory first-club ladder runs entirely through the amateur
    // sides, and careerSmoke hard-fails a run where a precomp career is never
    // signed by anybody.
    const need = languageForRegion(t.region);
    if (need && !speaksForRegion(c, t.region)) {
        const lvl = languageLevelFor(c, need);
        const langName = (LANGUAGE_BY_ID[need] && LANGUAGE_BY_ID[need].name) || need;
        return {
            blocked: true,
            reason: `They play in ${langName}. You are at ${languageBand(lvl)} - ${Math.round(lvl)}/100. Clubs here need ${LANGUAGE_SIGN_MIN}.`,
        };
    }

    // (f) AGE. Blocked at the OFFER, never by downgrading the status: capping a
    // fifteen-year-old to a benched tier-1 contract instead of no contract is
    // worse than the thing being fixed. Read age the way events.js does — a
    // finite check, not `|| 18`, because a save carrying age 0 read as 18 would
    // pass every minimum-age gate in the file.
    const age = Number(p.age);
    const minAge = Number(MIN_AGE_BY_TIER[tier] || 0);
    if (Number.isFinite(age) && age < minAge) {
        return { blocked: true, reason: `Nobody signs a ${age}-year-old to this level. Come back at ${minAge}.` };
    }

    // (d) MAIN LEAGUE. Six under the starting floor is the absolute limit of
    // what a main roster will carry as depth.
    if (tier === 1 && ovr < T1_STARTER_FLOOR - 6) {
        return { blocked: true, reason: `A main roster does not carry a ${ovr} rated player. Get to ${T1_STARTER_FLOOR - 6}.` };
    }

    // (c) ACADEMY. Both halves now apply whatever your situation — an academy
    // wants a rating AND a rank, and 60 / Platinum is what the WEAKEST of them
    // asks. The solo-queue half used to be skipped for anyone already on an
    // amateur roster; it no longer is, because the bar it now checks is
    // Platinum rather than Diamond and a player on the open circuit is past it.
    if (tier === 2) {
        const g = clubGate(c, t, 2);
        if (ovr < g.ovr) {
            return { blocked: true, reason: `${t.name} are looking at ${g.ovr} rated players. You are ${ovr}.` };
        }
        if (mmr < g.mmr) {
            return { blocked: true, reason: `${t.name} want to see ${rankNameFor(g.mmr)} on the ladder first.` };
        }
        // (c2) AND AN ACADEMY IS NOT A PARKING SPACE. A player past the academy
        // ceiling is not somebody they can develop, and the staff know it.
        //
        // GATED ON everSigned, like (a) and (b): the compulsory first-club
        // ladder must stay open or careerSmoke's neverSigned check fails, and a
        // prospect who has never been signed is by definition not too good for
        // anybody. The player's own parent academy is exempt too, so nothing can
        // make the promotion path unreachable from the other direction.
        if (everSigned && ovr > TIER_OVR_CEILING[2] && !isOwnAcademy(c, t)) {
            return {
                blocked: true,
                reason: `${t.name} are an academy and you are a ${ovr} rated professional. They would be holding your career up, and they will not do it.`,
            };
        }
    }

    // (e) OPEN CIRCUIT. The weakest teams in the mode, and priced like it.
    if (tier === 3) {
        if (p.clubId) return { blocked: true, reason: 'You are already at a club. Nobody drops to the open circuit.' };
        // (e2) The same rule one tier down, and the same everSigned guard for the
        // same reason -- this is the rung every precomp career has to stand on.
        if (everSigned && ovr > TIER_OVR_CEILING[3]) {
            return {
                blocked: true,
                reason: `You are a ${ovr} rated player. The open circuit is five people in a Discord and they are not going to pretend they can use you.`,
            };
        }
        const g = clubGate(c, t, 3);
        if (ovr < g.ovr) {
            return { blocked: true, reason: `Even ${t.name} want ${g.ovr}. You are ${ovr}.` };
        }
        if (mmr < g.mmr) {
            return { blocked: true, reason: `${t.name} want to see ${rankNameFor(g.mmr)} on the ladder first.` };
        }
    }

    return { blocked: false, reason: '' };
}

function eligibleClub(c, t, ovr, cur, curStrength, midSeasonScout) {
    if (signingBlock(c, t).blocked) return false;

    const p = c.player;
    const str = strengthOf(t);

    // The only offers that reach a player outside the window are academy calls.
    // WIDENED to include a player already on an amateur roster: without this,
    // signing an open-circuit side sets clubId, falsifies `scoutable`, and locks
    // him out of every offer until the next preseason — up to thirty weeks, and
    // it would read as the amateur signing having ended his career.
    if (midSeasonScout && t.tier !== 2) return false;

    if (cur) {
        // Under contract you only hear from clubs that are a clear step up.
        // Tier counts for more than raw strength: an academy-to-main move is a
        // promotion even when the numbers look sideways.
        const tierUp = t.tier < cur.tier;
        if (!tierUp && (t.tier > cur.tier || str < curStrength + 4)) return false;
    } else if (c.flags && c.flags.everSigned) {
        // FREE AGENT. The rail above sat entirely inside `if (cur)`, so the one
        // state an elite player is actually in during the window -- expired,
        // released or terminated -- was completely unguarded, and `ovr` was a
        // parameter this function took and never read. A club fifteen strength
        // points below you is not a move, it is a retirement home.
        //
        // The everSigned escape is the same one signingBlock's first-club ladder
        // runs on: a prospect nobody has ever signed can still be called by
        // anybody, which is what keeps careerSmoke's neverSigned check passing.
        if (str < ovr - OVR_OVER_QUALIFIED) return false;
    }
    return true;
}

/**
 * THE CLUB THE PLAYER IS AIMING FOR, as an honest readout.
 *
 * Lives here rather than in a component because an honest answer needs
 * clubGate(), MIN_OFFER_INTEREST and T1_STARTER_FLOOR, all module-private, plus
 * the eligibleClub() rail and the offer window -- and Transfers.svelte already
 * hand-mirrors four constants out of this file, which is exactly how a screen
 * and an engine come to disagree about who can sign you.
 *
 * Same status+detail idiom as teams.eventQualification(): a status the UI can
 * colour and a sentence saying what is actually still required. Interest alone
 * is not an answer -- a club can rate the player at 90 and still be unable to
 * sign him because of language, age, the window, or a rejection counter that
 * has already run out.
 *
 * PURE, cheap, never throws, and returns null when there is no goal.
 */
export function goalProgress(c) {
    try {
        const p = c && c.player;
        if (!p) return null;
        const id = p.goalClubId;
        if (!id || typeof id !== 'string') return null;
        const t = resolveTeam(id);
        if (!t) return null;

        const tier = Number(t.tier) || 1;
        const ovr = calcOVR(p.attrs, p.role);
        const interest = scoutInterest(c, t);
        const block = signingBlock(c, t);
        const rejected = Math.max(0, Number((p.rejected || {})[t.id]) || 0);

        // The window, resolved the way generateOffers() resolves it -- including
        // the year-round academy call, which is the one hole in it.
        const phase = phaseForWeek(Number(c.time && c.time.week) || 1).id;
        const inWindow = phase === 'offseason' || phase === 'preseason';
        const onAmateur = Number(p.clubTier) === 3;
        const scoutable = (!p.clubId || onAmateur)
            && (!p.clubId ? (Number(c.soloq && c.soloq.mmr) || 0) >= SCOUT_MMR_GATE : true)
            && ovr >= ACADEMY_OVR_GATE;
        const windowOpen = inWindow || (tier === 2 && scoutable);

        // The STRUCTURAL half of the offer rail only -- signingBlock, the
        // step-up rule and the free-agent strength rail. `midSeasonScout` is
        // passed false deliberately: that argument is the window, `windowOpen`
        // above already models it (academy hole included), and folding the two
        // together made an out-of-window row say "they only call clubs near your
        // rating" when the honest answer was "it is week 10".
        const cur = p.clubId ? resolveTeam(p.clubId) : null;
        const eligible = eligibleClub(c, t, ovr, cur, cur ? strengthOf(cur) : 0, false);

        // What this club asks for. Tier 1 has no clubGate -- its bar is the
        // main-league depth floor, six under the starting floor.
        const gate = tier === 1
            ? { ovr: T1_STARTER_FLOOR - 6, mmr: 0 }
            : clubGate(c, t, tier);

        const row = {
            teamId: t.id,
            name: t.name,
            tier,
            region: t.region,
            status: 'chase',
            interest,
            need: '',
            gate,
            blockReason: block.reason || '',
            windowOpen,
            rejected,
            detail: '',
        };

        // --- REACHED. The club you play for, or the one you already played for.
        const reachedYear = Math.round(Number(c.flags && c.flags.goalReached) || 0);
        if (p.clubId === t.id) {
            row.status = 'reached';
            row.need = 'Nothing. You are there.';
            row.detail = `You play for ${t.name}. That was the whole point.`;
            return row;
        }
        if (reachedYear > 0) {
            row.status = 'reached';
            row.need = 'Nothing. You got there.';
            row.detail = `You signed for ${t.name} in ${reachedYear}. Wherever you are now, that one is done.`;
            return row;
        }

        // --- LOST. The rejection counter is a permanent, silent dead end in
        // generateOffers(); surfacing it is half the reason this row exists.
        if (rejected >= REJECTIONS_BEFORE_BLACKLIST) {
            row.status = 'lost';
            row.need = 'Nothing you can do.';
            row.detail = `${t.name} have crossed you off after ${rejected} refusals. They are never calling again.`;
            return row;
        }

        // --- BLOCKED. A hard rule: language, age, rating, first club, or being
        // too good for the level. signingBlock() already wrote the sentence.
        if (block.blocked) {
            row.status = 'blocked';
            row.need = block.reason;
            row.detail = block.reason;
            return row;
        }

        // --- What is still in the way, most concrete first.
        if (tier !== 1 && ovr < gate.ovr) {
            row.need = `${gate.ovr} rating`;
            row.detail = `${t.name} are looking at ${gate.ovr} rated players. You are ${ovr}.`;
        } else if (tier === 1 && ovr < T1_STARTER_FLOOR) {
            row.need = `${T1_STARTER_FLOOR} rating for a seat`;
            row.detail = `${t.name} would take you as depth at ${ovr}, but nobody starts in the main league under ${T1_STARTER_FLOOR}.`;
        } else if (interest < MIN_OFFER_INTEREST) {
            row.need = `${MIN_OFFER_INTEREST} interest`;
            row.detail = `${t.name} rate you ${interest} out of 100. Under ${MIN_OFFER_INTEREST} a club is curious, not interested, and does not make the call.`;
        } else if (!eligible && cur) {
            row.need = 'A club they would call you away from';
            row.detail = `${t.name} rate you ${interest}, but they will not phone a contracted player about a sideways move. Run the deal down, or be somewhere they have to beat.`;
        } else if (!eligible) {
            row.need = 'A club nearer their level';
            row.detail = `${t.name} rate you ${interest}, but a free agent only hears from clubs inside ${OVR_OVER_QUALIFIED} strength of his own rating.`;
        } else if (!windowOpen) {
            row.need = 'The transfer window';
            row.detail = `${t.name} rate you ${interest} and there is nothing else in the way. Nobody signs anybody until the offseason.`;
        } else {
            row.status = 'live';
            row.need = 'A phone call';
            row.detail = `${t.name} rate you ${interest}, the window is open and nothing is blocking it. Expect them.`;
        }

        return row;
    } catch (e) {
        return null;
    }
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

    // The one hole in the transfer window: a prospect who has clearly outgrown
    // where he is gets a phone call whenever a scout notices, because academies
    // recruit year-round and neither a free agent nor an open-circuit player
    // costs anything to sign.
    //
    // THE TIER-3 HALF IS LOAD-BEARING. Now that an amateur roster is compulsory
    // as a first club, restricting this to the unsigned would mean signing one
    // locks the player out of every offer until the next preseason — up to
    // thirty weeks — and the amateur signing would look like the thing that
    // ended his career.
    const onAmateur = Number(p.clubTier) === 3;
    const scoutable = (unsigned || onAmateur)
        && (unsigned ? (Number(c.soloq?.mmr) || 0) >= SCOUT_MMR_GATE : true)
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

    // FOURTEEN IS NOW AN UNMEASURED NUMBER. It was tuned against an ordering
    // that was inverted at the top: interest saturated at 100 for almost every
    // club in the world, so the tie-break fell through to a localeCompare on
    // club name and these fourteen rows were, for an elite player, the
    // alphabetically-first fourteen of the weakest sides on the circuit. With
    // the curve turned over they are an entirely different fourteen clubs, so
    // re-measure offer volume with careerSmoke before changing the literal --
    // the old figure proves nothing about the new list.
    const rows = interestedTeams(c, 14).filter(row => {
        const t = row.team;
        if (taken.has(t.id)) return false;
        if ((rejected[t.id] || 0) >= REJECTIONS_BEFORE_BLACKLIST) return false;
        if (row.interest < MIN_OFFER_INTEREST) return false;
        return eligibleClub(c, t, ovr, cur, curStrength, midSeasonScout);
    });

    for (const row of rows) {
        if (room <= 0) break;
        // Home clubs get in touch sooner. This is the second half of the
        // home-region preference and it is deliberately here rather than in
        // scoutInterest: raising the INTEREST would also raise the wage, the
        // contract length and the signing bonus, all of which derive from it.
        // Calling earlier is what "prioritise recruiting you" actually means.
        //
        // The foreign half is the same idea read the other way round: a league
        // you can already talk to picks the phone up sooner than one you cannot.
        // It is exactly 1 at zero fluency -- the flat rate every foreign club
        // used to get -- so a save that has never studied calls as it always did.
        //
        // And the third member of the family: the club the player nominated as
        // the one to aim for picks the phone up sooner than the rest. Same split
        // for the same reason -- a goal is a preference, and a preference must
        // never reprice the offer sheet.
        const home = row.team.region === 'ALL' || row.team.region === p.region;
        const homeRate = home
            ? HOME_REGION_CALL_RATE
            : (1 + fluencyForRegion(c, row.team.region) * FLUENT_CALL_RATE_BONUS);
        const goalRate = (p.goalClubId && row.team.id === p.goalClubId) ? GOAL_CALL_RATE_BONUS : 1;
        if (Math.random() * 100 >= row.interest * rate * homeRate * goalRate) continue;
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

    // A crash course before you fly out. Only when the destination works in a
    // language the player is not fluent in yet, and it lands strictly AFTER the
    // hard gate rather than before it -- signingBlock() ran when the offer was
    // built, so LANGUAGE_ARRIVAL_BOOST can never be what got anybody signed.
    const arrivalLang = languageForRegion(offer.region);
    const crashCourse = !!arrivalLang && languageLevelFor(c, arrivalLang) < LANGUAGE_FLUENT;

    // Reaching the club you nominated. Bare string equality, no lookups, and
    // stamped with the YEAR rather than `true` -- a year reads as truthy exactly
    // the same way and is strictly more informative, the same idiom as
    // flags.firstStandBerth and flags.firstSeen.
    const reachedGoal = !!c.player.goalClubId && c.player.goalClubId === team.id;

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            clubId: team.id,
            clubTier: offer.tier,
            status: offer.status,
            contract,
            // Written in the SAME update as the contract: a second career.update
            // here would be a second debounced save of a half-signed player.
            // Fractional on purpose, like every other language write.
            languages: crashCourse
                ? {
                    ...(x.player.languages && typeof x.player.languages === 'object' ? x.player.languages : {}),
                    [arrivalLang]: clamp(languageLevelFor(x, arrivalLang) + LANGUAGE_ARRIVAL_BOOST, 0, LANGUAGE_MAX),
                }
                : x.player.languages,
            // Low but not hostile on a move: nobody in the room knows you, and
            // the player you just replaced knows exactly who you are. A renewal
            // keeps whatever you already built. Mentor and The Voice are what
            // buy the cold start back.
            chemistry: renewal
                ? clamp((x.player.chemistry ?? 50) + 6, 0, 100)
                : startingChemistry(c, 38),
            morale: clamp((x.player.morale ?? 50) + (renewal ? 6 : 10), 0, 100),
            transferRequested: false,
        },
        offers: [],
        // Written in the SAME update as the contract, for the same reason the
        // language boost is: a second career.update() here would be a second
        // debounced save of a half-signed player.
        flags: reachedGoal
            ? { ...x.flags, everSigned: true, goalReached: c.time.year }
            : { ...x.flags, everSigned: true },
    }));

    if (offer.signingBonus > 0) grantGold(offer.signingBonus);

    const term = offer.years === 1 ? '1 year' : `${offer.years} years`;
    const msg = renewal
        ? `Re-signed with ${team.name} ${DASH} ${statusInfo(offer.status).name}, ${fmtGold(offer.salary)}/wk for ${term}.`
        : `Signed for ${team.name} ${DASH} ${statusInfo(offer.status).name}, ${fmtGold(offer.salary)}/wk for ${term}.`;

    addNews(msg, 'transfer');
    if (reachedGoal) {
        addNews(`${team.name} were the club you were aiming for. You are on their roster.`, 'transfer');
    }
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
    // Open-circuit sides do not hold a grudge, and blacklisting them would be a
    // real trap: they are the compulsory first rung, there are only six of them
    // in the world, and turning two down would close the ladder permanently.
    const amateurOffer = Number(offer.tier) === 3;
    const count = amateurOffer ? before : before + 1;
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

    // The club's own valuation, INCLUDING the premium its opening number was
    // written with. Without offerMultiplier() here, buying Hard Bargainer made
    // negotiating strictly worse: the perk raised the offer, `greed` is measured
    // as reqSalary / fair, and asking for the number already on the table then
    // scored as a 45% overreach and got the offer withdrawn. The premium is the
    // club's position, not the player's ask.
    const fair = weeklySalaryFor({
        ovr, clubTier: found.tier, region: found.region, age: p.age,
        status: reqStatus, potentialOVR: pot,
    }) * offerMultiplier(c);
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

    // Nothing to request at open-circuit level. There is no contract to be
    // released from and no front office to fall out with, so charging the
    // chemistry and morale a real request costs would be inventing a penalty
    // for leaving the club the mode now REQUIRES you to start at.
    if ((Number(team ? team.tier : p.clubTier) || 0) === 3) {
        return {
            ok: true,
            msg: `You do not need to ask. Walking away from ${name} costs you nothing — take a better offer whenever one comes.`,
        };
    }

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
    // Below `cut` because it was telegraphed over three split reviews, above
    // `mutual` because it was not the player's choice.
    terminated: { hit: 20, type: 'drama', text: (n) => `${n} tore the contract up early. Three reviews, three answers, and a settlement.` },
    // An open-circuit roster is five people in a Discord. Walking away from one
    // costs nothing at all, which is the point of it being the compulsory first
    // club: it can never be the thing standing between a player and a real offer.
    amateur: { hit: 0, type: 'transfer', text: (n) => `You told ${n} you were leaving. Nobody at that level holds anybody to anything.` },
    burnout:    { hit: 22, type: 'drama', text: (n) => `${n} have let you go. Nobody said it out loud, but you have not been right for months.` },
};

export function releaseFromClub(reason = 'mutual') {
    const c = snap();
    const p = c.player;
    if (!p.clubId) return { ok: false, msg: 'You do not have a club to leave.' };

    const team = resolveTeam(p.clubId);
    const name = team ? team.name : 'your club';
    // Leaving an amateur side is free however the caller phrased it. Doing the
    // substitution HERE means no call site has to know the rule — Transfers.svelte
    // keeps passing 'mutual'.
    const tier = Number(team ? team.tier : p.clubTier) || 0;
    const key = (reason === 'mutual' && tier === 3) ? 'amateur' : reason;
    const r = RELEASE_REASONS[key] || RELEASE_REASONS.mutual;
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

    // The champion has to be legal for the STYLE, not merely for the role. The
    // fallback used to be championsForRole(to.id)[0] paired with styleList[0],
    // which for MID produced a Lane-Dominator-shaped Assassin playstyle holding
    // Ahri and no comfort bonus worth the name.
    const champList = style ? championsForStyle(to.id, style.id) : championsForRole(to.id);
    const wantChamp = CHAMPION_BY_ID[newChampionId];
    const champ = (wantChamp && champList.some(x => x.id === wantChamp.id))
        ? wantChamp
        : (champList[0] || null);

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
            // The extra signatures were picked for the OLD role and are just as
            // meaningless here as the first one. Cleared rather than re-derived:
            // left alone, rollDraft's take() would inject an ADC straight into a
            // top laner's champion select. The slots survive — they are derived
            // from the perks — so the player simply re-picks.
            extraChampions: [],
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
//  SIGNATURE CHAMPION SWITCH
//  Re-maining. Much smaller than a role change -- champion mods are applied at
//  creation only and are deliberately NOT re-applied here, so the switch moves
//  no attributes by that route -- but it is not free either.
//
//  The price is CHP and form, not gold. That is on purpose and it is the only
//  price that interacts with the thing being changed: chp is the one attribute
//  whose sole mechanical job is champion select (match.js rollDraft), so
//  throwing away the champion you were trusted on and starting again on another
//  narrows the pool you can be trusted on. It is also self-limiting without
//  needing a cooldown or a new field on the save: switch repeatedly and your
//  draft odds collapse, which is exactly what would happen.
// ---------------------------------------------------------------------------

/** CHP lost per switch, and the form hit for being on something new. The role
 *  change costs 7-10 OVR and 12 form; this is deliberately a fraction of that. */
const CHAMP_SWITCH_CHP = 6;
const CHAMP_SWITCH_FORM = 8;

export function canSwitchChampion(c) {
    if (!c || !c.created) return { ok: false, reason: 'No career in progress.' };
    if (c.flags?.retired) return { ok: false, reason: 'Your playing career is over.' };
    const p = c.player;
    if (!p.playstyle || !PLAYSTYLE_BY_ID[p.playstyle]) {
        return { ok: false, reason: 'Pick a playstyle first - it decides which champions you can main.' };
    }
    if (championsForStyle(p.role, p.playstyle).length < 2) {
        return { ok: false, reason: 'There is nothing else your playstyle would let you play.' };
    }
    return {
        ok: true,
        reason: `${CHAMP_SWITCH_CHP} champion pool and ${CHAMP_SWITCH_FORM} form. Re-maining is not free.`,
    };
}

/** The champions this player may switch to, current pick excluded. */
export function switchableChampions(c) {
    const p = c?.player;
    if (!p) return [];
    return championsForStyle(p.role, p.playstyle).filter(x => x.id !== p.champion);
}

/** The honest numbers before they commit. Mirrors roleChangePreview(). */
export function championSwitchPreview(c, newChampionId) {
    const p = c?.player;
    const to = CHAMPION_BY_ID[newChampionId];
    const from = CHAMPION_BY_ID[p?.champion] || null;
    const base = {
        from, to: to || null, ok: false, reason: '',
        chpBefore: 0, chpAfter: 0, ovrBefore: 0, ovrAfter: 0, formAfter: 0, fit: 0,
    };
    if (!p || !to) return { ...base, reason: 'That is not a champion.' };
    if (from && from.id === to.id) return { ...base, reason: `${to.name} is already your signature pick.` };

    const legal = championsForStyle(p.role, p.playstyle);
    if (!legal.some(x => x.id === to.id)) {
        const style = PLAYSTYLE_BY_ID[p.playstyle];
        return {
            ...base,
            reason: `A ${style ? style.name : 'player of your style'} does not main a ${to.archetype}.`,
        };
    }

    const chpBefore = Number(p.attrs?.chp) || 0;
    const chpAfter = clamp(chpBefore - CHAMP_SWITCH_CHP, ATTR_MIN, ATTR_MAX);
    const after = { ...p.attrs, chp: chpAfter };

    return {
        ...base,
        ok: true,
        reason: '',
        chpBefore: Math.round(chpBefore),
        chpAfter: Math.round(chpAfter),
        ovrBefore: calcOVR(p.attrs, p.role),
        ovrAfter: calcOVR(after, p.role),
        formAfter: clamp((Number(p.form) ?? 50) - CHAMP_SWITCH_FORM, 0, 100),
        fit: championFit(to, p.playstyle),
    };
}

export function switchChampion(newChampionId) {
    const c = snap();
    const gate = canSwitchChampion(c);
    if (!gate.ok) return { ok: false, msg: gate.reason };

    // Never mid-series. rollDraft has already resolved champion select for the
    // game being played and match.draft still names the OLD pick, so switching
    // here would silently change the comfort bonus between game two and three.
    if (get(matchState)) {
        return { ok: false, msg: 'Not in the middle of a series. Finish the match first.' };
    }

    const preview = championSwitchPreview(c, newChampionId);
    if (!preview.ok) return { ok: false, msg: preview.reason || 'You cannot main that.' };

    const to = preview.to;
    const from = preview.from;

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            champion: to.id,
            // Fractional on purpose, like every other attribute write outside
            // creation and role changes.
            attrs: {
                ...x.player.attrs,
                chp: clamp((Number(x.player.attrs.chp) || 0) - CHAMP_SWITCH_CHP, ATTR_MIN, ATTR_MAX),
            },
            form: clamp((x.player.form ?? 50) - CHAMP_SWITCH_FORM, 0, 100),
        },
    }));

    addNews(
        from
            ? `Dropped ${from.name} for ${to.name}. Weeks of one-tricking somebody else, and a pool that is narrower than it was on Friday.`
            : `${to.name} is the pick now. Something to be known for.`,
        'training',
    );
    showToast(`Now maining ${to.name}`, 'info');
    playSound('pack');
    saveCareer();

    return {
        ok: true,
        msg: from
            ? `${from.name} ${ARROW} ${to.name}. Champion pool ${preview.chpBefore}${ARROW}${preview.chpAfter}.`
            : `${to.name} is your signature pick.`,
    };
}

// ---------------------------------------------------------------------------
//  EXTRA SIGNATURE CHAMPIONS
//  The Second and Third Signature legacy perks buy a SLOT, and this is where a
//  champion goes into one. Capacity is derived from the perks by
//  economy.signatureSlots(); nothing about it is stored.
//
//  Priced identically to a re-main (CHP and form, never gold) for the same
//  reason: chp's only mechanical job is champion select, so widening the pool
//  you are trusted on has to cost the attribute that decides champion select.
// ---------------------------------------------------------------------------

/** Champions that could go into a free signature slot. */
export function designatableChampions(c) {
    const p = c?.player;
    if (!p) return [];
    const held = new Set([p.champion, ...(Array.isArray(p.extraChampions) ? p.extraChampions : [])]);
    return championsForStyle(p.role, p.playstyle).filter(x => !held.has(x.id));
}

/** How many slots are filled and how many exist. Read by the Dossier so an
 *  unused slot is visible — a perk nobody can see is the bug being fixed. */
export function signatureState(c) {
    const p = c?.player || {};
    const extras = Array.isArray(p.extraChampions) ? p.extraChampions.filter(Boolean) : [];
    const slots = signatureSlots(c);
    return {
        slots,
        used: (p.champion ? 1 : 0) + extras.length,
        free: Math.max(0, slots - ((p.champion ? 1 : 0) + extras.length)),
        ids: [p.champion, ...extras].filter(Boolean),
    };
}

export function canDesignateSignature(c) {
    const gate = canSwitchChampion(c);
    if (!gate.ok) return gate;
    const s = signatureState(c);
    if (s.free <= 0) {
        return {
            ok: false,
            reason: s.slots >= 3
                ? 'All three signature slots are taken. Drop one first.'
                : 'Second Signature and Third Signature are legacy perks. Buy one to open a slot.',
        };
    }
    if (!designatableChampions(c).length) {
        return { ok: false, reason: 'There is nothing else your playstyle would let you main.' };
    }
    return { ok: true, reason: `${CHAMP_SWITCH_CHP} champion pool and ${CHAMP_SWITCH_FORM} form, the same as re-maining.` };
}

export function addSignature(championId) {
    const c = snap();
    const gate = canDesignateSignature(c);
    if (!gate.ok) return { ok: false, msg: gate.reason };

    // Same refusal as switchChampion, for the same reason: champion select is
    // already resolved for the game in progress.
    if (get(matchState)) {
        return { ok: false, msg: 'Not in the middle of a series. Finish the match first.' };
    }

    const to = CHAMPION_BY_ID[championId];
    if (!to) return { ok: false, msg: 'No such champion.' };
    if (!designatableChampions(c).some(x => x.id === to.id)) {
        return { ok: false, msg: `${to.name} is not something your playstyle would let you main.` };
    }

    career.update(x => {
        const extras = Array.isArray(x.player.extraChampions) ? x.player.extraChampions.slice() : [];
        extras.push(to.id);
        return {
            ...x,
            player: {
                ...x.player,
                extraChampions: extras.slice(0, 2),
                attrs: {
                    ...x.player.attrs,
                    chp: clamp((Number(x.player.attrs.chp) || 0) - CHAMP_SWITCH_CHP, ATTR_MIN, ATTR_MAX),
                },
                form: clamp((x.player.form ?? 50) - CHAMP_SWITCH_FORM, 0, 100),
                // MAX, never +=. Additive would make re-designating the same
                // champion a proficiency farm, which is the unbounded-renewable
                // failure the ceiling budgets exist to prevent.
                proficiency: {
                    ...(x.player.proficiency || {}),
                    [to.id]: Math.max(
                        Number((x.player.proficiency || {})[to.id]) || 0,
                        PROFICIENCY_SIGNATURE_HEAD_START,
                    ),
                },
            },
        };
    });

    addNews(`${to.name} is a signature pick now. Two champions they have to ban, not one.`, 'training');
    showToast(`${to.name} added as a signature`, 'info');
    playSound('pack');
    saveCareer();
    return { ok: true, msg: `${to.name} is a signature pick.` };
}

export function dropSignature(championId) {
    const c = snap();
    if (!c || !c.created) return { ok: false, msg: 'No career in progress.' };
    if (get(matchState)) return { ok: false, msg: 'Not in the middle of a series. Finish the match first.' };
    const to = CHAMPION_BY_ID[championId];
    const extras = Array.isArray(c.player?.extraChampions) ? c.player.extraChampions : [];
    if (!to || !extras.includes(to.id)) {
        return { ok: false, msg: 'That is not one of your extra signature picks.' };
    }
    // Dropping is free. The cost was paid going in, and charging to undo a
    // purchase the player may have made by accident is not a mechanic.
    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            extraChampions: (x.player.extraChampions || []).filter(id => id !== to.id),
        },
    }));
    addNews(`${to.name} is off the signature list.`, 'training');
    saveCareer();
    return { ok: true, msg: `${to.name} dropped.` };
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
    concerned:   (n) => `${n} sat you down. The ratings are not there, the room has noticed, and your minutes are under review. Nobody comes out of a split like that one sharper than they went in.`,
    cutting:     (n) => `${n} have run out of patience. Unless something changes before the window they are moving you on, and a split spent this way costs you more than the seat.`,
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
    // Morale's only reader outside training and form. Deliberately small — range
    // -5.5 to +4.5 where 'concerned' starts at -6 — because a club noticing you
    // are miserable should nudge the review, never be the thing that cuts you.
    // Burnout is what cuts you. Note it is NOT in scoutInterest: a scout cannot
    // see how you feel, and paying more for a sad player makes misery farmable.
    score += ((p.morale ?? 50) - 55) * 0.10;
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

    // A bad split can now COST ATTRIBUTES outright (engine.checkDecline writes
    // flags.decline). The punishment and the explanation have to come out of the
    // same mouth: a player who loses rating from one system and is told why by
    // none of them is reading a bug, not a consequence. Defensive on shape so
    // this holds on a save written before the field existed.
    if (verdict === 'concerned' || verdict === 'cutting') {
        const lost = num(c && c.flags && c.flags.decline && c.flags.decline.ovrLost, 0);
        const splits = num(c && c.flags && c.flags.decline && c.flags.decline.splits, 0);
        if (lost > 0) {
            text += ` And the coaches have the numbers: ${Math.round(lost)} rating gone`
                + (splits > 1 ? ` across ${splits} splits of this` : ' since this started')
                + `. Slipping backwards is not the same thing as standing still.`;
        }
    }
    if (statusChange) {
        text += ` Squad status: ${statusInfo(p.status).name}${ARROW}${statusInfo(statusChange).name}.`;
    }

    return {
        verdict, text, statusChange, score: Math.round(score),
        // Carried so the Club screen can render the strike chip without a
        // second call. clubReview() is PURE and is re-run on every reactive
        // render — see recordReview() for why that matters.
        strikes: num(p.contract && p.contract.strikes, 0),
        strikesBefore: STRIKES_BEFORE_TERMINATION,
    };
}

// ---------------------------------------------------------------------------
//  EARLY TERMINATION
//  clubReview() has always produced a complete verdict, and until now nothing
//  acted on it mid-contract: the ONLY way to be let go was to reach the end of
//  the deal on a `cutting` verdict, which made a three-year contract unfireable
//  for two of them however badly it went.
//
//  STRIKES LIVE ON THE CONTRACT, NOT THE PLAYER. acceptOffer(), promotionCheck()
//  and createCareer() each build a fresh contract object, so a transfer, a
//  renewal and a promotion all reset the count for free — no hook, no cleanup
//  path anyone can forget to call. Reads must use num(k.strikes, 0): hydrate()
//  spreads `player` shallowly and never reaches inside `contract`, so on an
//  existing save the field is simply undefined, and that is the safe direction.
// ---------------------------------------------------------------------------

const STRIKES_BEFORE_TERMINATION = 3;

/** contracts.js has no num() of its own; every other file in career/ does. */
function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

/** A stamp for the split just reviewed, so the same split cannot be counted
 *  twice. closeSplit('summer') runs inside rolloverYear(), which then runs its
 *  own clubReview — without this every career is fired a year early. */
function splitStamp(c, split) {
    return num(c?.time?.year, 0) * 2 + (split === 'summer' ? 1 : 0);
}

/**
 * Move the strike counter after a split review. ENGINE ONLY.
 *
 * This is deliberately NOT inside clubReview(): the Club screen re-runs that on
 * every reactive update, so accumulating there would fire the player for opening
 * a tab. That is the single most dangerous mistake available in this feature and
 * it would look exactly like a balance problem.
 */
export function recordReview(c, split, review) {
    const p = c?.player;
    if (!p || !p.contract || !p.clubId) return null;
    // Leaving an amateur side is free, so being fired by one is not a mechanic.
    if (num(p.contract.tier, num(p.clubTier, 1)) === 3) return null;

    const stamp = splitStamp(c, split);
    if (num(p.contract.strikeSplit, -1) === stamp) return null;   // already counted

    const before = num(p.contract.strikes, 0);
    let delta = 0;
    if (review.verdict === 'cutting') delta = 2;
    else if (review.verdict === 'concerned') delta = 1;
    else if (review.verdict === 'happy' || review.verdict === 'untouchable') delta = -1;

    // Burnout PAUSES the clock rather than clearing it. Being fired for a slump
    // the mode itself inflicted, in a split where training back is impossible,
    // fails the "what could the player have done" test. Read defensively so the
    // two systems can land in either order.
    const burntOut = (Number(c.flags?.burnout?.weeks) || 0) > 0;
    if (burntOut && delta > 0) delta = 0;

    const after = clamp(before + delta, 0, STRIKES_BEFORE_TERMINATION);

    career.update(x => ({
        ...x,
        player: {
            ...x.player,
            contract: { ...x.player.contract, strikes: after, strikeSplit: stamp },
        },
    }));

    if (after > before && after < STRIKES_BEFORE_TERMINATION) {
        const left = STRIKES_BEFORE_TERMINATION - after;
        addNews(
            left === 1
                ? `A second bad review. One more and the contract is torn up in the window.`
                : `The club have put a warning on your file. ${left} more and they move you on.`,
            'drama',
        );
    }
    return { before, after };
}

/**
 * Tear up a contract that has run out of warnings. Called by the engine right
 * after recordReview(), and BEFORE offers are generated for the week — otherwise
 * a strike-three player is handed a renewal by the club firing him.
 */
export function enforceContract(c) {
    const p = c?.player;
    if (!p || !p.contract || !p.clubId) return null;
    if (num(p.contract.strikes, 0) < STRIKES_BEFORE_TERMINATION) return null;

    const team = resolveTeam(p.clubId);
    const name = team ? team.name : 'Your club';
    // Clubs buy contracts out. Without this a player fired at week 40 has no
    // income until preseason and no way to buy the things that fix form.
    const severance = Math.min(Math.round(num(p.contract.salary, 0) * 8), 40000);

    releaseFromClub('terminated');
    if (severance > 0) grantGold(severance);
    career.update(x => ({
        ...x,
        flags: { ...x.flags, terminations: num(x.flags && x.flags.terminations, 0) + 1 },
    }));

    addNews(
        `${name} have terminated your contract. ${severance > 0 ? `${fmtGold(severance)} settlement, and a` : 'A'} phone that is not going to ring for a while.`,
        'drama',
    );
    return { team: name, severance };
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

    // Before the rating check, so the reason line is the honest one: a
    // fifteen-year-old is not being told to train harder, he is being told to
    // wait for a birthday.
    const age = Number(p.age);
    const minAge = Number(MIN_AGE_BY_TIER[1] || 0);
    if (Number.isFinite(age) && age < minAge) {
        return fail(`Main-league rosters are ${minAge}-and-over. They will move you up the year you turn ${minAge}.`);
    }

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
            ovr, potentialOVR: pot, age: p.age, region, hype: p.hype, valueMult: p.valueMult,
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
            chemistry: startingChemistry(state, clamp((x.player.chemistry ?? 50) * 0.75 + 12, 0, 100)),
            morale: clamp((x.player.morale ?? 50) + 16, 0, 100),
            transferRequested: false,
        },
        offers: [],
        // The other, and probably more common, way a goal is reached: a player
        // who aims at a tier-1 org signs its academy and arrives upstairs rather
        // than through an offer. Stamped in the SAME update as the contract, and
        // a bare string equality with no lookups -- promotionCheck() runs inside
        // rolloverYear() under safe(), which swallows a throw silently.
        flags: (p.goalClubId && p.goalClubId === parent.id)
            ? { ...x.flags, goalReached: state.time.year }
            : x.flags,
    }));

    const msg = `${parent.name} promoted you to the main roster ${DASH} ${statusInfo(status).name} on ${fmtGold(salary)}/wk.`;
    addNews(msg, 'transfer');
    if (p.goalClubId && p.goalClubId === parent.id) {
        addNews(`${parent.name} were the club you were aiming for. You came up through their own academy.`, 'transfer');
    }
    showToast('Promoted to the main roster', 'success');
    playSound('rare');
    saveCareer();

    return { promoted: true, team: parent, msg };
}
