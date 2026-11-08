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
    LEAGUE_WEEKS, PRIZES, CUP_WEEKS, CUP_SIZE, SPLIT_NAME, SPLITS, weeksOf, WINTER_PRIZE_SHARE, TACTICS, TACTIC_BY_ID, REGION_IDS, MANAGER_SAVE_VERSION, ROSTER_MAX, TALKS,
    champsFor, CHAMP_RELEASE, ATTR_KEYS, FREE_AGENT_FLOOR, FEARLESS_FROM, ACH_BY_ID, POINT_ACTIONS, REGION_LEVEL,
    SQUAD_STATUS_BY_ID, phaseOfStep, SEASON_PHASE_BY_ID, TIER1_SIZE, TIER2_SIZE, colorFromName, OLD_CALENDAR, STEP_INDEX, CALENDAR_VERSION,
    INTENSITY_BY_ID, BENCH_PROGRAM_BY_ID, SESSIONS_PER_WEEK, SESSION_BY_ID, BOOTCAMP_BY_ID, STAKE_TRANCHES, MIN_STAKE,
    SELF_TRAIN_XP, SELF_TRAIN_FREE_AGENT, IMPORT_RESIDENCY, NATURALISE_CHANCE, MANAGER_START_BANK, teamLanguage, LANG_COURSE_COST, LANG_COURSE_LESSONS, LANG_SWITCH_COST,
    BUYBACK_PREMIUM, STAKE_PER_POINT, TEAM_EMBLEM_BY_ID, SPONSOR_SLOT_BY_ID, REGION_LANGUAGE, LANGUAGE_NAMES,
    LANG_IMMERSION, LANG_EDGE_MAX, LANG_LESSON, XP_PER_LEVEL, POINTS_PER_LEVEL, ROLE_WEIGHTS, PAST_CEILING_FACTOR, PRESTIGE,
} from './data.js';
import {
    ovrOf, fx, grantXP, xpMultiplier, ageDecline, retiresNow, formFrom, ageOf, blankStats, anchorToCard,
    pickPool, makeRandomPlayer, makeRealPlayer, focusAttr, weightedOVR, langLevel, immerse, marketValue, lineupEdge, isImport,
} from './people.js';
import { academyUpkeep, academyWeek, academyIntake, academyAdd, ensureAcademy, recallLoans, dissolveAcademy, scoutingTrip } from './academy.js';
import { bankOf, bankMove, paySalary, keepStake, restoreStake, payDividends, foundCost, cleanIdentity, renameClub } from './owner.js';
import { seedClubs, clubsInvest, academyGraduates } from './npc.js';
import {
    afterMySeries, fansForTitle, patchNotes, fansOf, ANGRY_FANS, scoutCostFor, oppScoutKey, facLevel, staffWages, facilityUpkeep,
    rollInjuries, analystEdge, moveFans,
} from './clublife.js';
import { refreshVacancies, expireVacancies } from './jobs.js';
import { ensureSponsors, clubIncome, expireSponsorOffers, settleSponsors, inboundSponsor, sponsorAppeal } from './sponsors.js';
import { trackClub, histGame, histTitle, histAward, histYearEnd, realHistory, recordSplits, markSplit, recordYear, archivePlayer } from './history.js';
import { metaFor } from '../career/constants.js';
import {
    lineupOf, bestLineup, bestTactic, quickSeries, teamStrength, tacticFit, quickGame, autoDraft,
} from './match.js';
import {
    newSeason, buildPlayoffs, advanceBracket, recordLeagueTie, settleSplit, buildMSI, buildFirstStand, buildWorlds,
    buildPromotion, applyPromotion, promoUps, promoDowns, tableRows, annualRows, leagueKey, leagueOf, worldsQualifiers, tieFor, leagueName,
} from './season.js';
import {
    sponsorIncome, wageBill, earn, aiWindow, aiRenewals, aiBidsForUser, fmtK, expireOffers, listingOffers,
    ownerStake, soleOwner, hasBoard, boardCanSack, clubValuation, economyLevel, refreshEconomy, econIndex,
    settleInvestment, fadeInvestment, ownerFunding, setOwnerStake, assignStyles, clubStyle, freeAgentFloor,
} from './market.js';
/** How many real orgs may arrive in one region in one year (the living league). */
const NEW_CLUBS_PER_YEAR = 2;
export { ownerStake, soleOwner, hasBoard, boardCanSack, clubValuation };
import {
    buildWorld, debutsFor, regensFor, personsIndex, hasCardAfter, takenNames, release, signTo, nextGenId, dataYearFor, makeOrg, addRandomTeam, teamName,
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
    assignStyles(world);
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
export function finalizeSave(world, { name, teamId, startYear, seed, custom = null, fearless = false }) {
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
            bank: MANAGER_START_BANK, bankLog: [], stakes: {},
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
        settings: { autoCalls: false, autoDraft: false, fearless: !!fearless },
        emergency: { year: startYear, used: 0 },
        calV: CALENDAR_VERSION,
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
    ensureAcademy(team);
    seedClubs(save);
    for (const p of Object.values(save.players)) {
        p.ovr0 = ovrOf(p);
        // Anyone already at a club turned pro before the save: at 18, as far as anyone knows.
        if (p.team && !p.pro) p.pro = Math.min(startYear, Number(p.born) + 18 || startYear);
    }
    setObjectives(save);
    ensureSponsors(save, { fresh: true });
    inbox(save, 'board', `Welcome to ${team.name}`, welcomeText(save));
    if (custom) {
        inbox(save, 'board', 'An empty room', `${team.name} exists on paper and nowhere else, and it is yours: you own 100% of it. There is no board to answer to and no wage limit, only the balance. Free agency is open all year: sign at least one player for every role before the preseason window closes. Every free agent in ${leagueName(team.region, team.tier)} is on the Transfers screen, real pros and random prospects alike.`);
    }
    return save;
}

/** Every league back to thirteen clubs: a save from before the expansion, or a fold nobody replaced. */
function fillLeagues(save, year, rng, taken) {
    for (const region of REGION_IDS) {
        for (const [tier, size] of [[1, TIER1_SIZE], [2, TIER2_SIZE]]) {
            let have = Object.values(save.teams).filter(t => t.region === region && t.tier === tier).length;
            for (; have < size; have++) {
                const t = addRandomTeam(save, region, tier, year, rng, taken);
                news(save, `${t.name} join ${leagueName(region, tier)}.`, 'world');
            }
        }
    }
}

/**
 * A save from the 33-step year keeps its place by step id. In the preseason nothing has
 * been played, so the year is simply redrawn on the new format; later in the year the
 * season it is in runs on: it has no winter, and the weeks past its fixtures are quiet.
 * Thirteen-club leagues then start with the next year.
 */
export function migrateCalendar(save) {
    if (Number(save.calV) >= CALENDAR_VERSION) return false;
    const old = OLD_CALENDAR[clamp(Math.round(Number(save.time.step) || 0), 0, OLD_CALENDAR.length - 1)];
    save.time.step = STEP_INDEX[old] || 0;
    save.calV = CALENDAR_VERSION;
    if (old === 'preseason') {
        const rng = rngFor('expand:' + save.seed + ':' + save.time.year);
        fillLeagues(save, save.time.year, rng, takenNames(save, dbOf()));
        newSeason(save);
        if (myTeam(save)) setObjectives(save);
    }
    return true;
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
        emblem: TEAM_EMBLEM_BY_ID[custom.emblem] ? custom.emblem : null,
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
    if (soleOwner(save)) return `${t.name} start life in ${leagueName(t.region, t.tier)} in ${save.time.year}. Nobody sets you objectives: the goals are yours.\n\nThe preseason transfer window is open: sign your players, set your lineup and tactics before the Winter Split.`;
    const obj = save.board.objectives.map(o => '• ' + o.text).join('\n');
    return `The board has handed you the keys for ${save.time.year}. ${leagueName(t.region, t.tier)} expects a lot.\n\nThis year's objectives:\n${obj}\n\nThe preseason transfer window is open: sign, sell, and set your lineup and tactics before the Winter Split.`;
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
        // A season from before the longer calendar has no fixtures in its last weeks.
        const week = L && L[step.split] ? L[step.split].fixtures[step.md] || [] : [];
        const tie = week.find(x => x.a === me || x.b === me);
        return tie ? { tie, comp: `${leagueName(t.region, t.tier)} ${SPLIT_NAME[step.split]} · Week ${step.md + 1}`, kind: 'league', bigStage: false, stage: `Week ${step.md + 1} of ${weeksOf(step.split)}` } : null;
    }
    if (step.kind === 'playoffs') {
        const b = S.playoffs[leagueKey(t.region, t.tier) + ':' + step.split];
        const tie = tieFor(b, step.round, me);
        return tie ? { tie, comp: b.name + (step.round ? ' · Final' : ' · Semifinal'), kind: 'playoffs', bigStage: true, final: step.round === 1, stage: step.round ? 'Final' : 'Semifinal' } : null;
    }
    if (step.kind === 'intl') {
        const b = S[step.event];
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
    return t.roster.map(id => save.players[id]).filter(p => p && !p.loanFrom && (p.until || 0) <= year && p.leaving !== year && p.retiring !== year);
}

/**
 * What stops the manager moving on, with where to fix it, or null.
 * { msg, go: screen id }.
 */
export function blockInfo(save) {
    if (save.jobless) return { msg: 'You have no club. Find a job, or found a club of your own.', go: 'jobs' };
    const t = myTeam(save);
    if (!t) return { msg: 'No club.', go: 'jobs' };
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
/** How well a club's five can talk in its league's language, 0..100. */
export function teamComms(team, players) {
    const code = teamLanguage(team);
    const five = Object.values(lineupOf(team, players));
    if (!code || !five.length) return 100;
    return Math.round(five.reduce((s, p) => s + langLevel(p, code), 0) / five.length);
}

export function sideFor(save, teamId, rng = Math.random) {
    const team = save.teams[teamId];
    const isUser = teamId === save.manager.teamId;
    const perks = isUser ? save.manager.perks || {} : {};
    const coach = team.coach ? team.coach.rating : 70;
    const coachRank = clamp(Math.round((coach - 72) / 10), 0, 2);
    const lineup = lineupOf(team, save.players);
    const tactic = isUser ? (team.tactic || 'early') : aiTactic(team, save.players, rng);
    return {
        team,
        lineup,
        tactic,
        chem: team.chem,
        drafter: isUser ? perks.drafter || 0 : coachRank,
        poolRank: isUser ? perks.poolmaster || 0 : coachRank,
        analyst: isUser ? perks.analyst || 0 : 0,
        tactician: isUser ? perks.tactician || 0 : 0,
        shot: isUser ? perks.shotcaller || 0 : 0,
        steady: isUser ? perks.psychologist || 0 : 0,
        prep: isUser ? Number(save.manager.prep) || 0 : 0,
        // A five that cannot talk to each other gives away up to LANG_EDGE_MAX of team edge.
        // Who the five are matters too: their personalities, how those mix, and how their styles fit.
        extraEdge: clamp((coach - 75) / 20, -1, 1) - LANG_EDGE_MAX * (1 - teamComms(team, save.players) / 100) + (isUser ? analystEdge(save) : 0) + lineupEdge(lineup, tactic),
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
                p.car.k = (p.car.k || 0) + l.k; p.car.d = (p.car.d || 0) + l.d; p.car.a = (p.car.a || 0) + l.a;
                p.car.rs = Math.round(((p.car.rs || 0) + l.rating) * 10) / 10;
                if (g.mvp === l.id) p.car.mvp = (p.car.mvp || 0) + 1;
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
                const d = won ? 4 : -4 * (1 - motiv * 0.15) * (e.lossMorale || 1);
                p.mor = clamp((Number(p.mor) || 65) + d * (e.resultMoraleMult || 1), 0, 100);
            } else {
                const lv = grantXP(p, MATCH_XP.bench * mult * (teamId === me ? 1 + mentor * 0.5 : 1));
                if (lv && teamId === me) levelNote(save, p, lv);
            }
        }
    }
    if (tie.a === me || tie.b === me) {
        const won = tie.winner === me;
        // Fans, rivalries and any promise made to the press.
        for (const note of afterMySeries(save, tie.a === me ? tie.b : tie.a, won, big, ctxKind, boardMove)) inbox(save, 'board', won ? 'A big win' : 'A painful defeat', note);
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
            for (const tie of (L[step.split] && L[step.split].fixtures[step.md]) || []) {
                play(tie, 'league');
                recordLeagueTie(L, step.split, tie);
            }
        }
        playCupRound(save, rng, step);
        if (step.md === weeksOf(step.split) - 1) {
            const t = myTeam(save);
            const L = leagueOf(save, me);
            const row = L && L[step.split].table[me];
            if (row && row.l === 0 && row.w >= weeksOf(step.split) - 1) recordAch(save, 'perfect_split', `${leagueName(t.region, t.tier)} ${SPLIT_NAME[step.split]} ${save.time.year}, ${row.w}-0`);
            buildPlayoffs(save, step.split);
            const b = S.playoffs[leagueKey(t.region, t.tier) + ':' + step.split];
            summary.notes.push(b && b.teams.includes(me)
                ? `You are in the ${SPLIT_NAME[step.split]} Playoffs as the number ${b.teams.indexOf(me) + 1} seed.`
                : `You missed the ${SPLIT_NAME[step.split]} Playoffs.`);
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
            recordSplits(save, step.split);
            splitReview(save, step.split);
            if (step.split === 'winter') {
                const fs = buildFirstStand(save);
                summary.notes.push(fs.teams.includes(me) ? 'You have qualified for First Stand.' : 'First Stand goes on without you.');
                news(save, `First Stand ${S.year}: ${fs.teams.map(id => save.teams[id].short).join(', ')}.`, 'intl');
            } else if (step.split === 'spring') {
                const msi = buildMSI(save);
                summary.notes.push(msi.teams.includes(me) ? 'You have qualified for MSI.' : 'MSI goes on without you.');
                news(save, `MSI ${S.year}: ${msi.teams.map(id => save.teams[id].short).join(', ')}.`, 'intl');
            } else {
                buildPromotion(save);
            }
        }
    } else if (step.kind === 'intl') {
        const b = S[step.event];
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
    cupEvent(save, rng);
    if (step.id === 'midseason') {
        allStar(save, rng);
        const gone = refreshVacancies(save, rng, 2, 'after a poor spring');
        if (gone.length) news(save, `After a poor spring, ${gone.map(x => x.name).join(' and ')} are looking for a new manager.`, 'world');
    }
    if (step.id === 'spring_w1') inbox(save, 'news', `Patch notes: Spring ${save.time.year}`, `The meta shifts for the spring split. Strong (↑) and weak (↓) champions by role:\n\n${patchNotes(save.time.year, 'spring')}`);
    if (step.id === 'midseason') inbox(save, 'news', `Patch notes: Summer ${save.time.year}`, `The meta shifts for the summer split. Strong (↑) and weak (↓) champions by role:\n\n${patchNotes(save.time.year, 'summer')}`);
    // A knockout series coming up: the press wants a word first.
    const fixture = userFixture(save);
    if (fixture && ['playoffs', 'intl', 'promotion'].includes(fixture.kind) && !(save.inbox || []).some(m => m.event === 'bigpress' && !m.answered)) {
        const oppId = fixture.tie.a === t.id ? fixture.tie.b : fixture.tie.a;
        const opp = save.teams[oppId];
        if (opp) inbox(save, 'event', `Press conference: ${fixture.comp}`, `Before the series against ${opp.name}, the press asks what you expect.`, {
            event: 'bigpress', answered: null, data: { opp: oppId },
            options: [
                { id: 'promise', label: '"We will win this."', hint: '+3 morale now; win and the fans love it, lose and fans and board punish you' },
                { id: 'respect', label: '"They are a great team."', hint: '+1 morale, no pressure' },
                { id: 'deflect', label: '"Ask me after the series."', hint: 'Calms nervous players: +4 morale for them' },
            ],
        });
    }
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
    freeAgentFloor(save, rng, takenNames(save, dbOf(save)));
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
    for (const id of save.freeAgents) {
        const p = save.players[id];
        if (!p) continue;
        if (p.inj > 0 && --p.inj <= 0) { delete p.inj; delete p.injT; }
        // Nobody is paying him, but he can still play solo queue: a free agent keeps improving.
        grantXP(p, SELF_TRAIN_FREE_AGENT * (fx(p).selfTrain || 1) * xpMultiplier(p, year));
    }
    // The job market: openings close, and now and then a club parts with its manager.
    for (const t of expireVacancies(save)) news(save, `${t.name} have appointed a new manager.`, 'world');
    if (rng() < 0.05) for (const t of refreshVacancies(save, rng, 1, 'parted ways with their manager')) news(save, `${t.name} have parted ways with their manager.`, 'world');
    for (const t of Object.values(save.teams)) {
        const mine = t.id === me;
        // Every club loses players to injury; the manager's are rolled below with his staff and intensity.
        if (!mine) rollInjuries(save, t, rng, null, true);
        const tr = TRAINING_BY_ID[mine ? t.training : 'balanced'] || TRAINING_BY_ID.balanced;
        const coach = t.coach ? t.coach.rating - 60 : 10;
        const clubTrain = mine ? 1 : clubStyle(t).train || 1;      // a training club's players improve faster
        const trainingCentre = 1 + 0.07 * facLevel(t, 'training');
        // What the squad does for itself: a mentor brings the kids on, a joker lifts the room.
        let mentorXp = 0, squadMorale = 0, fanPull = 0;
        for (const id of t.roster) { const e = fx(save.players[id]); mentorXp += e.mentorXp || 0; squadMorale += e.squadMorale || 0; fanPull += e.fanPull || 0; }
        // The manager's club: each player's intensity, and the bench programme for subs.
        const five = mine ? new Set(Object.values(lineupOf(t, save.players)).map(p => p.id)) : null;
        const bench = mine ? BENCH_PROGRAM_BY_ID[t.bench] || BENCH_PROGRAM_BY_ID.none : null;
        const tongue = teamLanguage(t);
        // A room that already speaks it teaches it faster.
        const speakers = t.roster.filter(id => langLevel(save.players[id], tongue) >= 60).length / Math.max(1, t.roster.length);
        if (fanPull && mine) moveFans(t, fanPull);
        for (const id of t.roster) {
            const p = save.players[id];
            if (!p) continue;
            const e0 = fx(p);
            // Living there teaches the club's language.
            if (tongue) immerse(p, tongue, LANG_IMMERSION * (e0.langMult || 1) * (0.6 + speakers * 0.8));
            if (squadMorale && (Number(p.mor) || 65) < 80) p.mor = clamp((Number(p.mor) || 65) + squadMorale, 0, 100);
            let xp = tr.xp + SELF_TRAIN_XP * (e0.selfTrain || 1);
            if (mentorXp && ageOf(p, year) <= 22 && !e0.mentorXp) xp += mentorXp;
            if (ageOf(p, year) <= 24) xp *= clubTrain;
            xp *= trainingCentre;
            if (mine) {
                xp *= (INTENSITY_BY_ID[p.intensity] || INTENSITY_BY_ID.normal).xp;
                if (!five.has(id)) xp += bench.xp;
                // The gaming house and the psychologist keep heads up.
                const house = facLevel(t, 'house');
                if (house && (Number(p.mor) || 65) < 75) p.mor = clamp((Number(p.mor) || 65) + 0.25 * house, 0, 100);
                if (save.staff && save.staff.psych && (Number(p.mor) || 65) < 60) p.mor = clamp((Number(p.mor) || 65) + Math.max(0, (save.staff.psych.rating - 55) / 15), 0, 100);
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
        const inc = Math.round((clubIncome(save, t) + ownerFunding(save, t)) / STEPS_PER_YEAR);
        expireSponsorOffers(save);
        // An angry crowd leans on the board.
        if (fansOf(t) < ANGRY_FANS) boardMove(save, -0.6);
        // The backroom and the buildings cost money every week.
        const runCosts = Math.round((staffWages(save) + facilityUpkeep(save) + academyUpkeep(save)) / STEPS_PER_YEAR);
        if (runCosts) save.finance.balance -= runCosts;
        academyWeek(save, rng, currentStep(save).kind === 'league');
        for (const note of rollInjuries(save, t, rng, (p) => (INTENSITY_BY_ID[p.intensity] || INTENSITY_BY_ID.normal).xp)) inbox(save, 'squad', note.includes('fit again') ? 'Back in training' : 'Injury', note);
        const out = Math.round(wageBill(save, t) / STEPS_PER_YEAR) + benchCost(save, t) + paySalary(save);
        save.finance.balance += inc - out;
        save.manager.prep = t.training === 'draft' ? TRAINING_BY_ID.draft.draftPrep : 0;
    }
}

// ---------------------------------------------------------------- titles and prizes
function celebrate(save, item) {
    save._fx = save._fx || [];
    save._fx.push(item);
}

/** Pay for a report on the next opponent: their likely bans, comfort picks and plan. */
/** A scouting trip from the Staff screen: names must not collide with any card or player. */
export function runScoutingTrip(save, region, role = null) {
    const rng = rngFor(`trip:${save.time.year}:${save.time.step}:${region}:${save.seed || 0}`);
    return scoutingTrip(save, region, rng, takenNames(save, dbOf()), { role });
}

/** The club's working language. Changing it costs a little, and only once a year. */
export function languageSwitchCost(save) {
    const t = myTeam(save);
    return t ? Math.round(sponsorIncome(save, t) * LANG_SWITCH_COST / 1000) * 1000 : 0;
}
export function setTeamLanguage(save, code) {
    const t = myTeam(save);
    if (!t || !LANGUAGE_NAMES[code]) return { ok: false, msg: 'Pick a language.' };
    if (teamLanguage(t) === code) return { ok: false, msg: `${t.name} already work in ${LANGUAGE_NAMES[code]}.` };
    if (t.langYear === save.time.year) return { ok: false, msg: 'The club has already changed language this year.' };
    const cost = languageSwitchCost(save);
    if (cost > save.finance.balance) return { ok: false, msg: `Changing the club's language costs ${fmtK(cost)}.` };
    save.finance.balance -= cost;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Club language: ${LANGUAGE_NAMES[code]}`, amount: -cost });
    t.lang = code;
    t.langYear = save.time.year;
    return { ok: true, msg: `${t.name} now work in ${LANGUAGE_NAMES[code]}.` };
}
/** A course for the whole squad. The more of them already speak it, the less there is to teach. */
export function languageCourseCost(save) {
    const t = myTeam(save);
    if (!t) return 0;
    const code = teamLanguage(t);
    const fluent = t.roster.filter(id => langLevel(save.players[id], code) >= 80).length / Math.max(1, t.roster.length);
    return Math.round(sponsorIncome(save, t) * LANG_COURSE_COST * (1 - fluent * 0.85) / 1000) * 1000;
}
export function languageCourse(save) {
    const t = myTeam(save);
    if (!t) return { ok: false, msg: 'You have no club.' };
    const code = teamLanguage(t);
    const need = t.roster.map(id => save.players[id]).filter(p => p && langLevel(p, code) < 100);
    if (!need.length) return { ok: false, msg: `Everyone at the club already speaks ${LANGUAGE_NAMES[code]}.` };
    if (t.courseStamp === save.time.year * 1000 + save.time.step) return { ok: false, msg: 'The squad has had its course this week.' };
    const cost = languageCourseCost(save);
    if (cost > save.finance.balance) return { ok: false, msg: `The course costs ${fmtK(cost)}.` };
    save.finance.balance -= cost;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Language course: ${LANGUAGE_NAMES[code]}`, amount: -cost });
    t.courseStamp = save.time.year * 1000 + save.time.step;
    for (const p of need) immerse(p, code, LANG_LESSON * LANG_COURSE_LESSONS * (fx(p).langMult || 1));
    return { ok: true, msg: `${need.length} player${need.length === 1 ? '' : 's'} took the ${LANGUAGE_NAMES[code]} course.` };
}

