// ═══════════════════════════════════════════════════════════════════════════
//  LoL ULTIMATE CAREER — split objectives (the club's brief)
// ═══════════════════════════════════════════════════════════════════════════
//  Every split the club sets a brief: a TEAM target (where it expects to
//  finish), a PERSONAL one (the standard it expects from you on stage) and a
//  DEVELOPMENT one (the work it expects you to put in), plus an optional
//  STRETCH goal for a side expected to contend.
//
//  WHY THIS EXISTS. A split used to have no stated purpose: the review at its
//  close was a hidden formula, so a player could neither see a bad verdict
//  coming nor aim at a good one. The brief is that formula's public face. Each
//  objective met pays gold and morale and adds to the review score; each one
//  missed costs morale and takes points off it, which is what turns "had a bad
//  split" into a warning, a lost seat, or a torn-up contract.
//
//  PURE. Nothing in this file writes state. engine.js draws the brief into
//  season.objectives when a season is drawn and settles it in closeSplit();
//  contracts.clubReview() reads objectiveScore(); the Hub reads
//  objectiveProgress(). Targets are FIXED at draw time and persisted, because a
//  target that re-derived itself from today's numbers would move under the
//  player's feet — the whole point is a promise made at the start of the split.
//
//  IMPORTS: constants, ratings and teams only. contracts.js imports this file,
//  so this file must never import contracts.js (or engine.js, or a store).
// ═══════════════════════════════════════════════════════════════════════════

import { splitForWeek, teamById } from './constants.js';
import { calcOVR, clamp, ordinal } from './ratings.js';
import { leagueTable, teamStrength, teamStrengthWithPlayer, PLAYOFF_SPOTS } from './teams.js';

/** Review-score weight of one objective. Meeting the brief is worth NOTHING to
 *  the verdict, on purpose: it is the job you were signed to do, so doing it is
 *  the baseline and the reward for it is the gold. Missing one costs a band.
 *  Only a stretch goal -- doing more than was asked -- earns credit.
 *  MEASURED: at +5 / -7 the smoke careers (which meet ~87% of their briefs)
 *  were pushed into 'untouchable' far more often, star status raised club
 *  strength through teamStrengthWithPlayer's playChance share, and the mean
 *  match rating climbed toward careerSmoke's 7.6 hard fail. The brief has to
 *  make the review more DISCRIMINATING, never more generous -- and the shipped
 *  game already measures 7.43-7.54 across seeds 42/1234/99 without it. */
export const OBJ_MET = 0;
export const OBJ_FAILED = -8;
export const OBJ_STRETCH = 2;

/** Morale on settlement. Small against the 0-100 range and against
 *  SQUAD_STATUS.moralePull (3 a week), because morale feeds training, the
 *  match floor and the burnout ladder — see "Morale has a downside now".
 *  Asymmetric for the same reason the score is. */
export const OBJ_MORALE_MET = 2;
export const OBJ_MORALE_FAILED = -4;

/** A personal standard needs a sample. Fewer games than this and the club
 *  does not judge the rating either way. */
export const OBJ_MIN_GAMES = 4;

/** Gold per objective met, as weeks of wage, with a floor so an academy
 *  substitute's bonus is still worth reading. A stretch pays double.
 *  MEASURED, not guessed: at 6 weeks the smoke careers banked 20M gold from
 *  briefs, about as much again as their whole wage bill, and the extra shop
 *  spend moved the mean match rating toward careerSmoke's 7.6 hard fail (gear
 *  bought with it applies its attribute bonus in matches). A split is ~20
 *  weeks of wages, so 1.5 weeks an objective is a bonus, not a second salary. */
const BONUS_WEEKS = 1.5;
const BONUS_FLOOR = 150;
/** All three core objectives met in one split. */
export const CLEAN_SWEEP_MULT = 0.25;

/** The match-rating standard by squad status. A franchise player is held to a
 *  higher line than the substitute who plays one game in five. */
