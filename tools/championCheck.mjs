// ===========================================================================
//  championCheck.mjs -- validates the career-mode signature champion list
// ===========================================================================
//  CHAMPIONS in src/lib/career/constants.js is plain data with three silent
//  failure modes, none of which crashes anything:
//
//    1. An archetype outside match.js's ARCHETYPE_BIAS table looks up to
//       undefined, so that champion's comfort-pick bonus quietly never fires
//       and the pick is strictly worse than its neighbours forever.
//    2. A mods key outside ATTR_KEYS is applied to an attribute that does not
//       exist, so the shim silently does nothing.
//    3. A renamed or removed id orphans every save that picked it -- career
//       saves store player.champion as a bare id string.
//
//  None of that shows up in a build, a render pass or a smoke run. It shows up
//  as a career that is mysteriously worse than another one. Hence this file.
//
//      node tools/championCheck.mjs           validate, exit non-zero on error
//      node tools/championCheck.mjs --list    and print the pool per role
// ===========================================================================

import { CHAMPIONS, CHAMPION_BY_ID, ATTR_KEYS, ROLES, championsForRole } from '../src/lib/career/constants.js';
import fs from 'node:fs';

const LIST = process.argv.includes('--list');

// The archetype table lives in match.js as a module-private const, so it is
// read out of the source rather than imported. If that table is ever renamed
// this check fails loudly instead of silently passing everything.
function archetypesFromMatch() {
    const src = fs.readFileSync(new URL('../src/lib/career/match.js', import.meta.url), 'utf8');
    const block = src.match(/const ARCHETYPE_BIAS = \{([\s\S]*?)\n\};/);
    if (!block) {
        console.error('FATAL: could not find ARCHETYPE_BIAS in src/lib/career/match.js');
        process.exit(2);
    }
    const keys = [];
    for (const m of block[1].matchAll(/^\s*(?:'([^']+)'|([A-Za-z ]+?))\s*:\s*\{/gm)) {
        keys.push((m[1] || m[2]).trim());
    }
    return keys;
}

const ARCHETYPES = archetypesFromMatch();
const ROLE_IDS = ROLES.map(r => r.id);

// Every id that has ever shipped. A career save stores player.champion as a
// bare string, so removing or renaming one of these orphans real saves --
// stores/career.js does CHAMPION_BY_ID[cfg.championId] || null and the player
// silently loses their signature pick and its comfort bonus.
const SHIPPED_IDS = [
    'aatrox', 'camille', 'darius', 'fiora', 'gnar', 'jax', 'ksante', 'malphite', 'ornn',
    'renekton', 'riven', 'sett', 'gwen', 'rumble',
    'leesin', 'viego', 'jarvan', 'sejuani', 'nidalee', 'vi', 'xinzhao', 'graves', 'maokai',
    'kindred', 'elise', 'wukong',
    'ahri', 'azir', 'orianna', 'sylas', 'yasuo', 'leblanc', 'syndra', 'viktor', 'zed',
    'corki', 'taliyah', 'akali',
    'jinx', 'kaisa', 'aphelios', 'ezreal', 'caitlyn', 'xayah', 'varus', 'lucian', 'zeri',
    'ashe', 'draven', 'jhin',
    'thresh', 'nautilus', 'lulu', 'nami', 'rakan', 'leona', 'renata', 'bard', 'karma',
    'braum', 'pyke', 'milio',
];

let errors = 0, warns = 0;
function err(msg) { errors++; console.log('  ERROR  ' + msg); }
function warn(msg) { warns++; console.log('  warn   ' + msg); }

console.log('');
console.log('=== champion list ==================================================');
console.log('  ' + CHAMPIONS.length + ' champions, ' + ARCHETYPES.length + ' archetypes in ARCHETYPE_BIAS');

