<script>
    // The all-time list: every player who has played in this save, alive or retired, ranked
    // on what they won and how well they played. Real pros bring what they won before the save.
    import { manager, mgrModal } from '../../stores/manager.js';
    import { allTimeBest, anyTeam } from '../../manager/history.js';
    import { ROLE_IDS, REGION_IDS } from '../../manager/data.js';
    import { ovrColor } from '../../manager/ui.js';
    import { getDB } from '../../utils/cards.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    let role = null;
    let region = null;
    $: s = $manager;
    $: rows = allTimeBest(s, getDB(), { role, region, limit: 60 });
    const kda = (r) => (r.d ? ((r.k + r.a) / r.d).toFixed(1) : r.k + r.a ? '∞' : '—');
    const win = (r) => (r.g ? Math.round(r.w / r.g * 100) + '%' : '—');
    const rating = (r) => (r.g ? (r.rs / r.g).toFixed(2) : '—');
    const open = (r) => mgrModal.set({ kind: 'player', id: r.id });
</script>

<div class="lg">
    <div class="top">
        <div>
            <h1 class="page-h">All-time greats</h1>
            <p class="page-sub">Every player in this world, ranked on titles, awards, peak and longevity. Real pros bring the titles they won before the save began.</p>
        </div>
        <div class="filters">
            <div class="seg">
                <button class:on={!role} on:click={() => (role = null)}>All roles</button>
                {#each ROLE_IDS as r (r)}<button class:on={role === r} on:click={() => (role = r)}>{r}</button>{/each}
            </div>
            <div class="seg">
                <button class:on={!region} on:click={() => (region = null)}>Every region</button>
                {#each REGION_IDS as r (r)}<button class:on={region === r} on:click={() => (region = r)}>{r}</button>{/each}
            </div>
        </div>
    </div>
    <section class="panel">
        {#if rows.length}
            <div class="tbl-wrap">
                <table class="tbl">
                    <thead><tr><th class="c">#</th><th>Player</th><th class="c">Role</th><th>Last club</th><th class="c">Peak</th><th class="c" title="The year he turned pro">Pro</th><th class="c">Games</th><th class="c">Win</th><th class="c">KDA</th><th class="c">Rating</th><th class="c" title="Player of the Year, All-Pro">Awards</th><th class="c" title="Worlds, MSI, First Stand, league titles, cups">Titles</th><th class="r">Score</th></tr></thead>
                    <tbody>
                        {#each rows as r, i (r.id)}
                            {@const club = r.team ? s.teams[r.team] : r.last ? anyTeam(s, r.last) : null}
                            <tr class="click" on:click={() => open(r)}>
                                <td class="c num muted">{i + 1}</td>
                                <td><b class="pn">{r.n}</b>{#if r.flag}<span class="fl">{r.flag}</span>{/if}{#if !r.alive}<span class="ret">Retired</span>{/if}</td>
                                <td class="c muted">{r.r}</td>
                                <td>{#if club}<span class="trow"><TeamBadge team={club} size={18} /> {club.short}</span>{:else}<span class="muted">—</span>{/if}</td>
                                <td class="c"><span class="ovr" style="--c:{ovrColor(r.peak)}">{r.peak}</span></td>
                                <td class="c num muted">{r.pro || '—'}</td>
                                <td class="c num">{r.g}</td>
                                <td class="c num">{win(r)}</td>
                                <td class="c num">{kda(r)}</td>
                                <td class="c num">{rating(r)}</td>
                                <td class="c num">{(r.aw.mvp || 0) + (r.aw.allpro || 0) || '—'}</td>
                                <td class="c ti">
                                    {#if r.worlds}<span class="t w" title="Worlds">{r.worlds}W</span>{/if}
                                    {#if r.msi}<span class="t m" title="MSI">{r.msi}M</span>{/if}
                                    {#if r.firststand}<span class="t f" title="First Stand">{r.firststand}F</span>{/if}
                                    {#if r.league}<span class="t l" title="League titles">{r.league}L</span>{/if}
                                    {#if r.cup}<span class="t c2" title="Regional Cups">{r.cup}C</span>{/if}
                                </td>
                                <td class="r num"><b>{r.score}</b></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            <div class="empty"><Icon name="archive" size={22} /> Nobody on record yet: play a few weeks.</div>
        {/if}
    </section>
</div>

<style>
    .lg { display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .filters { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .pn { color: #fff; }
    .fl { margin-left: 6px; }
    .ret { margin-left: 6px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #94a3b8; }
    .ti { white-space: nowrap; }
    .t { display: inline-block; margin: 0 1px; padding: 1px 5px; border-radius: 5px; font-size: 11px; font-weight: 800; color: #0b1120; }
    .t.w { background: #facc15; }
    .t.m { background: #38bdf8; }
    .t.f { background: #f472b6; }
    .t.l { background: #fbbf24; }
    .t.c2 { background: #fb923c; }
    @media (max-width: 800px) { .filters { align-items: flex-start; } }
</style>
