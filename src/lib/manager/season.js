// ===========================================================================
//  ULTIMATE MANAGER -- the competition
//
//  Per region, two leagues: tier 1 (ten teams, nine weeks) and tier 2 (eight
//  teams, seven weeks and two byes). Each split is a single round robin of best
//  of three series, then a top-four bracket of best of fives.
//
//    MSI      the six spring champions, plus the spring runners-up of the two
//             strongest regions. Eight teams, best of five throughout.
//    Worlds   sixteen teams. Slots 4/4/3/2/2/1 by region strength. Each
//             region sends its summer champion, then its summer runner-up,
//             then the highest championship points.
//    Promotion  tier 1's last team (over both splits) goes down and the tier 2
//             summer champion comes up; tier 1's ninth plays the tier 2 summer
//             runner-up, best of five, for the last place.
//
//  Region strength is the mean of each region's four strongest tier 1 teams,
//  measured in the preseason.
// ===========================================================================
import {
    REGION_IDS, TIER1_SIZE, LEAGUE_BEST_OF, KNOCKOUT_BEST_OF, CHAMP_POINTS, MSI_EXTRA_REGIONS,
    WORLDS_SLOTS_BY_RANK, LEAGUE_WEEKS, REGION_BY_ID, TIER2_NAME,
} from './data.js';
import { teamStrength } from './match.js';
import { rngFor, shuffle } from './util.js';

export const leagueKey = (region, tier) => region + ':' + tier;

// ---------------------------------------------------------------- fixtures
/** Circle-method single round robin. Returns rounds of [home, away] pairs. */
export function roundRobin(ids, rng) {
    const list = shuffle(rng, ids);
    if (list.length % 2) list.push(null);
    const n = list.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
        const pairs = [];
        for (let i = 0; i < n / 2; i++) {
            const a = list[i], b = list[n - 1 - i];
            if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
        }
        rounds.push(pairs);
        list.splice(1, 0, list.pop());
    }
    return rounds;
}

function newTie(a, b, bo) {
    return { a, b, bo, score: null, winner: null };
}

function newSplit(ids, rng) {
    const rounds = roundRobin(ids, rng);
    const fixtures = [];
    for (let w = 0; w < LEAGUE_WEEKS; w++) fixtures.push((rounds[w] || []).map(([a, b]) => newTie(a, b, LEAGUE_BEST_OF)));
    const table = {};
    for (const id of ids) table[id] = { w: 0, l: 0, gw: 0, gl: 0 };
    return { fixtures, table };
}

/** A fresh season for the save's current year and tiers. */
export function newSeason(save) {
    const year = save.time.year;
    const rng = rngFor('season:' + save.seed + ':' + year);
    const leagues = {};
    for (const region of REGION_IDS) {
        for (const tier of [1, 2]) {
            const ids = Object.values(save.teams).filter(t => t.region === region && t.tier === tier).map(t => t.id);
            leagues[leagueKey(region, tier)] = { region, tier, teams: ids, spring: newSplit(ids, rng), summer: newSplit(ids, rng) };
        }
    }
    const power = {};
    for (const region of REGION_IDS) {
        const s = leagues[leagueKey(region, 1)].teams.map(id => teamStrength(save.teams[id], save.players)).sort((a, b) => b - a).slice(0, 4);
        power[region] = s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0;
    }
    const rank = REGION_IDS.slice().sort((a, b) => power[b] - power[a]);
    save.season = { year, leagues, power, rank, playoffs: {}, msi: null, worlds: null, promo: {}, points: {}, places: {} };
    return save.season;
}

// ---------------------------------------------------------------- tables
export function tableRows(league, split, save) {
    const s = league[split];
    return league.teams.map(id => ({ id, ...(s.table[id] || { w: 0, l: 0, gw: 0, gl: 0 }) }))
        .sort((x, y) => (y.w - x.w) || ((y.gw - y.gl) - (x.gw - x.gl)) || (y.gw - x.gw)
            || (teamStrength(save.teams[y.id], save.players) - teamStrength(save.teams[x.id], save.players)));
}

/** Both splits added together: what relegation is decided on. */
export function annualRows(league, save) {
    return league.teams.map(id => {
        const a = league.spring.table[id] || { w: 0, l: 0, gw: 0, gl: 0 };
        const b = league.summer.table[id] || { w: 0, l: 0, gw: 0, gl: 0 };
        return { id, w: a.w + b.w, l: a.l + b.l, gw: a.gw + b.gw, gl: a.gl + b.gl };
    }).sort((x, y) => (y.w - x.w) || ((y.gw - y.gl) - (x.gw - x.gl)) || (y.gw - x.gw));
}

