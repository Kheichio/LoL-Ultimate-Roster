// ===========================================================================
//  ULTIMATE MANAGER -- the engine
//
//  The year is CALENDAR, one step at a time. `advance(save, mySeries)` plays
//  the current step for the whole world -- every region, both tiers, the
//  internationals -- using the manager's own series result when they played it
//  by hand (or simming it for them), then runs the week: training, morale,
//  chemistry, money, inbox. The offseason step rolls the year over.
//
//  The manager cannot move on while something needs them (blockInfo): an
//  inbox decision, a lineup that cannot field five, a transfer window closing
//  on an incomplete roster, or -- before the offseason -- a contract nobody has
//  decided about. Players never leave without the manager knowing why.
//
//  Every function here mutates the save it is given; the store wraps them.
// ===========================================================================
import {
    CALENDAR, STEPS_PER_YEAR, ROLE_IDS, ROLE_BY_ID, TRAINING_BY_ID, MATCH_XP, MGR_XP, MGR_XP_PER_LEVEL, PERK_BY_ID,
    LEAGUE_WEEKS, PRIZES, TACTICS, TACTIC_BY_ID, REGION_IDS, MANAGER_SAVE_VERSION, ROSTER_MAX, TALKS,
    champsFor, CHAMP_RELEASE, ATTR_KEYS, FREE_AGENT_FLOOR, FEARLESS_FROM, ACH_BY_ID, POINT_ACTIONS, REGION_LEVEL,
    SQUAD_STATUS_BY_ID, phaseOfStep, SEASON_PHASE_BY_ID, TIER1_SIZE, TIER2_SIZE, colorFromName,
    INTENSITY_BY_ID, BENCH_PROGRAM_BY_ID, SESSIONS_PER_WEEK, SESSION_BY_ID, BOOTCAMP_BY_ID, STAKE_TRANCHES, MIN_STAKE,
    BUYBACK_PREMIUM, XP_PER_LEVEL, POINTS_PER_LEVEL, ROLE_WEIGHTS, PAST_CEILING_FACTOR, PRESTIGE,
} from './data.js';
import {
    ovrOf, fx, grantXP, xpMultiplier, ageDecline, retiresNow, formFrom, ageOf, blankStats, anchorToCard,
    pickPool, makeRandomPlayer, makeRealPlayer, focusAttr, weightedOVR,
} from './people.js';
import { trackClub, histGame, histTitle, histAward, histYearEnd, realHistory } from './history.js';
import { metaFor } from '../career/constants.js';
import {
    lineupOf, bestLineup, bestTactic, quickSeries, teamStrength, tacticFit, quickGame, autoDraft,
} from './match.js';
import {
    newSeason, buildPlayoffs, advanceBracket, recordLeagueTie, settleSplit, buildMSI, buildWorlds,
    buildPromotion, applyPromotion, tableRows, annualRows, leagueKey, leagueOf, worldsQualifiers, tieFor, leagueName,
} from './season.js';
import {
    sponsorIncome, wageBill, earn, aiWindow, aiRenewals, aiBidsForUser, fmtK, expireOffers, listingOffers,
    ownerStake, soleOwner, hasBoard, boardCanSack, clubValuation, economyLevel, refreshEconomy, econIndex,
    settleInvestment, fadeInvestment, ownerFunding,
} from './market.js';
export { ownerStake, soleOwner, hasBoard, boardCanSack, clubValuation };
import {
    buildWorld, debutsFor, regensFor, personsIndex, hasCardAfter, takenNames, release, signTo, nextGenId, dataYearFor,
} from './world.js';
import { sameOrg } from './data.js';
import { clamp, pick, randInt, shuffle, rngFor, ordinal } from './util.js';

/** How hard a real player is pulled toward his real card each new year. */
export const HISTORY_PULL = { world: 0.6, mine: 0.3 };

/** One auto-drafted game, for estimates. */
function quickGameAuto(a, b, ctx, rng) {
    const ds = autoDraft(a, b, ctx, rng, []);
    return quickGame({ ...a, picks: ds.picks.a }, { ...b, picks: ds.picks.b }, ctx, rng, false);
}

// ---------------------------------------------------------------- creation
/** The world for the setup screen; finalised into a save once a team is chosen. */
export function previewWorld(db, startYear, seed) {
    const world = buildWorld(db, startYear, seed);
    applyPrestige(db, world, startYear);
    world.econ = { year: startYear, level: economyLevel(world) };
    settleInvestment(world);
    return world;
}

/**
 * A real org's titles before the start year make it a bigger club (PRESTIGE). Reputation
 * is otherwise only where its cards rank that year, which made T1 the fourth-richest club
 * in the 2026 LCK. Once per save: `t.prestige` marks a club that has had it.
 */
export function applyPrestige(db, world, startYear) {
    if (!db) return;
    for (const t of Object.values(world.teams)) {
        if (!t.real || t.custom || t.tier !== 1 || t.prestige != null) continue;
        const h = realHistory(db, t, startYear).honours;
        const bonus = Math.min(PRESTIGE.max, h.reduce((s, x) => s + (PRESTIGE[x.kind] || 0), 0));
        t.prestige = bonus;
        if (bonus > 0) t.rep = clamp((Number(t.rep) || 50) + bonus, 0, 98);
    }
}

/**
 * Turn a previewed world into a save. Either `teamId` (take over a club) or
 * `custom` ({ name, short, color, region, tier }: found a club of your own,
 * which takes the place of the weakest side in that league and starts with an
 * empty roster to fill from free agency).
 */
export function finalizeSave(world, { name, teamId, startYear, seed, custom = null }) {
    if (custom) teamId = foundClub(world, custom, startYear, seed);
    const team = world.teams[teamId];
    const save = {
        v: MANAGER_SAVE_VERSION,
        created: true,
        seed,
        time: { startYear, year: startYear, step: 0 },
        manager: {
            name: String(name || 'Manager').slice(0, 18),
            teamId, level: 1, xp: 0, points: 1, perks: {},
            rep: clamp(Math.round((team.rep || 50) * 0.5), 10, 60),
            wins: 0, losses: 0, titles: 0, sacked: 0, prep: 0, joined: startYear,
            history: [], trophies: [], ach: {}, tier2Clubs: [], founded: custom ? teamId : null,
        },
        board: { confidence: 60, objectives: [], expected: 5 },
        finance: { balance: 0, log: [] },
        teams: world.teams,
        players: world.players,
        freeAgents: world.freeAgents,
        seen: world.seen,
        genSeq: world.genSeq,
        dataYears: world.dataYears,
        season: null,
        inbox: [], news: [], offers: [], scouted: [],
        settings: { autoCalls: false, autoDraft: false, fearless: false },
        emergency: { year: startYear, used: 0 },
        history: [],
        last: null,
        jobOffers: [],
        jobless: false,
        econ: world.econ || null,
    };
    if (!save.econ) refreshEconomy(save);
    newSeason(save);
    save.finance.balance = Math.round(sponsorIncome(save, team) * (custom ? 0.6 : 0.45) / 1000) * 1000;
    team.training = 'balanced';
    team.tactic = team.roster.length ? bestTactic(lineupOf(team, save.players)) : 'early';
    if (custom) team.stake = 100;
    if (team.tier === 2) save.manager.tier2Clubs.push(team.id);
    trackClub(save, team);
    for (const p of Object.values(save.players)) p.ovr0 = ovrOf(p);
    setObjectives(save);
    inbox(save, 'board', `Welcome to ${team.name}`, welcomeText(save));
    if (custom) {
        inbox(save, 'board', 'An empty room', `${team.name} exists on paper and nowhere else, and it is yours: you own 100% of it. There is no board to answer to and no wage limit, only the balance. Free agency is open all year: sign at least one player for every role before the preseason window closes. Every free agent in ${leagueName(team.region, team.tier)} is on the Transfers screen, real pros and random prospects alike.`);
    }
    return save;
}

/** Make the manager's own club. Returns its id. The weakest side of that tier
 *  in the region makes room: its players become free agents. */
function foundClub(world, custom, year, seed) {
    const region = REGION_IDS.includes(custom.region) ? custom.region : 'LCK';
    const tier = custom.tier === 2 ? 2 : 1;
    const short = String(custom.short || 'NEW').replace(/[^A-Za-z0-9.]/g, '').slice(0, 4).toUpperCase() || 'NEW';
    const name = String(custom.name || 'New Club').trim().slice(0, 28) || 'New Club';
    const rivals = Object.values(world.teams).filter(t => t.region === region && t.tier === tier)
        .sort((a, b) => teamStrength(a, world.players) - teamStrength(b, world.players));
    const out = rivals[0];
    if (out) {
        for (const id of out.roster) {
            const p = world.players[id];
            if (!p) continue;
            p.team = null; p.wage = 0; p.reg = region;
            if (!world.freeAgents.includes(id)) world.freeAgents.push(id);
        }
        delete world.teams[out.id];
    }
    let id = 'c:' + region + ':' + short;
    while (world.teams[id]) id += '+';
    world.teams[id] = {
        id, short, name, region, tier, real: true, custom: true,
        color: custom.color || colorFromName(name),
        rep: tier === 1 ? 45 : 28, roster: [], lineup: {}, tactic: 'early', chem: 50,
        coach: { name: 'Assistant', rating: 70, real: false, cid: null }, training: 'balanced',
    };
    // Depth for a club built from nothing: every real pro of that league and year
    // who was not on a roster, and a class of random prospects around its level.
    const rng = rngFor('found:' + seed + ':' + id);
    const db = dbOf();
    if (db) {
        const idx = personsIndex(db);
        const dy = world.dataYears ? world.dataYears[region] : dataYearFor(idx, region, year);
        const taken = new Set([...idx.names, ...Object.values(world.players).map(p => String(p.name).toLowerCase())]);
        for (const { person, card } of (dy != null ? idx.byYear.get(dy) || [] : [])) {
            if (card.region !== region || world.players[person.key]) continue;
            const p = makeRealPlayer(person, card, year, rngFor('p:' + seed + ':' + person.key));
            p.reg = region;
            world.players[p.id] = p;
            world.freeAgents.push(p.id);
            world.seen = [...(world.seen || []), person.key];
            taken.add(String(p.name).toLowerCase());
        }
        const lvl = REGION_LEVEL[region] || 78;
        for (let i = 0; i < 15; i++) {
            const gid = 'g:' + ((Number(world.genSeq) || 0) + 1);
            world.genSeq = (Number(world.genSeq) || 0) + 1;
            const p = makeRandomPlayer({ id: gid, role: ROLE_IDS[i % 5], region, year, target: lvl - 12 + randInt(rng, 0, 8), age: randInt(rng, 17, 24), takenNames: taken }, rng);
            p.reg = region;
            world.players[p.id] = p;
            world.freeAgents.push(p.id);
        }
    }
    return id;
}

function welcomeText(save) {
    const t = myTeam(save);
    if (soleOwner(save)) return `${t.name} start life in ${leagueName(t.region, t.tier)} in ${save.time.year}. Nobody sets you objectives: the goals are yours.\n\nThe preseason transfer window is open: sign your players, set your lineup and tactics before the Spring Split.`;
    const obj = save.board.objectives.map(o => '• ' + o.text).join('\n');
    return `The board has handed you the keys for ${save.time.year}. ${leagueName(t.region, t.tier)} expects a lot.\n\nThis year's objectives:\n${obj}\n\nThe preseason transfer window is open: sign, sell, and set your lineup and tactics before the Spring Split.`;
}

// ---------------------------------------------------------------- lookups
export const myTeam = (save) => save.teams[save.manager.teamId] || null;
export const currentStep = (save) => CALENDAR[save.time.step] || CALENDAR[0];
export const fearlessOn = (save) => save.time.year >= FEARLESS_FROM || !!(save.settings && save.settings.fearless);

function msgId(save) {
    save.msgSeq = (Number(save.msgSeq) || 0) + 1;
    return 'm' + save.msgSeq;
}

export function inbox(save, kind, title, body, extra = {}) {
    save.inbox.unshift({ id: msgId(save), y: save.time.year, s: save.time.step, kind, title, body, read: false, ...extra });
    if (save.inbox.length > 80) save.inbox.length = 80;
}

export function news(save, text, kind = 'world') {
    save.news.unshift({ y: save.time.year, s: save.time.step, text, kind });
    if (save.news.length > 120) save.news.length = 120;
}

