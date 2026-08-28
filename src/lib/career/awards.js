// ===========================================================================
//  LoL ULTIMATE CAREER -- awards, milestones, legacy and retirement
// ===========================================================================
//  This is the module that answers "did any of that matter?". Everything here
//  either reads the career and produces a verdict (endOfSplitAwards,
//  checkMilestones, legacyScore, careerSummary) or writes the verdict back
//  into the store (grantAwards, grantMilestones, retire).
//
//  Two different currencies share the word "legacy" and they are NOT the same
//  thing:
//    * award.legacyPoints  -> spendable meta currency, goes through grantLegacy()
//                             and is burned on perks in the shop.
//    * legacyScore(c)      -> an unspendable career score used only for ranking
//                             the player against history. Its weights live in
//                             LEGACY_WEIGHTS below.
//
//  Emoji are \u escapes on purpose; this repo has been corrupted by encoding
//  round-trips before.

import {
    teamById, ROLE_BY_ID, PHASES, REG_SPLIT_WEEKS, MATCHES_PER_REG_WEEK,
    ATTR_KEYS, ATTR_MAX, RETIREMENT_AGE_MIN, RETIREMENT_AGE_FORCED,
} from './constants.js';
import {
    calcOVR, rankFromMMR, fmtGold, fmtFollowers, fmtKDA, ordinal, ovrLabel,
    clamp,
} from './ratings.js';
import { leagueTable, getTeamRoster, rosterAverage } from './teams.js';
// economy.js imports nothing from here, so this direction is safe.
import { monumentScore } from './economy.js';
import {
    career, addNews, addAward, addTrophy, grantLegacy, grantGold, saveCareer,
} from '../stores/career.js';
import { TIER_COLORS, getEffectiveRating } from '../utils/cards.js';
import { showToast } from '../stores/toasts.js';
import { playSound } from '../utils/sound.js';

// ---------------------------------------------------------------------------
//  SMALL HELPERS
// ---------------------------------------------------------------------------
function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

/** Synchronous read of the store without importing `get` from svelte/store --
 *  this module is restricted to career-local imports. subscribe() fires
 *  immediately with the current value, so the unsubscribe on the next line
 *  makes this a plain read. */
function snapshot() {
    let out = null;
    const un = career.subscribe(v => { out = v; });
    un();
    return out;
}

/** FNV-1a. Used to give every simulated league peer a stable performance
 *  wobble: All-Pro voting must return the same answer if a screen recomputes
 *  it, so Math.random() is not an option here. */
