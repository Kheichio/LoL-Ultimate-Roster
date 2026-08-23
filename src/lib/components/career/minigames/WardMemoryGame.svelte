<script>
    // ===================================================================
    //  MINIMAP RECALL  -  Map Awareness (attr 'map') training drill
    // ===================================================================
    //  Enemy blips flash on a stylised Rift minimap for a fraction of a
    //  second, then vanish. The player answers a question about what was
    //  on screen: where somebody was, how many were visible, who was
    //  missing, or which objective the enemy was stacking around.
    //
    //  Self-contained on purpose: no stores, no career imports, no assets.
    // ===================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;      // 1 Basic / 2 Advanced / 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    // -- difficulty table ------------------------------------------------
    //  ready  = "watch the map" beat before the flash
    //  flash  = how long the blips stay up
    //  ans    = answer window (a miss on the clock scores zero)
    //  bull   = bullseye radius in map units, fall = linear falloff after it
    const CFG = {
        1: { qs: 9,  ready: 480, flash: 900, ans: 3200, bull: 6.0, fall: 18, emin: 2, emax: 3, amin: 0, amax: 0, tag: 'Basic Drill' },
        2: { qs: 10, ready: 430, flash: 620, ans: 2800, bull: 5.0, fall: 16, emin: 3, emax: 4, amin: 0, amax: 1, tag: 'Advanced' },
        3: { qs: 11, ready: 380, flash: 380, ans: 2450, bull: 4.5, fall: 14, emin: 4, emax: 5, amin: 1, amax: 2, tag: 'Elite' },
    };

    $: dNum = Math.max(1, Math.min(3, Math.round(Number(difficulty) || 1)));
    $: preview = CFG[dNum];

    let C = CFG[1];   // snapshotted when the round starts

    // -- map data (viewBox is 0 0 100 100 == "map units") ----------------
    //  Blue base bottom-left, red base top-right. Mid runs on x+y=100,
    //  the river runs on y=x, and the four jungle quadrants are the
    //  triangles those two lines cut out of the square.
    const OBJECTIVES = [
        { id: 'top_scuttle', name: 'Top scuttle', tag: 'S', x: 25, y: 25, r: 3.4 },
        { id: 'baron',       name: 'Baron pit',   tag: 'B', x: 38, y: 38, r: 4.6 },
        { id: 'dragon',      name: 'Dragon pit',  tag: 'D', x: 62, y: 62, r: 4.6 },
        { id: 'bot_scuttle', name: 'Bot scuttle', tag: 'S', x: 75, y: 75, r: 3.4 },
    ];

    const SPOTS = [
        { x: 13, y: 70, n: 'top lane, blue tower' },
        { x: 13, y: 46, n: 'top lane, mid wave' },
        { x: 14, y: 26, n: 'top lane, river mouth' },
        { x: 32, y: 13, n: 'top lane, red side' },
        { x: 58, y: 13, n: 'top lane, red tower' },
        { x: 27, y: 47, n: 'blue topside jungle' },
        { x: 24, y: 64, n: 'blue wolves' },
        { x: 40, y: 74, n: 'blue raptors' },
        { x: 55, y: 25, n: 'red topside jungle' },
        { x: 72, y: 30, n: 'red wolves' },
        { x: 76, y: 46, n: 'red botside jungle' },
        { x: 60, y: 55, n: 'red gromp' },
        { x: 44, y: 46, n: 'blue krugs' },
        { x: 34, y: 66, n: 'mid lane, blue half' },
        { x: 66, y: 34, n: 'mid lane, red half' },
        { x: 30, y: 88, n: 'bot lane, blue tower' },
        { x: 54, y: 88, n: 'bot lane, mid wave' },
        { x: 87, y: 54, n: 'bot lane, river mouth' },
        { x: 87, y: 28, n: 'bot lane, red tower' },
        { x: 20, y: 84, n: 'blue base entrance' },
        { x: 84, y: 20, n: 'red base entrance' },
    ];

    const TOWERS = [
        { x: 13, y: 66 }, { x: 13, y: 40 }, { x: 26, y: 13 }, { x: 50, y: 13 },
        { x: 34, y: 87 }, { x: 60, y: 87 }, { x: 87, y: 60 }, { x: 87, y: 36 },
        { x: 31, y: 69 }, { x: 42, y: 58 }, { x: 58, y: 42 }, { x: 69, y: 31 },
    ];

    const ROLE_ORDER = ['TOP', 'JNG', 'MID', 'ADC', 'SUP'];
    const ROSTER = {
        TOP: [['Aatrox', 'ATR'], ['Camille', 'CAM'], ['Ornn', 'ORN'], ['Gnar', 'GNA'], ['Jax', 'JAX'], ['Renekton', 'REN']],
        JNG: [['Lee Sin', 'LEE'], ['Viego', 'VIE'], ['Elise', 'ELI'], ['Sejuani', 'SEJ'], ['Vi', 'VI'], ['Nidalee', 'NID']],
        MID: [['Ahri', 'AHR'], ['Azir', 'AZR'], ['Orianna', 'ORI'], ['Syndra', 'SYN'], ['Zed', 'ZED'], ['Viktor', 'VIK']],
        ADC: [['Jinx', 'JNX'], ['Ezreal', 'EZR'], ['Caitlyn', 'CAI'], ['Xayah', 'XAY'], ['Varus', 'VAR'], ['Ashe', 'ASH']],
        SUP: [['Thresh', 'THR'], ['Leona', 'LEO'], ['Lulu', 'LUL'], ['Rakan', 'RAK'], ['Braum', 'BRA'], ['Nami', 'NAM']],
    };

    const KIND_NAME = {
        spot: 'Last Seen',
        count: 'Head Count',
        absent: 'Missing Man',
        objective: 'Objective Read',
    };

    // -- tiny helpers ----------------------------------------------------
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const clamp01 = (v) => clamp(v, 0, 1);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const dist = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function jit() { return (Math.random() - 0.5) * 4.5; }
    function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

    // Quadrant of a point: the river (y = x) and mid (x + y = 100) split the
    // Rift into four. Clicking into the wrong one is a zero.
    function quadOf(x, y) {
        const a = y - x;
        const b = x + y - 100;
        if (a >= 0 && b < 0) return 'BLUE_TOP';
        if (a >= 0 && b >= 0) return 'BLUE_BOT';
        if (a < 0 && b < 0) return 'RED_TOP';
        return 'RED_BOT';
    }
    // Distance from a point to the nearest quadrant boundary - targets that sit
    // in a lane or on the river are exempt from the wrong-quadrant rule.
    function edgeSlack(x, y) {
        return Math.min(Math.abs(y - x), Math.abs(x + y - 100)) / Math.SQRT2;
    }
    function nearestObj(x, y) {
        let best = OBJECTIVES[0], bd = Infinity;
        for (const o of OBJECTIVES) {
            const d = dist({ x, y }, o);
            if (d < bd) { bd = d; best = o; }
        }
        return best;
    }

    // -- runtime state ---------------------------------------------------
    let phase = 'intro';        // intro | play | result
    let step = 'ready';         // ready | flash | ask | feedback
    let deck = [];
    let qIndex = 0;
    let q = null;
    let results = [];
    let reveal = null;
    let crosshair = { x: 50, y: 50 };
    let dragging = false;
    let timeLeft = 0;
    let timeTotal = 1;
    let streak = 0;
    let bestStreak = 0;
    let liveMsg = '';
    let finished = false;
    let mapEl = null;
    let reduceMotion = false;

    $: pips = Array.from({ length: C ? C.qs : 0 }, (_, i) => results[i] || null);
    $: runningAcc = results.length ? results.reduce((s, r) => s + r.acc, 0) / results.length : 0;
    $: timeFrac = timeTotal > 0 ? clamp01(timeLeft / timeTotal) : 0;

    // -- timers (every single one is torn down in onDestroy) -------------
    let timers = [];
    let rafId = 0;
    let deadline = 0;

    function later(fn, ms) {
        const id = setTimeout(() => {
            timers = timers.filter((t) => t !== id);
            fn();
        }, ms);
        timers.push(id);
        return id;
    }
    function clearTimers() {
        for (const t of timers) clearTimeout(t);
        timers = [];
    }
    function stopCountdown() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }
    function tickCountdown() {
        rafId = requestAnimationFrame(() => {
            const left = deadline - (typeof performance !== 'undefined' ? performance.now() : Date.now());
            timeLeft = Math.max(0, left);
            if (left <= 0) { rafId = 0; submit(null); }
            else tickCountdown();
        });
    }
    function startCountdown(ms) {
        stopCountdown();
        timeTotal = ms;
        timeLeft = ms;
        deadline = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + ms;
        tickCountdown();
    }

    // -- question generation ---------------------------------------------
    function buildDeck(n) {
        const base = ['spot', 'count', 'absent', 'objective'];
        const out = ['spot'];
        while (out.length < n) {
            const cycle = shuffle(base.slice());
            for (const k of cycle) if (out.length < n) out.push(k);
        }
        return out.slice(0, n);
    }

    function makeTeam() {
        return ROLE_ORDER.map((r) => {
            const c = pick(ROSTER[r]);
            return { name: c[0], ab: c[1], role: r };
        });
    }

    function pickSpots(n, minSep, avoid) {
        const out = [];
        const pool = shuffle(SPOTS.slice());
        for (const s of pool) {
            if (out.length >= n) break;
            const p = { x: clamp(s.x + jit(), 6, 94), y: clamp(s.y + jit(), 6, 94), n: s.n };
            if (avoid && avoid.some((a) => dist(a, p) < minSep)) continue;
            if (out.some((o) => dist(o, p) < minSep)) continue;
            out.push(p);
        }
        let guard = 0;
        while (out.length < n && guard++ < 40) {
            const s = pick(SPOTS);
            const p = { x: clamp(s.x + jit(), 6, 94), y: clamp(s.y + jit(), 6, 94), n: s.n };
            if (out.some((o) => dist(o, p) < 9)) continue;
            out.push(p);
        }
        return out;
    }

    function clusterSpots(n, obj) {
        const out = [];
        let guard = 0;
        while (out.length < n && guard++ < 60) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 5 + Math.random() * 7;
            const p = {
                x: clamp(obj.x + Math.cos(ang) * rad, 6, 94),
                y: clamp(obj.y + Math.sin(ang) * rad, 6, 94),
                n: obj.name,
            };
            if (out.some((o) => dist(o, p) < 8.5)) continue;
            out.push(p);
        }
        return out;
    }

    function makeQuestion(kind) {
        const team = makeTeam();
        let shownCount = randInt(C.emin, C.emax);
        // 'absent' needs at least three decoys shown and at least one champion held back
        if (kind === 'absent') shownCount = Math.min(4, Math.max(3, shownCount));
        if (kind === 'count') shownCount = randInt(Math.max(1, C.emin - 1), C.emax);
        if (kind === 'objective') shownCount = Math.max(3, shownCount);

        let order = shuffle(team.slice());
        if (kind === 'spot' && Math.random() < 0.62) {
            // the jungler is the read that actually matters - bias toward it
            const ji = order.findIndex((c) => c.role === 'JNG');
            if (ji >= shownCount) {
                const t = order[0]; order[0] = order[ji]; order[ji] = t;
            }
        }
        let positions;
        let obj = null;
        if (kind === 'objective') {
            obj = pick(OBJECTIVES);
            const near = clusterSpots(Math.min(shownCount, randInt(2, 3)), obj);
            const far = pickSpots(shownCount - near.length, 13, near).filter((p) => dist(p, obj) > 26);
            positions = near.concat(far);
        } else {
            positions = pickSpots(shownCount, 13, null);
        }
        // Placement is constrained, so the truth is however many blips actually fit.
        if (!positions.length) positions = [{ x: 50, y: 50, n: 'mid lane' }];
        const usable = Math.min(shownCount, positions.length);
        const shown = order.slice(0, usable);
        const hidden = order.slice(usable);

        const enemies = shown.map((c, i) => ({
            name: c.name, ab: c.ab, role: c.role,
            x: positions[i].x,
            y: positions[i].y,
            n: positions[i].n,
        }));

        const allyN = randInt(C.amin, C.amax);
        const allySpots = allyN > 0 ? pickSpots(allyN, 12, enemies) : [];
        const allies = allySpots.map((p) => {
            const role = pick(ROLE_ORDER);
            const c = pick(ROSTER[role]);
            return { ab: c[1], name: c[0], x: p.x, y: p.y };
        });

        const out = { kind, enemies, allies, obj, mode: 'click', target: null, choices: [], correct: -1, prompt: '', hint: '' };

        if (kind === 'spot') {
            const jng = enemies.find((c) => c.role === 'JNG');
            const t = jng && Math.random() < 0.55 ? jng : pick(enemies);
            out.target = { x: t.x, y: t.y };
            out.targetName = t.n;
            out.prompt = 'Where was ' + t.name + ' (' + t.role + ') last seen?';
            out.hint = 'Click the map, or move the crosshair with the arrow keys and press Enter.';
        } else if (kind === 'objective') {
            out.target = { x: obj.x, y: obj.y };
            out.targetName = obj.name;
            out.prompt = 'Which objective were they stacking around?';
            out.hint = 'Click the pit they collapsed on. Arrow keys + Enter also work.';
        } else if (kind === 'count') {
            out.mode = 'choice';
            out.choices = [1, 2, 3, 4, 5].map((v) => ({ label: String(v), sub: v === 1 ? 'enemy' : 'enemies', value: v }));
            out.correct = enemies.length - 1;
            out.prompt = 'How many ENEMIES were visible?';
            out.hint = 'Red circles are enemies. Blue squares are your own team - do not count them.';
        } else {
            out.mode = 'choice';
            const miss = hidden.length ? pick(hidden) : pick(team);
            const decoys = shuffle(enemies.slice()).slice(0, 3);
            const opts = shuffle(decoys.map((c) => ({ label: c.name, sub: c.role, ab: c.ab, value: c.name }))
                .concat([{ label: miss.name, sub: miss.role, ab: miss.ab, value: miss.name }]));
            out.choices = opts;
            out.correct = opts.findIndex((o) => o.value === miss.name);
            out.missName = miss.name;
            out.prompt = 'Which enemy was NOT on the map?';
            out.hint = 'Press 1-4 or click the champion you never saw.';
        }
        return out;
    }

    // -- flow ------------------------------------------------------------
    function startRound() {
        C = CFG[dNum];
        results = [];
        qIndex = 0;
        streak = 0;
        bestStreak = 0;
        finished = false;
        reveal = null;
        deck = buildDeck(C.qs);
        phase = 'play';
        nextQuestion();
    }

    function nextQuestion() {
        clearTimers();
        stopCountdown();
        reveal = null;
        dragging = false;
        crosshair = { x: 50, y: 50 };
        q = makeQuestion(deck[qIndex]);
        step = 'ready';
        timeLeft = 0;
        liveMsg = 'Question ' + (qIndex + 1) + ' of ' + C.qs + '. Watch the map.';
        later(() => {
            step = 'flash';
            later(() => {
                step = 'ask';
                liveMsg = q.prompt;
                startCountdown(C.ans);
            }, C.flash);
        }, C.ready);
    }

    function scoreClick(gx, gy, tx, ty) {
        const d = Math.sqrt((gx - tx) * (gx - tx) + (gy - ty) * (gy - ty));
        let acc = d <= C.bull ? 1 : clamp01(1 - (d - C.bull) / C.fall);
        if (acc > 0 && d > C.bull && edgeSlack(tx, ty) >= 8 && quadOf(gx, gy) !== quadOf(tx, ty)) acc = 0;
        return { acc, d };
    }

    function submit(payload) {
        if (phase !== 'play' || step !== 'ask' || !q) return;
        stopCountdown();
        dragging = false;

        let acc = 0;
        let err = null;
        let note = '';
        let guess = null;

        if (q.mode === 'click') {
            if (payload) {
                guess = { x: payload.x, y: payload.y };
                if (q.kind === 'objective') {
                    const near = nearestObj(guess.x, guess.y);
                    const d = dist(guess, q.target);
                    err = d;
                    if (near.id !== q.obj.id) {
                        acc = 0;
                        note = 'That was the ' + near.name + '. They were on the ' + q.obj.name + '.';
                    } else {
                        acc = Math.max(0.55, clamp01(1 - Math.max(0, d - C.bull) / 26));
                        note = 'Correct pit - the ' + q.obj.name + '.';
                    }
                } else {
                    const r = scoreClick(guess.x, guess.y, q.target.x, q.target.y);
                    acc = r.acc; err = r.d;
                    note = r.d.toFixed(1) + ' units off - actual spot: ' + q.targetName + '.';
                }
            } else {
                note = 'No call made. Correct spot: ' + q.targetName + '.';
            }
        } else if (q.kind === 'count') {
            const truth = q.enemies.length;
            if (payload === null) {
                note = 'No call made. There were ' + truth + '.';
            } else {
                const said = q.choices[payload].value;
                const off = Math.abs(said - truth);
                acc = off === 0 ? 1 : off === 1 ? 0.25 : 0;
                note = off === 0 ? 'Exactly ' + truth + '.' : 'You said ' + said + '. There were ' + truth + '.';
            }
        } else {
            if (payload === null) {
                note = 'No call made. ' + q.missName + ' was the one missing.';
            } else {
                acc = payload === q.correct ? 1 : 0;
                note = acc === 1 ? q.missName + ' was indeed missing.' : 'It was ' + q.missName + '.';
            }
        }

        if (acc >= 0.6) { streak += 1; if (streak > bestStreak) bestStreak = streak; }
        else streak = 0;

        results = [...results, { kind: q.kind, acc, err }];
        reveal = {
            target: q.mode === 'click' ? q.target : null,
            guess,
            acc,
            note,
        };
        liveMsg = Math.round(acc * 100) + ' percent. ' + note;
        step = 'feedback';

        const hold = q.mode === 'click' ? 980 : 800;
        later(() => {
            qIndex += 1;
            if (qIndex >= C.qs) finishRound();
            else nextQuestion();
        }, hold);
    }

    function finishRound() {
        clearTimers();
        stopCountdown();
        step = 'feedback';
        phase = 'result';
        liveMsg = 'Drill complete. ' + Math.round(score01 * 100) + ' out of 100.';
    }

    // -- scoring ---------------------------------------------------------
    $: score01 = results.length ? clamp01(results.reduce((s, r) => s + r.acc, 0) / results.length) : 0;
    $: hits = results.filter((r) => r.acc >= 0.6).length;
    $: misses = results.length - hits;
    $: clickRuns = results.filter((r) => r.err !== null && r.err !== undefined);
    $: meanErr = clickRuns.length ? clickRuns.reduce((s, r) => s + r.err, 0) / clickRuns.length : 0;
    $: byKind = ['spot', 'objective', 'count', 'absent'].map((k) => {
        const rs = results.filter((r) => r.kind === k);
        return { k, name: KIND_NAME[k], n: rs.length, acc: rs.length ? rs.reduce((s, r) => s + r.acc, 0) / rs.length : 0 };
    }).filter((x) => x.n > 0);

    function verdictFor(s) {
        if (s >= 0.9) return 'Total map control - you play with the minimap in your head.';
        if (s >= 0.78) return 'Sharp vision. Very little gets past you.';
        if (s >= 0.62) return 'Solid tracking with a couple of blind spots.';
        if (s >= 0.45) return 'You see the map, but only when you remember to look.';
        if (s >= 0.28) return 'Tunnel vision. The jungler is living rent free in your fog.';
        return 'Face-checking blind. Start glancing at the minimap every wave.';
    }
    function labelFor(s) {
        if (s >= 0.9) return 'Map Control';
        if (s >= 0.78) return 'Sharp Vision';
        if (s >= 0.62) return 'Solid Tracking';
        if (s >= 0.45) return 'Blind Spots';
        if (s >= 0.28) return 'Tunnel Vision';
        return 'Face-Checking';
    }

    function finishSession() {
        if (finished) return;
        finished = true;
        const meta = {
            label: labelFor(score01),
            accuracy: results.length ? hits / results.length : 0,
            accuracyPct: results.length ? Math.round((hits / results.length) * 100) : 0,
            hits,
            misses,
            streak,
            best: bestStreak,
            meanError: Math.round(meanErr * 10) / 10,
            questions: results.length,
            difficulty: dNum,
            detail: hits + '/' + results.length + ' reads landed, ' + (Math.round(meanErr * 10) / 10) +
                ' map units mean error, best chain ' + bestStreak,
        };
        if (typeof onComplete === 'function') onComplete(score01, meta);
    }

    function quit() {
        if (typeof onQuit === 'function') onQuit();
    }

    // -- input -----------------------------------------------------------
    function mapFrom(e) {
        if (!mapEl) return { x: 50, y: 50 };
        const r = mapEl.getBoundingClientRect();
        if (!r.width || !r.height) return { x: 50, y: 50 };
        return {
            x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100),
            y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100),
        };
    }
    // Kept as a reactive value, not a function: a function call in the markup
    // would never be re-evaluated by the compiler.
    $: canClick = phase === 'play' && step === 'ask' && !!q && q.mode === 'click';

    function onPointerDown(e) {
        if (!canClick) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        crosshair = mapFrom(e);
        try { if (mapEl && mapEl.setPointerCapture) mapEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
        try { if (mapEl && mapEl.focus) mapEl.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    }
    function onPointerMove(e) {
        if (!dragging || !canClick) return;
        crosshair = mapFrom(e);
    }
    function onPointerUp(e) {
        if (!dragging) return;
        dragging = false;
        try { if (mapEl && mapEl.releasePointerCapture) mapEl.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (canClick) submit({ x: crosshair.x, y: crosshair.y });
    }
    function onPointerCancel() { dragging = false; }

    function onKey(e) {
        if (phase !== 'play' || step !== 'ask' || !q) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (q.mode === 'click') {
            const s = e.shiftKey ? 1 : 3.5;
            if (k === 'ArrowLeft')  { crosshair = { x: clamp(crosshair.x - s, 0, 100), y: crosshair.y }; e.preventDefault(); return; }
            if (k === 'ArrowRight') { crosshair = { x: clamp(crosshair.x + s, 0, 100), y: crosshair.y }; e.preventDefault(); return; }
            if (k === 'ArrowUp')    { crosshair = { x: crosshair.x, y: clamp(crosshair.y - s, 0, 100) }; e.preventDefault(); return; }
            if (k === 'ArrowDown')  { crosshair = { x: crosshair.x, y: clamp(crosshair.y + s, 0, 100) }; e.preventDefault(); return; }
            if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); submit({ x: crosshair.x, y: crosshair.y }); return; }
        } else if (k >= '1' && k <= '9') {
            const i = Number(k) - 1;
            if (i < q.choices.length) { e.preventDefault(); submit(i); }
        }
    }

    // -- lifecycle -------------------------------------------------------
    let mq = null;
    function onMQ(e) { reduceMotion = !!e.matches; }

    onMount(() => {
        window.addEventListener('keydown', onKey);
        if (typeof window.matchMedia === 'function') {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            reduceMotion = !!mq.matches;
            if (mq.addEventListener) mq.addEventListener('change', onMQ);
            else if (mq.addListener) mq.addListener(onMQ);
        }
    });

    onDestroy(() => {
        clearTimers();
        stopCountdown();
        window.removeEventListener('keydown', onKey);
        if (mq) {
            if (mq.removeEventListener) mq.removeEventListener('change', onMQ);
            else if (mq.removeListener) mq.removeListener(onMQ);
            mq = null;
        }
    });

    $: mapAria = phase !== 'play'
        ? 'Stylised Summoner\'s Rift minimap'
        : step === 'flash'
            ? 'Enemy positions flashing on the minimap'
            : step === 'ask' && q && q.mode === 'click'
                ? 'Minimap. Crosshair at ' + Math.round(crosshair.x) + ', ' + Math.round(crosshair.y) +
                  '. Arrow keys to move, Enter to lock in.'
                : 'Minimap';
</script>

<section class="mr" class:rm={reduceMotion}>
    <!-- === INTRO === -->
    {#if phase === 'intro'}
        <div class="card intro">
            <div class="eyebrow">Map Awareness &middot; {preview.tag}</div>
            <h2 class="title">{drill && drill.name ? drill.name : 'Minimap Recall'}</h2>
            <p class="blurb">
                {drill && drill.desc
                    ? drill.desc
                    : 'The whole game is played on a map you are only allowed to look at for a quarter of a second at a time. This drill trains exactly that: glance, absorb five pieces of information, and act on them a second later. Enemy blips light up the Rift for a moment and vanish - then you have to say where somebody was, how many were showing, who was missing, or which pit they were collapsing on.'}
            </p>

            <div class="how">
                <div class="how-h">How to play</div>
                <ul class="how-l">
                    <li><span class="kbd">Watch</span> the map. Red circles are enemies, blue squares are your own team.</li>
                    <li><span class="kbd">Click</span> the map to answer position questions - or arrow keys to move the crosshair, <span class="kbd">Enter</span> to lock in.</li>
                    <li><span class="kbd">1</span>-<span class="kbd">5</span> answers multiple choice. Every question is on a clock.</li>
                    <li>Bullseyes score full marks, near misses score partial, the wrong quadrant scores nothing.</li>
                </ul>
            </div>

            <div class="specs">
                <div class="spec"><span class="sv">{preview.qs}</span><span class="sl">Questions</span></div>
                <div class="spec"><span class="sv">{preview.flash}<i>ms</i></span><span class="sl">Flash</span></div>
                <div class="spec"><span class="sv">{preview.emin}-{preview.emax}</span><span class="sl">Blips</span></div>
                <div class="spec"><span class="sv">{(preview.ans / 1000).toFixed(1)}<i>s</i></span><span class="sl">To answer</span></div>
            </div>

            <div class="intro-btns">
                <button class="btn-back" type="button" on:click={quit} aria-label="Back out of this drill without scoring">Back</button>
                <button class="btn-go" type="button" on:click={startRound} aria-label="Start the Minimap Recall drill">Start Drill</button>
            </div>
        </div>

    <!-- === RESULT === -->
    {:else if phase === 'result'}
        <div class="card result">
            <div class="eyebrow">Session Report &middot; {C.tag}</div>
            <div class="score-wrap">
                <div class="score">{Math.round(score01 * 100)}</div>
                <div class="score-lbl">{labelFor(score01)}</div>
            </div>
            <div class="bar-outer" aria-hidden="true"><div class="bar-inner" style="width:{Math.round(score01 * 100)}%"></div></div>

            <div class="rgrid">
                <div class="rstat"><span class="rv">{hits}/{results.length}</span><span class="rl">Reads landed</span></div>
                <div class="rstat"><span class="rv">{meanErr.toFixed(1)}</span><span class="rl">Mean error (units)</span></div>
                <div class="rstat"><span class="rv">{bestStreak}</span><span class="rl">Best chain</span></div>
                <div class="rstat"><span class="rv">{misses}</span><span class="rl">Misreads</span></div>
            </div>

            <div class="breakdown">
                {#each byKind as b (b.k)}
                    <div class="bd-row">
                        <span class="bd-n">{b.name}</span>
                        <span class="bd-bar"><span class="bd-fill" style="width:{Math.round(b.acc * 100)}%"></span></span>
                        <span class="bd-v">{Math.round(b.acc * 100)}%</span>
                    </div>
                {/each}
            </div>

            <p class="verdict">{verdictFor(score01)}</p>
            <button class="btn-go wide" type="button" on:click={finishSession} disabled={finished} aria-label="Finish the session and bank the result">
                Finish Session
            </button>
        </div>

    <!-- === PLAYING === -->
    {:else}
        <div class="card play">
            <div class="hud">
                <div class="hud-l">
                    <!-- the question type stays hidden until the blips are gone:
                         the drill is to absorb the whole picture, not one detail -->
                    <span class="eyebrow tight">
                        {step === 'ready' || step === 'flash' ? 'Recall' : KIND_NAME[q ? q.kind : 'spot']}
                    </span>
                    <span class="qn">Q{qIndex + 1}<i>/{C.qs}</i></span>
                </div>
                <div class="pips" aria-hidden="true">
                    {#each pips as p, i}
                        <span class="pip"
                              class:cur={i === qIndex}
                              class:good={p && p.acc >= 0.8}
                              class:mid={p && p.acc >= 0.4 && p.acc < 0.8}
                              class:bad={p && p.acc < 0.4}></span>
                    {/each}
                </div>
                <div class="hud-r"><span class="run">{Math.round(runningAcc * 100)}<i>%</i></span></div>
            </div>

            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
            <div
                class="map-wrap"
                class:live={canClick}
                bind:this={mapEl}
                role="application"
                tabindex="0"
                aria-label={mapAria}
                on:pointerdown={onPointerDown}
                on:pointermove={onPointerMove}
                on:pointerup={onPointerUp}
                on:pointercancel={onPointerCancel}
            >
                <svg class="mm" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                    <rect class="mm-bg" x="0" y="0" width="100" height="100" rx="5" />

                    <!-- jungle quadrants -->
                    <polygon class="jg jg-b" points="18,18 50,50 18,82" />
                    <polygon class="jg jg-r" points="18,18 50,50 82,18" />
                    <polygon class="jg jg-r" points="82,18 50,50 82,82" />
                    <polygon class="jg jg-b" points="18,82 50,50 82,82" />
                    <polyline class="jg-edge" points="18,18 50,50 82,82" />
                    <polyline class="jg-edge" points="18,82 50,50 82,18" />

                    <!-- river -->
                    <line class="river" x1="17" y1="17" x2="83" y2="83" />

                    <!-- lanes -->
                    <path class="lane" d="M13,80 L13,20 Q13,13 20,13 L80,13" />
                    <path class="lane" d="M20,87 L80,87 Q87,87 87,80 L87,20" />
                    <line class="lane" x1="20" y1="80" x2="80" y2="20" />
                    <path class="lane-i" d="M13,80 L13,20 Q13,13 20,13 L80,13" />
                    <path class="lane-i" d="M20,87 L80,87 Q87,87 87,80 L87,20" />
                    <line class="lane-i" x1="20" y1="80" x2="80" y2="20" />

                    <!-- towers -->
                    {#each TOWERS as t}
                        <rect class="twr" x={t.x - 1.3} y={t.y - 1.3} width="2.6" height="2.6" rx="0.6" />
                    {/each}

                    <!-- bases -->
                    <circle class="base base-b" cx="10" cy="90" r="10.5" />
                    <circle class="base base-r" cx="90" cy="10" r="10.5" />
                    <circle class="nex nex-b" cx="11" cy="89" r="2.6" />
                    <circle class="nex nex-r" cx="89" cy="11" r="2.6" />

                    <!-- objectives -->
                    {#each OBJECTIVES as o (o.id)}
                        <circle class="pit" class:pit-b={o.id === 'baron'} class:pit-d={o.id === 'dragon'} cx={o.x} cy={o.y} r={o.r} />
                        <text class="pit-t" x={o.x} y={o.y} text-anchor="middle" dominant-baseline="central">{o.tag}</text>
                    {/each}

                    <!-- blips -->
                    {#if q && (step === 'flash' || step === 'feedback')}
                        {#each q.allies as a, i (a.ab + '-' + i)}
                            <g class="blip ally" class:dim={step === 'feedback'}>
                                <rect x={a.x - 4.4} y={a.y - 4.4} width="8.8" height="8.8" rx="2.2" />
                                <text x={a.x} y={a.y} text-anchor="middle" dominant-baseline="central">{a.ab}</text>
                            </g>
                        {/each}
                        {#each q.enemies as e, i (e.ab + '-' + i)}
                            <g class="blip foe" class:dim={step === 'feedback'}>
                                <circle cx={e.x} cy={e.y} r="5" />
                                <text x={e.x} y={e.y} text-anchor="middle" dominant-baseline="central">{e.ab}</text>
                            </g>
                        {/each}
                    {/if}

                    <!-- crosshair -->
                    {#if canClick}
                        <g class="xh">
                            <line x1={crosshair.x - 9} y1={crosshair.y} x2={crosshair.x - 2.6} y2={crosshair.y} />
                            <line x1={crosshair.x + 2.6} y1={crosshair.y} x2={crosshair.x + 9} y2={crosshair.y} />
                            <line x1={crosshair.x} y1={crosshair.y - 9} x2={crosshair.x} y2={crosshair.y - 2.6} />
                            <line x1={crosshair.x} y1={crosshair.y + 2.6} x2={crosshair.x} y2={crosshair.y + 9} />
                            <circle class="xh-o" cx={crosshair.x} cy={crosshair.y} r="2.4" />
                        </g>
                    {/if}

                    <!-- reveal -->
                    {#if reveal && reveal.target}
                        {#if reveal.guess}
                            <line class="mk-line" x1={reveal.guess.x} y1={reveal.guess.y} x2={reveal.target.x} y2={reveal.target.y} />
                            <circle class="mk-guess" cx={reveal.guess.x} cy={reveal.guess.y} r="2.3" />
                        {/if}
                        <circle class="mk-ring" cx={reveal.target.x} cy={reveal.target.y} r="7.5" />
                        <circle class="mk-dot" cx={reveal.target.x} cy={reveal.target.y} r="1.7" />
                    {/if}
                </svg>

                {#if step === 'ready'}
                    <div class="veil"><span class="veil-t">Watch the map</span></div>
                {/if}
            </div>

            <!-- prompt + answers -->
            <div class="ask">
                {#if step === 'ready' || step === 'flash'}
                    <div class="prompt muted">Eyes on the Rift...</div>
                    <div class="hint">&nbsp;</div>
                {:else if step === 'ask'}
                    <div class="prompt">{q.prompt}</div>
                    {#if q.mode === 'choice'}
                        <div class="opts" class:opts-num={q.kind === 'count'}>
                            {#each q.choices as c, i (c.label + i)}
                                <button class="opt" type="button" on:click={() => submit(i)}
                                        aria-label={'Answer ' + (i + 1) + ': ' + c.label}>
                                    <span class="opt-k">{i + 1}</span>
                                    {#if c.ab}<span class="opt-ab">{c.ab}</span>{/if}
                                    <span class="opt-l">{c.label}</span>
                                    <span class="opt-s">{c.sub}</span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <div class="lockrow">
                            <button class="opt lock" type="button" on:click={() => submit({ x: crosshair.x, y: crosshair.y })}
                                    aria-label="Lock in the crosshair position">Lock In</button>
                            <span class="coord">{Math.round(crosshair.x)} , {Math.round(crosshair.y)}</span>
                        </div>
                    {/if}
                    <div class="hint">{q.hint}</div>
                {:else}
                    <div class="prompt res"
                         class:ok={reveal && reveal.acc >= 0.8}
                         class:half={reveal && reveal.acc >= 0.4 && reveal.acc < 0.8}
                         class:no={reveal && reveal.acc < 0.4}>
                        {reveal ? Math.round(reveal.acc * 100) + '%' : ''}
                        <span class="res-n">{reveal ? reveal.note : ''}</span>
                    </div>
                    <div class="hint">&nbsp;</div>
                {/if}
            </div>

            <div class="clock" aria-hidden="true">
                <div class="clock-fill"
                     class:warn={timeFrac < 0.35 && timeFrac >= 0.15}
                     class:crit={timeFrac < 0.15}
                     style="width:{step === 'ask' ? Math.round(timeFrac * 100) : 0}%"></div>
            </div>
        </div>
    {/if}

    <div class="sr-only" aria-live="polite" aria-atomic="true">{liveMsg}</div>
</section>

<style>
    /* -- shell ------------------------------------------------------- */
    .mr {
        width: 100%;
        max-width: 560px;
        margin: 0 auto;
        color: #c8d6e5;
    }
    .card {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(16, 185, 129, 0.16);
        border-radius: 20px;
        padding: 18px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }
    @media (max-width: 380px) { .card { padding: 13px; border-radius: 16px; } }

    .eyebrow {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #34d399; opacity: 0.85;
    }
    .eyebrow.tight { letter-spacing: 1.1px; }
    .title { font-size: 22px; font-weight: 900; color: #e2e8f0; margin: 6px 0 8px; letter-spacing: -0.2px; }
    .blurb { font-size: 12.5px; line-height: 1.65; color: #94a3b8; }

    .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* -- intro ------------------------------------------------------- */
    .how {
        margin-top: 14px; padding: 13px 14px;
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 14px;
    }
    .how-h {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #475569; margin-bottom: 8px;
    }
    .how-l { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .how-l li { font-size: 11.5px; line-height: 1.55; color: #94a3b8; padding-left: 12px; position: relative; }
    .how-l li::before { content: ''; position: absolute; left: 0; top: 7px; width: 4px; height: 4px; border-radius: 2px; background: #10b981; opacity: 0.7; }
    .kbd {
        display: inline-block; padding: 1px 5px; border-radius: 5px;
        background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.22);
        color: #6ee7b7; font-size: 10px; font-weight: 800;
    }

    .specs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 12px; }
    .spec {
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.22);
        border-radius: 12px; padding: 9px 4px; text-align: center;
    }
    .sv { display: block; font-size: 15px; font-weight: 900; color: #6ee7b7; line-height: 1.1; }
    .sv i { font-style: normal; font-size: 9px; color: #34d399; opacity: 0.7; }
    .sl { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #475569; margin-top: 3px; }

    .intro-btns { display: flex; gap: 10px; margin-top: 16px; }
    .btn-back {
        flex: 0 0 auto; padding: 11px 20px; border-radius: 12px;
        background: rgba(51, 65, 85, 0.45); border: 1px solid rgba(71, 85, 105, 0.4);
        color: #94a3b8; font-size: 11px; font-weight: 800; text-transform: uppercase;
        letter-spacing: 1px; cursor: pointer; font-family: inherit;
    }
    .btn-back:hover { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .btn-go {
        flex: 1; padding: 11px 20px; border-radius: 12px; border: none;
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        color: #03211a; font-size: 11px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.1px; cursor: pointer; font-family: inherit;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.24);
    }
    .btn-go:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 7px 20px rgba(16, 185, 129, 0.38); }
    .btn-go:disabled { opacity: 0.45; cursor: default; }
    .btn-go.wide { width: 100%; margin-top: 14px; }
    .btn-back:focus-visible, .btn-go:focus-visible { outline: 2px solid #34d399; outline-offset: 2px; }

    /* -- HUD --------------------------------------------------------- */
    .hud { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 11px; }
    .hud-l { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .qn { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .qn i { font-style: normal; font-size: 10px; color: #475569; }
    .hud-r .run { font-size: 15px; font-weight: 900; color: #6ee7b7; }
    .hud-r .run i { font-style: normal; font-size: 9px; color: #34d399; opacity: 0.7; }
    .pips { display: flex; gap: 3px; flex-wrap: wrap; justify-content: center; flex: 1; }
    .pip { width: 7px; height: 7px; border-radius: 2px; background: rgba(71, 85, 105, 0.35); }
    .pip.cur { background: rgba(16, 185, 129, 0.45); box-shadow: 0 0 6px rgba(16, 185, 129, 0.4); }
    .pip.good { background: #10b981; }
    .pip.mid { background: #f59e0b; }
    .pip.bad { background: #ef4444; }

    /* -- map --------------------------------------------------------- */
    .map-wrap {
        position: relative; width: 100%; margin: 0 auto;
        /* The square has to fit on screen IN ITS ENTIRETY. Icons flash for as
           little as 350ms, so a map that needs scrolling is a map you cannot
           play - and a partly-clipped map silently makes the drill unfair
           rather than merely awkward. 340px is the chrome above and below it
           (host header and padding, HUD, prompt, answer row, clock); the 190px
           floor keeps it usable in a very short window, where the panel's own
           scroll takes over. */
        max-width: min(430px, max(190px, calc(100vh - 340px)));
        aspect-ratio: 1 / 1; border-radius: 14px; overflow: hidden;
        border: 1px solid rgba(51, 65, 85, 0.4);
        background: #070b14; touch-action: none; user-select: none;
        -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
    }
    .map-wrap.live { cursor: crosshair; border-color: rgba(16, 185, 129, 0.4); }
    .map-wrap:focus-visible { outline: 2px solid #34d399; outline-offset: 2px; }
    /* Same cap against the *visible* viewport on phones, where 100vh hides
       part of the page behind the address bar. */
    @supports (height: 100dvh) {
        .map-wrap { max-width: min(430px, max(190px, calc(100dvh - 340px))); }
    }
    /* aspect-ratio fallback for older engines */
    @supports not (aspect-ratio: 1 / 1) {
        .map-wrap { height: 0; padding-bottom: 100%; }
        .map-wrap .mm { position: absolute; inset: 0; }
    }
    .mm { display: block; width: 100%; height: 100%; pointer-events: none; }

    .mm-bg { fill: #080d17; }
    .jg { stroke: rgba(51, 65, 85, 0.35); stroke-width: 0.35; }
    .jg-b { fill: rgba(59, 130, 246, 0.055); }
    .jg-r { fill: rgba(239, 68, 68, 0.05); }
    .jg-edge { fill: none; stroke: rgba(100, 116, 139, 0.14); stroke-width: 0.5; }
    .river { stroke: rgba(56, 189, 248, 0.11); stroke-width: 11; stroke-linecap: round; }
    .lane { fill: none; stroke: rgba(148, 163, 184, 0.13); stroke-width: 6.5; stroke-linecap: round; stroke-linejoin: round; }
    .lane-i { fill: none; stroke: rgba(203, 213, 225, 0.13); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
    .twr { fill: rgba(148, 163, 184, 0.3); }
    .base { fill: rgba(59, 130, 246, 0.13); stroke-width: 0.6; }
    .base-b { fill: rgba(59, 130, 246, 0.15); stroke: rgba(59, 130, 246, 0.3); }
    .base-r { fill: rgba(239, 68, 68, 0.13); stroke: rgba(239, 68, 68, 0.28); }
    .nex-b { fill: rgba(96, 165, 250, 0.55); }
    .nex-r { fill: rgba(248, 113, 113, 0.5); }
    .pit { fill: rgba(15, 23, 42, 0.85); stroke: rgba(100, 116, 139, 0.45); stroke-width: 0.6; }
    .pit-b { fill: rgba(126, 34, 206, 0.32); stroke: rgba(168, 85, 247, 0.55); }
    .pit-d { fill: rgba(180, 83, 9, 0.32); stroke: rgba(245, 158, 11, 0.5); }
    .pit-t { fill: rgba(226, 232, 240, 0.6); font-size: 3.2px; font-weight: 900; }

    .blip text { font-size: 3.4px; font-weight: 900; letter-spacing: 0.1px; }
    .foe circle { fill: rgba(239, 68, 68, 0.92); stroke: #fca5a5; stroke-width: 0.7; }
    .foe text { fill: #fff5f5; }
    .ally rect { fill: rgba(37, 99, 235, 0.9); stroke: #93c5fd; stroke-width: 0.7; }
    .ally text { fill: #eff6ff; }
    .blip.dim { opacity: 0.32; }

    .xh line { stroke: #10b981; stroke-width: 1; stroke-linecap: round; }
    .xh-o { fill: none; stroke: #6ee7b7; stroke-width: 0.9; }

    .mk-ring {
        fill: none; stroke: #10b981; stroke-width: 1.2;
        stroke-dasharray: 3.5 2.6; animation: mkSpin 3s linear infinite;
        transform-box: fill-box; transform-origin: center;
    }
    .mk-dot { fill: #6ee7b7; }
    .mk-guess { fill: rgba(248, 113, 113, 0.95); }
    .mk-line { stroke: rgba(248, 113, 113, 0.75); stroke-width: 0.7; stroke-dasharray: 2 1.6; }
    @keyframes mkSpin { to { transform: rotate(360deg); } }
    .rm .mk-ring { animation: none; stroke-dasharray: none; stroke-width: 1.4; }

    .veil {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(6, 9, 17, 0.72); backdrop-filter: blur(1px);
    }
    .veil-t {
        font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;
        color: #34d399;
    }

    /* -- ask panel --------------------------------------------------- */
    .ask { min-height: 118px; margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
    .prompt { font-size: 13.5px; font-weight: 800; color: #e2e8f0; line-height: 1.4; text-align: center; }
    .prompt.muted { color: #475569; font-weight: 700; }
    .prompt.res { display: flex; flex-direction: column; gap: 3px; font-size: 18px; font-weight: 900; }
    .prompt.res.ok { color: #34d399; }
    .prompt.res.half { color: #fbbf24; }
    .prompt.res.no { color: #f87171; }
    .res-n { font-size: 11px; font-weight: 700; color: #94a3b8; }
    .hint { font-size: 10px; color: #475569; text-align: center; line-height: 1.4; min-height: 14px; }

    .opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
    .opts-num { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    @media (max-width: 380px) { .opts-num { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; } }
    .opt {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px;
        padding: 9px 6px; border-radius: 12px; cursor: pointer; font-family: inherit;
        background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.4);
        color: #e2e8f0; min-height: 46px; justify-content: center;
    }
    .opt:hover { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.45); }
    .opt:focus-visible { outline: 2px solid #34d399; outline-offset: 2px; }
    .opt-k {
        position: absolute; top: 3px; left: 5px; font-size: 8px; font-weight: 900;
        color: #475569; letter-spacing: 0.5px;
    }
    .opt-ab {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 50%; margin-bottom: 2px;
        background: rgba(239, 68, 68, 0.85); color: #fff5f5;
        font-size: 8.5px; font-weight: 900;
    }
    .opt-l { font-size: 12px; font-weight: 900; line-height: 1.1; }
    .opts-num .opt-l { font-size: 17px; }
    .opt-s { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; color: #64748b; }

    .lockrow { display: flex; align-items: center; justify-content: center; gap: 10px; }
    .opt.lock {
        flex-direction: row; padding: 10px 22px; min-height: 0;
        font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.1);
    }
    .coord { font-size: 10px; font-weight: 800; color: #475569; letter-spacing: 1px; }

    .clock { height: 5px; border-radius: 99px; background: rgba(15, 23, 42, 0.8); overflow: hidden; margin-top: 10px; }
    .clock-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #059669, #34d399); }
    .clock-fill.warn { background: linear-gradient(90deg, #b45309, #fbbf24); }
    .clock-fill.crit { background: linear-gradient(90deg, #b91c1c, #f87171); }

    /* -- result ------------------------------------------------------ */
    .score-wrap { text-align: center; margin: 10px 0 8px; }
    .score { font-size: 54px; font-weight: 900; color: #34d399; line-height: 1; letter-spacing: -2px; }
    .score-lbl {
        font-size: 10px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.6px; color: #64748b; margin-top: 5px;
    }
    .bar-outer { height: 7px; border-radius: 99px; background: rgba(15, 23, 42, 0.8); overflow: hidden; }
    .bar-inner { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #059669, #6ee7b7); }

    .rgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 14px; }
    @media (max-width: 400px) { .rgrid { grid-template-columns: repeat(2, 1fr); } }
    .rstat {
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.22);
        border-radius: 12px; padding: 10px 4px; text-align: center;
    }
    .rv { display: block; font-size: 15px; font-weight: 900; color: #e2e8f0; }
    .rl { display: block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #475569; margin-top: 3px; }

    .breakdown { margin-top: 14px; display: flex; flex-direction: column; gap: 7px; }
    .bd-row { display: flex; align-items: center; gap: 9px; }
    .bd-n { font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.9px; color: #64748b; width: 92px; flex: 0 0 auto; }
    .bd-bar { flex: 1; height: 5px; border-radius: 99px; background: rgba(15, 23, 42, 0.8); overflow: hidden; }
    .bd-fill { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #0d9488, #34d399); }
    .bd-v { font-size: 10px; font-weight: 900; color: #94a3b8; width: 34px; text-align: right; flex: 0 0 auto; }

    .verdict { font-size: 12px; line-height: 1.6; color: #94a3b8; text-align: center; margin-top: 14px; }
</style>
