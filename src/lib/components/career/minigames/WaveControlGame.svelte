<script>
    // ═══════════════════════════════════════════════════════════════════════
    //  WAVE CONTROL - the LANING drill (attr 'lne')
    // ═══════════════════════════════════════════════════════════════════════
    //  The lane is a horizontal track. A wave marker drifts under pressure from
    //  both sides. Each goal names a wave state (freeze / slow push / hard
    //  shove / bounce) and you must hold the wave inside the goal band - in the
    //  right POSITION and travelling at the right DRIFT - for a number of
    //  seconds, using four cooldown-gated actions. Random lane events shove the
    //  wave around while you do it.
    //
    //  Self-contained: no store imports, no career imports, four props only.
    // ═══════════════════════════════════════════════════════════════════════
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;      // 1 Basic, 2 Advanced, 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    // ── tuning ────────────────────────────────────────────────────────────
    const ROUND = 34;               // active seconds of play (gaps are paused)
    const GAP_MS = 1000;            // between-goal read-out
    const HELD_TARGET = 0.60;       // in-band share that counts as a full run
    const PAR_GOALS = 5;
    const VMAX = 0.18;              // drift meter half-range

    const DIFF = {
        1: { label: 'Basic Drill', drift: 1.00, band: 1.00, velTol: 1.00, evtMin: 3.6, evtMax: 5.2, deadline: 10.0, cd: 1.00, noise: 0.55 },
        2: { label: 'Advanced',    drift: 1.34, band: 0.82, velTol: 0.86, evtMin: 2.9, evtMax: 4.2, deadline: 8.6,  cd: 1.10, noise: 0.90 },
        3: { label: 'Elite',       drift: 1.70, band: 0.68, velTol: 0.72, evtMin: 2.2, evtMax: 3.3, deadline: 7.4,  cd: 1.22, noise: 1.25 },
    };

    // Goals run in the real lane cycle: freeze -> slow push -> crash -> bounce.
    const GOALS = [
        {
            id: 'freeze', name: 'FREEZE', tag: 'Hold it just outside your tower',
            center: 0.245, half: 0.095, vLo: -0.040, vHi: 0.040, need: 3.2,
            hint: 'Zero drift. Last hit only, tank it back when it creeps out.',
            win: 'Freeze held. Their laner walks up to nothing for three waves.',
        },
        {
            id: 'slow', name: 'SLOW PUSH', tag: 'Build a big wave, creep it at them',
            center: 0.455, half: 0.115, vLo: 0.012, vHi: 0.080, need: 3.0,
            hint: 'Stay barely on the push. Thin the casters if it runs away.',
            win: 'Slow push built. That wave is worth a dive.',
        },
        {
            id: 'shove', name: 'HARD SHOVE', tag: 'Crash it into their tower and recall',
            center: 0.865, half: 0.100, vLo: 0.005, vHi: 0.400, need: 2.0,
            hint: 'Shove, ride the momentum, get out before it dies for nothing.',
            win: 'Crashed and recalled. Free tempo, free item components.',
        },
        {
            id: 'bounce', name: 'BOUNCE', tag: 'Let the crashed wave come back to you',
            center: 0.615, half: 0.110, vLo: -0.090, vHi: -0.014, need: 2.6,
            hint: 'The wave must be travelling back at you. Tank it, never shove.',
            win: 'Bounce set. It comes back to your side every single time.',
        },
    ];

    const ACTIONS = [
        { key: '1', short: 'LAST HIT', name: 'Last Hit Only', desc: 'Holds position', cd: 2.6 },
        { key: '2', short: 'TANK',     name: 'Tank the Wave', desc: 'Pulls it to you', cd: 3.0 },
        { key: '3', short: 'SHOVE',    name: 'Shove',         desc: 'Pushes at them', cd: 3.0 },
        { key: '4', short: 'THIN',     name: 'Thin Casters',  desc: 'Slows the drift', cd: 5.8 },
    ];

    const EVENTS = [
        { t: 'Cannon minion joins your wave - it pushes.',      amb:  0.055, kick:  0.000 },
        { t: 'Enemy laner shoves the wave back at you.',        amb: -0.075, kick: -0.030 },
        { t: 'Your jungler pathes through and hits the wave.',  amb:  0.070, kick:  0.045 },
        { t: 'Enemy recalls - nobody is holding it any more.',  amb:  0.060, kick:  0.000 },
        { t: 'Enemy freezes on their side of the lane.',        amb: -0.055, kick:  0.000 },
        { t: 'Their casters die first - the push stalls out.',  amb: -0.018, kick:  0.000 },
        { t: 'Enemy cannon crashes - a big wave builds at you.',amb: -0.085, kick: -0.020 },
        { t: 'Your support helps clear - it pushes out.',       amb:  0.065, kick:  0.030 },
        { t: 'Enemy laner backs off on low HP.',                amb:  0.045, kick:  0.000 },
        { t: 'Three waves meet in the middle. Chaos.',          amb: -0.070, kick:  0.035 },
    ];

    // ── helpers ───────────────────────────────────────────────────────────
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function clamp01(v) { return clamp(v, 0, 1); }
    function rand(a, b) { return a + Math.random() * (b - a); }

    // ── reactive config ───────────────────────────────────────────────────
    $: dLevel = clamp(Math.round(Number(difficulty) || 1), 1, 3);
    $: cfg = DIFF[dLevel];

    // ── run state ─────────────────────────────────────────────────────────
    let state = 'INTRO';        // INTRO | PLAYING | RESULT
    let phase = 'live';         // during PLAYING: live | gap
    let pendingNext = false;

    let pos = 0.5, vel = 0;
    let ambient = 0, ambTarget = 0, wander = 0;
    let driftScale = 1, driftUntil = 0;
    let holdUntil = 0, pushUntil = 0, pushForce = 0;
    let cds = [0, 0, 0, 0];

    let clock = 0, timeLeft = ROUND;
    let goal = GOALS[0];
    let band = { lo: 0, hi: 1, vLo: -1, vHi: 1 };
    let need = 3, held = 0, goalDeadline = 0;
    let cycleIdx = 0;
    let inBand = false;

    let goalsDone = 0, goalsFailed = 0, blowouts = 0;
    let heldTotal = 0, bestHold = 0, curRun = 0;
    let streak = 0, bestStreak = 0;

    let evtText = 'Lane is quiet. For now.';
    let readout = '', readoutGood = true;
    let nextEventAt = 0;
    let flash = '';             // '' | 'good' | 'bad'
    let flashUntil = 0;

    let score01 = 0, verdict = '', shareOut = 0;

    // ── timers / listeners (all torn down in onDestroy) ───────────────────
    let rafId = 0, gapTimer = null, flashTimer = null, lastTs = 0, destroyed = false;
    let reduceMotion = false;
    let mq = null;

    function onMQ(e) { reduceMotion = !!e.matches; }

    onMount(() => {
        if (typeof window !== 'undefined' && window.matchMedia) {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            reduceMotion = !!mq.matches;
            if (mq.addEventListener) mq.addEventListener('change', onMQ);
            else if (mq.addListener) mq.addListener(onMQ);
        }
        if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);
    });

    onDestroy(() => {
        destroyed = true;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
        if (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMQ);
            else if (mq.removeListener) mq.removeListener(onMQ);
            mq = null;
        }
    });

    // ── keyboard ──────────────────────────────────────────────────────────
    function onKey(e) {
        if (state !== 'PLAYING' || phase !== 'live') return;
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const i = ['1', '2', '3', '4'].indexOf(e.key);
        if (i === -1) return;
        e.preventDefault();
        doAction(i);
    }

    // ── round lifecycle ───────────────────────────────────────────────────
    function start() {
        pos = 0.42; vel = 0.01;
        ambient = 0; ambTarget = rand(-0.03, 0.03); wander = 0;
        driftScale = 1; driftUntil = 0;
        holdUntil = 0; pushUntil = 0; pushForce = 0;
        cds = [0, 0, 0, 0];
        clock = 0; timeLeft = ROUND;
        held = 0; heldTotal = 0; bestHold = 0; curRun = 0;
        goalsDone = 0; goalsFailed = 0; blowouts = 0;
        streak = 0; bestStreak = 0;
        inBand = false;
        evtText = 'Minions inbound. Watch the drift meter.';
        cycleIdx = Math.floor(Math.random() * GOALS.length);
        setGoal(GOALS[cycleIdx]);
        nextEventAt = rand(cfg.evtMin * 0.6, cfg.evtMax * 0.8);
        readoutGood = true;
        readout = 'First job: ' + goal.name + '. ' + goal.hint;
        pendingNext = false;
        phase = 'gap';
        state = 'PLAYING';
        lastTs = 0;
        if (gapTimer) clearTimeout(gapTimer);
        gapTimer = setTimeout(openGate, 1400);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(frame);
    }

    function openGate() {
        gapTimer = null;
        if (destroyed || state !== 'PLAYING') return;
        if (timeLeft <= 0.01) { finishRound(); return; }
        if (pendingNext) { advanceGoal(); pendingNext = false; }
        phase = 'live';
    }

    function setGoal(g) {
        goal = g;
        const half = g.half * cfg.band;
        const tol = cfg.velTol;
        band = {
            lo: clamp(g.center - half, 0.02, 0.98),
            hi: clamp(g.center + half, 0.02, 0.98),
            vLo: g.vLo * tol,
            vHi: g.vHi * tol,
        };
        need = g.need * (1 + (dLevel - 1) * 0.06);
        held = 0;
        goalDeadline = clock + cfg.deadline;
        nextEventAt = clock + rand(cfg.evtMin, cfg.evtMax);
    }

    function advanceGoal() {
        const prev = cycleIdx;
        let step = Math.random() < 0.25 ? 2 : 1;
        cycleIdx = (cycleIdx + step) % GOALS.length;
        if (cycleIdx === prev) cycleIdx = (cycleIdx + 1) % GOALS.length;
        setGoal(GOALS[cycleIdx]);
    }

    function endGoal(ok, forced) {
        if (ok) {
            goalsDone++;
            streak++;
            if (streak > bestStreak) bestStreak = streak;
            readoutGood = true;
            readout = goal.win;
            pulse('good');
        } else {
            goalsFailed++;
            streak = 0;
            readoutGood = false;
            readout = forced || diagnose();
            pulse('bad');
        }
        pendingNext = true;
        phase = 'gap';
        if (gapTimer) clearTimeout(gapTimer);
        gapTimer = setTimeout(openGate, GAP_MS);
    }

    function pulse(kind) {
        flash = kind;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { flashTimer = null; flash = ''; }, 420);
    }

    function diagnose() {
        const above = pos > band.hi, below = pos < band.lo;
        if (goal.id === 'freeze') {
            if (above) return 'You shoved a freeze. The wave walked out of your control.';
            if (below) return 'Tanked it too hard - the wave died on your own tower.';
            return 'Close, but it never sat still. A freeze needs the drift at zero.';
        }
        if (goal.id === 'slow') {
            if (vel > band.vHi) return 'That was not a slow push, that was a shove.';
            if (vel < band.vLo) return 'The wave stalled. A slow push still has to be moving.';
            if (above) return 'It got away from you before the wave was ever big.';
            return 'You kept resetting it. The wave never got a chance to build.';
        }
        if (goal.id === 'shove') {
            if (below) return 'You never got it to crash. They just froze it on you.';
            return 'Overshoved - it died under their tower before you were in position.';
        }
        if (vel > 0) return 'You shoved into a bounce. The wave never came back.';
        if (below) return 'The bounce ran all the way past you and into your tower.';
        return 'It did not come back in time - you cleared the wave too early.';
    }

    function fireEvent() {
        const e = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        ambTarget = e.amb * rand(0.8, 1.25);
        if (e.kick) vel += e.kick * cfg.drift;
        evtText = e.t;
        nextEventAt = clock + rand(cfg.evtMin, cfg.evtMax);
    }

    // ── actions ───────────────────────────────────────────────────────────
    function doAction(i) {
        if (state !== 'PLAYING' || phase !== 'live') return;
        if (cds[i] > 0) return;
        cds[i] = ACTIONS[i].cd * cfg.cd;
        cds = cds;
        if (i === 0) {                       // LAST HIT ONLY - hold position
            holdUntil = clock + 1.30;
        } else if (i === 1) {                // TANK THE WAVE - pull toward you
            vel -= 0.045;
            pushForce = -0.115; pushUntil = clock + 1.05;
        } else if (i === 2) {                // SHOVE - push toward them
            vel += 0.045;
            pushForce = 0.115; pushUntil = clock + 1.05;
        } else {                             // THIN THE CASTERS - slow the drift
            driftScale = 0.30; driftUntil = clock + 3.20;
        }
    }

    // ── simulation ────────────────────────────────────────────────────────
    function frame(ts) {
        if (destroyed) return;
        rafId = requestAnimationFrame(frame);
        if (!lastTs) { lastTs = ts; return; }
        let dt = (ts - lastTs) / 1000;
        lastTs = ts;
        if (dt > 0.05) dt = 0.05;
        if (dt <= 0) return;
        if (state !== 'PLAYING' || phase !== 'live') return;
        step(dt);
    }

    function step(dt) {
        clock += dt;
        timeLeft = Math.max(0, ROUND - clock);

        for (let i = 0; i < 4; i++) if (cds[i] > 0) cds[i] = Math.max(0, cds[i] - dt);
        cds = cds;

        if (clock >= driftUntil) driftScale = 1;
        const holding = clock < holdUntil;
        const pushing = clock < pushUntil;

        if (clock >= nextEventAt) fireEvent();

        ambient += (ambTarget - ambient) * 2.2 * dt;
        wander += (Math.random() - 0.5) * 0.10 * cfg.noise * dt;
        wander *= Math.pow(0.55, dt);
        wander = clamp(wander, -0.035, 0.035);

        const amb = (ambient + wander) * cfg.drift * driftScale;
        let force = amb;
        if (pushing) force += pushForce;
        if (holding) force -= amb * 0.95;

        vel += (force - vel) * 3.4 * dt;
        if (holding) vel *= Math.pow(0.10, dt);
        pos += vel * dt;

        if (pos <= 0.02) {
            pos = 0.11; vel = 0.015; blowouts++;
            endGoal(false, 'The wave crashed into your own tower. You lost the whole thing.');
            return;
        }
        if (pos >= 0.98) {
            pos = 0.89; vel = -0.015; blowouts++;
            endGoal(false, 'It died under their tower for nothing. That is not a crash, that is a donation.');
            return;
        }

        inBand = pos >= band.lo && pos <= band.hi && vel >= band.vLo && vel <= band.vHi;
        if (inBand) {
            held += dt; heldTotal += dt; curRun += dt;
            if (curRun > bestHold) bestHold = curRun;
        } else {
            curRun = 0;
            held = Math.max(0, held - dt * 0.55);
        }

        if (held >= need) { endGoal(true); return; }
        if (timeLeft <= 0) { finishRound(); return; }
        if (clock >= goalDeadline) { endGoal(false); return; }
    }

    function finishRound() {
        if (state !== 'PLAYING') return;
        if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        phase = 'gap';

        // score01 = in-band share of the round, weighted by discrete goals hit
        const share = clamp01(heldTotal / ROUND);
        const norm = clamp01(share / HELD_TARGET);
        const goalFactor = 0.74 + 0.26 * clamp01(goalsDone / PAR_GOALS);
        let s = clamp01(norm * goalFactor) - blowouts * 0.02;
        score01 = clamp(s, 0, 0.98);
        shareOut = share;

        verdict = score01 >= 0.88 ? 'The lane belongs to you.'
            : score01 >= 0.72 ? 'Strong wave control. You dictate the tempo.'
            : score01 >= 0.55 ? 'Solid fundamentals, sloppy under pressure.'
            : score01 >= 0.38 ? 'Loose. The wave is playing you, not the other way round.'
            : 'You are not managing the wave. You are watching it.';

        state = 'RESULT';
    }

    function finish() {
        const attempts = goalsDone + goalsFailed;
        const acc = attempts > 0 ? goalsDone / attempts : 0;
        const meta = {
            label: score01 >= 0.88 ? 'Lane Dominant'
                : score01 >= 0.72 ? 'Wave Controller'
                : score01 >= 0.55 ? 'Competent'
                : score01 >= 0.38 ? 'Loose Laner' : 'Wave Ignorant',
            accuracy: acc,
            hits: goalsDone,
            misses: goalsFailed,
            streak: bestStreak,
            best: Math.round(bestHold * 10) / 10,
            detail: goalsDone + '/' + attempts + ' wave goals, ' + Math.round(shareOut * 100)
                + '% of the round in band, best hold ' + (Math.round(bestHold * 10) / 10) + 's'
                + (blowouts > 0 ? ', ' + blowouts + ' blown wave' + (blowouts === 1 ? '' : 's') : ''),
            inBandShare: shareOut,
            blowouts,
            difficulty: dLevel,
            game: 'wave',
            attr: 'lne',
        };
        if (typeof onComplete === 'function') onComplete(score01, meta);
    }

    function quit() { if (typeof onQuit === 'function') onQuit(); }

    // ── derived display values ────────────────────────────────────────────
    $: bandLeft = band.lo * 100;
    $: bandWidth = Math.max(1, (band.hi - band.lo) * 100);
    $: markerLeft = clamp01(pos) * 100;
    $: heldPct = clamp01(need > 0 ? held / need : 0) * 100;
    $: timePct = clamp01(timeLeft / ROUND) * 100;
    $: vZoneLeft = clamp01((clamp(band.vLo, -VMAX, VMAX) + VMAX) / (2 * VMAX)) * 100;
    $: vZoneRight = clamp01((clamp(band.vHi, -VMAX, VMAX) + VMAX) / (2 * VMAX)) * 100;
    $: vZoneWidth = Math.max(2, vZoneRight - vZoneLeft);
    $: vMark = clamp01((clamp(vel, -VMAX, VMAX) + VMAX) / (2 * VMAX)) * 100;
    $: driftArrow = vel > 0.012 ? '>>' : (vel < -0.012 ? '<<' : '==');
    $: velOk = vel >= band.vLo && vel <= band.vHi;
    $: posOk = pos >= band.lo && pos <= band.hi;
    $: title = (drill && drill.name) ? drill.name : 'Wave Control';
    // Announced only when the goal or the read-out changes - never per frame,
    // otherwise a screen reader would be read to sixty times a second.
    $: liveMsg = state !== 'PLAYING' ? ''
        : (phase === 'gap' ? readout : 'New goal: ' + goal.name + '. ' + goal.tag + '. ' + goal.hint);
