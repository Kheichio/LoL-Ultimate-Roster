// ===========================================================================
//  ULTIMATE MANAGER -- the world
//
//  Built once, at the start of a save, from the card database:
//    - every real pro is a PERSON: all their STANDARD cards (Bronze..Challenger,
//      never a Champion/MVP/legacy/award/Hall of Legends print), grouped by name
//    - each region's leagues are that region's real teams of the start year
//      (or the nearest year with cards, see DATA_LOOKBACK), strongest ten in
//      tier 1, the rest in tier 2, and RANDOM teams of random players wherever a
//      league is short
//  Then, every new year, the pros whose cards begin that year DEBUT: into their
//  real org if it exists in this world, otherwise into free agency.
// ===========================================================================
import { TIER_ORDER } from '../utils/cards.js';
import { FICTIONAL_SETS } from '../utils/world.js';
import {
    REGION_IDS, ROLE_IDS, TEAM_NAMES, TEAM_COLORS, colorFromName, sameOrg, DATA_LOOKBACK, DATA_LOOKAHEAD,
    TIER1_SIZE, TIER2_SIZE, TACTICS, ROSTER_MAX, BORROWED_REGION_GAP, REGION_LEVEL,
} from './data.js';
import { makeRealPlayer, makeRandomPlayer, wageDemand, ovrOf, pickPersonality } from './people.js';
import { bestLineup, bestTactic, lineupOf, teamStrength } from './match.js';
import { clamp, randInt, rngFor, pick, shuffle, hash32 } from './util.js';

/** Contract years left at the start: some expire this year, most run on. */
function contractYears(rng) {
    const r = rng();
    return r < 0.25 ? 0 : r < 0.7 ? 1 : 2;
}

// ---------------------------------------------------------------- people
let _idx = null;
let _idxDb = null;

/**
 * Every real pro, keyed `r:name` (lowercase). Two different players who share a
 * name are told apart by having cards in the same year: the second becomes
 * `r:name#2`. Memoised per database.
 */
export function personsIndex(db) {
    if (_idx && _idxDb === db) return _idx;
    const std = (db || []).filter(c => TIER_ORDER.includes(c.quality) && ROLE_IDS.includes(c.role) && REGION_IDS.includes(c.region) && c.stats);
    const groups = new Map();
    for (const c of std) {
        const k = String(c.name).toLowerCase();
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
    }
    const persons = new Map();
    const byYear = new Map();
    // Every name on any card -- coaches and special prints included -- is off
    // limits to the random-player generator.
    const names = new Set((db || []).map(c => String(c.name).toLowerCase()));
    const flags = (typeof window !== 'undefined' && window.playerNationalityOverrides) || {};
    const regionFlags = (typeof window !== 'undefined' && window.regionDefaultFlags) || {};
    for (const [k, cards] of groups) {
        names.add(k);
        cards.sort((a, b) => a.year - b.year || b.rating - a.rating);
        const clusters = [];
        for (const c of cards) {
            let home = clusters.find(cl => !cl.some(x => x.year === c.year));
            if (!home) { home = []; clusters.push(home); }
            home.push(c);
        }
        clusters.forEach((cl, i) => {
            const key = 'r:' + k + (i ? '#' + (i + 1) : '');
            const first = cl[0], last = cl[cl.length - 1];
            const nat = first.region;
            // No birthdays in the card data, so an age is estimated: the first
            // seasons' pros were older, a long career means a young debut, and
            // nobody holds a real card past 33.
            const span = last.year - first.year;
            const jitter = (hash32('age:' + key) % 3) - 1;
            let debutAge = (first.year <= 2012 ? 22 : 20) - (span >= 9 ? 2 : span >= 6 ? 1 : 0) + jitter;
            debutAge = clamp(Math.min(debutAge, 33 - span), 16, 25);
            const person = {
                key,
                name: last.name,
                cards: cl,
                firstYear: first.year,
                lastYear: last.year,
                peak: Math.max(...cl.map(c => c.rating)),
                nat,
                flag: flags[first.name] || flags[last.name] || regionFlags[nat] || null,
                born: first.year - debutAge,
                // Stable per person, so Faker is the same man in every save.
                pers: pickPersonality(rngFor('pers:' + key)),
            };
            persons.set(key, person);
            for (const c of cl) {
                if (!byYear.has(c.year)) byYear.set(c.year, []);
                byYear.get(c.year).push({ person, card: c });
            }
        });
    }
    _idx = { persons, byYear, names };
    _idxDb = db;
    return _idx;
}

