<script>
    // The new-game wizard: name, start year, region, club. The world for a year
    // is built when the year is picked, so the region and club steps show the
    // real teams and players that save will actually have.
    import { openMenu } from '../../stores/menu.js';
    import { playSound } from '../../utils/sound.js';
    import { previewManagerWorld, createManager } from '../../stores/manager.js';
    import { START_YEARS, REGIONS, REGION_BY_ID, TIER2_NAME, ROLE_IDS, CLUB_COLORS } from '../../manager/data.js';
    import { teamStrength, lineupOf } from '../../manager/match.js';
    import { sponsorIncome } from '../../manager/market.js';
    import { ovrOf } from '../../manager/people.js';
    import { ovrColor, fmtMoney } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    let stage = 'year';
    let name = '';
    let year = null;
    let region = null;
    let tier = 1;
    let teamId = null;
    let world = null;
    let seed = Math.floor(Math.random() * 1e9);
    let error = '';

    function pickYear(y) {
        playSound('click');
        year = y;
        error = '';
        world = previewManagerWorld(y, seed);
        if (!world) { error = 'The card database has not loaded yet. Go back to the menu and try again in a moment.'; return; }
        region = null; teamId = null;
        stage = 'mode';
    }

    // ── founding a club ──
    let cName = '';
    let cShort = '';
    let cColor = CLUB_COLORS[0];
    let cRegion = 'LCK';
    let cTier = 2;
    $: cTag = String(cShort || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 4).toUpperCase();
    $: tagTaken = world && cTag ? Object.values(world.teams).some(t => t.region === cRegion && String(t.short).toUpperCase() === cTag) : false;
    $: replaced = world ? Object.values(world.teams).filter(t => t.region === cRegion && t.tier === cTier)
        .sort((a, b) => teamStrength(a, world.players) - teamStrength(b, world.players))[0] || null : null;
    $: faCount = world ? world.freeAgents.filter(id => { const p = world.players[id]; return p && (p.reg || p.nat) === cRegion; }).length + (replaced ? replaced.roster.length : 0) : 0;
    $: foundErr = !cName.trim() ? 'Give the club a name.' : cTag.length < 2 ? 'The tag needs 2 to 4 letters or numbers.' : tagTaken ? `${cTag} is already a club in ${REGION_BY_ID[cRegion].league}.` : '';
    function found() {
        if (foundErr) return;
        playSound('win');
        createManager(world, { name: name.trim() || 'Manager', startYear: year, seed, custom: { name: cName.trim(), short: cTag, color: cColor, region: cRegion, tier: cTier } });
    }

    function pickRegion(r) {
        playSound('click');
        region = r;
        tier = 1;
        teamId = null;
        stage = 'team';
    }

    const fakeSave = () => ({ manager: { teamId: null, perks: {} }, players: world.players, teams: world.teams, econ: world.econ });

    $: regionInfo = world ? REGIONS.map(r => {
        const ts = Object.values(world.teams).filter(t => t.region === r.id);
        const real = ts.filter(t => t.real).length;
        const t1 = ts.filter(t => t.tier === 1).map(t => teamStrength(t, world.players)).sort((a, b) => b - a);
        return { ...r, dataYear: world.dataYears[r.id], real, total: ts.length, top: t1.length ? Math.round(t1.slice(0, 4).reduce((s, v) => s + v, 0) / Math.min(4, t1.length)) : 0 };
    }) : [];

    $: teamRows = world && region ? Object.values(world.teams)
        .filter(t => t.region === region && t.tier === tier)
        .map(t => ({ t, str: teamStrength(t, world.players) }))
        .sort((a, b) => b.str - a.str)
        .map((x, i, all) => {
            const lu = lineupOf(x.t, world.players);
            const star = ROLE_IDS.map(r => lu[r]).filter(Boolean).sort((a, b) => ovrOf(b) - ovrOf(a))[0];
            const exp = i + 1;
            const goal = tier === 1
                ? (exp <= 2 ? 'Win a title, reach Worlds' : exp <= 4 ? 'Reach Worlds' : exp <= 7 ? 'Make the playoffs' : 'Avoid relegation')
                : (exp <= 3 ? 'Win promotion' : 'Top half finish');
            const diff = tier === 1 ? (exp <= 2 ? 1 : exp <= 5 ? 2 : exp <= 8 ? 3 : 4) : (exp <= 3 ? 3 : 4);
            return { ...x, rank: exp, star, goal, diff, budget: sponsorIncome(fakeSave(), x.t), randoms: x.t.roster.filter(id => !world.players[id].real).length };
        }) : [];

    $: chosen = teamId && world ? world.teams[teamId] : null;
    $: chosenLineup = chosen ? lineupOf(chosen, world.players) : null;

    function start() {
        if (!chosen) return;
        playSound('win');
        createManager(world, { name: name.trim() || 'Manager', teamId, startYear: year, seed });
    }

    const DIFF = ['', 'Contender', 'Playoff side', 'Mid-table', 'Underdog'];

    /** Open on a later step. Only tools/managerRender passes these. */
    export let initialYear = null;
    export let initialStage = 'mode';
    if (initialYear) {
        pickYear(initialYear);
        if (world && initialStage !== 'mode') {
            stage = initialStage;
            if (initialStage === 'team') region = 'LCK';
        }
    }
