<script>
    // =====================================================================
    //  CLUTCH TRIAL - Composure (CMP) training drill
    // ---------------------------------------------------------------------
    //  Stop a sweeping marker inside a target zone. Trivial on its own; the
    //  drill is the interference: the zone shrinks every time you land it,
    //  the chat gets nastier, the sweep changes speed mid-swing, the bar
    //  reverses, and the target sometimes moves.
    //
    //  Miss three times and the TILT METER fills: the next two reps are
    //  worth double and every interference chance spikes. Recovering from a
    //  mistake is the entire point of the exercise.
    //
    //  EVERY INTERFERENCE IS TELEGRAPHED. That is not politeness, it is what
    //  makes this a composure drill rather than a coin flip. The first cut
    //  applied a 2x speed jump on the same frame the badge appeared and
    //  teleported the scoring zone under a marker that was already committed,
    //  which is unreadable rather than hard - there was no input that beat it.
    //  So: a warning badge lands `tell` ms before the change, speed ramps
    //  instead of jumping, the zone SLIDES to its new home, and a click aimed
    //  at where the zone was still scores for a moment after it leaves
    //  (graceC / graceUntil). Only one event is ever in flight, the first and
    //  last stretch of every rep are clean, and the approach you commit to is
    //  always the approach you are judged on.
    //
    //  Self-contained: no stores, no career imports, no assets, no network.
    // =====================================================================
    import { onDestroy } from 'svelte';

    // ---- contract -------------------------------------------------------
    export let difficulty = 1;      // 1 Basic / 2 Advanced / 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    const DIFF_NAMES = ['Basic Drill', 'Advanced', 'Elite'];

    $: lvl = Math.max(1, Math.min(3, Math.round(Number(difficulty)) || 1));

    // ---- tuning ---------------------------------------------------------
    function cfg(d) {
        const i = Math.max(0, Math.min(2, d - 1));
        return {
            level:    d,
            name:     DIFF_NAMES[i],
            reps:     [14, 15, 16][i],          // fixed rep count
            // The only tuning number that moved. A change announced ~480ms
            // ahead needs a rep long enough that the telegraph is not eaten by
            // the timeout; everything below is exactly what it was.
            repMs:    [3500, 3200, 2900][i],    // per-rep timeout
            // DIFFICULTY DIALS - UNCHANGED ON PURPOSE.
            // The drill was not too hard, it was unreadable: a simulation of
            // the old scoring maths puts a near-perfect player at a 52% hit
            // rate and a 0.47 session score, because roughly a third of reps
            // were decided by a 2x speed jump or a teleporting zone that no
            // input could beat. Removing that is worth about +0.34 of session
            // score on its own. Softening the sweep or the zone on top of it
            // took a competent session to 0.63 against a 0.50 reference (see
            // the WaveControlGame calibration in tools/waveSim.mjs), i.e. it
            // would have made CMP the cheapest attribute in the mode to max.
            // So: the precision demand is the original one, and the fairness
            // fixes are the whole change.
            speed:    [0.66, 0.86, 1.06][i],    // bar-widths per second
            half0:    [0.115, 0.094, 0.078][i], // starting half-width of zone
            halfMin:  [0.030, 0.024, 0.019][i],
            shrink:   [0.900, 0.885, 0.870][i], // per landed rep
            regrow:   [1.260, 1.220, 1.180][i], // forgiveness after a miss
            chatMs:   [1250, 1000, 820][i],
            evtBase:  [0.00, 0.10, 0.20][i],
            // One event a rep on Basic, two higher up. Three at once was the
            // difference between "interference" and "no readable input".
            maxEvt:   [1, 2, 2][i],
            // How long the warning badge is up before the change actually lands.
            tell:     [560, 480, 420][i],
        };
    }

    // Hard guard. Checked before each rep, so the absolute worst case is this
    // plus one full rep timeout plus a gap - comfortably inside 60s.
    const SESSION_CAP_MS = 52000;

    // Interference physics. Nothing here is instant on purpose.
    const SPEED_RAMP_MS = 240;      // a speed change eases in over this
    const SHIFT_SLIDE_MS = 300;     // the zone travels to its new centre
    const SHIFT_HOLD_MS = 900;      // ...stays there, then slides home
    const GRACE_TAIL_MS = 260;      // old centre still scores this long after a move
    const EVENT_GAP_MS = 700;       // minimum air between two events landing

    // ---- view / round state ---------------------------------------------
    let view = 'intro';             // intro | playing | result
    let phase = 'idle';             // idle | ready | sweep | judge | over
    let conf = cfg(1);

    let rep = 0;
    let pos = 0.5;                  // marker position, 0..1 across the bar
    let dir = 1;

    // Speed is eased, never set. speedMul is what the sweep reads; the three
    // fields under it are the ramp that produces it.
    let speedMul = 1;
    let speedFrom = 1;
    let speedTo = 1;
    let speedAt = 0;

    let homeC = 0.5;                // where the zone really lives
    let targetC = 0.5;              // where it is drawn right now (slides)
    let halfW = 0.115;
    let tightest = 0.115;           // smallest zone actually landed in
    let teleported = false;

    // The zone slide, and the forgiveness that comes with it: for GRACE_TAIL_MS
    // after the zone starts moving, a click aimed at where it WAS still scores.
    // Without this the drill punishes a decision the player made before there
    // was anything to see.
    let slideFrom = 0.5;
    let slideTo = 0.5;
    let slideAt = 0;
    let graceC = null;
    let graceUntil = 0;

    let hits = 0, misses = 0, streak = 0, best = 0;
    let weightSum = 0, weightedHits = 0, precSum = 0;
    let distSum = 0, played = 0;

    let tilt = 0;                   // 0..1
    let tiltActive = false, tiltLeft = 0, tiltRounds = 0, tiltHits = 0;

    let badges = [];                // active interference callouts
    let badgeSeq = 0;
    let chat = [];
    let chatSeq = 0;

    let feedback = 'Get ready';
    let feedKind = 'neutral';
    let shaking = false;
    let flashKind = '';             // 'hit' | 'miss' -> border colour shift

    let score01 = 0;
    let meta = null;
    let submitted = false;
    let startedAt = 0;
    let ringReady = false;

    let stopBtn = null;

    // ---- reduced motion --------------------------------------------------
    let reduceMotion = false;
    let mq = null;
    function onMq(e) { reduceMotion = !!(e && e.matches); }
    try {
        if (typeof window !== 'undefined' && window.matchMedia) {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            reduceMotion = !!mq.matches;
            if (mq.addEventListener) mq.addEventListener('change', onMq);
            else if (mq.addListener) mq.addListener(onMq);
        }
    } catch (err) { reduceMotion = false; }

    // ---- timer bookkeeping ----------------------------------------------
    //  Every timeout lands in one of two buckets so a rep can be torn down
    //  without killing the flow timers, and onDestroy can kill the lot.
    const repTimers = new Set();
    const flowTimers = new Set();
    let chatTimer = null;
    let rafId = null;
    let lastT = 0;
    let keyBound = false;

    function later(bucket, fn, ms) {
        const id = setTimeout(() => { bucket.delete(id); fn(); }, ms);
        bucket.add(id);
        return id;
    }
    function clearBucket(bucket) {
        for (const id of bucket) clearTimeout(id);
        bucket.clear();
    }
    function stopEverything() {
        clearBucket(repTimers);
        clearBucket(flowTimers);
        if (chatTimer) { clearTimeout(chatTimer); chatTimer = null; }
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        unbindKeys();
    }

    function bindKeys() {
        if (keyBound || typeof window === 'undefined') return;
        window.addEventListener('keydown', onKey);
        keyBound = true;
    }
    function unbindKeys() {
        if (!keyBound || typeof window === 'undefined') return;
        window.removeEventListener('keydown', onKey);
        keyBound = false;
    }

    onDestroy(() => {
        stopEverything();
        try {
            if (mq) {
                if (mq.removeEventListener) mq.removeEventListener('change', onMq);
                else if (mq.removeListener) mq.removeListener(onMq);
            }
        } catch (err) { /* nothing to clean */ }
        mq = null;
    });

    // ---- chat interference -----------------------------------------------
    const SENDERS = ['jungle', 'mid', 'top', 'adc', 'support', 'coach', 'sub'];
    const CHAT = [
        // tier 0 - normal comms
        ['gl hf', 'ss mid', 'wards up', 'b b b', 'nice cs', 'invade bot?', 'grubs in 30', 'i have flash'],
        // tier 1 - the fraying starts
        ['gg jg diff', 'mid ss x3', 'why no ping', 'that was your flash', 'care top', '??', 'farm more', 'nobody helping'],
        // tier 2 - hostile
        ['report mid', 'ff at 15', 'throwing again', 'team is 4v5', 'open mid', '0/4 and int', 'uninstall', 'worst i have seen'],
        // tier 3 - peak tilt
        ['REPORT ALL LANES', 'ff15 no cap', 'you lost us this', 'hardstuck forever', 'griefer confirmed', 'just dodge next time', '0 impact all game', 'stat check yourself'],
    ];

    function chatTier() {
        if (tiltActive) return 3;
        const p = conf.reps ? rep / conf.reps : 0;
        let t = p < 0.30 ? 0 : (p < 0.62 ? 1 : 2);
        if (conf.level === 3 && p > 0.5 && t < 3) t += 1;
        return Math.min(3, t);
    }

    function pushChat() {
        const tier = chatTier();
        const pool = CHAT[tier];
        const msg = {
            id: ++chatSeq,
            who: SENDERS[Math.floor(Math.random() * SENDERS.length)],
            text: pool[Math.floor(Math.random() * pool.length)],
            tier,
        };
        chat = [...chat, msg].slice(-8);
    }

    function scheduleChat() {
        const gap = conf.chatMs * (tiltActive ? 0.58 : 1) * (0.7 + Math.random() * 0.7);
        chatTimer = setTimeout(() => { chatTimer = null; pushChat(); scheduleChat(); }, gap);
    }

    // ---- interference badges ---------------------------------------------
    //  kind 'warn' is the telegraph, kind 'live' is the change actually landing.
    function addBadge(text, ms = 900, kind = 'live') {
        const b = { id: ++badgeSeq, text, kind };
        badges = [...badges, b].slice(-3);
        later(repTimers, () => { badges = badges.filter(x => x.id !== b.id); }, ms);
    }

    function chanceOf(base) {
        return Math.min(0.90, base + conf.evtBase + 0.012 * Math.max(0, rep - 1) + (tiltActive ? 0.18 : 0));
    }

    // ---- the sweep -------------------------------------------------------
    function easeOut(k) { return 1 - (1 - k) * (1 - k); }

    /** Start easing the sweep toward a new multiplier. Never assigns speedMul
     *  directly - a step change in speed is exactly the thing the marker cannot
     *  be tracked through. */
    function rampSpeed(to) {
        speedFrom = speedMul;
        speedTo = to;
        speedAt = Date.now();
    }

    /** Send the zone to a new centre, travelling rather than teleporting, and
     *  keep the centre it is leaving scoreable for a moment. */
    function slideZone(to) {
        const now = Date.now();
        graceC = targetC;
        graceUntil = now + SHIFT_SLIDE_MS + GRACE_TAIL_MS;
        slideFrom = targetC;
        slideTo = to;
        slideAt = now;
    }

    function loop(t) {
        rafId = requestAnimationFrame(loop);
        const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
        lastT = t;
        if (phase !== 'sweep') return;

        const now = Date.now();

        if (speedMul !== speedTo) {
            const k = Math.min(1, (now - speedAt) / SPEED_RAMP_MS);
            speedMul = k >= 1 ? speedTo : speedFrom + (speedTo - speedFrom) * easeOut(k);
        }
        if (targetC !== slideTo) {
            const k = Math.min(1, (now - slideAt) / SHIFT_SLIDE_MS);
            targetC = k >= 1 ? slideTo : slideFrom + (slideTo - slideFrom) * easeOut(k);
        }

        const sp = conf.speed * (1 + 0.03 * Math.max(0, rep - 1)) * (tiltActive ? 1.10 : 1) * speedMul;
        let p = pos + dir * sp * dt;
        if (p >= 1) { p = 1; dir = -1; }
        else if (p <= 0) { p = 0; dir = 1; }
        pos = p;
    }

    function clampCenter(c) {
        const pad = halfW + 0.02;
        return Math.max(pad, Math.min(1 - pad, c));
    }

    function beginRep() {
        if (view !== 'playing') return;
        if (rep >= conf.reps || (Date.now() - startedAt) > SESSION_CAP_MS) { finishRound(); return; }

        rep += 1;
        if (tiltActive) tiltRounds += 1;

        clearBucket(repTimers);
        badges = [];
        speedMul = 1; speedFrom = 1; speedTo = 1; speedAt = 0;
        teleported = false;
        graceC = null;
        graceUntil = 0;
        flashKind = '';

        homeC = clampCenter(0.12 + Math.random() * 0.76);
        targetC = homeC;
        slideFrom = homeC; slideTo = homeC; slideAt = 0;

        let start = Math.random();
        let guard = 0;
        while (Math.abs(start - homeC) < 0.24 && guard++ < 40) start = Math.random();
        pos = start;
        dir = start > homeC ? -1 : 1;
        if (Math.random() < 0.25) dir = -dir;   // sometimes make them wait a lap

        phase = 'sweep';
        feedback = tiltActive ? 'TILTED - this rep is worth double' : 'Stop it in the zone';
        feedKind = tiltActive ? 'tilt' : 'neutral';

        scheduleEvents();
        later(repTimers, () => judge(true), conf.repMs);
    }

    /**
     * Lay out this rep's interference.
     *
     * Two rules do all the work of turning this from a coin flip into a drill:
     *   1. Every change is announced `conf.tell` ms before it happens, so there
     *      is always an input that beats it.
     *   2. Events never overlap and never land in the opening or closing stretch
     *      of a rep, so the shot you line up is the shot you take.
     * A cursor walks forward through the rep and each scheduled event pushes it
     * past its own telegraph plus EVENT_GAP_MS, which is what enforces rule 2.
     */
    function scheduleEvents() {
        const first = 460;
        // Nothing lands inside the last stretch - the final approach is clean.
        const last = Math.max(first + 150, conf.repMs - (conf.tell + 700));
        let slots = conf.maxEvt;
        let cursor = first;

        const roll = (p, warn, fn) => {
            if (slots <= 0 || cursor >= last) return;
            if (Math.random() >= p) return;
            slots -= 1;
            const at = cursor + Math.random() * (last - cursor);
            cursor = at + conf.tell + EVENT_GAP_MS;
            later(repTimers, () => {
                if (phase === 'sweep') addBadge(warn, conf.tell + 120, 'warn');
            }, at);
            later(repTimers, () => { if (phase === 'sweep') fn(); }, at + conf.tell);
        };

        // Speed change. Decided up front so the warning can name which way it
        // is going, and eased in rather than snapped.
        const up = Math.random() < 0.55 + 0.1 * (conf.level - 1);
        roll(chanceOf(0.34), up ? 'SPEED UP INCOMING' : 'SPEED DROP INCOMING', () => {
            rampSpeed(up ? (1.20 + Math.random() * 0.24) : (0.66 + Math.random() * 0.14));
            addBadge(up ? 'SPEED UP' : 'SPEED DROP');
        });

        // The bar reverses.
        roll(chanceOf(0.18), 'REVERSE INCOMING', () => {
            dir = -dir;
            addBadge('INVERTED');
        });

        // The zone moves, holds, then travels back. It never appears somewhere
        // new without crossing the ground in between, and the centre it left
        // keeps scoring while it is in transit.
        roll(chanceOf(0.13), 'TARGET MOVING', () => {
            let c = Math.random();
            let g = 0;
            while (Math.abs(c - homeC) < 0.26 && g++ < 40) c = Math.random();
            slideZone(clampCenter(c));
            teleported = true;
            addBadge('TARGET SHIFT', SHIFT_SLIDE_MS + SHIFT_HOLD_MS);
            later(repTimers, () => {
                if (phase !== 'sweep') return;
                slideZone(homeC);
                teleported = false;
            }, SHIFT_SLIDE_MS + SHIFT_HOLD_MS);
        });
    }

    function judge(timedOut) {
        if (phase !== 'sweep') return;
        phase = 'judge';
        clearBucket(repTimers);
        badges = [];

        const weight = tiltActive ? 2 : 1;
        // While the zone is travelling, the centre it left still counts. The
        // player aimed at something that was there when they committed, and a
        // composure drill has no business punishing that.
        const graceLive = graceC !== null && Date.now() < graceUntil;
        const dist = timedOut
            ? 1
            : Math.min(
                Math.abs(pos - targetC),
                graceLive ? Math.abs(pos - graceC) : Infinity,
            );
        const hit = !timedOut && dist <= halfW;
        const prec = hit ? Math.max(0, 1 - dist / Math.max(1e-6, halfW)) : 0;

        played += 1;
        weightSum += weight;
        distSum += Math.min(dist, 0.5);

        if (hit) {
            hits += 1;
            weightedHits += weight;
            precSum += prec;
            streak += 1;
            if (streak > best) best = streak;
            if (halfW < tightest) tightest = halfW;   // width they landed in
            halfW = Math.max(conf.halfMin, halfW * conf.shrink);
            if (tiltActive) {
                tiltHits += 1;
                feedback = 'CLUTCH - held it while tilted';
                feedKind = 'clutch';
            } else {
                tilt = Math.max(0, tilt - 0.12);
                feedback = prec > 0.72 ? 'DEAD CENTRE' : 'Landed';
                feedKind = 'hit';
            }
            flashKind = 'hit';
        } else {
            misses += 1;
            streak = 0;
            halfW = Math.min(conf.half0, halfW * conf.regrow);
            if (!tiltActive) tilt = Math.min(1, tilt + 0.34);
            feedback = timedOut ? 'TOO SLOW - no shot taken' : 'Missed the zone';
            feedKind = 'miss';
            flashKind = 'miss';
            if (!reduceMotion) {
                shaking = true;
                later(flowTimers, () => { shaking = false; }, 300);
            }
        }

        // tilt bookkeeping runs after the rep is scored
        if (tiltActive) {
            tiltLeft -= 1;
            if (tiltLeft <= 0) { tiltActive = false; tilt = 0; }
        } else if (tilt >= 1) {
            tiltActive = true;
            tiltLeft = 2;
            feedback = 'TILT METER FULL - next two reps are double';
            feedKind = 'tilt';
        }

        later(flowTimers, beginRep, hit ? 700 : 880);
    }

    // ---- scoring ---------------------------------------------------------
    function smoothstep(x) { return x * x * (3 - 2 * x); }

    function finishRound() {
        phase = 'over';
        stopEverything();

        const hitRate = weightSum > 0 ? weightedHits / weightSum : 0;
        const rawCentre = hits > 0 ? precSum / hits : 0;
        // a single lucky bullseye should not carry the centring term
        const centring = rawCentre * (0.5 + 0.5 * hitRate);
        const clutch = tiltRounds > 0 ? (tiltHits / tiltRounds) : hitRate;

        const base = 0.55 * hitRate + 0.30 * centring + 0.15 * clutch;
        const shaped = 0.5 * base + 0.5 * smoothstep(Math.max(0, Math.min(1, base)));
        score01 = Math.max(0, Math.min(1, shaped));

        const plainAcc = played > 0 ? hits / played : 0;
        const avgOffPct = played > 0 ? (distSum / played) * 100 : 0;
        const label = verdict(score01);

        meta = {
            label,
            accuracy: plainAcc,
            hits,
            misses,
            streak,
            best,
            detail: hits + '/' + played + ' landed - avg offset ' + avgOffPct.toFixed(1) +
                    '% of bar - best streak ' + best + ' - ' + tiltHits + '/' + tiltRounds + ' tilt reps saved',
            rounds: played,
            tiltRounds,
            tiltRecoveries: tiltHits,
            avgOffsetPct: avgOffPct,
            tightest: tightest * 200,       // narrowest zone landed, % of bar
            difficulty: conf.level,
            game: 'clutch',
            attr: 'cmp',
        };

        view = 'result';
        // Reduced-motion users get the final ring immediately, everyone else
        // gets one slow sweep as it fills.
        ringReady = reduceMotion;
        if (!reduceMotion) later(flowTimers, () => { ringReady = true; }, 60);
    }

    function verdict(s) {
        if (s >= 0.90) return 'Ice in the Veins';
        if (s >= 0.78) return 'Unshakeable';
        if (s >= 0.64) return 'Composed';
        if (s >= 0.50) return 'Steady Enough';
        if (s >= 0.34) return 'Rattled';
        if (s >= 0.18) return 'Tilted';
        return 'Full Meltdown';
    }

    function verdictLine(s) {
        if (s >= 0.90) return 'Nothing in that chat log touched you. Game five hands.';
        if (s >= 0.78) return 'One bad rep and you were back on rhythm immediately.';
        if (s >= 0.64) return 'Solid. The misses cost you less than they cost most people.';
        if (s >= 0.50) return 'You held together, but the tilt reps got away from you.';
        if (s >= 0.34) return 'The first mistake dragged three more behind it.';
        if (s >= 0.18) return 'Every miss made the next one likelier. That is the habit to break.';
        return 'The interference ran the session. Slow down and take the shot you have.';
    }

    // ---- flow ------------------------------------------------------------
    function startRound() {
        conf = cfg(lvl);
        rep = 0;
        pos = 0.5; dir = 1;
        speedMul = 1; speedFrom = 1; speedTo = 1; speedAt = 0;
        halfW = conf.half0; tightest = conf.half0;
        homeC = 0.5; targetC = 0.5; teleported = false;
        slideFrom = 0.5; slideTo = 0.5; slideAt = 0;
        graceC = null; graceUntil = 0;
        hits = 0; misses = 0; streak = 0; best = 0;
        weightSum = 0; weightedHits = 0; precSum = 0; distSum = 0; played = 0;
        tilt = 0; tiltActive = false; tiltLeft = 0; tiltRounds = 0; tiltHits = 0;
        badges = []; chat = []; shaking = false; flashKind = '';
        score01 = 0; meta = null; submitted = false; ringReady = false;
        feedback = 'Get ready'; feedKind = 'neutral';

        view = 'playing';
        phase = 'ready';
        startedAt = Date.now();
        lastT = 0;

        bindKeys();
        if (rafId === null) rafId = requestAnimationFrame(loop);
        pushChat();
        scheduleChat();
        later(flowTimers, beginRep, 950);
        later(flowTimers, focusStop, 60);
    }

    function focusStop() {
        try { if (stopBtn) stopBtn.focus(); } catch (err) { /* focus is a nicety */ }
    }

    function stopMarker() {
        if (view !== 'playing' || phase !== 'sweep') return;
        judge(false);
    }

    function onKey(e) {
        if (view !== 'playing') return;
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
            e.preventDefault();
            stopMarker();
        }
    }

    function quit() {
        stopEverything();
        if (typeof onQuit === 'function') onQuit();
    }

    function finishSession() {
        if (submitted) return;
        submitted = true;
        stopEverything();
        if (typeof onComplete === 'function') onComplete(score01, meta);
    }

    // ---- derived display --------------------------------------------------
    $: preview = cfg(lvl);
    $: zoneLeft = Math.max(0, (targetC - halfW)) * 100;
    $: zoneWidth = Math.min(100, halfW * 200);
    $: tiltPct = Math.round(Math.max(0, Math.min(1, tilt)) * 100);
    $: intensity = tiltActive ? 'PEAK'
        : (rep / Math.max(1, conf.reps) > 0.66 ? 'HIGH'
        : (rep / Math.max(1, conf.reps) > 0.33 ? 'MEDIUM' : 'LOW'));
    $: scorePct = Math.round(score01 * 100);
    $: ringDash = ringReady ? 326.7 * Math.max(0, Math.min(1, score01)) : 0;
    $: headName = (drill && drill.name) ? drill.name : 'Clutch Trial';
    $: headDesc = (drill && drill.desc) ? drill.desc
        : 'Tilt resistance. Playing the same on game five of a Bo5 as you did on game one.';
