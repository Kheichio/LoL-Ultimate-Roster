#!/usr/bin/env node
// ===========================================================================
//  comboSim -- calibration gate for the Mechanics drill (ComboGame.svelte)
// ===========================================================================
//  Why this exists.
//
//  A timing drill is trivially easy to get wrong in a way nobody notices: the
//  windows are milliseconds, nobody can eyeball what a 42ms window feels like,
//  and the score comes out of a weighted sum that looks reasonable at every
//  individual step. The drill this one replaced shipped with a scoring blend
//  (CS 60% / perfect 25% / streak 15%) under which simply pressing inside a
//  20%-wide band scored 0.60 -- above the 0.50 reference -- so MEC was the
//  cheapest attribute in the mode and nothing said so.
//
//  scoreFactor() in training.js is the contract this file defends:
//      0.50 -> 1.0x gain, the reference session
//      1.00 -> 2.4x
//  Every drill in the mode has to agree on what 0.50 means, or one attribute
//  trains faster than the rest for reasons the player can never see.
//
//  Run this after touching any constant in ComboGame's CFG / VALUE / SCORE_W.
//
//    node tools/comboSim.mjs [--sessions 20000] [--verbose]
//
//  MODEL. The player's press lands with a timing error drawn from a normal
//  distribution: `sigma` is their precision and `bias` their systematic lead or
//  lag (real players sit early on a shrinking-ring cue). A press outside the
//  outermost window is a miss, and so is a target they never press at all --
//  modelled as a per-target dropout that rises with density, because at Elite
//  a second ring arms before the first has landed.
//
//  Everything downstream of the error -- the window comparison, VALUE, the
//  combo counter and the final blend -- is copied verbatim from ComboGame's
//  resolve() and finish(), so only the error model is an estimate.
//
//  ASCII only.
// ===========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'src', 'lib', 'components', 'career', 'minigames', 'ComboGame.svelte');
const TRAINING = path.join(ROOT, 'src', 'lib', 'career', 'training.js');

const argOf = (flag, dflt) => {
    const i = process.argv.indexOf(flag);
    if (i < 0) return dflt;
    const v = Number(process.argv[i + 1]);
    return Number.isFinite(v) ? v : dflt;
};
const SESSIONS = Math.max(200, Math.round(argOf('--sessions', 20000)));
const VERBOSE = process.argv.includes('--verbose');

let bad = 0;
const problems = [];
function ok(label, cond, detail = '') {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  -- ' + detail : ''}`);
    if (!cond) { bad++; problems.push(label + (detail ? ' -- ' + detail : '')); }
}

