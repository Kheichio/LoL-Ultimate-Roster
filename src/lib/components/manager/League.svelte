<script>
    import { manager, mgrModal } from '../../stores/manager.js';
    import { myTeam, currentStep, leagueName, tableRows, annualRows, leagueKey, worldsRace } from '../../manager/engine.js';
    import { REGIONS, REGION_BY_ID, TIER2_NAME, LEAGUE_WEEKS, WORLDS_SLOTS_BY_RANK, ROLE_IDS } from '../../manager/data.js';
    import { teamStrength } from '../../manager/match.js';
    import { ovrColor, ordinal } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import Bracket from './Bracket.svelte';

    $: s = $manager;
    $: S = s.season;
    $: team = myTeam(s);
    $: me = team ? team.id : null;
    $: step = currentStep(s);
    /** Which tab opens first. The screen never passes it; tools/managerRender does,
     *  because every tab but the first is otherwise reachable only by a click. */
    export let initialTab = 'league';
    let tab = initialTab;
    let region = null;
    let tier = null;
    let split = null;
    $: if (region === null) region = team ? team.region : 'LCK';
    $: if (tier === null) tier = team ? team.tier : 1;
    $: if (split === null) split = step.split || 'spring';
    $: L = S.leagues[leagueKey(region, tier)];
    $: rows = L ? (split === 'annual' ? annualRows(L, s) : tableRows(L, split === 'annual' ? 'spring' : split, s)) : [];
    $: fixtures = L && split !== 'annual' ? L[split].fixtures : [];
    $: playoff = S.playoffs[leagueKey(region, tier) + ':' + (split === 'annual' ? 'summer' : split)];
    $: race = worldsRace(s);
    $: promo = S.promo[region];

    const TABS = [
        ['league', 'Leagues'], ['playoffs', 'Playoffs'], ['msi', 'MSI'], ['worlds', 'Worlds'], ['race', 'Road to Worlds'], ['history', 'History'],
    ];
    const open = (id) => mgrModal.set({ kind: 'team', id });
    const name = (id) => (s.teams[id] ? s.teams[id].name : '—');
</script>

