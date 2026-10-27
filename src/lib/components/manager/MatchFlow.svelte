<script>
    // ═══════════════════════════════════════════════════════════════════
    //  A series, played by hand
    // ═══════════════════════════════════════════════════════════════════
    //  pre → (draft → live ⇄ call → post) per game → end → commit.
    //  The draft is the tournament order, one action at a time against the AI;
    //  under fearless every champion played is locked for the rest of the series.
    //  Nothing is written to the save until the series is over: the whole result
    //  goes through playStep(), the same path the Sim button takes, so a played
    //  series and a simmed one can never be scored differently. Leaving before
    //  the end (only possible on the pre-match screen) changes nothing.
    import { onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { manager, mgrMatch, playStep, mutate } from '../../stores/manager.js';
    import { userFixture, myTeam, sideFor, matchContext, scoutReport, winChance, setTactic } from '../../manager/engine.js';
    import {
        startGame, resolveStage, gameSituation, gameStage, bestCall, callChance, edgeWord, tacticFit, quickGame,
        newDraft, draftTurn, draftDone, applyDraft, aiDraftAction, autoDraft, banScores, pickScores, pickInfo, blockedSet,
        rankedPool, teamSynergy, matchupValue, matchupWord, comfortOf, STAGE_T, STAGE_NAME, FAV_BONUS, POOL_BONUS, MATCHUP_STEP,
    } from '../../manager/match.js';
    import { TACTICS, TACTIC_BY_ID, TACTIC_BEATS, ROLE_IDS, ROLE_BY_ID, DRAFT_ORDER, tacticEdge, champReleased } from '../../manager/data.js';
    import { ovrOf, ovrAs } from '../../manager/people.js';
    import { ovrColor, champName, metaTag, pct, compLook } from '../../manager/ui.js';
    import { CHAMPION_BY_ID } from '../../career/constants.js';
    import { playSound } from '../../utils/sound.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    /** Where the series starts. The screen never passes these; tools/managerRender
     *  does, because every phase but the first is otherwise reachable only by clicks. */
    export let initialPhase = 'pre';
    /** AI draft actions without the pause between them (the harness, and Fast draft). */
    export let instant = false;

    const s = get(manager);
    const fixture = userFixture(s);
    const team = myTeam(s);
    const me = team ? team.id : null;
    const oppId = fixture ? (fixture.tie.a === me ? fixture.tie.b : fixture.tie.a) : null;
    const opp = oppId ? s.teams[oppId] : null;
    const bo = fixture ? fixture.tie.bo : 3;
    const need = Math.ceil(bo / 2);
    const baseCtx = fixture ? matchContext(s, fixture.kind) : { year: s.time.year, split: 'spring', bigStage: false, fearless: false };
    const year = baseCtx.year, split = baseCtx.split;
    const fearless = !!baseCtx.fearless;
    const rng = Math.random;
    const A0 = fixture ? sideFor(s, me, rng) : null;
    const B0 = fixture ? sideFor(s, oppId, rng) : null;
    const report = oppId ? scoutReport(s, oppId) : null;
    const odds = fixture ? winChance(s) : null;
    const autoDraftSetting = !!(s.settings && s.settings.autoDraft);
    const autoCalls = !!(s.settings && s.settings.autoCalls);
    const analyst = A0 ? A0.analyst || 0 : 0;
    const look = compLook(fixture ? fixture.kind : 'league');

    let phase = fixture ? 'pre' : 'none';
    let gameNo = 0;
    let wins = [0, 0];
    let games = [];
    let myTactic = team ? team.tactic : 'early';
    let aiTactic = B0 ? B0.tactic : 'early';
    let aiLostLast = false;
    let blue = fixture && fixture.tie.a === me ? 'a' : 'b';     // the higher seed starts on blue
    let locked = [];

    // draft
    let ds = null;
    let roleTab = 'TOP';
    let banTab = 'sugg';
    let fast = instant;
    let aiTimer = null;
    // live
    let A = null, B = null, ctx = null, st = null, res = null;
    let queue = [];
    let shown = [];
    let shownCount = 0;
    let clock = 0;
    let gold = 0;
    let speed = 2;
    let timer = null;
    let sit = null;

    onDestroy(() => { stop(); stopAi(); });
    function stop() { if (timer) { clearTimeout(timer); timer = null; } }
    function stopAi() { if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; } }

    // ── pre-match ──
    function chooseTactic(id) {
        myTactic = id;
        mutate(s => setTactic(s, id));
    }
    function startSeries() {
        playSound('click');
        setupDraft();
    }
    function simSeries() {
        mgrMatch.set(null);
        playStep(null);
    }
    function back() { mgrMatch.set(null); }
    $: theirUsual = report ? TACTIC_BY_ID[report.tactic] : null;
    // What they will probably ban against you (the Video Analyst perk).
    $: predicted = analyst >= 1 && A0 && B0 ? banScores(newDraft('a'), 'b', B0, A0, { ...baseCtx, blue: 'a' }).slice(0, 5) : [];

    // ── draft ──
    const sideA = () => ({ ...A0, tactic: myTactic });
    const sideB = () => ({ ...B0, tactic: aiTactic });
    const gctx = () => ({ ...baseCtx, decider: wins[0] === need - 1 && wins[1] === need - 1, blue });

    function setupDraft() {
        stopAi();
        ds = newDraft(blue, fearless ? locked : []);
        phase = 'draft';
        const firstMine = ROLE_IDS.find(r => A0.lineup[r]);
        roleTab = firstMine || 'TOP';
        banTab = 'sugg';
        if (autoDraftSetting) { autoMine(); return; }
        pump();
    }
    /** Let the AI act until it is the manager's turn (or the draft is over). */
    function pump() {
        stopAi();
        if (!ds || draftDone(ds)) return;
        const t = draftTurn(ds);
        if (t.key === 'a') { focusTurn(t); return; }
        const act = () => {
            const a = aiDraftAction(ds, sideA(), sideB(), gctx(), rng);
            if (!a || !applyDraft(ds, a, year)) ds.i++;
            ds = ds;
            pump();
        };
        if (fast || typeof window === 'undefined') act();
        else aiTimer = setTimeout(act, 520);
    }
    /** Point the picker at an empty seat, the one with the best pick if the current tab is filled. */
    function focusTurn(t) {
        if (t.type !== 'pick' || !ds.picks.a[roleTab]) return;
        const best = pickScores(ds, 'a', sideA(), sideB(), gctx())[0];
        roleTab = best ? best.role : ROLE_IDS.find(r => !ds.picks.a[r]) || roleTab;
    }
    function myBan(c) {
        const t = draftTurn(ds);
        if (!t || t.key !== 'a' || t.type !== 'ban') return;
        if (!applyDraft(ds, { champ: c }, year)) return;
        playSound('click');
        ds = ds;
        pump();
    }
    function myPick(c, role) {
        const t = draftTurn(ds);
        if (!t || t.key !== 'a' || t.type !== 'pick') return;
        if (!applyDraft(ds, { champ: c, role }, year)) return;
        playSound('click');
        ds = ds;
        const nextRole = ROLE_IDS.find(r => !ds.picks.a[r]);
        if (nextRole) roleTab = nextRole;
        pump();
    }
    /** Let the coach finish the rest of the draft for you. */
    function autoMine() {
        stopAi();
        let guard = 0;
        while (ds && !draftDone(ds) && guard++ < 40) {
            const a = aiDraftAction(ds, sideA(), sideB(), gctx(), rng);
            if (!a || !applyDraft(ds, a, year)) ds.i++;
        }
        ds = ds;
    }
    $: turn = ds ? draftTurn(ds) : null;
    $: done = ds ? draftDone(ds) : false;
    $: myTurn = !!(turn && turn.key === 'a');
    $: blocked = ds ? blockedSet(ds) : new Set();
    $: sugg = ds && myTurn && turn.type === 'ban' ? banScores(ds, 'a', sideA(), sideB(), gctx()).slice(0, 10) : [];
    $: synMine = ds ? teamSynergy(ds.picks.a, myTactic) : null;
    $: synTheirs = ds ? teamSynergy(ds.picks.b, aiTactic) : null;
    /** Tiles for the picker. Everything it reads is passed in, so Svelte re-reads it. */
    function tilesFor(dsv, mode, tab, suggested, gone, tactic) {
        if (!dsv) return [];
        const g = gctx();
        if (mode === 'ban') {
            if (tab === 'sugg') return suggested.map(x => ({ id: x.id, why: `${x.pname}'s ${ROLE_BY_ID[x.role].name.toLowerCase()} pick`, v: x.v }));
            return rankedPool(tab, year, split).map(c => ({ id: c.id, v: 0, why: '' }));
        }
        if (dsv.picks.a[tab]) return [];
        const pool = rankedPool(tab, year, split);
        const p = A0.lineup[tab];
        const me = { ...A0, tactic };
        const ids = [...new Set([...(p && p.favs || []), ...(p && p.pool || []), ...pool.map(c => c.id)])].filter(id => CHAMPION_BY_ID[id] && CHAMPION_BY_ID[id].roles.includes(tab) && champReleased(id, year));
        return ids.map(id => ({ id, info: gone.has(id) ? null : pickInfo(dsv, 'a', me, sideB(), g, tab, id) }))
            .sort((x, y) => (x.info ? 0 : 1) - (y.info ? 0 : 1) || (y.info ? y.info.value : 0) - (x.info ? x.info.value : 0));
    }
    $: tiles = ds && myTurn ? tilesFor(ds, turn.type, turn.type === 'ban' ? banTab : roleTab, sugg, blocked, myTactic) : [];
    const lockedReason = (id) => (ds && ds.locked.includes(id) ? 'Fearless' : ds && (ds.bans.a.includes(id) || ds.bans.b.includes(id)) ? 'Banned' : 'Picked');
    const sideName = (k) => (k === blue ? 'Blue' : 'Red');
    const slotsFor = (dsv, k) => {
        const order = [];
        DRAFT_ORDER.forEach((o, i) => {
            const key = o.side === 'blue' ? dsv.blue : (dsv.blue === 'a' ? 'b' : 'a');
            if (key === k) order.push({ ...o, n: i, entry: dsv.log.find(x => x.n === i) || null });
        });
        return order;
    };

    // ── live ──
    function beginLive() {
        stopAi();
        ctx = gctx();
        A = { ...A0, tactic: myTactic, picks: ds.picks.a };
        B = { ...B0, tactic: aiTactic, picks: ds.picks.b };
        st = startGame(A, B, ctx, rng, { detail: true });
        res = null;
        queue = [];
        shown = [];
        shownCount = 0;
        clock = 0;
        gold = 0;
        sit = null;
        phase = 'live';
        playSound('click');
        askOrAuto();
    }
    function askOrAuto() {
        sit = gameSituation(st, 'a', A, B);
        if (!sit) { finishGame(); return; }
        clock = STAGE_T[sit.stage] || clock;
        if (autoCalls) { choose(bestCall(sit, st.lead, A.shot).id); return; }
        phase = 'call';
    }
    function choose(optId) {
        const theirs = bestCall(gameSituation(st, 'b', A, B), -st.lead, B.shot);
        resolveStage(st, A, B, ctx, rng, { callA: optId, callB: theirs ? theirs.id : null });
        st = st;      // resolveStage mutates in place: tell the template
        const all = st.done ? st.res.feed : st.feed;
        queue = all.slice(shownCount);
        shownCount = all.length;
        sit = null;
        phase = 'live';
        tick();
    }
    const DELAY = { 1: 1300, 2: 650, 4: 260 };
    function tick() {
        stop();
        if (!queue.length) { afterQueue(); return; }
        const e = queue.shift();
        shown = [e, ...shown];
        clock = e.t;
        gold = e.gold || 0;
        if (typeof window === 'undefined') { tick(); return; }
        timer = setTimeout(tick, DELAY[speed] || 650);
    }
    function afterQueue() {
        if (st.done) { finishGame(); return; }
        askOrAuto();
    }
    function skip() {
        stop();
        while (queue.length) {
            const e = queue.shift();
            shown = [e, ...shown];
            clock = e.t;
            gold = e.gold || 0;
        }
        afterQueue();
    }
    function finishGame() {
        stop();
        res = st.res;
        const won = res.winner === 'a';
        wins = won ? [wins[0] + 1, wins[1]] : [wins[0], wins[1] + 1];
        aiLostLast = won;
        games = [...games, { w: res.winner, ratings: res.ratings, mvp: res.mvp, lines: res.lines, duration: res.duration, blue, picks: ds.picks, bans: ds.bans, calls: res.calls }];
        if (fearless) locked = [...locked, ...Object.values(ds.picks.a), ...Object.values(ds.picks.b)];
        playSound(won ? 'win' : 'click');
        phase = 'post';
    }
    $: seriesOver = wins[0] >= need || wins[1] >= need;

    /** Next game. The loser of the last game chooses a side; the AI always takes blue. */
    function nextGame(side) {
        gameNo++;
        blue = side;
        // The AI adapts: beaten, it often switches to a plan that counters yours.
        if (aiLostLast && rng() < 0.6) {
            const counters = Object.entries(TACTIC_BEATS).filter(([, beats]) => beats.includes(myTactic)).map(([id]) => id);
            if (counters.length) aiTactic = counters[Math.floor(rng() * counters.length)];
        }
        setupDraft();
    }
    function simRest() {
        stop(); stopAi();
        let side = res && res.winner === 'a' ? 'b' : blue;
        while (wins[0] < need && wins[1] < need) {
            const c = { ...baseCtx, decider: wins[0] === need - 1 && wins[1] === need - 1, blue: side };
            const d = autoDraft(sideA(), sideB(), c, rng, fearless ? locked : []);
            const r = quickGame({ ...A0, tactic: myTactic, picks: d.picks.a }, { ...B0, tactic: aiTactic, picks: d.picks.b }, c, rng, false);
            wins = r.winner === 'a' ? [wins[0] + 1, wins[1]] : [wins[0], wins[1] + 1];
            games = [...games, { w: r.winner, ratings: r.ratings, mvp: r.mvp, lines: r.lines, duration: r.duration, blue: side, picks: d.picks, bans: d.bans }];
            if (fearless) locked = [...locked, ...Object.values(d.picks.a), ...Object.values(d.picks.b)];
            side = r.winner === 'a' ? 'b' : 'a';
            gameNo++;
        }
        phase = 'end';
    }
    function finish() {
        const series = { score: wins.slice(), winner: wins[0] > wins[1] ? 'a' : 'b', games };
        mgrMatch.set(null);
        playStep(series);
    }

    // ── readers ──
    $: counts = countObjectives(shown);
    function countObjectives(list) {
        const c = { a: { dragon: 0, tower: 0, baron: 0, kill: 0 }, b: { dragon: 0, tower: 0, baron: 0, kill: 0 } };
        for (const e of list) if (c[e.s] && c[e.s][e.type] !== undefined) c[e.s][e.type]++;
        return c;
    }
    $: goldPct = Math.max(4, Math.min(96, 50 + (gold / 12000) * 50));
    const fmtClock = (t) => `${Math.floor(t)}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`;
    const fmtGold = (g) => `${g >= 0 ? '+' : '−'}${(Math.abs(g) / 1000).toFixed(1)}k`;
    const muOf = (picksA, picksB, r) => (picksA && picksB && picksA[r] && picksB[r] ? matchupValue(picksA[r], picksB[r], analyst) : null);
    const ATTR_WORD = { tmf: 'teamfighting', map: 'macro', mec: 'mechanics', cmp: 'composure' };

    // The harness starts in a later phase; the screen never does.
    if (fixture && initialPhase !== 'pre') {
        setupDraft();
        if (initialPhase === 'pick') {
            // On to the manager's first pick, both sides on autopilot until then.
            let guard = 0;
            while (!draftDone(ds) && guard++ < 30 && !(draftTurn(ds).key === 'a' && draftTurn(ds).type === 'pick')) {
                const a = aiDraftAction(ds, sideA(), sideB(), gctx(), rng);
                if (!a || !applyDraft(ds, a, year)) ds.i++;
            }
            ds = ds;
            focusTurn(draftTurn(ds) || { type: 'ban' });
        } else if (initialPhase === 'drafted') {
            autoMine();
        } else if (initialPhase !== 'draft') {
            autoMine();
            beginLive();
            if (initialPhase === 'post' || initialPhase === 'end') {
                while (st && !st.done) choose(bestCall(gameSituation(st, 'a', A, B), st.lead, A.shot).id);
                skip();
                if (initialPhase === 'end') simRest();
            }
        }
    }
