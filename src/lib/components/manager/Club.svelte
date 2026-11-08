<script>
    import { manager, mutate, mgrScreen, resetManager, copyManagerToSlot } from '../../stores/manager.js';
    import { openConfirmModal, openSettings } from '../../stores/ui.js';
    import { activeSlot, slotHasData } from '../../utils/storage.js';
    import { showToast } from '../../stores/toasts.js';
    import {
        myTeam, fearlessOn, ownerStake, hasBoard, boardCanSack, clubValuation, sellStake, buyStake, stakePrice,
        setTeamLanguage, languageSwitchCost, languageCourse, languageCourseCost, teamComms,
    } from '../../manager/engine.js';
    import { STEPS_PER_YEAR, FEARLESS_FROM, STAKE_TRANCHES, MIN_STAKE, CLUB_COLORS, TEAM_EMBLEMS, LANGUAGE_NAMES, REGION_LANGUAGE, teamLanguage } from '../../manager/data.js';
    import { sponsorIncome, wageBill, wageBudget, baseWageBudget, wageBoost, emergencyLeft, emergencyAllowance, ownerFunding, ownerInvestment } from '../../manager/market.js';
    import { clubIncome } from '../../manager/sponsors.js';
    import { langLevel } from '../../manager/people.js';
    import { bankOf, salaryOf, rebrandClub } from '../../manager/owner.js';
    import { fmtMoney } from '../../manager/ui.js';
    import { ordinal } from '../../manager/util.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: m = s.manager;
    $: income = team ? clubIncome(s, team) : 0;
    $: bill = team ? wageBill(s, team) : 0;
    $: budget = team ? wageBudget(s, team) : 0;
    $: funding = team ? ownerFunding(s, team) : 0;
    $: forced = s.time.year >= FEARLESS_FROM;
    $: stake = ownerStake(s);
    $: board = hasBoard(s);
    $: founder = !!(team && team.custom && m.founded === team.id);
    $: valuation = team ? clubValuation(s) : 0;
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

    function saveTo(n) {
        const go = () => { const r = copyManagerToSlot(n); showToast(r.msg, r.ok ? 'success' : 'error', 3000); };
        if (n !== activeSlot('manager') && slotHasData('manager', n)) openConfirmModal(`Slot ${n} already holds a manager save. Overwrite it with a copy of this one?`, go);
        else go();
    }

    /** A club you own outright can change its name, tag, colour and emblem at any time. */
    let newName = null, newShort = null;
    $: if (team && newName === null) { newName = team.name; newShort = team.short; }
    function setBadge(v) {
        mutate(sv => { const t = sv.teams[sv.manager.teamId]; if (t) Object.assign(t, v, { rebranded: true }); });
    }
    function rename() {
        const r = mutate(sv => rebrandClub(sv, { name: newName, short: newShort, color: team.color }));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
    }
    function run(fn) {
        const r = mutate(fn);
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
    }
    $: lang = team ? teamLanguage(team) : 'en';
    $: comms = team ? teamComms(team, s.players) : 100;
    $: speakers = (code) => (team ? team.roster.filter(id => langLevel(s.players[id], code) >= 60).length : 0);
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
        <p class="page-sub">The club's money, who owns it, the board, and how it runs.</p>
    </div>

    {#if team}
        <section class="panel own">
            <div class="ph"><h3><Icon name="crown" size={15} /> Ownership</h3><span class="chip" style="--c:#fbbf24">You own {stake}%</span></div>
            <div class="own-top">
                <div class="stake"><span class="stake-ring" style="--p:{stake}"><b>{stake}%</b></span><span class="muted small">{stake >= 100 ? 'All of it' : `${100 - stake}% with ${founder ? 'investors' : 'the owners'}`}</span></div>
                <div class="own-t">
                    <p>{#if stake >= 100}<b>{team.name} is yours.</b> No board, no objectives, no wage limit and nobody who can sack you. The only limit is the balance: you cannot add wages while the club is in debt.{:else if stake >= 50}<b>You hold a majority.</b> The {founder ? 'investors sit' : 'owners sit'} on a board with objectives and a wage limit, but they cannot sack you.{:else if stake > 0}<b>The {founder ? 'investors' : 'owners'} hold a majority.</b> The board can sack you if it loses confidence.{:else}<b>You were hired to run {team.name}.</b> Earn a stake with perk points (Ownership Stake, 10% a point) or buy one with your own money: own half and the board cannot sack you, own it all and the board is gone.{/if}</p>
                    <p class="muted small">The club is valued at <b class="num">{fmtMoney(valuation)}</b>: sponsor income, the squad's market value and the titles it has won.</p>
                </div>
            </div>
            <div class="own-acts">
                {#if stake > 0}
                    {#each STAKE_TRANCHES as pct}
                        <button class="btn" disabled={stake - pct < (founder ? MIN_STAKE : 0)} on:click={() => sell(pct)}><Icon name="coins" size={14} /> Sell {pct}% · {fmtMoney(stakePrice(s, pct))}</button>
                    {/each}
                {/if}
                {#if stake < 100}
                    {#each STAKE_TRANCHES as pct}
                        <button class="btn" disabled={stakePrice(s, Math.min(pct, 100 - stake), true) > bankOf(s)} on:click={() => buy(pct)}><Icon name="upgrade" size={14} /> {founder ? 'Buy back' : 'Buy'} {Math.min(pct, 100 - stake)}% · {fmtMoney(stakePrice(s, Math.min(pct, 100 - stake), true))}</button>
                    {/each}
                {/if}
            </div>
            <p class="muted small">{founder ? `You always keep at least ${MIN_STAKE}% of a club you founded. ` : ''}Selling brings money into the club; buying comes out of your own bank ({fmtMoney(bankOf(s))}), at 15% more. At 100% the board is dissolved, and you can rebrand the club and set your own salary. You keep what you own if you leave.</p>
        </section>
    {/if}

    {#if team && stake >= 100}
        <section class="panel">
            <div class="ph"><h3><Icon name="sparkle" size={15} /> Rebrand the club</h3><TeamBadge {team} size={40} /></div>
            <div class="rename">
                <input class="inp" maxlength="28" placeholder="Club name" bind:value={newName} aria-label="Club name" />
                <input class="inp tag" maxlength="5" placeholder="Tag" bind:value={newShort} aria-label="Club tag" />
                <button class="btn btn-sm btn-p" on:click={rename}>Rename</button>
            </div>
            {#if (team.names || []).length}<p class="muted small">Formerly {team.names.map(n => `${n.name} (to ${n.y})`).join(', ')}.</p>{/if}
            <div class="badge-row">
                <span class="muted small">Colour</span>
                <div class="swatches">{#each CLUB_COLORS as c}<button class="sw" class:on={team.color === c} style="--sw:{c}" on:click={() => setBadge({ color: c })} aria-label="Colour {c}"></button>{/each}</div>
            </div>
            <div class="badge-row">
                <span class="muted small">Badge</span>
                <div class="swatches">
                    <button class="em em-tag" class:on={!team.emblem} style="--sw:{team.color}" on:click={() => setBadge({ emblem: null })}>{team.short}</button>
                    {#each TEAM_EMBLEMS as e (e.id)}
                        <button class="em" class:on={team.emblem === e.id} style="--sw:{team.color}" on:click={() => setBadge({ emblem: e.id })} title={e.name} aria-label="Emblem {e.name}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={e.d} fill="currentColor" fill-rule="evenodd" /></svg></button>
                    {/each}
                </div>
            </div>
        </section>
    {/if}

    <div class="grid">
        {#if team}
            <section class="panel">
                <div class="ph"><h3><Icon name="chat" size={15} /> Club language</h3><span class="chip" style="--c:{comms >= 85 ? '#34d399' : comms >= 60 ? '#fbbf24' : '#f87171'}">Comms {comms}%</span></div>
                <div class="langs">
                    {#each Object.keys(LANGUAGE_NAMES) as code (code)}
                        <button class="lg" class:on={lang === code} disabled={team.langYear === s.time.year && lang !== code} on:click={() => openConfirmModal(`Make ${LANGUAGE_NAMES[code]} the club's language for ${fmtMoney(languageSwitchCost(s))}? You can change it once a year.`, () => run(sv => setTeamLanguage(sv, code)))}>
                            <b>{LANGUAGE_NAMES[code]}</b><span class="muted small">{speakers(code)}/{team.roster.length} speak it{REGION_LANGUAGE[team.region] === code ? ' · league' : ''}</span>
                        </button>
                    {/each}
                </div>
                <button class="btn btn-sm" on:click={() => run(sv => languageCourse(sv))}><Icon name="chat" size={12} /> Squad course in {LANGUAGE_NAMES[lang]} · {fmtMoney(languageCourseCost(s))}</button>
                <p class="muted small">A five that cannot talk gives away edge in every game. Pick what most of your squad already speaks: the course gets cheaper the more of them are fluent, and a room that speaks it teaches it faster.</p>
            </section>
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
                    <div><span class="muted small">Base revenue and sponsors per year</span><b class="num good">{fmtMoney(income)}</b><button class="btn btn-sm" on:click={() => mgrScreen.set('sponsors')}><Icon name="coins" size={12} /> Sponsors</button></div>
                    {#if funding > 0}<div><span class="muted small">Owner investment per year</span><b class="num good">{fmtMoney(funding)}</b><span class="muted small">+{Math.round((ownerInvestment(team) - 1) * 100)}% on the wage limit, fading each year</span></div>{/if}
                    <div><span class="muted small">Wages per year</span><b class="num bad">{fmtMoney(bill)}</b></div>
                    <div><span class="muted small">Your salary</span><b class="num bad">{fmtMoney(salaryOf(s))}</b><button class="btn btn-sm" on:click={() => mgrScreen.set('profile')}><Icon name="user" size={12} /> Your bank</button></div>
                    <div><span class="muted small">Wage limit</span><b class="num">{Number.isFinite(budget) ? fmtMoney(budget) : 'No limit'}</b>{#if Number.isFinite(budget) && boost > 1.001}<span class="good small">+{Math.round((boost - 1) * 100)}% for results (base {fmtMoney(baseWageBudget(s, team))})</span>{/if}</div>
                    <div><span class="muted small">Net per week</span><b class="num" class:good={income + funding >= bill + salaryOf(s)} class:bad={income + funding < bill + salaryOf(s)}>{fmtMoney((income + funding - bill - salaryOf(s)) / STEPS_PER_YEAR)}</b></div>
                    <div><span class="muted small">Emergency signings left</span><b class="num">{emergencyLeft(s)} / {emergencyAllowance(s)}</b></div>
                </div>
                <p class="muted small">Half of a club's commercial income is base revenue that grows with its reputation and with the game itself; the rest comes from the sponsors you land on the Sponsors screen, and brands only sign a club that wins. Prize money comes from playoffs, the Regional Cup, First Stand, MSI and Worlds.</p>
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
            <div class="ph"><h3><Icon name="settings" size={15} /> Settings</h3></div>
            <label class="tog" class:off={forced}>
                <input type="checkbox" checked={fearlessOn(s)} disabled={forced} on:change={(e) => setting('fearless', e.currentTarget.checked)} />
                <span><b>Fearless draft</b><br /><span class="muted small">{forced ? `Compulsory from ${FEARLESS_FROM}: a champion played in a series cannot be played again in it, by either side.` : `A champion played in a series cannot be played again in it, by either side. Every league plays it. Compulsory from ${FEARLESS_FROM}.`}</span></span>
            </label>
            <label class="tog"><input type="checkbox" checked={!!s.settings.autoDraft} on:change={(e) => setting('autoDraft', e.currentTarget.checked)} /> <span><b>Auto draft</b><br /><span class="muted small">The coach does champion select for you.</span></span></label>
            <label class="tog"><input type="checkbox" checked={!!s.settings.autoCalls} on:change={(e) => setting('autoCalls', e.currentTarget.checked)} /> <span><b>Coach makes the in-game calls</b><br /><span class="muted small">Level one, 14 minutes, 20 minutes and the late game.</span></span></label>
            <label class="tog"><input type="checkbox" checked={!s.settings.boardHidden} on:change={(e) => setting('boardHidden', !e.currentTarget.checked)} /> <span><b>Show this save on the manager board</b><br /><span class="muted small">On by default for players who are signed in.</span></span></label>
            <div class="saves">
                <span class="muted small">Save · you are on slot {activeSlot('manager')}</span>
                <div class="save-btns">
                    {#each [1, 2, 3] as n}<button class="btn btn-sm" on:click={() => saveTo(n)}><Icon name="check" size={12} /> {n === activeSlot('manager') ? `Save (slot ${n})` : `Copy to slot ${n}`}</button>{/each}
                    <button class="btn btn-sm" on:click={() => openSettings('display')}><Icon name="settings" size={12} /> Game settings</button>
                </div>
            </div>
            <button class="btn btn-danger btn-sm newg" on:click={newGame}><Icon name="close" size={13} /> Delete save and start over</button>
        </section>
    </div>
</div>

<style>
    .cl { display: flex; flex-direction: column; gap: 12px; }
    /* Packed columns: panels of different heights leave no holes. */
    .grid { columns: 3 320px; column-gap: 12px; }
    .grid > :global(.panel) { break-inside: avoid; margin-bottom: 12px; }
    .small { font-size: 12.5px; line-height: 1.5; }
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
    .saves { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 10px; }
    .save-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
    .swatches { display: flex; gap: 6px; flex-wrap: wrap; }
    .sw { width: 26px; height: 26px; border-radius: 8px; cursor: pointer; background: var(--sw); border: 2px solid transparent; box-shadow: inset 0 0 0 2px rgba(2, 6, 23, 0.5); }
    .sw.on { border-color: #fff; }
    .em { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; cursor: pointer; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 10px; font-weight: 800; color: color-mix(in srgb, var(--sw) 55%, #ffffff); background: color-mix(in srgb, var(--sw) 30%, rgba(15, 23, 42, 0.92)); border: 2px solid transparent; }
    .em-tag { width: auto; min-width: 32px; padding: 0 6px; }
    .em.on { border-color: #fff; }
    .objs { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
    .objs li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; color: #f1f5f9; }
    .o-dot { width: 9px; height: 9px; border-radius: 50%; background: #64748b; flex-shrink: 0; }
    .o-dot.met { background: #34d399; }
    .o-dot.miss { background: #f87171; }
    .rename { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .rename .inp { flex: 1; min-width: 150px; }
    .rename .tag { flex: 0 0 80px; min-width: 0; }
    .langs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
    .lg { display: flex; flex-direction: column; gap: 1px; padding: 7px 9px; border-radius: 9px; font: inherit; text-align: left; color: #e2e8f0; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(71, 85, 105, 0.45); cursor: pointer; }
    .lg.on { border-color: #34d399; }
    .lg:disabled { opacity: 0.5; cursor: not-allowed; }
    .fin { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .fin div { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .fin b { font-size: 16px; color: #f1f5f9; }
    .ledger { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
    .ledger li { display: flex; gap: 8px; align-items: baseline; }
    .lg-l { flex: 1; color: #dbe4f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tog { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: #dbe4f0; margin-bottom: 12px; cursor: pointer; line-height: 1.4; }
    .tog b { color: #fff; }
    .tog input { accent-color: #10b981; width: 17px; height: 17px; margin-top: 2px; flex-shrink: 0; }
    .tog.off { cursor: default; }
    .newg { margin-top: 6px; }
</style>