// ---------------------------------------------------------------- per entry
const ids = new Set();
const names = new Map();
for (const c of CHAMPIONS) {
    const tag = c && c.id ? c.id : JSON.stringify(c);

    if (!c || typeof c !== 'object') { err('not an object: ' + tag); continue; }

    if (typeof c.id !== 'string' || !/^[a-z0-9]+$/.test(c.id)) {
        err(tag + ': id must match /^[a-z0-9]+$/');
    }
    if (ids.has(c.id)) err(tag + ': duplicate id');
    ids.add(c.id);

    if (typeof c.name !== 'string' || !c.name.trim()) err(tag + ': missing name');
    else {
        const norm = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (names.has(norm)) err(tag + ': same champion as "' + names.get(norm) + '" (' + c.name + ')');
        else names.set(norm, c.id);
    }

    if (!Array.isArray(c.roles) || !c.roles.length) err(tag + ': roles must be a non-empty array');
    else {
        for (const r of c.roles) if (!ROLE_IDS.includes(r)) err(tag + ': unknown role "' + r + '"');
        if (new Set(c.roles).size !== c.roles.length) err(tag + ': duplicate role');
    }

    // The one that fails silently in production.
    if (!ARCHETYPES.includes(c.archetype)) {
        err(tag + ': archetype "' + c.archetype + '" is not in match.js ARCHETYPE_BIAS '
            + '- the comfort-pick bonus would never fire');
    }

    if (!c.mods || typeof c.mods !== 'object') { err(tag + ': missing mods'); continue; }
    const keys = Object.keys(c.mods);
    if (keys.length < 2 || keys.length > 3) err(tag + ': mods must have 2 or 3 keys, has ' + keys.length);

    let pos = 0, neg = 0, peak = 0;
    for (const k of keys) {
        if (!ATTR_KEYS.includes(k)) { err(tag + ': unknown mod key "' + k + '"'); continue; }
        const v = c.mods[k];
        if (!Number.isInteger(v) || v === 0) { err(tag + ': mod ' + k + ' must be a non-zero integer'); continue; }
        if (v > 5 || v < -4) err(tag + ': mod ' + k + ' = ' + v + ' out of range [-4, +5]');
        if (v > 0) { pos += v; if (v > peak) peak = v; } else neg += v;
    }
    if (pos < 5 || pos > 8) err(tag + ': positives sum ' + pos + ', want 5..8');
    if (neg > -1 || neg < -4) err(tag + ': negatives sum ' + neg + ', want -1..-4');
    const net = pos + neg;
    if (net < 1 || net > 5) err(tag + ': net ' + net + ', want +1..+5');
    if (peak >= 5 && neg > -2) err(tag + ': peak +5 needs negatives of at least -2, has ' + neg);
}

// ------------------------------------------------------------ save safety
for (const id of SHIPPED_IDS) {
    if (!CHAMPION_BY_ID[id]) {
        err('shipped id "' + id + '" is gone - every save that picked it loses its signature champion');
    }
}

// ------------------------------------------------------------ role coverage
console.log('');
console.log('=== pool per role ==================================================');
for (const role of ROLES) {
    const pool = championsForRole(role.id);
    const arch = new Set(pool.map(c => c.archetype));
    console.log('  ' + role.id.padEnd(4) + ' ' + String(pool.length).padStart(3) + ' champions, '
        + arch.size + ' archetypes');
    if (pool.length < 20) err(role.id + ': only ' + pool.length + ' champions - too thin to pick from');
    if (arch.size < 4) warn(role.id + ': only ' + arch.size + ' archetypes represented');
    if (LIST) {
        for (const g of [...arch].sort()) {
            console.log('        ' + g + ': ' + pool.filter(c => c.archetype === g).map(c => c.name).join(', '));
        }
    }
}

// Every archetype in the bias table should be reachable, or the table has dead
// rows and some option biases can never be comforted by anything.
const used = new Set(CHAMPIONS.map(c => c.archetype));
for (const a of ARCHETYPES) if (!used.has(a)) warn('archetype "' + a + '" is in ARCHETYPE_BIAS but no champion uses it');

// ------------------------------------------------------------ balance spread
console.log('');
console.log('=== balance spread =================================================');
const nets = CHAMPIONS.map(c => Object.values(c.mods).reduce((a, b) => a + b, 0));
const hist = {};
for (const n of nets) hist[n] = (hist[n] || 0) + 1;
console.log('  net shim: ' + Object.keys(hist).sort((a, b) => a - b)
    .map(k => '+' + k + ' x' + hist[k]).join('  '));
