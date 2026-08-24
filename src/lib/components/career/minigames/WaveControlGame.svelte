<script>
    // =====================================================================
    //  SLOW PUSH REPEATS - the LANING drill (attr 'lne')
    //  Self-contained. No store imports, no career imports, no assets.
    //
    //  A wave arrives on a metronome. Every beat you press one of two keys:
    //  HOLD to last hit and let the push grow, or CRASH to slam the whole
    //  push into their tower. A bigger push meets them further up the lane,
    //  moves faster and gets a tighter band. Five waves is the cap; hold a
    //  sixth and it crashes on its own and their tower keeps most of it.
    //
    //  The previous version of this drill asked you to steer the integral of
    //  a laggy, noisy velocity into two simultaneous windows using four
    //  cooldown-gated impulses, against a disturbance larger than the target
    //  window. A bot that could see every future event scored 0.40 out of
    //  1.0, and six of the eight goal transitions on Elite could not be
    //  completed by an omniscient optimal player. Laning is a clock, so this
    //  one is a clock: one input per beat, one window, and nothing random
    //  after the cannon phase is printed on screen before the first press.
    //
    //  The press moment never moves - it is always MEET_T through the beat.
    //  The band moves up the lane as the push grows; the moment does not.
    //  That is the whole thing a player learns, and it is the one sentence
    //  the coach says back to them at the end.
    //
    //  Calibration is asserted headlessly by tools/waveSim.mjs. Touch a
    //  constant in CFG and run it, or this drill regresses the way the last
    //  one did - silently, and only in the direction of "unplayable".
    // =====================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;      // 1 Basic, 2 Advanced, 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    // ASCII-only source is a repo rule (tools/careerRender.mjs) and PowerShell
    // has corrupted literal glyphs in this project before. Escapes only.
    const MINION = '\u25CF';       // held melee pip
    const CANNON_PIP = '\u25C6';   // held cannon pip
    const MID = '\u00b7';
    const PM = '\u00b1';

    // -- tuning ---------------------------------------------------------
    //  Four knobs and nothing else: more waves, a faster beat, a narrower
    //  window, a narrower core. CAP, the cannon cycle, the crash ladder and
    //  the cannon bonus are identical at every tier, because a drill that
    //  changes its rules when you pay more gold is a different drill, not a
    //  harder one.
    const CFG = {
        1: { name: 'Basic Drill', beats: 12, beat: 2.60, hw1: 0.360, hwStep: 0.055, hwMin: 0.145, coreF: 0.38 },
        2: { name: 'Advanced',    beats: 14, beat: 2.30, hw1: 0.325, hwStep: 0.045, hwMin: 0.145, coreF: 0.36 },
        3: { name: 'Elite',       beats: 16, beat: 2.05, hw1: 0.295, hwStep: 0.042, hwMin: 0.125, coreF: 0.34 },
    };

    const CAP          = 5;
    const CANNON_EVERY = 3;
    const WAVE_CS      = 6;
    const CANNON_CS    = 7;
    const CANNON_MULT  = 1.15;
    // A one-wave "crash" is a shove: six minions walk into their tower on
    // their own and it kills them. The ladder starts below 1 for exactly
    // that reason and only pays above 1 from three waves up. It is flatter
    // than it looks worth being - a steeper ladder makes capping out
    // unconditionally correct and deletes the only decision in the game.
    const CRASH_MULT   = [0.80, 0.94, 1.08, 1.20, 1.32];
    const GRADE_CLEAN  = 0.80;
    const KEEP_EARLY   = 0.55;
    const KEEP_LATE    = 0.20;
    const KEEP_SELF    = 0.25;
    const HOLD_SLOPPY  = 0.50;
    const HOLD_IDLE    = 0.35;

    const MEET0        = 0.46;
    const MEET_STEP    = 0.075;
    const MEET_T       = 0.55;      // share of the beat at which the waves meet
    const TOWER_X      = 0.86;
    const WARMUP       = 2;
    const READY_S      = 1.2;
    const TAIL_S       = 1.4;

    // Two terms, and deliberately not three. An earlier cut of this scored a
    // third "craft" term on your single biggest crash against the biggest on
    // the optimal plan, and it inverted the whole drill: a 5-stack plan banked
    // 7.7% LESS CS than a 3-stack plan at competent hands and still scored 12%
    // higher, because one huge crash was worth a third of the score on its own.
    // Any term that rewards crash SIZE independently of CS makes capping out
    // unconditionally correct and deletes the only decision in the game. The
    // crash ladder already pays you for building; how much you banked is
    // allowed to be the whole answer. Biggest crash is still shown on the
    // result panel - as information, not as points.
    const TEMPO_FLOOR  = 0.40;
    const W_TEMPO      = 0.82;
    const W_TOUCH      = 0.18;
    const REGRET_MIN   = 6;         // CS. Below this the round was well played.

    const LANE_STATE = [
        'EVEN ' + MID + ' the bounce is back at mid',
        'SLOW PUSH ' + MID + ' past mid',
        'SLOW PUSH ' + MID + ' their half',
        'BIG PUSH ' + MID + ' short of their tower',
        'OVERGROWN ' + MID + ' it crashes on its own',
    ];

    const CRASH_TAIL = [
        'One wave. That is a shove, not a crash.',
        'Two waves. Enough to make them choose.',
        'Three waves and the cannon. They lose the wave or they lose the plate.',
        'Four waves. That is a recall, a roam and a dragon.',
        'Five waves. Nothing they do about that is good for them.',
    ];

    const DEFAULT_LEDE = 'Build a wave, hold it, crash it on a timer. The most boring hour in '
        + 'professional League, and the one that decides who gets to leave lane first.';

    // -- helpers --------------------------------------------------------
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function clamp01(v) { return clamp(v, 0, 1); }
    /** Every numeric interpolation into an inline style goes through here.
     *  careerRender.mjs fails the run on a NaN or an undefined inside a
     *  style attribute, and that is the check that actually bites. */
    function pct(v) { const n = Number(v); return (Number.isFinite(n) ? clamp01(n) : 0) * 100; }
    function nowMs() {
        if (typeof performance !== 'undefined' && performance && performance.now) return performance.now();
        return Date.now();
    }
    function r0(n) { return Math.round(Number(n) || 0); }

    // -- reactive config ------------------------------------------------
    $: dLevel = clamp(Math.round(Number(difficulty) || 1), 1, 3);
    $: C = CFG[dLevel];
    $: title = (drill && drill.name) ? String(drill.name) : 'Slow Push Repeats';
    $: lede = (drill && drill.desc) ? String(drill.desc) : DEFAULT_LEDE;
    $: hwLo = Math.max(C.hwMin, C.hw1 - C.hwStep * (CAP - 1));

    // -- run state ------------------------------------------------------
    let view = 'intro';         // intro | play | result
    let phase = 'ready';        // ready | live | locked | tail
    let beatIdx = -WARMUP;      // -2, -1 warm-up; 0..beats-1 scored
    let beatT = 0, readyT = 0, tailT = 0;
    let beatK = 1;              // the push size this beat resolves at - fixed for the beat

    let waves = [];
    let csMax = 1, parCrash = 1;
    let planBest = [], planPick = [];

    let stack = 0, pushCS = 0, pushCan = false, segStart = 0;
    let csBanked = 0, bestCrash = 0;
    let perfects = 0, cleans = 0;
    let earlies = 0, lates = 0, noCalls = 0, selfCrashes = 0, sloppyHolds = 0;
    let crashCount = 0, crashesInWindow = 0, stackSum = 0;
    let streak = 0, bestStreak = 0;
    let stranded = 0;
    let events = [];

    let markerX = 0, pressX = -1;
    let previewCrash = 0, previewHold = 0;
    let feedKind = '', feedLine = '';
    let liveMsg = '';
    let res = null;
    let finished = false;
    let burst = false;
    // The result panel arrives on a timer, not on a keypress, and it lands
    // (1 - MEET_T) * beat + TAIL_S after the last press - 2.57s on Basic,
    // against a 2.60s beat. A player still keeping the rhythm would otherwise
    // press Space 30ms in and skip the entire coach read-out.
    let resultAt = 0;
    let lastGameKeyMs = 0;
    const RESULT_LOCK_MS = 900;

    let rafId = 0, burstTimer = null, lastT = 0, lastFrameMs = 0, destroyed = false;
    let reduceMotion = false, mq = null;

    // -- lifecycle ------------------------------------------------------
    function onMQ(e) { reduceMotion = !!e.matches; }

    onMount(() => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia) {
            try {
                mq = window.matchMedia('(prefers-reduced-motion: reduce)');
                reduceMotion = !!mq.matches;
                if (mq.addEventListener) mq.addEventListener('change', onMQ);
                else if (mq.addListener) mq.addListener(onMQ);
            } catch (e) { reduceMotion = false; }
        }
        window.addEventListener('keydown', onKey);
    });

    onDestroy(() => {
        destroyed = true;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (burstTimer) { clearTimeout(burstTimer); burstTimer = null; }
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
        if (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMQ);
            else if (mq.removeListener) mq.removeListener(onMQ);
            mq = null;
        }
    });

    // -- the round's waves, and the plan that scores it -----------------
    function buildWaves(cfg, cannonPhase) {
        const out = [];
        for (let j = 0; j < cfg.beats; j++) {
            const cannon = ((j + 1 + cannonPhase) % CANNON_EVERY) === 0;
            out.push({ n: j + 1, cs: cannon ? CANNON_CS : WAVE_CS, cannon });
        }
        return out;
    }

    function segValue(s, k) {
        let sum = 0, can = false;
        for (let i = s; i < s + k && i < waves.length; i++) {
            sum += waves[i].cs;
            can = can || waves[i].cannon;
        }
        return sum * CRASH_MULT[clamp(k, 1, CAP) - 1] * (can ? CANNON_MULT : 1);
    }

    /** The best possible round, by exhaustive segmentation into runs of
     *  1..CAP. O(beats * CAP). Two jobs: `csMax` is the score denominator, so
     *  a player who plays this plan with every press perfect banks exactly
     *  csMax and scores exactly 1.0 by construction; and `best`/`pick` are
     *  what the regret line reads, so the scorer and the explainer are the
     *  same object. `parCrash` is display-only - it is the "par crash" figure
     *  on the result panel and deliberately does NOT enter score01. Scoring
     *  the biggest single crash is what made capping out correct at every
     *  skill level in the first cut; do not wire it back in. */
    function planDP() {
        const n = waves.length;
        const best = new Array(n + 1).fill(0);
        const pick = new Array(n + 1).fill(1);
        for (let b = n - 1; b >= 0; b--) {
            let bv = -1, bk = 1;
            for (let k = 1; k <= CAP && b + k <= n; k++) {
                const v = segValue(b, k) + best[b + k];
                if (v > bv) { bv = v; bk = k; }
            }
            best[b] = bv; pick[b] = bk;
        }
        let b = 0, par = 0;
        while (b < n) {
            const v = segValue(b, pick[b]);
            if (v > par) par = v;
            b += pick[b];
        }
        planBest = best;
        planPick = pick;
        csMax = best[0] || 1;
        parCrash = par || 1;
    }

    // -- geometry (all fixed for the duration of one beat) --------------
    $: meetX = MEET0 + MEET_STEP * (beatK - 1);
    $: speedX = meetX / (MEET_T * C.beat);
    $: hwS = Math.max(C.hwMin, C.hw1 - C.hwStep * (beatK - 1));
    $: coreS = hwS * C.coreF;
    $: bandHalf = hwS * speedX;
    $: coreHalf = coreS * speedX;
    $: bandLo = clamp01(meetX - bandHalf);
    $: bandHi = clamp01(meetX + bandHalf);
    $: coreLo = clamp01(meetX - coreHalf);
    $: coreHi = clamp01(meetX + coreHalf);

    $: scored = beatIdx >= 0 && beatIdx < waves.length;
    $: curWave = scored ? waves[beatIdx] : { n: 0, cs: WAVE_CS, cannon: false };
    $: beatsLeft = Math.max(0, C.beats - Math.max(0, beatIdx));
    $: atCap = beatK >= CAP;
    $: lastBeat = scored && beatIdx === C.beats - 1;
    $: nextChips = waves.slice(Math.max(0, beatIdx + 1), Math.max(0, beatIdx + 1) + 4);
    $: laneState = LANE_STATE[clamp(beatK, 1, CAP) - 1];
    $: pips = buildPips(beatK, pushCan, curWave);

    function buildPips(k, can, w) {
        const out = [];
        for (let i = 0; i < k - 1; i++) out.push(can && i === 0 ? CANNON_PIP : MINION);
        out.push(w && w.cannon ? CANNON_PIP : MINION);
        return out;
    }

    function crashValue(k, cs, can, w) {
        const stackCS = cs + (w ? w.cs : 0);
        const cannon = can || (w ? w.cannon : false);
        return stackCS * CRASH_MULT[clamp(k, 1, CAP) - 1] * (cannon ? CANNON_MULT : 1);
    }

    // -- round lifecycle ------------------------------------------------
    function start() {
        waves = buildWaves(C, Math.floor(Math.random() * CANNON_EVERY));
        planDP();

        stack = 0; pushCS = 0; pushCan = false; segStart = 0;
        csBanked = 0; bestCrash = 0;
        perfects = 0; cleans = 0;
        earlies = 0; lates = 0; noCalls = 0; selfCrashes = 0; sloppyHolds = 0;
        crashCount = 0; crashesInWindow = 0; stackSum = 0;
        streak = 0; bestStreak = 0; stranded = 0;
        events = [];
        markerX = 0; pressX = -1; burst = false;
        beatIdx = -WARMUP; beatT = 0; readyT = 0; tailT = 0;
        beatK = 1;
        openBeat();
        feedKind = 'ready';
        feedLine = 'Warm up. Two waves, nothing scored.';
        liveMsg = 'Warm up. Press H when your wave meets theirs.';
        res = null; finished = false;
        phase = 'ready';
        view = 'play';
        lastT = 0; lastFrameMs = 0;
        if (typeof requestAnimationFrame === 'function') {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(frame);
        }
    }

    /** Everything that is constant for the beat about to be played. The
     *  button previews are snapshotted here rather than derived live, so a
     *  resolution cannot make the numbers flicker to the next beat's values
     *  while the player is still reading them. */
    function openBeat() {
        beatK = Math.min(CAP, stack + 1);
        pressX = -1;
        markerX = 0;
        const w = (beatIdx >= 0 && beatIdx < waves.length) ? waves[beatIdx] : { cs: WAVE_CS, cannon: false };
        previewCrash = crashValue(beatK, pushCS, pushCan, w);
        const ni = beatIdx + 1;
        const nw = (ni >= 0 && ni < waves.length) ? waves[ni] : null;
        if (beatK >= CAP) previewHold = (pushCS + w.cs) * KEEP_SELF;
        else if (nw) previewHold = crashValue(beatK + 1, pushCS + w.cs, pushCan || w.cannon, nw);
        else previewHold = 0;
    }

    function frame(t) {
        if (destroyed) return;
        rafId = requestAnimationFrame(frame);
        if (view !== 'play') return;
        lastFrameMs = nowMs();
        if (!lastT) { lastT = t; return; }
        let dt = (t - lastT) / 1000;
        lastT = t;
        if (dt > 0.05) dt = 0.05;
        if (dt <= 0) return;
        step(dt);
    }

    function step(dt) {
        if (phase === 'ready') {
            readyT += dt;
            if (readyT >= READY_S) { phase = 'live'; beatT = 0; }
            return;
        }
        if (phase === 'tail') {
            tailT += dt;
            if (tailT >= TAIL_S) endRound();
            return;
        }
        beatT += dt;
        markerX = Math.min(1, speedX * beatT);
        if (beatT >= C.beat) {
            if (phase === 'live') resolve(null, C.beat);
            beatT -= C.beat;
            if (!(beatT >= 0) || beatT > C.beat) beatT = 0;   // a tab-out cannot desync the metronome
            advance();
        }
    }

    function advance() {
        beatIdx += 1;
        if (beatIdx >= C.beats) {
            stranded = stack;
            phase = 'tail';
            tailT = 0;
            if (stranded > 0) {
                feedKind = 'bad';
                feedLine = 'The round ended with ' + stranded + ' wave' + (stranded === 1 ? '' : 's')
                    + ' still on the lane. Nothing on the lane is banked.';
                liveMsg = 'Round over. ' + stranded + ' waves left on the lane, unbanked.';
            }
            return;
        }
        openBeat();
        phase = 'live';
        if (beatIdx === -1) {
            feedKind = 'ready';
            feedLine = 'Now press SPACE to crash it.';
            liveMsg = 'Warm up. Now press Space to crash it.';
        } else if (beatIdx === 0) {
            feedKind = 'ready';
            feedLine = 'Warm-up over. Go.';
            liveMsg = 'Warm up over. Wave one.';
        } else if (beatK >= CAP) {
            liveMsg = 'Five waves. Last chance, crash it.';
        } else if (beatIdx === C.beats - 1) {
            liveMsg = 'Last wave. Cash it.';
        }
    }

    function gradeOf(k, delta) {
        const a = Math.abs(delta);
        const hw = Math.max(C.hwMin, C.hw1 - C.hwStep * (k - 1));
        if (a <= hw * C.coreF) return 'perfect';
        if (a <= hw) return 'clean';
        return delta < 0 ? 'early' : 'late';
    }

    function feed(kind, line) { feedKind = kind; feedLine = line; }

    function pulse() {
        if (reduceMotion) return;
        burst = true;
        if (burstTimer) clearTimeout(burstTimer);
        burstTimer = setTimeout(() => { burstTimer = null; burst = false; }, 380);
    }

    /**
     * Resolve the current beat. `kind` is 'hold', 'crash' or null for a beat
     * that ran out with no press. Everything a player can do lands here, and
     * every branch banks something - there is no state that pays zero and no
     * state in which playing worse banks more.
     */
    function resolve(kind, pressT) {
        if (phase !== 'live') return;
        phase = 'locked';

        const warm = beatIdx < 0;
        const w = warm ? { cs: WAVE_CS, cannon: false } : waves[beatIdx];
        const k = beatK;
        const target = MEET_T * C.beat;
        let g = 'none', delta = 0;

        if (kind) {
            delta = pressT - target;
            g = gradeOf(k, delta);
            pressX = Math.min(1, speedX * pressT);
        }

        if (warm) {
            if (beatIdx === -2) {
                stack = 1; pushCS = w.cs; pushCan = false;
                feed(kind === 'crash' ? 'bad' : 'good',
                    kind === 'crash'
                        ? 'That was the crash key. Hold first - the wave has to grow before it is worth cashing.'
                        : 'Held. That wave is now part of your push.');
            } else {
                stack = 0; pushCS = 0; pushCan = false;
                feed(kind === 'crash' ? 'good' : 'bad',
                    kind === 'crash'
                        ? 'Crashed. The lane bounces back to your side and you start again.'
                        : 'That was the hold key. SPACE cashes the push into their tower.');
            }
            return;
        }

        const inWindow = g === 'perfect' || g === 'clean';
        if (g === 'perfect') perfects++;
        else if (g === 'clean') cleans++;
        if (inWindow) { streak++; if (streak > bestStreak) bestStreak = streak; }
        else streak = 0;

        const stackCS = pushCS + w.cs;
        const can = pushCan || w.cannon;

        if (kind === 'crash') {
            const M = CRASH_MULT[k - 1] * (can ? CANNON_MULT : 1);
            let banked, line;
            if (g === 'perfect') {
                banked = stackCS * M;
                line = 'Perfect crash. +' + r0(banked) + ' CS. ' + CRASH_TAIL[k - 1];
            } else if (g === 'clean') {
                banked = stackCS * M * GRADE_CLEAN;
                line = 'Crashed. +' + r0(banked) + ' CS. ' + CRASH_TAIL[k - 1];
            } else if (g === 'early') {
                earlies++;
                banked = stackCS * KEEP_EARLY;
                line = 'You shoved before the waves met. It bounced straight back and you got scraps. +'
                    + r0(banked) + ' CS.';
            } else {
                lates++;
                banked = stackCS * KEEP_LATE;
                line = (markerX >= TOWER_X
                    ? 'Too slow. It died under their tower and you got almost nothing. +'
                    : 'Too slow. Their laner walked up and took it off you. +') + r0(banked) + ' CS.';
            }
            if (inWindow) crashesInWindow++;
            // `stackCS * M` is what this crash would have paid with a perfect
            // press, so the difference is what the PRESS cost - as opposed to
            // what the holds that built the push cost, which is a different
            // mistake with a different coaching line.
            bank(banked, k, g, delta, false, stackCS * M);
            feed(inWindow ? 'good' : 'bad', line);
            if (inWindow) pulse();
            liveMsg = inWindow
                ? 'Crashed ' + k + ' waves, ' + r0(banked) + ' CS. ' + CRASH_TAIL[k - 1]
                : (g === 'early' ? 'Shoved early. Scraps.' : 'Too late. Their tower took it.');
            return;
        }

        if (k >= CAP) {
            // HOLD or no call at the cap. A five-wave slow push crashes on
            // its own and their tower keeps three quarters of it.
            selfCrashes++;
            if (!kind) noCalls++;
            const banked = stackCS * KEEP_SELF;
            bank(banked, k, g, delta, true, stackCS * CRASH_MULT[k - 1] * (can ? CANNON_MULT : 1));
            feed('bad', 'It got too big to hold. It crashed on its own and their tower ate most of it. +'
                + r0(banked) + ' CS.');
            liveMsg = 'It crashed on its own. ' + r0(banked) + ' CS.';
            return;
        }

        if (kind === 'hold') {
            if (beatIdx === C.beats - 1) {
                // Holding the last wave strands the whole push. Say so now,
                // rather than letting a green "nicely held" sit on screen for
                // a beat and then silently binning the round's biggest asset.
                pushCS += inWindow ? w.cs : w.cs * HOLD_SLOPPY;
                if (!inWindow) { sloppyHolds++; if (g === 'early') earlies++; else lates++; }
                pushCan = pushCan || w.cannon;
                stack += 1;
                feed('bad', 'That was the last wave. The push never got cashed and none of it counts.');
                liveMsg = 'Held the last wave. The push is stranded.';
                return;
            }
            if (inWindow) {
                pushCS += w.cs;
                feed('good', g === 'perfect'
                    ? 'Last hit on the tick. The wave does not move an inch.'
                    : 'Held. Their wave lives, yours grows.');
            } else {
                sloppyHolds++;
                if (g === 'early') earlies++; else lates++;
                pushCS += w.cs * HOLD_SLOPPY;
                feed('bad', g === 'early'
                    ? 'Early. You shoved into it at full strength and lost half of it.'
                    : 'Late. Half the wave died before you touched it.');
            }
        } else {
            noCalls++;
            pushCS += w.cs * HOLD_IDLE;
            feed('bad', 'You never touched the wave. Most of it died to nobody.');
            liveMsg = 'No call. Most of the wave died to nobody.';
        }
        pushCan = pushCan || w.cannon;
        stack += 1;
    }

    function bank(amount, k, g, delta, isSelf, ifPerfect) {
        csBanked += amount;
        if (amount > bestCrash) bestCrash = amount;
        crashCount++;
        stackSum += k;
        events.push({
            beat: beatIdx, start: segStart, k, banked: amount, grade: g, delta,
            self: !!isSelf,
            // What the press cost, and what the build cost, kept apart. Rolling
            // them together made the result screen blame a press it had just
            // called perfect for CS that four sloppy holds had actually lost.
            pressLoss: Math.max(0, ifPerfect - amount),
            buildLoss: Math.max(0, segValue(segStart, k) - ifPerfect),
        });
        stack = 0; pushCS = 0; pushCan = false;
        segStart = beatIdx + 1;
    }

    // -- input ----------------------------------------------------------
    function subFrame() {
        if (!lastFrameMs) return 0;
        const d = (nowMs() - lastFrameMs) / 1000;
        return (Number.isFinite(d) && d > 0) ? Math.min(0.05, d) : 0;
    }

    function press(kind) {
        if (view !== 'play' || phase !== 'live') return;
        resolve(kind, beatT + subFrame());
    }

    // Escape is swallowed by MinigameHost at window capture phase and is
    // deliberately not bound here. Everything else is ours.
    function onKey(e) {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

        // A focused button gets to be itself, in EVERY view. Hoisted above the
        // view branches on purpose: when this test lived only in the play
        // branch, Enter on the intro's Back button started the drill, and
        // Enter on the host's close X on the result screen banked the session
        // instead of discarding it. Same guard as FocusFireGame.
        const onButton = !!(e.target && e.target.tagName === 'BUTTON');
        const dismiss = e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';

        if (view === 'intro') {
            if (e.key === 'Enter' && !onButton) { e.preventDefault(); start(); }
            return;
        }
        if (view === 'result') {
            // Scoped preventDefault: Tab and the arrow keys have to keep
            // working, or a keyboard user cannot reach Finish or scroll the
            // panel during the lock.
            if (!dismiss || onButton) return;
            e.preventDefault();
            if (nowMs() - resultAt < RESULT_LOCK_MS) return;
            // Still keeping the metronome? Then this press is muscle memory
            // from the round, not a decision to leave. One beat of quiet is
            // the difference, and every stray press pushes it back.
            if (nowMs() - lastGameKeyMs < C.beat * 1250) return;
            done();
            return;
        }
        if (dismiss && onButton) return;

        // preventDefault regardless of phase: a game key pressed during the
        // locked tail of a beat must not scroll .mh-body or re-fire a focused
        // button, even though it no longer resolves anything.
        const k = e.key;
        if (k === 'h' || k === 'H' || k === '1' || k === 'ArrowLeft') {
            e.preventDefault();
            lastGameKeyMs = nowMs();
            press('hold');
            return;
        }
        if (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === '2' || k === 'ArrowRight') {
            e.preventDefault();
            lastGameKeyMs = nowMs();
            press('crash');
        }
    }

    // -- result ---------------------------------------------------------
    function verdictFor(s) {
        if (s >= 0.90) return 'Lane Dominant';
        if (s >= 0.78) return 'Dictating Tempo';
        if (s >= 0.62) return 'In Control';
        if (s >= 0.45) return 'Even Lane';
        if (s >= 0.28) return 'Losing Tempo';
        return 'Perma-Shoved';
    }

    function verdictLine(v) {
        if (v === 'Lane Dominant') return 'They did not get a wave they wanted all session.';
        if (v === 'Dictating Tempo') return 'Every crash landed where you called it. That is a lane you can leave.';
        if (v === 'In Control') return 'You built and you cashed. A couple got away from you.';
        if (v === 'Even Lane') return 'You farmed. You did not dictate.';
        if (v === 'Losing Tempo') return 'The wave decided where it went more often than you did.';
        return 'You cleared on arrival and never built anything.';
    }

    /** Chosen from the failure mode, not from the score. First match wins. */
    function coachLine(avgStack) {
        if (noCalls >= 3) {
            return 'You are watching the wave instead of the clock. The press is always at the same point in '
                + 'the beat - the band moves up the lane, the moment does not.';
        }
        if (earlies > lates && earlies >= 3) {
            return 'You are pressing before the waves meet. Shoving into a full wave bounces it straight back '
                + 'at you. Wait for the clump.';
        }
        if (lates > earlies && lates >= 3) {
            return 'You are late. Their tower is the last thing on the lane and it does not share.';
        }
        if (selfCrashes >= 2) {
            return 'Two pushes got away from you. At five waves it crashes itself and their tower keeps three '
                + 'quarters of it - cash at four and take the CS.';
        }
        if (crashCount > 0 && avgStack < 1.6) {
            return 'You cleared every wave the moment it arrived. That is a safe lane and a poor one. Hold two '
                + 'and crash on the cannon.';
        }
        if (avgStack > 4.2 && (earlies + lates) > C.beats * 0.25) {
            return 'You are stacking further than your hands can cash. Four waves you land beats five you miss, '
                + 'every time.';
        }
        if (sloppyHolds >= 4) {
            return 'Your holds cost as much as your crashes. Half a wave lost on every build is a whole wave '
                + 'lost every second crash.';
        }
        return 'That is the cycle: build it, crash it on the cannon, catch the bounce, build it again.';
    }

    /** Blame the decision or blame the hands, whichever actually cost more,
     *  using the same DP that set the denominator. */
    function regretLine() {
        let plan = null, self = null, press = null, build = null;
        for (const e of events) {
            const s = e.start;
            if (s < 0 || s >= waves.length || s + e.k > waves.length) continue;
            const gap = (planBest[s] || 0) - (segValue(s, e.k) + (planBest[s + e.k] || 0));
            if (gap > 0 && (!plan || gap > plan.gap)) plan = { gap, e, alt: planPick[s] || 1 };

            if (e.self) {
                // A push that crashed itself is neither a bad press nor a bad
                // build, and it is the single most expensive thing that can
                // happen in the drill. It gets its own sentence or it falls
                // through to "no wasted call", which would be a lie.
                if (e.pressLoss > 0 && (!self || e.pressLoss > self.loss)) self = { loss: e.pressLoss, e };
                continue;
            }
            // Only a mistimed press is a press mistake. A perfect crash has a
            // pressLoss of exactly 0 and can never be blamed here.
            if (e.grade === 'early' || e.grade === 'late' || e.grade === 'clean') {
                if (e.pressLoss > 0 && (!press || e.pressLoss > press.loss)) press = { loss: e.pressLoss, e };
            }
            if (e.buildLoss > 0 && (!build || e.buildLoss > build.loss)) build = { loss: e.buildLoss, e };
        }

        // Blame whichever actually cost the most, not whichever is checked
        // first. Reporting a 7 CS press while a 14 CS build on the same push
        // goes unmentioned is how the old version taught the wrong lesson.
        const cand = [
            plan && { loss: plan.gap, kind: 'plan', d: plan },
            self && { loss: self.loss, kind: 'self', d: self },
            press && { loss: press.loss, kind: 'press', d: press },
            build && { loss: build.loss, kind: 'build', d: build },
        ].filter(c => c && c.loss >= REGRET_MIN);
        if (!cand.length) return 'No wasted call. The plan was right and the hands kept up.';

        let top = cand[0];
        for (const c of cand) if (c.loss > top.loss) top = c;
        const e = top.d.e;

        if (top.kind === 'plan') {
            return 'Beat ' + (e.beat + 1) + ': you crashed ' + e.k + ' wave' + (e.k === 1 ? '' : 's')
                + ' for ' + r0(e.banked) + ' CS. Crashing ' + top.d.alt + ' on beat '
                + (e.start + top.d.alt) + ' was worth ' + r0(top.loss) + ' more across the rest of the lane.';
        }
        if (top.kind === 'self') {
            return 'The push on beat ' + (e.beat + 1) + ' got to ' + e.k
                + ' waves and crashed itself. Their tower kept ' + r0(top.loss)
                + ' CS you had already built - cash at four and take it.';
        }
        if (top.kind === 'press') {
            return 'Beat ' + (e.beat + 1) + ': a ' + e.k + '-wave crash, ' + Math.abs(e.delta).toFixed(2)
                + 's ' + (e.delta < 0 ? 'early' : 'late') + '. That one press cost ' + r0(top.loss) + ' CS.';
        }
        return 'The push you cashed on beat ' + (e.beat + 1) + ' should have been worth '
            + r0(top.loss) + ' CS more. You lost that building it, not crashing it - '
            + 'a wave you last hit late is half a wave.';
    }

    function endRound() {
        if (view !== 'play') return;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }

        const tempo = clamp01((csBanked / (csMax || 1) - TEMPO_FLOOR) / (1 - TEMPO_FLOOR));
        const touch = clamp01((perfects + 0.55 * cleans) / C.beats);
        const score = clamp01(Math.round((W_TEMPO * tempo + W_TOUCH * touch) * 1000) / 1000);
        const avgStack = crashCount > 0 ? stackSum / crashCount : 0;
        const label = verdictFor(score);

        res = {
            score, label,
            line: verdictLine(label),
            coach: coachLine(avgStack),
            regret: regretLine(),
            tempo, touch, avgStack,
            csBanked: r0(csBanked),
            csMax: r0(csMax),
            bestCrash: r0(bestCrash),
            parCrash: r0(parCrash),
        };
        liveMsg = 'Session over. ' + Math.round(score * 100) + ' out of 100. ' + label + '.';
        resultAt = nowMs();
        view = 'result';
    }

    function done() {
        if (finished || !res) return;
        finished = true;
        const detail = res.csBanked + ' CS ' + MID + ' ' + crashCount + ' crash'
            + (crashCount === 1 ? '' : 'es') + ' ' + MID + ' biggest ' + res.bestCrash + ' ' + MID + ' '
            + perfects + '/' + C.beats + ' on the beat';
        const meta = {
            label: res.label,
            accuracy: Math.round(res.touch * 1000) / 1000,
            hits: crashesInWindow,
            misses: earlies + lates + selfCrashes,
            streak: bestStreak,
            best: bestStreak,
            detail,
            difficulty: dLevel,
            game: 'wave',
            attr: 'lne',
            biggestCrash: res.bestCrash,
            csBanked: res.csBanked,
            csMax: res.csMax,
            avgStack: Math.round(res.avgStack * 10) / 10,
        };
        // Last statement: Training.svelte tears this component down inside
        // the callback, so nothing may touch component state after it.
        if (typeof onComplete === 'function') onComplete(res.score, meta);
    }

    function back() { if (typeof onQuit === 'function') onQuit(); }

    // -- derived display ------------------------------------------------
    $: laneLabel = 'Lane. ' + beatK + ' wave' + (beatK === 1 ? '' : 's') + ' in the push. '
        + laneState.split(MID).join('-') + '. Crash band plus or minus ' + hwS.toFixed(2)
        + ' seconds. ' + beatsLeft + ' waves left.';
    $: holdAria = !scored
        ? 'Hold the wave. Last hit only and add it to the push.'
        : atCap
            ? 'Hold the wave. At five waves it crashes on its own for about ' + r0(previewHold) + ' CS.'
            : lastBeat
                ? 'Hold the wave. This is the last wave, so holding strands the whole push and loses '
                  + 'about ' + r0(previewCrash) + ' CS.'
                : 'Hold the wave. Last hit only and add it to the push, worth about ' + r0(previewHold)
                  + ' CS if you crash next beat.';
    $: crashAria = 'Crash the push into their tower now for about ' + r0(previewCrash) + ' CS.';
