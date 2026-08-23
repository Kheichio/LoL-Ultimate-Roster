<script>
    // =====================================================================
    //  LAST HIT LADDER - Mechanics (MEC) training drill
    //  Self-contained. No store imports, no career imports, no assets.
    //
    //  Minions march left along their own health bar toward your tower.
    //  Bar position IS health: full health = far away, empty = at your tower.
    //  Swing when the marker is inside the kill band. Your damage lands
    //  WINDUP seconds after the input, so you must lead the bar.
    // =====================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;
    export let drill = null;
    export let onComplete = null;
    export let onQuit = null;

    const LANES = 6;
    const WINDUP = 0.18;        // seconds between input and damage landing
    const PERFECT_FRAC = 0.42;  // land at <= AD * this for a "perfect" last hit
    const SWORD = '\u{2694}';

    // --- minion archetypes -------------------------------------------------
    // window (seconds) = AD / drain. Casters drain fast, cannons are slow and
    // worth double, melee sits in the middle.
    const TYPES = [
        { key: 'melee',  name: 'Melee',  maxHp: 360, drain: 100, cs: 1, weight: 0.52, tint: '#94a3b8' },
        { key: 'caster', name: 'Caster', maxHp: 330, drain: 132, cs: 1, weight: 0.32, tint: '#60a5fa' },
        { key: 'cannon', name: 'Cannon', maxHp: 400, drain: 74,  cs: 2, weight: 0.16, tint: '#fbbf24' },
    ];

    // band: 2 = kill band + perfect core, 1 = kill band only, 0 = read the bar
    const DIFFS = {
        1: { tag: 'Basic',    time: 40, spawn: 1.55, drainMult: 1.00, ad: 100, recovery: 0.22,
             harass: 3.8, tele: 0.95, dmg: 15, regen: 5.0, band: 2, ghost: true,  target: 9  },
        2: { tag: 'Advanced', time: 42, spawn: 1.34, drainMult: 1.12, ad: 88,  recovery: 0.20,
             harass: 2.9, tele: 0.78, dmg: 19, regen: 4.5, band: 1, ghost: false, target: 12 },
        3: { tag: 'Elite',    time: 45, spawn: 1.18, drainMult: 1.26, ad: 78,  recovery: 0.18,
             harass: 2.3, tele: 0.62, dmg: 23, regen: 4.0, band: 0, ghost: false, target: 15 },
    };

    $: level = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 1)));
    $: D = DIFFS[level];
    $: AD = D.ad;

    // --- state -------------------------------------------------------------
    let phase = 'intro';           // intro | playing | result
    let lanes = new Array(LANES).fill(null);
    let fxLane = new Array(LANES).fill(null);
    let playerLane = 2;

    let T = 0;                     // monotonic game clock (seconds, dt-clamped)
    let countdown = 0;
    let elapsed = 0;
    let timeLeft = 0;

    let hp = 100;
    let recallUntil = 0;
    let deaths = 0;
    let hpSum = 0, hpSamples = 0;
    let hitAt = -99;

    let cs = 0, csLost = 0;
    let hits = 0, pushes = 0, whiffs = 0, perfects = 0, dodges = 0;
    let streak = 0, bestStreak = 0;

    let swing = null;              // { lane, id, landAt }
    let nextReady = 0;
    let harass = null;             // { lane, at }
    let nextHarass = 0;
    let spawnAt = 0;
    let nextId = 1;

    let res = null;
    let reduceMotion = false;
    let mq = null;
    let raf = null;
    let last = 0;
    let startBtn = null;

    // --- helpers -----------------------------------------------------------
    function clampLane(n) { return Math.max(0, Math.min(LANES - 1, n)); }
    function pct(v) { return Math.max(0, Math.min(100, v)); }

    function pickType() {
        let r = Math.random(), acc = 0;
        for (const t of TYPES) { acc += t.weight; if (r <= acc) return t; }
        return TYPES[0];
    }

    function fx(lane, text, kind) {
        fxLane[lane] = { id: nextId++, text, kind, until: T + 0.85 };
        fxLane = fxLane;
    }

    // --- round control -----------------------------------------------------
    function start() {
        lanes = new Array(LANES).fill(null);
        fxLane = new Array(LANES).fill(null);
        playerLane = 2;
        T = 0; elapsed = 0; countdown = 1.8; timeLeft = D.time;
        hp = 100; recallUntil = 0; deaths = 0; hpSum = 0; hpSamples = 0; hitAt = -99;
        cs = 0; csLost = 0; hits = 0; pushes = 0; whiffs = 0; perfects = 0; dodges = 0;
        streak = 0; bestStreak = 0;
        swing = null; nextReady = 0; harass = null; nextHarass = 0; spawnAt = 999;
        res = null;
        phase = 'playing';
        last = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    function quit() { if (typeof onQuit === 'function') onQuit(); }

    function loop(ts) {
        if (!last) last = ts;
        let dt = (ts - last) / 1000;
        last = ts;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.05) dt = 0.05;   // tab-away guard: never fast-forward the round
        step(dt);
        if (phase === 'playing') raf = requestAnimationFrame(loop);
        else raf = null;
    }

    function step(dt) {
        T += dt;

        if (countdown > 0) {
            countdown -= dt;
            if (countdown <= 0) { countdown = 0; spawnAt = T + 0.15; nextHarass = T + D.harass * 0.8; }
            return;
        }

        elapsed += dt;
        timeLeft = Math.max(0, D.time - elapsed);

        // player health / recall
        if (recallUntil > 0) {
            if (T >= recallUntil) { recallUntil = 0; hp = 70; }
        } else {
            hp = Math.min(100, hp + D.regen * dt);
        }
        hpSum += hp; hpSamples++;

        // minion drain -> they walk toward your tower
        for (let i = 0; i < LANES; i++) {
            const m = lanes[i];
            if (!m) continue;
            m.hp -= m.drain * dt;
            if (m.hp <= 0) {
                csLost += m.cs;
                streak = 0;
                fx(i, 'TOWER', 'bad');
                lanes[i] = null;
            }
        }

        // resolve the swing
        if (swing && T >= swing.landAt) resolveSwing();

        // enemy laner harass
        if (!harass && T >= nextHarass && elapsed > 2.2) harass = { lane: pickHarassLane(), at: T + D.tele };
        if (harass && T >= harass.at) {
            if (playerLane === harass.lane && recallUntil === 0) takeDamage();
            else { dodges++; fx(harass.lane, 'DODGE', 'ok'); }
            harass = null;
            nextHarass = T + D.harass * (0.8 + Math.random() * 0.5);
        }

        // spawns
        if (elapsed < D.time - 1.4 && T >= spawnAt) {
            if (spawnMinion()) spawnAt = T + D.spawn * (0.85 + Math.random() * 0.3);
            else spawnAt = T + 0.3;
        }

        // fx pruning
        for (let i = 0; i < LANES; i++) if (fxLane[i] && T > fxLane[i].until) fxLane[i] = null;

        lanes = lanes;
        fxLane = fxLane;

        if (timeLeft <= 0) endRound();
    }

    function spawnMinion() {
        const free = [];
        for (let i = 0; i < LANES; i++) if (!lanes[i]) free.push(i);
        if (!free.length) return false;
        const lane = free[Math.floor(Math.random() * free.length)];
        const t = pickType();
        lanes[lane] = {
            id: nextId++, key: t.key, name: t.name, tint: t.tint, cs: t.cs,
            maxHp: t.maxHp, hp: t.maxHp, drain: t.drain * D.drainMult,
        };
        return true;
    }

    // The enemy laner mostly throws at where you are standing, sometimes at the
    // lane you are obviously about to walk to. Camping one row gets punished.
    function pickHarassLane() {
        const r = Math.random();
        if (r < 0.55) return playerLane;
        if (r < 0.80) {
            let bestLane = -1, bestHp = Infinity;
            for (let i = 0; i < LANES; i++) {
                const m = lanes[i];
                if (m && m.hp < bestHp) { bestHp = m.hp; bestLane = i; }
            }
            if (bestLane >= 0) return bestLane;
        }
        return clampLane(playerLane + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2)));
    }

    function takeDamage() {
        hp -= D.dmg;
        hitAt = T;
        if (swing) { swing = null; whiffs++; streak = 0; }
        if (hp <= 0) {
            hp = 0; deaths++; streak = 0;
            recallUntil = T + 2.2;
            fx(playerLane, 'ZONED', 'bad');
        } else {
            fx(playerLane, 'HARASS', 'bad');
        }
    }

    // --- attacking ---------------------------------------------------------
    function moveTo(lane) {
        if (phase !== 'playing' || countdown > 0) return;
        playerLane = clampLane(lane);
    }

    function move(delta) {
        if (phase !== 'playing' || countdown > 0) return;
        playerLane = clampLane(playerLane + delta);
    }

    function attack(lane) {
        if (phase !== 'playing' || countdown > 0) return;
        lane = clampLane(lane);
        playerLane = lane;                 // you walk to whatever you auto
        if (recallUntil > 0) return;       // dead / recalled
        if (swing || T < nextReady) return; // attack speed
        const m = lanes[lane];
        if (!m) return;                    // empty lane click is just a step
        swing = { lane, id: m.id, landAt: T + WINDUP };
        nextReady = T + WINDUP + D.recovery;
    }

    // Space: auto-target. It picks the lane, never the timing.
    function attackBest() {
        let bestLane = -1, bestScore = Infinity;
        for (let i = 0; i < LANES; i++) {
            const m = lanes[i];
            if (!m) continue;
            const proj = m.hp - m.drain * WINDUP;
            let s;
            if (proj <= 0) continue;
            else if (proj <= AD) s = proj;                       // already killable: most urgent first
            else s = 1000 + (proj - AD) / m.drain;               // otherwise: soonest to enter the band
            if (s < bestScore) { bestScore = s; bestLane = i; }
        }
        if (bestLane >= 0) attack(bestLane);
    }

    function resolveSwing() {
        const s = swing;
        swing = null;
        const m = lanes[s.lane];
        if (!m || m.id !== s.id) {           // target died to the tower mid-swing
            whiffs++; streak = 0;
            fx(s.lane, 'WHIFF', 'bad');
            return;
        }
        if (m.hp <= AD) {
            const perfect = m.hp <= AD * PERFECT_FRAC;
            cs += m.cs; hits++;
            if (perfect) perfects++;
            streak++;
            if (streak > bestStreak) bestStreak = streak;
            fx(s.lane, perfect ? 'PERFECT' : (m.cs > 1 ? 'CANNON +2' : 'LAST HIT'), perfect ? 'perfect' : 'good');
            lanes[s.lane] = null;
        } else {
            m.hp -= AD;                       // pushed: the wave rolls on without you
            pushes++; streak = 0;
            fx(s.lane, 'PUSHED', 'warn');
        }
    }

    // --- scoring -----------------------------------------------------------
    function endRound() {
        phase = 'result';
        swing = null; harass = null;

        const csAvail = cs + csLost;
        const csRate = csAvail > 0 ? cs / csAvail : 0;
        const perfectRate = hits > 0 ? perfects / hits : 0;
        const streakNorm = Math.min(1, bestStreak / D.target);
        const hpNorm = hpSamples > 0 ? Math.max(0, Math.min(1, (hpSum / hpSamples) / 100)) : 1;

        let s = 0.56 * csRate + 0.20 * perfectRate + 0.16 * streakNorm + 0.08 * hpNorm;
        s -= Math.min(0.12, pushes * 0.007);      // shoving the wave is a real cost
        s -= deaths * 0.045;
        s = Math.max(0, Math.min(1, s));

        const swings = hits + pushes + whiffs;
        const acc = swings > 0 ? hits / swings : 0;

        res = {
            score: s, csAvail, csRate, perfectRate, acc, streakNorm,
            hpAvg: Math.round(hpNorm * 100), swings,
        };
    }

    function verdict(s) {
        if (s >= 0.90) return 'Immaculate hands';
        if (s >= 0.78) return 'Clean CS, clean lane';
        if (s >= 0.62) return 'Solid fundamentals';
        if (s >= 0.45) return 'Serviceable, still leaky';
        if (s >= 0.28) return 'Shaky under pressure';
        return 'The wave is playing you';
    }

    function finish() {
        if (!res) return;
        const label = verdict(res.score);
        const detail = cs + '/' + res.csAvail + ' CS, ' + perfects + ' perfect, best streak '
            + bestStreak + ', ' + Math.round(res.acc * 100) + '% auto accuracy';
        const meta = {
            label,
            accuracy: Math.round(res.acc * 1000) / 1000,
            hits,
            misses: pushes + whiffs,
            streak,
            best: bestStreak,
            detail,
            cs,
            csAvailable: res.csAvail,
            perfects,
            pushes,
            whiffs,
            lost: csLost,
            dodges,
            deaths,
            difficulty: level,
            game: 'lasthit',
        };
        if (typeof onComplete === 'function') onComplete(res.score, meta);
    }

    // --- input -------------------------------------------------------------
    function onKey(e) {
        if (phase !== 'playing') return;
        if (e.repeat) return;
        const k = e.key;
        if (k.length === 1 && k >= '1' && k <= String(LANES)) { e.preventDefault(); attack(Number(k) - 1); return; }
        if (k === ' ' || k === 'Spacebar') { e.preventDefault(); attackBest(); return; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); move(-1); return; }
        if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); move(1); return; }
    }

    function laneKey(i) {
        return (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault(); e.stopPropagation(); attack(i);
            }
        };
    }

    function chipKey(i) {
        return (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault(); e.stopPropagation(); moveTo(i);
            }
        };
    }

    function onMotionChange(e) { reduceMotion = !!e.matches; }

    onMount(() => {
        try {
            if (typeof window !== 'undefined' && window.matchMedia) {
                mq = window.matchMedia('(prefers-reduced-motion: reduce)');
                reduceMotion = !!mq.matches;
                if (mq.addEventListener) mq.addEventListener('change', onMotionChange);
                else if (mq.addListener) mq.addListener(onMotionChange);
            }
        } catch (err) { reduceMotion = false; }
        window.addEventListener('keydown', onKey);
        if (startBtn) startBtn.focus();
    });

    onDestroy(() => {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        window.removeEventListener('keydown', onKey);
        if (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMotionChange);
            else if (mq.removeListener) mq.removeListener(onMotionChange);
            mq = null;
        }
    });

    // --- derived render values --------------------------------------------
    $: shaken = !reduceMotion && phase === 'playing' && (T - hitAt) < 0.28;
    $: flagged = phase === 'playing' && (T - hitAt) < 0.6;
    $: cdReady = phase === 'playing' && countdown === 0 && recallUntil === 0 && T >= nextReady && !swing;
    $: cdPct = phase !== 'playing' ? 100
        : (nextReady <= T ? 100 : pct(100 - ((nextReady - T) / (WINDUP + D.recovery)) * 100));
    $: csAvailLive = cs + csLost;

    function hpPct(m) { return pct((m.hp / m.maxHp) * 100); }
    function bandPct(m) { return pct((AD / m.maxHp) * 100); }
    function corePct(m) { return pct((AD * PERFECT_FRAC / m.maxHp) * 100); }
    function ghostPct(m) { return pct(((m.hp - m.drain * WINDUP) / m.maxHp) * 100); }
    function inBand(m) { return m.hp <= AD; }

    // Deliberately coarse: this attribute is re-rendered every frame, so it must
    // not churn on every health tick or screen readers would never stop talking.
    function laneLabel(m, i) {
        if (!m) return 'Lane ' + (i + 1) + ', no minion';
        return 'Attack lane ' + (i + 1) + ', ' + m.name + ' minion';
    }
