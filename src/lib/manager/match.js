// ===========================================================================
//  ULTIMATE MANAGER -- the match engine
//
//  A game is decided in three phases -- early (MEC, FRM), mid (MAP, LDR) and
//  late (TMF, CMP) -- each a role-weighted comparison of the ten players on the
//  day. What each phase is WORTH is the average of both teams' tactics, so a
//  plan steers the game toward the phase your roster wins. On top of that:
//    - a tactic that counters theirs (TACTIC_BEATS) is worth COUNTER_EDGE
//    - a tactic that suits your players' attributes is worth up to +2
//    - chemistry, morale, form
//    - the DRAFT: comfort (signature and pool champions), the split's meta,
//      the lane matchup against the champion across from you, and the five's
//      synergies (famous duos and a team composition)
//    - up to four calls a game -- the level-one plan, the 14-minute plan, the
//      20-minute call and, in a close game, the late-game call -- each decided
//      by an edge your five actually have over theirs
//  Personality turns up in variance (Hothead, Professional), big stages
//  (Showman, Nervous) and deciders (Clutch).
//
//  The draft is the tournament order (DRAFT_ORDER): three bans each, picks
//  B1 R1R2 B2B3 R3, two more bans each, picks R4 B4B5 R5. Under fearless, a
//  champion played earlier in the series is gone for both sides.
//
//  Pure: takes players and teams, returns results. Uses the rng it is given.
// ===========================================================================
import {
    ROLE_IDS, ROLE_BY_ID, TACTIC_BY_ID, TACTICS, tacticEdge, COUNTER_EDGE, champsFor, champReleased, ATTR_KEYS,
    DRAFT_ORDER, FAV_BONUS, POOL_BONUS, META_BONUS, MATCHUP_STEP, DUO_SYNERGIES, COMP_STYLES, COMP_TACTIC_BONUS,
    NO_FRONTLINE_PENALTY,
} from './data.js';
import { ovrAs, ovrOf, fx } from './people.js';
import { clamp, normal, sigmoid, pick, shuffle } from './util.js';
import { metaFor, CHAMPION_BY_ID, championMatchup } from '../career/constants.js';

export const PHASES = ['early', 'mid', 'late'];
export const PHASE_ATTRS = { early: ['mec', 'frm'], mid: ['map', 'ldr'], late: ['tmf', 'cmp'] };
const PHASE_ROLE_W = {
    early: { TOP: 0.2, JNG: 0.25, MID: 0.25, ADC: 0.15, SUP: 0.15 },
    mid:   { TOP: 0.15, JNG: 0.25, MID: 0.2, ADC: 0.15, SUP: 0.25 },
    late:  { TOP: 0.15, JNG: 0.15, MID: 0.25, ADC: 0.3, SUP: 0.15 },
};
const WIN_SCALE = 6;          // a 6-point edge is a ~73% game; upsets stay possible
/** What a player loses outside his role(s). */
export const OFF_ROLE_PENALTY = 8;
const OFF_ROLE = OFF_ROLE_PENALTY;
/** Team edge is worth this many seat points when a pick is weighed: one seat
 *  carries about a fifth of every phase. */
const EDGE_TO_SEAT = 5;
export { FAV_BONUS, POOL_BONUS, META_BONUS, MATCHUP_STEP };

// ---------------------------------------------------------------- lineups
/** The five who play: the team's saved lineup where it is valid, otherwise the
 *  best available player per role (off-role as a last resort). */
export function lineupOf(team, P) {
    const roster = (team.roster || []).map(id => P[id]).filter(Boolean);
    const used = new Set();
    const out = {};
    for (const role of ROLE_IDS) {
        const id = team.lineup && team.lineup[role];
        const p = id && P[id];
        if (p && roster.includes(p) && !used.has(p.id)) { out[role] = p; used.add(p.id); }
    }
    for (const role of ROLE_IDS) {
        if (out[role]) continue;
        const cands = roster.filter(p => !used.has(p.id))
            .map(p => ({ p, v: ovrAs(p, role) - (p.roles.includes(role) || p.role === role ? 0 : OFF_ROLE) }))
            .sort((x, y) => y.v - x.v);
        if (cands.length) { out[role] = cands[0].p; used.add(cands[0].p.id); }
    }
    return out;
}

/** Best five by role, for AI teams and for the "Auto-pick lineup" button. */
export function bestLineup(team, P) {
    const roster = (team.roster || []).map(id => P[id]).filter(Boolean);
    const out = {};
    const used = new Set();
    // Natural role first, strongest first, then fill holes.
    const ranked = roster.slice().sort((a, b) => ovrOf(b) - ovrOf(a));
    for (const p of ranked) {
        if (!out[p.role] && !used.has(p.id)) { out[p.role] = p.id; used.add(p.id); }
    }
    for (const role of ROLE_IDS) {
        if (out[role]) continue;
        const c = roster.filter(p => !used.has(p.id))
            .sort((a, b) => (ovrAs(b, role) - (b.roles.includes(role) ? 0 : OFF_ROLE)) - (ovrAs(a, role) - (a.roles.includes(role) ? 0 : OFF_ROLE)))[0];
        if (c) { out[role] = c.id; used.add(c.id); }
    }
    return out;
}

/** Mean OVR of the five, the number tables and previews show as team strength. */
export function teamStrength(team, P) {
    const lu = lineupOf(team, P);
    const vals = ROLE_IDS.map(r => lu[r] ? ovrAs(lu[r], r) - (lu[r].roles.includes(r) ? 0 : OFF_ROLE) : 50);
    return vals.reduce((s, v) => s + v, 0) / ROLE_IDS.length;
}

// ---------------------------------------------------------------- tactics
/** How well a tactic suits these five, -2..2, and a word for it. */
export function tacticFit(lineup, tacticId) {
    const t = TACTIC_BY_ID[tacticId];
    if (!t) return { bonus: 0, label: 'OK', score: 0 };
    const keys = Object.keys(t.fit);
    let s = 0, n = 0;
    for (const role of t.fitRoles) {
        const p = lineup[role];
        if (!p) continue;
        const m = keys.reduce((acc, k) => acc + (p.a[k] || 0), 0) / keys.length;
        s += m - ovrOf(p);
        n++;
    }
    const score = n ? s / n : 0;
    const bonus = clamp(score / 2.5, -2, 2);
    const label = bonus >= 1 ? 'Great fit' : bonus >= 0.3 ? 'Good fit' : bonus > -0.3 ? 'Okay fit' : 'Poor fit';
    return { bonus, label, score };
}

/** The tactic that suits a lineup best. AI teams default to it. */
export function bestTactic(lineup) {
    let best = TACTICS[0].id, bv = -Infinity;
    for (const t of TACTICS) {
        const f = tacticFit(lineup, t.id).bonus;
        if (f > bv) { bv = f; best = t.id; }
    }
    return best;
}

// ---------------------------------------------------------------- champions
// A role's released champions, strongest meta first, per split. Built once: the
// draft asks for it dozens of times a game and thousands of games are simmed a year.
const _ranked = new Map();
export function rankedPool(role, year, split) {
    const key = role + ':' + year + ':' + split;
    let hit = _ranked.get(key);
    if (!hit) {
        const byId = metaFor(year, split).byId;
        hit = champsFor(role, year).slice().sort((a, b) => ((byId[b.id] || 0) - (byId[a.id] || 0)) || a.name.localeCompare(b.name));
        if (_ranked.size > 400) _ranked.clear();
        _ranked.set(key, hit);
    }
    return hit;
}