</script>

<section class="cg" class:reduced={reduceMotion}>

    <header class="cg-head">
        <div class="cg-id">
            <span class="cg-attr">CMP</span>
            <div class="cg-titles">
                <h2 class="cg-name">{headName}</h2>
                <span class="cg-kind">Composure drill</span>
            </div>
        </div>
        <span class="cg-diff" aria-label={'Difficulty ' + preview.level + ', ' + preview.name}>{preview.name}</span>
    </header>

    <!-- ================= INTRO ================= -->
    {#if view === 'intro'}
        <div class="cg-panel cg-intro">
            <p class="cg-blurb">{headDesc}</p>
            <p class="cg-body">
                A marker sweeps across the bar and you stop it inside the zone. That part is easy.
                The drill is everything trying to stop you: the zone shrinks every time you land it,
                your team fills the chat with abuse, the sweep changes pace, the bar reverses and the
                zone sometimes moves somewhere else entirely. Every one of those is announced a beat
                before it happens - there is always a shot that beats it, and finding that shot while
                the chat is going is the exercise. Miss three times and the tilt meter fills: the next
                two reps are worth double. Composure is not never missing. It is what you do on rep four.
            </p>

            <div class="cg-how">
                <span class="cg-lbl">How to play</span>
                <ul class="cg-list">
                    <li><b>Space</b> or <b>Enter</b> stops the marker. Mouse or touch: hit <b>STOP</b>, or tap the bar.</li>
                    <li>Land inside the zone. The closer to the centre line, the more the rep is worth.</li>
                    <li>Every landed rep shrinks the zone. Every miss feeds the tilt meter.</li>
                    <li>An <b>amber badge</b> is a warning. The change it names lands about half a second later.</li>
                    <li>If the zone moves while you are committing, the spot you aimed at still scores.</li>
                    <li>Reps played while <b>TILTED</b> count double. Those are the ones that decide your score.</li>
                    <li>Wait too long and the rep expires as a miss. Take the shot you have.</li>
                </ul>
            </div>

            <div class="cg-spec">
                <div class="cg-spec-cell"><span class="cg-spec-v">{preview.reps}</span><span class="cg-spec-l">Reps</span></div>
                <div class="cg-spec-cell"><span class="cg-spec-v">{(preview.repMs / 1000).toFixed(1)}s</span><span class="cg-spec-l">Per rep</span></div>
                <div class="cg-spec-cell"><span class="cg-spec-v">{(preview.half0 * 200).toFixed(0)}%</span><span class="cg-spec-l">Start zone</span></div>
                <div class="cg-spec-cell"><span class="cg-spec-v">{(preview.halfMin * 200).toFixed(1)}%</span><span class="cg-spec-l">Min zone</span></div>
            </div>

            <div class="cg-actions">
                {#if typeof onQuit === 'function'}
                    <button type="button" class="cg-btn cg-btn-ghost" on:click={quit} aria-label="Back out of the Clutch Trial without training">Back</button>
                {/if}
                <button type="button" class="cg-btn cg-btn-go" on:click={startRound} aria-label="Start the Clutch Trial">Start Drill</button>
            </div>
        </div>

    <!-- ================= PLAYING ================= -->
    {:else if view === 'playing'}
        <div class="cg-hud">
            <div class="cg-chip"><span class="cg-chip-v">{Math.max(1, rep)}<i>/{conf.reps}</i></span><span class="cg-chip-l">Rep</span></div>
            <div class="cg-chip"><span class="cg-chip-v">{hits}</span><span class="cg-chip-l">Landed</span></div>
            <div class="cg-chip"><span class="cg-chip-v">{streak}<i>/{best}</i></span><span class="cg-chip-l">Streak</span></div>
            <div class="cg-chip"><span class="cg-chip-v">{tiltHits}</span><span class="cg-chip-l">Recovered</span></div>
            <div class="cg-tilt" class:on={tiltActive}>
                <div class="cg-tilt-top">
                    <span class="cg-chip-l">Tilt {tiltActive ? '- DOUBLE x' + tiltLeft : ''}</span>
                    <span class="cg-int">{intensity}</span>
                </div>
                <div class="cg-tilt-track" role="progressbar" aria-label="Tilt meter" aria-valuenow={tiltActive ? 100 : tiltPct} aria-valuemin="0" aria-valuemax="100">
                    <div class="cg-tilt-fill" style="width:{tiltActive ? 100 : tiltPct}%"></div>
                </div>
            </div>
        </div>

        <div class="cg-stage-wrap">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="cg-stage {flashKind ? 'fx-' + flashKind : ''}"
                class:shake={shaking}
                class:tilted={tiltActive}
                on:pointerdown|preventDefault={stopMarker}
            >
                <div class="cg-badges" aria-hidden="true">
                    {#each badges as b (b.id)}
                        <span class="cg-badge cg-badge-{b.kind}">{b.text}</span>
                    {/each}
                </div>

                <div class="cg-bar">
                    <div class="cg-bar-track"></div>
                    <div class="cg-zone" class:tele={teleported} style="left:{zoneLeft}%;width:{zoneWidth}%">
                        <span class="cg-zone-mid"></span>
                    </div>
                    <div class="cg-marker" class:frozen={phase === 'judge'} style="left:{pos * 100}%">
                        <span class="cg-marker-head"></span>
                    </div>
                    <div class="cg-ticks" aria-hidden="true">
                        {#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as t}<span style="left:{(t + 1) * 10}%"></span>{/each}
                    </div>
                </div>

                <p class="cg-feed cg-feed-{feedKind}" aria-live="polite">
                    {phase === 'ready' ? 'Get ready' : feedback}
                </p>
            </div>

            <!-- Fake team chat. Pure interference, hidden from assistive tech
                 so a screen reader user is not spammed with abuse. -->
            <div class="cg-chat" aria-hidden="true">
                <div class="cg-chat-lbl">All Chat</div>
                <div class="cg-chat-body">
                    {#each chat as m (m.id)}
                        <div class="cg-msg t{m.tier}" class:hot={m.tier >= 3 && !reduceMotion}>
                            <span class="cg-who">{m.who}:</span> {m.text}
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <button
            type="button"
            class="cg-stop"
            class:armed={phase === 'sweep'}
            bind:this={stopBtn}
            on:pointerdown={stopMarker}
            aria-label="Stop the marker inside the target zone. Keyboard: space or enter"
        >
            <span class="cg-stop-t">STOP</span>
            <span class="cg-stop-s">Space / Enter</span>
        </button>

    <!-- ================= RESULT ================= -->
    {:else}
        <div class="cg-panel cg-result">
            <div class="cg-ring-wrap">
                <svg class="cg-ring" viewBox="0 0 120 120" role="img" aria-label={'Session score ' + scorePct + ' out of 100'}>
                    <circle class="cg-ring-bg" cx="60" cy="60" r="52" />
                    <circle class="cg-ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray:{ringDash} 326.7" />
                </svg>
                <div class="cg-ring-mid">
                    <span class="cg-ring-v">{scorePct}</span>
                    <span class="cg-ring-l">Score</span>
                </div>
            </div>

            <div class="cg-verdict">{meta ? meta.label : ''}</div>
            <p class="cg-vline">{verdictLine(score01)}</p>

            <div class="cg-grid">
                <div class="cg-cell"><span class="cg-cell-v">{hits}<i>/{played}</i></span><span class="cg-cell-l">Reps landed</span></div>
                <div class="cg-cell"><span class="cg-cell-v">{Math.round((meta ? meta.accuracy : 0) * 100)}%</span><span class="cg-cell-l">Hit rate</span></div>
                <div class="cg-cell"><span class="cg-cell-v">{(meta ? meta.avgOffsetPct : 0).toFixed(1)}%</span><span class="cg-cell-l">Avg off centre</span></div>
                <div class="cg-cell"><span class="cg-cell-v">{best}</span><span class="cg-cell-l">Best streak</span></div>
                <div class="cg-cell hi"><span class="cg-cell-v">{tiltHits}<i>/{tiltRounds}</i></span><span class="cg-cell-l">Tilt recoveries</span></div>
                <div class="cg-cell"><span class="cg-cell-v">{(tightest * 200).toFixed(1)}%</span><span class="cg-cell-l">Tightest zone</span></div>
            </div>

            <p class="cg-detail">{meta ? meta.detail : ''}</p>

            <div class="cg-actions">
                <button type="button" class="cg-btn cg-btn-go" on:click={finishSession} disabled={submitted} aria-label="Finish the session and bank the result">
                    Finish Session
                </button>
            </div>
        </div>
    {/if}
</section>

<style>
    .cg {
        --acc: #a855f7;
        --acc-soft: rgba(168, 85, 247, 0.15);
        --acc-line: rgba(168, 85, 247, 0.28);
        --ok: #34d399;
        --bad: #f87171;
        max-width: 860px;
        margin: 0 auto;
        padding: 4px 0 28px;
        color: #cbd5e1;
        font-family: inherit;
    }

    /* ---------- header ---------- */
    .cg-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .cg-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .cg-attr {
        flex: none;
        display: inline-flex; align-items: center; justify-content: center;
        width: 42px; height: 42px; border-radius: 13px;
        background: var(--acc-soft); border: 1px solid var(--acc-line);
        color: #d8b4fe; font-size: 11px; font-weight: 900; letter-spacing: 1px;
    }
    .cg-titles { min-width: 0; }
    .cg-name { font-size: 19px; font-weight: 900; color: #e2e8f0; line-height: 1.15; }
    .cg-kind {
        display: block; margin-top: 3px;
        font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #475569;
    }
    .cg-diff {
        flex: none; padding: 6px 12px; border-radius: 999px;
        background: rgba(12,16,28,0.6); border: 1px solid rgba(51,65,85,0.35);
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.4px; color: #94a3b8;
    }

    /* ---------- shared panel ---------- */
    .cg-panel {
        background: rgba(12,16,28,0.5);
        border: 1px solid rgba(51,65,85,0.28);
        border-radius: 20px;
        padding: 22px;
    }
    .cg-lbl {
        display: block; font-size: 9px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1.5px; color: #334155; margin-bottom: 8px;
    }

    /* ---------- intro ---------- */
    .cg-blurb { font-size: 13px; color: #d8b4fe; font-weight: 700; line-height: 1.5; margin-bottom: 12px; }
    .cg-body { font-size: 12.5px; color: #94a3b8; line-height: 1.75; margin-bottom: 18px; }
    .cg-how {
        background: rgba(15,23,42,0.4); border: 1px solid rgba(51,65,85,0.2);
        border-radius: 14px; padding: 14px 16px; margin-bottom: 16px;
    }
    .cg-list { margin: 0; padding-left: 16px; }
    .cg-list li { font-size: 12px; color: #94a3b8; line-height: 1.7; }
    .cg-list b { color: #e2e8f0; font-weight: 800; }

    .cg-spec { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
    .cg-spec-cell {
        background: rgba(15,23,42,0.4); border: 1px solid rgba(51,65,85,0.18);
        border-radius: 12px; padding: 11px 6px; text-align: center;
    }
    .cg-spec-v { display: block; font-size: 17px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .cg-spec-l {
        display: block; margin-top: 5px; font-size: 8px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.8px; color: #475569;
    }
    @media (max-width: 460px) { .cg-spec { grid-template-columns: repeat(2, 1fr); } }

    .cg-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .cg-btn {
        padding: 11px 24px; border-radius: 12px; border: none; cursor: pointer;
        font-family: inherit; font-size: 12px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1px;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .cg-btn-go {
        background: linear-gradient(135deg, #7e22ce 0%, #a855f7 100%);
        color: #f5f3ff; box-shadow: 0 4px 15px rgba(168,85,247,0.25);
    }
    .cg-btn-go:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(168,85,247,0.45); }
    .cg-btn-go:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
    .cg-btn-ghost {
        background: rgba(51,65,85,0.4); color: #94a3b8;
        border: 1px solid rgba(71,85,105,0.35); font-weight: 800;
    }
    .cg-btn-ghost:hover { background: rgba(71,85,105,0.6); color: #e2e8f0; }

    /* ---------- HUD ---------- */
    .cg-hud {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(150px, 1.6fr);
        gap: 8px; margin-bottom: 12px;
    }
    .cg-chip, .cg-tilt {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.25);
        border-radius: 12px; padding: 9px 10px;
    }
    .cg-chip { text-align: center; }
    .cg-chip-v { display: block; font-size: 17px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .cg-chip-v i { font-style: normal; font-size: 11px; color: #475569; font-weight: 800; }
    .cg-chip-l {
        display: block; margin-top: 5px; font-size: 8px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 1px; color: #475569; white-space: nowrap;
    }
    .cg-tilt { display: flex; flex-direction: column; justify-content: center; gap: 7px; transition: border-color 0.5s ease, background 0.5s ease; }
    .cg-tilt.on { border-color: rgba(248,113,113,0.45); background: rgba(69,10,10,0.35); }
    .cg-tilt-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
    .cg-tilt.on .cg-chip-l { color: #fca5a5; }
    .cg-int {
        font-size: 8px; font-weight: 900; letter-spacing: 1px; color: #64748b;
        padding: 2px 6px; border-radius: 6px; background: rgba(15,23,42,0.7);
        transition: color 0.5s ease, background 0.5s ease;
    }
    .cg-tilt.on .cg-int { color: #fecaca; background: rgba(127,29,29,0.6); }
    .cg-tilt-track { height: 7px; border-radius: 999px; background: rgba(15,23,42,0.85); overflow: hidden; }
    .cg-tilt-fill {
        height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, #7e22ce, #a855f7 60%, #f87171);
        transition: width 0.35s ease;
    }
    @media (max-width: 620px) {
        .cg-hud { grid-template-columns: repeat(4, 1fr); }
        .cg-tilt { grid-column: 1 / -1; }
    }

    /* ---------- stage ---------- */
    .cg-stage-wrap { display: grid; grid-template-columns: 1fr 220px; gap: 12px; margin-bottom: 12px; }
    @media (max-width: 720px) { .cg-stage-wrap { grid-template-columns: 1fr; } }

    .cg-stage {
        position: relative;
        background: rgba(12,16,28,0.5);
        border: 1px solid rgba(51,65,85,0.28);
        border-radius: 18px;
        padding: 16px 18px 14px;
        touch-action: manipulation;
        user-select: none;
        transition: border-color 0.45s ease, box-shadow 0.45s ease, background 0.45s ease;
        cursor: pointer;
    }
    .cg-stage.tilted { border-color: rgba(248,113,113,0.35); background: rgba(30,12,20,0.5); }
    .cg-stage.fx-hit { border-color: rgba(52,211,153,0.5); }
    .cg-stage.fx-miss { border-color: rgba(248,113,113,0.6); }

    .cg-badges { display: flex; gap: 6px; flex-wrap: wrap; min-height: 20px; margin-bottom: 12px; }
    .cg-badge {
        font-size: 8px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase;
        color: #fde68a; background: rgba(120,53,15,0.5); border: 1px solid rgba(245,158,11,0.35);
        padding: 3px 8px; border-radius: 7px;
    }
    /* The telegraph. Deliberately louder than the change it announces - reading
       this badge in time IS the skill the drill is testing. */
    .cg-badge-warn {
        color: #fef3c7; background: rgba(180,83,9,0.55); border-color: rgba(251,191,36,0.75);
        animation: cgTell 0.42s ease-in-out infinite alternate;
    }
    @keyframes cgTell { from { opacity: 0.62; } to { opacity: 1; } }
    .cg.reduced .cg-badge-warn { animation: none; opacity: 1; }
    .cg-badge-live { color: #fecaca; background: rgba(127,29,29,0.5); border-color: rgba(248,113,113,0.4); }

    .cg-bar { position: relative; height: 76px; margin: 6px 0 14px; }
    .cg-bar-track {
        position: absolute; left: 0; right: 0; top: 50%; height: 30px; transform: translateY(-50%);
        background: linear-gradient(180deg, rgba(15,23,42,0.9), rgba(2,6,23,0.9));
        border: 1px solid rgba(51,65,85,0.35); border-radius: 10px;
    }
    .cg-ticks { position: absolute; left: 0; right: 0; top: 50%; height: 30px; transform: translateY(-50%); }
    .cg-ticks span {
        position: absolute; top: 6px; bottom: 6px; width: 1px;
        background: rgba(71,85,105,0.22);
    }
    .cg-zone {
        position: absolute; top: 50%; height: 44px; transform: translateY(-50%);
        background: var(--acc-soft); border: 1px solid var(--acc-line);
        border-radius: 8px; box-shadow: inset 0 0 14px rgba(168,85,247,0.14);
        /* NO transition on `left`. The slide is driven frame-by-frame from the
           rAF loop now, and a CSS transition on top of that lags the drawn zone
           behind the one being scored - which is the exact unfairness the slide
           was added to remove. */
        transition: width 0.25s ease, border-color 0.4s ease, background 0.4s ease;
    }
    .cg-zone.tele { background: rgba(245,158,11,0.16); border-color: rgba(245,158,11,0.45); }
    .cg-zone-mid {
        position: absolute; left: 50%; top: 3px; bottom: 3px; width: 2px; margin-left: -1px;
        background: rgba(216,180,254,0.75); border-radius: 2px;
    }
    .cg-marker {
        position: absolute; top: 50%; height: 62px; width: 3px; margin-left: -1.5px;
        transform: translateY(-50%);
        background: linear-gradient(180deg, #f8fafc, #cbd5e1);
        border-radius: 3px; box-shadow: 0 0 10px rgba(226,232,240,0.35);
    }
    .cg-marker.frozen { background: linear-gradient(180deg, #fde68a, #f59e0b); box-shadow: 0 0 12px rgba(245,158,11,0.5); }
    .cg-marker-head {
        position: absolute; left: 50%; top: -7px; width: 9px; height: 9px; margin-left: -4.5px;
        background: #e2e8f0; border-radius: 2px; transform: rotate(45deg);
    }
    .cg-marker.frozen .cg-marker-head { background: #f59e0b; }

    .cg-feed {
        font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px;
        text-align: center; min-height: 15px; color: #64748b;
        transition: color 0.3s ease;
    }
    .cg-feed-hit { color: var(--ok); }
    .cg-feed-clutch { color: #d8b4fe; }
    .cg-feed-miss { color: var(--bad); }
    .cg-feed-tilt { color: #fbbf24; }

    /* shake is motion-only; reduced-motion users get the colour shift above */
    @keyframes cgShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-5px); }
        45% { transform: translateX(4px); }
        70% { transform: translateX(-3px); }
    }
    .cg-stage.shake { animation: cgShake 0.3s ease; }
    .cg.reduced .cg-stage.shake { animation: none; }

    /* ---------- chat ---------- */
    .cg-chat {
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.25);
        border-radius: 18px; padding: 12px 13px;
        display: flex; flex-direction: column; min-width: 0;
    }
    .cg-chat-lbl {
        font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px;
        color: #334155; margin-bottom: 8px;
    }
    .cg-chat-body {
        flex: 1; display: flex; flex-direction: column; justify-content: flex-end;
        gap: 4px; height: 152px; overflow: hidden;
    }
    @media (max-width: 720px) { .cg-chat-body { height: 92px; } }
    .cg-msg {
        font-size: 11px; line-height: 1.35; color: #64748b;
        word-break: break-word;
        animation: cgSlide 0.3s ease;
    }
    .cg.reduced .cg-msg { animation: none; }
    @keyframes cgSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .cg-who { color: #475569; font-weight: 800; }
    .cg-msg.t1 { color: #94a3b8; }
    .cg-msg.t2 { color: #fbbf24; }
    .cg-msg.t3 { color: #f87171; font-weight: 800; }
    @keyframes cgHot { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
    .cg-msg.hot { animation: cgSlide 0.3s ease, cgHot 1.4s ease-in-out 0.3s infinite; }
    .cg.reduced .cg-msg.hot { animation: none; }

    /* ---------- stop button ---------- */
    .cg-stop {
        width: 100%; padding: 20px 12px; border-radius: 18px; cursor: pointer;
        font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 4px;
        background: rgba(30,41,59,0.5); border: 1px solid rgba(71,85,105,0.35);
        color: #64748b; touch-action: manipulation; user-select: none;
        transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
    }
    .cg-stop.armed {
        background: linear-gradient(135deg, #6b21a8 0%, #a855f7 100%);
        border-color: rgba(216,180,254,0.4); color: #faf5ff;
        box-shadow: 0 6px 22px rgba(168,85,247,0.28);
    }
    .cg-stop.armed:hover { transform: translateY(-1px); }
    .cg-stop.armed:active { transform: translateY(1px); }
    .cg-stop-t { font-size: 22px; font-weight: 900; letter-spacing: 4px; line-height: 1; }
    .cg-stop-s { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.6px; opacity: 0.75; }

    /* ---------- result ---------- */
    .cg-result { text-align: center; }
    .cg-ring-wrap { position: relative; width: 132px; height: 132px; margin: 4px auto 14px; }
    .cg-ring { width: 132px; height: 132px; transform: rotate(-90deg); }
    .cg-ring-bg { fill: none; stroke: rgba(51,65,85,0.35); stroke-width: 9; }
    .cg-ring-fg {
        fill: none; stroke: var(--acc); stroke-width: 9; stroke-linecap: round;
        transition: stroke-dasharray 0.8s ease;
    }
    .cg-ring-mid {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 2px;
    }
    .cg-ring-v { font-size: 38px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .cg-ring-l { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px; color: #475569; }

    .cg-verdict { font-size: 19px; font-weight: 900; color: #d8b4fe; letter-spacing: 0.5px; }
    .cg-vline { font-size: 12.5px; color: #94a3b8; line-height: 1.6; margin: 8px auto 18px; max-width: 460px; }

    .cg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    @media (max-width: 520px) { .cg-grid { grid-template-columns: repeat(2, 1fr); } }
    .cg-cell {
        background: rgba(15,23,42,0.4); border: 1px solid rgba(51,65,85,0.18);
        border-radius: 12px; padding: 12px 6px;
    }
    .cg-cell.hi { border-color: var(--acc-line); background: rgba(88,28,135,0.18); }
    .cg-cell-v { display: block; font-size: 18px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .cg-cell-v i { font-style: normal; font-size: 11px; color: #475569; font-weight: 800; }
    .cg-cell.hi .cg-cell-v { color: #d8b4fe; }
    .cg-cell-l {
        display: block; margin-top: 5px; font-size: 8px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.8px; color: #475569;
    }
    .cg-detail { font-size: 10.5px; color: #475569; margin-bottom: 18px; line-height: 1.6; }
    .cg-result .cg-actions { justify-content: center; }

    /* ---------- focus ---------- */
    .cg button:focus-visible {
        outline: 2px solid var(--acc);
        outline-offset: 3px;
    }

    /* ---------- global reduced-motion guard ---------- */
    @media (prefers-reduced-motion: reduce) {
        .cg-stage.shake, .cg-msg, .cg-msg.hot, .cg-badge-warn { animation: none !important; }
        .cg-zone, .cg-ring-fg, .cg-tilt-fill { transition-duration: 0.6s; }
    }
</style>
