// ===========================================================================
//  ULTIMATE ROSTER -- the world around your club
//
//  Two optional settings on the season (seasonData.world):
//    mode    'fictional' (the default, and every save written before this) or
//            'real' -- the league is the real orgs of a region, named and
//            rostered from the card database.
//    region  where your club plays: LCK, LPL, LEC, LCS, LCP or CBLOL. In real
//            mode it picks the league; in fictional mode it themes the names.
//
//  And the international events (First Stand, MSI, Worlds) as real BRACKETS:
//  your club, the other top teams of your own league, and the top teams of
//  every other region, every one of them fielding only Master-tier players
//  (rating 94 and up). Only your own tie is played; the rest are simulated.
//
//  Pure: no stores, no DOM. Rosters are drawn from the card database passed in.
//  Real orgs come from Ultimate Career's league table (career/constants.js
//  LEAGUES, career/teams.js orgAliases), so both modes share one world.
// ===========================================================================
import { LEAGUES } from '../career/constants.js';
import { orgAliases } from '../career/teams.js';
import { MYTHIC_TIERS, ALL_SPECIAL } from './cards.js';
import { ME, MATCHDAYS, simulateSeries, standings, buildCpuTeams, drawTags, sidePower, ordinaryTarget, powerBand } from './league.js';

export const WORLD_REGIONS = [
    { id: 'LCK',   name: 'Korea',         accent: '#3b82f6' },
    { id: 'LPL',   name: 'China',         accent: '#ef4444' },
    { id: 'LEC',   name: 'Europe',        accent: '#22d3ee' },
    { id: 'LCS',   name: 'North America', accent: '#f59e0b' },
    { id: 'LCP',   name: 'Asia-Pacific',  accent: '#14b8a6' },
    { id: 'CBLOL', name: 'Brazil',        accent: '#22c55e' },
];
const REGION_IDS = WORLD_REGIONS.map(r => r.id);
export const regionMeta = (id) => WORLD_REGIONS.find(r => r.id === id) || null;

/** International rosters never field a player under this rating (Master tier). */
export const MASTER_MIN = 94;

/** A fictional set of ten teams per region. Invented names only. */
export const FICTIONAL_SETS = {
    LCK:   ['Seoul Tigers', 'Han River Dragons', 'Busan Storm', 'Gangnam Blaze', 'Incheon Phantoms', 'Daegu Falcons', 'Jeju Wave', 'Suwon Titans', 'Gwangju Comets', 'Ulsan Steel'],
    LPL:   ['Shanghai Lotus', 'Beijing Jade', 'Chengdu Pandas', 'Wuhan Thunder', 'Hangzhou Mist', 'Shenzhen Circuit', 'Chongqing Fire', 'Xian Terracotta', 'Nanjing Cranes', 'Suzhou Silk'],
    LEC:   ['Berlin Wolves', 'Paris Lumiere', 'London Lions', 'Madrid Toros', 'Stockholm Frost', 'Warsaw Eagles', 'Rome Legion', 'Amsterdam Canals', 'Copenhagen Vikings', 'Prague Golems'],
    LCS:   ['Los Angeles Stars', 'New York Empire', 'Chicago Wind', 'Seattle Rain', 'Austin Outlaws', 'Toronto Maple', 'Miami Heatwave', 'Boston Tide', 'Denver Peaks', 'Atlanta Phoenix'],
    LCP:   ['Tokyo Ronin', 'Taipei Typhoon', 'Manila Sharks', 'Sydney Surf', 'Saigon Dragons', 'Osaka Kitsune', 'Hong Kong Neon', 'Singapore Merlions', 'Jakarta Garuda', 'Bangkok Tuskers'],
    CBLOL: ['Rio Samba', 'Sao Paulo Jaguars', 'Recife Sharks', 'Brasilia Comets', 'Salvador Waves', 'Curitiba Pines', 'Fortaleza Sun', 'Manaus Amazonas', 'Porto Alegre Gauchos', 'Belo Horizonte Miners'],
};

/** The season's world setting. A save without one is the original fictional
 *  league; `chosen` says whether the player ever picked. */
export function worldOf(sd) {
    const w = sd && sd.world && typeof sd.world === 'object' ? sd.world : null;
    const region = w && REGION_IDS.includes(w.region) ? w.region : null;
    return {
        mode: w && w.mode === 'real' && region ? 'real' : 'fictional',
        region: region || 'LEC',
        chosen: !!region,
    };
}