</script>

<div class="nm">
    <div class="nm-top">
        <button class="btn btn-sm" on:click={() => { playSound('click'); openMenu(); }}><Icon name="chevron" size={13} stroke={2.4} /> Main menu</button>
        <div class="steps">
            {#each (stage === 'found' ? [['year', 'Year'], ['mode', 'Start'], ['found', 'Your club']] : [['year', 'Year'], ['mode', 'Start'], ['region', 'Region'], ['team', 'Club']]) as [id, lbl], i}
                <span class="stp" class:on={stage === id} class:done={(id === 'year' && year) || (id === 'mode' && ['region', 'team', 'found'].includes(stage)) || (id === 'region' && region)}>{i + 1}. {lbl}</span>
            {/each}
        </div>
    </div>

    <div class="hero">
        <p class="eyebrow">Ultimate Manager</p>
        <h1 class="title">Take charge of an org</h1>
        <p class="lede">Pick a year, a region and a club. Real pros come from that year's standard cards; wherever a league is short, random teams of <span class="rnd">random players</span> fill it, and every one of them is labelled as random.</p>
        <label class="name">
            <span>Manager name</span>
            <input class="inp" maxlength="18" placeholder="Your name" bind:value={name} />
        </label>
    </div>

    {#if error}<p class="err">{error}</p>{/if}

    {#if stage === 'year'}
        <div class="years">
            {#each START_YEARS as y}
                <button class="year" class:sel={year === y.year} on:click={() => pickYear(y.year)}>
                    <span class="y-n">{y.year}</span>
                    <span class="y-t">{y.name}</span>
                    <span class="y-b">{y.blurb}</span>
                </button>
            {/each}
        </div>
    {:else if stage === 'mode'}
        <div class="sub-h">
            <button class="btn btn-sm" on:click={() => { stage = 'year'; }}><Icon name="chevron" size={13} stroke={2.4} /> Year</button>
            <h2>{year}: how do you want to start?</h2>
        </div>
        <div class="modes">
            <button class="mode" on:click={() => { playSound('click'); stage = 'region'; }}>
                <span class="m-ico"><Icon name="briefcase" size={26} /></span>
                <b>Take over a club</b>
                <span>A real org of {year} with its real roster, a budget and a board that expects results. A contender, a mid-table side or a second-tier team.</span>
            </button>
            <button class="mode found" on:click={() => { playSound('click'); stage = 'found'; }}>
                <span class="m-ico"><Icon name="sparkle" size={26} /></span>
                <b>Found your own club</b>
                <span>Your name, your tag, your colours, and an empty roster. Build the whole team from free agents: real pros without a club and random prospects.</span>
            </button>
        </div>
    {:else if stage === 'found'}
        <div class="sub-h">
            <button class="btn btn-sm" on:click={() => { stage = 'mode'; }}><Icon name="chevron" size={13} stroke={2.4} /> Back</button>
            <h2>Found a club in {year}</h2>
        </div>
        <div class="found-grid">
            <section class="panel fform">
                <label class="fl"><span>Club name</span><input class="inp" maxlength="28" placeholder="e.g. Midnight Wolves" bind:value={cName} /></label>
                <label class="fl"><span>Tag (2-4)</span><input class="inp tag" maxlength="4" placeholder="MW" bind:value={cShort} /></label>
                <div class="fl"><span>Colour</span>
                    <div class="swatches">{#each CLUB_COLORS as c}<button class="sw" class:on={cColor === c} style="--sw:{c}" on:click={() => (cColor = c)} aria-label="Colour {c}"></button>{/each}</div>
                </div>
                <div class="fl"><span>Region</span>
                    <div class="seg">{#each REGIONS as r}<button class:on={cRegion === r.id} on:click={() => (cRegion = r.id)}>{r.league}</button>{/each}</div>
                </div>
                <div class="fl"><span>League</span>
                    <div class="seg">
                        <button class:on={cTier === 2} on:click={() => (cTier = 2)}>{TIER2_NAME[cRegion]} (second tier)</button>
                        <button class:on={cTier === 1} on:click={() => (cTier = 1)}>{REGION_BY_ID[cRegion].league} (top league)</button>
                    </div>
                </div>
            </section>
            <aside class="panel fprev" style="--fc:{cColor}">
                <div class="fp-top">
                    <TeamBadge team={{ short: cTag || '?', name: cName || 'Your club', color: cColor, real: true }} size={56} />
                    <div><div class="pick-name">{cName.trim() || 'Your club'}</div><div class="dim pick-sub"><RegionIcon region={cRegion} size={12} /> {cTier === 1 ? REGION_BY_ID[cRegion].league : TIER2_NAME[cRegion]}</div></div>
                </div>
                <ul class="fp-facts">
                    <li><Icon name="squad" size={14} /> An empty roster: sign a player for every role before the preseason window closes.</li>
                    <li><Icon name="trade" size={14} /> About {faCount} free agents in {REGION_BY_ID[cRegion].league} to choose from, real pros and random prospects.</li>
                    {#if replaced}<li><Icon name="flag" size={14} /> You take the place of {replaced.name}, whose players become free agents.</li>{/if}
                    <li><Icon name="briefcase" size={14} /> Board objective: {cTier === 1 ? 'avoid relegation' : 'finish in the top half'}. A bigger starting budget than a club you take over.</li>
                </ul>
                {#if foundErr}<p class="err small">{foundErr}</p>{/if}
                <button class="btn btn-p big" disabled={!!foundErr} on:click={found}><Icon name="sparkle" size={15} /> Found {cName.trim() || 'the club'}</button>
            </aside>
        </div>
    {:else if stage === 'region'}
        <div class="sub-h">
            <button class="btn btn-sm" on:click={() => { stage = 'mode'; }}><Icon name="chevron" size={13} stroke={2.4} /> Back</button>
            <h2>{year}: choose a region</h2>
        </div>
        <div class="regions">
            {#each regionInfo as r}
                <button class="region" style="--c:{r.accent}" on:click={() => pickRegion(r.id)}>
                    <span class="r-top"><RegionIcon region={r.id} size={20} fallback={r.flag} /><span class="r-n">{r.league}</span><span class="r-name">{r.name}</span></span>
                    <span class="r-line">
                        {#if r.dataYear === year}<span class="chip" style="--c:#34d399">Real {year} rosters</span>
                        {:else if r.dataYear}<span class="chip" style="--c:#fbbf24">Real rosters from {r.dataYear}</span>
                        {:else}<span class="chip" style="--c:#fbbf24">Random league</span>{/if}
                    </span>
                    <span class="r-stats">
                        <span><b>{r.real}</b> real teams</span>
                        <span><b>{r.total - r.real}</b> random</span>
                        <span><b>{r.top}</b> top-4 OVR</span>
                    </span>
                </button>
            {/each}
        </div>
        <p class="note"><Icon name="alert" size={13} /> The card database has no {year} cards for some leagues. Those regions are built from the nearest year that has them and kept a little under the two strongest regions, so history still reads right.</p>
    {:else if stage === 'team'}
        <div class="sub-h">
            <button class="btn btn-sm" on:click={() => { stage = 'region'; teamId = null; }}><Icon name="chevron" size={13} stroke={2.4} /> Region</button>
            <h2><RegionIcon region={region} size={18} /> {REGION_BY_ID[region].league} {year}: choose your club</h2>
            <div class="seg">
                <button class:on={tier === 1} on:click={() => { tier = 1; teamId = null; }}>{REGION_BY_ID[region].league}</button>
                <button class:on={tier === 2} on:click={() => { tier = 2; teamId = null; }}>{TIER2_NAME[region]}</button>
            </div>
        </div>
        {#if tier === 2}<p class="note"><Icon name="flag" size={13} /> Tier 2: win the summer playoffs to go up, or finish second and win the promotion series. A long road, and the most satisfying one.</p>{/if}
        <div class="teams-wrap">
            <div class="teams">
                {#each teamRows as row (row.t.id)}
                    <button class="team" class:sel={teamId === row.t.id} on:click={() => { playSound('click'); teamId = row.t.id; }}>
                        <span class="t-rank">{row.rank}</span>
                        <TeamBadge team={row.t} size={34} />
                        <span class="t-main">
                            <span class="t-name">{row.t.name}{#if !row.t.real}<span class="chip" style="--c:#fbbf24">Random team</span>{/if}</span>
                            <span class="t-sub">{row.goal} · budget {fmtMoney(row.budget)}/yr{#if row.star}{' · '}star {row.star.name}{/if}</span>
                        </span>
                        <span class="t-diff" title="Difficulty">{#each [1, 2, 3, 4] as d}<i class:on={d <= row.diff}></i>{/each}</span>
                        <span class="ovr" style="--c:{ovrColor(row.str)}">{Math.round(row.str)}</span>
                    </button>
                {/each}
            </div>
            <aside class="pick panel">
                {#if chosen}
                    <div class="pick-top">
                        <TeamBadge team={chosen} size={46} />
                        <div>
                            <div class="pick-name">{chosen.name}</div>
                            <div class="dim pick-sub">{DIFF[teamRows.find(r => r.t.id === chosen.id)?.diff || 3]} · {chosen.coach ? `Coach ${chosen.coach.name}` : 'No coach'}</div>
                        </div>
                    </div>
                    <div class="pick-five">
                        {#each ROLE_IDS as role}
                            {@const p = chosenLineup[role]}
                            <div class="five-row">
                                <span class="five-role">{role}</span>
                                <span class="five-name">{p ? p.name : '—'}{#if p && p.flag}<span class="flag">{p.flag}</span>{/if}{#if p && !p.real}<span class="chip" style="--c:#fbbf24">Random</span>{/if}</span>
                                {#if p}<span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span>{/if}
                            </div>
                        {/each}
                    </div>
                    <p class="dim small">Board objective: <b>{teamRows.find(r => r.t.id === chosen.id)?.goal}</b>. Meet it and the board backs you; keep missing it and they will sack you.</p>
                    <button class="btn btn-p big" on:click={start}><Icon name="play" size={15} stroke={2.4} /> Start as {name.trim() || 'Manager'}, {year}</button>
                {:else}
                    <div class="empty">Pick a club to see its starting five.</div>
                {/if}
            </aside>
        </div>
    {/if}
</div>

<style>
    .nm { width: 100%; max-width: 1180px; margin: 0 auto; padding: 22px 20px 60px; }
    .nm-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    .nm-top :global(.ico) { transform: rotate(180deg); }
    .steps { display: flex; gap: 6px; }
    .stp { font-size: 11px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; padding: 5px 10px; border-radius: 8px; color: #64748b; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.4); }
    .stp.done { color: #6ee7b7; }
    .stp.on { color: #022c1c; background: #34d399; border-color: #34d399; }
    .hero { margin-bottom: 22px; }
    .eyebrow { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: #34d399; margin: 0 0 8px; }
    .title { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: clamp(28px, 4vw, 40px); font-weight: 700; letter-spacing: -0.02em; color: #f1f5f9; margin: 0; }
    .lede { max-width: 720px; font-size: 14px; line-height: 1.65; color: #8aa0c4; margin: 10px 0 16px; }
    .rnd { color: #fcd34d; font-weight: 700; }
    .name { display: inline-flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .name .inp { width: 260px; font-size: 15px; }
    .err { color: #fca5a5; font-weight: 700; }

    .years { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .year { display: flex; flex-direction: column; gap: 6px; padding: 18px; border-radius: 16px; text-align: left; cursor: pointer; font-family: inherit; background: radial-gradient(90% 70% at 100% 0%, rgba(16, 185, 129, 0.12), transparent 70%), rgba(15, 23, 42, 0.62); border: 1px solid rgba(51, 65, 85, 0.45); transition: transform 0.15s, border-color 0.15s; }
    .year:hover { transform: translateY(-2px); border-color: rgba(52, 211, 153, 0.6); }
    .y-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 34px; font-weight: 700; color: #f1f5f9; line-height: 1; }
    .y-t { font-size: 13px; font-weight: 800; color: #6ee7b7; }
    .y-b { font-size: 12.5px; line-height: 1.55; color: #8aa0c4; }

    .sub-h { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .sub-h :global(.ico) { transform: rotate(180deg); }
    .sub-h h2 { display: flex; align-items: center; gap: 8px; margin: 0; flex: 1; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 19px; color: #f1f5f9; }
    .regions { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .region { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 16px; text-align: left; cursor: pointer; font-family: inherit; background: radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--c) 14%, transparent), transparent 70%), rgba(15, 23, 42, 0.62); border: 1px solid color-mix(in srgb, var(--c) 30%, rgba(51, 65, 85, 0.45)); transition: transform 0.15s; }
    .region:hover { transform: translateY(-2px); border-color: var(--c); }
    .r-top { display: flex; align-items: center; gap: 9px; color: #e2e8f0; }
    .r-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 19px; font-weight: 700; color: #f1f5f9; }
    .r-name { font-size: 12px; color: #8aa0c4; }
    .r-stats { display: flex; gap: 12px; font-size: 11.5px; color: #8aa0c4; }
    .r-stats b { color: #e2e8f0; }
    .note { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: #8aa0c4; line-height: 1.55; margin: 14px 0; }
    .note :global(.ico) { flex-shrink: 0; margin-top: 2px; color: #fbbf24; }

    .modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .mode { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 22px; border-radius: 18px; text-align: left; cursor: pointer; font-family: inherit; color: #a5b4cf; background: radial-gradient(90% 80% at 100% 0%, rgba(16, 185, 129, 0.14), transparent 70%), rgba(15, 23, 42, 0.68); border: 1px solid rgba(71, 85, 105, 0.5); transition: transform 0.15s, border-color 0.15s; }
    .mode.found { background: radial-gradient(90% 80% at 100% 0%, rgba(168, 85, 247, 0.18), transparent 70%), rgba(15, 23, 42, 0.68); }
    .mode:hover { transform: translateY(-2px); border-color: #34d399; }
    .mode.found:hover { border-color: #c084fc; }
    .m-ico { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 14px; color: #022c1c; background: #34d399; }
    .found .m-ico { color: #1e1033; background: #c084fc; }
    .mode b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 21px; color: #fff; }
    .mode span:not(.m-ico) { font-size: 14px; line-height: 1.6; }
    .found-grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px; align-items: start; }
    .fform { display: flex; flex-direction: column; gap: 14px; }
    .fl { display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #8aa0c4; }
    .fl .inp { font-size: 15px; max-width: 360px; }
    .fl .tag { max-width: 120px; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; }
    .swatches { display: flex; gap: 8px; flex-wrap: wrap; }
    .sw { width: 32px; height: 32px; border-radius: 10px; cursor: pointer; background: var(--sw); border: 2px solid transparent; box-shadow: inset 0 0 0 2px rgba(2, 6, 23, 0.5); }
    .sw.on { border-color: #fff; transform: scale(1.1); }
    .fprev { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; border-top: 4px solid var(--fc); }
    .fp-top { display: flex; align-items: center; gap: 12px; }
    .fp-facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; line-height: 1.5; color: #dbe4f0; }
    .fp-facts li { display: flex; gap: 8px; align-items: flex-start; }
    .fp-facts li :global(.ico) { flex-shrink: 0; margin-top: 3px; color: #8aa0c4; }
    .teams-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
    .teams { display: flex; flex-direction: column; gap: 6px; }
    .team { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 13px; text-align: left; cursor: pointer; font-family: inherit; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(51, 65, 85, 0.4); }
    .team:hover { border-color: rgba(52, 211, 153, 0.45); }
    .team.sel { border-color: #34d399; background: rgba(16, 185, 129, 0.1); }
    .t-rank { width: 18px; font-size: 12px; font-weight: 800; color: #64748b; text-align: center; }
    .t-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .t-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: #f1f5f9; }
    .t-sub { font-size: 11.5px; color: #8aa0c4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .t-diff { display: inline-flex; gap: 3px; }
    .t-diff i { width: 6px; height: 14px; border-radius: 2px; background: rgba(148, 163, 184, 0.18); }
    .t-diff i.on { background: #f59e0b; }
    .pick { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; }
    .pick-top { display: flex; align-items: center; gap: 12px; }
    .pick-name { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 18px; font-weight: 700; color: #f1f5f9; }
    .pick-sub { font-size: 12px; }
    .pick-five { display: flex; flex-direction: column; gap: 5px; }
    .five-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .five-role { width: 32px; font-size: 10px; font-weight: 900; color: #64748b; }
    .five-name { flex: 1; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #e2e8f0; min-width: 0; }
    .flag { font-size: 12px; }
    .small { font-size: 12px; line-height: 1.55; margin: 0; }
    .big { padding: 13px; font-size: 14px; }
    @media (max-width: 900px) {
        .modes, .found-grid { grid-template-columns: 1fr; }
        .fprev { position: static; }
        .teams-wrap { grid-template-columns: 1fr; }
        .pick { position: static; }
    }
</style>
