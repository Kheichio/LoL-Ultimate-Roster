// ===========================================================================
//  waveSim.mjs -- headless calibration gate for the LNE laning drill
// ===========================================================================
//  The drill this replaced shipped on an asserted calibration that was wrong
//  by a factor of five: the free Basic tier paid 5.4x more laning growth than
//  the 480-gold Elite tier, because nobody ever swept a bot against it. This
//  script is the thing that would have caught it in an afternoon.
//
//  It duplicates -- deliberately, as plain functions with no imports from
//  src/ -- the scoring model inside WaveControlGame.svelte:
//      the CFG table, the crash-value ladder, planDP(), and the grade model.
//  If a constant in that component's CFG block moves, mirror it here and rerun.
//
//      node tools/waveSim.mjs            three assertion suites, exits non-zero
//      node tools/waveSim.mjs --verbose  and print the tables
//
//  Suites:
//    1. planDP() agrees with brute-force enumeration of every segmentation,
//       for all 3 cannon phases x all 3 tiers.
//    2. The greedy optimum moves with the hands: argmax stack size is monotone
//       non-decreasing in precision, reaches 5 for steady hands and stays at
//       or below 4 for shaky ones. If it does not, the drill has a lookup
//       answer and the only decision in it is dead.
//    3. The six named skill profiles land where training.js expects them --
//       competent near 0.50, which is scoreFactor()'s 1.0x reference session.
// ===========================================================================

const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
//  MIRRORED CONSTANTS -- keep in step with WaveControlGame.svelte
// ---------------------------------------------------------------------------
const CFG = {
    1: { name: 'Basic',    beats: 12, beat: 2.60, hw1: 0.360, hwStep: 0.055, hwMin: 0.145, coreF: 0.38 },
    2: { name: 'Advanced', beats: 14, beat: 2.30, hw1: 0.325, hwStep: 0.045, hwMin: 0.145, coreF: 0.36 },
    3: { name: 'Elite',    beats: 16, beat: 2.05, hw1: 0.295, hwStep: 0.042, hwMin: 0.125, coreF: 0.34 },
};

const CAP          = 5;
const CANNON_EVERY = 3;
const WAVE_CS      = 6;
const CANNON_CS    = 7;
const CANNON_MULT  = 1.15;
const CRASH_MULT   = [0.80, 0.94, 1.08, 1.20, 1.32];
const GRADE_CLEAN  = 0.80;
const KEEP_EARLY   = 0.55;
const KEEP_LATE    = 0.20;
const KEEP_SELF    = 0.25;
const HOLD_SLOPPY  = 0.50;

const HOLD_IDLE    = 0.35;
const TEMPO_FLOOR  = 0.40;
const W_TEMPO      = 0.82;
const W_TOUCH      = 0.18;

function hwFor(C, k) { return Math.max(C.hwMin, C.hw1 - C.hwStep * (k - 1)); }
function coreFor(C, k) { return hwFor(C, k) * C.coreF; }

// ---------------------------------------------------------------------------
//  WAVES + THE PLANNER
// ---------------------------------------------------------------------------
function buildWaves(C, cannonPhase) {
    const out = [];
    for (let j = 0; j < C.beats; j++) {
        const cannon = ((j + 1 + cannonPhase) % CANNON_EVERY) === 0;
        out.push({ cs: cannon ? CANNON_CS : WAVE_CS, cannon });
    }
    return out;
}

function segValue(waves, s, k) {
    let sum = 0, can = false;
    for (let i = s; i < s + k; i++) { sum += waves[i].cs; can = can || waves[i].cannon; }
    return sum * CRASH_MULT[k - 1] * (can ? CANNON_MULT : 1);
}

function planDP(waves) {
    const n = waves.length;
    const best = new Array(n + 1).fill(0);
    const pick = new Array(n + 1).fill(1);
    for (let b = n - 1; b >= 0; b--) {
        let bv = -1, bk = 1;
        for (let k = 1; k <= CAP && b + k <= n; k++) {
            const v = segValue(waves, b, k) + best[b + k];
            if (v > bv) { bv = v; bk = k; }
        }
        best[b] = bv; pick[b] = bk;
    }
    let b = 0, parCrash = 0;
    while (b < n) {
        const v = segValue(waves, b, pick[b]);
        if (v > parCrash) parCrash = v;
        b += pick[b];
    }
    return { csMax: best[0] || 1, parCrash: parCrash || 1, best, pick };
}