// ---------------------------------------------------------------- real orgs

/** The ten main-league orgs of a region, strongest first. */
export function realOrgs(region) {
    const L = LEAGUES[region];
    if (!L || !Array.isArray(L.tier1)) return [];
    return L.tier1
        .map(t => ({ org: t.id, name: t.name, accent: t.accent, strength: t.strength, region }))
        .sort((a, b) => b.strength - a.strength);
}

/** "HLE" -> "Hanwha Life": a card-database team name spelled out when it is the CURRENT name of
 *  a known org. A historical name (ROX, SKT) is left alone, because it is not that org's name. */
let _orgNames = null;
export function teamFullName(abbr) {
    if (!_orgNames) {
        _orgNames = new Map();
        for (const region of Object.keys(LEAGUES)) {
            for (const tier of ['tier1', 'tier2']) {
                for (const t of (LEAGUES[region] && LEAGUES[region][tier]) || []) {
                    const current = orgAliases(t.id)[0];
                    if (current && !_orgNames.has(current)) _orgNames.set(current, t.name);
                }
            }
        }
    }
    const n = _orgNames.get(abbr);
    return n && n !== abbr ? n : null;
}

const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
const _orgPools = new Map();
let _orgPoolDb = null;

/** Every playable card an org has ever had, across every name it played under. */
function orgPool(db, orgId) {
    if (_orgPoolDb !== db) { _orgPools.clear(); _orgPoolDb = db; }
    if (_orgPools.has(orgId)) return _orgPools.get(orgId);
    const aliases = new Set(orgAliases(orgId));
    const out = aliases.size
        ? db.filter(c => aliases.has(c.team) && ROLES.includes(c.role) && !MYTHIC_TIERS.includes(c.quality))
        : [];
    _orgPools.set(orgId, out);
    return out;
}

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const near = (list, target) => list.slice().sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));

/** The nine sides of a REAL league, weakest first, on the same difficulty curve
 *  as the fictional one (league.buildCpuTeams): the same slot targets, the same
 *  HARD and BOSS back stretch. Each org fields its own players nearest the
 *  slot's target, from any year of its history; a role it cannot fill at that
 *  level goes to another real player of the same region. That is what keeps a
 *  fresh club from meeting peak T1 on matchday one while every name stays real. */
export function buildRealTeams(db, splitNum, region, rng = Math.random, count = MATCHDAYS, power = 0) {
    const orgs = realOrgs(region).slice(0, count).reverse();          // the top nine, weakest first
    const regionPool = db.filter(c => c.region === region && ROLES.includes(c.role) && !ALL_SPECIAL.includes(c.quality));
    const anyPool = db.filter(c => ROLES.includes(c.role) && !ALL_SPECIAL.includes(c.quality));
    const { yr, band, boss, hard } = drawTags(splitNum, count, rng, power);

    const teams = [];
    for (let i = 0; i < orgs.length; i++) {
        const org = orgs[i];
        const isBoss = boss.has(i), isHard = hard.has(i);
        const target = isBoss ? 97 : isHard ? randInt(rng, 88, 94) : ordinaryTarget(i, yr, band, power);
        const own = orgPool(db, org.org);
        const team = {};
        const usedNames = new Set();
        for (const role of ROLES) {
            const free = (c) => c.role === role && !usedNames.has(c.name);
            const inWindow = (c) => c.rating >= target - 10 && c.rating <= target + 8;
            const ownRole = own.filter(free);
            let pick = null;
            const ownWin = ownRole.filter(inWindow);
            if (ownWin.length) pick = near(ownWin, target)[Math.floor(rng() * Math.min(3, ownWin.length))];
            if (!pick) {
                const regWin = regionPool.filter(c => free(c) && inWindow(c));
                if (regWin.length) pick = near(regWin, target)[Math.floor(rng() * Math.min(5, regWin.length))];
            }
            if (!pick && ownRole.length) pick = near(ownRole, target)[0];
            if (!pick) pick = near(anyPool.filter(free), target)[0] || null;
            if (pick) { team[role] = pick; usedNames.add(pick.name); }
        }
        const cards = Object.values(team);
        const tag = isBoss ? 'BOSS' : isHard ? 'HARD' : null;
        const cardAvg = cards.length ? Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length) : target;
        teams.push({ name: org.name, org: org.org, accent: org.accent, region, cards: team, avgRating: sidePower(cardAvg, tag, band, power, rng), tag });
    }
    return teams;
}

