// node tools/worldCheck.mjs [--seed=N] -- Ultimate Roster's world (src/lib/utils/world.js).
// Real-team leagues for every region, the fictional sets, and the international brackets:
// field size and regions, Master-tier rosters only, no player twice in a field, seeding,
// and a bracket that resolves whether you win every tie or go out in the first round.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, 'public/database.js'), 'utf8'), ctx);
const db = ctx.window.playerDatabase;
globalThis.window = globalThis.window || ctx.window;   // cards.getDB() reads window.playerDatabase

const L = await import(pathToFileURL(join(ROOT, 'src/lib/utils/league.js')).href);
const W = await import(pathToFileURL(join(ROOT, 'src/lib/utils/world.js')).href);

let seed = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7) || 11);
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL ' + m); } };
const ROLES = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
const REGIONS = W.WORLD_REGIONS.map(r => r.id);

// ── worldOf ──
ok(W.worldOf({}).mode === 'fictional' && !W.worldOf({}).chosen, 'a save with no world is the old fictional league');
ok(W.worldOf({ world: { mode: 'real', region: 'LCK' } }).mode === 'real', 'real + region reads as real');
ok(W.worldOf({ world: { mode: 'real', region: 'NOPE' } }).mode === 'fictional', 'real with a bad region falls back to fictional');
ok(W.worldOf({ world: 'junk' }).region === 'LEC', 'a rotten world defaults to LEC');

// ── fictional sets ──
for (const r of REGIONS) {
    const set = W.FICTIONAL_SETS[r];
    ok(Array.isArray(set) && set.length >= L.MATCHDAYS, `${r}: a fictional set big enough for a league`);
    ok(new Set(set).size === set.length, `${r}: fictional names are unique`);
    ok(set.every(n => /^[\x20-\x7e]+$/.test(n)), `${r}: fictional names are ASCII`);
}

// ── real leagues ──
for (const r of REGIONS) {
    const orgs = W.realOrgs(r);
    ok(orgs.length >= L.MATCHDAYS, `${r}: at least ${L.MATCHDAYS} real orgs (${orgs.length})`);
    for (const split of [1, 5, 13]) {
        const teams = W.buildRealTeams(db, split, r, rng);
        ok(teams.length === L.MATCHDAYS, `${r} split ${split}: nine sides`);
        ok(new Set(teams.map(t => t.name)).size === teams.length, `${r} split ${split}: no org twice`);
        ok(teams.every(t => ROLES.every(ro => t.cards[ro])), `${r} split ${split}: every side has a full five`);
        ok(teams.every(t => new Set(ROLES.map(ro => t.cards[ro].name)).size === 5), `${r} split ${split}: no player twice in one five`);
        const lg = L.createLeague(teams);
        ok(lg.teams.slice(1).every(t => t.org && t.region === r), `${r} split ${split}: the league keeps each side's org and region`);
        if (split === 1) {
            const avg = teams.reduce((s, t) => s + t.avgRating, 0) / teams.length;
            ok(avg < 90, `${r} split 1: a first split is beatable (mean side ${avg.toFixed(1)})`);
            console.log(`  ${r} split 1: ${teams.map(t => `${t.name} ${t.avgRating}`).join(', ')}`);
        }
    }
}

// ── fictional league through buildSeasonTeams ──
{
    const t0 = W.buildSeasonTeams(db, 1, W.worldOf({}), rng);
    ok(t0.length === L.MATCHDAYS, 'unchosen world: the original fictional league');
    const t1 = W.buildSeasonTeams(db, 1, { mode: 'fictional', region: 'LPL', chosen: true }, rng);
    ok(t1.every(t => W.FICTIONAL_SETS.LPL.includes(t.name)), 'a chosen fictional region names the league from its set');
}

