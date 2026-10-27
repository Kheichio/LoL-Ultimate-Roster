<script>
    // Everything that grows a player: the weekly plan, how hard each player
    // trains, what the bench does, hands-on sessions, bootcamps, and a forecast
    // of where each player is heading.
    import { manager, mutate } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import {
        myTeam, setTraining, setFocus, setIntensity, setBenchProgram, sessionsLeft, trainingCost, runSession,
        bootcampState, runBootcamp, devForecast, benchCost,
    } from '../../manager/engine.js';
    import {
        TRAINING, ATTRS, ATTR_BY_KEY, ROLE_IDS, XP_PER_LEVEL, POINTS_PER_LEVEL, INTENSITY, BENCH_PROGRAMS, SESSIONS,
        SESSIONS_PER_WEEK, BOOTCAMPS,
    } from '../../manager/data.js';
    import { lineupOf } from '../../manager/match.js';
    import { ovrOf, ageOf, focusAttr } from '../../manager/people.js';
    import { ovrColor, fmtMoney } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import PName from './PName.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: year = s.time.year;
    $: five = team ? new Set(Object.values(lineupOf(team, s.players)).map(p => p.id)) : new Set();
    $: roster = team ? team.roster.map(id => s.players[id]).filter(Boolean)
        .sort((a, b) => (five.has(b.id) ? 1 : 0) - (five.has(a.id) ? 1 : 0) || ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role)) : [];
    $: left = sessionsLeft(s);
    $: forecasts = Object.fromEntries(roster.map(p => [p.id, devForecast(s, p)]));
    $: teamXP = roster.reduce((n, p) => n + (forecasts[p.id] ? forecasts[p.id].week : 0), 0);
    $: seasonXP = roster.reduce((n, p) => n + (Number(p.xpy) || 0), 0);
    $: bench = team ? team.bench || 'none' : 'none';
    let target = {};
    $: for (const ses of SESSIONS) if (ses.target === 'player' && !target[ses.id] && roster[0]) target[ses.id] = roster[0].id;

    function session(ses) {
        const pid = ses.target === 'player' ? target[ses.id] : null;
        const r = mutate(s => runSession(s, ses.id, pid));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
    }
    function camp(b) {
        const st = bootcampState(s, b.id);
        if (!st.ok) { showToast(st.why, 'error', 3500); return; }
        openConfirmModal(`Book the ${b.name} for ${fmtMoney(st.cost)}? ${b.blurb}`, () => {
            const r = mutate(s => runBootcamp(s, b.id));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
        });
    }
    const RATE_C = { Rapid: '#34d399', Strong: '#86efac', Steady: '#fbbf24', Slow: '#fb923c', Minimal: '#94a3b8' };
    const wk = (n) => (n == null ? '—' : n <= 1 ? 'this week' : `~${n} weeks`);
</script>