/** 'fav' (signature), 'pool' (wider pool) or 'none'. */
export function comfortOf(p, champId) {
    if (!p || !champId) return 'none';
    if ((p.favs || []).includes(champId)) return 'fav';
    if ((p.pool || []).includes(champId)) return 'pool';
    return 'none';
}

/** A champion's worth to the player on it: comfort plus the split's meta. */
export function pickValue(p, champId, year, split, drafter = 0, poolRank = 0) {
    if (!champId) return 0;
    let v = 0;
    const c = comfortOf(p, champId);
    if (c === 'fav') v += FAV_BONUS + drafter * 0.5;
    else if (c === 'pool') v += POOL_BONUS + poolRank * 0.5;
    const m = metaFor(year, split).byId[champId] || 0;
    v += m * (META_BONUS + (m > 0 ? drafter * 0.5 : 0));
    return v;
}

/** The lane matchup, in seat points, from the side of the first champion. */
export function matchupValue(mineId, theirsId, analyst = 0) {
    if (!mineId || !theirsId) return 0;
    const m = championMatchup(CHAMPION_BY_ID[mineId], CHAMPION_BY_ID[theirsId]);
    return m * MATCHUP_STEP * (m > 0 ? 1 + analyst * 0.2 : 1);
}

/** A word for a matchup value, for champion select and the game screen. */
export function matchupWord(v) {
    if (v >= 2.2) return { word: 'Counters', tone: 'good' };
    if (v >= 0.7) return { word: 'Favoured', tone: 'good' };
    if (v > -0.7) return { word: 'Even', tone: 'neutral' };
    if (v > -2.2) return { word: 'Losing lane', tone: 'bad' };
    return { word: 'Countered', tone: 'bad' };
}

// ---------------------------------------------------------------- synergy
const _DUO = new Map();
for (const d of DUO_SYNERGIES) { _DUO.set(d.a + '|' + d.b, d); _DUO.set(d.b + '|' + d.a, d); }
export function duoOf(a, b) { return _DUO.get(a + '|' + b) || null; }

const ARCHETYPES = ['Juggernaut', 'Diver', 'Duelist', 'Skirmisher', 'Warden', 'Vanguard', 'Battlemage', 'Specialist', 'Marksman', 'Assassin', 'Mage', 'Hypercarry', 'Poke', 'Lane Bully', 'Utility', 'Catcher', 'Enchanter'];
function archCounts(ids) {
    const n = {};
    for (const a of ARCHETYPES) n[a] = 0;
    for (const id of ids) {
        const c = CHAMPION_BY_ID[id];
        if (c && n[c.archetype] !== undefined) n[c.archetype]++;
    }
    return n;
}

/**
 * A five's synergies: up to two famous duos, its best composition style (with
 * the plan bonus when the style is the tactic being played) and the
 * no-frontline penalty. `total` is team edge.
 */
export function teamSynergy(picks, tactic = null) {
    const ids = ROLE_IDS.map(r => picks && picks[r]).filter(Boolean);
    const out = { duos: [], style: null, styleFit: false, noFront: false, total: 0 };
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const d = duoOf(ids[i], ids[j]);
            if (d) out.duos.push(d);
        }
    }
    out.duos.sort((x, y) => y.bonus - x.bonus);
    out.duos = out.duos.slice(0, 2);
    const n = archCounts(ids);
    const top = picks && picks.TOP && CHAMPION_BY_ID[picks.TOP] ? CHAMPION_BY_ID[picks.TOP].archetype : null;
    let bestV = 0;
    for (const st of COMP_STYLES) {
        if (!st.test(n, top)) continue;
        const v = st.bonus + (tactic && st.tactic === tactic ? COMP_TACTIC_BONUS : 0);
        if (v > bestV) { bestV = v; out.style = st; }
    }
    if (out.style && tactic && out.style.tactic === tactic) out.styleFit = true;
    if (ids.length === 5 && (n.Vanguard + n.Warden + n.Juggernaut) === 0) out.noFront = true;
    out.total = out.duos.reduce((s, d) => s + d.bonus, 0) + bestV - (out.noFront ? NO_FRONTLINE_PENALTY : 0);
    return out;
}

// ---------------------------------------------------------------- the draft
const other = (k) => (k === 'a' ? 'b' : 'a');

/** A fresh draft. `blue` is 'a' or 'b'; `locked` is every champion already played
 *  in this series when fearless is on. */
export function newDraft(blue = 'a', locked = []) {
    return { i: 0, blue, bans: { a: [], b: [] }, picks: { a: {}, b: {} }, locked: [...locked], log: [] };
}

/** Whose turn it is and what for, or null once the draft is done. */
export function draftTurn(ds) {
    const o = DRAFT_ORDER[ds.i];
    if (!o) return null;
    return { ...o, key: o.side === 'blue' ? ds.blue : other(ds.blue), n: ds.i };
}
export const draftDone = (ds) => ds.i >= DRAFT_ORDER.length;

/** Everything that can no longer be picked: bans, picks, and fearless locks. */
export function blockedSet(ds) {
    return new Set([...ds.bans.a, ...ds.bans.b, ...Object.values(ds.picks.a), ...Object.values(ds.picks.b), ...ds.locked].filter(Boolean));
}

/** Can this champion be banned now, or picked into `role`? */
export function legalFor(ds, champId, role = null, year = 9999) {
    const c = CHAMPION_BY_ID[champId];
    if (!c || !champReleased(champId, year) || blockedSet(ds).has(champId)) return false;
    return !role || c.roles.includes(role);
}

/** Apply one action for whoever is on the clock. Returns false if it is illegal. */
export function applyDraft(ds, action, year = 9999) {
    const t = draftTurn(ds);
    if (!t || !action || !action.champ) return false;
    if (t.type === 'ban') {
        if (!legalFor(ds, action.champ, null, year)) return false;
        ds.bans[t.key].push(action.champ);
    } else {
        const role = action.role;
        if (!ROLE_IDS.includes(role) || ds.picks[t.key][role]) return false;
        if (!legalFor(ds, action.champ, role, year)) return false;
        ds.picks[t.key] = { ...ds.picks[t.key], [role]: action.champ };
    }
    ds.log.push({ n: t.n, side: t.side, key: t.key, type: t.type, champ: action.champ, role: action.role || null });
    ds.i++;
    return true;
}

/**
 * Bans for `meKey` against the other side, best first. A ban is worth what the
 * champion is worth to the enemy player who would play it -- comfort, meta and
 * how good that player is -- plus what he has been playing lately, plus a
 * champion that would counter a pick already locked in. Banning something your
 * own player wanted costs you too.
 */
