// ═══════════════════════════════════════════════════════════════════════════
//  CAREER LEADERBOARD — the pure half
// ═══════════════════════════════════════════════════════════════════════════
//  Encoding, decoding and sanitising for the global career board. NO network,
//  NO store writes, NO localStorage, NO timers — all of that lives in
//  stores/careerBoard.js. Keeping the two apart is what lets tools/boardCheck.mjs
//  lint this file for write identifiers by call site and be believed.
//
//  Two shapes travel over the wire:
//
//    careerBoard/{uid}          the 25-field RANKING ROW (~650 B)
//    careerBoardProfiles/{uid}  the DOSSIER: { v, careerId, blob, updatedAt }
//
//  The dossier payload is a JSON STRING, not a structured document, because
//  Firestore rules cannot ITERATE a variable-length list — `d.hi is list &&
//  d.hi.size() <= 60` bounds the row COUNT while permitting each row to carry a
//  100kb string, i.e. a ~1MiB dossier a viewer downloads on one click. A
//  string's size() is the only hard BYTE bound the rules language can express.
//  stores/auth.js already stores `careers` the same way for the same reason.
//
//  IDS TRAVEL, NAMES DO NOT. Team names, award names, perk names and card stats
//  are all re-resolved locally from ids — the anticheat.validateCard() idiom.
//  A fabricated org renders as "Unknown Org"; no remote string ever reaches a
//  style= attribute. The corollary is that award ids, champion ids, trait ids
//  and team ids being permanent is now load-bearing for OTHER PEOPLE'S
//  documents, which no code here can migrate.
//
//  IMPORT DIRECTION: this file may import stores/career.js. stores/career.js
//  must NEVER import this file — the cycle would break careerRender's Vite SSR
//  module graph.

import { blankCareer, hydrateForeignCareer } from '../stores/career.js';
import {
    ATTR_KEYS, ATTR_MIN, ATTR_MAX, ROLE_IDS, ROLE_BY_ID, REGION_IDS,
    CHAMPION_BY_ID, TRAIT_BY_ID, PATH_BY_ID, teamById, DEFAULT_START_YEAR,
    WEEKS_PER_YEAR, MMR_MAX, RETIREMENT_AGE_FORCED, SQUAD_STATUS,
} from './constants.js';
import { calcOVR, clamp, clampAttr, toCareerCard } from './ratings.js';
import {
    earnedLegacyScore, peakOVR, careerYears, hallOfLegendsEligible,
    claimedMilestoneIds, AWARD_BY_ID, MILESTONE_BY_ID,
} from './awards.js';
import { monumentScore, PERK_BY_ID, MONUMENT_BY_ID } from './economy.js';
import {
    CAREER_BOUNDS, CAREER_STR_MAX, CAREER_ENUMS, clampInt, cleanText,
} from '../utils/anticheat.js';
import { getCardById, getDB, ratingToQuality } from '../utils/cards.js';

// ─────────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────────────
export const BOARD_VERSION = 1;

/** Carried on the DOCUMENT rather than read off the save, because the career
 *  hydrate() unconditionally stamps out.version = CAREER_SAVE_VERSION, so a
 *  save's own version can never discriminate a BOARD schema. */
export const BOARD_ROW_BYTES_MAX = 1200;
export const BOARD_BLOB_BYTES_MAX = CAREER_STR_MAX.blob;   // 24000
export const BOARD_LIMIT = 50;

/** Every sort is a SINGLE-FIELD orderBy, which Firestore auto-indexes — so the
 *  board never needs a composite index created by hand in the console. Adding a
 *  .where() beside an .orderBy() on a different field would change that. */
export const BOARD_SORTS = [
    { key: 'earnedScore',   label: 'Legacy',   hint: 'Legacy earned on the pitch. Monuments are shown but never ranked.' },
    { key: 'peakOVR',       label: 'Peak OVR', hint: 'The highest overall rating the career ever reached.' },
    { key: 'games',         label: 'Games',    hint: 'Total professional games played.' },
    { key: 'wins',          label: 'Wins',     hint: 'Total professional wins.' },
    { key: 'finishedScore', label: 'Completed',hint: 'Retired careers first, ranked by earned legacy. Active careers follow.' },
];

const SPLITS = ['spring', 'summer'];
const HISTORY_MAX = 60;
const AWARDS_MAX = 100;
const PROFICIENCY_MAX = 12;
const CHANGES_MAX = 12;

const ROSTER_SEATS = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];

// ─────────────────────────────────────────────────────────────────────────
//  SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }

