// ===========================================================================
//  eventCheck.mjs -- validates the in-match decision pools
// ===========================================================================
//  src/lib/career/matchEvents.js opens with a page of authoring discipline:
//  three or four options and never two or five, a safest option and a greedy
//  one at least 0.12 of difficulty apart, safest averaging 0.29 early / 0.36
//  mid / 0.44 late and never above 0.58, reward and risk on a 2-15 scale.
//
//  Every one of those rules was enforced by a comment. This file enforces them
//  for real, because the failure modes are all silent:
//
//    1. A two-option event is a coin flip wearing a decision's clothes; a
//       five-option one does not fit the MatchDay layout.
//    2. An event whose options sit within 0.12 of each other has no safe play
//       and no greedy play - it is three ways of saying the same bet.
//    3. A safest option above 0.58 means a rookie cannot reliably do ANYTHING
//       in that moment, which reads as the game being broken rather than hard.
//    4. An unknown attr key resolves to undefined and the option is silently
//       scored against 'knw' instead of what it says it needs.
//    5. A duplicated event id makes drawQueue's no-repeat rule leak.
//    6. Skewed option biases quietly re-tune the comfort-pick bonus for every
//       signature champion in the game (see tools/championCheck.mjs).
//
//  It also measures POOL DEPTH against what a Bo5 actually consumes, which is
//  the thing no amount of reading the file will tell you.
//
//      node tools/eventCheck.mjs
//      node tools/eventCheck.mjs --list
// ===========================================================================

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

const EV_PATH = path.join(ROOT, 'src', 'lib', 'career', 'matchEvents.js');
const MATCH_PATH = path.join(ROOT, 'src', 'lib', 'career', 'match.js');

// matchEvents.js is DATA ONLY and imports nothing, so it loads in bare Node.
const EV = await import(pathToFileURL(EV_PATH).href);
const { DECISION_POOLS, allEvents, eventsForRole } = EV;

// The eight trainable attributes, read from constants.js so the two cannot
// drift. constants.js is also import-clean.
const K = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'career', 'constants.js')).href);
const ATTR_KEYS = K.ATTR_KEYS;

// What one game and one Bo5 actually consume, read out of match.js rather than
// remembered -- QUEUE_PLAN is the whole reason pool depth matters.
const matchSrc = fs.readFileSync(MATCH_PATH, 'utf8');
const planMatch = matchSrc.match(/const QUEUE_PLAN = \[([^\]]*)\]/);
const QUEUE_PLAN = planMatch
    ? planMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
    : ['early', 'early', 'mid', 'mid', 'late'];
const BO5_GAMES = 5;

const PHASES = ['early', 'mid', 'late'];
const WHEN_TAGS = ['ahead', 'behind', 'even', 'fed', 'struggling'];

// Straight from the file header.
const SAFEST_TARGET = { early: 0.29, mid: 0.36, late: 0.44 };
const SAFEST_TOLERANCE = 0.07;
const SAFEST_MAX = 0.58;
const MIN_SPREAD = 0.12;
const GREED_AT = 0.65;

let errors = 0, warns = 0;
function err(msg) { errors++; console.log('  ERROR  ' + msg); }
function warn(msg) { warns++; console.log('  warn   ' + msg); }

function need(phase) {
    return QUEUE_PLAN.filter(p => p === phase).length * BO5_GAMES;
}

console.log('');
console.log('=== decision pools =================================================');
const all = allEvents();
console.log('  ' + all.length + ' events across ' + Object.keys(DECISION_POOLS).length + ' roles, '
    + all.reduce((s, e) => s + (e.options ? e.options.length : 0), 0) + ' options');
console.log('  one game draws [' + QUEUE_PLAN.join(', ') + '], so a Bo5 consumes '
    + PHASES.map(p => need(p) + ' ' + p).join(' / '));

// ------------------------------------------------------------------ ASCII
// The file has been corrupted by tooling before; emoji are \u escapes and the
// prose is plain ASCII. A smart quote pasted in from a document is invisible
// in a diff and permanent in a save file's rendered text.
const rawSrc = fs.readFileSync(EV_PATH, 'utf8');
const nonAscii = [];
rawSrc.split('\n').forEach((line, i) => {
    for (const ch of line) {
        if (ch.charCodeAt(0) > 127) { nonAscii.push((i + 1) + ': ' + ch + ' (U+' + ch.codePointAt(0).toString(16) + ')'); break; }
    }
});
if (nonAscii.length) {
    err('matchEvents.js contains ' + nonAscii.length + ' non-ASCII line(s) - write emoji as \\u escapes '
        + 'and use plain quotes: ' + nonAscii.slice(0, 4).join(', '));
}

