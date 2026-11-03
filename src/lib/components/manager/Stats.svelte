<script>
    // This season's numbers: your players, and the leaders of your league
    // (rating, KDA, MVP awards). Read straight off each player's season stats.
    import { manager, mgrModal } from '../../stores/manager.js';
    import { myTeam, leagueName } from '../../manager/engine.js';
    import { ROLE_IDS } from '../../manager/data.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    const avg = (p) => (p.st && p.st.g ? p.st.rs / p.st.g : 0);
    const kda = (p) => (p.st ? (p.st.k + p.st.as) / Math.max(1, p.st.d) : 0);
    $: mine = team ? team.roster.map(id => s.players[id]).filter(Boolean).sort((a, b) => ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role)) : [];
    $: leaguePlayers = team ? Object.values(s.teams).filter(t => t.region === team.region && t.tier === team.tier)
        .flatMap(t => t.roster.map(id => s.players[id])).filter(p => p && p.st && p.st.g >= 4) : [];
    $: byRating = leaguePlayers.slice().sort((a, b) => avg(b) - avg(a)).slice(0, 10);
    $: byKda = leaguePlayers.slice().sort((a, b) => kda(b) - kda(a)).slice(0, 10);
    $: byMvp = leaguePlayers.filter(p => p.st.mvp).sort((a, b) => b.st.mvp - a.st.mvp || avg(b) - avg(a)).slice(0, 10);
    $: bestRole = Object.fromEntries(ROLE_IDS.map(r => [r, leaguePlayers.filter(p => p.role === r).sort((a, b) => avg(b) - avg(a))[0]]));
    const open = (p) => mgrModal.set({ kind: 'player', id: p.id });
</script>

{#if team}
<div class="sts">
    <div>
        <h1 class="page-h">Stats</h1>
        <p class="page-sub">{s.time.year} in {leagueName(team.region, team.tier)}: every game this year, regular season and knockouts.</p>
    </div>

    <section class="panel">
        <div class="ph"><h3><TeamBadge {team} size={20} /> Your players</h3></div>
        <div class="tbl-wrap">
            <table class="tbl">
                <thead><tr><th>Role</th><th>Player</th><th class="c">Games</th><th class="c">Won</th><th class="c">K / D / A</th><th class="c">KDA</th><th class="c">Rating</th><th class="c">MVP</th></tr></thead>
                <tbody>
                    {#each mine as p (p.id)}
                        <tr class="click" on:click={() => open(p)}>
                            <td class="dim">{p.role}</td><td><PName {p} /></td>
                            <td class="c num">{p.st ? p.st.g : 0}</td>
                            <td class="c num">{p.st && p.st.g ? Math.round(p.st.w / p.st.g * 100) + '%' : '—'}</td>
                            <td class="c num">{p.st ? `${p.st.k} / ${p.st.d} / ${p.st.as}` : '—'}</td>
                            <td class="c num">{p.st && p.st.g ? kda(p).toFixed(1) : '—'}</td>
                            <td class="c num" class:good={avg(p) >= 7.3} class:bad={avg(p) > 0 && avg(p) < 6}>{p.st && p.st.g ? avg(p).toFixed(2) : '—'}</td>
                            <td class="c num">{p.st && p.st.mvp ? p.st.mvp : '—'}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="star" size={15} /> Best in each role</h3><span class="muted small">By average rating, at least four games</span></div>
        <div class="roles">
            {#each ROLE_IDS as r (r)}
                {@const p = bestRole[r]}
                <div class="rb" class:me={p && p.team === team.id}><span class="rr">{r}</span>{#if p}<PName {p} /><span class="muted small">{s.teams[p.team] ? s.teams[p.team].short : ''} · {avg(p).toFixed(2)}</span>{:else}<span class="muted">—</span>{/if}</div>
            {/each}
        </div>
    </section>

    <div class="three">
        {#each [['Rating', byRating, (p) => avg(p).toFixed(2)], ['KDA', byKda, (p) => kda(p).toFixed(1)], ['MVP awards', byMvp, (p) => p.st.mvp]] as [label, list, val] (label)}
            <section class="panel">
                <div class="ph"><h3><Icon name="ranking" size={15} /> {label}</h3></div>
                {#if list.length}
                    <ol class="lead">
                        {#each list as p, i (p.id)}
                            <li class:me={p.team === team.id}><span class="num muted">{i + 1}</span><span class="ln"><PName {p} /><span class="muted small">{p.role} · {s.teams[p.team] ? s.teams[p.team].short : 'FA'}</span></span><b class="num">{val(p)}</b></li>
                        {/each}
                    </ol>
                {:else}<p class="muted small">Not enough games yet.</p>{/if}
            </section>
        {/each}
    </div>
</div>
{:else}
    <div class="panel empty">You need a club for stats.</div>
{/if}

<style>
    .sts { display: flex; flex-direction: column; gap: 14px; }
    .small { font-size: 12px; }
    .roles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .rb { display: flex; flex-direction: column; gap: 3px; padding: 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); min-width: 0; }
    .rb.me, li.me { outline: 1px solid rgba(52, 211, 153, 0.5); }
    .rr { font-size: 10px; font-weight: 900; color: #6ee7b7; }
    .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .lead { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .lead li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 5px 8px; border-radius: 8px; background: rgba(2, 6, 23, 0.35); }
    .ln { display: flex; flex-direction: column; min-width: 0; }
    @media (max-width: 960px) { .three { grid-template-columns: 1fr; } .roles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