/** The person's card for a year: that year's, else the most recent before it,
 *  else the first one after. */
export function cardFor(person, year) {
    let best = null;
    for (const c of person.cards) if (c.year <= year && (!best || c.year > best.year)) best = c;
    return best || person.cards[0];
}

export function hasCardAfter(person, year) {
    return !!(person && person.lastYear > year);
}

// ---------------------------------------------------------------- data years
/** Which card year a region's leagues are built from, for a start year. */
export function dataYearFor(idx, region, year) {
    const teamsIn = (y) => {
        const e = (idx.byYear.get(y) || []).filter(x => x.card.region === region);
        return new Set(e.map(x => x.card.team)).size;
    };
    if (teamsIn(year) >= 6) return year;
    for (let d = 1; d <= DATA_LOOKBACK; d++) if (teamsIn(year - d) >= 6) return year - d;
    for (let d = 1; d <= DATA_LOOKAHEAD; d++) if (teamsIn(year + d) >= 6) return year + d;
    return null;
}

/** For the setup screen: what each region looks like in a start year. */
export function regionPreview(db, year) {
    const idx = personsIndex(db);
    return REGION_IDS.map(region => {
        const dy = dataYearFor(idx, region, year);
        const tags = dy == null ? [] : [...new Set((idx.byYear.get(dy) || []).filter(x => x.card.region === region).map(x => x.card.team))];
        return { region, dataYear: dy, realTeams: tags.length, tags };
    });
}

// ---------------------------------------------------------------- teams
export function teamName(region, tag) {
    return (TEAM_NAMES[region] && TEAM_NAMES[region][tag]) || tag;
}

function newTeam({ id, short, name, region, tier, real, color }) {
    return {
        id, short, name, region, tier, real: !!real,
        color: color || TEAM_COLORS[short] || colorFromName(name),
        rep: 50, roster: [], lineup: {}, tactic: TACTICS[0].id, chem: real ? 66 : 52,
        coach: null, training: 'balanced',
    };
}

export function nextGenId(save) {
    save.genSeq = (Number(save.genSeq) || 0) + 1;
    return 'g:' + save.genSeq;
}

/** Sign a player to a team on a fresh contract. */
export function signTo(save, p, team, { years = null, wage = null, rng = Math.random } = {}) {
    const year = save.time.year;
    if (p.team && save.teams[p.team]) {
        const old = save.teams[p.team];
        old.roster = old.roster.filter(id => id !== p.id);
        for (const r of ROLE_IDS) if (old.lineup[r] === p.id) delete old.lineup[r];
    }
    p.team = team.id;
    p.wage = wage != null ? wage : Math.round(wageDemand(p, year, team.region) * (0.85 + rng() * 0.15) / 1000) * 1000;
    p.until = year + (years != null ? years : contractYears(rng));
    p.joined = year;
    if (!team.roster.includes(p.id)) team.roster.push(p.id);
    const fa = save.freeAgents;
    const i = fa.indexOf(p.id);
    if (i >= 0) fa.splice(i, 1);
}

export function release(save, p) {
    const t = p.team && save.teams[p.team];
    if (t) {
        t.roster = t.roster.filter(id => id !== p.id);
        for (const r of ROLE_IDS) if (t.lineup[r] === p.id) delete t.lineup[r];
    }
    p.team = null;
    p.wage = 0;
    if (!save.freeAgents.includes(p.id)) save.freeAgents.push(p.id);
}