export function scoutOpponent(save) {
    const fx = userFixture(save);
    const t = myTeam(save);
    if (!fx || !t) return { ok: false, msg: 'There is no match to scout.' };
    const oppId = fx.tie.a === t.id ? fx.tie.b : fx.tie.a;
    const cost = scoutCostFor(save);
    if (cost > save.finance.balance) return { ok: false, msg: `A scouting report costs ${fmtK(cost)}. You cannot afford it.` };
    save.finance.balance -= cost;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: `Scouting report: ${save.teams[oppId].name}`, amount: -cost });
    save.oppScout = oppScoutKey(save, oppId);
    return { ok: true, msg: `The report on ${save.teams[oppId].name} is in.` };
}

/** A brand approaches the manager for an empty sponsor slot (after a title, or a year in form). */
function brandsKnock(save) {
    const o = inboundSponsor(save);
    if (o) inbox(save, 'sponsor', `${o.brand} want to sponsor you`, `${o.brand} have seen the results and want to be your ${SPONSOR_SLOT_BY_ID[o.slot].name.toLowerCase()}: ${fmtK(o.value)} a year for ${o.years} year${o.years === 1 ? '' : 's'}, if you ${o.goal.text.charAt(0).toLowerCase() + o.goal.text.slice(1)}. The offer is on the Sponsors screen for four weeks.`);
}

