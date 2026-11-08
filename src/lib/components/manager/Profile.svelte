<script>
    // The manager as a person: his own bank account, what he owns, the clubs he could
    // found, his record and his skill tree. All of it follows him from club to club.
    import { manager, mutate, mgrScreen } from '../../stores/manager.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { showToast } from '../../stores/toasts.js';
    import { myTeam, buyPerk, spendPoint, hasBoard, ownerStake, resignJob, returnToClub, foundNewClub, leagueName } from '../../manager/engine.js';
    import { PERKS, PERK_BRANCHES, POINT_ACTIONS, MGR_XP_PER_LEVEL, REGIONS, CLUB_COLORS, TEAM_EMBLEMS } from '../../manager/data.js';
    import { bankOf, salaryOf, hiredSalary, ownerSalaryMax, setOwnerSalary, depositToClub, withdrawFromClub, holdings, sellHolding, foundCost } from '../../manager/owner.js';
    import { soleOwner } from '../../manager/market.js';
    import { fmtMoney } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: m = s.manager;
    $: board = hasBoard(s);
    $: spent = Object.values(m.perks || {}).reduce((a, b) => a + b, 0);
    $: maxRanks = PERKS.reduce((a, p) => a + p.max, 0);
    $: bank = bankOf(s);
    $: salary = salaryOf(s);
    $: owner = team ? soleOwner(s) : false;
    $: stake = team ? ownerStake(s) : 0;
    $: held = holdings(s);
    $: payMax = team ? ownerSalaryMax(s, team) : 0;
    $: cost1 = foundCost(s, 1);
    $: cost2 = foundCost(s, 2);

    let pay = null;
    $: if (pay === null && team) pay = salary;
    let amount = 100000;
    let form = { name: '', short: '', region: 'LCK', tier: 2, color: CLUB_COLORS[0], emblem: null };
    let founding = false;

    function run(fn, ms = 4500) {
        const r = mutate(fn);
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', ms);
        return r;
    }
    function perk(id) { run(sv => buyPerk(sv, id)); }
    function action(a) {
        openConfirmModal(`Spend a perk point on ${a.name}? ${a.blurb}`, () => run(sv => spendPoint(sv, a.id)));
    }
    function resign() {
        const keep = stake > 0 ? ` You keep your ${stake}% and its share of the profits.` : '';
        openConfirmModal(`Leave ${team.name}? Your academy is released and you will need a new job before the year can go on.${keep}`, () => { const r = run(sv => resignJob(sv)); if (r && r.ok) mgrScreen.set('jobs'); });
    }
    function found() {
        openConfirmModal(`Found ${form.name || 'this club'} in ${leagueName(form.region, form.tier)} for ${fmtMoney(form.tier === 1 ? cost1 : cost2)}? You buy the place of that league's weakest club and take over its squad, and you leave your job.`, () => {
            const r = run(sv => foundNewClub(sv, form), 6000);
            if (r && r.ok) { founding = false; pay = null; mgrScreen.set('home'); }
        });
    }
</script>