export function banScores(ds, meKey, me, them, ctx) {
    const block = blockedSet(ds);
    const theirPicked = ds.picks[other(meKey)];
    const myPicked = ds.picks[meKey];
    const best = new Map();
    for (const role of ROLE_IDS) {
        if (theirPicked[role]) continue;      // that seat is already filled: no point
        const p = them.lineup[role];
        if (!p) continue;
        const threat = 1 + clamp((ovrOf(p) - 76) / 12, -0.4, 1.4);
        const cand = new Set([...(p.favs || []), ...(p.pool || []), ...(p.recent || []).slice(0, 4), ...rankedPool(role, ctx.year, ctx.split).slice(0, 5).map(c => c.id)]);
        for (const id of cand) {
            const c = CHAMPION_BY_ID[id];
            if (!c || block.has(id) || !c.roles.includes(role) || !champReleased(id, ctx.year)) continue;
            let v = Math.max(0.2, pickValue(p, id, ctx.year, ctx.split, them.drafter || 0, them.poolRank || 0)) * threat;
            if ((p.recent || []).slice(0, 3).includes(id)) v += 0.8;
            const mine = myPicked[role];
            if (mine) v += Math.max(0, matchupValue(id, mine)) * 0.8;
            const mineP = me.lineup[role];
            if (mineP) v -= Math.max(0, pickValue(mineP, id, ctx.year, ctx.split)) * 0.5;
            const prev = best.get(id);
            if (!prev || v > prev.v) best.set(id, { id, v, role, pid: p.id, pname: p.name });
        }
    }
    return [...best.values()].sort((a, b) => b.v - a.v);
}

/** What a still-hidden enemy laner could answer a blind pick with: the worst
 *  matchup among his comfort champions that are still available. */
function blindRisk(id, enemyP, block) {
    if (!enemyP) return 0;
    let worst = 0;
    for (const e of [...(enemyP.favs || []), ...(enemyP.pool || [])]) {
        if (block.has(e)) continue;
        const v = matchupValue(id, e);
        if (v < worst) worst = v;
    }
    return worst * 0.4;
}

/**
 * Picks for `meKey`, best first, over every seat still empty: comfort and meta,
 * the lane matchup against a champion already shown (or the blind-pick risk),
 * and what the champion adds to the five's synergy.
 */
export function pickScores(ds, meKey, me, them, ctx) {
    const block = blockedSet(ds);
    const myPicked = ds.picks[meKey];
    const theirPicked = ds.picks[other(meKey)];
    const base = teamSynergy(myPicked, me.tactic).total;
    const out = [];
    for (const role of ROLE_IDS) {
        if (myPicked[role]) continue;
        const p = me.lineup[role];
        const cand = new Set([...(p && p.favs || []), ...(p && p.pool || []), ...rankedPool(role, ctx.year, ctx.split).slice(0, 12).map(c => c.id)]);
        for (const id of cand) {
            const c = CHAMPION_BY_ID[id];
            if (!c || block.has(id) || !c.roles.includes(role) || !champReleased(id, ctx.year)) continue;
            let v = pickValue(p, id, ctx.year, ctx.split, me.drafter || 0, me.poolRank || 0);
            const enemy = theirPicked[role];
            v += enemy ? matchupValue(id, enemy, me.analyst || 0) : blindRisk(id, them.lineup[role], block);
            v += (teamSynergy({ ...myPicked, [role]: id }, me.tactic).total - base) * EDGE_TO_SEAT;
            out.push({ role, id, v });
        }
    }
    // A role nobody can fill from the shortlist falls back to anything legal.
    for (const role of ROLE_IDS) {
        if (myPicked[role] || out.some(x => x.role === role)) continue;
        const any = rankedPool(role, ctx.year, ctx.split).find(c => !block.has(c.id));
        if (any) out.push({ role, id: any.id, v: -5 });
    }
    return out.sort((a, b) => b.v - a.v);
}

/** Choose among the top few by value, so the AI is sensible but not a robot. */
function softPick(list, rng, temp = 0.9, top = 5) {
    const head = list.slice(0, top);
    if (!head.length) return null;
    const ref = head[0].v;
    const w = head.map(x => Math.exp((x.v - ref) / temp));
    let r = rng() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < head.length; i++) { r -= w[i]; if (r <= 0) return head[i]; }
    return head[0];
}

/** The AI's action for whoever is on the clock. `A`/`B` are the two sides. */
export function aiDraftAction(ds, A, B, ctx, rng) {
    const t = draftTurn(ds);
    if (!t) return null;
    const me = t.key === 'a' ? A : B, them = t.key === 'a' ? B : A;
    if (t.type === 'ban') {
        const c = softPick(banScores(ds, t.key, me, them, ctx), rng, 1.0, 5);
        if (c) return { champ: c.id };
        const any = ROLE_IDS.flatMap(r => rankedPool(r, ctx.year, ctx.split)).find(x => legalFor(ds, x.id, null, ctx.year));
        return any ? { champ: any.id } : null;
    }
    const c = softPick(pickScores(ds, t.key, me, them, ctx), rng, 0.8, 4);
    return c ? { champ: c.id, role: c.role } : null;
}

/** A whole draft with both sides on autopilot. */
export function autoDraft(A, B, ctx, rng, locked = []) {
    const ds = newDraft(ctx.blue || 'a', locked);
    let guard = 0;
    while (!draftDone(ds) && guard++ < 40) {
        const act = aiDraftAction(ds, A, B, ctx, rng);
        if (!act || !applyDraft(ds, act, ctx.year)) {
            // An impossible state (a role pool emptied by fearless): skip the action.
            ds.log.push({ n: ds.i, skipped: true });
            ds.i++;
        }
    }
    return ds;
}

/** Everything champion select shows about one candidate pick for `meKey`. */
export function pickInfo(ds, meKey, me, them, ctx, role, id) {
    const p = me.lineup[role];
    const comfort = comfortOf(p, id);
    const meta = metaFor(ctx.year, ctx.split).byId[id] || 0;
    const enemy = ds.picks[other(meKey)][role] || null;
    const mu = enemy ? matchupValue(id, enemy, me.analyst || 0) : 0;
    const cur = teamSynergy(ds.picks[meKey], me.tactic);
    const next = teamSynergy({ ...ds.picks[meKey], [role]: id }, me.tactic);
    const duos = next.duos.filter(d => !cur.duos.includes(d));
    const syn = next.total - cur.total;
    const recent = !!(p && (p.recent || []).includes(id));
    return {
        comfort, meta, enemy, mu, syn, duos, recent,
        style: next.style && (!cur.style || next.style.id !== cur.style.id) ? next.style : null,
        value: pickValue(p, id, ctx.year, ctx.split, me.drafter || 0, me.poolRank || 0) + mu + syn * EDGE_TO_SEAT,
    };
}

// ---------------------------------------------------------------- one side, on the day
function seatPerf(p, role, ctx, side, rng) {
    let v = ovrAs(p, role) - (p.roles.includes(role) || p.role === role ? 0 : OFF_ROLE);
    v += clamp(((Number(p.mor) || 65) - 65) / 10, -4, 3);
    v += clamp(Number(p.form) || 0, -3, 3);
    const e = fx(p);
    const steady = side.steady || 0;
    if (ctx.bigStage && e.bigStage) {
        let b = e.bigStage;
        // Nervous calms with experience, and with a sports psychologist.
        if (b < 0) b = Math.min(-1, b + (Number(p.big) || 0) * 0.5 + steady);
        v += b;
    }
    if (ctx.decider && e.decider) v += e.decider;
    if (side.bonus && side.bonus[role]) v += side.bonus[role];
    // Consistency shrinks the spread; personality widens or narrows it.
    let vm = e.varianceMult || 1;
    if (vm > 1) vm = 1 + (vm - 1) * (1 - steady * 0.3);
    const sd = 2.6 * vm * clamp(1 - ((p.a.frm || 70) - 70) / 90, 0.6, 1.35);
    v += normal(rng) * sd;
    return v;
}