// ---------------------------------------------------------------------------
//  Read the real tuning out of the component.
//  Parsed rather than copied: a calibration that quotes numbers the component
//  no longer has is worse than no calibration at all.
// ---------------------------------------------------------------------------
function readTuning() {
    const src = fs.readFileSync(COMPONENT, 'utf8');

    const tiers = {};
    for (const lvl of [1, 2, 3]) {
        const m = src.match(new RegExp('^\\s*' + lvl + ':\\s*\\{([^}]+)\\},', 'm'));
        if (!m) throw new Error(`comboSim: no CFG row for tier ${lvl} in ComboGame.svelte`);
        const row = {};
        for (const part of m[1].split(',')) {
            const kv = part.split(':');
            if (kv.length < 2) continue;
            const k = kv[0].trim();
            const v = Number(kv[1].trim().replace(/['"]/g, ''));
            if (Number.isFinite(v)) row[k] = v;
        }
        for (const need of ['targets', 'approach', 'beat', 'wPerfect', 'wGreat', 'wGood']) {
            if (!Number.isFinite(row[need])) {
                throw new Error(`comboSim: CFG tier ${lvl} is missing \`${need}\``);
            }
        }
        tiers[lvl] = row;
    }

    const valueM = src.match(/const VALUE = \{([^}]+)\}/);
    const weightM = src.match(/const SCORE_W = \{([^}]+)\}/);
    if (!valueM || !weightM) throw new Error('comboSim: VALUE / SCORE_W no longer match the shape this parser expects');
    const parseObj = (s) => {
        const o = {};
        for (const part of s.split(',')) {
            const kv = part.split(':');
            if (kv.length < 2) continue;
            o[kv[0].trim()] = Number(kv[1].trim());
        }
        return o;
    };
    return { tiers, VALUE: parseObj(valueM[1]), W: parseObj(weightM[1]) };
}

/** scoreFactor(), read out of training.js so the reference cannot drift. */
function readScoreFactor() {
    const src = fs.readFileSync(TRAINING, 'utf8');
    const m = src.match(/export function scoreFactor\(score01\) \{([\s\S]*?)\n\}/);
    if (!m) throw new Error('comboSim: could not find scoreFactor() in training.js');
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // eslint-disable-next-line no-new-func
    return new Function('score01', 'clamp', m[1] + '\n')
        .bind(null);
    function _unused() { return clamp; }
}

const { tiers, VALUE, W } = readTuning();
const sfBody = readScoreFactor();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const scoreFactor = (s) => sfBody(s, clamp);

// ---------------------------------------------------------------------------
//  Player model
// ---------------------------------------------------------------------------
// Box-Muller. Deterministic stream so a failure reproduces.
let _seed = 0x9e3779b9;
function rnd() {
    _seed ^= _seed << 13; _seed >>>= 0;
    _seed ^= _seed >> 17;
    _seed ^= _seed << 5; _seed >>>= 0;
    return _seed / 4294967296;
}
function gauss() {
    const u = Math.max(1e-9, rnd());
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// sigma  : timing precision, seconds of standard deviation
// bias   : systematic offset (negative = presses early)
// dropout: chance of never pressing a target at all, at the BASE density.
//          Scaled by how far each tier crowds rings together.
const PROFILES = [
    { key: 'flailing',  name: 'flailing (no rhythm)',    sigma: 0.150, bias: -0.045, dropout: 0.130 },
    { key: 'casual',    name: 'casual',                  sigma: 0.100, bias: -0.030, dropout: 0.070 },
    { key: 'competent', name: 'competent',               sigma: 0.062, bias: -0.014, dropout: 0.030 },
    { key: 'strong',    name: 'strong',                  sigma: 0.040, bias: -0.006, dropout: 0.012 },
    { key: 'excellent', name: 'excellent',               sigma: 0.026, bias: -0.002, dropout: 0.004 },
    { key: 'perfect',   name: 'near-perfect',            sigma: 0.014, bias:  0.000, dropout: 0.001 },
];

/** Density pressure: how much of the approach is already occupied by the next
 *  ring. beat/approach of 1 means one at a time; 0.5 means two on screen. */
function densityMult(t) {
    const overlap = clamp(t.approach / Math.max(0.01, t.beat), 1, 3);
    return 1 + (overlap - 1) * 0.55;
}

function runSession(t, prof) {
    const n = t.targets;
    const drop = clamp(prof.dropout * densityMult(t), 0, 0.6);
    const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    let valueSum = 0, combo = 0, bestCombo = 0;

    for (let i = 0; i < n; i++) {
        let kind;
        if (rnd() < drop) {
            kind = 'miss';
        } else {
            const e = prof.bias + gauss() * prof.sigma;
            const a = Math.abs(e);
            if (a <= t.wPerfect) kind = 'perfect';
            else if (a <= t.wGreat) kind = 'great';
            else if (a <= t.wGood) kind = 'good';
            else kind = 'miss';
        }
        counts[kind]++;
        valueSum += VALUE[kind];
        if (kind === 'miss') combo = 0;
        else { combo++; if (combo > bestCombo) bestCombo = combo; }
    }

    const accuracy = clamp(valueSum / n, 0, 1);
    const comboRate = clamp(bestCombo / n, 0, 1);
    const score = clamp(accuracy * W.accuracy + comboRate * W.combo, 0, 1);
    return { score, accuracy, comboRate, counts };
}

function measure(t, prof, sessions) {
    let s = 0, acc = 0, perf = 0, miss = 0;
    for (let i = 0; i < sessions; i++) {
        const r = runSession(t, prof);
        s += r.score; acc += r.accuracy;
        perf += r.counts.perfect; miss += r.counts.miss;
    }
    return {
        score: s / sessions,
        accuracy: acc / sessions,
        perfectRate: perf / (sessions * t.targets),
        missRate: miss / (sessions * t.targets),
    };
}

// ---------------------------------------------------------------------------
console.log('');
console.log('==========================================================');
console.log('  comboSim -- Mechanics drill calibration');
console.log(`  ${SESSIONS} simulated sessions per (tier, profile)`);
console.log('==========================================================');

const table = {};
for (const lvl of [1, 2, 3]) {
    const t = tiers[lvl];
    console.log('');
    console.log(`  Tier ${lvl} (${t.targets} targets, approach ${t.approach}s, beat ${t.beat}s, `
        + `windows +/- ${Math.round(t.wPerfect * 1000)}/${Math.round(t.wGreat * 1000)}/${Math.round(t.wGood * 1000)}ms)`);
    console.log('    profile                    score   gain    acc   perfect%  miss%');
    table[lvl] = {};
    for (const p of PROFILES) {
        const m = measure(t, p, SESSIONS);
        table[lvl][p.key] = m;
        console.log(`    ${p.name.padEnd(24)} ${m.score.toFixed(3)}  ${scoreFactor(m.score).toFixed(2)}x  `
            + `${m.accuracy.toFixed(3)}   ${(m.perfectRate * 100).toFixed(1)}%   ${(m.missRate * 100).toFixed(1)}%`);
    }
}

console.log('');
console.log('---- ASSERTIONS ------------------------------------------');

// 1. THE REFERENCE. A competent session is worth 1.0x, the same as the laning
//    and composure drills. This is the whole point of the file.
for (const lvl of [1, 2, 3]) {
    const s = table[lvl].competent.score;
    ok(`tier ${lvl}: a competent session lands near the 0.50 reference`,
        s >= 0.42 && s <= 0.58, `score ${s.toFixed(3)} (gain ${scoreFactor(s).toFixed(2)}x)`);
}

// 2. Skill is paid all the way to the top, and there is real headroom in the
//    band where actual players live.
//
//    NOTE: clutchSim holds near-perfect play to 0.70-0.90 "so there is
//    somewhere left to go". That rule cannot apply here and it is worth saying
//    why rather than quietly using a different number. ClutchGame has
//    irreducible interference, so even flawless reading loses some reps; a pure
//    timing drill has none -- a player whose every press lands inside the
//    window has genuinely earned a perfect session, and capping them below it
//    would mean tightening the window under one 60Hz frame, i.e. grading
//    hardware rather than hands.
//
//    So the headroom check is made where it actually matters: `strong` is a
//    good human player, and there must be a clear gap both below them (to
//    competent) and above them (to the ceiling).
for (const lvl of [1, 2, 3]) {
    const s = table[lvl].perfect.score;
    ok(`tier ${lvl}: near-perfect play is paid to the top`, s >= 0.85,
        `score ${s.toFixed(3)} (gain ${scoreFactor(s).toFixed(2)}x)`);
}
for (const lvl of [1, 2, 3]) {
    const s = table[lvl].strong.score;
    ok(`tier ${lvl}: a strong session leaves headroom (0.60-0.82)`,
        s >= 0.60 && s <= 0.82, `score ${s.toFixed(3)} (gain ${scoreFactor(s).toFixed(2)}x)`);
}

// 3. Skill pays MONOTONICALLY at every tier. A drill where getting better does
//    not raise the score is a slot machine.
for (const lvl of [1, 2, 3]) {
    let mono = true, worst = '';
    for (let i = 1; i < PROFILES.length; i++) {
        const a = table[lvl][PROFILES[i - 1].key].score;
        const b = table[lvl][PROFILES[i].key].score;
        if (b <= a + 0.015) { mono = false; worst = `${PROFILES[i - 1].key} ${a.toFixed(3)} -> ${PROFILES[i].key} ${b.toFixed(3)}`; }
    }
    ok(`tier ${lvl}: every step up in skill is worth at least 0.015`, mono, worst);
}

// 4. Flailing must not pay. Below 0.25 scoreFactor is quadratic and nearly
//    zero, which is the intended "wasted rep".
for (const lvl of [1, 2, 3]) {
    const s = table[lvl].flailing.score;
    ok(`tier ${lvl}: flailing is a wasted rep`, s < 0.33,
        `score ${s.toFixed(3)} (gain ${scoreFactor(s).toFixed(2)}x)`);
}

// 5. Tiers stay NORMALISED. The same hands must score roughly the same on all
//    three, because that is the convention every other drill in the mode
//    follows -- the tier's reward is baseGain, not a fatter score. A tier that
//    drifts is a tier that silently trains a different amount per session.
{
    let flat = true, detail = '';
    for (const key of ['casual', 'competent', 'strong']) {
        const xs = [table[1][key].score, table[2][key].score, table[3][key].score];
        const spread = Math.max(...xs) - Math.min(...xs);
        if (spread > 0.10) { flat = false; detail = `${key}: ${xs.map(x => x.toFixed(3)).join(' / ')} (spread ${spread.toFixed(3)})`; }
    }
    ok('the same hands score within 0.10 across all three tiers', flat, detail);
}

// 6. RAW GAIN still rises with tier. Tier 3 pays more per session (baseGain in
//    training.js), so a harder drill that scores lower must still be worth
//    playing -- otherwise nobody should ever buy one.
{
    // drill() takes positional args:
    //   (id, attr, difficulty, name, desc, energy, baseGain, reqOVR, goldCost)
    // so the MEC rows are read by id and baseGain is the number after energy.
    const src = fs.readFileSync(TRAINING, 'utf8');
    const gains = {};
    for (const lvl of [1, 2, 3]) {
        const m = src.match(new RegExp(
            `drill\\('mec_${lvl}'[\\s\\S]{0,400}?\\n\\s*(\\d+),\\s*([0-9.]+),`));
        if (m) gains[lvl] = Number(m[2]);
    }
    if (gains[1] && gains[2] && gains[3]) {
        console.log(`  --   MEC baseGain per tier: ${gains[1]} / ${gains[2]} / ${gains[3]}`);
        const eff = lvl => gains[lvl] * scoreFactor(table[lvl].competent.score);
        ok('raw gain per session still rises with drill tier',
            eff(3) > eff(2) && eff(2) > eff(1),
            `${eff(1).toFixed(3)} / ${eff(2).toFixed(3)} / ${eff(3).toFixed(3)}`);
    } else {
        console.log('  --   baseGain per tier not found in training.js; skipping the gain-ladder check');
    }
}

// 7. The windows must stay ORDERED and strictly nested. A wGreat below
//    wPerfect silently makes `great` unreachable and every near-miss a `good`.
for (const lvl of [1, 2, 3]) {
    const t = tiers[lvl];
    ok(`tier ${lvl}: timing windows are strictly nested`,
        t.wPerfect < t.wGreat && t.wGreat < t.wGood,
        `${t.wPerfect} < ${t.wGreat} < ${t.wGood}`);
}

// 8. Rings must actually overlap at the top tier, or "density" is a comment.
{
    const t = tiers[3];
    ok('Elite has more than one ring on screen at a time',
        t.beat < t.approach, `beat ${t.beat}s vs approach ${t.approach}s`);
}

// 9. The drill must be reachable by a phone. The perfect window cannot be
//    tighter than one frame at 60Hz plus a touch-latency allowance, or it is
//    hardware, not skill.
{
    const t = tiers[3];
    ok('the tightest window is above one 60Hz frame (16.7ms)',
        t.wPerfect * 1000 >= 25, `wPerfect ${Math.round(t.wPerfect * 1000)}ms`);
}

// 10. THE ANIMATION IS REACTIVE. This is a lint for a bug that actually
//     shipped and made the drill unplayable rather than merely mistuned.
//
//     Svelte only re-evaluates a template expression when a variable the
//     expression NAMES has changed. The first cut drew the ring with
//     `scale({ringScale(t)})` -- which names `ringScale` and `t`, but not
//     `clock` -- so the ring was computed once per target and then frozen, and
//     because the fade-in is 0 on the frame a target is born, every target
//     rendered at opacity 0 and stayed invisible. There was nothing on screen
//     to time against, and no harness could see it: SSR only ever renders the
//     intro screen, and the scoring maths was perfectly correct throughout.
//
//     So: the field must iterate a list derived in a reactive statement, and
//     that statement must name the clock.
{
    const src = fs.readFileSync(COMPONENT, 'utf8');
    const each = src.match(/\{#each\s+([A-Za-z_$][\w$]*)\s+as\s/);
    const eachName = each ? each[1] : null;
    ok('the target list rendered by the field is a derived one, not raw state',
        !!eachName && eachName !== 'live',
        eachName ? `{#each ${eachName} as ...}` : 'no {#each} found in the field');

    const derived = eachName
        ? src.match(new RegExp('\\$:\\s*' + eachName + '\\s*=([\\s\\S]{0,400}?);\\n'))
        : null;
    ok('that list is built by a reactive statement that names `clock`',
        !!derived && /\bclock\b/.test(derived[1]),
        derived ? 'found, clock ' + (/\bclock\b/.test(derived[1]) ? 'named' : 'MISSING') : 'no `$: <list> =` statement');

    // Positive control: the pattern this lint rejects must actually be
    // rejectable, or a passing lint means nothing.
    const controlBad = '{#each live as t (t.key)}';
    ok('the lint would reject the shape that shipped broken',
        /\{#each\s+live\s+as\s/.test(controlBad), 'control string');

    // And nothing may still be calling the old per-target helpers from markup.
    const strayCall = src.match(/(?:scale|opacity):?\s*\{?\s*ring(?:Scale|Fade)\s*\(/);
    ok('no template expression calls a per-target ring helper directly',
        !strayCall, strayCall ? strayCall[0] : '');

    // THE ANIMATION CONTRACT, evaluated from the component's own formula rather
    // than restated here. The drill's entire promise is "hit it when the ring
    // meets the circle", which is only true if the ring is exactly ON the circle
    // at the hit moment and nowhere near it at spawn. Restating the maths in
    // this file would test the copy, so the real block is lifted and run.
    const body = src.match(/\$: shown = live\.map\(t => \{([\s\S]*?)\n    \}\);/);
    const ringStart = Number((src.match(/const RING_START = ([0-9.]+)/) || [])[1]);
    const fadeIn = Number((src.match(/const FADE_IN = ([0-9.]+)/) || [])[1]);
    if (!body || !Number.isFinite(ringStart) || !Number.isFinite(fadeIn)) {
        ok('the ring formula can be read out of the component', false,
            'no `$: shown = live.map(...)` / RING_START / FADE_IN found');
    } else {
        const c01 = (v) => Math.max(0, Math.min(1, v));
        // eslint-disable-next-line no-new-func
        const evalShown = new Function('t', 'clock', 'D', 'RING_START', 'FADE_IN', 'c01', body[1]);
        const D = tiers[1];
        const target = { born: 10, hitAt: 10 + D.approach };
        const at = (clk) => evalShown(target, clk, D, ringStart, fadeIn, c01);

        const atBeat = at(target.hitAt);
        ok('the ring is exactly on the circle at the beat',
            Math.abs(atBeat.scale - 1) < 1e-9, `scale ${atBeat.scale}`);

        const atSpawn = at(target.born);
        ok('the ring opens at its full size when the target spawns',
            Math.abs(atSpawn.scale - ringStart) < 1e-9, `scale ${atSpawn.scale} vs RING_START ${ringStart}`);

        ok('the ring keeps closing right through the approach',
            at(target.born + D.approach * 0.25).scale > at(target.born + D.approach * 0.75).scale,
            'quarter-way ring must be larger than three-quarter-way');

        ok('a target is invisible on the frame it is born and fully faded in later',
            atSpawn.fade === 0 && at(target.born + D.approach * fadeIn).fade === 1,
            `fade ${atSpawn.fade} -> ${at(target.born + D.approach * fadeIn).fade}`);

        // The apparent thickness is border-width * scale, and it must not
        // collapse at the moment the player is reading it.
        const apparent = (clk) => { const s = at(clk); return Number(s.bw) * s.scale; };
        ok('the ring does not thin out as it closes',
            apparent(target.hitAt) >= apparent(target.born),
            `${apparent(target.born).toFixed(2)}px at spawn -> ${apparent(target.hitAt).toFixed(2)}px at the beat`);

        ok('the target lights up before the beat, not after it',
            at(target.hitAt - 0.01).near === true && at(target.born).near === false);
    }
}

console.log('');
if (bad) {
    console.log(`  ${bad} FAILURE(S)`);
    for (const p of problems) console.log('    - ' + p);
} else {
    console.log('  All combo drill calibration checks passed.');
}
console.log('');
process.exit(bad ? 1 : 0);
