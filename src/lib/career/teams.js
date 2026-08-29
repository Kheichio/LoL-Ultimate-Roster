// ===========================================================================
//  LoL ULTIMATE CAREER -- leagues, rosters, schedule, standings
// ===========================================================================
//  constants.js holds a static table of orgs and a baseline `strength` number.
//  This file turns that table into something that behaves like a league: every
//  org gets a real five-man roster pulled out of the card database, a strength
//  that reflects who is actually sitting in those seats, a fixture list, and a
//  table that keeps moving while the player is busy with their own games.
//
//  Nothing here writes the store. Every export takes the career object (or a
//  team) and returns a value, so the engine stays the only thing that mutates.

import {
    LEAGUES, AMATEUR_TEAMS, REGION_IDS, REGION_BY_ID, ROLE_BY_ID,
    CLUB_TIERS, teamById, phaseForWeek, PHASES,
    MATCHES_PER_REG_WEEK, REG_SPLIT_WEEKS, DEFAULT_START_YEAR, regularBestOf,
    MIN_AGE_INTERNATIONAL,
} from './constants.js';
import { calcOVR, clamp, statusInfo } from './ratings.js';
import { getDB, getEffectiveRating, ratingToQuality, getEra } from '../utils/cards.js';

// The five playing seats, in board order. COACH is handled separately because
// a coach card's `rating` sits on its own scale and must not pollute a roster
// average (their MEC is a token 20-24 in the database).
export const ROSTER_SLOTS = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];

// Pseudo-team id for an unsigned player, so the season screen has something to
// put in the "you" row of the amateur table.
export const FREE_AGENT_ID = 'free_agent';

// ---------------------------------------------------------------------------
//  DETERMINISTIC RANDOM
//  Rosters and rivalries are regenerated from scratch on every page load, so
//  anything that looks random has to be a pure function of ids and years or
//  the league would reshuffle itself between renders.
// ---------------------------------------------------------------------------
/** teams.js has no num() of its own; every other file in career/ does. */
function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleSeeded(arr, seed) {
    const out = arr.slice();
    const rnd = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
}

// ---------------------------------------------------------------------------
//  ORG -> CARD TEAM ALIASES
//  The card database stores orgs by their broadcast abbreviation ("HLE", "DK")
//  and keeps historical names for the same franchise ("SKT" is T1, "SSW" is
//  Gen.G). Matching on the display name from LEAGUES would find nothing, so
//  every org that has real cards gets an explicit alias list, newest name first.
//  Anything not listed here falls through to the regional fill and then to a
//  synthetic roster, which is the correct answer for most academy sides -- a
//  card database of professionals simply does not contain them.
// ---------------------------------------------------------------------------
const TEAM_ALIASES = {
    // LCK
    lck_t1:   ['T1', 'SKT', 'SKTK', 'SKTS'],
    lck_geng: ['Gen.G', 'SSG', 'SSW', 'SSB'],
    lck_hle:  ['HLE', 'ROX', 'KOO'],
    lck_dk:   ['DK', 'DWG'],
    lck_kt:   ['KT'],
    lck_bfx:  ['BFX', 'SANDBOX'],
    lck_ns:   ['NS', 'NBS', 'Dynamics'],
    lck_drx:  ['DRX', 'Kingzone', 'KZ', 'LZ'],
    lck_dns:  ['DNS', 'KDF', 'AFS', 'AF', 'Afreeca'],
    lck_bro:  ['BRO', 'BBQ'],
    lck_kta:  ['KTA'],            // KT Arrows really was the org's second team

    // LPL
    lpl_blg: ['BLG', 'SN', 'Snake'],
    lpl_jdg: ['JDG'],
    lpl_tes: ['TES', 'TOP'],
    lpl_wbg: ['WBG', 'SN'],
    lpl_lng: ['LNG'],
    lpl_al:  ['AL', 'LGD'],
    lpl_ig:  ['IG'],
    lpl_edg: ['EDG'],
    lpl_fpx: ['FPX'],
    lpl_omg: ['OMG'],

    // LEC
    lec_g2:   ['G2'],
    lec_fnc:  ['FNC', 'Fnatic'],
    lec_mkoi: ['MKOI', 'KOI', 'Rogue'],
    lec_th:   ['TH'],
    lec_bds:  ['BDS'],
    lec_vit:  ['VIT', 'Vitality'],
    lec_kc:   ['KC'],
    lec_sk:   ['SK', 'SKG', 'S04', 'Schalke'],
    lec_gx:   ['GX', 'GIA', 'Giants', 'Excel'],
    lec_navi: ['NAVI'],
    lec_kcb:  ['KCB'],            // Karmine Corp Blue has genuine academy cards

    // LCS
    lcs_c9:   ['C9'],
    lcs_tl:   ['TL'],
    lcs_fly:  ['FLY', 'FQ'],
    lcs_100t: ['100T'],
    lcs_nrg:  ['NRG', 'EG'],
    lcs_sr:   ['SR', 'TSM'],
    lcs_dig:  ['DIG'],
    lcs_lyon: ['LYON'],
    lcs_dsg:  ['DSG'],
    lcs_imt:  ['IMT'],

    // LCP
    lcp_cfo:  ['CFO', 'FW'],
    lcp_psg:  ['PSG', 'ahq'],
    lcp_gam:  ['GAM'],
    lcp_tsw:  ['TSW'],
    lcp_dfm:  ['DFM'],
    lcp_mvke: ['MVK', 'MGN'],
    lcp_shg:  ['SHG'],
    lcp_bru:  ['RC', 'BRU'],
    lcp_dcg:  ['DCG'],
    lcp_tw:   ['TLN'],

    // CBLOL. The Brazilian card blocks run 2014-2026 (2025 was played under the
    // LTA South name but is the same league and carries the same region), so
    // several of these orgs have a decade of prints under two or three different
    // tags; newest first.
    cblol_loud: ['LOUD'],
    cblol_pain: ['paiN'],
    cblol_red:  ['RED'],          // NOT 'RDM' — Redemption (2019) is a different org
    // Rebrands and mergers only, never a purchased slot: FURIA bought Uppercut's
    // place in 2020 and Fluxo bought Flamengo's in 2023, but neither inherited
    // the other org's players, so neither inherits its cards.
    cblol_fur:  ['FUR'],
    cblol_vks:  ['VKS', 'KEYD'],  // Keyd Stars -> Vivo Keyd -> Vivo Keyd Stars
    cblol_los:  ['LOS'],
    cblol_fxw:  ['FXW', 'FX'],    // Fluxo -> Fluxo W7M
    cblol_lev:  ['LEV'],
    cblol_kbm:  ['KBM', 'KBB'],   // KaBuM! ran Orange and Black sides in 2015
    cblol_intz: ['INTZ', 'ITZR'], // as did INTZ
};

/** The card-database team tags an org's cards are printed under, newest first,
 *  or null for an org with no cards. This is the ONLY authority on which cards
 *  belong to which club -- matching a card's `team` against a club's display
 *  name looks equivalent and is not: "Cloud9" contains "LOUD", "Nongshim
 *  RedForce" contains "RED", and "paiN Gaming" contains "GAM". */
export function cardTagsFor(teamId) {
    const tags = TEAM_ALIASES[teamId];
    return tags && tags.length ? tags : null;
}