function sideState(side, ctx, rng) {
    const perf = {};
    for (const role of ROLE_IDS) {
        const p = side.lineup[role];
        perf[role] = p ? seatPerf(p, role, ctx, side, rng) : 45;
    }
    const phase = {};
    for (const ph of PHASES) {
        let s = 0;
        for (const role of ROLE_IDS) {
            const p = side.lineup[role];
            const keys = PHASE_ATTRS[ph];
            const tilt = p ? 0.3 * (keys.reduce((acc, k) => acc + (p.a[k] || 0), 0) / keys.length - ovrOf(p)) : 0;
            s += PHASE_ROLE_W[ph][role] * (perf[role] + tilt);
        }
        phase[ph] = s;
    }
    return { perf, phase };
}

/** Team-level attribute average used by in-game calls. */
export function teamAttr(lineup, key) {
    const ps = ROLE_IDS.map(r => lineup[r]).filter(Boolean);
    return ps.length ? ps.reduce((s, p) => s + (p.a[key] || 0), 0) / ps.length : 50;
}

/** Each seat's draft value: comfort, meta, Draft Prep and the lane matchup. */
function seatBonus(side, them, ctx) {
    const out = {};
    for (const role of ROLE_IDS) {
        const p = side.lineup[role];
        const champ = side.picks && side.picks[role];
        let v = pickValue(p, champ, ctx.year, ctx.split, side.drafter || 0, side.poolRank || 0) + (side.prep || 0) * (champ ? 1 : 0);
        const enemy = them.picks && them.picks[role];
        if (champ && enemy) v += matchupValue(champ, enemy, side.analyst || 0);
        out[role] = v;
    }
    return out;
}

// ---------------------------------------------------------------- in-game calls
// Up to four decisions a game. Every option has an EDGE -- how much better your
// five are at what it needs than theirs -- and success is a coin weighted by
// that edge and the gold lead. Safe options always pay a little, so they are
// right when you have no edge. A comp built for a call (a dive comp invading)
// adds to its edge.
export const CALL_STAGES = ['plan', 'mid', 'baron', 'late'];
export const STAGE_T = { plan: 0, mid: 14, baron: 20, late: 27 };
export const STAGE_NAME = { plan: 'Level one', mid: '14 minutes', baron: '20 minutes', late: 'Late game' };
/** The late call only comes up in a game still within this much edge. */
const LATE_CLOSE = 6;
const STYLE_EDGE = 2;
const LANE_ROLES = { TOP: ['TOP'], MID: ['MID'], BOT: ['ADC', 'SUP'] };
const LANE_NAME = { TOP: 'top lane', MID: 'mid lane', BOT: 'bot lane' };

function fmtGold(g) { return (Math.abs(g) / 1000).toFixed(1) + 'k gold'; }

function view(st, side, A, B) {
    const a = side === 'a';
    return {
        me: a ? A : B, them: a ? B : A,
        mine: a ? st.sa : st.sb, theirs: a ? st.sb : st.sa,
        syn: a ? st.synA : st.synB,
        lead: a ? st.lead : -st.lead,
    };
}
const attrGap = (v, key) => teamAttr(v.me.lineup, key) - teamAttr(v.them.lineup, key);
const styleIs = (v, ...ids) => !!(v.syn && v.syn.style && ids.includes(v.syn.style.id));
const champOf = (side, role) => (side.picks && side.picks[role] ? (CHAMPION_BY_ID[side.picks[role]] || {}).name || side.picks[role] : null);

function planSituation(st, v) {
    const lanes = {};
    for (const [lane, roles] of Object.entries(LANE_ROLES)) lanes[lane] = roles.reduce((s, r) => s + (v.mine.perf[r] - v.theirs.perf[r]), 0) / roles.length;
    const best = Object.keys(lanes).sort((x, y) => lanes[y] - lanes[x])[0];
    const jg = v.mine.perf.JNG - v.theirs.perf.JNG;
    const role = best === 'BOT' ? 'ADC' : best;
    const mc = champOf(v.me, role), tc = champOf(v.them, role);
    const mu = v.me.picks && v.them.picks ? matchupValue(v.me.picks[role], v.them.picks[role]) : 0;
    return {
        stage: 'plan',
        title: 'How do you start the game?',
        opts: [
            { id: 'lane', lane: best, label: `Play around the ${LANE_NAME[best]}`, risk: 'Medium', up: 1.8, down: 1.0, edge: lanes[best] * 0.8 + jg * 0.3,
              desc: `Your jungler lives in your strongest lane today${mc && tc ? `: ${mc} into ${tc} (${matchupWord(mu).word.toLowerCase()})` : ''}. Win it and it snowballs.` },
            { id: 'invade', label: 'Invade their jungle', risk: 'High', up: 2.2, down: 2.0, style: 'dive',
              edge: attrGap(v, 'mec') * 0.6 + jg * 0.4 + (styleIs(v, 'dive', 'pick') ? STYLE_EDGE : 0),
              desc: 'Five at their buff at level one. Win the skirmish and their jungler is behind for ten minutes.' },
            { id: 'scale', label: 'Full clear and scale', risk: 'Low', up: v.me.tactic === 'scaling' ? 1.0 : 0.6, down: 0, edge: null,
              desc: 'No risks early. Farm, ward and play for later.' },
        ],
    };
}

function midSituation(st, v) {
    const lead = v.lead;
    const topGap = v.mine.perf.TOP - v.theirs.perf.TOP;
    const top = v.me.lineup.TOP;
    return {
        stage: 'mid',
        title: lead > 1500 ? `${fmtGold(lead)} ahead. How do you press it?` : lead < -1500 ? `${fmtGold(-lead)} behind. How do you claw it back?` : 'A level game. What is the plan?',
        opts: [
            { id: 'herald', label: 'Herald into a tower dive', risk: 'High', up: 2.2, down: 1.8, style: 'dive',
              edge: attrGap(v, 'map') + (styleIs(v, 'dive') ? STYLE_EDGE : 0),
              desc: 'Drop the Rift Herald mid and dive the tower: plates, gold and the map.' },
            { id: 'drakes', label: 'Group for the dragon stack', risk: 'Medium', up: 1.9, down: 1.5, style: 'teamfight',
              edge: attrGap(v, 'tmf') + (styleIs(v, 'teamfight', 'protect') ? STYLE_EDGE : 0),
              desc: 'Four in the river and every drake contested. The better teamfighters win the soul race.' },
            { id: 'split', label: 'Split the map', risk: 'Medium', up: 1.9, down: 1.6, style: 'split',
              edge: topGap * 0.6 + attrGap(v, 'map') * 0.4 + (styleIs(v, 'split') ? STYLE_EDGE : 0),
              desc: `${top ? top.name : 'Your top laner'} takes a side lane while four hold the middle. Stretch them thin.` },
            { id: 'farm', label: 'Ward up and farm', risk: 'Low', up: 0.7, down: 0, edge: null,
              desc: 'Deep vision, safe waves. Nothing to lose.' },
        ],
    };
}

