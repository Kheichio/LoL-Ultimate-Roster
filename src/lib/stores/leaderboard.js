// ═══════════════════════════════════════════════════════════════════════════
//  ROSTER LEADERBOARD — the one publisher and the one reader
// ═══════════════════════════════════════════════════════════════════════════
//  There used to be two publishers (App.svelte's 10-minute timer and the Ranking tab's own
//  "Refresh & Sync"), each with its own copy of the power maths — and both copies still used
//  the old all-five "Same Team" rule, so the board disagreed with the Squad page. Now:
//
//    • squadPower() is the Squad page's formula, built from utils/combat.js.
//    • The club publishes ITSELF. startLeaderboardSync() (App.svelte, once) watches the
//      stores the entry is built from and writes at most once every PUBLISH_GAP_MS, and only
//      when the entry actually changed (a signature of every field but updatedAt). Signing
//      in publishes within a few seconds. No button, no tab visit needed.
//    • fetchBoard() re-queries Firestore per sort column (single-field orderBy — no composite
//      index), so the top 50 by Golden Roads really is the top 50 by Golden Roads instead of
//      the top 50 by trophies re-sorted.
//
//  THE DOCUMENT SHAPE IS FROZEN BY firestore.rules (validLeaderboardEntry), which is pasted
//  into the console by hand: totalPower 0..145, rawPower 0..99, managerLevel 1..1000,
//  trophies 0..100000, updatedAt within the last 10 minutes of SERVER time, displayName and
//  teamName <= 64 chars. Every field below is clamped to those bounds before it is sent —
//  a value one past a bound is a silent permission-denied, for ever.
//
//  Remote rows are untrusted: colours are re-validated as #hex (they reach a style
//  attribute) and every number is clamped on read.
import { writable, get } from 'svelte/store';
import { currentUser } from './auth.js';
import { squad, club, blueEssence, trackStats, teamIdentity, managerLevel, weightedTrophies, showcasePicks, skills, seasonData } from './game.js';
import { GR_STEPS } from '../utils/league.js';
import { getEffectiveRating } from '../utils/cards.js';
import { calcCoachBonus, calcRegionChem, calcEraChem, calcTeamChem, calcLegacyBonus } from '../utils/combat.js';

const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
const PUBLISH_GAP_MS = 45 * 1000;     // at most one write per 45s however much changes
const FIRST_PUBLISH_MS = 3 * 1000;    // after sign-in / page load
const BOARD_LIMIT = 50;

/** Gate on fbDb itself: SSR harnesses define `window` without it. */
function db() {
    return (typeof window !== 'undefined' && window.fbDb) ? window.fbDb : null;
}

const OFFLINE_MESSAGE =
    'Could not reach the leaderboard. The usual cause is an ad blocker or privacy extension blocking '
    + 'firestore.googleapis.com — try turning it off for this site. Otherwise you are offline.';

// ─────────────────────────────────────────────────────────────────────────
//  COLUMNS + TITLES
// ─────────────────────────────────────────────────────────────────────────
export function fmtNum(v) {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 10_000) return Math.floor(v / 1_000) + 'K';
    return Number(v || 0).toLocaleString();
}

// `trophies` is the WEIGHTED score (stores/game.js weightedTrophies) and keeps its Firestore field
// name — firestore.rules requires a field called `trophies` — but it is shown as "Glory" (it was
// "Achievement Score" before 1.8.7). "Trophies" means titles actually won, one each: `titles`.
export const LB_COLUMNS = [
    { key: 'trophies',        label: 'Glory', icon: 'medal', color: '#fbbf24', hint: 'A weighted score of everything won: Worlds 6, MSI 4, First Stand 2, domestic title 1, Golden Road 10. It decides your manager title.' },
    { key: 'titles',          label: 'Trophies',     icon: 'trophy',   color: '#facc15', hint: 'Titles actually won, one each: Worlds, MSI, First Stand and domestic Regional Trophies' },
    { key: 'totalPower',      label: 'Power',        icon: 'bolt',     color: '#34d399', hint: 'Squad power, the same number the Squad page shows' },
    { key: 'goldenRoads',     label: 'Golden Road',  icon: 'crown',    color: '#eab308', hint: 'Golden Roads completed, with each manager\'s road for the current year' },
    { key: 'splitsCompleted', label: 'Splits',       icon: 'calendar', color: '#818cf8', hint: 'Season splits completed' },
    { key: 'towerBest',       label: 'Tower',        icon: 'tower',    color: '#f472b6', hint: 'Highest Infinity Tower floor' },
    { key: 'clubSize',        label: 'Cards',        icon: 'cards',    color: '#a5b4fc', hint: 'Cards in the club' },
    { key: 'managerLevel',    label: 'Level',        icon: 'star',     color: '#c084fc', hint: 'Manager level' },
    { key: 'totalBE',         label: 'Blue Essence', icon: 'gem',      color: '#38bdf8', hint: 'Blue Essence banked', format: fmtNum },
];
export const LB_SORT_KEYS = LB_COLUMNS.map(c => c.key);

