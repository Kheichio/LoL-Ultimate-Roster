<script>
    // A player's club career: his real seasons before the save (from the cards),
    // then every split he started in it (club, league, finish, his OVR, what it
    // won), and the trophies. Works for a retired player too.
    import { manager, mgrModal, mgrHistTeam, mgrScreen } from '../../stores/manager.js';
    import { playerCareer, anyTeam } from '../../manager/history.js';
    import { leagueName } from '../../manager/engine.js';
    import { ordinal } from '../../manager/util.js';
    import { ovrColor } from '../../manager/ui.js';
    import { SPLIT_BY_CODE } from '../../manager/data.js';
    import { getDB } from '../../utils/cards.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    export let id;
    $: s = $manager;
    $: c = playerCareer(s, getDB(), id);
    $: medals = countTitles(c.titles);

    const TITLE = { worlds: ['World champion', '#facc15', 'crown'], msi: ['MSI champion', '#38bdf8', 'globe'], league: ['League champion', '#fbbf24', 'trophy'], tier2: ['Second-tier champion', '#cbd5e1', 'trophy'], firststand: ['First Stand champion', '#f472b6', 'flag'], cup: ['Regional Cup winner', '#fb923c', 'shield'] };
    function countTitles(list) {
        const m = {};
        for (const t of list) m[t.kind] = (m[t.kind] || 0) + 1;
        return Object.entries(m).filter(([k]) => TITLE[k]).sort((a, b) => Object.keys(TITLE).indexOf(a[0]) - Object.keys(TITLE).indexOf(b[0]));
    }
    function result(r) {
        const bits = [];
        if (r.w.includes('worlds')) bits.push(['World champions', '#facc15']);
        else if (r.w.includes('worlds2')) bits.push(['Worlds final', '#e2e8f0']);
        else if (r.wp) bits.push([`Worlds top ${r.wp <= 4 ? 4 : r.wp <= 8 ? 8 : 16}`, '#a5b4fc']);
        if (r.w.includes('firststand')) bits.push(['First Stand champions', '#f472b6']);
        else if (r.w.includes('firststand2')) bits.push(['First Stand final', '#e2e8f0']);
        if (r.w.includes('msi')) bits.push(['MSI champions', '#38bdf8']);
        else if (r.w.includes('msi2')) bits.push(['MSI final', '#e2e8f0']);
        if (r.w.includes('league') || r.w.includes('tier2')) bits.push(['Champions', '#fbbf24']);
        else if (r.w.includes('final') || r.w.includes('final2')) bits.push(['Runners-up', '#e2e8f0']);
        if (r.w.includes('up')) bits.push(['Promoted', '#a78bfa']);
        if (r.w.includes('down')) bits.push(['Relegated', '#f87171']);
        return bits;
    }
    function club(teamId) {
        mgrHistTeam.set(teamId);
        mgrModal.set(null);
        mgrScreen.set('history');
    }
</script>

<section class="panel pc">
    <div class="ph"><h3><Icon name="archive" size={14} /> Club career</h3>
        {#if medals.length}<span class="medals">{#each medals as [k, n] (k)}<span class="chip" style="--c:{TITLE[k][1]}"><Icon name={TITLE[k][2]} size={11} /> {n > 1 ? n + '× ' : ''}{TITLE[k][0]}</span>{/each}</span>{/if}
    </div>
    {#if !c.pre.length && !c.splits.length && !c.years.length}
        <p class="muted small">No seasons on record yet.</p>
    {:else}
        <div class="tbl-wrap">
            <table class="tbl small">
                <thead><tr><th>Season</th><th>Club</th><th>League</th><th class="c">Finish</th><th class="c">OVR</th><th>Honours</th></tr></thead>
                <tbody>
                    {#each c.pre as r, i (i)}
                        <tr class="pre"><td class="num">{r.y}</td><td><b>{r.team}</b></td><td class="dim">{r.region}</td><td class="c dim">—</td><td class="c"><span class="ovr" style="--c:{ovrColor(r.ovr)}">{r.ovr}</span></td>
                            <td>{#each c.titles.filter(t => t.pre && t.y === r.y) as t, j (j)}<span class="chip" style="--c:{TITLE[t.kind][1]}">{TITLE[t.kind][0]}</span>{/each}<span class="real">real</span></td></tr>
                    {/each}
                    {#each c.splits as r, i (i)}
                        {@const t = anyTeam(s, r.teamId)}
                        <tr>
                            <td class="num">{r.y} {SPLIT_BY_CODE[r.s] || ''}</td>
                            <td>{#if t}<button class="cl" on:click={() => club(t.id)}><TeamBadge team={t} size={18} /> {t.short}</button>{/if}</td>
                            <td class="dim">{t ? leagueName(t.region, r.tier) : ''}</td>
                            <td class="c num">{r.p ? ordinal(r.p) : '—'}</td>
                            <td class="c"><span class="ovr" style="--c:{ovrColor(r.ovr || 0)}">{r.ovr || '—'}</span></td>
                            <td>{#each result(r) as [txt, col], j (j)}<span class="chip" style="--c:{col}">{txt}</span>{/each}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        {#if c.years.length}
            <div class="tbl-wrap">
                <table class="tbl small">
                    <thead><tr><th>Year</th><th>Club</th><th class="c">OVR</th><th class="c">Games</th><th class="c">Win</th><th class="c">K/D/A</th><th class="c">Rating</th><th class="c">MVP</th></tr></thead>
                    <tbody>
                        {#each c.years as y, i (i)}
                            {@const t = y.teamId ? anyTeam(s, y.teamId) : null}
                            <tr>
                                <td class="num">{y.y}{#if y.live}{' '}<span class="dim tiny">so far</span>{/if}</td>
                                <td>{#if t}<button class="cl" on:click={() => club(t.id)}><TeamBadge team={t} size={16} /> {t.short}</button>{:else}<span class="dim">Free agent</span>{/if}</td>
                                <td class="c"><span class="ovr" style="--c:{ovrColor(y.ovr)}">{y.ovr}</span></td>
                                <td class="c num">{y.g || '—'}</td>
                                <td class="c num">{y.g ? Math.round(y.w / y.g * 100) + '%' : '—'}</td>
                                <td class="c num">{y.g ? `${y.k}/${y.d}/${y.a}` : '—'}</td>
                                <td class="c num">{y.g ? (y.rs / y.g).toFixed(2) : '—'}</td>
                                <td class="c num">{y.mvp || '—'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    {/if}
</section>

<style>
    .pc { display: flex; flex-direction: column; gap: 10px; }
    .medals { display: flex; gap: 5px; flex-wrap: wrap; }
    .small { font-size: 12.5px; }
    .tiny { font-size: 11px; }
    tr.pre td { opacity: 0.85; }
    .real { font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #8aa0c4; margin-left: 6px; }
    .cl { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-weight: 700; color: #e2e8f0; background: none; border: none; padding: 0; cursor: pointer; }
    .cl:hover { color: #6ee7b7; }
    td .chip { margin-right: 4px; }
</style>
