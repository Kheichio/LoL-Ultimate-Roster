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
//  It also validates the PER-SPLIT CHAMPION META, which fails the same way: the
//  meta is DERIVED from (year, split) and never stored, so the only thing making
//  it real is that the derivation is pure. A meta that reshuffled between page
//  loads would change a match the player is halfway through, and nothing in the
//  build, the render pass or the smoke run would say a word about it.
//
//      node tools/championCheck.mjs           validate, exit non-zero on error
//      node tools/championCheck.mjs --list    and print the pool per role
// ===========================================================================

import {
    CHAMPIONS, CHAMPION_BY_ID, ATTR_KEYS, ROLES, championsForRole,
    ARCHETYPE_BIAS, PLAYSTYLES, championsForStyle, biasDistance,
    FIT_MAX, STYLE_POOL_MIN,
    ARCHETYPE_COUNTERS, archetypeMatchup, championMatchup,
    metaFor, metaTierFor, metaLabelFor,
    META_STRONG_FRACTION, META_WEAK_FRACTION, META_STEP_REF,
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

// ------------------------------------------------------------ champion meta
//  The per-split meta is a PURE DERIVATION of (year, split). Nothing about it
//  is written to the save, which is what lets it need no grandfathering -- and
//  which also means the ONLY thing making it real is that the derivation is
//  byte-identical every time it runs. If it ever reshuffled, a champion the
//  player picked as Strong at champion select would silently be Weak by the
//  third game of the series, on the same save, with no way to tell.
//
//  It is built PER ROLE, and a champion legal in two roles takes its tier from
//  the FIRST role it appears in (ROLES declaration order). So per-role band
//  COUNTS legitimately drift away from META_STRONG_FRACTION for later roles --
//  the checks below bound the drift rather than asserting the fraction.
console.log('');
console.log('=== champion meta ==================================================');
console.log('  strong ' + META_STRONG_FRACTION + ' / weak ' + META_WEAK_FRACTION
    + ' of each role pool, step ref ' + META_STEP_REF);

// A wide sample: 100 years x 2 splits. Deliberately more than the 40-entry
// cache so the sweep exercises eviction as a side effect of doing its job.
const META_YEAR_0 = 2020, META_YEARS = 100;
const META_SPLITS = [];
for (let y = META_YEAR_0; y < META_YEAR_0 + META_YEARS; y++) {
    META_SPLITS.push([y, 'spring'], [y, 'summer']);
}

// ---- 6. SYMMETRY -------------------------------------------------------
//  Asserted directly, and first, because every other number in this section
//  is sized against it. The strong band and the weak band are the same size
//  ON PURPOSE: that is what makes the match-engine's meta term symmetric, so
//  a good split pays exactly what a bad one costs and the two cancel across a
//  career. Make the strong band bigger and every match rating in the mode
//  drifts up -- careerSmoke hard-fails a run above a 7.6 mean match rating.
if (META_STRONG_FRACTION !== META_WEAK_FRACTION) {
    err('META_STRONG_FRACTION (' + META_STRONG_FRACTION + ') != META_WEAK_FRACTION ('
        + META_WEAK_FRACTION + ') - the meta term is no longer symmetric, so it is a '
        + 'career-long bonus or penalty rather than something that cancels out. '
        + 'careerSmoke hard-fails a run above a 7.6 mean match rating.');
}

// ---- 1. DETERMINISM / PURITY -------------------------------------------
const metaA = metaFor(2031, 'spring');
const metaB = metaFor(2031, 'spring');
if (metaA !== metaB) {
    err('metaFor(2031, spring) returned two different objects - the memoisation in '
        + '_META_CACHE is not being hit, so every reader re-derives and the cost the '
        + 'cache exists to pay is being paid anyway');
}
if (!Object.isFrozen(metaA) || !Object.isFrozen(metaA.byId)) {
    err('metaFor() result is not frozen - it is memoised and handed to every caller, '
        + 'so one reader writing into it would poison the split for the whole session');
}
const beforeSnap = JSON.stringify(metaA);
try { metaA.byId.ahri = 1; metaA.strong.push('nope'); } catch (e) { /* strict-mode throw is fine */ }
if (JSON.stringify(metaFor(2031, 'spring')) !== beforeSnap) {
    err('the memoised meta was mutated through a caller reference');
}

// Walk far more than META_CACHE_MAX distinct keys to force the wholesale
// clear, then recompute the SAME key from scratch. This is the property the
// whole design rests on: the meta is never stored, so "the same split" and
// "computed again later" have to be the same bytes.
for (const [y, s] of META_SPLITS) metaFor(y, s);
const metaC = metaFor(2031, 'spring');
if (JSON.stringify(metaC) !== beforeSnap) {
    err('metaFor(2031, spring) is NOT byte-identical after the cache was evicted - the '
        + 'meta is derived and never stored, so this reshuffles a match the player is '
        + 'halfway through');
}
if (metaC === metaA) {
    warn('the meta cache never evicted across ' + META_SPLITS.length + ' distinct keys - '
        + 'the recompute check above compared a cached object with itself and proved nothing');
}

// ---- 2. COVERAGE -------------------------------------------------------
const metaIds = Object.keys(metaA.byId);
for (const id of metaIds) {
    if (!CHAMPION_BY_ID[id]) err('meta byId has an entry for "' + id + '", which is not a champion');
    const t = metaA.byId[id];
    if (t !== 1 && t !== 0 && t !== -1) err('meta tier for "' + id + '" is ' + JSON.stringify(t) + ', want 1|0|-1');
}
for (const c of CHAMPIONS) {
    if (!Object.prototype.hasOwnProperty.call(metaA.byId, c.id)) {
        err(c.id + ' ("' + c.name + '") has no meta entry - it is legal to pick and '
            + 'permanently Contested while every champion beside it moves');
    }
}
// strong/weak are derived from byId and must never be able to disagree with it.
{
    const s = new Set(metaA.strong), w = new Set(metaA.weak);
    for (const id of metaIds) {
        const t = metaA.byId[id];
        if ((t === 1) !== s.has(id)) err(id + ': byId says ' + t + ' but strong[] disagrees');
        if ((t === -1) !== w.has(id)) err(id + ': byId says ' + t + ' but weak[] disagrees');
    }
    if (s.size !== metaA.strong.length) err('meta strong[] has duplicates');
    if (w.size !== metaA.weak.length) err('meta weak[] has duplicates');
    for (const id of [...s].filter(x => w.has(x))) err(id + ' is in BOTH the strong and weak bands');
    // metaTierFor is the only reader anything outside constants.js uses. It
    // must agree with the table it is reading.
    for (const id of metaIds) {
        if (metaTierFor(id, 2031, 'spring') !== metaA.byId[id]) {
            err('metaTierFor("' + id + '") disagrees with metaFor().byId');
        }
    }
}
for (const [tier, want] of [[1, 'Strong'], [0, 'Contested'], [-1, 'Weak']]) {
    if (metaLabelFor(tier) !== want) err('metaLabelFor(' + tier + ') = "' + metaLabelFor(tier) + '", want "' + want + '"');
}

// ---- rules, as pure functions so they can be controlled -----------------
/** Per-role band counts for one meta. Counts a champion under EVERY role it is
 *  legal in, which is how a player experiences it: the draft only ever offers
 *  picks from your own role, so a role whose pool is all Contested has no meta
 *  whatever the global totals say. */
function metaBandCounts(meta) {
    const out = [];
    for (const role of ROLES) {
        const pool = championsForRole(role.id);
        let strong = 0, weak = 0;
        for (const c of pool) {
            const t = meta.byId[c.id];
            if (t === 1) strong++; else if (t === -1) weak++;
        }
        out.push({ role: role.id, n: pool.length, strong, weak });
    }
    return out;
}
/** 3. A role with no strong pick is a role where the mechanic does not exist. */
function starvedRoles(counts) {
    return counts.filter(r => r.n && (!r.strong || !r.weak))
        .map(r => r.role + ' (strong ' + r.strong + ', weak ' + r.weak + ')');
}
/** 4. More than half a role in one band is not a meta, it is a re-tuning of
 *  the role. metaFor() clamps to half by construction; this asserts it. */
function runawayRoles(counts) {
    const out = [];
    for (const r of counts) {
        if (!r.n) continue;
        if (r.strong * 2 > r.n) out.push(r.role + ' strong ' + r.strong + '/' + r.n);
        if (r.weak * 2 > r.n) out.push(r.role + ' weak ' + r.weak + '/' + r.n);
    }
    return out;
}
/** 5. Summed over many splits, no champion may be strong (or weak) in a wildly
 *  disproportionate share of them. The expectation is META_STRONG_FRACTION
 *  (0.18); the bound is 0.40, i.e. a bit over TWICE the expected share, which
 *  is far outside anything sampling noise produces over 200 splits and still
 *  unmistakably "this champion is just good". A champion strong 80% of the
 *  time is a permanent buff wearing a meta costume, and the whole point of the
 *  term is that it cancels out across a career. */
const META_BLESSING_MAX = 0.40;
function blessingViolations(shares, bound) {
    const out = [];
    for (const r of shares) {
        if (r.strongShare > bound) out.push(r.id + ' strong in ' + (r.strongShare * 100).toFixed(1) + '% of splits');
        if (r.weakShare > bound) out.push(r.id + ' weak in ' + (r.weakShare * 100).toFixed(1) + '% of splits');
    }
    return out;
}

// ---- 3 + 4 across the wide sample --------------------------------------
let starvedHits = 0, runawayHits = 0;
for (const [y, s] of META_SPLITS) {
    const counts = metaBandCounts(metaFor(y, s));
    for (const bad of starvedRoles(counts)) {
        starvedHits++;
        if (starvedHits <= 3) err(y + ' ' + s + ': ' + bad + ' - no strong (or no weak) pick in the role, '
            + 'so for that role the meta does not exist this split');
    }
    for (const bad of runawayRoles(counts)) {
        runawayHits++;
        if (runawayHits <= 3) err(y + ' ' + s + ': ' + bad + ' - more than half the role in one band');
    }
}
if (starvedHits > 3) err('...and ' + (starvedHits - 3) + ' more starved role-splits');
if (runawayHits > 3) err('...and ' + (runawayHits - 3) + ' more runaway bands');

// ---- 5 across the wide sample ------------------------------------------
const tally = new Map(CHAMPIONS.map(c => [c.id, { id: c.id, s: 0, w: 0 }]));
for (const [y, s] of META_SPLITS) {
    const meta = metaFor(y, s);
    for (const id of meta.strong) { const t = tally.get(id); if (t) t.s++; }
    for (const id of meta.weak) { const t = tally.get(id); if (t) t.w++; }
}
const NS = META_SPLITS.length;
const shares = [...tally.values()].map(t => ({ id: t.id, strongShare: t.s / NS, weakShare: t.w / NS }));
for (const bad of blessingViolations(shares, META_BLESSING_MAX)) {
    err(bad + ' (bound ' + (META_BLESSING_MAX * 100).toFixed(0) + '%, expected '
        + (META_STRONG_FRACTION * 100).toFixed(0) + '%) - that is a permanent buff wearing '
        + 'a meta costume, not a term that cancels out across a career');
}

// ---- 7. ROT ------------------------------------------------------------
//  Champion ids are permanent persisted save data and a save can carry an id
//  this build no longer knows. metaTierFor() must read it as Contested rather
//  than break a match.
const ROT_IDS = [
    ['undefined', undefined], ['null', null], ['empty string', ''], ['number 0', 0],
    ['unknown id', 'notachampion'], ['object', {}], ['array', []], ['NaN', NaN],
    ['false', false], ['bare number', 4], ['prototype key', 'constructor'],
];
for (const [label, v] of ROT_IDS) {
    let got;
    try { got = metaTierFor(v, 2030, 'spring'); }
    catch (e) { err('metaTierFor(' + label + ') threw: ' + e.message); continue; }
    if (got !== 0) err('metaTierFor(' + label + ') = ' + JSON.stringify(got) + ', want 0');
}
// A VALID id with a rotted year/split is a different case and asserting 0 here
// would be asserting a bug: metaFor() coerces the year to 0 and anything that
// is not 'summer' to spring, so the lookup lands on a real, deterministic meta
// and the champion gets a real tier. The contract is "never throws, always a
// legal tier", not "always contested".
const ROT_WHEN = [
    ['NaN / "winter"', NaN, 'winter'], ['undefined / null', undefined, null],
    ['{} / []', {}, []], ['Infinity / 7', Infinity, 7],
    ['"2030" / "SUMMER"', '2030', 'SUMMER'],
];
for (const [label, y, s] of ROT_WHEN) {
    let got;
    try { got = metaTierFor('ahri', y, s); }
    catch (e) { err('metaTierFor(ahri, ' + label + ') threw: ' + e.message); continue; }
    if (got !== 1 && got !== 0 && got !== -1) {
        err('metaTierFor(ahri, ' + label + ') = ' + JSON.stringify(got) + ', want 1|0|-1');
    }
    if (String(metaTierFor('ahri', y, s)) !== String(got)) {
        err('metaTierFor(ahri, ' + label + ') is not stable across two calls');
    }
}
try {
    if (typeof metaLabelFor(undefined) !== 'string' || typeof metaLabelFor('x') !== 'string'
        || typeof metaLabelFor(null) !== 'string') err('metaLabelFor() returned a non-string for rot');
} catch (e) { err('metaLabelFor() threw on rot: ' + e.message); }

// ---- 8. CONTROLS -------------------------------------------------------
//  A lint that matches nothing looks exactly like a clean codebase. Each rule
//  above is run once against a shape it MUST accept and once against a shape
//  it MUST reject, so a rule that has quietly stopped testing anything fails
//  here instead of passing everywhere.
{
    const real = metaFor(2031, 'spring');
    const realCounts = metaBandCounts(real);

    // positive controls -- the real meta must satisfy every rule
    if (starvedRoles(realCounts).length) err('control: starvedRoles() rejects the real meta');
    if (runawayRoles(realCounts).length) err('control: runawayRoles() rejects the real meta');
    if (blessingViolations(shares, META_BLESSING_MAX).length) err('control: blessingViolations() rejects the real spread');

    // negative control: a meta where TOP has no strong pick at all
    const topIds = championsForRole('TOP').map(c => c.id);
    const noStrongTop = { byId: Object.assign({}, real.byId) };
    for (const id of topIds) if (noStrongTop.byId[id] === 1) noStrongTop.byId[id] = 0;
    const starvedCtl = starvedRoles(metaBandCounts(noStrongTop));
    if (!starvedCtl.some(x => x.startsWith('TOP'))) {
        err('control: starvedRoles() did NOT fire on a meta with zero strong TOP picks - '
            + 'rule 3 is inert and would never catch a starved role');
    }

    // negative control: a meta where every TOP champion is strong
    const allStrongTop = { byId: Object.assign({}, real.byId) };
    for (const id of topIds) allStrongTop.byId[id] = 1;
    const runawayCtl = runawayRoles(metaBandCounts(allStrongTop));
    if (!runawayCtl.some(x => x.startsWith('TOP strong'))) {
        err('control: runawayRoles() did NOT fire on a meta with every TOP champion strong - '
            + 'rule 4 is inert');
    }

    // negative control: a champion strong in 80% of splits
    const blessed = shares.map(r => (r.id === 'ahri' ? { id: r.id, strongShare: 0.8, weakShare: 0 } : r));
    if (!blessingViolations(blessed, META_BLESSING_MAX).some(x => x.startsWith('ahri'))) {
        err('control: blessingViolations() did NOT fire on a champion strong 80% of the time - '
            + 'rule 5 is inert and a permanent buff would ship as a meta');
    }
    // ...and must still not fire on a champion sitting exactly at expectation.
    const fair = shares.map(r => (r.id === 'ahri'
        ? { id: r.id, strongShare: META_STRONG_FRACTION, weakShare: META_WEAK_FRACTION } : r));
    if (blessingViolations(fair, META_BLESSING_MAX).some(x => x.startsWith('ahri'))) {
        err('control: blessingViolations() fires at the EXPECTED share - the bound is below '
            + 'the fraction the meta is built to produce, so it can only ever be red');
    }
}

// ---- readout -----------------------------------------------------------
{
    const sampleY = 2031, sampleS = 'spring';
    const counts = metaBandCounts(metaFor(sampleY, sampleS));
    console.log('  sample split ' + sampleY + ' ' + sampleS + ':');
    for (const r of counts) {
        const pctS = r.n ? Math.round((r.strong / r.n) * 100) : 0;
        const pctW = r.n ? Math.round((r.weak / r.n) * 100) : 0;
        console.log('        ' + r.role.padEnd(4) + String(r.n).padStart(3) + ' champions   '
            + metaLabelFor(1).padEnd(6) + String(r.strong).padStart(3) + ' (' + String(pctS).padStart(2) + '%)   '
            + metaLabelFor(-1).padEnd(4) + String(r.weak).padStart(3) + ' (' + String(pctW).padStart(2) + '%)');
    }
    const totS = counts.reduce((a, r) => a + r.strong, 0);
    const totW = counts.reduce((a, r) => a + r.weak, 0);
    console.log('        ' + 'all'.padEnd(4) + String(CHAMPIONS.length).padStart(3) + ' champions   '
        + 'Strong' + String(metaFor(sampleY, sampleS).strong.length).padStart(4)
        + '        Weak' + String(metaFor(sampleY, sampleS).weak.length).padStart(4)
        + '   (per-role sums ' + totS + '/' + totW + ' - dual-role champions counted twice)');

    const sorted = [...shares].sort((a, b) => b.strongShare - a.strongShare);
    const meanS = shares.reduce((a, r) => a + r.strongShare, 0) / shares.length;
    const meanW = shares.reduce((a, r) => a + r.weakShare, 0) / shares.length;
    const hi = sorted[0], lo = sorted[sorted.length - 1];
    const wSorted = [...shares].sort((a, b) => b.weakShare - a.weakShare);
    console.log('  strong share across ' + NS + ' splits (' + META_YEARS + ' years x 2), bound '
        + (META_BLESSING_MAX * 100).toFixed(0) + '%:');
    console.log('        mean strong ' + (meanS * 100).toFixed(1) + '%   mean weak ' + (meanW * 100).toFixed(1)
        + '%   (fraction ' + (META_STRONG_FRACTION * 100).toFixed(0) + '%)');
    console.log('        most strong  ' + hi.id.padEnd(12) + (hi.strongShare * 100).toFixed(1) + '%');
    console.log('        least strong ' + lo.id.padEnd(12) + (lo.strongShare * 100).toFixed(1) + '%');
    console.log('        most weak    ' + wSorted[0].id.padEnd(12) + (wSorted[0].weakShare * 100).toFixed(1) + '%');
    console.log('        spread ' + ((hi.strongShare - lo.strongShare) * 100).toFixed(1) + ' points');
    if (LIST) {
        console.log('        ' + sampleY + ' ' + sampleS + ' Strong: '
            + metaFor(sampleY, sampleS).strong.map(id => CHAMPION_BY_ID[id].name).sort().join(', '));
        console.log('        ' + sampleY + ' ' + sampleS + ' Weak:   '
            + metaFor(sampleY, sampleS).weak.map(id => CHAMPION_BY_ID[id].name).sort().join(', '));
    }
}

console.log('');
if (errors) {
    console.log('FAILED -- ' + errors + ' error' + (errors === 1 ? '' : 's')
        + (warns ? ', ' + warns + ' warning' + (warns === 1 ? '' : 's') : '') + '.');
    process.exit(1);
}
console.log('All champion checks passed' + (warns ? ' (' + warns + ' warning' + (warns === 1 ? '' : 's') + ')' : '') + '.');