function coachFrom(card) {
    return { name: card.name, rating: card.rating, real: true, cid: card.id };
}

const COACH_NAMES = ['Mentor', 'Atlas', 'Sage', 'Compass', 'Anchor', 'Beacon', 'Keel', 'Forge', 'Lantern', 'Pilot', 'Harbor', 'Summit'];
function randomCoach(rng, level) {
    return { name: pick(rng, COACH_NAMES) + pick(rng, ['', '', 'x', 'o', 'Prime', 'Jr']), rating: clamp(Math.round(level + randInt(rng, -4, 4)), 55, 90), real: false, cid: null };
}

// ---------------------------------------------------------------- building
/**
 * The whole world for a start year. Pure apart from the rng; the database is
 * passed in. Returns the parts of a save that hold the world.
 */
export function buildWorld(db, startYear, seed) {
    const rng = rngFor('world:' + seed);
    const idx = personsIndex(db);
    const save = { time: { year: startYear }, teams: {}, players: {}, freeAgents: [], seen: [], genSeq: 0 };
    const taken = new Set(idx.names);
    const seen = new Set();
    const coachCards = db.filter(c => c.role === 'COACH' && TIER_ORDER.includes(c.quality));

    // Exact-year regions first, so a pro is placed where he really played that
    // year before a region borrowing another year can claim him.
    const plan = REGION_IDS.map(region => ({ region, dy: dataYearFor(idx, region, startYear) }))
        .sort((a, b) => (Math.abs((a.dy ?? 9999) - startYear)) - (Math.abs((b.dy ?? 9999) - startYear)));
    const dataYears = {};

    for (const { region, dy } of plan) {
        dataYears[region] = dy;
        const entries = dy == null ? [] : (idx.byYear.get(dy) || []).filter(x => x.card.region === region);
        const byTag = new Map();
        for (const e of entries) {
            if (!byTag.has(e.card.team)) byTag.set(e.card.team, []);
            byTag.get(e.card.team).push(e);
        }
        const realTeams = [];
        for (const [tag, list] of byTag) {
            const team = newTeam({ id: region + ':' + tag, short: tag, name: teamName(region, tag), region, tier: 1, real: true });
            for (const { person, card } of list.sort((a, b) => b.card.rating - a.card.rating)) {
                if (seen.has(person.key) || team.roster.length >= 7) continue;
                const p = makeRealPlayer(person, card, startYear, rngFor('p:' + seed + ':' + person.key));
                save.players[p.id] = p;
                seen.add(person.key);
                team.roster.push(p.id);
                p.team = team.id;
            }
            const cc = coachCards.find(c => c.region === region && c.team === tag && c.year === dy);
            if (cc) team.coach = coachFrom(cc);
            realTeams.push(team);
        }
        // Fill any role a real team is missing, near its level.
        for (const t of realTeams) {
            const lvl = t.roster.length ? t.roster.map(id => ovrOf(save.players[id])).reduce((s, v) => s + v, 0) / t.roster.length : 70;
            for (const role of ROLE_IDS) {
                if (t.roster.some(id => save.players[id].role === role)) continue;
                const p = makeRandomPlayer({ id: nextGenId(save), role, region, year: startYear, target: lvl - 3, takenNames: taken }, rng);
                save.players[p.id] = p; p.team = t.id; t.roster.push(p.id);
            }
        }
        realTeams.sort((a, b) => teamStrengthQuick(b, save.players) - teamStrengthQuick(a, save.players));
        const t1 = realTeams.slice(0, TIER1_SIZE);
        const t2 = realTeams.slice(TIER1_SIZE, TIER1_SIZE + TIER2_SIZE);
        const spare = realTeams.slice(TIER1_SIZE + TIER2_SIZE);
        // A region rarely has more real teams than both tiers hold; the rest disband into free agency.
        for (const t of spare) for (const id of t.roster) { const p = save.players[id]; p.team = null; save.freeAgents.push(id); }

        const t1Level = t1.length ? t1.map(t => teamStrengthQuick(t, save.players)).reduce((s, v) => s + v, 0) / t1.length : 74;
        const names = shuffle(rng, (FICTIONAL_SETS[region] || []).slice());
        let made = 0;
        const randomTeam = (tier, target) => {
            made++;
            const nm = names.pop() || `${region} Rising ${made}`;
            const short = nm.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3);
            const t = newTeam({ id: 'x:' + region + ':' + made, short, name: nm, region, tier, real: false });
            for (const role of ROLE_IDS) {
                const p = makeRandomPlayer({ id: nextGenId(save), role, region, year: startYear, target: target + randInt(rng, -3, 3), age: randInt(rng, 18, 25), takenNames: taken }, rng);
                save.players[p.id] = p; p.team = t.id; t.roster.push(p.id);
            }
            t.coach = randomCoach(rng, target);
            return t;
        };
        while (t1.length < TIER1_SIZE) t1.push(randomTeam(1, t1Level - 4));
        while (t2.length < TIER2_SIZE) t2.push(randomTeam(2, t1Level - 10));
        t1.forEach(t => { t.tier = 1; });
        t2.forEach(t => { t.tier = 2; });

        // Depth: every team carries two young subs, and gets a coach if it has none.
        for (const t of [...t1, ...t2]) {
            const lvl = teamStrengthQuick(t, save.players);
            while (t.roster.length < 7) {
                const roles = ROLE_IDS.slice().sort((a, b) => t.roster.filter(id => save.players[id].role === a).length - t.roster.filter(id => save.players[id].role === b).length);
                const p = makeRandomPlayer({ id: nextGenId(save), role: roles[0], region, year: startYear, target: lvl - 7, age: randInt(rng, 17, 20), takenNames: taken }, rng);
                save.players[p.id] = p; p.team = t.id; t.roster.push(p.id);
            }
            if (!t.coach) t.coach = randomCoach(rng, lvl - 2);
            save.teams[t.id] = t;
        }
        // Reputation by standing: the best tier 1 sides are the biggest clubs.
        t1.forEach((t, i) => { t.rep = clamp(Math.round(92 - i * 5 + (t.real ? 0 : -8)), 30, 95); });
        t2.forEach((t, i) => { t.rep = clamp(Math.round(42 - i * 3 + (t.real ? 4 : 0)), 12, 50); });
    }

    // Hold a region built from another year's cards under the two strongest
    // regions (BORROWED_REGION_GAP): ratings drift between card years, and 2015's
    // NA cards would otherwise make North America the best league of 2013.
    const t1Mean = (region) => {
        const ts = Object.values(save.teams).filter(t => t.region === region && t.tier === 1);
        return ts.reduce((s, t) => s + teamStrengthQuick(t, save.players), 0) / Math.max(1, ts.length);
    };
    const means = Object.fromEntries(REGION_IDS.map(r => [r, t1Mean(r)]));
    const exact = REGION_IDS.filter(r => dataYears[r] === startYear);
    const refPool = (exact.length >= 2 ? exact : REGION_IDS).map(r => means[r]).sort((a, b) => b - a).slice(0, 2);
    const ref = refPool.reduce((s, v) => s + v, 0) / Math.max(1, refPool.length);
    for (const region of REGION_IDS) {
        if (dataYears[region] === startYear) continue;
        const cap = ref - (BORROWED_REGION_GAP[region] || 0);
        const shift = cap - means[region];
        if (shift >= 0) continue;
        for (const t of Object.values(save.teams)) {
            if (t.region !== region) continue;
            for (const id of t.roster) {
                const p = save.players[id];
                for (const k of Object.keys(p.a)) p.a[k] = clamp(p.a[k] + shift, 30, 99);
                p.pot = clamp(Math.round(p.pot + shift), 1, 99);
                if (p.pot < ovrOf(p)) p.pot = ovrOf(p);
            }
        }
    }

    // Contracts, lineups and plans.
    for (const t of Object.values(save.teams)) {
        for (const id of t.roster) {
            const p = save.players[id];
            p.wage = Math.round(wageDemand(p, startYear, t.region) * (0.85 + rng() * 0.15) / 1000) * 1000;
            p.until = startYear + contractYears(rng);
        }
        t.lineup = bestLineup(t, save.players);
        t.tactic = bestTactic(lineupOf(t, save.players));
        t.pref = t.tactic;
    }
    // A handful of unsigned prospects per region, so free agency is never empty.
    for (const region of REGION_IDS) {
        const lvl = 70;
        for (let i = 0; i < 6; i++) {
            const p = makeRandomPlayer({ id: nextGenId(save), role: ROLE_IDS[i % 5], region, year: startYear, target: lvl - randInt(rng, 2, 10), age: randInt(rng, 16, 19), takenNames: taken }, rng);
            save.players[p.id] = p;
            save.freeAgents.push(p.id);
        }
    }
    save.seen = [...seen];
    save.dataYears = dataYears;
    save.takenNames = null;   // rebuilt from players on load; never persisted
    return save;
}