function baronSituation(st, v) {
    const lead = v.lead;
    const jgMec = (v.me.lineup.JNG ? v.me.lineup.JNG.a.mec : 60) - (v.them.lineup.JNG ? v.them.lineup.JNG.a.mec : 60);
    if (lead > 1800) return {
        stage: 'baron', kind: 'ahead',
        title: `Baron is up and you are ${fmtGold(lead)} ahead.`,
        opts: [
            { id: 'baron', label: 'Start Baron now', risk: 'High', up: 5, down: 5.5, edge: attrGap(v, 'tmf') + (styleIs(v, 'teamfight') ? STYLE_EDGE : 0), desc: 'Win it and the game is yours. Get caught and they are back in it.' },
            { id: 'siege', label: 'Siege with Herald', risk: 'Medium', up: 3, down: 2, edge: attrGap(v, 'map') + (styleIs(v, 'poke', 'split') ? STYLE_EDGE : 0), desc: 'Take towers while their jungler is on the other side of the map.' },
            { id: 'choke', label: 'Choke their jungle', risk: 'Low', up: 1.2, down: 0, edge: null, desc: 'Starve them of gold and wait for a mistake.' },
        ],
    };
    if (lead < -1800) return {
        stage: 'baron', kind: 'behind',
        title: `They are on Baron and ${fmtGold(-lead)} ahead.`,
        opts: [
            { id: 'contest', label: 'Contest Baron, all in', risk: 'High', up: 6, down: 4, edge: attrGap(v, 'tmf') + (styleIs(v, 'teamfight') ? STYLE_EDGE : 0), desc: 'The throw they are scared of. Lose it and the game is over.' },
            { id: 'steal', label: 'Smite steal attempt', risk: 'Medium', up: 4, down: 3, edge: jgMec * 0.8 + attrGap(v, 'mec') * 0.2, desc: 'Your jungler sneaks in for the steal while four zone.' },
            { id: 'defend', label: 'Defend base and scale', risk: 'Low', up: 2, down: 1, edge: attrGap(v, 'cmp') + (styleIs(v, 'protect') ? STYLE_EDGE : 0), desc: 'Give them Baron, hold the inhibitors, play for the late game.' },
        ],
    };
    return {
        stage: 'baron', kind: 'even',
        title: 'Dragon soul point. The game is level.',
        opts: [
            { id: 'force', label: 'Force the fight at Dragon', risk: 'High', up: 4.5, down: 4.5, edge: attrGap(v, 'tmf') + (styleIs(v, 'teamfight', 'protect') ? STYLE_EDGE : 0), desc: 'Five against five on the pit. The better teamfighters take everything.' },
            { id: 'trade', label: 'Trade for Baron side', risk: 'Medium', up: 2.5, down: 2, edge: attrGap(v, 'map') + (styleIs(v, 'split', 'poke') ? STYLE_EDGE : 0), desc: 'Give up the dragon, take a tower and vision on the other side.' },
            { id: 'stall', label: 'Reset and hold', risk: 'Low', up: 0.8, down: 0, edge: null, desc: 'No coin flips. Wait for a better fight.' },
        ],
    };
}

function lateSituation(st, v) {
    const topGap = v.mine.perf.TOP - v.theirs.perf.TOP;
    return {
        stage: 'late',
        title: 'Still on a knife edge. Elder Dragon is up in a minute.',
        opts: [
            { id: 'elder', label: 'Fight for Elder Dragon', risk: 'High', up: 3, down: 3,
              edge: (v.mine.phase.late - v.theirs.phase.late) * 0.5 + attrGap(v, 'tmf') * 0.5 + (styleIs(v, 'teamfight', 'protect') ? STYLE_EDGE : 0),
              desc: 'Whoever wins this fight wins the game.' },
            { id: 'siege', label: 'Baron and a 1-3-1 siege', risk: 'Medium', up: 2.2, down: 1.6,
              edge: attrGap(v, 'map') * 0.6 + topGap * 0.4 + (styleIs(v, 'split', 'poke') ? STYLE_EDGE : 0),
              desc: 'Pressure two lanes at once and make them choose.' },
            { id: 'pick', label: 'Hold vision, wait for a pick', risk: 'Low', up: 1.2, down: 0.4,
              edge: attrGap(v, 'cmp') + (styleIs(v, 'pick') ? STYLE_EDGE : 0),
              desc: 'Let them make the mistake, then punish it.' },
        ],
    };
}

/** The decision in front of `side` right now, or null once the game is decided. */
export function gameSituation(st, side, A, B) {
    if (!st || st.done) return null;
    const v = view(st, side, A, B);
    switch (CALL_STAGES[st.stage]) {
        case 'plan': return planSituation(st, v);
        case 'mid': return midSituation(st, v);
        case 'baron': return baronSituation(st, v);
        case 'late': return lateSituation(st, v);
        default: return null;
    }
}

/** Success chance of an option: its edge, a little of the gold lead, and the
 *  Shotcaller perk. A safe option (no edge) always works. */
export function callChance(opt, lead = 0, shot = 0) {
    if (!opt || opt.edge == null) return 1;
    return clamp(sigmoid(opt.edge / 5 + lead / 6000) + shot * 0.04, 0.08, 0.92);
}

/** Expected value, which the AI and "let the coach decide" use. */
export function callEV(opt, lead = 0, shot = 0) {
    const p = callChance(opt, lead, shot);
    return p * opt.up - (1 - p) * opt.down;
}

export function bestCall(sit, lead = 0, shot = 0) {
    if (!sit) return null;
    let best = sit.opts[0], bv = -Infinity;
    for (const o of sit.opts) {
        const v = callEV(o, lead, shot);
        if (v > bv) { bv = v; best = o; }
    }
    return best;
}

/** A word for an option's edge, shown beside it so the choice can be reasoned. */
export function edgeWord(opt) {
    if (!opt || opt.edge == null) return { word: 'Safe', tone: 'neutral' };
    const e = opt.edge;
    if (e >= 3) return { word: 'Big edge', tone: 'good' };
    if (e >= 1) return { word: 'Edge', tone: 'good' };
    if (e > -1) return { word: 'Even', tone: 'neutral' };
    if (e > -3) return { word: 'Behind', tone: 'bad' };
    return { word: 'Far behind', tone: 'bad' };
}

function resolveCall(sit, id, lead, shot, rng) {
    const opt = sit && sit.opts.find(o => o.id === id) || null;
    if (!opt) return { opt: null, ok: null, delta: 0, chance: null };
    const p = callChance(opt, lead, shot);
    const ok = opt.edge == null ? true : rng() < p;
    return { opt, ok, delta: ok ? opt.up : -opt.down, chance: p };
}
const brief = (r) => (r.opt ? { id: r.opt.id, label: r.opt.label, ok: r.ok, chance: r.chance, safe: r.opt.edge == null, lane: r.opt.lane || null } : null);

// ---------------------------------------------------------------- one game
/**
 * Prepare a game. `a`/`b` are
 *   { team, lineup, tactic, picks, chem, drafter, poolRank, analyst, prep, shot, steady, extraEdge }.
 * The game then moves one decision at a time through resolveStage(); quickGame()
 * runs it straight through with both coaches choosing.
 */