// ── international brackets ──
for (const mode of ['real', 'fictional']) {
    for (const home of REGIONS) {
        for (const event of ['firststand', 'msi', 'worlds']) {
            const world = { mode, region: home, chosen: true };
            const lg = L.createLeague(W.buildSeasonTeams(db, 3, world, rng));
            const homeList = W.homeQualifiers(lg, null, 3);
            const b = W.buildIntlBracket(db, event, world, { name: 'Me', logo: 'x', power: 100 }, homeList, rng);
            const cfg = W.INTL_FIELD[event];
            const tag = `${mode} ${home} ${event}`;
            ok(b && b.teams.length === cfg.size, `${tag}: field of ${cfg.size}`);
            for (const r of REGIONS) {
                const n = b.teams.filter(t => t.region === r).length;
                ok(n === cfg.slots[r], `${tag}: ${r} has ${cfg.slots[r]} entrant(s) (got ${n})`);
            }
            const cpu = b.teams.filter(t => t.id !== L.ME);
            const cards = cpu.flatMap(t => ROLES.map(ro => t.cards[ro]).filter(Boolean));
            ok(cards.length === cpu.length * 5, `${tag}: every international side has a full five`);
            ok(cards.every(c => c.rating >= W.MASTER_MIN), `${tag}: no player under Master tier`);
            ok(new Set(cards.map(c => c.name)).size === cards.length, `${tag}: no player twice in the field`);
            ok(new Set(b.teams.map(t => t.name)).size === b.teams.length, `${tag}: no team twice in the field`);
            ok(b.rounds[0].ties.length === cfg.size / 2, `${tag}: a full first round`);
            ok(b.rounds[0].ties.flatMap(t => [t.a, t.b]).length === new Set(b.rounds[0].ties.flatMap(t => [t.a, t.b])).size, `${tag}: everyone appears once in round one`);

            // Win every tie...
            let x = b, guard = 0;
            while (W.intlMyTie(x) && guard++ < 6) {
                const need = W.intlWinsNeeded(x);
                x = W.intlRecord(x, need, 0, 100, rng);
            }
            ok(x.champion === L.ME, `${tag}: winning every tie makes you champion`);
            ok(x.rounds.length === b.roundsTotal, `${tag}: ${b.roundsTotal} rounds played`);
            ok(x.rounds[x.rounds.length - 1].bo === 5, `${tag}: the final is best of five`);
            // ...or lose the first one.
            const y = W.intlRecord(b, 0, 2, 100, rng);
            ok(y.out === 0 && !!y.champion && y.champion !== L.ME, `${tag}: a first-round exit still crowns a champion`);
            ok(y.rounds.every(r => r.ties.every(t => t.sa !== null)), `${tag}: every tie is played out after an exit`);
        }
    }
}