// -------------------------------------------------------------- per event
const seenIds = new Set();
const seenPrompts = new Map();
const safestBy = { early: [], mid: [], late: [] };
let greedyEvents = 0;
const biasAll = [];

for (const roleKey of Object.keys(DECISION_POOLS)) {
    for (const e of DECISION_POOLS[roleKey]) {
        const tag = roleKey + '/' + (e && e.id ? e.id : JSON.stringify(e));

        if (!e || typeof e !== 'object') { err(tag + ': not an object'); continue; }
        if (typeof e.id !== 'string' || !/^[a-z0-9_]+$/.test(e.id)) err(tag + ': id must match /^[a-z0-9_]+$/');
        if (seenIds.has(e.id)) err(tag + ': duplicate event id - drawQueue de-duplicates by id, so one of these can never be drawn');
        seenIds.add(e.id);

        if (!PHASES.includes(e.phase)) err(tag + ': phase "' + e.phase + '" is not early/mid/late');

        if (typeof e.prompt !== 'string' || e.prompt.trim().length < 30) {
            err(tag + ': prompt is missing or too short to set a scene');
        } else {
            if (e.prompt.length > 260) warn(tag + ': prompt is ' + e.prompt.length + ' chars - MatchDay has to fit it');
            const norm = e.prompt.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
            if (seenPrompts.has(norm)) err(tag + ': same prompt as ' + seenPrompts.get(norm));
            else seenPrompts.set(norm, tag);
        }

        const w = Number(e.weight);
        if (!Number.isFinite(w) || w <= 0) err(tag + ': weight must be a positive number');
        else if (w < 0.5 || w > 1.6) warn(tag + ': weight ' + w + ' is outside the 0.5-1.6 band the pool uses');

        const opts = Array.isArray(e.options) ? e.options : [];
        if (opts.length < 3 || opts.length > 4) {
            err(tag + ': ' + opts.length + ' options - the rule is three or four, never two, never five');
            continue;
        }

        const optIds = new Set();
        const diffs = [];
        let labelsOk = true;
        for (const o of opts) {
            const ot = tag + '.' + (o && o.id ? o.id : '?');
            if (!o || typeof o !== 'object') { err(ot + ': not an object'); labelsOk = false; continue; }
            if (typeof o.id !== 'string' || !o.id) err(ot + ': missing id');
            else if (optIds.has(o.id)) err(ot + ': duplicate option id inside the event');
            optIds.add(o.id);

            if (typeof o.label !== 'string' || o.label.trim().length < 6) err(ot + ': label is missing or too short');
            else if (o.label.length > 96) warn(ot + ': label is ' + o.label.length + ' chars - it has to fit a button');

            if (!Array.isArray(o.attrs) || !o.attrs.length) err(ot + ': attrs must be a non-empty array');
            else for (const a of o.attrs) {
                if (!ATTR_KEYS.includes(a)) {
                    err(ot + ': unknown attr "' + a + '" - the option would silently be scored against something else');
                }
            }

            const d = Number(o.difficulty);
            if (!Number.isFinite(d) || d < 0 || d > 1) err(ot + ': difficulty must be 0..1');
            else diffs.push(d);

            for (const f of ['reward', 'risk']) {
                const v = Number(o[f]);
                if (!Number.isFinite(v) || v < 2 || v > 15) err(ot + ': ' + f + ' ' + o[f] + ' is outside 2..15');
            }

            if (!o.bias || typeof o.bias !== 'object') err(ot + ': missing bias');
            else {
                for (const k of ['aggression', 'risk', 'teamplay']) {
                    const v = Number(o.bias[k]);
                    if (!Number.isFinite(v) || v < 0 || v > 1) err(ot + ': bias.' + k + ' must be 0..1');
                }
                biasAll.push(o.bias);
            }

            if (o.when != null && !WHEN_TAGS.includes(o.when)) {
                err(ot + ': when "' + o.when + '" is not one of ' + WHEN_TAGS.join('/'));
            }
        }

        if (!labelsOk || diffs.length !== opts.length) continue;

        const safest = Math.min.apply(null, diffs);
        const greedy = Math.max.apply(null, diffs);
        if (greedy - safest < MIN_SPREAD) {
            err(tag + ': difficulty spread ' + (greedy - safest).toFixed(2) + ' - a safe play and a greedy '
                + 'play must sit at least ' + MIN_SPREAD + ' apart, or the options are three ways of saying the same bet');
        }
        if (safest > SAFEST_MAX) {
            err(tag + ': safest option is ' + safest.toFixed(2) + ', above the ' + SAFEST_MAX
                + ' ceiling - a rookie cannot reliably do anything here');
        }
        if (PHASES.includes(e.phase)) safestBy[e.phase].push(safest);
        if (greedy >= GREED_AT) greedyEvents++;

        // An event where every option reads the same game state, or none does,
        // wastes the +9%/-7% map-read term entirely.
        const marked = opts.filter(o => o.when).length;
        if (marked === opts.length) {
            warn(tag + ': every option carries a `when` marker - one of them should be the play that is never wrong');
        }
    }
}

