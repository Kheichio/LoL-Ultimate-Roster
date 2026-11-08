<script>
    // The backroom and the buildings: hire staff from this window's candidates,
    // upgrade the training centre, gaming house and streaming studio, and see the
    // fans and who is injured.
    import { manager, mutate } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { myTeam } from '../../manager/engine.js';
    import { academyUpkeep } from '../../manager/academy.js';
    import { rngFor } from '../../manager/util.js';
    import {
        STAFF_ROLES, staffCandidates, staffOf, staffWages, hireStaff, fireStaff, FACILITIES, FACILITY_MAX, facLevel,
        facilityCost, facilityUpkeep, upgradeFacility, fansOf, fanWord, rivalHeat, RIVAL_HEAT, injuryName,
    } from '../../manager/clublife.js';
    import { fmtMoney, ovrColor } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: cands = team ? staffCandidates(s, rngFor) : {};
    $: fans = team ? fansOf(team) : 0;
    $: fw = fanWord(fans);
    $: injured = team ? team.roster.map(id => s.players[id]).filter(p => p && p.inj > 0) : [];
    $: rivals = Object.entries(s.rivals || {}).filter(([id, h]) => h >= RIVAL_HEAT && s.teams[id]).sort((a, b) => b[1] - a[1]);

    function hire(role, c) {
        const cur = staffOf(s, role.id);
        openConfirmModal(`Hire ${c.name} (${c.rating}) as your ${role.name.toLowerCase()} for ${fmtMoney(c.wage)} a year? Signing on costs ${fmtMoney(Math.round(c.wage * 0.25 / 1000) * 1000)} now.${cur ? ` ${cur.name} leaves.` : ''}`, () => {
            const r = mutate(sv => hireStaff(sv, role.id, c));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
        });
    }
    function fire(role) {
        const r = mutate(sv => fireStaff(sv, role.id));
        if (r) showToast(r.msg, r.ok ? 'info' : 'error', 3500);
    }
    function upgrade(f) {
        const r = mutate(sv => upgradeFacility(sv, f.id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
    }
</script>

{#if team}
<div class="fac">
    <div>
        <h1 class="page-h">Staff and facilities</h1>
        <p class="page-sub">The people behind the five and the buildings they work in. Staff wages and running costs come out of the balance every week ({fmtMoney(staffWages(s) + facilityUpkeep(s) + academyUpkeep(s))} a year right now).</p>
    </div>

    <div class="grid3">
        <section class="panel">
            <div class="ph"><h3><Icon name="heart" size={15} /> Fans</h3><span class="chip" style="--c:{fw[1]}">{fw[0]}</span></div>
            <div class="fanbar"><span class="bar"><i style="width:{fans}%; background:{fw[1]}"></i></span><b class="num">{Math.round(fans)}</b></div>
            <p class="muted small">Wins, titles and promotion bring fans; defeats and relegation drive them away, and a rivalry doubles both. Fans scale base revenue (up to +15%) and sponsor appeal. Under 25 they turn on you and the board feels it every week.</p>
        </section>
        <section class="panel">
            <div class="ph"><h3><Icon name="flame" size={15} /> Rivals</h3></div>
            {#if rivals.length}
                <ul class="riv">{#each rivals as [id, h] (id)}<li><TeamBadge team={s.teams[id]} size={20} /> <b>{s.teams[id].name}</b><span class="muted small">heat {Math.round(h * 10) / 10}</span></li>{/each}</ul>
            {:else}<p class="muted small">No rivals yet. Knockout defeats and repeated meetings build a rivalry; beating a rival lifts fans, morale and the board, losing to one costs all three.</p>{/if}
        </section>
        <section class="panel">
            <div class="ph"><h3><Icon name="alert" size={15} /> Injuries</h3><span class="chip" style="--c:{injured.length ? '#f87171' : '#34d399'}">{injured.length ? `${injured.length} out` : 'All fit'}</span></div>
            {#if injured.length}
                <ul class="riv">{#each injured as p (p.id)}<li><PName {p} /><span class="muted small">{p.role} · {injuryName(p)} · {p.inj} week{p.inj === 1 ? '' : 's'}</span></li>{/each}</ul>
            {:else}<p class="muted small">Intense training, age and low morale raise the risk; a good physio and a rest week lower it, and a top physio speeds recovery. An injured player sits out and the best healthy player takes his seat. Short of cover? Borrow a player of his role on loan, any time.</p>{/if}
        </section>
    </div>

    <section class="panel">
        <div class="ph"><h3><Icon name="home" size={15} /> Facilities</h3></div>
        <div class="facs">
            {#each FACILITIES as f (f.id)}
                {@const lv = facLevel(team, f.id)}
                <div class="fc">
                    <div class="fc-h"><Icon name={f.icon} size={16} /><b>{f.name}</b><span class="lvl">{#each Array(FACILITY_MAX) as _, i}<i class:on={i < lv}></i>{/each}</span></div>
                    <p class="muted small">{f.blurb}</p>
                    {#if lv < FACILITY_MAX}<button class="btn btn-sm btn-p" disabled={facilityCost(s, f.id) > s.finance.balance} on:click={() => upgrade(f)}><Icon name="upgrade" size={12} /> Level {lv + 1} · {fmtMoney(facilityCost(s, f.id))}</button>{:else}<span class="chip" style="--c:#34d399">Fully built</span>{/if}
                </div>
            {/each}
        </div>
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="squad" size={15} /> Staff</h3><span class="muted small">New candidates every half-season</span></div>
        <div class="staff">
            {#each STAFF_ROLES as role (role.id)}
                {@const cur = staffOf(s, role.id)}
                <div class="sr">
                    <div class="sr-h"><Icon name={role.icon} size={15} /><b>{role.name}</b></div>
                    <p class="muted tiny">{role.blurb}</p>
                    <div class="cur">{#if cur}<span><b>{cur.name}</b>{cur.wage ? ` · ${fmtMoney(cur.wage)}/yr` : ''}</span><span class="ovr" style="--c:{ovrColor(cur.rating)}">{cur.rating}</span>{#if role.id !== 'coach'}<button class="btn btn-sm" on:click={() => fire(role)}>Let go</button>{/if}{:else}<span class="muted">Vacant</span>{/if}</div>
                    <div class="cands">
                        {#each cands[role.id] || [] as c (c.id)}
                            <button class="cand" on:click={() => hire(role, c)} disabled={cur && cur.name === c.name}><span>{c.name}</span><span class="ovr" style="--c:{ovrColor(c.rating)}">{c.rating}</span><span class="muted tiny">{fmtMoney(c.wage)}/yr</span></button>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    </section>
</div>
{:else}
    <div class="panel empty">You need a club.</div>
{/if}

<style>
    .fac { display: flex; flex-direction: column; gap: 14px; }
    .small { font-size: 12.5px; }
    .tiny { font-size: 11px; }
    .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .fanbar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .fanbar .bar { flex: 1; height: 8px; border-radius: 5px; background: rgba(51, 65, 85, 0.6); overflow: hidden; }
    .fanbar .bar i { display: block; height: 100%; }
    .riv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .riv li { display: flex; align-items: center; gap: 8px; }
    .facs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .fc { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 12px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); }
    .fc-h { display: flex; align-items: center; gap: 8px; width: 100%; color: #fff; }
    .lvl { margin-left: auto; display: flex; gap: 3px; }
    .lvl i { width: 14px; height: 6px; border-radius: 3px; background: rgba(51, 65, 85, 0.7); }
    .lvl i.on { background: #34d399; }
    .staff { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
    .sr { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); }
    .sr-h { display: flex; align-items: center; gap: 7px; color: #fff; }
    .cur { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.8); }
    .cur span:first-child { flex: 1; min-width: 0; }
    .cands { display: flex; flex-direction: column; gap: 4px; }
    .cand { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; font: inherit; font-size: 13px; color: #e2e8f0; background: none; border: 1px solid rgba(51, 65, 85, 0.6); cursor: pointer; text-align: left; }
    .cand:hover:not(:disabled) { border-color: #34d399; }
    @media (max-width: 960px) { .grid3, .facs { grid-template-columns: 1fr; } }
</style>
