// ===========================================================================
//  managerRender.mjs -- renders every Ultimate Manager screen in every state
// ===========================================================================
//  managerSmoke proves the engine; this proves the templates. Each screen and
//  modal is SSR-rendered (through Vite, the project's real Svelte pipeline)
//  against saves driven to the moments that matter: a brand-new save, the
//  middle of a split, the playoffs, MSI and Worlds, the offseason report, a
//  sacked manager with no club, a tier-2 club, and a deliberately damaged save.
//  A crash fails the run; `undefined`, `NaN` or `[object Object]` in visible
//  text is reported as wrong.
//
//      node tools/managerRender.mjs [--verbose] [--dump]
//  --dump writes every render to tools/.render-dump-manager/ (delete it after).
// ===========================================================================
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const DUMP = process.argv.includes('--dump');

// ---- browser shim ------------------------------------------------------------
class MemStorage {
    constructor() { this.m = new Map(); }
    get length() { return this.m.size; }
    key(i) { return [...this.m.keys()][i] ?? null; }
    getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
    setItem(k, v) { this.m.set(String(k), String(v)); }
    removeItem(k) { this.m.delete(String(k)); }
    clear() { this.m.clear(); }
}
class FakeAudioContext { constructor() { this.currentTime = 0; this.destination = {}; } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; } resume() {} }
const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, getAttribute() { return null; }, appendChild(c) { return c; }, removeChild() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
const storage = new MemStorage();
const win = { localStorage: storage, sessionStorage: new MemStorage(), AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext };
Object.assign(win, {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    scrollTo() {}, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0), cancelAnimationFrame: (id) => clearTimeout(id),
    navigator: { userAgent: 'managerRender', language: 'en' }, location: { href: 'http://localhost/', hash: '', search: '' },
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, setTimeout, clearTimeout, setInterval, clearInterval,
});
win.self = win; win.window = win;
const doc = { documentElement: el(), body: el(), head: el(), activeElement: null, createElement: el, createElementNS: el, createTextNode: (t) => ({ nodeValue: String(t) }), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, cookie: '' };
win.document = doc;
globalThis.localStorage = storage;
globalThis.sessionStorage = win.sessionStorage;
globalThis.window = win;
globalThis.document = doc;
if (!globalThis.navigator) globalThis.navigator = win.navigator;
globalThis.matchMedia = win.matchMedia;
globalThis.AudioContext = FakeAudioContext;
globalThis.requestAnimationFrame = win.requestAnimationFrame;
globalThis.cancelAnimationFrame = win.cancelAnimationFrame;

new Function('window', 'document', 'localStorage', fs.readFileSync(path.join(ROOT, 'public', 'database.js'), 'utf8'))(win, doc, storage);
if (!Array.isArray(win.playerDatabase) || win.playerDatabase.length < 1000) { console.error('FATAL: card database did not load'); process.exit(2); }

// ---- vite SSR ------------------------------------------------------------------
const { createServer } = await import('vite');
const server = await createServer({
    root: ROOT, configFile: path.join(ROOT, 'vite.config.js'),
    server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true },
});
const cache = new Map();
const load = async (rel) => { if (!cache.has(rel)) cache.set(rel, await server.ssrLoadModule(rel)); return cache.get(rel); };

const U = await load('/src/lib/manager/util.js');
Math.random = U.mulberry32(4242);
const ST = await load('/src/lib/stores/manager.js');
const E = await load('/src/lib/manager/engine.js');
const D = await load('/src/lib/manager/data.js');
const M = await load('/src/lib/manager/match.js');
const MK = await load('/src/lib/manager/market.js');
const DIR = '/src/lib/components/manager/';

// ---- render + inspect ------------------------------------------------------------
let renders = 0, crashes = 0;
const problems = [];
const visible = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&\w+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const BAD = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /-?Infinity/];

