<script>
    import { manager, mutate, mgrModal } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { myTeam, currentStep, isScouted } from '../../manager/engine.js';
    import { REGIONS, ROLE_IDS, CALENDAR, ROSTER_MAX } from '../../manager/data.js';
    import { askingPrice, wageAsk, wageBill, wageBudget, windowOpen, acceptBid, removeOffer, renewalTerms, emergencyLeft, emergencyAllowance, unlistPlayer } from '../../manager/market.js';
    import { ovrOf, ageOf, potentialView, marketValue } from '../../manager/people.js';
    import { ovrColor, fmtMoney, contractWord } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: year = s.time.year;
    $: open = windowOpen(s);
    $: scoutRank = (s.manager.perks || {}).scout || 0;
    $: bill = team ? wageBill(s, team) : 0;
    $: budget = team ? wageBudget(s, team) : 0;
    $: nextWindow = CALENDAR.slice(s.time.step + 1).find(c => c.kind === 'window') || CALENDAR[0];

    /** Which tab opens first. Only tools/managerRender passes it. */
    export let initialTab = 'market';
    let tab = initialTab;
    let role = 'all';
    let region = team ? team.region : 'all';
    let who = 'all';
    let minOvr = 70;
    let maxAge = 40;
    let q = '';
    let sort = 'ovr';

    $: pool = Object.values(s.players).filter(p => {
        if (team && p.team === team.id) return false;
        if (tab === 'free' && p.team) return false;
        if (tab === 'market' && !p.team) return false;
        if (role !== 'all' && p.role !== role) return false;
        const reg = p.team ? s.teams[p.team].region : (p.reg || p.nat);
        if (region !== 'all' && reg !== region) return false;
        if (who === 'real' && !p.real) return false;
        if (who === 'random' && p.real) return false;
        if (ovrOf(p) < minOvr) return false;
        if (ageOf(p, year) > maxAge) return false;
        if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
    });
    $: rows = pool.slice().sort((a, b) => {
        if (sort === 'pot') return potentialView(b, { scouted: isScouted(s, b), scoutRank }).hi - potentialView(a, { scouted: isScouted(s, a), scoutRank }).hi;
        if (sort === 'age') return ageOf(a, year) - ageOf(b, year);
        if (sort === 'price') return (a.team ? askingPrice(s, a) : 0) - (b.team ? askingPrice(s, b) : 0);
        return ovrOf(b) - ovrOf(a);
    }).slice(0, 80);

    $: bids = (s.offers || []).map(o => ({ o, p: s.players[o.pid], from: s.teams[o.from] })).filter(x => x.p && x.from);
    $: mine = team ? team.roster.map(id => s.players[id]).filter(Boolean).sort((a, b) => ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role)) : [];
    $: listed = mine.filter(p => p.listed);
    $: eLeft = emergencyLeft(s);

    function accept(id) {
        const r = mutate(s => acceptBid(s, id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
    }
    function reject(id) {
        mutate(s => removeOffer(s, id));
        showToast('Bid rejected.', 'info');
    }
    function unlist(p) {
        const r = mutate(s => unlistPlayer(s, p.id));
        if (r) showToast(r.msg, 'info', 3000);
    }
    const view = (p) => mgrModal.set({ kind: 'player', id: p.id });
</script>

{#if team}
<div class="tf">
    <div class="top">
        <div>
            <h1 class="page-h">Transfers</h1>
            <p class="page-sub">Clubs sell in a window: the preseason and the mid-season break. Outside one you get a single emergency signing a season. Free agents sign any time. Open a player to bid, sign, scout, or put one of yours on the transfer list.</p>
        </div>
        <div class="wins">
            <div class="win" class:open>
                <Icon name={open ? 'unlock' : 'lock'} size={17} />
                <div><b>{open ? 'Window open' : 'Window closed'}</b><span class="muted small">{open ? 'Bids lapse when you start the split' : `Next: ${nextWindow.name}`}</span></div>
            </div>
            {#if !open}
                <div class="win emer" class:spent={eLeft === 0}>
                    <Icon name="alert" size={17} />
                    <div><b>{eLeft} emergency signing{eLeft === 1 ? '' : 's'} left</b><span class="muted small">{eLeft ? `One a season, at a 20% premium` : `Used for ${year}`}</span></div>
                </div>
            {/if}
        </div>
    </div>

    <div class="money">
        <div class="mc"><span class="muted small">Balance</span><b class="num" class:bad={s.finance.balance < 0}>{fmtMoney(s.finance.balance)}</b></div>
        {#if Number.isFinite(budget)}
            <div class="mc"><span class="muted small">Wage bill / wage limit</span><b class="num" class:warn={bill > budget * 0.92}>{fmtMoney(bill)} / {fmtMoney(budget)}</b><span class="bar"><i style="width:{Math.min(100, (bill / budget) * 100)}%; --c:{bill > budget * 0.92 ? '#fbbf24' : '#34d399'}"></i></span></div>
        {:else}
            <div class="mc"><span class="muted small">Wage bill</span><b class="num">{fmtMoney(bill)} <span class="muted small">· no limit, you own the club</span></b></div>
        {/if}
        <div class="mc"><span class="muted small">Roster</span><b class="num">{team.roster.length} / {ROSTER_MAX}</b></div>
    </div>

    <div class="seg">
        <button class:on={tab === 'market'} on:click={() => (tab = 'market')}>Players at clubs</button>
        <button class:on={tab === 'free'} on:click={() => (tab = 'free')}>Free agents</button>
        <button class:on={tab === 'bids'} on:click={() => (tab = 'bids')}>Offers for your players{bids.length ? ` (${bids.length})` : ''}</button>
        <button class:on={tab === 'list'} on:click={() => (tab = 'list')}>Your transfer list{listed.length ? ` (${listed.length})` : ''}</button>
        <button class:on={tab === 'mine'} on:click={() => (tab = 'mine')}>Your contracts</button>
    </div>

    {#if tab === 'market' || tab === 'free'}
        <section class="panel">
            <div class="filters">
                <input class="inp" placeholder="Search a name" bind:value={q} />
                <select class="sel" bind:value={role}><option value="all">Any role</option>{#each ROLE_IDS as r}<option value={r}>{r}</option>{/each}</select>
                <select class="sel" bind:value={region}><option value="all">Any region</option>{#each REGIONS as r}<option value={r.id}>{r.league}</option>{/each}</select>
                <select class="sel" bind:value={who}><option value="all">Real and random</option><option value="real">Real pros only</option><option value="random">Random players only</option></select>
                <label class="lbl">OVR ≥ <select class="sel" bind:value={minOvr}>{#each [50, 60, 65, 70, 75, 80, 85, 90] as v}<option value={v}>{v}</option>{/each}</select></label>
                <label class="lbl">Age ≤ <select class="sel" bind:value={maxAge}>{#each [19, 21, 23, 25, 28, 40] as v}<option value={v}>{v === 40 ? 'any' : v}</option>{/each}</select></label>
                <select class="sel" bind:value={sort}><option value="ovr">Sort: OVR</option><option value="pot">Sort: potential</option><option value="age">Sort: youngest</option>{#if tab === 'market'}<option value="price">Sort: cheapest</option>{/if}</select>
            </div>
            <div class="tbl-wrap">
                <table class="tbl">
                    <thead><tr><th>Player</th><th>Role</th><th>{tab === 'market' ? 'Club' : 'Last region'}</th><th class="c">Age</th><th class="c">OVR</th><th class="c">Potential</th>{#if tab === 'market'}<th class="r">Asking</th>{/if}<th class="r">Wage ask</th><th></th></tr></thead>
                    <tbody>
                        {#each rows as p (p.id)}
                            {@const pv = potentialView(p, { scouted: isScouted(s, p), scoutRank })}
                            <tr class="click" on:click={() => view(p)}>
                                <td><PName {p} /></td>
                                <td class="dim">{p.role}</td>
                                <td>{#if p.team}<span class="trow"><TeamBadge team={s.teams[p.team]} size={20} /> {s.teams[p.team].short}</span>{:else}<span class="dim">{p.reg || p.nat}</span>{#if p.prospectFor === team.id}<span class="chip" style="--c:#34d399">Your prospect</span>{/if}{/if}</td>
                                <td class="c num">{ageOf(p, year)}</td>
                                <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                                <td class="c num" class:dim={!pv.exact}>{pv.exact ? pv.lo : `${pv.lo}–${pv.hi}`}</td>
                                {#if tab === 'market'}<td class="r num">{fmtMoney(askingPrice(s, p))}</td>{/if}
                                <td class="r num">{fmtMoney(wageAsk(s, p, team))}</td>
                                <td class="r"><button class="btn btn-sm" on:click|stopPropagation={() => view(p)}>View</button></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                {#if !rows.length}<div class="empty">Nobody matches. Loosen the filters.</div>{/if}
            </div>
            <p class="muted small">Showing up to 80. Potential is a range until you scout a player (or own him). Random players are generated for this save and labelled.</p>
        </section>
    {:else if tab === 'bids'}
        <section class="panel">
            {#if bids.length}
                <div class="tbl-wrap">
                    <table class="tbl">
                        <thead><tr><th>Player</th><th>From</th><th class="r">Offer</th><th class="r">Value</th><th></th></tr></thead>
                        <tbody>
                            {#each bids as b (b.o.id)}
                                <tr>
                                    <td><PName p={b.p} /> <span class="ovr" style="--c:{ovrColor(ovrOf(b.p))}">{ovrOf(b.p)}</span>{#if b.o.listed}<span class="chip" style="--c:#fbbf24">Listed</span>{/if}</td>
                                    <td><span class="trow"><TeamBadge team={b.from} size={20} /> {b.from.name}</span></td>
                                    <td class="r num good">{fmtMoney(b.o.fee)}</td>
                                    <td class="r num dim">{fmtMoney(marketValue(b.p, year))}</td>
                                    <td class="r"><span class="acts"><button class="btn btn-sm btn-p" on:click={() => accept(b.o.id)}>Accept</button><button class="btn btn-sm" on:click={() => reject(b.o.id)}>Reject</button></span></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                <p class="muted small">Every offer lapses when the window closes.</p>
            {:else}
                <div class="empty">No offers. Clubs bid when a window opens, and make offers for anyone on your transfer list.</div>
            {/if}
        </section>
    {:else if tab === 'list'}
        <section class="panel">
            {#if listed.length}
                <div class="tbl-wrap">
                    <table class="tbl">
                        <thead><tr><th>Player</th><th class="c">OVR</th><th class="r">Asking</th><th class="r">Worth</th><th class="c">Offers</th><th></th></tr></thead>
                        <tbody>
                            {#each listed as p (p.id)}
                                <tr class="click" on:click={() => view(p)}>
                                    <td><PName {p} /> <span class="dim">{p.role}</span></td>
                                    <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                                    <td class="r num">{fmtMoney(p.listed)}</td>
                                    <td class="r num dim">{fmtMoney(marketValue(p, year))}</td>
                                    <td class="c num">{bids.filter(b => b.p.id === p.id).length}</td>
                                    <td class="r"><button class="btn btn-sm" on:click|stopPropagation={() => unlist(p)}>Take off</button></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                <p class="muted small">{open ? 'The window is open: offers come in as soon as clubs are interested.' : 'Clubs make offers for listed players when the next window opens.'} A price well above what a player is worth draws nothing.</p>
            {:else}
                <div class="empty">Nobody is listed. Open one of your players and choose "Put him on the transfer list" to sell him instead of releasing him.</div>
            {/if}
        </section>
    {:else if tab === 'mine'}
        <section class="panel">
            <div class="tbl-wrap">
                <table class="tbl">
                    <thead><tr><th>Player</th><th class="c">OVR</th><th class="r">Wage</th><th class="c">Until</th><th class="r">Renewal ask</th><th class="r">Value</th><th></th></tr></thead>
                    <tbody>
                        {#each mine as p (p.id)}
                            <tr class="click" on:click={() => view(p)}>
                                <td><PName {p} /> <span class="dim">{p.role}</span></td>
                                <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                                <td class="r num">{fmtMoney(p.wage)}</td>
                                <td class="c num"><span class="cw cw-{contractWord(p, year).tone}">{contractWord(p, year).text}</span></td>
                                <td class="r num dim">{p.until <= year ? fmtMoney(renewalTerms(s, p).wage) : '—'}</td>
                                <td class="r num dim">{fmtMoney(askingPrice(s, p))}</td>
                                <td class="r"><button class="btn btn-sm" on:click|stopPropagation={() => view(p)}>Manage</button></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </section>
    {/if}
</div>
{:else}
    <div class="panel empty">You have no club right now. Pick one of your job offers on the Club screen.</div>
{/if}

<style>
    .tf { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .wins { display: flex; gap: 8px; flex-wrap: wrap; }
    .win { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; color: #f87171; background: rgba(127, 29, 29, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); }
    .win.open { color: #34d399; background: rgba(16, 185, 129, 0.1); border-color: rgba(52, 211, 153, 0.4); }
    .win.emer { color: #fbbf24; background: rgba(251, 191, 36, 0.08); border-color: rgba(251, 191, 36, 0.45); }
    .win.emer.spent { color: #64748b; border-color: var(--line); background: rgba(15, 23, 42, 0.5); }
    .cw { font-size: 12px; font-weight: 700; color: #cbd5e1; white-space: nowrap; }
    .cw-good { color: #6ee7b7; }
    .cw-warn { color: #fbbf24; }
    .cw-bad { color: #fca5a5; }
    .win div { display: flex; flex-direction: column; }
    .win b { color: #f1f5f9; }
    .small { font-size: 12px; }
    .money { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .mc { display: flex; flex-direction: column; gap: 4px; padding: 11px 14px; border-radius: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--line); }
    .mc b { font-size: 16px; color: #e2e8f0; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .filters .inp { width: 180px; }
    .lbl { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; }
    .trow { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; color: #e2e8f0; }
    .acts { display: inline-flex; gap: 6px; }
    @media (max-width: 700px) { .money { grid-template-columns: 1fr; } }
</style>