// ---------------------------------------------------------------------------
//  CARD ELIGIBILITY
//  The database stops in 2026 and a career runs a decade past that. Freezing
//  the 2026 rosters forever would leave the same names starting at 33, so each
//  card gets a deterministic shelf life: three to eight years after the season
//  it was printed for, that player is treated as retired and a synthetic rookie
//  takes the seat. The league turns over on its own between roughly 2029 and
//  2034 without any of it being scripted.
// ---------------------------------------------------------------------------
const CARD_MIN_LIFE = 3;
const CARD_LIFE_SPREAD = 6;      // life is CARD_MIN_LIFE .. CARD_MIN_LIFE+5
const FUTURE_TOLERANCE = 3;      // a 2026 card is usable for a 2023 lookup

function cardActiveIn(card, year) {
    const drift = year - (card.year || 0);
    if (drift < -FUTURE_TOLERANCE) return false;
    if (drift <= 1) return true;
    const life = CARD_MIN_LIFE + (hash32('life' + card.id) % CARD_LIFE_SPREAD);
    return drift <= life;
}

// A card printed for the exact season beats a better card from three years ago.
// 7 points per year off means a 2023 card needs to be 21 rating points better
// than a 2026 one to take the seat, which in practice never happens.
const YEAR_PENALTY = 7;

function cardScore(card, year) {
    return getEffectiveRating(card) - Math.abs(year - (card.year || 0)) * YEAR_PENALTY;
}

// ---------------------------------------------------------------------------
//  SYNTHETIC PLAYERS
//  Used whenever the database is missing, the org has no cards, or everyone who
//  ever played for it has aged out. Ids are negative so validateCard() and the
//  club/squad screens can never confuse one with a real collectible.
// ---------------------------------------------------------------------------
const SYN_NAMES = {
    LCK: {
        a: ['Ha', 'Jae', 'Min', 'Seo', 'Do', 'Yu', 'Ki', 'Chan', 'Rae', 'Bo', 'Hyun', 'Tae'],
        b: ['ryu', 'jin', 'seok', 'won', 'hyuk', 'na', 'bin', 'sung', 'wu', 'han'],
    },
    LPL: {
        a: ['Xia', 'Zhu', 'Yun', 'Qin', 'Hao', 'Lei', 'Ming', 'Fei', 'Tian', 'Bo', 'Jun', 'Kai'],
        b: ['xun', 'zhi', 'yao', 'long', 'feng', 'shen', 'wei', 'tao', 'hai', 'ren'],
    },
    LEC: {
        a: ['Nor', 'Vel', 'Kras', 'Mik', 'Ras', 'Tor', 'Lud', 'Sven', 'Bram', 'Cael', 'Dor', 'Fen'],
        b: ['ka', 'vic', 'son', 'borg', 'ard', 'sky', 'mir', 'net', 'lyn', 'dus'],
    },
    LCS: {
        a: ['Ax', 'Bly', 'Cru', 'Dex', 'Flin', 'Grav', 'Hux', 'Jol', 'Kip', 'Mav', 'Nox', 'Quin'],
        b: ['ton', 'ley', 'ard', 'son', 'ix', 'er', 'ford', 'bee', 'man', 'dale'],
    },
    LCP: {
        a: ['Aki', 'Bay', 'Chi', 'Dai', 'Eno', 'Fuji', 'Hiro', 'Kaz', 'Lin', 'Nao', 'Ry', 'Sora'],
        b: ['to', 'ki', 'ra', 'shi', 'mu', 'no', 'ka', 'yu', 'ma', 'sei'],
    },
    CBLOL: {
        a: ['Bru', 'Cai', 'Dav', 'Fel', 'Gui', 'Igo', 'Jhe', 'Luk', 'Mat', 'Ped', 'Raf', 'Thi'],
        b: ['ao', 'inho', 'ito', 'zin', 'ka', 'do', 'ren', 'ski', 'ux', 'oca'],
    },
    ALL: {
        a: ['Solo', 'Duo', 'Smurf', 'Pug', 'Queue', 'Ping', 'Ward', 'Gank', 'Dive', 'Rift', 'Nexus', 'Baron'],
        b: ['god', 'diff', 'main', 'onetrick', 'andy', 'king', 'boy', 'zzz', 'exe', 'ttv'],
    },
};

// Small per-role tilt so a generated roster is not five identical numbers. The
// five values sum to zero, so the roster mean still lands on team.strength.
const SYN_ROLE_TILT = { TOP: -1, JNG: 0, MID: 2, ADC: 1, SUP: -2, COACH: -2 };

// How the six card stats lean off a player's rating, by role. Mirrors the shape
// of real cards in the database (a support's MEC is always well under their
// rating, a coach's MEC is pinned to the low twenties).
const SYN_STAT_TILT = {
    TOP:   { mec: 3, tmf: 1, frm: 0, cmp: 1, map: -2, ldr: -3 },
    JNG:   { mec: -1, tmf: 1, frm: 0, cmp: 0, map: 4, ldr: 2 },
    MID:   { mec: 4, tmf: 1, frm: 1, cmp: 0, map: -1, ldr: -3 },
    ADC:   { mec: 5, tmf: 3, frm: 0, cmp: -1, map: -3, ldr: -5 },
    SUP:   { mec: -7, tmf: 2, frm: 0, cmp: 1, map: 4, ldr: 3 },
    COACH: { mec: 0, tmf: -1, frm: 1, cmp: 0, map: 2, ldr: 3 },
};

function synName(regionId, seed) {
    const pool = SYN_NAMES[regionId] || SYN_NAMES.ALL;
    const rnd = mulberry32(seed);
    const a = pool.a[Math.floor(rnd() * pool.a.length)];
    const b = pool.b[Math.floor(rnd() * pool.b.length)];
    return a + b;
}

function syntheticPlayer(team, role, year, salt = 0) {
    const region = team.region && team.region !== 'ALL' ? team.region : 'ALL';
    const seed = hash32('syn:' + team.id + ':' + role + ':' + year + ':' + salt);
    const rnd = mulberry32(seed);

    const tilt = SYN_ROLE_TILT[role] || 0;
    // +/-3 of spread on top of the org's baseline: enough that a roster has a
    // best and a worst player, not enough to invert the league table.
    const rating = Math.round(clamp(team.strength + tilt + (rnd() - 0.5) * 6, 25, 96));

    const st = SYN_STAT_TILT[role] || SYN_STAT_TILT.MID;
    const stats = {};
    for (const k of ['mec', 'tmf', 'frm', 'cmp', 'map', 'ldr']) {
        stats[k] = Math.round(clamp(rating + st[k] + (rnd() - 0.5) * 5, 15, 99));
    }
    if (role === 'COACH') stats.mec = 20 + Math.round(rnd() * 4);

    return {
        id: -(200000 + (seed % 700000)),
        uniqueId: 'career_ai_' + team.id + '_' + year + '_' + role + (salt ? '_' + salt : ''),
        name: synName(region, seed),
        role,
        team: team.name,
        year,
        rating,
        quality: ratingToQuality(rating),
        region: team.region || 'ALL',
        stats,
        signature: false,
        holographic: false,
        synthetic: true,
    };
}

// ---------------------------------------------------------------------------
//  ROSTER CONSTRUCTION
// ---------------------------------------------------------------------------
const _rosterCache = new Map();     // teamId:year -> roster
const _strengthCache = new Map();   // teamId:year -> integer strength
const _claimCache = new Map();      // region:year -> Set of card ids on a tier-1 roster
const _regionCache = new Map();     // region:role:year -> array of active cards, best first