</script>

<section class="wc" class:rm={reduceMotion}>
    <header class="wc-head">
        <div class="wc-head-l">
            <span class="wc-chip">LNE &middot; Laning</span>
            <h2 class="wc-title">{title}</h2>
        </div>
        <span class="wc-diff">{cfg.label}</span>
    </header>

    <!-- ══ INTRO ══════════════════════════════════════════════════════════ -->
    {#if state === 'INTRO'}
        <div class="wc-panel wc-intro">
            <p class="wc-lead">
                {#if drill && drill.desc}{drill.desc}{:else}
                    Wave management is the whole of laning. This drill trains the part nobody
                    practises on purpose: reading which way the wave is going, deciding which
                    state you actually want it in, and getting it there before the enemy laner,
                    your jungler and a cannon minion all change their minds for you.
                {/if}
            </p>

            <div class="wc-how">
                <div class="wc-lab">How to play</div>
                <ol class="wc-steps">
                    <li>The coach calls a wave state - <b>freeze</b>, <b>slow push</b>, <b>hard shove</b> or <b>bounce</b>.</li>
                    <li>Get the wave inside the highlighted band <em>and</em> get the drift meter into its target zone.</li>
                    <li>Hold both at once until the seconds-held bar fills. Slip out and it drains.</li>
                    <li>Every action has a cooldown, so pick the right one - you cannot spam your way out.</li>
                </ol>
            </div>

            <div class="wc-keys">
                {#each ACTIONS as a}
                    <div class="wc-key">
                        <span class="wc-kbd">{a.key}</span>
                        <span class="wc-key-n">{a.name}</span>
                        <span class="wc-key-d">{a.desc}</span>
                    </div>
                {/each}
            </div>

            <p class="wc-note">One round is about {ROUND} seconds of lane time. Mouse, touch or keys 1-4.</p>

            <div class="wc-actions">
                <button type="button" class="wc-btn wc-btn-ghost" aria-label="Back out of this drill without scoring" on:click={quit}>Back</button>
                <button type="button" class="wc-btn wc-btn-go" aria-label="Start the Wave Control drill" on:click={start}>Start Drill</button>
            </div>
        </div>

    <!-- ══ PLAYING ════════════════════════════════════════════════════════ -->
    {:else if state === 'PLAYING'}
        <div class="wc-panel wc-play" class:flash-good={flash === 'good'} class:flash-bad={flash === 'bad'}>

            <div class="wc-hud">
                <div class="wc-hud-cell">
                    <span class="wc-lab">Goals</span>
                    <span class="wc-hud-v">{goalsDone}</span>
                </div>
                <div class="wc-hud-cell">
                    <span class="wc-lab">Streak</span>
                    <span class="wc-hud-v">{streak}</span>
                </div>
                <div class="wc-hud-cell wc-hud-time">
                    <span class="wc-lab">Lane time</span>
                    <span class="wc-hud-v">{Math.ceil(timeLeft)}s</span>
                    <div class="wc-timebar"><div class="wc-timefill" style="width:{timePct}%"></div></div>
                </div>
            </div>

            {#if phase === 'gap'}
                <div class="wc-readout" class:ok={readoutGood}>
                    <span class="wc-lab">{readoutGood ? 'Goal complete' : 'Wave lost'}</span>
                    <p>{readout}</p>
                </div>
            {:else}
                <div class="wc-goal">
                    <div class="wc-goal-top">
                        <span class="wc-goal-name">{goal.name}</span>
                        <span class="wc-goal-tag">{goal.tag}</span>
                    </div>
                    <div class="wc-holdbar" aria-hidden="true">
                        <div class="wc-holdfill" class:live={inBand} style="width:{heldPct}%"></div>
                    </div>
                    <div class="wc-holdrow">
                        <span class="wc-held">{held.toFixed(1)}s / {need.toFixed(1)}s held</span>
                        <span class="wc-state" class:on={inBand}>{inBand ? 'IN BAND' : (posOk ? 'DRIFT WRONG' : 'OUT OF BAND')}</span>
                    </div>
                </div>
            {/if}

            <div class="wc-lane" role="img"
                 aria-label="Lane track. Wave at {Math.round(pos * 100)} percent toward the enemy tower, goal band {Math.round(band.lo * 100)} to {Math.round(band.hi * 100)} percent.">
                <div class="wc-towers">
                    <span>Your tower</span>
                    <span>Enemy tower</span>
                </div>
                <div class="wc-track" class:in={inBand}>
                    <div class="wc-band" class:in={inBand} style="left:{bandLeft}%;width:{bandWidth}%"></div>
                    <div class="wc-mid"></div>
                    <div class="wc-marker" class:in={inBand} style="left:{markerLeft}%">
                        <span class="wc-marker-dot"></span>
                        <span class="wc-marker-dir">{driftArrow}</span>
                    </div>
                </div>
            </div>

            <div class="wc-drift">
                <div class="wc-lab">Drift &middot; {vel > 0 ? 'toward them' : (vel < 0 ? 'toward you' : 'held')}</div>
                <div class="wc-dtrack" role="img"
                     aria-label="Drift meter. Current drift {velOk ? 'inside' : 'outside'} the target zone.">
                    <div class="wc-dzone" class:in={velOk} style="left:{vZoneLeft}%;width:{vZoneWidth}%"></div>
                    <div class="wc-dcenter"></div>
                    <div class="wc-dmark" class:in={velOk} style="left:{vMark}%"></div>
                </div>
                <div class="wc-dends"><span>&lt;&lt; you</span><span>them &gt;&gt;</span></div>
            </div>

            <div class="wc-event"><span class="wc-ev-dot"></span>{evtText}</div>

            <div class="wc-acts">
                {#each ACTIONS as a, i}
                    <button
                        type="button"
                        class="wc-act"
                        class:cooling={cds[i] > 0}
                        disabled={phase !== 'live' || cds[i] > 0}
                        aria-label="{a.name}. {a.desc}. Keyboard key {a.key}."
                        on:click={() => doAction(i)}
                    >
                        <span class="wc-act-cd" style="width:{cds[i] > 0 ? clamp01(cds[i] / (a.cd * cfg.cd)) * 100 : 0}%"></span>
                        <span class="wc-act-key">{a.key}</span>
                        <span class="wc-act-n">{a.short}</span>
                        <span class="wc-act-d">{cds[i] > 0 ? cds[i].toFixed(1) + 's' : a.desc}</span>
                    </button>
                {/each}
            </div>
        </div>

    <!-- ══ RESULT ═════════════════════════════════════════════════════════ -->
    {:else}
        <div class="wc-panel wc-result">
            <div class="wc-lab">Session score</div>
            <div class="wc-score">{Math.round(score01 * 100)}</div>
            <div class="wc-verdict">{verdict}</div>

            <div class="wc-grid">
                <div class="wc-cell"><span class="wc-cv">{goalsDone}</span><span class="wc-cl">Goals hit</span></div>
                <div class="wc-cell"><span class="wc-cv">{goalsFailed}</span><span class="wc-cl">Waves lost</span></div>
                <div class="wc-cell"><span class="wc-cv">{Math.round(shareOut * 100)}%</span><span class="wc-cl">Time in band</span></div>
                <div class="wc-cell"><span class="wc-cv">{bestStreak}</span><span class="wc-cl">Best streak</span></div>
                <div class="wc-cell"><span class="wc-cv">{bestHold.toFixed(1)}s</span><span class="wc-cl">Longest hold</span></div>
                <div class="wc-cell"><span class="wc-cv">{blowouts}</span><span class="wc-cl">Blown waves</span></div>
            </div>

            <p class="wc-note">
                Score is the share of the round you kept the wave in the called band, weighted by
                how many wave goals you actually finished.
            </p>

            <div class="wc-actions">
                <button type="button" class="wc-btn wc-btn-go wc-wide" aria-label="Finish the session and bank the score" on:click={finish}>Finish Session</button>
            </div>
        </div>
    {/if}

    <p class="wc-live" aria-live="polite">{liveMsg}</p>
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

    /* ── head ───────────────────────────────────────────────────────────── */
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

    /* ── intro ──────────────────────────────────────────────────────────── */
    .wc-lead { font-size: 13px; line-height: 1.65; color: #94a3b8; margin-bottom: 18px; }
    .wc-how { margin-bottom: 16px; }
    .wc-steps { margin: 8px 0 0; padding-left: 18px; }
    .wc-steps li { font-size: 12px; line-height: 1.6; color: #94a3b8; margin-bottom: 4px; }
    .wc-steps b { color: #fbbf24; font-weight: 800; }
    .wc-steps em { color: #cbd5e1; font-style: normal; font-weight: 800; }

    .wc-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
    @media (max-width: 520px) { .wc-keys { grid-template-columns: 1fr; } }
    .wc-key {
        display: grid; grid-template-columns: 24px 1fr; grid-template-rows: auto auto;
        column-gap: 9px; align-items: center;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.3);
        border-radius: 12px; padding: 9px 11px;
    }
    .wc-kbd {
        grid-row: 1 / span 2; width: 24px; height: 24px; border-radius: 7px;
        background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3);
        color: #fbbf24; font-size: 11px; font-weight: 900;
        display: flex; align-items: center; justify-content: center;
    }
    .wc-key-n { font-size: 11px; font-weight: 900; color: #e2e8f0; letter-spacing: 0.3px; }
    .wc-key-d { font-size: 10px; color: #64748b; }
    .wc-note { font-size: 10px; color: #475569; line-height: 1.6; margin-top: 10px; }

    .wc-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
    .wc-btn {
        padding: 11px 22px; border-radius: 12px; font-size: 12px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1px; cursor: pointer; border: none;
        font-family: inherit; transition: box-shadow .15s ease, transform .15s ease, background .15s ease, color .15s ease;
    }
    .wc-btn-ghost { background: rgba(51, 65, 85, 0.45); color: #94a3b8; border: 1px solid rgba(71, 85, 105, 0.4); }
    .wc-btn-ghost:hover { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .wc-btn-go { background: linear-gradient(135deg, #d97706, #f59e0b); color: #1c1917; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.22); }
    .wc-btn-go:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(245, 158, 11, 0.42); }
    .wc-wide { flex: 1; min-width: 200px; }
    .wc-btn:focus-visible, .wc-act:focus-visible {
        outline: 2px solid var(--acc); outline-offset: 2px;
    }

    /* ── play ───────────────────────────────────────────────────────────── */
    .wc-play { transition: border-color .2s ease, background .2s ease; }
    .wc-play.flash-good { border-color: rgba(34, 197, 94, 0.55); background: rgba(12, 26, 20, 0.55); }
    .wc-play.flash-bad { border-color: rgba(239, 68, 68, 0.55); background: rgba(28, 14, 16, 0.55); }

    .wc-hud { display: grid; grid-template-columns: auto auto 1fr; gap: 14px; align-items: end; margin-bottom: 14px; }
    .wc-hud-v { font-size: 20px; font-weight: 900; color: #e2e8f0; line-height: 1.1; display: block; margin-top: 2px; }
    .wc-hud-time { text-align: right; }
    .wc-timebar { height: 5px; border-radius: 99px; background: rgba(15, 23, 42, 0.8); overflow: hidden; margin-top: 6px; }
    .wc-timefill { height: 100%; background: linear-gradient(90deg, #b45309, #fbbf24); border-radius: 99px; }

    .wc-goal, .wc-readout {
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.3);
        border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; min-height: 92px;
    }
    .wc-goal-top { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .wc-goal-name { font-size: 15px; font-weight: 900; letter-spacing: 1.5px; color: var(--acc); }
    .wc-goal-tag { font-size: 11px; color: #94a3b8; }
    .wc-holdbar { height: 9px; border-radius: 99px; background: rgba(2, 6, 16, 0.8); overflow: hidden; border: 1px solid rgba(51, 65, 85, 0.3); }
    .wc-holdfill { height: 100%; background: rgba(100, 116, 139, 0.6); border-radius: 99px; transition: background .12s ease; }
    .wc-holdfill.live { background: linear-gradient(90deg, #d97706, #fbbf24); }
    .wc-holdrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 7px; }
    .wc-held { font-size: 10px; font-weight: 800; color: #64748b; }
    .wc-state { font-size: 9px; font-weight: 900; letter-spacing: 1.2px; color: #64748b; }
    .wc-state.on { color: #4ade80; }

    .wc-readout { border-color: rgba(239, 68, 68, 0.28); }
    .wc-readout.ok { border-color: rgba(34, 197, 94, 0.28); }
    .wc-readout p { font-size: 13px; line-height: 1.55; color: #cbd5e1; margin-top: 7px; }

    /* lane */
    .wc-lane { margin-bottom: 14px; }
    .wc-towers { display: flex; justify-content: space-between; font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #334155; margin-bottom: 6px; }
    .wc-track {
        position: relative; height: 54px; border-radius: 14px;
        background: linear-gradient(180deg, rgba(2, 6, 16, 0.85), rgba(10, 15, 28, 0.85));
        border: 1px solid rgba(51, 65, 85, 0.35); overflow: hidden;
        transition: border-color .15s ease;
    }
    .wc-track.in { border-color: rgba(74, 222, 128, 0.45); }
    .wc-band {
        position: absolute; top: 0; bottom: 0;
        background: rgba(245, 158, 11, 0.13);
        border-left: 2px solid rgba(245, 158, 11, 0.55);
        border-right: 2px solid rgba(245, 158, 11, 0.55);
        transition: background .15s ease, border-color .15s ease;
    }
    .wc-band.in { background: rgba(34, 197, 94, 0.16); border-left-color: rgba(74, 222, 128, 0.75); border-right-color: rgba(74, 222, 128, 0.75); }
    .wc-mid { position: absolute; left: 50%; top: 8px; bottom: 8px; width: 1px; background: rgba(51, 65, 85, 0.5); }
    .wc-marker {
        position: absolute; top: 0; bottom: 0; width: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    }
    .wc-marker-dot {
        width: 14px; height: 14px; border-radius: 50%;
        background: #e2e8f0; box-shadow: 0 0 0 3px rgba(226, 232, 240, 0.14);
        transform: translateX(-50%);
    }
    .wc-marker.in .wc-marker-dot { background: #4ade80; box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.2); }
    .wc-marker-dir { font-size: 9px; font-weight: 900; color: #64748b; letter-spacing: 1px; transform: translateX(-50%); white-space: nowrap; }

    /* drift meter */
    .wc-drift { margin-bottom: 12px; }
    .wc-dtrack {
        position: relative; height: 16px; border-radius: 8px; margin-top: 6px;
        background: rgba(2, 6, 16, 0.8); border: 1px solid rgba(51, 65, 85, 0.35); overflow: hidden;
    }
    .wc-dzone { position: absolute; top: 0; bottom: 0; background: rgba(245, 158, 11, 0.18); border-left: 1px solid rgba(245, 158, 11, 0.5); border-right: 1px solid rgba(245, 158, 11, 0.5); }
    .wc-dzone.in { background: rgba(34, 197, 94, 0.22); border-left-color: rgba(74, 222, 128, 0.7); border-right-color: rgba(74, 222, 128, 0.7); }
    .wc-dcenter { position: absolute; left: 50%; top: 2px; bottom: 2px; width: 1px; background: rgba(71, 85, 105, 0.6); }
    .wc-dmark { position: absolute; top: 1px; bottom: 1px; width: 3px; border-radius: 2px; background: #e2e8f0; transform: translateX(-50%); }
    .wc-dmark.in { background: #4ade80; }
    .wc-dends { display: flex; justify-content: space-between; font-size: 9px; font-weight: 800; color: #334155; margin-top: 4px; }

    .wc-event {
        display: flex; align-items: center; gap: 8px;
        font-size: 11px; color: #94a3b8; line-height: 1.4;
        background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(51, 65, 85, 0.25);
        border-radius: 10px; padding: 8px 11px; margin-bottom: 14px; min-height: 34px;
    }
    .wc-ev-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--acc); flex: 0 0 auto; }

    /* actions */
    .wc-acts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    @media (max-width: 560px) { .wc-acts { grid-template-columns: 1fr 1fr; } }
    .wc-act {
        position: relative; overflow: hidden;
        display: grid; grid-template-columns: 20px 1fr; grid-template-rows: auto auto;
        column-gap: 8px; row-gap: 1px; align-items: center; text-align: left;
        background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.22);
        border-radius: 12px; padding: 10px 11px; cursor: pointer; font-family: inherit;
        transition: background .12s ease, border-color .12s ease, transform .12s ease;
    }
    .wc-act:hover:not(:disabled) { background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.5); transform: translateY(-1px); }
    .wc-act:disabled { cursor: not-allowed; border-color: rgba(51, 65, 85, 0.35); }
    .wc-act.cooling { opacity: 0.72; }
    .wc-act-cd { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(51, 65, 85, 0.42); pointer-events: none; }
    .wc-act-key {
        grid-row: 1 / span 2; position: relative; z-index: 1;
        width: 20px; height: 20px; border-radius: 6px;
        background: rgba(245, 158, 11, 0.14); border: 1px solid rgba(245, 158, 11, 0.3);
        color: #fbbf24; font-size: 10px; font-weight: 900;
        display: flex; align-items: center; justify-content: center;
    }
    .wc-act-n { position: relative; z-index: 1; font-size: 10px; font-weight: 900; letter-spacing: 0.8px; color: #e2e8f0; }
    .wc-act-d { position: relative; z-index: 1; font-size: 9px; color: #64748b; font-weight: 700; }

    /* ── result ─────────────────────────────────────────────────────────── */
    .wc-result { text-align: center; }
    .wc-score { font-size: 56px; font-weight: 900; color: var(--acc); line-height: 1; margin: 6px 0 8px; }
    .wc-verdict { font-size: 13px; color: #cbd5e1; margin-bottom: 18px; line-height: 1.5; }
    .wc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    @media (max-width: 460px) { .wc-grid { grid-template-columns: 1fr 1fr; } }
    .wc-cell { background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.25); border-radius: 12px; padding: 12px 8px; }
    .wc-cv { display: block; font-size: 18px; font-weight: 900; color: #e2e8f0; }
    .wc-cl { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin-top: 3px; }

    /* ── a11y live region (visually hidden) ─────────────────────────────── */
    .wc-live {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* ── reduced motion: no transforms, no pulsing, colour cues only ────── */
    .wc.rm .wc-btn-go:hover,
    .wc.rm .wc-act:hover:not(:disabled) { transform: none; }
    .wc.rm .wc-play,
    .wc.rm .wc-track,
    .wc.rm .wc-band,
    .wc.rm .wc-holdfill,
    .wc.rm .wc-btn,
    .wc.rm .wc-act { transition: none; }
    .wc.rm .wc-marker-dot { box-shadow: none; border: 2px solid #0f172a; }
    .wc.rm .wc-marker.in .wc-marker-dot { box-shadow: none; }
    @media (prefers-reduced-motion: reduce) {
        .wc-btn-go:hover, .wc-act:hover:not(:disabled) { transform: none; }
        .wc-play, .wc-track, .wc-band, .wc-holdfill, .wc-btn, .wc-act { transition: none; }
    }
</style>
