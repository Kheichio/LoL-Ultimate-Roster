<script>
    import { manager, mutate, mgrScreen, resetManager } from '../../stores/manager.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { showToast } from '../../stores/toasts.js';
    import {
        myTeam, buyPerk, spendPoint, acceptJob, leagueName, fearlessOn, ownerStake, hasBoard, boardCanSack, clubValuation,
        sellStake, buyStake, stakePrice,
    } from '../../manager/engine.js';
    import { PERKS, PERK_BRANCHES, POINT_ACTIONS, MGR_XP_PER_LEVEL, STEPS_PER_YEAR, FEARLESS_FROM, STAKE_TRANCHES, MIN_STAKE } from '../../manager/data.js';
    import { sponsorIncome, wageBill, wageBudget, baseWageBudget, wageBoost, emergencyLeft, emergencyAllowance, ownerFunding, ownerInvestment } from '../../manager/market.js';
    import { teamStrength } from '../../manager/match.js';
    import { fmtMoney } from '../../manager/ui.js';
    import { ordinal } from '../../manager/util.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: m = s.manager;
    $: income = team ? sponsorIncome(s, team) : 0;
    $: bill = team ? wageBill(s, team) : 0;
    $: budget = team ? wageBudget(s, team) : 0;
    $: funding = team ? ownerFunding(s, team) : 0;
    $: offers = (s.jobOffers || []).map(id => s.teams[id]).filter(Boolean);
    $: spent = Object.values(m.perks || {}).reduce((a, b) => a + b, 0);
    $: maxRanks = PERKS.reduce((a, p) => a + p.max, 0);
    $: forced = s.time.year >= FEARLESS_FROM;
    $: stake = ownerStake(s);
    $: board = hasBoard(s);
    $: founder = !!(team && team.custom && m.founded === team.id);
    $: valuation = founder ? clubValuation(s) : 0;
    $: boost = team && board ? wageBoost(s) : 1;

    function sell(pct) {
        const price = stakePrice(s, pct);
        const warn = stake >= 100 ? ' Investors will sit on a board: objectives, and a wage limit.' : stake - pct < 50 && stake >= 50 ? ' You will no longer hold a majority: the board will be able to sack you.' : '';
        openConfirmModal(`Sell ${pct}% of ${team.name} for ${fmtMoney(price)}?${warn}`, () => {
            const r = mutate(s => sellStake(s, pct));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 5000);
        });
    }
    function buy(pct) {
        const r = mutate(s => buyStake(s, pct));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 5000);
    }

    function perk(id) {
        const r = mutate(s => buyPerk(s, id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
    }
    function action(a) {
        openConfirmModal(`Spend a perk point on ${a.name}? ${a.blurb}`, () => {
            const r = mutate(s => spendPoint(s, a.id));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
        });
    }
    function take(id) {
        const t = s.teams[id];
        openConfirmModal(`Take the job at ${t.name}? You leave ${team ? team.name : 'nothing'} behind${team ? ' at once' : ''}.`, () => {
            const r = mutate(s => acceptJob(s, id));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
        });
    }
    function setting(key, v) {
        mutate(s => { s.settings = { ...(s.settings || {}), [key]: v }; });
    }
    function newGame() {
        openConfirmModal('Delete this save and start a new manager career in this slot? It cannot be undone.', () => resetManager());
    }
</script>

<div class="cl">
    <div>
        <h1 class="page-h">Club</h1>
        <p class="page-sub">Money, the board, your skill tree and the house rules.</p>
    </div>

    {#if offers.length}
        <section class="panel jobs">
            <div class="ph"><h3><Icon name="briefcase" size={15} /> Job offers</h3><span class="muted small">{s.jobless ? 'Pick one to carry on' : 'Open until the season starts'}</span></div>
            <div class="job-list">
                {#each offers as t (t.id)}
                    <div class="job">
                        <TeamBadge team={t} size={40} />
                        <div class="job-t">
                            <b>{t.name}</b>
                            <span class="muted small">{leagueName(t.region, t.tier)} · team OVR {Math.round(teamStrength(t, s.players))} · reputation {t.rep}</span>
                        </div>
                        <button class="btn btn-p" on:click={() => take(t.id)}>Take the job</button>
                    </div>
                {/each}
            </div>
        </section>
    {/if}

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

    {#if founder}
        <section class="panel own">
            <div class="ph"><h3><Icon name="crown" size={15} /> Ownership</h3><span class="chip" style="--c:#fbbf24">You own {stake}%</span></div>
            <div class="own-top">
                <div class="stake"><span class="stake-ring" style="--p:{stake}"><b>{stake}%</b></span><span class="muted small">{stake >= 100 ? 'All of it' : `${100 - stake}% with investors`}</span></div>
                <div class="own-t">
                    <p>{#if stake >= 100}<b>{team.name} is yours.</b> No board, no objectives, no wage limit and nobody who can sack you. The only limit is the balance: you cannot add wages while the club is in debt.{:else if stake >= 50}<b>You hold a majority.</b> The investors sit on a board with objectives and a wage limit, but they cannot sack you.{:else}<b>The investors hold a majority.</b> The board can sack you from your own club if it loses confidence.{/if}</p>
                    <p class="muted small">The club is valued at <b class="num">{fmtMoney(valuation)}</b>: sponsor income, the squad's market value and the titles it has won.</p>
                </div>
            </div>
            <div class="own-acts">
                {#each STAKE_TRANCHES as pct}
                    <button class="btn" disabled={stake - pct < MIN_STAKE} on:click={() => sell(pct)}><Icon name="coins" size={14} /> Sell {pct}% · {fmtMoney(stakePrice(s, pct))}</button>
                {/each}
                {#if stake < 100}
                    {#each STAKE_TRANCHES as pct}
                        <button class="btn" disabled={stakePrice(s, Math.min(pct, 100 - stake), true) > s.finance.balance} on:click={() => buy(pct)}><Icon name="upgrade" size={14} /> Buy back {Math.min(pct, 100 - stake)}% · {fmtMoney(stakePrice(s, Math.min(pct, 100 - stake), true))}</button>
                    {/each}
                {/if}
            </div>
            <p class="muted small">You always keep at least {MIN_STAKE}%. Buying back costs 15% more than selling. Back at 100%, the board is dissolved.</p>
        </section>
    {/if}

    <div class="grid">
        {#if team}
            {#if board}
                <section class="panel">
                    <div class="ph"><h3><Icon name="briefcase" size={15} /> The board</h3><span class="chip" style="--c:{s.board.confidence >= 60 ? '#34d399' : s.board.confidence >= 35 ? '#fbbf24' : '#f87171'}">{Math.round(s.board.confidence)}% confidence</span></div>
                    <div class="conf"><span class="bar"><i style="width:{s.board.confidence}%; --c:{s.board.confidence >= 60 ? '#34d399' : s.board.confidence >= 35 ? '#fbbf24' : '#f87171'}"></i></span></div>
                    <ul class="objs">
                        {#each s.board.objectives as o}
                            <li><span class="o-dot" class:met={o.met === true} class:miss={o.met === false}></span>{o.text}</li>
                        {/each}
                    </ul>
                    <p class="muted small">Met objectives raise confidence at the end of the year; missed ones cost more. After each split the board compares your finish to what it expected (around {ordinal(s.board.expected)}).{#if boardCanSack(s)}{' '}At 15% or less when the year ends, or 5% after the spring, you are sacked.{:else}{' '}You hold a majority of the club, so they cannot sack you.{/if} Confidence above 60% and recent titles raise the wage limit.</p>
                </section>
            {:else}
                <section class="panel">
                    <div class="ph"><h3><Icon name="crown" size={15} /> No board</h3><span class="chip" style="--c:#fbbf24">Sole owner</span></div>
                    <p class="small">You own all of {team.name}: nobody sets you objectives and nobody can sack you. The squad's strength ranks {ordinal(s.board.expected)} in the league, if you want a yardstick.</p>
                </section>
            {/if}

            <section class="panel">
                <div class="ph"><h3><Icon name="coins" size={15} /> Finances</h3><b class="num" class:bad={s.finance.balance < 0}>{fmtMoney(s.finance.balance)}</b></div>
                <div class="fin">
                    <div><span class="muted small">Sponsors per year</span><b class="num good">{fmtMoney(income)}</b></div>
                    {#if funding > 0}<div><span class="muted small">Owner investment per year</span><b class="num good">{fmtMoney(funding)}</b><span class="muted small">+{Math.round((ownerInvestment(team) - 1) * 100)}% on the wage limit, fading each year</span></div>{/if}
                    <div><span class="muted small">Wages per year</span><b class="num bad">{fmtMoney(bill)}</b></div>
                    <div><span class="muted small">Wage limit</span><b class="num">{Number.isFinite(budget) ? fmtMoney(budget) : 'No limit'}</b>{#if Number.isFinite(budget) && boost > 1.001}<span class="good small">+{Math.round((boost - 1) * 100)}% for results (base {fmtMoney(baseWageBudget(s, team))})</span>{/if}</div>
                    <div><span class="muted small">Net per week</span><b class="num" class:good={income + funding >= bill} class:bad={income + funding < bill}>{fmtMoney((income + funding - bill) / STEPS_PER_YEAR)}</b></div>
                    <div><span class="muted small">Emergency signings left</span><b class="num">{emergencyLeft(s)} / {emergencyAllowance(s)}</b></div>
                </div>
                <p class="muted small">Sponsors grow with your club's reputation, which grows with titles, and with the game itself: club income and prize money rise from era to era as wages do. Prize money comes from playoffs, MSI and Worlds.</p>
                {#if s.finance.log.length}
                    <ul class="ledger">
                        {#each s.finance.log.slice(0, 10) as e, i (i)}
                            <li><span class="muted">{e.y}</span><span class="lg-l">{e.label}</span><b class="num" class:good={e.amount > 0} class:bad={e.amount < 0}>{e.amount > 0 ? '+' : ''}{fmtMoney(e.amount)}</b></li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/if}

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

        <section class="panel">
            <div class="ph"><h3><Icon name="settings" size={15} /> Settings</h3></div>
            <label class="tog" class:off={forced}>
                <input type="checkbox" checked={fearlessOn(s)} disabled={forced} on:change={(e) => setting('fearless', e.currentTarget.checked)} />
                <span><b>Fearless draft</b><br /><span class="muted small">{forced ? `Compulsory from ${FEARLESS_FROM}: a champion played in a series cannot be played again in it, by either side.` : `A champion played in a series cannot be played again in it, by either side. Every league plays it. Compulsory from ${FEARLESS_FROM}.`}</span></span>
            </label>
            <label class="tog"><input type="checkbox" checked={!!s.settings.autoDraft} on:change={(e) => setting('autoDraft', e.currentTarget.checked)} /> <span><b>Auto draft</b><br /><span class="muted small">The coach does champion select for you.</span></span></label>
            <label class="tog"><input type="checkbox" checked={!!s.settings.autoCalls} on:change={(e) => setting('autoCalls', e.currentTarget.checked)} /> <span><b>Coach makes the in-game calls</b><br /><span class="muted small">Level one, 14 minutes, 20 minutes and the late game.</span></span></label>
            <button class="btn btn-danger btn-sm newg" on:click={newGame}><Icon name="close" size={13} /> Delete save and start over</button>
        </section>
    </div>
</div>

<style>
    .cl { display: flex; flex-direction: column; gap: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; align-items: start; }
    .small { font-size: 12.5px; line-height: 1.5; }
    .jobs { border-color: rgba(52, 211, 153, 0.55); }
    .job-list { display: flex; flex-direction: column; gap: 8px; }
    .job { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: rgba(2, 6, 23, 0.45); flex-wrap: wrap; }
    .job-t { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 180px; }
    .job-t b { color: #fff; }
    .tree { border-color: rgba(52, 211, 153, 0.35); }
    .pts-box { display: flex; align-items: center; gap: 10px; }
    .pts-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 30px; font-weight: 700; color: #64748b; min-width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: rgba(2, 6, 23, 0.5); border: 1px solid var(--line); }
    .pts-n.has { color: #052e1f; background: #34d399; border-color: #34d399; box-shadow: 0 0 18px rgba(52, 211, 153, 0.45); }
    .pts-l { font-size: 12.5px; font-weight: 700; color: #f1f5f9; line-height: 1.35; }
    .lvl { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
    .how { margin: 8px 0 12px; }
    .branches { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
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
    .conf { margin-bottom: 12px; }
    .own { border-color: rgba(251, 191, 36, 0.5); background: radial-gradient(70% 120% at 0% 0%, rgba(251, 191, 36, 0.1), transparent 60%), var(--card); }
    .own-top { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-bottom: 12px; }
    .stake { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .stake-ring { width: 86px; height: 86px; display: grid; place-items: center; border-radius: 50%; background: conic-gradient(#fbbf24 calc(var(--p) * 1%), rgba(148, 163, 184, 0.18) 0); }
    .stake-ring b { width: 66px; height: 66px; display: grid; place-items: center; border-radius: 50%; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 19px; color: #fff; background: #0b1222; }
    .own-t { flex: 1; min-width: 240px; }
    .own-t p { margin: 0 0 6px; font-size: 13.5px; line-height: 1.55; color: #dbe4f0; }
    .own-t b { color: #fff; }
    .own-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .objs { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
    .objs li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #f1f5f9; }
    .o-dot { width: 9px; height: 9px; border-radius: 50%; background: #64748b; flex-shrink: 0; }
    .o-dot.met { background: #34d399; }
    .o-dot.miss { background: #f87171; }
    .fin, .rec { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .fin div, .rec div { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .fin b, .rec b { font-size: 16px; color: #f1f5f9; }
    .ledger { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
    .ledger li { display: flex; gap: 8px; align-items: baseline; }
    .lg-l { flex: 1; color: #dbe4f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .career { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: #f1f5f9; }
    .career li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .tog { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: #dbe4f0; margin-bottom: 12px; cursor: pointer; line-height: 1.4; }
    .tog b { color: #fff; }
    .tog input { accent-color: #10b981; width: 17px; height: 17px; margin-top: 2px; flex-shrink: 0; }
    .tog.off { cursor: default; }
    .newg { margin-top: 6px; }
    @media (max-width: 1250px) { .branches { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 800px) { .branches { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .branches { grid-template-columns: 1fr; } }
</style>