export function startGame(a, b, ctx, rng, { detail = false } = {}) {
    const sa = sideState({ ...a, bonus: seatBonus(a, b, ctx) }, ctx, rng);
    const sb = sideState({ ...b, bonus: seatBonus(b, a, ctx) }, ctx, rng);
    const ta = TACTIC_BY_ID[a.tactic] || TACTICS[0];
    const tb = TACTIC_BY_ID[b.tactic] || TACTICS[0];
    const w = {};
    for (const ph of PHASES) w[ph] = (ta.phases[ph] + tb.phases[ph]) / 2;
    const d = {};
    for (const ph of PHASES) d[ph] = sa.phase[ph] - sb.phase[ph];
    const counter = tacticEdge(a.tactic, b.tactic);
    const counterPts = counter > 0 ? COUNTER_EDGE + (a.tactician || 0) : counter < 0 ? -(COUNTER_EDGE + (b.tactician || 0)) : 0;
    const fitA = tacticFit(a.lineup, a.tactic).bonus;
    const fitB = tacticFit(b.lineup, b.tactic).bonus;
    const chem = ((Number(a.chem) || 50) - (Number(b.chem) || 50)) / 15;
    const synA = teamSynergy(a.picks, a.tactic);
    const synB = teamSynergy(b.picks, b.tactic);
    const edges = counterPts + (fitA - fitB) + chem + (ctx.blue === 'a' ? 0.4 : -0.4) + (a.extraEdge || 0) - (b.extraEdge || 0) + (synA.total - synB.total);
    const pre = w.early * d.early + w.mid * d.mid + edges * 0.6;
    return {
        sa, sb, w, d, edges, pre, counter, counterPts, fitA, fitB, chem, synA, synB,
        stage: 0, deltaA: 0, deltaB: 0, calls: [], lead: 0, lead20: 0, gold: [[0, 0]], feed: [], t: 0,
        detail, done: false, res: null,
    };
}

const dNow = (st) => st.pre + st.w.late * st.d.late + st.edges * 0.4 + st.deltaA - st.deltaB;
export const gameStage = (st) => (st && !st.done ? CALL_STAGES[st.stage] : null);

function leadAt(st, t, rng) {
    const dl = st.deltaA - st.deltaB;
    let L;
    if (t <= 14) L = (st.w.early * st.d.early + st.edges * 0.25 + dl) * 420 + normal(rng) * 800;
    else if (t <= 20) L = 0.35 * st.lead + 0.65 * ((st.pre + dl) * 520 + normal(rng) * 900);
    else L = 0.35 * st.lead + 0.65 * ((st.pre + st.w.late * st.d.late * 0.5 + dl) * 620 + normal(rng) * 1000);
    return Math.round(L / 100) * 100;
}

/**
 * Resolve the current decision with each side's call (an option id, or null)
 * and play on to the next one. When there is no next one the game ends and
 * `st.res` holds the result.
 */
export function resolveStage(st, A, B, ctx, rng, { callA = null, callB = null } = {}) {
    if (!st || st.done) return st;
    const stage = CALL_STAGES[st.stage];
    const sitA = gameSituation(st, 'a', A, B), sitB = gameSituation(st, 'b', A, B);
    const ra = resolveCall(sitA, callA, st.lead, A.shot || 0, rng);
    const rb = resolveCall(sitB, callB, -st.lead, B.shot || 0, rng);
    st.deltaA += ra.delta;
    st.deltaB += rb.delta;
    const rec = { stage, t: STAGE_T[stage], title: sitA ? sitA.title : '', a: brief(ra), b: brief(rb) };
    st.calls.push(rec);
    const from = STAGE_T[stage];
    let next = st.stage + 1;
    if (CALL_STAGES[next] === 'late' && Math.abs(dNow(st)) > LATE_CLOSE) next++;
    st.stage = next;
    if (CALL_STAGES[next]) {
        const to = STAGE_T[CALL_STAGES[next]];
        const prev = st.lead;
        st.lead = leadAt(st, to, rng);
        if (to === 20) st.lead20 = st.lead;
        if (to === 14) st.gold.push([5, Math.round(st.lead * 0.25 / 100) * 100], [10, Math.round(st.lead * 0.65 / 100) * 100]);
        else st.gold.push([Math.round((from + to) / 2), Math.round((prev + st.lead) / 200) * 100]);
        st.gold.push([to, st.lead]);
        if (st.detail) st.feed.push(...segmentFeed(st, A, B, from, to, rec, rng));
        st.t = to;
    } else {
        finish(st, A, B, ctx, rng, rec, from);
    }
    return st;
}

function finish(st, A, B, ctx, rng, rec, from) {
    const D = dNow(st);
    const pA = sigmoid(D / WIN_SCALE);
    const aWins = rng() < pA;
    const baron = st.calls.find(c => c.stage === 'baron') || null;
    const res = {
        winner: aWins ? 'a' : 'b',
        pA, D, lead: st.lead20 || st.lead,
        calls: st.calls,
        callA: baron && baron.a ? baron.a : null,
        callB: baron && baron.b ? baron.b : null,
        synA: { total: st.synA.total, style: st.synA.style ? st.synA.style.id : null, duos: st.synA.duos.map(d => d.name) },
        synB: { total: st.synB.total, style: st.synB.style ? st.synB.style.id : null, duos: st.synB.duos.map(d => d.name) },
    };
    const lines = buildLines(A, B, st, aWins, rng);
    res.lines = lines;
    res.ratings = {};
    for (const side of ['a', 'b']) for (const l of lines[side]) res.ratings[l.id] = l.rating;
    const winners = lines[aWins ? 'a' : 'b'];
    res.mvp = winners.slice().sort((x, y) => y.rating - x.rating)[0]?.id || null;
    res.kills = { a: lines.a.reduce((s, l) => s + l.k, 0), b: lines.b.reduce((s, l) => s + l.k, 0) };
    const duration = from >= 27
        ? clamp(Math.round(34 + normal(rng) * 3 - Math.abs(D) * 0.2), 32, 46)
        : clamp(Math.round(31 + normal(rng) * 4 - Math.abs(D) * 0.35), 27, 44);
    res.duration = duration;
    if (st.detail) {
        const end = endFeed(st, A, B, from, duration, res, rec, rng);
        res.feed = [...st.feed, ...end.feed];
        res.gold = end.gold;
    }
    st.done = true;
    st.res = res;
}

/** Quick game: both coaches draft (or are handed picks) and make every call. */
export function quickGame(a, b, ctx, rng, detail = false) {
    const st = startGame(a, b, ctx, rng, { detail });
    let guard = 0;
    while (!st.done && guard++ < 6) {
        const sa = gameSituation(st, 'a', a, b), sb = gameSituation(st, 'b', a, b);
        const ca = bestCall(sa, st.lead, a.shot || 0);
        const cb = bestCall(sb, -st.lead, b.shot || 0);
        resolveStage(st, a, b, ctx, rng, { callA: ca && ca.id, callB: cb && cb.id });
    }
    return st.res;
}

// ---------------------------------------------------------------- box scores
const KILL_SHARE = { TOP: 0.16, JNG: 0.2, MID: 0.27, ADC: 0.29, SUP: 0.08 };
const DEATH_SHARE = { TOP: 0.22, JNG: 0.2, MID: 0.18, ADC: 0.18, SUP: 0.22 };