async function render(name, props, state, minText = 60) {
    renders++;
    let html = '';
    try {
        const mod = await load(DIR + name + '.svelte');
        html = mod.default.render(props || {}).html;
    } catch (e) {
        crashes++;
        problems.push(`CRASH  ${name} [${state}]: ${e && e.message}\n         ${String(e && e.stack || '').split('\n').slice(1, 4).join('\n         ')}`);
        return '';
    }
    if (DUMP) {
        const dir = path.join(ROOT, 'tools', '.render-dump-manager');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}__${state}`.replace(/[^\w.-]+/g, '_') + '.html'), html, 'utf8');
    }
    const text = visible(html);
    for (const re of BAD) {
        const m = re.exec(text);
        if (m) problems.push(`WRONG  ${name} [${state}]: "${m[0]}" in visible text: ...${text.slice(Math.max(0, m.index - 70), m.index + 50)}...`);
    }
    const attrs = [...html.matchAll(/\s(?:style|class|title)="([^"]*)"/g)].map(x => x[1]).join(' | ');
    if (/undefined|NaN/.test(attrs)) problems.push(`WRONG  ${name} [${state}]: undefined/NaN inside an attribute: ${attrs.match(/.{0,50}(undefined|NaN).{0,30}/)[0]}`);
    if (text.length < minText) problems.push(`EMPTY  ${name} [${state}]: only ${text.length} chars of text`);
    if (VERBOSE) console.log(`  ok  ${name} [${state}] ${html.length}b`);
    return html;
}

const SCREENS = ['Home', 'Squad', 'Tactics', 'Training', 'League', 'Transfers', 'History', 'Club', 'Inbox', 'Trophies'];
function setSave(save) {
    ST.manager.set(save);
    ST.mgrModal.set(null);
    ST.mgrMatch.set(null);
}

async function renderState(label, save, extra = {}) {
    setSave(save);
    for (const sc of SCREENS) await render(sc, {}, label);
    for (const tab of ['playoffs', 'msi', 'worlds', 'race', 'history']) await render('League', { initialTab: tab }, label + ':' + tab, 20);
    for (const tab of ['free', 'bids', 'list', 'mine']) await render('Transfers', { initialTab: tab }, label + ':transfers-' + tab, 20);
    // Modals: an own player, a rival's, a free agent and a random player.
    const me = E.myTeam(save);
    const ids = [];
    if (me && me.roster[0]) ids.push([me.roster[0], 'mine']);
    const rival = Object.values(save.teams).find(t => !me || t.id !== me.id);
    if (rival) ids.push([rival.roster[0], 'rival']);
    if (save.freeAgents[0]) ids.push([save.freeAgents[0], 'free']);
    const rnd = Object.values(save.players).find(p => !p.real);
    if (rnd) ids.push([rnd.id, 'random']);
    for (const [id, tag] of ids) await render('PlayerModal', { id }, label + ':player-' + tag);
    if (rival) await render('TeamModal', { id: rival.id }, label + ':team');
    if (rival) await render('History', { initialTeam: rival.id }, label + ':history-rival');
    if (me) await render('TeamModal', { id: me.id }, label + ':myteam');
    // A waiting inbox decision blocks Continue but not the match screen itself.
    const b = E.blockInfo(save);
    if (E.userFixture(save) && (!b || b.go === 'inbox')) {
        ST.mgrMatch.set({ open: true });
        await render('MatchFlow', {}, label + ':prematch', 40);
        // Every later phase of a series, which only clicks reach on the screen.
        for (const ph of extra.phases || ['draft', 'pick', 'drafted', 'live', 'post', 'end']) await render('MatchFlow', { initialPhase: ph, instant: true }, label + ':match-' + ph, 40);
        ST.mgrMatch.set(null);
    }
    if (extra.summary) await render('StepReport', { summary: extra.summary }, label + ':report', 20);
    if (extra.report) await render('OffseasonReport', { report: extra.report, summary: extra.summary || null }, label + ':offseason', 20);
}

// ---- states ------------------------------------------------------------------------
const CARDS = await load('/src/lib/utils/cards.js');
const db = CARDS.getDB();
E.setDB(db);
function makeSave(year, region, tier, idx, seed = 7) {
    const world = E.previewWorld(db, year, seed);
    const teams = Object.values(world.teams).filter(t => t.region === region && t.tier === tier)
        .sort((a, b) => M.teamStrength(b, world.players) - M.teamStrength(a, world.players));
    return E.finalizeSave(world, { name: 'Render', teamId: teams[Math.min(idx, teams.length - 1)].id, startYear: year, seed });
}
function advanceTo(save, stepId, guardMax = 80) {
    let last = null, g = 0;
    while (D.CALENDAR[save.time.step].id !== stepId && g++ < guardMax) {
        if (save.jobless) E.acceptJob(save, save.jobOffers[0]);
        const me = E.myTeam(save);
        if (me) {
            E.autoLineup(save);
            const lu = M.lineupOf(me, save.players);
            const need = D.ROLE_IDS.find(r => !lu[r]);
            if (need) {
                const fa = save.freeAgents.map(id => save.players[id]).filter(p => p.role === need)[0];
                if (fa) MK.signFreeAgent(save, fa.id, 1);
            }
        }
        last = E.advance(save);
    }
    return last;
}

console.log('');
console.log('=========================================================');
console.log('  LoL ULTIMATE MANAGER -- render check');
console.log('=========================================================');

// 0. No save: the shell shows the new-game wizard.
setSave(null);
storage.clear();
await render('ManagerShell', {}, 'no-save');
await render('NewManager', {}, 'wizard');

// 1. Fresh saves for every start year, a contender, a minnow and a tier-2 side.
for (const year of D.START_YEARS.map(s => s.year)) {
    await renderState(`${year}-contender`, makeSave(year, 'LCK', 1, 0));
}
await renderState('2013-minnow-LCS', makeSave(2013, 'LCS', 1, 9));
await renderState('2020-tier2-CBLOL', makeSave(2020, 'CBLOL', 2, 3));

// 2. Through a season, stopping at the moments that matter.
const run = makeSave(2017, 'LCK', 1, 0, 9);
let sum = advanceTo(run, 'spring_w5');
await renderState('mid-spring', run, { summary: sum });
sum = advanceTo(run, 'spring_f');
await renderState('spring-final-week', run, { summary: sum });
sum = advanceTo(run, 'msi_sf');
await renderState('msi', run, { summary: sum });
sum = advanceTo(run, 'promotion');
await renderState('promotion-week', run, { summary: sum });
sum = advanceTo(run, 'worlds_f');
await renderState('worlds', run, { summary: sum });
sum = advanceTo(run, 'offseason');
{
    // The contract deadline: one undecided, one leaving, one listed, one retiring,
    // one on a promise -- and an inbox decision waiting -- all at once.
    const me = E.myTeam(run);
    const ps = me.roster.map(id => run.players[id]);
    ps[0].until = run.time.year; delete ps[0].leaving;
    if (ps[1]) { ps[1].until = run.time.year; ps[1].leaving = run.time.year; }
    if (ps[2]) ps[2].listed = 250000;
    if (ps[3]) { ps[3].retiring = run.time.year; ps[3].until = run.time.year; }
    if (ps[4]) ps[4].status = 'key';
    run.inbox.unshift({ id: 'm9001', y: run.time.year, s: run.time.step, kind: 'event', title: 'A bootcamp in Korea', body: 'A Seoul gaming house has a week free.', event: 'bootcamp', options: [{ id: 'go', label: 'Go', hint: '+XP' }, { id: 'stay', label: 'Stay home', hint: 'Nothing' }], data: { amount: 1000 }, answered: null });
    if (!E.blockInfo(run)) problems.push('FIXTURE  the deadline save was not blocked, so the blocked Home went unrendered');
    await renderState('contract-deadline', run);
    for (const p of ps.slice(0, 5)) await render('PlayerModal', { id: p.id }, 'contract-deadline:player-' + (p.listed ? 'listed' : p.leaving ? 'leaving' : p.retiring ? 'retiring' : p.status ? 'status' : 'expiring'));
    run.inbox = run.inbox.filter(m => m.id !== 'm9001');
}
const off = E.advance(run);
await renderState('after-offseason', run, { report: off.offseason, summary: off });

// Trophies and achievements, which a short harness run rarely earns.
{
    const rich = JSON.parse(JSON.stringify(run));
    const me = E.myTeam(rich);
    const y = rich.time.year - 1;
    rich.manager.trophies.push(
        { year: y, name: `LCK Spring ${y}`, kind: 'league', split: 'spring', teamId: me.id, teamName: me.name },
        { year: y, name: `MSI ${y}`, kind: 'msi', teamId: me.id, teamName: me.name },
        { year: y, name: `LCK Summer ${y}`, kind: 'league', split: 'summer', teamId: me.id, teamName: me.name },
        { year: y, name: `Worlds ${y}`, kind: 'worlds', teamId: me.id, teamName: me.name },
        { year: y - 1, name: 'Promotion to LCK', kind: 'promotion', teamId: me.id, teamName: me.name },
    );
    rich.manager.ach = { golden_road: { n: 1, years: [y], first: y, last: `${y} with ${me.name}` }, first_title: { n: 1, years: [y], first: y }, worlds: { n: 2, years: [y - 3, y], first: y - 3 } };
    rich.manager.perks = { tactician: 3, shotcaller: 2, analyst: 2, drafter: 3, poolmaster: 1, youth: 2, boardroom: 3 };
    rich.manager.points = 3;
    await renderState('trophy-cabinet', ST.hydrate(rich));
}

// The full-screen cards.
for (const card of [
    { kind: 'phase', phase: 'preseason', year: 2018, title: 'Preseason', sub: 'A new season', tone: 'neutral', color: '#22d3ee', icon: 'trade', newYear: true },
    { kind: 'phase', phase: 'worlds', year: 2018, title: 'World Championship', sub: 'You are in', tone: 'good', color: '#facc15', icon: 'crown' },
    { kind: 'phase', phase: 'spring_po', year: 2018, title: 'Spring Playoffs', sub: 'You missed the cut', tone: 'bad', color: '#fbbf24', icon: 'trophy' },
    { kind: 'title', trophy: 'worlds', title: 'World Champions 2018', sub: 'You beat everyone', color: '#facc15' },
    { kind: 'title', trophy: 'league', title: 'LCK Spring 2018 Champions', sub: 'In the final', color: '#fbbf24' },
    { kind: 'achievement', id: 'golden_road', title: 'Golden Road', sub: 'Every title', count: 1, point: true, color: '#a78bfa' },
    { kind: 'achievement', id: 'sweep_final', title: 'Clean Sweep', sub: 'Win a final 3-0', count: 3, point: false, color: '#a78bfa' },
    { kind: 'down', title: 'Relegated', sub: 'Down you go', color: '#f87171' },
]) await render('StageFx', { card }, 'fx-' + card.kind + '-' + (card.phase || card.trophy || card.id || 'x'), 10);

// The wizard past its first step, and a club founded from nothing.
for (const st of ['mode', 'found', 'region', 'team']) await render('NewManager', { initialYear: 2017, initialStage: st }, 'wizard-' + st, 60);
{
    const world = E.previewWorld(db, 2020, 11);
    const fsave = E.finalizeSave(world, { name: 'Founder', startYear: 2020, seed: 11, custom: { name: 'Render Rising', short: 'RR', color: '#a855f7', region: 'LEC', tier: 2 } });
    if (!E.blockInfo(fsave)) problems.push('FIXTURE  the founded club was not blocked by its empty roster');
    await renderState('founded-empty', fsave);
    // Fill the five the way a manager would, then into the split.
    for (const r of D.ROLE_IDS) {
        const fa = fsave.freeAgents.map(id => fsave.players[id]).filter(p => p.role === r && (p.reg || p.nat) === 'LEC')
            .find(p => !MK.signingCheck(fsave, p, { fee: 0, wage: MK.wageAsk(fsave, p, E.myTeam(fsave)) }));
        if (fa) MK.signFreeAgent(fsave, fa.id, 1);
    }
    advanceTo(fsave, 'spring_w2');
    await renderState('founded-playing', fsave);
    // The owner sells a minority, then a majority: an investor board, then one that can sack.
    fsave.finance.balance = Math.max(fsave.finance.balance, 0);
    E.sellStake(fsave, 25);
    if (MK.soleOwner(fsave) || !MK.hasBoard(fsave)) problems.push('FIXTURE  selling a stake did not bring a board');
    await renderState('founded-stake-sold', fsave);
    E.sellStake(fsave, 25); E.sellStake(fsave, 10);
    if (!MK.boardCanSack(fsave)) problems.push('FIXTURE  selling the majority did not let the board sack');
    await renderState('founded-minority', fsave);
    // An owner in debt, with sessions and a bootcamp spent and every training setting moved.
    const debt = ST.hydrate(JSON.parse(JSON.stringify(fsave)));
    E.buyStake(debt, 100);
    debt.finance.balance = 1e8;
    const dme = E.myTeam(debt);
    E.runSession(debt, 'coach', dme.roster[0]);
    E.runSession(debt, 'pool', dme.roster[1]);
    E.runBootcamp(debt, 'korea');
    E.setBenchProgram(debt, 'academy');
    E.setIntensity(debt, dme.roster[0], 'intense');
    E.setIntensity(debt, dme.roster[1], 'light');
    debt.finance.balance = -400000;
    await renderState('founded-owner-debt', debt);
}

// A contender's record book after a whole season: real history, saved history, legends.
{
    setSave(run);
    const me = E.myTeam(run);
    await render('History', {}, 'season-played:history-mine');
    await render('History', { initialTeam: me.id }, 'season-played:history-initial');
    // A player who just re-signed, and one whose contract ends this year.
    const ps = me.roster.map(id => run.players[id]);
    if (ps[0]) { ps[0].until = run.time.year + 2; await render('PlayerModal', { id: ps[0].id }, 'season-played:player-signed'); }
    if (ps[1]) { const u = ps[1].until; ps[1].until = run.time.year; await render('PlayerModal', { id: ps[1].id }, 'season-played:player-expiring'); ps[1].until = u; }
}

// 3. A sacked manager with no club.
const sacked = makeSave(2023, 'LEC', 1, 0, 3);
advanceTo(sacked, 'offseason');
// A tier-1 club cannot win promotion, so both objectives are missed for certain.
sacked.board.confidence = 0;
sacked.board.objectives = [{ id: 'promote', text: 'Win promotion', met: null }, { id: 'promote', text: 'Win promotion again', met: null }];
const offS = E.advance(sacked);
if (!sacked.jobless) problems.push('FIXTURE  the sacked save was not sacked, so the jobless screens went unrendered');
await renderState('jobless', sacked, { report: offS.offseason });
await render('ManagerShell', {}, 'jobless-shell');

// 4. A damaged save: a missing coach, a short roster, a player with no
//    favourites, a negative balance, an unknown tactic and a dangling offer.
const rot = makeSave(2026, 'LPL', 1, 4, 5);
const rt = E.myTeam(rot);
rt.coach = null;
rt.tactic = 'nonsense';
const gone = rt.roster.splice(0, rt.roster.length - 4);   // four left: one seat must sit empty
for (const id of gone) { rot.players[id].team = null; rot.freeAgents.push(id); }
rt.lineup = {};
rot.players[rt.roster[0]].favs = [];
rot.finance.balance = -250000;
rot.offers = [{ id: 'x', pid: 'missing', from: 'nowhere', fee: 1 }];
rot.inbox.unshift({ id: 'm999', y: 2026, s: 0, kind: 'event', title: 'Rotten event', body: 'x', options: [{ id: 'a', label: 'A' }], data: {}, answered: null });
await renderState('rotten', ST.hydrate(JSON.parse(JSON.stringify(rot))));

await server.close();
console.log('');
for (const p of problems) console.log(p);
console.log('');
console.log(`  renders : ${renders}`);
console.log(`  crashes : ${crashes}`);
console.log(`  findings: ${problems.length - crashes}`);
if (crashes) { console.log('FAILED'); process.exit(1); }
console.log('No crashes.');