</script>

<section class="wc" class:rm={reduceMotion}>
    <header class="wc-head">
        <div class="wc-head-l">
            <span class="wc-chip">LNE &middot; Laning</span>
            <h2 class="wc-title">{title}</h2>
        </div>
        <span class="wc-diff">{C.name}</span>
    </header>

    <!-- == INTRO ====================================================== -->
    {#if view === 'intro'}
        <div class="wc-panel">
            <p class="wc-lede">{lede}</p>

            <div class="wc-lab">How to play</div>
            <ol class="wc-how">
                <li>A wave arrives every beat. Your wave walks up the lane and meets theirs at the
                    amber band. <b>Press when it gets there.</b></li>
                <li><b>HOLD (H)</b> &mdash; last hit only. The wave joins your push and the push grows.</li>
                <li><b>CRASH (SPACE)</b> &mdash; clear the lot. The whole push slams into their tower
                    and banks as CS.</li>
                <li>A bigger push meets them further up the lane, moves faster and gets a tighter band.
                    One wave is a shove and pays under the odds. Three or more is a crash.</li>
                <li>Five waves is as far as it goes. Hold a sixth and it crashes on its own and their
                    tower keeps most of it.</li>
                <li>Every third wave is a cannon and is worth more. The <b>NEXT</b> strip tells you
                    which ones, before the first beat.</li>
                <li>Cash before the lane runs out. Anything still on the lane after the last wave
                    is <b>lost</b> &mdash; only what you crashed counts.</li>
            </ol>

            <div class="wc-chips">
                <span class="wc-spec">{C.beats} waves</span>
                <span class="wc-spec">{C.beat.toFixed(2)}s beat</span>
                <span class="wc-spec">cannon every {CANNON_EVERY}</span>
                <span class="wc-spec">band {PM}{C.hw1.toFixed(2)}s to {PM}{hwLo.toFixed(2)}s</span>
                <span class="wc-spec">cap {CAP} waves</span>
            </div>

            <p class="wc-note">Two warm-up waves first, and they are not scored.</p>

            <div class="wc-btns">
                <button type="button" class="wc-btn wc-btn-ghost"
                        aria-label="Back out of this drill without training" on:click={back}>Back</button>
                <button type="button" class="wc-btn wc-btn-go"
                        aria-label="Start the laning drill" on:click={start}>Start Drill</button>
            </div>
        </div>

    <!-- == PLAY ======================================================= -->
    {:else if view === 'play'}
        <div class="wc-panel wc-play" class:cap={atCap && scored} class:burst={burst}>

            <div class="wc-hud">
                <div class="wc-cell"><span class="wc-hv">{r0(csBanked)}</span><span class="wc-lab">CS banked</span></div>
                <div class="wc-cell"><span class="wc-hv">{r0(bestCrash)}</span><span class="wc-lab">Biggest</span></div>
                <div class="wc-cell"><span class="wc-hv" class:hot={stack >= 3}>{stack}</span><span class="wc-lab">On the lane</span></div>
                <div class="wc-cell"><span class="wc-hv">{perfects}</span><span class="wc-lab">On the beat</span></div>
                <div class="wc-cell"><span class="wc-hv" class:warn={beatsLeft <= 1}>{beatsLeft}</span><span class="wc-lab">Waves left</span></div>
            </div>

            <div class="wc-laneline">
                <span class="wc-lab">The lane</span>
                <span class="wc-state" class:cap={atCap && scored}>
                    {#if atCap && scored}LAST CHANCE &middot; CRASH IT{:else}{laneState}{/if}
                </span>
            </div>

            <div class="wc-lane" role="img" aria-label={laneLabel}>
                <div class="wc-tower wc-tower-you" aria-hidden="true"></div>
                <div class="wc-tower wc-tower-them" style="left:{pct(TOWER_X)}%" aria-hidden="true"></div>
                <div class="wc-band" style="left:{pct(bandLo)}%;width:{pct(bandHi - bandLo)}%" aria-hidden="true"></div>
                <div class="wc-core" style="left:{pct(coreLo)}%;width:{pct(coreHi - coreLo)}%" aria-hidden="true"></div>
                <div class="wc-clump" style="left:{pct(meetX)}%" aria-hidden="true"></div>
                {#if pressX >= 0}
                    <div class="wc-ghost" style="left:{pct(pressX)}%" aria-hidden="true"></div>
                {/if}
                <div class="wc-mark" class:dead={phase === 'locked'} style="left:{pct(markerX)}%" aria-hidden="true">
                    <span class="wc-pips">{pips.join('')}</span>
                </div>
            </div>
            <div class="wc-trackfoot" aria-hidden="true">
                <span>your tower</span>
                <span class="wc-bandw">crash band {PM}{hwS.toFixed(2)}s</span>
                <span>their tower</span>
            </div>

            <div class="wc-next">
                <span class="wc-lab">Next</span>
                {#each nextChips as w (w.n)}
                    <span class="wc-nextchip" class:cannon={w.cannon}>{w.n}{#if w.cannon} cannon{/if}</span>
                {/each}
            </div>

            <div class="wc-feed wc-feed-{feedKind}">{feedLine}</div>

            <div class="wc-acts">
                <!-- pointerdown for the mouse (no click delay), and a click
                     handler that only fires for e.detail === 0, which is how a
                     keyboard-synthesised click identifies itself. Without the
                     second one these buttons cannot be operated by keyboard.

                     aria-disabled rather than disabled, deliberately: the lock
                     flips at every beat boundary, and disabling the focused
                     element makes the browser blur it to <body>, which silently
                     broke the keyboard path after exactly one beat and dropped
                     the player onto the host's close button on the next Tab.
                     press() already refuses anything outside phase 'live'. -->
                <button type="button" class="wc-act hold" class:off={phase !== 'live'}
                        aria-disabled={phase !== 'live'}
                        aria-label={holdAria}
                        on:pointerdown|preventDefault={() => press('hold')}
                        on:click={(e) => { if (e.detail === 0) press('hold'); }}>
                    <span class="wc-act-k">H</span>
                    <span class="wc-act-n">{#if atCap && scored}HOLD &middot; it crashes itself{:else}HOLD{/if}</span>
                    <span class="wc-act-d">last hit, build the push</span>
                    <span class="wc-act-v" class:danger={scored && (atCap || lastBeat)}>
                        {#if !scored}warm-up
                        {:else if atCap}self-crash {r0(previewHold)} CS
                        {:else if lastBeat}strands {r0(previewCrash)} CS
                        {:else}builds to {r0(previewHold)} CS{/if}
                    </span>
                </button>
                <button type="button" class="wc-act crash" class:off={phase !== 'live'}
                        aria-disabled={phase !== 'live'}
                        aria-label={crashAria}
                        on:pointerdown|preventDefault={() => press('crash')}
                        on:click={(e) => { if (e.detail === 0) press('crash'); }}>
                    <span class="wc-act-k">SPACE</span>
                    <span class="wc-act-n">CRASH</span>
                    <span class="wc-act-d">cash the push into their tower</span>
                    <span class="wc-act-v">
                        {#if !scored}warm-up{:else}crash now {r0(previewCrash)} CS{/if}
                    </span>
                </button>
            </div>
        </div>

    <!-- == RESULT ===================================================== -->
    {:else}
        <div class="wc-panel wc-result">
            <div class="wc-lab">Session score</div>
            <div class="wc-score">{Math.round(res.score * 100)}</div>
            <div class="wc-verdict">{res.label}</div>
            <p class="wc-vline">{res.line}</p>

            <div class="wc-grid">
                <div class="wc-gcell"><span class="wc-cv">{res.csBanked}</span><span class="wc-cl">CS banked</span></div>
                <div class="wc-gcell"><span class="wc-cv">{res.csMax}</span><span class="wc-cl">Par</span></div>
                <div class="wc-gcell"><span class="wc-cv">{res.bestCrash}</span><span class="wc-cl">Biggest crash</span></div>
                <div class="wc-gcell"><span class="wc-cv">{res.parCrash}</span><span class="wc-cl">Par crash</span></div>
                <div class="wc-gcell"><span class="wc-cv">{perfects}/{C.beats}</span><span class="wc-cl">On the beat</span></div>
                <div class="wc-gcell"><span class="wc-cv">{res.avgStack.toFixed(1)}</span><span class="wc-cl">Avg stack</span></div>
            </div>

            <p class="wc-regret">{res.regret}</p>
            <p class="wc-coach">{res.coach}</p>

            <button type="button" class="wc-btn wc-btn-go wc-done"
                    aria-label="Finish the session and bank the result" on:click={done}>Finish Session</button>
        </div>
    {/if}

    <p class="wc-live" aria-live="polite" aria-atomic="true">{liveMsg}</p>
</section>

<style>
    .wc {
        --acc: #f59e0b;
        --acc-dim: rgba(245, 158, 11, 0.15);
        max-width: 760px;
        margin: 0 auto;
        color: #e2e8f0;
        font-family: inherit;
    }

    /* -- head -------------------------------------------------------- */
    .wc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .wc-head-l { min-width: 0; }
    .wc-chip {
        display: inline-block; font-size: 9px; font-weight: 900; letter-spacing: 1.5px;
        text-transform: uppercase; color: var(--acc);
        background: rgba(245, 158, 11, 0.10); border: 1px solid var(--acc-dim);
        border-radius: 999px; padding: 3px 9px;
    }
    .wc-title { font-size: 21px; font-weight: 900; color: #e2e8f0; margin-top: 6px; line-height: 1.1; }
    .wc-diff {
        font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase;
        color: #64748b; background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 999px; padding: 5px 11px;
    }

    .wc-panel {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid var(--acc-dim);
        border-radius: 20px;
        padding: 18px;
    }
    .wc-lab { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #475569; display: block; }

    /* -- intro ------------------------------------------------------- */
    .wc-lede { font-size: 13px; line-height: 1.65; color: #94a3b8; margin-bottom: 18px; }
    .wc-how { list-style: none; margin: 9px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .wc-how li {
        font-size: 12px; line-height: 1.6; color: #94a3b8;
        padding: 9px 12px; border-radius: 11px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-left: 2px solid rgba(245, 158, 11, 0.5);
    }
    .wc-how b { color: #fbbf24; font-weight: 800; }

    .wc-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; }
    .wc-spec {
        font-size: 9px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase;
        color: #64748b; background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.35); border-radius: 999px; padding: 4px 10px;
    }
    .wc-note { font-size: 10px; color: #475569; line-height: 1.6; margin-top: 12px; }

    .wc-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap; }
    .wc-btn {
        padding: 11px 22px; border-radius: 12px; font-size: 12px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1px; cursor: pointer; border: none;
        font-family: inherit; transition: box-shadow .15s ease, transform .15s ease, background .15s ease, color .15s ease;
    }
    .wc-btn-ghost { background: rgba(51, 65, 85, 0.45); color: #94a3b8; border: 1px solid rgba(71, 85, 105, 0.4); }
    .wc-btn-ghost:hover { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .wc-btn-go { background: linear-gradient(135deg, #d97706, #f59e0b); color: #1c1917; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.22); }
    .wc-btn-go:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(245, 158, 11, 0.42); }
    .wc-btn:focus-visible, .wc-act:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

    /* -- play -------------------------------------------------------- */
    .wc-play { transition: border-color .2s ease, background .2s ease; }
    .wc-play.cap { border-color: rgba(239, 68, 68, 0.5); }
    .wc-play.burst { border-color: rgba(74, 222, 128, 0.55); background: rgba(12, 26, 20, 0.5); }

    .wc-hud { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
    .wc-cell { min-width: 0; }
    .wc-hv { display: block; font-size: 20px; font-weight: 900; color: #e2e8f0; line-height: 1.1; margin-bottom: 2px; }
    .wc-hv.hot { color: var(--acc); }
    .wc-hv.warn { color: #f87171; }

    .wc-laneline { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .wc-state { font-size: 10px; font-weight: 800; letter-spacing: 0.6px; color: #94a3b8; text-align: right; }
    .wc-state.cap { color: #f87171; font-weight: 900; letter-spacing: 1.2px; }

    .wc-lane {
        position: relative; height: clamp(52px, 9vh, 74px); border-radius: 14px;
        background: linear-gradient(180deg, rgba(2, 6, 16, 0.9), rgba(10, 15, 28, 0.9));
        border: 1px solid rgba(51, 65, 85, 0.35); overflow: hidden;
    }
    .wc-tower { position: absolute; top: 0; bottom: 0; width: 6%; background: rgba(71, 85, 105, 0.2); }
    .wc-tower-you { left: 0; border-right: 1px solid rgba(71, 85, 105, 0.45); }
    .wc-tower-them {
        right: 0; width: auto; background: rgba(239, 68, 68, 0.13);
        border-left: 1px solid rgba(239, 68, 68, 0.45);
    }
    .wc-band {
        position: absolute; top: 0; bottom: 0; min-width: 22px;
        background: rgba(245, 158, 11, 0.14);
        border-left: 2px solid rgba(245, 158, 11, 0.6);
        border-right: 2px solid rgba(245, 158, 11, 0.6);
    }
    .wc-core { position: absolute; top: 0; bottom: 0; min-width: 8px; background: rgba(245, 158, 11, 0.3); }
    .wc-clump {
        position: absolute; top: 50%; width: 10px; height: 10px; margin-top: -5px;
        transform: translateX(-50%); border-radius: 2px;
        background: #64748b; box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.18);
    }
    .wc-ghost { position: absolute; top: 4px; bottom: 4px; width: 2px; background: rgba(226, 232, 240, 0.75); transform: translateX(-50%); }
    .wc-mark {
        position: absolute; top: 50%; transform: translate(-50%, -50%);
        display: flex; align-items: center; justify-content: center;
        padding: 3px 6px; border-radius: 8px; white-space: nowrap;
        background: rgba(226, 232, 240, 0.95); color: #0b1120;
        transition: background .12s ease, color .12s ease;
    }
    .wc-mark.dead { background: rgba(100, 116, 139, 0.6); color: #cbd5e1; }
    .wc-pips { font-size: 11px; letter-spacing: 1px; line-height: 1; font-weight: 900; }

    .wc-trackfoot {
        display: flex; justify-content: space-between; gap: 8px; margin-top: 5px; margin-bottom: 12px;
        font-size: 9px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #334155;
    }
    .wc-bandw { color: var(--acc); }

    .wc-next { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 12px; }
    .wc-next .wc-lab { display: inline-block; }
    .wc-nextchip {
        font-size: 9px; font-weight: 800; letter-spacing: 0.7px; text-transform: uppercase;
        color: #64748b; background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(51, 65, 85, 0.35); border-radius: 999px; padding: 3px 9px;
    }
    .wc-nextchip.cannon { color: #fbbf24; border-color: rgba(245, 158, 11, 0.45); background: rgba(245, 158, 11, 0.1); }

    .wc-feed {
        font-size: 12px; line-height: 1.5; color: #94a3b8; min-height: 38px;
        background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(51, 65, 85, 0.25);
        border-left: 2px solid rgba(71, 85, 105, 0.5);
        border-radius: 10px; padding: 9px 12px; margin-bottom: 14px;
    }
    .wc-feed-good { border-left-color: rgba(74, 222, 128, 0.7); color: #cbd5e1; }
    .wc-feed-bad { border-left-color: rgba(239, 68, 68, 0.7); color: #cbd5e1; }
    .wc-feed-ready { border-left-color: rgba(245, 158, 11, 0.7); }

    .wc-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .wc-act {
        position: relative; display: grid;
        grid-template-columns: auto 1fr; grid-template-rows: auto auto auto;
        column-gap: 9px; row-gap: 2px; align-items: center; text-align: left;
        background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.22);
        border-radius: 12px; padding: 11px 12px; cursor: pointer; font-family: inherit;
        min-height: 56px;
        transition: background .12s ease, border-color .12s ease, transform .12s ease;
    }
    .wc-act:hover:not(.off) { background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.5); transform: translateY(-1px); }
    .wc-act.off { cursor: default; opacity: 0.6; border-color: rgba(51, 65, 85, 0.35); }
    .wc-act-k {
        grid-row: 1 / span 3; align-self: center;
        padding: 4px 7px; border-radius: 7px;
        background: rgba(245, 158, 11, 0.14); border: 1px solid rgba(245, 158, 11, 0.3);
        color: #fbbf24; font-size: 10px; font-weight: 900; letter-spacing: 0.5px;
    }
    .wc-act-n { font-size: 11px; font-weight: 900; letter-spacing: 0.9px; color: #e2e8f0; }
    .wc-act-d { font-size: 9px; color: #64748b; font-weight: 700; }
    .wc-act-v { font-size: 10px; font-weight: 900; letter-spacing: 0.4px; color: var(--acc); text-transform: uppercase; }
    .wc-act.crash .wc-act-v { color: #fbbf24; }
    .wc-act-v.danger { color: #f87171; }

    /* -- result ------------------------------------------------------ */
    .wc-result { text-align: center; }
    .wc-score { font-size: 56px; font-weight: 900; color: var(--acc); line-height: 1; margin: 6px 0 6px; }
    .wc-verdict { font-size: 14px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #e2e8f0; }
    .wc-vline { font-size: 12.5px; color: #94a3b8; margin: 7px 0 16px; line-height: 1.55; }

    .wc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .wc-gcell { background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.25); border-radius: 12px; padding: 11px 8px; }
    .wc-cv { display: block; font-size: 18px; font-weight: 900; color: #e2e8f0; }
    .wc-cl { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin-top: 3px; }

    .wc-regret {
        font-size: 12px; line-height: 1.6; color: #cbd5e1; text-align: left;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.25);
        border-left: 2px solid rgba(245, 158, 11, 0.6);
        border-radius: 10px; padding: 10px 12px; margin-top: 14px;
    }
    .wc-coach { font-size: 12px; line-height: 1.65; color: #94a3b8; text-align: left; margin-top: 12px; }
    .wc-done { width: 100%; margin-top: 18px; }

    /* -- a11y live region (visually hidden) -------------------------- */
    .wc-live {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* -- small screens ----------------------------------------------- */
    @media (max-width: 620px) {
        .wc-hud { grid-template-columns: repeat(3, 1fr); gap: 10px 8px; }
        .wc-hv { font-size: 17px; }
        .wc-act-d { display: none; }
        .wc-act { grid-template-rows: auto auto; }
        .wc-act-k { grid-row: 1 / span 2; }
    }
    @media (max-width: 460px) {
        .wc-panel { padding: 14px; }
        .wc-acts { grid-template-columns: 1fr; }
        .wc-grid { grid-template-columns: 1fr 1fr; }
        .wc-title { font-size: 18px; }
        .wc-score { font-size: 46px; }
        .wc-laneline { flex-direction: column; align-items: flex-start; gap: 2px; }
        .wc-state { text-align: left; }
    }

    /* -- reduced motion: the marker still moves, because it is the
          information. Everything decorative stops. ------------------- */
    .wc.rm .wc-btn-go:hover,
    .wc.rm .wc-act:hover:not(.off) { transform: none; }
    .wc.rm .wc-play,
    .wc.rm .wc-mark,
    .wc.rm .wc-btn,
    .wc.rm .wc-act { transition: none; }
    @media (prefers-reduced-motion: reduce) {
        .wc-btn-go:hover, .wc-act:hover:not(.off) { transform: none; }
        .wc-play, .wc-mark, .wc-btn, .wc-act { transition: none; }
    }
</style>
