<script>
    import { manager, mutate, mgrModal, mgrScreen } from '../../stores/manager.js';
    import { myTeam, setTactic, setTraining, setFocus, nextOpponent, scoutReport } from '../../manager/engine.js';
    import { TACTICS, TACTIC_BY_ID, TACTIC_BEATS, TRAINING, ATTRS, ROLE_IDS, XP_PER_LEVEL, POINTS_PER_LEVEL, COUNTER_EDGE, COMP_STYLES } from '../../manager/data.js';
    import { lineupOf, tacticFit, PHASE_ATTRS } from '../../manager/match.js';
    import { ovrOf, focusAttr, xpMultiplier } from '../../manager/people.js';
    import { ovrColor } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: lu = team ? lineupOf(team, s.players) : {};
    $: opp = nextOpponent(s);
    $: scout = opp ? scoutReport(s, opp.id) : null;
    $: theirs = scout ? TACTIC_BY_ID[scout.tactic] : null;
    $: roster = team ? team.roster.map(id => s.players[id]).filter(Boolean).sort((a, b) => ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role)) : [];
    $: tacRank = (s.manager.perks || {}).tactician || 0;
    $: devRank = (s.manager.perks || {}).developer || 0;
    $: coach = team && team.coach ? team.coach.rating - 60 : 10;

    const beatenBy = (id) => Object.entries(TACTIC_BEATS).filter(([, b]) => b.includes(id)).map(([k]) => TACTIC_BY_ID[k]);
    const phaseLabel = { early: 'Early', mid: 'Mid', late: 'Late' };
    function edgeVs(t) {
        if (!theirs) return null;
        if ((TACTIC_BEATS[t.id] || []).includes(theirs.id)) return { word: 'Counters them', tone: '#34d399' };
        if ((TACTIC_BEATS[theirs.id] || []).includes(t.id)) return { word: 'Countered', tone: '#f87171' };
        return { word: 'Neutral', tone: '#94a3b8' };
    }
</script>

