<script>
    // A club's story: its honours, its legends, and every player who has worn
    // the shirt. Before the save it comes from the card database; during the
    // save, from the record book the engine keeps for clubs the manager runs.
    import { get } from 'svelte/store';
    import { manager, mgrModal, mgrHistTeam } from '../../stores/manager.js';
    import { myTeam, leagueName } from '../../manager/engine.js';
    import { REGIONS, ROLE_IDS } from '../../manager/data.js';
    import { clubHistory, anyTeam } from '../../manager/history.js';
    import { getDB } from '../../utils/cards.js';
    import { ageOf } from '../../manager/people.js';
    import { ovrColor } from '../../manager/ui.js';
    import { clubStyle } from '../../manager/market.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    /** Which club opens first. Only tools/managerRender passes it. */
    export let initialTeam = null;

    $: s = $manager;
    $: me = myTeam(s);
    let teamId = initialTeam || get(mgrHistTeam);
    mgrHistTeam.set(null);
    $: if (!teamId || !anyTeam(s, teamId)) teamId = me ? me.id : Object.keys(s.teams)[0];
    $: team = anyTeam(s, teamId);
    $: folded = Object.values(s.defunct || {}).slice().sort((a, b) => (b.defunct || 0) - (a.defunct || 0));
    $: db = getDB();
    $: hist = team ? clubHistory(s, db, team) : null;
    $: players = hist ? withRoster(hist.players, team, s) : [];
    $: legends = players.filter(p => p.tier).slice(0, 10);
    $: honours = hist ? hist.honours : [];
    $: counts = countHonours(honours);
    let filter = 'all';
    $: shown = players.filter(p => filter === 'all' || (filter === 'current' && p.current) || (filter === 'before' && p.pre && !p.inSave) || (filter === 'save' && (p.inSave || p.current)))
        .sort((a, b) => (b.y1 - a.y1) || (b.s - a.s));
    $: clubs = Object.values(s.teams).slice().sort((a, b) => a.region.localeCompare(b.region) || a.tier - b.tier || a.name.localeCompare(b.name));

    /** Current players of a club whose record book was never kept still belong on its list. */
    function withRoster(list, team, s) {
        const ids = new Set(list.map(p => p.id));
        const out = list.slice();
        for (const id of team.roster) {
            if (ids.has(id)) continue;
            const p = s.players[id];
            if (!p) continue;
            const from = Math.min(Number(p.joined) || s.time.year, s.time.year);
            out.push({ id, n: p.name, r: p.role, real: !!p.real, y0: from, y1: s.time.year, s: s.time.year - from + 1, g: 0, w: 0, t: {}, aw: [], current: true, score: 0, tier: null, titles: 0, untracked: true });
        }
        return out;
    }
    function countHonours(list) {
        const c = {};
        for (const h of list) c[h.kind] = (c[h.kind] || 0) + 1;
        return c;
    }
    const KIND = {
        worlds: { name: 'World titles', one: 'World title', icon: 'crown', color: '#facc15' },
        msi: { name: 'MSI titles', one: 'MSI title', icon: 'globe', color: '#38bdf8' },
        firststand: { name: 'First Stand', one: 'First Stand', icon: 'flag', color: '#f472b6' },
        league: { name: 'League titles', one: 'League title', icon: 'trophy', color: '#fbbf24' },
        tier2: { name: 'Second-tier titles', one: 'Second-tier title', icon: 'trophy', color: '#cbd5e1' },
        promotion: { name: 'Promotions', one: 'Promotion', icon: 'upgrade', color: '#a78bfa' },
        relegation: { name: 'Relegations', one: 'Relegation', icon: 'trend', color: '#f87171' },
        worldsfinal: { name: 'Worlds finals lost', one: 'Worlds final lost', icon: 'medal', color: '#94a3b8' },
    };
    const MEDAL = { worlds: ['Worlds', '#facc15'], msi: ['MSI', '#38bdf8'], league: ['League', '#fbbf24'], tier2: ['Tier 2', '#cbd5e1'], firststand: ['First Stand', '#f472b6'] };
    $: winners = players.filter(p => p.titles > 0).sort((a, b) => ((b.t.worlds || 0) - (a.t.worlds || 0)) || ((b.t.msi || 0) - (a.t.msi || 0)) || b.titles - a.titles);
    $: seasons = hist ? hist.seasons : [];
    let showYears = 6;
    function splitResult(r) {
        if (!r) return [];
        const out = [];
        if (r.w.includes('worlds')) out.push(['World champions', '#facc15', 'crown']);
        else if (r.w.includes('worlds2')) out.push(['Worlds final', '#e2e8f0', 'medal']);
        else if (r.wp) out.push([`Worlds top ${r.wp <= 4 ? 4 : r.wp <= 8 ? 8 : 16}`, '#a5b4fc', 'globe']);
        if (r.w.includes('msi')) out.push(['MSI champions', '#38bdf8', 'globe']);
        else if (r.w.includes('msi2')) out.push(['MSI final', '#e2e8f0', 'medal']);
        else if (r.mp) out.push([`MSI top ${r.mp <= 4 ? 4 : 8}`, '#7dd3fc', 'globe']);
        if (r.w.includes('league') || r.w.includes('tier2')) out.push(['Champions', '#fbbf24', 'trophy']);
        else if (r.w.includes('final') || r.w.includes('final2')) out.push(['Runners-up', '#e2e8f0', 'medal']);
        if (r.w.includes('up')) out.push(['Promoted', '#a78bfa', 'upgrade']);
        if (r.w.includes('down')) out.push(['Relegated', '#f87171', 'trend']);
        return out;
    }
    const titleLine = (t) => Object.entries(t || {}).filter(([k, n]) => n && k !== 'worldsfinal')
        .map(([k, n]) => `${n > 1 ? n + '× ' : ''}${k === 'worlds' ? 'Worlds' : k === 'msi' ? 'MSI' : k === 'firststand' ? 'First Stand' : k === 'league' ? 'League' : 'Tier 2'}`).join(', ');
    const years = (p) => (p.y0 === p.y1 ? `${p.y0}` : `${p.y0}–${p.y1}`);
    const known = (id) => !!(id && (s.players[id] || (s.retired && s.retired[id])));
    function open(p) { if (known(p.id)) mgrModal.set({ kind: 'player', id: p.id }); }
