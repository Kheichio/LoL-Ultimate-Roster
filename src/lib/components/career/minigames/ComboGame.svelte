<script>
    // =====================================================================
    //  COMBO EXECUTION - Mechanics (MEC) training drill
    //  Self-contained. No store imports, no career imports, no assets.
    //
    //  Targets light up around the field, each inside an approach ring that
    //  shrinks onto it. Hit the target at the instant the ring meets its edge.
    //  Early is a miss, late is a miss, and the only thing being measured is
    //  how close to the beat your hand lands.
    //
    //  This replaces a last-hit timing bar. The bar trained exactly one axis
    //  and could be played by watching a single pixel; MEC is "raw hands -
    //  combo execution, dodging skillshots", which is aim AND rhythm under a
    //  clock. So the drill is aim and rhythm: the target moves around the
    //  field, and the window is measured in milliseconds.
    //
    //  READABILITY IS NOT DIFFICULTY. The lesson from the composure drill
    //  applies here and is why the ring is a ring rather than a countdown
    //  number, why the ring lands exactly on the circle edge rather than
    //  somewhere near it, and why the next target is faintly visible before it
    //  arms. A player must always be able to see WHY they missed. The way to
    //  make this drill harder is to tighten `wPerfect`, never to hide anything.
    //
    //  Every constant in CFG / VALUE / SCORE_W is parsed by tools/comboSim.mjs.
    //  Run it after touching any of them.
    // =====================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;
    export let drill = null;
    export let onComplete = null;
    export let onQuit = null;

    const ICON = '\u{1F5B1}';

    // ---------------------------------------------------------------- tuning
    //  targets   how many circles in a session
    //  approach  seconds the ring takes to shrink onto the circle
    //  beat      seconds between one target arming and the next
    //  radius    circle radius as a % of the field's short side
    //  wPerfect / wGreat / wGood   half-widths of the timing windows, SECONDS
    //  spread    how far the next target may jump, in field widths
    //
    //  beat is deliberately SHORTER than approach at every tier, so rings
    //  overlap and the player is reading two at once by Elite. That is the
    //  density knob.
    //
    //  THE TIMING WINDOWS ARE THE SAME AT ALL THREE TIERS, and that is on
    //  purpose. Every drill in the mode is normalised so a competent session
    //  scores ~0.50 (scoreFactor()'s 1.0x reference) whichever tier it was
    //  played on -- the tier's reward is baseGain, not a better score. What a
    //  higher tier changes is TEXTURE: more targets, a faster ring, a shorter
    //  gap between them and a wider jump across the field. Tightening the
    //  windows on top of that would make Elite pay less than Basic for the same
    //  hands, which is the opposite of what its price implies.
    //
    //  The first cut of this table had windows of 55/105/170ms at Basic. It put
    //  a competent session at 0.76, i.e. a 1.63x training multiplier for
    //  turning up -- MEC would have been by far the cheapest attribute in the
    //  mode to max. comboSim caught it; nothing else would have.
    const CFG = {
        1: { name: 'Basic',    targets: 20, approach: 1.20, beat: 0.95, radius: 15.0, wPerfect: 0.030, wGreat: 0.058, wGood: 0.096, spread: 0.55 },
        2: { name: 'Advanced', targets: 26, approach: 0.95, beat: 0.72, radius: 13.0, wPerfect: 0.030, wGreat: 0.058, wGood: 0.096, spread: 0.72 },
        3: { name: 'Elite',    targets: 32, approach: 0.76, beat: 0.55, radius: 11.0, wPerfect: 0.030, wGreat: 0.058, wGood: 0.096, spread: 0.88 },
    };

    // What each judgement is worth toward accuracy. A `great` is deliberately
    // barely over half a `perfect`: the drill is a precision drill, and if
    // "roughly on time" paid most of the score there would be nothing to train.
    const VALUE = { perfect: 1.00, great: 0.52, good: 0.16, miss: 0 };

    // Accuracy is most of it; the best unbroken combo is the rest. Combo is
    // what separates a clean session from one that averaged out.
    const SCORE_W = { accuracy: 0.76, combo: 0.24 };

    $: level = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 1)));
    $: D = CFG[level];

    $: title = (drill && drill.name) ? String(drill.name) : 'Combo Execution';
    $: blurb = (drill && drill.desc)
        ? String(drill.desc)
        : 'Hands. The ring closes on the target and you hit it the moment they meet - not when you see it, when it arrives. Every combo you have ever landed is this, repeated until it stopped needing your attention.';

    // ---------------------------------------------------------------- state
    let view = 'intro';         // intro | play | result
    let live = [];              // targets currently on screen
    let spawned = 0;            // how many have armed
    let judged = 0;             // how many have resolved
    let clock = 0;              // seconds since the run began
    let nextAt = 0;             // when the next target arms

    let counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    let valueSum = 0;
    let errSum = 0, errN = 0;   // for the average-offset readout
    let combo = 0, bestCombo = 0;
    let lastEarly = 0, lastLate = 0;

    let fb = null;              // { kind, title, note }
    let flash = 0;
    let res = null;

    let raf = null;
    let last = 0;
    let reduce = false;
    let seq = 0;

    // A deterministic-ish walk so the field is varied but never teleports the
    // hand across the whole board. Kept as plain state, not a seeded RNG: this
    // drill is played, not simulated, and comboSim models the timing only.
    let px = 0.5, py = 0.5;

    onMount(() => {
        if (typeof window === 'undefined') return;
        try {
            reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) { reduce = false; }
        window.addEventListener('keydown', onKey);
    });

    onDestroy(() => {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
    });

    function nextPos() {
        // Walk by up to `spread`, then reflect off the edges so the target
        // never sits half outside the field.
        const r = D.radius / 100;
        const pad = r + 0.04;
        const ang = Math.random() * Math.PI * 2;
        const dist = (0.35 + Math.random() * 0.65) * D.spread;
        let nx = px + Math.cos(ang) * dist;
        let ny = py + Math.sin(ang) * dist * 0.62;   // field is wider than tall
        if (nx < pad) nx = pad + (pad - nx);
        if (nx > 1 - pad) nx = (1 - pad) - (nx - (1 - pad));
        if (ny < pad) ny = pad + (pad - ny);
        if (ny > 1 - pad) ny = (1 - pad) - (ny - (1 - pad));
        px = Math.min(1 - pad, Math.max(pad, nx));
        py = Math.min(1 - pad, Math.max(pad, ny));
        return { x: px, y: py };
    }

    function start() {
        view = 'play';
        live = [];
        spawned = 0; judged = 0;
        clock = 0;
        nextAt = 0.9;             // a breath before the first ring arms
        counts = { perfect: 0, great: 0, good: 0, miss: 0 };
        valueSum = 0; errSum = 0; errN = 0;
        combo = 0; bestCombo = 0;
        lastEarly = 0; lastLate = 0;
        fb = { kind: 'ready', title: 'Get ready', note: 'Hit each target as the ring lands on it.' };
        flash = 0;
        seq = 0;
        px = 0.5; py = 0.5;
        last = 0;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (view !== 'play') return;
        if (!last) { last = now; return; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        clock += dt;
        if (flash > 0) flash = Math.max(0, flash - dt);

        // arm the next target
        if (spawned < D.targets && clock >= nextAt) {
            const p = nextPos();
            seq += 1;
            live = [...live, {
                key: seq,
                n: seq,
                x: p.x, y: p.y,
                hitAt: clock + D.approach,
                born: clock,
                dead: false,
            }];
            spawned += 1;
            nextAt = clock + D.beat;
        }

        // anything past the last window is a miss
        let expired = null;
        for (const t of live) {
            if (!t.dead && clock > t.hitAt + D.wGood) { expired = t; break; }
        }
        if (expired) resolve(expired, null);

        if (judged >= D.targets) finish();
    }

    /** offset === null means it timed out. */
    function resolve(t, offset) {
        if (t.dead) return;
        t.dead = true;
        live = live.filter(x => x !== t);
        judged += 1;

        let kind;
        if (offset === null) kind = 'miss';
        else {
            const a = Math.abs(offset);
            if (a <= D.wPerfect) kind = 'perfect';
            else if (a <= D.wGreat) kind = 'great';
            else if (a <= D.wGood) kind = 'good';
            else kind = 'miss';
        }

        counts[kind] += 1;
        valueSum += VALUE[kind];
        if (offset !== null) { errSum += offset; errN += 1; }

        if (kind === 'miss') {
            combo = 0;
            if (offset !== null && offset < 0) lastEarly += 1; else lastLate += 1;
        } else {
            combo += 1;
            if (combo > bestCombo) bestCombo = combo;
        }

        flash = reduce ? 0 : 0.35;
        const ms = offset === null ? null : Math.round(offset * 1000);
        if (kind === 'perfect') {
            fb = { kind, title: 'Perfect', note: `Dead on the beat. Combo ${combo}.` };
        } else if (kind === 'great') {
            fb = { kind, title: 'Great', note: `${ms > 0 ? '+' : ''}${ms}ms. Combo ${combo}.` };
        } else if (kind === 'good') {
            fb = { kind, title: 'Good', note: `${ms > 0 ? '+' : ''}${ms}ms - ${ms > 0 ? 'behind' : 'ahead of'} the ring.` };
        } else if (offset === null) {
            fb = { kind, title: 'Missed', note: 'The ring closed and nothing landed.' };
        } else {
            fb = { kind, title: 'Off beat', note: `${ms > 0 ? '+' : ''}${ms}ms - ${ms > 0 ? 'too late' : 'too early'}.` };
        }
    }

    /** The target the player is most likely to mean: the one closest to its
     *  own hit moment. Used by the keyboard path, which has no cursor. */
    function urgent() {
        let bestT = null, bestD = Infinity;
        for (const t of live) {
            if (t.dead) continue;
            const d = Math.abs(clock - t.hitAt);
            if (d < bestD) { bestD = d; bestT = t; }
        }
        return bestT;
    }

    function hitTarget(t) {
        if (view !== 'play' || !t || t.dead) return;
        resolve(t, clock - t.hitAt);
    }

    function hitUrgent() {
        if (view !== 'play') return;
        const t = urgent();
        if (t) hitTarget(t);
    }

    function onKey(e) {
        if (view === 'play' && (e.key === ' ' || e.key === 'Spacebar' || e.key === 'z' || e.key === 'x')) {
            e.preventDefault();
            hitUrgent();
            return;
        }
        if (view === 'intro' && e.key === 'Enter') { e.preventDefault(); start(); }
    }

    function finish() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        live = [];

        const n = Math.max(1, D.targets);
        const accuracy = Math.max(0, Math.min(1, valueSum / n));
        const comboRate = Math.max(0, Math.min(1, bestCombo / n));
        const score = Math.max(0, Math.min(1,
            accuracy * SCORE_W.accuracy + comboRate * SCORE_W.combo));

        let label;
        if (score >= 0.86) label = 'Immaculate';
        else if (score >= 0.70) label = 'Sharp';
        else if (score >= 0.52) label = 'Solid';
        else if (score >= 0.33) label = 'Rusty';
        else label = 'Rough';

        res = {
            score, label, accuracy, comboRate,
            perfect: counts.perfect, great: counts.great, good: counts.good, miss: counts.miss,
            bestCombo,
            hits: counts.perfect + counts.great + counts.good,
            meanErr: errN ? errSum / errN : 0,
            early: lastEarly, late: lastLate,
            seconds: Math.round(clock),
        };
        view = 'result';
    }

    function done() {
        if (typeof onComplete !== 'function' || !res) return;
        onComplete(res.score, {
            label: res.label,
            accuracy: res.accuracy,
            hits: res.hits,
            misses: res.miss,
            streak: res.bestCombo,
            best: res.bestCombo,
            detail: `${res.perfect} perfect · ${res.great} great · ${res.miss} missed · combo ${res.bestCombo}`,
        });
    }

    function back() { if (typeof onQuit === 'function') onQuit(); }

    // ---------------------------------------------------------------- view
    // The ring radius as a multiple of the circle radius: starts at RING_START
    // and reaches exactly 1 at the hit moment, which is the entire read.
    const RING_START = 3.1;
    function ringScale(t) {
        const left = (t.hitAt - clock) / D.approach;
        return 1 + Math.max(0, Math.min(1, left)) * (RING_START - 1);
    }
    // Fades in over the first fifth of the approach so a target never simply
    // appears under the cursor.
    function ringFade(t) {
        const age = (clock - t.born) / D.approach;
        return Math.max(0, Math.min(1, age / 0.2));
    }
    $: remaining = Math.max(0, D.targets - judged);
    $: msWindow = Math.round(D.wPerfect * 1000);
    $: accSoFar = judged > 0 ? valueSum / judged : 0;
