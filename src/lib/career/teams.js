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
    MATCHES_PER_REG_WEEK, REG_SPLIT_WEEKS, DEFAULT_START_YEAR,
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
};

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
    return Math.round(clamp(base + delta, STRENGTH_MIN, STRENGTH_MAX));
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
const SPLIT_FIXTURES = REG_SPLIT_WEEKS * MATCHES_PER_REG_WEEK;   // 18 per split

/**
 * The whole fixture list for the current split, in the shape blankCareer()
 * declares. A tier-1 division is nine other clubs across eighteen games, which
 * is a clean double round robin; smaller divisions and the six-team amateur
 * circuit keep cycling extra legs until the calendar is full.
 */
export function generateSchedule(c) {
    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const split = c?.season?.split === 'summer' ? 'summer' : 'spring';
    const phase = PHASES.find(p => p.id === split) || PHASES[1];
    const startWeek = phase.from;

    const ctx = leagueContext(c);
    if (!ctx.others.length) return [];
    const kind = ctx.tier >= 3 ? 'scrim' : 'league';

    const slots = [];
    for (let leg = 0; slots.length < SPLIT_FIXTURES && leg < 12; leg++) {
        const order = shuffleSeeded(ctx.others, hash32('leg:' + ctx.me.id + ':' + year + ':' + split + ':' + leg));
        for (const t of order) {
            if (slots.length >= SPLIT_FIXTURES) break;
            // Alternate the home leg so the fixture list is never lopsided.
            slots.push({ opponentId: t.id, home: leg % 2 === 0 });
        }
    }

    dedupeWeeks(slots);

    return slots.map((s, i) => {
        const week = startWeek + Math.floor(i / MATCHES_PER_REG_WEEK);
        return {
            id: year + '-' + split + '-w' + week + '-g' + ((i % MATCHES_PER_REG_WEEK) + 1),
            week,
            phase: phaseForWeek(week).id,
            opponentId: s.opponentId,
            home: s.home,
            kind,
            played: false,
            won: null,
            score: null,
            myRating: null,
        };
    });
}

/** Playing the same club twice inside one week reads as a scheduling bug, so
 *  swap the duplicate out for the first later fixture that does not collide. */
function dedupeWeeks(slots) {
    for (let a = 0; a < slots.length; a += MATCHES_PER_REG_WEEK) {
        const end = Math.min(a + MATCHES_PER_REG_WEEK, slots.length);
        for (let i = a + 1; i < end; i++) {
            let clash = false;
            for (let j = a; j < i; j++) if (slots[j].opponentId === slots[i].opponentId) clash = true;
            if (!clash) continue;
            for (let k = end; k < slots.length; k++) {
                let ok = true;
                for (let j = a; j < end; j++) if (j !== i && slots[j].opponentId === slots[k].opponentId) ok = false;
                if (!ok) continue;
                const tmp = slots[i]; slots[i] = slots[k]; slots[k] = tmp;
                break;
            }
        }
    }
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
 * Play out the rest of the division for the current week and hand back a new
 * standings object. The player's own fixtures are left alone -- the match engine
 * records those, including the mirror result for whoever they beat.
 *
 * Pairings are drawn fresh each game slot rather than following a fixed round
 * robin. Every AI club still ends the split on exactly the same number of games
 * as the player, which is all the table needs to be fair.
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

    const mine = (c?.season?.schedule || []).filter(f => f.week === week);
    const strength = {};
    for (const t of ctx.others) strength[t.id] = teamStrength(t, year);

    for (let slot = 0; slot < MATCHES_PER_REG_WEEK; slot++) {
        const fixture = mine[slot];
        const busy = new Set(fixture ? [fixture.opponentId] : []);
        const pool = ctx.others.filter(t => !busy.has(t.id));
        const order = shuffleSeeded(pool, hash32('ai:' + ctx.me.id + ':' + year + ':' + week + ':' + slot));

        // An odd pool means one club sits the slot out; over a nine-week split
        // that costs at most a game or two and never the same club twice.
        for (let i = 0; i + 1 < order.length; i += 2) {
            const a = order[i], b = order[i + 1];
            const aWins = Math.random() < winChance(strength[a.id], strength[b.id]);
            const win = aWins ? a : b;
            const lose = aWins ? b : a;
            next[win.id].w += 1;
            next[lose.id].l += 1;
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

    const rows = ctx.teams.map(team => {
        const isMine = team.id === myId;
        const rec = isMine
            ? { w: c?.season?.wins || 0, l: c?.season?.losses || 0 }
            : (standings[team.id] || { w: 0, l: 0 });
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
/** The four other seats and the coach at the player's current club. */
export function teammatesOf(c) {
    const clubId = c?.player?.clubId;
    if (!clubId) return { starters: [], coach: null, all: [] };
    const team = teamById(clubId);
    if (!team) return { starters: [], coach: null, all: [] };

    const year = Math.round(Number(c?.time?.year) || DEFAULT_START_YEAR);
    const roster = getTeamRoster(clubId, year);
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
