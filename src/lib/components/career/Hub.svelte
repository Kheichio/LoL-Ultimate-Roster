<script>
    // ===================================================================
    //  LoL ULTIMATE CAREER - Hub
    // ===================================================================
    //  The week dashboard. Everything the player does between matches
    //  starts here: the fixture, the activity slots, the week log and the
    //  button that ends the week. The side rail is the "where am I"
    //  column - contract, offers, last result, table position, news.
    //
    //  Nothing in this file owns game rules. Every number comes out of a
    //  career module; the screen only arranges and guards them, because a
    //  brand-new pre-competitive player has no club, no schedule and no
    //  history and still has to look deliberate.

    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';

    import {
        career, careerScreen, careerOverlay, pushOverlay,
        currentTeam, currentPhase, soloRank,
        saveCareer, logWeek,
    } from '../../stores/career.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    import {
        ACTIVITIES, ACTIVITY_GROUPS, NEWS_TYPES, CLUB_TIERS, teamById,
    } from '../../career/constants.js';
    import {
        statusInfo, fmtGold, fmtRecord, fmtKDA, ordinal,
        calcOVR, SCOUT_MMR_GATE,
    } from '../../career/ratings.js';
    import {
        describeTeam, teamStrength, teamStrengthWithPlayer, leagueTable,
    } from '../../career/teams.js';
    import { contractStatusLine, interestedTeams } from '../../career/contracts.js';
    import { matchRatingLabel } from '../../career/match.js';
    import BracketView from './BracketView.svelte';
    import {
        ensureSeason, weekSummary, canAdvanceWeek, doActivity,
        startFixture, simFixture, advanceWeek, benchOrStart, activityGate,
    } from '../../career/engine.js';

    // ---------------------------------------------------------------
    //  local ui state
    // ---------------------------------------------------------------
    let showAllNews = false;
    let busy = false;
    let flash = null;              // { id, text } - echo of the last activity
    let flashTimer = null;

    onMount(() => {
        try { ensureSeason(); saveCareer(); } catch (e) { /* fresh career, no season yet */ }
    });
    onDestroy(() => { if (flashTimer) clearTimeout(flashTimer); });

    // ---------------------------------------------------------------
    //  safe reads - engine calls are wrapped so one bad derived value
    //  never blanks the screen the player lives on
    // ---------------------------------------------------------------
    const SERIES_PHASES = ['spring_po', 'summer_po', 'first_stand', 'msi', 'worlds'];

    function fallbackSummary(c, phase) {
        const fx = (c.season.schedule || []).filter(f => f.week === c.time.week);
        return {
            week: c.time.week, year: c.time.year,
            phase: phase.id, phaseName: phase.name,
            fixtures: fx,
            nextFixture: fx.find(f => !f.played) || null,
            actionsLeft: c.weekly.actionsLeft, actionsMax: c.weekly.actionsMax,
            income: null, canAdvance: true, blockers: [],
        };
    }

    function readSummary(c, phase) {
        try {
            const s = weekSummary(c);
            if (s && typeof s === 'object') return s;
        } catch (e) { /* engine not ready for this state */ }
        return fallbackSummary(c, phase);
    }

    function readGate(c, list) {
        try {
            const g = canAdvanceWeek(c);
            if (typeof g === 'boolean') return { ok: g, reason: g ? '' : 'You cannot end the week yet.' };
            if (g && typeof g === 'object') return { ok: !!g.ok, reason: g.reason || '' };
        } catch (e) { /* fall through */ }
        const unplayed = (list || []).some(f => !f.played);
        return unplayed
            ? { ok: false, reason: 'You still have a fixture to play this week.' }
            : { ok: true, reason: '' };
    }

    function readBench(c) {
        let r = null;
        try { r = benchOrStart(c); } catch (e) { r = null; }
        if (r === null || r === undefined) return { plays: true, reason: '' };
        if (typeof r === 'boolean') return { plays: r, reason: r ? '' : defaultBenchReason(c) };
        if (typeof r === 'string') {
            const benched = r === 'bench' || r === 'benched' || r === 'sub';
            return { plays: !benched, reason: benched ? defaultBenchReason(c) : '' };
        }
        let plays = true;
        if ('plays' in r) plays = !!r.plays;
        else if ('play' in r) plays = !!r.play;
        else if ('starts' in r) plays = !!r.starts;
        else if ('starting' in r) plays = !!r.starting;
        else if ('benched' in r) plays = !r.benched;
        const reason = r.reason || r.benchReason || r.detail || '';
        return { plays, reason: plays ? '' : (reason || defaultBenchReason(c)) };
    }

    function defaultBenchReason(c) {
        const s = statusInfo(c.player.status);
        if (c.player.health < 55) return 'You are not fit enough to be put on stage.';
        return 'The coach has you down as ' + s.name.toLowerCase() + ' this week.';
    }

    function normIncome(v) {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return { salary: v, sponsors: 0, total: v };
        const salary = Number(v.salary) || 0;
        const sponsors = Number(v.sponsors) || 0;
        const total = Number(v.total);
        return { salary, sponsors, total: Number.isFinite(total) ? total : salary + sponsors };
    }

    function normBlockers(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map(b => (typeof b === 'string' ? b : (b && (b.reason || b.text || b.msg)) || ''))
            .filter(Boolean);
    }

    function safeTable(c) {
        try {
            const rows = leagueTable(c);
            return Array.isArray(rows) ? rows : [];
        } catch (e) { return []; }
    }

    function safeInterest(c) {
        try {
            const rows = interestedTeams(c, 3);
            return Array.isArray(rows) ? rows : [];
        } catch (e) { return []; }
    }

    function safeStatusLine(c) {
        try { return contractStatusLine(c) || ''; } catch (e) { return ''; }
    }

    function safeRating(v) {
        try {
            const r = matchRatingLabel(v);
            if (r && r.label) return r;
        } catch (e) { /* fall through */ }
        return { label: (Math.round((Number(v) || 0) * 10) / 10).toFixed(1), color: '#94a3b8' };
    }

    function myStrengthFor(c) {
        try {
            if (c.player.clubId) {
                const t = teamById(c.player.clubId);
                if (t) return teamStrengthWithPlayer(c, t);
            }
        } catch (e) { /* fall through */ }
        return Math.max(1, calcOVR(c.player.attrs, c.player.role));
    }

    function oppStrengthFor(team, year) {
        if (!team) return 0;
        try { return teamStrength(team, year); } catch (e) { return team.strength || 50; }
    }

    // ---------------------------------------------------------------
    //  derived view
    // ---------------------------------------------------------------
    $: c = $career;
    $: p = c.player;
    $: phase = $currentPhase;
    $: summary = readSummary(c, phase);
    $: fixtures = Array.isArray(summary.fixtures) ? summary.fixtures : [];
    $: nextFixture = summary.nextFixture || fixtures.find(f => !f.played) || null;
    $: playedThisWeek = fixtures.filter(f => f.played);
    $: gate = readGate(c, fixtures);
    $: blockers = normBlockers(summary.blockers);
    $: income = normIncome(summary.income);

    $: opponent = nextFixture ? teamById(nextFixture.opponentId) : null;
    $: oppLine = opponent ? describeTeam(opponent) : '';
    $: oppPower = oppStrengthFor(opponent, c.time.year);
    $: myPower = myStrengthFor(c);
    $: powerTotal = Math.max(1, myPower + oppPower);
    $: myTeamName = $currentTeam ? $currentTeam.name : (p.handle || 'Free Agent');
    $: myTeamAccent = $currentTeam ? $currentTeam.accent : '#22c55e';

    // The draw, but only while one is running. BracketView has its own empty
    // state; the Hub does not want it, so the panel is gated instead.
    $: liveBracket = (c.season && c.season.bracket && typeof c.season.bracket === 'object')
        ? c.season.bracket
        : null;
    $: bestOf = nextFixture
        ? (Number(nextFixture.bestOf) || (SERIES_PHASES.indexOf(phase.id) >= 0 ? 5 : 1))
        : 1;
    $: fixtureLabel = nextFixture
        ? (nextFixture.label || (nextFixture.kind === 'scrim' ? 'Amateur Circuit' : phase.name))
        : '';
    $: bench = nextFixture ? readBench(c) : { plays: true, reason: '' };

    $: actionsLeft = Number.isFinite(summary.actionsLeft) ? summary.actionsLeft : c.weekly.actionsLeft;
    $: actionsMax = Number.isFinite(summary.actionsMax) ? summary.actionsMax : c.weekly.actionsMax;

    // ONE gate, shared with engine.doActivity(). This used to re-derive three
    // rules inline, which meant every new rule had to be written twice or the
    // screen and the engine would disagree about what is legal.
    $: activities = ACTIVITIES.map(a => {
        // 'train' is legal here and routed to the Training screen by the engine,
        // so it is gated on everything EXCEPT the engine's own redirect.
        const g = safeGate(c, a);
        return { act: a, disabled: !g.ok, reason: g.reason };
    });

    $: activityGroups = ACTIVITY_GROUPS
        .map(g => ({ ...g, rows: activities.filter(e => (e.act.group || 'practice') === g.id) }))
        .filter(g => g.rows.length);

    function safeGate(career, a) {
        try {
            const g = activityGate(career, a);
            return g && typeof g === 'object' ? g : { ok: true, reason: '' };
        } catch (e) {
            return { ok: false, reason: 'Unavailable.' };
        }
    }

    $: weekLog = (Array.isArray(c.weekly.log) ? c.weekly.log : [])
        .filter(e => e && typeof e === 'object');
    $: statusLine = safeStatusLine(c);
    $: squad = statusInfo(p.status);
    $: clubTier = p.clubTier ? CLUB_TIERS[p.clubTier] : null;
    $: scouts = p.clubId ? [] : safeInterest(c);
    $: gateProgress = Math.max(0, Math.min(1, (c.soloq.mmr || 0) / SCOUT_MMR_GATE));
    $: offers = Array.isArray(c.offers) ? c.offers : [];

    $: lastMatch = c.lastMatch || null;
    $: lastRating = lastMatch ? safeRating(lastMatch.rating) : null;
    $: lastKDA = lastMatch && lastMatch.kda
        ? fmtKDA(lastMatch.kda.k, lastMatch.kda.d, lastMatch.kda.a)
        : null;

    $: table = safeTable(c);
    $: myRow = table.find(r => r.isMine) || null;

    $: news = (Array.isArray(c.news) ? c.news : [])
        .filter(n => n && typeof n === 'object');
    $: shownNews = showAllNews ? news.slice(0, 40) : news.slice(0, 12);

    // What the week is for when there is no game on the calendar.
    const GUIDANCE = {
        preseason: 'Nothing counts yet. Bank the training weeks now - attribute gains carry into the split.',
        spring: 'Regular season. Train between fixtures and keep energy above the cost of a scrim block.',
        spring_po: 'Bracket weeks. Rest, review vods, and go into the series with form high.',
        msi: 'International break. If you are not there, the ladder and the gym are how you use it.',
        summer: 'Championship points weeks. Every win here decides whether the year ends at Worlds.',
        summer_po: 'The bracket that sends a team to Worlds. Nothing else this week matters.',
        worlds: 'Worlds weeks. Watching it from home is its own kind of motivation - train.',
        offseason: 'Contracts move now. Check Transfers, take the rest days, and decide where you play next year.',
    };
    $: guidance = GUIDANCE[phase.id] || 'Spend your activity slots and advance the week.';

    // ---------------------------------------------------------------
    //  actions
    // ---------------------------------------------------------------
    function goto(screen) {
        playSound('click');
        careerScreen.set(screen);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    }

    function playMatch() {
        if (!nextFixture || busy) return;
        busy = true;
        playSound('click');
        try {
            const m = startFixture(nextFixture.id);
            if (!m) showToast('That fixture cannot be started right now.', 'error');
            else saveCareer();
        } catch (e) {
            showToast('That fixture cannot be started right now.', 'error');
        }
        busy = false;
    }

    function simMatch() {
        if (!nextFixture || busy) return;
        busy = true;
        try {
            const res = simFixture(nextFixture.id);
            if (!res) {
                showToast('That fixture could not be simulated.', 'error');
            } else {
                playSound(res.won ? 'win' : 'lose');
                pushOverlay('result', res);
                saveCareer();
            }
        } catch (e) {
            showToast('That fixture could not be simulated.', 'error');
        }
        busy = false;
    }

    function runActivity(entry) {
        if (busy) return;
        if (entry.disabled) { showToast(entry.reason, 'error'); return; }
        const a = entry.act;

        if (a.id === 'train') { goto('training'); return; }

        busy = true;
        const before = get(career).weekly.log.length;
        let res = null;
        try { res = doActivity(a.id); } catch (e) { res = null; }
        res = res || { ok: false, msg: 'That did not work out.' };

        if (!res.ok) {
            showToast(res.msg || 'That did not work out.', 'error');
            busy = false;
            return;
        }

        playSound(a.id === 'rest' ? 'click' : 'claim');
        showToast(res.msg || (a.name + ' complete.'), 'success');

        // The engine may already have written the line; only add it when it
        // did not, so the timeline never doubles up.
        const log = get(career).weekly.log;
        const last = log[log.length - 1];
        if (res.detail && (log.length === before || !last || last.detail !== res.detail)) {
            logWeek(a.name, res.detail, a.accent);
        }

        flash = { id: a.id, text: res.detail || res.msg || '' };
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { flash = null; flashTimer = null; }, 7000);

        saveCareer();
        busy = false;
    }

    function endWeek() {
        if (busy) return;
        if (!gate.ok) { showToast(gate.reason || 'You cannot end the week yet.', 'error'); return; }
        busy = true;
        playSound('click');
        let res = null;
        try { res = advanceWeek(); } catch (e) { res = null; }
        res = res || {};

        // EVERY entry, in order. A week can now hand back two weekly events and
        // a pre-game one on top; reading events[0] threw the rest away, which is
        // what made the whole pre-game pool invisible from this button.
        const evs = Array.isArray(res.events)
            ? res.events
            : (res.events ? [res.events] : (res.event ? [res.event] : []));
        // pushOverlay, not set: rolling the week can already have raised a split
        // awards panel or a trait reveal, and the weekly events land last. The
        // queue is what keeps a second event from clobbering the first.
        for (const ev of evs) if (ev) pushOverlay('event', ev);

        if (res.yearRolled) showToast('A new competitive year begins.', 'info');
        else if (res.phaseChanged) showToast('New phase: ' + $currentPhase.name + '.', 'info');

        flash = null;
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
        saveCareer();
        if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
        busy = false;
    }

    function newsAccent(type) {
        return (NEWS_TYPES[type] || NEWS_TYPES.system).accent;
    }
    function newsLabel(type) {
        return (NEWS_TYPES[type] || NEWS_TYPES.system).label;
    }
    function pct(v) { return Math.round(Math.max(0, Math.min(1, v)) * 100); }