</script>

{#if phase === 'none' || !fixture}
    <div class="mf"><div class="panel empty">No match this week. <button class="btn" on:click={back}>Back</button></div></div>
{:else}
<div class="mf" style="--cc:{look.color}">
    <!-- ══════ SERIES BAR ══════ -->
    <div class="sbar">
        <div class="comp">
            <span class="comp-ico"><Icon name={look.icon} size={18} stroke={2.2} /></span>
            <span class="comp-t">
                <b>{fixture.comp}</b>
                <span>Best of {bo}{#if fixture.stage}{' · '}{fixture.stage}{/if}{#if fearless}{' · '}<i class="fl">Fearless</i>{/if}</span>
            </span>
        </div>
        <div class="sb-mid">
            <span class="sb-t"><TeamBadge {team} size={34} /> <b>{team.name}</b></span>
            <span class="sb-s num">{wins[0]} <i>–</i> {wins[1]}</span>
            <span class="sb-t sb-r"><b>{opp.name}</b> <TeamBadge team={opp} size={34} /></span>
        </div>
        <span class="gm">{phase === 'pre' ? 'Pre-match' : phase === 'end' ? 'Series over' : `Game ${gameNo + 1} · ${sideName('a')} side`}</span>
    </div>
    {#if fearless && locked.length && phase !== 'pre' && phase !== 'end'}
        <div class="locks"><Icon name="lock" size={13} /> <b>Fearless:</b> {locked.length} champions used this series and gone for both sides: <span class="dim">{locked.map(champName).join(', ')}</span></div>
    {/if}

    {#if phase === 'pre'}
        <!-- ══════ PRE-MATCH ══════ -->
        <div class="pre">
            <section class="panel lus">
                <div class="ph"><h3><TeamBadge {team} size={20} /> Your five</h3><span class="muted small">Change it on the Squad screen</span></div>
                {#each ROLE_IDS as r}
                    {@const p = A0.lineup[r]}
                    <div class="lu">
                        <span class="lu-r">{r}</span>
                        <span class="lu-n">{p ? p.name : '—'}{#if p && !p.real}<span class="chip" style="--c:#fbbf24">Random</span>{/if}</span>
                        <span class="lu-f">{#if p}<span class="star">★</span> {(p.favs || []).map(champName).join(', ')}{#if p.recent && p.recent.length}{' '}<span class="rec">· last {champName(p.recent[0])}</span>{/if}{/if}</span>
                        {#if p}<span class="ovr" style="--c:{ovrColor(ovrAs(p, r))}">{ovrAs(p, r)}</span>{/if}
                    </div>
                {/each}
            </section>
            <section class="panel plan">
                <div class="ph"><h3><Icon name="target" size={15} /> Game plan</h3></div>
                {#if odds}<div class="odds"><b class="num">{pct(odds.series)}%</b><span class="muted small">to win the series ({pct(odds.game)}% a game)</span></div>{/if}
                <ul class="facts">
                    <li><Icon name="flag" size={13} /> <span>Game 1 on the <b>{blue === 'a' ? 'blue side (first pick)' : 'red side (last pick)'}</b>. After that the loser of each game picks a side.</span></li>
                    <li><Icon name="swords" size={13} /> <span>Tournament draft: three bans each, picks B1 · R1R2 · B2B3 · R3, two more bans each, picks R4 · B4B5 · R5.</span></li>
                    {#if fearless}<li class="fear"><Icon name="lock" size={13} /> <span><b>Fearless draft:</b> a champion played in this series cannot be played again by either side. Deep champion pools win long series.</span></li>{/if}
                </ul>
                <p class="small dim">They usually play <b style="color:{theirUsual.color}">{theirUsual.name}</b>. Beat it with {Object.entries(TACTIC_BEATS).filter(([, b]) => b.includes(theirUsual.id)).map(([id]) => TACTIC_BY_ID[id].name).join(' or ')}.</p>
                <div class="tacs">
                    {#each TACTICS as t}
                        {@const fit = tacticFit(A0.lineup, t.id)}
                        {@const e = tacticEdge(t.id, theirUsual.id)}
                        <button class="tac" class:on={myTactic === t.id} style="--c:{t.color}" on:click={() => chooseTactic(t.id)}>
                            <b>{t.name}</b>
                            <span class="tac-sub"><span class:good={fit.bonus >= 0.3} class:bad={fit.bonus <= -0.3}>{fit.label}</span>{#if e > 0}<span class="good">· counters</span>{:else if e < 0}<span class="bad">· countered</span>{/if}</span>
                        </button>
                    {/each}
                </div>
                {#if predicted.length}
                    <div class="pred"><span class="muted small"><Icon name="video" size={12} /> Video analyst: they will probably ban</span>
                        <span class="pred-c">{#each predicted as b}<span class="champ ban-them" title="{b.pname}">{champName(b.id)}</span>{/each}</span>
                    </div>
                {/if}
                <div class="pre-btns">
                    <button class="btn btn-p big" on:click={startSeries}><Icon name="play" size={15} stroke={2.4} /> Start the series</button>
                    <button class="btn big" on:click={simSeries}><Icon name="bolt" size={15} /> Sim it</button>
                    <button class="btn big" on:click={back}>Back</button>
                </div>
            </section>
            <section class="panel lus">
                <div class="ph"><h3><TeamBadge team={opp} size={20} /> {opp.short}</h3><span class="muted small">Their likely five</span></div>
                {#each ROLE_IDS as r}
                    {@const p = B0.lineup[r]}
                    <div class="lu">
                        <span class="lu-r">{r}</span>
                        <span class="lu-n">{p ? p.name : '—'}{#if p && !p.real}<span class="chip" style="--c:#fbbf24">Random</span>{/if}</span>
                        <span class="lu-f">{#if p}<span class="star">★</span> {(p.favs || []).map(champName).join(', ')}{#if p.recent && p.recent.length}{' '}<span class="rec">· last {champName(p.recent[0])}</span>{/if}{/if}</span>
                        {#if p}<span class="ovr" style="--c:{ovrColor(ovrAs(p, r))}">{ovrAs(p, r)}</span>{/if}
                    </div>
                {/each}
            </section>
        </div>

    {:else if phase === 'draft' && ds}
        <!-- ══════ DRAFT ══════ -->
        <div class="dbar" class:mine={myTurn} class:done>
            {#if done}
                <span class="d-now"><Icon name="check" size={16} /> Draft complete</span>
                <span class="d-sub">Check the comps, then start the game.</span>
            {:else}
                <span class="d-now"><Icon name={turn.type === 'ban' ? 'close' : 'star'} size={16} /> {myTurn ? `Your ${turn.type}` : `${opp.short} ${turn.type === 'ban' ? 'ban' : 'pick'}${fast ? '' : '…'}`}</span>
                <span class="d-sub">{turn.phase === 1 ? 'Phase 1' : 'Phase 2'} · {sideName(turn.key)} side · action {turn.n + 1} of 20</span>
            {/if}
            <div class="d-track">
                {#each DRAFT_ORDER as o, i}
                    <i class="dt dt-{o.side} dt-{o.type}" class:now={turn && turn.n === i} class:past={i < ds.i}></i>
                {/each}
            </div>
            <div class="d-tools">
                <span class="seg tac-seg">{#each TACTICS as t}<button class:on={myTactic === t.id} on:click={() => chooseTactic(t.id)} title={t.name}>{t.short}</button>{/each}</span>
                <label class="fastt"><input type="checkbox" bind:checked={fast} /> Fast</label>
                {#if !done}<button class="btn btn-sm" on:click={autoMine}><Icon name="sparkle" size={13} /> Let the coach finish</button>{/if}
            </div>
        </div>

        <div class="dgrid">
            {#each [['a', team, synMine], ['b', opp, synTheirs]] as [k, t, syn], col}
                <section class="panel dcol" class:blue={k === blue} class:red={k !== blue} style="order:{k === blue ? 0 : 2}">
                    <div class="dcol-h"><TeamBadge team={t} size={24} /> <b>{t.short}</b> <span class="side-tag">{sideName(k)}</span></div>
                    <div class="dbans">
                        {#each slotsFor(ds, k).filter(x => x.type === 'ban') as sl}
                            <span class="dban" class:now={turn && turn.n === sl.n}>{sl.entry ? champName(sl.entry.champ) : ''}</span>
                        {/each}
                    </div>
                    <div class="dpicks">
                        {#each ROLE_IDS as r}
                            {@const c = ds.picks[k][r]}
                            {@const p = (k === 'a' ? A0 : B0).lineup[r]}
                            {@const cf = c ? comfortOf(p, c) : 'none'}
                            {@const mu = muOf(ds.picks[k], ds.picks[k === 'a' ? 'b' : 'a'], r)}
                            <div class="dpick" class:filled={!!c}>
                                <span class="dp-r">{r}</span>
                                <span class="dp-n">{p ? p.name : '—'}</span>
                                <span class="dp-c">{#if c}{cf === 'fav' ? '★ ' : cf === 'pool' ? '◆ ' : ''}{champName(c)}{:else}<span class="muted">…</span>{/if}</span>
                                {#if mu !== null}<span class="mu mu-{matchupWord(mu).tone}" title="Lane matchup">{matchupWord(mu).word}</span>{/if}
                            </div>
                        {/each}
                    </div>
                    {#if syn && (syn.style || syn.duos.length || syn.noFront)}
                        <div class="dsyn">
                            {#if syn.style}<span class="chip" style="--c:{syn.style.color}">{syn.style.name}{syn.styleFit ? ' · fits the plan' : ''}</span>{/if}
                            {#each syn.duos as d}<span class="chip" style="--c:#f472b6">{d.name}</span>{/each}
                            {#if syn.noFront}<span class="chip" style="--c:#f87171">No frontline</span>{/if}
                        </div>
                    {/if}
                </section>
            {/each}

            <section class="panel picker" style="order:1">
                {#if done}
                    <div class="dready">
                        <p>Both fives are locked in. {#if synMine && synMine.style}Your comp is <b style="color:{synMine.style.color}">{synMine.style.name}</b>{synMine.styleFit ? ', and it fits your plan' : `, which wants ${TACTIC_BY_ID[synMine.style.tactic].name}`}.{:else}Your five has no clear comp style.{/if}</p>
                        <button class="btn btn-p big" on:click={beginLive}><Icon name="play" size={15} stroke={2.4} /> Start game {gameNo + 1}</button>
                    </div>
                {:else if !myTurn}
                    <div class="dwait"><span class="spin"></span> {opp.short} are {turn.type === 'ban' ? 'banning' : 'picking'}…</div>
                {:else if turn.type === 'ban'}
                    <div class="ptabs">
                        <button class:on={banTab === 'sugg'} on:click={() => (banTab = 'sugg')}>Their threats</button>
                        {#each ROLE_IDS as r}<button class:on={banTab === r} on:click={() => (banTab = r)}>{r}</button>{/each}
                    </div>
                    <p class="muted small">Ban what their best players are best on, what they just played, or what would counter a champion you have locked in.</p>
                    <div class="tiles">
                        {#each tiles as x (x.id)}
                            {@const gone = blocked.has(x.id)}
                            <button class="tile ban" disabled={gone} on:click={() => myBan(x.id)} title={gone ? lockedReason(x.id) : 'Ban ' + champName(x.id)}>
                                <b>{champName(x.id)}</b>
                                {#if gone}<span class="t-x">{lockedReason(x.id)}</span>
                                {:else if x.why}<span class="t-why">{x.why}</span>
                                {:else if metaTag(x.id, year, split)}<span class="tag" class:up={metaTag(x.id, year, split) === 'strong'}>{metaTag(x.id, year, split) === 'strong' ? 'Meta ↑' : 'Meta ↓'}</span>{/if}
                            </button>
                        {/each}
                    </div>
                {:else}
                    <div class="ptabs">
                        {#each ROLE_IDS as r}<button class:on={roleTab === r} disabled={!!ds.picks.a[r]} on:click={() => (roleTab = r)}>{r}{#if ds.picks.a[r]} ✓{/if}</button>{/each}
                    </div>
                    {#if A0.lineup[roleTab]}
                        <p class="muted small">Picking for <b class="pfor">{A0.lineup[roleTab].name}</b> ({ROLE_BY_ID[roleTab].name}){#if ds.picks.b[roleTab]} into <b>{champName(ds.picks.b[roleTab])}</b>{:else}: their {roleTab} has not picked yet, so this is blind{/if}.</p>
                    {/if}
                    <div class="tiles">
                        {#each tiles as x (x.id)}
                            {@const i = x.info}
                            <button class="tile" class:fav={i && i.comfort === 'fav'} class:pool={i && i.comfort === 'pool'} disabled={!i} on:click={() => myPick(x.id, roleTab)}>
                                <span class="t-top"><b>{champName(x.id)}</b>{#if i}<span class="t-v" class:good={i.value > 0.5} class:bad={i.value < -0.5}>{i.value > 0 ? '+' : ''}{i.value.toFixed(1)}</span>{/if}</span>
                                {#if !i}<span class="t-x">{lockedReason(x.id)}</span>
                                {:else}
                                    <span class="t-tags">
                                        {#if i.comfort === 'fav'}<span class="tag tg-fav">★ Signature</span>{:else if i.comfort === 'pool'}<span class="tag tg-pool">◆ Pool</span>{/if}
                                        {#if i.meta > 0}<span class="tag up">Meta ↑</span>{:else if i.meta < 0}<span class="tag down">Meta ↓</span>{/if}
                                        {#if i.enemy}<span class="tag mu-{matchupWord(i.mu).tone}">{matchupWord(i.mu).word} vs {champName(i.enemy)}</span>{/if}
                                        {#each i.duos as d}<span class="tag tg-syn">+ {d.name}</span>{/each}
                                        {#if i.style}<span class="tag tg-syn">→ {i.style.name}</span>{/if}
                                        {#if i.recent}<span class="tag tg-rec">Played recently</span>{/if}
                                    </span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                    <p class="muted small">Value is in rating points for this seat: ★ signature +{FAV_BONUS}, ◆ pool +{POOL_BONUS}, meta ±2, a lane counter up to ±{(MATCHUP_STEP * 2.5).toFixed(1)}, plus synergy.</p>
                {/if}
            </section>
        </div>

    {:else if (phase === 'live' || phase === 'call') && st}
        <!-- ══════ LIVE ══════ -->
        <div class="live">
            <section class="panel board">
                <div class="clock num">{fmtClock(clock)}</div>
                <div class="gold">
                    <span class="g-l">{team.short}</span>
                    <span class="g-bar"><i style="width:{goldPct}%"></i></span>
                    <span class="g-r">{opp.short}</span>
                </div>
                <div class="g-v num" class:good={gold > 0} class:bad={gold < 0}>{fmtGold(gold)} gold</div>
                <div class="obj">
                    <span>Drakes <b>{counts.a.dragon}–{counts.b.dragon}</b></span>
                    <span>Towers <b>{counts.a.tower}–{counts.b.tower}</b></span>
                    <span>Baron <b>{counts.a.baron}–{counts.b.baron}</b></span>
                </div>
                <div class="lanes">
                    {#each ROLE_IDS as r}
                        {@const mu = muOf(A.picks, B.picks, r)}
                        <div class="ln"><i>{r}</i><span class="ln-a">{champName(A.picks[r])}</span>{#if mu !== null}<span class="mu mu-{matchupWord(mu).tone}">{matchupWord(mu).word}</span>{/if}<span class="ln-b">{champName(B.picks[r])}</span></div>
                    {/each}
                </div>
                <div class="dsyn">
                    {#if st.synA.style}<span class="chip" style="--c:{st.synA.style.color}">{st.synA.style.name}</span>{/if}
                    {#each st.synA.duos as d}<span class="chip" style="--c:#f472b6">{d.name}</span>{/each}
                </div>
                <div class="spd">
                    {#each [1, 2, 4] as v}<button class="btn btn-sm" class:btn-p={speed === v} on:click={() => (speed = v)}>{v}×</button>{/each}
                    {#if phase === 'live'}<button class="btn btn-sm" on:click={skip}>Skip <Icon name="arrow" size={12} /></button>{/if}
                </div>
                <div class="stages">
                    {#each ['plan', 'mid', 'baron', 'late'] as sg}
                        {@const rec = st.calls.find(c => c.stage === sg)}
                        <span class="sgc" class:now={sit && sit.stage === sg} class:ok={rec && rec.a && rec.a.ok} class:bad={rec && rec.a && rec.a.ok === false}>{STAGE_NAME[sg]}</span>
                    {/each}
                </div>
            </section>
            <section class="panel feed">
                {#if phase === 'call' && sit}
                    <div class="call">
                        <div class="call-h"><Icon name="alert" size={17} /> <span class="call-t">{STAGE_NAME[sit.stage]} · {sit.title}</span> <span class="yc">Your call</span></div>
                        <div class="call-o" class:four={sit.opts.length === 4}>
                            {#each sit.opts as o}
                                {@const ew = edgeWord(o)}
                                <button class="opt" on:click={() => choose(o.id)}>
                                    <span class="o-top"><b>{o.label}</b><span class="chip" style="--c:{o.risk === 'High' ? '#f87171' : o.risk === 'Medium' ? '#fbbf24' : '#34d399'}">{o.risk}</span></span>
                                    <span class="o-d">{o.desc}</span>
                                    <span class="o-e">{#if o.edge == null}<b class="good">Safe</b> · always pays a little{:else}<b class:good={ew.tone === 'good'} class:bad={ew.tone === 'bad'}>{ew.word}</b> · {pct(callChance(o, st.lead, A.shot))}% to work{/if}</span>
                                </button>
                            {/each}
                        </div>
                        <button class="btn btn-sm" on:click={() => choose(bestCall(sit, st.lead, A.shot).id)}>Let the coach decide</button>
                    </div>
                {/if}
                <ul class="ev">
                    {#each shown as e, i (e.t + ':' + i)}
                        <li class="e-{e.type}" class:mine={e.s === 'a'} class:theirs={e.s === 'b'}>
                            <span class="e-t num">{fmtClock(e.t)}</span>
                            <span class="e-x">{e.text}</span>
                        </li>
                    {:else}
                        <li class="e-start"><span class="e-t num">0:00</span><span class="e-x">Welcome to Summoner's Rift. Minions spawn in thirty seconds.</span></li>
                    {/each}
                </ul>
            </section>
        </div>

    {:else if phase === 'post' && res}
        <!-- ══════ GAME OVER ══════ -->
        <div class="post">
            <div class="banner" class:won={res.winner === 'a'}>
                <span class="b-w">{res.winner === 'a' ? 'VICTORY' : 'DEFEAT'}</span>
                <span class="b-s">Game {gameNo + 1} · {res.duration} minutes · series {wins[0]}–{wins[1]}</span>
                <span class="b-calls">
                    {#each res.calls as c}
                        {#if c.a}<span class="chip" style="--c:{c.a.safe ? '#94a3b8' : c.a.ok ? '#34d399' : '#f87171'}">{STAGE_NAME[c.stage]}: {c.a.label}{c.a.safe ? '' : c.a.ok ? ' ✓' : ' ✗'}</span>{/if}
                    {/each}
                </span>
            </div>
            <div class="box">
                {#each [['a', team], ['b', opp]] as [side, t]}
                    <section class="panel">
                        <div class="ph"><h3><TeamBadge team={t} size={20} /> {t.name}</h3><span class="muted small">{res.lines[side].reduce((x, l) => x + l.k, 0)} kills{#if (side === 'a' ? res.synA : res.synB).style}{' · '}{(side === 'a' ? st.synA : st.synB).style.name}{/if}</span></div>
                        <table class="tbl">
                            <thead><tr><th>Role</th><th>Player</th><th>Champion</th><th class="c">K/D/A</th><th class="r">Rating</th></tr></thead>
                            <tbody>
                                {#each res.lines[side] as l}
                                    {@const mu = muOf(side === 'a' ? A.picks : B.picks, side === 'a' ? B.picks : A.picks, l.role)}
                                    <tr class:me={l.id === res.mvp}>
                                        <td class="muted">{l.role}</td>
                                        <td><b>{l.name}</b>{#if l.id === res.mvp}<span class="chip" style="--c:#fbbf24">MVP</span>{/if}</td>
                                        <td class="dim">{champName(l.champ)}{#if mu !== null}<span class="mu mu-{matchupWord(mu).tone} mu-s">{matchupWord(mu).word}</span>{/if}</td>
                                        <td class="c num">{l.k}/{l.d}/{l.a}</td>
                                        <td class="r num" class:good={l.rating >= 7.5} class:bad={l.rating < 5.5}>{l.rating.toFixed(1)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </section>
                {/each}
            </div>
            <div class="post-btns">
                {#if seriesOver}
                    <button class="btn btn-p big" on:click={() => (phase = 'end')}>See the series <Icon name="arrow" size={14} stroke={2.4} /></button>
                {:else if res.winner === 'a'}
                    <button class="btn btn-p big" on:click={() => nextGame('b')}><Icon name="play" size={15} stroke={2.4} /> Game {gameNo + 2} <span class="bsub">· they chose blue, you are red</span></button>
                    <button class="btn big" on:click={simRest}><Icon name="bolt" size={15} /> Sim the rest</button>
                {:else}
                    <span class="pick-side">You lost: choose your side for game {gameNo + 2}</span>
                    <button class="btn btn-p big side-b" on:click={() => nextGame('a')}><Icon name="play" size={15} stroke={2.4} /> Blue side · first pick</button>
                    <button class="btn big side-r" on:click={() => nextGame('b')}><Icon name="play" size={15} stroke={2.4} /> Red side · last pick</button>
                    <button class="btn big" on:click={simRest}><Icon name="bolt" size={15} /> Sim the rest</button>
                {/if}
            </div>
        </div>

    {:else if phase === 'end'}
        <!-- ══════ SERIES OVER ══════ -->
        <div class="end panel" class:won={wins[0] > wins[1]}>
            <span class="end-w">{wins[0] > wins[1] ? 'Series won' : 'Series lost'}</span>
            <span class="end-s num">{wins[0]}–{wins[1]}</span>
            <div class="end-g">
                {#each games as g, i}
                    <div class="eg" class:w={g.w === 'a'}>
                        <span class="eg-h">Game {i + 1} · {g.w === 'a' ? 'W' : 'L'}</span>
                        <span class="eg-c">{ROLE_IDS.map(r => champName(g.picks && g.picks.a[r])).join(' · ')}</span>
                    </div>
                {/each}
            </div>
            <button class="btn btn-p big" on:click={finish}>Continue <Icon name="arrow" size={14} stroke={2.4} /></button>
        </div>
    {/if}
</div>
{/if}

<style>
    .mf { width: 100%; max-width: 1440px; margin: 0 auto; padding: 18px 20px 60px; display: flex; flex-direction: column; gap: 14px; }
    .sbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 16px; border-radius: 16px; background: linear-gradient(90deg, color-mix(in srgb, var(--cc) 16%, rgba(6, 9, 17, 0.92)), rgba(6, 9, 17, 0.92) 60%); border: 1px solid color-mix(in srgb, var(--cc) 40%, var(--line)); flex-wrap: wrap; }
    .comp { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .comp-ico { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; color: #0b1120; background: var(--cc); box-shadow: 0 0 18px color-mix(in srgb, var(--cc) 45%, transparent); flex-shrink: 0; }
    .comp-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .comp-t b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; color: #fff; }
    .comp-t span { font-size: 12px; color: #a5b4cf; font-weight: 600; }
    .fl { font-style: normal; font-size: 10px; font-weight: 900; letter-spacing: 0.6px; text-transform: uppercase; padding: 1px 6px; border-radius: 5px; color: #fff; background: linear-gradient(135deg, #ef4444, #f97316); }
    .sb-mid { display: flex; align-items: center; gap: 16px; }
    .sb-t { display: inline-flex; align-items: center; gap: 9px; color: #fff; font-size: 15px; }
    .sb-s { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 32px; font-weight: 700; color: #fff; }
    .sb-s i { font-style: normal; color: #475569; margin: 0 4px; }
    .gm { font-size: 11.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--cc); }
    .locks { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding: 8px 12px; border-radius: 11px; font-size: 12.5px; color: #fecaca; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); }
    .small { font-size: 12.5px; }
    .big { padding: 12px 18px; font-size: 14px; }

    .pre { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .lus { display: flex; flex-direction: column; gap: 5px; }
    .lu { display: grid; grid-template-columns: 34px 1fr auto; grid-template-rows: auto auto; column-gap: 8px; align-items: center; padding: 8px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .lu-r { font-size: 10.5px; font-weight: 900; color: #8aa0c4; }
    .lu-n { display: flex; align-items: center; gap: 6px; font-weight: 800; color: #fff; font-size: 14px; }
    .lu-f { grid-column: 2; grid-row: 2; font-size: 11.5px; color: #a5b4cf; }
    .star { color: #fbbf24; }
    .rec { color: #7dd3fc; }
    .lu .ovr { grid-column: 3; grid-row: 1 / span 2; }
    .odds { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
    .odds b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 34px; color: #34d399; }
    .plan b { color: #f1f5f9; }
    .facts { list-style: none; margin: 4px 0 10px; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #c3cfe2; line-height: 1.5; }
    .facts li { display: flex; gap: 7px; align-items: flex-start; }
    .facts li :global(.ico) { flex-shrink: 0; margin-top: 3px; color: #8aa0c4; }
    .facts .fear { color: #fecaca; }
    .facts .fear :global(.ico) { color: #f87171; }
    .tacs { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; margin: 10px 0 14px; }
    .tac { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 11px; text-align: left; cursor: pointer; font-family: inherit; background: rgba(2, 6, 23, 0.45); border: 1px solid var(--line); color: #cbd5e1; }
    .tac b { color: var(--c); font-size: 13.5px; }
    .tac.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, rgba(2, 6, 23, 0.5)); }
    .tac-sub { font-size: 11.5px; color: #a5b4cf; display: flex; gap: 4px; flex-wrap: wrap; }
    .pred { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .pred-c { display: flex; gap: 5px; flex-wrap: wrap; }
    .pre-btns { display: flex; gap: 8px; flex-wrap: wrap; }

    .champ { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; font-family: inherit; font-size: 12px; font-weight: 700; color: #e2e8f0; background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(71, 85, 105, 0.5); }
    .ban-them { color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); }

    /* draft */
    .dbar { display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto auto; column-gap: 16px; row-gap: 8px; align-items: center; padding: 12px 16px; border-radius: 14px; background: rgba(15, 23, 42, 0.75); border: 1px solid var(--line); }
    .dbar.mine { border-color: #34d399; box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.35), 0 0 24px rgba(52, 211, 153, 0.12); }
    .dbar.done { border-color: #fbbf24; }
    .d-now { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 18px; font-weight: 700; color: #fff; }
    .mine .d-now { color: #6ee7b7; }
    .d-sub { font-size: 12.5px; color: #a5b4cf; font-weight: 600; }
    .d-track { grid-column: 1 / -1; display: flex; gap: 3px; }
    .dt { flex: 1; height: 7px; border-radius: 3px; opacity: 0.3; }
    .dt-blue { background: #3b82f6; }
    .dt-red { background: #ef4444; }
    .dt-ban { height: 5px; margin-top: 1px; }
    .dt.past { opacity: 0.9; }
    .dt.now { opacity: 1; box-shadow: 0 0 10px currentColor; transform: scaleY(1.5); }
    .d-tools { grid-column: 3; grid-row: 1 / span 2; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .fastt { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #a5b4cf; cursor: pointer; }
    .fastt input { accent-color: #10b981; }
    .dgrid { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(220px, 280px); gap: 12px; align-items: start; }
    .dcol { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
    .dcol.blue { border-color: rgba(59, 130, 246, 0.5); background: linear-gradient(180deg, rgba(59, 130, 246, 0.1), var(--card) 40%); }
    .dcol.red { border-color: rgba(239, 68, 68, 0.5); background: linear-gradient(180deg, rgba(239, 68, 68, 0.1), var(--card) 40%); }
    .dcol-h { display: flex; align-items: center; gap: 8px; color: #fff; }
    .side-tag { margin-left: auto; font-size: 10px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 2px 7px; border-radius: 5px; color: #bfdbfe; background: rgba(59, 130, 246, 0.25); }
    .red .side-tag { color: #fecaca; background: rgba(239, 68, 68, 0.25); }
    .dbans { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
    .dban { min-height: 26px; display: grid; place-items: center; padding: 2px 3px; border-radius: 6px; font-size: 10px; font-weight: 800; text-align: center; line-height: 1.15; color: #fca5a5; background: rgba(2, 6, 23, 0.6); border: 1px dashed rgba(239, 68, 68, 0.35); text-decoration: line-through; overflow: hidden; }
    .dban.now { border-style: solid; border-color: #fbbf24; animation: blink 1s ease-in-out infinite; }
    @keyframes blink { 50% { box-shadow: 0 0 10px rgba(251, 191, 36, 0.6); } }
    .dpicks { display: flex; flex-direction: column; gap: 5px; }
    .dpick { display: grid; grid-template-columns: 30px 1fr auto; grid-template-rows: auto auto; column-gap: 6px; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.45); }
    .dpick.filled { border-color: rgba(148, 163, 184, 0.5); }
    .dp-r { grid-row: 1 / span 2; align-self: center; font-size: 10px; font-weight: 900; color: #8aa0c4; }
    .dp-n { font-size: 12px; font-weight: 700; color: #a5b4cf; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dp-c { grid-column: 2; font-size: 13.5px; font-weight: 800; color: #fff; }
    .dpick .mu { grid-column: 3; grid-row: 1 / span 2; align-self: center; }
    .dsyn { display: flex; gap: 5px; flex-wrap: wrap; }
    .mu { font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; padding: 2px 6px; border-radius: 5px; color: #cbd5e1; background: rgba(148, 163, 184, 0.15); white-space: nowrap; }
    .mu-good { color: #052e1f; background: #34d399; }
    .mu-bad { color: #fff; background: #ef4444; }
    .mu-s { margin-left: 6px; }
    .picker { min-height: 420px; display: flex; flex-direction: column; gap: 10px; }
    .ptabs { display: flex; gap: 4px; flex-wrap: wrap; }
    .ptabs button { padding: 7px 13px; border-radius: 9px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: #a5b4cf; background: rgba(2, 6, 23, 0.55); border: 1px solid var(--line); cursor: pointer; }
    .ptabs button.on { color: #022c1c; background: #34d399; border-color: #34d399; }
    .ptabs button:disabled { opacity: 0.45; cursor: default; }
    .pfor { color: #6ee7b7; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 7px; max-height: 520px; overflow-y: auto; padding-right: 2px; }
    .tile { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 9px 10px; border-radius: 11px; text-align: left; cursor: pointer; font-family: inherit; color: #e2e8f0; background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(71, 85, 105, 0.5); }
    .tile:hover:not(:disabled) { border-color: #34d399; background: rgba(16, 185, 129, 0.08); }
    .tile.ban:hover:not(:disabled) { border-color: #f87171; background: rgba(127, 29, 29, 0.25); }
    .tile.fav { border-color: rgba(251, 191, 36, 0.6); }
    .tile.pool { border-color: rgba(125, 211, 252, 0.45); }
    .tile:disabled { opacity: 0.35; cursor: not-allowed; }
    .tile b { font-size: 13.5px; color: #fff; }
    .t-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; }
    .t-v { font-size: 12.5px; font-weight: 900; color: #94a3b8; }
    .t-tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .tag { font-size: 9.5px; font-weight: 800; padding: 2px 6px; border-radius: 5px; color: #cbd5e1; background: rgba(148, 163, 184, 0.14); white-space: nowrap; }
    .tag.up { color: #6ee7b7; background: rgba(16, 185, 129, 0.16); }
    .tag.down { color: #fca5a5; background: rgba(239, 68, 68, 0.15); }
    .tg-fav { color: #fde68a; background: rgba(251, 191, 36, 0.18); }
    .tg-pool { color: #bae6fd; background: rgba(56, 189, 248, 0.16); }
    .tg-syn { color: #fbcfe8; background: rgba(244, 114, 182, 0.18); }
    .tg-rec { color: #c4b5fd; background: rgba(139, 92, 246, 0.18); }
    .tag.mu-good { color: #052e1f; background: #34d399; }
    .tag.mu-bad { color: #fff; background: #ef4444; }
    .t-x, .t-why { font-size: 11px; color: #a5b4cf; }
    .t-x { color: #fca5a5; font-weight: 700; }
    .dwait { display: flex; align-items: center; gap: 10px; padding: 30px; justify-content: center; color: #a5b4cf; font-weight: 700; }
    .spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(148, 163, 184, 0.3); border-top-color: #34d399; animation: sp 0.8s linear infinite; }
    @keyframes sp { to { transform: rotate(360deg); } }
    .dready { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 40px 16px; text-align: center; font-size: 14px; color: #dbe4f0; }

    /* live */
    .live { display: grid; grid-template-columns: 350px minmax(0, 1fr); gap: 14px; align-items: start; }
    .board { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 14px; }
    .clock { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 46px; font-weight: 700; color: #fff; text-align: center; line-height: 1; }
    .gold { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; color: #a5b4cf; }
    .g-bar { height: 10px; border-radius: 10px; background: rgba(239, 68, 68, 0.45); overflow: hidden; }
    .g-bar i { display: block; height: 100%; background: #34d399; transition: width 0.4s ease; }
    .g-v { text-align: center; font-weight: 900; font-size: 15px; }
    .obj { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; color: #a5b4cf; }
    .obj b { color: #fff; }
    .lanes { display: flex; flex-direction: column; gap: 3px; }
    .ln { display: grid; grid-template-columns: 30px 1fr auto 1fr; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; }
    .ln i { font-style: normal; font-size: 9.5px; font-weight: 900; color: #64748b; }
    .ln-a { color: #6ee7b7; }
    .ln-b { color: #fca5a5; text-align: right; }
    .spd { display: flex; gap: 5px; justify-content: center; }
    .stages { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    .sgc { font-size: 9.5px; font-weight: 800; text-align: center; padding: 4px 2px; border-radius: 6px; color: #64748b; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(51, 65, 85, 0.4); }
    .sgc.now { color: #fde68a; border-color: #fbbf24; }
    .sgc.ok { color: #6ee7b7; border-color: rgba(52, 211, 153, 0.5); }
    .sgc.bad { color: #fca5a5; border-color: rgba(239, 68, 68, 0.5); }
    .feed { min-height: 460px; }
    .ev { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
    .ev li { display: flex; gap: 12px; padding: 9px 12px; border-radius: 10px; font-size: 14px; line-height: 1.45; background: rgba(2, 6, 23, 0.45); border-left: 3px solid #475569; color: #dbe4f0; animation: evIn 0.3s ease both; }
    .ev li.mine { border-left-color: #34d399; }
    .ev li.theirs { border-left-color: #f87171; }
    .ev li.e-end { font-weight: 800; color: #fff; }
    .ev li.e-call { background: rgba(250, 204, 21, 0.09); }
    .e-t { flex-shrink: 0; width: 42px; color: #8aa0c4; font-weight: 800; }
    @keyframes evIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .call { padding: 14px; margin-bottom: 12px; border-radius: 14px; background: rgba(250, 204, 21, 0.07); border: 1px solid rgba(250, 204, 21, 0.5); display: flex; flex-direction: column; gap: 10px; animation: evIn 0.3s ease both; }
    .call-h { display: flex; align-items: center; gap: 8px; font-weight: 800; color: #fde68a; font-size: 14.5px; flex-wrap: wrap; }
    .call-t { flex: 1; min-width: 0; }
    .yc { font-size: 10.5px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; color: #3b1d00; background: #fbbf24; }
    .call-o { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .call-o.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .opt { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; text-align: left; cursor: pointer; font-family: inherit; color: #cbd5e1; background: rgba(2, 6, 23, 0.6); border: 1px solid rgba(71, 85, 105, 0.5); }
    .opt:hover { border-color: #fde68a; background: rgba(250, 204, 21, 0.06); }
    .o-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
    .o-top b { color: #fff; font-size: 14px; }
    .o-d { font-size: 12.5px; line-height: 1.45; color: #a5b4cf; }
    .o-e { font-size: 12.5px; color: #a5b4cf; }

    /* post */
    .post { display: flex; flex-direction: column; gap: 14px; }
    .banner { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px; border-radius: 16px; background: rgba(127, 29, 29, 0.2); border: 1px solid rgba(239, 68, 68, 0.45); text-align: center; }
    .banner.won { background: rgba(16, 185, 129, 0.13); border-color: rgba(52, 211, 153, 0.5); }
    .b-w { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: 0.06em; color: #fca5a5; }
    .won .b-w { color: #6ee7b7; }
    .b-s { font-size: 13.5px; color: #dbe4f0; }
    .b-calls { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; }
    .box { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
    .post-btns { display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pick-side { width: 100%; text-align: center; font-weight: 800; color: #fde68a; }
    .bsub { font-weight: 600; opacity: 0.75; }
    .side-b { background: linear-gradient(135deg, #60a5fa, #3b82f6); color: #04122b; }
    .side-r { border-color: rgba(239, 68, 68, 0.6); color: #fecaca; }
    .end { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 34px; text-align: center; }
    .end-w { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 32px; font-weight: 700; color: #fca5a5; }
    .end.won .end-w { color: #6ee7b7; }
    .end-s { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 54px; font-weight: 700; color: #fff; }
    .end-g { display: flex; flex-direction: column; gap: 5px; width: 100%; max-width: 640px; }
    .eg { display: flex; align-items: center; gap: 10px; padding: 7px 11px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); border-left: 3px solid #f87171; font-size: 12.5px; text-align: left; }
    .eg.w { border-left-color: #34d399; }
    .eg-h { flex-shrink: 0; font-weight: 800; color: #fff; }
    .eg-c { color: #a5b4cf; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    @media (max-width: 1150px) {
        .pre { grid-template-columns: 1fr; }
        .live { grid-template-columns: 1fr; }
        .board { position: static; }
        .dgrid { grid-template-columns: 1fr 1fr; }
        .picker { grid-column: 1 / -1; order: 3 !important; }
    }
    @media (max-width: 800px) {
        .box { grid-template-columns: 1fr; }
        .call-o, .call-o.four { grid-template-columns: 1fr; }
        .sb-t b { display: none; }
        .dbar { grid-template-columns: 1fr; }
        .d-tools { grid-column: 1; grid-row: auto; justify-content: flex-start; }
        .dgrid { grid-template-columns: 1fr; }
    }
</style>