// ---------------------------------------------------------------- a living league
/**
 * Each new year, the orgs that really appeared that year (a 2013 save meets
 * DAMWON, Gen.G, BLG and JDG when their cards begin) take the places of clubs that
 * are dying: a real org whose cards stop for good (it folded or sold its slot) or a
 * random team, weakest first. The folded club leaves the world for `save.defunct`
 * (its history still reads), its players go to free agency, and the newcomer takes
 * its tier with its real roster. Nothing happens once the card data runs out, and
 * the manager's club never folds. Returns [{ region, out, in, tier }].
 */
function livingLeague(save, db, year, rng) {
    const idx = personsIndex(db);
    const me = save.manager.teamId;
    const out = [];
    for (const region of REGION_IDS) {
        const entries = (idx.byYear.get(year) || []).filter(x => x.card.region === region);
        if (entries.length < 25) continue;
        const teams = Object.values(save.teams).filter(t => t.region === region);
        const exists = (tag) => teams.some(t => t.real && !t.custom && sameOrg(region, t.short, tag));
        const byTag = new Map();
        for (const e of entries) {
            if (!byTag.has(e.card.team)) byTag.set(e.card.team, []);
            byTag.get(e.card.team).push(e);
        }
        const mean = (list) => { const r = list.map(e => e.card.rating).sort((a, b) => b - a).slice(0, 5); return r.reduce((s, v) => s + v, 0) / r.length; };
        const newcomers = [...byTag].filter(([tag, list]) => list.length >= 5 && !exists(tag))
            .map(([tag, list]) => ({ tag, list, lvl: mean(list) })).sort((a, b) => b.lvl - a.lvl).slice(0, NEW_CLUBS_PER_YEAR);
        if (!newcomers.length) continue;
        const future = new Set();
        for (const [y, list] of idx.byYear) if (y >= year) for (const e of list) if (e.card.region === region) future.add(e.card.team);
        const gone = (t) => !t.real || ![...future].some(tag => sameOrg(region, t.short, tag));
        const dying = teams.filter(t => t.id !== me && !t.custom && gone(t))
            .sort((a, b) => (a.real ? 0 : 1) - (b.real ? 0 : 1) || teamStrength(a, save.players) - teamStrength(b, save.players));
        for (const nc of newcomers) {
            const fold = dying.shift();
            if (!fold) break;
            for (const id of fold.roster.slice()) { const p = save.players[id]; if (p) { release(save, p); p.reg = region; } }
            fold.defunct = year;
            fold.roster = [];
            fold.lineup = {};
            save.defunct = { ...(save.defunct || {}), [fold.id]: fold };
            delete save.teams[fold.id];
            const club = makeOrg(save, db, region, nc.tag, fold.tier, year, nc.list, rng, me);
            club.rep = Math.max(Number(fold.rep) || 0, fold.tier === 1 ? 55 : 32);
            club.style = clubStyle(club).id;
            club.lineup = bestLineup(club, save.players);
            club.tactic = bestTactic(lineupOf(club, save.players));
            out.push({ region, out: fold.name, in: club.name, tier: fold.tier });
            news(save, `${club.name} arrive in ${leagueName(region, fold.tier)}, taking the place of ${fold.name}, who ${fold.real ? 'fold' : 'are dissolved'}.`, 'world');
        }
    }
    return out;
}

/** Prize money grows with the game, like everything else priced in it (econIndex). */
function prizeMoney(save, table, key) {
    return Math.round(((table && table[key]) || 0) * econIndex(save) / 1000) * 1000;
}