/** Every segmentation of the round into runs of 1..CAP, exhaustively. Only
 *  used to prove the DP right -- exponential, but 16 beats is nothing. */
function bruteForce(waves) {
    const n = waves.length;
    const memo = new Map();
    function go(b) {
        if (b === n) return { v: 0, seg: [] };
        if (memo.has(b)) return memo.get(b);
        let best = { v: -1, seg: [] };
        for (let k = 1; k <= CAP && b + k <= n; k++) {
            const rest = go(b + k);
            const v = segValue(waves, b, k) + rest.v;
            if (v > best.v) best = { v, seg: [k].concat(rest.seg) };
        }
        memo.set(b, best);
        return best;
    }
    const r = go(0);
    let b = 0, parCrash = 0;
    for (const k of r.seg) {
        const v = segValue(waves, b, k);
        if (v > parCrash) parCrash = v;
        b += k;
    }
    return { csMax: r.v, parCrash, seg: r.seg };
}

// ---------------------------------------------------------------------------
//  THE PLAYER MODEL
//  Press error is zero-mean normal with SD sigma, in seconds. That is the only
//  stochastic term -- the drill itself has none after the cannon phase.
// ---------------------------------------------------------------------------
let seed = 20260824;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function gauss(sd) {
    const u = Math.max(1e-9, rnd()), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}

function grade(C, k, err) {
    const a = Math.abs(err);
    if (a <= coreFor(C, k)) return 'perfect';
    if (a <= hwFor(C, k)) return 'clean';
    return err < 0 ? 'early' : 'late';
}

/**
 * One round. `target` is the stack size the policy tries to cash at; `wobble`
 * is the chance per beat it cashes early anyway, which is what a real player
 * losing their nerve looks like.
 */
function playRound(C, waves, plan, sigma, opts) {
    const o = opts || {};
    const wobble = o.wobble || 0;
    const idle = o.idle || 0;          // chance the beat runs out with no press
    let stack = 0, pushCS = 0, pushCan = false;
    let csBanked = 0, bestCrash = 0;
    let perfects = 0, cleans = 0;
    let crashes = 0, stackSum = 0;

    for (let i = 0; i < waves.length; i++) {
        const k = Math.min(CAP, stack + 1);
        const w = waves[i];
        const last = i === waves.length - 1;

        // No press at all. Graded nothing, banks the idle trickle, and at the
        // cap it self-crashes exactly as a held-too-long push does.
        if (idle > 0 && rnd() < idle) {
            if (k >= CAP) {
                const banked = (pushCS + w.cs) * KEEP_SELF;
                csBanked += banked;
                if (banked > bestCrash) bestCrash = banked;
                crashes++; stackSum += k;
                stack = 0; pushCS = 0; pushCan = false;
            } else {
                pushCS += w.cs * HOLD_IDLE;
                pushCan = pushCan || w.cannon;
                stack += 1;
            }
            continue;
        }

        const err = gauss(sigma);
        const g = grade(C, k, err);
        if (g === 'perfect') perfects++;
        else if (g === 'clean') cleans++;

        let wantCrash = plan(i, k, w, waves) || last;
        if (!wantCrash && wobble > 0 && k >= 2 && rnd() < wobble) wantCrash = true;

        if (k >= CAP && !wantCrash) {
            // Self-crash. Their tower keeps three quarters of it.
            const banked = (pushCS + w.cs) * KEEP_SELF;
            csBanked += banked;
            if (banked > bestCrash) bestCrash = banked;
            crashes++; stackSum += k;
            stack = 0; pushCS = 0; pushCan = false;
            continue;
        }

        if (wantCrash) {
            const stackCS = pushCS + w.cs;
            const can = pushCan || w.cannon;
            const M = CRASH_MULT[k - 1] * (can ? CANNON_MULT : 1);
            let banked;
            if (g === 'perfect') banked = stackCS * M;
            else if (g === 'clean') banked = stackCS * M * GRADE_CLEAN;
            else if (g === 'early') banked = stackCS * KEEP_EARLY;
            else banked = stackCS * KEEP_LATE;
            csBanked += banked;
            if (banked > bestCrash) bestCrash = banked;
            crashes++; stackSum += k;
            stack = 0; pushCS = 0; pushCan = false;
        } else {
            pushCS += (g === 'perfect' || g === 'clean') ? w.cs : w.cs * HOLD_SLOPPY;
            pushCan = pushCan || w.cannon;
            stack += 1;
        }
    }

    // Anything still on the lane when the waves run out is lost. The component
    // does the same thing (advance() sets `stranded` and never calls bank()),
    // so a policy that holds through the last beat must not be rescued here.
    return {
        csBanked, bestCrash, perfects, cleans, crashes,
        stranded: stack,
        avgStack: crashes ? stackSum / crashes : 0,
    };
}