<div class="pr">
    <div>
        <h1 class="page-h">{m.name}</h1>
        <p class="page-sub">Your own money, what you own, and your skills. All of it stays with you when you change clubs.</p>
    </div>

    <div class="grid">
        <section class="panel bank">
            <div class="ph"><h3><Icon name="coins" size={15} /> Bank account</h3><b class="big num" class:bad={bank < 0}>{fmtMoney(bank)}</b></div>
            <div class="rows">
                <div><span class="muted small">{owner ? 'Salary you pay yourself' : 'Salary'}</span><b class="num">{fmtMoney(salary)}/yr</b></div>
                {#if !team}<div><span class="muted small">Out of work</span><b class="num">No salary</b></div>{/if}
            </div>
            {#if owner}
                <div class="row-in">
                    <label class="muted small" for="pay">Set your salary (up to {fmtMoney(payMax)})</label>
                    <div class="inl"><input id="pay" class="inp num" type="number" min="0" max={payMax} step="5000" bind:value={pay} /><button class="btn btn-sm btn-p" on:click={() => run(sv => setOwnerSalary(sv, pay))}>Set</button></div>
                </div>
            {:else if team}
                <p class="muted small">{team.name} pay you by their size and your reputation. Own all of a club and you set your own pay.</p>
            {/if}
            {#if team}
                <div class="row-in">
                    <label class="muted small" for="amt">Move money ({team.name} has {fmtMoney(s.finance.balance)})</label>
                    <div class="inl">
                        <input id="amt" class="inp num" type="number" min="0" step="10000" bind:value={amount} />
                        <button class="btn btn-sm" on:click={() => run(sv => depositToClub(sv, amount))}><Icon name="upgrade" size={12} /> Put in</button>
                        {#if owner}<button class="btn btn-sm" on:click={() => run(sv => withdrawFromClub(sv, amount))}>Take out</button>{/if}
                    </div>
                </div>
            {/if}
            {#if (m.bankLog || []).length}
                <ul class="ledger">{#each m.bankLog.slice(0, 6) as e, i (i)}<li><span class="muted">{e.y}</span><span class="lg-l">{e.label}</span><b class="num" class:good={e.amount > 0} class:bad={e.amount < 0}>{e.amount > 0 ? '+' : ''}{fmtMoney(e.amount)}</b></li>{/each}</ul>
            {/if}
        </section>

        <section class="panel">
            <div class="ph"><h3><Icon name="crown" size={15} /> What you own</h3></div>
            {#if team && stake > 0}<p class="small own-now"><TeamBadge {team} size={22} /> <b>{stake}%</b> of {team.name}, the club you run. Manage it on the Club screen.</p>{/if}
            {#if held.length}
                <ul class="held">
                    {#each held as h (h.team.id)}
                        <li>
                            <TeamBadge team={h.team} size={26} />
                            <span class="h-t"><b>{h.pct}% of {h.team.name}</b><span class="muted small">Worth {fmtMoney(h.value)} · pays about {fmtMoney(h.dividend)} a year</span></span>
                            {#if h.pct >= 50}<button class="btn btn-sm" on:click={() => openConfirmModal(`Go back to ${h.team.name} and run it yourself?`, () => { const r = run(sv => returnToClub(sv, h.team.id)); if (r && r.ok) mgrScreen.set('home'); })}>Run it</button>{/if}
                            <button class="btn btn-sm" on:click={() => openConfirmModal(`Sell your ${h.pct}% of ${h.team.name} for ${fmtMoney(h.value)}?`, () => run(sv => sellHolding(sv, h.team.id)))}>Sell</button>
                        </li>
                    {/each}
                </ul>
            {:else if !(team && stake > 0)}
                <p class="muted small">Nothing yet. Buy into your club on the Club screen, or found one. A club you leave keeps paying you your share of its profits.</p>
            {/if}
            {#if team}<button class="btn btn-sm btn-danger" on:click={resign}><Icon name="close" size={12} /> Leave {team.name}</button>{/if}
        </section>

        <section class="panel">
            <div class="ph"><h3><Icon name="sparkle" size={15} /> Found a club</h3><span class="muted small">{fmtMoney(cost2)} tier 2 · {fmtMoney(cost1)} tier 1</span></div>
            {#if !founding}
                <p class="muted small">At any time of year: you buy the place of a league's weakest club, take over its squad, and own all of it. No board and no objectives, just your own money.</p>
                <button class="btn btn-sm btn-p" disabled={bank < cost2} on:click={() => (founding = true)}><Icon name="sparkle" size={12} /> {bank < cost2 ? `You need ${fmtMoney(cost2 - bank)} more` : 'Start a club'}</button>
            {:else}
                <div class="fnd">
                    <input class="inp" placeholder="Club name" maxlength="28" bind:value={form.name} />
                    <input class="inp tag" placeholder="Tag" maxlength="5" bind:value={form.short} />
                    <select class="sel" bind:value={form.region}>{#each REGIONS as r (r.id)}<option value={r.id}>{r.league}</option>{/each}</select>
                    <select class="sel" bind:value={form.tier}><option value={2}>Second tier · {fmtMoney(cost2)}</option><option value={1} disabled={bank < cost1}>Top league · {fmtMoney(cost1)}</option></select>
                </div>
                <div class="swatches">{#each CLUB_COLORS.slice(0, 18) as c (c)}<button class="sw" class:on={form.color === c} style="--sw:{c}" on:click={() => (form.color = c)} aria-label="Colour {c}"></button>{/each}</div>
                <div class="swatches">
                    {#each TEAM_EMBLEMS as e (e.id)}<button class="em" class:on={form.emblem === e.id} style="--sw:{form.color}" on:click={() => (form.emblem = e.id)} title={e.name} aria-label="Emblem {e.name}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={e.d} fill="currentColor" fill-rule="evenodd" /></svg></button>{/each}
                </div>
                <div class="inl"><button class="btn btn-sm btn-p" on:click={found}>Found it</button><button class="btn btn-sm" on:click={() => (founding = false)}>Not now</button></div>
            {/if}
        </section>

        <section class="panel">
            <div class="ph"><h3><Icon name="user" size={15} /> {m.name}</h3><span class="chip" style="--c:#34d399">Level {m.level}</span></div>
            <div class="rec">
                <div><span class="muted small">Series record</span><b class="num">{m.wins}–{m.losses}</b></div>
                <div><span class="muted small">Titles</span><b class="num">{m.titles}</b></div>
                <div><span class="muted small">Reputation</span><b class="num">{m.rep}</b></div>
                <div><span class="muted small">Sackings</span><b class="num">{m.sacked}</b></div>
            </div>
            <button class="btn btn-sm" on:click={() => mgrScreen.set('trophies')}><Icon name="trophy" size={13} /> Trophy cabinet and achievements</button>
            <ul class="career">
                {#each m.history as h, i (i)}
                    <li><span class="muted">{h.year}</span> Left {h.teamName} ({h.left})</li>
                {/each}
                {#if team}<li><span class="muted">{m.joined}–</span> <b>{team.name}</b>{#if team.custom && m.founded === team.id}<span class="chip" style="--c:#34d399">Founded</span>{/if}</li>{/if}
            </ul>
        </section>

    </div>

    <!-- ══════ SKILL TREE ══════ -->
    <section class="panel tree">
        <div class="ph">
            <h3><Icon name="skills" size={15} /> Manager skill tree</h3>
            <div class="pts-box">
                <span class="pts-n" class:has={m.points > 0}>{m.points}</span>
                <span class="pts-l">perk point{m.points === 1 ? '' : 's'} to spend<br /><span class="muted">{spent} of {maxRanks} ranks learned</span></span>
            </div>
        </div>
        <div class="lvl"><span class="muted small">Level {m.level}</span><span class="bar"><i style="width:{(m.xp / MGR_XP_PER_LEVEL) * 100}%"></i></span><span class="muted small">{m.xp} / {MGR_XP_PER_LEVEL} XP to level {m.level + 1}</span></div>
        <p class="muted small how">Every level is a perk point: series won, titles, objectives met and promotions all give XP. Many achievements give a point the first time too.</p>
        <div class="branches">
            {#each PERK_BRANCHES as b}
                <div class="branch" style="--bc:{b.color}">
                    <div class="b-h"><span class="b-ico"><Icon name={b.icon} size={17} stroke={2.2} /></span><div><b>{b.name}</b><span>{b.blurb}</span></div></div>
                    {#each PERKS.filter(p => p.branch === b.id) as p (p.id)}
                        {@const rank = (m.perks || {})[p.id] || 0}
                        <div class="perk" class:maxed={rank >= p.max} class:learned={rank > 0}>
                            <div class="pk-top"><Icon name={p.icon} size={15} /><b>{p.name}</b><span class="pips">{#each Array(p.max) as _, i}<i class:on={i < rank}></i>{/each}</span></div>
                            <p class="pk-b">{p.blurb}</p>
                            {#if rank}<p class="pk-now"><Icon name="check" size={11} stroke={2.6} /> {p.rank(rank)}</p>{/if}
                            {#if rank < p.max}<p class="pk-next">Rank {rank + 1}: {p.rank(rank + 1)}</p>{/if}
                            <button class="btn btn-sm" class:btn-p={m.points > 0 && rank < p.max} disabled={m.points < 1 || rank >= p.max} on:click={() => perk(p.id)}>{rank >= p.max ? 'Maxed' : rank ? 'Upgrade' : 'Learn'}</button>
                        </div>
                    {/each}
                </div>
            {/each}
        </div>
        <div class="acts-h"><Icon name="bolt" size={15} /> <b>Spend a point now</b> <span class="muted small">One-off boosts, any time. Useful once the tree is full, or when something is needed today.</span></div>
        <div class="acts">
            {#each POINT_ACTIONS as a (a.id)}
                <button class="act" disabled={m.points < 1 || !team || (a.id === 'board' && !board)} on:click={() => action(a)}>
                    <span class="act-ico"><Icon name={a.icon} size={18} /></span>
                    <span class="act-t"><b>{a.name}</b><span>{a.blurb}</span></span>
                    <span class="act-c">1 pt</span>
                </button>
            {/each}
        </div>
    </section>

</div>

<style>
    .pr { display: flex; flex-direction: column; gap: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; align-items: start; }
    .small { font-size: 12.5px; line-height: 1.5; }
    .big { font-size: 20px; color: #fff; }
    .rows { display: grid; gap: 6px; margin-bottom: 8px; }
    .rows div { display: flex; justify-content: space-between; gap: 10px; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .rows b { color: #f1f5f9; }
    .row-in { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .inl { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .inl .inp { width: 130px; }
    .ledger { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
    .ledger li { display: flex; gap: 8px; }
    .lg-l { flex: 1; min-width: 0; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .own-now { display: flex; align-items: center; gap: 7px; margin: 0 0 8px; }
    .held { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .held li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .h-t { flex: 1; min-width: 150px; display: flex; flex-direction: column; }
    .h-t b { color: #fff; font-size: 13px; }
    .fnd { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .fnd .inp { flex: 1; min-width: 120px; }
    .fnd .tag { flex: 0 0 76px; min-width: 0; }
    .swatches { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
    .sw { width: 22px; height: 22px; border-radius: 7px; cursor: pointer; background: var(--sw); border: 2px solid transparent; }
    .sw.on { border-color: #fff; }
    .em { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; cursor: pointer; color: color-mix(in srgb, var(--sw) 55%, #ffffff); background: color-mix(in srgb, var(--sw) 30%, rgba(15, 23, 42, 0.92)); border: 2px solid transparent; }
    .em.on { border-color: #fff; }
    .rec { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
    .rec div { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .rec b { font-size: 15px; color: #f1f5f9; }
    .bar { display: block; height: 7px; border-radius: 4px; background: rgba(51, 65, 85, 0.6); overflow: hidden; }
    .bar i { display: block; height: 100%; background: #34d399; }
    .tree { border-color: rgba(52, 211, 153, 0.35); }
    .pts-box { display: flex; align-items: center; gap: 10px; }
    .pts-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 30px; font-weight: 700; color: #64748b; min-width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: rgba(2, 6, 23, 0.5); border: 1px solid var(--line); }
    .pts-n.has { color: #052e1f; background: #34d399; border-color: #34d399; box-shadow: 0 0 18px rgba(52, 211, 153, 0.45); }
    .pts-l { font-size: 12.5px; font-weight: 700; color: #f1f5f9; line-height: 1.35; }
    .lvl { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
    .how { margin: 8px 0 12px; }
    .branches { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: start; }
    .branch { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--bc) 10%, rgba(2, 6, 23, 0.4)), rgba(2, 6, 23, 0.3)); border: 1px solid color-mix(in srgb, var(--bc) 30%, var(--line)); }
    .b-h { display: flex; align-items: center; gap: 9px; margin-bottom: 2px; }
    .b-ico { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; color: #0b1120; background: var(--bc); }
    .b-h div { display: flex; flex-direction: column; gap: 1px; }
    .b-h b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; color: #fff; font-size: 14.5px; }
    .b-h span { font-size: 11px; color: #a5b4cf; line-height: 1.35; }
    .perk { display: flex; flex-direction: column; gap: 5px; padding: 10px; border-radius: 11px; background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(71, 85, 105, 0.45); }
    .perk.learned { border-color: color-mix(in srgb, var(--bc) 50%, transparent); }
    .perk.maxed { border-color: var(--bc); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bc) 35%, transparent); }
    .pk-top { display: flex; align-items: center; gap: 6px; color: var(--bc); }
    .pk-top b { flex: 1; color: #fff; font-size: 13px; }
    .pips { display: inline-flex; gap: 3px; }
    .pips i { width: 8px; height: 8px; border-radius: 50%; background: rgba(148, 163, 184, 0.22); }
    .pips i.on { background: var(--bc); box-shadow: 0 0 6px var(--bc); }
    .pk-b { font-size: 11.5px; color: #a5b4cf; margin: 0; line-height: 1.4; }
    .pk-now { display: flex; gap: 4px; align-items: flex-start; font-size: 11.5px; color: #6ee7b7; margin: 0; line-height: 1.4; }
    .pk-next { font-size: 11.5px; color: #cbd5e1; margin: 0; line-height: 1.4; }
    .perk .btn { margin-top: auto; }
    .acts-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 16px 0 8px; color: #fde68a; }
    .acts-h b { color: #fff; }
    .acts { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
    .act { display: flex; align-items: center; gap: 10px; padding: 11px; border-radius: 12px; text-align: left; cursor: pointer; font-family: inherit; color: #e2e8f0; background: rgba(2, 6, 23, 0.5); border: 1px solid rgba(251, 191, 36, 0.35); }
    .act:hover:not(:disabled) { border-color: #fbbf24; background: rgba(251, 191, 36, 0.07); }
    .act:disabled { opacity: 0.45; cursor: not-allowed; }
    .act-ico { width: 36px; height: 36px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; color: #3b1d00; background: #fbbf24; }
    .act-t { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .act-t b { font-size: 13.5px; color: #fff; }
    .act-t span { font-size: 11.5px; color: #a5b4cf; line-height: 1.35; }
    .act-c { font-size: 11px; font-weight: 900; color: #fde68a; }
    .career { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: #f1f5f9; }
    .career li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    @media (max-width: 1100px) { .branches { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 620px) { .branches { grid-template-columns: 1fr; } }
</style>