const byAttr = {};
for (const c of CHAMPIONS) for (const [k, v] of Object.entries(c.mods)) {
    byAttr[k] = byAttr[k] || { plus: 0, minus: 0 };
    if (v > 0) byAttr[k].plus++; else byAttr[k].minus++;
}
console.log('  attribute use (champions granting / costing):');
for (const k of ATTR_KEYS) {
    const b = byAttr[k] || { plus: 0, minus: 0 };
    console.log('        ' + k + '  +' + String(b.plus).padStart(3) + '   -' + String(b.minus).padStart(3));
    if (b.plus === 0) warn('no champion grants ' + k);
}

// --------------------------------------------------- comfort-bonus fairness
//  match.js pays a comfort bonus of COMFORT_BONUS * max(0, 1 - 2*biasDistance)
//  on every in-game decision whose bias is close to your archetype's. With 171
//  champions it is worth knowing whether one archetype sits much closer to the
//  average decision than the rest - that would make a whole class of signature
//  picks quietly stronger than every other pick in the game, for reasons no
//  player could ever see. Measured against the real matchEvents option biases.
console.log('');
console.log('=== comfort-bonus reach by archetype ===============================');

const evSrc = fs.readFileSync(new URL('../src/lib/career/matchEvents.js', import.meta.url), 'utf8');
// Options are written as `bias: bias(0.30, 0.25, 0.40)` -- a helper call,
// not an object literal.
const biases = [];
for (const m of evSrc.matchAll(/bias:\s*bias\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)/g)) {
    biases.push({ aggression: Number(m[1]), risk: Number(m[2]), teamplay: Number(m[3]) });
}

if (!biases.length) {
    warn('no option biases parsed out of matchEvents.js - skipping fairness check');
} else {
    const biasSrc = fs.readFileSync(new URL('../src/lib/career/match.js', import.meta.url), 'utf8');
    const tbl = {};
    const blk = biasSrc.match(/const ARCHETYPE_BIAS = \{([\s\S]*?)\n\};/)[1];
    for (const m of blk.matchAll(/^\s*(?:'([^']+)'|([A-Za-z ]+?))\s*:\s*\{([^}]*)\}/gm)) {
        const name = (m[1] || m[2]).trim();
        const b = {};
        for (const kv of m[3].matchAll(/(aggression|risk|teamplay)\s*:\s*([0-9.]+)/g)) b[kv[1]] = Number(kv[2]);
        tbl[name] = b;
    }
    const dist = (a, b) => (Math.abs(a.aggression - b.aggression) + Math.abs(a.risk - b.risk)
        + Math.abs(a.teamplay - b.teamplay)) / 3;

    const rows = [];
    for (const [name, ab] of Object.entries(tbl)) {
        let sum = 0;
        for (const ob of biases) sum += Math.max(0, 1 - 2 * dist(ab, ob));
        const mean = sum / biases.length;
        const n = CHAMPIONS.filter(c => c.archetype === name).length;
        rows.push({ name, mean, n });
    }
    rows.sort((a, b) => b.mean - a.mean);
    console.log('  (mean comfort across ' + biases.length + ' real decision options, 0-1)');
    for (const r of rows) {
        console.log('        ' + r.name.padEnd(12) + r.mean.toFixed(3)
            + '   ' + String(r.n).padStart(3) + ' champions');
    }
    const best = rows[0], worst = rows[rows.length - 1];
    const spread = best.mean - worst.mean;
    console.log('  spread: ' + spread.toFixed(3) + ' (' + best.name + ' over ' + worst.name + ')');
    // COMFORT_BONUS is 0.06, so the spread in actual win-chance terms is
    // spread * 0.06. Anything past ~0.5 here means a 3-point swing on every
    // decision in the game purely from which archetype you picked.
    if (spread > 0.55) {
        err('archetype comfort spread ' + spread.toFixed(3) + ' is too wide - "' + best.name
            + '" picks are systematically stronger than "' + worst.name + '" ones');
    } else if (spread > 0.42) {
        warn('archetype comfort spread ' + spread.toFixed(3) + ' is getting wide ('
            + best.name + ' vs ' + worst.name + ')');
    }
}

console.log('');
if (errors) {
    console.log('FAILED -- ' + errors + ' error' + (errors === 1 ? '' : 's')
        + (warns ? ', ' + warns + ' warning' + (warns === 1 ? '' : 's') : '') + '.');
    process.exit(1);
}
console.log('All champion checks passed' + (warns ? ' (' + warns + ' warning' + (warns === 1 ? '' : 's') + ')' : '') + '.');
