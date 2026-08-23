<script>
    // ===================================================================
    //  FOCUS FIRE - the TEAMFIGHTING (tmf) training drill
    // -------------------------------------------------------------------
    //  A frozen 5v5 frame is dealt every round. Five enemies, each with a
    //  role, a health percentage, a distance, a threat rating and status
    //  effects. You get a couple of seconds to press the correct target -
    //  or to call DISENGAGE when the damage already in the air is larger
    //  than the health you have left.
    //
    //  The scoring rule and the post-round explanation come from the SAME
    //  function (evalTarget / evalDisengage), so the teaching loop can
    //  never disagree with the maths.
    // ===================================================================
    import { onMount, onDestroy } from 'svelte';

    export let difficulty = 1;      // 1 Basic, 2 Advanced, 3 Elite
    export let drill = null;        // { id, attr, name, desc }
    export let onComplete = null;   // (score01, meta) => void
    export let onQuit = null;       // () => void

    // ---------------------------------------------------------------
    //  TUNING
    // ---------------------------------------------------------------
    //  Worst case (every round timed out) stays under 50s; the reveal is padded
    //  so even an instant-answer run cannot drop below ~32s.
    const DIFFS = {
        // scan = board visible, targets locked, no clock. Skippable with Space.
        //        The reaction window (limit) only opens once it ends.
        1: { rounds: 9,  scan: 4000, limit: 3400, reveal: 1000, minRound: 2900, name: 'Basic Drill' },
        2: { rounds: 10, scan: 3300, limit: 3000, reveal: 950,  minRound: 2500, name: 'Advanced' },
        3: { rounds: 11, scan: 2700, limit: 2500, reveal: 850,  minRound: 2250, name: 'Elite' },
    };
    $: diff = DIFFS[difficulty] ? difficulty : 1;
    $: CFG = DIFFS[diff];

    const SPEED_PEN = 0.30;         // reaction multiplier = 1 - PEN * f^1.6
    const SPEED_EXP = 1.6;
    const RANK_CREDIT = [1, 0.5, 0.18, 0, 0, 0];
    const STEP_UP = 90;             // units past your range you can still reach, at a cost

    // ---------------------------------------------------------------
    //  DATA
    // ---------------------------------------------------------------
    const CHAMPS = {
        TOP: ['Aatrox', 'Ornn', 'Sion', 'Jax', 'Camille', 'Renekton', 'Malphite', 'Gnar', 'Sett', 'Gwen'],
        JNG: ['Lee Sin', 'Vi', 'Sejuani', 'Viego', 'Nidalee', 'Jarvan', 'Maokai', 'Graves', 'Wukong', 'Elise'],
        MID: ['Ahri', 'Azir', 'Orianna', 'Syndra', 'Zed', 'LeBlanc', 'Viktor', 'Sylas', 'Taliyah', 'Akali'],
        ADC: ['Jinx', 'Caitlyn', 'Ashe', 'Xayah', 'Ezreal', 'Varus', 'Lucian', 'Zeri', 'Jhin', 'Aphelios'],
        SUP: ['Thresh', 'Leona', 'Lulu', 'Nami', 'Rakan', 'Braum', 'Pyke', 'Karma', 'Milio', 'Nautilus'],
    };
    const PROFILE = {
        TOP: { threat: [3, 7],  hp: [45, 100], dist: [18, 52] },
        JNG: { threat: [4, 8],  hp: [40, 100], dist: [20, 62] },
        MID: { threat: [6, 9],  hp: [35, 100], dist: [34, 82] },
        ADC: { threat: [7, 10], hp: [30, 100], dist: [40, 90] },
        SUP: { threat: [2, 6],  hp: [35, 100], dist: [20, 64] },
    };

    // mult 0 means the rotation is simply thrown away.
    const STATUS = {
        stun:    { label: 'STUNNED',      tone: 'good', mult: 1.40, why: 'stunned, so the rotation is a guaranteed connect' },
        root:    { label: 'ROOTED',       tone: 'good', mult: 1.18, why: 'rooted and cannot walk out of it' },
        shield:  { label: 'SHIELDED',     tone: 'bad',  mult: 0.32, why: 'the shield eats most of your burst' },
        sshield: { label: 'SPELL SHIELD', tone: 'bad',  mult: 0.22, why: 'a spell shield swallows the ability you open with' },
        heal:    { label: 'BEING HEALED', tone: 'bad',  mult: 0.62, why: 'enchanter heals are outpacing your chip damage' },
        stasis:  { label: 'ZHONYA',       tone: 'null', mult: 0,    why: 'in stasis - every ability you throw at them is wasted' },
        untgt:   { label: 'UNTARGETABLE', tone: 'null', mult: 0,    why: 'untargetable right now, so the rotation goes nowhere' },
    };
    const PIPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    // ---------------------------------------------------------------
    //  SMALL HELPERS
    // ---------------------------------------------------------------
    function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
    function shuffle(a) {
        const c = a.slice();
        for (let i = c.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = c[i]; c[i] = c[j]; c[j] = t;
        }
        return c;
    }
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function inR(me) { return ri(16, Math.round(me.range / 10) - 3) * 10; }
    function outR(me) { return (Math.round(me.range / 10) + ri(13, 30)) * 10; }
    function edgeR(me) { return (Math.round(me.range / 10) + ri(2, 8)) * 10; }

    // ---------------------------------------------------------------
    //  THE HONEST PRIORITY MODEL
    //  Everything the reveal says is generated from right here.
    // ---------------------------------------------------------------
    function evalTarget(t, me) {
        const dead = t.status.filter(s => STATUS[s].mult === 0);
        if (dead.length) {
            return { value: 0, blocked: true, why: 'Wasted rotation - ' + STATUS[dead[0]].why + '.' };
        }
        const reach = t.dist - me.range;
        if (reach > STEP_UP) {
            return {
                value: 0, blocked: true,
                why: 'Out of range - ' + t.dist + ' units away and you reach ' + me.range + '. Nothing you press touches them.',
            };
        }
        const killFactor = 1 + (100 - t.hp) / 38;   // 100% HP -> 1.00, 20% HP -> 3.11
        let v = t.threat * killFactor;
        const notes = [];
        if (reach > 0) {
            v *= 0.55;
            notes.push('at the very edge of your range, so you have to step into the fight for it');
        }
        for (const s of t.status) {
            v *= STATUS[s].mult;
            notes.push(STATUS[s].why);
        }
        const head = t.hp + '% HP, threat ' + t.threat + ', ' + t.dist + ' units';
        const why = notes.length
            ? head + ' - ' + notes.join('; ') + '.'
            : head + ' - reachable, unprotected, and nothing is going to stop the damage.';
        return { value: v, blocked: false, why: why };
    }

    function incomingOn(targets) {
        // Only enemies that can reach you and are not locked down are hitting you.
        let inc = 0;
        for (const t of targets) {
            if (t.status.some(s => s === 'stun' || s === 'root' || s === 'stasis')) continue;
            const prox = t.dist <= 400 ? 1 : t.dist <= 700 ? 0.5 : 0.12;
            inc += t.threat * prox;
        }
        return Math.round(inc * 5.2);   // as a percentage of your maximum health
    }

    function evalDisengage(targets, me) {
        const burst = incomingOn(targets);
        const danger = burst / Math.max(1, me.hp);
        const raw = 34 * clamp01((danger - 0.75) / 0.95);
        const value = raw * (me.escapeUp ? 1 : 0.42);
        let why;
        if (!me.escapeUp && danger >= 1) {
            why = 'You are on ' + me.hp + '% with about ' + burst + '% incoming, but your escape is down - '
                + 'walking backwards does not save you, so you commit to the best target you can reach.';
        } else if (danger >= 1) {
            why = 'You are on ' + me.hp + '% with about ' + burst + '% of your health already in the air and an escape up. '
                + 'No rotation beats being alive.';
        } else {
            why = 'You are on ' + me.hp + '% against roughly ' + burst + '% incoming. You have the health to stand there and press a button.';
        }
        return { value: value, blocked: false, why: why, burst: burst };
    }

    function rankBoard(b) {
        const opts = b.targets.map(t => {
            const ev = evalTarget(t, b.me);
            return { id: t.id, kind: 't', key: t.key, name: t.name, role: t.role, value: ev.value, blocked: ev.blocked, why: ev.why };
        });
        const d = evalDisengage(b.targets, b.me);
        opts.push({ id: 'X', kind: 'd', key: 0, name: 'Disengage', role: 'YOU', value: d.value, blocked: false, why: d.why });
        opts.sort((a, c) => c.value - a.value);
        return opts;
    }

    function creditFor(id, ranked) {
        let idx = -1, mine = null;
        for (let i = 0; i < ranked.length; i++) if (ranked[i].id === id) { mine = ranked[i]; break; }
        if (!mine) return 0;
        if (mine.value <= 0.0001) return 0;   // blocked picks are always a zero, whatever they rank
        for (let i = 0; i < ranked.length; i++) {
            if (Math.abs(ranked[i].value - mine.value) < 1e-6) { idx = i; break; }
        }
        return RANK_CREDIT[idx] !== undefined ? RANK_CREDIT[idx] : 0;
    }

    // ---------------------------------------------------------------
    //  BOARD GENERATION
    // ---------------------------------------------------------------
    // A clean focus, C/B shield+stasis traps, D range check, G tank bait,
    // E you must leave, F you must commit. Tuned so disengage is the correct
    // answer on roughly one round in six.
    const ARCH_WEIGHTS = {
        1: [['A', 30], ['G', 22], ['D', 18], ['C', 14], ['E', 14], ['B', 6]],
        2: [['A', 17], ['G', 16], ['D', 16], ['C', 16], ['B', 13], ['E', 16], ['F', 9]],
        3: [['A', 11], ['G', 12], ['D', 14], ['C', 16], ['B', 18], ['E', 18], ['F', 14]],
    };
    function pickArch(d) {
        const table = ARCH_WEIGHTS[d] || ARCH_WEIGHTS[1];
        let total = 0;
        for (const row of table) total += row[1];
        let r = Math.random() * total;
        for (const row of table) { r -= row[1]; if (r <= 0) return row[0]; }
        return table[0][0];
    }

    function blankBoard() {
        const me = { hp: ri(45, 95), range: ri(52, 68) * 10, escapeUp: Math.random() < 0.62 };
        const roles = shuffle(['TOP', 'JNG', 'MID', 'ADC', 'SUP']);
        const targets = roles.map((role, i) => {
            const p = PROFILE[role];
            return {
                id: i, key: i + 1, role: role,
                name: pickOne(CHAMPS[role]),
                hp: ri(p.hp[0], p.hp[1]),
                threat: ri(p.threat[0], p.threat[1]),
                dist: ri(p.dist[0], p.dist[1]) * 10,
                status: [],
            };
        });
        return { me: me, targets: targets };
    }

    function applyArch(arch, T, me) {
        const byRole = {};
        for (const t of T) byRole[t.role] = t;
        const carry = Math.random() < 0.58 ? byRole.ADC : byRole.MID;
        const second = carry.role === 'ADC' ? byRole.MID : byRole.ADC;
        const tank = Math.random() < 0.55 ? byRole.TOP : byRole.JNG;
        const bruiser = tank.role === 'TOP' ? byRole.JNG : byRole.TOP;
        const sup = byRole.SUP;
        const avoid = [];
        let mustDisengage = false;

        if (arch === 'A') {
            // Clean read: the low health carry is in range and nothing protects it.
            me.hp = ri(58, 95);
            carry.hp = ri(11, 28); carry.threat = ri(8, 10); carry.dist = inR(me);
            second.hp = ri(66, 100); tank.hp = ri(78, 100); bruiser.hp = ri(70, 100); sup.hp = ri(62, 100);
        } else if (arch === 'G') {
            // The full health tank is stunned on top of you. It is still not the answer.
            me.hp = ri(55, 95);
            tank.hp = ri(90, 100); tank.threat = ri(3, 5); tank.dist = ri(14, 26) * 10; tank.status = ['stun'];
            carry.hp = ri(26, 46); carry.threat = ri(8, 10); carry.dist = inR(me);
            second.hp = ri(70, 100); bruiser.hp = ri(72, 100); sup.hp = ri(66, 100);
            avoid.push(tank.id);
        } else if (arch === 'B') {
            // The juiciest target is in stasis or untargetable.
            me.hp = ri(52, 92);
            carry.hp = ri(9, 22); carry.threat = ri(8, 10); carry.dist = inR(me);
            carry.status = [Math.random() < 0.55 ? 'stasis' : 'untgt'];
            second.hp = ri(34, 58); second.threat = ri(7, 9); second.dist = inR(me);
            tank.hp = ri(75, 100); bruiser.hp = ri(72, 100); sup.hp = ri(60, 100);
            avoid.push(carry.id);
        } else if (arch === 'C') {
            // The juiciest target is shielded - not zero, just bad value.
            me.hp = ri(52, 92);
            carry.hp = ri(9, 24); carry.threat = ri(8, 10); carry.dist = inR(me);
            carry.status = [Math.random() < 0.6 ? 'shield' : 'sshield'];
            second.hp = ri(30, 52); second.threat = ri(7, 9); second.dist = inR(me);
            tank.hp = ri(78, 100); bruiser.hp = ri(74, 100); sup.hp = ri(64, 100);
            avoid.push(carry.id);
        } else if (arch === 'D') {
            // The carry is out of range. The stunned body next to you is the play.
            me.hp = ri(52, 92);
            carry.hp = ri(10, 26); carry.threat = ri(9, 10); carry.dist = outR(me);
            const near = Math.random() < 0.6 ? sup : bruiser;
            near.hp = ri(28, 52); near.threat = ri(4, 7); near.dist = ri(14, 30) * 10; near.status = ['stun'];
            second.hp = ri(72, 100); second.dist = outR(me);
            tank.hp = ri(80, 100);
            avoid.push(carry.id);
        } else if (arch === 'E' || arch === 'F') {
            // You are the one about to die. E: escape up, get out. F: escape down, commit.
            me.hp = ri(12, 30);
            me.escapeUp = (arch === 'E');
            const closers = shuffle(T).slice(0, 3);
            for (const t of closers) {
                t.dist = ri(14, 33) * 10;
                t.status = [];
                t.threat = Math.max(t.threat, ri(5, 8));
            }
            for (const t of T) if (t.hp < 42) t.hp = ri(56, 92);
            if (arch === 'F') {
                const target = closers.find(t => t.role === 'ADC' || t.role === 'MID') || closers[0];
                target.hp = ri(24, 44); target.threat = ri(8, 10); target.dist = inR(me);
            }
            mustDisengage = (arch === 'E');
        }
        return { avoid: avoid, mustDisengage: mustDisengage };
    }

    function addNoise(T, me, d) {
        const budget = d >= 3 ? ri(2, 4) : d === 2 ? ri(1, 3) : ri(0, 1);
        const pool = d >= 3
            ? ['shield', 'stun', 'root', 'heal', 'sshield', 'stasis', 'untgt', 'shield', 'stun']
            : d === 2
                ? ['shield', 'stun', 'root', 'heal', 'sshield', 'stun', 'shield']
                : ['shield', 'stun', 'root', 'heal'];
        const capacity = d >= 3 ? 2 : 1;
        for (let i = 0; i < budget; i++) {
            const t = pickOne(T);
            if (t.status.length >= capacity) continue;
            if (t.status.some(x => STATUS[x].mult === 0)) continue;
            const s = pickOne(pool);
            if (t.status.indexOf(s) !== -1) continue;
            if (STATUS[s].mult === 0 && t.status.length) continue;
            t.status.push(s);
        }
        // Decoys: a second tempting health bar, and edge-of-range bait.
        if (d >= 2 && Math.random() < 0.55) { const t = pickOne(T); t.hp = ri(18, 46); }
        if (d >= 2 && Math.random() < 0.45) { const t = pickOne(T); t.dist = edgeR(me); }
        if (d >= 3 && Math.random() < 0.4) { const t = pickOne(T); t.hp = ri(14, 38); t.dist = outR(me); }
    }

    function makeRound(d) {
        const arch = pickArch(d);
        let last = null;
        for (let a = 0; a < 70; a++) {
            const b = blankBoard();
            const intent = applyArch(arch, b.targets, b.me);
            addNoise(b.targets, b.me, d);
            b.arch = arch;
            b.intent = intent;
            b.ranked = rankBoard(b);
            b.burst = incomingOn(b.targets);
            last = b;
            const top = b.ranked[0], nxt = b.ranked[1];
            if (top.value <= 2) continue;
            const gap = (top.value - nxt.value) / top.value;
            if (gap < (a > 40 ? 0.09 : 0.18)) continue;
            if (intent.mustDisengage && top.id !== 'X') continue;
            if (!intent.mustDisengage && top.id === 'X') continue;
            if (intent.avoid.indexOf(top.id) !== -1) continue;
            return b;
        }
        return last;
    }

    // ---------------------------------------------------------------
    //  RUNTIME STATE
    // ---------------------------------------------------------------
    let view = 'intro';             // intro | play | done
    let phase = 'scan';             // scan | aim | reveal
    let board = null;
    let roundIndex = 0;
    let log = [];
    let picked = null;
    let last = null;                // last round result
    let phaseEnd = 0;
    let roundStart = 0;
    let clockNow = 0;
    let looping = false;
    let rafId = 0;
    let reduceMotion = false;
    let mq = null;
    let mqHandler = null;
    let score01 = 0;
    let meta = null;

    $: title = (drill && drill.name) ? drill.name : 'Focus Fire';
    $: subtitle = (drill && drill.desc)
        ? drill.desc
        : 'Target selection, positioning and cooldown discipline when everything happens at once.';

    $: remain = (view === 'play' && phase === 'aim') ? Math.max(0, phaseEnd - clockNow) : 0;
    $: timeFrac = CFG ? clamp01(remain / CFG.limit) : 0;
    $: runningMean = log.length ? log.reduce((s, r) => s + r.score, 0) / log.length : 0;

    function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        looping = false;
    }
    function startLoop() {
        if (looping) return;
        looping = true;
        rafId = requestAnimationFrame(tick);
    }
    function tick() {
        if (!looping) return;
        rafId = requestAnimationFrame(tick);
        clockNow = performance.now();
        if (view !== 'play') return;
        if (phase === 'scan') {
            if (clockNow >= phaseEnd) beginAim();
        } else if (phase === 'aim') {
            if (clockNow >= phaseEnd) resolve(null, true);
        } else if (clockNow >= phaseEnd) {
            advance();
        }
    }

    function startRun() {
        log = [];
        roundIndex = 0;
        view = 'play';
        beginRound();
        startLoop();
    }

    // The board goes up first with the targets locked and no clock running.
    // Five champions with health, range and status effects is a lot to take in,
    // and the drill is meant to test target PRIORITY, not reading speed - so
    // reading happens before the reaction window opens.
    function beginRound() {
        board = makeRound(diff);
        picked = null;
        last = null;
        phase = 'scan';
        clockNow = performance.now();
        roundStart = clockNow;
        phaseEnd = clockNow + CFG.scan;
    }

    function beginAim() {
        if (view !== 'play' || phase !== 'scan') return;
        phase = 'aim';
        roundStart = performance.now();
        clockNow = roundStart;
        phaseEnd = roundStart + CFG.limit;
    }

    function resolve(id, timedOut) {
        if (view !== 'play' || phase !== 'aim' || !board) return;
        const now = performance.now();
        const reactMs = timedOut ? CFG.limit : Math.max(0, now - roundStart);
        const f = clamp01(reactMs / CFG.limit);
        const speed = timedOut ? 0 : 1 - SPEED_PEN * Math.pow(f, SPEED_EXP);
        const credit = timedOut ? 0 : creditFor(id, board.ranked);
        const score = credit * speed;
        picked = timedOut ? null : id;
        last = {
            id: id, credit: credit, speed: speed, score: score,
            reactMs: reactMs, timedOut: !!timedOut,
            ranked: board.ranked,
            mine: timedOut ? null : board.ranked.find(o => o.id === id) || null,
        };
        log = log.concat([last]);
        phase = 'reveal';
        // Pad the reveal so a very fast player still gets a full-length session
        // and still has to read the answer.
        const pad = Math.max(CFG.reveal, CFG.minRound - reactMs);
        phaseEnd = now + Math.min(pad, CFG.reveal + 1400);
    }

    function advance() {
        roundIndex += 1;
        if (roundIndex >= CFG.rounds) finishRun();
        else beginRound();
    }

    function verdictFor(s) {
        if (s >= 0.90) return 'Frame-perfect focus';
        if (s >= 0.78) return 'Elite target selection';
        if (s >= 0.64) return 'Reads the fight well';
        if (s >= 0.50) return 'Finds a target, not the target';
        if (s >= 0.34) return 'Target diffusion';
        if (s >= 0.20) return 'Hitting the wrong things';
        return 'Fights are being lost here';
    }

    function finishRun() {
        stopLoop();
        const n = log.length || 1;
        const hits = log.filter(r => r.credit >= 0.999).length;
        const secondBest = log.filter(r => r.credit > 0.3 && r.credit < 0.999).length;
        const thirds = log.filter(r => r.credit > 0.01 && r.credit <= 0.3).length;
        const timeouts = log.filter(r => r.timedOut).length;
        const wasted = log.filter(r => !r.timedOut && r.credit <= 0.01).length;
        const misses = timeouts + wasted;
        let streak = 0, best = 0;
        for (const r of log) {
            if (r.credit >= 0.999) { streak += 1; if (streak > best) best = streak; }
            else streak = 0;
        }
        const answered = log.filter(r => !r.timedOut);
        const avgReact = answered.length
            ? answered.reduce((s, r) => s + r.reactMs, 0) / answered.length
            : CFG.limit;
        const disCalls = log.filter(r => r.id === 'X').length;
        const disRight = log.filter(r => r.id === 'X' && r.credit >= 0.999).length;

        score01 = Math.round(clamp01(log.reduce((s, r) => s + r.score, 0) / n) * 10000) / 10000;

        let line;
        if (timeouts >= 3) line = 'You are still reading the board when the fight is over - commit inside the first second.';
        else if (wasted > hits) line = 'Too many rotations thrown into shields, stasis and thin air. Check status before you press.';
        else if (secondBest + thirds > hits) line = 'You are finding a target every time, just not the best one on the board.';
        else if (score01 >= 0.85) line = 'Instant, correct, and you left the fights you could not win. That is the whole skill.';
        else if (score01 >= 0.6) line = 'Good priority. Shave half a second off the read and this becomes elite.';
        else line = 'Slow down on the intro next time - the priority rule is simple, applying it fast is not.';

        meta = {
            label: verdictFor(score01),
            accuracy: Math.round((hits / n) * 1000) / 1000,
            hits: hits,
            misses: misses,
            streak: streak,
            best: best,
            detail: hits + '/' + n + ' best targets, ' + secondBest + ' second-best, ' + wasted
                + ' wasted, ' + timeouts + ' timed out, ' + (avgReact / 1000).toFixed(2) + 's average',
            verdictLine: line,
            rounds: n,
            secondBest: secondBest,
            thirds: thirds,
            wasted: wasted,
            timeouts: timeouts,
            avgReactionMs: Math.round(avgReact),
            disengageCalls: disCalls,
            disengageCorrect: disRight,
            difficulty: diff,
            attr: 'tmf',
            game: 'focus',
        };
        view = 'done';
    }

    function handleStart() { startRun(); }
    function handleBack() { if (typeof onQuit === 'function') onQuit(); }
    function handleFinish() { if (typeof onComplete === 'function') onComplete(score01, meta); }

    // ---------------------------------------------------------------
    //  KEYBOARD
    // ---------------------------------------------------------------
    function handleKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = e.target && e.target.tagName;
        const onButton = tag === 'BUTTON';
        const k = e.key;
        if (view === 'intro') {
            if (k === 'Enter' && !onButton) { e.preventDefault(); handleStart(); }
            return;
        }
        if (view === 'done') {
            if (k === 'Enter' && !onButton) { e.preventDefault(); handleFinish(); }
            return;
        }
        if (phase === 'scan') {
            if (k === ' ' || e.code === 'Space' || k === 'Enter') { e.preventDefault(); beginAim(); }
            return;
        }
        if (phase !== 'aim' || !board) return;
        if (k >= '1' && k <= '5') {
            const t = board.targets[Number(k) - 1];
            if (t) { e.preventDefault(); resolve(t.id, false); }
            return;
        }
        if (k === '0' || k === 'd' || k === 'D' || k === 'Escape') {
            e.preventDefault();
            resolve('X', false);
        }
    }

    // ---------------------------------------------------------------
    //  LIFECYCLE
    // ---------------------------------------------------------------
    onMount(() => {
        if (typeof window !== 'undefined' && window.matchMedia) {
            mq = window.matchMedia('(prefers-reduced-motion: reduce)');
            reduceMotion = !!mq.matches;
            mqHandler = (ev) => { reduceMotion = !!ev.matches; };
            if (mq.addEventListener) mq.addEventListener('change', mqHandler);
            else if (mq.addListener) mq.addListener(mqHandler);
        }
    });

    onDestroy(() => {
        stopLoop();
        if (mq && mqHandler) {
            if (mq.removeEventListener) mq.removeEventListener('change', mqHandler);
            else if (mq.removeListener) mq.removeListener(mqHandler);
        }
        mq = null;
        mqHandler = null;
    });

    // ---------------------------------------------------------------
    //  VIEW HELPERS
    // ---------------------------------------------------------------
    function hpTone(hp) { return hp <= 25 ? 'crit' : hp <= 55 ? 'warn' : 'ok'; }
    function distTone(t, me) {
        const reach = t.dist - me.range;
        if (reach > STEP_UP) return 'out';
        if (reach > 0) return 'edge';
        return 'in';
    }
    function distTag(t, me) {
        const reach = t.dist - me.range;
        if (reach > STEP_UP) return 'OUT';
        if (reach > 0) return 'EDGE';
        return 'IN';
    }
    function ariaFor(t, me) {
        return 'Target ' + t.key + ': ' + t.name + ', ' + t.role + ', ' + t.hp + ' percent health, threat '
            + t.threat + ' of 10, ' + t.dist + ' units away, ' + distTag(t, me) + ' of range'
            + (t.status.length ? ', ' + t.status.map(s => STATUS[s].label.toLowerCase()).join(' and ') : '')
            + '.';
    }
    // NOTE: ph and res are passed in rather than read off the closure so Svelte
    // registers `phase` and `last` as dependencies of these markup expressions.
    function ringFor(t, ph, res) {
        if (ph !== 'reveal' || !res) return '';
        if (t.id === res.ranked[0].id) return 'best';
        if (res.id === t.id) return 'wrong';
        return '';
    }
    function disengageRing(ph, res) {
        if (ph !== 'reveal' || !res) return '';
        if (res.ranked[0].id === 'X') return 'best';
        if (res.id === 'X') return 'wrong';
        return '';
    }
    function optLabel(o) { return o.kind === 'd' ? 'Disengage' : o.name + ' (' + o.role + ')'; }
    function verdictBadge(r) {
        if (r.timedOut) return { text: 'TOO SLOW', tone: 'bad' };
        if (r.credit >= 0.999) return { text: 'BEST TARGET', tone: 'good' };
        if (r.credit >= 0.5) return { text: 'SECOND BEST', tone: 'mid' };
        if (r.credit > 0.01) return { text: 'THIRD CHOICE', tone: 'mid' };
        return { text: 'WASTED ROTATION', tone: 'bad' };
    }