// The four kinds of title that make up "Trophies", in the order the breakdown shows them.
export const TITLE_KINDS = [
    { key: 'worldsWins',     label: 'Worlds',      icon: 'globe',  color: '#fbbf24' },
    { key: 'msiWins',        label: 'MSI',         icon: 'waves',  color: '#2dd4bf' },
    { key: 'firstStandWins', label: 'First Stand', icon: 'flame',  color: '#fb923c' },
    { key: 'regionalWins',   label: 'Domestic',    icon: 'flag',   color: '#60a5fa' },
];
export { GR_STEPS };

/** A Golden Road line for display: "3/6", "Road broken at MSI", "Complete!" — or '' with no data. */
export function goldenRoadLine(r) {
    if (!r || !r.grYear) return '';
    if (r.grDone >= GR_STEPS.length) return `Year ${r.grYear} · complete`;
    if (r.grBroken) return `Year ${r.grYear} · broken at ${GR_STEPS[r.grDone]?.label || 'the next step'}`;
    return `Year ${r.grYear} · ${r.grDone}/${GR_STEPS.length}${r.grDone < GR_STEPS.length ? ` · next: ${GR_STEPS[r.grDone].label}` : ''}`;
}

export function prestigeTitle(tp) {
    if (tp >= 1000) return 'Immortal';
    if (tp >= 600) return 'Legend';
    if (tp >= 400) return 'Hall of Fame';
    if (tp >= 250) return 'President';
    if (tp >= 150) return 'Executive';
    if (tp >= 75) return 'GM';
    if (tp >= 30) return 'Director';
    if (tp >= 10) return 'Manager';
    return 'Scout';
}

// ─────────────────────────────────────────────────────────────────────────
//  BUILDING MY ENTRY
// ─────────────────────────────────────────────────────────────────────────
const clampInt = (v, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};
const str = (v, max, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);
const hexOr = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback);

/** The Squad page's power: rating average + region, era, team, coach, legacy and Conditioning.
 *  An incomplete five has no chemistry (the Squad page shows no power at all for one). */
export function squadPower(sq, sk) {
    const starters = ROLES.map(r => sq && sq[r]).filter(Boolean);
    if (!starters.length) return { raw: 0, total: 0 };
    const raw = Math.round(starters.reduce((s, c) => s + getEffectiveRating(c), 0) / starters.length);
    if (starters.length < 5) return { raw, total: raw };
    const total = raw + calcRegionChem(starters) + calcEraChem(starters) + calcTeamChem(starters)
        + calcCoachBonus(sq.COACH) + calcLegacyBonus(starters) + ((sk && sk.conditioning) || 0);
    return { raw, total };
}

function serializeCard(c) {
    if (!c) return null;
    return { id: c.id, name: c.name, team: c.team, year: c.year, role: c.role, region: c.region, rating: c.rating, quality: c.quality, stats: c.stats, signature: c.signature || false, holographic: c.holographic || false };
}

function showcaseFor(cl) {
    const picks = get(showcasePicks);
    const chosen = picks && picks.length ? picks.map(uid => cl.find(c => c.uniqueId === uid)).filter(Boolean) : [];
    if (chosen.length) return chosen;
    const score = c => (c.signature ? 1000 : 0) + (c.holographic ? 500 : 0) + c.rating;
    return [...cl].sort((a, b) => score(b) - score(a)).slice(0, 3);
}

/** The Firestore payload for the signed-in club, every field inside the published rules.
 *  `updatedAt` is added at write time. */