</script>

<div class="lhg" style="--acc:#ef4444;">

{#if phase === 'intro'}
    <!-- ============================ INTRO ============================ -->
    <div class="card intro">
        <div class="eyebrow">Mechanics Drill <span class="dot"></span> {D.tag}</div>
        <h2 class="title">{drill && drill.name ? drill.name : 'Last Hit Ladder'}</h2>
        <p class="blurb">
            {drill && drill.desc ? drill.desc : 'Raw hands under pressure. Last-hitting is the single most repeated mechanic in the game, and it is decided in fractions of a second. Swing early and you shove the wave into the enemy tower. Swing late and your own tower eats the gold. All of it happens while the enemy laner throws skillshots at the row you are standing in.'}
        </p>

        <div class="howto">
            <div class="how">
                <span class="how-n">1</span>
                <div><b>Read the bar.</b> Every minion walks left along its own health bar. Full bar = far away, empty bar = dead to your tower. The red band next to your tower is the kill window.</div>
            </div>
            <div class="how">
                <span class="how-n">2</span>
                <div><b>Lead the swing.</b> Your damage lands {Math.round(WINDUP * 1000)}ms after you press. Aim ahead of the marker, not at it. Land deep in the band for a <b class="hl">perfect</b> last hit.</div>
            </div>
            <div class="how">
                <span class="how-n">3</span>
                <div><b>Do not stand still.</b> A lane flashes before the enemy laner's skillshot lands. Step off it, or eat it and get zoned out of the wave.</div>
            </div>
            <div class="how">
                <span class="how-n">4</span>
                <div><b>Controls.</b> <kbd>1</kbd>-<kbd>6</kbd> auto the matching lane. <kbd>Space</kbd> autos the closest killable minion. <kbd>W</kbd>/<kbd>S</kbd> or arrows step lanes without swinging. Mouse and touch: tap the lane number to move, tap the bar to swing.</div>
            </div>
        </div>

        <div class="legend">
            {#each TYPES as t}
                <span class="lg"><i style="background:{t.tint}"></i>{t.name}<b>{t.cs === 2 ? '2 CS' : '1 CS'}</b></span>
            {/each}
            <span class="lg lg-note">
                {D.band === 2 ? 'Kill band and perfect core are drawn for you.'
                    : D.band === 1 ? 'Kill band drawn, perfect core hidden.'
                    : 'No band at all. Read the bar.'}
            </span>
        </div>

        <div class="row-btns">
            <button class="btn-back" on:click={quit} aria-label="Back out of this drill without a score">Back</button>
            <button class="btn-go" bind:this={startBtn} on:click={start}
                    aria-label="Start the last hit drill">Start Drill <span class="go-t">{D.time}s</span></button>
        </div>
    </div>

{:else if phase === 'playing'}
    <!-- ============================ PLAYING ============================ -->
    <div class="card play" class:flagged>
        <div class="hud">
            <div class="stat stat-cs">
                <span class="s-val">{cs}</span>
                <span class="s-lbl">CS <em>/ {csAvailLive}</em></span>
            </div>
            <div class="stat">
                <span class="s-val s-sm">{streak}</span>
                <span class="s-lbl">Streak <em>best {bestStreak}</em></span>
            </div>
            <div class="stat">
                <span class="s-val s-sm s-p">{perfects}</span>
                <span class="s-lbl">Perfect</span>
            </div>
            <div class="stat stat-time">
                <span class="s-val s-sm">{Math.ceil(timeLeft)}</span>
                <span class="s-lbl">Seconds</span>
            </div>
        </div>

        <div class="bars">
            <div class="hpbar" role="img" aria-label="Your champion health">
                <div class="hpfill" class:low={hp < 35} style="width:{pct(hp)}%"></div>
                <span class="hptxt">{recallUntil > 0 ? 'RECALLED' : 'HP ' + Math.round(hp)}</span>
            </div>
            <div class="cdbar" role="img" aria-label="Attack cooldown">
                <div class="cdfill" class:ready={cdReady} style="width:{cdPct}%"></div>
                <span class="cdtxt" aria-hidden="true">{SWORD}</span>
            </div>
        </div>

        <div class="board" class:shaken class:calm={reduceMotion}>
            {#each lanes as m, i}
                <div class="lane"
                     class:tele={harass && harass.lane === i}
                     class:mine={playerLane === i}
                     class:swinging={swing && swing.lane === i}>

                    <button class="chip" type="button"
                            aria-label={'Move to lane ' + (i + 1)}
                            on:pointerdown={() => moveTo(i)}
                            on:keydown={chipKey(i)}>
                        <span class="chip-n">{i + 1}</span>
                        {#if playerLane === i}<span class="me" aria-hidden="true"></span>{/if}
                    </button>

                    <button class="track" type="button"
                            aria-label={laneLabel(m, i)}
                            on:pointerdown={() => attack(i)}
                            on:keydown={laneKey(i)}>
                        <span class="tower" aria-hidden="true"></span>

                        {#if m}
                            {#if D.band > 0}
                                <span class="band" style="width:{bandPct(m)}%"></span>
                                {#if D.band > 1}
                                    <span class="core" style="width:{corePct(m)}%"></span>
                                {/if}
                            {/if}

                            <span class="fill" class:hot={inBand(m)}
                                  style="width:{hpPct(m)}%;--tint:{m.tint}"></span>

                            {#if D.ghost}
                                <span class="ghost" style="left:{ghostPct(m)}%"></span>
                            {/if}

                            {#if swing && swing.lane === i && swing.id === m.id}
                                <span class="land" style="left:{ghostPct(m)}%"></span>
                            {/if}

                            <span class="unit" class:killable={inBand(m)} class:cannon={m.cs > 1}
                                  style="left:{hpPct(m)}%;--tint:{m.tint}">
                                <span class="unit-b"></span>
                            </span>
                        {:else}
                            <span class="empty-t">-</span>
                        {/if}

                        {#if harass && harass.lane === i}
                            <span class="tele-mark" aria-hidden="true">!</span>
                        {/if}

                        {#if fxLane[i]}
                            {#key fxLane[i].id}
                                <span class="fx fx-{fxLane[i].kind}" class:calm={reduceMotion}>{fxLane[i].text}</span>
                            {/key}
                        {/if}
                    </button>
                </div>
            {/each}

            {#if countdown > 0}
                <div class="cd-over" aria-live="assertive">
                    <div class="cd-num" class:calm={reduceMotion}>{Math.ceil(countdown / 0.6)}</div>
                    <div class="cd-txt">Wave incoming</div>
                </div>
            {/if}

            {#if recallUntil > 0}
                <div class="cd-over dead" aria-live="assertive">
                    <div class="cd-txt big">Zoned out of lane</div>
                    <div class="cd-txt">Back in {Math.max(0, recallUntil - T).toFixed(1)}s</div>
                </div>
            {/if}
        </div>

        <div class="hint">
            <span><kbd>1</kbd>-<kbd>6</kbd> auto lane</span>
            <span><kbd>Space</kbd> auto closest</span>
            <span><kbd>W</kbd>/<kbd>S</kbd> step</span>
            <span class="hint-warn">{harass ? 'INCOMING - lane ' + (harass.lane + 1) : 'Watch the flashing lane'}</span>
        </div>
    </div>

{:else}
    <!-- ============================ RESULT ============================ -->
    <div class="card result">
        <div class="eyebrow">Session complete <span class="dot"></span> {D.tag}</div>

        <div class="score-wrap">
            <div class="score">{Math.round(res.score * 100)}</div>
            <div class="score-lbl">Drill Score</div>
            <div class="score-bar"><div class="score-fill" style="width:{pct(res.score * 100)}%"></div></div>
        </div>

        <p class="vd" aria-live="polite">{verdict(res.score)}</p>

        <div class="rgrid">
            <div class="rcell">
                <span class="r-v">{cs}<em>/{res.csAvail}</em></span>
                <span class="r-l">CS Taken</span>
            </div>
            <div class="rcell">
                <span class="r-v r-p">{perfects}</span>
                <span class="r-l">Perfect Hits</span>
            </div>
            <div class="rcell">
                <span class="r-v">{bestStreak}</span>
                <span class="r-l">Best Streak</span>
            </div>
            <div class="rcell">
                <span class="r-v">{Math.round(res.acc * 100)}<em>%</em></span>
                <span class="r-l">Auto Accuracy</span>
            </div>
            <div class="rcell">
                <span class="r-v r-b">{pushes}</span>
                <span class="r-l">Waves Pushed</span>
            </div>
            <div class="rcell">
                <span class="r-v r-b">{csLost}</span>
                <span class="r-l">Lost To Tower</span>
            </div>
            <div class="rcell">
                <span class="r-v">{dodges}</span>
                <span class="r-l">Skillshots Dodged</span>
            </div>
            <div class="rcell">
                <span class="r-v" class:r-b={deaths > 0}>{deaths}</span>
                <span class="r-l">Times Zoned</span>
            </div>
        </div>

        <p class="note">
            {Math.round(res.csRate * 100)}% of available CS, {Math.round(res.perfectRate * 100)}% of your last
            hits landed deep in the window, average health {res.hpAvg}%.
        </p>

        <div class="row-btns single">
            <button class="btn-go" on:click={finish} aria-label="Finish the session and bank the result">
                Finish Session
            </button>
        </div>
    </div>
{/if}

</div>

<style>
    .lhg {
        max-width: 760px;
        margin: 0 auto;
        width: 100%;
        color: #c8d6e5;
        font-family: inherit;
    }
    .card {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(239, 68, 68, 0.15);
        border-radius: 20px;
        padding: 22px;
        backdrop-filter: blur(8px);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }
    @media (max-width: 480px) { .card { padding: 15px; border-radius: 16px; } }

    .eyebrow {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px;
        color: #7f1d1d; display: flex; align-items: center; gap: 8px;
    }
    .eyebrow .dot { width: 4px; height: 4px; border-radius: 50%; background: var(--acc); opacity: .7; }

    /* ---------------- INTRO ---------------- */
    .title { font-size: 24px; font-weight: 900; color: #e2e8f0; margin: 6px 0 8px; line-height: 1.15; }
    @media (max-width: 480px) { .title { font-size: 20px; } }
    .blurb { font-size: 13px; line-height: 1.65; color: #7c8ba1; margin-bottom: 18px; }

    .howto { display: grid; gap: 8px; margin-bottom: 16px; }
    .how {
        display: flex; gap: 10px; align-items: flex-start;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.22);
        border-radius: 12px; padding: 10px 12px;
        font-size: 12px; line-height: 1.55; color: #94a3b8;
    }
    .how b { color: #cbd5e1; font-weight: 800; }
    .how b.hl { color: #fca5a5; }
    .how-n {
        flex: 0 0 auto; width: 18px; height: 18px; border-radius: 6px;
        background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.22);
        color: #f87171; font-size: 10px; font-weight: 900;
        display: flex; align-items: center; justify-content: center; margin-top: 1px;
    }

    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .lg {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
        color: #64748b; background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.2); border-radius: 999px; padding: 5px 10px;
    }
    .lg i { width: 7px; height: 7px; border-radius: 2px; display: block; }
    .lg b { color: #94a3b8; font-weight: 900; }
    .lg-note { text-transform: none; letter-spacing: .2px; font-weight: 700; color: #475569; }

    kbd {
        display: inline-block; padding: 1px 5px; border-radius: 5px;
        background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(71, 85, 105, 0.4);
        color: #cbd5e1; font-size: 10px; font-weight: 800; font-family: inherit;
        line-height: 1.5; min-width: 18px; text-align: center;
    }

    .row-btns { display: flex; gap: 10px; align-items: center; }
    .row-btns.single { justify-content: center; }
    .btn-back {
        background: rgba(51, 65, 85, 0.5); color: #94a3b8; font-weight: 800;
        padding: 11px 20px; border-radius: 12px; border: 1px solid rgba(71, 85, 105, 0.4);
        cursor: pointer; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
        font-family: inherit;
    }
    .btn-back:hover { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .btn-go {
        flex: 1; background: linear-gradient(135deg, #b91c1c 0%, #ef4444 100%);
        color: #fff5f5; font-weight: 900; padding: 12px 22px; border-radius: 12px; border: none;
        cursor: pointer; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px;
        box-shadow: 0 6px 18px rgba(239, 68, 68, 0.22); font-family: inherit;
        display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    }
    .row-btns.single .btn-go { flex: 0 1 260px; }
    .btn-go:hover { box-shadow: 0 8px 26px rgba(239, 68, 68, 0.4); transform: translateY(-1px); }
    .go-t { font-size: 10px; opacity: .7; font-weight: 800; letter-spacing: .5px; }
    .btn-back:focus-visible, .btn-go:focus-visible { outline: 2px solid #fca5a5; outline-offset: 2px; }

    /* ---------------- PLAYING ---------------- */
    .play { border-color: rgba(239, 68, 68, 0.22); }
    .play.flagged { border-color: rgba(239, 68, 68, 0.75); }

    .hud { display: flex; gap: 8px; margin-bottom: 10px; }
    .stat {
        flex: 1; min-width: 0; background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.22); border-radius: 12px;
        padding: 8px 6px; text-align: center;
    }
    .stat-cs { border-color: rgba(239, 68, 68, 0.25); background: rgba(69, 10, 10, 0.28); }
    .s-val { display: block; font-size: 26px; font-weight: 900; color: #f87171; line-height: 1; }
    .s-val.s-sm { font-size: 20px; color: #e2e8f0; }
    .s-val.s-p { color: #fbbf24; }
    .s-lbl {
        display: block; font-size: 8px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1px; color: #475569; margin-top: 4px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .s-lbl em { font-style: normal; color: #334155; }
    @media (max-width: 420px) {
        .s-val { font-size: 20px; } .s-val.s-sm { font-size: 16px; } .s-lbl { font-size: 7px; letter-spacing: .6px; }
    }

    .bars { display: flex; gap: 8px; margin-bottom: 10px; }
    .hpbar, .cdbar {
        position: relative; height: 16px; border-radius: 999px; overflow: hidden;
        background: rgba(2, 6, 16, 0.75); border: 1px solid rgba(51, 65, 85, 0.25);
    }
    .hpbar { flex: 1; }
    .cdbar { width: 74px; flex: 0 0 auto; }
    .hpfill { height: 100%; background: linear-gradient(90deg, #15803d, #4ade80); transition: width .12s linear; }
    .hpfill.low { background: linear-gradient(90deg, #991b1b, #f87171); }
    .cdfill { height: 100%; background: rgba(71, 85, 105, 0.55); }
    .cdfill.ready { background: linear-gradient(90deg, #b91c1c, #ef4444); }
    .hptxt, .cdtxt {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 8px; font-weight: 900; letter-spacing: 1.2px; color: #e2e8f0;
        text-shadow: 0 1px 2px rgba(0, 0, 0, .8); text-transform: uppercase;
    }
    .cdtxt { font-size: 10px; letter-spacing: 0; }

    .board {
        position: relative; display: grid; gap: 6px;
        background: rgba(2, 6, 16, 0.5); border: 1px solid rgba(51, 65, 85, 0.2);
        border-radius: 14px; padding: 8px;
    }
    .board.shaken { animation: lhShake .26s ease; }
    @keyframes lhShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        75% { transform: translateX(4px); }
    }
    .board.calm.shaken { animation: none; }

    .lane { display: flex; align-items: stretch; gap: 6px; }

    .chip {
        flex: 0 0 auto; width: 30px; border-radius: 9px; cursor: pointer;
        background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.3);
        color: #475569; font-weight: 900; font-size: 11px; font-family: inherit;
        display: flex; align-items: center; justify-content: center; position: relative;
        padding: 0; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    }
    .chip:hover { border-color: rgba(239, 68, 68, 0.35); color: #94a3b8; }
    .chip:focus-visible { outline: 2px solid #fca5a5; outline-offset: 2px; }
    .lane.mine .chip {
        background: rgba(69, 10, 10, 0.6); border-color: rgba(239, 68, 68, 0.6); color: #fca5a5;
    }
    .chip-n { position: relative; z-index: 2; }
    .me {
        position: absolute; inset: 2px; border-radius: 7px;
        background: radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.45), rgba(239, 68, 68, 0) 70%);
    }

    .track {
        position: relative; flex: 1 1 auto; min-width: 0; height: 34px;
        border-radius: 9px; overflow: hidden; cursor: crosshair; padding: 0;
        background: rgba(8, 12, 22, 0.85); border: 1px solid rgba(51, 65, 85, 0.25);
        font-family: inherit; touch-action: manipulation;
        -webkit-user-select: none; user-select: none;
    }
    .track:focus-visible { outline: 2px solid #fca5a5; outline-offset: 2px; }
    @media (max-width: 420px) { .track { height: 30px; } .chip { width: 26px; } }

    .lane.swinging .track { border-color: rgba(239, 68, 68, 0.55); }
    .lane.tele .track { border-color: rgba(239, 68, 68, 0.8); background: rgba(69, 10, 10, 0.55); }
    .lane.tele.mine .track { background: rgba(127, 15, 15, 0.75); }

    .tower {
        position: absolute; left: 0; top: 0; bottom: 0; width: 6px; z-index: 3;
        background: linear-gradient(180deg, #64748b, #334155);
        box-shadow: 0 0 8px rgba(148, 163, 184, 0.25);
    }
    .band {
        position: absolute; left: 0; top: 0; bottom: 0; z-index: 1;
        background: repeating-linear-gradient(135deg,
            rgba(239, 68, 68, 0.20) 0 6px, rgba(239, 68, 68, 0.09) 6px 12px);
        border-right: 1px dashed rgba(239, 68, 68, 0.55);
    }
    .core {
        position: absolute; left: 0; top: 0; bottom: 0; z-index: 1;
        background: rgba(251, 191, 36, 0.16);
        border-right: 1px solid rgba(251, 191, 36, 0.45);
    }
    .fill {
        position: absolute; left: 0; top: 0; bottom: 0; z-index: 2;
        background: linear-gradient(90deg, rgba(30, 41, 59, 0.35), var(--tint));
        opacity: .35;
    }
    .fill.hot { opacity: .6; }

    .ghost {
        position: absolute; top: 4px; bottom: 4px; width: 0; z-index: 4;
        border-left: 1px dashed rgba(226, 232, 240, 0.45);
    }
    .land {
        position: absolute; top: 0; bottom: 0; width: 2px; z-index: 6;
        background: #fef2f2; box-shadow: 0 0 10px rgba(255, 255, 255, .7);
        transform: translateX(-1px);
    }
    .unit {
        position: absolute; top: 50%; z-index: 5;
        transform: translate(-50%, -50%);
        width: 14px; height: 14px; border-radius: 4px;
        background: var(--tint); opacity: .85;
        box-shadow: 0 0 0 1px rgba(2, 6, 16, .8);
        display: flex; align-items: center; justify-content: center;
    }
    .unit.cannon { width: 18px; height: 18px; border-radius: 5px; }
    .unit.killable {
        opacity: 1;
        box-shadow: 0 0 0 2px rgba(239, 68, 68, .85), 0 0 12px rgba(239, 68, 68, .55);
    }
    .unit-b { width: 4px; height: 4px; border-radius: 1px; background: rgba(2, 6, 16, .55); }

    .empty-t {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: #1e293b; font-size: 11px; font-weight: 900;
    }
    .tele-mark {
        position: absolute; right: 6px; top: 50%; transform: translateY(-50%); z-index: 7;
        color: #fca5a5; font-size: 14px; font-weight: 900; line-height: 1;
        animation: lhBlink .5s steps(2, start) infinite;
    }
    .board.calm .tele-mark { animation: none; }

    @keyframes lhBlink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

    .fx {
        position: absolute; left: 50%; top: 50%; z-index: 8;
        transform: translate(-50%, -50%);
        font-size: 9px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase;
        padding: 2px 7px; border-radius: 999px; white-space: nowrap;
        background: rgba(2, 6, 16, 0.86); pointer-events: none;
        animation: lhFx .85s ease forwards;
    }
    .fx.calm { animation: lhFade .85s ease forwards; }
    @keyframes lhFx {
        0% { opacity: 0; transform: translate(-50%, -10%); }
        18% { opacity: 1; transform: translate(-50%, -60%); }
        100% { opacity: 0; transform: translate(-50%, -130%); }
    }
    @keyframes lhFade { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
    .fx-good { color: #86efac; border: 1px solid rgba(34, 197, 94, .5); }
    .fx-perfect { color: #fde68a; border: 1px solid rgba(251, 191, 36, .6); }
    .fx-warn { color: #fdba74; border: 1px solid rgba(249, 115, 22, .45); }
    .fx-bad { color: #fca5a5; border: 1px solid rgba(239, 68, 68, .5); }
    .fx-ok { color: #93c5fd; border: 1px solid rgba(59, 130, 246, .4); }

    .cd-over {
        position: absolute; inset: 0; z-index: 20; border-radius: 14px;
        background: rgba(2, 6, 16, 0.86);
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    }
    .cd-over.dead { background: rgba(40, 6, 6, 0.86); }
    .cd-num { font-size: 46px; font-weight: 900; color: #f87171; line-height: 1; animation: lhPop .6s ease infinite; }
    .cd-num.calm { animation: none; }
    @keyframes lhPop { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.25); opacity: .5; } }
    .cd-txt {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px; color: #64748b;
    }
    .cd-txt.big { font-size: 14px; color: #fca5a5; letter-spacing: 1.2px; }

    .hint {
        display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 10px;
        font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; color: #475569;
        align-items: center;
    }
    .hint span { display: inline-flex; align-items: center; gap: 4px; }
    .hint-warn { margin-left: auto; color: #f87171; }

    /* ---------------- RESULT ---------------- */
    .score-wrap { text-align: center; margin: 14px 0 6px; }
    .score { font-size: 58px; font-weight: 900; color: #f87171; line-height: 1; }
    .score-lbl {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px;
        color: #475569; margin-top: 4px;
    }
    .score-bar {
        height: 7px; border-radius: 999px; background: rgba(2, 6, 16, 0.7);
        margin: 12px auto 0; max-width: 420px; overflow: hidden;
        border: 1px solid rgba(51, 65, 85, 0.25);
    }
    .score-fill { height: 100%; background: linear-gradient(90deg, #b91c1c, #f87171, #fbbf24); }
    .vd { text-align: center; font-size: 14px; font-weight: 800; color: #cbd5e1; margin: 14px 0 16px; }

    .rgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    @media (max-width: 560px) { .rgrid { grid-template-columns: repeat(2, 1fr); } }
    .rcell {
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.22);
        border-radius: 12px; padding: 10px 8px; text-align: center;
    }
    .r-v { display: block; font-size: 19px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .r-v em { font-style: normal; font-size: 12px; color: #475569; }
    .r-v.r-p { color: #fbbf24; }
    .r-v.r-b { color: #f87171; }
    .r-l {
        display: block; font-size: 8px; font-weight: 900; text-transform: uppercase;
        letter-spacing: .9px; color: #475569; margin-top: 5px;
    }
    .note { font-size: 11px; line-height: 1.6; color: #64748b; text-align: center; margin: 14px 0 16px; }
</style>