function hash32(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Stable pseudo-random in [-1, 1) for a seed string. */
function jitter(seed) {
    return (hash32(seed) % 2000) / 1000 - 1;
}

// ---------------------------------------------------------------------------
//  teams.js BRIDGES
//  teams.js hands back its own shapes: leagueTable(career) returns rows of
//  { team, w, l, rank, isMine }, and getTeamRoster(teamId, year) returns a
//  role-keyed object of cards, not an array. Everything below normalises those
//  and falls back to the static league strengths in constants.js, because
//  awards must never be the reason a season fails to roll over.
// ---------------------------------------------------------------------------
function asRows(t) {
    if (Array.isArray(t)) return t;
    if (t && Array.isArray(t.rows)) return t.rows;
    if (t && Array.isArray(t.table)) return t.table;
    if (t && Array.isArray(t.standings)) return t.standings;
    return null;
}

function resolveTable(c, table) {
    const given = asRows(table);
    if (given && given.length) return given;
    // The caller normally passes the table it already built for the split
    // summary; rebuilding it is only the fallback.
    try {
        const rows = asRows(leagueTable(c));
        if (rows && rows.length) return rows;
    } catch (e) { /* an unsigned player has no league -- no table, no awards */ }
    return [];
}

function rowTeamId(row) {
    if (!row) return null;
    return row.teamId ?? row.id ?? (row.team && row.team.id) ?? (typeof row.team === 'string' ? row.team : null);
}

function rowPlace(row, index) {
    return Math.round(num(row?.rank ?? row?.place ?? row?.placement ?? row?.position, index + 1));
}

/** 1-based finish, or 0 when the team is not in the table at all. */
function placementFor(rows, teamId) {
    if (!Array.isArray(rows) || !teamId) return 0;
    for (let i = 0; i < rows.length; i++) {
        if (rowTeamId(rows[i]) === teamId) return rowPlace(rows[i], i);
    }
    return 0;
}

function entryRole(p) {
    return p?.role ?? p?.roleId ?? p?.position ?? null;
}

function entryRating(p) {
    if (!p) return NaN;
    const direct = p.ovr ?? p.rating ?? p.overall;
    if (Number.isFinite(Number(direct))) return Number(direct);
    const eff = getEffectiveRating(p);
    return Number.isFinite(eff) ? eff : NaN;
}

/** Normalise a roster into [{ role, rating }] regardless of which shape came
 *  back: teams.js uses { TOP: card, JNG: card, ... }, but an array of players
 *  is the other obvious shape and costs nothing to accept. */
function safeRoster(teamId, year) {
    let r = null;
    try { r = getTeamRoster(teamId, year); } catch (e) { return []; }
    if (!r) return [];

    const src = Array.isArray(r) ? r
        : Array.isArray(r.players) ? r.players
        : Array.isArray(r.roster) ? r.roster
        : null;
    if (src) {
        return src.filter(Boolean).map(p => ({ role: entryRole(p), rating: entryRating(p) }));
    }

    const out = [];
    for (const key of Object.keys(r)) {
        const card = r[key];
        if (!card || typeof card !== 'object') continue;
        out.push({ role: entryRole(card) || key, rating: entryRating(card) });
    }
    return out;
}

function safeRosterAverage(teamId, year, roster) {
    // teams.js takes (teamId, year); an array-taking implementation is tried
    // second so neither contract can silently return a garbage constant.
    try {
        const v = rosterAverage(teamId, year);
        if (Number.isFinite(v) && v > 0) return v;
    } catch (e) { /* fall through */ }
    if (Array.isArray(roster) && roster.length) {
        try {
            const v = rosterAverage(roster);
            if (Number.isFinite(v) && v > 0) return v;
        } catch (e) { /* fall through */ }
        const nums = roster.map(p => p.rating).filter(n => Number.isFinite(n) && n > 0);
        if (nums.length) return nums.reduce((s, n) => s + n, 0) / nums.length;
    }
    const t = teamById(teamId);
    return t ? num(t.strength, 70) : 70;
}

/**
 * What the starter at `roleId` for `teamId` is worth. With no roster data (or
 * no card database loaded) this degrades to the team's baseline strength with
 * a small stable per-role offset, which is close enough for All-Pro voting.
 */
function peerRatingAt(teamId, roleId, year) {
    const roster = safeRoster(teamId, year);
    for (const p of roster) {
        if (p.role === roleId && Number.isFinite(p.rating) && p.rating > 0) return p.rating;
    }
    const avg = safeRosterAverage(teamId, year, roster);
    return avg + jitter(`peer:${teamId}:${roleId}`) * 2.5;
}

// ---------------------------------------------------------------------------
//  AWARD DEFINITIONS
//  `legacyPoints` is spendable currency, so the scale is deliberately tight:
//  a minor award is a couple of shop consumables, a World Championship is a
//  perk unlock on its own. `once` awards can only ever be won a single time in
//  a career; `perYear` awards once per calendar year.
// ---------------------------------------------------------------------------
export const AWARD_DEFS = [
    {
        id: 'rookie_split', name: 'Rookie of the Split', icon: '\u{1F195}',
        tier: 'major', legacyPoints: 30, once: true,
        desc: 'Best first-year player in the league. You only get one shot at this one.',
    },
    {
        id: 'allpro_1', name: 'All-Pro First Team', icon: '\u{1F947}',
        tier: 'major', legacyPoints: 25,
        desc: 'Voted the best player at your role in the league this split.',
    },
    {
        id: 'allpro_2', name: 'All-Pro Second Team', icon: '\u{1F948}',
        tier: 'major', legacyPoints: 15,
        desc: 'Second-best at your role. Close enough that people argued about it.',
    },
    {
        id: 'allpro_3', name: 'All-Pro Third Team', icon: '\u{1F949}',
        tier: 'minor', legacyPoints: 8,
        desc: 'Third at your role. A season everyone agrees was solid.',
    },
    {
        id: 'split_mvp', name: 'Split MVP', icon: '\u{1F31F}',
        tier: 'major', legacyPoints: 45,
        desc: 'The best player in the league across every role, regular season.',
    },
    {
        id: 'finals_mvp', name: 'Finals MVP', icon: '\u{1F396}',
        tier: 'major', legacyPoints: 35,
        desc: 'You were the reason the trophy went the way it did.',
    },
    {
        id: 'regional_champ', name: 'Regional Champion', icon: '\u{1F3C6}',
        tier: 'major', legacyPoints: 60,
        desc: 'Won your league. The banner goes up whether you play again or not.',
    },
    {
        id: 'domestic_double', name: 'Domestic Double', icon: '\u{1F4AB}',
        tier: 'major', legacyPoints: 45, perYear: true,
        desc: 'Spring and summer in the same year. Nobody else got a turn.',
    },
    {
        id: 'msi_champ', name: 'MSI Champion', icon: '\u{1F30D}',
        tier: 'legendary', legacyPoints: 150,
        desc: 'Mid-Season Invitational. The first proof that your region travels.',
    },
    {
        id: 'worlds_finalist', name: 'Worlds Finalist', icon: '\u{1F3DF}',
        tier: 'major', legacyPoints: 120,
        desc: 'You reached the last stage of the year and came second on it.',
    },
    {
        id: 'worlds_champ', name: 'World Champion', icon: '\u{1F451}',
        tier: 'legendary', legacyPoints: 400,
        desc: 'The Summoner\'s Cup. Everything before this was a rehearsal.',
    },
    {
        id: 'golden_road', name: 'Golden Road', icon: '\u{1F308}',
        tier: 'legendary', legacyPoints: 500, once: true,
        desc: 'Spring, MSI, summer and Worlds in a single calendar year. Almost nobody does this.',
    },
    {
        id: 'most_improved', name: 'Most Improved', icon: '\u{1F4C8}',
        tier: 'minor', legacyPoints: 10,
        desc: 'A clear step up on everything you had done before.',
    },
    {
        id: 'poty', name: 'Player of the Year', icon: '\u{1F3C5}',
        tier: 'legendary', legacyPoints: 120, perYear: true,
        desc: 'The whole year, not one split. Awarded once, at the end of summer.',
    },
    {
        id: 'kills_1000', name: '1000 Career Kills', icon: '\u{2694}',
        tier: 'major', legacyPoints: 20, once: true,
        desc: 'A thousand kills on the professional stage. Takes years.',
    },
    {
        id: 'iron_man', name: 'Iron Man', icon: '\u{1F9BE}',
        tier: 'minor', legacyPoints: 12,
        desc: 'Started every single game of the split. No rest, no sub, no excuses.',
    },
    {
        id: 'comeback', name: 'Comeback Player', icon: '\u{1F504}',
        tier: 'minor', legacyPoints: 12,
        desc: 'Written off after last split, and then not.',
    },
    {
        id: 'hall_of_legends', name: 'Hall of Legends', icon: '\u{1F3DB}',
        tier: 'legendary', legacyPoints: 750, once: true,
        desc: 'Inducted on retirement. The last thing your name is ever attached to.',
    },
];

export const AWARD_BY_ID = AWARD_DEFS.reduce((m, a) => { m[a.id] = a; return m; }, {});

const SPLIT_NAME = { spring: 'Spring', summer: 'Summer' };

// Which schedule phases belong to which split. Used for Iron Man and for
// reading the right bracket at the right time of year.
const SPLIT_PHASES = {
    spring: { reg: 'spring', po: 'spring_po', intl: 'msi' },
    summer: { reg: 'summer', po: 'summer_po', intl: 'worlds' },
};

// ---------------------------------------------------------------------------
//  MILESTONES
//  Lifetime, one-off, and checked after every week. Gold rewards are sized so
//  the early ones matter to an unsigned teenager (a 500g milestone is a real
//  gear upgrade at that point) and the late ones are ceremonial.
// ---------------------------------------------------------------------------
export const MILESTONES = [
    {
        id: 'ms_first_win', name: 'First Professional Win', icon: '\u{1F3AE}',
        legacyPoints: 5, gold: 500,
        desc: 'Win a game under contract.',
        check: c => !!c.flags?.everSigned && num(c.totals?.wins) >= 1,
    },
    {
        id: 'ms_first_start', name: 'Main-League Debut', icon: '\u{1F3DF}',
        legacyPoints: 15, gold: 2000,
        desc: 'Start a game for a tier-one org.',
        check: c => num(c.player?.clubTier) === 1 && num(c.totals?.games) >= 1,
    },
    {
        id: 'ms_100_games', name: '100 Games Played', icon: '\u{1F4C5}',
        legacyPoints: 10, gold: 1500,
        desc: 'One hundred professional games.',
        check: c => num(c.totals?.games) >= 100,
    },
    {
        id: 'ms_500_games', name: '500 Games Played', icon: '\u{1F5FF}',
        legacyPoints: 40, gold: 8000,
        desc: 'Five hundred games. A decade of showing up.',
        check: c => num(c.totals?.games) >= 500,
    },
    {
        id: 'ms_1000_games', name: '1000 Games Played', icon: '\u{267E}',
        legacyPoints: 90, gold: 25000,
        desc: 'A thousand games. Very few names ever get here.',
        check: c => num(c.totals?.games) >= 1000,
    },
    {
        id: 'ms_1000_kills', name: '1000 Career Kills', icon: '\u{2694}',
        legacyPoints: 25, gold: 5000,
        desc: 'A thousand kills across your career.',
        check: c => num(c.totals?.kills) >= 1000,
    },
    {
        id: 'ms_kda_10', name: 'A 10.0 KDA Split', icon: '\u{1F4CA}',
        legacyPoints: 30, gold: 6000,
        desc: 'Finish a split with a KDA of 10 or better.',
        check: c => {
            const k = splitKDA(c);
            return k.games >= 10 && k.ratio >= 10;
        },
    },
    {
        id: 'ms_challenger', name: 'Challenger Ladder', icon: '\u{1F53A}',
        legacyPoints: 20, gold: 4000,
        desc: 'Reach Challenger in solo queue.',
        check: c => rankFromMMR(num(c.soloq?.peakMMR)).tierId === 'CHALLENGER',
    },
    {
        id: 'ms_ovr_90', name: '90 Overall', icon: '\u{1F48E}',
        legacyPoints: 50, gold: 12000,
        desc: 'Reach a 90 overall rating.',
        check: c => calcOVR(c.player?.attrs, c.player?.role) >= 90,
    },
    {
        id: 'ms_attr_99', name: 'Perfected an Attribute', icon: '\u{1F3AF}',
        legacyPoints: 45, gold: 10000,
        desc: 'Push any single attribute to 99.',
        check: c => ATTR_KEYS.some(k => num(c.player?.attrs?.[k]) >= ATTR_MAX),
    },
    {
        id: 'ms_million_followers', name: 'One Million Followers', icon: '\u{1F4F1}',
        legacyPoints: 25, gold: 15000,
        desc: 'A million people follow you.',
        check: c => num(c.money?.followers) >= 1000000,
    },
    {
        id: 'ms_five_straight', name: 'Five Straight Wins', icon: '\u{1F525}',
        legacyPoints: 8, gold: 1200,
        desc: 'Win five games in a row.',
        check: c => winStreak(c) >= 5,
    },
    {
        id: 'ms_undefeated', name: 'Undefeated Split', icon: '\u{1F3F4}',
        legacyPoints: 60, gold: 18000,
        desc: 'Go through a full regular season without dropping a game.',
        check: c => undefeatedSplit(c),
    },
    {
        id: 'ms_three_orgs', name: 'Titles With Three Orgs', icon: '\u{1F504}',
        legacyPoints: 70, gold: 20000,
        desc: 'Win a title for three different organisations.',
        check: c => titleWinningOrgs(c).length >= 3,
    },
    {
        id: 'ms_all_regions', name: 'Played All Five Regions', icon: '\u{1F30F}',
        legacyPoints: 60, gold: 16000,
        desc: 'Take a contract in every major region.',
        check: c => regionsPlayed(c).length >= 5,
    },
    {
        id: 'ms_millionaire', name: 'A Million in the Bank', icon: '\u{1F4B0}',
        legacyPoints: 15, gold: 0,
        desc: 'Hold a million gold at once. The reward is the money.',
        check: c => num(c.money?.gold) >= 1000000,
    },
    {
        id: 'ms_pentakill', name: 'First Pentakill', icon: '\u{1F5E1}',
        legacyPoints: 12, gold: 2500,
        desc: 'Take all five on a professional stage.',
        check: c => num(c.totals?.pentakills) >= 1,
    },
    {
        id: 'ms_50_mvps', name: '50 Match MVPs', icon: '\u{1F31F}',
        legacyPoints: 50, gold: 14000,
        desc: 'Fifty player-of-the-match awards.',
        check: c => num(c.totals?.mvps) >= 50,
    },
];

export const MILESTONE_BY_ID = MILESTONES.reduce((m, x) => { m[x.id] = x; return m; }, {});

// ---------------------------------------------------------------------------
//  SPLIT READERS
//  Everything below reads whatever the engine happens to have written. The
//  engine owns season.schedule and season.bracket, so these are all tolerant:
//  a missing field means "no evidence", never a crash.
// ---------------------------------------------------------------------------

/** Mean 0-10 match rating for the current split. 0 when nothing was played. */
export function splitAverageRating(c) {
    const st = c || snapshot();
    const rows = Array.isArray(st?.season?.schedule) ? st.season.schedule : [];
    let sum = 0, n = 0;
    for (const g of rows) {
        const r = Number(g?.myRating);
        if (Number.isFinite(r)) { sum += r; n++; }
    }
    return n ? Math.round((sum / n) * 100) / 100 : 0;
}

/** Games the player personally appeared in this split. */
export function splitGamesPlayed(c) {
    const rows = Array.isArray(c?.season?.schedule) ? c.season.schedule : [];
    return rows.filter(g => g && g.played && Number.isFinite(Number(g.myRating))).length;
}

/** Match MVPs this split. The engine may total them on the season or tag the
 *  individual schedule rows; both are accepted. */
export function splitMVPs(c) {
    const direct = Number(c?.season?.mvps);
    if (Number.isFinite(direct)) return direct;
    const rows = Array.isArray(c?.season?.schedule) ? c.season.schedule : [];
    return rows.filter(g => g && (g.mvp === true || g.myMVP === true)).length;
}

/** Kills/deaths/assists for the split, with a lifetime fallback so the 10-KDA
 *  milestone is still reachable if the engine only keeps career totals. */
export function splitKDA(c) {
    const s = c?.season || {};
    let k = Number(s.kills), d = Number(s.deaths), a = Number(s.assists);
    let games = splitGamesPlayed(c);

    if (!Number.isFinite(k)) {
        // Sum from the schedule rows if they carry per-game lines.
        const rows = Array.isArray(s.schedule) ? s.schedule : [];
        let hit = false;
        k = 0; d = 0; a = 0;
        for (const g of rows) {
            const gk = Number(g?.myK ?? g?.kills), gd = Number(g?.myD ?? g?.deaths), ga = Number(g?.myA ?? g?.assists);
            if (Number.isFinite(gk)) { k += gk; d += num(gd); a += num(ga); hit = true; }
        }
        if (!hit) {
            k = num(c?.totals?.kills); d = num(c?.totals?.deaths); a = num(c?.totals?.assists);
            games = num(c?.totals?.games);
        }
    }
    const f = fmtKDA(k, d, a);
    return { kills: num(k), deaths: num(d), assists: num(a), ratio: f.ratio, line: f.line, games };
}

/** Current win streak, from the schedule tail (the engine may also keep it on
 *  totals as a running counter). */
export function winStreak(c) {
    const direct = Number(c?.totals?.streak ?? c?.season?.streak);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const rows = (Array.isArray(c?.season?.schedule) ? c.season.schedule : []).filter(g => g && g.played);
    let n = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].won) n++;
        else break;
    }
    return n;
}