export function buildEntry(user = get(currentUser)) {
    const sq = get(squad);
    const cl = get(club);
    const ts = get(trackStats);
    const ti = get(teamIdentity);
    const tp = clampInt(get(weightedTrophies), 0, 100_000);
    const pw = squadPower(sq, get(skills));
    const squadData = {};
    for (const role of [...ROLES, 'COACH']) if (sq[role]) squadData[role] = serializeCard(sq[role]);
    const n = k => clampInt(ts[k] || 0, 0, 1_000_000_000);
    const gr = (get(seasonData) || {}).goldenRoad || {};
    return {
        displayName: str(user && user.displayName, 64, 'Manager'),
        teamName: str(ti.name, 64, 'Team'),
        teamLogo: typeof ti.logo === 'string' && ti.logo.length <= 8 ? ti.logo : '🛡️',
        teamColor: hexOr(ti.color, '#3b82f6'),
        managerLevel: clampInt(get(managerLevel), 1, 1000),
        prestigeTitle: prestigeTitle(tp),
        trophies: tp,
        totalPower: clampInt(pw.total, 0, 145),
        rawPower: clampInt(pw.raw, 0, 99),
        totalBE: clampInt(get(blueEssence), 0, 50_000_000),
        clubSize: clampInt(cl.length, 0, 10_000),
        signatureCards: cl.filter(c => c.signature).length,
        holographicCards: cl.filter(c => c.holographic).length,
        splitsCompleted: n('splitsCompleted'), goldenRoads: n('goldenRoads'),
        cafeWins: n('cafeWins'), regionalWins: n('regionalSplitWon'),
        firstStandWins: n('firstStandWon'), msiWins: n('msiWon'), worldsWins: n('worldsWon'),
        // Titles actually won, one each — what the board calls "Trophies". Additive fields: the
        // published rules require four keys and never cap the key set, so these pass as they are.
        titles: n('worldsWon') + n('msiWon') + n('firstStandWon') + n('regionalSplitWon'),
        // This year's Golden Road, for the tracker.
        grYear: clampInt(gr.year || 1, 1, 100_000),
        grDone: clampInt(Array.isArray(gr.done) ? gr.done.length : 0, 0, GR_STEPS.length),
        grBroken: !!gr.broken,
        losses: n('losses'), packsOpened: n('packs'), towerBest: n('towerHighestFloor'),
        favouriteTeam: str(ti.favouriteTeam, 40), favouritePlayer: str(ti.favouritePlayer, 40),
        mostPlayedMode: n('cafeWins') > n('splitsCompleted') ? 'Gaming Cafe' : 'Season Splits',
        squadData,
        showcaseData: showcaseFor(cl).map(serializeCard).filter(Boolean),
    };
}

// ─────────────────────────────────────────────────────────────────────────
//  PUBLISHING (automatic)
// ─────────────────────────────────────────────────────────────────────────
/** idle | guest | offline | publishing | published | error */
export const lbSync = writable({ status: 'idle', at: 0, error: '' });

let lastSig = '';
let lastWrite = 0;
let timer = null;
let started = false;

const signature = (doc) => JSON.stringify(doc);

/** Publish the signed-in club now. Skips the write when nothing changed unless `force`. */
export async function publishNow({ force = false } = {}) {
    const user = get(currentUser);
    if (!user) { lbSync.set({ status: 'guest', at: 0, error: '' }); return false; }
    const fb = db();
    if (!fb) { lbSync.set({ status: 'offline', at: 0, error: OFFLINE_MESSAGE }); return false; }
    const doc = buildEntry(user);
    const sig = signature(doc);
    if (!force && sig === lastSig) return true;
    lbSync.update(s => ({ ...s, status: 'publishing' }));
    try {
        // The rules want updatedAt <= SERVER time. Stamping a few seconds early tolerates a
        // device clock that runs slightly fast; the lower bound is ten minutes, so it is free.
        await fb.collection('leaderboard').doc(user.uid).set({ ...doc, updatedAt: Date.now() - 15000 });
        lastSig = sig;
        lastWrite = Date.now();
        lbSync.set({ status: 'published', at: lastWrite, error: '' });
        return true;
    } catch (e) {
        lbSync.set({ status: 'error', at: lastWrite, error: OFFLINE_MESSAGE });
        return false;
    }
}

function schedule(delay) {
    if (timer) return;
    timer = setTimeout(() => { timer = null; publishNow(); }, Math.max(1000, delay));
}