</script>

<svelte:window on:keydown={handleKey} />

<div class="ff" class:rm={reduceMotion}>

    {#if view === 'intro'}
        <!-- ================= INTRO ================= -->
        <div class="card intro">
            <div class="eyebrow">Teamfighting drill</div>
            <h2 class="h1">{title}</h2>
            <p class="lede">{subtitle}</p>
            <p class="body">
                Teamfights are decided in the first second, by whoever picks the right thing to hit. This drill
                freezes a 5v5 the instant before the trade and asks one question over and over: of everything on
                this screen, what is worth your cooldowns right now? A dying carry beats a healthy tank, a target
                in stasis is worth nothing at all, and sometimes the correct answer is that you are the one about
                to die and the button to press is the one that gets you out.
            </p>

            <div class="how">
                <div class="how-t">How to play</div>
                <ul class="how-list">
                    <li><b>1 - 5</b> picks a target, <b>0</b>, <b>D</b> or <b>Esc</b> calls <b>Disengage</b>. Clicking works the same.</li>
                    <li><b>Zhonya, untargetable and out of range are zero.</b> The rotation is simply thrown away.</li>
                    <li><b>Shields, spell shields and heals</b> shrink a target's value hard, but do not zero it.</li>
                    <li><b>Stunned and rooted</b> targets are worth more - you are guaranteed to connect.</li>
                    <li><b>Low health x high threat</b> is the core of the priority score. Distance gates all of it.</li>
                    <li><b>Watch your own bar.</b> If incoming damage beats your health and your escape is up, disengage wins.</li>
                    <li>Second-best scores half. Answer fast - full marks decay as the clock drains.</li>
                </ul>
            </div>

            <div class="meta-row">
                <span class="chip">{CFG.name}</span>
                <span class="chip">{CFG.rounds} rounds</span>
                <span class="chip">{(CFG.limit / 1000).toFixed(1)}s per read</span>
            </div>

            <div class="actions">
                <button class="btn ghost" on:click={handleBack} aria-label="Back out of this drill without training">Back</button>
                <button class="btn go" on:click={handleStart} aria-label="Start the Focus Fire drill">Start Drill</button>
            </div>
        </div>

    {:else if view === 'play'}
        <!-- ================= PLAYING ================= -->
        <div class="card play">
            <div class="hud">
                <div class="hud-l">
                    <span class="eyebrow">Round</span>
                    <span class="hud-big">{Math.min(roundIndex + 1, CFG.rounds)}<span class="hud-of">/{CFG.rounds}</span></span>
                </div>
                <div class="clock" aria-hidden="true">
                    <div class="clock-bar">
                        <div class="clock-fill" class:low={timeFrac < 0.34} style="width:{timeFrac * 100}%"></div>
                    </div>
                    <div class="clock-num" class:low={timeFrac < 0.34}>{(remain / 1000).toFixed(1)}s</div>
                </div>
                <div class="hud-r">
                    <span class="eyebrow">Focus</span>
                    <span class="hud-big">{Math.round(runningMean * 100)}<span class="hud-of">%</span></span>
                </div>
            </div>

            {#if board}
                <!-- your own state: this is what makes disengage a real read -->
                <div class="me">
                    <div class="me-tag">YOU</div>
                    <div class="me-hp">
                        <div class="me-hp-bar"><div class="me-hp-fill {hpTone(board.me.hp)}" style="width:{board.me.hp}%"></div></div>
                        <span class="me-hp-num {hpTone(board.me.hp)}">{board.me.hp}%</span>
                    </div>
                    <div class="me-stat"><span class="me-k">RANGE</span><span class="me-v">{board.me.range}<span class="me-sub">+{STEP_UP}</span></span></div>
                    <div class="me-stat"><span class="me-k">ESCAPE</span><span class="me-v" class:down={!board.me.escapeUp}>{board.me.escapeUp ? 'FLASH UP' : 'FLASH DOWN'}</span></div>
                    <div class="me-stat"><span class="me-k">INCOMING</span><span class="me-v" class:danger={board.burst >= board.me.hp}>~{board.burst}%</span></div>
                </div>

                <div class="board">
                    {#each board.targets as t (t.id)}
                        <button
                            class="tgt {ringFor(t, phase, last)}"
                            class:picked={picked === t.id}
                            disabled={phase !== 'aim'}
                            on:click={() => resolve(t.id, false)}
                            aria-label={ariaFor(t, board.me)}
                        >
                            <div class="t-head">
                                <span class="t-key">{t.key}</span>
                                <span class="t-role r-{t.role}">{t.role}</span>
                                <span class="t-dist d-{distTone(t, board.me)}">{t.dist}</span>
                            </div>
                            <div class="t-name">{t.name}</div>
                            <div class="t-hp">
                                <div class="t-hp-bar"><div class="t-hp-fill {hpTone(t.hp)}" style="width:{t.hp}%"></div></div>
                                <span class="t-hp-num {hpTone(t.hp)}">{t.hp}%</span>
                            </div>
                            <div class="t-threat">
                                <span class="t-k">THR</span>
                                <span class="pips">
                                    {#each PIPS as p}<i class="pip" class:on={p < t.threat}></i>{/each}
                                </span>
                                <span class="t-thr-num">{t.threat}</span>
                            </div>
                            <div class="t-status">
                                {#if distTone(t, board.me) === 'out'}
                                    <span class="st st-null">OUT OF RANGE</span>
                                {:else if distTone(t, board.me) === 'edge'}
                                    <span class="st st-bad">EDGE OF RANGE</span>
                                {/if}
                                {#each t.status as s}
                                    <span class="st st-{STATUS[s].tone}">{STATUS[s].label}</span>
                                {/each}
                            </div>
                        </button>
                    {/each}
                </div>

                <button
                    class="dis {disengageRing(phase, last)}"
                    class:picked={picked === 'X'}
                    disabled={phase !== 'aim'}
                    on:click={() => resolve('X', false)}
                    aria-label={'Disengage. You are at ' + board.me.hp + ' percent health with about ' + board.burst + ' percent incoming and your escape ' + (board.me.escapeUp ? 'up' : 'down') + '.'}
                >
                    <span class="t-key">0</span>
                    <span class="dis-t">DISENGAGE</span>
                    <span class="dis-s">walk it out, take the fight later</span>
                </button>

                <div class="slot" aria-live="polite">
                    {#if phase === 'scan'}
                        <div class="scanbox">
                            <span class="scan-lbl">Read the fight</span>
                            <button class="scan-go" type="button" on:click={beginAim}>
                                Go Live
                                <span class="scan-kbd">Space</span>
                            </button>
                            <span class="scan-note">
                                Targets unlock in {Math.max(1, Math.ceil(Math.max(0, phaseEnd - clockNow) / 1000))}s.
                                Your reaction time is measured from then.
                            </span>
                        </div>
                    {:else if phase === 'aim'}
                        <div class="hint">Pick the highest-value target you can actually kill. Keys <b>1-5</b>, or <b>0</b> to disengage.</div>
                    {:else if last}
                        <div class="reveal">
                            <div class="rv-head">
                                <span class="rv-badge {verdictBadge(last).tone}">{verdictBadge(last).text}</span>
                                <span class="rv-pts">+{Math.round(last.score * 100)}</span>
                                <span class="rv-time">{last.timedOut ? 'no answer' : (last.reactMs / 1000).toFixed(2) + 's'}</span>
                            </div>
                            <div class="rv-row rv-1">
                                <span class="rv-rank">1st</span>
                                <span class="rv-name">{optLabel(last.ranked[0])}</span>
                                <span class="rv-pri">PRI {last.ranked[0].value.toFixed(1)}</span>
                                <span class="rv-why">{last.ranked[0].why}</span>
                            </div>
                            <div class="rv-row rv-2">
                                <span class="rv-rank">2nd</span>
                                <span class="rv-name">{optLabel(last.ranked[1])}</span>
                                <span class="rv-pri">PRI {last.ranked[1].value.toFixed(1)}</span>
                                <span class="rv-why">{last.ranked[1].why}</span>
                            </div>
                            {#if last.timedOut}
                                <div class="rv-row rv-you">
                                    <span class="rv-rank">You</span>
                                    <span class="rv-name">No call</span>
                                    <span class="rv-why">The fight does not wait. An unpressed cooldown is worth nothing.</span>
                                </div>
                            {:else if last.mine && last.credit < 0.5}
                                <div class="rv-row rv-you">
                                    <span class="rv-rank">You</span>
                                    <span class="rv-name">{optLabel(last.mine)}</span>
                                    <span class="rv-pri">PRI {last.mine.value.toFixed(1)}</span>
                                    <span class="rv-why">{last.mine.why}</span>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>

    {:else}
        <!-- ================= RESULT ================= -->
        <div class="card done">
            <div class="eyebrow">Session complete</div>
            <div class="score-wrap">
                <div class="score">{Math.round(score01 * 100)}<span class="score-pct">%</span></div>
                <div class="score-lbl">{meta ? meta.label : ''}</div>
            </div>

            <div class="grid">
                <div class="cell"><span class="cell-v good">{meta ? meta.hits : 0}<span class="cell-of">/{meta ? meta.rounds : 0}</span></span><span class="cell-k">Best target</span></div>
                <div class="cell"><span class="cell-v mid">{meta ? meta.secondBest : 0}</span><span class="cell-k">Second best</span></div>
                <div class="cell"><span class="cell-v bad">{meta ? meta.wasted : 0}</span><span class="cell-k">Wasted</span></div>
                <div class="cell"><span class="cell-v bad">{meta ? meta.timeouts : 0}</span><span class="cell-k">Timed out</span></div>
                <div class="cell"><span class="cell-v">{meta ? (meta.avgReactionMs / 1000).toFixed(2) : '0.00'}<span class="cell-of">s</span></span><span class="cell-k">Avg read</span></div>
                <div class="cell"><span class="cell-v">{meta ? meta.best : 0}</span><span class="cell-k">Best streak</span></div>
            </div>

            <p class="verdict">{meta ? meta.verdictLine : ''}</p>
            {#if meta && meta.disengageCalls > 0}
                <p class="sub-note">Disengage called {meta.disengageCalls} time{meta.disengageCalls === 1 ? '' : 's'}, correct {meta.disengageCorrect}.</p>
            {/if}

            <div class="actions">
                <button class="btn go wide" on:click={handleFinish} aria-label="Finish the session and bank the result">Finish Session</button>
            </div>
        </div>
    {/if}
</div>

<style>
    .ff {
        --acc: #3b82f6;
        --acc-l: #93c5fd;
        --acc-d: #1d4ed8;
        max-width: 980px;
        margin: 0 auto;
        width: 100%;
        color: #c8d6e5;
    }
    .card {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(59, 130, 246, 0.16);
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03);
    }
    @media (max-width: 520px) { .card { padding: 14px; border-radius: 16px; } }

    .eyebrow {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.6px; color: #475569;
    }
    .h1 { font-size: 24px; font-weight: 900; color: #e2e8f0; margin-top: 6px; letter-spacing: -0.2px; }
    .lede { font-size: 12px; color: var(--acc-l); font-weight: 700; margin-top: 4px; }
    .body { font-size: 13px; line-height: 1.65; color: #94a3b8; margin-top: 12px; }

    /* ---------- intro ---------- */
    .how {
        margin-top: 16px; padding: 14px;
        background: rgba(2, 6, 16, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.3);
        border-radius: 14px;
    }
    .how-t {
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1.5px; color: #334155; margin-bottom: 9px;
    }
    .how-list { list-style: none; display: grid; gap: 7px; }
    .how-list li {
        font-size: 12px; line-height: 1.5; color: #94a3b8;
        padding-left: 14px; position: relative;
    }
    .how-list li::before {
        content: ''; position: absolute; left: 0; top: 7px;
        width: 5px; height: 5px; border-radius: 99px; background: var(--acc); opacity: 0.6;
    }
    .how-list b { color: #cbd5e1; font-weight: 900; }

    .meta-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
    .chip {
        font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        padding: 5px 10px; border-radius: 99px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: var(--acc-l);
    }

    .actions { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    .btn {
        font-family: inherit; cursor: pointer; border-radius: 12px;
        font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
        padding: 11px 22px; border: 1px solid transparent;
        transition: transform 0.12s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .btn:focus-visible { outline: 2px solid var(--acc-l); outline-offset: 2px; }
    .ghost { background: rgba(51, 65, 85, 0.4); color: #94a3b8; border-color: rgba(71, 85, 105, 0.4); }
    .ghost:hover { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }
    .go {
        background: linear-gradient(135deg, var(--acc-d) 0%, var(--acc) 100%);
        color: #fff; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.28); flex: 1; min-width: 160px;
    }
    .go:hover { box-shadow: 0 6px 22px rgba(59, 130, 246, 0.45); transform: translateY(-1px); }
    .wide { flex: 1 1 100%; }
    .rm .go:hover, .rm .btn:hover { transform: none; }

    /* ---------- hud ---------- */
    .hud { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .hud-l, .hud-r { display: flex; flex-direction: column; gap: 1px; min-width: 58px; }
    .hud-r { align-items: flex-end; text-align: right; }
    .hud-big { font-size: 18px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .hud-of { font-size: 11px; color: #475569; font-weight: 800; }
    .clock { flex: 1; display: flex; align-items: center; gap: 9px; }
    .clock-bar {
        flex: 1; height: 8px; border-radius: 99px; overflow: hidden;
        background: rgba(2, 6, 16, 0.75); border: 1px solid rgba(51, 65, 85, 0.3);
    }
    .clock-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--acc-d), var(--acc-l)); }
    .clock-fill.low { background: linear-gradient(90deg, #b91c1c, #f87171); }
    .clock-num { font-size: 12px; font-weight: 900; color: var(--acc-l); min-width: 34px; text-align: right; }
    .clock-num.low { color: #f87171; }

    /* ---------- your state ---------- */
    .me {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 9px 12px; margin-bottom: 10px;
        background: rgba(2, 6, 16, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.32);
        border-radius: 14px;
    }
    .me-tag {
        font-size: 9px; font-weight: 900; letter-spacing: 1.4px; color: #0b1220;
        background: var(--acc-l); border-radius: 6px; padding: 3px 7px;
    }
    .me-hp { display: flex; align-items: center; gap: 7px; flex: 1 1 130px; min-width: 120px; }
    .me-hp-bar { flex: 1; height: 9px; border-radius: 99px; background: rgba(2, 6, 16, 0.85); border: 1px solid rgba(51, 65, 85, 0.3); overflow: hidden; }
    .me-hp-fill { height: 100%; border-radius: 99px; }
    .me-hp-num { font-size: 13px; font-weight: 900; min-width: 38px; }
    .me-stat { display: flex; flex-direction: column; gap: 1px; }
    .me-k { font-size: 8px; font-weight: 900; letter-spacing: 1.1px; color: #475569; }
    .me-v { font-size: 11px; font-weight: 900; color: #cbd5e1; }
    .me-v.down { color: #f87171; }
    .me-v.danger { color: #f87171; }
    .me-sub { font-size: 8px; color: #475569; margin-left: 2px; font-weight: 800; }

    .ok { color: #34d399; }
    .warn { color: #fbbf24; }
    .crit { color: #f87171; }
    .me-hp-fill.ok, .t-hp-fill.ok { background: linear-gradient(90deg, #059669, #34d399); }
    .me-hp-fill.warn, .t-hp-fill.warn { background: linear-gradient(90deg, #d97706, #fbbf24); }
    .me-hp-fill.crit, .t-hp-fill.crit { background: linear-gradient(90deg, #b91c1c, #f87171); }

    /* ---------- board ---------- */
    .board { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; align-items: stretch; }
    @media (max-width: 860px) { .board { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 540px) { .board { grid-template-columns: repeat(2, 1fr); gap: 6px; } }

    .tgt {
        font-family: inherit; text-align: left; cursor: pointer;
        display: flex; flex-direction: column; gap: 6px;
        padding: 9px 9px 10px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.4);
        border-radius: 14px;
        transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
    }
    .tgt:hover:not(:disabled) {
        border-color: rgba(59, 130, 246, 0.55);
        background: rgba(23, 34, 58, 0.75);
        transform: translateY(-2px);
    }
    .rm .tgt:hover:not(:disabled) { transform: none; }
    .tgt:focus-visible { outline: 2px solid var(--acc-l); outline-offset: 2px; }
    .tgt:disabled { cursor: default; }
    .tgt.picked { border-color: rgba(148, 163, 184, 0.6); }
    .tgt.best {
        border-color: #34d399;
        background: rgba(16, 185, 129, 0.12);
        box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.35);
    }
    .tgt.wrong {
        border-color: #f87171;
        background: rgba(239, 68, 68, 0.1);
        box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.3);
    }

    .t-head { display: flex; align-items: center; gap: 5px; }
    .t-key {
        font-size: 9px; font-weight: 900; color: #0b1220;
        background: rgba(148, 163, 184, 0.85);
        border-radius: 5px; padding: 2px 5px; line-height: 1.2;
    }
    .t-role { font-size: 8px; font-weight: 900; letter-spacing: 1px; color: #64748b; }
    .r-ADC { color: #eab308; } .r-MID { color: #60a5fa; } .r-TOP { color: #fb923c; }
    .r-JNG { color: #4ade80; } .r-SUP { color: #c084fc; }
    .t-dist { margin-left: auto; font-size: 9px; font-weight: 900; color: #64748b; }
    .d-in { color: #94a3b8; } .d-edge { color: #fbbf24; } .d-out { color: #ef4444; }

    .t-name {
        font-size: 13px; font-weight: 900; color: #e2e8f0; line-height: 1.15;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .t-hp { display: flex; align-items: center; gap: 6px; }
    .t-hp-bar { flex: 1; height: 6px; border-radius: 99px; background: rgba(2, 6, 16, 0.85); overflow: hidden; }
    .t-hp-fill { height: 100%; border-radius: 99px; }
    .t-hp-num { font-size: 11px; font-weight: 900; min-width: 32px; text-align: right; }

    .t-threat { display: flex; align-items: center; gap: 5px; }
    .t-k { font-size: 8px; font-weight: 900; letter-spacing: 0.8px; color: #475569; }
    .pips { flex: 1; display: grid; grid-template-columns: repeat(10, 1fr); gap: 1px; }
    .pip { height: 6px; border-radius: 2px; background: rgba(51, 65, 85, 0.55); display: block; }
    .pip.on { background: var(--acc); }
    .t-thr-num { font-size: 10px; font-weight: 900; color: var(--acc-l); min-width: 12px; text-align: right; }

    .t-status { display: flex; flex-wrap: wrap; gap: 3px; min-height: 15px; }
    .st {
        font-size: 7.5px; font-weight: 900; letter-spacing: 0.6px;
        padding: 2px 5px; border-radius: 5px; line-height: 1.3;
    }
    .st-good { background: rgba(52, 211, 153, 0.14); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.22); }
    .st-bad  { background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.22); }
    .st-null { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.25); }

    /* ---------- disengage ---------- */
    .dis {
        width: 100%; margin-top: 8px; font-family: inherit; cursor: pointer;
        display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
        padding: 10px 12px; text-align: left;
        background: rgba(30, 41, 59, 0.45);
        border: 1px dashed rgba(148, 163, 184, 0.35);
        border-radius: 14px;
        transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
    }
    .dis:hover:not(:disabled) { border-color: rgba(251, 191, 36, 0.6); background: rgba(51, 65, 85, 0.6); transform: translateY(-1px); }
    .rm .dis:hover:not(:disabled) { transform: none; }
    .dis:focus-visible { outline: 2px solid var(--acc-l); outline-offset: 2px; }
    .dis:disabled { cursor: default; }
    .dis.picked { border-style: solid; border-color: rgba(148, 163, 184, 0.6); }
    .dis.best { border-style: solid; border-color: #34d399; background: rgba(16, 185, 129, 0.12); box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.35); }
    .dis.wrong { border-style: solid; border-color: #f87171; background: rgba(239, 68, 68, 0.1); box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.3); }
    .dis-t { font-size: 12px; font-weight: 900; letter-spacing: 1.4px; color: #fbbf24; }
    .dis-s { font-size: 10px; color: #64748b; font-weight: 700; }

    /* ---------- reveal slot ---------- */
    .slot { min-height: 142px; margin-top: 10px; }
    /* ---- scan phase: board readable, targets locked, no clock ---- */
    .scanbox {
        display: flex; align-items: center; justify-content: center;
        gap: 14px; flex-wrap: wrap;
        padding: 10px 14px; border-radius: 12px;
        background: rgba(12, 16, 28, 0.4);
        border: 1px dashed rgba(71, 85, 105, 0.32);
    }
    .scan-lbl {
        font-size: 9px; font-weight: 900; letter-spacing: 2px;
        text-transform: uppercase; color: #475569;
    }
    .scan-go {
        display: inline-flex; align-items: center; gap: 9px;
        padding: 9px 18px; border-radius: 11px;
        border: 1px solid rgba(100, 116, 139, 0.4);
        background: rgba(51, 65, 85, 0.42);
        color: #e2e8f0; font-family: inherit;
        font-size: 11.5px; font-weight: 900;
        letter-spacing: 1.1px; text-transform: uppercase; cursor: pointer;
    }
    .scan-go:hover { background: rgba(71, 85, 105, 0.6); }
    .scan-go:focus-visible { outline: 2px solid #94a3b8; outline-offset: 2px; }
    .scan-kbd {
        font-size: 9px; font-weight: 800; letter-spacing: 1px;
        padding: 3px 8px; border-radius: 6px;
        background: rgba(0, 0, 0, 0.28); color: rgba(226, 232, 240, 0.65);
    }
    .scan-note { font-size: 10.5px; color: #475569; font-weight: 600; text-align: center; }

    .hint {
        font-size: 11px; color: #64748b; text-align: center; padding: 14px 8px; line-height: 1.6;
    }
    .hint b { color: #94a3b8; font-weight: 900; }

    .reveal {
        padding: 10px 12px;
        background: rgba(2, 6, 16, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.35);
        border-radius: 14px;
        display: grid; gap: 6px;
    }
    .rv-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
    .rv-badge {
        font-size: 9px; font-weight: 900; letter-spacing: 1.3px;
        padding: 4px 9px; border-radius: 7px;
    }
    .rv-badge.good { background: rgba(16, 185, 129, 0.16); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
    .rv-badge.mid  { background: rgba(245, 158, 11, 0.14); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
    .rv-badge.bad  { background: rgba(239, 68, 68, 0.14); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .rv-pts { font-size: 13px; font-weight: 900; color: #e2e8f0; }
    .rv-time { font-size: 10px; font-weight: 800; color: #475569; margin-left: auto; }

    .rv-row { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 11px; line-height: 1.5; }
    .rv-rank { font-size: 8px; font-weight: 900; letter-spacing: 1px; color: #475569; min-width: 22px; }
    .rv-name { font-weight: 900; color: #e2e8f0; }
    .rv-pri { font-size: 9px; font-weight: 900; color: #475569; letter-spacing: 0.6px; }
    .rv-why { flex: 1 1 100%; color: #94a3b8; font-size: 11px; }
    .rv-1 .rv-name { color: #34d399; }
    .rv-2 .rv-name { color: #fbbf24; }
    .rv-you .rv-name { color: #f87171; }

    /* ---------- result ---------- */
    .score-wrap { text-align: center; margin: 14px 0 18px; }
    .score { font-size: 58px; font-weight: 900; color: var(--acc-l); line-height: 1; letter-spacing: -2px; }
    .score-pct { font-size: 24px; color: #475569; margin-left: 2px; letter-spacing: 0; }
    .score-lbl {
        font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.6px;
        color: #94a3b8; margin-top: 8px;
    }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; }
    @media (max-width: 760px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 380px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    .cell {
        background: rgba(2, 6, 16, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.3);
        border-radius: 12px; padding: 11px 8px; text-align: center;
        display: flex; flex-direction: column; gap: 3px;
    }
    .cell-v { font-size: 19px; font-weight: 900; color: #e2e8f0; line-height: 1; }
    .cell-v.good { color: #34d399; } .cell-v.mid { color: #fbbf24; } .cell-v.bad { color: #f87171; }
    .cell-of { font-size: 11px; color: #475569; }
    .cell-k { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.9px; color: #475569; }

    .verdict { font-size: 13px; line-height: 1.6; color: #94a3b8; text-align: center; margin-top: 16px; }
    .sub-note { font-size: 11px; color: #475569; text-align: center; margin-top: 6px; font-weight: 700; }
</style>