// ------------------------------------------------------- difficulty shape
console.log('');
console.log('=== safest-option difficulty by phase ==============================');
for (const p of PHASES) {
    const arr = safestBy[p];
    if (!arr.length) { err('no ' + p + ' events at all'); continue; }
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const target = SAFEST_TARGET[p];
    const off = Math.abs(mean - target);
    console.log('  ' + p.padEnd(6) + ' mean ' + mean.toFixed(3) + '  target ' + target.toFixed(2)
        + '  max ' + Math.max.apply(null, arr).toFixed(2) + '  (' + arr.length + ' events)');
    if (off > SAFEST_TOLERANCE) {
        err(p + ' safest options average ' + mean.toFixed(3) + ', ' + off.toFixed(3)
            + ' off the stated target of ' + target + ' - the game gets harder or softer than the file claims');
    }
}
console.log('  ' + greedyEvents + '/' + all.length + ' events offer a true greed option (difficulty >= ' + GREED_AT + ')');
if (greedyEvents < all.length * 0.45) {
    warn('fewer than half the events have a play above ' + GREED_AT + ' - there is little to gamble on');
}

// --------------------------------------------------- the decision economy
//  The safest-option means above pin how HARD the easy way out is. They say
//  nothing about the pool as a whole, and it turns out that is where drift
//  hides: a batch of new events can hit every safest-option target exactly and
//  still run softer across all their other options.
//
//  That is not cosmetic. Easier options succeed more often, book more reward
//  and eat less risk, which raises `personal`, which raises the 0-10 match
//  rating. When 90 events were added at a mean difficulty of 0.505 against the
//  existing 0.519, the mean match rating across a full smoke run moved +0.09 on
//  every seed tested - and careerSmoke fails the run outright above 7.6.
//
//  So both numbers are pinned. `net` is the decision economy in one figure:
//  what an average option pays minus what it costs.
const allOpts = all.flatMap(e => (Array.isArray(e.options) ? e.options : []));
const meanOf = (k) => allOpts.reduce((s, o) => s + (Number(o[k]) || 0), 0) / (allOpts.length || 1);
const POOL_REFERENCE = { difficulty: 0.511, reward: 9.57, risk: 8.00 };
const POOL_WARN_AT = { difficulty: 0.012, reward: 0.30, risk: 0.30 };
const POOL_ERR_AT = { difficulty: 0.025, reward: 0.60, risk: 0.60 };

console.log('');
console.log('=== decision economy ===============================================');
for (const k of ['difficulty', 'reward', 'risk']) {
    const mean = meanOf(k);
    const drift = mean - POOL_REFERENCE[k];
    console.log('  ' + k.padEnd(11) + ' mean ' + mean.toFixed(3)
        + '  (' + (drift >= 0 ? '+' : '') + drift.toFixed(3) + ' from reference ' + POOL_REFERENCE[k] + ')');
    if (Math.abs(drift) > POOL_ERR_AT[k]) {
        err('option ' + k + ' has drifted ' + drift.toFixed(3) + ' across the whole pool. '
            + (k === 'difficulty'
                ? 'Softer options raise every match rating; careerSmoke fails above a 7.6 mean.'
                : 'This moves what an average decision is worth and re-tunes the whole match engine.'));
    } else if (Math.abs(drift) > POOL_WARN_AT[k]) {
        warn('option ' + k + ' has drifted ' + drift.toFixed(3) + ' from the reference - '
            + 're-run tools/careerSmoke.mjs and check the MATCH RATINGS mean against 7.6');
    }
}
console.log('  net payout  ' + (meanOf('reward') - meanOf('risk')).toFixed(2)
    + '  (what an average option pays minus what it costs)');

