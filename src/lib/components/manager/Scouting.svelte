<script>
    // Recruitment's front end: send scouts out, read their reports, and see who would
    // actually improve the squad. Prospects go to the academy; everyone else is a transfer.
    import { manager, mutate, mgrModal, mgrScreen } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { myTeam, runScoutingTrip, isScouted } from '../../manager/engine.js';
    import { REGIONS, ROLE_IDS, IMPORT_MAX } from '../../manager/data.js';
    import { tripCost, scoutReports, signProspect, passProspect, prospectFee, academyIds, academyLevel, ACADEMY_LEVELS } from '../../manager/academy.js';
    import { recommendations, askingPrice, wageAsk, importCount, toggleShortlist } from '../../manager/market.js';
    import { ovrOf, ageOf, potentialView, playStyleOf, isImport } from '../../manager/people.js';
    import { ovrColor, fmtMoney } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    let region = null;
    let role = '';
    $: s = $manager;
    $: team = myTeam(s);
    $: year = s.time.year;
    $: if (region === null && team) region = team.region;
    $: scoutRank = (s.manager.perks || {}).scout || 0;
    $: reports = team ? scoutReports(s) : [];
    $: lv = team ? academyLevel(team) : 0;
    $: slots = lv ? ACADEMY_LEVELS[lv].slots : 0;
    $: inAcademy = team ? academyIds(s, team).length : 0;
    $: tripDone = s.lastTrip === s.time.year * 1000 + s.time.step;
    $: recs = team ? recommendations(s) : [];
    $: list = (s.shortlist || []).map(id => s.players[id]).filter(Boolean);
    $: imports = team ? importCount(s, team) : 0;

    function run(fn, long = false) {
        const r = mutate(fn);
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', long ? 9000 : 4000);
    }
    const view = (p) => mgrModal.set({ kind: 'player', id: p.id });
    const pv = (p) => potentialView(p, { scouted: isScouted(s, p), scoutRank });
    const pot = (p) => { const v = pv(p); return v.exact ? String(v.lo) : `${v.lo}–${v.hi}`; };
</script>

