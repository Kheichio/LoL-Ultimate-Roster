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

import {
    CHAMPIONS, CHAMPION_BY_ID, ATTR_KEYS, ROLES, championsForRole,
    ARCHETYPE_BIAS, PLAYSTYLES, championsForStyle, biasDistance,
    FIT_MAX, STYLE_POOL_MIN,
    ARCHETYPE_COUNTERS, archetypeMatchup, championMatchup,
} from '../src/lib/career/constants.js';
import fs from 'node:fs';

const LIST = process.argv.includes('--list');

// ARCHETYPE_BIAS used to be a module-private const in match.js and was read out
// of the source by regex. It now lives in constants.js because championsForStyle
// reads it too, so it can simply be imported -- which also removes a formatting
// dependency that would have failed this file loudly for no real reason.
const ARCHETYPES = Object.keys(ARCHETYPE_BIAS);
const ROLE_IDS = ROLES.map(r => r.id);

/** COMFORT_BONUS still lives in match.js. Read rather than remembered: the
 *  comment here previously claimed 0.06 long after it had been doubled, which
 *  made the fairness thresholds below twice as permissive as they read. */
function comfortBonusFromMatch() {
    const src = fs.readFileSync(new URL('../src/lib/career/match.js', import.meta.url), 'utf8');
    const m = src.match(/const COMFORT_BONUS = ([0-9.]+)/);
    return m ? Number(m[1]) : null;
}
const COMFORT_BONUS = comfortBonusFromMatch();

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
        err(tag + ': archetype "' + c.archetype + '" is not in ARCHETYPE_BIAS '
            + '- the comfort-pick bonus would never fire, and championsForStyle() '
            + 'would never rank it as fitting any playstyle');
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

// --------------------------------------------------------- playstyle pools
//  A signature champion has to fit the chosen playstyle. That constraint is
//  derived (playstyle bias vs archetype bias), not authored, so a change to
//  either table can silently starve one of the twenty playstyles -- and a
//  playstyle with two legal champions is not a choice, it is a lookup answer.
//  The thin cases are structural rather than accidental: the jungle simply does
//  not contain many archetypes a Farming Jungler wants, which is why
//  championsForStyle() tops a pool up to STYLE_POOL_MIN by nearest fit.
console.log('');
console.log('=== champion pool per playstyle ====================================');
console.log('  (fit <= ' + FIT_MAX + ', topped up to ' + STYLE_POOL_MIN + ')');
for (const role of ROLES) {
    const styles = PLAYSTYLES[role.id] || [];
    if (!styles.length) { err(role.id + ': no playstyles defined'); continue; }
    const roleTotal = championsForRole(role.id).length;
    for (const s of styles) {
        const pool = championsForStyle(role.id, s.id);
        const arch = new Set(pool.map(c => c.archetype));
        const share = roleTotal ? Math.round((pool.length / roleTotal) * 100) : 0;
        console.log('  ' + role.id.padEnd(4) + ' ' + s.id.padEnd(15)
            + String(pool.length).padStart(3) + '/' + String(roleTotal).padStart(3)
            + ' champions  ' + String(share).padStart(3) + '%  '
            + arch.size + ' archetypes');

        if (pool.length < STYLE_POOL_MIN) {
            err(role.id + '/' + s.id + ': only ' + pool.length + ' legal champions - '
                + 'championsForStyle() should have topped this up to ' + STYLE_POOL_MIN);
        }
        if (arch.size < 2) {
            warn(role.id + '/' + s.id + ': every legal champion is a "' + [...arch][0]
                + '" - the pick has no real variety');
        }
        // A "constraint" that leaves 95% of the role available is not one, and
        // it makes the playstyle choice meaningless at champion select.
        if (roleTotal >= 20 && share > 95) {
            warn(role.id + '/' + s.id + ': ' + share + '% of the role is legal - barely a constraint');
        }
        if (LIST) {
            for (const g of [...arch].sort()) {
                console.log('        ' + g + ': ' + pool.filter(c => c.archetype === g).map(c => c.name).join(', '));
            }
        }
    }
}

// Every champion must be reachable by at least one playstyle in EVERY role it
// lists, or it is data nobody can ever pick in that role. championsForStyle()
// guarantees this by construction; this asserts the guarantee still holds.
for (const role of ROLES) {
    const reachable = new Set();
    for (const s of (PLAYSTYLES[role.id] || [])) {
        for (const c of championsForStyle(role.id, s.id)) reachable.add(c.id);
    }
    for (const c of championsForRole(role.id)) {
        if (!reachable.has(c.id)) {
            err(c.id + ' ("' + c.name + '", ' + c.archetype + ') fits no ' + role.id
                + ' playstyle - it can never be picked in that role');
        }
    }
}