/** Regular-season rows for a split, phase-tagged where possible and falling
 *  back to the calendar weeks the phase occupies. */
function regularSeasonRows(c, splitId) {
    const phaseId = (SPLIT_PHASES[splitId] || SPLIT_PHASES.spring).reg;
    const rows = Array.isArray(c?.season?.schedule) ? c.season.schedule : [];
    const tagged = rows.filter(g => g && g.phase === phaseId);
    if (tagged.length) return tagged;
    const phase = PHASES.find(p => p.id === phaseId);
    if (!phase) return rows;
    return rows.filter(g => {
        const w = num(g?.week, -1);
        return w >= phase.from && w <= phase.to;
    });
}

function undefeatedSplit(c) {
    const rows = regularSeasonRows(c, c?.season?.split || 'spring').filter(g => g.played);
    // A full regular season is REG_SPLIT_WEEKS * MATCHES_PER_REG_WEEK games;
    // require at least three quarters of it so a two-game start cannot claim it.
    const full = REG_SPLIT_WEEKS * MATCHES_PER_REG_WEEK;
    if (rows.length >= Math.ceil(full * 0.75)) return rows.every(g => g.won);
    // Schedule unavailable -- fall back to the season counters.
    const w = num(c?.season?.wins), l = num(c?.season?.losses);
    return l === 0 && w >= Math.ceil(full * 0.75);
}