function buildLines(a, b, st, aWins, rng) {
    const total = 10 + Math.floor(rng() * 18);
    const winK = Math.round(total * (0.62 + rng() * 0.18));
    const loseK = Math.max(1, total - winK);
    const kA = aWins ? winK : loseK, kB = aWins ? loseK : winK;
    const make = (side, sideKills, sideDeaths, state, otherState, won) => {
        const lu = side.lineup;
        const ks = split(sideKills, ROLE_IDS.map(r => KILL_SHARE[r] * Math.max(0.3, 1 + (state.perf[r] - 75) / 30)), rng);
        const ds = split(sideDeaths, ROLE_IDS.map(r => DEATH_SHARE[r] * Math.max(0.3, 1 - (state.perf[r] - 75) / 40)), rng);
        return ROLE_IDS.map((r, i) => {
            const p = lu[r];
            const k = ks[i], d = ds[i];
            const as = Math.min(sideKills - k, Math.round(sideKills * (r === 'SUP' ? 0.62 : r === 'JNG' ? 0.5 : 0.38) * (0.7 + rng() * 0.5)));
            // A 1-10 rating: mostly 5.5-8.5, a big game near 9, a nightmare near 4.
            const vs = state.perf[r] - otherState.perf[r];
            const rating = clamp(6.3 + clamp(vs / 9, -1.3, 1.3) + (won ? 0.45 : -0.45)
                + clamp((k + as * 0.4 - d) * 0.07, -0.9, 0.9) + (rng() - 0.5) * 0.4, 2.5, 9.9);
            return { id: p ? p.id : null, name: p ? p.name : '—', role: r, champ: side.picks ? side.picks[r] || null : null, k, d, a: Math.max(0, as), rating: Math.round(rating * 10) / 10 };
        });
    };
    return {
        a: make(a, kA, kB, st.sa, st.sb, aWins),
        b: make(b, kB, kA, st.sb, st.sa, !aWins),
    };
}

/** Split an integer total by weights, randomly but faithfully. */
function split(total, weights, rng) {
    const out = weights.map(() => 0);
    const sum = weights.reduce((s, w) => s + w, 0) || 1;
    for (let i = 0; i < total; i++) {
        let r = rng() * sum;
        for (let j = 0; j < weights.length; j++) {
            r -= weights[j];
            if (r <= 0) { out[j]++; break; }
        }
    }
    return out;
}

// ---------------------------------------------------------------- play-by-play
const LANES = { TOP: 'top lane', JNG: 'jungle', MID: 'mid lane', ADC: 'bot lane', SUP: 'bot lane' };
const DRAKES = ['Infernal', 'Mountain', 'Ocean', 'Cloud', 'Hextech', 'Chemtech'];

function goldReader(gold) {
    return (t) => {
        for (let i = 1; i < gold.length; i++) {
            if (t <= gold[i][0]) {
                const [t0, v0] = gold[i - 1], [t1, v1] = gold[i];
                return v0 + (v1 - v0) * ((t - t0) / Math.max(0.01, t1 - t0));
            }
        }
        return gold[gold.length - 1][1];
    };
}

function feedTools(a, b, rng, goldAt) {
    const side = (s) => (s === 'a' ? a : b);
    return {
        nameOf: (s, role) => (side(s).lineup[role] ? side(s).lineup[role].name : role),
        champ: (s, role) => champOf(side(s), role),
        teamName: (s) => side(s).team.short || side(s).team.name,
        favouredAt: (t) => (goldAt(t) + normal(rng) * 900 >= 0 ? 'a' : 'b'),
        killerRole: () => pick(rng, ['MID', 'ADC', 'JNG', 'TOP', 'MID', 'ADC', 'SUP']),
    };
}

/** The line a call leaves in the feed, for both sides. */
function callLines(rec, t, tools) {
    const out = [];
    for (const s of ['a', 'b']) {
        const r = rec[s];
        if (!r) continue;
        const text = r.safe ? `${tools.teamName(s)} play it safe: ${r.label}.` : `${tools.teamName(s)} call: ${r.label}. ${r.ok ? 'It works!' : 'It backfires!'}`;
        out.push({ t: t + (s === 'a' ? 0.1 : 0.25), s: r.ok || r.safe ? s : (s === 'a' ? 'b' : 'a'), type: 'call', mine: s, text, stage: rec.stage });
    }
    return out;
}

/** Events between two decisions. Who wins each follows the gold curve, so a
 *  call that worked shows up in the game that follows it. */
function segmentFeed(st, A, B, from, to, rec, rng) {
    const goldAt = goldReader(st.gold);
    const tools = feedTools(A, B, rng, goldAt);
    const { nameOf, champ, teamName, favouredAt, killerRole } = tools;
    const feed = callLines(rec, from, tools);
    const opp = (s) => (s === 'a' ? 'b' : 'a');
    if (from === 0) {
        // First blood: an invade decides it, otherwise a lane call, otherwise the early game.
        let fbS = null, fbT = 2.5 + rng() * 4, where = null;
        for (const s of ['a', 'b']) {
            const r = rec[s];
            if (r && r.id === 'invade') { fbS = r.ok ? s : opp(s); fbT = 1.3 + rng() * 0.6; where = 'jungle'; }
        }
        if (!fbS) for (const s of ['a', 'b']) {
            const r = rec[s];
            if (r && r.id === 'lane' && r.ok) { fbS = s; where = r.lane === 'BOT' ? 'ADC' : r.lane; }
        }
        if (!fbS) fbS = (st.d.early + normal(rng) * 3) >= 0 ? 'a' : 'b';
        const fbR = where === 'jungle' ? pick(rng, ['JNG', 'SUP', 'MID']) : where || pick(rng, ['TOP', 'JNG', 'MID', 'ADC']);
        const vR = where === 'jungle' ? 'JNG' : fbR === 'JNG' ? pick(rng, ['TOP', 'MID', 'ADC']) : fbR;
        const c = champ(fbS, fbR);
        feed.push({ t: fbT, s: fbS, type: 'kill', text: `First blood! ${nameOf(fbS, fbR)}${c ? ` (${c})` : ''} catches ${nameOf(opp(fbS), vR)} ${where === 'jungle' ? 'in the invade' : `in the ${LANES[vR]}`}.` });
        for (const t of [5.5, 11]) {
            const s = favouredAt(t);
            feed.push({ t: t + rng() * 1.5, s, type: 'dragon', text: `${teamName(s)} take the ${pick(rng, DRAKES)} Drake.` });
        }
        {
            const s = favouredAt(8.5);
            feed.push({ t: 8 + rng() * 2, s, type: 'herald', text: `${teamName(s)} secure the Rift Herald.` });
        }
        for (let i = 0; i < 3; i++) {
            const t = 4 + rng() * 9;
            const s = favouredAt(t);
            const kr = killerRole();
            const c2 = champ(s, kr);
            feed.push({ t, s, type: 'kill', text: `${nameOf(s, kr)}${c2 ? ` (${c2})` : ''} ${pick(rng, ['picks off', 'solo kills', 'outplays', 'dives onto'])} ${nameOf(opp(s), pick(rng, ROLE_IDS))}.` });
        }
        {
            const s = favouredAt(12.5);
            feed.push({ t: 11.8 + rng() * 1.8, s, type: 'tower', text: `${teamName(s)} take the first tower in the ${pick(rng, ['top', 'mid', 'bot'])} lane.` });
        }
    } else if (from === 14) {
        for (const s of ['a', 'b']) {
            const r = rec[s];
            if (!r || r.safe) continue;
            const w = r.ok ? s : opp(s);
            if (r.id === 'herald') feed.push({ t: 15 + rng() * 1.5, s: w, type: 'tower', text: r.ok ? `${teamName(s)} crash the Herald into mid: the tower falls.` : `${teamName(opp(s))} collapse on the Herald dive and win the fight.` });
            if (r.id === 'drakes') feed.push({ t: 16 + rng() * 1.5, s: w, type: 'dragon', text: `${teamName(w)} win the river fight and take the ${pick(rng, DRAKES)} Drake.` });
            if (r.id === 'split') feed.push({ t: 15.5 + rng() * 2, s: w, type: 'tower', text: r.ok ? `${nameOf(s, 'TOP')} splits ${pick(rng, ['top', 'bot'])} and takes a tower nobody could stop.` : `${nameOf(s, 'TOP')} is caught in the side lane. ${teamName(opp(s))} take a tower for it.` });
        }
        for (let i = 0; i < 2; i++) {
            const t = 14.5 + rng() * 5;
            const s = favouredAt(t);
            const kr = killerRole();
            feed.push({ t, s, type: 'kill', text: `${nameOf(s, kr)} ${pick(rng, ['catches', 'flanks', 'chunks and kills', 'collapses on'])} ${nameOf(opp(s), pick(rng, ROLE_IDS))}.` });
        }
        const s = favouredAt(18);
        feed.push({ t: 17.5 + rng() * 2, s, type: 'tower', text: `${teamName(s)} take an outer tower.` });
    } else if (from === 20) {
        // Only when the game goes to the late call: the mid-twenties.
        const s = favouredAt(23);
        feed.push({ t: 22 + rng() * 2, s, type: 'fight', text: `Teamfight at ${pick(rng, ['the Baron pit', 'mid lane', 'the dragon pit', 'their top jungle'])}: ${teamName(s)} win it ${pick(rng, ['3 for 1', '4 for 2', '2 for 0', '3 for 2'])}.` });
        const s2 = favouredAt(25);
        feed.push({ t: 24.5 + rng() * 1.5, s: s2, type: 'baron', text: `${teamName(s2)} take Baron Nashor.` });
        const s3 = favouredAt(26);
        feed.push({ t: 25.5 + rng(), s: s3, type: 'dragon', text: `${teamName(s3)} claim the Dragon Soul.` });
    }
    feed.sort((x, y) => x.t - y.t);
    for (const e of feed) e.gold = Math.round(goldAt(e.t) / 100) * 100;
    return feed;
}