{#if team}
<div class="tc">
    <div>
        <h1 class="page-h">Tactics & training</h1>
        <p class="page-sub">Every game is decided in three phases: <b>early</b> on Mechanics and Consistency, <b>mid</b> on Macro and Leadership, <b>late</b> on Teamfight and Composure. Your plan and theirs decide how much each phase counts, so pick the plan that steers the game toward what your five do best. A plan that counters theirs is worth an extra {COUNTER_EDGE + tacRank} points.</p>
    </div>

    {#if scout && theirs}
        <section class="panel intel">
            <TeamBadge team={opp} size={40} />
            <div class="intel-t">
                <span class="muted small">Next opponent</span>
                <b>{opp.name}</b>
            </div>
            <div class="intel-t">
                <span class="muted small">{scout.sure === 'exact' ? 'Their plan (scouted)' : 'They usually play'}</span>
                <b style="color:{theirs.color}">{theirs.name}</b>
            </div>
            <div class="intel-t">
                <span class="muted small">Beaten by</span>
                <b>{beatenBy(theirs.id).map(t => t.name).join(' or ')}</b>
            </div>
        </section>
    {/if}

    <section class="tacs">
        {#each TACTICS as t}
            {@const fit = tacticFit(lu, t.id)}
            {@const ev = edgeVs(t)}
            <button class="tac" class:on={team.tactic === t.id} style="--c:{t.color}" on:click={() => mutate(s => setTactic(s, t.id))}>
                <span class="tac-top">
                    <Icon name={t.icon} size={18} />
                    <span class="tac-n">{t.name}</span>
                    {#if team.tactic === t.id}<span class="chip" style="--c:#34d399">Selected</span>{/if}
                </span>
                <span class="tac-b">{t.blurb}</span>
                <span class="phases">
                    {#each ['early', 'mid', 'late'] as ph}
                        <span class="phase"><span class="ph-l">{phaseLabel[ph]}</span><span class="bar"><i style="width:{t.phases[ph] * 100 / 0.55}%; --c:{t.color}"></i></span></span>
                    {/each}
                </span>
                <span class="tac-row">
                    <span class="chip" style="--c:{fit.bonus >= 0.3 ? '#34d399' : fit.bonus > -0.3 ? '#94a3b8' : '#f87171'}">{fit.label}</span>
                    {#if ev}<span class="chip" style="--c:{ev.tone}">{ev.word}</span>{/if}
                </span>
                <span class="tac-vs"><b>Beats</b> {TACTIC_BEATS[t.id].map(id => TACTIC_BY_ID[id].short).join(', ')} · <b>loses to</b> {beatenBy(t.id).map(x => x.short).join(', ')}</span>
                <span class="tac-why muted">{t.why}</span>
            </button>
        {/each}
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="swords" size={15} /> Team compositions</h3><span class="muted small">Draft one and it plays better together; draft the one your plan wants and it plays better again</span></div>
        <div class="comps">
            {#each COMP_STYLES as c}
                <div class="comp" style="--c:{c.color}">
                    <span class="comp-top"><Icon name={c.icon} size={15} /><b>{c.name}</b><span class="chip" style="--c:{TACTIC_BY_ID[c.tactic].color}">{TACTIC_BY_ID[c.tactic].short}</span></span>
                    <span class="comp-b">{c.blurb}</span>
                    <span class="comp-n"><b>Needs:</b> {c.need}</span>
                </div>
            {/each}
        </div>
        <p class="muted small">Famous duos (Xayah and Rakan, Kalista and Thresh, Yasuo and Malphite, Lucian and Nami and more) add synergy of their own, and a five with no tank at all pays for it. Every pick in champion select shows what it adds.</p>
    </section>

    <section class="panel to-train">
        <Icon name="dumbbell" size={18} />
        <span><b>Training has its own screen now.</b> The weekly plan, how hard each player trains, the bench programme, sessions, bootcamps and every player's development forecast.</span>
        <button class="btn btn-p btn-sm" on:click={() => mgrScreen.set('training')}>Open Training <Icon name="chevron" size={12} stroke={2.4} /></button>
    </section>
</div>
{:else}
    <div class="panel empty">You have no club right now. Pick one of your job offers on the Club screen.</div>
{/if}

<style>
    .tc { display: flex; flex-direction: column; gap: 14px; }
    .page-sub b { color: #e2e8f0; }
    .intel { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .intel-t { display: flex; flex-direction: column; gap: 2px; }
    .intel-t b { font-size: 14px; color: #f1f5f9; }
    .small { font-size: 12px; }
    .tacs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .tac { display: flex; flex-direction: column; gap: 9px; padding: 14px; border-radius: 15px; text-align: left; cursor: pointer; font-family: inherit; color: #cbd5e1; background: radial-gradient(80% 60% at 0% 0%, color-mix(in srgb, var(--c) 12%, transparent), transparent 70%), rgba(15, 23, 42, 0.62); border: 1px solid var(--line); transition: border-color 0.15s, transform 0.15s; min-width: 0; }
    .tac:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 60%, transparent); }
    .tac.on { border-color: var(--c); box-shadow: 0 0 0 1px var(--c) inset, 0 10px 28px color-mix(in srgb, var(--c) 20%, transparent); }
    .tac-top { display: flex; align-items: center; gap: 8px; color: var(--c); flex-wrap: wrap; }
    .tac-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: #f1f5f9; }
    .tac-b { font-size: 12px; line-height: 1.5; color: #94a3b8; }
    .phases { display: flex; flex-direction: column; gap: 4px; }
    .phase { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 6px; }
    .ph-l { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
    .tac-row { display: flex; gap: 5px; flex-wrap: wrap; }
    .tac-vs { font-size: 11.5px; color: #94a3b8; }
    .tac-vs b { color: #cbd5e1; }
    .tac-why { font-size: 11.5px; line-height: 1.45; }
    .comps { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; margin-bottom: 10px; }
    .comp { display: flex; flex-direction: column; gap: 5px; padding: 11px; border-radius: 12px; background: color-mix(in srgb, var(--c) 7%, rgba(2, 6, 23, 0.5)); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
    .comp-top { display: flex; align-items: center; gap: 7px; color: var(--c); }
    .comp-top b { flex: 1; color: #fff; font-size: 13.5px; }
    .comp-b { font-size: 12px; color: #a5b4cf; line-height: 1.45; }
    .comp-n { font-size: 11.5px; color: #cbd5e1; }
    .comp-n b { color: #fff; }
    .to-train { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; color: #6ee7b7; border-color: rgba(52, 211, 153, 0.4); }
    .to-train span { flex: 1; min-width: 220px; font-size: 13.5px; color: #dbe4f0; }
    .to-train b { color: #fff; }
    @media (max-width: 1200px) { .tacs { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 620px) { .tacs { grid-template-columns: 1fr; } }
</style>