/** Called once, from App.svelte. Every change to the club re-publishes it, throttled. */
export function startLeaderboardSync() {
    if (started || typeof window === 'undefined') return;
    started = true;
    currentUser.subscribe(u => {
        lastSig = '';
        if (u) schedule(FIRST_PUBLISH_MS);
        else lbSync.set({ status: 'guest', at: 0, error: '' });
    });
    const onChange = () => {
        if (!get(currentUser)) return;
        schedule(Math.max(FIRST_PUBLISH_MS, PUBLISH_GAP_MS - (Date.now() - lastWrite)));
    };
    for (const s of [squad, club, blueEssence, trackStats, teamIdentity, managerLevel, showcasePicks, skills, seasonData]) s.subscribe(onChange);
    // Leaving the page: send what is pending rather than losing up to 45s of progress.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && timer) {
            clearTimeout(timer); timer = null; publishNow();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────
//  READING
// ─────────────────────────────────────────────────────────────────────────
export const lbRows = writable([]);
/** idle | loading | ready | error | offline */
export const lbState = writable({ status: 'idle', sort: 'trophies', fetchedAt: 0, error: '' });

const num = (v, hi = 1_000_000_000) => clampInt(v || 0, 0, hi);

/** A remote document → a display row. Everything is re-validated: this came off the network. */
export function sanitizeRow(id, d, myUid) {
    d = d && typeof d === 'object' ? d : {};
    const tp = num(d.trophies, 100_000);
    return {
        id,
        isMe: !!myUid && id === myUid,
        displayName: str(d.displayName, 64, 'Unknown'),
        teamName: str(d.teamName, 64, 'Team'),
        teamLogo: typeof d.teamLogo === 'string' && d.teamLogo.length <= 8 && d.teamLogo ? d.teamLogo : '🛡️',
        teamColor: hexOr(d.teamColor, '#3b82f6'),
        managerLevel: clampInt(d.managerLevel || 1, 1, 1000),
        prestigeTitle: prestigeTitle(tp),
        trophies: tp,
        totalPower: num(d.totalPower, 145),
        rawPower: num(d.rawPower || d.totalPower, 99),
        totalBE: num(d.totalBE, 50_000_000),
        clubSize: num(d.clubSize, 10_000),
        signatureCards: num(d.signatureCards), holographicCards: num(d.holographicCards),
        splitsCompleted: num(d.splitsCompleted), goldenRoads: num(d.goldenRoads),
        towerBest: num(d.towerBest), cafeWins: num(d.cafeWins), regionalWins: num(d.regionalWins),
        firstStandWins: num(d.firstStandWins), msiWins: num(d.msiWins), worldsWins: num(d.worldsWins),
        // A document published before `titles` existed still shows the right count.
        titles: d.titles != null ? num(d.titles) : num(d.worldsWins) + num(d.msiWins) + num(d.firstStandWins) + num(d.regionalWins),
        grYear: num(d.grYear, 100_000),
        grDone: num(d.grDone, GR_STEPS.length),
        grBroken: d.grBroken === true,
        losses: num(d.losses), packsOpened: num(d.packsOpened),
        favouriteTeam: str(d.favouriteTeam, 40), favouritePlayer: str(d.favouritePlayer, 40),
        mostPlayedMode: str(d.mostPlayedMode, 40),
        squad: d.squadData && typeof d.squadData === 'object' ? d.squadData : {},
        showcaseCards: Array.isArray(d.showcaseData) ? d.showcaseData.filter(c => c && typeof c === 'object' && typeof c.name === 'string').slice(0, 3) : [],
        updatedAt: num(d.updatedAt, Number.MAX_SAFE_INTEGER),
    };
}

/** My club as a display row, from the live stores (never stale, signed in or not). */
export function myRow() {
    const user = get(currentUser);
    const e = buildEntry(user);
    const row = sanitizeRow(user ? user.uid : 'local', { ...e, squadData: e.squadData, showcaseData: e.showcaseData, updatedAt: Date.now() }, user ? user.uid : 'local');
    row.displayName = user ? row.displayName : 'You';
    row.squad = get(squad);
    row.showcaseCards = showcaseFor(get(club));
    return row;
}

let fetchSeq = 0;

/** Re-query the board for one sort column. Stale responses (a later call already started)
 *  are dropped, so flicking between columns never shows the wrong ranking. */
export async function fetchBoard(sort = 'trophies') {
    const key = LB_SORT_KEYS.includes(sort) ? sort : 'trophies';
    const seq = ++fetchSeq;
    lbState.update(s => ({ ...s, status: 'loading', sort: key }));
    const fb = db();
    if (!fb) {
        lbRows.set([]);
        lbState.set({ status: 'offline', sort: key, fetchedAt: 0, error: OFFLINE_MESSAGE });
        return;
    }
    try {
        const snap = await fb.collection('leaderboard').orderBy(key, 'desc').limit(BOARD_LIMIT).get();
        if (seq !== fetchSeq) return;
        const uid = get(currentUser)?.uid || '';
        const rows = [];
        snap.forEach(doc => rows.push(sanitizeRow(doc.id, doc.data(), uid)));
        lbRows.set(rows);
        lbState.set({ status: 'ready', sort: key, fetchedAt: Date.now(), error: '' });
    } catch (e) {
        if (seq !== fetchSeq) return;
        lbState.set({ status: 'error', sort: key, fetchedAt: 0, error: OFFLINE_MESSAGE });
    }
}