function bounded(field, value) {
    const b = CAREER_BOUNDS[field];
    return clampInt(value, b.min, b.max, b.min);
}

/** FNV-1a, base-36. The same loop anticheat.js uses for save signatures. */
function fnv(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

// ─────────────────────────────────────────────────────────────────────────
//  IDENTITY
// ─────────────────────────────────────────────────────────────────────────
/**
 * A stable id for "this career", used to decide whether the row on the board is
 * still THIS save.
 *
 * Hashed over handle | startAge | path | region ONLY. NOT role, NOT champion,
 * NOT playstyle: contracts.changeRole() and contracts.switchChampion() rewrite
 * all three mid-career by design, and a fingerprint that flipped would tell a
 * published player they were unpublished — silently disarming the opt-in.
 *
 * DERIVED, never persisted. That is what keeps every line of board code free of
 * save writes: "am I published?" is answered by comparing this to the row that
 * came back from Firestore, not by a flag someone has to remember to clear.
 */
export function careerFingerprint(raw) {
    const p = obj(raw && raw.player);
    const parts = [
        cleanText(p.handle, CAREER_STR_MAX.handle),
        Math.round(Number(p.startAge) || 0),
        PATH_BY_ID[p.path] ? p.path : 'precomp',
        REGION_IDS.includes(p.region) ? p.region : 'LEC',
    ].join('|');
    // 'c' prefix + an 8-ish char base-36 hash keeps this inside the rules'
    // 4..16 character window whatever the hash rounds to.
    return ('c' + fnv(parts)).slice(0, CAREER_STR_MAX.careerId).padEnd(4, '0');
}

/**
 * Overall rating for the board. LOAD-BEARING.
 *
 * calcOVR() returns 0 when the role does not resolve (ratings.js:70), and
 * careerRender's own state matrix includes player.role === 'NOT_A_ROLE'. A bare
 * calcOVR would publish ovr: 0, the `d.ovr >= 1` rule would deny the write, the
 * client's catch would swallow it, and that career would never appear — with no
 * error anywhere.
 */
export function boardOVR(attrs, roleId) {
    const role = ROLE_BY_ID[roleId] ? roleId : 'MID';
    return Math.max(1, calcOVR(attrs, role));
}

function normRole(v)   { return ROLE_IDS.includes(v) ? v : 'MID'; }
function normRegion(v) { return REGION_IDS.includes(v) ? v : 'LEC'; }

// ─────────────────────────────────────────────────────────────────────────
//  BUILD — save  ->  { row, profile }
// ─────────────────────────────────────────────────────────────────────────
/**
 * Turn one raw career save into the two documents that go on the board.
 *
 * PURE. Reads `raw`, never mutates it, never touches a store or storage. The
 * caller obtains `raw` through career.careerSlotRaw(), which is a fresh
 * JSON.parse, so this function physically cannot reach the live career.
 *
 * Returns null for anything that is not a created career — a blank store means
 * "nothing is loaded", never "no save exists".
 */
export function buildBoardDocs(raw, { uid, displayName, slot } = {}) {
    if (!raw || typeof raw !== 'object' || !raw.created) return null;

    const p = obj(raw.player);
    const role = normRole(p.role);
    const region = normRegion(p.region);
    const totals = obj(raw.totals);
    const flags = obj(raw.flags);

    const awards = arr(raw.awards).filter(a => a && AWARD_BY_ID[a.id]);
    const trophies = arr(raw.trophies).filter(Boolean);

    let titles = 0, worlds = 0;
    for (const a of awards) {
        if (a.id === 'worlds_champ') { worlds++; titles++; }
        else if (a.id === 'msi_champ' || a.id === 'regional_champ') titles++;
    }

    const retired = flags.retired === true;
    const earned = bounded('earnedScore', earnedLegacyScore(raw));
    const years = bounded('years', careerYears(raw));
    const ovr = bounded('ovr', boardOVR(p.attrs, role));
    const peak = Math.max(ovr, bounded('peakOVR', Math.max(1, peakOVR(raw))));

    const row = {
        v: BOARD_VERSION,
        careerId: careerFingerprint(raw),
        slot: bounded('slot', slot),
        handle: cleanText(p.handle, CAREER_STR_MAX.handle) || 'Rookie',
        displayName: cleanText(displayName, CAREER_STR_MAX.displayName),
        role,
        region,
        // An ID only. The reader re-resolves it through teamById().
        teamId: cleanText(p.clubId, CAREER_STR_MAX.teamId),
        retired,
        hallOfLegends: flags.hallOfLegends === true || hallOfLegendsEligible(raw) === true,
        age: bounded('age', p.age),
        years,
        ovr,
        peakOVR: peak,
        peakMMR: bounded('peakMMR', obj(raw.soloq).peakMMR),
        games: bounded('games', totals.games),
        wins: bounded('wins', totals.wins),
        losses: bounded('losses', totals.losses),
        // EARNED, never legacyScore(): the monument ladder is a renewable
        // currency and ranking on the total would put the top of the board up
        // for sale. Named `earnedScore` so no future reader can wire the
        // purchasable number into the rank by accident.
        earnedScore: earned,
        boughtScore: bounded('boughtScore', monumentScore(raw)),
        // Exactly derived, and the rules enforce the derivation — which is what
        // makes "Completed" a free single-field sort with nothing to fake.
        finishedScore: retired ? earned : -1,
        titles: bounded('titles', titles),
        worlds: bounded('worlds', Math.min(worlds, years)),
        trophies: bounded('trophies', trophies.length),
        updatedAt: Date.now(),
    };

    // The cross-field rails the rules also check, applied here so an honest
    // save can never be denied for tripping one. Each of these is a clamp, not
    // a rejection: a career that trips one is a data oddity, not a cheat.
    //
    // ORDER IS LOAD-BEARING, and getting it wrong reproduces the exact failure
    // these clamps exist to prevent — a denied write, a swallowed catch, and a
    // career that never appears for anybody:
    //
    //   `years` is the DENOMINATOR of three other rails, so it settles first.
    //     Clamping it last left games and earnedScore checked against a years
    //     the row no longer carried (age 20 with 26 years on the save passed
    //     games <= 1620, then published years: 8, whose real rail is 540).
    //   `games` is raised to cover the record and THEN capped by the years
    //     rail, so wins + losses is reconciled DOWN afterwards rather than
    //     raising games back over its own ceiling. A maxed save with 2900 games
    //     and 26 years published wins + losses = 2900 against games = 1620.
    //   `finishedScore` is derived last, off the FINAL earnedScore, because the
    //     rules check the two for exact equality.
    if (row.years > row.age - 12) row.years = Math.max(CAREER_BOUNDS.years.min, row.age - 12);

    if (row.wins + row.losses > row.games) row.games = Math.min(CAREER_BOUNDS.games.max, row.wins + row.losses);
    if (row.games > row.years * 60 + 60) row.games = row.years * 60 + 60;
    if (row.wins > row.games) row.wins = row.games;
    if (row.wins + row.losses > row.games) row.losses = row.games - row.wins;

    if (row.earnedScore > row.years * 4000 + 400) row.earnedScore = row.years * 4000 + 400;
    if (row.worlds > row.years) row.worlds = row.years;
    row.finishedScore = row.retired ? row.earnedScore : -1;

    const blob = encodeBlob(raw, { role, region, awards, trophies, peak });

    return {
        row,
        blob,
        profile: {
            v: BOARD_VERSION,
            careerId: row.careerId,
            blob,
            updatedAt: row.updatedAt,
        },
        uid: uid || '',
    };
}

// ─────────────────────────────────────────────────────────────────────────
//  ENCODE
//  Short keys, ids not names, no derived display values. The legend for every
//  key is the table below; keep it in step with decodeBlob().
// ─────────────────────────────────────────────────────────────────────────
//  v   schema      hd handle    rl role      rg region    ps playstyle
//  ch  champion    pa path      ag age       sa startAge  yr year   wk week
//  at  8 attrs (fractional, 3dp)   pt 8 potential (int)   tr trait ids
//  fm  form        hy hype      vm valueMult sc softCap
//  cl  clubId      ct clubTier  stt status   cm chemistry
//  mn  [gold, followers, legacy]
//  to  [games,wins,losses,kills,deaths,assists,mvps,pentas,ratingSum,peakOVR]
//  sq  [mmr, peakMMR, games, wins, losses]
//  hi  [[year, splitIdx, teamId, w, l, placement], ...]   chronological
//  aw  [[awardId, year, splitIdx, teamId], ...]           newest first
//  at2 { awardId: count }  FULL tally — stays correct when `aw` is trimmed
//  tp  trophy count        same reason
//  cb  { t, mo, se: { ROLE: [cardId, name, rating] }, ch: [[y,role,in,out,why]] }
//  pk  perk ids   mo2 monument ids   ms milestone ids
//  fl  [retired, hallOfLegends, everSigned]
//  pr  [[championId, games], ...]
//  le  earnedScore   lb boughtScore
// ─────────────────────────────────────────────────────────────────────────
function encodeBlob(raw, pre) {
    const p = obj(raw.player);
    const totals = obj(raw.totals);
    const soloq = obj(raw.soloq);
    const money = obj(raw.money);
    const inv = obj(raw.inventory);
    const club = obj(raw.club);
    const flags = obj(raw.flags);
    const time = obj(raw.time);

    const attrs = obj(p.attrs);
    const potential = obj(p.potential);

    const splitIdx = (s) => (s === 'summer' ? 1 : 0);

    // Chronological. Trimmed from the FRONT (oldest first) when over budget.
    const hi = arr(raw.history).filter(Boolean).map(h => ([
        Math.round(Number(h.year) || 0),
        splitIdx(h.split),
        typeof h.teamId === 'string' ? h.teamId : '',
        Math.round(Number(h.w) || 0),
        Math.round(Number(h.l) || 0),
        Math.round(Number(h.placement) || 0),
    ])).slice(-HISTORY_MAX);

    // Newest first, so trimming from the END drops the oldest honours.
    const awardRows = pre.awards.slice().reverse();
    const aw = awardRows.slice(0, AWARDS_MAX).map(a => ([
        a.id,
        Math.round(Number(a.year) || 0),
        splitIdx(a.split),
        typeof a.teamId === 'string' ? a.teamId : '',
    ]));

    // The FULL tally, so the counts a viewer reads stay correct even after `aw`
    // has been trimmed. ~360 B for every award kind there is.
    const at2 = {};
    for (const a of pre.awards) at2[a.id] = (at2[a.id] || 0) + 1;

    const seats = {};
    for (const seat of ROSTER_SEATS) {
        const card = obj(club.roster)[seat];
        if (!card || typeof card.name !== 'string') continue;
        seats[seat] = [
            Number.isFinite(Number(card.id)) ? Math.round(Number(card.id)) : -2,
            cleanText(card.name, 24),
            clampInt(card.rating, 1, 99, 60),
        ];
    }

    const pr = Object.entries(obj(p.proficiency))
        .filter(([id, n]) => CHAMPION_BY_ID[id] && Number(n) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, PROFICIENCY_MAX)
        .map(([id, n]) => [id, Math.min(9999, Math.round(Number(n)))]);

    const blob = {
        v: BOARD_VERSION,
        hd: cleanText(p.handle, CAREER_STR_MAX.handle) || 'Rookie',
        rl: pre.role,
        rg: pre.region,
        ps: typeof p.playstyle === 'string' ? p.playstyle : '',
        ch: CHAMPION_BY_ID[p.champion] ? p.champion : '',
        pa: PATH_BY_ID[p.path] ? p.path : 'precomp',
        ag: clampInt(p.age, 0, RETIREMENT_AGE_FORCED, 18),
        sa: clampInt(p.startAge, 0, RETIREMENT_AGE_FORCED, 13),
        yr: clampInt(time.year, DEFAULT_START_YEAR, DEFAULT_START_YEAR + 60, DEFAULT_START_YEAR),
        wk: clampInt(time.week, 1, WEEKS_PER_YEAR, 1),

        // THREE DECIMALS, not integers. Attributes are fractional on purpose —
        // training moves them by tenths — and this is the one place that could
        // quietly round them away.
        at: ATTR_KEYS.map(k => Math.round(clamp(Number(attrs[k]) || 0, ATTR_MIN, ATTR_MAX) * 1000) / 1000),
        pt: ATTR_KEYS.map(k => clampAttr(Number(potential[k]) || 0)),
        tr: arr(p.traits).filter(t => typeof t === 'string' && TRAIT_BY_ID[t]),

        // Form is published because toCardStats() folds it into `frm` at 45%
        // weight, so a stranger's card would not match what its owner sees
        // without it. morale / energy / health are NOT published: private
        // condition, and not card inputs.
        fm: clampInt(p.form, 0, 100, 50),
        hy: Math.max(0, Math.round(Number(p.hype) || 0)),
        vm: Math.round((Number(p.valueMult) || 0) * 1000) / 1000,
        sc: clampInt(p.softCap, 0, ATTR_MAX, 0),

        cl: cleanText(p.clubId, CAREER_STR_MAX.teamId),
        ct: clampInt(p.clubTier, 0, 3, 0),
        stt: SQUAD_STATUS[p.status] ? p.status : 'sub',
        cm: clampInt(p.chemistry, 0, 100, 50),

        mn: [
            Math.max(0, Math.round(Number(money.gold) || 0)),
            Math.max(0, Math.round(Number(money.followers) || 0)),
            Math.max(0, Math.round(Number(money.legacy) || 0)),
        ],
        to: [
            Math.max(0, Math.round(Number(totals.games) || 0)),
            Math.max(0, Math.round(Number(totals.wins) || 0)),
            Math.max(0, Math.round(Number(totals.losses) || 0)),
            Math.max(0, Math.round(Number(totals.kills) || 0)),
            Math.max(0, Math.round(Number(totals.deaths) || 0)),
            Math.max(0, Math.round(Number(totals.assists) || 0)),
            Math.max(0, Math.round(Number(totals.mvps) || 0)),
            Math.max(0, Math.round(Number(totals.pentakills) || 0)),
            Math.max(0, Math.round(Number(totals.ratingSum) || 0)),
            pre.peak,
        ],
        sq: [
            clampInt(soloq.mmr, 0, MMR_MAX, 0),
            clampInt(soloq.peakMMR, 0, MMR_MAX, 0),
            Math.max(0, Math.round(Number(soloq.games) || 0)),
            Math.max(0, Math.round(Number(soloq.wins) || 0)),
            Math.max(0, Math.round(Number(soloq.losses) || 0)),
        ],

        hi, aw, at2,
        tp: pre.trophies.length,

        cb: {
            t: cleanText(club.teamId, CAREER_STR_MAX.teamId),
            mo: Math.round((Number(club.momentum) || 0) * 100) / 100,
            se: seats,
            ch: arr(club.changes).filter(Boolean).slice(0, CHANGES_MAX).map(x => ([
                Math.round(Number(x.year) || 0),
                normRole(x.role),
                cleanText(x.inName, 24),
                cleanText(x.outName, 24),
                cleanText(x.reason, 40),
            ])),
        },

        pk: arr(inv.perks).filter(id => PERK_BY_ID[id]),
        mo2: arr(inv.monuments).filter(id => MONUMENT_BY_ID[id]),
        ms: Array.from(claimedMilestoneIds(raw)).filter(id => MILESTONE_BY_ID[id]),
        fl: [
            flags.retired === true ? 1 : 0,
            flags.hallOfLegends === true ? 1 : 0,
            flags.everSigned === true ? 1 : 0,
        ],
        pr,
        le: earnedLegacyScore(raw),
        lb: monumentScore(raw),
    };

    // TRIM ORDER, documented and asserted by tools/boardCheck.mjs: awards
    // oldest-first, then history oldest-first, then proficiency. `at2` and `tp`
    // are never trimmed, so every COUNT a viewer reads stays correct however
    // much of the itemised list had to go.
    let out = JSON.stringify(blob);
    while (out.length > BOARD_BLOB_BYTES_MAX && blob.aw.length > 0) {
        blob.aw.pop();
        out = JSON.stringify(blob);
    }
    while (out.length > BOARD_BLOB_BYTES_MAX && blob.hi.length > 0) {
        blob.hi.shift();
        out = JSON.stringify(blob);
    }
    while (out.length > BOARD_BLOB_BYTES_MAX && blob.pr.length > 0) {
        blob.pr.pop();
        out = JSON.stringify(blob);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  SANITISE — a Firestore document is hostile input
// ─────────────────────────────────────────────────────────────────────────
/**
 * One board row, made safe to render.
 *
 * Returns an object in which NO field is null, undefined, NaN or Infinity —
 * that is exactly what stops careerRender's BAD_TOKENS check firing on the
 * `d.field || 0` failure mode of a screen displaying foreign documents.
 */
export function sanitizeRow(id, data) {
    const d = obj(data);
    const retired = d.retired === true;
    const earned = bounded('earnedScore', d.earnedScore);
    const teamId = cleanText(d.teamId, CAREER_STR_MAX.teamId);
    const team = teamId ? (teamById(teamId) || null) : null;

    return {
        uid: cleanText(id, 128),
        isMe: false,
        v: bounded('v', d.v),
        careerId: cleanText(d.careerId, CAREER_STR_MAX.careerId),
        slot: bounded('slot', d.slot),
        handle: cleanText(d.handle, CAREER_STR_MAX.handle) || 'Unknown',
        displayName: cleanText(d.displayName, CAREER_STR_MAX.displayName),
        role: normRole(d.role),
        region: normRegion(d.region),
        teamId,
        // Resolved locally. A fabricated org reads "Unknown Org" rather than
        // putting a remote string on screen.
        team,
        teamName: team ? team.name : (teamId ? 'Unknown Org' : 'Free Agent'),
        retired,
        hallOfLegends: d.hallOfLegends === true,
        age: bounded('age', d.age),
        years: bounded('years', d.years),
        ovr: bounded('ovr', d.ovr),
        peakOVR: bounded('peakOVR', d.peakOVR),
        peakMMR: bounded('peakMMR', d.peakMMR),
        games: bounded('games', d.games),
        wins: bounded('wins', d.wins),
        losses: bounded('losses', d.losses),
        earnedScore: earned,
        boughtScore: bounded('boughtScore', d.boughtScore),
        finishedScore: retired ? earned : -1,
        titles: bounded('titles', d.titles),
        worlds: bounded('worlds', d.worlds),
        trophies: bounded('trophies', d.trophies),
        updatedAt: clampInt(d.updatedAt, 0, 4102444800000, 0),
    };
}

/** The counts a dossier must DISPLAY rather than recompute. earnedLegacyScore()
 *  needs the complete uncapped awards array, so recomputing it off a trimmed
 *  blob reads low — which looks like a bug in the score rather than in the
 *  transport. The row is the authority for every figure here. */
export function remoteFiguresFrom(row) {
    if (!row) return null;
    return {
        earnedScore: row.earnedScore,
        boughtScore: row.boughtScore,
        trophyCount: row.trophies,
        titles: row.titles,
        worlds: row.worlds,
        peakOVR: row.peakOVR,
        displayName: row.displayName,
        slot: row.slot,
        updatedAt: row.updatedAt,
        retired: row.retired,
        hallOfLegends: row.hallOfLegends,
    };
}

/** Decode one dossier document into a career-shaped object, or null. Never
 *  throws: a malformed tuple is DROPPED, not propagated. */
export function sanitizeDossier(uid, data) {
    const d = obj(data);
    if (typeof d.blob !== 'string' || !d.blob) return null;
    if (d.blob.length > BOARD_BLOB_BYTES_MAX * 2) return null;

    let parsed = null;
    try { parsed = JSON.parse(d.blob); } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // A document written by a NEWER client than this one cannot be trusted to
    // mean what these keys mean here.
    if (Math.round(Number(parsed.v) || 0) > BOARD_VERSION) return null;

    try { return reifyCareer(parsed); } catch (e) { return null; }
}

/**
 * Rebuild a full career object from a decoded blob.
 *
 * Built on blankCareer() so it can never drift as save fields are added, and
 * finished through hydrateForeignCareer() so a downloaded career is clamped by
 * the exact same tested code path importCareerSlots() trusts.
 *
 * `created: true` is not cosmetic — hallOfLegendsEligible() returns false
 * without it, and so does every other awards.js reader that gates on it.
 */
export function reifyCareer(parsed) {
    const b = obj(parsed);
    const out = blankCareer();
    out.created = true;

    const role = normRole(b.rl);
    const region = normRegion(b.rg);
    const at = arr(b.at);
    const pt = arr(b.pt);
    const to = arr(b.to);
    const sq = arr(b.sq);
    const mn = arr(b.mn);
    const fl = arr(b.fl);
    const cb = obj(b.cb);

    const attrs = {};
    const potential = {};
    ATTR_KEYS.forEach((k, i) => {
        const a = Number(at[i]);
        const q = Number(pt[i]);
        attrs[k] = Number.isFinite(a) ? clamp(a, ATTR_MIN, ATTR_MAX) : 30;
        potential[k] = Number.isFinite(q) ? clampAttr(q) : 75;
    });

    const clubId = cleanText(b.cl, CAREER_STR_MAX.teamId);

    out.player = {
        ...out.player,
        handle: cleanText(b.hd, CAREER_STR_MAX.handle) || 'Rookie',
        region,
        role,
        playstyle: typeof b.ps === 'string' ? b.ps : '',
        champion: CHAMPION_BY_ID[b.ch] ? b.ch : '',
        path: PATH_BY_ID[b.pa] ? b.pa : 'precomp',
        startAge: clampInt(b.sa, 0, RETIREMENT_AGE_FORCED, 13),
        age: clampInt(b.ag, 0, RETIREMENT_AGE_FORCED, 18),
        attrs,
        potential,
        traits: arr(b.tr).filter(t => typeof t === 'string' && TRAIT_BY_ID[t]),
        softCap: clampInt(b.sc, 0, ATTR_MAX, 0),
        valueMult: clamp(Number(b.vm) || 0, 0, 5),
        proficiency: arr(b.pr).reduce((m, row) => {
            if (!Array.isArray(row)) return m;
            const [id, n] = row;
            if (CHAMPION_BY_ID[id] && Number(n) > 0) m[id] = Math.min(9999, Math.round(Number(n)));
            return m;
        }, {}),
        form: clampInt(b.fm, 0, 100, 50),
        hype: Math.max(0, Math.round(Number(b.hy) || 0)),
        clubId: clubId || null,
        clubTier: clampInt(b.ct, 0, 3, 0) || null,
        status: SQUAD_STATUS[b.stt] ? b.stt : 'sub',
        chemistry: clampInt(b.cm, 0, 100, 50),
        // A stranger's contract is not published: it is private, and nothing on
        // the dossier reads it.
        contract: null,
    };

    out.time = {
        year: clampInt(b.yr, DEFAULT_START_YEAR, DEFAULT_START_YEAR + 60, DEFAULT_START_YEAR),
        week: clampInt(b.wk, 1, WEEKS_PER_YEAR, 1),
    };

    out.money = {
        gold: Math.max(0, Math.round(Number(mn[0]) || 0)),
        followers: Math.max(0, Math.round(Number(mn[1]) || 0)),
        legacy: Math.max(0, Math.round(Number(mn[2]) || 0)),
    };

    out.totals = {
        games: Math.max(0, Math.round(Number(to[0]) || 0)),
        wins: Math.max(0, Math.round(Number(to[1]) || 0)),
        losses: Math.max(0, Math.round(Number(to[2]) || 0)),
        kills: Math.max(0, Math.round(Number(to[3]) || 0)),
        deaths: Math.max(0, Math.round(Number(to[4]) || 0)),
        assists: Math.max(0, Math.round(Number(to[5]) || 0)),
        mvps: Math.max(0, Math.round(Number(to[6]) || 0)),
        pentakills: Math.max(0, Math.round(Number(to[7]) || 0)),
        ratingSum: Math.max(0, Math.round(Number(to[8]) || 0)),
        peakOVR: clampInt(to[9], 0, 99, 0),
    };

    out.soloq = {
        mmr: clampInt(sq[0], 0, MMR_MAX, 0),
        peakMMR: clampInt(sq[1], 0, MMR_MAX, 0),
        games: Math.max(0, Math.round(Number(sq[2]) || 0)),
        wins: Math.max(0, Math.round(Number(sq[3]) || 0)),
        losses: Math.max(0, Math.round(Number(sq[4]) || 0)),
    };

    // teamId is CAPPED AND CLEANED, not merely type-checked. An org id that does
    // not resolve is rendered as TEXT by the season table — CareerDossier does
    // `teamById(h.teamId) || String(h.teamId)` — so an uncapped one puts an
    // arbitrarily long, bidi-laden remote string straight on the page. Same
    // treatment as club.teamId and the row's own teamId: bounded on the way in,
    // resolved locally on the way out.
    out.history = arr(b.hi).filter(Array.isArray).map(h => ({
        year: Math.round(Number(h[0]) || 0),
        split: SPLITS[Math.round(Number(h[1]) || 0)] || 'spring',
        teamId: cleanText(h[2], CAREER_STR_MAX.teamId) || null,
        w: Math.max(0, Math.round(Number(h[3]) || 0)),
        l: Math.max(0, Math.round(Number(h[4]) || 0)),
        placement: Math.max(0, Math.round(Number(h[5]) || 0)),
        awards: [],
    }));

    // Award NAMES come from AWARD_BY_ID, never off the wire.
    out.awards = arr(b.aw).filter(Array.isArray).reduce((list, a) => {
        const def = AWARD_BY_ID[a[0]];
        if (!def) return list;
        list.push({
            id: def.id,
            name: def.name,
            tier: def.tier,
            year: Math.round(Number(a[1]) || 0),
            split: SPLITS[Math.round(Number(a[2]) || 0)] || 'spring',
            // Capped and cleaned for the same reason as history above.
            teamId: cleanText(a[3], CAREER_STR_MAX.teamId) || null,
        });
        return list;
    }, []);
    // Newest-first on the wire; the screens all read chronologically.
    out.awards.reverse();

    // Trophies are the major/legendary awards. Rebuilt from `aw` rather than
    // shipped separately, with the authoritative COUNT carried in `tp` so a
    // trimmed award list still reports the right number.
    out.trophies = out.awards
        .filter(a => AWARD_BY_ID[a.id] && AWARD_BY_ID[a.id].tier !== 'minor')
        .map(a => ({ id: a.id, name: a.name, year: a.year, kind: AWARD_BY_ID[a.id].tier }));

    const clubTeamId = cleanText(cb.t, CAREER_STR_MAX.teamId);
    const clubTeam = clubTeamId ? teamById(clubTeamId) : null;
    const seats = {};
    for (const [seat, tuple] of Object.entries(obj(cb.se))) {
        if (!ROSTER_SEATS.includes(seat) || !Array.isArray(tuple)) continue;
        const card = safeSeatCard(tuple, seat, clubTeam ? clubTeam.name : 'Free Agent', out.time.year, region);
        if (card) seats[seat] = card;
    }

    out.club = {
        teamId: clubTeamId || null,
        momentum: clamp(Number(cb.mo) || 0, -1, 1),
        roster: seats,
        changes: arr(cb.ch).filter(Array.isArray).map(x => ({
            year: Math.round(Number(x[0]) || 0),
            role: normRole(x[1]),
            inName: cleanText(x[2], 24),
            outName: cleanText(x[3], 24),
            reason: cleanText(x[4], 40),
        })),
    };

    out.inventory = {
        ...out.inventory,
        perks: arr(b.pk).filter(id => PERK_BY_ID[id]),
        monuments: arr(b.mo2).filter(id => MONUMENT_BY_ID[id]),
    };

    out.flags = {
        ...out.flags,
        retired: Number(fl[0]) === 1,
        hallOfLegends: Number(fl[1]) === 1,
        everSigned: Number(fl[2]) === 1,
        milestones: arr(b.ms).filter(id => MILESTONE_BY_ID[id]),
    };

    // The authoritative figures, carried so a trimmed blob still displays the
    // truth. Read through remoteFiguresFrom(row) in preference to these.
    out.boardTrophyCount = clampInt(b.tp, 0, CAREER_BOUNDS.trophies.max, out.trophies.length);
    out.boardEarned = clampInt(b.le, 0, CAREER_BOUNDS.earnedScore.max, 0);
    out.boardBought = clampInt(b.lb, 0, CAREER_BOUNDS.boughtScore.max, 0);

    // Final clamp through the career's own hydrate — pure, and the same path a
    // cloud-restored save takes. It must NEVER be followed by a save.
    return hydrateForeignCareer(out);
}

/**
 * Rebuild one club seat as a renderable card.
 *
 * The validateCard() idiom: if the id resolves in the card database, the DB
 * card is the truth and only the (form-shifted) rating survives from the wire.
 * Otherwise a COMPLETE card is built locally.
 *
 * Completeness is mandatory, not defensive padding: Card.svelte does
 * card.name.slice(0, 2) and card.quality.toLowerCase() with no guard, and the
 * career hydrate() admits a club.roster seat on `typeof card.name === 'string'`
 * ALONE — so a half-card really can reach the template.
 */
export function safeSeatCard(seat, role, teamName, year, region) {
    if (!Array.isArray(seat)) return null;
    const rating = clampInt(seat[2], 1, 99, 60);
    const rawId = Number(seat[0]);

    let dbCard = null;
    if (Number.isFinite(rawId) && rawId > 0) {
        try { dbCard = getCardById(rawId) || null; } catch (e) { dbCard = null; }
    }

    if (dbCard) {
        return {
            ...dbCard,
            stats: { ...dbCard.stats },
            uniqueId: `cb_seat_${role}`,
            rating: clampInt(rating, 1, 99, dbCard.rating),
            signature: false,
            holographic: false,
            locked: true,
        };
    }

    return {
        id: -2,
        uniqueId: `cb_seat_${role}`,
        name: cleanText(seat[1], 24) || 'Unknown',
        role,
        team: teamName || 'Free Agent',
        year: Math.round(Number(year) || DEFAULT_START_YEAR),
        rating,
        quality: ratingToQuality(rating),
        region: normRegion(region),
        stats: { mec: rating, tmf: rating, frm: rating, cmp: rating, map: rating, ldr: rating },
        signature: false,
        holographic: false,
        locked: true,
    };
}

/** The <Card> object for a dossier's own player. toCareerCard is the only safe
 *  way to build one: it sets `quality` through ratingToQuality and `name` off
 *  the handle, both of which Card.svelte dereferences without a guard. */
export function cardFromDossier(c) {
    const p = obj(c && c.player);
    const team = p.clubId ? teamById(p.clubId) : null;
    return toCareerCard(
        { ...p, role: normRole(p.role), region: normRegion(p.region) },
        team ? team.name : 'Free Agent',
        obj(c && c.time).year || DEFAULT_START_YEAR,
    );
}

/** Whether the card database is loaded. The club-roster panel must gate on
 *  this: without the DB, getTeamRoster() returns five invented synthetic names
 *  and never visibly corrects itself. */
export function boardDBReady() {
    try { return !!getDB(); } catch (e) { return false; }
}