function teamStrengthQuick(t, P) {
    const best = {};
    for (const id of t.roster) {
        const p = P[id];
        if (!p) continue;
        const v = ovrOf(p);
        if (!best[p.role] || v > best[p.role]) best[p.role] = v;
    }
    return ROLE_IDS.reduce((s, r) => s + (best[r] || 55), 0) / ROLE_IDS.length;
}

// ---------------------------------------------------------------- yearly debuts
/**
 * The real pros whose cards begin in `year` (and who have never been in this
 * world) arrive. Returns [{ player, team|null, forUser }] so the engine can tell
 * the manager about a prospect for their own org instead of signing him for them.
 */
export function debutsFor(save, db, year, userTeamId, rng) {
    const idx = personsIndex(db);
    const seen = new Set(save.seen || []);
    const out = [];
    for (const { person, card } of idx.byYear.get(year) || []) {
        if (seen.has(person.key) || save.players[person.key]) continue;
        const p = makeRealPlayer(person, card, year, rngFor('p:' + save.seed + ':' + person.key));
        p.born = Math.min(p.born, year - 17);
        save.players[p.id] = p;
        seen.add(person.key);
        // His real org, if it exists in this world under any of its names.
        // A club the manager founded is never anybody's real org, whatever its tag.
        const home = Object.values(save.teams).find(t => t.real && !t.custom && t.region === card.region && sameOrg(card.region, t.short, card.team));
        if (home && home.id === userTeamId) {
            save.freeAgents.push(p.id);
            p.prospectFor = home.id;
            out.push({ player: p, team: home, forUser: true });
        } else if (home && home.roster.length < ROSTER_MAX) {
            signTo(save, p, home, { rng });
            out.push({ player: p, team: home, forUser: false });
        } else {
            save.freeAgents.push(p.id);
            out.push({ player: p, team: null, forUser: false });
        }
    }
    save.seen = [...seen];
    return out;
}

/** Random prospects for a region's free agency, built around the region's level:
 *  raw now, with the potential to reach its best teams. */
export function regensFor(save, region, n, year, rng, taken) {
    const out = [];
    const base = REGION_LEVEL[region] || 78;
    for (let i = 0; i < n; i++) {
        const target = base - 15 + randInt(rng, 0, 9);
        const p = makeRandomPlayer({ id: nextGenId(save), role: pick(rng, ROLE_IDS), region, year, target, age: randInt(rng, 16, 19), takenNames: taken }, rng);
        save.players[p.id] = p;
        save.freeAgents.push(p.id);
        out.push(p);
    }
    return out;
}

/** Every handle in use: the card database's and this save's random players'. */
export function takenNames(save, db) {
    const s = new Set(db ? personsIndex(db).names : []);
    for (const p of Object.values(save.players)) s.add(String(p.name).toLowerCase());
    return s;
}

export { teamStrength };
