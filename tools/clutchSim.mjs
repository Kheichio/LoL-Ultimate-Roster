#!/usr/bin/env node
// ===========================================================================
//  clutchSim -- calibration gate for the Composure drill (ClutchGame.svelte)
// ===========================================================================
//  Why this exists.
//
//  The drill shipped with interference that no input could beat: the sweep
//  jumped to 2x speed on the same frame the badge announcing it appeared, and
//  the scoring zone teleported under a marker that was already committed. The
//  simulation below puts a NEAR-PERFECT player at a 52% hit rate and a 0.48
//  session score on that build. That is not difficulty, it is a coin flip with
//  extra steps, and players read it exactly that way.
//
//  The fix was to telegraph every change, ease the speed instead of stepping
//  it, slide the zone instead of teleporting it, and keep the centre it left
//  scoreable while it travels. The fix is worth about +0.34 of session score on
//  its own -- which is the trap this file exists to catch: the first cut ALSO
//  softened the sweep and the zone, and that took a competent session to 0.63
//  against the 0.50 reference WaveControlGame is calibrated to. CMP would have
//  become the cheapest attribute in the mode to max.
//
//  So the rule this file asserts is: THE PRECISION DEMAND IS NOT THE PROBLEM.
//  speed / half0 / halfMin / shrink are the original numbers and must stay
//  there; only readability was allowed to change.
//
//  Run this after touching any constant in ClutchGame's cfg() block.
//
//    node tools/clutchSim.mjs [--sessions 20000] [--verbose]
//
//  MODEL. The player aims to stop the marker on the zone centre. Their timing
//  error is half-normal with standard deviation `sigma` seconds; the positional
//  error is speed * timingError, in bar-widths. Interference multiplies that
//  error, and by how much is the entire question -- an un-telegraphed change
//  lands after the hand has committed, a telegraphed one is re-timed. The
//  multipliers below are estimates and they are the softest part of this file;
//  the BLIND ones especially. Everything downstream of the error is copied
//  verbatim from ClutchGame.judge()/finishRound(), so the scoring maths is not
//  an estimate at all.
//
//  ASCII only.
// ===========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'src', 'lib', 'components', 'career', 'minigames', 'ClutchGame.svelte');

