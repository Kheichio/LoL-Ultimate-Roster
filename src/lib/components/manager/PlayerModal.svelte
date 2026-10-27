<script>
    import { manager, mutate, mgrModal } from '../../stores/manager.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { showToast } from '../../stores/toasts.js';
    import { myTeam, teamTalk, scoutPlayer, scoutCost, isScouted, setFocus, currentStep, devForecast } from '../../manager/engine.js';
    import { ATTRS, TALKS, XP_PER_LEVEL, ROLE_BY_ID, SQUAD_STATUS, EMERGENCY_PREMIUM } from '../../manager/data.js';
    import {
        askingPrice, wageAsk, signingCheck, bidForPlayer, signFreeAgent, releasePlayer, releaseCost, windowOpen,
        renewalDemand, renewalOdds, negotiateRenewal, letContractRun, listPlayer, unlistPlayer, isEmergency, emergencyLeft,
    } from '../../manager/market.js';
    import { ovrOf, ageOf, potentialView, focusAttr, marketValue } from '../../manager/people.js';
    import { ovrColor, fmtMoney, moraleWord, formWord, persona, champName, metaTag, cardFor, avgRating, kda, contractWord } from '../../manager/ui.js';
    import Card from '../card/Card.svelte';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    export let id;
    const noop = () => {};

    $: s = $manager;
    $: p = s.players[id];
    $: me = myTeam(s);
    $: team = p && p.team ? s.teams[p.team] : null;
    $: mine = !!(p && me && p.team === me.id);
    $: year = s.time.year;
    $: step = currentStep(s);
    $: scoutRank = (s.manager.perks || {}).scout || 0;
    $: scouted = p ? isScouted(s, p) : false;
    $: pv = p ? potentialView(p, { scouted, scoutRank }) : null;
    $: per = p ? persona(p) : null;
    $: ask = p && p.team && !mine ? askingPrice(s, p) : 0;
    $: wage = p && me ? wageAsk(s, p, me) : 0;
    let fee = null;
    $: if (p && fee === null && ask) fee = ask;
    let years = 2;
    $: check = p && me && !mine ? signingCheck(s, p, { fee: p.team ? Number(fee) || 0 : 0, wage }) : '';
    $: fa = (p && p.focus) || 'auto';
    $: emergency = p && !mine ? isEmergency(s, p) : false;
    $: dev = p && mine ? devForecast(s, p) : null;
    $: cw = p && mine ? contractWord(p, year) : null;

    // ── a new contract ──
    let nYears = 2;
    let nStatus = null;
    let nWage = null;
    let nBonus = 0;
    $: if (mine && nStatus === null) nStatus = p.status || 'regular';
    $: demand = mine && nStatus ? renewalDemand(s, p, nYears, nStatus) : 0;
    $: if (mine && demand && (nWage === null || nWage === 0)) nWage = demand;
    $: odds = mine && nStatus ? renewalOdds(s, p, { years: nYears, wage: Number(nWage) || 0, bonus: nBonus, status: nStatus }) : null;
    $: bonusOpts = [0, 0.25, 0.5].map(f => Math.round((Number(nWage) || demand) * f / 1000) * 1000);
    function setYears(n) { nYears = n; nWage = renewalDemand(s, p, n, nStatus); }
    function setStatus(id) { nStatus = id; nWage = renewalDemand(s, p, nYears, id); }

    // ── the transfer list ──
    let listPrice = null;
    $: if (mine && listPrice === null) listPrice = p.listed || Math.round(marketValue(p, year) / 5000) * 5000;

    function close() { mgrModal.set(null); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    let justSigned = false;
    function offer() {
        const r = mutate(s => negotiateRenewal(s, p.id, { years: nYears, wage: Number(nWage) || 0, bonus: nBonus, status: nStatus }));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 5000);
        if (r && r.ok) justSigned = true;
    }
    function leaveAtEnd(v) {
        const r = mutate(s => letContractRun(s, p.id, v));
        if (r) showToast(r.msg, 'info', 4000);
    }
    function list() {
        const r = mutate(s => listPlayer(s, p.id, Number(listPrice) || 0));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 5000);
    }
    function unlist() {
        const r = mutate(s => unlistPlayer(s, p.id));
        if (r) showToast(r.msg, 'info', 3000);
    }

    function talk(t) {
        const r = mutate(s => teamTalk(s, p.id, t));
        if (r) showToast(r.msg + (r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta} morale)` : ''), r.ok ? (r.delta < 0 ? 'error' : 'success') : 'error', 3500);
    }
    function scout() {
        const r = mutate(s => scoutPlayer(s, p.id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 3500);
    }
    function bid() {
        const go = () => {
            const r = mutate(s => bidForPlayer(s, p.id, Number(fee) || 0));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
            if (r && r.counter) fee = r.counter;
        };
        if (emergency) openConfirmModal(`This uses your emergency signing for ${year}: ${fmtMoney(Number(fee) || 0)} for ${p.name}, outside the transfer window. Go ahead?`, go);
        else go();
    }
    function sign() {
        const r = mutate(s => signFreeAgent(s, p.id, years - 1));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
    }
    function doRelease() {
        openConfirmModal(`Release ${p.name}? The payout is ${fmtMoney(releaseCost(s, p))}, and he becomes a free agent anyone can sign.`, () => {
            const r = mutate(s => releasePlayer(s, p.id));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
            close();
        });
    }
</script>

<svelte:window on:keydown={onKey} />

{#if p}
<div class="modal-back" on:click|self={close} role="presentation">
    <div class="modal pm" role="dialog" aria-modal="true" aria-label={p.name}>
        <button class="modal-x" on:click={close} aria-label="Close"><Icon name="close" size={16} /></button>

        <div class="pm-top">
            <div class="pm-card"><Card card={cardFor(p, team, year)} onclick={noop} /></div>
            <div class="pm-id">
                <div class="nm-row">
                    <h2>{p.name}</h2>
                    {#if p.flag}<span class="flag">{p.flag}</span>{/if}
                </div>
                {#if !p.real}
                    <div class="rand"><Icon name="sparkle" size={14} /> Random player: generated for this save, not a real pro.</div>
                {/if}
                <div class="tags">
                    <span class="chip" style="--c:{ROLE_BY_ID[p.role].accent}">{ROLE_BY_ID[p.role].name}</span>
                    {#if p.roles.length > 1}<span class="chip">Also {p.roles.filter(r => r !== p.role).join(', ')}</span>{/if}
                    <span class="chip">Age {ageOf(p, year)}</span>
                    {#if team}<span class="chip tm"><TeamBadge {team} size={16} /> {team.name}</span>{:else}<span class="chip" style="--c:#fbbf24">Free agent</span>{/if}
                </div>
                <div class="keyrow">
                    <div class="kv"><span class="muted">OVR</span><span class="ovr big" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></div>
                    <div class="kv"><span class="muted">Potential</span><b class="num">{pv.exact ? pv.lo : `${pv.lo}–${pv.hi}`}</b>{#if !pv.exact}<span class="muted tiny">range</span>{/if}</div>
                    <div class="kv lv"><span class="muted">Level {p.lv}</span><span class="bar"><i style="width:{(p.xp / XP_PER_LEVEL) * 100}%"></i></span><span class="muted tiny">{p.xp} / {XP_PER_LEVEL} XP</span></div>
                    <div class="kv"><span class="muted">Morale</span><b style="color:{moraleWord(p.mor).color}">{moraleWord(p.mor).word}</b></div>
                    <div class="kv"><span class="muted">Form</span><b style="color:{formWord(p.form).color}">{formWord(p.form).arrow} {formWord(p.form).word}</b></div>
                </div>
                <div class="pers" style="--c:{per.color}">
                    <span class="pers-n">{per.name}</span>
                    <span class="pers-b">{per.blurb}</span>
                    <ul>{#each per.does as d}<li>{d}</li>{/each}</ul>
                </div>
            </div>
        </div>

        <div class="pm-grid">
            <section class="panel">
                <div class="ph"><h3><Icon name="bolt" size={14} /> Attributes</h3>{#if mine}<span class="muted tiny">Level-up points go to: <b>{ATTRS.find(a => a.key === focusAttr(p)).name}</b></span>{/if}</div>
                <div class="attrs">
                    {#each ATTRS as a}
                        <div class="at" title={a.blurb}>
                            <span class="at-n">{a.name}</span>
                            <span class="bar"><i style="width:{p.a[a.key]}%; --c:{a.color}"></i></span>
                            <span class="at-v num">{Math.round(p.a[a.key])}</span>
                        </div>
                    {/each}
                </div>
                {#if mine && dev}
                    <div class="devl">
                        <span><b>Lv {p.lv} → {p.lv + 1}</b> {dev.weeks == null ? '' : dev.weeks <= 1 ? 'this week' : `in ~${dev.weeks} weeks`}</span>
                        <span>{#if dev.levels != null}<b>+1 OVR</b> in {dev.levels} level{dev.levels === 1 ? '' : 's'}{dev.weeksToOvr != null ? ` (~${dev.weeksToOvr} weeks)` : ''}{/if}</span>
                        <span class="muted">{dev.week} XP a week · {dev.rate.toLowerCase()} growth · OVR {dev.ovrDelta > 0 ? '+' : ''}{dev.ovrDelta} this season</span>
                    </div>
                {/if}
                {#if mine}
                    <label class="focus">Training focus
                        <select class="sel" value={fa} on:change={(e) => mutate(s => setFocus(s, p.id, e.currentTarget.value))}>
                            <option value="auto">Auto (best for the role)</option>
                            {#each ATTRS as a}<option value={a.key}>{a.name}</option>{/each}
                        </select>
                    </label>
                {/if}
            </section>

            <section class="panel">
                <div class="ph"><h3><Icon name="star" size={14} /> Champions</h3><span class="muted tiny">★ +3 · ◆ +1.5 in the draft</span></div>
                <div class="favs">
                    {#each p.favs || [] as c}
                        {@const tag = metaTag(c, year, step.split || 'spring')}
                        <span class="fav"><span><span class="star">★</span> {champName(c)}</span>{#if tag}<span class="chip" style="--c:{tag === 'strong' ? '#34d399' : '#f87171'}">{tag} this split</span>{/if}</span>
                    {/each}
                    {#if p.pool && p.pool.length}
                        <div class="pool"><span class="muted tiny">Pool</span>{#each p.pool as c}<span class="pc">◆ {champName(c)}</span>{/each}</div>
                    {/if}
                    {#if p.recent && p.recent.length}
                        <div class="pool"><span class="muted tiny">Last played</span>{#each p.recent as c, i}<span class="pc rc" class:newest={i === 0}>{champName(c)}</span>{/each}</div>
                    {/if}
                </div>
                <div class="ph st-h"><h3><Icon name="ranking" size={14} /> {year} season</h3></div>
                <div class="stats">
                    <div><b class="num">{p.st ? p.st.g : 0}</b><span class="muted tiny">games</span></div>
                    <div><b class="num">{p.st && p.st.g ? Math.round((p.st.w / p.st.g) * 100) : 0}%</b><span class="muted tiny">won</span></div>
                    <div><b class="num">{kda(p)}</b><span class="muted tiny">KDA</span></div>
                    <div><b class="num">{avgRating(p) ? avgRating(p).toFixed(2) : '—'}</b><span class="muted tiny">rating</span></div>
                    <div><b class="num">{p.st ? p.st.mvp : 0}</b><span class="muted tiny">MVPs</span></div>
                    <div><b class="num">{p.car ? p.car.titles || 0 : 0}</b><span class="muted tiny">titles</span></div>
                </div>
                {#if p.car && p.car.awards && p.car.awards.length}<p class="awards"><Icon name="medal" size={13} /> {p.car.awards.join(' · ')}</p>{/if}
            </section>

            <section class="panel act">
                <div class="ph"><h3><Icon name="briefcase" size={14} /> {mine ? 'Manage' : p.team ? 'Transfer' : 'Free agent'}</h3></div>
                {#if mine}
                    <p class="line"><span class="muted">Contract</span> <b class="num">{fmtMoney(p.wage)}/yr until {p.until}</b></p>
                    <p class="cw cw-{cw.tone}">{cw.text}{#if p.status}{' · '}promised: {SQUAD_STATUS.find(x => x.id === p.status)?.name || p.status}{/if}{#if p.listed}{' · '}on the transfer list{/if}</p>
                    <div class="talks">
                        {#each TALKS as t}
                            <button class="btn btn-sm" title={t.blurb} on:click={() => talk(t.id)} disabled={p.talked === year * 100 + s.time.step}><Icon name={t.icon} size={13} /> {t.name}</button>
                        {/each}
                    </div>
                    <p class="muted tiny">One talk a week per player. {TALKS.find(t => t.id === 'demand').blurb}</p>
                {:else}
                    {#if !scouted && scoutRank < 3}
                        <button class="btn btn-sm" on:click={scout}><Icon name="search" size={13} /> Scout potential ({scoutCost(s) ? fmtMoney(scoutCost(s)) : 'free'})</button>
                    {/if}
                    <p class="line"><span class="muted">Wage he asks of you</span> <b class="num">{fmtMoney(wage)}/yr</b></p>
                    {#if p.team}
                        <p class="line"><span class="muted">Asking price</span> <b class="num">{fmtMoney(ask)}</b> <span class="muted tiny">(value {fmtMoney(marketValue(p, year))})</span></p>
                        <label class="fee">Your offer
                            <input class="inp num" type="number" min="0" step="5000" bind:value={fee} />
                        </label>
                        {#if emergency && !check}<p class="emerg"><Icon name="alert" size={13} /> The window is closed. This would be your <b>emergency signing</b> for {year} ({emergencyLeft(s)} left), at a {Math.round((EMERGENCY_PREMIUM - 1) * 100)}% premium and no haggling.</p>{/if}
                        {#if check}<p class="why"><Icon name="alert" size={13} /> {check}</p>{/if}
                        <button class="btn btn-p" disabled={!!check} on:click={bid}><Icon name="coins" size={14} /> {emergency ? 'Emergency signing' : 'Make the offer'}</button>
                    {:else}
                        <label class="fee">Contract
                            <select class="sel" bind:value={years}><option value={1}>Until {year}</option><option value={2}>Until {year + 1}</option><option value={3}>Until {year + 2}</option></select>
                        </label>
                        {#if p.prospectFor && p.prospectFor === (me && me.id)}<p class="good tiny">Your academy prospect: held for you through the preseason.</p>{/if}
                        {#if check}<p class="why"><Icon name="alert" size={13} /> {check}</p>{/if}
                        <button class="btn btn-p" disabled={!!check} on:click={sign}><Icon name="check" size={14} /> Sign him</button>
                    {/if}
                {/if}
            </section>
        </div>

        {#if mine}
            <div class="deal">
                {#if p.until > year}
                <section class="panel neg signed" class:fresh={justSigned}>
                    <div class="ph"><h3><Icon name="check" size={14} /> {justSigned ? 'Signed' : 'Under contract'}</h3><span class="chip" style="--c:#34d399">Until {p.until}</span></div>
                    <div class="sg-big"><Icon name="check" size={26} stroke={2.6} /><span><b class="num">{fmtMoney(p.wage)}</b> a year until the end of {p.until}<br /><span class="muted small">{p.until - year} more season{p.until - year === 1 ? '' : 's'} after this one{p.status && SQUAD_STATUS.find(x => x.id === p.status) ? ` · promised: ${SQUAD_STATUS.find(x => x.id === p.status).name.toLowerCase()}` : ''}</span></span></div>
                    <p class="muted tiny">Talks about a new contract open in the final season of this one{p.until - year === 1 ? `: next year (${p.until})` : ` (${p.until})`}. Until then there is nothing to sign.</p>
                </section>
                {:else}
                <section class="panel neg">
                    <div class="ph"><h3><Icon name="quests" size={14} /> New contract</h3>{#if odds}<span class="chip" style="--c:{odds.chance >= 0.6 ? '#34d399' : odds.chance >= 0.25 ? '#fbbf24' : '#f87171'}">{odds.word}</span>{/if}</div>
                    <p class="ends"><Icon name="alert" size={13} /> His contract ends after {year}. Renew it or let him go before the offseason.</p>
                    {#if odds && odds.block}
                        <p class="why"><Icon name="alert" size={13} /> {odds.block}</p>
                    {:else}
                        <div class="n-row"><span class="n-l">Length</span>
                            <span class="seg">{#each [1, 2, 3] as n}<button class:on={nYears === n} on:click={() => setYears(n)}>{n} yr · to {year + n}</button>{/each}</span>
                        </div>
                        <div class="n-row"><span class="n-l">Promise</span>
                            <span class="seg">{#each SQUAD_STATUS as st}<button class:on={nStatus === st.id} title={st.blurb} on:click={() => setStatus(st.id)}>{st.name}</button>{/each}</span>
                        </div>
                        <div class="n-row"><span class="n-l">Wage / year</span>
                            <span class="n-w">
                                <input class="inp num" type="number" min="0" step="1000" bind:value={nWage} />
                                <button class="btn btn-sm" on:click={() => (nWage = Math.round(demand * 0.9 / 1000) * 1000)}>−10%</button>
                                <button class="btn btn-sm" on:click={() => (nWage = demand)}>His ask</button>
                                <button class="btn btn-sm" on:click={() => (nWage = Math.round(demand * 1.1 / 1000) * 1000)}>+10%</button>
                            </span>
                        </div>
                        <div class="n-row"><span class="n-l">Signing bonus</span>
                            <span class="seg">{#each bonusOpts as b, i}<button class:on={nBonus === b} on:click={() => (nBonus = b)}>{i === 0 ? 'None' : fmtMoney(b)}</button>{/each}</span>
                        </div>
                        <p class="muted tiny">He asks about <b>{fmtMoney(demand)}</b> a year for {nYears} year{nYears === 1 ? '' : 's'} as a {SQUAD_STATUS.find(x => x.id === nStatus)?.name.toLowerCase()}. Young players want short deals, veterans want long ones; a bonus counts for a little more than the same money in wages. A key player promise makes the bench hurt him more.</p>
                        <div class="n-go">
                            <span class="n-odds"><span class="bar"><i style="width:{Math.round((odds ? odds.chance : 0) * 100)}%; --c:{odds && odds.chance >= 0.6 ? '#34d399' : odds && odds.chance >= 0.25 ? '#fbbf24' : '#f87171'}"></i></span><b class="num">{Math.round((odds ? odds.chance : 0) * 100)}%</b></span>
                            <button class="btn btn-p" disabled={p.negot === year * 100 + s.time.step} on:click={offer}><Icon name="check" size={14} /> Offer the contract</button>
                        </div>
                        {#if p.negot === year * 100 + s.time.step}<p class="muted tiny">He turned you down this week. Try again next week.</p>{/if}
                    {/if}
                </section>
                {/if}
                <section class="panel neg">
                    <div class="ph"><h3><Icon name="trade" size={14} /> Move him on</h3></div>
                    {#if p.listed}
                        <p class="line"><span class="muted">On the transfer list at</span> <b class="num">{fmtMoney(p.listed)}</b></p>
                        <p class="muted tiny">Clubs that can use him make offers {windowOpen(s) ? 'during this window' : 'when the next window opens'}. Offers are on the Transfers screen.</p>
                        <button class="btn btn-sm" on:click={unlist}><Icon name="close" size={13} /> Take him off the list</button>
                    {:else}
                        <label class="fee">Asking price <input class="inp num" type="number" min="10000" step="5000" bind:value={listPrice} /></label>
                        <p class="muted tiny">Worth about {fmtMoney(marketValue(p, year))}. Ask much more and nobody bites; ask less and clubs compete.</p>
                        <button class="btn btn-sm btn-p" on:click={list}><Icon name="coins" size={13} /> Put him on the transfer list</button>
                    {/if}
                    {#if p.until <= year && p.retiring !== year}
                        {#if p.leaving === year}
                            <p class="cw cw-bad">He leaves as a free agent after {year}.</p>
                            <button class="btn btn-sm" on:click={() => leaveAtEnd(false)}>Undo: try to keep him</button>
                        {:else}
                            <button class="btn btn-sm" on:click={() => leaveAtEnd(true)}><Icon name="flag" size={13} /> Let his contract run out</button>
                        {/if}
                    {/if}
                    <button class="btn btn-sm btn-danger" on:click={doRelease}><Icon name="close" size={13} /> Release now ({fmtMoney(releaseCost(s, p))} payout)</button>
                </section>
            </div>
        {/if}
    </div>
</div>
{/if}

<style>
    .pm { max-width: 1020px; }
    .pm-top { display: flex; gap: 22px; margin-bottom: 16px; flex-wrap: wrap; }
    .pm-card { flex-shrink: 0; }
    .pm-id { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 10px; }
    .nm-row { display: flex; align-items: center; gap: 10px; padding-right: 40px; }
    .nm-row h2 { margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 30px; font-weight: 700; color: #f1f5f9; }
    .flag { font-size: 22px; }
    .rand { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 10px; font-size: 12.5px; font-weight: 700; color: #fcd34d; background: rgba(251, 191, 36, 0.08); border: 1px dashed rgba(251, 191, 36, 0.45); }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tm { gap: 6px; text-transform: none; color: #e2e8f0; }
    .keyrow { display: flex; gap: 8px; flex-wrap: wrap; }
    .kv { display: flex; flex-direction: column; gap: 3px; padding: 8px 11px; border-radius: 11px; background: rgba(2, 6, 23, 0.5); border: 1px solid var(--line); font-size: 11px; }
    .kv b { font-size: 15px; color: #e2e8f0; }
    .kv.lv { min-width: 130px; }
    .big { min-width: 40px; height: 30px; font-size: 16px; }
    .tiny { font-size: 11px; }
    .pers { padding: 11px 13px; border-radius: 12px; background: color-mix(in srgb, var(--c) 8%, rgba(2, 6, 23, 0.5)); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
    .pers-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 15px; font-weight: 700; color: var(--c); margin-right: 8px; }
    .pers-b { font-size: 12.5px; color: #cbd5e1; }
    .pers ul { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: #94a3b8; line-height: 1.6; }
    .pm-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .attrs { display: flex; flex-direction: column; gap: 8px; }
    .at { display: grid; grid-template-columns: 92px 1fr 30px; align-items: center; gap: 8px; font-size: 12.5px; }
    .at-n { color: #cbd5e1; font-weight: 700; }
    .at-v { text-align: right; font-weight: 800; color: #f1f5f9; }
    .focus { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; font-size: 12px; color: #94a3b8; }
    .favs { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .fav { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); font-weight: 700; color: #e2e8f0; font-size: 13px; }
    .st-h { margin: 6px 0 8px; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .stats div { display: flex; flex-direction: column; gap: 1px; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .stats b { font-size: 15px; color: #e2e8f0; }
    .awards { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #c4b5fd; margin: 10px 0 0; }
    .act { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
    .line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0; font-size: 12.5px; }
    .line b { color: #e2e8f0; }
    .talks, .row2 { display: flex; gap: 6px; flex-wrap: wrap; }
    .fee { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; color: #94a3b8; }
    .fee .inp { width: 150px; text-align: right; }
    .why { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 12.5px; color: #fbbf24; line-height: 1.45; }
    .emerg { display: flex; align-items: flex-start; gap: 6px; margin: 0; padding: 8px 10px; border-radius: 9px; font-size: 12.5px; line-height: 1.45; color: #fecaca; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); }
    .emerg b { color: #fff; }
    .star { color: #fbbf24; }
    .pool { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
    .pc { font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 7px; color: #bae6fd; background: rgba(56, 189, 248, 0.12); }
    .pc.rc { color: #ddd6fe; background: rgba(139, 92, 246, 0.14); }
    .pc.newest { color: #fff; background: rgba(139, 92, 246, 0.35); }
    .cw { margin: 0; font-size: 12.5px; font-weight: 700; color: #cbd5e1; }
    .cw-good { color: #6ee7b7; }
    .cw-warn { color: #fbbf24; }
    .cw-bad { color: #fca5a5; }
    .deal { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; }
    .devl { display: flex; flex-direction: column; gap: 3px; margin-top: 12px; padding: 9px 11px; border-radius: 10px; font-size: 12.5px; color: #dbe4f0; background: rgba(16, 185, 129, 0.07); border: 1px solid rgba(52, 211, 153, 0.3); }
    .devl b { color: #fff; }
    .signed { border-color: rgba(52, 211, 153, 0.4); }
    .signed.fresh { border-color: #34d399; box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.4), 0 0 24px rgba(52, 211, 153, 0.15); animation: sgPop 0.4s ease both; }
    @keyframes sgPop { from { transform: scale(0.98); } to { transform: none; } }
    .sg-big { display: flex; align-items: center; gap: 12px; font-size: 14px; color: #dbe4f0; line-height: 1.5; }
    .sg-big :global(.ico) { flex-shrink: 0; color: #34d399; }
    .sg-big b { color: #fff; font-size: 16px; }
    .ends { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12.5px; font-weight: 700; color: #fbbf24; }
    .small { font-size: 12px; }
    .neg { display: flex; flex-direction: column; gap: 9px; }
    .n-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .n-l { width: 96px; font-size: 12px; font-weight: 800; color: #a5b4cf; }
    .n-w { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .n-w .inp { width: 120px; text-align: right; }
    .n-go { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .n-odds { flex: 1; min-width: 140px; display: flex; align-items: center; gap: 8px; }
    .n-odds .bar { flex: 1; height: 8px; }
    .n-odds b { color: #fff; }
    @media (max-width: 900px) { .pm-grid, .deal { grid-template-columns: 1fr; } }
</style>