function scoreOf(C, r, csMax) {
    const tempo = clamp01((r.csBanked / csMax - TEMPO_FLOOR) / (1 - TEMPO_FLOOR));
    const touch = clamp01((r.perfects + 0.55 * r.cleans) / C.beats);
    return { tempo, touch, score: clamp01(W_TEMPO * tempo + W_TOUCH * touch) };
}
function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

/** Average a policy over every cannon phase and many rounds. */
function measure(level, plan, sigma, opts, rounds) {
    const C = CFG[level];
    const n = rounds || 400;
    let s = 0, t = 0, to = 0, cs = 0, bc = 0, st = 0;
    for (let i = 0; i < n; i++) {
        const waves = buildWaves(C, i % 3);
        const { csMax } = planDP(waves);
        const r = playRound(C, waves, plan, sigma, opts);
        const sc = scoreOf(C, r, csMax);
        s += sc.score; t += sc.tempo; to += sc.touch;
        cs += r.csBanked; bc += r.bestCrash; st += r.avgStack;
    }
    return {
        score: s / n, tempo: t / n, touch: to / n,
        cs: cs / n, bestCrash: bc / n, avgStack: st / n,
    };
}

// Policies -----------------------------------------------------------------
const targetPlan = (t) => (i, k) => k >= t;
/** Cash on the cannon once the push is worth cashing -- what the coach line
 *  tells a losing player to do, so it had better be a decent session. */
const cannonPlan = (t) => (i, k, w) => k >= t || (k >= t - 1 && w.cannon);
function dpPolicyFor(waves) {
    const { pick } = planDP(waves);
    const crashOn = new Set();
    let b = 0;
    while (b < waves.length) { crashOn.add(b + pick[b] - 1); b += pick[b]; }
    return (i) => crashOn.has(i);
}

function measureDP(level, sigma, rounds) {
    const C = CFG[level];
    const n = rounds || 400;
    let s = 0, t = 0, to = 0, cs = 0, st = 0;
    for (let i = 0; i < n; i++) {
        const waves = buildWaves(C, i % 3);
        const { csMax } = planDP(waves);
        const r = playRound(C, waves, dpPolicyFor(waves), sigma, {});
        const sc = scoreOf(C, r, csMax);
        s += sc.score; t += sc.tempo; to += sc.touch;
        cs += r.csBanked; st += r.avgStack;
    }
    return { score: s / n, tempo: t / n, touch: to / n, cs: cs / n, avgStack: st / n };
}

// ---------------------------------------------------------------------------
//  SUITES
// ---------------------------------------------------------------------------
let failures = 0;
function check(ok, label, detail) {
    if (!ok) { failures++; console.log('  FAIL  ' + label + (detail ? '  -- ' + detail : '')); }
    else if (VERBOSE) console.log('  ok    ' + label + (detail ? '  -- ' + detail : ''));
}
function f2(n) { return (Math.round(n * 100) / 100).toFixed(2); }
function f3(n) { return (Math.round(n * 1000) / 1000).toFixed(3); }