/** The competitions a step is part of, and the manager's tie in it if they play. */
export function userFixture(save) {
    const me = save.manager.teamId;
    if (!me || save.jobless) return null;
    const step = currentStep(save);
    const S = save.season;
    const t = myTeam(save);
    if (!S || !t) return null;
    if (step.kind === 'league') {
        const L = leagueOf(save, me);
        const tie = L && L[step.split].fixtures[step.md].find(x => x.a === me || x.b === me);
        return tie ? { tie, comp: `${leagueName(t.region, t.tier)} ${step.split === 'spring' ? 'Spring' : 'Summer'} · Week ${step.md + 1}`, kind: 'league', bigStage: false, stage: `Week ${step.md + 1} of ${LEAGUE_WEEKS}` } : null;
    }
    if (step.kind === 'playoffs') {
        const b = S.playoffs[leagueKey(t.region, t.tier) + ':' + step.split];
        const tie = tieFor(b, step.round, me);
        return tie ? { tie, comp: b.name + (step.round ? ' · Final' : ' · Semifinal'), kind: 'playoffs', bigStage: true, final: step.round === 1, stage: step.round ? 'Final' : 'Semifinal' } : null;
    }
    if (step.kind === 'intl') {
        const b = step.event === 'msi' ? S.msi : S.worlds;
        const tie = tieFor(b, step.round, me);
        const last = b ? Math.log2(b.teams.length) - 1 : 0;
        return tie ? { tie, comp: step.name, kind: step.event, bigStage: true, final: step.round === last, stage: step.name.split('·').pop().trim() } : null;
    }
    if (step.kind === 'promotion') {
        const pr = S.promo[t.region];
        const tie = pr && pr.tie && (pr.tie.a === me || pr.tie.b === me) ? pr.tie : null;
        return tie ? { tie, comp: 'Promotion Series', kind: 'promotion', bigStage: true, final: true, stage: 'One series for the top league' } : null;
    }
    return null;
}

/** Players whose contract ends this year and who nobody has decided about. */
export function undecidedContracts(save) {
    const t = myTeam(save);
    if (!t) return [];
    const year = save.time.year;
    return t.roster.map(id => save.players[id]).filter(p => p && (p.until || 0) <= year && p.leaving !== year && p.retiring !== year);
}

/**
 * What stops the manager moving on, with where to fix it, or null.
 * { msg, go: screen id }.
 */