/** The nine CPU sides of a split under the save's world setting, drawn to `power` (the
 *  club's Power when the split starts; see league.POWER_BANDS). */
export function buildSeasonTeams(db, splitNum, world, rng = Math.random, power = 0) {
    if (world && world.mode === 'real') {
        const teams = buildRealTeams(db, splitNum, world.region, rng, MATCHDAYS, power);
        if (teams.length >= MATCHDAYS) return teams;
    }
    const names = world && world.chosen ? FICTIONAL_SETS[world.region] : undefined;
    return buildCpuTeams(db, splitNum, rng, MATCHDAYS, names, power);
}

// ---------------------------------------------------------------- internationals

/** Slots per region at each event, your own region included. */
export const INTL_FIELD = {
    firststand: { size: 8,  slots: { LCK: 2, LPL: 2, LEC: 1, LCS: 1, LCP: 1, CBLOL: 1 } },
    msi:        { size: 8,  slots: { LCK: 2, LPL: 2, LEC: 1, LCS: 1, LCP: 1, CBLOL: 1 } },
    worlds:     { size: 16, slots: { LCK: 4, LPL: 4, LEC: 3, LCS: 2, LCP: 2, CBLOL: 1 } },
};
/** The extra power an international side brings, at the top of the field; the
 *  weakest entrant gets a little over half of it. */
const EVENT_BONUS = { firststand: 8, msi: 12, worlds: 16 };

/** Your league's other top teams after a split: the other finalist first, then
 *  the semi-finalists, then the table. Names and org ids only -- an international
 *  roster is rebuilt from Master-tier cards at the event. */
export function homeQualifiers(league, playoffs, n = 3) {
    if (!league || !Array.isArray(league.teams)) return [];
    const order = [];
    const push = (id) => { if (id && id !== ME && !order.includes(id)) order.push(id); };
    if (playoffs) {
        push(playoffs.champion); push(playoffs.runnerUp);
        for (const m of playoffs.semis || []) { push(m.a); push(m.b); }
    }
    try { for (const row of standings(league)) push(row.id); } catch (e) { /* table unreadable: playoffs order only */ }
    return order.slice(0, n).map(id => league.teams.find(t => t.id === id)).filter(Boolean)
        .map(t => ({ name: String(t.name || 'Rival'), org: t.org || null, accent: t.accent || null }));
}

/** Master-tier fives for a whole field: each entrant's own org's Master cards
 *  first, then its region's, then anyone's, and no player twice in the field.
 *
 *  FILLED ROLE BY ROLE, SCARCEST FIRST, not team by team. The database holds
 *  only 15 distinct Master-tier top laners and a 16-team Worlds needs 15, and a
 *  few players have Master cards in two roles -- filled team by team, a mid pick
 *  could claim a name the last team needed at top and force a repeat. */
const ROLE_SCARCITY = ['TOP', 'MID', 'ADC', 'SUP', 'JNG'];
function masterRosters(db, entries, rng) {
    const pool = db.filter(c => ROLES.includes(c.role) && c.rating >= MASTER_MIN && !MYTHIC_TIERS.includes(c.quality));
    const used = { ids: new Set(), names: new Set() };
    const out = entries.map(() => ({}));
    const own = entries.map(e => (e.org ? orgPool(db, e.org).filter(c => c.rating >= MASTER_MIN) : []));
    for (const role of ROLE_SCARCITY) {
        entries.forEach((entry, i) => {
            const free = (c) => c.role === role && !used.ids.has(c.id) && !used.names.has(c.name);
            const tiers = [
                own[i].filter(free),
                pool.filter(c => free(c) && c.region === entry.region),
                pool.filter(free),
                pool.filter(c => c.role === role && !used.ids.has(c.id)),   // names exhausted: another year's card
                pool.filter(c => c.role === role),                          // and the last resort
            ];
            const list = (tiers.find(t => t.length) || []).slice().sort((a, b) => b.rating - a.rating);
            const pick = list[Math.floor(rng() * Math.min(3, list.length))];
            if (pick) { out[i][role] = pick; used.ids.add(pick.id); used.names.add(pick.name); }
        });
    }
    // Back in the conventional TOP..SUP key order for display.
    return out.map(team => ROLES.reduce((m, r) => { if (team[r]) m[r] = team[r]; return m; }, {}));
}