/** Orgs the player has won a title with, from awards and from history rows
 *  that recorded a first-place finish. */
export function titleWinningOrgs(c) {
    const ids = new Set();
    for (const a of (Array.isArray(c?.awards) ? c.awards : [])) {
        if (!a) continue;
        if (a.id === 'regional_champ' || a.id === 'msi_champ' || a.id === 'worlds_champ') {
            if (a.teamId) ids.add(a.teamId);
        }
    }
    for (const h of (Array.isArray(c?.history) ? c.history : [])) {
        if (h && num(h.placement) === 1 && h.teamId) ids.add(h.teamId);
    }
    return [...ids];
}

/** Every region the player has actually been contracted in. */
export function regionsPlayed(c) {
    const set = new Set();
    const add = teamId => {
        const t = teamById(teamId);
        if (t && t.region && t.region !== 'ALL') set.add(t.region);
    };
    for (const h of (Array.isArray(c?.history) ? c.history : [])) add(h?.teamId);
    add(c?.player?.clubId);
    return [...set];
}

/**
 * Read a bracket result out of engine-owned state. Returns 'champion',
 * 'finalist' or null. `kind` is a phase id ('msi', 'worlds', 'spring_po', ...).
 */
export function bracketResult(c, kind) {
    const s = c?.season || {};
    const clubId = c?.player?.clubId;
    if (!clubId) return null;

    const asResult = v => {
        if (typeof v !== 'string') return null;
        const t = v.toLowerCase();
        if (t === 'champion' || t === 'champions' || t === 'won' || t === 'win' || t === '1st') return 'champion';
        if (t === 'finalist' || t === 'runnerup' || t === 'runner-up' || t === 'final' || t === '2nd') return 'finalist';
        return null;
    };

    // 1. an explicit results map: season.results.worlds = 'champion'
    const explicit = asResult(s.results?.[kind]) || asResult(s[kind]);
    if (explicit) return explicit;

    // 2. a per-event object: season.worlds = { placement: 1 }
    const evt = s.results?.[kind] || s[kind];
    if (evt && typeof evt === 'object') {
        const place = num(evt.placement ?? evt.place ?? evt.rank, 0);
        if (place === 1 || evt.won === true) return 'champion';
        if (place === 2) return 'finalist';
    }

    // 3. the live bracket, if it belongs to this event.
    const b = s.bracket;
    if (b && typeof b === 'object') {
        const bk = String(b.kind ?? b.id ?? b.type ?? b.phase ?? '').toLowerCase();
        if (!bk || bk.includes(kind) || kind.includes(bk)) {
            const champ = b.champion ?? b.winner ?? b.winnerId ?? b.championId;
            const second = b.runnerUp ?? b.runnerUpId ?? b.finalist ?? b.loserId;
            if (champ && (champ === clubId || champ.id === clubId)) return 'champion';
            if (second && (second === clubId || second.id === clubId)) return 'finalist';
            const place = num(b.myPlacement ?? b.placement, 0);
            if (place === 1) return 'champion';
            if (place === 2) return 'finalist';
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
//  AWARD DEDUPE
// ---------------------------------------------------------------------------
function hasAward(c, id) {
    return (Array.isArray(c?.awards) ? c.awards : []).some(a => a && a.id === id);
}

function hasAwardInYear(c, id, year) {
    return (Array.isArray(c?.awards) ? c.awards : []).some(a => a && a.id === id && num(a.year) === year);
}

function countAwards(c, id, year) {
    return (Array.isArray(c?.awards) ? c.awards : [])
        .filter(a => a && a.id === id && (year === undefined || num(a.year) === year)).length;
}

function makeAward(defId, year, split, teamId) {
    const def = AWARD_BY_ID[defId];
    if (!def) return null;
    return { ...def, year, split, teamId: teamId || null };
}

// ---------------------------------------------------------------------------
//  END OF SPLIT
// ---------------------------------------------------------------------------
/**
 * Everything the player earned this split.
 *
 * The judging model: a player's split is worth their overall rating, shifted
 * by how far their average match rating sat above a "replacement level" 6.5,
 * and nudged by where the team finished. League peers are scored the same way
 * from their roster rating and their own finish, so All-Pro voting is a real
 * contest against the table rather than a fixed rating threshold.
 */
export function endOfSplitAwards(c, table) {
    const st = c || snapshot();
    if (!st || !st.created || st.flags?.retired) return [];

    const year = num(st.time?.year);
    const split = st.season?.split === 'summer' ? 'summer' : 'spring';
    const teamId = st.player?.clubId;
    const roleId = st.player?.role;
    const out = [];

    const rows = resolveTable(st, table);
    const place = placementFor(rows, teamId);
    const avg = splitAverageRating(st);
    const games = splitGamesPlayed(st);
    const mvps = splitMVPs(st);
    const ovr = calcOVR(st.player?.attrs, roleId);

    // --- international events first: they can land in either split's rollover
    //     and are keyed on the year, so a double-call cannot double-award.
    const msi = bracketResult(st, 'msi');
    if (msi === 'champion' && !hasAwardInYear(st, 'msi_champ', year)) {
        out.push(makeAward('msi_champ', year, split, teamId));
    }
    const wlds = bracketResult(st, 'worlds');
    if (wlds === 'champion' && !hasAwardInYear(st, 'worlds_champ', year)) {
        out.push(makeAward('worlds_champ', year, split, teamId));
    } else if (wlds === 'finalist' && !hasAwardInYear(st, 'worlds_finalist', year)) {
        out.push(makeAward('worlds_finalist', year, split, teamId));
    }

    // --- domestic title
    const poResult = bracketResult(st, SPLIT_PHASES[split].po);
    const wonSplit = poResult === 'champion' || place === 1;
    if (wonSplit) {
        // Keyed on year AND split, so spring and summer titles in the same year
        // both stand while a re-run of the rollover cannot duplicate either.
        const already = (Array.isArray(st.awards) ? st.awards : [])
            .some(a => a && a.id === 'regional_champ' && num(a.year) === year && a.split === split);
        if (!already) out.push(makeAward('regional_champ', year, split, teamId));
    }

    // Both splits in one calendar year.
    if (wonSplit && split === 'summer' && countAwards(st, 'regional_champ', year) >= 1
        && !hasAwardInYear(st, 'domestic_double', year)) {
        out.push(makeAward('domestic_double', year, split, teamId));
    }

    // Only a contracted player who actually appeared competes for individual
    // honours -- a season spent on the bench does not get voted anything.
    const eligible = !!teamId && games >= 8;

    if (eligible) {
        // --- the field --------------------------------------------------
        const finishBonus = place ? clamp((6 - place) * 0.9, -4.5, 4.5) : 0;
        const mvpBonus = Math.min(4, mvps * 0.45);
        const myScore = ovr + (avg - 6.5) * 5 + finishBonus + mvpBonus;

        let betterAtRole = 0;
        let leagueBest = -Infinity;
        for (let i = 0; i < rows.length; i++) {
            const tid = rowTeamId(rows[i]);
            if (!tid || tid === teamId) continue;
            const p = rowPlace(rows[i], i);
            const teamBonus = clamp((6 - p) * 0.7, -3.5, 3.5);
            for (const rid of Object.keys(ROLE_BY_ID)) {
                const score = peerRatingAt(tid, rid, year) + teamBonus + jitter(`${tid}:${rid}:${year}:${split}`) * 2.2;
                if (score > leagueBest) leagueBest = score;
                if (rid === roleId && score > myScore) betterAtRole++;
            }
        }

        const rank = betterAtRole + 1;
        if (rows.length >= 4) {
            if (rank === 1) out.push(makeAward('allpro_1', year, split, teamId));
            else if (rank === 2) out.push(makeAward('allpro_2', year, split, teamId));
            else if (rank === 3) out.push(makeAward('allpro_3', year, split, teamId));
        }

        // --- Split MVP: best at your role AND best in the league outright.
        if (rows.length >= 4 && rank === 1 && avg >= 7.4 && place > 0 && place <= 3
            && (leagueBest === -Infinity || myScore >= leagueBest)) {
            out.push(makeAward('split_mvp', year, split, teamId));
        }

        // --- Finals MVP: you won it and you were the reason.
        if (wonSplit && avg >= 7.2) {
            out.push(makeAward('finals_mvp', year, split, teamId));
        }

        // --- Rookie of the Split. First two contracted years only.
        const yearsPro = Math.max(0, num(st.player?.age) - num(st.player?.startAge));
        if (!hasAward(st, 'rookie_split') && yearsPro <= 1 && num(st.player?.age) <= 20 && avg >= 6.8) {
            out.push(makeAward('rookie_split', year, split, teamId));
        }

        // --- Most Improved. No split-start snapshot exists in the save shape,
        //     so this compares the split against the player's own career mean:
        //     playing a full point above everything you have ever done is a
        //     step up by any definition.
        const careerGames = num(st.totals?.games);
        const careerMean = careerGames > 0 ? num(st.totals?.ratingSum) / careerGames : 0;
        if (careerGames >= 25 && careerMean > 0 && avg >= careerMean + 0.9) {
            out.push(makeAward('most_improved', year, split, teamId));
        }

        // --- Iron Man: every regular-season game of the split, in the lineup.
        const reg = regularSeasonRows(st, split);
        const fullSlate = Math.ceil(REG_SPLIT_WEEKS * MATCHES_PER_REG_WEEK * 0.8);
        if (reg.length >= fullSlate && reg.every(g => g.played && Number.isFinite(Number(g.myRating)))) {
            out.push(makeAward('iron_man', year, split, teamId));
        }

        // --- Comeback Player: last split was a write-off, this one was not.
        const hist = Array.isArray(st.history) ? st.history : [];
        const prev = hist[hist.length - 1];
        if (prev) {
            const wasBad = num(prev.placement) >= 7 || num(prev.l) > num(prev.w);
            const isGood = place > 0 && place <= 4 && avg >= 7.0;
            if (wasBad && isGood) out.push(makeAward('comeback', year, split, teamId));
        }
    }

    // --- 1000 kills, checked at the split boundary so it reads as an honour
    //     rather than a mid-week popup. Also exists as a milestone.
    if (num(st.totals?.kills) >= 1000 && !hasAward(st, 'kills_1000')) {
        out.push(makeAward('kills_1000', year, split, teamId));
    }

    // --- Player of the Year: end of summer only, on the whole year's haul.
    if (split === 'summer' && !hasAwardInYear(st, 'poty', year)) {
        const won = out.filter(Boolean);
        const cnt = id => countAwards(st, id, year) + won.filter(a => a.id === id).length;
        // Weighted case for the year: a world title alone makes the case, and
        // so does an MVP plus a domestic title.
        const claim = cnt('worlds_champ') * 6 + cnt('msi_champ') * 4 + cnt('split_mvp') * 3
            + cnt('regional_champ') * 2 + cnt('allpro_1') * 2 + cnt('finals_mvp');
        if (claim >= 6 && avg >= 7.3) out.push(makeAward('poty', year, split, teamId));
    }

    // --- Golden Road: spring, MSI, summer and Worlds, one calendar year.
    if (!hasAward(st, 'golden_road')) {
        const won = out.filter(Boolean);
        const cnt = id => countAwards(st, id, year) + won.filter(a => a.id === id).length;
        if (cnt('regional_champ') >= 2 && cnt('msi_champ') >= 1 && cnt('worlds_champ') >= 1) {
            out.push(makeAward('golden_road', year, split, teamId));
        }
    }

    return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
//  GRANTING
// ---------------------------------------------------------------------------
/**
 * Write a list of earned awards into the store. Major and legendary awards
 * also land in the trophy cabinet; minors only appear on the award list.
 * Returns a one-line summary for the caller's overlay.
 */
export function grantAwards(awards) {
    const list = (Array.isArray(awards) ? awards : []).filter(Boolean);
    if (!list.length) return 'No awards this split.';

    let legacy = 0;
    let best = 'minor';
    const rank = { minor: 0, major: 1, legendary: 2 };

    for (const a of list) {
        const def = AWARD_BY_ID[a.id] || a;
        const teamName = teamById(a.teamId)?.name || 'Free Agent';
        const splitName = SPLIT_NAME[a.split] || '';

        addAward({
            id: a.id,
            name: def.name,
            icon: def.icon,
            tier: def.tier,
            year: a.year,
            split: a.split,
            teamId: a.teamId || null,
            legacyPoints: num(def.legacyPoints),
        });

        if (def.tier === 'major' || def.tier === 'legendary') {
            addTrophy({
                id: a.id,
                name: def.name,
                icon: def.icon,
                year: a.year,
                kind: def.tier,
                teamId: a.teamId || null,
            });
        }

        legacy += num(def.legacyPoints);
        if (rank[def.tier] > rank[best]) best = def.tier;

        addNews(`${def.icon} ${def.name} \u2014 ${teamName}, ${a.year} ${splitName}`.trim(), 'award');
    }

    if (legacy > 0) grantLegacy(legacy);

    const names = list.map(a => (AWARD_BY_ID[a.id] || a).name);
    const summary = names.length === 1
        ? `${names[0]} (+${legacy} legacy)`
        : `${names.length} awards: ${names.join(', ')} (+${legacy} legacy)`;

    showToast(summary, 'success', 5000);
    playSound(best === 'legendary' ? 'rare' : 'claim');
    saveCareer();
    return summary;
}

// ---------------------------------------------------------------------------
//  MILESTONES
// ---------------------------------------------------------------------------
/** The ids already banked. Tolerates the array being absent on old saves. */
export function claimedMilestoneIds(c) {
    const raw = c?.flags?.milestones;
    if (Array.isArray(raw)) return new Set(raw);
    if (raw && typeof raw === 'object') return new Set(Object.keys(raw).filter(k => raw[k]));
    return new Set();
}

/** Older saves predate flags.milestones; give them the empty array once so
 *  every later read and write can assume it exists. */
function ensureMilestoneFlag() {
    const live = snapshot();
    if (!live || Array.isArray(live.flags?.milestones)) return;
    career.update(c => ({ ...c, flags: { ...c.flags, milestones: [] } }));
}

/** Milestones whose condition is met and which have not been claimed yet. */
export function checkMilestones(c) {
    const st = c || snapshot();
    if (!st || !st.created) return [];
    ensureMilestoneFlag();
    const done = claimedMilestoneIds(st);
    const out = [];
    for (const m of MILESTONES) {
        if (done.has(m.id)) continue;
        let hit = false;
        try { hit = !!m.check(st); } catch (e) { hit = false; }
        if (hit) out.push(m);
    }
    return out;
}

/** Bank a list of milestones: marks them claimed, pays out, writes news. */
export function grantMilestones(list) {
    const items = (Array.isArray(list) ? list : [])
        .map(m => (typeof m === 'string' ? MILESTONE_BY_ID[m] : m))
        .filter(Boolean);
    if (!items.length) return 'No new milestones.';

    let gold = 0, legacy = 0;
    const ids = items.map(m => m.id);

    career.update(c => {
        const prev = Array.isArray(c.flags?.milestones) ? c.flags.milestones : [];
        const merged = [...prev];
        for (const id of ids) if (!merged.includes(id)) merged.push(id);
        return { ...c, flags: { ...c.flags, milestones: merged } };
    });

    for (const m of items) {
        gold += num(m.gold);
        legacy += num(m.legacyPoints);
        addNews(`${m.icon} Milestone \u2014 ${m.name}`, 'award');
    }

    if (gold > 0) grantGold(gold);
    if (legacy > 0) grantLegacy(legacy);

    const summary = items.length === 1
        ? `${items[0].name} (+${fmtGold(gold)} gold, +${legacy} legacy)`
        : `${items.length} milestones (+${fmtGold(gold)} gold, +${legacy} legacy)`;

    showToast(summary, 'success', 4500);
    playSound('claim');
    saveCareer();
    return summary;
}

// ---------------------------------------------------------------------------
//  LEGACY SCORE
//  One integer for the whole career. The anchor is a regional title at 100
//  points; a World Championship is 1000, exactly ten times as much, because
//  the mode should never let a decade of domestic dominance read the same as
//  one Summoner's Cup.
//
//  Non-trophy inputs:
//    longevity  0.6/game, hard-capped at 900 (1500 games). Showing up is worth
//               real points but can never on its own clear the top band --
//               900 + a peak-OVR term still lands short of 'All-Time Great'.
//    peak OVR   (peak - 60) ^ 1.8 * 0.55, capped at 400. Rewards actually
//               becoming great, not just lasting.
//    one club   +400 for a career spent at a single org with 200+ games. The
//               loyalty story is worth about four regional titles.
// ---------------------------------------------------------------------------
export const LEGACY_WEIGHTS = {
    worlds_champ: 1000,
    golden_road: 500,
    msi_champ: 350,
    worlds_finalist: 300,
    poty: 120,
    regional_champ: 100,
    split_mvp: 60,
    domestic_double: 60,
    finals_mvp: 45,
    allpro_1: 40,
    allpro_2: 25,
    allpro_3: 15,
    rookie_split: 25,
    kills_1000: 15,
    iron_man: 10,
    comeback: 10,
    most_improved: 10,
    // The induction is the payoff of the score, so it must not feed back into
    // it -- hallOfLegendsEligible() would otherwise be self-fulfilling.
    hall_of_legends: 0,
};

export const LONGEVITY_PER_GAME = 0.6;
export const LONGEVITY_CAP = 900;
export const ONE_CLUB_BONUS = 400;

/** Highest OVR this career has ever reached. Veterans decay, so the live
 *  rating understates a retired player; the engine may stash a peak, and we
 *  take whichever is higher. */
export function peakOVR(c) {
    const st = c || snapshot();
    const now = calcOVR(st?.player?.attrs, st?.player?.role);
    return Math.max(now, num(st?.totals?.peakOVR), num(st?.flags?.peakOVR));
}

/**
 * Everything the career EARNED on the pitch: trophies, longevity, peak rating,
 * loyalty. Nothing bought.
 *
 * This is the number Hall of Legends eligibility runs on. The monument ladder in
 * the Legacy Exchange adds to legacyScore() below, and it must never be able to
 * buy the induction - the same reason LEGACY_WEIGHTS gives hall_of_legends a
 * weight of 0, so the induction cannot feed its own gate.
 */
export function earnedLegacyScore(c) {
    const st = c || snapshot();
    if (!st) return 0;

    let score = 0;
    for (const a of (Array.isArray(st.awards) ? st.awards : [])) {
        if (!a) continue;
        score += num(LEGACY_WEIGHTS[a.id]);
    }

    const games = num(st.totals?.games);
    score += Math.min(LONGEVITY_CAP, games * LONGEVITY_PER_GAME);

    const peak = peakOVR(st);
    score += Math.min(400, Math.pow(Math.max(0, peak - 60), 1.8) * 0.55);

    const orgs = new Set();
    for (const h of (Array.isArray(st.history) ? st.history : [])) if (h?.teamId) orgs.add(h.teamId);
    if (st.player?.clubId) orgs.add(st.player.clubId);
    if (orgs.size === 1 && games >= 200) score += ONE_CLUB_BONUS;

    return Math.round(score);
}

/** The score the career is ranked and remembered by: earned, plus whatever the
 *  player put their leftover legacy points into. */
export function legacyScore(c) {
    const st = c || snapshot();
    if (!st) return 0;
    let bought = 0;
    try { bought = monumentScore(st); } catch (e) { bought = 0; }
    return Math.round(earnedLegacyScore(st) + bought);
}

// Seven bands, spaced off simulated careers rather than round numbers:
//   ~620   fifteen years of starts and no silverware  -> Respected Pro
//   ~1800  six domestic titles, never won abroad      -> Regional Legend
//   ~2350  one World Championship and a few splits    -> International Star
//   ~8300  four Worlds, two MSI, a Golden Road        -> Hall of Legends
// A single world title has to be worth more than a shelf of domestic ones, so
// the International Star floor sits just above what a purely domestic career
// can realistically bank.
const LEGACY_BANDS = [
    {
        min: 8000, id: 'hol', name: 'Hall of Legends', color: TIER_COLORS['Hall of Legends'] || '#ff0033',
        blurb: 'A name the sport organises its history around. There are maybe five of these, ever.',
    },
    {
        min: 5500, id: 'atg', name: 'All-Time Great', color: '#eab308',
        blurb: 'Multiple international titles and the years to back them up. Top-ten-of-all-time arguments start here.',
    },
    {
        min: 2200, id: 'international', name: 'International Star', color: '#2dd4bf',
        blurb: 'Known well outside your own region. You beat teams that were supposed to beat you.',
    },
    {
        min: 1200, id: 'regional', name: 'Regional Legend', color: '#a855f7',
        blurb: 'A defining player of your league. The trophies are domestic, but there are a lot of them.',
    },
    {
        min: 600, id: 'respected', name: 'Respected Pro', color: '#3b82f6',
        blurb: 'A real career. Years of starts, some silverware or a lot of longevity, and nobody questioned the seat.',
    },
    {
        min: 150, id: 'journeyman', name: 'Journeyman', color: '#94a3b8',
        blurb: 'You made it, you stayed a while, and the roster moves were mostly sideways.',
    },
    {
        min: 0, id: 'forgotten', name: 'Forgotten', color: '#64748b',
        blurb: 'A handful of games and a Liquipedia page nobody edits.',
    },
];

export function legacyTier(score) {
    const v = num(score);
    for (const b of LEGACY_BANDS) if (v >= b.min) return b;
    return LEGACY_BANDS[LEGACY_BANDS.length - 1];
}

export const LEGACY_TIER_BANDS = LEGACY_BANDS;

/** Years between the first competitive season and now. */
export function careerYears(c) {
    const st = c || snapshot();
    const byAge = num(st?.player?.age) - num(st?.player?.startAge);
    const hist = Array.isArray(st?.history) ? st.history : [];
    let bySeason = 0;
    if (hist.length) {
        const years = hist.map(h => num(h?.year)).filter(y => y > 0);
        if (years.length) bySeason = Math.max(...years) - Math.min(...years) + 1;
    }
    return Math.max(1, byAge, bySeason);
}

/**
 * The top band alone is not enough: a career also has to have lasted. Eight
 * seasons and 300 games keeps a freak three-year run out of the Hall.
 */
export function hallOfLegendsEligible(c) {
    const st = c || snapshot();
    if (!st || !st.created) return false;
    // EARNED, not total. A statue outside the arena is something you buy with
    // leftover legacy points; the induction is not for sale.
    const score = earnedLegacyScore(st);
    if (legacyTier(score).id !== 'hol') return false;
    return careerYears(st) >= 8 && num(st.totals?.games) >= 300;
}

// ---------------------------------------------------------------------------
//  CAREER SUMMARY
// ---------------------------------------------------------------------------
function clubHistory(c) {
    const rows = Array.isArray(c?.history) ? c.history : [];
    const byTeam = new Map();
    for (const h of rows) {
        if (!h || !h.teamId) continue;
        const cur = byTeam.get(h.teamId) || { teamId: h.teamId, name: teamById(h.teamId)?.name || h.teamId, from: num(h.year), to: num(h.year), games: 0 };
        cur.from = Math.min(cur.from, num(h.year, cur.from));
        cur.to = Math.max(cur.to, num(h.year, cur.to));
        cur.games += num(h.w) + num(h.l);
        byTeam.set(h.teamId, cur);
    }
    // A career that never rolled over a split has no history rows yet.
    if (!byTeam.size && c?.player?.clubId) {
        byTeam.set(c.player.clubId, {
            teamId: c.player.clubId,
            name: teamById(c.player.clubId)?.name || c.player.clubId,
            from: num(c.time?.year), to: num(c.time?.year),
            games: num(c.totals?.games),
        });
    }
    return [...byTeam.values()].sort((a, b) => a.from - b.from || a.to - b.to);
}

function awardTally(c) {
    const counts = new Map();
    for (const a of (Array.isArray(c?.awards) ? c.awards : [])) {
        if (!a) continue;
        const def = AWARD_BY_ID[a.id] || { id: a.id, name: a.name || a.id, icon: a.icon || '\u{1F3C5}', tier: a.tier || 'minor', legacyPoints: 0 };
        const cur = counts.get(a.id) || { id: def.id, name: def.name, icon: def.icon, tier: def.tier, legacyPoints: def.legacyPoints, count: 0 };
        cur.count++;
        counts.set(a.id, cur);
    }
    const order = { legendary: 0, major: 1, minor: 2 };
    return [...counts.values()].sort((a, b) => order[a.tier] - order[b.tier] || b.count - a.count);
}

/**
 * A retirement retrospective, assembled from the numbers rather than from a
 * bank of canned sentences. Every clause is only added when the career
 * actually earned it, so a washout reads short and blunt and a great reads
 * long.
 */
function buildVerdict(c, data) {
    const handle = c?.player?.handle || 'The player';
    const role = ROLE_BY_ID[c?.player?.role]?.short || 'player';
    const bits = [];

    const first = data.teams[0];
    const last = data.teams[data.teams.length - 1];

    bits.push(`${data.years} ${data.years === 1 ? 'year' : 'years'}, ${data.record.games} games, ${data.record.winRate}% won.`);

    if (first) {
        const arrival = `${handle} came up as a ${role} with ${first.name} in ${first.from}`;
        bits.push(data.teams.length === 1
            ? `${arrival} and never played for anybody else.`
            : `${arrival}, and finished at ${last.name} in ${last.to} after ${data.teams.length} clubs.`);
    } else {
        bits.push(`${handle} never held a professional contract.`);
    }

    if (data.titles.worlds > 0) {
        bits.push(data.titles.worlds === 1
            ? 'One World Championship.'
            : `${data.titles.worlds} World Championships.`);
    } else if (data.titles.worldsFinals > 0) {
        bits.push(`Reached the Worlds final ${data.titles.worldsFinals === 1 ? 'once' : data.titles.worldsFinals + ' times'} without winning it.`);
    }

    if (data.titles.msi > 0) bits.push(`${data.titles.msi} MSI ${data.titles.msi === 1 ? 'title' : 'titles'}.`);
    if (data.titles.regional > 0) bits.push(`${data.titles.regional} domestic ${data.titles.regional === 1 ? 'title' : 'titles'}.`);
    if (data.titles.goldenRoad > 0) bits.push('Completed the Golden Road.');

    const mvps = countAwards(c, 'split_mvp');
    const ap1 = countAwards(c, 'allpro_1');
    if (mvps > 0 || ap1 > 0) {
        const parts = [];
        if (mvps > 0) parts.push(`${mvps} Split ${mvps === 1 ? 'MVP' : 'MVPs'}`);
        if (ap1 > 0) parts.push(`${ap1} All-Pro First Team ${ap1 === 1 ? 'selection' : 'selections'}`);
        bits.push(parts.join(' and ') + '.');
    }

    bits.push(`Peaked at ${data.peakOVR} overall \u2014 ${ovrLabel(data.peakOVR)} \u2014 and ${data.peakRank} on the ladder.`);

    if (data.kda.games > 0) {
        bits.push(`Career line ${data.kda.line}, a ${data.kda.ratio} KDA.`);
    }

    if (data.record.games >= 500 && data.titles.worlds === 0 && data.titles.regional === 0) {
        bits.push('No silverware, but very few players ever played that many games.');
    }

    bits.push(`Final verdict: ${data.legacyTier.name}. ${data.legacyTier.blurb}`);
    return bits.join(' ');
}

/** Everything a retirement screen needs, in one object. */
export function careerSummary(c) {
    const st = c || snapshot();
    const safe = st || {};

    const teams = clubHistory(safe);
    const games = num(safe.totals?.games);
    const wins = num(safe.totals?.wins);
    const losses = num(safe.totals?.losses);
    const kdaRaw = fmtKDA(num(safe.totals?.kills), num(safe.totals?.deaths), num(safe.totals?.assists));

    const titles = {
        worlds: countAwards(safe, 'worlds_champ'),
        worldsFinals: countAwards(safe, 'worlds_finalist'),
        msi: countAwards(safe, 'msi_champ'),
        regional: countAwards(safe, 'regional_champ'),
        goldenRoad: countAwards(safe, 'golden_road'),
        poty: countAwards(safe, 'poty'),
    };
    titles.total = titles.worlds + titles.msi + titles.regional;

    const score = legacyScore(safe);
    const peak = peakOVR(safe);

    // The save shape has no lifetime-earnings ledger; the engine may add one on
    // totals, otherwise all we can honestly report is the balance plus wages
    // reconstructed from the club history.
    const ledger = Number(safe.totals?.earnings ?? safe.money?.totalEarned);
    const totalEarnings = Number.isFinite(ledger) ? Math.round(ledger) : num(safe.money?.gold);

    const data = {
        years: careerYears(safe),
        teams,
        record: {
            w: wins, l: losses, games,
            // Decided games, not the games counter: a save whose totals drifted
            // must not report a 27% win rate on a 190-110 record.
            winRate: (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
        },
        kda: {
            line: kdaRaw.line, ratio: kdaRaw.ratio,
            kills: num(safe.totals?.kills),
            deaths: num(safe.totals?.deaths),
            assists: num(safe.totals?.assists),
            games,
            perGame: games > 0 ? Math.round((num(safe.totals?.kills) / games) * 100) / 100 : 0,
        },
        titles,
        awards: awardTally(safe),
        milestones: [...claimedMilestoneIds(safe)].map(id => MILESTONE_BY_ID[id]).filter(Boolean),
        peakOVR: peak,
        peakRank: rankFromMMR(num(safe.soloq?.peakMMR)).label,
        totalEarnings,
        followers: num(safe.money?.followers),
        followersLabel: fmtFollowers(num(safe.money?.followers)),
        earningsLabel: fmtGold(totalEarnings),
        legacyScore: score,
        legacyTier: legacyTier(score),
        handle: safe.player?.handle || 'Rookie',
        role: safe.player?.role || 'MID',
        region: safe.player?.region || 'LEC',
        age: num(safe.player?.age),
        retired: !!safe.flags?.retired,
        hallOfLegends: hallOfLegendsEligible(safe),
    };
    data.verdict = buildVerdict(safe, data);
    return data;
}

// ---------------------------------------------------------------------------
//  RETIREMENT
// ---------------------------------------------------------------------------
export function canRetire(c) {
    const st = c || snapshot();
    if (!st || !st.created) return { ok: false, reason: 'No career in progress.' };
    if (st.flags?.retired) return { ok: false, reason: 'You have already retired.' };

    const age = num(st.player?.age);
    if (age >= RETIREMENT_AGE_FORCED) {
        return { ok: true, reason: `You are ${age}. The game has decided for you.`, forced: true };
    }
    if (age < RETIREMENT_AGE_MIN) {
        return { ok: false, reason: `You are ${age}. Nobody hangs it up before ${RETIREMENT_AGE_MIN} \u2014 keep playing.` };
    }
    return { ok: true, reason: `You are ${age}. You can walk away whenever you want.`, forced: false };
}

/**
 * End the career. Returns the summary either way: when retirement is blocked
 * the object comes back with `retired: false` and a `blocked` reason, so a
 * caller can render the preview without a null check.
 */
export function retire(opts = {}) {
    const st = snapshot();
    if (!st) return null;

    if (st.flags?.retired) {
        // Idempotent: re-reading a finished career must not re-award anything.
        return careerSummary(st);
    }

    const gate = canRetire(st);
    if (!gate.ok && !opts.force) {
        return { ...careerSummary(st), retired: false, blocked: gate.reason };
    }

    const eligible = hallOfLegendsEligible(st);
    const year = num(st.time?.year);
    const split = st.season?.split === 'summer' ? 'summer' : 'spring';

    if (eligible && !hasAward(st, 'hall_of_legends')) {
        grantAwards([makeAward('hall_of_legends', year, split, st.player?.clubId)]);
    }

    career.update(x => ({
        ...x,
        flags: { ...x.flags, retired: true, hallOfLegends: eligible || !!x.flags?.hallOfLegends },
    }));

    const after = snapshot();
    const summary = careerSummary(after);

    const teamName = teamById(after?.player?.clubId)?.name;
    addNews(
        `\u{1F3AC} ${summary.handle} retires at ${summary.age}${teamName ? ` from ${teamName}` : ''} \u2014 `
        + `${summary.record.games} games, ${summary.titles.total} major ${summary.titles.total === 1 ? 'title' : 'titles'}, `
        + `${summary.legacyTier.name}.`,
        'system',
    );

    showToast(`Career over \u2014 ${summary.legacyTier.name} (${summary.legacyScore} legacy)`, 'success', 6000);
    playSound(eligible ? 'rare' : 'win');
    saveCareer();

    return { ...summary, retired: true, blocked: null, inducted: eligible };
}

// ---------------------------------------------------------------------------
//  PROFILE VIEWS
// ---------------------------------------------------------------------------
/**
 * Awards grouped by year, newest first, with the definition merged back in so
 * an old save that stored only `{id, name, year}` still renders an icon.
 */
export function awardHistoryByYear(c) {
    const st = c || snapshot();
    const rows = Array.isArray(st?.awards) ? st.awards : [];
    const byYear = new Map();

    for (const a of rows) {
        // `if (!a)` is not enough: a hand-edited save (and a board document
        // written by a client that encoded the array wrong) can hold a number or
        // a bare string here, and every one of those is truthy with no `.id`, so
        // `a.name || def.name || a.id` resolves to undefined and the screen
        // prints the literal word. An award that is not an object is not an
        // award; drop it rather than render a nameless row.
        if (!a || typeof a !== 'object' || Array.isArray(a)) continue;
        const def = AWARD_BY_ID[a.id] || {};
        const year = num(a.year);
        const entry = {
            id: a.id,
            // Last resort is a word, not the id: an award row with no id at all
            // is renderable, and 'undefined' is not a name.
            name: a.name || def.name || a.id || 'Award',
            icon: a.icon || def.icon || '\u{1F3C5}',
            tier: a.tier || def.tier || 'minor',
            legacyPoints: num(a.legacyPoints ?? def.legacyPoints),
            year,
            split: a.split || '',
            splitName: SPLIT_NAME[a.split] || '',
            teamId: a.teamId || null,
            teamName: teamById(a.teamId)?.name || '',
        };
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(entry);
    }

    const order = { legendary: 0, major: 1, minor: 2 };
    return [...byYear.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([year, awards]) => ({
            year,
            awards: awards.sort((x, y) => order[x.tier] - order[y.tier]),
            legacyPoints: awards.reduce((s, x) => s + num(x.legacyPoints), 0),
            label: `${year} \u2014 ${awards.length} ${awards.length === 1 ? 'award' : 'awards'}`,
        }));
}

/** Short "3rd of 10" style line for a finish, used by the split summary. */
export function placementLabel(rows, teamId) {
    const place = placementFor(rows, teamId);
    if (!place) return 'Unplaced';
    const size = Array.isArray(rows) ? rows.length : 0;
    return size ? `${ordinal(place)} of ${size}` : ordinal(place);
}