const argOf = (flag, dflt) => {
    const i = process.argv.indexOf(flag);
    if (i < 0) return dflt;
    const v = Number(process.argv[i + 1]);
    return Number.isFinite(v) ? v : dflt;
};
const SESSIONS = Math.max(200, Math.round(argOf('--sessions', 20000)));
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
//  Read the real tuning table out of the component.
//  Parsed rather than hard-coded on purpose: a calibration that quotes numbers
//  the component no longer has is worse than no calibration. The drill this one
//  replaced shipped on exactly that mistake.
// ---------------------------------------------------------------------------
function readCfg() {
    const src = fs.readFileSync(COMPONENT, 'utf8');
    const row = (key) => {
        const m = src.match(new RegExp('\\b' + key + ':\\s*\\[([^\\]]+)\\]'));
        if (!m) throw new Error('clutchSim: could not find `' + key + '` in ClutchGame.svelte');
        return m[1].split(',').map(s => Number(s.trim()));
    };
    const ramp = src.match(/\(1 \+ ([0-9.]+) \* Math\.max\(0, rep - 1\)\)/);
    const tiltSpeed = src.match(/tiltActive \? ([0-9.]+) : 1\) \* speedMul/);
    const tiltEvt = src.match(/tiltActive \? ([0-9.]+) : 0\)/);
    const evtRamp = src.match(/\+ ([0-9.]+) \* Math\.max\(0, rep - 1\) \+ \(tiltActive/);
    const up = src.match(/rampSpeed\(up \? \(([0-9.]+) \+ Math\.random\(\) \* ([0-9.]+)\)/);
    if (!ramp || !tiltSpeed || !tiltEvt || !evtRamp || !up) {
        throw new Error('clutchSim: ClutchGame.svelte no longer matches the shapes this parser expects');
    }
    return {
        reps: row('reps'), repMs: row('repMs'), speed: row('speed'),
        half0: row('half0'), halfMin: row('halfMin'), shrink: row('shrink'),
        regrow: row('regrow'), evtBase: row('evtBase'), maxEvt: row('maxEvt'),
        speedRamp: Number(ramp[1]),
        tiltSpeed: Number(tiltSpeed[1]),
        tiltEvt: Number(tiltEvt[1]),
        evtRamp: Number(evtRamp[1]),
        speedUpLo: Number(up[1]),
        speedUpSpan: Number(up[2]),
    };
}

const LIVE = readCfg();

/** The build this replaced, for the "is the fix worth anything" assertion. */
const LEGACY = {
    reps: [14, 15, 16], repMs: [3200, 2900, 2600], speed: [0.66, 0.86, 1.06],
    half0: [0.115, 0.094, 0.078], halfMin: [0.030, 0.024, 0.019],
    shrink: [0.900, 0.885, 0.870], regrow: [1.260, 1.220, 1.180],
    evtBase: [0.00, 0.12, 0.24], maxEvt: [2, 3, 3],
    speedRamp: 0.03, tiltSpeed: 1.22, tiltEvt: 0.32, evtRamp: 0.018,
    speedUpLo: 1.45, speedUpSpan: 0.55,
};

// How much an event multiplies the player's positional error.
const MULT = {
    blind: { speed: 1.85, invert: 2.20, shift: 6.00 },
    tell:  { speed: 1.18, invert: 1.30, shift: 1.15 },
};

// The reference a competent session is meant to land on. scoreFactor() in
// training.js pays 1.0x here, and tools/waveSim.mjs holds the laning drill to
// the same number.
const COMPETENT_SIGMA = 0.07;
const COMPETENT_TARGET = 0.50;
const COMPETENT_TOLERANCE = 0.12;

// A near-perfect player must be clearly rewarded but must not max the drill --
// there has to be somewhere left to go.
const EXPERT_SIGMA = 0.02;
const EXPERT_MIN = 0.70;
const EXPERT_MAX = 0.90;

const SIGMAS = [0.02, 0.03, 0.045, 0.06, 0.07, 0.08, 0.10, 0.14];

function gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const smoothstep = x => x * x * (3 - 2 * x);

function runSession(t, lvl, sigma, telegraphed) {
    const i = lvl - 1;
    let halfW = t.half0[i];
    let hits = 0;
    let played = 0;
    let weightSum = 0;
    let weightedHits = 0;
    let precSum = 0;
    let tilt = 0;
    let tiltActive = false;
    let tiltLeft = 0;
    let tiltRounds = 0;
    let tiltHits = 0;

    for (let rep = 1; rep <= t.reps[i]; rep++) {
        if (tiltActive) tiltRounds++;
        const weight = tiltActive ? 2 : 1;

        const sp = t.speed[i] * (1 + t.speedRamp * (rep - 1)) * (tiltActive ? t.tiltSpeed : 1);
        const chance = Math.min(0.90, t.evtBase[i] + t.evtRamp * (rep - 1) + (tiltActive ? t.tiltEvt : 0));
        const m = telegraphed ? MULT.tell : MULT.blind;

        let slots = t.maxEvt[i];
        let mult = 1;
        let extraSpeed = 1;
        if (slots > 0 && Math.random() < Math.min(0.90, chance + 0.34)) {
            slots--;
            mult *= m.speed;
            if (Math.random() < 0.65) extraSpeed = t.speedUpLo + Math.random() * t.speedUpSpan;
        }
        if (slots > 0 && Math.random() < Math.min(0.90, chance + 0.18)) { slots--; mult *= m.invert; }
        if (slots > 0 && Math.random() < Math.min(0.90, chance + 0.13)) { slots--; mult *= m.shift; }

        const err = Math.abs(gauss()) * sigma * sp * extraSpeed * mult;
        const hit = err <= halfW;
        const prec = hit ? Math.max(0, 1 - err / Math.max(1e-6, halfW)) : 0;

        played++;
        weightSum += weight;
        if (hit) {
            hits++;
            weightedHits += weight;
            precSum += prec;
            halfW = Math.max(t.halfMin[i], halfW * t.shrink[i]);
            if (tiltActive) tiltHits++;
            else tilt = Math.max(0, tilt - 0.12);
        } else {
            halfW = Math.min(t.half0[i], halfW * t.regrow[i]);
            if (!tiltActive) tilt = Math.min(1, tilt + 0.34);
        }

        if (tiltActive) { tiltLeft--; if (tiltLeft <= 0) { tiltActive = false; tilt = 0; } }
        else if (tilt >= 1) { tiltActive = true; tiltLeft = 2; }
    }

    // --- verbatim from ClutchGame.finishRound() ---
    const hitRate = weightSum > 0 ? weightedHits / weightSum : 0;
    const rawCentre = hits > 0 ? precSum / hits : 0;
    const centring = rawCentre * (0.5 + 0.5 * hitRate);
    const clutch = tiltRounds > 0 ? tiltHits / tiltRounds : hitRate;
    const base = 0.55 * hitRate + 0.30 * centring + 0.15 * clutch;
    const shaped = 0.5 * base + 0.5 * smoothstep(Math.max(0, Math.min(1, base)));
    return { score: Math.max(0, Math.min(1, shaped)), hitRate: hits / Math.max(1, played) };
}

function mean(t, lvl, sigma, telegraphed, n = SESSIONS) {
    let s = 0;
    let h = 0;
    for (let k = 0; k < n; k++) {
        const r = runSession(t, lvl, sigma, telegraphed);
        s += r.score;
        h += r.hitRate;
    }
    return { score: s / n, hitRate: h / n };
}

// ---------------------------------------------------------------------------
const problems = [];
const fail = (msg, evidence) => problems.push({ msg, evidence });

console.log('');
console.log('=== ClutchGame calibration =========================================');
console.log(`  ${SESSIONS} simulated sessions per cell.`);
console.log('  sigma is the player timing error in seconds: 0.02 near-perfect, 0.14 poor.');
console.log('');
console.log('  tuning read from ClutchGame.svelte:');
console.log(`    speed   ${LIVE.speed.join(' / ')}      halfMin ${LIVE.halfMin.join(' / ')}`);
console.log(`    repMs   ${LIVE.repMs.join(' / ')}   shrink  ${LIVE.shrink.join(' / ')}`);
console.log(`    maxEvt  ${LIVE.maxEvt.join(' / ')}          tilt speed x${LIVE.tiltSpeed}, event +${LIVE.tiltEvt}`);
console.log('');

console.log('=== 1. score by skill and tier =====================================');
console.log('  sigma      Basic        Advanced       Elite');
for (const sigma of SIGMAS) {
    const cells = [1, 2, 3].map(l => mean(LIVE, l, sigma, true));
    console.log('  ' + sigma.toFixed(3) + '   '
        + cells.map(c => `${c.score.toFixed(3)}/${Math.round(c.hitRate * 100)}%`.padStart(13)).join(''));
}

// Skill must pay, at every tier.
for (const lvl of [1, 2, 3]) {
    const good = mean(LIVE, lvl, 0.03, true).score;
    const poor = mean(LIVE, lvl, 0.10, true).score;
    if (!(good > poor + 0.15)) {
        fail(`tier ${lvl}: skill barely changes the score`,
            `sigma 0.03 -> ${good.toFixed(3)}, sigma 0.10 -> ${poor.toFixed(3)}`);
    }
}
// A harder tier must be harder.
{
    const s = [1, 2, 3].map(l => mean(LIVE, l, 0.045, true).score);
    if (!(s[0] > s[1] && s[1] > s[2])) {
        fail('the three tiers are not ordered by difficulty', s.map(v => v.toFixed(3)).join(' / '));
    }
}

console.log('');
console.log('=== 2. the 0.50 reference ==========================================');
{
    const c = mean(LIVE, 2, COMPETENT_SIGMA, true);
    const e = mean(LIVE, 2, EXPERT_SIGMA, true);
    console.log(`  competent (sigma ${COMPETENT_SIGMA}) : ${c.score.toFixed(3)}  (target ${COMPETENT_TARGET} +/- ${COMPETENT_TOLERANCE})`);
    console.log(`  expert    (sigma ${EXPERT_SIGMA}) : ${e.score.toFixed(3)}  (must sit in ${EXPERT_MIN} .. ${EXPERT_MAX})`);
    if (Math.abs(c.score - COMPETENT_TARGET) > COMPETENT_TOLERANCE) {
        fail('a competent session no longer lands near the 1.0x training reference',
            `${c.score.toFixed(3)} vs ${COMPETENT_TARGET}`);
    }
    if (e.score < EXPERT_MIN) {
        fail('a near-perfect session is not rewarded', e.score.toFixed(3));
    }
    if (e.score > EXPERT_MAX) {
        fail('the drill is maxed out by a good player - there is nothing left to improve',
            e.score.toFixed(3));
    }
}

console.log('');
console.log('=== 3. telegraphing is what changed, not the difficulty ============');
{
    const blind = mean(LIVE, 2, 0.045, false);
    const tell = mean(LIVE, 2, 0.045, true);
    console.log(`  same tuning, blind interference     : ${blind.score.toFixed(3)} / ${Math.round(blind.hitRate * 100)}% hits`);
    console.log(`  same tuning, telegraphed            : ${tell.score.toFixed(3)} / ${Math.round(tell.hitRate * 100)}% hits`);
    console.log(`  the previous build (blind, 3 events): ${mean(LEGACY, 2, 0.045, false).score.toFixed(3)}`);
    if (!(tell.score > blind.score + 0.15)) {
        fail('telegraphing no longer buys the player anything',
            `${blind.score.toFixed(3)} -> ${tell.score.toFixed(3)} -- the warning lead time or the ramp may have been removed`);
    }

    // The whole point: the precision dials must be the originals.
    const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
    for (const key of ['speed', 'half0', 'halfMin', 'shrink']) {
        if (!same(LIVE[key], LEGACY[key])) {
            fail(`\`${key}\` was softened - the drill was unreadable, not too hard`,
                `${LEGACY[key].join('/')} -> ${LIVE[key].join('/')}. If this is deliberate, re-run and move the`
                + ' LEGACY table with it, but check section 2 first.');
        }
    }
    const expertBlind = mean(LEGACY, 2, EXPERT_SIGMA, false).score;
    console.log(`  a near-perfect player on the old build: ${expertBlind.toFixed(3)} -- the reason this file exists`);
}

console.log('');
console.log('=== 4. every rep has a beatable window =============================');
{
    // scheduleEvents(): first = 460, last = repMs - (tell + 700). If that window
    // closes, events stop firing entirely and the drill is trivial.
    const src = fs.readFileSync(COMPONENT, 'utf8');
    const tell = (src.match(/tell:\s*\[([^\]]+)\]/) || [, '0,0,0'])[1].split(',').map(s => Number(s.trim()));
    for (let i = 0; i < 3; i++) {
        const first = 460;
        const last = LIVE.repMs[i] - (tell[i] + 700);
        if (VERBOSE) console.log(`    tier ${i + 1}: events may land ${first}..${Math.round(last)}ms of a ${LIVE.repMs[i]}ms rep`);
        if (last <= first) {
            fail(`tier ${i + 1}: no room left in the rep for an event`,
                `window ${first}..${Math.round(last)}ms -- repMs is too short for a ${tell[i]}ms telegraph`);
        }
        if (tell[i] < 300) {
            fail(`tier ${i + 1}: the telegraph is too short to react to`, `${tell[i]}ms`);
        }
    }
    if (!problems.length) console.log('  every tier leaves a usable event window and a readable telegraph.');
}

console.log('');
console.log('=== RESULT =========================================================');
if (!problems.length) {
    console.log('  All calibration assertions passed.');
    console.log('');
    process.exit(0);
}
for (const p of problems) {
    console.log(`  [FAIL] ${p.msg}`);
    console.log(`         ${p.evidence}`);
}
console.log('');
process.exit(1);