/** The other regions' representatives, strongest first with a little luck. */
function regionEntrants(world, region, n, rng) {
    if (n <= 0) return [];
    if (world.mode === 'real') {
        return realOrgs(region)
            .map(o => ({ ...o, roll: o.strength + rng() * 8 }))
            .sort((a, b) => b.roll - a.roll)
            .slice(0, n)
            .map(o => ({ name: o.name, org: o.org, accent: o.accent, region }));
    }
    const names = (FICTIONAL_SETS[region] || []).map((name, i) => ({ name, roll: (10 - i) + rng() * 4 }))
        .sort((a, b) => b.roll - a.roll).slice(0, n);
    return names.map(x => ({ name: x.name, org: null, accent: (regionMeta(region) || {}).accent || null, region }));
}

const SEED_ORDER = {
    8: [1, 8, 4, 5, 2, 7, 3, 6],
    16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
};

export function intlRoundName(size, r) {
    const left = size / Math.pow(2, r);
    if (left <= 2) return 'Final';
    if (left <= 4) return 'Semifinals';
    if (left <= 8) return 'Quarterfinals';
    return 'Round of 16';
}

/**
 * The whole bracket for one event. `me` is { name, logo, power }; `home` is the
 * list homeQualifiers() stored on seasonData.qualified when the spot was won.
 */
export function buildIntlBracket(db, event, world, me, home = [], rng = Math.random) {
    const cfg = INTL_FIELD[event];
    if (!cfg || !db) return null;
    // `home` comes back out of a save, so it is re-shaped before anything reads it.
    home = (Array.isArray(home) ? home : [])
        .filter(h => h && typeof h.name === 'string' && h.name.trim())
        .map(h => ({
            name: h.name.trim().slice(0, 40),
            org: typeof h.org === 'string' ? h.org : null,
            accent: typeof h.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(h.accent) ? h.accent : null,
        }));
    const entrants = [];
    for (const region of REGION_IDS) {
        const n = cfg.slots[region] || 0;
        if (region === world.region) {
            for (const h of home.slice(0, Math.max(0, n - 1))) entrants.push({ ...h, region });
            // A thin home list (an old save) is topped up from the region itself.
            const short = n - 1 - Math.min(n - 1, home.length);
            const taken = new Set(entrants.map(e => e.name));
            for (const e of regionEntrants(world, region, short + 3, rng)) {
                if (entrants.filter(x => x.region === region).length >= n - 1) break;
                if (!taken.has(e.name)) entrants.push(e);
            }
        } else {
            entrants.push(...regionEntrants(world, region, n, rng));
        }
    }
    const field = entrants.slice(0, cfg.size - 1);
    const rosters = masterRosters(db, field, rng);
    const teams = field.map((e, i) => {
        const cards = rosters[i];
        const list = Object.values(cards);
        const avg = list.length ? Math.round(list.reduce((s, c) => s + c.rating, 0) / list.length) : MASTER_MIN;
        return { id: 'i' + (i + 1), name: e.name, org: e.org, accent: e.accent, region: e.region, cards, base: avg, tag: null };
    });
    // Bonus by standing in the field: the strongest base gets all of it.
    const sorted = teams.slice().sort((a, b) => b.base - a.base);
    const bonus = EVENT_BONUS[event] || 8;
    sorted.forEach((t, i) => {
        const k = sorted.length > 1 ? 1 - i / (sorted.length - 1) : 1;
        t.avgRating = Math.round(t.base + bonus * (0.55 + 0.45 * k));
        t.tag = null;
    });
    // Drawn to your Power like a league (league.POWER_BANDS), scaled from nine sides to the
    // size of the field: the strongest entrants become the BOSS sides, the next the HARD ones,
    // so they are seeded high and you meet them in the later rounds.
    const myPower = Math.round(Number(me && me.power) || 0);
    const band = powerBand(myPower);
    if (band) {
        const scale = sorted.length / MATCHDAYS;
        const nBoss = Math.min(sorted.length, Math.round(randInt(rng, band.boss[0], band.boss[1]) * scale));
        const nHard = Math.min(sorted.length - nBoss, Math.round(randInt(rng, band.hard[0], band.hard[1]) * scale));
        sorted.forEach((t, i) => {
            const tag = i < nBoss ? 'BOSS' : i < nBoss + nHard ? 'HARD' : null;
            if (!tag) return;
            t.tag = tag;
            t.avgRating = sidePower(t.avgRating, tag, band, myPower, rng);
        });
    }
    const mine ={ id: ME, name: me.name, logo: me.logo, region: world.region, avgRating: Math.round(me.power || 0), cards: null };
    const all = [mine, ...teams].sort((a, b) => b.avgRating - a.avgRating);
    all.forEach((t, i) => { t.seed = i + 1; });

    const order = SEED_ORDER[cfg.size];
    const bySeed = (s) => all[s - 1];
    const first = [];
    for (let i = 0; i < order.length; i += 2) first.push({ a: bySeed(order[i]).id, b: bySeed(order[i + 1]).id, sa: null, sb: null });
    const roundsTotal = Math.log2(cfg.size);
    const rounds = [{ name: intlRoundName(cfg.size, 0), bo: roundsTotal === 1 ? 5 : 3, ties: first }];
    return { event, size: cfg.size, teams: all, rounds, roundsTotal, champion: null, runnerUp: null, out: null };
}

