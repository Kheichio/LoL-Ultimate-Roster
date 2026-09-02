<script>
    // ===================================================================
    //  LoL ULTIMATE CAREER - match day
    // ===================================================================
    //  The live match takes over the whole shell. Five decisions a game,
    //  each resolved against the player's attributes, with the two running
    //  numbers (team advantage, personal impact) always on screen. Nothing
    //  here simulates anything: match.js owns every rule, this file only
    //  asks it questions and dramatises the answers.
    //  ASCII only - emoji are HTML entities. This repo has been corrupted
    //  by encoding issues before.

    import { onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import {
        career, matchState, careerScreen, careerOverlay, saveCareer,
    } from '../../stores/career.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';
    import { ATTR_BY_KEY, PHASES } from '../../career/constants.js';
    import { fmtGold, fmtFollowers, fmtKDA } from '../../career/ratings.js';
    import {
        EVENTS_PER_GAME, nextEvent, resolveDecision, finishGame,
        isMatchOver, finishMatch, matchRatingLabel, headlineFor,
        draftPending, draftOption, chooseDraft,
    } from '../../career/match.js';
    import { CHAMPION_BY_ID } from '../../career/constants.js';
    import { completeMatch } from '../../career/engine.js';

    // -- tuning mirrors match.js' own clamps -----------------------------
    const ADV_MAX = 70;
    const PER_MAX = 60;

    const PHASE_BY_ID = PHASES.reduce((m, p) => { m[p.id] = p; return m; }, {});
    const DOTS = Array.from({ length: Math.max(1, EVENTS_PER_GAME) }, (_, i) => i);

    const MAGS = {
        great:    { name: 'Great',    color: '#22c55e', rank: 5 },
        good:     { name: 'Good',     color: '#4ade80', rank: 4 },
        ok:       { name: 'OK',       color: '#3b82f6', rank: 3 },
        bad:      { name: 'Bad',      color: '#f97316', rank: 2 },
        disaster: { name: 'Disaster', color: '#ef4444', rank: 1 },
    };
    const MAG_FALLBACK = { name: 'Resolved', color: '#64748b', rank: 3 };

    const GAME_PHASES = {
        early: { name: 'Early Game', color: '#22c55e' },
        mid:   { name: 'Mid Game',   color: '#3b82f6' },
        late:  { name: 'Late Game',  color: '#f59e0b' },
    };

    // -- local state machine ---------------------------------------------
    //  'bench'    - the player is not in the starting five for this one
    //  'decision' - an in-game call is waiting
    //  'outcome'  - the call has resolved, results are landing
    //  'game'     - game-result interstitial
    //  'result'   - the full match result screen
    let stage = 'decision';
    let currentEvent = null, lastOutcome = null, gameCard = null, finalResult = null;
    let pendingInterview = null, milestones = [], floats = [];
    let continueReady = false, busy = false, benchShown = false, interviewOpened = false;
    let decisionsThisGame = 0, lastEventId = null, floatSeq = 0;
    let gameStart = { adv: 0, per: 0, k: 0, d: 0, a: 0, cs: 0 };

    const timers = [];
    function later(fn, ms) {
        const t = setTimeout(() => {
            const i = timers.indexOf(t);
            if (i >= 0) timers.splice(i, 1);
            fn();
        }, ms);
        timers.push(t);
        return t;
    }
    function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }
    onDestroy(clearTimers);

    // -- tiny helpers ----------------------------------------------------
    function num(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
    function firstStr(o, keys) {
        if (!o) return '';
        for (const k of keys) {
            const v = o[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return '';
    }
    function signed(v) { const n = num(v); return (n > 0 ? '+' : '') + Math.round(n); }

    const SLATE = [100, 116, 139], GREEN = [34, 197, 94], RED = [239, 68, 68];
    function meterColor(v, max) {
        const t = Math.max(-1, Math.min(1, num(v) / max));
        const target = t >= 0 ? GREEN : RED;
        const k = Math.min(1, Math.abs(t) * 1.4);
        const c = SLATE.map((s, i) => Math.round(s + (target[i] - s) * k));
        return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    }

    function snap(m) {
        const kda = (m && m.kda) || {};
        return {
            adv: num(m && m.advantage), per: num(m && m.personal),
            k: num(kda.k), d: num(kda.d), a: num(kda.a), cs: num(m && m.cs),
        };
    }

    function difficultyLabel(d) {
        const v = num(d, 0.5);
        if (v < 0.34) return { name: 'Routine', color: '#4ade80' };
        if (v < 0.52) return { name: 'Standard', color: '#3b82f6' };
        if (v < 0.68) return { name: 'Demanding', color: '#f59e0b' };
        return { name: 'Highwire', color: '#ef4444' };
    }

    // Where a pick sits in THIS split's meta. match.js scores it on every call
    // through metaSwing, on a blind pick as well as a counter, so the screen
    // has to name it or the net figure below the card is unexplainable.
    // `meta` is absent on a match object persisted before it existed, hence the
    // numeric default - an undefined must never reach the arithmetic.
    const META_TONES = {
        '1':  { tone: 'strong', label: 'Strong',    color: '#4ade80' },
        '0':  { tone: 'even',   label: 'Contested', color: '#7d93b8' },
        '-1': { tone: 'weak',   label: 'Weak',      color: '#f87171' },
    };
    function metaChip(v) {
        const t = num(v && v.meta, 0);
        const base = META_TONES[String(t > 0 ? 1 : t < 0 ? -1 : 0)];
        const label = firstStr(v, ['metaLabel']) || base.label;
        return { tone: base.tone, color: base.color, label };
    }

    function fmtDuration(mins, secs) {
        const s = Math.max(0, Math.min(59, Math.round(secs)));
        return Math.max(1, Math.round(mins)) + ':' + String(s).padStart(2, '0');
    }

    /** The game object's own duration when it has one, otherwise a stable
     *  number derived from how the game actually went. */
    function deriveDuration(g, pre) {
        const raw = g ? (g.duration ?? g.length ?? g.minutes ?? g.time) : null;
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) {
            if (n > 300) return fmtDuration(Math.floor(n / 60), n % 60);
            return fmtDuration(n, (pre.k * 7 + pre.a * 13) % 60);
        }
        const swing = Math.abs(pre.adv);
        const mins = Math.max(21, Math.min(48, Math.round(37 - swing * 0.11 + (pre.cs % 7) - 3)));
        return fmtDuration(mins, (pre.k * 7 + pre.a * 13 + pre.d * 5) % 60);
    }

    // -- log normalisation -----------------------------------------------
    //  The timeline and decision log are written by match.js; read them
    //  defensively so a shape change never blanks the screen.
    const CALL_KEYS = ['label', 'option', 'optionLabel', 'choice', 'call', 'title'];
    const TEXT_KEYS = ['outcome', 'text', 'result', 'detail', 'line', 'desc', 'body'];
    const MAG_KEYS = ['magnitude', 'mag', 'band', 'grade', 'tier'];

    function normLog(e, i) {
        if (!e) return null;
        if (typeof e === 'string') return { id: 'l' + i, call: '', text: e, mag: null, game: null, prompt: '' };
        const call = firstStr(e, CALL_KEYS);
        const text = firstStr(e, TEXT_KEYS);
        return {
            id: e.id != null ? String(e.id) + '_' + i : 'l' + i,
            call,
            text: text && text !== call ? text : '',
            mag: MAGS[(firstStr(e, MAG_KEYS) || '').toLowerCase()] || null,
            game: Number.isFinite(Number(e.game)) ? Number(e.game) : null,
            prompt: firstStr(e, ['prompt', 'situation', 'event']),
        };
    }
    function normList(arr) { return Array.isArray(arr) ? arr.map(normLog).filter(Boolean) : []; }

    // -- flow ------------------------------------------------------------
    function bail(msg) {
        showToast(msg, 'error');
        matchState.set(null);
        careerScreen.set('hub');
        saveCareer();
    }

    function beginDecision() {
        const m = get(matchState);
        if (!m) return;

        // Being benched is a call for the whole series, not for one game. Show
        // the interstitial once, then resolve every remaining game straight
        // through - match.js scores a benched series as rating 0 / played
        // false, so any decision dealt here would be thrown away anyway.
        if (m.playerPlays === false) {
            if (!benchShown) {
                benchShown = true;
                stage = 'bench';
                return;
            }
            doFinishGame();
            return;
        }
        if (decisionsThisGame >= EVENTS_PER_GAME * 3) { doFinishGame(); return; }

        // Champion select comes before the first decision of every game. An
        // in-progress save from before this existed has no options on its draft,
        // so draftPending is false and the game runs exactly as it used to.
        //
        // Only stop here if the screen would actually have something to show. A
        // draft whose ids no longer resolve would otherwise strand the player on
        // an empty panel with no way out of the match.
        if (draftPending(m)) {
            const pickable = (m.draft.options || []).some(id => {
                try { const v = draftOption(get(career), m, id); return !!(v && v.champion); }
                catch (err) { return false; }
            });
            if (pickable) { stage = 'draft'; return; }
        }

        let ev = null;
        try { ev = nextEvent(m); } catch (err) { ev = null; }

        if (!ev || !Array.isArray(ev.options) || ev.options.length === 0) { doFinishGame(); return; }
        if (ev.id && ev.id === lastEventId) { doFinishGame(); return; }

        currentEvent = ev;
        lastOutcome = null;
        continueReady = false;
        stage = 'decision';
    }

    // -- champion select -------------------------------------------------
    $: draftViews = (stage === 'draft' && m && m.draft && Array.isArray(m.draft.options))
        ? m.draft.options
            .map(id => { try { return draftOption($career, m, id); } catch (err) { return null; } })
            .filter(v => v && v.champion)
        : [];
    $: enemyChamp = (m && m.draft && m.draft.enemyId) ? (CHAMPION_BY_ID[m.draft.enemyId] || null) : null;
    $: isCounterPick = !!(m && m.draft && m.draft.counter);

    function pickChampion(id) {
        if (stage !== 'draft' || busy) return;
        const cur = get(matchState);
        if (!cur) return;
        busy = true;
        playSound('click');
        try {
            matchState.set(chooseDraft(cur, id));
        } catch (err) { /* fall through - beginDecision will re-check */ }
        busy = false;
        beginDecision();
    }

    function choose(optionId) {
        if (stage !== 'decision' || busy) return;
        busy = true;
        playSound('click');

        const c = get(career);
        const m = get(matchState);
        const before = snap(m);
        let res = null;
        try { res = resolveDecision(c, m, optionId); } catch (err) { res = null; }

        if (!res) {
            busy = false;
            bail('That call could not be resolved. Match abandoned.');
            return;
        }

        const nm = res.match || m;
        matchState.set(nm);
        const after = snap(nm);

        lastEventId = currentEvent && currentEvent.id ? currentEvent.id : null;
        decisionsThisGame += 1;
        lastOutcome = buildOutcome(res.outcome, before, after, optionId);
        spawnFloats(lastOutcome.deltas);

        if (lastOutcome.mag.rank >= 4) playSound('win');
        else if (lastOutcome.mag.rank <= 1) playSound('lose');

        stage = 'outcome';
        continueReady = false;
        later(() => { continueReady = true; }, 780);
        saveCareer();
        busy = false;
    }

    function buildOutcome(o, before, after, optionId) {
        const dAdv = after.adv - before.adv;
        let mag = MAGS[(firstStr(o, MAG_KEYS) || '').toLowerCase()];
        if (!mag) {
            if (dAdv >= 8) mag = MAGS.great;
            else if (dAdv > 1) mag = MAGS.good;
            else if (dAdv >= -1) mag = MAGS.ok;
            else if (dAdv > -8) mag = MAGS.bad;
            else mag = MAGS.disaster;
        }
        if (!mag) mag = MAG_FALLBACK;

        const opt = currentEvent && Array.isArray(currentEvent.options)
            ? currentEvent.options.find(x => x.id === optionId) : null;

        const deltas = [];
        const push = (label, value, kind) => {
            if (Math.abs(value) < 0.5) return;
            deltas.push({ label, value: Math.round(value), kind });
        };
        push('ADV', dAdv, 'good');
        push('IMPACT', after.per - before.per, 'good');
        push('K', after.k - before.k, 'good');
        push('D', after.d - before.d, 'bad');
        push('A', after.a - before.a, 'good');
        push('CS', after.cs - before.cs, 'neutral');

        return {
            id: 'o' + (++floatSeq),
            text: firstStr(o, ['text', 'outcome', 'line', 'detail', 'desc', 'body'])
                || (mag.rank >= 4 ? 'It works.' : mag.rank <= 2 ? 'It does not work.' : 'It more or less holds.'),
            title: firstStr(o, ['title', 'headline']) || (opt ? opt.label : ''),
            success: typeof (o && o.success) === 'boolean' ? o.success : mag.rank >= 3,
            mag,
            deltas,
        };
    }

    function spawnFloats(deltas) {
        if (!Array.isArray(deltas) || !deltas.length) return;
        const batch = deltas.map((d, i) => ({
            id: 'f' + (++floatSeq),
            label: d.label,
            text: signed(d.value),
            color: d.kind === 'neutral'
                ? '#94a3b8'
                : d.kind === 'bad'
                    ? (d.value > 0 ? '#ef4444' : '#22c55e')
                    : (d.value > 0 ? '#22c55e' : '#ef4444'),
            offset: i,
        }));
        floats = [...floats, ...batch];
        const ids = new Set(batch.map(b => b.id));
        later(() => { floats = floats.filter(f => !ids.has(f.id)); }, 1500);
    }

    function continueFromOutcome() {
        if (!continueReady) return;
        playSound('click');
        beginDecision();
    }

    function doFinishGame() {
        const c = get(career);
        const m = get(matchState);
        if (!m) return;

        const pre = snap(m);
        const playedGameNo = Math.max(1, num(m.game, 1));
        const preSeries = Array.isArray(m.seriesScore) ? [num(m.seriesScore[0]), num(m.seriesScore[1])] : [0, 0];
        let out = null;
        try { out = finishGame(c, m); } catch (err) { out = null; }

        const nm = (out && out.match) || m;
        matchState.set(nm);

        const g = (out && out.game) || null;
        const series = Array.isArray(nm.seriesScore) ? [num(nm.seriesScore[0]), num(nm.seriesScore[1])] : preSeries;
        const wonRaw = g ? (g.won ?? g.win ?? g.victory) : undefined;
        const won = typeof wonRaw === 'boolean'
            ? wonRaw
            : (series[0] > preSeries[0] || (series[1] === preSeries[1] && num(nm.advantage) >= 0));

        const line = g && g.kda && Number.isFinite(Number(g.kda.k))
            ? { k: num(g.kda.k), d: num(g.kda.d), a: num(g.kda.a) }
            : { k: Math.max(0, pre.k - gameStart.k), d: Math.max(0, pre.d - gameStart.d), a: Math.max(0, pre.a - gameStart.a) };
        const cs = g && Number.isFinite(Number(g.cs))
            ? num(g.cs)
            : Math.max(0, pre.cs - gameStart.cs);

        gameCard = {
            won,
            duration: deriveDuration(g, pre),
            kda: line,
            kdaLine: fmtKDA(line.k, line.d, line.a),
            cs,
            rating: g && Number.isFinite(Number(g.rating)) ? Number(g.rating) : null,
            number: playedGameNo,
            series,
            over: safeOver(nm),
        };

        decisionsThisGame = 0;
        lastEventId = null;
        gameStart = snap(nm);
        continueReady = false;
        stage = 'game';
        playSound(won ? 'win' : 'lose');
        later(() => { continueReady = true; }, 620);
        saveCareer();
    }

    function safeOver(m) {
        try { return !!isMatchOver(m); } catch (err) { return !!(m && m.done); }
    }

    function continueFromGame() {
        if (!continueReady) return;
        playSound('click');
        const m = get(matchState);
        if (!m) return;
        if (safeOver(m)) doFinishMatch();
        else beginDecision();
    }

    function doFinishMatch() {
        const c = get(career);
        const m = get(matchState);
        if (!m) return;

        let result = null;
        try { result = finishMatch(c, m); } catch (err) { result = null; }
        if (!result) { bail('The match result could not be recorded.'); return; }

        let done = null;
        try { done = completeMatch(result); } catch (err) { done = null; }

        finalResult = (done && done.result) || result;
        pendingInterview = (done && done.interview) || null;
        milestones = (done && Array.isArray(done.milestones)) ? done.milestones : [];

        stage = 'result';
        continueReady = true;
        playSound(finalResult.won ? 'win' : 'lose');
        if (milestones.length) later(() => playSound('rare'), 700);
        saveCareer();
    }

    function primaryAction() {
        if (stage === 'bench') { playSound('click'); doFinishGame(); return; }
        if (stage === 'outcome') { continueFromOutcome(); return; }
        if (stage === 'game') { continueFromGame(); return; }
        if (stage === 'result') { leaveResult(); return; }
    }

    function leaveResult() {
        playSound('click');
        if (pendingInterview && !interviewOpened) {
            interviewOpened = true;
            careerOverlay.set({ kind: 'interview', payload: pendingInterview });
            return;
        }
        clearTimers();
        matchState.set(null);
        careerOverlay.set(null);
        careerScreen.set('hub');
        saveCareer();
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    // Once the press conference overlay has been dealt with, the button on
    // the result screen turns back into the way out.
    $: if (interviewOpened && !$careerOverlay && pendingInterview) pendingInterview = null;

    function onKey(e) {
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return;

        if (stage === 'decision' && currentEvent && Array.isArray(currentEvent.options)) {
            const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
            if (idx >= 0 && idx < currentEvent.options.length) {
                e.preventDefault();
                choose(currentEvent.options[idx].id);
                return;
            }
        }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            if (stage === 'decision') return;
            e.preventDefault();
            primaryAction();
        }
    }

    // Hydrate synchronously so the first paint already shows the opening
    // decision instead of flashing an in-between panel.
    (function boot() {
        const m0 = get(matchState);
        if (!m0) return;
        gameStart = snap(m0);
        if (m0.done && safeOver(m0)) doFinishMatch();
        else beginDecision();
    })();

    // -- derived view data -----------------------------------------------
    $: m = $matchState;
    $: pl = $career.player;
    $: myAccent = (m && m.myAccent) || '#a78bfa';
    $: oppAccent = (m && m.opponentAccent) || '#64748b';
    $: phaseDef = m ? (PHASE_BY_ID[m.phase] || null) : null;
    $: phaseAccent = phaseDef ? phaseDef.accent : '#a78bfa';
    $: series = m && Array.isArray(m.seriesScore) ? m.seriesScore : [0, 0];
    $: bestOf = m ? Math.max(1, num(m.bestOf, 1)) : 1;
    $: gameNo = m ? Math.max(1, num(m.game, 1)) : 1;
    $: liveKDA = m ? fmtKDA(num(m.kda && m.kda.k), num(m.kda && m.kda.d), num(m.kda && m.kda.a)) : fmtKDA(0, 0, 0);
    // The two headline meters. Both are centre-anchored: the bar grows out
    // from the middle, red one way and green the other.
    $: meterRows = m ? [
        { key: 'adv', label: 'Advantage', value: num(m.advantage), max: ADV_MAX,
          color: meterColor(m.advantage, ADV_MAX), foot: 'How the game is going because of you' },
        { key: 'per', label: 'Personal', value: num(m.personal), max: PER_MAX,
          color: meterColor(m.personal, PER_MAX), foot: "Your own line, before the team's" },
    ].map(r => ({ ...r, pct: Math.min(100, (Math.abs(r.value) / r.max) * 100) })) : [];
    $: timeline = m ? normList(m.timeline) : [];
    // The strip above the meters, showing what is actually locked in for this
    // game. It used to report the old signature/pocket/off-script ROLL, which
    // stopped being the interesting fact the moment champion select became a
    // choice - the player already knows how the draft went, because they just
    // made it. What they need on screen while deciding is the pick, how well
    // they know it, and what it is up against.
    //
    // Only shown once champion select has been answered. A benched game has no
    // draft, and a match already in progress from before champion select
    // existed has no `picked`, so both correctly show nothing.
    $: lockedIn = (() => {
        if (!m || !m.draft || !m.draft.picked) return null;
        let view = null;
        try { view = draftOption($career, m, m.draft.picked); } catch (err) { view = null; }
        if (!view || !view.champion) return null;
        return {
            ...view,
            // Named apart from view.meta, which is the raw -1/0/1 tier.
            metaTag: metaChip(view),
            enemy: m.draft.counter ? (CHAMPION_BY_ID[m.draft.enemyId] || null) : null,
        };
    })();
    $: evPhase = currentEvent ? (GAME_PHASES[currentEvent.phase] || GAME_PHASES.mid) : GAME_PHASES.mid;

    $: ratingBadge = finalResult && Number.isFinite(Number(finalResult.rating))
        ? safeRatingLabel(finalResult.rating)
        : null;
    function safeRatingLabel(r) {
        try { return matchRatingLabel(r); } catch (err) { return { label: 'Rated', color: '#94a3b8' }; }
    }
    $: resultHeadline = finalResult
        ? (finalResult.headline || safeHeadline(finalResult))
        : '';
    function safeHeadline(r) {
        try { return headlineFor(r) || ''; } catch (err) { return ''; }
    }
    $: resultKDA = finalResult && finalResult.kda
        ? fmtKDA(num(finalResult.kda.k), num(finalResult.kda.d), num(finalResult.kda.a))
        : fmtKDA(0, 0, 0);
    $: decisionLog = finalResult ? normList(finalResult.decisionLog) : [];
    $: rewards = finalResult ? buildRewards(finalResult) : [];

    function buildRewards(r) {
        const rows = [];
        const gold = num(r.goldDelta);
        if (gold) rows.push({ key: 'gold', label: 'Gold', text: (gold > 0 ? '+' : '-') + fmtGold(Math.abs(gold)), good: gold > 0, icon: '\u{1F4B0}' });
        const foll = num(r.hypeDelta);
        if (foll) rows.push({ key: 'foll', label: 'Followers', text: (foll > 0 ? '+' : '-') + fmtFollowers(Math.abs(foll)), good: foll > 0, icon: '\u{1F464}' });
        const form = num(r.formDelta);
        if (form) rows.push({ key: 'form', label: 'Form', text: signed(form), good: form > 0, icon: '\u{1F4C8}' });
        const mor = num(r.moraleDelta);
        const notes = moraleNotes(r);
        // The net figure stays the headline - it is the truth. The notes only
        // say which of the penalties inside it actually fired.
        if (mor || notes.length) {
            // A net of exactly 0 with notes attached is a wash, not a loss, so
            // it must not paint the row red.
            rows.push({ key: 'mor', label: 'Morale', text: signed(mor), good: mor >= 0, icon: '\u{1F642}', notes });
        }
        const cp = num(r.champPoints);
        if (cp) rows.push({ key: 'cp', label: 'Champ Points', text: signed(cp), good: cp > 0, icon: '\u{1F3C6}' });
        return rows;
    }

    /** The breakdown behind the single net Morale number. finishMatch writes
     *  ready-to-print sentences; a result persisted before it did has none. */
    function moraleNotes(r) {
        const list = r && Array.isArray(r.moraleNotes) ? r.moraleNotes : [];
        return list
            .filter(n => typeof n === 'string' && n.trim())
            .map(n => n.trim());
    }

    function attrChip(key) {
        const def = ATTR_BY_KEY[key];
        const val = Math.round(num(pl && pl.attrs && pl.attrs[key]));
        return {
            abbr: def ? def.abbr : String(key || '').toUpperCase(),
            name: def ? def.name : String(key || ''),
            color: def ? def.color : '#94a3b8',
            value: val,
        };
    }
</script>

<svelte:window on:keydown={onKey} />

{#if m}
<section
    class="md"
    style="--my:{myAccent}; --opp:{oppAccent}; --ph:{phaseAccent}"
>
    <!-- ============== SCOREBOARD ============== -->
    <header class="md-head">
        <div class="md-head-in">
            <div class="score-row">
                <div class="team team-my">
                    <span class="team-tag">You</span>
                    <span class="team-name">{m.myTeamName || 'Your Team'}</span>
                </div>

                <div class="score">
                    <span class="s-num s-my">{num(series[0])}</span>
                    <span class="s-sep">&ndash;</span>
                    <span class="s-num s-opp">{num(series[1])}</span>
                </div>

                <div class="team team-opp">
                    <span class="team-tag">Them</span>
                    <span class="team-name">{m.opponentName || 'Opponent'}</span>
                </div>
            </div>

            <div class="ctx">
                <span class="ctx-game">Game {gameNo} of {bestOf}</span>
                <span class="ctx-dot">&middot;</span>
                <span class="ctx-phase">{phaseDef ? phaseDef.name : 'Exhibition'}</span>
                {#if m.label}
                    <span class="ctx-dot">&middot;</span>
                    <span class="ctx-label">{m.label}</span>
                {/if}
            </div>

            {#if lockedIn}
                <div class="draft" style="--dr:{lockedIn.band.color}">
                    <span class="dr-tag">{lockedIn.isSignature ? 'Signature' : 'Locked in'}</span>
                    <span class="dr-pick">{lockedIn.champion.name}</span>
                    <span class="dr-meta">
                        {lockedIn.champion.archetype}
                        <span class="dr-dot">&#183;</span>
                        <span style="color:{lockedIn.band.color}">{lockedIn.band.name}</span>
                        <span class="dr-dot">&#183;</span>
                        <span style="color:{lockedIn.metaTag.color}">{lockedIn.metaTag.label} meta</span>
                        <span class="dr-dot">&#183;</span>
                        {lockedIn.games} {lockedIn.games === 1 ? 'game' : 'games'}
                    </span>
                    {#if lockedIn.enemy}
                        <span class="dr-vs">
                            into {lockedIn.enemy.name}
                            <b class="dr-{lockedIn.matchupLabel.tone}">{lockedIn.matchupLabel.text}</b>
                        </span>
                    {:else}
                        <span class="dr-vs dr-flat">Blind pick</span>
                    {/if}
                </div>
            {/if}

            <!-- Meters -->
            <div class="meters">
                {#each meterRows as mr (mr.key)}
                    <div class="meter">
                        <div class="mt-top">
                            <span class="mt-lbl">{mr.label}</span>
                            <span class="mt-val" style="color:{mr.color}">{signed(mr.value)}</span>
                        </div>
                        <div class="mt-bar" role="img" aria-label="{mr.label} {signed(mr.value)} out of {mr.max}">
                            <span class="mt-zero"></span>
                            {#if mr.value >= 0}
                                <span class="mt-fill" style="left:50%; width:{mr.pct / 2}%; background:{mr.color}"></span>
                            {:else}
                                <span class="mt-fill" style="right:50%; width:{mr.pct / 2}%; background:{mr.color}"></span>
                            {/if}
                        </div>
                        <div class="mt-foot">{mr.foot}</div>
                    </div>
                {/each}

                <div class="statline">
                    <div class="sl-cell">
                        <span class="sl-lbl">KDA</span>
                        <span class="sl-val">{liveKDA.line}</span>
                    </div>
                    <div class="sl-cell">
                        <span class="sl-lbl">Ratio</span>
                        <span class="sl-val sl-dim">{liveKDA.ratio.toFixed(2)}</span>
                    </div>
                    <div class="sl-cell">
                        <span class="sl-lbl">CS</span>
                        <span class="sl-val">{Math.round(num(m.cs))}</span>
                    </div>

                    <div class="floats" aria-hidden="true">
                        {#each floats as f (f.id)}
                            <span class="float" style="color:{f.color}; --d:{f.offset * 60}ms">
                                {f.text}<em>{f.label}</em>
                            </span>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    </header>

    {#if stage === 'result' && finalResult}
        <!-- ============== MATCH RESULT ============== -->
        <main class="md-result">
            <div class="rs-hero" class:rs-won={finalResult.won} class:rs-lost={!finalResult.won}>
                <div class="rs-verdict">{finalResult.won ? 'Victory' : 'Defeat'}</div>
                <div class="rs-score">
                    <span class="rs-team">{finalResult.myTeamName || m.myTeamName || 'Your Team'}</span>
                    <span class="rs-nums">
                        <span class="rs-n rs-n-my">{num(finalResult.score && finalResult.score[0])}</span>
                        <span class="rs-dash">&ndash;</span>
                        <span class="rs-n rs-n-opp">{num(finalResult.score && finalResult.score[1])}</span>
                    </span>
                    <span class="rs-team rs-team-opp">{finalResult.opponentName || m.opponentName || 'Opponent'}</span>
                </div>
                {#if resultHeadline}
                    <p class="rs-headline">&ldquo;{resultHeadline}&rdquo;</p>
                {/if}
                {#if finalResult.mvp}
                    <div class="rs-mvp">
                        <span class="rs-mvp-star" aria-hidden="true">&#x2B50;</span>
                        <span class="rs-mvp-t">Player of the Series</span>
                    </div>
                {/if}
            </div>

            <div class="rs-grid">
                <div class="rs-col">
                    <div class="side-label">Your Match</div>
                    {#if finalResult.played === false}
                        <div class="rs-bench">
                            <div class="rs-bench-h">You did not play</div>
                            <p class="rs-bench-p">{finalResult.benchReason || m.benchReason || 'The coach went with somebody else this week. Train, take care of your condition, and force the decision.'}</p>
                        </div>
                    {:else}
                        <div class="rs-stats">
                            <div class="rs-stat">
                                <span class="rs-s-val">{resultKDA.line}</span>
                                <span class="rs-s-lbl">K / D / A</span>
                            </div>
                            <div class="rs-stat">
                                <span class="rs-s-val">{resultKDA.ratio.toFixed(2)}</span>
                                <span class="rs-s-lbl">KDA Ratio</span>
                            </div>
                            <div class="rs-stat">
                                <span class="rs-s-val">{Math.round(num(finalResult.cs))}</span>
                                <span class="rs-s-lbl">CS</span>
                            </div>
                            {#if ratingBadge}
                                <div class="rs-stat rs-stat-rating" style="--rt:{ratingBadge.color}">
                                    <span class="rs-s-val" style="color:{ratingBadge.color}">{num(finalResult.rating).toFixed(1)}</span>
                                    <span class="rs-s-lbl" style="color:{ratingBadge.color}">{ratingBadge.label}</span>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <div class="side-label sl-gap">Rewards</div>
                    {#if rewards.length}
                        <div class="rw-list">
                            {#each rewards as r (r.key)}
                                <div class="rw" class:rw-bad={!r.good}>
                                    <span class="rw-top">
                                        <span class="rw-ico" aria-hidden="true">{r.icon}</span>
                                        <span class="rw-lbl">{r.label}</span>
                                        <span class="rw-val">{r.text}</span>
                                    </span>
                                    {#if Array.isArray(r.notes) && r.notes.length}
                                        <span class="rw-notes">
                                            {#each r.notes as n, i (n + '_' + i)}
                                                <span class="rw-note">{n}</span>
                                            {/each}
                                        </span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="empty-line">No payout from this one. Exhibition games do not move the needle.</p>
                    {/if}

                    {#if milestones.length}
                        <div class="side-label sl-gap">Milestones</div>
                        <div class="ms-list">
                            {#each milestones as ms, i (ms.id || i)}
                                <div class="ms">
                                    <span class="ms-ico" aria-hidden="true">&#x1F3C5;</span>
                                    <span class="ms-t">{ms.name || ms.label || ms.id}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="rs-col">
                    <div class="side-label">Every Call You Made</div>
                    {#if decisionLog.length}
                        <ol class="dl">
                            {#each decisionLog as d, i (d.id)}
                                <li class="dl-row" style="--mg:{d.mag ? d.mag.color : '#475569'}">
                                    <span class="dl-n">{i + 1}</span>
                                    <div class="dl-body">
                                        {#if d.prompt}<div class="dl-prompt">{d.prompt}</div>{/if}
                                        {#if d.call}<div class="dl-call">{d.call}</div>{/if}
                                        {#if d.text}<div class="dl-text">{d.text}</div>{/if}
                                    </div>
                                    {#if d.mag}
                                        <span class="dl-mag" style="color:{d.mag.color}">{d.mag.name}</span>
                                    {/if}
                                </li>
                            {/each}
                        </ol>
                    {:else}
                        <p class="empty-line">No decisions to review &mdash; you watched this one from the bench.</p>
                    {/if}
                </div>
            </div>

            <div class="rs-actions">
                {#if pendingInterview}
                    <button class="btn-primary big-btn" on:click={leaveResult}>Face the Press</button>
                    <p class="rs-hint">The press are waiting outside. Enter or Space.</p>
                {:else}
                    <button class="btn-primary big-btn" on:click={leaveResult}>Back to Hub</button>
                    <p class="rs-hint">Enter or Space.</p>
                {/if}
            </div>
        </main>

    {:else}
        <!-- ============== LIVE BODY ============== -->
        <div class="md-body">
            <main class="md-main">
                {#if stage === 'bench'}
                    <div class="panel-c bench">
                        <div class="bench-ico" aria-hidden="true">&#x1F4BA;</div>
                        <h2 class="bench-h">You are on the bench</h2>
                        <p class="bench-p">{m.benchReason || 'The coach went with somebody else for this series. You are on the stage, in the jersey, watching it happen without you.'}</p>
                        <button class="btn-secondary big-btn" on:click={primaryAction}>Watch it play out</button>
                    </div>

                {:else if stage === 'draft'}
                    <!-- Champion select. Three picks, one click, no confirm -
                         this runs before every game and a Bo5 is five of them,
                         so it cannot become a screen you have to read twice. -->
                    <div class="cs">
                        <div class="cs-head">
                            <span class="cs-tag" class:cs-tag-counter={isCounterPick}>
                                {isCounterPick ? 'Counter pick' : 'Blind pick'}
                            </span>
                            <span class="cs-sub">
                                {#if isCounterPick && enemyChamp}
                                    They locked {enemyChamp.name}. You pick last.
                                {:else}
                                    You pick first. You will not see theirs until it is too late to change.
                                {/if}
                            </span>
                        </div>

                        <div class="cs-grid">
                            {#each draftViews as v (v.id)}
                                {@const mc = metaChip(v)}
                                {@const swing = num(v.matchupSwing) + num(v.proficiencySwing) + num(v.metaSwing)}
                                <button class="cs-opt" on:click={() => pickChampion(v.id)} disabled={busy}>
                                    <span class="cs-top">
                                        <span class="cs-name">{v.champion.name}</span>
                                        {#if v.isSignature}<span class="cs-sig">Signature</span>{/if}
                                        <span
                                            class="cs-meta"
                                            style="--mc:{mc.color}"
                                            title="Where this pick sits in this split's meta"
                                        >{mc.label} meta</span>
                                    </span>
                                    <span class="cs-arch">{v.champion.archetype}</span>

                                    <span class="cs-row">
                                        <span class="cs-lbl">Proficiency</span>
                                        <span class="cs-val" style="color:{v.band.color}">{v.band.name}</span>
                                    </span>
                                    <span class="cs-bar" aria-hidden="true">
                                        <span class="cs-fill" style="width:{Math.round(v.proficiency * 100)}%; background:{v.band.color}"></span>
                                    </span>
                                    <span class="cs-games">{v.games} {v.games === 1 ? 'game' : 'games'} played</span>

                                    {#if isCounterPick && enemyChamp}
                                        <span class="cs-row">
                                            <span class="cs-lbl">Into {enemyChamp.name}</span>
                                            <span class="cs-val cs-{v.matchupLabel.tone}">{v.matchupLabel.text}</span>
                                        </span>
                                    {/if}

                                    <span class="cs-net" class:cs-good={swing > 0.005} class:cs-bad={swing < -0.005}>
                                        {swing >= 0 ? '+' : ''}{(swing * 100).toFixed(1)}% on every call this game
                                    </span>
                                </button>
                            {:else}
                                <p class="cs-empty">Champion select produced nothing pickable. Playing your signature.</p>
                            {/each}
                        </div>
                    </div>

                {:else if stage === 'decision' && currentEvent}
                    <div class="dec">
                        <div class="dec-head">
                            <span class="dec-phase" style="--gp:{evPhase.color}">{evPhase.name}</span>
                            <span class="dec-dots" role="img" aria-label="Decision {Math.min(decisionsThisGame + 1, EVENTS_PER_GAME)} of {EVENTS_PER_GAME}">
                                {#each DOTS as i (i)}
                                    <span class="dot" class:dot-on={i < decisionsThisGame} class:dot-now={i === decisionsThisGame}></span>
                                {/each}
                            </span>
                        </div>

                        <h2 class="dec-prompt">{currentEvent.prompt}</h2>
                        {#if currentEvent.flavor}
                            <p class="dec-flavor">{currentEvent.flavor}</p>
                        {/if}

                        <div class="opts" role="group" aria-label="Your options">
                            {#each currentEvent.options as o, i (o.id + '_' + i)}
                                {@const diff = difficultyLabel(o.difficulty)}
                                <button class="opt" on:click={() => choose(o.id)} disabled={busy}>
                                    <span class="opt-key" aria-hidden="true">{i + 1}</span>
                                    <span class="opt-body">
                                        <span class="opt-label">{o.label}</span>
                                        {#if o.desc}
                                            <span class="opt-desc">{o.desc}</span>
                                        {/if}
                                        <span class="opt-chips">
                                            {#each (Array.isArray(o.attrs) ? o.attrs : []) as k}
                                                {@const chip = attrChip(k)}
                                                <span class="chip" style="--ac:{chip.color}" title="{chip.name}: {chip.value}">
                                                    <span class="chip-a">{chip.abbr}</span>
                                                    <span class="chip-v">{chip.value}</span>
                                                </span>
                                            {/each}
                                            <span class="chip chip-diff" style="--ac:{diff.color}" title="How hard this call is to execute">
                                                <span class="chip-a">{diff.name}</span>
                                            </span>
                                        </span>
                                    </span>
                                </button>
                            {/each}
                        </div>
                        <p class="dec-hint">Press <kbd>1</kbd>&ndash;<kbd>{Math.min(currentEvent.options.length, 5)}</kbd> to call it.</p>
                    </div>

                {:else if stage === 'outcome' && lastOutcome}
                    {#key lastOutcome.id}
                        <div class="oc" style="--mg:{lastOutcome.mag.color}">
                            <div class="oc-band">
                                <span class="oc-band-t">{lastOutcome.mag.name}</span>
                            </div>
                            {#if lastOutcome.title}
                                <div class="oc-call">{lastOutcome.title}</div>
                            {/if}
                            <p class="oc-text">{lastOutcome.text}</p>

                            {#if lastOutcome.deltas.length}
                                <div class="oc-deltas">
                                    {#each lastOutcome.deltas as d, i (d.label + i)}
                                        <span
                                            class="od"
                                            class:od-up={d.kind === 'bad' ? d.value < 0 : d.value > 0}
                                            class:od-down={d.kind === 'bad' ? d.value > 0 : d.value < 0}
                                            class:od-flat={d.kind === 'neutral'}
                                            style="--i:{i}"
                                        >
                                            <span class="od-v">{signed(d.value)}</span>
                                            <span class="od-l">{d.label}</span>
                                        </span>
                                    {/each}
                                </div>
                            {/if}

                            <button class="btn-primary big-btn oc-btn" class:oc-btn-ready={continueReady} on:click={primaryAction} disabled={!continueReady}>
                                {continueReady ? 'Continue' : 'Playing on...'}
                            </button>
                        </div>
                    {/key}

                {:else if stage === 'game' && gameCard}
                    {#key gameCard.number + '_' + gameCard.series.join('-')}
                        <div class="gc" class:gc-won={gameCard.won}>
                            <div class="gc-tag">Game {gameCard.number} &middot; {gameCard.duration}</div>
                            <div class="gc-verdict">{gameCard.won ? 'Game Won' : 'Game Lost'}</div>
                            <div class="gc-series">
                                <span class="gc-s gc-s-my">{num(gameCard.series[0])}</span>
                                <span class="gc-s-sep">&ndash;</span>
                                <span class="gc-s gc-s-opp">{num(gameCard.series[1])}</span>
                            </div>
                            <div class="gc-line">
                                <div class="gc-cell">
                                    <span class="gc-v">{gameCard.kdaLine.line}</span>
                                    <span class="gc-l">Your Line</span>
                                </div>
                                <div class="gc-cell">
                                    <span class="gc-v">{gameCard.kdaLine.ratio.toFixed(2)}</span>
                                    <span class="gc-l">KDA</span>
                                </div>
                                <div class="gc-cell">
                                    <span class="gc-v">{Math.round(gameCard.cs)}</span>
                                    <span class="gc-l">CS</span>
                                </div>
                                {#if gameCard.rating !== null}
                                    <div class="gc-cell">
                                        <span class="gc-v">{gameCard.rating.toFixed(1)}</span>
                                        <span class="gc-l">Rating</span>
                                    </div>
                                {/if}
                            </div>
                            <button class="btn-primary big-btn" on:click={primaryAction} disabled={!continueReady}>
                                {gameCard.over ? 'See the result' : 'Next game'}
                            </button>
                        </div>
                    {/key}

                {:else}
                    <div class="panel-c bench">
                        <div class="bench-ico" aria-hidden="true">&#x1F3AE;</div>
                        <h2 class="bench-h">Between games</h2>
                        <p class="bench-p">The series is being set up. Give it a moment.</p>
                        <button class="btn-secondary big-btn" on:click={() => { continueReady = true; beginDecision(); }}>Continue</button>
                    </div>
                {/if}
            </main>

            <!-- ============== TIMELINE ============== -->
            <aside class="md-side" aria-label="Match timeline">
                <div class="side-label">Timeline</div>
                {#if timeline.length}
                    <ol class="tl">
                        {#each timeline as t, i (t.id)}
                            <li class="tl-row" style="--mg:{t.mag ? t.mag.color : '#475569'}">
                                <span class="tl-pip"></span>
                                <div class="tl-body">
                                    <div class="tl-top">
                                        {#if t.game !== null}<span class="tl-g">G{t.game}</span>{/if}
                                        <span class="tl-call">{t.call || t.text || 'Decision'}</span>
                                    </div>
                                    {#if t.call && t.text}<div class="tl-text">{t.text}</div>{/if}
                                    {#if t.mag}<span class="tl-mag" style="color:{t.mag.color}">{t.mag.name}</span>{/if}
                                </div>
                            </li>
                        {/each}
                    </ol>
                {:else}
                    <p class="empty-line">Nothing has happened yet. Every call you make in this game shows up here.</p>
                {/if}
            </aside>
        </div>
    {/if}
</section>
{/if}

<style>
    .md { display: flex; flex-direction: column; flex: 1; width: 100%; min-height: 100%; }
    .side-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #334155; margin-bottom: 10px; }
    .sl-gap { margin-top: 22px; }
    .empty-line { font-size: 12px; line-height: 1.6; color: #475569; padding: 14px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px dashed rgba(51,65,85,0.3); }
    .big-btn { width: 100%; max-width: 340px; padding: 13px 24px; font-size: 12px; }

    /* =========== SCOREBOARD =========== */
    .md-head {
        position: sticky; top: 0; z-index: 30;
        background: rgba(6,9,17,0.94);
        backdrop-filter: blur(14px) saturate(160%);
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        border-bottom: 1px solid rgba(51,65,85,0.28);
    }
    .md-head-in { max-width: 1180px; margin: 0 auto; padding: 16px 20px 14px; }
    .score-row { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; gap: 16px; }
    .team { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .team-my { align-items: flex-end; text-align: right; }
    .team-opp { align-items: flex-start; text-align: left; }
    .team-tag { font-size: 8px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #3f5069; }
    .team-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .team-my .team-name { color: var(--my); }
    .team-opp .team-name { color: var(--opp); }
    .score { display: flex; align-items: center; gap: 10px; }
    .s-num { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 42px; font-weight: 800; line-height: 1; }
    .s-my { color: var(--my); }
    .s-opp { color: var(--opp); }
    .s-sep { font-size: 22px; font-weight: 700; color: #2c3a52; }

    .ctx {
        display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
        gap: 7px; margin-top: 8px;
        font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;
    }
    .ctx-game { color: #64748b; }
    .ctx-phase { color: var(--ph); }
    .ctx-label { color: #4a5b76; letter-spacing: 0.4px; text-transform: none; font-weight: 700; }
    .ctx-dot { color: #23304a; }

    /* Champion select, one line, colour-coded by how it went. Green means the
       comfort bonus is live this game; red means you are on something you do
       not know and every decision is fractionally harder. */
    .draft {
        display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
        gap: 8px; margin: 10px auto 0; max-width: 560px;
        padding: 7px 12px; border-radius: 10px;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.3);
        border-left: 2px solid var(--dr);
    }
    .dr-tag {
        font-size: 8.5px; font-weight: 900; letter-spacing: 1.3px; text-transform: uppercase;
        color: #3f5069; flex: 0 0 auto;
    }
    .dr-pick { font-size: 12px; font-weight: 800; color: #e8eefb; flex: 0 0 auto; }
    .dr-meta { font-size: 10.5px; color: #7b8ca8; min-width: 0; }
    .dr-dot { color: #2c3a52; margin: 0 3px; }
    .dr-vs {
        font-size: 10.5px; color: #7b8ca8; margin-left: auto; flex: 0 0 auto;
        padding-left: 10px; border-left: 1px solid rgba(51, 65, 85, 0.4);
    }
    .dr-vs b { font-weight: 800; margin-left: 5px; }
    .dr-good { color: #4ade80; }
    .dr-bad { color: #f87171; }
    .dr-flat { color: #64748b; }
    @media (max-width: 560px) {
        .draft { flex-direction: column; align-items: flex-start; text-align: left; }
        .dr-vs { margin-left: 0; padding-left: 0; border-left: none; }
    }

    .meters { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; gap: 20px; align-items: start; margin-top: 14px; }
    .meter { min-width: 0; }
    .mt-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
    .mt-lbl { font-size: 9px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #3f5069; }
    .mt-val { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; }
    .mt-bar { position: relative; height: 8px; border-radius: 6px; background: rgba(148,163,184,0.09); border: 1px solid rgba(51,65,85,0.28); overflow: hidden; }
    .mt-zero { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(148,163,184,0.35); }
    .mt-fill { position: absolute; top: 1px; bottom: 1px; border-radius: 4px; transition: width 0.42s cubic-bezier(0.22,1,0.36,1), background 0.42s ease; }
    .mt-foot { font-size: 9.5px; font-weight: 600; color: #3a4a63; margin-top: 5px; }

    .statline { position: relative; display: flex; align-items: center; gap: 16px; padding: 8px 14px; border-radius: 12px; background: rgba(12,16,28,0.6); border: 1px solid rgba(51,65,85,0.3); }
    .sl-cell { display: flex; flex-direction: column; gap: 2px; }
    .sl-lbl { font-size: 8px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }
    .sl-val { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 14px; font-weight: 800; color: #e2e8f0; }
    .sl-dim { color: #7c8db0; }

    .floats { position: absolute; right: 8px; bottom: 100%; pointer-events: none; height: 0; }
    .float {
        position: absolute; right: 0; bottom: 0;
        display: flex; align-items: baseline; gap: 4px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 15px; font-weight: 800; white-space: nowrap;
        animation: floatUp 1.5s cubic-bezier(0.22,1,0.36,1) var(--d, 0ms) both;
    }
    .float em { font-style: normal; font-size: 8px; font-weight: 900; letter-spacing: 1px; opacity: 0.7; }
    @keyframes floatUp {
        0%   { opacity: 0; transform: translateY(6px) scale(0.9); }
        18%  { opacity: 1; transform: translateY(-6px) scale(1); }
        70%  { opacity: 1; transform: translateY(-30px); }
        100% { opacity: 0; transform: translateY(-52px); }
    }

    /* =========== BODY =========== */
    .md-body {
        flex: 1; width: 100%; max-width: 1180px; margin: 0 auto; padding: 26px 20px 60px;
        display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 26px; align-items: start;
    }
    .md-main { min-width: 0; }
    .md-side { min-width: 0; position: sticky; top: 210px; max-height: calc(100vh - 240px); overflow-y: auto; }

    /* =========== DECISION =========== */
    /* ---- champion select ---- */
    .cs { animation: rise 0.3s ease both; }
    .cs-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .cs-tag {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
        padding: 4px 10px; border-radius: 6px;
        color: #94a3b8; background: rgba(51, 65, 85, 0.35); border: 1px solid rgba(71, 85, 105, 0.4);
    }
    .cs-tag-counter { color: #4ade80; background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3); }
    .cs-sub { font-size: 12px; color: #5d6f8d; }

    .cs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 11px; }
    .cs-opt {
        display: flex; flex-direction: column; gap: 5px; text-align: left;
        font-family: inherit; padding: 15px 15px 13px; border-radius: 13px; cursor: pointer;
        background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.45);
        transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }
    .cs-opt:hover:not(:disabled) {
        transform: translateY(-2px);
        background: rgba(30, 41, 59, 0.6); border-color: rgba(139, 92, 246, 0.5);
    }
    .cs-opt:disabled { opacity: 0.55; cursor: default; }
    .cs-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .cs-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 16px; font-weight: 700; color: #e8eefb;
    }
    .cs-sig {
        font-size: 8px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 4px;
        color: #fbbf24; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .cs-meta {
        font-size: 8px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 4px; color: var(--mc);
        background: color-mix(in srgb, var(--mc) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--mc) 30%, transparent);
    }
    .cs-arch { font-size: 10.5px; color: #4e5f7a; margin-bottom: 4px; }
    .cs-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .cs-lbl { font-size: 10.5px; color: #56688a; }
    .cs-val { font-size: 11px; font-weight: 700; color: #94a3b8; }
    .cs-good { color: #4ade80; }
    .cs-bad { color: #f87171; }
    .cs-flat { color: #7d93b8; }
    .cs-bar { height: 4px; border-radius: 99px; background: rgba(15, 23, 42, 0.85); overflow: hidden; }
    .cs-fill { display: block; height: 100%; border-radius: 99px; }
    .cs-games { font-size: 9.5px; color: #3f5069; }
    .cs-net {
        margin-top: 7px; padding-top: 8px; font-size: 10.5px; font-weight: 700;
        color: #7d93b8; border-top: 1px solid rgba(51, 65, 85, 0.35);
    }
    .cs-net.cs-good { color: #4ade80; }
    .cs-net.cs-bad { color: #f87171; }
    .cs-empty { font-size: 12px; color: #5d6f8d; }

    .dec { animation: rise 0.3s ease both; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .dec-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .dec-phase {
        font-size: 9px; font-weight: 900; letter-spacing: 1.6px; text-transform: uppercase;
        padding: 5px 11px; border-radius: 7px; color: var(--gp);
        background: color-mix(in srgb, var(--gp) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--gp) 28%, transparent);
    }
    .dec-dots { display: flex; align-items: center; gap: 6px; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(51,65,85,0.55); }
    .dot-on { background: #a78bfa; }
    .dot-now { background: transparent; border: 2px solid #a78bfa; width: 9px; height: 9px; }
    .dec-prompt {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 25px; font-weight: 700; line-height: 1.28; letter-spacing: -0.015em; color: #e8eefb;
    }
    .dec-flavor { margin-top: 10px; font-size: 13px; line-height: 1.65; color: #61748f; font-style: italic; max-width: 62ch; }

    .opts { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
    .opt {
        display: flex; align-items: flex-start; gap: 14px; width: 100%;
        text-align: left; padding: 15px 16px; border-radius: 14px; cursor: pointer; font-family: inherit;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.32);
        transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
    }
    .opt:hover:not(:disabled) { border-color: rgba(139,92,246,0.5); background: rgba(139,92,246,0.07); transform: translateX(3px); }
    .opt:disabled { opacity: 0.5; cursor: default; }
    .opt-key {
        flex-shrink: 0; width: 24px; height: 24px; border-radius: 7px; margin-top: 1px;
        display: grid; place-items: center;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 800; color: #7c6bb0;
        background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.22);
    }
    .opt:hover:not(:disabled) .opt-key { color: #c4b5fd; border-color: rgba(139,92,246,0.5); }
    .opt-body { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .opt-label { font-size: 14px; font-weight: 800; color: #dbe4f5; line-height: 1.35; }
    .opt-desc { font-size: 12px; line-height: 1.55; color: #5d6f8d; }
    .opt-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .chip {
        display: inline-flex; align-items: baseline; gap: 5px; padding: 3px 8px; border-radius: 6px;
        background: color-mix(in srgb, var(--ac) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--ac) 26%, transparent);
    }
    .chip-a { font-size: 8.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: var(--ac); }
    .chip-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; font-weight: 800; color: #dbe4f5; }
    .chip-diff { background: transparent; }
    .dec-hint { margin-top: 14px; font-size: 10px; font-weight: 700; color: #3a4a63; }
    kbd {
        display: inline-block; padding: 1px 5px; border-radius: 4px; color: #94a3b8;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px;
        background: rgba(51,65,85,0.4); border: 1px solid rgba(71,85,105,0.4);
    }

    /* =========== OUTCOME =========== */
    .oc {
        display: flex; flex-direction: column; align-items: center; text-align: center;
        padding: 30px 22px 26px; border-radius: 20px; background: rgba(12,16,28,0.5);
        border: 1px solid color-mix(in srgb, var(--mg) 26%, transparent);
        box-shadow: 0 0 44px color-mix(in srgb, var(--mg) 9%, transparent);
        animation: rise 0.3s ease both;
    }
    .oc-band {
        padding: 7px 22px; border-radius: 10px; margin-bottom: 16px;
        background: color-mix(in srgb, var(--mg) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--mg) 38%, transparent);
        animation: bandPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    @keyframes bandPop { from { opacity: 0; transform: scale(0.82); } to { opacity: 1; transform: none; } }
    .oc-band-t {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 15px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--mg);
    }
    .oc-call { font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; margin-bottom: 8px; }
    .oc-text {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 18px; font-weight: 500; line-height: 1.55; color: #cfdaee; max-width: 56ch;
    }
    .oc-deltas { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 20px; }
    .od {
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        padding: 8px 14px; border-radius: 11px;
        background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.32);
        animation: rise 0.34s ease both; animation-delay: calc(var(--i) * 70ms + 120ms);
    }
    .od-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 16px; font-weight: 800; color: #94a3b8; }
    .od-l { font-size: 8px; font-weight: 900; letter-spacing: 1.2px; color: #3f5069; }
    .od-up .od-v { color: #4ade80; }
    .od-down .od-v { color: #f87171; }
    .od-flat .od-v { color: #94a3b8; }
    .oc-btn { margin-top: 24px; opacity: 0.4; }
    .oc-btn-ready { opacity: 1; }

    /* =========== GAME CARD =========== */
    .gc {
        display: flex; flex-direction: column; align-items: center; text-align: center;
        padding: 36px 22px 30px; border-radius: 20px;
        background: rgba(12,16,28,0.55); border: 1px solid rgba(239,68,68,0.24);
        animation: rise 0.32s ease both;
    }
    .gc-won { border-color: rgba(34,197,94,0.28); }
    .gc-tag { font-size: 9px; font-weight: 900; letter-spacing: 1.6px; text-transform: uppercase; color: #3f5069; }
    .gc-verdict {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 30px; font-weight: 700; letter-spacing: -0.01em; margin-top: 8px; color: #f87171;
    }
    .gc-won .gc-verdict { color: #4ade80; }
    .gc-series { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
    .gc-s { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 30px; font-weight: 800; }
    .gc-s-my { color: var(--my); }
    .gc-s-opp { color: var(--opp); }
    .gc-s-sep { font-size: 18px; color: #2c3a52; }
    .gc-line { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 22px 0 24px; }
    .gc-cell {
        display: flex; flex-direction: column; gap: 3px; align-items: center;
        min-width: 82px; padding: 11px 14px; border-radius: 12px;
        background: rgba(15,23,42,0.5); border: 1px solid rgba(51,65,85,0.28);
    }
    .gc-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 15px; font-weight: 800; color: #e2e8f0; }
    .gc-l { font-size: 8px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }

    /* =========== BENCH / FALLBACK =========== */
    .panel-c { background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.28); border-radius: 20px; padding: 40px 24px; }
    .bench { display: flex; flex-direction: column; align-items: center; text-align: center; }
    .bench-ico { font-size: 34px; margin-bottom: 12px; opacity: 0.85; }
    .bench-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 21px; font-weight: 700; color: #e2e8f0; }
    .bench-p { font-size: 13px; line-height: 1.65; color: #5d6f8d; margin: 10px 0 22px; max-width: 52ch; }

    /* =========== TIMELINE =========== */
    .tl { list-style: none; display: flex; flex-direction: column; gap: 2px; }
    .tl-row { position: relative; display: flex; gap: 11px; padding: 9px 10px 9px 0; border-bottom: 1px solid rgba(51,65,85,0.14); }
    .tl-row:last-child { border-bottom: none; }
    .tl-pip {
        flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
        background: var(--mg); margin: 5px 0 0 4px;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--mg) 14%, transparent);
    }
    .tl-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .tl-top { display: flex; align-items: baseline; gap: 7px; }
    .tl-g { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9px; font-weight: 800; color: #3f5069; flex-shrink: 0; }
    .tl-call { font-size: 11.5px; font-weight: 700; color: #b9c7de; line-height: 1.4; }
    .tl-text { font-size: 10.5px; line-height: 1.5; color: #55688a; }
    .tl-mag { font-size: 8.5px; font-weight: 900; letter-spacing: 1.1px; text-transform: uppercase; }

    /* =========== RESULT =========== */
    .md-result { flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 28px 20px 64px; animation: rise 0.34s ease both; }
    .rs-hero {
        display: flex; flex-direction: column; align-items: center; text-align: center;
        padding: 34px 22px 30px; border-radius: 22px;
        background: rgba(12,16,28,0.55); border: 1px solid rgba(51,65,85,0.3);
    }
    .rs-won { border-color: rgba(34,197,94,0.3); box-shadow: 0 0 60px rgba(34,197,94,0.07); }
    .rs-lost { border-color: rgba(239,68,68,0.26); box-shadow: 0 0 60px rgba(239,68,68,0.05); }
    .rs-verdict {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 13px; font-weight: 700; letter-spacing: 5px; text-transform: uppercase; color: #f87171;
    }
    .rs-won .rs-verdict { color: #4ade80; }
    .rs-score { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; gap: 18px; width: 100%; margin-top: 16px; }
    .rs-team {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 16px; font-weight: 700; color: var(--my); text-align: right;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .rs-team-opp { color: var(--opp); text-align: left; }
    .rs-nums { display: flex; align-items: center; gap: 12px; }
    .rs-n { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 54px; font-weight: 800; line-height: 1; }
    .rs-n-my { color: var(--my); }
    .rs-n-opp { color: var(--opp); }
    .rs-dash { font-size: 26px; color: #2c3a52; }
    .rs-headline { margin-top: 18px; max-width: 60ch; font-size: 14px; line-height: 1.6; font-style: italic; color: #7c8db0; }
    .rs-mvp {
        display: flex; align-items: center; gap: 9px; margin-top: 18px;
        padding: 8px 18px; border-radius: 11px;
        background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.32);
        animation: mvpGlow 2.4s ease-in-out infinite;
    }
    @keyframes mvpGlow {
        0%, 100% { box-shadow: 0 0 14px rgba(234,179,8,0.12); }
        50% { box-shadow: 0 0 26px rgba(234,179,8,0.34); }
    }
    .rs-mvp-star { font-size: 14px; }
    .rs-mvp-t { font-size: 11px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #fbbf24; }
    .rs-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.15fr); gap: 28px; margin-top: 30px; align-items: start; }
    .rs-col { min-width: 0; }
    .rs-stats { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
    .rs-stat {
        display: flex; flex-direction: column; gap: 4px; align-items: center;
        padding: 15px 12px; border-radius: 14px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.28);
    }
    .rs-stat-rating { border-color: color-mix(in srgb, var(--rt) 32%, transparent); }
    .rs-s-val { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 19px; font-weight: 800; color: #e2e8f0; }
    .rs-s-lbl { font-size: 8px; font-weight: 900; letter-spacing: 1.3px; text-transform: uppercase; color: #3f5069; text-align: center; }
    .rs-bench { padding: 20px; border-radius: 14px; background: rgba(12,16,28,0.5); border: 1px dashed rgba(51,65,85,0.34); }
    .rs-bench-h { font-size: 14px; font-weight: 800; color: #cbd5e1; }
    .rs-bench-p { margin-top: 8px; font-size: 12px; line-height: 1.65; color: #5d6f8d; }

    .rw-list { display: flex; flex-direction: column; gap: 7px; }
    .rw { display: flex; flex-direction: column; padding: 11px 14px; border-radius: 12px; background: rgba(12,16,28,0.5); border: 1px solid rgba(34,197,94,0.18); }
    .rw-bad { border-color: rgba(239,68,68,0.2); }
    .rw-top { display: flex; align-items: center; gap: 10px; }
    .rw-notes { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(51,65,85,0.3); }
    .rw-note { font-size: 10.5px; line-height: 1.55; color: #5d6f8d; }
    .rw-ico { font-size: 12px; opacity: 0.85; }
    .rw-lbl { flex: 1; font-size: 11px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #56688a; }
    .rw-val { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; font-weight: 800; color: #4ade80; }
    .rw-bad .rw-val { color: #f87171; }
    .ms-list { display: flex; flex-direction: column; gap: 7px; }
    .ms { display: flex; align-items: center; gap: 9px; padding: 10px 13px; border-radius: 12px; background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.24); }
    .ms-ico { font-size: 12px; }
    .ms-t { font-size: 12px; font-weight: 700; color: #fbbf24; }

    .dl { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .dl-row {
        display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 13px;
        background: rgba(12,16,28,0.5); border: 1px solid rgba(51,65,85,0.26); border-left: 3px solid var(--mg);
    }
    .dl-n {
        flex-shrink: 0; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 800;
        color: #56688a; background: rgba(51,65,85,0.28);
    }
    .dl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .dl-prompt { font-size: 10.5px; line-height: 1.5; color: #46587a; }
    .dl-call { font-size: 12.5px; font-weight: 800; color: #cbd5e1; line-height: 1.4; }
    .dl-text { font-size: 11.5px; line-height: 1.55; color: #61748f; }
    .dl-mag { flex-shrink: 0; font-size: 8.5px; font-weight: 900; letter-spacing: 1.1px; text-transform: uppercase; margin-top: 3px; }
    .rs-actions { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 34px; }
    .rs-hint { font-size: 10px; font-weight: 700; color: #3a4a63; }

    /* =========== RESPONSIVE =========== */
    @media (max-width: 1000px) {
        .md-body { grid-template-columns: minmax(0,1fr); gap: 30px; }
        .md-side { position: static; max-height: none; overflow: visible; }
        .rs-grid { grid-template-columns: minmax(0,1fr); gap: 26px; }
    }
    @media (max-width: 700px) {
        .md-head-in { padding: 12px 14px; }
        .md-body { padding: 20px 14px 52px; }
        .md-result { padding: 22px 14px 56px; }
        .s-num { font-size: 32px; }
        .team-name { font-size: 14px; }
        .meters { grid-template-columns: minmax(0,1fr); gap: 12px; }
        .statline { justify-content: space-between; }
        .dec-prompt { font-size: 20px; }
        .oc-text { font-size: 16px; }
        .rs-n { font-size: 38px; }
        .rs-team { font-size: 13px; }
        .big-btn { max-width: none; }
    }
    @media (max-width: 380px) {
        .score-row { gap: 8px; }
        .s-num { font-size: 26px; }
        .team-tag { display: none; }
        .rs-score { gap: 10px; }
        .rs-n { font-size: 30px; }
        .opt { padding: 13px 12px; gap: 10px; }
    }
</style>