// A playstyle's blurb names the champions it is ABOUT. Those champions must be
// legal for it, or the game is describing a pick it will not let you make. This
// is the check that caught the Frontline Tank being unable to pick Ornn or Sion
// while its own blurb read "Ornn, K'Sante, Sion".
//
// Warning rather than error because the blurbs are prose, not a spec: sup_roam
// names Pyke, whose archetype is Assassin, and mechanically Pyke really is
// closer to a lane-bully support than to a vision roamer. That one is a known,
// accepted mismatch -- anything NEW showing up here is drift.
const normName = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const CHAMP_BY_NORM = new Map(CHAMPIONS.map(c => [normName(c.name), c]));
for (const role of ROLES) {
    for (const s of (PLAYSTYLES[role.id] || [])) {
        const legal = new Set(championsForStyle(role.id, s.id).map(c => c.id));
        // The blurbs open with a comma list of champion names, then a full stop.
        const named = String(s.blurb || '').split('.')[0].split(',')
            .map(x => CHAMP_BY_NORM.get(normName(x)))
            .filter(c => c && c.roles.includes(role.id));
        for (const c of named) {
            if (!legal.has(c.id)) {
                warn(role.id + '/' + s.id + ': blurb names ' + c.name + ' (' + c.archetype
                    + ') but the fit rule rejects it');
            }
        }
    }
}

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

// ----------------------------------------------------------- matchup table
//  ARCHETYPE_COUNTERS is authored one direction only and the losing side is
//  generated from it, so the matrix cannot contradict itself by construction -
//  UNLESS a pair is listed in both directions, which silently overwrites one of
//  them and leaves a counter that only works one way.
console.log('');
console.log('=== matchup table ==================================================');
for (const [winner, losers] of Object.entries(ARCHETYPE_COUNTERS)) {
    if (!ARCHETYPE_BIAS[winner]) err('ARCHETYPE_COUNTERS has a row for "' + winner + '", which is not an archetype');
    for (const [loser, weight] of Object.entries(losers)) {
        if (!ARCHETYPE_BIAS[loser]) {
            err(winner + ' beats "' + loser + '", which is not an archetype');
        }
        if (winner === loser) err(winner + ' is listed as beating itself');
        if (weight !== 1 && weight !== 2) err(winner + ' vs ' + loser + ': weight ' + weight + ' must be 1 or 2');
        const reverse = ARCHETYPE_COUNTERS[loser];
        if (reverse && reverse[winner] != null) {
            err('contradiction: ' + winner + ' beats ' + loser + ' AND ' + loser + ' beats ' + winner
                + ' - the table is authored one direction only');
        }
    }
}

// An archetype that beats everything, or loses to everything, is not a
// matchup - it is a tier list.
const rows = [];
for (const a of Object.keys(ARCHETYPE_BIAS)) {
    let good = 0, bad = 0, net = 0;
    for (const b of Object.keys(ARCHETYPE_BIAS)) {
        if (a === b) continue;
        const v = archetypeMatchup(a, b);
        if (v > 0) good++; else if (v < 0) bad++;
        net += v;
    }
    rows.push({ a, good, bad, net });
}
rows.sort((x, y) => y.net - x.net);
for (const r of rows) {
    console.log('  ' + r.a.padEnd(12) + 'beats ' + String(r.good).padStart(2)
        + '   loses to ' + String(r.bad).padStart(2) + '   net ' + (r.net >= 0 ? '+' : '') + r.net);
    if (r.good && !r.bad) err(r.a + ' beats ' + r.good + ' archetypes and loses to none - that is a tier list, not a matchup');
    if (r.bad && !r.good) err(r.a + ' loses to ' + r.bad + ' archetypes and beats none - nobody would ever pick it');
    if (!r.good && !r.bad) warn(r.a + ' has no matchups at all - it is always even');
}
const spread = rows[0].net - rows[rows.length - 1].net;
console.log('  net spread ' + spread + ' (' + rows[0].a + ' over ' + rows[rows.length - 1].a + ')');
if (spread > 14) {
    err('matchup net spread ' + spread + ' is too wide - the best archetype is favoured in far more '
        + 'lanes than the worst, so champion select answers itself');
}

// The table has to survive real champion pools: within one role, a player must
// always be able to find something that is not losing.
for (const role of ROLES) {
    const pool = championsForRole(role.id);
    let worst = null;
    for (const theirs of pool) {
        const best = Math.max.apply(null, pool.map(mine => championMatchup(mine, theirs)));
        if (worst === null || best < worst.best) worst = { theirs, best };
    }
    if (worst && worst.best < 0.5) {
        err(role.id + ': against ' + worst.theirs.name + ' the best available answer is only '
            + worst.best.toFixed(2) + ' - there is no counter-pick in the role');
    }
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
    const dist = biasDistance;

    const rows = [];
    for (const [name, ab] of Object.entries(ARCHETYPE_BIAS)) {
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
    if (COMFORT_BONUS == null) {
        warn('could not read COMFORT_BONUS out of match.js - the swing figure below is unverified');
    } else {
        console.log('  worth ' + (spread * COMFORT_BONUS * 100).toFixed(1)
            + ' percentage points of success chance per decision (COMFORT_BONUS '
            + COMFORT_BONUS + ')');
    }
    // The spread in actual win-chance terms is spread * COMFORT_BONUS. Anything
    // past ~0.5 here means a swing on every decision in the game purely from
    // which archetype you picked.
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