// A ten-year career touching every region is a few thousand entries. Clearing
// wholesale beats an LRU here because every roster is deterministic and cheap
// to rebuild.
function trimCache(map, limit) {
    if (map.size > limit) map.clear();
}

/** Real cards for an org, active in `year`, best pick per role first. */
function orgCards(team, year) {
    const db = getDB();
    if (!db) return [];
    const aliases = TEAM_ALIASES[team.id];
    if (!aliases || !aliases.length) return [];
    const set = new Set(aliases);
    return db
        .filter(card => set.has(card.team) && cardActiveIn(card, year))
        .sort((a, b) => cardScore(b, year) - cardScore(a, year));
}

/** Alias-only starting five, no fills. Used to work out who is already spoken
 *  for before an academy side goes shopping in the regional pool. */
function orgPicks(team, year) {
    const cards = orgCards(team, year);
    const out = {};
    for (const card of cards) {
        if (out[card.role]) continue;
        if (card.role !== 'COACH' && !ROSTER_SLOTS.includes(card.role)) continue;
        out[card.role] = card;
    }
    return out;
}

/** Every card already locked into a tier-1 seat in this region and year. Stops
 *  a challengers team fielding a starting LCK mid laner as a "best available". */
function claimedIds(regionId, year) {
    const key = regionId + ':' + year;
    const hit = _claimCache.get(key);
    if (hit) return hit;
    const set = new Set();
    for (const team of teamsInRegion(regionId, 1)) {
        const picks = orgPicks(team, year);
        for (const role in picks) set.add(picks[role].id);
    }
    if (getDB()) { _claimCache.set(key, set); trimCache(_claimCache, 200); }
    return set;
}

function regionPool(regionId, role, year) {
    const key = regionId + ':' + role + ':' + year;
    const hit = _regionCache.get(key);
    if (hit) return hit;
    const db = getDB();
    const pool = !db ? [] : db
        .filter(card => card.region === regionId && card.role === role && cardActiveIn(card, year))
        .sort((a, b) => cardScore(b, year) - cardScore(a, year));
    if (db) { _regionCache.set(key, pool); trimCache(_regionCache, 400); }
    return pool;
}

// A club can only sign who it can plausibly attract. "Best available" for a
// 66-strength academy side means the best player who would actually take the
// seat, not the best player in the region -- without this, every empty slot in
// the mode fills with a world-class free agent.
const FILL_HEADROOM = 6;
const FILL_SHORTLIST = 8;

function fillFromRegion(team, role, year, taken) {
    const regionId = team.region && team.region !== 'ALL' ? team.region : null;
    if (!regionId) return null;
    // Tier-1 clubs are excluded from their own fills too. Their picks sit in
    // other roles, so nothing is lost, and it guarantees no player appears on
    // two rosters in the same division.
    const claimed = claimedIds(regionId, year);
    const era = getEra(year);
    const pool = regionPool(regionId, role, year)
        .filter(card => !taken.has(card.id) && !claimed.has(card.id)
            && getEffectiveRating(card) <= team.strength + FILL_HEADROOM);
    if (!pool.length) return null;

    // Prefer the same competitive era when the year window is wide enough to
    // straddle two of them; fall back to the whole pool rather than go blank.
    const sameEra = pool.filter(card => getEra(card.year) === era);
    const short = (sameEra.length ? sameEra : pool).slice(0, FILL_SHORTLIST);
    // Offset by team id so two clubs shopping the same pool land on different
    // names no matter which one is rendered first.
    return short[hash32('fill:' + team.id + ':' + role + ':' + year) % short.length];
}

/**
 * The five starters plus a coach for one org in one season.
 * Real cards first, then a plausible regional signing, then a generated player.
 * Memoised on teamId:year because the club and season screens call this on
 * every render.
 */
export function getTeamRoster(teamId, year) {
    const y = Math.round(Number(year) || DEFAULT_START_YEAR);
    const key = teamId + ':' + y;
    const hit = _rosterCache.get(key);
    if (hit) return hit;

    const team = resolveTeam(teamId);
    if (!team) {
        const blank = {};
        for (const r of ROSTER_SLOTS) blank[r] = null;
        blank.COACH = null;
        return blank;
    }

    const picks = orgPicks(team, y);
    const roster = {};
    const taken = new Set();
    const names = new Set();

    for (const role of ROSTER_SLOTS.concat(['COACH'])) {
        let card = picks[role] || null;
        if (card) taken.add(card.id);
        if (!card) {
            card = fillFromRegion(team, role, y, taken);
            if (card) taken.add(card.id);
        }
        if (!card) {
            // Re-roll a synthetic name that collided with someone already on
            // this roster -- two "Minjin"s in the same five reads as a bug.
            for (let salt = 0; salt < 8; salt++) {
                card = syntheticPlayer(team, role, y, salt);
                if (!names.has(card.name)) break;
            }
        }
        names.add(card.name);
        roster[role] = card;
    }

    // A roster built while window.playerDatabase was still loading would be all
    // synthetic; never cache that or the league stays fake for the session.
    if (getDB()) { _rosterCache.set(key, roster); trimCache(_rosterCache, 600); }
    return roster;
}

/** Mean effective rating of the five starters. Coaches are excluded on purpose:
 *  their card rating measures something else entirely. */
export function rosterAverage(teamId, year) {
    const roster = getTeamRoster(teamId, year);
    let sum = 0, n = 0;
    for (const role of ROSTER_SLOTS) {
        const card = roster[role];
        if (!card) continue;
        sum += getEffectiveRating(card);
        n++;
    }
    if (!n) {
        const team = resolveTeam(teamId);
        return team ? team.strength : 50;
    }
    return sum / n;
}

// ---------------------------------------------------------------------------
//  TEAM LOOKUPS
// ---------------------------------------------------------------------------
export function teamsInRegion(regionId, tier = 1) {
    const t = Math.round(Number(tier)) || 1;
    if (t >= 3) return AMATEUR_TEAMS.map(x => ({ ...x, region: 'ALL' }));
    const league = LEAGUES[regionId];
    if (!league) return [];
    const rows = t === 2 ? league.tier2 : league.tier1;
    return rows.map(x => ({ ...x, region: regionId }));
}

function resolveTeam(teamId) {
    if (!teamId) return null;
    if (typeof teamId === 'object') return teamId;
    return teamById(teamId);
}

/**
 * Every club the player could realistically end up at, with the strength that
 * actually matters (roster-adjusted, not the static table value) so a transfer
 * list sorts by what the team is rather than what it was written down as.
 */