// ---------------------------------------------------------------- the Regional Cup
// Tier 1 and tier 2 of each region, 16 clubs, single elimination on the spring
// weeks in CUP_WEEKS (Bo3, the final Bo5). No calendar step of its own, so old saves
// keep their step indices. Cup games are not league stats: quickSeries only.
function ensureCup(save, rng) {
    const year = save.time.year;
    if (save.cup && save.cup.year === year) return save.cup;
    const regions = {};
    for (const region of REGION_IDS) {
        const field = Object.values(save.teams).filter(t => t.region === region && (t.tier === 1 || t.tier === 2) && t.roster.length >= 5)
            .sort((a, b) => (a.tier - b.tier) || teamStrength(b, save.players) - teamStrength(a, save.players)).map(t => t.id);
        const size = field.length >= CUP_SIZE ? CUP_SIZE : field.length >= 8 ? 8 : field.length >= 4 ? 4 : 0;
        if (!size) continue;
        const ids = shuffle(rng, field.slice(0, size));
        const ties = [];
        for (let i = 0; i < size; i += 2) ties.push({ a: ids[i], b: ids[i + 1], bo: size === 2 ? 5 : 3 });
        regions[region] = { teams: ids, start: CUP_WEEKS.length - Math.log2(size), rounds: [ties], champion: null, runnerUp: null };
    }
    save.cup = { year, regions };
    return save.cup;
}
const CUP_ROUND_NAMES = { 1: 'Final', 2: 'Semi-final', 4: 'Quarter-final', 8: 'Round of 16' };
/** The manager's cup tie this step, if he is still in it. */
export function myCupTie(save) {
    const step = currentStep(save);
    const me = save.manager.teamId;
    const wk = step.kind === 'league' && step.split === 'spring' ? CUP_WEEKS.indexOf(step.md) : -1;
    if (wk < 0 || !me || !save.cup || save.cup.year !== save.time.year) return null;
    const t = save.teams[me];
    const R = t && save.cup.regions[t.region];
    const ties = R && R.rounds[wk - R.start];
    const tie = ties && ties.find(x => !x.winner && (x.a === me || x.b === me));
    return tie ? { tie, round: CUP_ROUND_NAMES[ties.length] || 'Round', opp: tie.a === me ? tie.b : tie.a } : null;
}
function cupEvent(save, rng) {
    const step = currentStep(save);
    if (step.kind !== 'league' || step.split !== 'spring' || !CUP_WEEKS.includes(step.md)) return;
    ensureCup(save, rng);
    const c = myCupTie(save);
    if (!c || !save.teams[c.opp]) return;
    inbox(save, 'event', `Regional Cup ${c.round}: ${save.teams[c.opp].name}`, `This week's Regional Cup tie is against ${save.teams[c.opp].name} (Bo${c.tie.bo}), alongside the league game. Who plays?`, {
        event: 'cup', answered: null, data: { stamp: save.time.year * 100 + save.time.step },
        options: [
            { id: 'full', label: 'Our best five', hint: 'The strongest side, but a long week: -2 morale for the five' },
            { id: 'rotate', label: 'Give the bench a chance', hint: 'Subs play where you have them: +40 XP and +4 morale for them, the five rest' },
        ],
    });
}
function playCupRound(save, rng, step) {
    const wk = step.kind === 'league' && step.split === 'spring' ? CUP_WEEKS.indexOf(step.md) : -1;
    if (wk < 0) return;
    const cup = ensureCup(save, rng);
    const me = save.manager.teamId;
    const ctx = { ...matchContext(save, 'league'), bigStage: false };
    const stamp = save.time.year * 100 + save.time.step;
    const choice = save.cupChoice && save.cupChoice.stamp === stamp ? save.cupChoice.choice : 'full';
    for (const [region, R] of Object.entries(cup.regions)) {
        const ties = R.rounds[wk - R.start];
        if (!ties || ties.every(x => x.winner)) continue;
        for (const tie of ties) {
            if (tie.winner) continue;
            const a = sideFor(save, tie.a, rng), b = sideFor(save, tie.b, rng);
            const mineSide = tie.a === me ? a : tie.b === me ? b : null;
            let played = [];
            if (mineSide) {
                const t = save.teams[me];
                const five = new Set(Object.values(mineSide.lineup).map(p => p && p.id));
                if (choice === 'rotate') {
                    for (const r of ROLE_IDS) {
                        const sub = t.roster.map(id => save.players[id]).find(p => p && p.role === r && !five.has(p.id) && !(p.inj > 0));
                        if (sub) { mineSide.lineup = { ...mineSide.lineup, [r]: sub }; played.push(sub); }
                    }
                    for (const p of played) { grantXP(p, 40); p.mor = clamp((p.mor || 60) + 4, 0, 100); }
                } else {
                    for (const id of five) if (save.players[id]) save.players[id].mor = clamp((save.players[id].mor || 60) - 2, 0, 100);
                }
            }
            const res = quickSeries(a, b, tie.bo, ctx, rng);
            tie.score = res.score.slice();
            tie.winner = res.winner === 'a' ? tie.a : tie.b;
            if (mineSide) {
                const won = tie.winner === me;
                const opp = save.teams[tie.a === me ? tie.b : tie.a];
                const sc = tie.a === me ? tie.score : tie.score.slice().reverse();
                inbox(save, 'match', `Regional Cup: ${won ? 'through' : 'out'}`, `${won ? 'Won' : 'Lost'} ${sc[0]}-${sc[1]} against ${opp.name} in the ${CUP_ROUND_NAMES[ties.length] || 'cup'}${choice === 'rotate' && played.length ? ` with ${played.length} sub${played.length === 1 ? '' : 's'} in the side` : ''}.${won && ties.length > 1 ? ' On to the next round.' : ''}`);
            }
        }
        if (ties.length === 1) {
            R.champion = ties[0].winner;
            R.runnerUp = ties[0].winner === ties[0].a ? ties[0].b : ties[0].a;
            crownCup(save, region, R);
        } else {
            const next = [];
            for (let i = 0; i < ties.length; i += 2) next.push({ a: ties[i].winner, b: ties[i + 1].winner, bo: ties.length === 2 ? 5 : 3 });
            R.rounds.push(next);
        }
    }
}
function crownCup(save, region, R) {
    const champ = save.teams[R.champion];
    if (!champ) return;
    creditTitle(save, champ, 'cup');
    news(save, `${champ.name} win the ${region} Regional Cup, beating ${save.teams[R.runnerUp] ? save.teams[R.runnerUp].name : 'their rivals'} in the final.`, 'world');
    const me = save.manager.teamId;
    if (R.runnerUp === me) {
        const prize = prizeMoney(save, PRIZES.cup, 2);
        save.finance.balance += prize;
        save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: 'Regional Cup runners-up', amount: prize });
    }
    if (R.champion !== me) return;
    const prize = prizeMoney(save, PRIZES.cup, 1);
    save.finance.balance += prize;
    save.finance.log.unshift({ y: save.time.year, s: save.time.step, label: 'Regional Cup winners', amount: prize });
    save.manager.trophies.push({ year: save.time.year, name: `${region} Regional Cup`, kind: 'cup', split: 'spring', teamId: me, teamName: champ.name });
    save.manager.titles++;
    save.manager.rep = clamp(save.manager.rep + 3, 0, 100);
    save.board.confidence = clamp(save.board.confidence + 4, 0, 100);
    grantMgrXP(save, Math.round(MGR_XP.title / 2));
    fansForTitle(save, 'cup');
    inbox(save, 'title', `${region} Regional Cup winners!`, `${champ.name} lift the Regional Cup. ${fmtK(prize)} of prize money and a trophy for the cabinet.`);
    celebrate(save, { kind: 'title', trophy: 'cup', title: 'Regional Cup Winners', sub: `${champ.name} beat ${save.teams[R.runnerUp] ? save.teams[R.runnerUp].name : 'their rivals'} in the final`, color: '#fb923c' });
}