// ── scaling to your Power: real leagues and international brackets ──
{
    const count = (list, tag) => list.filter(t => t.tag === tag).length;
    for (const r of REGIONS) {
        for (const [p, hard, boss] of [[85, 0, 0], [95, 2, 0], [105, 4, 1], [115, 5, 2]]) {
            const teams = W.buildRealTeams(db, 1, r, rng, L.MATCHDAYS, p);
            ok(teams.length === L.MATCHDAYS && teams.every(t => ROLES.every(ro => t.cards[ro])), `${r} at ${p} Power: nine full real fives`);
            ok(count(teams, 'HARD') >= hard && count(teams, 'BOSS') >= boss, `${r} at ${p} Power: at least ${hard} HARD and ${boss} BOSS (got ${count(teams, 'HARD')}/${count(teams, 'BOSS')})`);
            ok(!teams[0].tag, `${r} at ${p} Power: matchday 1 is an ordinary side`);
            if (p === 85) ok(count(teams, 'HARD') === 0 && count(teams, 'BOSS') === 0, `${r} at 85 Power, split 1: unchanged, no HARD or BOSS`);
        }
    }
    for (const event of ['firststand', 'msi', 'worlds']) {
        const world = { mode: 'real', region: 'LCK', chosen: true };
        const at = (p) => W.buildIntlBracket(db, event, world, { name: 'Me', logo: 'x', power: p }, [], rng);
        const b85 = at(85), b95 = at(95), b105 = at(105), b115 = at(115);
        const cpu = (b) => b.teams.filter(t => t.id !== L.ME);
        ok(cpu(b85).every(t => !t.tag), `${event} at 85 Power: no tags (unchanged)`);
        ok(count(cpu(b95), 'HARD') >= 2 && count(cpu(b95), 'BOSS') === 0, `${event} at 95 Power: a few HARD sides, no BOSS`);
        ok(count(cpu(b105), 'BOSS') >= 1 && count(cpu(b105), 'HARD') >= 3, `${event} at 105 Power: more HARD sides and a BOSS`);
        ok(count(cpu(b115), 'BOSS') >= 2 && count(cpu(b115), 'HARD') + count(cpu(b115), 'BOSS') > cpu(b115).length / 2, `${event} at 115 Power: mostly HARD and BOSS sides`);
        ok(cpu(b115).filter(t => t.tag === 'BOSS').every(t => t.avgRating >= 115), `${event} at 115 Power: every BOSS plays at 115+`);
        ok(cpu(b115).filter(t => t.tag === 'HARD').every(t => t.avgRating >= 106), `${event} at 115 Power: every HARD side plays at 106+`);
        ok([b95, b105, b115].every(b => b.teams.length === W.INTL_FIELD[event].size && b.rounds[0].ties.length === W.INTL_FIELD[event].size / 2), `${event}: a scaled field is still a full bracket`);
        // Seeded by power, so the BOSS sides sit at the top of the draw: you meet them late.
        const seeds = cpu(b115).filter(t => t.tag === 'BOSS').map(t => t.seed);
        ok(seeds.every(s => s <= count(cpu(b115), 'BOSS') + 1), `${event} at 115 Power: BOSS sides are the top seeds (${seeds.join(', ')})`);
    }
}

// ── team names spelled out (the Home favourite-team dropdown) ──
ok(W.teamFullName('HLE') === 'Hanwha Life', 'a current org abbreviation is spelled out');
ok(W.teamFullName('ROX') === null, 'a historical name is left alone');
ok(W.teamFullName('T1') === null, 'a name that already is the org name gets no suffix');
ok(W.teamFullName('__proto__') === null && W.teamFullName(undefined) === null, 'junk reads as no name');
{
    const dbTeams = new Set(db.map(c => c.team));
    const named = [...dbTeams].filter(t => W.teamFullName(t));
    ok(named.length >= 30, `most current orgs in the card database get a full name (${named.length})`);
}

// ── a rotten qualifier list out of a save ──
{
    const world = { mode: 'real', region: 'LEC', chosen: true };
    const junk = [null, 'G2', { name: 5 }, { name: '  ' }, { name: 'Valid Side', accent: 'red;background:url(x)', org: { evil: 1 } }, { name: '__proto__', org: '__proto__' }];
    let b = null, threw = false;
    try { b = W.buildIntlBracket(db, 'msi', world, { name: 'Me', logo: 'x', power: 100 }, junk, rng); } catch (e) { threw = true; }
    ok(!threw && b && b.teams.length === W.INTL_FIELD.msi.size, 'a rotten home list still draws a full field');
    const v = b && b.teams.find(t => t.name === 'Valid Side');
    ok(!v || v.accent === null, 'a home accent that is not a hex colour is dropped');
    ok(!v || v.org === null, 'a home org that is not a string is dropped');
    ok(W.buildIntlBracket(db, 'msi', world, { name: 'Me', logo: 'x', power: 100 }, undefined, rng)?.teams.length === W.INTL_FIELD.msi.size, 'no home list at all (a pre-world save) still draws a full field');
}

console.log(`\n${checks - fails}/${checks} world checks passed${fails ? `, ${fails} FAILED` : ''}.`);
process.exit(fails ? 1 : 0);