export function recordLeagueTie(league, split, tie) {
    const t = league[split].table;
    const [sa, sb] = tie.score;
    const A = t[tie.a], B = t[tie.b];
    if (!A || !B) return;
    A.gw += sa; A.gl += sb; B.gw += sb; B.gl += sa;
    if (sa > sb) { A.w++; B.l++; } else { B.w++; A.l++; }
}

// ---------------------------------------------------------------- brackets
/** A knockout from a seed list. Pairs 1 v N, 2 v N-1 ... (with `pairs` to override). */
export function newBracket({ id, name, kind, seeds, pairs = null, bo = KNOCKOUT_BEST_OF }) {
    const first = pairs || seedPairs(seeds);
    return {
        id, name, kind, teams: seeds.slice(), bo,
        rounds: [first.map(([a, b]) => newTie(a, b, bo))],
        champion: null, runnerUp: null, places: {},
    };
}

function seedPairs(seeds) {
    const n = seeds.length;
    const out = [];
    for (let i = 0; i < n / 2; i++) out.push([seeds[i], seeds[n - 1 - i]]);
    // Standard bracket order so 1 and 2 can only meet in the final.
    if (out.length === 4) return [out[0], out[3], out[1], out[2]];
    if (out.length === 8) return [out[0], out[7], out[3], out[4], out[1], out[6], out[2], out[5]];
    return out;
}

/** After a round's ties are all decided, build the next one (or crown a champion). */
export function advanceBracket(b) {
    const cur = b.rounds[b.rounds.length - 1];
    if (cur.some(t => !t.winner)) return false;
    // A loser's place is the best place nobody left in the round can reach:
    // final 2nd, semifinals 3rd, quarterfinals 5th, round of 16 9th.
    for (const t of cur) {
        const loser = t.winner === t.a ? t.b : t.a;
        b.places[loser] = cur.length + 1;
    }
    if (cur.length === 1) {
        b.champion = cur[0].winner;
        b.runnerUp = cur[0].winner === cur[0].a ? cur[0].b : cur[0].a;
        b.places[b.champion] = 1;
        return true;
    }
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(newTie(cur[i].winner, cur[i + 1].winner, b.bo));
    b.rounds.push(next);
    return true;
}

/** The tie a team is in for a round, if any. */
export function tieFor(b, round, teamId) {
    if (!b || !b.rounds[round]) return null;
    return b.rounds[round].find(t => t.a === teamId || t.b === teamId) || null;
}

// ---------------------------------------------------------------- playoffs
export function buildPlayoffs(save, split) {
    const S = save.season;
    for (const [key, L] of Object.entries(S.leagues)) {
        const rows = tableRows(L, split, save);
        const seeds = rows.slice(0, 4).map(r => r.id);
        const lname = L.tier === 1 ? REGION_BY_ID[L.region].league : TIER2_NAME[L.region];
        S.playoffs[key + ':' + split] = newBracket({
            id: key + ':' + split, name: `${lname} ${split === 'spring' ? 'Spring' : 'Summer'} Playoffs`, kind: 'playoffs', seeds,
        });
        // Regular season placements for points (playoff teams are overwritten when the bracket ends).
        rows.forEach((r, i) => {
            if (!S.places[r.id]) S.places[r.id] = {};
            S.places[r.id][split] = i + 1;
        });
    }
}

/** After a split's playoffs: placements and championship points for tier 1. */
export function settleSplit(save, split) {
    const S = save.season;
    for (const [key, L] of Object.entries(S.leagues)) {
        const b = S.playoffs[key + ':' + split];
        if (!b) continue;
        for (const [id, place] of Object.entries(b.places)) {
            if (!S.places[id]) S.places[id] = {};
            S.places[id][split] = place;
        }
        if (L.tier !== 1) continue;
        for (const id of L.teams) {
            const pl = (S.places[id] || {})[split] || 10;
            S.points[id] = (S.points[id] || 0) + (CHAMP_POINTS[pl] || 0);
        }
    }
}

// ---------------------------------------------------------------- internationals
function crossRegionPairs(seeds, save) {
    // Strongest against weakest, then swap partners to avoid a same-region first round.
    const n = seeds.length;
    const pairs = [];
    for (let i = 0; i < n / 2; i++) pairs.push([seeds[i], seeds[n - 1 - i]]);
    const reg = (id) => save.teams[id].region;
    for (let i = 0; i < pairs.length; i++) {
        if (reg(pairs[i][0]) !== reg(pairs[i][1])) continue;
        for (let j = pairs.length - 1; j >= 0; j--) {
            if (j === i) continue;
            const [x, y] = pairs[j];
            if (reg(pairs[i][0]) !== reg(y) && reg(x) !== reg(pairs[i][1])) {
                const tmp = pairs[i][1]; pairs[i][1] = y; pairs[j][1] = tmp;
                break;
            }
        }
    }
    if (pairs.length === 4) return [pairs[0], pairs[3], pairs[1], pairs[2]];
    if (pairs.length === 8) return [pairs[0], pairs[7], pairs[3], pairs[4], pairs[1], pairs[6], pairs[2], pairs[5]];
    return pairs;
}