</script>

<div class="hub">
    <!-- ============ MAIN COLUMN ============ -->
    <div class="col main">

        <!-- ---------- NEXT UP ---------- -->
        <section class="panel block next" aria-labelledby="hub-next">
            <div class="blk-head">
                <h2 class="lbl" id="hub-next">Next Up</h2>
                <span class="phase-pill" style="--ph:{phase.accent}">
                    Week {c.time.week} &middot; {phase.name}
                </span>
            </div>

            {#if nextFixture && opponent}
                <div class="fx">
                    <div class="fx-top">
                        <div class="fx-meta">
                            <span class="fx-tag" style="--a:{opponent.accent}">{fixtureLabel}</span>
                            <span class="fx-bo">Best of {bestOf}</span>
                            {#if nextFixture.home}
                                <span class="fx-side">Home</span>
                            {:else}
                                <span class="fx-side">Away</span>
                            {/if}
                        </div>
                        <div class="fx-name" style="--a:{opponent.accent}">
                            <span class="fx-vs">vs</span>
                            <span class="fx-opp">{opponent.name}</span>
                        </div>
                        <p class="fx-desc">{oppLine}</p>
                    </div>

                    <div class="h2h" role="group" aria-label="Head to head team strength">
                        <div class="h2h-row">
                            <span class="h2h-team" style="--a:{myTeamAccent}">{myTeamName}</span>
                            <span class="h2h-team right" style="--a:{opponent.accent}">{opponent.name}</span>
                        </div>
                        <div class="h2h-bar">
                            <div class="h2h-fill mine" style="width:{(myPower / powerTotal) * 100}%; background:{myTeamAccent}"></div>
                            <div class="h2h-fill theirs" style="width:{(oppPower / powerTotal) * 100}%; background:{opponent.accent}"></div>
                        </div>
                        <div class="h2h-row nums">
                            <span class="h2h-n" style="color:{myTeamAccent}">{myPower}</span>
                            <span class="h2h-lbl">Team Strength</span>
                            <span class="h2h-n" style="color:{opponent.accent}">{oppPower}</span>
                        </div>
                    </div>

                    {#if !bench.plays}
                        <div class="benched" role="status">
                            <span class="benched-t">You are not starting this game.</span>
                            <span class="benched-d">{bench.reason}</span>
                        </div>
                        <div class="fx-btns">
                            <button class="btn-secondary wide" on:click={simMatch} disabled={busy}>
                                Simulate from the bench
                            </button>
                        </div>
                    {:else}
                        <div class="fx-btns">
                            <button class="btn-primary wide" on:click={playMatch} disabled={busy}>
                                Play Match
                            </button>
                            <button class="btn-secondary" on:click={simMatch} disabled={busy}>
                                Simulate
                            </button>
                        </div>
                    {/if}
                </div>

            {:else}
                <div class="fx empty-fx">
                    <div class="ef-head" style="--ph:{phase.accent}">
                        <span class="ef-phase">{phase.name}</span>
                        <span class="ef-weeks">Weeks {phase.from}&#x2013;{phase.to}</span>
                    </div>
                    <p class="ef-desc">{phase.desc}</p>
                    <p class="ef-guide">{guidance}</p>
                    {#if playedThisWeek.length}
                        <div class="ef-done">
                            {playedThisWeek.length} fixture{playedThisWeek.length === 1 ? '' : 's'} already played this week.
                        </div>
                    {/if}
                </div>
            {/if}
        </section>

        <!-- ---------- THIS WEEK ---------- -->
        <section class="panel block" aria-labelledby="hub-week">
            <div class="blk-head">
                <h2 class="lbl" id="hub-week">This Week</h2>
                <span class="slots">
                    <span class="slots-n">{actionsLeft}</span>
                    <span class="slots-l">of {actionsMax} slots</span>
                </span>
            </div>

            {#each activityGroups as grp (grp.id)}
                <div class="act-group">
                    <p class="act-group-h"><span>{grp.name}</span></p>
                    <div class="acts">
                        {#each grp.rows as entry (entry.act.id)}
                            {@const a = entry.act}
                            <button
                                class="act"
                                class:act-off={entry.disabled}
                                class:act-flash={flash && flash.id === a.id}
                                style="--a:{a.accent}"
                                on:click={() => runActivity(entry)}
                                disabled={entry.disabled || busy}
                                aria-label="{a.name} - {entry.disabled ? entry.reason : a.desc}"
                            >
                                <div class="act-top">
                                    <span class="act-ico" aria-hidden="true">{a.icon}</span>
                                    <span class="act-name">{a.name}</span>
                                    <span class="act-cost" class:gain={a.energy < 0}>
                                        {a.energy < 0 ? '+' + Math.abs(a.energy) : '-' + a.energy} EN
                                    </span>
                                </div>
                                <span class="act-desc">{a.desc}</span>
                                <span class="act-tags">
                                    {#if a.gold}<span class="act-tag act-tag-gold">{a.gold} gold</span>{/if}
                                    {#if a.once}<span class="act-tag">once a week</span>{/if}
                                    {#if a.minAge}<span class="act-tag">{a.minAge}+</span>{/if}
                                </span>
                                {#if entry.disabled}
                                    <span class="act-block">{entry.reason}</span>
                                {:else if a.id === 'train'}
                                    <span class="act-go">Opens the training room &#x2192;</span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            {/each}

            {#if flash}
                <div class="flash" role="status">{flash.text}</div>
            {/if}
        </section>

        <!-- ---------- BRACKET ---------- -->
        <!-- Only while one is actually running. The Season screen owns the
             permanent home for this; the Hub is where the player is standing
             the week they have a tie to play, and reading the draw should not
             cost them a navigation. -->
        {#if liveBracket}
            <section class="panel block" aria-labelledby="hub-bracket">
                <div class="blk-head">
                    <h2 class="lbl" id="hub-bracket">Bracket</h2>
                    <span class="mini">{phase.name}</span>
                </div>
                <BracketView
                    bracket={liveBracket}
                    myId={p.clubId}
                    myName={myTeamName}
                    myAccent={myTeamAccent}
                    accent={phase.accent || '#a78bfa'}
                    showHead={true}
                />
            </section>
        {/if}

        <!-- ---------- WEEK LOG ---------- -->
        <section class="panel block" aria-labelledby="hub-log">
            <div class="blk-head">
                <h2 class="lbl" id="hub-log">Week Log</h2>
                <span class="mini">{weekLog.length} entr{weekLog.length === 1 ? 'y' : 'ies'}</span>
            </div>

            {#if weekLog.length}
                <ol class="tl">
                    {#each weekLog as entry (entry.id)}
                        <li class="tl-item" style="--a:{entry.accent || '#3b82f6'}">
                            <span class="tl-dot" aria-hidden="true"></span>
                            <div class="tl-body">
                                <span class="tl-label">{entry.label}</span>
                                {#if entry.detail}<span class="tl-detail">{entry.detail}</span>{/if}
                            </div>
                        </li>
                    {/each}
                </ol>
            {:else}
                <p class="empty">
                    Nothing has happened yet this week. Spend an activity slot above and it shows up here.
                </p>
            {/if}
        </section>

        <!-- ---------- ADVANCE ---------- -->
        <section class="panel block adv" aria-labelledby="hub-adv">
            <div class="adv-in">
                <div class="adv-txt">
                    <h2 class="lbl" id="hub-adv">Advance</h2>
                    {#if gate.ok}
                        <p class="adv-line">
                            End week {c.time.week} and move to week {c.time.week + 1}{#if income && income.total > 0}, collecting {fmtGold(income.total)} gold{/if}.
                        </p>
                        {#if actionsLeft > 0}
                            <p class="adv-warn">
                                You still have {actionsLeft} unused activity slot{actionsLeft === 1 ? '' : 's'}. They do not carry over.
                            </p>
                        {/if}
                    {:else}
                        <p class="adv-line block-line">{gate.reason || 'You cannot end the week yet.'}</p>
                        {#each blockers as b}
                            <p class="adv-warn">{b}</p>
                        {/each}
                    {/if}
                </div>
                <button
                    class="btn-gold advbtn"
                    on:click={endWeek}
                    disabled={!gate.ok || busy}
                    aria-label="Advance to the next week"
                >
                    Advance Week &#x2192;
                </button>
            </div>
        </section>
    </div>

    <!-- ============ SIDE COLUMN ============ -->
    <div class="col side">

        <!-- ---------- CONTRACT / SCOUTING ---------- -->
        {#if p.clubId}
            <section class="panel block" aria-labelledby="hub-contract">
                <div class="blk-head">
                    <h2 class="lbl" id="hub-contract">Contract</h2>
                    <span class="stat-chip" style="--a:{squad.accent}">{squad.name}</span>
                </div>
                <p class="ct-line">{statusLine}</p>
                {#if clubTier}
                    <div class="ct-tier" style="--a:{clubTier.accent}">{clubTier.name}</div>
                {/if}

                <div class="meter-row">
                    <div class="meter-top">
                        <span class="meter-lbl">Chemistry</span>
                        <span class="meter-val">{Math.round(p.chemistry)}</span>
                    </div>
                    <div class="meter-bar">
                        <div class="meter-fill" style="width:{pct(p.chemistry / 100)}%"></div>
                    </div>
                    <span class="meter-note">
                        {#if p.chemistry >= 75}The room trusts you.
                        {:else if p.chemistry >= 50}Working relationship, nothing more.
                        {:else if p.chemistry >= 30}Scrims are quiet. Not in a good way.
                        {:else}The roster has stopped covering for you.{/if}
                    </span>
                </div>

                <button class="btn-secondary full" on:click={() => goto('club')}>Open Club</button>
            </section>
        {:else}
            <section class="panel block" aria-labelledby="hub-scout">
                <div class="blk-head">
                    <h2 class="lbl" id="hub-scout">Scouting</h2>
                    <span class="stat-chip" style="--a:{$soloRank.color}">{$soloRank.label}</span>
                </div>
                <p class="ct-line">{statusLine}</p>

                <div class="meter-row">
                    <div class="meter-top">
                        <span class="meter-lbl">Scout Radar</span>
                        <span class="meter-val">{c.soloq.mmr} / {SCOUT_MMR_GATE}</span>
                    </div>
                    <div class="meter-bar">
                        <div class="meter-fill scout" style="width:{pct(gateProgress)}%"></div>
                    </div>
                    <span class="meter-note">
                        {#if c.soloq.mmr >= SCOUT_MMR_GATE}
                            You are on the radar. Keep the ladder climbing and offers will follow.
                        {:else}
                            Scouts start watching at Diamond IV. Grind solo queue to get seen.
                        {/if}
                    </span>
                </div>

                <div class="scout-list">
                    <div class="scout-head">
                        <span class="scout-n">{scouts.length}</span>
                        <span class="scout-l">club{scouts.length === 1 ? '' : 's'} watching</span>
                    </div>
                    {#if scouts.length}
                        {#each scouts as row (row.team.id)}
                            <div class="scout-row" style="--a:{row.team.accent}">
                                <span class="scout-team">{row.team.name}</span>
                                <span class="scout-int">{row.interest}</span>
                            </div>
                        {/each}
                    {:else}
                        <p class="empty small">Nobody is watching yet. Rating and rank are what put you on a list.</p>
                    {/if}
                </div>

                <button class="btn-secondary full" on:click={() => goto('transfers')}>Open Transfers</button>
            </section>
        {/if}

        <!-- ---------- OFFERS ---------- -->
        <section class="panel block offers" class:offers-live={offers.length > 0} aria-labelledby="hub-offers">
            <div class="off-in">
                <div class="off-txt">
                    <h2 class="lbl" id="hub-offers">Offers</h2>
                    {#if offers.length}
                        <p class="off-line">
                            {offers.length} contract offer{offers.length === 1 ? '' : 's'} on the table.
                        </p>
                    {:else}
                        <p class="off-line muted">No offers right now.</p>
                    {/if}
                </div>
                <div class="off-right">
                    <span class="off-badge" class:off-zero={!offers.length}>{offers.length}</span>
                    <button class="btn-secondary" on:click={() => goto('transfers')} aria-label="Open the transfers screen">
                        View
                    </button>
                </div>
            </div>
        </section>

        <!-- ---------- LAST MATCH ---------- -->
        <section class="panel block" aria-labelledby="hub-last">
            <div class="blk-head">
                <h2 class="lbl" id="hub-last">Last Match</h2>
                {#if lastMatch}
                    <span class="mini">W{lastMatch.week ?? c.time.week} &middot; {lastMatch.year ?? c.time.year}</span>
                {/if}
            </div>

            {#if lastMatch}
                <div class="lm" class:lm-win={lastMatch.won} class:lm-loss={!lastMatch.won}>
                    <div class="lm-top">
                        <span class="lm-res">{lastMatch.won ? 'WIN' : 'LOSS'}</span>
                        <span class="lm-score">
                            {(lastMatch.score && lastMatch.score[0]) || 0}&#8211;{(lastMatch.score && lastMatch.score[1]) || 0}
                        </span>
                        <span class="lm-opp">vs {lastMatch.opponentName || 'Unknown'}</span>
                    </div>

                    {#if lastMatch.played === false}
                        <p class="lm-bench">{lastMatch.benchReason || 'You did not play in this one.'}</p>
                    {:else}
                        <div class="lm-stats">
                            <div class="lm-cell">
                                <span class="lm-k">KDA</span>
                                <span class="lm-v">{lastKDA ? lastKDA.line : '0/0/0'}</span>
                            </div>
                            <div class="lm-cell">
                                <span class="lm-k">Ratio</span>
                                <span class="lm-v">{lastKDA ? lastKDA.ratio.toFixed(2) : '0.00'}</span>
                            </div>
                            <div class="lm-cell">
                                <span class="lm-k">CS</span>
                                <span class="lm-v">{Math.round(lastMatch.cs || 0)}</span>
                            </div>
                            <div class="lm-cell">
                                <span class="lm-k">Rating</span>
                                <span class="lm-v" style="color:{lastRating.color}">{lastRating.label}</span>
                            </div>
                        </div>
                        {#if lastMatch.mvp}
                            <div class="lm-mvp">Player of the Game</div>
                        {/if}
                    {/if}

                    {#if lastMatch.headline}
                        <p class="lm-head">&ldquo;{lastMatch.headline}&rdquo;</p>
                    {/if}
                </div>
            {:else}
                <p class="empty">
                    You have not played a competitive game yet. Your first result lands here.
                </p>
            {/if}
        </section>

        <!-- ---------- SEASON ---------- -->
        <section class="panel block" aria-labelledby="hub-season">
            <div class="blk-head">
                <h2 class="lbl" id="hub-season">Season</h2>
                <span class="mini">{c.season.split === 'summer' ? 'Summer' : 'Spring'} {c.time.year}</span>
            </div>

            <div class="sn-grid">
                <div class="sn-cell">
                    <span class="sn-k">Record</span>
                    <span class="sn-v">{fmtRecord(c.season.wins, c.season.losses)}</span>
                </div>
                <div class="sn-cell">
                    <span class="sn-k">Games</span>
                    <span class="sn-v">{(c.season.gameWins || 0) + (c.season.gameLosses || 0)}</span>
                </div>
                <div class="sn-cell">
                    <span class="sn-k">Champ Pts</span>
                    <span class="sn-v gold">{c.season.champPoints || 0}</span>
                </div>
            </div>

            {#if myRow}
                <div class="sn-row" style="--a:{myRow.team.accent}">
                    <span class="sn-rank">{ordinal(myRow.rank)}</span>
                    <span class="sn-team">{myRow.team.name}</span>
                    <span class="sn-rec">{myRow.w}&#8211;{myRow.l}</span>
                </div>
                <span class="sn-note">
                    {#if myRow.rank <= 1}Top of the table. Everyone is measuring themselves against you.
                    {:else if myRow.rank <= 6}Inside the playoff cut with {table.length - myRow.rank} team{table.length - myRow.rank === 1 ? '' : 's'} below you.
                    {:else}Outside the top six. That has to change before the split ends.{/if}
                </span>
            {:else}
                <p class="empty small">
                    No division table yet. It appears once your season is generated.
                </p>
            {/if}

            <button class="btn-secondary full" on:click={() => goto('calendar')}>Full Season</button>
        </section>

        <!-- ---------- NEWS ---------- -->
        <section class="panel block" aria-labelledby="hub-news">
            <div class="blk-head">
                <h2 class="lbl" id="hub-news">News</h2>
                {#if news.length > 12}
                    <button class="linkbtn" on:click={() => { showAllNews = !showAllNews; }}>
                        {showAllNews ? 'Show less' : 'Show all (' + news.length + ')'}
                    </button>
                {/if}
            </div>

            {#if news.length}
                <ul class="feed">
                    {#each shownNews as n (n.id)}
                        <li class="feed-item" style="--a:{newsAccent(n.type)}">
                            <div class="feed-top">
                                <span class="feed-type">{newsLabel(n.type)}</span>
                                <span class="feed-when">W{n.week ?? c.time.week} &middot; {n.year ?? c.time.year}</span>
                            </div>
                            {#if n.text}<p class="feed-txt">{n.text}</p>{/if}
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="empty">
                    The feed is quiet. Results, transfers and awards all report here as your career moves.
                </p>
            {/if}
        </section>
    </div>
</div>

<style>
    /* ===================== LAYOUT ===================== */
    .hub {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
        gap: 18px;
        align-items: start;
        width: 100%;
    }
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

    .block {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.32);
        border-radius: 16px;
        padding: 18px;
        min-width: 0;
    }
    .blk-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 14px;
    }
    .lbl {
        margin: 0;
        font-size: 10px; font-weight: 800; letter-spacing: 1.6px;
        text-transform: uppercase; color: #3f5069;
    }
    .mini { font-size: 10px; font-weight: 700; color: #334155; letter-spacing: 0.4px; }

    .empty {
        margin: 0;
        font-size: 12px; line-height: 1.65; color: #52658a;
        padding: 14px;
        border-radius: 12px;
        border: 1px dashed rgba(51, 65, 85, 0.4);
        background: rgba(15, 23, 42, 0.32);
    }
    .empty.small { font-size: 11px; padding: 11px; line-height: 1.55; }

    .full { width: 100%; margin-top: 12px; }
    .wide { flex: 1; }

    .linkbtn {
        background: none; border: none; padding: 0; cursor: pointer;
        font-family: inherit; font-size: 10px; font-weight: 800;
        letter-spacing: 0.6px; color: #7c8fb0;
    }
    .linkbtn:hover { color: #c4b5fd; }

    /* ===================== NEXT UP ===================== */
    .next { border-color: rgba(139, 92, 246, 0.24); }
    .phase-pill {
        font-size: 9px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 4px 9px; border-radius: 6px;
        color: var(--ph);
        background: color-mix(in srgb, var(--ph) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--ph) 28%, transparent);
        white-space: nowrap;
    }

    .fx { display: flex; flex-direction: column; gap: 16px; }
    .fx-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
    .fx-tag {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px;
        color: var(--a);
        background: color-mix(in srgb, var(--a) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--a) 30%, transparent);
    }
    .fx-bo, .fx-side {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px;
        color: #5a6d8e;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.35);
    }
    .fx-name { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
    .fx-vs { font-size: 12px; font-weight: 700; color: #475569; }
    .fx-opp {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 26px; font-weight: 700; line-height: 1.1; letter-spacing: -0.015em;
        color: var(--a);
    }
    .fx-desc {
        margin: 8px 0 0;
        font-size: 12px; line-height: 1.65; color: #6a7d9d;
    }

    .h2h {
        padding: 14px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.28);
    }
    .h2h-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .h2h-team {
        font-size: 11px; font-weight: 800; color: var(--a);
        max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .h2h-team.right { text-align: right; }
    .h2h-bar {
        display: flex; gap: 3px;
        height: 8px; margin: 9px 0 7px;
        border-radius: 4px; overflow: hidden;
        background: rgba(148, 163, 184, 0.08);
    }
    .h2h-fill { height: 100%; border-radius: 3px; transition: width 0.35s ease; opacity: 0.85; }
    .h2h-row.nums { align-items: center; }
    .h2h-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 15px; font-weight: 800;
    }
    .h2h-lbl {
        font-size: 8px; font-weight: 800; letter-spacing: 1.2px;
        text-transform: uppercase; color: #334155;
    }

    .benched {
        display: flex; flex-direction: column; gap: 5px;
        padding: 13px 14px;
        border-radius: 12px;
        background: rgba(239, 68, 68, 0.07);
        border: 1px solid rgba(239, 68, 68, 0.24);
    }
    .benched-t { font-size: 12.5px; font-weight: 800; color: #fca5a5; }
    .benched-d { font-size: 11.5px; line-height: 1.55; color: #93748a; }

    .fx-btns { display: flex; gap: 10px; flex-wrap: wrap; }
    .fx-btns button { flex: 1 1 140px; }
    .fx-btns button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

    .empty-fx {
        padding: 16px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.32);
        border: 1px dashed rgba(51, 65, 85, 0.4);
        gap: 10px;
    }
    .ef-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .ef-phase {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 19px; font-weight: 700; color: var(--ph);
    }
    .ef-weeks {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 700; color: #3f5069;
    }
    .ef-desc { margin: 0; font-size: 13px; line-height: 1.6; color: #93a5c4; }
    .ef-guide { margin: 0; font-size: 12px; line-height: 1.65; color: #5f7392; }
    .ef-done {
        font-size: 10px; font-weight: 800; letter-spacing: 0.6px;
        text-transform: uppercase; color: #22c55e;
    }

    /* ===================== ACTIVITIES ===================== */
    .slots {
        display: flex; align-items: baseline; gap: 5px;
        padding: 4px 10px; border-radius: 8px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(51, 65, 85, 0.3);
        white-space: nowrap;
    }
    .slots-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 13px; font-weight: 800; color: #a78bfa;
    }
    .slots-l { font-size: 9px; font-weight: 700; color: #475569; }

    .acts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
        gap: 10px;
    }

    /* Fourteen activities against a three-slot week needs sections, or the
       board reads as one undifferentiated wall of buttons. */
    .act-group + .act-group { margin-top: 16px; }
    .act-group-h {
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 9px;
        font-size: 9px; font-weight: 800; letter-spacing: 2px;
        text-transform: uppercase; color: #475569;
    }
    .act-group-h::after {
        content: ''; flex: 1; height: 1px; background: rgba(51, 65, 85, 0.35);
    }
    .act-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .act-tag {
        font-size: 8.5px; font-weight: 800; letter-spacing: 0.5px;
        text-transform: uppercase; color: #64748b;
        background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.4);
        padding: 2px 6px; border-radius: 5px;
    }
    .act-tag-gold { color: #eab308; border-color: rgba(234, 179, 8, 0.28); }
    .act {
        display: flex; flex-direction: column; gap: 7px;
        text-align: left;
        padding: 13px;
        border-radius: 13px;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.3);
        border-left: 2px solid color-mix(in srgb, var(--a) 55%, transparent);
        font-family: inherit;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }
    .act:hover:not(:disabled) {
        background: rgba(30, 41, 59, 0.55);
        border-color: color-mix(in srgb, var(--a) 40%, transparent);
        border-left-color: var(--a);
        transform: translateY(-1px);
    }
    .act:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
    .act-off, .act:disabled { opacity: 0.45; cursor: not-allowed; }
    .act-flash { border-color: color-mix(in srgb, var(--a) 55%, transparent); background: color-mix(in srgb, var(--a) 8%, rgba(15,23,42,0.5)); }

    .act-top { display: flex; align-items: center; gap: 8px; }
    .act-ico { font-size: 14px; line-height: 1; }
    .act-name {
        flex: 1; min-width: 0;
        font-size: 12.5px; font-weight: 800; color: #dbe5f5;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .act-cost {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 9.5px; font-weight: 800; color: #f87171; white-space: nowrap;
    }
    .act-cost.gain { color: #34d399; }
    .act-desc { display: block; margin: 0; font-size: 10.5px; line-height: 1.55; color: #5a6d8e; white-space: normal; }
    .act-block {
        font-size: 9.5px; font-weight: 800; letter-spacing: 0.4px;
        color: #f59e0b;
    }
    .act-go { font-size: 9.5px; font-weight: 800; letter-spacing: 0.4px; color: var(--a); }

    .flash {
        margin-top: 12px;
        padding: 10px 13px;
        border-radius: 10px;
        font-size: 11.5px; line-height: 1.55; color: #a5b4d0;
        background: rgba(139, 92, 246, 0.08);
        border: 1px solid rgba(139, 92, 246, 0.24);
    }

    /* ===================== WEEK LOG ===================== */
    .tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .tl-item {
        position: relative;
        display: flex; gap: 12px;
        padding: 0 0 13px 0;
    }
    .tl-item::before {
        content: '';
        position: absolute;
        left: 4px; top: 13px; bottom: 0;
        width: 1px;
        background: rgba(51, 65, 85, 0.4);
    }
    .tl-item:last-child { padding-bottom: 0; }
    .tl-item:last-child::before { display: none; }
    .tl-dot {
        flex-shrink: 0;
        width: 9px; height: 9px; margin-top: 4px;
        border-radius: 50%;
        background: var(--a);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--a) 16%, transparent);
    }
    .tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .tl-label { font-size: 11.5px; font-weight: 800; color: var(--a); }
    .tl-detail { font-size: 11.5px; line-height: 1.55; color: #7b8dab; }

    /* ===================== ADVANCE ===================== */
    .adv { border-color: rgba(245, 158, 11, 0.22); }
    .adv-in {
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px; flex-wrap: wrap;
    }
    .adv-txt { flex: 1 1 240px; min-width: 0; }
    .adv-txt .lbl { margin-bottom: 7px; }
    .adv-line { margin: 0; font-size: 12.5px; line-height: 1.6; color: #93a5c4; }
    .adv-line.block-line { color: #fca5a5; font-weight: 700; }
    .adv-warn { margin: 5px 0 0; font-size: 11px; line-height: 1.5; color: #6a7d9d; }
    .advbtn { flex-shrink: 0; padding: 13px 26px; font-size: 13px; }
    .advbtn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }

    /* ===================== SIDE: CONTRACT ===================== */
    .stat-chip {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px;
        color: var(--a);
        background: color-mix(in srgb, var(--a) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--a) 30%, transparent);
        white-space: nowrap;
    }
    .ct-line { margin: 0; font-size: 11.5px; line-height: 1.6; color: #8fa1c0; }
    .ct-tier {
        margin-top: 9px;
        display: inline-block;
        font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px;
        color: var(--a);
        border: 1px solid color-mix(in srgb, var(--a) 30%, transparent);
    }

    .meter-row { margin-top: 14px; }
    .meter-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
    .meter-lbl { font-size: 9px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #3f5069; }
    .meter-val {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #cbd5e1;
    }
    .meter-bar { height: 5px; border-radius: 3px; background: rgba(148, 163, 184, 0.1); overflow: hidden; }
    .meter-fill { height: 100%; border-radius: 3px; background: #a78bfa; transition: width 0.3s ease; }
    .meter-fill.scout { background: #22d3ee; }
    .meter-note { display: block; margin-top: 7px; font-size: 10.5px; line-height: 1.55; color: #55688a; }

    /* ===================== SIDE: SCOUTING ===================== */
    .scout-list { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
    .scout-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
    .scout-n {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 16px; font-weight: 800; color: #22d3ee;
    }
    .scout-l { font-size: 9.5px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase; color: #3f5069; }
    .scout-row {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 7px 10px;
        border-radius: 9px;
        background: rgba(15, 23, 42, 0.45);
        border-left: 2px solid var(--a);
    }
    .scout-team {
        font-size: 11px; font-weight: 700; color: #c3d0e6;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .scout-int {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: var(--a);
    }

    /* ===================== SIDE: OFFERS ===================== */
    .offers-live { border-color: rgba(168, 85, 247, 0.32); }
    .off-in { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .off-txt { min-width: 0; }
    .off-txt .lbl { margin-bottom: 5px; }
    .off-line { margin: 0; font-size: 11.5px; line-height: 1.5; color: #c4b5fd; font-weight: 700; }
    .off-line.muted { color: #52658a; font-weight: 600; }
    .off-right { display: flex; align-items: center; gap: 10px; }
    .off-badge {
        display: grid; place-items: center;
        min-width: 32px; height: 32px; padding: 0 8px;
        border-radius: 9px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 15px; font-weight: 800;
        color: #c4b5fd;
        background: rgba(139, 92, 246, 0.14);
        border: 1px solid rgba(139, 92, 246, 0.32);
    }
    .off-badge.off-zero { color: #475569; background: rgba(15, 23, 42, 0.5); border-color: rgba(51, 65, 85, 0.32); }

    /* ===================== SIDE: LAST MATCH ===================== */
    .lm {
        padding: 13px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.45);
        border: 1px solid rgba(51, 65, 85, 0.3);
    }
    .lm-win { border-left: 3px solid #22c55e; }
    .lm-loss { border-left: 3px solid #ef4444; }
    .lm-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
    .lm-res { font-size: 10px; font-weight: 800; letter-spacing: 1.3px; }
    .lm-win .lm-res { color: #22c55e; }
    .lm-loss .lm-res { color: #ef4444; }
    .lm-score {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 18px; font-weight: 800; color: #e8eefb;
    }
    .lm-opp {
        flex: 1; min-width: 0;
        font-size: 11px; font-weight: 700; color: #6a7d9d;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .lm-stats {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px; margin-top: 12px;
    }
    .lm-cell { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .lm-k { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #334155; }
    .lm-v {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 800; color: #cbd5e1;
        overflow: hidden; text-overflow: ellipsis;
    }
    .lm-mvp {
        margin-top: 10px;
        display: inline-block;
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
        padding: 3px 8px; border-radius: 5px;
        color: #eab308;
        background: rgba(234, 179, 8, 0.12);
        border: 1px solid rgba(234, 179, 8, 0.3);
    }
    .lm-bench { margin: 10px 0 0; font-size: 11px; line-height: 1.55; color: #7d6a8e; }
    .lm-head { margin: 11px 0 0; font-size: 11px; line-height: 1.6; font-style: italic; color: #64748b; }

    /* ===================== SIDE: SEASON ===================== */
    .sn-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .sn-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .sn-k { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #334155; }
    .sn-v {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 16px; font-weight: 800; color: #e2e8f0;
    }
    .sn-v.gold { color: #eab308; }
    .sn-row {
        display: flex; align-items: center; gap: 10px;
        margin-top: 13px;
        padding: 9px 11px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.5);
        border-left: 2px solid var(--a);
    }
    .sn-rank {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 12px; font-weight: 800; color: var(--a);
        flex-shrink: 0;
    }
    .sn-team {
        flex: 1; min-width: 0;
        font-size: 11.5px; font-weight: 700; color: #dbe5f5;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sn-rec {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #7b8dab;
    }
    .sn-note { display: block; margin-top: 8px; font-size: 10.5px; line-height: 1.55; color: #55688a; }

    /* ===================== SIDE: NEWS ===================== */
    .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .feed-item {
        padding: 9px 11px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.42);
        border-left: 2px solid var(--a);
        min-width: 0;
    }
    .feed-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .feed-type {
        font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        color: var(--a);
    }
    .feed-when {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 9px; font-weight: 700; color: #334155; white-space: nowrap;
    }
    .feed-txt { margin: 0; font-size: 11.5px; line-height: 1.55; color: #8fa1c0; }

    /* ===================== RESPONSIVE ===================== */
    @media (max-width: 1000px) {
        .hub { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 620px) {
        .block { padding: 14px; border-radius: 14px; }
        .fx-opp { font-size: 21px; }
        .acts { grid-template-columns: minmax(0, 1fr); }
        .adv-in { flex-direction: column; align-items: stretch; }
        .advbtn { width: 100%; }
        .lm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .fx-btns button { flex: 1 1 100%; }
    }
    @media (max-width: 360px) {
        .sn-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .h2h-lbl { display: none; }
    }
</style>
