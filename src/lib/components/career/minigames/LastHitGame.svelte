<script>
    // =====================================================================
    //  LAST HIT TIMING - Mechanics (MEC) training drill
    //  Self-contained. No store imports, no career imports, no assets.
    //
    //  One minion at a time. Its health bar drains right to left. A green
    //  KILL WINDOW is painted on the bar, with a brighter core in the middle.
    //  Press when the marker is inside the window.
    //
    //  Deliberately one mechanic and one input. The previous version of this
    //  drill ran six lanes, a hidden attack wind-up, enemy harass and a
    //  recall timer, and nobody could tell why they were missing. Timing is
    //  the skill last-hitting actually trains, so timing is the whole game.
    // =====================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;
    export let drill = null;
    export let onComplete = null;
    export let onQuit = null;

    const SWORD = '\u{2694}';

    // Minion archetypes. The kill window is the same slice of health for all
    // three - what changes is how fast the bar crosses it, so a cannon is
    // visibly generous and a caster is visibly tight.
    const TYPES = [
        { key: 'melee',  name: 'Melee Minion',  cs: 1, speed: 1.00, weight: 0.50, tint: '#94a3b8' },
        { key: 'caster', name: 'Caster Minion', cs: 1, speed: 1.38, weight: 0.34, tint: '#60a5fa' },
        { key: 'cannon', name: 'Cannon Minion', cs: 2, speed: 0.68, weight: 0.16, tint: '#fbbf24' },
    ];

    // lo/hi bound the kill window as a fraction of max health; core is the
    // width of the perfect band centred inside it. Each tier narrows the
    // window and speeds the drain, so the drill scales without adding rules.
    const CFG = {
        1: { name: 'Basic',    minions: 12, drain: 3.00, lo: 0.06, hi: 0.26, core: 0.060, gap: 0.75 },
        2: { name: 'Advanced', minions: 15, drain: 2.30, lo: 0.06, hi: 0.21, core: 0.045, gap: 0.60 },
        3: { name: 'Elite',    minions: 18, drain: 1.85, lo: 0.05, hi: 0.17, core: 0.035, gap: 0.50 },
    };

    $: level = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 1)));
    $: D = CFG[level];

    // Prefer the drill's own copy when Training hands one over, so the intro
    // matches the card the player just clicked.
    $: title = (drill && drill.name) ? String(drill.name) : 'Last Hit Timing';
    $: blurb = (drill && drill.desc)
        ? String(drill.desc)
        : 'The single most repeated action in the game. A minion only gives you gold if your attack lands while its health is low enough to kill it. Swing too early and you shove the wave; swing too late and your tower eats the gold.';
    $: coreLo = Math.max(D.lo, (D.lo + D.hi) / 2 - D.core / 2);
    $: coreHi = Math.min(D.hi, (D.lo + D.hi) / 2 + D.core / 2);

    // ---------------------------------------------------------------- state
    let view = 'intro';         // intro | play | result
    let stage = 'wait';         // wait (between minions) | live
    let cur = null;             // current minion type
    let hp = 1;                 // 1 -> 0 as the bar drains
    let index = 0;              // minions consumed
    let waitLeft = 0;

    let csTaken = 0, csTotal = 0;
    let perfects = 0, early = 0, late = 0, hits = 0;
    let streak = 0, best = 0;
    let elapsed = 0;

    let fb = null;              // { kind, title, note }
    let flash = 0;              // decays after a resolution, drives the glow
    let res = null;

    let raf = null;
    let last = 0;
    let reduce = false;

    // ---------------------------------------------------------------- setup
    onMount(() => {
        if (typeof window !== 'undefined' && window.matchMedia) {
            try {
                reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch (e) { reduce = false; }
            window.addEventListener('keydown', onKey);
        }
    });

    onDestroy(() => {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
    });

    function rollType() {
        const r = Math.random();
        let acc = 0;
        for (const t of TYPES) {
            acc += t.weight;
            if (r <= acc) return t;
        }
        return TYPES[0];
    }

    function start() {
        view = 'play';
        stage = 'wait';
        cur = rollType();
        hp = 1;
        index = 0;
        waitLeft = 1.0;
        csTaken = 0; csTotal = 0;
        perfects = 0; early = 0; late = 0; hits = 0;
        streak = 0; best = 0;
        elapsed = 0;
        fb = { kind: 'ready', title: 'Get ready', note: 'Strike when the marker is in the green.' };
        flash = 0;
        last = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------------- loop
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (view !== 'play') return;

        if (!last) { last = now; return; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        elapsed += dt;
        if (flash > 0) flash = Math.max(0, flash - dt);

        if (stage === 'live') {
            hp -= dt / (D.drain * (cur ? cur.speed : 1));
            if (hp <= 0) {
                hp = 0;
                resolve('late');
            }
        } else {
            waitLeft -= dt;
            if (waitLeft <= 0) nextMinion();
        }
    }

    function nextMinion() {
        if (index >= D.minions) { finish(); return; }
        cur = rollType();
        hp = 1;
        stage = 'live';
    }

    // ---------------------------------------------------------------- input
    function strike() {
        if (view !== 'play' || stage !== 'live') return;
        if (hp > D.hi) resolve('early');
        else if (hp >= coreLo && hp <= coreHi) resolve('perfect');
        else resolve('hit');
    }

    function resolve(kind) {
        if (stage !== 'live') return;
        stage = 'wait';
        index += 1;
        waitLeft = D.gap;
        flash = reduce ? 0 : 0.45;

        const worth = cur ? cur.cs : 1;
        const label = cur ? cur.name.replace(' Minion', '') : 'Minion';
        csTotal += worth;

        if (kind === 'perfect' || kind === 'hit') {
            csTaken += worth;
            hits += 1;
            streak += 1;
            if (streak > best) best = streak;
            if (kind === 'perfect') {
                perfects += 1;
                fb = { kind: 'perfect', title: 'Perfect', note: label + ' secured dead centre. Streak ' + streak + '.' };
            } else {
                fb = { kind: 'hit', title: 'Last hit', note: label + ' secured. Streak ' + streak + '.' };
            }
        } else if (kind === 'early') {
            streak = 0;
            early += 1;
            fb = { kind: 'early', title: 'Too early', note: 'You hit it at full health and shoved the wave.' };
        } else {
            streak = 0;
            late += 1;
            fb = { kind: 'late', title: 'Too late', note: 'Your tower took the ' + label.toLowerCase() + '.' };
        }

        if (index >= D.minions) waitLeft = Math.max(waitLeft, 0.8);
    }

    function onKey(e) {
        if (view === 'play' && (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter')) {
            e.preventDefault();
            strike();
            return;
        }
        if (view === 'intro' && e.key === 'Enter') { e.preventDefault(); start(); }
    }

    // ---------------------------------------------------------------- finish
    function finish() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        stage = 'wait';

        const csRate = csTotal > 0 ? csTaken / csTotal : 0;
        const perfectRate = D.minions > 0 ? perfects / D.minions : 0;
        const streakRate = D.minions > 0 ? Math.min(1, best / D.minions) : 0;

        // CS is the drill's real currency, so it carries most of the score.
        // Perfects and the best streak are what separate a clean session from
        // a lucky one, which is why they are worth a combined 40%.
        const score = Math.max(0, Math.min(1, csRate * 0.60 + perfectRate * 0.25 + streakRate * 0.15));

        let label;
        if (score >= 0.88) label = 'Immaculate';
        else if (score >= 0.72) label = 'Sharp';
        else if (score >= 0.55) label = 'Solid';
        else if (score >= 0.35) label = 'Rusty';
        else label = 'Rough';

        res = {
            score, label,
            csTaken, csTotal, perfects, early, late, hits, best,
            accuracy: D.minions > 0 ? hits / D.minions : 0,
            seconds: Math.round(elapsed),
        };
        view = 'result';
    }

    function done() {
        if (typeof onComplete !== 'function' || !res) return;
        onComplete(res.score, {
            label: res.label,
            accuracy: res.accuracy,
            hits: res.hits,
            misses: res.early + res.late,
            streak: res.best,
            best: res.best,
            detail: res.csTaken + '/' + res.csTotal + ' CS · ' + res.perfects + ' perfect · best streak ' + res.best,
        });
    }

    function back() { if (typeof onQuit === 'function') onQuit(); }

    // ---------------------------------------------------------------- view
    $: pct = (n) => (Math.max(0, Math.min(1, n)) * 100).toFixed(2) + '%';
    $: bandLeft = pct(D.lo);
    $: bandWidth = pct(D.hi - D.lo);
    $: coreLeft = pct(coreLo);
    $: coreWidth = pct(coreHi - coreLo);
    $: markerLeft = pct(hp);
    $: inWindow = stage === 'live' && hp >= D.lo && hp <= D.hi;
    $: remaining = Math.max(0, D.minions - index);
</script>

<div class="lh">

{#if view === 'intro'}
    <!-- ======================= INTRO ======================= -->
    <div class="intro">
        <div class="ico" aria-hidden="true">{SWORD}</div>
        <h2 class="h">{title}</h2>
        <p class="blurb">{blurb}</p>

        <ol class="how">
            <li><b>Watch the bar.</b> The marker is the minion's health, draining from right to left.</li>
            <li><b>Press in the green.</b> That band is the kill window. The bright core is a perfect last hit.</li>
            <li><b>Use <kbd>Space</kbd></b> or click <b>Strike</b>. Cannons drain slowly, casters are quick.</li>
        </ol>

        <div class="cfg">
            <span><i>{D.name}</i> drill</span>
            <span class="dot" aria-hidden="true"></span>
            <span>{D.minions} minions</span>
            <span class="dot" aria-hidden="true"></span>
            <span>window {Math.round((D.hi - D.lo) * 100)}% wide</span>
        </div>

        <div class="row">
            <button class="btn-back" type="button" on:click={back}>Back</button>
            <button class="btn-go" type="button" on:click={start}>Start Drill</button>
        </div>
    </div>

{:else if view === 'play'}
    <!-- ======================= PLAY ======================= -->
    <div class="play">
        <div class="hud">
            <div class="hud-cell">
                <span class="hv">{csTaken}<i>/{csTotal || 0}</i></span>
                <span class="hl">CS</span>
            </div>
            <div class="hud-cell">
                <span class="hv" class:hot={streak >= 3}>{streak}</span>
                <span class="hl">Streak</span>
            </div>
            <div class="hud-cell">
                <span class="hv">{remaining}</span>
                <span class="hl">Left</span>
            </div>
            <div class="hud-cell">
                <span class="hv">{perfects}</span>
                <span class="hl">Perfect</span>
            </div>
        </div>

        <div class="who" style="--tint:{cur ? cur.tint : '#94a3b8'}">
            <span class="who-dot" aria-hidden="true"></span>
            <span class="who-name">{cur ? cur.name : 'Minion'}</span>
            {#if cur && cur.cs > 1}<span class="who-cs">{cur.cs} CS</span>{/if}
        </div>

        <!-- The bar. Everything the player needs is on this one element. -->
        <div class="barwrap" class:live={stage === 'live'}>
            <div
                class="bar"
                class:glow={inWindow}
                class:fx-good={flash > 0 && fb && (fb.kind === 'hit' || fb.kind === 'perfect')}
                class:fx-bad={flash > 0 && fb && (fb.kind === 'early' || fb.kind === 'late')}
            >
                <div class="band" style="left:{bandLeft}; width:{bandWidth}"></div>
                <div class="core" style="left:{coreLeft}; width:{coreWidth}"></div>
                <div class="fill" style="width:{markerLeft}; background:{cur ? cur.tint : '#94a3b8'}"></div>
                {#if stage === 'live'}
                    <div class="marker" style="left:{markerLeft}"></div>
                {/if}
            </div>
            <div class="scale" aria-hidden="true">
                <span class="s-left">dead</span>
                <span class="s-band" style="left:{bandLeft}; width:{bandWidth}">kill window</span>
                <span class="s-right">full health</span>
            </div>
        </div>

        <div class="fbline" class:on={!!fb}>
            {#if fb}
                <span class="fb-t fb-{fb.kind}">{fb.title}</span>
                <span class="fb-n">{fb.note}</span>
            {/if}
        </div>

        <button
            class="strike"
            class:armed={stage === 'live'}
            type="button"
            aria-label="Strike the minion"
            on:pointerdown|preventDefault={strike}
        >
            {SWORD} Strike
            <span class="kbd-hint">Space</span>
        </button>
    </div>

{:else}
    <!-- ======================= RESULT ======================= -->
    <div class="result">
        <div class="score">{Math.round(res.score * 100)}<i>%</i></div>
        <div class="verdict">{res.label}</div>

        <div class="grid">
            <div class="cell"><span class="cv">{res.csTaken}<i>/{res.csTotal}</i></span><span class="cl">CS taken</span></div>
            <div class="cell"><span class="cv">{res.perfects}</span><span class="cl">Perfect</span></div>
            <div class="cell"><span class="cv">{res.best}</span><span class="cl">Best streak</span></div>
            <div class="cell"><span class="cv">{res.early}</span><span class="cl">Too early</span></div>
            <div class="cell"><span class="cv">{res.late}</span><span class="cl">Too late</span></div>
            <div class="cell"><span class="cv">{res.seconds}<i>s</i></span><span class="cl">Duration</span></div>
        </div>

        <p class="coach">
            {#if res.early > res.late && res.early > 1}
                You are swinging ahead of the window. Wait for the marker to actually reach the green &mdash;
                shoving the wave early is how you lose lane without dying once.
            {:else if res.late > res.early && res.late > 1}
                You are hesitating. The bar crosses the window faster than it looks, especially on casters &mdash;
                commit as it enters the green rather than hunting the core.
            {:else if res.perfects >= res.hits * 0.5 && res.hits > 0}
                Clean. You are hitting the core rather than scraping the edges of the window, which is the
                difference between last-hitting and last-hitting under pressure.
            {:else}
                Consistent enough. Chase the bright core rather than the whole green band and the streak
                will start looking after itself.
            {/if}
        </p>

        <button class="btn-go wide" type="button" on:click={done}>Finish Session</button>
    </div>
{/if}

</div>

<style>
    .lh { color: #cbd5e1; }

    /* ---- intro ------------------------------------------------------- */
    .intro { max-width: 520px; margin: 6px auto; text-align: center; }
    .ico { font-size: 34px; margin-bottom: 8px; }
    .h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 21px; font-weight: 800; color: #f1f5f9; margin-bottom: 10px;
    }
    .blurb { font-size: 12.5px; line-height: 1.7; color: #94a3b8; }

    .how {
        list-style: none; text-align: left; margin: 18px 0 0;
        display: flex; flex-direction: column; gap: 9px;
    }
    .how li {
        font-size: 12px; line-height: 1.6; color: #94a3b8;
        padding: 10px 12px 10px 14px; border-radius: 11px;
        background: rgba(12, 16, 28, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-left: 2px solid rgba(239, 68, 68, 0.5);
    }
    .how b { color: #e2e8f0; font-weight: 800; }
    kbd {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 700; color: #e2e8f0;
        padding: 1px 6px; border-radius: 5px;
        background: rgba(51, 65, 85, 0.5);
        border: 1px solid rgba(100, 116, 139, 0.4);
    }

    .cfg {
        display: flex; align-items: center; justify-content: center;
        gap: 9px; margin-top: 16px;
        font-size: 10px; font-weight: 700; letter-spacing: 0.4px; color: #475569;
    }
    .cfg i { font-style: normal; color: #f87171; font-weight: 800; }
    .dot { width: 3px; height: 3px; border-radius: 50%; background: #334155; }

    .row { display: flex; gap: 10px; margin-top: 20px; }
    .btn-back {
        flex: 0 0 auto; padding: 11px 20px; border-radius: 12px;
        background: rgba(51, 65, 85, 0.32); border: 1px solid rgba(71, 85, 105, 0.3);
        color: #94a3b8; font-family: inherit; font-size: 11px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 1px; cursor: pointer;
    }
    .btn-back:hover { background: rgba(71, 85, 105, 0.45); color: #e2e8f0; }
    .btn-go {
        flex: 1; padding: 11px 20px; border-radius: 12px; border: none;
        background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
        color: #fff; font-family: inherit; font-size: 11px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1.1px; cursor: pointer;
        box-shadow: 0 4px 14px rgba(239, 68, 68, 0.26);
    }
    .btn-go:hover { transform: translateY(-1px); box-shadow: 0 7px 20px rgba(239, 68, 68, 0.4); }
    .btn-go.wide { width: 100%; margin-top: 18px; }
    .btn-back:focus-visible, .btn-go:focus-visible, .strike:focus-visible {
        outline: 2px solid #f87171; outline-offset: 2px;
    }

    /* ---- play -------------------------------------------------------- */
    .play { max-width: 620px; margin: 0 auto; }

    .hud { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .hud-cell {
        text-align: center; padding: 8px 4px; border-radius: 11px;
        background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.25);
    }
    .hv {
        display: block; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 18px; font-weight: 800; color: #e2e8f0; line-height: 1.1;
    }
    .hv.hot { color: #fbbf24; }
    .hv i { font-style: normal; font-size: 11px; color: #475569; }
    .hl {
        display: block; margin-top: 3px; font-size: 8px; font-weight: 800;
        letter-spacing: 1.1px; text-transform: uppercase; color: #475569;
    }

    .who {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        margin-bottom: 10px; min-height: 20px;
    }
    .who-dot {
        width: 8px; height: 8px; border-radius: 2px; background: var(--tint);
        box-shadow: 0 0 8px var(--tint);
    }
    .who-name { font-size: 12px; font-weight: 800; color: #cbd5e1; }
    .who-cs {
        font-size: 9px; font-weight: 800; letter-spacing: 0.6px; color: #fbbf24;
        padding: 2px 7px; border-radius: 5px;
        background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .barwrap { margin-bottom: 6px; }
    .bar {
        position: relative; height: 46px; border-radius: 12px; overflow: hidden;
        background: #070b14; border: 1px solid rgba(51, 65, 85, 0.45);
        transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .bar.glow { border-color: rgba(34, 197, 94, 0.65); box-shadow: 0 0 18px rgba(34, 197, 94, 0.22); }
    .bar.fx-good { border-color: rgba(34, 197, 94, 0.9); box-shadow: 0 0 22px rgba(34, 197, 94, 0.4); }
    .bar.fx-bad { border-color: rgba(239, 68, 68, 0.8); box-shadow: 0 0 22px rgba(239, 68, 68, 0.32); }

    /* The window is painted UNDER the health fill so it stays visible as the
       bar drains past it - that is the whole read the player is making. */
    .band {
        position: absolute; top: 0; bottom: 0;
        background: rgba(34, 197, 94, 0.20);
        border-left: 1px solid rgba(34, 197, 94, 0.55);
        border-right: 1px solid rgba(34, 197, 94, 0.55);
    }
    .core {
        position: absolute; top: 0; bottom: 0;
        background: rgba(250, 204, 21, 0.26);
    }
    .fill {
        position: absolute; top: 0; bottom: 0; left: 0;
        opacity: 0.34;
        border-right: 2px solid rgba(226, 232, 240, 0.25);
    }
    .marker {
        position: absolute; top: -2px; bottom: -2px; width: 3px;
        margin-left: -1.5px; border-radius: 2px;
        background: #f8fafc;
        box-shadow: 0 0 10px rgba(248, 250, 252, 0.9);
    }

    .scale { position: relative; height: 13px; margin-top: 5px; }
    .s-left, .s-right, .s-band {
        position: absolute; top: 0;
        font-size: 8px; font-weight: 800; letter-spacing: 0.9px;
        text-transform: uppercase; white-space: nowrap;
    }
    .s-left { left: 0; color: #334155; }
    .s-right { right: 0; color: #334155; }
    .s-band { text-align: center; color: #22c55e; overflow: hidden; }

    .fbline {
        min-height: 34px; margin: 10px 0 14px;
        display: flex; align-items: center; justify-content: center;
        gap: 8px; text-align: center; flex-wrap: wrap;
    }
    .fb-t { font-size: 13px; font-weight: 900; letter-spacing: 0.2px; }
    .fb-perfect { color: #fbbf24; }
    .fb-hit { color: #34d399; }
    .fb-early { color: #f87171; }
    .fb-late { color: #fb923c; }
    .fb-ready { color: #64748b; }
    .fb-n { font-size: 11.5px; color: #64748b; }

    .strike {
        width: 100%; padding: 15px 20px; border-radius: 14px;
        border: 1px solid rgba(71, 85, 105, 0.3);
        background: rgba(51, 65, 85, 0.3);
        color: #64748b; font-family: inherit;
        font-size: 14px; font-weight: 900; letter-spacing: 1.2px;
        text-transform: uppercase; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        touch-action: manipulation; user-select: none; -webkit-user-select: none;
        transition: background 110ms ease, color 110ms ease, border-color 110ms ease;
    }
    .strike.armed {
        background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
        border-color: #ef4444; color: #fff;
        box-shadow: 0 5px 18px rgba(239, 68, 68, 0.3);
    }
    .strike.armed:active { transform: scale(0.985); }
    .kbd-hint {
        font-size: 9px; font-weight: 800; letter-spacing: 1px;
        padding: 3px 8px; border-radius: 6px;
        background: rgba(0, 0, 0, 0.22); color: rgba(255, 255, 255, 0.7);
    }
    .strike:not(.armed) .kbd-hint { background: rgba(148, 163, 184, 0.12); color: #475569; }

    /* ---- result ------------------------------------------------------ */
    .result { max-width: 460px; margin: 6px auto; text-align: center; }
    .score {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 54px; font-weight: 900; color: #f87171;
        line-height: 1; letter-spacing: -2px;
    }
    .score i { font-style: normal; font-size: 22px; color: #64748b; margin-left: 2px; }
    .verdict {
        margin-top: 6px; font-size: 11px; font-weight: 900;
        letter-spacing: 2px; text-transform: uppercase; color: #94a3b8;
    }
    .grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 20px;
    }
    .cell {
        padding: 11px 6px; border-radius: 11px;
        background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.25);
    }
    .cv {
        display: block; font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 17px; font-weight: 800; color: #e2e8f0; line-height: 1.1;
    }
    .cv i { font-style: normal; font-size: 11px; color: #475569; }
    .cl {
        display: block; margin-top: 4px; font-size: 8px; font-weight: 800;
        letter-spacing: 1px; text-transform: uppercase; color: #475569;
    }
    .coach {
        margin-top: 18px; font-size: 12px; line-height: 1.7;
        color: #94a3b8; text-align: left;
        padding: 12px 14px; border-radius: 12px;
        background: rgba(12, 16, 28, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.25);
        border-left: 2px solid rgba(239, 68, 68, 0.45);
    }

    @media (max-width: 480px) {
        .grid { grid-template-columns: repeat(2, 1fr); }
        .bar { height: 40px; }
        .score { font-size: 44px; }
    }
</style>