export function buildMSI(save) {
    const S = save.season;
    const field = [];
    for (const region of REGION_IDS) {
        const b = S.playoffs[leagueKey(region, 1) + ':spring'];
        if (b && b.champion) field.push(b.champion);
    }
    for (const region of S.rank.slice(0, MSI_EXTRA_REGIONS)) {
        const b = S.playoffs[leagueKey(region, 1) + ':spring'];
        if (b && b.runnerUp) field.push(b.runnerUp);
    }
    const seeds = field.sort((a, b) => teamStrength(save.teams[b], save.players) - teamStrength(save.teams[a], save.players));
    S.msi = newBracket({ id: 'msi', name: `MSI ${S.year}`, kind: 'msi', seeds, pairs: crossRegionPairs(seeds, save) });
    return S.msi;
}

/** Each region's Worlds entrants, in qualification order. */
export function worldsQualifiers(save) {
    const S = save.season;
    const out = {};
    S.rank.forEach((region, i) => {
        const slots = WORLDS_SLOTS_BY_RANK[i] || 1;
        const L = S.leagues[leagueKey(region, 1)];
        const b = S.playoffs[leagueKey(region, 1) + ':summer'];
        const order = [];
        if (b && b.champion) order.push(b.champion);
        if (b && b.runnerUp) order.push(b.runnerUp);
        const rest = L.teams.filter(id => !order.includes(id))
            .sort((x, y) => (S.points[y] || 0) - (S.points[x] || 0)
                || ((S.places[x] || {}).summer || 10) - ((S.places[y] || {}).summer || 10));
        out[region] = { slots, order: [...order, ...rest], qualified: [...order, ...rest].slice(0, slots) };
    });
    return out;
}

export function buildWorlds(save) {
    const S = save.season;
    const q = worldsQualifiers(save);
    const field = REGION_IDS.flatMap(r => q[r].qualified);
    const seeds = field.sort((a, b) => teamStrength(save.teams[b], save.players) - teamStrength(save.teams[a], save.players));
    S.worlds = newBracket({ id: 'worlds', name: `Worlds ${S.year}`, kind: 'worlds', seeds, pairs: crossRegionPairs(seeds, save) });
    return S.worlds;
}

// ---------------------------------------------------------------- promotion
export function buildPromotion(save) {
    const S = save.season;
    for (const region of REGION_IDS) {
        const L1 = S.leagues[leagueKey(region, 1)];
        const b2 = S.playoffs[leagueKey(region, 2) + ':summer'];
        const annual = annualRows(L1, save);
        const down = annual[annual.length - 1] ? annual[annual.length - 1].id : null;
        const ninth = annual[annual.length - 2] ? annual[annual.length - 2].id : null;
        const up = b2 ? b2.champion : null;
        const challenger = b2 ? b2.runnerUp : null;
        S.promo[region] = {
            down, up,
            tie: ninth && challenger ? newTie(ninth, challenger, KNOCKOUT_BEST_OF) : null,
        };
    }
}

/** Apply the year's promotions and relegations to the teams' tiers. */
export function applyPromotion(save) {
    const S = save.season;
    const moves = [];
    for (const region of REGION_IDS) {
        const pr = S.promo[region];
        if (!pr) continue;
        const swap = (downId, upId) => {
            if (!downId || !upId) return;
            const d = save.teams[downId], u = save.teams[upId];
            if (!d || !u || d.tier !== 1 || u.tier !== 2) return;
            d.tier = 2; u.tier = 1;
            moves.push({ region, down: downId, up: upId });
        };
        swap(pr.down, pr.up);
        if (pr.tie && pr.tie.winner && pr.tie.winner === pr.tie.b) swap(pr.tie.a, pr.tie.b);
    }
    return moves;
}

/** Which league a team plays in this season. */
export function leagueOf(save, teamId) {
    const t = save.teams[teamId];
    return t && save.season ? save.season.leagues[leagueKey(t.region, t.tier)] : null;
}

export function leagueName(region, tier) {
    return tier === 1 ? REGION_BY_ID[region].league : TIER2_NAME[region];
}

export { TIER1_SIZE };