/** The last call to the Nexus. The winner is known, so the decisive fight is theirs. */
function endFeed(st, A, B, from, duration, res, rec, rng) {
    const aWins = res.winner === 'a';
    const endLead = (aWins ? 1 : -1) * (5000 + Math.abs(res.D) * 900 + rng() * 4000);
    const gold = st.gold.slice();
    const swingAt = from + (duration - from) * 0.45;
    gold.push([Math.round(swingAt * 10) / 10, Math.round(st.lead + (endLead - st.lead) * (Math.sign(endLead) === Math.sign(st.lead) ? 0.5 : 0.3))]);
    gold.push([duration, Math.round(endLead)]);
    const goldAt = goldReader(gold);
    const tools = feedTools(A, B, rng, goldAt);
    const { nameOf, teamName, favouredAt } = tools;
    const feed = callLines(rec, from, tools);
    const w = res.winner, l = w === 'a' ? 'b' : 'a';
    const start = from + 0.5;
    const room = duration - start - 5;
    const fightT = start + 1 + rng() * Math.max(0.5, room * 0.45);
    const bigT = fightT + 0.6 + rng() * Math.max(0.3, room * 0.15);
    if (from >= 27) {
        feed.push({ t: fightT, s: w, type: 'fight', text: `Elder Dragon fight: ${teamName(w)} win it, ${nameOf(w, pick(rng, ['MID', 'ADC', 'JNG']))} with the clean-up.` });
        feed.push({ t: bigT, s: w, type: 'dragon', text: `${teamName(w)} take the Elder Dragon.` });
    } else {
        feed.push({ t: fightT, s: w, type: 'fight', text: `Teamfight at ${pick(rng, ['the Baron pit', 'mid lane', 'the dragon pit', 'their top jungle'])}: ${teamName(w)} win it ${pick(rng, ['3 for 1', '4 for 1', '4 for 2', '5 for 2'])}, ${nameOf(w, pick(rng, ['MID', 'ADC', 'TOP']))} leads the charge.` });
        feed.push({ t: bigT, s: w, type: 'baron', text: `${teamName(w)} take Baron Nashor.` });
        if (duration > 32) {
            const t = 28 + rng() * 3;
            const s = favouredAt(t);
            feed.push({ t, s, type: 'dragon', text: `${teamName(s)} claim the Dragon Soul.` });
        }
    }
    feed.push({ t: Math.max(bigT + 0.5, duration - 3 - rng()), s: w, type: 'tower', text: `${teamName(w)} break an inhibitor.` });
    feed.push({ t: duration - 1.2, s: w, type: 'fight', text: `Ace! ${teamName(w)} wipe ${teamName(l)}.` });
    feed.push({ t: duration, s: w, type: 'end', text: `${teamName(w)} destroy the Nexus. Victory at ${duration}:${String(Math.floor(rng() * 60)).padStart(2, '0')}.` });
    feed.sort((x, y) => x.t - y.t);
    for (const e of feed) e.gold = Math.round(goldAt(e.t) / 100) * 100;
    return { feed, gold };
}

// ---------------------------------------------------------------- series
/**
 * A whole series on autopilot. The first game's blue side is `ctx.blue` (side
 * 'a' unless told otherwise); after that the loser of each game takes blue.
 * Under fearless every champion played is locked for the rest of the series.
 */
export function quickSeries(a, b, bo, ctx, rng) {
    const need = Math.ceil(bo / 2);
    let wa = 0, wb = 0;
    const games = [];
    const locked = [];
    let blue = ctx.blue || 'a';
    while (wa < need && wb < need) {
        const decider = wa === need - 1 && wb === need - 1;
        const c = { ...ctx, decider, blue };
        const ds = autoDraft(a, b, c, rng, ctx.fearless ? locked : []);
        const r = quickGame({ ...a, picks: ds.picks.a }, { ...b, picks: ds.picks.b }, c, rng, false);
        if (r.winner === 'a') wa++; else wb++;
        games.push({ w: r.winner, ratings: r.ratings, mvp: r.mvp, lines: r.lines, blue, picks: ds.picks, bans: ds.bans });
        if (ctx.fearless) locked.push(...Object.values(ds.picks.a), ...Object.values(ds.picks.b));
        blue = r.winner === 'a' ? 'b' : 'a';
    }
    return { score: [wa, wb], winner: wa > wb ? 'a' : 'b', games };
}

/** The champion a player would most like to play, for previews. */
export function signatureOf(p) {
    const id = (p && p.favs && p.favs[0]) || null;
    return id && CHAMPION_BY_ID[id] ? CHAMPION_BY_ID[id] : null;
}

export { ROLE_BY_ID, ATTR_KEYS, shuffle, CHAMPION_BY_ID };