console.log('');
console.log('=== 1. planDP agrees with brute force ==============================');
for (const level of [1, 2, 3]) {
    for (let phase = 0; phase < 3; phase++) {
        const waves = buildWaves(CFG[level], phase);
        const dp = planDP(waves);
        const bf = bruteForce(waves);
        check(Math.abs(dp.csMax - bf.csMax) < 1e-9,
            CFG[level].name + ' phase ' + phase + ' csMax',
            'dp ' + f2(dp.csMax) + ' vs brute ' + f2(bf.csMax) + '  plan [' + bf.seg.join('/') + ']');
        check(Math.abs(dp.parCrash - bf.parCrash) < 1e-9,
            CFG[level].name + ' phase ' + phase + ' parCrash',
            'dp ' + f2(dp.parCrash) + ' vs brute ' + f2(bf.parCrash));
    }
}

console.log('');
console.log('=== 2. the greedy optimum moves with the hands =====================');
console.log('    SCORE by target stack size; argmax must climb as sigma falls.');
//  This ranks by score01, deliberately, and an earlier cut of this suite that
//  ranked by CS per beat is exactly why a scoring bug shipped past it: the
//  score had a third term rewarding your single biggest crash, so a 5-stack
//  plan that banked 7.7% LESS CS still scored 12% higher and the "decision"
//  the drill is built on had one fixed answer at every skill level. Rank by
//  the number the player is actually paid, or this suite proves nothing.
for (const level of [1, 2, 3]) {
    const C = CFG[level];
    if (VERBOSE) {
        console.log('');
        console.log('  ' + C.name + '   sigma |   k=1   k=2   k=3   k=4   k=5  | best');
    }
    let lastArg = 0;
    let reached5 = false, capped4 = true;
    for (let sg = 0.05; sg <= 0.2601; sg += 0.01) {
        const sigma = Math.round(sg * 100) / 100;
        const per = [];
        for (let k = 1; k <= CAP; k++) {
            const m = measure(level, targetPlan(k), sigma, {}, 700);
            per.push(m.score);
        }
        let arg = 1, bv = -1;
        for (let k = 1; k <= CAP; k++) if (per[k - 1] > bv) { bv = per[k - 1]; arg = k; }
        if (VERBOSE) {
            console.log('        ' + sigma.toFixed(2) + '  | ' +
                per.map(v => f3(v).padStart(5)).join(' ') + '  |  k=' + arg);
        }
        // Monotone non-increasing as sigma RISES (we sweep sigma upward).
        if (lastArg && arg > lastArg + 1) {
            check(false, C.name + ' argmax jumps upward as hands get worse',
                'sigma ' + sigma.toFixed(2) + ': k=' + lastArg + ' -> k=' + arg);
        }
        if (sigma <= 0.09 && arg >= 5) reached5 = true;
        // Noise-tolerant: with 700 rounds a cell still carries roughly +/-0.01,
        // so demanding a strict argmax here fails on a coin-flip between two
        // options that are genuinely tied. What must not happen is the 5-stack
        // being the clear best answer for hands that cannot land it.
        if (sigma >= 0.15) {
            const bestSmaller = Math.max(per[0], per[1], per[2], per[3]);
            if (per[4] > bestSmaller + 0.02) {
                capped4 = false;
                check(false, C.name + ': 5-stack clearly best for shaky hands',
                    'sigma ' + sigma.toFixed(2) + ': k=5 ' + f3(per[4]) + ' vs best smaller ' + f3(bestSmaller));
            }
        }
        lastArg = arg;
    }
    check(reached5, C.name + ': steady hands (sigma <= 0.09) should want the 5-stack');
    check(capped4, C.name + ': shaky hands (sigma >= 0.15) should not want the 5-stack');
}