<div class="lg">
    <div class="top">
        <div>
            <h1 class="page-h">Competitions</h1>
            <p class="page-sub">{s.time.year} · {step.name}. Every region plays the same calendar: Spring, MSI, Summer, promotion, Worlds.</p>
        </div>
        <div class="seg">
            {#each TABS as [id, lbl]}<button class:on={tab === id} on:click={() => (tab = id)}>{lbl}</button>{/each}
        </div>
    </div>

    {#if tab === 'league' || tab === 'playoffs'}
        <div class="pick">
            <div class="seg">
                {#each REGIONS as r}<button class:on={region === r.id} on:click={() => (region = r.id)}>{r.league}</button>{/each}
            </div>
            <div class="seg">
                <button class:on={tier === 1} on:click={() => (tier = 1)}>{REGION_BY_ID[region].league}</button>
                <button class:on={tier === 2} on:click={() => (tier = 2)}>{TIER2_NAME[region]}</button>
            </div>
            <div class="seg">
                <button class:on={split === 'spring'} on:click={() => (split = 'spring')}>Spring</button>
                <button class:on={split === 'summer'} on:click={() => (split = 'summer')}>Summer</button>
                {#if tab === 'league'}<button class:on={split === 'annual'} on:click={() => (split = 'annual')}>Year</button>{/if}
            </div>
        </div>
    {/if}

    {#if tab === 'league' && L}
        <div class="two">
            <section class="panel">
                <div class="ph">
                    <h3><RegionIcon region={region} size={14} /> {leagueName(region, tier)} · {split === 'annual' ? 'both splits' : split}</h3>
                    {#if split === 'annual'}<span class="muted small">{tier === 1 ? 'Bottom: relegated · 9th: promotion series' : 'Promotion comes from the summer playoffs'}</span>{/if}
                </div>
                <div class="tbl-wrap">
                    <table class="tbl">
                        <thead><tr><th>#</th><th>Team</th><th class="c">W</th><th class="c">L</th><th class="c">Games</th><th class="c">+/-</th><th class="r">OVR</th></tr></thead>
                        <tbody>
                            {#each rows as r, i (r.id)}
                                {@const t = s.teams[r.id]}
                                <tr class="click" class:me={r.id === me} class:cut={split !== 'annual' && i === 3} class:rel={split === 'annual' && tier === 1 && i >= rows.length - 2} on:click={() => open(r.id)}>
                                    <td class="num muted">{i + 1}</td>
                                    <td><span class="trow"><TeamBadge team={t} size={22} /> {t.name}{#if !t.real}<span class="chip" style="--c:#fbbf24">Random</span>{/if}</span></td>
                                    <td class="c num">{r.w}</td>
                                    <td class="c num">{r.l}</td>
                                    <td class="c num dim">{r.gw}-{r.gl}</td>
                                    <td class="c num" class:good={r.gw - r.gl > 0} class:bad={r.gw - r.gl < 0}>{r.gw - r.gl > 0 ? '+' : ''}{r.gw - r.gl}</td>
                                    <td class="r"><span class="ovr" style="--c:{ovrColor(teamStrength(t, s.players))}">{Math.round(teamStrength(t, s.players))}</span></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </section>
            {#if split !== 'annual'}
                <section class="panel">
                    <div class="ph"><h3><Icon name="calendar" size={15} /> Fixtures</h3><span class="muted small">Best of 3</span></div>
                    <div class="weeks">
                        {#each fixtures as wk, w}
                            {#if wk.length}
                                <div class="wk">
                                    <div class="wk-h">Week {w + 1}</div>
                                    {#each wk as tie}
                                        <div class="fx" class:mine={tie.a === me || tie.b === me}>
                                            <button class="fx-t" class:win={tie.winner === tie.a} on:click={() => open(tie.a)}><TeamBadge team={s.teams[tie.a]} size={18} /> {s.teams[tie.a].short}</button>
                                            <span class="fx-s num">{tie.score ? tie.score.join('–') : 'vs'}</span>
                                            <button class="fx-t fx-r" class:win={tie.winner === tie.b} on:click={() => open(tie.b)}>{s.teams[tie.b].short} <TeamBadge team={s.teams[tie.b]} size={18} /></button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        {/each}
                    </div>
                </section>
            {/if}
        </div>
    {:else if tab === 'playoffs'}
        <section class="panel">
            <div class="ph"><h3><Icon name="trophy" size={15} /> {leagueName(region, tier)} {split === 'summer' ? 'Summer' : 'Spring'} Playoffs</h3><span class="muted small">Top four · best of 5</span></div>
            {#if playoff}<Bracket bracket={playoff} teams={s.teams} {me} />
            {:else}<div class="empty">Drawn when the regular season ends (after week {LEAGUE_WEEKS}).</div>{/if}
        </section>
        {#if promo && (promo.tie || promo.up)}
            <section class="panel">
                <div class="ph"><h3><Icon name="upgrade" size={15} /> Promotion & relegation · {REGION_BY_ID[region].league}</h3></div>
                <ul class="promo">
                    {#if promo.up}<li><span class="good">Up:</span> {name(promo.up)} (tier 2 summer champion)</li>{/if}
                    {#if promo.down}<li><span class="bad">Down:</span> {name(promo.down)} (last over both splits)</li>{/if}
                    {#if promo.tie}<li><span class="warn">Promotion series:</span> {name(promo.tie.a)} vs {name(promo.tie.b)}{#if promo.tie.score}{' · '}{promo.tie.score.join('–')}, {name(promo.tie.winner)} {promo.tie.winner === promo.tie.a ? 'stay up' : 'go up'}{/if}</li>{/if}
                </ul>
            </section>
        {/if}
    {:else if tab === 'msi'}
        <section class="panel">
            <div class="ph"><h3><Icon name="globe" size={15} /> MSI {s.time.year}</h3><span class="muted small">Six spring champions + the runners-up of the two strongest regions · best of 5</span></div>
            {#if S.msi}<Bracket bracket={S.msi} teams={s.teams} {me} />
            {:else}<div class="empty">Drawn when the spring finals are over.</div>{/if}
        </section>
    {:else if tab === 'worlds'}
        <section class="panel">
            <div class="ph"><h3><Icon name="trophy" size={15} /> Worlds {s.time.year}</h3><span class="muted small">Sixteen teams · best of 5</span></div>
            {#if S.worlds}<Bracket bracket={S.worlds} teams={s.teams} {me} />
            {:else}<div class="empty">Drawn after the promotion series. See Road to Worlds for who is in line.</div>{/if}
        </section>
    {:else if tab === 'race' && race}
        <p class="page-sub">Slots by region strength this year ({S.rank.map((r, i) => `${r} ${WORLDS_SLOTS_BY_RANK[i]}`).join(', ')}). Each region sends its summer champion, then its summer runner-up, then the most championship points (90 for a split title, 70 for a final, 50 for a semifinal, 30/20/10/5 for 5th to 8th).</p>
        <div class="race">
            {#each S.rank as r}
                {@const q = race[r]}
                <section class="panel">
                    <div class="ph"><h3><RegionIcon region={r} size={14} /> {REGION_BY_ID[r].league}</h3><span class="chip" style="--c:#34d399">{q.slots} slot{q.slots === 1 ? '' : 's'}</span></div>
                    <ol class="rc">
                        {#each q.order.slice(0, q.slots + 3) as id, i}
                            <li class:in={i < q.slots} class:me={id === me}><TeamBadge team={s.teams[id]} size={20} /><span class="rc-n">{s.teams[id].name}</span><span class="num muted">{S.points[id] || 0} pts</span></li>
                        {/each}
                    </ol>
                </section>
            {/each}
        </div>
    {:else if tab === 'history'}
        {#if !s.history.length}
            <div class="empty panel">No season has finished yet.</div>
        {:else}
            <div class="hist">
                {#each s.history.slice().reverse() as h (h.year)}
                    <section class="panel">
                        <div class="ph"><h3>{h.year}</h3>{#if h.me}<span class="muted small">You: {h.me.teamName}{h.me.spring ? ` · spring ${ordinal(h.me.spring)}` : ''}{h.me.summer ? ` · summer ${ordinal(h.me.summer)}` : ''}{h.me.worlds ? ` · Worlds ${h.me.worlds === 1 ? 'CHAMPIONS' : 'top ' + (h.me.worlds <= 2 ? 2 : h.me.worlds <= 4 ? 4 : h.me.worlds <= 8 ? 8 : 16)}` : ''}</span>{/if}</div>
                        <div class="h-top">
                            <span class="h-big"><Icon name="trophy" size={14} /> Worlds: <b>{name(h.worlds)}</b></span>
                            <span class="h-big"><Icon name="globe" size={14} /> MSI: <b>{name(h.msi)}</b></span>
                        </div>
                        <div class="tbl-wrap">
                            <table class="tbl">
                                <thead><tr><th>League</th><th>Spring</th><th>Summer</th><th>Player of the Year</th></tr></thead>
                                <tbody>
                                    {#each REGIONS as r}
                                        <tr>
                                            <td><span class="trow"><RegionIcon region={r.id} size={12} /> {r.league}</span></td>
                                            <td>{name(h.champs[r.id + ':1:spring'])}</td>
                                            <td>{name(h.champs[r.id + ':1:summer'])}</td>
                                            <td>{h.awards && h.awards[r.id] && h.awards[r.id].mvp ? h.awards[r.id].mvp.name : '—'}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </section>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    .lg { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .pick { display: flex; gap: 8px; flex-wrap: wrap; }
    .two { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: start; }
    .small { font-size: 12px; }
    .trow { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: #e2e8f0; }
    tr.cut td { border-bottom: 1px dashed rgba(52, 211, 153, 0.5); }
    tr.rel td { background: rgba(239, 68, 68, 0.07); }
    .weeks { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; max-height: 640px; overflow-y: auto; }
    .wk { display: flex; flex-direction: column; gap: 4px; }
    .wk-h { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .fx { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; padding: 5px 7px; border-radius: 8px; background: rgba(2, 6, 23, 0.4); }
    .fx.mine { background: rgba(16, 185, 129, 0.1); box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.35) inset; }
    .fx-t { display: inline-flex; align-items: center; gap: 6px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700; color: #94a3b8; }
    .fx-r { justify-content: flex-end; }
    .fx-t.win { color: #e2e8f0; }
    .fx-s { font-size: 12px; font-weight: 900; color: #cbd5e1; }
    .promo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .race { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .rc { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .rc li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; font-size: 13px; color: #94a3b8; }
    .rc li.in { color: #e2e8f0; background: rgba(16, 185, 129, 0.07); }
    .rc li.me { box-shadow: 0 0 0 1px #34d399 inset; }
    .rc-n { flex: 1; font-weight: 700; }
    .hist { display: flex; flex-direction: column; gap: 12px; }
    .h-top { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 10px; }
    .h-big { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; color: #cbd5e1; }
    .h-big b { color: #fde68a; }
    @media (max-width: 1000px) { .two { grid-template-columns: 1fr; } }
</style>