const RATING_BY_STATUS = { star: 7.5, starter: 7.3, rotation: 7.1, sub: 6.9, benched: 6.7 };

/** Every objective kind evalOne() knows how to judge. */
const KINDS = new Set(['table', 'rating', 'drills', 'ovr', 'stretch']);

function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

function hash01(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
}

function drillsThisSplit(c) {
    const st = c && c.flags && c.flags.splitTrained;
    if (!st || typeof st !== 'object') return 0;
    let n = 0;
    for (const v of Object.values(st)) n += Math.max(0, Math.round(num(v, 0)));
    return n;
}

function leagueRows(c) {
    const rows = Array.isArray(c && c.season && c.season.schedule) ? c.season.schedule : [];
    return rows.filter(f => f && f.kind !== 'bracket');
}

function ratingSample(c) {
    let sum = 0, n = 0;
    for (const f of Array.isArray(c && c.season && c.season.schedule) ? c.season.schedule : []) {
        if (!f || !f.played) continue;
        const r = Number(f.myRating);
        if (!Number.isFinite(r) || f.myRating === null) continue;
        sum += r; n++;
    }
    return { avg: n ? sum / n : 0, games: n };
}

/** The table read AS the club the brief belongs to, the same way closeSplit
 *  reads it, so a brief from a club the player has since left still settles
 *  against that club's division. */
function tableFor(c, obj) {
    const ctx = obj.clubId === (c.player && c.player.clubId)
        ? c
        : { ...c, player: { ...c.player, clubId: obj.clubId, clubTier: obj.tier } };
    try {
        const rows = leagueTable(ctx);
        return Array.isArray(rows) ? rows : [];
    } catch (e) { return []; }
}

/** Gold for one objective, priced off the wage at draw time. */
export function objectiveBonus(salary) {
    return Math.max(BONUS_FLOOR, Math.round(num(salary, 0) * BONUS_WEEKS));
}

// ---------------------------------------------------------------------------
//  DRAW
// ---------------------------------------------------------------------------

/**
 * Build the brief for the split the calendar is in. Returns null for a free
 * agent (nobody sets a free agent targets) or a division too small to rank.
 * Deterministic for (stamp, career) — the only randomness is a seeded pick
 * between two development objectives, so a reload never rerolls the brief.
 */