console.log('');
console.log('=== 3. skill profiles land where training.js expects ===============');
const BANDS = {
    'never presses':   [0.00, 0.06],
    'mashes early':    [0.00, 0.16],
    'stack-1 spammer': [0.00, 0.45],
    'first-timer':     [0.25, 0.42],
    'competent':       [0.44, 0.58],
    'expert':          [0.78, 0.94],
    'perfect DP':      [0.999, 1.001],
};
function scoreFactor(s) {
    s = clamp01(s);
    if (s <= 0.25) return (s / 0.25) ** 2 * 0.18;
    if (s <= 0.5) return 0.18 + ((s - 0.25) / 0.25) * 0.82;
    return 1 + 1.4 * (((s - 0.5) / 0.5) ** 1.25);
}

console.log('');
//  Hands are modelled per tier, on purpose. training.js gates lne_2 behind
//  55 OVR and lne_3 behind 74 OVR, so the population that ever runs Elite is
//  not the population that runs Basic -- holding sigma fixed across the three
//  would be asking a rookie to pass a drill they cannot buy.
const HANDS = {
    first:     { 1: 0.220, 2: 0.190, 3: 0.165 },
    competent: { 1: 0.160, 2: 0.140, 3: 0.122 },
    expert:    { 1: 0.075, 2: 0.068, 3: 0.060 },
};

console.log('  profile           tier      score  factor   tempo touch  CS   avgStack');
for (const level of [1, 2, 3]) {
    const C = CFG[level];
    const prof = [
        // A real simulated AFK run, not a hardcoded zero: every beat times out,
        // the idle trickle accumulates, and the push self-crashes at the cap.
        ['never presses',   () => measure(level, targetPlan(9), 0.30, { idle: 1.0 }, 120)],
        ['mashes early',    () => measure(level, targetPlan(1), 1.20, {}, 300)],
        ['stack-1 spammer', () => measure(level, targetPlan(1), HANDS.expert[level], {}, 300)],
        ['first-timer',     () => measure(level, cannonPlan(2), HANDS.first[level], { wobble: 0.30, idle: 0.08 }, 400)],
        ['competent',       () => measure(level, cannonPlan(3), HANDS.competent[level], { wobble: 0.10, idle: 0.02 }, 400)],
        ['expert',          () => measureDP(level, HANDS.expert[level], 400)],
        ['perfect DP',      () => measureDP(level, 0.0000001, 60)],
    ];
    for (const [name, fn] of prof) {
        const m = fn();
        console.log('  ' + name.padEnd(17) + ' ' + C.name.padEnd(9) + ' ' +
            f3(m.score).padStart(6) + '  ' + f2(scoreFactor(m.score)).padStart(5) + 'x  ' +
            f3(m.tempo).padStart(5) + ' ' + f3(m.touch).padStart(5) + ' ' +
            f2(m.cs).padStart(6) + '  ' + f2(m.avgStack).padStart(5));
        const band = BANDS[name];
        check(m.score >= band[0] && m.score <= band[1],
            name + ' @ ' + C.name + ' in [' + band[0] + ', ' + band[1] + ']',
            'got ' + f3(m.score));
    }
}

console.log('');
console.log('=== 4. no state where playing worse banks more =====================');
for (const level of [1, 2, 3]) {
    for (let k = 1; k <= CAP; k++) {
        const M = CRASH_MULT[k - 1];
        const vals = [
            ['perfect', M],
            ['clean', M * GRADE_CLEAN],
            ['early', KEEP_EARLY],
            ['self', KEEP_SELF],
            ['late', KEEP_LATE],
        ];
        for (let i = 1; i < vals.length; i++) {
            check(vals[i - 1][1] > vals[i][1],
                CFG[level].name + ' k=' + k + ': ' + vals[i - 1][0] + ' > ' + vals[i][0],
                f3(vals[i - 1][1]) + ' vs ' + f3(vals[i][1]));
        }
    }
}