const winner = (t) => (t.sa === null ? null : (t.sa > t.sb ? t.a : t.b));
const loser = (t) => (t.sa === null ? null : (t.sa > t.sb ? t.b : t.a));
export const intlTeam = (b, id) => (b && b.teams.find(t => t.id === id)) || null;

/** The player's tie in the round being played, or null once they are out or done. */
export function intlMyTie(b) {
    if (!b || b.champion || b.out !== null) return null;
    const r = b.rounds[b.rounds.length - 1];
    const tie = r.ties.find(t => t.a === ME || t.b === ME);
    return tie && tie.sa === null ? tie : null;
}

/** Wins needed in the player's current tie (best of 3, the final best of 5). */
export function intlWinsNeeded(b) {
    const r = b && b.rounds[b.rounds.length - 1];
    return r && r.bo === 5 ? 3 : 2;
}

/** Records the player's series, simulates the rest of the round and builds the next
 *  one. A player who is knocked out sees the bracket played to its end. Returns a
 *  NEW bracket. `myPower` is used for any series simulated with the player in it
 *  (none today, but the field is seeded off it). */
export function intlRecord(b, myScore, theirScore, myPower, rng = Math.random) {
    let next = { ...b, rounds: b.rounds.map(r => ({ ...r, ties: r.ties.map(t => ({ ...t })) })) };
    const power = (id) => (id === ME ? myPower : (intlTeam(next, id) || {}).avgRating || 0);
    const playRound = (r, mine) => {
        const need = r.bo === 5 ? 3 : 2;
        for (const t of r.ties) {
            if (t.sa !== null) continue;
            if (t.a === ME || t.b === ME) {
                if (!mine) continue;
                if (t.a === ME) { t.sa = mine.me; t.sb = mine.them; } else { t.sa = mine.them; t.sb = mine.me; }
            } else {
                const s = simulateSeries(power(t.a), power(t.b), rng, need);
                t.sa = s.a; t.sb = s.b;
            }
        }
    };
    const advance = () => {
        const last = next.rounds[next.rounds.length - 1];
        if (last.ties.some(t => t.sa === null)) return false;
        if (last.ties.length === 1) {
            next.champion = winner(last.ties[0]);
            next.runnerUp = loser(last.ties[0]);
            return false;
        }
        const ties = [];
        for (let i = 0; i < last.ties.length; i += 2) ties.push({ a: winner(last.ties[i]), b: winner(last.ties[i + 1]), sa: null, sb: null });
        const ri = next.rounds.length;
        next.rounds.push({ name: intlRoundName(next.size, ri), bo: ties.length === 1 ? 5 : 3, ties });
        return true;
    };

    playRound(next.rounds[next.rounds.length - 1], { me: myScore, them: theirScore });
    const myTie = next.rounds[next.rounds.length - 1].ties.find(t => t.a === ME || t.b === ME);
    if (myTie && winner(myTie) !== ME) next.out = next.rounds.length - 1;
    // Keep going while the player is not in the round being drawn.
    while (advance()) {
        const r = next.rounds[next.rounds.length - 1];
        if (next.out === null && r.ties.some(t => t.a === ME || t.b === ME)) break;
        playRound(r, null);
    }
    return next;
}

/** A random international side's name, for the old gauntlet modes (Legacy, the
 *  Golden Road run) that do not draw a bracket. */
export function intlTeamName(world, rng = Math.random) {
    const others = REGION_IDS.filter(r => r !== world.region);
    const region = others[Math.floor(rng() * others.length)];
    const list = world.mode === 'real' ? realOrgs(region).map(o => o.name) : (FICTIONAL_SETS[region] || []);
    return list.length ? list[Math.floor(rng() * Math.min(4, list.length))] : 'International Side';
}