// ------------------------------------------------------------- bias shape
//  These triples ARE the comfort-pick bonus: tools/championCheck.mjs measures
//  every archetype against this exact distribution, and IT owns the fairness
//  verdict (it asserts the spread between the best- and worst-served archetype).
//
//  What this check owns instead is DRIFT. The reference below is the pool as it
//  actually stood at 75 events, and the pool leaning co-operative is a design
//  fact rather than a defect - most decisions in this game are team decisions.
//  The danger when the pool grows is that a batch of new events written in one
//  sitting all lean the same way, which silently re-tunes every signature
//  champion in the game. Moving the mean is allowed; moving it by accident is
//  what this catches.
const BIAS_REFERENCE = { aggression: 0.563, risk: 0.566, teamplay: 0.669 };
const BIAS_WARN_AT = 0.03;
const BIAS_ERR_AT = 0.06;

console.log('');
console.log('=== option bias distribution =======================================');
console.log('  (drift from the 75-event reference; championCheck owns the fairness verdict)');
for (const k of ['aggression', 'risk', 'teamplay']) {
    const vals = biasAll.map(b => Number(b[k])).filter(Number.isFinite);
    const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const lo = vals.filter(v => v <= 0.35).length, hi = vals.filter(v => v >= 0.65).length;
    const drift = mean - BIAS_REFERENCE[k];
    console.log('  ' + k.padEnd(11) + ' mean ' + mean.toFixed(3)
        + '  (' + (drift >= 0 ? '+' : '') + drift.toFixed(3) + ')'
        + '   low ' + String(lo).padStart(3) + ' / high ' + String(hi).padStart(3) + ' of ' + vals.length);
    if (Math.abs(drift) > BIAS_ERR_AT) {
        err('option ' + k + ' has drifted ' + drift.toFixed(3) + ' from the reference ' + BIAS_REFERENCE[k]
            + ' - new events are leaning one way and that re-tunes the comfort bonus for every '
            + 'signature champion. Re-run tools/championCheck.mjs and check the archetype spread.');
    } else if (Math.abs(drift) > BIAS_WARN_AT) {
        warn('option ' + k + ' has drifted ' + drift.toFixed(3) + ' from the reference ' + BIAS_REFERENCE[k]);
    }
    if (lo < vals.length * 0.12 || hi < vals.length * 0.12) {
        warn('option ' + k + ' rarely reaches one end of its range - archetypes at that end get no comfort');
    }
}

// ------------------------------------------------------------- pool depth
console.log('');
console.log('=== pool depth vs a Bo5 ============================================');
for (const roleKey of Object.keys(DECISION_POOLS)) {
    const pool = DECISION_POOLS[roleKey];
    const counts = {};
    for (const p of PHASES) counts[p] = pool.filter(e => e.phase === p).length;
    const line = PHASES.map(p => p + ' ' + String(counts[p]).padStart(2) + '/' + need(p)).join('   ');
    console.log('  ' + roleKey.padEnd(4) + String(pool.length).padStart(3) + ' events   ' + line);
    for (const p of PHASES) {
        if (counts[p] < need(p)) {
            warn(roleKey + ': only ' + counts[p] + ' ' + p + ' events but a Bo5 draws ' + need(p)
                + ' - the series runs out and starts repeating itself');
        }
    }
    if (LIST) {
        for (const p of PHASES) {
            console.log('        ' + p + ': ' + pool.filter(e => e.phase === p).map(e => e.id).join(', '));
        }
    }
}

// eventsForRole must never hand the engine an empty array.
for (const roleKey of Object.keys(DECISION_POOLS).concat(['NOT_A_ROLE'])) {
    for (const p of PHASES.concat([undefined])) {
        const got = eventsForRole(roleKey, p);
        if (!Array.isArray(got) || !got.length) {
            err('eventsForRole("' + roleKey + '", ' + p + ') returned nothing - the match engine deals from this');
        }
    }
}

console.log('');
if (errors) {
    console.log('FAILED -- ' + errors + ' error' + (errors === 1 ? '' : 's')
        + (warns ? ', ' + warns + ' warning' + (warns === 1 ? '' : 's') : '') + '.');
    process.exit(1);
}
console.log('All decision-pool checks passed' + (warns ? ' (' + warns + ' warning' + (warns === 1 ? '' : 's') + ')' : '') + '.');