export function blockInfo(save) {
    if (save.jobless) return { msg: 'You have no club. Accept a job offer to carry on.', go: 'club' };
    const t = myTeam(save);
    if (!t) return { msg: 'No club.', go: 'club' };
    const pending = (save.inbox || []).find(m => m.options && !m.answered);
    if (pending) return { msg: `A decision is waiting in your inbox: "${pending.title}".`, go: 'inbox' };
    const step = currentStep(save);
    const lu = lineupOf(t, save.players);
    const missing = ROLE_IDS.filter(r => !lu[r]);
    if (step.kind === 'window' && missing.length) {
        return { msg: `You cannot close the window without a full five. Sign a ${missing.map(r => ROLE_BY_ID[r].name.toLowerCase()).join(', ')}.`, go: 'transfers' };
    }
    if (userFixture(save) && missing.length) return { msg: 'Your lineup is missing a player. Sign a free agent to fill the role.', go: 'transfers' };
    if (step.kind === 'offseason') {
        const open = undecidedContracts(save);
        if (open.length) return { msg: `${open.length === 1 ? `${open[0].name}'s contract ends` : `${open.length} contracts end`} this year. Renew or let go before the offseason.`, go: 'squad' };
    }
    return null;
}
/** The reason as a string, '' when the manager can move on. */
export function blockReason(save) {
    const b = blockInfo(save);
    return b ? b.msg : '';
}

// ---------------------------------------------------------------- series sides
function aiTactic(team, P, rng) {
    if (!team.pref) team.pref = bestTactic(lineupOf(team, P));
    return rng() < 0.75 ? team.pref : pick(rng, TACTICS).id;
}

/** Everything a side brings to a series. */
export function sideFor(save, teamId, rng = Math.random) {
    const team = save.teams[teamId];
    const isUser = teamId === save.manager.teamId;
    const perks = isUser ? save.manager.perks || {} : {};
    const coach = team.coach ? team.coach.rating : 70;
    const coachRank = clamp(Math.round((coach - 72) / 10), 0, 2);
    return {
        team,
        lineup: lineupOf(team, save.players),
        tactic: isUser ? (team.tactic || 'early') : aiTactic(team, save.players, rng),
        chem: team.chem,
        drafter: isUser ? perks.drafter || 0 : coachRank,
        poolRank: isUser ? perks.poolmaster || 0 : coachRank,
        analyst: isUser ? perks.analyst || 0 : 0,
        tactician: isUser ? perks.tactician || 0 : 0,
        shot: isUser ? perks.shotcaller || 0 : 0,
        steady: isUser ? perks.psychologist || 0 : 0,
        prep: isUser ? Number(save.manager.prep) || 0 : 0,
        extraEdge: clamp((coach - 75) / 20, -1, 1),
    };
}

export function matchContext(save, kind) {
    const step = currentStep(save);
    return {
        year: save.time.year,
        split: step.split || 'spring',
        bigStage: kind !== 'league',
        fearless: fearlessOn(save),
    };
}

// ---------------------------------------------------------------- applying a series
function applySeries(save, tie, res, ctxKind) {
    const year = save.time.year;
    tie.score = res.score.slice();
    tie.winner = res.winner === 'a' ? tie.a : tie.b;
    const big = ctxKind !== 'league';
    const me = save.manager.teamId;
    const devRank = (save.manager.perks || {}).developer || 0;
    const mentor = (save.manager.perks || {}).mentor || 0;
    for (const [side, teamId] of [['a', tie.a], ['b', tie.b]]) {
        const team = save.teams[teamId];
        if (!team) continue;
        const won = res.winner === side;
        const coach = team.coach ? team.coach.rating - 60 : 10;
        const played = new Set();
        const ratingSum = {};
        const gamesN = {};
        for (const g of res.games) {
            for (const l of (g.lines && g.lines[side]) || []) {
                if (!l.id || !save.players[l.id]) continue;
                const p = save.players[l.id];
                played.add(l.id);
                p.st = p.st || blankStats();
                p.st.g++; p.st.k += l.k; p.st.d += l.d; p.st.as += l.a; p.st.rs += l.rating;
                if (g.w === side) p.st.w++;
                if (g.mvp === l.id) p.st.mvp++;
                p.car = p.car || { g: 0, w: 0, titles: 0 };
                p.car.g++; if (g.w === side) p.car.w++;
                ratingSum[l.id] = (ratingSum[l.id] || 0) + l.rating;
                gamesN[l.id] = (gamesN[l.id] || 0) + 1;
                // The champions he has been playing, newest first.
                if (l.champ) p.recent = [l.champ, ...(p.recent || []).filter(c => c !== l.champ)].slice(0, 6);
                if (team.hist) histGame(team, p, year, g.w === side, g.mvp === l.id);
            }
        }
        const gamesWon = res.games.filter(g => g.w === side).length;
        for (const id of team.roster) {
            const p = save.players[id];
            if (!p) continue;
            const mult = xpMultiplier(p, year, { coach, developer: teamId === me ? devRank : 0 });
            if (played.has(id)) {
                const mvps = res.games.filter(g => g.mvp === id).length;
                const lv = grantXP(p, (MATCH_XP.series + MATCH_XP.gameWon * gamesWon + MATCH_XP.mvp * mvps) * mult);
                if (lv && teamId === me) levelNote(save, p, lv);
                const avg = ratingSum[id] / Math.max(1, gamesN[id]);
                p.last = [...(p.last || []), Math.round(avg * 10) / 10].slice(-3);
                p.form = formFrom(p.last);
                if (big) p.big = (Number(p.big) || 0) + 1;
                // Results move morale at every club, not just yours: a side on a
                // winning run plays with the same confidence yours would.
                const e = fx(p);
                const motiv = teamId === me ? (save.manager.perks || {}).motivator || 0 : 0;
                const d = won ? 4 : -4 * (1 - motiv * 0.15);
                p.mor = clamp((Number(p.mor) || 65) + d * (e.resultMoraleMult || 1), 0, 100);
            } else {
                const lv = grantXP(p, MATCH_XP.bench * mult * (teamId === me ? 1 + mentor * 0.5 : 1));
                if (lv && teamId === me) levelNote(save, p, lv);
            }
        }
    }
    if (tie.a === me || tie.b === me) {
        const won = tie.winner === me;
        if (won) save.manager.wins++; else save.manager.losses++;
        grantMgrXP(save, won ? MGR_XP.seriesWin : MGR_XP.seriesLoss);
        save.manager.prep = 0;
        if (won && save.manager.wins >= 100) recordAch(save, 'centurion', null, { once: true });
    }
}

function levelNote(save, p, levels) {
    save._levelUps = save._levelUps || [];
    save._levelUps.push({ id: p.id, name: p.name, lv: p.lv, levels });
}

function playTie(save, tie, kind, mySeries, rng) {
    const me = save.manager.teamId;
    const ctx = matchContext(save, kind);
    const bo = tie.bo;
    if (mySeries && (tie.a === me || tie.b === me)) {
        // The manager's own series arrives from the user's point of view; map it onto the tie.
        const userIsA = tie.a === me;
        const res = userIsA ? mySeries : flipSeries(mySeries);
        applySeries(save, tie, res, kind);
        return res;
    }
    const a = sideFor(save, tie.a, rng), b = sideFor(save, tie.b, rng);
    const res = quickSeries(a, b, bo, ctx, rng);
    applySeries(save, tie, res, kind);
    return res;
}

/** A series played from the manager's side ('a') turned round for a tie where they are 'b'. */
export function flipSeries(r) {
    const sw = (s) => (s === 'a' ? 'b' : 'a');
    return {
        score: [r.score[1], r.score[0]],
        winner: sw(r.winner),
        games: r.games.map(g => ({
            ...g, w: sw(g.w), blue: g.blue ? sw(g.blue) : g.blue,
            lines: g.lines ? { a: g.lines.b, b: g.lines.a } : g.lines,
            picks: g.picks ? { a: g.picks.b, b: g.picks.a } : g.picks,
            bans: g.bans ? { a: g.bans.b, b: g.bans.a } : g.bans,
        })),
    };
}

/** Auto-play the manager's series (the Sim button). Returned from the user's side. */
export function simMySeries(save, rng = Math.random) {
    const f = userFixture(save);
    if (!f) return null;
    const me = save.manager.teamId;
    const opp = f.tie.a === me ? f.tie.b : f.tie.a;
    const a = sideFor(save, me, rng), b = sideFor(save, opp, rng);
    return quickSeries(a, b, f.tie.bo, { ...matchContext(save, f.kind), blue: f.tie.a === me ? 'a' : 'b' }, rng);
}

/** What a finished series of the manager's means beyond the score. */
function seriesMilestones(save, fixture, res, rng) {
    const me = save.manager.teamId;
    if (!fixture || fixture.kind === 'league') return;
    const won = res.winner === 'a';
    if (!won) return;
    const opp = save.teams[fixture.tie.a === me ? fixture.tie.b : fixture.tie.a];
    const gap = teamStrength(opp, save.players) - teamStrength(myTeam(save), save.players);
    if (gap >= 5) recordAch(save, 'giant_killer', `Beat ${opp.name}, ${Math.round(gap)} OVR stronger`);
    const order = res.games.map(g => g.w);
    if (fixture.tie.bo >= 5 && order[0] === 'b' && order[1] === 'b') recordAch(save, 'reverse_sweep', `${fixture.comp}, from 0-2 down`);
    if (fixture.final && res.score[0] === 3 && res.score[1] === 0) recordAch(save, 'sweep_final', fixture.comp);
}

// ---------------------------------------------------------------- the step
/**
 * Play the current step and move on. `mySeries` is the manager's own series,
 * from their side, when they played it; otherwise it is simmed for them.
 * Returns a summary for the screen: the result, notes, level-ups, and `fx`
 * (titles and achievements to celebrate).
 */
export function advance(save, mySeries = null, rng = Math.random) {
    if (save.jobless) return { blocked: 'jobless' };
    const step = currentStep(save);
    const S = save.season;
    const me = save.manager.teamId;
    save._levelUps = [];
    save._fx = [];
    // msgFrom: every inbox message with a higher number arrived during this step.
    const summary = { step: step.id, name: step.name, year: save.time.year, mine: null, results: [], notes: [], fx: [], msgFrom: Number(save.msgSeq) || 0 };

    const fixture = userFixture(save);
    if (fixture && !mySeries) mySeries = simMySeries(save, rng);
    const myFive = fixture ? new Set(Object.values(lineupOf(myTeam(save), save.players)).map(p => p.id)) : null;

    const play = (tie, kind) => {
        if (!tie || tie.winner) return;
        const res = playTie(save, tie, kind, mySeries, rng);
        if (tie.a === me || tie.b === me) {
            const mine = tie.a === me ? res : flipSeries(res);
            summary.mine = {
                tie: { ...tie }, kind, comp: fixture ? fixture.comp : step.name, games: res.games.length,
                draft: mine.games.map(g => ({ w: g.w, blue: g.blue || null, mine: g.picks ? g.picks.a : null, theirs: g.picks ? g.picks.b : null })),
            };
            seriesMilestones(save, fixture, mine, rng);
        }
    };

    if (step.kind === 'league') {
        for (const L of Object.values(S.leagues)) {
            for (const tie of L[step.split].fixtures[step.md] || []) {
                play(tie, 'league');
                recordLeagueTie(L, step.split, tie);
            }
        }
        if (step.md === LEAGUE_WEEKS - 1) {
            const t = myTeam(save);
            const L = leagueOf(save, me);
            const row = L && L[step.split].table[me];
            if (row && row.l === 0 && row.w >= (L.tier === 1 ? TIER1_SIZE - 1 : TIER2_SIZE - 1)) recordAch(save, 'perfect_split', `${leagueName(t.region, t.tier)} ${step.split === 'spring' ? 'Spring' : 'Summer'} ${save.time.year}, ${row.w}-0`);
            buildPlayoffs(save, step.split);
            const b = S.playoffs[leagueKey(t.region, t.tier) + ':' + step.split];
            summary.notes.push(b && b.teams.includes(me)
                ? `You are in the ${step.split === 'spring' ? 'Spring' : 'Summer'} Playoffs as the number ${b.teams.indexOf(me) + 1} seed.`
                : `You missed the ${step.split === 'spring' ? 'Spring' : 'Summer'} Playoffs.`);
        }
    } else if (step.kind === 'playoffs') {
        for (const [key, b] of Object.entries(S.playoffs)) {
            if (!key.endsWith(':' + step.split) || !b.rounds[step.round]) continue;
            for (const tie of b.rounds[step.round]) play(tie, 'playoffs');
            advanceBracket(b);
            if (b.champion && step.round === 1) crownLeague(save, key.slice(0, key.lastIndexOf(':')), b, step.split);
        }
        if (step.round === 1) {
            settleSplit(save, step.split);
            splitReview(save, step.split);
            if (step.split === 'spring') {
                const msi = buildMSI(save);
                summary.notes.push(msi.teams.includes(me) ? 'You have qualified for MSI.' : 'MSI goes on without you.');
                news(save, `MSI ${S.year}: ${msi.teams.map(id => save.teams[id].short).join(', ')}.`, 'intl');
            } else {
                buildPromotion(save);
            }
        }
    } else if (step.kind === 'intl') {
        const b = step.event === 'msi' ? S.msi : S.worlds;
        if (b && b.rounds[step.round]) {
            for (const tie of b.rounds[step.round]) play(tie, step.event);
            advanceBracket(b);
            if (b.champion) crownIntl(save, b, step.event);
        }
    } else if (step.kind === 'promotion') {
        for (const region of REGION_IDS) {
            const pr = S.promo[region];
            if (pr && pr.tie) play(pr.tie, 'promotion');
        }
        promotionNews(save);
        const w = buildWorlds(save);
        if (w.teams.includes(me)) {
            summary.notes.push('You have qualified for Worlds!');
            recordAch(save, 'worlds_debut', `Worlds ${S.year}`);
        } else summary.notes.push('Worlds goes on without you.');
        news(save, `Worlds ${S.year} field set: ${w.teams.length} teams from six regions.`, 'intl');
    } else if (step.kind === 'window') {
        const notes = aiWindow(save, rng, { taken: takenNames(save, dbOf(save)) });
        for (const n of notes.slice(0, 6)) news(save, n, 'transfer');
        // The window closes behind this step: every bid still open lapses.
        const lapsed = expireOffers(save);
        if (lapsed) inbox(save, 'offer', 'Bids expired', `The transfer window has closed. ${lapsed} unanswered bid${lapsed === 1 ? '' : 's'} for your players lapsed. Clubs will bid again in the next window.`);
    } else if (step.kind === 'offseason') {
        const r = runOffseason(save, rng);
        summary.offseason = r;
        summary.fx = save._fx || [];
        delete save._fx;
        return summary;
    }

    if (summary.mine && myFive) checkPromises(save, myFive);
    weekly(save, rng);
    randomEvent(save, rng);
    if (step.id === 'preseason') {
        // Academy prospects are held for the manager through the preseason only.
        for (const id of save.freeAgents) if (save.players[id]) delete save.players[id].prospectFor;
    }
    summary.levelUps = save._levelUps || [];
    delete save._levelUps;
    save.time.step = Math.min(save.time.step + 1, STEPS_PER_YEAR - 1);
    if (summary.mine) save.last = summary.mine;
    enterStep(save, rng);
    summary.fx = save._fx || [];
    delete save._fx;
    return summary;
}

/** What happens as the calendar arrives at a step: a window opens to bids, the
 *  break brings retirement news, the offseason brings the contract deadline. */
function enterStep(save, rng) {
    const step = currentStep(save);
    const t = myTeam(save);
    if (!t) return;
    if (step.kind === 'window') openWindow(save, rng);
    if (step.id === 'midseason') {
        // Retirements are decided now and announced, never sprung at the offseason.
        const db = dbOf(save);
        const idx = db ? personsIndex(db) : null;
        for (const id of t.roster) {
            const p = save.players[id];
            if (!p || p.retiring) continue;
            const person = idx && p.real ? idx.persons.get(p.id) : null;
            if (retiresNow(p, save.time.year, rng, hasCardAfter(person, save.time.year))) {
                p.retiring = save.time.year;
                inbox(save, 'squad', `${p.name} will retire`, `${p.name} has told you this is his last season. He will retire when the year ends, whatever happens. Plan for his replacement.`, { pid: p.id });
            }
        }
    }
    if (step.id === 'midseason' || step.id === 'summer_sf' || step.id === 'offseason') {
        const open = undecidedContracts(save);
        if (open.length) {
            inbox(save, 'contract', step.id === 'offseason' ? 'Contracts: decide now' : 'Contracts ending this year',
                `${open.map(p => `${p.name} (${p.role}, ${ovrOf(p)})`).join(', ')} ${open.length === 1 ? 'is' : 'are'} out of contract at the end of ${save.time.year}.\n\nOpen a player to offer a new deal, or let him go. ${step.id === 'offseason' ? 'The offseason will not start until every one of them is decided.' : 'Anyone you have not decided about by the offseason must be decided then.'}`);
        }
    }
}

/** A window opens: clubs bid for your players and look at your transfer list. */
function openWindow(save, rng) {
    const bids = aiBidsForUser(save, rng);
    for (const o of bids) {
        const p = save.players[o.pid];
        inbox(save, 'offer', `Bid for ${p.name}`, `${save.teams[o.from].name} offer ${fmtK(o.fee)} for ${p.name}. Accept or reject it on the Transfers screen before the window closes.`, { offer: o.id, pid: p.id });
    }
    const listed = listingOffers(save, rng);
    if (listed.length) {
        const names = [...new Set(listed.map(o => save.players[o.pid].name))];
        inbox(save, 'offer', 'Offers for your listed players', `Clubs have made ${listed.length} offer${listed.length === 1 ? '' : 's'} for ${names.join(', ')}. They are on the Transfers screen until the window closes.`);
    }
}

// The card database is a module-level singleton on the page; the harness sets it too.
let _db = null;
export function setDB(db) { _db = db; }
function dbOf() { return _db; }

// ---------------------------------------------------------------- the week
function weekly(save, rng) {
    const year = save.time.year;
    const me = save.manager.teamId;
    const perks = save.manager.perks || {};
    const devRank = perks.developer || 0;
    for (const t of Object.values(save.teams)) {
        const mine = t.id === me;
        const tr = TRAINING_BY_ID[mine ? t.training : 'balanced'] || TRAINING_BY_ID.balanced;
        const coach = t.coach ? t.coach.rating - 60 : 10;
        // The manager's club: each player's intensity, and the bench programme for subs.
        const five = mine ? new Set(Object.values(lineupOf(t, save.players)).map(p => p.id)) : null;
        const bench = mine ? BENCH_PROGRAM_BY_ID[t.bench] || BENCH_PROGRAM_BY_ID.none : null;
        for (const id of t.roster) {
            const p = save.players[id];
            if (!p) continue;
            let xp = tr.xp;
            if (mine) {
                xp *= (INTENSITY_BY_ID[p.intensity] || INTENSITY_BY_ID.normal).xp;
                if (!five.has(id)) xp += bench.xp;
            }
            if (!xp) continue;
            const lv = grantXP(p, xp * xpMultiplier(p, year, { coach, developer: mine ? devRank : 0 }));
            if (lv && mine) levelNote(save, p, lv);
        }
        if (t.id !== me) {
            // AI clubs settle toward a well-drilled 78 and drift morale back to 65.
            t.chem = clamp((Number(t.chem) || 50) + (t.chem < 78 ? 1.2 : 0), 20, 100);
            for (const id of t.roster) {
                const p = save.players[id];
                if (!p) continue;
                const m = Number(p.mor) || 65;
                p.mor = m < 65 ? m + 1.5 : m > 72 ? m - 1 : m;
            }
            if (save.time.step % 4 === 0) t.lineup = bestLineup(t, save.players);
            continue;
        }
        // The manager's club: chemistry and morale.
        const lu = lineupOf(t, save.players);
        const sig = ROLE_IDS.map(r => lu[r] ? lu[r].id : '-');
        const prev = Array.isArray(t.lastFive) ? t.lastFive : sig;
        const changes = sig.filter((id, i) => id !== prev[i]).length;
        let dc = changes ? -3 * changes : 1.5;
        dc += tr.chem + (perks.teambuilder || 0) * 0.5;
        let hot = 0;
        for (const r of ROLE_IDS) {
            const p = lu[r];
            if (!p) continue;
            const e = fx(p);
            dc += e.chemPerStep || 0;
            if (e.clash) hot++;
        }
        if (hot >= 2) dc -= 2;
        t.chem = clamp((Number(t.chem) || 50) + dc, 20, 100);
        t.lastFive = sig;
        const starters = new Set(sig);
        const avg = t.roster.reduce((s, id) => s + ovrOf(save.players[id]), 0) / Math.max(1, t.roster.length);
        const L = leagueOf(save, me);
        const step = currentStep(save);
        const rank = L && step.split ? tableRows(L, step.split, save).findIndex(r => r.id === me) + 1 : 0;
        const calm = 1 - (perks.psychologist || 0) * 0.3;
        const benchPlan = BENCH_PROGRAM_BY_ID[t.bench] || BENCH_PROGRAM_BY_ID.none;
        for (const id of t.roster) {
            const p = save.players[id];
            if (!p) continue;
            const e = fx(p);
            let d = (tr.morale || 0) + ((INTENSITY_BY_ID[p.intensity] || INTENSITY_BY_ID.normal).morale || 0);
            if (!starters.has(id)) {
                // What the bench costs depends on what he was promised.
                const st = SQUAD_STATUS_BY_ID[p.status];
                const base = st ? st.bench : (ovrOf(p) >= avg - 2 ? 2 : 0);
                d -= base * (e.benchMoraleMult ?? 1) * calm;
                d += benchPlan.morale || 0;
            }
            if (e.wantsContender && rank > 4 && step.kind === 'league') d -= 1;
            if ((p.mor || 65) < 65) d += 1; else if ((p.mor || 65) > 75) d -= 0.5;
            p.mor = clamp((Number(p.mor) || 65) + d, 0, 100);
        }
        // Money: sponsors and any owner investment in, wages and the bench programme out,
        // a little each week.
        const inc = Math.round((sponsorIncome(save, t) + ownerFunding(save, t)) / STEPS_PER_YEAR);
        const out = Math.round(wageBill(save, t) / STEPS_PER_YEAR) + benchCost(save, t);
        save.finance.balance += inc - out;
        save.manager.prep = t.training === 'draft' ? TRAINING_BY_ID.draft.draftPrep : 0;
    }
}

// ---------------------------------------------------------------- titles and prizes
function celebrate(save, item) {
    save._fx = save._fx || [];
    save._fx.push(item);
}

/** Prize money grows with the game, like everything else priced in it (econIndex). */
function prizeMoney(save, table, key) {
    return Math.round(((table && table[key]) || 0) * econIndex(save) / 1000) * 1000;
}

function crownLeague(save, key, b, split) {
    const S = save.season;
    const L = S.leagues[key];
    const champ = save.teams[b.champion];
    const me = save.manager.teamId;
    const title = `${leagueName(L.region, L.tier)} ${split === 'spring' ? 'Spring' : 'Summer'} ${S.year}`;
    news(save, `${champ.name} win the ${title}, beating ${save.teams[b.runnerUp].name} in the final.`, L.tier === 1 ? 'title' : 'world');
    for (const id of champ.roster) if (save.players[id]) save.players[id].car.titles = (save.players[id].car.titles || 0) + 1;
    histTitle(save, champ, L.tier === 1 ? 'league' : 'tier2');
    champ.rep = clamp((champ.rep || 50) + (L.tier === 1 ? 3 : 2), 0, 100);
    // Prize money for the manager's club.
    if (L.teams.includes(me)) {
        const place = b.places[me] || (S.places[me] || {})[split];
        const prize = prizeMoney(save, L.tier === 1 ? PRIZES.league : PRIZES.tier2, place);
        if (prize) earn(save, prize, `${title}: ${place === 1 ? 'champions' : place === 2 ? 'runners-up' : 'semifinal'}`);
        if (b.champion === me) {
            const t = myTeam(save);
            save.manager.trophies.push({ year: S.year, name: title, kind: L.tier === 1 ? 'league' : 'tier2', split, teamId: me, teamName: t.name });
            save.manager.titles++;
            save.manager.rep = clamp(save.manager.rep + (L.tier === 1 ? 8 : 4), 0, 100);
            grantMgrXP(save, MGR_XP.title);
            inbox(save, 'title', `Champions! ${title}`, `${champ.name} are ${title} champions. The board is delighted, the players are celebrating and ${fmtK(prize)} of prize money is in the bank.`);
            celebrate(save, { kind: 'title', trophy: L.tier === 1 ? 'league' : 'tier2', title: `${title} Champions`, sub: `${t.name} beat ${save.teams[b.runnerUp].name} in the final`, color: '#fbbf24' });
            titleAchievements(save, L.tier === 1 ? 'league' : 'tier2', split, title);
        }
    }
}

function crownIntl(save, b, event) {
    const S = save.season;
    const me = save.manager.teamId;
    const champ = save.teams[b.champion];
    news(save, `${champ.name} are ${b.name} champions!`, 'title');
    for (const id of champ.roster) if (save.players[id]) save.players[id].car.titles = (save.players[id].car.titles || 0) + 1;
    histTitle(save, champ, event);
    champ.rep = clamp((champ.rep || 50) + (event === 'worlds' ? 8 : 5), 0, 100);
    if (b.teams.includes(me)) {
        const place = b.places[me];
        const key = place <= 2 ? place : place <= 4 ? 3 : place <= 8 ? 5 : 9;
        const prize = prizeMoney(save, PRIZES[event], key);
        if (prize) earn(save, prize, `${b.name}: ${place === 1 ? 'champions' : 'top ' + (place <= 2 ? 2 : place <= 4 ? 4 : place <= 8 ? 8 : 16)}`);
        if (b.champion === me) {
            const t = myTeam(save);
            save.manager.trophies.push({ year: S.year, name: b.name, kind: event, teamId: me, teamName: t.name });
            save.manager.titles++;
            save.manager.rep = clamp(save.manager.rep + (event === 'worlds' ? 18 : 12), 0, 100);
            grantMgrXP(save, event === 'worlds' ? MGR_XP.worlds : MGR_XP.intlTitle);
            inbox(save, 'title', `${b.name} champions!`, `${champ.name} are the best team in the world${event === 'msi' ? ' this spring' : ''}. ${fmtK(prize)} of prize money, and a place in history.`);
            celebrate(save, { kind: 'title', trophy: event, title: event === 'worlds' ? `World Champions ${S.year}` : `${b.name} Champions`, sub: `${t.name} beat ${save.teams[b.runnerUp].name} in the final`, color: event === 'worlds' ? '#facc15' : '#38bdf8' });
            titleAchievements(save, event, null, b.name);
        }
    }
}

/** Every achievement a title can complete. */
function titleAchievements(save, kind, split, name) {
    const m = save.manager;
    const year = save.time.year;
    const t = myTeam(save);
    const mine = m.trophies.filter(x => x.year === year);
    recordAch(save, 'first_title', name, { once: true });
    if (kind === 'league') {
        recordAch(save, 'league_title', name);
        if (mine.filter(x => x.kind === 'league').length >= 2) recordAch(save, 'double', `${year}`);
        if ((save.board.expected || 5) >= 5) recordAch(save, 'underdog', `${name}, expected ${ordinal(save.board.expected)}`);
        if ((m.tier2Clubs || []).includes(t.id)) recordAch(save, 'basement', `${name} with ${t.name}`);
    }
    if (kind === 'msi') recordAch(save, 'msi', name);
    if (kind === 'worlds') {
        recordAch(save, 'worlds', name);
        if (mine.some(x => x.kind === 'msi')) recordAch(save, 'intl_double', `${year}`);
        if (m.trophies.some(x => x.kind === 'worlds' && x.year === year - 1)) recordAch(save, 'back2back', `${year - 1} and ${year}`);
        if (m.trophies.filter(x => x.kind === 'worlds').length >= 3) recordAch(save, 'dynasty', name, { once: true });
        const has = (k, sp) => mine.some(x => x.kind === k && (!sp || x.split === sp));
        if (has('league', 'spring') && has('msi') && has('league', 'summer')) recordAch(save, 'golden_road', `${year} with ${t.name}`);
    }
    if (t && t.custom && m.founded === t.id) recordAch(save, 'built', `${name} with ${t.name}`);
    if (fearlessOn(save)) recordAch(save, 'fearless_champ', name);
}

/**
 * Count an achievement. `once` ones (Dynasty, Centurion, One-Club) count a
 * single time; the rest count every time. A first unlock with `point` is worth
 * a perk point, and every unlock is celebrated.
 */
export function recordAch(save, id, detail = null, { once = false } = {}) {
    const def = ACH_BY_ID[id];
    if (!def) return false;
    const m = save.manager;
    m.ach = m.ach || {};
    const cur = m.ach[id] || { n: 0, years: [] };
    if (once && cur.n > 0) return false;
    const first = cur.n === 0;
    m.ach[id] = { n: cur.n + 1, years: [...cur.years, save.time.year].slice(-30), first: cur.first || save.time.year, last: detail || cur.last || null };
    if (first && def.point) {
        m.points = (Number(m.points) || 0) + 1;
    }
    inbox(save, 'achievement', `${first ? 'Achievement unlocked' : 'Achievement'}: ${def.name}`, `${def.desc}${detail ? `\n\n${detail}.` : ''}${first && def.point ? '\n\nA perk point has been added: spend it on the Club screen.' : cur.n ? `\n\nThat makes ${cur.n + 1}.` : ''}`);
    celebrate(save, { kind: 'achievement', id, title: def.name, sub: def.desc, count: cur.n + 1, point: first && !!def.point, color: '#a78bfa' });
    return true;
}

function promotionNews(save) {
    const S = save.season;
    const me = save.manager.teamId;
    for (const region of REGION_IDS) {
        const pr = S.promo[region];
        if (!pr) continue;
        if (pr.tie && pr.tie.winner) {
            const w = save.teams[pr.tie.winner], l = save.teams[pr.tie.winner === pr.tie.a ? pr.tie.b : pr.tie.a];
            news(save, `${w.name} beat ${l.name} ${Math.max(...pr.tie.score)}-${Math.min(...pr.tie.score)} in the ${region} promotion series.`, 'world');
        }
        if (pr.up === me || (pr.tie && pr.tie.winner === me && pr.tie.b === me)) {
            inbox(save, 'title', 'Promoted!', `${myTeam(save).name} will play in ${leagueName(region, 1)} next year.`);
            save.manager.trophies.push({ year: S.year, name: `Promotion to ${leagueName(region, 1)}`, kind: 'promotion', teamId: me, teamName: myTeam(save).name });
            save.manager.rep = clamp(save.manager.rep + 5, 0, 100);
            grantMgrXP(save, MGR_XP.promotion);
            celebrate(save, { kind: 'title', trophy: 'promotion', title: 'Promoted!', sub: `${myTeam(save).name} will play in ${leagueName(region, 1)} next year`, color: '#a78bfa' });
            recordAch(save, 'promoted', `${myTeam(save).name}, ${S.year}`);
        }
        if (pr.down === me || (pr.tie && pr.tie.a === me && pr.tie.winner !== me)) {
            inbox(save, 'board', 'Relegated', `${myTeam(save).name} go down to ${leagueName(region, 2)} next year. The board is furious.`);
            celebrate(save, { kind: 'down', title: 'Relegated', sub: `${myTeam(save).name} go down to ${leagueName(region, 2)}`, color: '#f87171' });
        }
    }
}

// ---------------------------------------------------------------- the board
function expectedRank(save) {
    const me = save.manager.teamId;
    const L = leagueOf(save, me);
    if (!L) return 5;
    const order = L.teams.slice().sort((a, b) => teamStrength(save.teams[b], save.players) - teamStrength(save.teams[a], save.players));
    return order.indexOf(me) + 1;
}

export function setObjectives(save) {
    const t = myTeam(save);
    const exp = expectedRank(save);
    save.board.expected = exp;
    // The sole owner answers to nobody.
    if (soleOwner(save)) { save.board.objectives = []; return; }
    const out = [];
    if (t.tier === 1) {
        if (exp <= 2) out.push({ id: 'title', text: 'Win a domestic title (Spring or Summer)' }, { id: 'worlds', text: 'Qualify for Worlds' });
        else if (exp <= 4) out.push({ id: 'worlds', text: 'Qualify for Worlds' }, { id: 'playoffs2', text: 'Reach the playoffs in both splits' });
        else if (exp <= 7) out.push({ id: 'playoffs1', text: 'Reach the playoffs at least once' });
        else out.push({ id: 'survive', text: 'Avoid relegation' });
    } else {
        if (exp <= 3) out.push({ id: 'promote', text: 'Win promotion to the top league' });
        else out.push({ id: 'tophalf', text: 'Finish in the top half over both splits' });
    }
    out.push({ id: 'money', text: 'Keep the balance above zero' });
    save.board.objectives = out.map(o => ({ ...o, met: null }));
    save.board.expected = exp;
}

function objectiveMet(save, o) {
    const S = save.season;
    const me = save.manager.teamId;
    const t = myTeam(save);
    const pl = S.places[me] || {};
    const key = leagueKey(t.region, t.tier);
    switch (o.id) {
        case 'title': return ['spring', 'summer'].some(s => (S.playoffs[key + ':' + s] || {}).champion === me);
        case 'worlds': return !!(S.worlds && S.worlds.teams.includes(me));
        case 'playoffs2': return (pl.spring || 99) <= 4 && (pl.summer || 99) <= 4;
        case 'playoffs1': return (pl.spring || 99) <= 4 || (pl.summer || 99) <= 4;
        case 'survive': {
            const pr = S.promo[t.region];
            return !(pr && (pr.down === me || (pr.tie && pr.tie.a === me && pr.tie.winner && pr.tie.winner !== me)));
        }
        case 'promote': {
            const pr = S.promo[t.region];
            return !!(pr && (pr.up === me || (pr.tie && pr.tie.b === me && pr.tie.winner === me)));
        }
        case 'tophalf': {
            const L = S.leagues[key];
            return annualRows(L, save).findIndex(r => r.id === me) < L.teams.length / 2;
        }
        case 'money': return save.finance.balance > 0;
        default: return false;
    }
}

/** Board confidence moves; the Board Diplomat perk softens every fall. A club
 *  the manager owns outright has no board to move. */
function boardMove(save, d) {
    if (!hasBoard(save)) return;
    const soft = 1 - (((save.manager.perks || {}).boardroom) || 0) * 0.15;
    save.board.confidence = clamp(save.board.confidence + (d < 0 ? d * soft : d), 0, 100);
}

function splitReview(save, split) {
    const me = save.manager.teamId;
    const t = myTeam(save);
    const L = leagueOf(save, me);
    if (!L) return;
    const place = (save.season.places[me] || {})[split] || L.teams.length;
    const exp = save.board.expected || 5;
    if (!hasBoard(save)) {
        inbox(save, 'board', `${split === 'spring' ? 'Spring' : 'Summer'} review`, `${t.name} finished ${ordinalWord(place)} in the ${split} split, against a squad strength ranked ${ordinalWord(exp)}. You own the club: the verdict is yours.`);
        return;
    }
    const d = place <= exp - 2 ? 8 : place <= exp ? 4 : place <= exp + 2 ? -3 : -9;
    boardMove(save, d);
    const tone = d > 0 ? 'pleased with' : d > -5 ? 'watching' : 'unhappy with';
    inbox(save, 'board', `${split === 'spring' ? 'Spring' : 'Summer'} review`, `${t.name} finished ${ordinalWord(place)} in the ${split} split. The board expected around ${ordinalWord(exp)} and is ${tone} the results. Board confidence: ${Math.round(save.board.confidence)}%.${boardCanSack(save) ? '' : ' You hold a majority of the club: they cannot sack you.'}`);
    if (split === 'spring' && save.board.confidence <= 5 && boardCanSack(save)) sack(save, 'after a disastrous spring');
}

function ordinalWord(n) {
    const v = Math.round(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const m = v % 100;
    return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

function yearReview(save) {
    const results = [];
    if (!hasBoard(save)) return results;
    for (const o of save.board.objectives) {
        o.met = objectiveMet(save, o);
        const big = o.id !== 'money';
        boardMove(save, o.met ? (big ? 14 : 4) : (big ? -18 : -14));
        if (o.met && big) { grantMgrXP(save, MGR_XP.objective); save.manager.rep = clamp(save.manager.rep + 3, 0, 100); }
        results.push(o);
    }
    return results;
}

function sack(save, why) {
    const t = myTeam(save);
    save.manager.sacked++;
    save.manager.history.push({ year: save.time.year, teamId: t.id, teamName: t.name, left: 'sacked' });
    save.manager.rep = clamp(save.manager.rep - 15, 0, 100);
    inbox(save, 'board', 'You have been sacked', `The board of ${t.name} has dismissed you ${why}. Other clubs have been in touch: pick one of their offers to carry on.`);
    save.jobOffers = jobOffers(save, true, rngFor('jobs:' + save.seed + ':' + save.time.year + ':' + save.time.step));
    save.manager.teamId = null;
    save.jobless = true;
    save.offers = [];
    for (const id of t.roster) {
        const p = save.players[id];
        if (!p) continue;
        delete p.promise; delete p.listed; delete p.leaving; delete p.status;
    }
}

function jobOffers(save, sacked, rng) {
    const cur = save.manager.teamId;
    const rep = save.manager.rep;
    const pool = Object.values(save.teams).filter(t => t.id !== cur && !t.custom && (sacked ? (t.rep || 0) <= rep + 25 : (t.rep || 0) > (myTeam(save)?.rep || 0) && (t.rep || 0) <= rep + 20));
    return shuffle(rng, pool).slice(0, sacked ? 3 : 2).map(t => t.id);
}

/** Take over another club, from the job offers. */
export function acceptJob(save, teamId) {
    const t = save.teams[teamId];
    if (!t || !(save.jobOffers || []).includes(teamId)) return { ok: false, msg: 'That offer is gone.' };
    const prev = myTeam(save);
    if (prev) {
        save.manager.history.push({ year: save.time.year, teamId: prev.id, teamName: prev.name, left: 'moved' });
        for (const id of prev.roster) {
            const p = save.players[id];
            if (p) { delete p.listed; delete p.leaving; delete p.status; delete p.promise; }
        }
    }
    save.manager.teamId = teamId;
    save.manager.joined = save.time.year;
    save.jobless = false;
    save.jobOffers = [];
    save.offers = [];
    save.board.confidence = 60;
    save.finance = { balance: Math.round(sponsorIncome(save, t) * 0.4 / 1000) * 1000, log: [] };
    t.training = t.training || 'balanced';
    t.tactic = bestTactic(lineupOf(t, save.players));
    if (t.tier === 2 && !(save.manager.tier2Clubs || []).includes(t.id)) save.manager.tier2Clubs = [...(save.manager.tier2Clubs || []), t.id];
    trackClub(save, t);
    setObjectives(save);
    inbox(save, 'board', `Welcome to ${t.name}`, welcomeText(save));
    return { ok: true, msg: `You are the new manager of ${t.name}.` };
}

// ---------------------------------------------------------------- ownership
/** What a stake of `pct` sells for, and what buying it back costs. */
export function stakePrice(save, pct, buyback = false) {
    return Math.round(clubValuation(save) * pct / 100 * (buyback ? BUYBACK_PREMIUM : 1) / 10000) * 10000;
}

/**
 * Sell part of a club the manager founded. The money arrives at once; investors
 * take seats on a board (objectives, a wage limit), and once they hold a
 * majority that board can sack the manager.
 */
export function sellStake(save, pct) {
    const t = myTeam(save);
    const own = ownerStake(save);
    if (!t || !t.custom || save.manager.founded !== t.id) return { ok: false, msg: 'You can only sell a club you own.' };
    if (!STAKE_TRANCHES.includes(pct)) return { ok: false, msg: 'Not a stake on offer.' };
    if (own - pct < MIN_STAKE) return { ok: false, msg: `You keep at least ${MIN_STAKE}% of your club.` };
    const price = stakePrice(save, pct);
    const first = own >= 100;
    t.stake = own - pct;
    earn(save, price, `Sold ${pct}% of ${t.name}`);
    if (first) {
        save.board.confidence = 60;
        setObjectives(save);
        inbox(save, 'board', 'Investors join the board', `You sold ${pct}% of ${t.name} for ${fmtK(price)}. The investors want a say: there is a board now, with objectives for the season and a wage limit.\n\n${save.board.objectives.map(o => '• ' + o.text).join('\n')}\n\nWhile you hold a majority they cannot sack you.`);
    }
    if (own >= 50 && t.stake < 50) inbox(save, 'board', 'You have sold a majority', `The investors now own ${100 - t.stake}% of ${t.name}. If the board loses confidence in you, it can sack you from your own club.`);
    return { ok: true, msg: `You sold ${pct}% of ${t.name} for ${fmtK(price)}. You own ${t.stake}%.` };
}

/** Buy a stake back, at a premium. Back to 100% and the board is gone. */
export function buyStake(save, pct) {
    const t = myTeam(save);
    const own = ownerStake(save);
    if (!t || !t.custom || save.manager.founded !== t.id) return { ok: false, msg: 'You can only buy into a club you founded.' };
    pct = Math.min(pct, 100 - own);
    if (pct <= 0) return { ok: false, msg: 'You already own all of it.' };
    const price = stakePrice(save, pct, true);
    if (price > save.finance.balance) return { ok: false, msg: `Buying ${pct}% back costs ${fmtK(price)}. You cannot afford it.` };
    save.finance.balance -= price;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Bought back ${pct}% of ${t.name}`, amount: -price });
    t.stake = own + pct;
    if (t.stake >= 100) {
        setObjectives(save);
        inbox(save, 'board', 'The club is yours again', `You own all of ${t.name} again. The board is dissolved: no objectives, no wage limit.`);
    }
    return { ok: true, msg: `You bought ${pct}% back for ${fmtK(price)}. You own ${t.stake}%.` };
}

// ---------------------------------------------------------------- manager level
export function grantMgrXP(save, n) {
    const m = save.manager;
    m.xp = (Number(m.xp) || 0) + Math.round(n);
    while (m.xp >= MGR_XP_PER_LEVEL) {
        m.xp -= MGR_XP_PER_LEVEL;
        m.level++;
        m.points++;
        inbox(save, 'level', `Manager level ${m.level}`, 'You have a perk point to spend on the Club screen.');
    }
}

export function buyPerk(save, perkId) {
    const perk = PERK_BY_ID[perkId];
    const m = save.manager;
    if (!perk) return { ok: false, msg: 'Unknown perk.' };
    const cur = (m.perks || {})[perkId] || 0;
    if (cur >= perk.max) return { ok: false, msg: `${perk.name} is maxed.` };
    if ((m.points || 0) < 1) return { ok: false, msg: 'No perk points. Win matches and titles to level up.' };
    m.points--;
    m.perks = { ...(m.perks || {}), [perkId]: cur + 1 };
    return { ok: true, msg: `${perk.name} rank ${cur + 1}: ${perk.rank(cur + 1)}.` };
}

/** Spend a perk point on a one-off action (POINT_ACTIONS). */
export function spendPoint(save, actionId) {
    const m = save.manager;
    const a = POINT_ACTIONS.find(x => x.id === actionId);
    const t = myTeam(save);
    if (!a) return { ok: false, msg: 'Unknown action.' };
    if ((m.points || 0) < 1) return { ok: false, msg: 'No perk points to spend.' };
    if (!t && actionId !== 'board') return { ok: false, msg: 'You need a club for that.' };
    if (actionId === 'board' && !t) return { ok: false, msg: 'There is no board to talk to.' };
    let msg = '';
    if (actionId === 'bootcamp') {
        let lv = 0;
        for (const id of t.roster) { const p = save.players[id]; if (p) lv += grantXP(p, 150); }
        t.chem = clamp((Number(t.chem) || 50) + 4, 20, 100);
        msg = `Bootcamp done: +150 XP each${lv ? `, ${lv} level-up${lv === 1 ? '' : 's'}` : ''}, +4 chemistry.`;
    } else if (actionId === 'board') {
        if (!hasBoard(save)) return { ok: false, msg: 'You own the club outright: there is no board to talk round.' };
        save.board.confidence = clamp(save.board.confidence + 10, 0, 100);
        msg = `The board is reassured: confidence ${Math.round(save.board.confidence)}%.`;
    } else if (actionId === 'sponsor') {
        const amt = Math.round(sponsorIncome(save, t) * 0.12 / 1000) * 1000;
        earn(save, amt, 'Sponsor drive');
        msg = `A new partner signs: ${fmtK(amt)}.`;
    } else if (actionId === 'scouting') {
        const ids = save.freeAgents.filter(id => { const p = save.players[id]; return p && (p.reg || p.nat) === t.region; });
        save.scouted = [...new Set([...(save.scouted || []), ...ids])];
        msg = `${ids.length} free agents in ${t.region} scouted.`;
    }
    m.points--;
    return { ok: true, msg };
}

// ---------------------------------------------------------------- training
/** What the bench programme costs a week. */
export function benchCost(save, t) {
    const b = BENCH_PROGRAM_BY_ID[t && t.bench] || BENCH_PROGRAM_BY_ID.none;
    return b.cost ? Math.round(sponsorIncome(save, t) * b.cost / 100) * 100 : 0;
}

export function setIntensity(save, pid, id) {
    const p = save.players[pid];
    const t = myTeam(save);
    if (p && t && p.team === t.id && INTENSITY_BY_ID[id]) p.intensity = id;
}

export function setBenchProgram(save, id) {
    const t = myTeam(save);
    if (t && BENCH_PROGRAM_BY_ID[id]) t.bench = id;
}

const weekStamp = (save) => save.time.year * 100 + save.time.step;
export function sessionsLeft(save) {
    const s = save.sessions || {};
    return Math.max(0, SESSIONS_PER_WEEK - (s.stamp === weekStamp(save) ? Number(s.n) || 0 : 0));
}
/** What a session or a bootcamp costs this club. */
export function trainingCost(save, item) {
    const t = myTeam(save);
    return t ? Math.round(sponsorIncome(save, t) * item.cost / 1000) * 1000 : 0;
}
function xpFor(save, p, base) {
    const t = myTeam(save);
    const coach = t && t.coach ? t.coach.rating - 60 : 10;
    return base * xpMultiplier(p, save.time.year, { coach, developer: ((save.manager.perks || {}).developer) || 0 });
}
function payTraining(save, amount, label) {
    save.finance.balance -= amount;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label, amount: -amount });
    save.finance.log.length = Math.min(save.finance.log.length, 60);
}

/** A hands-on session, two a week. `pid` for the one-player sessions. */
export function runSession(save, id, pid = null) {
    const t = myTeam(save);
    const ses = SESSION_BY_ID[id];
    if (!t || !ses) return { ok: false, msg: 'No such session.' };
    if (!sessionsLeft(save)) return { ok: false, msg: `You have run your ${SESSIONS_PER_WEEK} sessions this week. More next week.` };
    const cost = trainingCost(save, ses);
    if (cost > save.finance.balance) return { ok: false, msg: `That session costs ${fmtK(cost)}. You cannot afford it.` };
    const p = pid ? save.players[pid] : null;
    if (ses.target === 'player' && (!p || p.team !== t.id)) return { ok: false, msg: 'Choose one of your players.' };
    let msg = '';
    if (id === 'coach') {
        const lv = grantXP(p, xpFor(save, p, ses.xp));
        msg = `${p.name} gets a day with the coaches: +${Math.round(xpFor(save, p, ses.xp))} XP${lv ? `, and he levels up to ${p.lv}` : ''}.`;
    } else if (id === 'vod') {
        let lv = 0;
        for (const rid of t.roster) { const x = save.players[rid]; if (x) lv += grantXP(x, xpFor(save, x, ses.xp)); }
        t.chem = clamp((Number(t.chem) || 50) + (ses.chem || 0), 20, 100);
        msg = `VOD review done: XP for everyone${lv ? ` (${lv} level-up${lv === 1 ? '' : 's'})` : ''}, +${ses.chem} chemistry.`;
    } else if (id === 'pool') {
        const meta = metaFor(save.time.year, currentStep(save).split || 'spring').byId;
        const have = new Set([...(p.favs || []), ...(p.pool || [])]);
        const cands = champsFor(p.role, save.time.year).filter(c => !have.has(c.id));
        const pickC = cands.filter(c => (meta[c.id] || 0) > 0)[0] || cands[0];
        if (!pickC) return { ok: false, msg: `${p.name} already plays every champion of his role.` };
        const pool = [...(p.pool || []), pickC.id];
        p.pool = pool.slice(-6);
        msg = `${p.name} drills ${pickC.name} until it is in his pool${(meta[pickC.id] || 0) > 0 ? ' (strong this split)' : ''}.`;
    } else if (id === 'mental') {
        p.mor = clamp((Number(p.mor) || 65) + (ses.morale || 0), 0, 100);
        if ((Number(p.form) || 0) < 0) p.form = 0;
        msg = `${p.name} feels lighter: +${ses.morale} morale${p.form === 0 ? ', and the cold streak is forgotten' : ''}.`;
    }
    payTraining(save, cost, `${ses.name}${p ? ': ' + p.name : ''}`);
    const s = save.sessions && save.sessions.stamp === weekStamp(save) ? save.sessions : { stamp: weekStamp(save), n: 0 };
    save.sessions = { stamp: weekStamp(save), n: (Number(s.n) || 0) + 1 };
    return { ok: true, msg };
}

const campKey = (save) => save.time.year + ':' + (currentStep(save).split || 'spring');
/** Whether a bootcamp can be booked now, and why not. */
export function bootcampState(save, id) {
    const b = BOOTCAMP_BY_ID[id];
    const t = myTeam(save);
    if (!b || !t) return { ok: false, why: 'No club.' };
    if (currentStep(save).kind === 'offseason') return { ok: false, why: 'Not in the offseason.' };
    if ((save.camps || {})[id] === campKey(save)) return { ok: false, why: 'Already done this split.' };
    const cost = trainingCost(save, b);
    if (cost > save.finance.balance) return { ok: false, why: `Costs ${fmtK(cost)}: you cannot afford it.` };
    return { ok: true, why: '', cost };
}

/** A bootcamp: once a split each, for the whole roster. */
export function runBootcamp(save, id) {
    const st = bootcampState(save, id);
    if (!st.ok) return { ok: false, msg: st.why };
    const b = BOOTCAMP_BY_ID[id];
    const t = myTeam(save);
    let lv = 0;
    for (const rid of t.roster) {
        const p = save.players[rid];
        if (!p) continue;
        if (b.xp) lv += grantXP(p, xpFor(save, p, b.xp));
        if (b.morale) p.mor = clamp((Number(p.mor) || 65) + b.morale, 0, 100);
    }
    t.chem = clamp((Number(t.chem) || 50) + (b.chem || 0), 20, 100);
    payTraining(save, st.cost, b.name);
    save.camps = { ...(save.camps || {}), [id]: campKey(save) };
    const parts = [];
    if (b.xp) parts.push(`XP for everyone${lv ? ` (${lv} level-up${lv === 1 ? '' : 's'})` : ''}`);
    if (b.chem) parts.push(`${b.chem > 0 ? '+' : ''}${b.chem} chemistry`);
    if (b.morale) parts.push(`${b.morale > 0 ? '+' : ''}${b.morale} morale`);
    return { ok: true, msg: `${b.name} done: ${parts.join(', ')}.` };
}

/**
 * How a player's development is going and where it is heading: XP a week at the
 * current plan, weeks to the next level, how many levels (and weeks) to the next
 * OVR point, and the OVR he has gained or lost since the season began.
 */
export function devForecast(save, p) {
    const t = myTeam(save);
    const year = save.time.year;
    const perks = save.manager.perks || {};
    const coach = t && t.coach ? t.coach.rating - 60 : 10;
    const mult = xpMultiplier(p, year, { coach, developer: perks.developer || 0 });
    const tr = TRAINING_BY_ID[t ? t.training : 'balanced'] || TRAINING_BY_ID.balanced;
    const it = INTENSITY_BY_ID[p.intensity] || INTENSITY_BY_ID.normal;
    const starter = !!t && Object.values(lineupOf(t, save.players)).some(x => x.id === p.id);
    const bench = (t && BENCH_PROGRAM_BY_ID[t.bench]) || BENCH_PROGRAM_BY_ID.none;
    // A starter plays a series in most weeks; a sub only takes the bench share.
    const matches = starter ? (MATCH_XP.series + MATCH_XP.gameWon * 1.2) * 0.75 : MATCH_XP.bench * 0.75 * (1 + (perks.mentor || 0) * 0.5);
    const week = (tr.xp * it.xp + (starter ? 0 : bench.xp) + matches) * mult;
    const toNext = Math.max(0, XP_PER_LEVEL - (Number(p.xp) || 0));
    const weeks = week > 0.5 ? Math.ceil(toNext / week) : null;
    const k = focusAttr(p);
    const w = (ROLE_WEIGHTS[p.role] || ROLE_WEIGHTS.MID)[k] || 0.15;
    const ovr = ovrOf(p);
    const raw = weightedOVR(p.a, p.role) + (Number(p.adj) || 0);
    const gain = w * (ovr >= p.pot ? PAST_CEILING_FACTOR : 1);
    const pointsNeeded = ovr >= 99 ? null : Math.max(1, Math.ceil((ovr + 0.5 - raw) / gain));
    const levels = pointsNeeded == null ? null : Math.ceil(pointsNeeded / POINTS_PER_LEVEL);
    const weeksToOvr = levels == null || !(week > 0.5) ? null : Math.ceil(((levels - 1) * XP_PER_LEVEL + toNext) / week);
    const rate = mult >= 1.1 ? 'Rapid' : mult >= 0.6 ? 'Strong' : mult >= 0.3 ? 'Steady' : mult >= 0.12 ? 'Slow' : 'Minimal';
    return {
        mult, week: Math.round(week), toNext, weeks, focus: k, pointsNeeded, levels, weeksToOvr,
        ovrDelta: ovr - (Number.isFinite(Number(p.ovr0)) ? Number(p.ovr0) : ovr), xpYear: Math.round(Number(p.xpy) || 0),
        rate, declining: ageOf(p, year) >= 25, atCeiling: ovr >= p.pot, starter,
    };
}

// ---------------------------------------------------------------- squad actions
export function setLineup(save, role, pid) {
    const t = myTeam(save);
    if (!t || !t.roster.includes(pid)) return;
    const lu = { ...(t.lineup || {}) };
    for (const r of ROLE_IDS) if (lu[r] === pid) delete lu[r];
    const prev = lu[role];
    lu[role] = pid;
    // A swap: whoever held this seat takes the one the player left, if it is now empty.
    if (prev) {
        const from = ROLE_IDS.find(r => (t.lineup || {})[r] === pid);
        if (from && !lu[from]) lu[from] = prev;
    }
    t.lineup = lu;
}

export function autoLineup(save) {
    const t = myTeam(save);
    if (t) t.lineup = bestLineup(t, save.players);
}

export function setTactic(save, id) {
    const t = myTeam(save);
    if (t && TACTIC_BY_ID[id]) t.tactic = id;
}

export function setTraining(save, id) {
    const t = myTeam(save);
    if (t && TRAINING_BY_ID[id]) t.training = id;
}

export function setFocus(save, pid, key) {
    const p = save.players[pid];
    if (p && (key === 'auto' || ATTR_KEYS.includes(key))) p.focus = key;
}

/** One talk per player per week. */
export function teamTalk(save, pid, talkId, rng = Math.random) {
    const p = save.players[pid];
    const t = myTeam(save);
    if (!p || !t || p.team !== t.id) return { ok: false, msg: 'Not your player.' };
    const stamp = save.time.year * 100 + save.time.step;
    if (p.talked === stamp) return { ok: false, msg: `You have already spoken to ${p.name} this week.` };
    const e = fx(p);
    const motiv = 1 + ((save.manager.perks || {}).motivator || 0) * 0.3;
    const lastR = (p.last || []).slice(-1)[0] || 6.5;
    let d = 0, text = '';
    if (talkId === 'praise') {
        d = lastR >= 7 ? 6 : 2;
        text = lastR >= 7 ? `${p.name} appreciates it. He knows he has been playing well.` : `${p.name} nods politely. He knows it was not his best week.`;
    } else if (talkId === 'encourage') {
        d = (p.mor || 65) < 50 ? 8 : 2;
        text = d > 2 ? `${p.name} needed that. His head is up again.` : `${p.name} is fine, but thanks you.`;
    } else if (talkId === 'demand') {
        if (p.pers === 'professional' || p.pers === 'leader' || p.pers === 'grinder') { d = 5; text = `${p.name} takes the challenge seriously.`; }
        else if (p.pers === 'hothead' || p.pers === 'prodigy' || p.pers === 'showman') { d = -7; text = `${p.name} storms out. That did not go well.`; }
        else { d = rng() < 0.5 ? 3 : -3; text = d > 0 ? `${p.name} responds well.` : `${p.name} takes it badly.`; }
    } else return { ok: false, msg: 'Unknown talk.' };
    if (e.resultMoraleMult && e.resultMoraleMult < 1) d *= 0.6;
    if (d > 0) d *= motiv;
    p.mor = clamp((p.mor || 65) + d, 0, 100);
    p.talked = stamp;
    return { ok: true, msg: text, delta: Math.round(d) };
}

export function scoutCost(save) {
    const r = (save.manager.perks || {}).scout || 0;
    return r >= 3 ? 0 : Math.round(15000 * (1 - r * 0.3) / 1000) * 1000;
}

export function scoutPlayer(save, pid) {
    if ((save.scouted || []).includes(pid)) return { ok: true, msg: 'Already scouted.' };
    const cost = scoutCost(save);
    if (cost > save.finance.balance) return { ok: false, msg: 'You cannot afford a scouting report.' };
    if (cost) { save.finance.balance -= cost; save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: 'Scouting report', amount: -cost }); }
    save.scouted = [...(save.scouted || []), pid];
    const p = save.players[pid];
    return { ok: true, msg: `Scouting report on ${p ? p.name : 'the player'}: potential ${p ? Math.round(p.pot) : '?'}.` };
}

export function isScouted(save, p) {
    return !!p && (p.team === save.manager.teamId || (save.scouted || []).includes(p.id));
}

// ---------------------------------------------------------------- random events
const EVENTS = [
    {
        id: 'bench',
        when: (save) => benchUnhappy(save),
        make: (save, p) => ({
            title: `${p.name} wants to start`,
            body: `${p.name} has come to your office. He thinks he is better than the player in his seat and wants a chance.`,
            pid: p.id,
            options: [
                { id: 'promise', label: 'Promise him the next start', hint: '+12 morale now; break it and lose 20' },
                { id: 'earn', label: 'Tell him to earn it', hint: '-4 morale; a Professional takes it well' },
            ],
        }),
    },
    {
        id: 'clash',
        when: (save) => {
            const lu = lineupOf(myTeam(save), save.players);
            const hot = ROLE_IDS.map(r => lu[r]).filter(p => p && fx(p).clash);
            return hot.length >= 2 ? hot : null;
        },
        make: (save, hot) => ({
            title: `${hot[0].name} and ${hot[1].name} clashed in scrims`,
            body: `Voices were raised in the scrim room. ${hot[0].name} blames ${hot[1].name} for the last loss, and the rest of the team is waiting to see what you do.`,
            pids: [hot[0].id, hot[1].id],
            options: [
                { id: 'side0', label: `Back ${hot[0].name}`, hint: `+6 morale ${hot[0].name}, -8 ${hot[1].name}` },
                { id: 'side1', label: `Back ${hot[1].name}`, hint: `+6 morale ${hot[1].name}, -8 ${hot[0].name}` },
                { id: 'meeting', label: 'Team meeting', hint: '+4 chemistry, both lose 2 morale' },
            ],
        }),
    },
    {
        id: 'sponsor',
        when: (save) => save.time.step > 2,
        make: (save) => {
            const amt = Math.round(sponsorIncome(save, myTeam(save)) * 0.04 / 1000) * 1000;
            return {
                title: 'A sponsor wants a stream',
                body: `An energy drink brand will pay ${fmtK(amt)} if the whole team streams a sponsored session this week. The players would rather scrim.`,
                amount: amt,
                options: [
                    { id: 'accept', label: `Take the ${fmtK(amt)}`, hint: 'Money now, -3 morale for everyone' },
                    { id: 'decline', label: 'Protect practice time', hint: '+2 morale for everyone' },
                ],
            };
        },
    },
    {
        id: 'press',
        when: (save) => currentStep(save).kind === 'league',
        make: (save) => ({
            title: 'Press conference',
            body: 'A journalist asks whether your team is good enough to win the split.',
            options: [
                { id: 'bold', label: '"We are the favourites."', hint: hasBoard(save) ? '+3 morale, but the board raises its expectations' : '+3 morale' },
                { id: 'humble', label: '"One week at a time."', hint: hasBoard(save) ? '+3 board confidence' : '+1 morale, a calm room' },
            ],
        }),
    },
    {
        id: 'raise',
        when: (save) => {
            const t = myTeam(save);
            return t.roster.map(id => save.players[id]).find(p => p && p.st && p.st.g >= 8 && p.st.rs / p.st.g >= 7.2
                && !p.raised && (p.until || 0) > save.time.year) || null;
        },
        make: (save, p) => {
            const amt = Math.round((p.wage || 0) * 0.15 / 1000) * 1000;
            return {
                title: `${p.name} asks for a raise`,
                body: `${p.name} has been one of the best players in the league this year, and his agent wants that reflected in his wages: ${fmtK(amt)} more a year.`,
                pid: p.id, amount: amt,
                options: [
                    { id: 'give', label: `Give him ${fmtK(amt)} more`, hint: '+10 morale, a bigger wage bill' },
                    { id: 'later', label: 'Promise to talk at renewal', hint: '-2 morale' },
                    { id: 'refuse', label: 'Refuse', hint: '-8 morale (-12 for a Hothead or the Ambitious)' },
                ],
            };
        },
    },
    {
        id: 'bootcamp',
        when: (save) => {
            const step = currentStep(save);
            const cost = sponsorIncome(save, myTeam(save)) * 0.05;
            return myTeam(save).region !== 'LCK' && (step.kind === 'league' || step.kind === 'window') && save.finance.balance > cost * 2 ? true : null;
        },
        make: (save) => {
            const amt = Math.round(sponsorIncome(save, myTeam(save)) * 0.05 / 1000) * 1000;
            return {
                title: 'A bootcamp in Korea',
                body: `A Seoul gaming house has a week free and LCK teams who want scrims. It would cost ${fmtK(amt)}, and the players would be away from home.`,
                amount: amt,
                options: [
                    { id: 'go', label: `Go (${fmtK(amt)})`, hint: '+120 XP for everyone, +3 chemistry, -2 morale' },
                    { id: 'stay', label: 'Stay home', hint: 'Nothing changes' },
                ],
            };
        },
    },
];

function benchUnhappy(save) {
    const t = myTeam(save);
    const lu = lineupOf(t, save.players);
    const five = new Set(ROLE_IDS.map(r => lu[r] && lu[r].id));
    const cands = t.roster.map(id => save.players[id]).filter(p => p && !five.has(p.id) && (p.mor || 65) < 55
        && ['showman', 'prodigy', 'ambitious', 'hothead'].includes(p.pers) && !p.promise);
    return cands[0] || null;
}

/** A promised start is kept or broken by the manager's next match. */
function checkPromises(save, five) {
    const t = myTeam(save);
    if (!t) return;
    for (const id of t.roster) {
        const p = save.players[id];
        if (!p || !p.promise) continue;
        if (!five.has(p.id)) {
            p.mor = clamp((p.mor || 65) - 20, 0, 100);
            inbox(save, 'squad', `${p.name} feels betrayed`, `You promised ${p.name} a start and he did not get one. His morale has collapsed.`, { pid: p.id });
        } else {
            p.mor = clamp((p.mor || 65) + 3, 0, 100);
        }
        delete p.promise;
    }
}

function randomEvent(save, rng) {
    const t = myTeam(save);
    if (!t || save.jobless) return;
    if (rng() > 0.22) return;
    if ((save.inbox || []).some(m => m.options && !m.answered)) return;
    const pool = shuffle(rng, EVENTS);
    for (const ev of pool) {
        const arg = ev.when(save);
        if (!arg) continue;
        const m = ev.make(save, arg);
        inbox(save, 'event', m.title, m.body, { event: ev.id, options: m.options, data: { pid: m.pid, pids: m.pids, amount: m.amount }, answered: null });
        return;
    }
}

/** Answer an inbox decision. */
export function answerEvent(save, msgId, optId) {
    const m = (save.inbox || []).find(x => x.id === msgId);
    if (!m || !m.options || m.answered) return { ok: false, msg: 'Already answered.' };
    if (!m.options.some(o => o.id === optId)) return { ok: false, msg: 'Not an option.' };
    const t = myTeam(save);
    const d = m.data || {};
    const P = save.players;
    const bump = (id, n) => { if (P[id]) P[id].mor = clamp((P[id].mor || 65) + n, 0, 100); };
    let msg = 'Done.';
    if (!t) { m.answered = optId; m.read = true; return { ok: true, msg: 'That was for your old club.' }; }
    if (m.event === 'bench') {
        if (optId === 'promise') { bump(d.pid, 12); if (P[d.pid]) P[d.pid].promise = 1; msg = `${P[d.pid]?.name} will start your next match. Put him in the lineup.`; }
        else { bump(d.pid, P[d.pid]?.pers === 'professional' ? 3 : -4); msg = `${P[d.pid]?.name} goes back to work.`; }
    } else if (m.event === 'clash') {
        const [x, y] = d.pids || [];
        if (optId === 'side0') { bump(x, 6); bump(y, -8); }
        else if (optId === 'side1') { bump(y, 6); bump(x, -8); }
        else { bump(x, -2); bump(y, -2); t.chem = clamp((t.chem || 50) + 4, 20, 100); }
    } else if (m.event === 'sponsor') {
        if (optId === 'accept') { earn(save, d.amount || 0, 'Sponsored stream'); for (const id of t.roster) bump(id, -3); msg = `${fmtK(d.amount || 0)} received.`; }
        else { for (const id of t.roster) bump(id, 2); }
    } else if (m.event === 'press') {
        if (optId === 'bold') { for (const id of t.roster) bump(id, 3); if (hasBoard(save)) save.board.expected = Math.max(1, (save.board.expected || 5) - 1); }
        else if (hasBoard(save)) boardMove(save, 3);
        else for (const id of t.roster) bump(id, 1);
    } else if (m.event === 'raise') {
        const p = P[d.pid];
        if (p) {
            p.raised = save.time.year;
            if (optId === 'give' && p.team === t.id) { p.wage = (p.wage || 0) + (d.amount || 0); bump(p.id, 10); msg = `${p.name} is happy with his new deal.`; }
            else if (optId === 'later') { bump(p.id, -2); msg = `${p.name} will hold you to that.`; }
            else { bump(p.id, (p.pers === 'hothead' || p.pers === 'ambitious') ? -12 : -8); msg = `${p.name} is not happy.`; }
        }
    } else if (m.event === 'bootcamp') {
        if (optId === 'go') {
            if ((d.amount || 0) > save.finance.balance) return { ok: false, msg: 'You cannot afford the bootcamp.' };
            save.finance.balance -= d.amount || 0;
            save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: 'Korea bootcamp', amount: -(d.amount || 0) });
            for (const id of t.roster) { const p = P[id]; if (p) { grantXP(p, 120); bump(id, -2); } }
            t.chem = clamp((t.chem || 50) + 3, 20, 100);
            msg = 'A hard week in Seoul. The team is sharper for it.';
        }
    }
    m.answered = optId;
    m.read = true;
    return { ok: true, msg };
}

// ---------------------------------------------------------------- awards
function yearAwards(save) {
    const out = {};
    const year = save.time.year;
    const me = save.manager.teamId;
    for (const region of REGION_IDS) {
        const L = save.season.leagues[leagueKey(region, 1)];
        const ps = L.teams.flatMap(id => save.teams[id].roster).map(id => save.players[id]).filter(p => p && p.st && p.st.g >= 12);
        const avg = (p) => p.st.rs / Math.max(1, p.st.g);
        // Names are stored with the ids: a player can retire, and the record must still read.
        const ref = (p) => (p ? { id: p.id, name: p.name, team: p.team, rating: Math.round(avg(p) * 100) / 100 } : null);
        const mvp = ps.slice().sort((a, b) => avg(b) - avg(a))[0];
        const allPro = {};
        for (const r of ROLE_IDS) {
            const best = ps.filter(p => p.role === r).sort((a, b) => avg(b) - avg(a))[0];
            if (best) allPro[r] = ref(best);
        }
        const rookie = ps.filter(p => p.joined === year && ageOf(p, year) <= 20).sort((a, b) => avg(b) - avg(a))[0]
            || ps.filter(p => ageOf(p, year) <= 19).sort((a, b) => avg(b) - avg(a))[0];
        out[region] = { mvp: ref(mvp), allPro, rookie: ref(rookie) };
        if (mvp) { mvp.car.awards = [...(mvp.car.awards || []), `${year} ${leagueName(region, 1)} MVP`]; news(save, `${mvp.name} is the ${leagueName(region, 1)} Player of the Year.`, 'award'); }
        // The record books of the clubs the manager runs.
        const tracked = (p) => (p && p.team && save.teams[p.team] && save.teams[p.team].hist ? save.teams[p.team] : null);
        if (tracked(mvp)) histAward(tracked(mvp), mvp, `${year} ${leagueName(region, 1)} MVP`, year);
        if (tracked(rookie)) histAward(tracked(rookie), rookie, `${year} Rookie of the Year`, year);
        for (const r of ROLE_IDS) {
            const ap = allPro[r] && save.players[allPro[r].id];
            if (tracked(ap)) histAward(tracked(ap), ap, `${year} All-Pro ${r}`, year);
        }
        if (me && mvp && mvp.team === me) recordAch(save, 'mvp_maker', `${mvp.name}, ${year} ${leagueName(region, 1)} MVP`);
        if (me && rookie && rookie.team === me) recordAch(save, 'talent', `${rookie.name}, ${year} ${leagueName(region, 1)} Rookie of the Year`);
    }
    return out;
}

// ---------------------------------------------------------------- the offseason
function runOffseason(save, rng) {
    const S = save.season;
    const year = save.time.year;
    const me = save.manager.teamId;
    const db = dbOf(save);
    const report = { year, objectives: [], retired: [], left: [], leftWhy: [], debuts: [], promoted: [], awards: null, sacked: false, offers: [] };

    // 1. The year in the books.
    const awards = yearAwards(save);
    report.awards = awards;
    const champs = {};
    for (const [key, b] of Object.entries(S.playoffs)) champs[key] = b.champion;
    const t = myTeam(save);
    const myRow = t ? {
        teamId: t.id, teamName: t.name, tier: t.tier, region: t.region,
        spring: (S.places[me] || {}).spring || null, summer: (S.places[me] || {}).summer || null,
        msi: S.msi && S.msi.teams.includes(me) ? S.msi.places[me] || null : null,
        worlds: S.worlds && S.worlds.teams.includes(me) ? S.worlds.places[me] || null : null,
    } : null;
    save.history.push({ year, champs, msi: S.msi ? S.msi.champion : null, worlds: S.worlds ? S.worlds.champion : null, awards, me: myRow });
    if (save.history.length > 40) save.history.shift();
    if (t && year - (save.manager.joined || year) + 1 >= 5) recordAch(save, 'loyal', `${t.name}, since ${save.manager.joined}`, { once: true });

    // 2. The board.
    if (t) {
        report.objectives = yearReview(save).map(o => ({ text: o.text, met: o.met }));
        report.owner = ownerStake(save);
        if (hasBoard(save) && boardCanSack(save) && save.board.confidence <= 15) {
            sack(save, 'after a season that missed its objectives');
            report.sacked = true;
        } else if (!ownerStake(save) && save.manager.rep >= 40 && rng() < 0.45) {
            save.jobOffers = jobOffers(save, false, rng);
            if (save.jobOffers.length) inbox(save, 'job', 'Other clubs want you', `Your work has been noticed. ${save.jobOffers.map(id => save.teams[id].name).join(' and ')} would like to talk. Offers are on the Club screen until the season starts.`);
        }
    }

    // 3. Promotion and relegation.
    report.promoted = applyPromotion(save);
    for (const mv of report.promoted) news(save, `${save.teams[mv.up].name} are promoted to ${leagueName(mv.region, 1)}; ${save.teams[mv.down].name} go down.`, 'world');

    // 4. Contracts: the manager's expiring players leave (every one of them was
    //    decided before the offseason could start); AI clubs renew who they want.
    for (const tm of Object.values(save.teams)) if (tm.hist) histYearEnd(save, tm);
    if (save.manager.teamId) {
        const mine = myTeam(save);
        for (const id of mine.roster.slice()) {
            const p = save.players[id];
            if (!p || (p.until || 0) > year || p.retiring === year) continue;
            const why = p.leaving === year ? 'you let his contract run out' : 'his contract ended';
            release(save, p);
            p.reg = mine.region;
            delete p.leaving; delete p.status; delete p.listed;
            report.left.push(p.name);
            report.leftWhy.push({ name: p.name, why });
        }
        if (report.left.length) inbox(save, 'squad', 'Contracts expired', `${report.leftWhy.map(x => `${x.name} (${x.why})`).join(', ')} left the club as free agent${report.left.length === 1 ? '' : 's'}.`);
    }
    aiRenewals(save, rng);

    // 5. Retirements (real careers protected while the cards say they kept
    //    playing). The manager's own players retire only as announced at the
    //    mid-season break.
    const idx = db ? personsIndex(db) : null;
    for (const p of Object.values(save.players)) {
        const wasMine = !!(p.team && p.team === save.manager.teamId);
        if (wasMine) {
            if (p.retiring !== year) continue;
        } else {
            const person = idx && p.real ? idx.persons.get(p.id) : null;
            if (!retiresNow(p, year, rng, hasCardAfter(person, year))) continue;
        }
        if (p.team) release(save, p);
        save.freeAgents = save.freeAgents.filter(id => id !== p.id);
        delete save.players[p.id];
        if (p.real || ovrOf(p) >= 85 || wasMine) report.retired.push(p.name);
        if (wasMine) inbox(save, 'squad', `${p.name} retires`, `${p.name} has played his last game. Thank you for everything.`);
    }
    if (report.retired.length) news(save, `Retired: ${report.retired.slice(0, 12).join(', ')}${report.retired.length > 12 ? ' and more' : ''}.`, 'world');

    // 6. Everyone a year older.
    for (const p of Object.values(save.players)) {
        ageDecline(p, year, rng);
        p.st = blankStats();
        p.big = Math.max(0, (Number(p.big) || 0) - 2);
        maybeNewFav(p, year + 1, rng);
        delete p.retiring;
        delete p.negot;
    }

    // 7. The new year.
    save.time.year = year + 1;
    save.time.step = 0;
    save.emergency = { year: year + 1, used: 0 };
    const ny = save.time.year;
    if (db) {
        const deb = debutsFor(save, db, ny, save.manager.teamId, rng);
        for (const d of deb) {
            report.debuts.push(d.player.name);
            if (d.forUser) inbox(save, 'prospect', `Academy prospect: ${d.player.name}`, `${d.player.name} (${d.player.role}, ${ovrOf(d.player)} OVR) has come through your organisation and wants to sign. He is waiting in free agency for you, and no other club can sign him this preseason.`, { pid: d.player.id });
        }
        if (deb.length) news(save, `Rookies debuting in ${ny}: ${deb.slice(0, 10).map(d => d.player.name).join(', ')}${deb.length > 10 ? ` and ${deb.length - 10} more` : ''}.`, 'world');
        // History: AI clubs make the moves that really happened, when both clubs
        // exist in this world. The manager's players are never moved for them.
        const meId = save.manager.teamId;
        let moved = 0;
        for (const p of Object.values(save.players)) {
            if (!p.real || (p.team && p.team === meId)) continue;
            const person = idx.persons.get(p.id);
            const card = person && person.cards.find(c => c.year === ny);
            if (!card) continue;
            const cur = p.team ? save.teams[p.team] : null;
            if (cur && cur.region === card.region && sameOrg(card.region, cur.short, card.team)) continue;
            const dest = Object.values(save.teams).find(t2 => t2.real && !t2.custom && t2.region === card.region && sameOrg(card.region, t2.short, card.team));
            if (!dest || dest.id === meId || rng() > 0.85) continue;
            signTo(save, p, dest, { years: randInt(rng, 0, 1), rng });
            p.reg = dest.region;
            moved++;
            if (cur) cur.lineup = bestLineup(cur, save.players);
            if (ovrOf(p) >= 85 && cur) news(save, `${p.name} moves from ${cur.name} to ${dest.name}.`, 'transfer');
        }
        if (moved) report.moves = moved;
        // History: a real pro with a card this year moves toward it.
        for (const p of Object.values(save.players)) {
            if (!p.real) continue;
            const person = idx.persons.get(p.id);
            const card = person && person.cards.find(c => c.year === ny);
            if (!card) continue;
            const mine = !!p.team && p.team === save.manager.teamId;
            if (anchorToCard(p, card, mine ? HISTORY_PULL.mine : HISTORY_PULL.world) && !mine && card.role !== p.role) p.role = card.role;
        }
    }
    const taken = takenNames(save, db);
    pruneFreeAgents(save);
    // A new class of prospects every year, and enough of them that free agency
    // never runs dry once the card database has no more real rookies to send.
    for (const region of REGION_IDS) {
        const inPool = save.freeAgents.filter(id => { const p = save.players[id]; return p && (p.reg || p.nat) === region; }).length;
        regensFor(save, region, Math.max(6, FREE_AGENT_FLOOR - inPool), ny, rng, taken);
    }
    // The Academy Director perk: prospects with real ceilings, held for you.
    const youth = ((save.manager.perks || {}).youth) || 0;
    if (youth && save.manager.teamId) {
        const mt = myTeam(save);
        const names = [];
        for (let i = 0; i < youth; i++) {
            const p = makeRandomPlayer({ id: nextGenId(save), role: pick(rng, ROLE_IDS), region: mt.region, year: ny, target: (REGION_LEVEL[mt.region] || 78) - 12 + randInt(rng, 0, 4), age: randInt(rng, 16, 17), takenNames: taken }, rng);
            p.pot = clamp(ovrOf(p) + randInt(rng, 14, 24), ovrOf(p), 97);
            p.prospectFor = mt.id;
            save.players[p.id] = p;
            save.freeAgents.push(p.id);
            save.scouted = [...(save.scouted || []), p.id];
            names.push(`${p.name} (${p.role}, ${ovrOf(p)} OVR, potential ${p.pot})`);
        }
        inbox(save, 'prospect', 'Your academy class', `Your academy director has ${names.length === 1 ? 'a prospect' : 'prospects'} ready: ${names.join(', ')}. ${names.length === 1 ? 'He is' : 'They are'} held for you in free agency through the preseason.`);
    }
    aiWindow(save, rng, { taken });
    for (const p of Object.values(save.players)) if (p.prospectFor && p.team) delete p.prospectFor;

    // 8. Club reputations drift toward their tier.
    for (const tm of Object.values(save.teams)) {
        const base = tm.tier === 1 ? 62 : 32;
        tm.rep = clamp(Math.round((tm.rep || base) * 0.85 + base * 0.15), 5, 98);
        fadeInvestment(tm);
    }
    // 9. The money of the new year, at the world's new level.
    refreshEconomy(save);

    newSeason(save);
    if (save.manager.teamId) {
        setObjectives(save);
        const mine = myTeam(save);
        mine.tactic = mine.tactic || bestTactic(lineupOf(mine, save.players));
        if (mine.tier === 2 && !(save.manager.tier2Clubs || []).includes(mine.id)) save.manager.tier2Clubs = [...(save.manager.tier2Clubs || []), mine.id];
        const expiring = mine.roster.map(id => save.players[id]).filter(p => p && p.until <= ny).map(p => p.name);
        inbox(save, 'board', `Season ${ny}`, `${mine.name} play in ${leagueName(mine.region, mine.tier)}.\n\nObjectives:\n${save.board.objectives.map(o => '• ' + o.text).join('\n')}${expiring.length ? `\n\nContracts ending this year: ${expiring.join(', ')}. Renew them before the offseason, or decide to let them go.` : ''}`);
    }
    save.offers = [];
    if (save.manager.teamId) openWindow(save, rng);
    // Where every player starts the new season, for the development screen.
    for (const p of Object.values(save.players)) { p.ovr0 = ovrOf(p); p.xpy = 0; }
    report.offers = save.jobOffers || [];
    save.lastOffseason = report;
    return report;
}

/** Keep free agency to a sane size: drop the oldest and weakest unsigned players. */
function pruneFreeAgents(save) {
    const year = save.time.year;
    const byRegion = {};
    for (const id of save.freeAgents) {
        const p = save.players[id];
        if (!p) continue;
        const r = p.reg || p.nat;
        (byRegion[r] = byRegion[r] || []).push(p);
    }
    const keep = new Set();
    for (const list of Object.values(byRegion)) {
        list.sort((a, b) => (b.prospectFor ? 1 : 0) - (a.prospectFor ? 1 : 0) || ovrOf(b) + (b.pot - ovrOf(b)) * 0.5 - ovrOf(a) - (a.pot - ovrOf(a)) * 0.5);
        list.slice(0, 40).forEach(p => keep.add(p.id));
    }
    for (const id of save.freeAgents.slice()) {
        const p = save.players[id];
        if (!p) continue;
        if (!keep.has(id) || (ageOf(p, year) >= 29 && ovrOf(p) < 75 && !p.prospectFor)) {
            delete save.players[id];
        }
    }
    save.freeAgents = save.freeAgents.filter(id => save.players[id]);
}

/** Players pick up new champions as they come out; the pool moves too. */
function maybeNewFav(p, year, rng) {
    if (rng() < 0.2) {
        const fresh = champsFor(p.role, year).filter(c => !(p.favs || []).includes(c.id) && !(p.pool || []).includes(c.id));
        if (fresh.length && Array.isArray(p.pool)) {
            const pool = p.pool.slice();
            pool[Math.floor(rng() * Math.max(1, pool.length))] = pick(rng, fresh).id;
            p.pool = [...new Set(pool)].slice(0, 4);
        }
    }
    if (rng() > 0.3) return;
    const fresh = champsFor(p.role, year).filter(c => (CHAMP_RELEASE[c.id] || 2009) >= year - 1 && !(p.favs || []).includes(c.id));
    if (!fresh.length) return;
    const favs = (p.favs || []).slice();
    favs[favs.length ? Math.floor(rng() * favs.length) : 0] = pick(rng, fresh).id;
    p.favs = [...new Set(favs)].slice(0, 3);
    if (Array.isArray(p.pool)) p.pool = p.pool.filter(c => !p.favs.includes(c));
}

// ---------------------------------------------------------------- readers for the screens
export function nextOpponent(save) {
    const f = userFixture(save);
    if (!f) return null;
    const me = save.manager.teamId;
    return save.teams[f.tie.a === me ? f.tie.b : f.tie.a];
}

/** How the opponent usually plays: their preferred tactic, and how sure we are. */
export function scoutReport(save, teamId) {
    const t = save.teams[teamId];
    if (!t) return null;
    const exact = ((save.manager.perks || {}).tactician || 0) >= 1;
    const lu = lineupOf(t, save.players);
    const star = ROLE_IDS.map(r => lu[r]).filter(Boolean).sort((a, b) => ovrOf(b) - ovrOf(a))[0];
    return {
        team: t,
        strength: teamStrength(t, save.players),
        tactic: t.pref || bestTactic(lu),
        sure: exact ? 'exact' : 'usual',
        star,
        lineup: lu,
        fits: Object.fromEntries(TACTICS.map(x => [x.id, tacticFit(lu, x.id)])),
    };
}

/**
 * The manager's chance to win their next GAME and SERIES, from simulated games
 * with the current lineups and tactics. Seeded by the step, and remembered, so
 * the number does not flicker between renders; it moves when a decision does.
 */
const _wcCache = new Map();
export function winChance(save, n = 120) {
    const f = userFixture(save);
    if (!f) return null;
    const me = save.manager.teamId;
    const oppId = f.tie.a === me ? f.tie.b : f.tie.a;
    const mt = myTeam(save), ot = save.teams[oppId];
    const sig = (t) => ROLE_IDS.map(r => { const p = lineupOf(t, save.players)[r]; return p ? p.id + ':' + ovrOf(p) + ':' + Math.round(p.mor || 0) : '-'; }).join(',');
    const key = [save.seed, save.time.year, save.time.step, sig(mt), sig(ot), mt.tactic, Math.round(mt.chem || 0), JSON.stringify(save.manager.perks || {}), fearlessOn(save)].join('|');
    if (_wcCache.has(key)) return _wcCache.get(key);
    const rng = rngFor('wc:' + save.seed + ':' + save.time.year + ':' + save.time.step);
    const a = sideFor(save, me, rng);
    const b = sideFor(save, oppId, rng);
    b.tactic = ot.pref || b.tactic;
    const ctx = matchContext(save, f.kind);
    let w = 0;
    for (let i = 0; i < n; i++) {
        const r = quickGameAuto(a, b, { ...ctx, blue: i % 2 ? 'a' : 'b' }, rng);
        if (r.winner === 'a') w++;
    }
    const pg = w / n;
    const need = Math.ceil(f.tie.bo / 2);
    // Series odds from the game odds (independent games).
    const out = { game: pg, series: seriesOdds(pg, need), bo: f.tie.bo };
    if (_wcCache.size > 40) _wcCache.clear();
    _wcCache.set(key, out);
    return out;
}

function seriesOdds(p, need) {
    let total = 0;
    const comb = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; };
    for (let lost = 0; lost < need; lost++) total += comb(need - 1 + lost, lost) * Math.pow(p, need) * Math.pow(1 - p, lost);
    return total;
}

export function worldsRace(save) {
    return save.season ? worldsQualifiers(save) : null;
}

/**
 * The card the transition screen shows when the calendar reaches a new stage of
 * the year: { phase, year, title, sub, tone }.
 */
export function phaseCard(save) {
    const step = currentStep(save);
    const phase = phaseOfStep(step);
    const def = SEASON_PHASE_BY_ID[phase];
    const me = save.manager.teamId;
    const t = myTeam(save);
    const S = save.season;
    let sub = def.blurb, tone = 'neutral';
    if (!t) return { phase, year: save.time.year, title: def.name, sub, tone, color: def.color, icon: def.icon };
    if (phase === 'preseason') sub = `${t.name} · ${leagueName(t.region, t.tier)}. ${def.blurb}`;
    if (phase === 'spring_po' || phase === 'summer_po') {
        const b = S.playoffs[leagueKey(t.region, t.tier) + ':' + step.split];
        const seed = b ? b.teams.indexOf(me) : -1;
        if (seed >= 0) { sub = `You are in, as the number ${seed + 1} seed. ${def.blurb}`; tone = 'good'; }
        else { sub = `You missed the cut. The playoffs go on without you.`; tone = 'bad'; }
    }
    if (phase === 'msi' || phase === 'worlds') {
        const b = phase === 'msi' ? S.msi : S.worlds;
        if (b && b.teams.includes(me)) { sub = `${t.name} are in the field of ${b.teams.length}. ${def.blurb}`; tone = 'good'; }
        else { sub = `${t.name} did not qualify. The world plays on.`; tone = 'bad'; }
    }
    if (phase === 'promotion') {
        const pr = S.promo[t.region];
        if (pr && pr.tie && (pr.tie.a === me || pr.tie.b === me)) { sub = pr.tie.a === me ? 'You finished ninth: one best-of-five to stay up.' : 'One best-of-five for a place in the top league.'; tone = 'warn'; }
        else sub = 'Not your fight this year.';
    }
    if (phase === 'offseason') sub = 'The year is over. Contracts, retirements, rookies and the board\'s verdict.';
    return { phase, year: save.time.year, title: def.name, sub, tone, color: def.color, icon: def.icon };
}

export { leagueName, tableRows, annualRows, leagueKey, leagueOf, TALKS };
