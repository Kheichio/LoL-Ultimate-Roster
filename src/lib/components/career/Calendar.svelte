<script>
    // =======================================================================
    //  LoL ULTIMATE CAREER -- SEASON
    // =======================================================================
    //  The whole competitive year on one page: the 40-week phase rail, the
    //  current split's record, every fixture grouped by week, the live playoff
    //  bracket, the advance-week control and the history table.
    //
    //  The engine owns season.schedule and season.bracket, so everything here
    //  reads defensively: a missing field means "nothing to show yet", never a
    //  crash. A brand-new pre-competitive player has no club, no fixtures and
    //  no history, and every section below has a real empty state for that.
    //
    //  ASCII only. Emoji are HTML entities / \u escapes.

    import { onMount } from 'svelte';
    import { get } from 'svelte/store';

    import {
        career, careerOverlay, pushOverlay, currentTeam, currentPhase, careerOVR, saveCareer,
    } from '../../stores/career.js';
    import { showToast } from '../../stores/toasts.js';
    import { playSound } from '../../utils/sound.js';

    import {
        PHASES, WEEKS_PER_YEAR, phaseForWeek, teamById, REGION_BY_ID,
    } from '../../career/constants.js';
    import { fmtRecord, ordinal } from '../../career/ratings.js';
    import {
        teamStrength, teamStrengthWithPlayer, winChance, FREE_AGENT_ID,
    } from '../../career/teams.js';
    import { matchRatingLabel } from '../../career/match.js';
    import {
        ensureSeason, canAdvanceWeek, advanceWeek,
        startFixture, simFixture, completeMatch,
    } from '../../career/engine.js';

    // -- local helpers ----------------------------------------------------
    const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const SPLIT_NAME = { spring: 'Spring Split', summer: 'Summer Split' };
    const MSI_PHASE = PHASES.find(p => p.id === 'msi') || PHASES[3];
    const WLD_PHASE = PHASES.find(p => p.id === 'worlds') || PHASES[6];

    let busy = false;
    let pendingInterview = null;

    onMount(() => {
        try { ensureSeason(); } catch (e) { /* engine decides when a season exists */ }
    });

    // Chain an interview behind the result overlay: the overlay store only
    // holds one thing at a time, so wait for the result to be dismissed.
    $: if (!$careerOverlay && pendingInterview) {
        const iv = pendingInterview;
        pendingInterview = null;
        pushOverlay('interview', iv);
    }

    // -- state reads ------------------------------------------------------
    $: c = $career;
    $: season = c.season || {};
    $: week = num(c.time.week, 1);
    $: year = num(c.time.year, 2026);
    $: phase = $currentPhase;
    $: region = REGION_BY_ID[c.player.region] || REGION_BY_ID.LEC;
    $: splitLabel = SPLIT_NAME[season.split] || 'Preseason';
    $: schedule = Array.isArray(season.schedule) ? season.schedule : [];
    $: qualified = season.qualified || {};

    $: myTeamName = $currentTeam ? $currentTeam.name : c.player.handle || 'Free Agent';
    $: myAccent = $currentTeam ? $currentTeam.accent : '#22c55e';
    $: myId = c.player.clubId || FREE_AGENT_ID;
    $: myStrength = $currentTeam
        ? teamStrengthWithPlayer(c, $currentTeam)
        : Math.max(35, $careerOVR);

    // -- phase rail -------------------------------------------------------
    $: markerPct = Math.max(0, Math.min(100, ((week - 0.5) / WEEKS_PER_YEAR) * 100));

    // -- fixtures grouped by week -----------------------------------------
    function groupWeeks(list) {
        const map = new Map();
        for (const f of list) {
            if (!f) continue;
            const w = num(f.week, 0);
            if (!map.has(w)) map.set(w, []);
            map.get(w).push(f);
        }
        return [...map.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([w, fixtures]) => ({ week: w, phase: phaseForWeek(w), fixtures }));
    }
    $: weekGroups = groupWeeks(schedule);
    $: playedCount = schedule.filter(f => f && f.played).length;

    function opponentOf(f) {
        const t = teamById(f && f.opponentId);
        return t || { id: f && f.opponentId, name: 'To be confirmed', accent: '#475569', tier: 3, strength: 50 };
    }

    function strengthOf(o) {
        try {
            const v = teamStrength(o, year);
            return Number.isFinite(v) ? v : num(o && o.strength, 50);
        } catch (e) {
            return num(o && o.strength, 50);
        }
    }

    function fixtureScore(f) {
        const s = f && f.score;
        if (Array.isArray(s) && s.length >= 2) return num(s[0]) + '-' + num(s[1]);
        if (typeof s === 'string' && s) return s;
        if (s && typeof s === 'object') {
            return num(s.my ?? s.a ?? s.mine) + '-' + num(s.opp ?? s.b ?? s.them);
        }
        return f && f.won ? '1-0' : '0-1';
    }

    function ratingChip(f) {
        const r = f && f.myRating;
        if (r === null || r === undefined || !Number.isFinite(Number(r))) return null;
        const v = Math.round(Number(r) * 10) / 10;
        let tone = { label: '', color: '#94a3b8' };
        try { tone = matchRatingLabel(v) || tone; } catch (e) { /* cosmetic only */ }
        return { value: v.toFixed(1), label: tone.label || '', color: tone.color || '#94a3b8' };
    }

    function oddsFor(f) {
        try {
            const pct = Math.round(winChance(myStrength, strengthOf(opponentOf(f))) * 100);
            return Number.isFinite(pct) ? pct : null;
        } catch (e) { return null; }
    }

    // -- bracket normalisation --------------------------------------------
    //  The engine owns the bracket shape. Accept the plausible ones rather
    //  than guessing exactly one and rendering nothing for the rest.
    function bracketTeam(ref) {
        if (ref === null || ref === undefined) return null;
        if (typeof ref === 'string') {
            const t = teamById(ref);
            return {
                id: ref,
                name: t ? t.name : (ref === myId ? myTeamName : 'TBD'),
                accent: t ? t.accent : (ref === myId ? myAccent : '#475569'),
                score: null,
            };
        }
        if (typeof ref !== 'object') return null;
        const id = ref.id || ref.teamId || (typeof ref.team === 'string' ? ref.team : null);
        const t = id ? teamById(id) : null;
        const sc = ref.score ?? ref.wins ?? ref.games;
        return {
            id: id || null,
            name: ref.name || (t ? t.name : (id === myId ? myTeamName : 'TBD')),
            accent: ref.accent || (t ? t.accent : (id === myId ? myAccent : '#475569')),
            score: Number.isFinite(Number(sc)) ? Number(sc) : null,
        };
    }

    function normalizeTie(raw) {
        if (!raw || typeof raw !== 'object') return null;
        let ra = null, rb = null;
        if (Array.isArray(raw.teams)) { ra = raw.teams[0]; rb = raw.teams[1]; }
        else if (Array.isArray(raw.sides)) { ra = raw.sides[0]; rb = raw.sides[1]; }
        else {
            ra = raw.a ?? raw.home ?? raw.teamA ?? raw.top ?? raw.left ?? raw.one;
            rb = raw.b ?? raw.away ?? raw.teamB ?? raw.bottom ?? raw.right ?? raw.two;
        }
        const A = bracketTeam(ra);
        const B = bracketTeam(rb);
        if (!A && !B) return null;

        let sa = null, sb = null;
        if (Array.isArray(raw.score) && raw.score.length >= 2) { sa = raw.score[0]; sb = raw.score[1]; }
        else if (Array.isArray(raw.result) && raw.result.length >= 2) { sa = raw.result[0]; sb = raw.result[1]; }
        else {
            sa = raw.scoreA ?? raw.aScore ?? raw.homeScore ?? raw.winsA;
            sb = raw.scoreB ?? raw.bScore ?? raw.awayScore ?? raw.winsB;
        }
        if (!Number.isFinite(Number(sa)) && A) sa = A.score;
        if (!Number.isFinite(Number(sb)) && B) sb = B.score;
        const hasScore = Number.isFinite(Number(sa)) || Number.isFinite(Number(sb));

        const wref = raw.winner ?? raw.winnerId ?? raw.won;
        const wid = typeof wref === 'string' ? wref : (wref && typeof wref === 'object' ? (wref.id || wref.teamId) : null);

        const aScore = Number.isFinite(Number(sa)) ? Number(sa) : 0;
        const bScore = Number.isFinite(Number(sb)) ? Number(sb) : 0;
        const aWon = wid ? (A && A.id === wid) : (hasScore && aScore > bScore);
        const bWon = wid ? (B && B.id === wid) : (hasScore && bScore > aScore);

        return {
            label: raw.label || raw.name || (raw.bestOf ? 'Bo' + raw.bestOf : ''),
            done: !!(wid || (hasScore && aScore !== bScore)),
            hasScore,
            a: A ? { ...A, score: aScore, won: !!aWon, mine: !!A.id && A.id === myId } : null,
            b: B ? { ...B, score: bScore, won: !!bWon, mine: !!B.id && B.id === myId } : null,
        };
    }

    function roundName(i, total, given) {
        if (given) return given;
        const fromEnd = total - 1 - i;
        if (fromEnd === 0) return 'Final';
        if (fromEnd === 1) return 'Semifinals';
        if (fromEnd === 2) return 'Quarterfinals';
        return 'Round ' + (i + 1);
    }

    function normalizeBracket(b) {
        if (!b || typeof b !== 'object') return null;

        let rawRounds = [];
        if (Array.isArray(b.rounds)) {
            rawRounds = b.rounds;
        } else {
            const flat = Array.isArray(b.matches) ? b.matches
                : Array.isArray(b.ties) ? b.ties
                : Array.isArray(b.series) ? b.series : [];
            if (flat.length) {
                const map = new Map();
                flat.forEach((m, i) => {
                    const key = m && (m.round ?? m.roundIndex ?? m.stage);
                    const k = key === undefined || key === null ? 0 : key;
                    if (!map.has(k)) map.set(k, []);
                    map.get(k).push(m);
                });
                rawRounds = [...map.entries()]
                    .sort((x, y) => (typeof x[0] === 'number' && typeof y[0] === 'number' ? x[0] - y[0] : 0))
                    .map(([k, ties]) => ({ name: typeof k === 'string' ? k : '', ties }));
            }
        }

        const rounds = rawRounds.map((r, i) => {
            const ties = Array.isArray(r)
                ? r
                : (r && (r.ties || r.matches || r.series || r.games || r.pairs)) || [];
            return {
                name: roundName(i, rawRounds.length, !Array.isArray(r) && r ? (r.name || r.label) : ''),
                ties: (Array.isArray(ties) ? ties : []).map(normalizeTie).filter(Boolean),
            };
        }).filter(r => r.ties.length);

        if (!rounds.length) return null;

        const kind = String(b.kind ?? b.phase ?? b.id ?? '').toLowerCase();
        const ph = PHASES.find(p => kind && (p.id === kind || kind.includes(p.id)));
        const champRef = b.champion ?? b.winner ?? b.winnerId ?? b.championId;
        const champ = bracketTeam(champRef);

        return {
            title: b.title || b.name || (ph ? ph.name : 'Playoff Bracket'),
            accent: ph ? ph.accent : '#a78bfa',
            bestOf: num(b.bestOf, 0),
            champion: champ && champ.id ? champ : null,
            rounds,
        };
    }
    $: bracket = normalizeBracket(season.bracket);

    // -- history ----------------------------------------------------------
    const SPLIT_ORDER = { spring: 0, summer: 1 };
    $: history = (Array.isArray(c.history) ? c.history : [])
        .filter(Boolean)
        .slice()
        .sort((a, b) => (num(b.year) - num(a.year))
            || ((SPLIT_ORDER[b.split] ?? 0) - (SPLIT_ORDER[a.split] ?? 0)));

    function historyTeam(h) {
        const t = teamById(h && h.teamId);
        if (t) return { name: t.name, accent: t.accent };
        return { name: h && h.teamName ? h.teamName : 'Unsigned', accent: '#475569' };
    }

    function placementText(h) {
        const p = h && h.placement;
        if (p === null || p === undefined || p === '') return '--';
        if (Number.isFinite(Number(p))) return ordinal(Number(p));
        return String(p);
    }

    function awardNames(h) {
        const list = Array.isArray(h && h.awards) ? h.awards : [];
        return list.map(a => {
            if (!a) return null;
            if (typeof a === 'string') return { name: a, icon: '\u{1F3C5}' };
            return { name: a.name || a.id || 'Award', icon: a.icon || '\u{1F3C5}' };
        }).filter(Boolean);
    }

    // -- advance ----------------------------------------------------------
    function safeCan(state) {
        try {
            const r = canAdvanceWeek(state);
            if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || '' };
            return { ok: !!r, reason: '' };
        } catch (e) {
            return { ok: false, reason: 'The season is still being set up.' };
        }
    }
    $: adv = safeCan(c);
    $: advLabel = week >= WEEKS_PER_YEAR ? 'Advance to ' + (year + 1) : 'Advance to Week ' + (week + 1);

    function doAdvance() {
        if (busy || !adv.ok) return;
        busy = true;
        playSound('click');
        let r = null;
        try { r = advanceWeek(); } catch (e) { r = null; }
        busy = false;
        if (!r) { showToast('Could not advance the week.', 'error'); return; }
        saveCareer();

        const raw = r.events;
        const evs = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        const choice = evs.find(e => e && Array.isArray(e.options) && e.options.length);
        if (choice) pushOverlay('event', choice);

        const now = get(career);
        if (r.yearRolled) showToast('The ' + now.time.year + ' season begins.', 'success');
        else if (r.phaseChanged) showToast(phaseForWeek(now.time.week).name + ' begins.', 'info');
        else showToast('Week ' + now.time.week + '.', 'info');
    }

    // -- match actions ----------------------------------------------------
    function doPlay(f) {
        if (busy || !f) return;
        playSound('click');
        let live = null;
        try { live = startFixture(f.id); } catch (e) { live = null; }
        if (!live) { showToast('That match cannot be played right now.', 'error'); return; }
        saveCareer();
    }

    function doSim(f) {
        if (busy || !f) return;
        busy = true;
        playSound('click');
        let res = null;
        try { res = simFixture(f.id); } catch (e) { res = null; }
        if (!res) {
            busy = false;
            showToast('That match could not be simulated.', 'error');
            return;
        }

        // If the engine simulated without committing, finish it here. Checking
        // the stored fixture is the only honest way to know which it did.
        let interview = null;
        const after = (get(career).season.schedule || []).find(x => x && x.id === f.id);
        if (!after || !after.played) {
            try {
                const done = completeMatch(res);
                if (done) { res = done.result || res; interview = done.interview || null; }
            } catch (e) { /* result still stands */ }
        }
        saveCareer();
        busy = false;

        if (res.played === false) {
            showToast(res.benchReason || 'You did not play in that match.', 'info');
        } else {
            playSound(res.won ? 'win' : 'lose');
        }
        pendingInterview = interview;
        pushOverlay('result', res);
    }