</script>

{#if team && hist}
<div class="hs">
    <div class="top">
        <div>
            <h1 class="page-h">Club history</h1>
            <p class="page-sub">Honours, legends and every player who has played for the club. Before {hist.before} it comes from the real records; since then, from your save.</p>
        </div>
        <select class="sel" bind:value={teamId}>
            {#if me}<option value={me.id}>Your club: {me.name}</option>{/if}
            {#each REGIONS as r}
                <optgroup label={r.league}>
                    {#each clubs.filter(c => c.region === r.id && (!me || c.id !== me.id)) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                </optgroup>
            {/each}
            {#if folded.length}
                <optgroup label="Folded clubs">
                    {#each folded as c (c.id)}<option value={c.id}>{c.name} ({c.region}, folded {c.defunct})</option>{/each}
                </optgroup>
            {/if}
        </select>
    </div>

    <section class="panel hero" style="--c:{team.color}">
        <TeamBadge {team} size={64} />
        <div class="hero-t">
            <h2>{team.name}<span class="chip" style="--c:{clubStyle(team).color}" title={clubStyle(team).blurb}>{clubStyle(team).name}</span></h2>
            <span class="dim"><RegionIcon region={team.region} size={13} /> {#if team.defunct}<b class="gone">Folded in {team.defunct}</b>{' · last in '}{/if}{leagueName(team.region, team.tier)}
                {#if team.custom} · founded {team.histFrom || s.time.startYear}{#if s.manager.founded === team.id} by {s.manager.name}{/if}{:else if hist.players.some(p => p.pre)} · on record since {Math.min(...hist.players.filter(p => p.pre).map(p => p.y0))}{/if}</span>
            <span class="muted small">{players.length} player{players.length === 1 ? '' : 's'} on record{#if hist.tracked && hist.trackedFrom}{' · '}the record book kept since {hist.trackedFrom}{/if}</span>
        </div>
        <div class="counts">
            {#each Object.keys(KIND) as k}
                {#if counts[k]}<span class="cnt" style="--k:{KIND[k].color}"><Icon name={KIND[k].icon} size={16} /><b>{counts[k]}</b><span>{counts[k] === 1 ? KIND[k].one : KIND[k].name}</span></span>{/if}
            {/each}
            {#if !honours.length}<span class="muted small">No honours yet.</span>{/if}
        </div>
    </section>

    <div class="two">
        <section class="panel">
            <div class="ph"><h3><Icon name="star" size={15} /> Club legends</h3><span class="muted small">Seasons, titles and awards for this club</span></div>
            {#if legends.length}
                <div class="legends">
                    {#each legends as p, i (p.id)}
                        <button class="lg" class:top={i === 0} style="--tc:{p.tier.color}" on:click={() => open(p)}>
                            <span class="lg-rank num">{i + 1}</span>
                            <span class="lg-main">
                                <span class="lg-n">{p.n}{#if p.current}<span class="chip" style="--c:#34d399">Current</span>{:else if p.retired}<span class="chip" style="--c:#94a3b8">Retired</span>{/if}</span>
                                <span class="muted small">{p.r} · {years(p)} · {p.s} season{p.s === 1 ? '' : 's'}{p.g ? ` · ${p.g} games` : ''}</span>
                                {#if titleLine(p.t) || (p.aw && p.aw.length)}<span class="lg-t">{titleLine(p.t)}{titleLine(p.t) && p.aw && p.aw.length ? ' · ' : ''}{p.aw && p.aw.length ? `${p.aw.length} award${p.aw.length === 1 ? '' : 's'}` : ''}</span>{/if}
                            </span>
                            <span class="chip" style="--c:{p.tier.color}">{p.tier.name}</span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="empty">No legends yet. Players become legends by staying, winning and collecting awards here.</div>
            {/if}
        </section>

        <section class="panel">
            <div class="ph"><h3><Icon name="trophy" size={15} /> Honours</h3></div>
            {#if honours.length}
                <ul class="hon">
                    {#each honours.slice().reverse() as h, i (i)}
                        <li style="--k:{(KIND[h.kind] || KIND.league).color}"><Icon name={(KIND[h.kind] || KIND.league).icon} size={14} /><b class="num">{h.year}</b><span>{h.kind === 'league' || h.kind === 'tier2' ? `${h.name} ${leagueName(team.region, h.kind === 'league' ? 1 : 2)} title` : h.kind === 'worldsfinal' ? 'Worlds final (lost)' : h.kind === 'firststand' ? 'First Stand' : h.kind === 'promotion' ? `Promoted to ${leagueName(team.region, 1)}` : h.kind === 'relegation' ? `Relegated to ${leagueName(team.region, 2)}` : h.name || (h.kind === 'worlds' ? 'Worlds' : 'MSI')}</span>{#if h.pre}<span class="pre">real history</span>{/if}</li>
                    {/each}
                </ul>
            {:else}<div class="empty">Nothing in the cabinet yet.</div>{/if}
        </section>
    </div>

    {#if winners.length}
        <section class="panel">
            <div class="ph"><h3><Icon name="medal" size={15} /> Trophy winners</h3><span class="muted small">Who won what for {team.short}</span></div>
            <div class="winners">
                {#each winners as p (p.id)}
                    <button class="wn" class:click={known(p.id)} on:click={() => open(p)}>
                        <span class="wn-n">{p.n}<span class="dim small">{p.r}</span></span>
                        <span class="wn-t">{#each Object.keys(MEDAL) as k}{#if p.t[k]}<span class="chip" style="--c:{MEDAL[k][1]}">{p.t[k] > 1 ? p.t[k] + '× ' : ''}{MEDAL[k][0]}</span>{/if}{/each}</span>
                    </button>
                {/each}
            </div>
        </section>
    {/if}

    {#if seasons.length}
        <section class="panel">
            <div class="ph"><h3><Icon name="calendar" size={15} /> Season by season</h3><span class="muted small">The five who started each split, their ratings, and how it ended</span></div>
            <div class="timeline">
                {#each seasons.slice(0, showYears) as yr (yr.y)}
                    <div class="yr">
                        <div class="yr-h num">{yr.y}</div>
                        <div class="yr-splits">
                            {#each [['sp', 'Spring'], ['su', 'Summer']] as [k, label] (k)}
                                {@const r = yr[k]}
                                <div class="sp" class:won={r && (r.w.includes('league') || r.w.includes('tier2') || r.w.includes('msi') || r.w.includes('worlds'))} class:down={r && r.w.includes('down')}>
                                    {#if r}
                                        <div class="sp-h">
                                            <b>{label}</b>
                                            <span class="dim small">{leagueName(team.region, r.t)}{r.p ? ` · ${r.p}${r.p === 1 ? 'st' : r.p === 2 ? 'nd' : r.p === 3 ? 'rd' : 'th'}` : ''}</span>
                                        </div>
                                        <div class="sp-res">{#each splitResult(r) as [txt, col, ic], j (j)}<span class="chip" style="--c:{col}"><Icon name={ic} size={11} /> {txt}</span>{/each}</div>
                                        <div class="five">
                                            {#each r.five as x (x.role)}
                                                <button class="f-row" disabled={!x.known} on:click={() => open({ id: x.id })}>
                                                    <span class="f-role">{x.role}</span>
                                                    <span class="f-n">{x.n || '—'}</span>
                                                    {#if x.ovr}<span class="ovr" style="--c:{ovrColor(x.ovr)}">{x.ovr}</span>{/if}
                                                </button>
                                            {/each}
                                        </div>
                                    {:else}
                                        <div class="sp-h"><b>{label}</b><span class="dim small">not played yet</span></div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
            {#if seasons.length > showYears}<button class="btn btn-sm more" on:click={() => (showYears += 6)}>Show earlier seasons ({seasons.length - showYears} more)</button>{/if}
        </section>
    {/if}

    <section class="panel">
        <div class="ph">
            <h3><Icon name="squad" size={15} /> Every player</h3>
            <div class="seg">
                {#each [['all', 'All'], ['current', 'Current'], ['save', 'In your save'], ['before', 'Before your save']] as [id, lbl]}
                    <button class:on={filter === id} on:click={() => (filter = id)}>{lbl}</button>
                {/each}
            </div>
        </div>
        <div class="tbl-wrap">
            <table class="tbl">
                <thead><tr><th>Player</th><th>Role</th><th>Years</th><th class="c">Seasons</th><th class="c">Games</th><th class="c">Won</th><th>Titles</th><th></th></tr></thead>
                <tbody>
                    {#each shown as p (p.id)}
                        <tr class:click={known(p.id)} on:click={() => open(p)}>
                            <td><span class="pn"><b>{p.n}</b></span></td>
                            <td class="dim">{p.r}</td>
                            <td class="num">{years(p)}</td>
                            <td class="c num">{p.s}</td>
                            <td class="c num">{p.g || (p.pre && !p.inSave ? '—' : 0)}</td>
                            <td class="c num">{p.g ? Math.round((p.w / p.g) * 100) + '%' : '—'}</td>
                            <td class="dim small">{titleLine(p.t) || '—'}</td>
                            <td>{#if p.current}<span class="chip" style="--c:#34d399">Current</span>{:else if p.retired}<span class="chip" style="--c:#94a3b8">Retired</span>{:else if p.pre && !p.inSave}<span class="chip" style="--c:#94a3b8">Before your save</span>{/if}{#if p.tier}<span class="chip" style="--c:{p.tier.color}">{p.tier.name}</span>{/if}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            {#if !shown.length}<div class="empty">Nobody here.</div>{/if}
        </div>
        <p class="muted small">Seasons and titles are counted for every club from the five who started each split. {team.hist ? 'For a club you manage, games, wins, awards and the bench are counted too.' : 'Games, wins and awards are counted only for clubs you manage.'}</p>
    </section>
</div>
{:else}
    <div class="panel empty">No club to show.</div>
{/if}

<style>
    .hs { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .top .sel { min-width: 240px; }
    .small { font-size: 12.5px; }
    .hero { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; background: radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--c) 20%, transparent), transparent 60%), rgba(15, 23, 42, 0.72); border-top: 4px solid var(--c); }
    .hero-t { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 220px; }
    .hero-t h2 { margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 26px; color: #fff; }
    .hero-t .dim { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; }
    .counts { display: flex; gap: 8px; flex-wrap: wrap; }
    .cnt { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 86px; padding: 9px 10px; border-radius: 12px; color: var(--k); background: color-mix(in srgb, var(--k) 10%, rgba(2, 6, 23, 0.5)); border: 1px solid color-mix(in srgb, var(--k) 40%, transparent); }
    .cnt b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; color: #fff; line-height: 1; }
    .cnt span { font-size: 10px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; color: #a5b4cf; text-align: center; }
    .two { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .legends { display: flex; flex-direction: column; gap: 6px; }
    .lg { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; text-align: left; cursor: pointer; font-family: inherit; color: #dbe4f0; background: rgba(2, 6, 23, 0.45); border: 1px solid color-mix(in srgb, var(--tc) 30%, rgba(51, 65, 85, 0.45)); }
    .lg.top { background: linear-gradient(90deg, color-mix(in srgb, var(--tc) 14%, rgba(2, 6, 23, 0.5)), rgba(2, 6, 23, 0.45)); border-color: color-mix(in srgb, var(--tc) 60%, transparent); }
    .lg:hover { border-color: var(--tc); }
    .lg-rank { width: 22px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 18px; font-weight: 700; color: var(--tc); text-align: center; }
    .lg-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .lg-n { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-weight: 800; color: #fff; font-size: 15px; }
    .lg-t { font-size: 12px; font-weight: 700; color: #fde68a; }
    .gone { color: #f87171; }
    .winners { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
    .wn { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 12px; text-align: left; font-family: inherit; color: #e2e8f0; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(250, 204, 21, 0.25); cursor: default; }
    .wn.click { cursor: pointer; }
    .wn.click:hover { border-color: #facc15; }
    .wn-n { display: flex; align-items: center; gap: 8px; font-weight: 800; color: #fff; }
    .wn-t { display: flex; gap: 4px; flex-wrap: wrap; }
    .timeline { display: flex; flex-direction: column; gap: 12px; }
    .yr { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: start; }
    .yr-h { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; font-weight: 700; color: #fff; padding-top: 8px; border-right: 2px solid color-mix(in srgb, var(--c, #34d399) 60%, transparent); }
    .yr-splits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .sp { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(51, 65, 85, 0.5); }
    .sp.won { border-color: rgba(250, 204, 21, 0.6); background: linear-gradient(160deg, rgba(250, 204, 21, 0.1), rgba(2, 6, 23, 0.45) 60%); }
    .sp.down { border-color: rgba(248, 113, 113, 0.5); }
    .sp-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .sp-h b { color: #fff; }
    .sp-res { display: flex; gap: 4px; flex-wrap: wrap; min-height: 4px; }
    .five { display: flex; flex-direction: column; gap: 3px; }
    .f-row { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 6px; font: inherit; font-size: 13px; color: #e2e8f0; background: none; border: none; text-align: left; cursor: pointer; }
    .f-row:hover:not(:disabled) { background: rgba(51, 65, 85, 0.4); }
    .f-row:disabled { cursor: default; }
    .f-role { width: 32px; font-size: 10px; font-weight: 900; color: #6ee7b7; }
    .f-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
    .more { align-self: flex-start; margin-top: 10px; }
    @media (max-width: 700px) { .yr { grid-template-columns: 1fr; } .yr-h { border-right: none; } .yr-splits { grid-template-columns: 1fr; } }
    .hon { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; max-height: 420px; overflow-y: auto; }
    .hon li { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 9px; font-size: 13.5px; color: #e2e8f0; background: rgba(2, 6, 23, 0.4); border-left: 3px solid var(--k); }
    .hon li :global(.ico) { color: var(--k); flex-shrink: 0; }
    .hon b { color: #fff; }
    .hon span:not(.pre) { flex: 1; min-width: 0; }
    .pre { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #8aa0c4; }
    .pn { display: inline-flex; align-items: center; gap: 6px; }
    .pn b { color: #fff; }
    @media (max-width: 1000px) { .two { grid-template-columns: 1fr; } }
</style>