export function allTeamsForPlayer(c) {
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const out = [];
    for (const rid of REGION_IDS) {
        for (const t of teamsInRegion(rid, 1)) out.push(t);
        for (const t of teamsInRegion(rid, 2)) out.push(t);
    }
    // Amateur sides stop being destinations the moment you have a real contract.
    if (!c?.player?.clubId) for (const t of teamsInRegion(null, 3)) out.push(t);

    return out
        .map(t => ({ ...t, baseStrength: t.strength, strength: teamStrength(t, year) }))
        .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
//  TEAM STRENGTH
//  The static table owns the league's pecking order. The roster supplies a
//  correction, but only the part of it the table did not already account for:
//  a club's roster is compared to its division's rosters, and that deviation is
//  measured against the deviation the static table predicted. A club sitting
//  fifth on paper with the second-best roster in the league plays above its
//  written line; a division whose rosters are entirely generated cancels out to
//  exactly the written line, which is what keeps amateur and academy tiers from
//  quietly re-stretching themselves every time this is called.
// ---------------------------------------------------------------------------
const ROSTER_TILT = 0.55;
const ROSTER_TILT_CAP = 7;
const STRENGTH_MIN = 35;
const STRENGTH_MAX = 95;

const _divisionCache = new Map();   // region:tier:year -> { roster, statik }

/** Mean roster rating and mean written strength for one division. */
function divisionMeans(regionId, tier, year) {
    const key = regionId + ':' + tier + ':' + year;
    const hit = _divisionCache.get(key);
    if (hit) return hit;

    const teams = teamsInRegion(regionId, tier);
    if (!teams.length) return { roster: 0, statik: 0, n: 0 };
    let roster = 0, statik = 0;
    for (const t of teams) { roster += rosterAverage(t.id, year); statik += t.strength; }
    const out = { roster: roster / teams.length, statik: statik / teams.length, n: teams.length };
    if (getDB()) { _divisionCache.set(key, out); trimCache(_divisionCache, 200); }
    return out;
}

export function teamStrength(team, year) {
    const t = resolveTeam(team);
    if (!t) return 50;
    // A team object that is not in the static index -- the free-agent stand-in
    // below, or anything another module invents -- has no division to be
    // measured against, so take its strength at face value.
    if (!teamById(t.id)) return Math.round(clamp(t.strength, STRENGTH_MIN, STRENGTH_MAX));

    const y = Math.round(Number(year) || DEFAULT_START_YEAR);
    const key = t.id + ':' + y;
    const hit = _strengthCache.get(key);
    if (hit !== undefined) return hit;

    const div = divisionMeans(t.region, t.tier, y);
    const rosterDev = div.n ? rosterAverage(t.id, y) - div.roster : 0;
    const staticDev = div.n ? t.strength - div.statik : 0;
    const tilt = clamp((rosterDev - staticDev) * ROSTER_TILT, -ROSTER_TILT_CAP, ROSTER_TILT_CAP);

    // Coaching is judged against the club, not against an absolute bar: the
    // signal that matters is "this staff is better than this org deserves".
    // Small on purpose -- a coach is a modifier, not a sixth of the team.
    const coach = getTeamRoster(t.id, y).COACH;
    const coachEdge = coach ? clamp((getEffectiveRating(coach) - t.strength) * 0.12, -3, 3) : 0;

    const v = Math.round(clamp(t.strength + tilt + coachEdge, STRENGTH_MIN, STRENGTH_MAX));
    if (getDB()) { _strengthCache.set(key, v); trimCache(_strengthCache, 600); }
    return v;
}

// One seat out of five is nominally 0.20 of a roster. Nudged to 0.22 because a
// carry player in this game swings games slightly harder than their headcount,
// and multiplied by playChance so a benched signing changes nothing at all.
const SEAT_WEIGHT = 0.22;

export function teamStrengthWithPlayer(c, team) {
    const t = resolveTeam(team);
    if (!t) return 50;
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const base = teamStrength(t, year);

    const role = ROLE_BY_ID[c?.player?.role] ? c.player.role : 'MID';
    const myOVR = calcOVR(c?.player?.attrs, role);
    const roster = getTeamRoster(t.id, year);
    const incumbent = roster[role] ? getEffectiveRating(roster[role]) : base;
    const share = statusInfo(c?.player?.status).playChance;

    const delta = (myOVR - incumbent) * share * SEAT_WEIGHT;
    // ...plus whatever the club itself has done since the season started: who it
    // has signed, and how it is going. Only ever non-zero for the player's own
    // club - see clubStrengthDelta().
    return Math.round(clamp(base + delta + clubStrengthDelta(c, t.id), STRENGTH_MIN, STRENGTH_MAX));
}

// ---------------------------------------------------------------------------
//  THE PLAYER'S OWN CLUB
//  Every other org in the mode is a pure derivation of (teamId, year) out of the
//  card database, memoised in _rosterCache and identical on every page load.
//  That is deliberate and it stays. This section is the one exception: the club
//  the player actually plays for gets a history, because it is the only roster
//  they watch closely enough to notice.
//
//  Two mechanics, both scoped to career.club:
//
//    MOMENTUM  -1..1, written weekly by engine.tickClubMomentum() off the last
//              few results. It shifts every teammate's rating a few points and
//              the club's strength a few more, so a team on a run genuinely is
//              better to play in than the same five names on a slide.
//    CHURN     career.club.roster maps a seat to a replacement card, written by
//              engine.runRosterChurn() in the offseason. An org that has just
//              been beaten all year makes changes; one that won will lose
//              somebody to a bigger cheque.
//
//  NOTHING HERE MUTATES A CACHED CARD. getTeamRoster() hands out the same object
//  instance to Club.svelte, awards.js, match.js and teamStrength(); scaling a
//  teammate by writing card.rating in place would leak into all of them, would
//  not trigger Svelte reactivity, and would compound every time it ran. Every
//  scaled seat below is a fresh shallow copy.
// ---------------------------------------------------------------------------

/** Rating points a teammate moves at full momentum, before their own bias. */
export const SEAT_FORM_SWING = 5;

/** Team-strength points at full momentum. Deliberately smaller than the sum of
 *  the seat swings: momentum is confidence, not a different roster, and this
 *  number feeds back into results that feed back into momentum. */
export const CLUB_MOMENTUM_STRENGTH = 4;

/** How far roster changes may drag a club off its written line, on top of the
 *  ROSTER_TILT the derived roster already applies. */
const CHURN_TILT_CAP = 5;

/** The career's club block, but only when it still describes the club the
 *  player is at. A transfer therefore resets momentum and roster changes with
 *  no hook of any kind: the ids stop matching and the block stops counting. */
export function clubBlock(c) {
    const club = c && c.club;
    const clubId = c && c.player && c.player.clubId;
    if (!clubId || !club || typeof club !== 'object' || Array.isArray(club)) return null;
    if (club.teamId !== clubId) return null;
    return club;
}

/** -1 (falling apart) .. +1 (on a run). 0 when unsigned or freshly signed. */
export function clubMomentum(c) {
    const b = clubBlock(c);
    return b ? clamp(Number(b.momentum) || 0, -1, 1) : 0;
}

/** Per-seat sensitivity, 0.55..1.45, derived from the card rather than stored.
 *  A team on a run should have somebody carrying it and somebody along for the
 *  ride, and that is more interesting than five identical +5s. */
function seatBias(card) {
    const key = String((card && (card.uniqueId || card.name)) || 'seat');
    return 0.55 + (hash32('bias:' + key) % 91) / 100;
}

/** Rating shift on one teammate from the club's current momentum. */
export function teammateFormDelta(c, card) {
    const m = clubMomentum(c);
    if (!m || !card) return 0;
    return Math.round(m * SEAT_FORM_SWING * seatBias(card));
}

/**
 * The player's club roster with signings and form applied, as fresh objects.
 *
 * `quality` is deliberately NOT recomputed from the shifted rating. It is the
 * card's pedigree, not a live readout, and re-deriving it would quietly demote
 * a signature or Hall of Legends card the first time its club had a bad month.
 */
export function clubRosterFor(c) {
    const clubId = c?.player?.clubId;
    const blank = {};
    for (const r of ROSTER_SLOTS) blank[r] = null;
    blank.COACH = null;
    if (!clubId || !teamById(clubId)) return blank;

    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const base = getTeamRoster(clubId, year);
    const b = clubBlock(c);
    const overrides = (b && b.roster && typeof b.roster === 'object') ? b.roster : {};

    // Names are resolved AT THE MERGE, because this is the one roster in the
    // mode that is half persisted and half re-derived every year. getTeamRoster
    // re-rolls a colliding name against the seats IT generated, and knows
    // nothing about a signing stored in the save - so a 2029 signing and a 2033
    // teammate can land on the same person and the board shows them twice.
    //
    // Overrides claim their names first, and ANY colliding derived seat is
    // replaced with a generated player on a salt outside getTeamRoster's own
    // 0..7. Including a real database card: a signing IS a real card most of the
    // time, and the same professional turning up in two seats of one roster is a
    // worse thing to render than an unfamiliar name.
    const team = teamById(clubId);
    const order = ROSTER_SLOTS.concat(['COACH']);
    const used = new Set();
    for (const role of order) {
        const o = overrides[role];
        if (o && typeof o === 'object' && o.name) used.add(String(o.name).toLowerCase());
    }

    const out = {};
    for (const role of order) {
        const signing = overrides[role] && typeof overrides[role] === 'object' ? overrides[role] : null;
        let card = signing || base[role] || null;
        if (!card) { out[role] = null; continue; }

        if (!signing && team && used.has(String(card.name || '').toLowerCase())) {
            for (let salt = 100; salt < 116; salt++) {
                const alt = syntheticPlayer(team, role, year, salt);
                if (!used.has(String(alt.name).toLowerCase())) { card = alt; break; }
            }
        }
        used.add(String(card.name || '').toLowerCase());

        const delta = teammateFormDelta(c, card);
        out[role] = {
            ...card,
            rating: clamp(Math.round((Number(card.rating) || 50) + delta), 25, 99),
            baseRating: Math.round(Number(card.rating) || 50),
            formDelta: delta,
            signing: !!signing,
            signedYear: signing ? Math.round(Number(signing.signedYear) || year) : 0,
        };
    }
    return out;
}

/**
 * How far the player's own club is playing from its written line right now:
 * the seats it has changed, plus momentum. Zero for every other club in the
 * mode, which is what keeps teamStrength() a pure function of (team, year) and
 * the league table stable between page loads.
 */
export function clubStrengthDelta(c, teamId) {
    if (!teamId || c?.player?.clubId !== teamId) return 0;
    const b = clubBlock(c);
    let delta = clubMomentum(c) * CLUB_MOMENTUM_STRENGTH;

    if (b && b.roster && typeof b.roster === 'object') {
        const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
        const base = getTeamRoster(teamId, year);
        let sum = 0;
        let n = 0;
        for (const role of ROSTER_SLOTS) {
            const o = b.roster[role];
            if (!o || typeof o !== 'object') continue;
            const was = base[role] ? getEffectiveRating(base[role]) : null;
            if (was === null) continue;
            sum += getEffectiveRating(o) - was;
            n++;
        }
        // Averaged over the whole five, not over the seats that changed: one
        // upgrade in five seats is one fifth of a roster.
        if (n) delta += clamp((sum / ROSTER_SLOTS.length) * ROSTER_TILT, -CHURN_TILT_CAP, CHURN_TILT_CAP);
    }
    return clamp(delta, -9, 9);
}

/** The club's strength as the player experiences it, without their own seat.
 *  Club.svelte's "you rate N above the roster line" runs on this. */
export function clubStrengthFor(c, team) {
    const t = resolveTeam(team);
    if (!t) return 50;
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    return Math.round(clamp(
        teamStrength(t, year) + clubStrengthDelta(c, t.id),
        STRENGTH_MIN, STRENGTH_MAX,
    ));
}

/**
 * A player the club could plausibly put in one seat, aimed at `targetRating`.
 *
 * Tries the same regional pool the derived rosters are built from first, so a
 * signing is usually a real name, and falls back to a generated player.
 *
 * The synthetic path steers the rating by handing syntheticPlayer() a team
 * object whose `strength` is the target - but syntheticPlayer's `strength` is a
 * ROSTER MEAN, not a seat rating: it adds SYN_ROLE_TILT[role] on top (the five
 * tilts sum to zero so the MEAN lands on the argument). Passing a seat target
 * straight through therefore missed by the tilt every time, and always in the
 * same direction per role - a club replacing its support with an equal support
 * signed one two points worse, forever, while its mid always gained two. The
 * tilt is backed out here so the argument means what this function needs it to.
 *
 * `salt` must differ between two signings made in the same year for the same
 * seat, or they generate the same person.
 *
 * BOTH ids AND names are excluded, and the names matter more. The card database
 * holds several prints of the same professional (BrokenBlade 2024, 2025, 2026),
 * they have different ids, and claimedIds() only ever locks the ONE print
 * currently sitting in a tier-1 seat. Filtering on id alone therefore let a club
 * "replace" a player with a two-year-old card of that same player, which is how
 * the first cut of this read in the news feed.
 */
export function signingFor(team, role, year, targetRating, salt = 0, avoidIds = [], avoidNames = []) {
    const t = resolveTeam(team);
    if (!t) return null;
    const y = Math.round(Number(year) || DEFAULT_START_YEAR);
    const target = clamp(Math.round(Number(targetRating) || 60), 30, 96);
    const avoid = new Set((avoidIds || []).filter(v => v !== null && v !== undefined));
    const banned = new Set((avoidNames || []).filter(Boolean).map(n => String(n).toLowerCase()));

    const regionId = t.region && t.region !== 'ALL' ? t.region : null;
    if (regionId) {
        const claimed = claimedIds(regionId, y);
        const pool = regionPool(regionId, role, y)
            .filter(card => !avoid.has(card.id)
                && !claimed.has(card.id)
                && !banned.has(String(card.name || '').toLowerCase()))
            .map(card => ({ card, gap: Math.abs(getEffectiveRating(card) - target) }))
            .filter(x => x.gap <= 6)
            .sort((a, b) => a.gap - b.gap)
            .slice(0, 5);
        if (pool.length) {
            const pickIdx = hash32('sign:' + t.id + ':' + role + ':' + y + ':' + salt) % pool.length;
            return { ...pool[pickIdx].card, signedYear: y };
        }
    }

    // Generated fallback. Re-rolled up to eight times so the club does not sign
    // a name already in the building - the same guard getTeamRoster() uses.
    const seatTarget = clamp(target - (SYN_ROLE_TILT[role] || 0), 25, 96);
    for (let i = 0; i < 8; i++) {
        const made = syntheticPlayer({ ...t, strength: seatTarget }, role, y, 900 + salt + i * 17);
        if (!banned.has(String(made.name || '').toLowerCase())) return { ...made, signedYear: y };
    }
    return { ...syntheticPlayer({ ...t, strength: seatTarget }, role, y, 900 + salt), signedYear: y };
}

// ---------------------------------------------------------------------------
//  LEAGUE CONTEXT
//  Signed players compete in their club's division. Unsigned players get the
//  amateur circuit with a stand-in team object for themselves, so the season
//  screen renders a real table instead of an empty state.
// ---------------------------------------------------------------------------
function freeAgentTeam(c) {
    const role = ROLE_BY_ID[c?.player?.role] ? c.player.role : 'MID';
    return {
        id: FREE_AGENT_ID,
        name: c?.player?.handle || 'Free Agent',
        tier: 3,
        strength: Math.max(STRENGTH_MIN, calcOVR(c?.player?.attrs, role)),
        accent: '#22c55e',
        region: c?.player?.region || 'LEC',
    };
}

function leagueContext(c) {
    const club = c?.player?.clubId ? teamById(c.player.clubId) : null;
    if (club) {
        const teams = teamsInRegion(club.region, club.tier);
        const me = teams.find(t => t.id === club.id) || club;
        return { me, teams, others: teams.filter(t => t.id !== club.id), tier: club.tier, region: club.region };
    }
    const teams = teamsInRegion(null, 3);
    const me = freeAgentTeam(c);
    return { me, teams: teams.concat([me]), others: teams, tier: 3, region: c?.player?.region || 'LEC' };
}

// ---------------------------------------------------------------------------
//  SCHEDULE
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  THE DIVISION FIXTURE LIST
//
//  There did not used to be one. generateSchedule() built the PLAYER'S rows and
//  every other club's games were invented on the spot by simulateAIWeek(), which
//  drew fresh random pairings each slot, let one club sit out whenever the pool
//  was odd, and ran in all 40 weeks of the year while fixtures existed in only
//  18 of them. The player's own results were never mirrored into the table
//  either. Measured, a 70%-win-rate player reached spring playoff seeding on 18
//  games against AI sides on 23-26, seeded 7th, and missed the cut.
//
//  So the fixture list is now real and shared: one round robin per division per
//  split, the player's schedule is a PROJECTION of it, and the AI week plays the
//  pairs the player is not in.
//
//  It MUST be a pure function of (division, year, split). Anything random here
//  reshuffles the league table between page loads, which is the failure the
//  determinism note at the top of this file exists to prevent.
// ---------------------------------------------------------------------------

/** Circle-method round robin. Returns one entry per ROUND, in round order. */
export function divisionRounds(c) {
    const ctx = leagueContext(c);
    if (!ctx.teams || ctx.teams.length < 2) return [];

    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const split = c?.season?.split === 'summer' ? 'summer' : 'spring';
    const phase = PHASES.find(p => p.id === split) || PHASES[1];
    const startWeek = phase.from;

    // Seeded once per division-season so the fixture order is stable forever but
    // differs between splits.
    const ids = shuffleSeeded(
        ctx.teams.map(t => t.id),
        hash32('rr:' + ctx.region + ':' + ctx.tier + ':' + year + ':' + split),
    );

    // Odd field (the amateur circuit is six sides plus the free agent) gets a
    // bye marker, so every real club still plays the same number of games.
    const BYE = '__bye__';
    const list = ids.slice();
    if (list.length % 2 === 1) list.push(BYE);

    const n = list.length;
    const half = n / 2;
    const rounds = [];
    const legs = 2;                       // home and away

    for (let leg = 0; leg < legs; leg++) {
        // Rotate all but the first entry; standard circle method.
        const order = list.slice();
        for (let r = 0; r < n - 1; r++) {
            const pairs = [];
            let bye = null;
            for (let i = 0; i < half; i++) {
                const a = order[i];
                const b = order[n - 1 - i];
                if (a === BYE) { bye = b; continue; }
                if (b === BYE) { bye = a; continue; }
                // Swap sides on the second leg so home and away are even.
                pairs.push(leg === 0 ? [a, b] : [b, a]);
            }
            const round = leg * (n - 1) + r;
            rounds.push({
                round,
                week: startWeek + Math.floor(round / MATCHES_PER_REG_WEEK),
                slot: round % MATCHES_PER_REG_WEEK,
                pairs,
                bye,
            });
            // rotate: hold index 0, move the rest one step
            order.splice(1, 0, order.pop());
        }
    }
    return rounds;
}

/**
 * The player's own fixture list — a projection of the division round robin, in
 * the exact row shape blankCareer() declares and with the same id format, so
 * nothing downstream that keys on a fixture id has to change.
 */
export function generateSchedule(c) {
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const split = c?.season?.split === 'summer' ? 'summer' : 'spring';
    const ctx = leagueContext(c);
    if (!ctx.others.length) return [];
    const kind = ctx.tier >= 3 ? 'scrim' : 'league';
    const bestOf = regularBestOf(ctx.region, ctx.tier);
    const myId = ctx.me.id;

    const out = [];
    for (const rd of divisionRounds(c)) {
        for (const [a, b] of rd.pairs) {
            if (a !== myId && b !== myId) continue;
            const week = rd.week;
            out.push({
                id: year + '-' + split + '-w' + week + '-g' + (rd.slot + 1),
                week,
                phase: phaseForWeek(week).id,
                opponentId: a === myId ? b : a,
                home: a === myId,
                kind,
                bestOf,
                played: false,
                won: null,
                score: null,
                myRating: null,
            });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
//  STANDINGS
// ---------------------------------------------------------------------------
export function blankStandings(teams) {
    const out = {};
    for (const t of teams || []) {
        const id = typeof t === 'string' ? t : t?.id;
        if (id) out[id] = { w: 0, l: 0 };
    }
    return out;
}

// Elo-shaped, tuned so a 10-point strength gap wins about 75% of the time:
// 10^(10/21) is very close to 3, i.e. three wins for every loss.
const STRENGTH_SCALE = 21;
// Nobody in this league is ever a lock. A 30-point gap still drops one in
// twenty, which is what keeps a bottom side capable of stealing a split.
const UPSET_FLOOR = 0.05;

export function winChance(strengthA, strengthB) {
    return clamp(1 / (1 + Math.pow(10, (strengthB - strengthA) / STRENGTH_SCALE)), UPSET_FLOOR, 1 - UPSET_FLOOR);
}

/**
 * Play the rest of the division's fixtures for THIS WEEK and hand back a new
 * standings object.
 *
 * It now reads the shared round robin rather than inventing pairings, and it
 * plays only the pairs the player is not in — their own result is mirrored into
 * the table by engine.completeMatch() when the match is actually finished.
 *
 * A week with no round is a week with no league games. That single guard is what
 * removes the 22 phantom AI-only weeks a year: this used to be called in all 40
 * weeks of the calendar, including preseason, playoffs, MSI, Worlds and the
 * offseason, while fixtures only ever existed in 18 of them.
 */
export function simulateAIWeek(c) {
    const next = {};
    const prev = c?.season?.standings || {};
    for (const id in prev) next[id] = { w: prev[id].w || 0, l: prev[id].l || 0 };

    const ctx = leagueContext(c);
    if (!ctx.others.length) return next;

    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const week = Math.round(Number(c?.time?.week) || 1);
    for (const t of ctx.teams) if (!next[t.id]) next[t.id] = { w: 0, l: 0 };

    const myId = ctx.me.id;
    const strength = {};
    for (const t of ctx.teams) strength[t.id] = teamStrength(t, year);

    // The division's format, resolved the same way the player's own fixtures are
    // — an AI Bo3 has to be a real Bo3 or the table stops matching the schedule.
    // A series is still one row in the table: `need` wins takes it, and the
    // winner banks a single W exactly as the player does.
    const bestOf = regularBestOf(ctx.region, ctx.tier);
    const need = Math.floor(bestOf / 2) + 1;

    for (const rd of divisionRounds(c)) {
        if (rd.week !== week) continue;
        for (const [a, b] of rd.pairs) {
            if (a === myId || b === myId) continue;   // the player's own game is not simulated here
            if (!next[a] || !next[b]) continue;
            const p = winChance(num(strength[a], 55), num(strength[b], 55));
            let aw = 0, bw = 0;
            while (aw < need && bw < need) {
                if (Math.random() < p) aw++; else bw++;
            }
            const aWins = aw > bw;
            next[aWins ? a : b].w += 1;
            next[aWins ? b : a].l += 1;
        }
    }

    return next;
}

// ---------------------------------------------------------------------------
//  TABLE
// ---------------------------------------------------------------------------
/** Sorted division table including the player's own club. */
export function leagueTable(c) {
    const ctx = leagueContext(c);
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const standings = c?.season?.standings || {};
    const myId = ctx.me.id;

    // The player's own row is counted off the SCHEDULE, not off season.wins.
    // season.wins counts every match the player played — playoff ties, MSI and
    // Worlds included, and MSI is carried into summer — while every other row
    // holds league games only. Reading it here put the player several games
    // ahead of a division that had played the same fixtures, which is the same
    // class of dishonesty as the table not counting the player's games at all.
    const mineRec = (() => {
        const rows = Array.isArray(c?.season?.schedule) ? c.season.schedule : [];
        let w = 0, l = 0;
        for (const f of rows) {
            if (!f || !f.played || f.kind === 'bracket') continue;
            if (f.won) w++; else l++;
        }
        return { w, l };
    })();

    const rows = ctx.teams.map(team => {
        const isMine = team.id === myId;
        const rec = isMine ? mineRec : (standings[team.id] || { w: 0, l: 0 });
        const w = Math.max(0, Math.round(rec.w || 0));
        const l = Math.max(0, Math.round(rec.l || 0));
        const played = w + l;
        return {
            team,
            w, l,
            pts: w * 3,
            gd: w - l,
            rate: played ? w / played : 0,
            isMine,
            rank: 0,
        };
    });

    rows.sort((a, b) => (
        b.w - a.w
        || a.l - b.l
        || b.rate - a.rate
        || b.gd - a.gd
        // Preseason has everyone on 0-0, so fall back to who is actually better
        // rather than letting the table order jump around between renders.
        || teamStrength(b.team, year) - teamStrength(a.team, year)
        || a.team.name.localeCompare(b.team.name)
    ));
    rows.forEach((r, i) => { r.rank = i + 1; delete r.rate; });
    return rows;
}

export function playoffSeeds(c) {
    return leagueTable(c).slice(0, 6).map(r => r.team.id);
}

/** How many league sides make the domestic bracket. */
export const PLAYOFF_SPOTS = 6;

// ---------------------------------------------------------------------------
//  EVENT QUALIFICATION
//  What am I playing for, what do I need, and am I in it right now?
//
//  This used to be two hard-coded chips on the season screen reading
//  "Win the spring split" and "Championship points" -- the second of which was
//  not even the rule (Worlds is top two of the summer bracket; championship
//  points have never gated it). Nothing told the player where they sat in the
//  table, that First Stand existed, that a berth had been banked for NEXT year,
//  or that they were currently IN a tournament.
//
//  It is a pure read over season/flags/table, so a screen can render it and the
//  engine stays the only thing that writes qualification.
// ---------------------------------------------------------------------------

/**
 * Status vocabulary, most-final first: 'won', 'out' (played and eliminated),
 * 'live' (the calendar is inside it and the club is in it), 'in' (qualified,
 * not started), 'chase' (still possible), 'missed', 'locked' (too young).
 */
export function eventQualification(c) {
    const season = (c && c.season) || {};
    const results = season.results || {};
    const qual = season.qualified || {};
    const flags = (c && c.flags) || {};
    const week = Math.round(num(c && c.time && c.time.week, 1));
    const year = Math.round(num(c && c.time && c.time.year, DEFAULT_START_YEAR));
    const age = num(c && c.player && c.player.age, 18);
    const clubId = (c && c.player && c.player.clubId) || null;
    const bracket = season.bracket || null;
    const nowPhase = phaseForWeek(week).id;
    const split = season.split === 'summer' ? 'summer' : 'spring';

    // Where the club actually sits, used for the domestic row's detail line.
    let rank = 0, tableLen = 0;
    if (clubId) {
        const rows = leagueTable(c) || [];
        tableLen = rows.length;
        const i = rows.findIndex(r => r && r.team && r.team.id === clubId);
        rank = i >= 0 ? i + 1 : 0;
    }

    const ordinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const phaseOf = id => PHASES.find(p => p.id === id) || null;

    // A bracket the player is actually IN, as opposed to one running around
    // them: `myPlacement` is only written when it finishes, so mid-tournament
    // the honest test is whether any tie has their club in it.
    const inBracket = (kind) => {
        if (!bracket || bracket.kind !== kind || !clubId) return false;
        for (const r of bracket.rounds || []) {
            for (const t of r.ties || []) {
                if ((t.a && t.a.id === clubId) || (t.b && t.b.id === clubId)) return true;
            }
        }
        return (bracket.byes || []).some(b => b && b.id === clubId);
    };

    const row = (id, name, need) => {
        const ph = phaseOf(id);
        const res = results[id];
        const out = {
            id, name,
            short: ph ? ph.short : '',
            accent: ph ? ph.accent : '#64748b',
            from: ph ? ph.from : 0,
            to: ph ? ph.to : 0,
            weeks: ph ? `Weeks ${ph.from}-${ph.to}` : '',
            status: 'chase',
            detail: need,
            live: false,
        };
        if (res === 'champion') { out.status = 'won'; out.detail = 'Champions.'; return out; }
        if (res) { out.status = 'out'; out.detail = 'Knocked out.'; return out; }
        if (bracket && bracket.kind === id && inBracket(id)) {
            out.status = 'live';
            out.live = nowPhase === id;
            const r = (bracket.rounds || [])[bracket.rounds.length - 1];
            out.detail = r ? `In progress - ${r.name}` : 'In progress';
            return out;
        }
        return out;
    };

    const events = [];

    // --- the domestic bracket, which is the gate for everything else --------
    {
        const kind = split === 'summer' ? 'summer_po' : 'spring_po';
        const r = row(kind, `${split === 'summer' ? 'Summer' : 'Spring'} Playoffs`,
            `Top ${PLAYOFF_SPOTS} of the table`);
        if (r.status === 'chase') {
            if (!clubId) { r.status = 'locked'; r.detail = 'You need a club.'; }
            else if (week > (phaseOf(kind) || {}).to) { r.status = 'missed'; r.detail = 'Over for this year.'; }
            else if (rank && rank <= PLAYOFF_SPOTS) {
                r.status = 'in';
                r.detail = `${ordinal(rank)} of ${tableLen} - inside the cut`;
            } else if (rank) {
                r.detail = `${ordinal(rank)} of ${tableLen} - need top ${PLAYOFF_SPOTS}`;
            }
        }
        events.push(r);
    }

    // --- First Stand: won LAST summer, played THIS February ------------------
    {
        const berth = Math.round(num(flags.firstStandBerth, 0));
        const r = row('first_stand', 'First Stand', 'Win your regional title');
        if (r.status === 'chase') {
            if (berth === year) {
                if (age < MIN_AGE_INTERNATIONAL) {
                    r.status = 'locked';
                    r.detail = `Club qualified - you are ${age}, minimum ${MIN_AGE_INTERNATIONAL}`;
                } else if (week > (phaseOf('first_stand') || {}).to) {
                    r.status = 'missed'; r.detail = 'Over for this year.';
                } else { r.status = 'in'; r.detail = 'Qualified.'; }
            } else if (berth > year) {
                r.status = 'in';
                r.detail = `Berth banked for ${berth}`;
            } else if (week > (phaseOf('first_stand') || {}).to) {
                r.detail = 'Win the summer title for next February';
            }
        }
        events.push(r);
    }

    // --- MSI: spring champions ----------------------------------------------
    {
        const r = row('msi', 'Mid-Season Invitational', 'Win the spring playoffs');
        if (r.status === 'chase') {
            if (qual.msi) {
                r.status = age < MIN_AGE_INTERNATIONAL ? 'locked' : 'in';
                r.detail = age < MIN_AGE_INTERNATIONAL
                    ? `Club qualified - you are ${age}, minimum ${MIN_AGE_INTERNATIONAL}`
                    : 'Qualified.';
            } else if (week > (phaseOf('msi') || {}).to) {
                r.status = 'missed'; r.detail = 'Over for this year.';
            }
        }
        events.push(r);
    }

    // --- Worlds: top two of the summer bracket -------------------------------
    {
        const r = row('worlds', 'World Championship', 'Reach the summer final');
        if (r.status === 'chase') {
            if (qual.worlds) {
                r.status = age < MIN_AGE_INTERNATIONAL ? 'locked' : 'in';
                r.detail = age < MIN_AGE_INTERNATIONAL
                    ? `Club qualified - you are ${age}, minimum ${MIN_AGE_INTERNATIONAL}`
                    : 'Qualified.';
            } else if (week > (phaseOf('worlds') || {}).to) {
                r.status = 'missed'; r.detail = 'Over for this year.';
            }
        }
        events.push(r);
    }

    return events;
}

/**
 * The one-line "you are at a tournament right now" banner, or null. Reads the
 * live bracket rather than the calendar, so a player whose club did not qualify
 * is not told they are at Worlds.
 */
export function tournamentNow(c) {
    const season = (c && c.season) || {};
    const b = season.bracket;
    const clubId = (c && c.player && c.player.clubId) || null;
    if (!b || !clubId) return null;
    const week = Math.round(num(c && c.time && c.time.week, 1));
    if (b.kind !== phaseForWeek(week).id) return null;

    const rounds = Array.isArray(b.rounds) ? b.rounds : [];
    const current = rounds[rounds.length - 1] || null;
    let tie = null;
    for (const r of rounds) {
        for (const t of r.ties || []) {
            if ((t.a && t.a.id === clubId) || (t.b && t.b.id === clubId)) tie = { t, r };
        }
    }
    const onBye = !tie && (b.byes || []).some(x => x && x.id === clubId);
    if (!tie && !onBye) return null;

    const ph = PHASES.find(p => p.id === b.kind) || null;
    const opp = tie
        ? (tie.t.a && tie.t.a.id === clubId ? tie.t.b : tie.t.a)
        : null;
    return {
        kind: b.kind,
        title: b.title || (ph ? ph.name : 'Tournament'),
        accent: ph ? ph.accent : '#eab308',
        round: (tie ? tie.r.name : (current ? current.name : '')) || '',
        // Which game of the tournament this is, so "Semifinals" has a scale.
        roundIndex: tie ? rounds.indexOf(tie.r) + 1 : rounds.length,
        totalRounds: Math.max(rounds.length, Math.round(num(b.totalRounds, rounds.length))),
        opponent: opp ? opp.name : (onBye ? 'Bye' : 'TBD'),
        opponentAccent: opp ? opp.accent : '#475569',
        bestOf: Math.max(1, Math.round(num(b.bestOf, 5))),
        done: !!b.done,
        placement: b.done ? (Math.round(num(b.myPlacement, 0)) || null) : null,
        week,
        lastWeek: ph ? ph.to : week,
    };
}

/**
 * The club the season is really about. Closest in strength to the player's own
 * side -- a rivalry needs both teams to think they should be winning -- picked
 * from a shortlist of three by a hash of the two ids and the year, so it is
 * fixed for the whole season but not the same club every year.
 */
export function rivalFor(c) {
    const ctx = leagueContext(c);
    if (!ctx.others.length) return null;
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const mine = teamStrength(ctx.me, year);

    const ranked = ctx.others
        .map(t => ({ t, gap: Math.abs(teamStrength(t, year) - mine) }))
        .sort((a, b) => a.gap - b.gap || a.t.id.localeCompare(b.t.id));

    const shortlist = ranked.slice(0, Math.min(3, ranked.length));
    return shortlist[hash32('rival:' + ctx.me.id + ':' + year) % shortlist.length].t;
}

// ---------------------------------------------------------------------------
//  TEAMMATES
// ---------------------------------------------------------------------------
/**
 * The four other seats and the coach at the player's current club.
 *
 * Reads clubRosterFor(), so every consumer - the Club screen's five, the MVP
 * roll in match.js - sees the same signings and the same form swing. The cards
 * are copies; nothing downstream may write to them.
 */
export function teammatesOf(c) {
    const clubId = c?.player?.clubId;
    if (!clubId) return { starters: [], coach: null, all: [] };
    const team = teamById(clubId);
    if (!team) return { starters: [], coach: null, all: [] };

    const roster = clubRosterFor(c);
    const myRole = ROLE_BY_ID[c?.player?.role] ? c.player.role : 'MID';

    const starters = ROSTER_SLOTS
        .filter(r => r !== myRole)
        .map(r => roster[r])
        .filter(Boolean);
    const coach = roster.COACH || null;

    return { starters, coach, all: coach ? starters.concat([coach]) : starters.slice() };
}

// ---------------------------------------------------------------------------
//  FLAVOUR
// ---------------------------------------------------------------------------
export function describeTeam(team) {
    const t = resolveTeam(team);
    if (!t) return 'An unknown organisation.';

    const region = REGION_BY_ID[t.region];
    const league = region ? region.league : 'open circuit';
    const s = t.strength || 50;

    if (t.tier === 3) {
        if (s >= 54) return t.name + ' clear open qualifiers for fun and are one good split from a real contract.';
        if (s >= 46) return t.name + ' are a serious amateur stack: organised, drilled, and hungry for a scout.';
        return t.name + ' are five people who queued together and never stopped.';
    }

    if (t.tier === 2) {
        const tierName = CLUB_TIERS[2].name.toLowerCase();
        if (s >= 66) return t.name + ' are the strongest ' + tierName + ' side in the ' + league + ' pipeline - promotions come out of this room.';
        if (s >= 58) return t.name + ' are a mid-table ' + league + ' ' + tierName + ' team: a shop window, not a destination.';
        return t.name + ' sit at the bottom of the ' + league + ' ' + tierName + ' bracket, developing players nobody has heard of yet.';
    }

    if (s >= 85) return t.name + ' are ' + league + ' title contenders who treat anything short of Worlds as a failed year.';
    if (s >= 78) return t.name + ' are an established ' + league + ' side with playoff expectations and no patience for a slow start.';
    if (s >= 70) return t.name + ' are comfortably mid-table in the ' + league + ': professional, funded, and quietly forgettable.';
    return t.name + ' are fighting relegation talk in the ' + league + ', where seats open up because results never do.';
}

/** Drop every memo. Called when a career is reset or the card database swaps. */
export function clearTeamCaches() {
    _rosterCache.clear();
    _strengthCache.clear();
    _claimCache.clear();
    _regionCache.clear();
    _divisionCache.clear();
}