</script>

<div class="cg">

{#if view === 'intro'}
    <!-- ======================= INTRO ======================= -->
    <div class="intro">
        <div class="ico" aria-hidden="true">{ICON}</div>
        <h2 class="h">{title}</h2>
        <p class="blurb">{blurb}</p>

        <ol class="how">
            <li><b>Watch the ring.</b> It shrinks onto the target. Hit it the moment the ring touches the circle &mdash; not before, not after.</li>
            <li><b>Click the target</b>, or press <kbd>Space</kbd> / <kbd>Z</kbd> / <kbd>X</kbd> to strike whichever target is closest to its beat.</li>
            <li><b>Keep the combo.</b> A miss resets it, and the best unbroken run is a quarter of your score.</li>
        </ol>

        <div class="cfg">
            <span><i>{D.name}</i> drill</span>
            <span class="dot" aria-hidden="true"></span>
            <span>{D.targets} targets</span>
            <span class="dot" aria-hidden="true"></span>
            <span>perfect window &plusmn;{msWindow}ms</span>
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
                <span class="hv" class:hot={combo >= 5}>{combo}</span>
                <span class="hl">Combo</span>
            </div>
            <div class="hud-cell">
                <span class="hv">{counts.perfect}</span>
                <span class="hl">Perfect</span>
            </div>
            <div class="hud-cell">
                <span class="hv">{Math.round(accSoFar * 100)}<i>%</i></span>
                <span class="hl">Accuracy</span>
            </div>
            <div class="hud-cell">
                <span class="hv">{remaining}</span>
                <span class="hl">Left</span>
            </div>
        </div>

        <!-- The field. Clicking empty space does nothing: aim is half the
             drill, so a spray of clicks must not be able to farm the beat. -->
        <div class="field" class:fx-good={flash > 0 && fb && (fb.kind === 'perfect' || fb.kind === 'great')}
             class:fx-bad={flash > 0 && fb && fb.kind === 'miss'}>
            {#each live as t (t.key)}
                <button
                    class="target"
                    type="button"
                    aria-label="Target {t.n}"
                    style="left:{t.x * 100}%; top:{t.y * 100}%; --r:{D.radius}; opacity:{ringFade(t)}"
                    on:pointerdown|preventDefault|stopPropagation={() => hitTarget(t)}
                >
                    <span class="ring" style="transform:translate(-50%,-50%) scale({ringScale(t)})" aria-hidden="true"></span>
                    <span class="disc" aria-hidden="true"></span>
                    <span class="num">{t.n}</span>
                </button>
            {/each}

            {#if !live.length}
                <span class="waiting" aria-hidden="true">
                    {judged >= D.targets ? '' : 'ready'}
                </span>
            {/if}
        </div>

        <div class="fbline" class:on={!!fb}>
            {#if fb}
                <span class="fb-t fb-{fb.kind}">{fb.title}</span>
                <span class="fb-n">{fb.note}</span>
            {/if}
        </div>

        <button class="tapbar" type="button" aria-label="Strike the nearest target"
                on:pointerdown|preventDefault={hitUrgent}>
            Strike nearest
            <span class="kbd-hint">Space</span>
        </button>
    </div>

{:else}
    <!-- ======================= RESULT ======================= -->
    <div class="result">
        <div class="score">{Math.round(res.score * 100)}<i>%</i></div>
        <div class="verdict">{res.label}</div>

        <div class="grid">
            <div class="cell"><span class="cv">{res.perfect}</span><span class="cl">Perfect</span></div>
            <div class="cell"><span class="cv">{res.great}</span><span class="cl">Great</span></div>
            <div class="cell"><span class="cv">{res.good}</span><span class="cl">Good</span></div>
            <div class="cell"><span class="cv">{res.miss}</span><span class="cl">Missed</span></div>
            <div class="cell"><span class="cv">{res.bestCombo}</span><span class="cl">Best combo</span></div>
            <div class="cell"><span class="cv">{res.meanErr >= 0 ? '+' : ''}{Math.round(res.meanErr * 1000)}<i>ms</i></span><span class="cl">Mean offset</span></div>
        </div>

        <p class="coach">
            {#if res.meanErr < -0.030}
                You are ahead of the beat by {Math.abs(Math.round(res.meanErr * 1000))}ms on average. You are hitting when
                you <i>see</i> the ring rather than when it lands &mdash; let it actually touch the circle.
            {:else if res.meanErr > 0.030}
                You are behind by {Math.round(res.meanErr * 1000)}ms on average. You are confirming the ring has arrived before
                committing; the hand has to move on the approach, not on the arrival.
            {:else if res.perfect >= res.hits * 0.55 && res.hits > 0}
                Clean. Your offsets are centred and most of them are inside the perfect window, which is the
                difference between hitting a combo and hitting it while somebody is trying to kill you.
            {:else if res.miss > D.targets * 0.25}
                Too many falling off entirely. Track the next ring before you finish the current target &mdash; at this
                tier there is always a second one already on the way.
            {:else}
                Centred but loose. Your timing is not biased early or late, so this is a precision problem rather
                than a reading problem: chase the perfect window rather than just landing the hit.
            {/if}
        </p>

        <button class="btn-go wide" type="button" on:click={done}>Finish Session</button>
    </div>
{/if}

</div>

<style>
    .cg { color: #cbd5e1; }

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
        gap: 9px; margin-top: 16px; flex-wrap: wrap;
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
    .btn-back:focus-visible, .btn-go:focus-visible, .tapbar:focus-visible, .target:focus-visible {
        outline: 2px solid #f87171; outline-offset: 2px;
    }

    /* ---- play -------------------------------------------------------- */
    .play { max-width: 640px; margin: 0 auto; }

    .hud { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
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

    .field {
        position: relative; width: 100%; aspect-ratio: 16 / 10;
        border-radius: 14px; overflow: hidden;
        background:
            radial-gradient(ellipse at 50% 45%, rgba(30, 41, 59, 0.55), rgba(7, 11, 20, 0.95) 72%),
            #070b14;
        border: 1px solid rgba(51, 65, 85, 0.45);
        touch-action: manipulation;
        transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .field.fx-good { border-color: rgba(34, 197, 94, 0.7); box-shadow: 0 0 20px rgba(34, 197, 94, 0.2); }
    .field.fx-bad { border-color: rgba(239, 68, 68, 0.7); box-shadow: 0 0 20px rgba(239, 68, 68, 0.22); }

    /* A target is a button so it is reachable, focusable and tappable. */
    .target {
        position: absolute; transform: translate(-50%, -50%);
        width: calc(var(--r) * 2%); aspect-ratio: 1;
        padding: 0; margin: 0; background: none; border: none;
        cursor: pointer; touch-action: manipulation;
        display: grid; place-items: center;
    }
    .disc {
        position: absolute; inset: 0; border-radius: 50%;
        background: radial-gradient(circle at 38% 34%, rgba(248, 113, 113, 0.42), rgba(153, 27, 27, 0.5));
        border: 2px solid rgba(248, 113, 113, 0.85);
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.3);
    }
    /* The ring lands EXACTLY on the disc edge at the hit moment. Anything else
       and the player is timing against a target they cannot see. */
    .ring {
        position: absolute; left: 50%; top: 50%;
        width: 100%; height: 100%; border-radius: 50%;
        border: 2px solid rgba(226, 232, 240, 0.82);
        box-shadow: 0 0 10px rgba(226, 232, 240, 0.18);
        pointer-events: none;
    }
    .num {
        position: relative; z-index: 1;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 13px; font-weight: 800; color: #fee2e2;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
        pointer-events: none;
    }
    .waiting {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        font-size: 9px; font-weight: 800; letter-spacing: 2px;
        text-transform: uppercase; color: #1e293b;
    }

    .fbline {
        min-height: 32px; margin: 10px 0 12px;
        display: flex; align-items: center; justify-content: center;
        gap: 8px; text-align: center; flex-wrap: wrap;
    }
    .fb-t { font-size: 13px; font-weight: 900; letter-spacing: 0.2px; }
    .fb-perfect { color: #fbbf24; }
    .fb-great { color: #34d399; }
    .fb-good { color: #60a5fa; }
    .fb-miss { color: #f87171; }
    .fb-ready { color: #64748b; }
    .fb-n { font-size: 11.5px; color: #64748b; }

    .tapbar {
        width: 100%; padding: 13px 20px; border-radius: 14px;
        border: 1px solid rgba(71, 85, 105, 0.3);
        background: rgba(51, 65, 85, 0.3);
        color: #94a3b8; font-family: inherit;
        font-size: 12px; font-weight: 900; letter-spacing: 1.2px;
        text-transform: uppercase; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 10px;
        touch-action: manipulation; user-select: none; -webkit-user-select: none;
    }
    .tapbar:active { transform: scale(0.99); }
    .kbd-hint {
        font-size: 9px; font-weight: 800; letter-spacing: 1px;
        padding: 3px 8px; border-radius: 6px;
        background: rgba(148, 163, 184, 0.12); color: #475569;
    }

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
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 20px; }
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
    .coach i { color: #cbd5e1; font-style: italic; }

    @media (max-width: 480px) {
        .grid { grid-template-columns: repeat(2, 1fr); }
        .score { font-size: 44px; }
        .field { aspect-ratio: 4 / 3; }
        .num { font-size: 11px; }
    }
</style>