{#if team}
<div class="tr">
    <div>
        <h1 class="page-h">Training</h1>
        <p class="page-sub">Players grow by XP: {XP_PER_LEVEL} XP is a level and {POINTS_PER_LEVEL} attribute points. Teenagers learn fastest and growth slows through the twenties. The weekly plan runs on its own; sessions and bootcamps are yours to book.</p>
    </div>

    <section class="strip">
        <div class="sc"><span class="muted small">Team XP a week</span><b class="num">{teamXP}</b></div>
        <div class="sc"><span class="muted small">XP this season</span><b class="num">{seasonXP}</b></div>
        <div class="sc"><span class="muted small">Sessions left this week</span><b class="num" class:good={left > 0}>{left} / {SESSIONS_PER_WEEK}</b></div>
        <div class="sc"><span class="muted small">Bench programme</span><b>{BENCH_PROGRAMS.find(b => b.id === bench).name}</b>{#if benchCost(s, team)}<span class="muted small">{fmtMoney(benchCost(s, team))} a week</span>{/if}</div>
    </section>

    <div class="two">
        <section class="panel">
            <div class="ph"><h3><Icon name="dumbbell" size={15} /> The weekly plan</h3><span class="muted small">Runs every week, match or not</span></div>
            <div class="opts">
                {#each TRAINING as tr}
                    <button class="o" class:on={team.training === tr.id} on:click={() => mutate(s => setTraining(s, tr.id))}>
                        <span class="o-top"><Icon name={tr.icon} size={16} /><b>{tr.name}</b>{#if team.training === tr.id}<span class="chip" style="--c:#34d399">This week</span>{/if}</span>
                        <span class="o-b">{tr.blurb}</span>
                        <span class="o-fx">
                            <span class:good={tr.xp > 20}>+{tr.xp} XP</span>
                            {#if tr.chem}<span class:good={tr.chem > 0} class:bad={tr.chem < 0}>{tr.chem > 0 ? '+' : ''}{tr.chem} chemistry</span>{/if}
                            {#if tr.morale}<span class:good={tr.morale > 0} class:bad={tr.morale < 0}>{tr.morale > 0 ? '+' : ''}{tr.morale} morale</span>{/if}
                            {#if tr.draftPrep}<span class="good">+{tr.draftPrep} per pick next match</span>{/if}
                        </span>
                    </button>
                {/each}
            </div>
        </section>

        <div class="col">
            <section class="panel">
                <div class="ph"><h3><Icon name="squad" size={15} /> The bench</h3><span class="muted small">For players who do not start</span></div>
                <div class="opts">
                    {#each BENCH_PROGRAMS as b}
                        <button class="o" class:on={bench === b.id} on:click={() => mutate(s => setBenchProgram(s, b.id))}>
                            <span class="o-top"><b>{b.name}</b>{#if bench === b.id}<span class="chip" style="--c:#34d399">Running</span>{/if}</span>
                            <span class="o-b">{b.blurb}</span>
                            <span class="o-fx">{#if b.xp}<span class="good">+{b.xp} XP a week for subs</span>{/if}{#if b.morale}<span class="good">+{b.morale} morale</span>{/if}{#if b.cost}<span class="bad">{fmtMoney(benchCost(s, { ...team, bench: b.id }))} a week</span>{:else}<span>Free</span>{/if}</span>
                        </button>
                    {/each}
                </div>
            </section>

            <section class="panel">
                <div class="ph"><h3><Icon name="user" size={15} /> Sessions</h3><span class="chip" style="--c:{left ? '#34d399' : '#94a3b8'}">{left} of {SESSIONS_PER_WEEK} left this week</span></div>
                <div class="ses">
                    {#each SESSIONS as ses}
                        <div class="se">
                            <span class="se-top"><Icon name={ses.icon} size={15} /><b>{ses.name}</b><span class="cost">{fmtMoney(trainingCost(s, ses))}</span></span>
                            <span class="o-b">{ses.blurb}</span>
                            <span class="se-act">
                                {#if ses.target === 'player'}
                                    <select class="sel" bind:value={target[ses.id]}>
                                        {#each roster as p (p.id)}<option value={p.id}>{p.role} · {p.name}</option>{/each}
                                    </select>
                                {/if}
                                <button class="btn btn-sm" class:btn-p={left > 0} disabled={!left} on:click={() => session(ses)}>Run</button>
                            </span>
                        </div>
                    {/each}
                </div>
            </section>
        </div>
    </div>

    <section class="panel">
        <div class="ph"><h3><Icon name="flag" size={15} /> Bootcamps</h3><span class="muted small">Once a split each, for the whole roster</span></div>
        <div class="camps">
            {#each BOOTCAMPS as b}
                {@const st = bootcampState(s, b.id)}
                <button class="camp" disabled={!st.ok} on:click={() => camp(b)}>
                    <span class="se-top"><Icon name={b.icon} size={17} /><b>{b.name}</b><span class="cost">{fmtMoney(trainingCost(s, b))}</span></span>
                    <span class="o-b">{b.blurb}</span>
                    <span class="o-fx">
                        {#if b.xp}<span class="good">+{b.xp} XP each</span>{/if}
                        {#if b.chem}<span class:good={b.chem > 0} class:bad={b.chem < 0}>{b.chem > 0 ? '+' : ''}{b.chem} chemistry</span>{/if}
                        {#if b.morale}<span class:good={b.morale > 0} class:bad={b.morale < 0}>{b.morale > 0 ? '+' : ''}{b.morale} morale</span>{/if}
                    </span>
                    {#if !st.ok}<span class="why">{st.why}</span>{/if}
                </button>
            {/each}
        </div>
        <p class="muted small">XP from sessions and bootcamps is multiplied by age, personality, your coach and the Player Developer perk, exactly like the weekly plan.</p>
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="upgrade" size={15} /> Development</h3><span class="muted small">Forecasts at the current plan, intensity and bench programme</span></div>
        <div class="devs">
            {#each roster as p (p.id)}
                {@const f = forecasts[p.id]}
                <div class="dv" class:bench={!five.has(p.id)}>
                    <div class="dv-id">
                        <span class="rl">{p.role}</span>
                        <span class="dv-n"><PName {p} /><span class="muted small">age {ageOf(p, year)} · {five.has(p.id) ? 'starter' : 'bench'}</span></span>
                        <span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span>
                        <span class="delta" class:good={f.ovrDelta > 0} class:bad={f.ovrDelta < 0} title="OVR change since the season began">{f.ovrDelta > 0 ? '+' : ''}{f.ovrDelta}</span>
                    </div>
                    <div class="dv-lv">
                        <span class="lv-t"><b>Lv {p.lv}</b><span class="muted small">{p.xp} / {XP_PER_LEVEL} XP</span></span>
                        <span class="bar"><i style="width:{(p.xp / XP_PER_LEVEL) * 100}%"></i></span>
                        <span class="small">Next level <b>{wk(f.weeks)}</b> · {f.week} XP a week</span>
                    </div>
                    <div class="dv-ovr">
                        {#if f.levels != null}
                            <span class="small">+1 OVR in <b>{f.levels} level{f.levels === 1 ? '' : 's'}</b> ({wk(f.weeksToOvr)})</span>
                            <span class="muted small">Points go to {ATTR_BY_KEY[f.focus] ? ATTR_BY_KEY[f.focus].name : f.focus}{f.atCeiling ? ' · at potential, a point is worth a quarter' : ` · potential ${p.pot}`}</span>
                        {:else}<span class="small">At the top of the scale</span>{/if}
                    </div>
                    <div class="dv-rate">
                        <span class="chip" style="--c:{RATE_C[f.rate]}">{f.rate} growth</span>
                        {#if f.declining}<span class="chip" style="--c:#f87171">Declines each year</span>{/if}
                        <span class="muted small">{p.xpy || 0} XP this season</span>
                    </div>
                    <div class="dv-set">
                        <span class="seg mini">{#each INTENSITY as it}<button class:on={(p.intensity || 'normal') === it.id} title={it.blurb} on:click={() => mutate(s => setIntensity(s, p.id, it.id))}>{it.name}</button>{/each}</span>
                        <select class="sel" value={p.focus || 'auto'} on:change={(e) => mutate(s => setFocus(s, p.id, e.currentTarget.value))}>
                            <option value="auto">Auto ({ATTR_BY_KEY[focusAttr({ ...p, focus: 'auto' })].short})</option>
                            {#each ATTRS as a}<option value={a.key}>{a.name}</option>{/each}
                        </select>
                    </div>
                </div>
            {/each}
        </div>
        <p class="muted small">Light: ×0.6 training XP, +1 morale a week. Intense: ×1.5 training XP, −1.5 morale a week. Forecasts assume a series most weeks for starters.</p>
    </section>
</div>
{:else}
    <div class="panel empty">You have no club right now. Pick one of your job offers on the Club screen.</div>
{/if}

<style>
    .tr { display: flex; flex-direction: column; gap: 14px; }
    .small { font-size: 12.5px; }
    .strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .sc { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border-radius: 13px; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--line); }
    .sc b { font-size: 18px; color: #fff; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .opts { display: flex; flex-direction: column; gap: 6px; }
    .o { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; text-align: left; cursor: pointer; font-family: inherit; color: #dbe4f0; background: rgba(2, 6, 23, 0.45); border: 1px solid var(--line); }
    .o:hover { border-color: rgba(52, 211, 153, 0.5); }
    .o.on { border-color: #34d399; background: rgba(16, 185, 129, 0.09); }
    .o-top, .se-top { display: flex; align-items: center; gap: 8px; color: #6ee7b7; flex-wrap: wrap; }
    .o-top b, .se-top b { color: #fff; font-size: 14px; }
    .o-b { font-size: 12.5px; color: #a5b4cf; line-height: 1.45; }
    .o-fx { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; font-weight: 700; color: #a5b4cf; }
    .ses { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .se { display: flex; flex-direction: column; gap: 6px; padding: 11px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); border: 1px solid var(--line); }
    .cost { margin-left: auto; font-size: 12px; font-weight: 800; color: #fde68a; }
    .se-act { display: flex; gap: 6px; margin-top: auto; }
    .se-act .sel { flex: 1; min-width: 0; }
    .camps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
    .camp { display: flex; flex-direction: column; gap: 6px; padding: 13px; border-radius: 13px; text-align: left; cursor: pointer; font-family: inherit; color: #dbe4f0; background: radial-gradient(90% 70% at 100% 0%, rgba(251, 191, 36, 0.1), transparent 70%), rgba(2, 6, 23, 0.5); border: 1px solid rgba(251, 191, 36, 0.35); }
    .camp:hover:not(:disabled) { border-color: #fbbf24; }
    .camp:disabled { opacity: 0.55; cursor: not-allowed; }
    .why { font-size: 11.5px; font-weight: 700; color: #fca5a5; }
    .devs { display: flex; flex-direction: column; gap: 6px; }
    .dv { display: grid; grid-template-columns: minmax(200px, 1.3fr) minmax(170px, 1fr) minmax(190px, 1.1fr) minmax(150px, 0.8fr) auto; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(51, 65, 85, 0.4); }
    .dv.bench { border-style: dashed; }
    .dv-id { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .rl { width: 30px; font-size: 10.5px; font-weight: 900; color: #8aa0c4; flex-shrink: 0; }
    .dv-n { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .delta { font-size: 12px; font-weight: 900; color: #94a3b8; min-width: 24px; text-align: right; }
    .dv-lv, .dv-ovr, .dv-rate { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .lv-t { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
    .lv-t b, .dv-lv b, .dv-ovr b { color: #fff; }
    .dv-rate { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 5px; }
    .dv-set { display: flex; flex-direction: column; gap: 5px; align-items: flex-end; }
    .mini button { padding: 4px 8px; font-size: 11px; }
    @media (max-width: 1250px) {
        .dv { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .dv-set { align-items: flex-start; flex-direction: row; flex-wrap: wrap; }
        .camps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .dv { grid-template-columns: 1fr; } .ses, .camps { grid-template-columns: 1fr; } }
</style>