</script>

<section class="cal">

    <!-- ============== PHASE RAIL ============== -->
    <div class="panel rail-panel">
        <div class="rail-head">
            <div class="side-label rail-lbl">Competitive Year {year}</div>
            <div class="rail-count">Week {week} / {WEEKS_PER_YEAR}</div>
        </div>

        <div class="rail-scroll">
            <div class="rail">
                {#each PHASES as ph}
                    {@const span = ph.to - ph.from + 1}
                    {@const on = ph.id === phase.id}
                    <div
                        class="seg"
                        class:seg-on={on}
                        class:seg-past={ph.to < week}
                        style="flex-grow:{span}; --a:{ph.accent}"
                        title="{ph.name} - weeks {ph.from} to {ph.to}"
                    >
                        <span class="seg-code">{ph.short}</span>
                        <span class="seg-name">{ph.name}</span>
                        <span class="seg-wk">W{ph.from}-{ph.to}</span>
                    </div>
                {/each}
                <div class="marker" style="left:{markerPct}%" aria-hidden="true">
                    <span class="marker-dot"></span>
                    <span class="marker-wk">W{week}</span>
                </div>
            </div>
        </div>

        <div class="rail-foot" style="--a:{phase.accent}">
            <span class="rf-code">{phase.short}</span>
            <span class="rf-name">{phase.name}</span>
            <span class="rf-desc">{phase.desc}</span>
        </div>
    </div>

    <!-- ============== SPLIT HEADER ============== -->
    <div class="panel split-panel">
        <div class="sp-left">
            <div class="side-label">{region.league} &middot; {splitLabel}</div>
            <div class="sp-team" style="--t:{myAccent}">
                <span class="sp-dot"></span>
                <span class="sp-name">{myTeamName}</span>
                {#if !$currentTeam}<span class="sp-free">unsigned</span>{/if}
            </div>

            <div class="sp-stats">
                <div class="sp-stat">
                    <span class="sp-v">{fmtRecord(num(season.wins), num(season.losses))}</span>
                    <span class="sp-l">Series</span>
                </div>
                <div class="sp-stat">
                    <span class="sp-v">{fmtRecord(num(season.gameWins), num(season.gameLosses))}</span>
                    <span class="sp-l">Games</span>
                </div>
                <div class="sp-stat">
                    <span class="sp-v sp-cp">{num(season.champPoints)}</span>
                    <span class="sp-l">Champ Pts</span>
                </div>
                <div class="sp-stat">
                    <span class="sp-v">{playedCount}<span class="sp-of">/{schedule.length}</span></span>
                    <span class="sp-l">Played</span>
                </div>
            </div>

            <div class="quals">
                <div class="qual" class:qual-on={!!qualified.msi} style="--a:{MSI_PHASE.accent}">
                    <span class="q-ico" aria-hidden="true">{qualified.msi ? '\u2713' : '\u{1F512}'}</span>
                    <span class="q-txt">
                        <strong>MSI</strong>
                        <span>{qualified.msi ? 'Qualified' : 'Win the spring split'}</span>
                    </span>
                </div>
                <div class="qual" class:qual-on={!!qualified.worlds} style="--a:{WLD_PHASE.accent}">
                    <span class="q-ico" aria-hidden="true">{qualified.worlds ? '\u2713' : '\u{1F512}'}</span>
                    <span class="q-txt">
                        <strong>Worlds</strong>
                        <span>{qualified.worlds ? 'Qualified' : 'Championship points'}</span>
                    </span>
                </div>
            </div>
        </div>

        <div class="sp-right">
            <div class="side-label">Advance</div>
            <button
                class="adv-btn"
                on:click={doAdvance}
                disabled={!adv.ok || busy}
                aria-label={advLabel}
            >
                <span class="adv-t">{advLabel}</span>
                <span class="adv-arrow" aria-hidden="true">&rarr;</span>
            </button>
            {#if !adv.ok}
                <p class="adv-why">{adv.reason || 'Finish this week before moving on.'}</p>
            {:else}
                <p class="adv-why adv-ok">Unspent activity slots are lost when the week ends.</p>
            {/if}
        </div>
    </div>

    <!-- ============== FIXTURES ============== -->
    <div class="block">
        <div class="block-head">
            <div class="side-label">Fixture List</div>
            <span class="block-note">{schedule.length} scheduled</span>
        </div>

        {#if !weekGroups.length}
            <div class="panel empty">
                <div class="empty-ico" aria-hidden="true">&#x1F4C5;</div>
                <h3 class="empty-h">No fixtures on the calendar</h3>
                <p class="empty-p">
                    {#if !$currentTeam}
                        Nobody has signed you yet, so there is nothing to play. Climb solo queue
                        and train until a club puts an offer on the table -- the moment you sign,
                        a full split of fixtures appears here.
                    {:else}
                        The split has not been drawn yet. Advance through preseason and your
                        schedule will be generated.
                    {/if}
                </p>
            </div>
        {:else}
            <div class="weeks">
                {#each weekGroups as g (g.week)}
                    <div
                        class="wk"
                        class:wk-past={g.week < week}
                        class:wk-now={g.week === week}
                    >
                        <div class="wk-head">
                            <span class="wk-n">Week {g.week}</span>
                            <span class="wk-phase" style="--a:{g.phase.accent}">{g.phase.short}</span>
                            {#if g.week === week}
                                <span class="wk-tag wk-tag-now">This week</span>
                            {:else if g.week < week}
                                <span class="wk-tag">Played</span>
                            {:else}
                                <span class="wk-tag">Upcoming</span>
                            {/if}
                        </div>

                        <div class="fxs">
                            {#each g.fixtures as f, fi (f.id || g.week + '-' + fi)}
                                {@const o = opponentOf(f)}
                                {@const chip = ratingChip(f)}
                                <div class="fx" class:fx-done={f.played} style="--o:{o.accent}">
                                    <span class="fx-ha" title={f.home ? 'Home fixture' : 'Away fixture'}>
                                        {f.home ? 'vs' : '@'}
                                    </span>
                                    <span class="fx-bar" aria-hidden="true"></span>
                                    <span class="fx-opp">
                                        <span class="fx-name">{o.name}</span>
                                        {#if f.kind === 'scrim'}
                                            <span class="fx-kind">scrim</span>
                                        {/if}
                                    </span>

                                    <span class="fx-right">
                                        {#if f.played}
                                            <span class="res" class:res-w={f.won} class:res-l={!f.won}>
                                                <span class="res-wl">{f.won ? 'W' : 'L'}</span>
                                                <span class="res-sc">{fixtureScore(f)}</span>
                                            </span>
                                            {#if chip}
                                                <span class="rat" style="--r:{chip.color}" title="Your match rating{chip.label ? ' - ' + chip.label : ''}">
                                                    {chip.value}
                                                </span>
                                            {/if}
                                        {:else if g.week === week}
                                            {@const odds = oddsFor(f)}
                                            {#if odds !== null}
                                                <span class="odds" title="Estimated win chance">{odds}%</span>
                                            {/if}
                                            <button class="fx-btn play" on:click={() => doPlay(f)} disabled={busy}
                                                aria-label="Play the match against {o.name}">Play</button>
                                            <button class="fx-btn sim" on:click={() => doSim(f)} disabled={busy}
                                                aria-label="Simulate the match against {o.name}">Sim</button>
                                        {:else}
                                            <span class="str" title="Opponent strength">
                                                <span class="str-l">STR</span>
                                                <span class="str-v">{strengthOf(o)}</span>
                                            </span>
                                        {/if}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- ============== BRACKET ============== -->
    <div class="block">
        <div class="block-head">
            <div class="side-label">Bracket</div>
            {#if bracket && bracket.bestOf}
                <span class="block-note">Best of {bracket.bestOf}</span>
            {/if}
        </div>

        {#if !bracket}
            <div class="panel empty empty-sm">
                <div class="empty-ico" aria-hidden="true">&#x1F3C6;</div>
                <h3 class="empty-h">No bracket running</h3>
                <p class="empty-p">
                    Playoff and international brackets appear here during the postseason
                    weeks. Finish top six in the regular split to be drawn into one.
                </p>
            </div>
        {:else}
            <div class="panel bk-panel" style="--a:{bracket.accent}">
                <div class="bk-head">
                    <span class="bk-title">{bracket.title}</span>
                    {#if bracket.champion}
                        <span class="bk-champ" style="--t:{bracket.champion.accent}">
                            <span aria-hidden="true">&#x1F3C6;</span> {bracket.champion.name}
                        </span>
                    {/if}
                </div>

                <div class="bk-scroll">
                    <div class="bk">
                        {#each bracket.rounds as r}
                            <div class="bk-round">
                                <div class="bk-rname">{r.name}</div>
                                {#each r.ties as t}
                                    <div class="tie" class:tie-live={!t.done}>
                                        {#each [t.a, t.b] as side}
                                            {#if side}
                                                <div
                                                    class="tie-row"
                                                    class:tie-win={side.won}
                                                    class:tie-mine={side.mine}
                                                    style="--t:{side.accent}"
                                                >
                                                    <span class="tie-bar" aria-hidden="true"></span>
                                                    <span class="tie-name">{side.name}</span>
                                                    <span class="tie-sc">{t.hasScore ? side.score : '-'}</span>
                                                </div>
                                            {:else}
                                                <div class="tie-row tie-tbd">
                                                    <span class="tie-bar" aria-hidden="true"></span>
                                                    <span class="tie-name">TBD</span>
                                                    <span class="tie-sc">-</span>
                                                </div>
                                            {/if}
                                        {/each}
                                        {#if t.label}<div class="tie-lbl">{t.label}</div>{/if}
                                    </div>
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <!-- ============== PAST SEASONS ============== -->
    <div class="block">
        <div class="block-head">
            <div class="side-label">Past Seasons</div>
            <span class="block-note">{history.length} on record</span>
        </div>

        {#if !history.length}
            <div class="panel empty empty-sm">
                <div class="empty-ico" aria-hidden="true">&#x1F4DC;</div>
                <h3 class="empty-h">Nothing behind you yet</h3>
                <p class="empty-p">
                    Every split you finish is written here -- the team, the record, where you
                    placed and what you won. Your first entry lands at the end of this year.
                </p>
            </div>
        {:else}
            <div class="panel tbl-panel">
                <div class="tbl-scroll">
                    <table class="tbl">
                        <thead>
                            <tr>
                                <th class="ta-l">Year</th>
                                <th class="ta-l">Split</th>
                                <th class="ta-l">Team</th>
                                <th>Record</th>
                                <th>Placement</th>
                                <th class="ta-l">Awards</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each history as h, i (String(h.year) + '-' + (h.split || '') + '-' + i)}
                                {@const t = historyTeam(h)}
                                {@const aw = awardNames(h)}
                                <tr>
                                    <td class="ta-l td-year">{num(h.year) || '--'}</td>
                                    <td class="ta-l td-split">{SPLIT_NAME[h.split] || h.split || 'Season'}</td>
                                    <td class="ta-l">
                                        <span class="td-team" style="--t:{t.accent}">
                                            <span class="td-dot" aria-hidden="true"></span>{t.name}
                                        </span>
                                    </td>
                                    <td class="td-rec">{fmtRecord(num(h.w), num(h.l))}</td>
                                    <td class="td-place">{placementText(h)}</td>
                                    <td class="ta-l">
                                        {#if aw.length}
                                            <span class="aws">
                                                {#each aw as a}
                                                    <span class="aw" title={a.name}>
                                                        <span aria-hidden="true">{a.icon}</span>{a.name}
                                                    </span>
                                                {/each}
                                            </span>
                                        {:else}
                                            <span class="td-none">--</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        {/if}
    </div>
</section>

<style>
    .cal {
        display: flex;
        flex-direction: column;
        gap: 22px;
        max-width: 1180px;
        margin: 0 auto;
    }

    .panel {
        background: rgba(12, 16, 28, 0.5);
        border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 16px;
    }

    .side-label {
        margin: 0;
        font-size: 9px; font-weight: 900;
        text-transform: uppercase; letter-spacing: 1.5px;
        color: #334155;
    }

    .block { display: flex; flex-direction: column; gap: 12px; }
    .block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .block-note {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 700; color: #3f5069;
    }

    /* =========== PHASE RAIL =========== */
    .rail-panel { padding: 16px 18px 14px; }
    .rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .rail-lbl { margin: 0; }
    .rail-count {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800; color: #a78bfa;
    }

    .rail-scroll { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; padding-bottom: 4px; }
    .rail-scroll::-webkit-scrollbar { height: 5px; }
    .rail-scroll::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.4); border-radius: 4px; }

    .rail {
        position: relative; display: flex; align-items: stretch;
        gap: 3px; min-width: 660px; padding-top: 16px;
    }
    .seg {
        flex-basis: 0; min-width: 0; overflow: hidden;
        display: flex; flex-direction: column; gap: 2px;
        padding: 9px 8px 10px; border-radius: 10px;
        background: color-mix(in srgb, var(--a) 7%, rgba(15, 23, 42, 0.55));
        border: 1px solid color-mix(in srgb, var(--a) 16%, transparent);
        border-bottom: 2px solid color-mix(in srgb, var(--a) 34%, transparent);
        transition: background 0.2s ease, border-color 0.2s ease;
    }
    .seg-past { opacity: 0.42; }
    .seg-on {
        opacity: 1;
        background: color-mix(in srgb, var(--a) 16%, rgba(15, 23, 42, 0.7));
        border-color: color-mix(in srgb, var(--a) 45%, transparent);
        border-bottom-color: var(--a);
    }
    .seg-code { font-size: 9px; font-weight: 900; letter-spacing: 1.3px; color: var(--a); white-space: nowrap; }
    .seg-name {
        font-size: 10px; font-weight: 700; color: #64748b;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .seg-on .seg-name { color: #cbd5e1; }
    .seg-wk {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 9px; font-weight: 700; color: #3f5069; white-space: nowrap;
    }

    .marker { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; }
    .marker-dot {
        position: absolute; top: 12px; bottom: 0; left: -1px;
        width: 2px; border-radius: 2px;
        background: linear-gradient(180deg, #a78bfa, rgba(167, 139, 250, 0.15));
    }
    .marker-wk {
        position: absolute; top: 0; left: 0; transform: translateX(-50%);
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 9px; font-weight: 800; color: #0b0f1a; background: #a78bfa;
        padding: 1px 5px; border-radius: 5px; white-space: nowrap;
    }

    .rail-foot {
        display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
        margin-top: 12px; padding-top: 12px;
        border-top: 1px solid rgba(51, 65, 85, 0.22);
    }
    .rf-code {
        font-size: 9px; font-weight: 900; letter-spacing: 1.3px; color: var(--a);
        padding: 3px 7px; border-radius: 6px;
        background: color-mix(in srgb, var(--a) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--a) 28%, transparent);
    }
    .rf-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; font-weight: 700; color: #e8eefb; }
    .rf-desc { font-size: 11.5px; color: #56688a; flex: 1 1 240px; min-width: 0; }

    /* =========== SPLIT HEADER =========== */
    .split-panel { display: flex; align-items: stretch; gap: 20px; padding: 18px; }
    .sp-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
    .sp-team { display: flex; align-items: center; gap: 9px; }
    .sp-dot { width: 9px; height: 9px; border-radius: 3px; background: var(--t); flex-shrink: 0; }
    .sp-name {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 19px; font-weight: 700; color: #e8eefb; letter-spacing: -0.01em;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sp-free {
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
        color: #64748b; padding: 3px 7px; border-radius: 5px;
        border: 1px solid rgba(71, 85, 105, 0.35);
    }

    .sp-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .sp-stat {
        display: flex; flex-direction: column; gap: 3px; min-width: 0;
        padding: 10px 12px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(51, 65, 85, 0.22);
    }
    .sp-v {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 17px; font-weight: 800; color: #e2e8f0; line-height: 1;
    }
    .sp-cp { color: #a78bfa; }
    .sp-of { font-size: 11px; color: #3f5069; }
    .sp-l { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #3f5069; }

    .quals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .qual {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 11px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.4);
        border: 1px solid rgba(51, 65, 85, 0.22);
        min-width: 0;
    }
    .qual-on {
        background: color-mix(in srgb, var(--a) 10%, rgba(15, 23, 42, 0.5));
        border-color: color-mix(in srgb, var(--a) 34%, transparent);
    }
    .q-ico { font-size: 12px; opacity: 0.55; flex-shrink: 0; }
    .qual-on .q-ico { opacity: 1; color: var(--a); }
    .q-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .q-txt strong { font-size: 11px; font-weight: 800; letter-spacing: 0.6px; color: #94a3b8; }
    .qual-on .q-txt strong { color: var(--a); }
    .q-txt span {
        font-size: 9.5px; font-weight: 600; color: #475569;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .sp-right {
        flex: 0 0 250px; display: flex; flex-direction: column; gap: 10px;
        padding-left: 20px; border-left: 1px solid rgba(51, 65, 85, 0.22);
    }
    .adv-btn {
        display: flex; align-items: center; justify-content: center; gap: 9px;
        width: 100%; padding: 14px 16px; cursor: pointer;
        border-radius: 14px; border: 1px solid rgba(139, 92, 246, 0.4);
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.24), rgba(99, 102, 241, 0.16));
        font-family: inherit; font-size: 12px; font-weight: 800;
        letter-spacing: 0.4px; color: #c4b5fd;
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .adv-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(167, 139, 250, 0.7);
        box-shadow: 0 8px 24px rgba(139, 92, 246, 0.22);
    }
    .adv-btn:disabled {
        background: rgba(15, 23, 42, 0.6); border-color: rgba(51, 65, 85, 0.32);
        color: #475569; cursor: not-allowed;
    }
    .adv-arrow { font-size: 14px; line-height: 1; }
    .adv-why { font-size: 10.5px; line-height: 1.5; color: #f87171; margin: 0; }
    .adv-ok { color: #475569; }

    /* =========== FIXTURES =========== */
    .weeks { display: flex; flex-direction: column; gap: 10px; }
    .wk {
        background: rgba(12, 16, 28, 0.5); border: 1px solid rgba(51, 65, 85, 0.28);
        border-radius: 14px; padding: 12px 14px;
    }
    .wk-past { opacity: 0.55; }
    .wk-now {
        border-color: rgba(139, 92, 246, 0.4);
        background: rgba(139, 92, 246, 0.06);
        box-shadow: 0 6px 22px rgba(0, 0, 0, 0.25);
    }
    .wk-head { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; }
    .wk-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 13px; font-weight: 700; color: #cbd5e1; }
    .wk-phase {
        font-size: 8px; font-weight: 900; letter-spacing: 1.1px; color: var(--a);
        padding: 2px 6px; border-radius: 5px;
        background: color-mix(in srgb, var(--a) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--a) 26%, transparent);
    }
    .wk-tag {
        margin-left: auto; color: #3f5069;
        font-size: 8.5px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase;
    }
    .wk-tag-now { color: #a78bfa; }

    .fxs { display: flex; flex-direction: column; gap: 6px; }
    .fx {
        display: grid; grid-template-columns: 26px 3px minmax(0, 1fr) auto;
        align-items: center; gap: 9px; padding: 8px 10px; border-radius: 10px;
        background: rgba(15, 23, 42, 0.45); border: 1px solid rgba(51, 65, 85, 0.18);
    }
    .fx-ha {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10px; font-weight: 800; color: #3f5069; text-align: center;
    }
    .fx-bar { display: block; width: 3px; height: 22px; border-radius: 3px; background: var(--o); opacity: 0.85; }
    .fx-opp { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .fx-name {
        font-size: 12.5px; font-weight: 700; color: #cbd5e1;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .fx-kind {
        font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        color: #475569; padding: 2px 5px; border-radius: 4px; flex-shrink: 0;
        border: 1px solid rgba(71, 85, 105, 0.3);
    }
    .fx-right { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }

    .res {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 9px; border-radius: 8px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    }
    .res-w { background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.28); }
    .res-l { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.24); }
    .res-wl { font-size: 11px; font-weight: 900; }
    .res-w .res-wl { color: #4ade80; }
    .res-l .res-wl { color: #f87171; }
    .res-sc { font-size: 11px; font-weight: 700; color: #94a3b8; }

    .rat {
        min-width: 38px; text-align: center;
        padding: 4px 7px; border-radius: 8px;
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 11px; font-weight: 800;
        color: var(--r);
        background: color-mix(in srgb, var(--r) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--r) 28%, transparent);
    }

    .odds {
        font-family: ui-monospace, 'SF Mono', Menlo, monospace;
        font-size: 10.5px; font-weight: 800; color: #64748b;
    }
    .str { display: inline-flex; align-items: baseline; gap: 5px; }
    .str-l { font-size: 8px; font-weight: 800; letter-spacing: 1.1px; color: #334155; }
    .str-v { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: #7c8db0; }
    .fx-done { opacity: 0.74; }

    .fx-btn {
        padding: 6px 13px; border-radius: 9px; cursor: pointer;
        font-family: inherit; font-size: 11px; font-weight: 800; letter-spacing: 0.3px;
        transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
    }
    .fx-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .play { color: #0b0f1a; border: none; background: linear-gradient(135deg, #a78bfa, #8b5cf6); }
    .play:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(139, 92, 246, 0.4); }
    .sim { color: #94a3b8; background: rgba(51, 65, 85, 0.4); border: 1px solid rgba(71, 85, 105, 0.38); }
    .sim:hover:not(:disabled) { background: rgba(71, 85, 105, 0.6); color: #e2e8f0; }

    /* =========== BRACKET =========== */
    .bk-panel { padding: 16px; }
    .bk-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .bk-title { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: var(--a); }
    .bk-champ {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11px; font-weight: 800; color: var(--t);
        padding: 4px 10px; border-radius: 8px;
        background: color-mix(in srgb, var(--t) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--t) 30%, transparent);
    }
    .bk-scroll { overflow-x: auto; padding-bottom: 6px; }
    .bk-scroll::-webkit-scrollbar { height: 6px; }
    .bk-scroll::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.4); border-radius: 4px; }
    .bk { display: flex; align-items: flex-start; gap: 14px; min-width: min-content; }
    .bk-round { flex: 0 0 205px; display: flex; flex-direction: column; gap: 10px; }
    .bk-rname { font-size: 9px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; color: #3f5069; }
    .tie { border-radius: 12px; overflow: hidden; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(51, 65, 85, 0.28); }
    .tie-live { border-color: rgba(139, 92, 246, 0.34); }
    .tie-row {
        display: grid; grid-template-columns: 3px minmax(0, 1fr) auto;
        align-items: center; gap: 8px; padding: 8px 10px;
    }
    .tie-row + .tie-row { border-top: 1px solid rgba(51, 65, 85, 0.22); }
    .tie-bar { display: block; width: 3px; height: 16px; border-radius: 3px; background: var(--t, #334155); opacity: 0.8; }
    .tie-name {
        font-size: 11.5px; font-weight: 700; color: #64748b;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tie-win .tie-name { color: #e2e8f0; }
    .tie-mine .tie-name { color: #c4b5fd; }
    .tie-mine { background: rgba(139, 92, 246, 0.09); }
    .tie-sc { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; font-weight: 800; color: #475569; }
    .tie-win .tie-sc { color: #4ade80; }
    .tie-tbd .tie-name { color: #334155; font-style: italic; }
    .tie-lbl {
        padding: 3px 10px 5px; color: #334155;
        font-size: 8.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
        border-top: 1px solid rgba(51, 65, 85, 0.16);
    }

    /* =========== TABLE =========== */
    .tbl-panel { padding: 6px; }
    .tbl-scroll { overflow-x: auto; }
    .tbl-scroll::-webkit-scrollbar { height: 6px; }
    .tbl-scroll::-webkit-scrollbar-thumb { background: rgba(71, 85, 105, 0.4); border-radius: 4px; }
    .tbl { width: 100%; min-width: 620px; border-collapse: collapse; }
    .tbl th {
        padding: 10px 12px; color: #334155; text-align: center; white-space: nowrap;
        font-size: 8.5px; font-weight: 900; letter-spacing: 1.2px; text-transform: uppercase;
        border-bottom: 1px solid rgba(51, 65, 85, 0.28);
    }
    .tbl td {
        padding: 10px 12px; font-size: 12px; color: #94a3b8; text-align: center;
        border-bottom: 1px solid rgba(51, 65, 85, 0.14);
    }
    .tbl tbody tr:last-child td { border-bottom: none; }
    .tbl tbody tr:hover td { background: rgba(139, 92, 246, 0.05); }
    .ta-l { text-align: left !important; }
    .td-year { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 800; color: #e2e8f0; }
    .td-split { font-weight: 700; color: #7c8db0; white-space: nowrap; }
    .td-team { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; color: #cbd5e1; }
    .td-dot { width: 7px; height: 7px; border-radius: 2px; background: var(--t); flex-shrink: 0; }
    .td-rec, .td-place { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 700; color: #cbd5e1; white-space: nowrap; }
    .td-none { color: #334155; }
    .aws { display: flex; flex-wrap: wrap; gap: 5px; }
    .aw {
        display: inline-flex; align-items: center; gap: 5px; max-width: 190px;
        padding: 3px 8px; border-radius: 7px;
        font-size: 10px; font-weight: 700; color: #fcd34d;
        background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.24);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* =========== EMPTY STATES =========== */
    .empty { padding: 34px 24px; text-align: center; }
    .empty-sm { padding: 26px 22px; }
    .empty-ico { font-size: 26px; opacity: 0.4; margin-bottom: 10px; }
    .empty-h {
        font-family: 'Space Grotesk', 'Quicksand', sans-serif;
        font-size: 15px; font-weight: 700; color: #cbd5e1; margin: 0 0 8px;
    }
    .empty-p { font-size: 12px; line-height: 1.65; color: #56688a; max-width: 440px; margin: 0 auto; }

    /* =========== RESPONSIVE =========== */
    @media (max-width: 860px) {
        .split-panel { flex-direction: column; gap: 16px; }
        .sp-right { flex: 1 1 auto; padding-left: 0; padding-top: 16px; border-left: none; border-top: 1px solid rgba(51, 65, 85, 0.22); }
    }
    @media (max-width: 620px) {
        .cal { gap: 18px; }
        .sp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .quals { grid-template-columns: minmax(0, 1fr); }
        .sp-name { font-size: 17px; }
        .fx { grid-template-columns: 22px 3px minmax(0, 1fr); row-gap: 7px; }
        .fx-right { grid-column: 1 / -1; justify-content: flex-end; }
        .rf-desc { flex-basis: 100%; }
    }
    @media (max-width: 380px) {
        .rail-panel, .split-panel, .bk-panel { padding: 14px 12px; }
        .wk { padding: 10px 10px; }
    }
</style>