export function drawObjectives(c, stamp) {
    const p = c && c.player;
    if (!p || !p.clubId) return null;
    const team = teamById(p.clubId);
    if (!team) return null;

    const year = Math.round(num(c.time && c.time.year, 0));
    const split = splitForWeek(num(c.time && c.time.week, 1));
    const tier = num(p.clubTier, num(team.tier, 1));
    const ovr = calcOVR(p.attrs, p.role);
    const salary = num(p.contract && p.contract.salary, 0);
    const bonus = objectiveBonus(salary);
    const list = [];

    // ---- TEAM: where the club expects to finish ------------------------------
    // Expected rank is the club's place in its own division by strength, with
    // the player's seat counted in, and the target IS that rank -- the club
    // expects to finish where it is built to. Only the favourite gets a place
    // of slack (top two), and a minnow is only asked not to finish last. One
    // place of slack for everybody was measured at 93% met: not a target.
    let rows = [];
    try { rows = leagueTable(c) || []; } catch (e) { rows = []; }
    const n = rows.length;
    if (n >= 4) {
        const ranked = rows.map(r => {
            let s = 50;
            try { s = r.isMine ? teamStrengthWithPlayer(c, r.team) : teamStrength(r.team, year); } catch (e) { s = 50; }
            return { mine: !!r.isMine, s };
        }).sort((a, b) => b.s - a.s);
        const expected = Math.max(1, ranked.findIndex(r => r.mine) + 1);
        const cut = Math.min(PLAYOFF_SPOTS, n - 1);
        const target = clamp(expected, 2, n - 1);
        let title;
        if (target <= cut) title = target === cut ? `Make the playoffs (top ${target})` : `Finish in the top ${target}`;
        else title = target === n - 1 ? 'Stay off the bottom of the table' : `Finish ${ordinal(target)} or higher`;
        list.push({
            id: 'team', kind: 'table', group: 'Team',
            title, target, expected, of: n,
            note: expected <= 2 ? 'The club is built to contend.' : expected <= cut ? 'A playoff side on paper.' : 'Nobody expects a title. They expect progress.',
            bonus,
        });

        // ---- STRETCH: only for a main-league contender ------------------------
        // No penalty for missing it; that is what makes it a stretch.
        if (tier === 1 && expected <= 2) {
            list.push({
                id: 'stretch', kind: 'stretch', group: 'Stretch',
                title: expected === 1 ? `Win the ${split === 'summer' ? 'Summer' : 'Spring'} title` : 'Reach the playoff final',
                target: expected === 1 ? 'champion' : 'finalist',
                po: split === 'summer' ? 'summer_po' : 'spring_po',
                note: 'Optional. Pays double, costs nothing to miss.',
                bonus: bonus * 2,
            });
        }
    }

    // ---- PERSONAL: the standard on stage ---------------------------------------
    const status = typeof p.status === 'string' ? p.status : 'sub';
    const rating = RATING_BY_STATUS[status] || 7.0;
    list.push({
        id: 'personal', kind: 'rating', group: 'Personal',
        title: `Average a ${rating.toFixed(1)} match rating`,
        target: rating,
        note: `Judged on at least ${OBJ_MIN_GAMES} games. Fewer than that and it is not judged at all.`,
        bonus,
    });

    // ---- DEVELOPMENT: the work behind it ------------------------------------------
    // A young player with real headroom is asked to GROW; everyone else is asked
    // to put the hours in, which is also what protects them from decline.
    const age = Math.round(num(p.age, 18));
    let ceiling = 0;
    try { ceiling = calcOVR(p.potential, p.role); } catch (e) { ceiling = 0; }
    const headroom = ceiling - ovr;
    const growth = age <= 21 && headroom >= 6 && hash01('obj:' + stamp) < 0.6;
    if (growth) {
        const gain = headroom >= 12 ? 3 : 2;
        list.push({
            id: 'develop', kind: 'ovr', group: 'Development',
            title: `Reach ${ovr + gain} overall`,
            target: ovr + gain, start: ovr,
            note: `You are ${ovr} today. Training is the only thing that moves it on purpose.`,
            bonus,
        });
    } else {
        const drills = age <= 17 ? 12 : age <= 20 ? 10 : age <= 25 ? 8 : 7;
        list.push({
            id: 'develop', kind: 'drills', group: 'Development',
            // Mode-neutral on purpose: flags.splitTrained counts a minigame drill
            // and a spent attribute point alike (training.spendPoint books it too).
            title: `Complete ${drills} training sessions`,
            target: drills,
            note: 'Every drill or attribute point you put into training counts, maintenance included.',
            bonus,
        });
    }

    return {
        stamp, year, split,
        clubId: p.clubId, tier,
        list,
        result: null,
    };
}

// ---------------------------------------------------------------------------
//  PROGRESS
// ---------------------------------------------------------------------------

/** The brief that applies to the player right now, or null. A brief drawn for
 *  another club, or never drawn, is not theirs to be judged on. */
export function activeObjectives(c) {
    const o = c && c.season && c.season.objectives;
    if (!o || typeof o !== 'object' || !Array.isArray(o.list) || !o.list.length) return null;
    if (!c.player || !c.player.clubId || o.clubId !== c.player.clubId) return null;
    return o;
}