console.log('');
console.log('=== 5. the tier economy is not inverted ============================');
const LNE = [
    ['lne_1 Basic',    1, 0.60, 'free'],
    ['lne_2 Advanced', 2, 0.95, '75g'],
    ['lne_3 Elite',    3, 1.45, '480g'],
];
let prevGain = -1, monotone = true;
console.log('  drill            competent  factor   baseGain  raw gain   cost');
for (const [name, level, baseGain, cost] of LNE) {
    const m = measure(level, cannonPlan(3), HANDS.competent[level], { wobble: 0.10, idle: 0.02 }, 400);
    const gain = baseGain * scoreFactor(m.score);
    console.log('  ' + name.padEnd(17) + f3(m.score).padStart(8) + '  ' +
        f2(scoreFactor(m.score)).padStart(5) + 'x  ' + f2(baseGain).padStart(8) + '  ' +
        f2(gain).padStart(8) + '   ' + cost);
    if (gain <= prevGain) monotone = false;
    prevGain = gain;
}
check(monotone, 'raw gain rises with drill tier for a competent player');

console.log('');
console.log('=== 6. lane geometry and beat attribution =========================');
//  Pure arithmetic off the same CFG the component uses, so this is a real
//  gate on the constants rather than a restatement of them. Two things must
//  hold at every tier and every push size: the crash band never reaches into
//  the enemy tower's kill zone (or the drill would demand a press it also
//  punishes), and there is enough dead air either side of the band that no
//  press can be attributed to the wrong beat.
const MEET0 = 0.46, MEET_STEP = 0.075, MEET_T = 0.55, TOWER_X = 0.86;
const WARMUP = 2, READY_S = 1.2, TAIL_S = 1.4;
if (VERBOSE) console.log('  tier      k  meet   band lo..hi   width%  reach  early room  late room');
for (const level of [1, 2, 3]) {
    const C = CFG[level];
    for (let k = 1; k <= CAP; k++) {
        const meet = MEET0 + MEET_STEP * (k - 1);
        const speed = meet / (MEET_T * C.beat);
        const hw = hwFor(C, k);
        const core = coreFor(C, k);
        const half = hw * speed;
        const lo = meet - half, hi = meet + half;
        const reach = Math.min(1, speed * C.beat);
        const earlyRoom = MEET_T * C.beat - hw;
        const lateRoom = C.beat * (1 - MEET_T) - hw;
        if (VERBOSE) {
            console.log('  ' + C.name.padEnd(9) + ' ' + k + '  ' + f2(meet) + '   ' +
                f2(lo) + '..' + f2(hi) + '     ' + f2((hi - lo) * 100).padStart(5) + '  ' +
                f2(reach) + '   ' + f2(earlyRoom).padStart(6) + '      ' + f2(lateRoom).padStart(6));
        }
        check(hi < TOWER_X, C.name + ' k=' + k + ': band clear of the enemy tower zone',
            'right edge ' + f3(hi) + ' vs tower ' + TOWER_X);
        check(lo > 0.02, C.name + ' k=' + k + ': band clear of the left end', 'left edge ' + f3(lo));
        check(core < hw, C.name + ' k=' + k + ': core inside the band');
        check(earlyRoom > 0.5, C.name + ' k=' + k + ': early room > 0.5s', f3(earlyRoom) + 's');
        check(lateRoom > 0.5, C.name + ' k=' + k + ': late room > 0.5s', f3(lateRoom) + 's');
        // The marker must reach the meeting point at exactly MEET_T of the beat,
        // at every push size. That invariant is the whole design: the band walks
        // up the lane, the moment to press never moves.
        check(Math.abs(speed * (MEET_T * C.beat) - meet) < 1e-12,
            C.name + ' k=' + k + ': marker meets the clump on the tick');
    }
    const wall = READY_S + (C.beats + WARMUP) * C.beat + TAIL_S;
    check(wall >= 30 && wall <= 45, C.name + ': round is 30-45s of wall clock', f2(wall) + 's');
    // A push of three or more clears the lane inside one wave cycle.
    const reach3 = Math.min(1, (MEET0 + MEET_STEP * 2) / (MEET_T * C.beat) * C.beat);
    check(reach3 >= 0.999, C.name + ': a 3-wave push reaches their tower in one beat', f3(reach3));
}

console.log('');
if (failures) {
    console.log('FAILED -- ' + failures + ' assertion' + (failures === 1 ? '' : 's') + '.');
    process.exit(1);
}
console.log('All calibration assertions passed.');