// ---------------------------------------------------------------- the All-Star event
// At the mid-season break the fans vote: the best-rated player of each role in every
// region's top flight goes to the All-Star event, and a show match is played between
// East (LCK, LPL, LCP) and West (LEC, LCS, CBLOL).
const ALLSTAR_EAST = ['LCK', 'LPL', 'LCP'];
function allStar(save, rng) {
    const year = save.time.year;
    if (save.allStar && save.allStar.year === year) return;
    const score = (p) => (p.st && p.st.g >= 4 ? p.st.rs / p.st.g : 0) + ovrOf(p) / 40;
    const pickSide = (regions) => {
        const out = {};
        for (const r of ROLE_IDS) {
            const pool = Object.values(save.teams).filter(t => t.tier === 1 && regions.includes(t.region))
                .flatMap(t => t.roster.map(id => save.players[id])).filter(p => p && p.role === r && !(p.inj > 0));
            const best = pool.sort((a, b) => score(b) - score(a))[0];
            if (best) out[r] = best.id;
        }
        return out;
    };
    const east = pickSide(ALLSTAR_EAST);
    const west = pickSide(REGION_IDS.filter(r => !ALLSTAR_EAST.includes(r)));
    const mean = (side) => { const v = Object.values(side).map(id => ovrOf(save.players[id])); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    const eastWins = rng() < clamp(0.5 + (mean(east) - mean(west)) / 12, 0.2, 0.8);
    const all = [...Object.values(east), ...Object.values(west)];
    save.allStar = { year, east, west, winner: eastWins ? 'east' : 'west' };
    for (const id of all) {
        const p = save.players[id];
        p.allStar = (p.allStar || 0) + 1;
        p.mor = clamp((p.mor || 60) + 5, 0, 100);
    }
    const names = (side) => ROLE_IDS.filter(r => side[r]).map(r => save.players[side[r]].name).join(', ');
    news(save, `All-Star ${year}: ${eastWins ? 'the East' : 'the West'} win the show match. East: ${names(east)}. West: ${names(west)}.`, 'world');
    const me = save.manager.teamId;
    const mine = all.filter(id => save.players[id].team === me);
    if (me && mine.length) {
        moveFans(save.teams[me], 2 * mine.length);
        save.manager.rep = clamp(save.manager.rep + mine.length, 0, 100);
        inbox(save, 'news', 'All-Star selection', `The fans voted ${mine.map(id => save.players[id].name).join(' and ')} into the All-Star ${year} side. A morale lift for ${mine.length === 1 ? 'him' : 'them'}, and the club's profile grows. ${eastWins ? 'The East' : 'The West'} won the show match.`);
    }
}

/** A medal for everyone who played for the club this year, and the current five. */
function creditTitle(save, team, kind) {
    const five = new Set(Object.values(lineupOf(team, save.players)).map(p => p.id));
    for (const id of team.roster) {
        const p = save.players[id];
        if (!p || (!five.has(id) && !(p.st && p.st.g > 0))) continue;
        p.car = p.car || { g: 0, w: 0, titles: 0 };
        p.car.titles = (p.car.titles || 0) + 1;
        p.car.t = { ...(p.car.t || {}), [kind]: ((p.car.t || {})[kind] || 0) + 1 };
    }
}

function crownLeague(save, key, b, split) {
    const S = save.season;
    const L = S.leagues[key];
    const champ = save.teams[b.champion];
    const me = save.manager.teamId;
    const title = `${leagueName(L.region, L.tier)} ${SPLIT_NAME[split]} ${S.year}`;
    news(save, `${champ.name} win the ${title}, beating ${save.teams[b.runnerUp].name} in the final.`, L.tier === 1 ? 'title' : 'world');
    creditTitle(save, champ, L.tier === 1 ? 'league' : 'tier2');
    histTitle(save, champ, L.tier === 1 ? 'league' : 'tier2');
    champ.rep = clamp((champ.rep || 50) + (L.tier === 1 ? 3 : 2), 0, 100);
    // Prize money for the manager's club.
    if (L.teams.includes(me)) {
        const place = b.places[me] || (S.places[me] || {})[split];
        const prize = Math.round(prizeMoney(save, L.tier === 1 ? PRIZES.league : PRIZES.tier2, place) * (split === 'winter' ? WINTER_PRIZE_SHARE : 1) / 1000) * 1000;
        if (prize) earn(save, prize, `${title}: ${place === 1 ? 'champions' : place === 2 ? 'runners-up' : 'semifinal'}`);
        if (b.champion === me) {
            const t = myTeam(save);
            save.manager.trophies.push({ year: S.year, name: title, kind: L.tier === 1 ? 'league' : 'tier2', split, teamId: me, teamName: t.name });
            save.manager.titles++;
            save.manager.rep = clamp(save.manager.rep + (L.tier === 1 ? 8 : 4), 0, 100);
            grantMgrXP(save, MGR_XP.title);
            brandsKnock(save);
            fansForTitle(save, 'league');
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
    creditTitle(save, champ, event);
    histTitle(save, champ, event);
    // Every entrant's split row learns how far it went.
    const split = event === 'firststand' ? 'winter' : event === 'msi' ? 'spring' : 'summer';
    for (const id of b.teams) {
        const tag = id === b.champion ? event : id === b.runnerUp ? event + '2' : null;
        markSplit(save.teams[id], S.year, split, tag, { [event === 'firststand' ? 'fp' : event === 'msi' ? 'mp' : 'wp']: b.places[id] || null });
    }
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
            brandsKnock(save);
            fansForTitle(save, event);
            inbox(save, 'title', `${b.name} champions!`, `${champ.name} are the best team in the world${event === 'msi' ? ' this spring' : event === 'firststand' ? ' this winter' : ''}. ${fmtK(prize)} of prize money, and a place in history.`);
            celebrate(save, { kind: 'title', trophy: event, title: event === 'worlds' ? `World Champions ${S.year}` : `${b.name} Champions`, sub: `${t.name} beat ${save.teams[b.runnerUp].name} in the final`, color: event === 'worlds' ? '#facc15' : event === 'firststand' ? '#f472b6' : '#38bdf8' });
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
    if (kind === 'firststand') recordAch(save, 'first_stand', name);
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
    inbox(save, 'achievement', `${first ? 'Achievement unlocked' : 'Achievement'}: ${def.name}`, `${def.desc}${detail ? `\n\n${detail}.` : ''}${first && def.point ? '\n\nA perk point has been added: spend it on your Profile.' : cur.n ? `\n\nThat makes ${cur.n + 1}.` : ''}`);
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
        if (promoUps(pr).includes(me) || (pr.tie && pr.tie.winner === me && pr.tie.b === me)) {
            inbox(save, 'title', 'Promoted!', `${myTeam(save).name} will play in ${leagueName(region, 1)} next year.`);
            save.manager.trophies.push({ year: S.year, name: `Promotion to ${leagueName(region, 1)}`, kind: 'promotion', teamId: me, teamName: myTeam(save).name });
            save.manager.rep = clamp(save.manager.rep + 5, 0, 100);
            grantMgrXP(save, MGR_XP.promotion);
            celebrate(save, { kind: 'title', trophy: 'promotion', title: 'Promoted!', sub: `${myTeam(save).name} will play in ${leagueName(region, 1)} next year`, color: '#a78bfa' });
            recordAch(save, 'promoted', `${myTeam(save).name}, ${S.year}`);
            fansForTitle(save, 'promotion');
        }
        if (promoDowns(pr).includes(me) || (pr.tie && pr.tie.a === me && pr.tie.winner !== me)) {
            inbox(save, 'board', 'Relegated', `${myTeam(save).name} go down to ${leagueName(region, 2)} next year. The board is furious.`);
            fansForTitle(save, 'down');
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
        if (exp <= 2) out.push({ id: 'title', text: 'Win a domestic title (Winter, Spring or Summer)' }, { id: 'worlds', text: 'Qualify for Worlds' });
        else if (exp <= 4) out.push({ id: 'worlds', text: 'Qualify for Worlds' }, { id: 'playoffs2', text: 'Reach the playoffs in Spring and Summer' });
        else if (exp <= 9) out.push({ id: 'playoffs1', text: 'Reach the playoffs at least once' });
        else out.push({ id: 'survive', text: 'Avoid relegation' });
    } else {
        if (exp <= 3) out.push({ id: 'promote', text: 'Win promotion to the top league' });
        else out.push({ id: 'tophalf', text: 'Finish in the top half over the whole year' });
    }
    out.push({ id: 'money', text: 'Keep the balance above zero' });
    save.board.objectives = out.map(o => ({ ...o, met: null }));
    save.board.expected = exp;
}

export function objectiveMet(save, o) {
    const S = save.season;
    const me = save.manager.teamId;
    const t = myTeam(save);
    const pl = S.places[me] || {};
    const key = leagueKey(t.region, t.tier);
    switch (o.id) {
        case 'title': return SPLITS.some(s => (S.playoffs[key + ':' + s] || {}).champion === me);
        case 'worlds': return !!(S.worlds && S.worlds.teams.includes(me));
        case 'playoffs2': return (pl.spring || 99) <= 4 && (pl.summer || 99) <= 4;
        case 'playoffs1': return (pl.spring || 99) <= 4 || (pl.summer || 99) <= 4;
        case 'survive': {
            const pr = S.promo[t.region];
            return !(pr && (promoDowns(pr).includes(me) || (pr.tie && pr.tie.a === me && pr.tie.winner && pr.tie.winner !== me)));
        }
        case 'promote': {
            const pr = S.promo[t.region];
            return !!(pr && (promoUps(pr).includes(me) || (pr.tie && pr.tie.b === me && pr.tie.winner === me)));
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
        inbox(save, 'board', `${SPLIT_NAME[split]} review`, `${t.name} finished ${ordinalWord(place)} in the ${split} split, against a squad strength ranked ${ordinalWord(exp)}. You own the club: the verdict is yours.`);
        return;
    }
    // Winter is seven weeks: the board notes it, and judges the year on the long splits.
    const d = (place <= exp - 2 ? 8 : place <= exp ? 4 : place <= exp + 2 ? -3 : -9) * (split === 'winter' ? 0.5 : 1);
    boardMove(save, d);
    const tone = d > 0 ? 'pleased with' : d > -5 ? 'watching' : 'unhappy with';
    inbox(save, 'board', `${SPLIT_NAME[split]} review`, `${t.name} finished ${ordinalWord(place)} in the ${split} split. The board expected around ${ordinalWord(exp)} and is ${tone} the results. Board confidence: ${Math.round(save.board.confidence)}%.${boardCanSack(save) ? '' : ' You hold a majority of the club: they cannot sack you.'}`);
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
    keepStake(save);
    dissolveAcademy(save, t);
    save.manager.sacked++;
    save.manager.history.push({ year: save.time.year, teamId: t.id, teamName: t.name, left: 'sacked' });
    save.manager.rep = clamp(save.manager.rep - 15, 0, 100);
    inbox(save, 'board', 'You have been sacked', `The board of ${t.name} has dismissed you ${why}. Other clubs have been in touch: see the Jobs screen to carry on.`);
    save.jobOffers = jobOffers(save, true, rngFor('jobs:' + save.seed + ':' + save.time.year + ':' + save.time.step));
    // A sacked manager can always see openings to apply for, beyond the offers.
    const open = (save.vacancies || []).filter(v => save.teams[v.teamId] && v.teamId !== t.id).length;
    if (open < 4) refreshVacancies(save, rngFor('vac:' + save.seed + ':' + save.time.year + ':' + save.time.step), 4 - open, 'looking for a manager');
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
    return moveToClub(save, teamId);
}

/** Walk back into a club he holds a majority of. */
export function returnToClub(save, teamId) {
    if (!save.teams[teamId] || ((save.manager.stakes || {})[teamId] || 0) < 50) return { ok: false, msg: 'You need a majority of the club.' };
    return moveToClub(save, teamId);
}

/** Leave the club. What he owns of it stays his and keeps paying; he is free to find another job. */
export function resignJob(save) {
    const t = myTeam(save);
    if (!t) return { ok: false, msg: 'You have no club.' };
    keepStake(save);
    dissolveAcademy(save, t);
    save.manager.history.push({ year: save.time.year, teamId: t.id, teamName: t.name, left: 'resigned' });
    for (const id of t.roster) {
        const p = save.players[id];
        if (p) { delete p.listed; delete p.leaving; delete p.status; delete p.promise; }
    }
    const open = (save.vacancies || []).filter(v => save.teams[v.teamId] && v.teamId !== t.id).length;
    if (open < 4) refreshVacancies(save, rngFor('vac:' + save.seed + ':' + save.time.year + ':' + save.time.step), 4 - open, 'looking for a manager');
    save.manager.teamId = null;
    save.jobless = true;
    save.offers = [];
    t.lineup = bestLineup(t, save.players);
    inbox(save, 'board', `You left ${t.name}`, `You are a free agent yourself now. Apply for a job on the Jobs screen${bankOf(save) >= foundCost(save, 2) ? ', or found a club of your own' : ''}.`);
    return { ok: true, msg: `You have left ${t.name}.` };
}

/**
 * Found a club at any point of a year, with the manager's own money. It buys the league
 * place of the weakest club of that tier in the region, which keeps its fixtures, so no
 * calendar has to change: that club takes the new name, and its squad comes with the place.
 */
export function foundNewClub(save, cfg) {
    const region = REGION_IDS.includes(cfg.region) ? cfg.region : 'LCK';
    const tier = cfg.tier === 1 ? 1 : 2;
    const cost = foundCost(save, tier);
    if (bankOf(save) < cost) return { ok: false, msg: `A place in ${leagueName(region, tier)} costs ${fmtK(cost)}. You have ${fmtK(bankOf(save))}.` };
    const id = cleanIdentity(save, cfg);
    if (!id.ok) return id;
    const me = save.manager.teamId;
    const held = save.manager.stakes || {};
    const slot = Object.values(save.teams).filter(t => t.region === region && t.tier === tier && t.id !== me && !t.custom && !held[t.id])
        .sort((a, b) => teamStrength(a, save.players) - teamStrength(b, save.players))[0];
    if (!slot) return { ok: false, msg: 'There is no place to buy in that league.' };
    const old = slot.name;
    bankMove(save, -cost, `Founded ${id.name}`);
    renameClub(save, slot, { name: id.name, short: id.short, color: cfg.color, emblem: cfg.emblem || null });
    Object.assign(slot, { custom: true, real: true, rebranded: true, style: 'balanced', stake: 100, rep: Math.max(Number(slot.rep) || 0, tier === 1 ? 45 : 28) });
    delete slot.mstake; delete slot.invest;
    news(save, `${old} are sold and become ${slot.name}, a new club in ${leagueName(region, tier)}.`, 'world');
    moveToClub(save, slot.id, { founding: true });
    return { ok: true, msg: `${slot.name} is born. You own all of it.` };
}

function moveToClub(save, teamId, { founding = false } = {}) {
    const t = save.teams[teamId];
    const prev = myTeam(save);
    keepStake(save);
    if (founding) save.manager.founded = teamId;
    dissolveAcademy(save, prev);
    if (prev) {
        save.manager.history.push({ year: save.time.year, teamId: prev.id, teamName: prev.name, left: 'moved' });
        for (const id of prev.roster) {
            const p = save.players[id];
            if (p) { delete p.listed; delete p.leaving; delete p.status; delete p.promise; }
        }
    }
    save.manager.teamId = teamId;
    save.manager.joined = save.time.year;
    restoreStake(save);
    ensureAcademy(t);
    save.jobless = false;
    save.jobOffers = [];
    save.vacancies = (save.vacancies || []).filter(v => v.teamId !== teamId);
    save.offers = [];
    save.board.confidence = 60;
    save.finance = { balance: Math.round(sponsorIncome(save, t) * 0.4 / 1000) * 1000, log: [] };
    t.training = t.training || 'balanced';
    t.tactic = bestTactic(lineupOf(t, save.players));
    if (t.tier === 2 && !(save.manager.tier2Clubs || []).includes(t.id)) save.manager.tier2Clubs = [...(save.manager.tier2Clubs || []), t.id];
    trackClub(save, t);
    setObjectives(save);
    ensureSponsors(save, { fresh: true });
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
    const founded = !!(t && t.custom && save.manager.founded === t.id);
    if (!t || own <= 0) return { ok: false, msg: 'You do not own any of this club.' };
    if (!STAKE_TRANCHES.includes(pct)) return { ok: false, msg: 'Not a stake on offer.' };
    if (own - pct < (founded ? MIN_STAKE : 0)) return { ok: false, msg: founded ? `You keep at least ${MIN_STAKE}% of your club.` : `You only own ${own}%.` };
    const price = stakePrice(save, pct);
    const first = own >= 100;
    setOwnerStake(save, own - pct);
    const now = ownerStake(save);
    earn(save, price, `Sold ${pct}% of ${t.name}`);
    if (first) {
        save.board.confidence = 60;
        setObjectives(save);
        inbox(save, 'board', 'Investors join the board', `You sold ${pct}% of ${t.name} for ${fmtK(price)}. The investors want a say: there is a board now, with objectives for the season and a wage limit.\n\n${save.board.objectives.map(o => '• ' + o.text).join('\n')}\n\nWhile you hold a majority they cannot sack you.`);
    }
    if (own >= 50 && now < 50) inbox(save, 'board', 'You have sold a majority', `The investors now own ${100 - now}% of ${t.name}. If the board loses confidence in you, it can sack you.`);
    return { ok: true, msg: `You sold ${pct}% of ${t.name} for ${fmtK(price)}. You own ${now}%.` };
}

/** Buy into the club, at a premium: back into one you founded, or into one you were hired by. */
export function buyStake(save, pct) {
    const t = myTeam(save);
    const own = ownerStake(save);
    if (!t) return { ok: false, msg: 'You need a club.' };
    pct = Math.min(pct, 100 - own);
    if (pct <= 0) return { ok: false, msg: 'You already own all of it.' };
    const price = stakePrice(save, pct, true);
    if (price > bankOf(save)) return { ok: false, msg: `Buying ${pct}% costs ${fmtK(price)}, and you have ${fmtK(bankOf(save))} in the bank.` };
    bankMove(save, -price, `Bought ${pct}% of ${t.name}`);
    return { ...gainStake(save, own + pct), msg: `You bought ${pct}% for ${fmtK(price)}. You own ${ownerStake(save)}%.` };
}

/** The manager's stake moves up: the board learns it, and at 100% it is gone. */
function gainStake(save, v) {
    const t = myTeam(save);
    const before = ownerStake(save);
    setOwnerStake(save, v);
    const now = ownerStake(save);
    if (before < 50 && now >= 50) inbox(save, 'board', 'You hold a majority', `You now own ${now}% of ${t.name}. The board keeps its objectives and wage limit, but it can no longer sack you.`);
    if (now >= 100) {
        setObjectives(save);
        inbox(save, 'board', `${t.name} is yours`, `You own all of ${t.name}. The board is dissolved: no objectives, no wage limit, and nobody who can sack you.`);
    }
    return { ok: true };
}

// ---------------------------------------------------------------- manager level
export function grantMgrXP(save, n) {
    const m = save.manager;
    m.xp = (Number(m.xp) || 0) + Math.round(n);
    while (m.xp >= MGR_XP_PER_LEVEL) {
        m.xp -= MGR_XP_PER_LEVEL;
        m.level++;
        m.points++;
        inbox(save, 'level', `Manager level ${m.level}`, 'You have a perk point to spend on your Profile.');
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
    } else if (actionId === 'stake') {
        const own = ownerStake(save);
        if (own >= 100) return { ok: false, msg: `You already own all of ${t.name}.` };
        gainStake(save, own + STAKE_PER_POINT);
        msg = `The owners hand you ${Math.min(STAKE_PER_POINT, 100 - own)}% of ${t.name}. You own ${ownerStake(save)}%.`;
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
    } else if (id === 'language') {
        const code = teamLanguage(t);
        const before = langLevel(p, code);
        if (before >= 100) return { ok: false, msg: `${p.name} already speaks ${LANGUAGE_NAMES[code]} fluently.` };
        immerse(p, code, LANG_LESSON);
        msg = `${p.name} studies ${LANGUAGE_NAMES[code]}: ${Math.round(before)} → ${Math.round(langLevel(p, code))}.`;
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

const campKey = (save) => save.time.year + ':' + (currentStep(save).split || 'winter');
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
        // An unhappy player asks to leave: a long run on the bench, or an ambitious
        // player at a club that is not winning.
        id: 'leave',
        when: (save) => {
            const t = myTeam(save);
            const five = new Set(Object.values(lineupOf(t, save.players)).map(p => p.id));
            return t.roster.map(id => save.players[id]).find(p => p && !p.listed && !p.leaveAsked && (Number(p.mor) || 65) < 38
                && (!five.has(p.id) || p.pers === 'ambitious' || p.pers === 'hothead')) || null;
        },
        make: (save, p) => ({
            title: `${p.name} wants to leave`,
            body: `${p.name} has handed in a transfer request. He is unhappy and wants a fresh start somewhere else.`,
            pid: p.id,
            options: [
                { id: 'list', label: 'Put him on the transfer list', hint: 'Listed at his value; +10 morale while clubs look' },
                { id: 'talk', label: 'Talk him round', hint: 'A 50/50: +12 morale, or -6 and he asks again later' },
                { id: 'refuse', label: 'Refuse the request', hint: '-10 morale; a Loyal player takes it better' },
            ],
        }),
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
    } else if (m.event === 'leave') {
        const p = P[d.pid];
        if (p && p.team === t.id) {
            p.leaveAsked = save.time.year;
            if (optId === 'list') { p.listed = Math.max(10000, Math.round(marketValue(p, save.time.year) / 5000) * 5000); bump(p.id, 10); msg = `${p.name} is on the transfer list. Clubs will make offers in the next window.`; }
            else if (optId === 'talk') { if (Math.random() < 0.5) { bump(p.id, 12); msg = `${p.name} agrees to stay and fight for his place.`; } else { bump(p.id, -6); delete p.leaveAsked; msg = `${p.name} is not convinced.`; } }
            else { bump(p.id, p.pers === 'loyal' ? -4 : -10); msg = `${p.name} stays, unhappily.`; }
        }
    } else if (m.event === 'cup') {
        save.cupChoice = { stamp: d.stamp, choice: optId === 'rotate' ? 'rotate' : 'full' };
        msg = optId === 'rotate' ? 'The bench gets its chance in the cup.' : 'Your best five will play the cup tie.';
    } else if (m.event === 'bigpress') {
        if (optId === 'promise') { for (const id of t.roster) bump(id, 3); save.pressPromise = { opp: d.opp, kind: 'promise' }; msg = 'Bold words. Now win it.'; }
        else if (optId === 'respect') { for (const id of t.roster) bump(id, 1); msg = 'A calm, respectful answer.'; }
        else { for (const id of t.roster) if (P[id] && P[id].pers === 'nervous') bump(id, 4); msg = 'The pressure stays off the players.'; }
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
        const award = (p, k) => { if (p) { p.car = p.car || { g: 0, w: 0, titles: 0 }; p.car.aw = { ...(p.car.aw || {}), [k]: ((p.car.aw || {})[k] || 0) + 1 }; } };
        award(mvp, 'mvp'); award(rookie, 'rookie');
        for (const r of ROLE_IDS) award(allPro[r] && save.players[allPro[r].id], 'allpro');
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
        winter: (S.places[me] || {}).winter || null, spring: (S.places[me] || {}).spring || null, summer: (S.places[me] || {}).summer || null,
        firststand: S.firststand && S.firststand.teams.includes(me) ? S.firststand.places[me] || null : null,
        msi: S.msi && S.msi.teams.includes(me) ? S.msi.places[me] || null : null,
        worlds: S.worlds && S.worlds.teams.includes(me) ? S.worlds.places[me] || null : null,
    } : null;
    save.history.push({ year, champs, firststand: S.firststand ? S.firststand.champion : null, msi: S.msi ? S.msi.champion : null, worlds: S.worlds ? S.worlds.champion : null, awards, me: myRow });
    if (save.history.length > 40) save.history.shift();
    if (t && year - (save.manager.joined || year) + 1 >= 5) recordAch(save, 'loyal', `${t.name}, since ${save.manager.joined}`, { once: true });

    // 2. The board.
    if (t) {
        // Sponsors judge the year by the same measures the board uses.
        report.sponsors = settleSponsors(save, (o) => objectiveMet(save, o));
        report.objectives = yearReview(save).map(o => ({ text: o.text, met: o.met }));
        report.owner = ownerStake(save);
        if (hasBoard(save) && boardCanSack(save) && save.board.confidence <= 15) {
            sack(save, 'after a season that missed its objectives');
            report.sacked = true;
        } else if (!ownerStake(save) && save.manager.rep >= 40 && rng() < 0.45) {
            save.jobOffers = jobOffers(save, false, rng);
            if (save.jobOffers.length) inbox(save, 'job', 'Other clubs want you', `Your work has been noticed. ${save.jobOffers.map(id => save.teams[id].name).join(' and ')} would like to talk. Offers are on the Jobs screen.`);
        }
    }
    // Dividends from clubs the manager owns a part of, before the year's books close.
    const paid = payDividends(save);
    if (paid.length) inbox(save, 'board', 'Dividends', `Your clubs paid out for ${year}:\n\n${paid.map(d => `• ${d.name} (${d.pct}%): ${fmtK(d.amount)}`).join('\n')}`);
    {
        const gone = refreshVacancies(save, rng, 3 + Math.floor(rng() * 4), 'after a disappointing season');
        if (gone.length) news(save, `The managerial merry-go-round: ${gone.map(x => x.name).join(', ')} are looking for a new manager.`, 'world');
    }

    // 3. Promotion and relegation.
    report.promoted = applyPromotion(save);
    for (const mv of report.promoted) {
        news(save, `${save.teams[mv.up].name} are promoted to ${leagueName(mv.region, 1)}; ${save.teams[mv.down].name} go down.`, 'world');
        markSplit(save.teams[mv.up], year, 'summer', 'up');
        markSplit(save.teams[mv.down], year, 'summer', 'down');
    }

    // 4. Contracts: the manager's expiring players leave (every one of them was
    //    decided before the offseason could start); AI clubs renew who they want.
    for (const tm of Object.values(save.teams)) if (tm.hist) histYearEnd(save, tm);
    recordYear(save, year);
    residency(save, rng);
    // Loanees come home before contracts are looked at.
    const back = recallLoans(save);
    if (back.length) inbox(save, 'squad', 'Back from loan', back.join('\n'));
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
        archivePlayer(save, p, year);
        delete save.players[p.id];
        if (p.real || ovrOf(p) >= 85 || wasMine) report.retired.push(p.name);
        if (wasMine) inbox(save, 'squad', `${p.name} retires`, `${p.name} has played his last game. Thank you for everything.`);
    }
    if (report.retired.length) news(save, `Retired: ${report.retired.slice(0, 12).join(', ')}${report.retired.length > 12 ? ' and more' : ''}.`, 'world');

    // 6. Everyone a year older.
    for (const p of Object.values(save.players)) {
        ageDecline(p, year, rng);
        p.st = blankStats();
        delete p.stOff;
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
        report.newClubs = livingLeague(save, db, ny, rng);
        realRenames(save, db, ny);
        const deb = debutsFor(save, db, ny, save.manager.teamId, rng);
        for (const d of deb) {
            report.debuts.push(d.player.name);
            if (d.forUser) {
                academyAdd(save, d.player, { force: true });
                inbox(save, 'prospect', `Academy: ${d.player.name}`, `${d.player.name} (${d.player.role}, ${ovrOf(d.player)} OVR) has come through your organisation and joins your academy. Call him up in a transfer window when he is ready.`, { pid: d.player.id });
            }
        }
        if (deb.length) news(save, `Rookies debuting in ${ny}: ${deb.slice(0, 10).map(d => d.player.name).join(', ')}${deb.length > 10 ? ` and ${deb.length - 10} more` : ''}.`, 'world');
        // History: AI clubs make the moves that really happened, when both clubs
        // exist in this world. The manager's players are never moved for them.
        const meId = save.manager.teamId;
        let moved = 0;
        for (const p of Object.values(save.players)) {
            if (!p.real || (p.team && p.team === meId) || p.loanFrom) continue;
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
    fillLeagues(save, ny, rng, taken);
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
            save.players[p.id] = p;
            academyAdd(save, p, { force: true });
            names.push(`${p.name} (${p.role}, ${ovrOf(p)} OVR, potential ${p.pot})`);
        }
        inbox(save, 'prospect', 'Your academy class', `Your academy director has ${names.length === 1 ? 'a prospect' : 'prospects'} ready: ${names.join(', ')}. ${names.length === 1 ? 'He is' : 'They are'} in your academy now.`);
    }
    // AI clubs: academies graduate, and the year's money goes into facilities and staff.
    for (const { p, t: club } of academyGraduates(save, rng, taken)) {
        if (ovrOf(p) >= 75 || p.pot >= 88) news(save, `${club.name} promote ${p.name} (${p.role}, ${ageOf(p, ny)}) from their academy.`, 'transfer');
    }
    for (const n of clubsInvest(save, rng).slice(0, 6)) news(save, n, 'world');
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
    // A club in form starts the year with a brand at the door.
    if (save.manager.teamId && sponsorAppeal(save).value >= 0.6) brandsKnock(save);

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
    if (save.manager.teamId) {
        const intake = academyIntake(save, rng, taken);
        if (intake.length) inbox(save, 'prospect', 'Academy intake', `New in your academy: ${intake.map(p => `${p.name} (${p.role}, ${ovrOf(p)} OVR, potential ${p.pot})`).join(', ')}.`);
        openWindow(save, rng);
        inbox(save, 'news', `Patch notes: Winter ${ny}`, `A new season, a new meta. Strong (↑) and weak (↓) champions by role:\n\n${patchNotes(ny, 'winter')}`);
        // Rivalries cool a little every year.
        for (const k of Object.keys(save.rivals || {})) { save.rivals[k] = Math.round(save.rivals[k] * 0.7 * 10) / 10; if (save.rivals[k] < 0.5) delete save.rivals[k]; }
    }
    // Where every player starts the new season, for the development screen.
    for (const p of Object.values(save.players)) { p.ovr0 = ovrOf(p); p.xpy = 0; }
    report.offers = save.jobOffers || [];
    save.lastOffseason = report;
    return report;
}

/**
 * Real orgs take their real new names when the year comes: SKT become T1, Samsung become
 * Gen.G. A club the manager has rebranded, or founded, keeps the name it chose.
 */
function realRenames(save, db, year) {
    const idx = personsIndex(db);
    const tags = new Map();
    for (const { card } of idx.byYear.get(year) || []) {
        const k = card.region + ':' + card.team;
        tags.set(k, (tags.get(k) || 0) + 1);
    }
    for (const t of Object.values(save.teams)) {
        if (!t.real || t.custom || t.rebranded) continue;
        if (tags.get(t.region + ':' + t.short) >= 3) continue;
        const next = [...tags].find(([k, n]) => n >= 3 && k.startsWith(t.region + ':') && sameOrg(t.region, t.short, k.slice(t.region.length + 1)));
        if (!next) continue;
        const tag = next[0].slice(t.region.length + 1);
        if (Object.values(save.teams).some(x => x !== t && x.region === t.region && x.short === tag)) continue;
        const was = t.name;
        renameClub(save, t, { name: teamName(t.region, tag), short: tag });
        news(save, `${was} are now ${t.name}.`, 'world');
        if (t.id === save.manager.teamId) inbox(save, 'board', 'A new name', `The org has rebranded for ${year}: ${was} are now ${t.name}.`);
    }
}

/** Years in a row a player has played in a region. Five in a row can naturalise him there. */
function residency(save, rng) {
    for (const p of Object.values(save.players)) {
        const region = p.team && save.teams[p.team] ? save.teams[p.team].region : null;
        if (!region) { delete p.res; continue; }
        p.res = p.res && p.res.r === region ? { r: region, y: p.res.y + 1 } : { r: region, y: 1 };
        if (p.res.y >= IMPORT_RESIDENCY && isImport(p, region) && rng() < NATURALISE_CHANCE) {
            p.natz = [...(p.natz || []), region];
            if (p.team === save.manager.teamId) inbox(save, 'squad', `${p.name} is naturalised`, `After ${p.res.y} years in a row in ${region}, ${p.name} no longer counts as an import there.`, { pid: p.id });
            else if (ovrOf(p) >= 82) news(save, `${p.name} is naturalised in ${region}.`, 'world');
        }
    }
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
            archivePlayer(save, p, year);
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
/**
 * Every competition of the year, in order, as the manager stands in it: what it is, how
 * far along it is, how he is doing, who won, how you qualify and exactly what it pays.
 * status: upcoming | live | won | done | out | missed.
 */
export function eventRoad(save) {
    const S = save.season;
    const t = myTeam(save);
    if (!S) return [];
    const me = t ? t.id : null;
    const at = save.time.step;
    const key = t ? leagueKey(t.region, t.tier) : null;
    const L = t ? leagueOf(save, me) : null;
    const nameOf = (id) => (save.teams[id] ? save.teams[id].name : '');
    const pay = (table, k, share = 1) => Math.round(prizeMoney(save, table, k) * share / 1000) * 1000;
    const out = [];
    const addSplit = (sp, first, last, leads) => {
        const b = key ? S.playoffs[key + ':' + sp] : null;
        const rows = L && L[sp] ? tableRows(L, sp, save) : [];
        const pos = rows.findIndex(r => r.id === me) + 1;
        const row = rows[pos - 1];
        const started = at >= STEP_INDEX[first], over = at > STEP_INDEX[last];
        const played = row && (row.w + row.l) > 0;
        const place = (S.places[me] || {})[sp] || 0;
        let status = 'upcoming', detail = '';
        if (b && b.champion === me) { status = 'won'; detail = 'Champions'; }
        else if (over) { status = 'done'; detail = place ? `Finished ${ordinal(place)}${b && b.champion ? ` · ${nameOf(b.champion)} won it` : ''}` : 'Not played'; }
        else if (b && !b.teams.includes(me)) { status = 'out'; detail = `Missed the playoffs (${ordinal(pos)})`; }
        else if (b && b.places[me]) { status = 'out'; detail = `Out in the ${b.places[me] === 2 ? 'final' : 'semifinals'}`; }
        else if (b) { status = 'live'; detail = `Playoffs, number ${b.teams.indexOf(me) + 1} seed`; }
        else if (started) { status = 'live'; detail = played ? `${ordinal(pos)} of ${rows.length} · ${row.w}-${row.l}` : `Week 1 of ${weeksOf(sp)}`; }
        else detail = `${weeksOf(sp)} weeks, then a top-four playoff`;
        const share = sp === 'winter' ? WINTER_PRIZE_SHARE : 1;
        const table = t && t.tier === 2 ? PRIZES.tier2 : PRIZES.league;
        out.push({
            id: sp, name: `${SPLIT_NAME[sp]} Split`, short: SPLIT_NAME[sp], kind: 'split', status, detail, leads, bracket: b || null,
            prizes: [['Champions', pay(table, 1, share)], ['Runners-up', pay(table, 2, share)], ...(table[3] ? [['Semifinal', pay(table, 3, share)]] : [])],
        });
    };
    const addIntl = (id, name, short, first, last, table, qualify) => {
        const b = S[id];
        const inIt = !!(b && b.teams.includes(me));
        const over = at > STEP_INDEX[last];
        let status = 'upcoming', detail = qualify;
        if (b && b.champion === me) { status = 'won'; detail = 'Champions'; }
        else if (b && inIt && b.places[me]) { status = over || b.champion ? 'done' : 'out'; detail = `Finished top ${b.places[me] <= 2 ? 2 : b.places[me] <= 4 ? 4 : b.places[me] <= 8 ? 8 : 16}${b.champion ? ` · ${nameOf(b.champion)} won it` : ''}`; }
        else if (b && inIt) { status = 'live'; detail = `${b.teams.length} teams, and you are in it`; }
        else if (b) { status = 'missed'; detail = b.champion ? `${nameOf(b.champion)} won it` : 'Going on without you'; }
        out.push({
            id, name, short, kind: 'intl', status, detail, bracket: b || null, leads: qualify,
            prizes: [['Champions', pay(table, 1)], ['Runners-up', pay(table, 2)], ['Semifinal', pay(table, 3)], ['Quarterfinal', pay(table, 5)], ...(table[9] ? [['Round of 16', pay(table, 9)]] : [])],
        });
    };
    addSplit('winter', 'winter_w1', 'winter_f', 'The champions go to First Stand');
    addIntl('firststand', 'First Stand', 'First Stand', 'fs_qf', 'fs_f', PRIZES.firststand, 'Win the Winter Split');
    addSplit('spring', 'spring_w1', 'spring_f', 'The champions go to MSI');
    // The cup runs inside the spring.
    {
        const R = t && save.cup && save.cup.year === save.time.year ? save.cup.regions[t.region] : null;
        const inIt = !!(R && R.teams.includes(me));
        const mine = R ? R.rounds.flat().filter(x => x.a === me || x.b === me) : [];
        const lost = mine.find(x => x.winner && x.winner !== me);
        let status = 'upcoming', detail = `${CUP_SIZE} clubs of your region, knockout, during the spring`;
        if (R && R.champion === me) { status = 'won'; detail = 'Winners'; }
        else if (R && R.champion) { status = inIt ? 'done' : 'missed'; detail = `${nameOf(R.champion)} won it`; }
        else if (R && !inIt) { status = 'missed'; detail = 'You did not make the draw'; }
        else if (R && lost) { status = 'out'; detail = `Knocked out by ${nameOf(lost.winner)}`; }
        else if (R) { status = 'live'; detail = `Still in it after ${mine.filter(x => x.winner).length} round${mine.filter(x => x.winner).length === 1 ? '' : 's'}`; }
        out.push({ id: 'cup', name: 'Regional Cup', short: 'Cup', kind: 'cup', status, detail, bracket: R, leads: 'Tier 1 and tier 2 together', prizes: [['Winners', pay(PRIZES.cup, 1)], ['Runners-up', pay(PRIZES.cup, 2)]] });
    }
    addIntl('msi', 'Mid-Season Invitational', 'MSI', 'msi_qf', 'msi_f', PRIZES.msi, 'Win the Spring Split');
    addSplit('summer', 'summer_w1', 'summer_f', 'The finalists go to Worlds');
    // Promotion and relegation are read off the year as a whole.
    if (t) {
        const pr = S.promo[t.region];
        const rows = L ? annualRows(L, save) : [];
        const pos = rows.findIndex(r => r.id === me) + 1;
        const n = rows.length;
        let status = 'upcoming', detail = t.tier === 1 ? `You are ${ordinal(pos)} of ${n} over the year` : 'The summer finalists go up';
        if (pr) {
            const up = promoUps(pr).includes(me) || (pr.tie && pr.tie.b === me && pr.tie.winner === me);
            const down = promoDowns(pr).includes(me) || (pr.tie && pr.tie.a === me && pr.tie.winner && pr.tie.winner !== me);
            const inTie = pr.tie && (pr.tie.a === me || pr.tie.b === me) && !pr.tie.winner;
            if (up) { status = 'won'; detail = 'Promoted'; }
            else if (down) { status = 'out'; detail = 'Relegated'; }
            else if (inTie) { status = 'live'; detail = t.tier === 1 ? 'Win this series or go down' : 'Win this series to go up'; }
            else { status = 'done'; detail = t.tier === 1 ? 'Safe for another year' : 'Another year down here'; }
        }
        out.push({ id: 'promotion', name: 'Promotion and Relegation', short: t.tier === 1 ? 'Relegation' : 'Promotion', kind: 'promo', status, detail, bracket: null,
            leads: 'Bottom two go down. Third from bottom plays the third-best of the league below, best of five: win and stay, lose and swap.', prizes: [] });
    }
    addIntl('worlds', 'World Championship', 'Worlds', 'worlds_r16', 'worlds_f', PRIZES.worlds, 'Reach the Summer final, or earn championship points');
    return out;
}

/** The competition the calendar is in right now, if there is a bracket to watch. */
export function liveEvent(save) {
    const step = currentStep(save);
    const road = eventRoad(save);
    const id = step.kind === 'intl' ? step.event : step.kind === 'playoffs' ? step.split : null;
    if (id) return road.find(e => e.id === id && e.bracket) || null;
    // During the spring, the cup while the manager is still in it.
    if (step.split === 'spring' && step.kind === 'league') return road.find(e => e.id === 'cup' && e.status === 'live') || null;
    return null;
}

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
        if (pr && pr.tie && (pr.tie.a === me || pr.tie.b === me)) { sub = pr.tie.a === me ? 'You finished eighth: one best-of-five to stay up.' : 'One best-of-five for a place in the top league.'; tone = 'warn'; }
        else sub = 'Not your fight this year.';
    }
    if (phase === 'offseason') sub = 'The year is over. Contracts, retirements, rookies and the board\'s verdict.';
    return { phase, year: save.time.year, title: def.name, sub, tone, color: def.color, icon: def.icon };
}

export { leagueName, tableRows, annualRows, leagueKey, leagueOf, TALKS, teamName };