function evalOne(c, obj, item, final) {
    const out = {
        id: String(item.id || item.kind || ''),
        kind: item.kind, group: item.group || '', title: String(item.title || ''),
        note: String(item.note || ''), bonus: Math.max(0, Math.round(num(item.bonus, 0))),
        stretch: item.kind === 'stretch',
        state: 'open', progress: 0, value: '', detail: '',
    };

    if (item.kind === 'table') {
        const rows = tableFor(c, obj);
        const mine = rows.find(r => r && r.isMine) || null;
        const league = leagueRows(c);
        const total = league.length;
        const played = league.filter(f => f.played).length;
        const done = total > 0 && played >= total;
        const rank = mine ? mine.rank : null;
        const target = num(item.target, 1);
        out.progress = total ? played / total : 0;
        out.value = rank ? ordinal(rank) : '-';
        if (!rank || played === 0) {
            out.state = final ? 'failed' : 'open';
            out.detail = played === 0 ? 'No league games played yet.' : 'Not in the table.';
        } else if (done || final) {
            out.state = rank <= target ? 'met' : 'failed';
            out.detail = `Finished ${ordinal(rank)} of ${rows.length}.`;
        } else {
            out.state = rank <= target ? 'ontrack' : 'behind';
            out.detail = `${ordinal(rank)} of ${rows.length} after ${played} of ${total} games.`;
        }
    } else if (item.kind === 'rating') {
        const { avg, games } = ratingSample(c);
        const target = num(item.target, 7);
        out.value = games ? avg.toFixed(2) : '-';
        out.progress = clamp(games / OBJ_MIN_GAMES, 0, 1);
        if (games < OBJ_MIN_GAMES) {
            out.state = final ? 'unjudged' : 'open';
            out.detail = final
                ? `Only ${games} game${games === 1 ? '' : 's'} played. Not judged.`
                : `${games} of ${OBJ_MIN_GAMES} games needed before it counts.`;
        } else if (final) {
            out.state = avg >= target ? 'met' : 'failed';
            out.detail = `${avg.toFixed(2)} across ${games} games.`;
        } else {
            out.state = avg >= target ? 'ontrack' : 'behind';
            out.detail = `${avg.toFixed(2)} across ${games} games.`;
        }
    } else if (item.kind === 'drills') {
        const done = drillsThisSplit(c);
        const target = Math.max(1, num(item.target, 6));
        out.value = `${done}/${target}`;
        out.progress = clamp(done / target, 0, 1);
        if (done >= target) { out.state = 'met'; out.detail = `${done} training sessions this split.`; }
        else {
            out.state = final ? 'failed' : 'open';
            out.detail = `${target - done} more to go.`;
        }
    } else if (item.kind === 'ovr') {
        const now = calcOVR(c.player && c.player.attrs, c.player && c.player.role);
        const target = num(item.target, now + 1);
        const start = num(item.start, target - 2);
        out.value = String(now);
        out.progress = clamp((now - start) / Math.max(1, target - start), 0, 1);
        if (now >= target) { out.state = 'met'; out.detail = `${now} overall.`; }
        else {
            out.state = final ? 'failed' : 'open';
            out.detail = `${now} now, ${target - now} to go.`;
        }
    } else if (item.kind === 'stretch') {
        const res = c.season && c.season.results ? c.season.results[item.po] : null;
        const hit = item.target === 'champion' ? res === 'champion' : (res === 'champion' || res === 'finalist');
        out.value = res === 'champion' ? 'Champions' : res === 'finalist' ? 'Finalists' : res ? 'Out' : '-';
        out.progress = hit ? 1 : 0;
        if (hit) { out.state = 'met'; out.detail = 'Done.'; }
        else if (res || final) { out.state = 'missed'; out.detail = res ? 'Knocked out short of it.' : 'Not reached.'; }
        else { out.state = 'open'; out.detail = 'Decided in the playoffs.'; }
    }
    return out;
}

/**
 * Every objective with a live state:
 *   met / failed     settled (or locked in early — a drill count cannot go back down)
 *   ontrack / behind "if the split ended today", for the table and the rating
 *   open             cumulative, or nothing to judge yet
 *   unjudged         final, but too few games to judge
 *   missed           a stretch goal that did not happen (no penalty)
 * `final: true` is the settlement read: everything still open is decided.
 */
