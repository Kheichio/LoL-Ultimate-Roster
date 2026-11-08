// Checks for the big manager update. Run from the project root.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const ROOT = process.cwd();
class MemStorage { constructor() { this.m = new Map(); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; } setItem(k, v) { this.m.set(String(k), String(v)); } removeItem(k) { this.m.delete(String(k)); } clear() { this.m.clear(); } }
const win = { localStorage: new MemStorage(), sessionStorage: new MemStorage() };
win.window = win; win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.window = win; globalThis.localStorage = win.localStorage; globalThis.sessionStorage = win.sessionStorage;
globalThis.document = { createElement: () => ({ style: {} }), addEventListener() {}, querySelector: () => null, documentElement: { style: {} }, body: { style: {} } };
new Function('window', fs.readFileSync(path.join(ROOT, 'public', 'database.js'), 'utf8'))(win);
const load = (rel) => import(pathToFileURL(path.join(ROOT, 'src', rel)).href);
const U = await load('lib/manager/util.js');
Math.random = U.mulberry32(4242);
const CARDS = await load('lib/utils/cards.js');
const D = await load('lib/manager/data.js');
const PE = await load('lib/manager/people.js');
const MK = await load('lib/manager/market.js');
const M = await load('lib/manager/match.js');
const SE = await load('lib/manager/season.js');
const E = await load('lib/manager/engine.js');
const A = await load('lib/manager/academy.js');
const O = await load('lib/manager/owner.js');
const J = await load('lib/manager/jobs.js');
const H = await load('lib/manager/history.js');
const ST = await load('lib/stores/manager.js');
const PACK = await load('lib/utils/pack.js');
const db = CARDS.getDB();
E.setDB(db);
let fails = 0;
const check = (n, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ' -- ' + info}`); if (!ok) fails++; };
const section = (t) => console.log('\n=== ' + t);

const fresh = (year, tag, seed = 11) => {
    const w = E.previewWorld(db, year, seed);
    const t0 = Object.values(w.teams).find(t => t.region === 'LCK' && t.tier === 1 && t.short === tag) || Object.values(w.teams).find(t => t.region === 'LCK' && t.tier === 1);
    return E.finalizeSave(w, { name: 'T', teamId: t0.id, startYear: year, seed });
};
const invariants = (s) => {
    const bad = [];
    for (const t of Object.values(s.teams)) for (const id of t.roster) if (s.players[id]?.team !== t.id) bad.push(`roster ${t.short} ${id}`);
    for (const p of Object.values(s.players)) {
        if (p.team && !s.teams[p.team]) bad.push(`ghost team ${p.id} ${p.team}`);
        if (!p.team && !s.freeAgents.includes(p.id)) bad.push(`lost ${p.id}`);
    }
    return bad;
};
/** Keep the save moving: answer everything, keep contracts, keep a five. */
function tick(s) {
    for (const m of s.inbox) if (m.options && !m.answered) { const r = E.answerEvent(s, m.id, m.options[0].id); if (!r.ok) E.answerEvent(s, m.id, m.options[m.options.length - 1].id); }
    const me = E.myTeam(s);
    if (me) {
        for (const p of E.undecidedContracts(s)) p.until = s.time.year + 2;
        E.autoLineup(s);
        const lu = M.lineupOf(me, s.players);
        for (const r of D.ROLE_IDS) if (!lu[r]) {
            const fa = s.freeAgents.map(id => s.players[id]).filter(p => p && p.role === r && (p.reg || p.nat) === me.region).sort((a, b) => PE.ovrOf(b) - PE.ovrOf(a))[0];
            if (fa) { s.finance.balance = Math.max(s.finance.balance, 2e6); MK.signFreeAgent(s, fa.id, 1); }
        }
        E.autoLineup(s);
    }
    return E.advance(s, null);
}
function playYear(s) {
    const y = s.time.year;
    let n = 0;
    while (s.time.year === y && n++ < 90) {
        const before = s.time.step;
        tick(s);
        if (s.jobless) { const v = J.vacancies(s)[0]; const id = (s.jobOffers || [])[0] || (v && v.teamId); if (!(s.jobOffers || []).includes(id)) s.jobOffers = [...(s.jobOffers || []), id]; E.acceptJob(s, id); }
        if (s.time.step === before && s.time.year === y) { const b = E.blockInfo(s); if (b) { console.log('STUCK', b.msg); break; } }
    }
    return n;
}

section('a calendar year');
{
    check('53 steps', D.STEPS_PER_YEAR === 53, D.STEPS_PER_YEAR);
    const s = fresh(2020, 'T1');
    check('13 clubs in every league', D.REGION_IDS.every(r => [1, 2].every(tr => s.season.leagues[r + ':' + tr].teams.length === 13)));
    check('winter has 7 weeks', s.season.leagues['LCK:1'].winter.fixtures.length === 7);
    check('spring has 13 weeks', s.season.leagues['LCK:1'].spring.fixtures.length === 13);
    const names = Object.values(s.teams).map(t => t.name);
    check('no two clubs share a name', new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i).join(','));
    const tags = Object.values(s.teams).map(t => t.short);
    console.log('  duplicate tags:', [...new Set(tags.filter((n, i) => tags.indexOf(n) !== i))].join(',') || 'none');
    const road0 = E.eventRoad(s);
    check('the road lists every competition', ['winter', 'firststand', 'spring', 'cup', 'msi', 'summer', 'promotion', 'worlds'].every(id => road0.some(e => e.id === id)), road0.map(e => e.id).join(','));
    check('prizes are real money', road0.filter(e => e.prizes.length).every(e => e.prizes.every(([, v]) => v > 0)), JSON.stringify(road0.map(e => e.prizes)));
    const bank0 = O.bankOf(s);
    playYear(s);
    check('a year completes', s.time.year === 2021, s.time.year);
    check('invariants hold', !invariants(s).length, invariants(s).slice(0, 4).join('; '));
    const h = s.history[s.history.length - 1];
    check('First Stand was won', !!h.firststand, JSON.stringify(Object.keys(h)));
    check('Worlds was won', !!h.worlds);
    check('winter titles on record', Object.keys(h.champs).some(k => k.endsWith(':winter')));
    check('a salary was paid', O.bankOf(s) > bank0, `${bank0} -> ${O.bankOf(s)}`);
    console.log('  salary', O.salaryOf(s), 'bank', O.bankOf(s));
    const someone = Object.values(s.players).find(p => p.car && p.car.g > 20 && p.team !== s.manager.teamId);
    check('an NPC player has his year on record', someone && someone.cy.some(r => r[0] === 2020 && r[3] > 0), JSON.stringify(someone && someone.cy));
    check('career totals grow', someone && someone.car.k >= 0 && someone.car.rs > 0, JSON.stringify(someone && someone.car));
    const npc = Object.values(s.teams).find(t => t.id !== s.manager.teamId && t.tier === 1 && t.real);
    const rec = H.clubRecord(s, npc.id);
    check('an NPC club has a full player record', rec.size >= 5 && [...rec.values()].some(e => e.g > 0), rec.size);
    const clubH = H.clubHistory(s, db, npc);
    check('its history shows games', clubH.players.some(e => e.g > 0));
    const best = H.allTimeBest(s, db, { limit: 5 });
    check('the all-time list works', best.length === 5, best.length);
    console.log('  all-time:', best.map(b => `${b.n} ${b.score} (${b.worlds}W ${b.msi}M, peak ${b.peak})`).join(' | '));
    check('players have a pro year', Object.values(s.players).filter(p => p.team && !p.aca).every(p => p.pro), Object.values(s.players).filter(p => p.team && !p.pro).length);
    check('AI clubs have invested', Object.values(s.teams).some(t => (t.fac && t.fac.training) || t.acaLevel), 'no facilities anywhere');
    const packed = PACK.pack(JSON.stringify(s));
    check('round-trips through the store', ST.hydrate(JSON.parse(PACK.unpack(packed))) !== null);
}

section('an old save');
{
    // Preseason: redrawn on the new format.
    const a = fresh(2020, 'T1');
    a.time.step = 0; delete a.calV;
    for (const r of D.REGION_IDS) for (const tier of [1, 2]) {
        const list = Object.values(a.teams).filter(t => t.region === r && t.tier === tier && t.id !== a.manager.teamId).slice(0, tier === 1 ? 3 : 5);
        for (const t of list) { for (const id of t.roster) { a.players[id].team = null; a.freeAgents.push(id); } delete a.teams[t.id]; }
    }
    const h = ST.hydrate(JSON.parse(JSON.stringify(a)));
    check('preseason save loads', !!h);
    check('it expands to 13', Object.values(h.teams).filter(t => t.region === 'LCK' && t.tier === 1).length === 13);
    check('its season has a winter', h.season.leagues['LCK:1'].winter.fixtures.length === 7);
    check('it is marked migrated', h.calV === D.CALENDAR_VERSION);
    check('invariants hold', !invariants(h).length, invariants(h).slice(0, 4).join('; '));

    // Mid-spring, ten-club leagues, nine weeks, no winter: the shape of a real old save.
    const b = fresh(2020, 'T1');
    for (const r of D.REGION_IDS) for (const tier of [1, 2]) {
        const list = Object.values(b.teams).filter(t => t.region === r && t.tier === tier && t.id !== b.manager.teamId).slice(0, tier === 1 ? 3 : 5);
        for (const t of list) { for (const id of t.roster) { b.players[id].team = null; b.freeAgents.push(id); } delete b.teams[t.id]; }
    }
    SE.newSeason(b);
    for (const L of Object.values(b.season.leagues)) {
        delete L.winter;
        for (const sp of ['spring', 'summer']) L[sp].fixtures = L[sp].fixtures.slice(0, 9);
    }
    delete b.season.firststand; delete b.calV;
    delete b.manager.bank; delete b.manager.bankLog; delete b.manager.stakes;
    for (const t of Object.values(b.teams)) { delete t.fac; delete t.acaLevel; delete t.grown; delete t.academy; }
    for (const p of Object.values(b.players)) { delete p.pro; p.xp = Math.min(p.xp, 299); }
    b.time.step = 5;      // spring_w5 of the old 33
    const c = ST.hydrate(JSON.parse(JSON.stringify(b)));
    check('old step finds its id', D.CALENDAR[c.time.step].id === 'spring_w5', D.CALENDAR[c.time.step].id);
    check('bank is set up', c.manager.bank === D.MANAGER_START_BANK, c.manager.bank);
    check('every club has been seeded', Object.values(c.teams).every(t => t.grown));
    const n = playYear(c);
    check('the old season plays out', c.time.year === 2021, `${c.time.year} in ${n} steps`);
    check('invariants hold after', !invariants(c).length, invariants(c).slice(0, 4).join('; '));
    check('the next year is the new format', Object.values(c.season.leagues).every(L => L.teams.length === 13 && L.winter), Object.values(c.season.leagues).map(L => L.teams.length).join(','));

    // Every old step lands somewhere valid.
    let okAll = true;
    for (let i = 0; i < 33; i++) { const x = { calV: 0, time: { step: i, year: 2020 } }; const id = D.OLD_CALENDAR[i]; if (D.STEP_INDEX[id] === undefined) okAll = false; }
    check('every old step exists on the new calendar', okAll);
}

section('the manager\'s money');
{
    const s = fresh(2020, 'T1');
    const t0 = E.myTeam(s);
    s.manager.bank = 20e6;
    const dep = O.depositToClub(s, 1e6);
    check('a deposit moves money', dep.ok && s.manager.bank === 19e6, dep.msg);
    check('a hired manager cannot withdraw', !O.withdrawFromClub(s, 1000).ok);
    check('a hired manager cannot set his pay', !O.setOwnerSalary(s, 5000).ok);
    // Buy in, then leave: the stake keeps paying.
    const buy = E.buyStake(s, 25);
    check('buying a stake takes bank money', buy.ok && s.manager.bank < 19e6, buy.msg);
    E.buyStake(s, 25); E.buyStake(s, 25);
    check('own 75%', MK.ownerStake(s) === 75, MK.ownerStake(s));
    const r = E.resignJob(s);
    check('resigning works', r.ok && s.jobless && !s.manager.teamId, r.msg);
    check('the stake stays his', s.manager.stakes[t0.id] === 75, JSON.stringify(s.manager.stakes));
    check('openings exist', J.vacancies(s).length >= 4, J.vacancies(s).length);
    check('holdings list it', O.holdings(s).length === 1 && O.holdings(s)[0].value > 0);
    // Apply elsewhere.
    const v = J.vacancies(s)[0];
    const ap = J.applyForJob(s, v.teamId, () => 0);
    check('applying can succeed', ap.ok && ap.offered, ap.msg);
    check('cannot apply twice', !J.applyForJob(s, v.teamId).ok);
    const acc = E.acceptJob(s, v.teamId);
    check('take the job', acc.ok && s.manager.teamId === v.teamId, acc.msg);
    const bank1 = O.bankOf(s);
    playYear(s);
    check('dividends arrive in the inbox', s.inbox.some(m => m.title === 'Dividends'), 'no dividend message');
    check('bank grew', O.bankOf(s) > bank1);
    // Go back.
    const back = E.returnToClub(s, t0.id);
    check('a majority holder can walk back in', back.ok && s.manager.teamId === t0.id, back.msg);
    check('the stake works again', MK.ownerStake(s) === 75 && !s.manager.stakes[t0.id], MK.ownerStake(s));
    check('the academy exists at the new club', A.academyLevel(E.myTeam(s)) >= 1);
}

section('founding a club at any time');
{
    const s = fresh(2020, 'T1');
    for (let i = 0; i < 12; i++) tick(s);
    const step = D.CALENDAR[s.time.step].id;
    const poor = E.foundNewClub(s, { name: 'Nope FC', short: 'NOPE', region: 'LEC', tier: 2 });
    check('you need the money', !poor.ok, poor.msg);
    s.manager.bank = O.foundCost(s, 2) + 1000;
    const clash = E.foundNewClub(s, { name: 'x', short: 'X', region: 'LEC', tier: 2 });
    check('a bad name is refused', !clash.ok, clash.msg);
    const taken = Object.values(s.teams).find(t => t.region === 'LCK').short;
    check('a taken tag is refused', !E.foundNewClub(s, { name: 'Some Club', short: taken, region: 'LEC', tier: 2 }).ok);
    const r = E.foundNewClub(s, { name: 'Rising Sun', short: 'RSN', region: 'LEC', tier: 2, color: '#ff0000', emblem: 'star' });
    check(`founded at ${step}`, r.ok, r.msg);
    const me = E.myTeam(s);
    check('it is yours', me.name === 'Rising Sun' && MK.ownerStake(s) === 100 && MK.soleOwner(s), `${me.name} ${MK.ownerStake(s)}`);
    check('no board objectives', s.board.objectives.length === 0);
    check('it keeps its fixtures', !!E.userFixture(s) || D.CALENDAR[s.time.step].kind !== 'league' || s.season.leagues['LEC:2'].teams.includes(me.id));
    check('the bank paid', O.bankOf(s) === 1000, O.bankOf(s));
    check('invariants hold', !invariants(s).length, invariants(s).slice(0, 4).join('; '));
    check('owner can set pay', O.setOwnerSalary(s, 50000).ok && O.salaryOf(s) === 50000, O.salaryOf(s));
    s.finance.balance = 5e6;
    check('owner can take money out', O.withdrawFromClub(s, 100000).ok);
    const rb = O.rebrandClub(s, { name: 'Golden Sun', short: 'GSN', color: '#ffcc00', emblem: 'crown' });
    check('a sole owner can rebrand', rb.ok && me.name === 'Golden Sun' && me.names.length >= 1, rb.msg);
    const y = s.time.year;
    playYear(s); playYear(s);
    check('it plays on', s.time.year === y + 2, s.time.year);
    check('invariants hold after', !invariants(s).length, invariants(s).slice(0, 4).join('; '));
    // Hired: no rebrand.
    const h = fresh(2020, 'T1');
    check('a hired manager cannot rebrand', !O.rebrandClub(h, { name: 'Nope', short: 'NOP' }).ok);
}

section('imports, languages, recruitment');
{
    const s = fresh(2023, 'T1');
    const me = E.myTeam(s);
    const foreigners = Object.values(s.players).filter(p => PE.isImport(p, me.region) && !p.team);
    const pool = foreigners.length >= 3 ? foreigners : Object.values(s.players).filter(p => PE.isImport(p, me.region));
    check('there are foreign players', pool.length >= 3, pool.length);
    check('Koreans are local in the LCK', Object.values(s.players).filter(p => p.flag === '🇰🇷' && p.real).every(p => !PE.isImport(p, 'LCK')));
    const lpl = Object.values(s.players).find(p => p.real && p.flag === '🇰🇷' && p.team && s.teams[p.team].region === 'LPL');
    check('a Korean in the LPL is an import', !lpl || PE.isImport(lpl, 'LPL'), lpl && lpl.name);
    // Fill the import slots with fakes.
    const mine = me.roster.map(id => s.players[id]).slice(0, 2);
    for (const p of mine) { p.nat = 'LEC'; p.flag = null; p.real = false; }
    check('two imports counted', MK.importCount(s, me) >= 2, MK.importCount(s, me));
    const third = pool.find(p => !me.roster.includes(p.id) && MK.roleCount(s, me, p.role) < D.ROLE_MAX);
    const why = MK.signingCheck(s, third, { fee: 0, wage: 0 });
    check('a third import is refused', /import/i.test(why), why);
    third.natz = [me.region];
    check('a naturalised player is not an import', !PE.isImport(third, me.region));
    // Residency.
    const p = Object.values(s.players).find(x => x.team && PE.isImport(x, s.teams[x.team].region));
    if (p) { p.res = { r: s.teams[p.team].region, y: 4 }; }
    // Language.
    me.lang = null;
    s.finance.balance = 5e6;
    const cost0 = E.languageCourseCost(s);
    for (const id of me.roster) s.players[id].lang = { ko: 100 };
    const r0 = E.setTeamLanguage(s, 'en');
    check('the language can change', r0.ok && D.teamLanguage(me) === 'en', r0.msg);
    check('only once a year', !E.setTeamLanguage(s, 'zh').ok);
    const dear = E.languageCourseCost(s);
    for (const id of me.roster) s.players[id].lang = { en: 100 };
    const cheap = E.languageCourseCost(s);
    check('a course is cheaper when they already speak it', cheap < dear, `${cheap} vs ${dear} (${cost0})`);
    // Recruitment.
    const rec = MK.recommendations(s);
    check('recommendations cover every role', rec.length === 5);
    console.log('  recs:', rec.map(r => `${r.role}:${r.options.length}`).join(' '));
    const trip = E.runScoutingTrip(s, 'LEC', 'MID');
    check('a trip finds the role asked for', trip.ok && trip.found.every(p => p.role === 'MID'), trip.msg);
    check('reports are on the desk', A.scoutReports(s).length >= 2);
    const rep = A.scoutReports(s)[0];
    const sign = A.signProspect(s, rep.id);
    check('a report signs into the academy', sign.ok && rep.aca && E.myTeam(s).academy.includes(rep.id) && rep.team === me.id, sign.msg);
    check('he is no longer a free agent', !s.freeAgents.includes(rep.id));
    const other = A.scoutReports(s)[0];
    check('passing leaves him on the market', A.passProspect(s, other.id).ok && !other.prospectFor && s.freeAgents.includes(other.id));
    check('shortlist toggles', MK.toggleShortlist(s, other.id).ok && s.shortlist.includes(other.id) && MK.toggleShortlist(s, other.id).ok && !s.shortlist.includes(other.id));
}

section('personalities and styles');
{
    const s = fresh(2023, 'T1');
    check('22+ personalities', D.PERSONALITIES.length >= 22, D.PERSONALITIES.length);
    const ids = new Set(D.PERSONALITIES.map(p => p.id));
    check('combos use real personalities', D.PERSONALITY_COMBOS.every(c => ids.has(c.a) && ids.has(c.b)));
    const styleIds = new Set(Object.values(D.PLAYSTYLES).flat().map(x => x.id));
    check('style combos use real styles', D.PLAYSTYLE_COMBOS.every(c => Object.values(c.need).flat().every(x => styleIds.has(x))));
    const counts = {};
    for (const p of Object.values(s.players)) { const st = PE.playStyleOf(p).id; counts[st] = (counts[st] || 0) + 1; }
    console.log('  styles:', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
    check('every style turns up', styleIds.size === Object.keys(counts).length, [...styleIds].filter(x => !counts[x]).join(','));
    const edges = Object.values(s.teams).filter(t => t.tier === 1).map(t => PE.lineupEdge(M.lineupOf(t, s.players), t.tactic));
    console.log('  lineup edge: min', Math.min(...edges).toFixed(2), 'mean', (edges.reduce((a, b) => a + b, 0) / edges.length).toFixed(2), 'max', Math.max(...edges).toFixed(2));
    check('a lineup edge stays sane', Math.max(...edges) < 2.5 && Math.min(...edges) > -1.5);
}

section('ten years from 2013');
{
    const t0 = Date.now();
    const s = fresh(2013, 'SKT', 77);
    const line = () => {
        const mean = (tier) => { const v = Object.values(s.teams).filter(t => t.tier === tier).map(t => M.teamStrength(t, s.players)); return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1); };
        const rnd = Object.values(s.players).filter(p => !p.real);
        const r80 = rnd.filter(p => PE.ovrOf(p) >= 80).length;
        const fa = s.freeAgents.map(id => s.players[id]).filter(Boolean);
        const faMean = fa.length ? (fa.reduce((a, p) => a + PE.ovrOf(p), 0) / fa.length).toFixed(1) : 0;
        const fac = Object.values(s.teams).reduce((a, t) => a + ((t.fac || {}).training || 0), 0) / Object.keys(s.teams).length;
        console.log(`  ${s.time.year}: t1 ${mean(1)} t2 ${mean(2)} | players ${Object.keys(s.players).length} random>=80 ${r80} | FA ${fa.length} mean ${faMean} | training lvl ${fac.toFixed(2)} | bank ${Math.round(O.bankOf(s) / 1000)}K club ${Math.round(s.finance.balance / 1000)}K | ${E.myTeam(s) ? E.myTeam(s).name : 'jobless'}`);
    };
    for (let y = 0; y < 10; y++) { playYear(s); line(); }
    const bad = invariants(s);
    check('invariants after a decade', !bad.length, bad.slice(0, 4).join('; '));
    const lck = Object.values(s.teams).filter(t => t.region === 'LCK' && t.real).map(t => t.short);
    console.log('  LCK orgs:', lck.join(' '));
    check('SKT became T1', lck.includes('T1') || E.myTeam(s).short === 'SKT', lck.join(' '));
    const renamed = Object.values(s.teams).filter(t => (t.names || []).length).map(t => `${t.names[0].name} -> ${t.name}`);
    console.log('  renames:', renamed.join(', '));
    const json = JSON.stringify(s);
    const packed = PACK.pack(json);
    console.log(`  save ${Math.round(json.length / 1024)}kb JSON, ${Math.round(packed.length / 1024)}k packed, retired ${Object.keys(s.retired || {}).length}, ${Math.round((Date.now() - t0) / 1000)}s`);
    check('three slots of a decade fit', packed.length * 3 < 4.5 * 1024 * 1024, packed.length);
    const best = H.allTimeBest(s, db, { limit: 5 });
    console.log('  all-time:', best.map(b => `${b.n} ${b.score} (${b.worlds}W ${b.msi}M ${b.firststand}F ${b.league}L, ${b.g}g peak ${b.peak})`).join(' | '));
    const styles = {};
    for (const t of Object.values(s.teams)) { const k = MK.clubStyle(t).id; styles[k] = (styles[k] || 0) + 1; }
    console.log('  club styles:', JSON.stringify(styles));
    console.log('  academies:', Object.values(s.teams).filter(t => t.acaLevel).length, 'of', Object.keys(s.teams).length);
}
console.log(fails ? `\nFAILED ${fails}` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