{#if team}
<div class="sc">
    <div class="top">
        <div>
            <h1 class="page-h">Scouting</h1>
            <p class="page-sub">Find talent before anyone else. Prospects you sign go straight into your academy.</p>
        </div>
        <div class="facts">
            <span class="chip" style="--c:#a78bfa">Academy {inAcademy}/{slots}</span>
            <span class="chip" style="--c:{imports >= IMPORT_MAX ? '#f87171' : '#34d399'}" title="Players from outside your region. Five years in a row in one region can naturalise a player.">Imports {imports}/{IMPORT_MAX}</span>
        </div>
    </div>

    <div class="cols">
        <section class="panel">
            <div class="ph"><h3><Icon name="map" size={15} /> Send your scouts</h3><span class="muted small">{fmtMoney(tripCost(s))} a trip · one a week</span></div>
            <div class="trip">
                <select class="sel" bind:value={region}>{#each REGIONS as r (r.id)}<option value={r.id}>{r.league}</option>{/each}</select>
                <select class="sel" bind:value={role}><option value="">Any role</option>{#each ROLE_IDS as r (r)}<option value={r}>{r}</option>{/each}</select>
                <button class="btn btn-p" disabled={tripDone || tripCost(s) > s.finance.balance} on:click={() => run(sv => runScoutingTrip(sv, region, role || null), true)}><Icon name="search" size={13} /> {tripDone ? 'Scouts are out' : 'Send them'}</button>
            </div>
            <p class="muted small">They scout every free agent in that region and come back with two or three prospects (three with a head scout of 80 or more). A prospect from outside your region would count as an import when called up.</p>
        </section>

        <section class="panel">
            <div class="ph"><h3><Icon name="quests" size={15} /> Reports</h3>{#if reports.length}<span class="chip" style="--c:#34d399">{reports.length} on your desk</span>{/if}</div>
            {#if reports.length}
                <ul class="rep">
                    {#each reports as p (p.id)}
                        <li>
                            <span class="r-n"><PName {p} /><span class="muted small">{p.role} · {ageOf(p, year)} · {playStyleOf(p).name}{isImport(p, team.region) ? ' · import' : ''}</span></span>
                            <span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span>
                            <span class="muted small">pot {pot(p)}</span>
                            <button class="btn btn-sm btn-p" disabled={inAcademy >= slots} on:click={() => run(sv => signProspect(sv, p.id))}>To academy · {fmtMoney(prospectFee(s, p))}</button>
                            <button class="btn btn-sm" on:click={() => run(sv => passProspect(sv, p.id))}>Pass</button>
                        </li>
                    {/each}
                </ul>
                {#if inAcademy >= slots}<p class="muted small">Your academy is full. <button class="lnk" on:click={() => mgrScreen.set('academy')}>Make room</button>.</p>{/if}
            {:else}<p class="muted small">No reports. Send your scouts somewhere. Reports stay here until the next preseason, when the prospects go back to the open market.</p>{/if}
        </section>
    </div>

    <section class="panel">
        <div class="ph"><h3><Icon name="target" size={15} /> Who would improve this squad</h3><span class="muted small">Players who would sign and you can pay for, role by role</span></div>
        <div class="recs">
            {#each recs as r (r.role)}
                <div class="rc">
                    <div class="rc-h"><b>{r.role}</b>{#if r.current}<span class="muted small">now <PName p={r.current} link={false} /> <span class="ovr" style="--c:{ovrColor(ovrOf(r.current))}">{ovrOf(r.current)}</span></span>{:else}<span class="chip" style="--c:#f87171">Empty</span>{/if}</div>
                    {#each r.options as o (o.p.id)}
                        <button class="rc-p" on:click={() => view(o.p)}>
                            <span class="ovr" style="--c:{ovrColor(ovrOf(o.p))}">{ovrOf(o.p)}</span>
                            <span class="rc-n"><b>{o.p.name}</b><span class="muted tiny">{o.tag} · {ageOf(o.p, year)} · {o.p.team ? s.teams[o.p.team].short : 'free agent'}{isImport(o.p, team.region) ? ' · import' : ''}</span></span>
                            <span class="num tiny">{o.p.team ? fmtMoney(askingPrice(s, o.p)) : 'Free'}</span>
                        </button>
                    {:else}
                        <p class="muted tiny">Nobody better within reach.</p>
                    {/each}
                </div>
            {/each}
        </div>
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="star" size={15} /> Shortlist</h3><span class="muted small">Star a player on his profile or in Transfers</span></div>
        {#if list.length}
            <div class="tbl-wrap">
                <table class="tbl">
                    <thead><tr><th>Player</th><th>Style</th><th>Club</th><th class="c">Age</th><th class="c">OVR</th><th class="c">Potential</th><th class="r">Asking</th><th class="r">Wage ask</th><th></th></tr></thead>
                    <tbody>
                        {#each list as p (p.id)}
                            <tr class="click" on:click={() => view(p)}>
                                <td><PName {p} /> <span class="dim">{p.role}</span></td>
                                <td class="dim small">{playStyleOf(p).name}</td>
                                <td>{#if p.team && s.teams[p.team]}<span class="trow"><TeamBadge team={s.teams[p.team]} size={20} /> {s.teams[p.team].short}</span>{:else}<span class="dim">Free agent</span>{/if}</td>
                                <td class="c num">{ageOf(p, year)}</td>
                                <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                                <td class="c num">{pot(p)}</td>
                                <td class="r num">{p.team && p.team !== team.id ? fmtMoney(askingPrice(s, p)) : '—'}</td>
                                <td class="r num">{p.team === team.id ? '—' : fmtMoney(wageAsk(s, p, team))}</td>
                                <td class="r"><button class="btn btn-sm" on:click|stopPropagation={() => run(sv => toggleShortlist(sv, p.id))}>Remove</button></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}<p class="muted small">Nobody yet.</p>{/if}
    </section>
</div>
{:else}
    <div class="panel empty">You need a club to scout for.</div>
{/if}

<style>
    .sc { display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .facts { display: flex; gap: 6px; flex-wrap: wrap; }
    .cols { display: grid; grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr); gap: 12px; align-items: start; }
    .small { font-size: 12.5px; }
    .tiny { font-size: 11px; }
    .trip { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .rep { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .rep li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .r-n { flex: 1; min-width: 170px; display: flex; flex-direction: column; gap: 1px; }
    .recs { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
    .rc { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .rc-h { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: #fff; margin-bottom: 2px; }
    .rc-p { display: flex; align-items: center; gap: 7px; padding: 5px 6px; border-radius: 7px; font: inherit; text-align: left; color: #e2e8f0; background: none; border: 1px solid rgba(51, 65, 85, 0.5); cursor: pointer; }
    .rc-p:hover { border-color: #34d399; }
    .rc-n { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .rc-n b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .trow { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; color: #e2e8f0; }
    .lnk { background: none; border: none; padding: 0; font: inherit; color: #6ee7b7; cursor: pointer; text-decoration: underline; }
    @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
</style>