export function objectiveProgress(c, opts = {}) {
    const o = opts.obj || activeObjectives(c);
    if (!o) return null;
    const final = !!opts.final;
    // A rotten item is dropped, never evaluated: evalOne dereferences it, and a
    // throw here would take the whole panel (and the review score) with it.
    const items = o.list
        .filter(item => item && typeof item === 'object' && KINDS.has(item.kind))
        .map(item => evalOne(c, o, item, final));
    if (!items.length) return null;
    const core = items.filter(i => !i.stretch);
    return {
        year: o.year, split: o.split, clubId: o.clubId,
        items,
        met: items.filter(i => i.state === 'met').length,
        failed: items.filter(i => i.state === 'failed').length,
        coreMet: core.filter(i => i.state === 'met').length,
        coreTotal: core.length,
        settled: !!o.result,
    };
}

/** Score weight of a settled list. A missed stretch and an unjudged rating weigh nothing. */
function weigh(items) {
    let s = 0;
    for (const i of items) {
        if (i.state === 'met') s += i.stretch ? OBJ_STRETCH : OBJ_MET;
        else if (i.state === 'failed') s += OBJ_FAILED;
    }
    return s;
}

/**
 * What the brief adds to the club review. Once settled it is the settled
 * number; before that it is "if the split ended today" for the two objectives
 * that have a today (table, rating), scaled in by how much of the league has
 * been played so three games cannot hang a career. Open cumulative objectives
 * count for nothing until they are met or the split closes — the player can
 * still do the drills, so the projection must not bill them yet.
 */
export function objectiveScore(c) {
    const o = activeObjectives(c);
    if (!o) return 0;
    if (o.result && Number.isFinite(Number(o.result.score))) return Number(o.result.score);
    const prog = objectiveProgress(c);
    if (!prog) return 0;
    const league = leagueRows(c);
    const played = league.filter(f => f.played).length;
    const scale = clamp(played / 6, 0, 1);
    let s = 0;
    for (const i of prog.items) {
        let w = 0;
        if (i.state === 'met') w = i.stretch ? OBJ_STRETCH : OBJ_MET;
        else if (i.state === 'ontrack') w = OBJ_MET * scale;
        else if (i.state === 'behind') w = OBJ_FAILED * scale;
        s += w;
    }
    return Math.round(s * 10) / 10;
}

/**
 * The settlement, computed but not applied: final states, the score, the gold
 * and the morale. engine.settleObjectives() writes it.
 */
export function settleObjectivesResult(c, obj) {
    const prog = objectiveProgress(c, { obj, final: true });
    if (!prog) return null;
    const core = prog.items.filter(i => !i.stretch);
    let gold = 0;
    let morale = 0;
    for (const i of prog.items) {
        if (i.state === 'met') { gold += i.bonus; morale += OBJ_MORALE_MET; }
        else if (i.state === 'failed') morale += OBJ_MORALE_FAILED;
    }
    const sweep = core.length > 0 && core.every(i => i.state === 'met');
    if (sweep) gold += Math.round(core.reduce((s, i) => s + i.bonus, 0) * CLEAN_SWEEP_MULT);
    const teamItem = prog.items.find(i => i.kind === 'table');
    return {
        items: prog.items.map(i => ({ id: i.id, kind: i.kind, title: i.title, state: i.state, detail: i.detail, bonus: i.bonus, stretch: i.stretch })),
        met: prog.items.filter(i => i.state === 'met').length,
        failed: prog.items.filter(i => i.state === 'failed').length,
        total: core.length,
        sweep,
        gold,
        morale: clamp(morale, -12, 9),
        chemistry: teamItem ? (teamItem.state === 'met' ? 3 : teamItem.state === 'failed' ? -3 : 0) : 0,
        score: weigh(prog.items),
    };
}
