<script>
    // The club's commercial side: what brands think of it (appeal), the four
    // sponsor slots, pitching for the empty ones, the offers on the table and how
    // each deal's goal is going.
    import { manager, mutate } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { myTeam, objectiveMet } from '../../manager/engine.js';
    import { SPONSOR_SLOTS, SPONSOR_SLOT_BY_ID, SPONSOR_PITCHES_PER_WEEK, SPONSOR_BASE_SHARE, STEPS_PER_YEAR } from '../../manager/data.js';
    import { sponsorAppeal, pitchChance, pitchesLeft, pitchSponsor, acceptSponsor, declineSponsor, dropSponsor, dealIncome, baseRevenue, ensureSponsors } from '../../manager/sponsors.js';
    import { fmtMoney } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: sp = s.sponsors || { deals: [], offers: [], log: [] };
    $: appeal = team ? sponsorAppeal(s) : { value: 0, parts: [] };
    $: left = team ? pitchesLeft(s) : 0;
    $: base = team ? baseRevenue(s, team) : 0;
    $: deals = dealIncome(s);
    $: year = s.time.year;
    $: word = appeal.value >= 0.75 ? ['Brands are queuing up', '#34d399'] : appeal.value >= 0.55 ? ['Brands are interested', '#a3e635'] : appeal.value >= 0.35 ? ['Brands are cautious', '#fbbf24'] : ['Brands want results first', '#f87171'];

    function pitch(slotId) {
        const r = mutate(sv => { ensureSponsors(sv); return pitchSponsor(sv, slotId); });
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
    }
    function accept(o) {
        const r = mutate(sv => acceptSponsor(sv, o.id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
    }
    function decline(o) {
        mutate(sv => declineSponsor(sv, o.id));
    }
    function drop(d) {
        openConfirmModal(`End the deal with ${d.brand}? They stop paying at once.`, () => {
            const r = mutate(sv => dropSponsor(sv, d.id));
            if (r) showToast(r.msg, 'info', 3500);
        });
    }
    // How a deal's goal stands right now (the same check the year end uses).
    function goalNow(d) {
        if (!d.goal) return null;
        try { return objectiveMet(s, { id: d.goal.id }); } catch (e) { return null; }
    }
</script>

{#if team}
<div class="sps">
    <div class="top">
        <div>
            <h1 class="page-h">Sponsors</h1>
            <p class="page-sub">Brands pay a club that wins. Pitch for an empty slot, pick the best offer, and meet what the sponsor asks: a met goal pays a bonus at the end of the year, a missed one sends the sponsor away.</p>
        </div>
        <TeamBadge {team} size={48} />
    </div>

    <div class="grid2">
        <section class="panel">
            <div class="ph"><h3><Icon name="trend" size={15} /> Brand appeal</h3><span class="chip" style="--c:{word[1]}">{word[0]}</span></div>
            <div class="appeal"><span class="ring" style="--p:{Math.round(appeal.value * 100)}; --c:{word[1]}"><b>{Math.round(appeal.value * 100)}</b></span>
                <ul class="parts">
                    {#each appeal.parts as p (p.label)}
                        <li><span>{p.label}</span><span class="bar"><i style="width:{Math.min(100, p.value)}%"></i></span><span class="muted tiny">{p.weight}%</span></li>
                    {/each}
                </ul>
            </div>
            <p class="muted small">Appeal decides whether a pitch lands and how much the offers are worth. Win games, finish high and lift trophies; a second-tier club is worth a fifth less to a brand.</p>
        </section>

        <section class="panel">
            <div class="ph"><h3><Icon name="coins" size={15} /> Commercial income</h3><b class="num good">{fmtMoney(base + deals)}<span class="muted small"> / year</span></b></div>
            <div class="fin">
                <div><span class="muted small">Base revenue</span><b class="num">{fmtMoney(base)}</b><span class="muted tiny">Streaming, merchandise and the league's share</span></div>
                <div><span class="muted small">Sponsor deals</span><b class="num">{fmtMoney(deals)}</b><span class="muted tiny">{sp.deals.length} of {SPONSOR_SLOTS.length} slots filled</span></div>
                <div><span class="muted small">Per week</span><b class="num">{fmtMoney((base + deals) / STEPS_PER_YEAR)}</b></div>
                <div><span class="muted small">Pitches left this week</span><b class="num">{left} / {SPONSOR_PITCHES_PER_WEEK}</b></div>
            </div>
        </section>
    </div>

    <div class="slots">
        {#each SPONSOR_SLOTS as slot (slot.id)}
            {@const d = sp.deals.find(x => x.slot === slot.id)}
            {@const offers = sp.offers.filter(o => o.slot === slot.id)}
            <section class="panel slot" class:filled={!!d}>
                <div class="ph"><h3><Icon name={slot.icon} size={15} /> {slot.name}</h3>{#if d}<span class="chip" style="--c:#34d399">Signed</span>{:else}<span class="chip" style="--c:#94a3b8">Empty</span>{/if}</div>
                {#if d}
                    {@const now = goalNow(d)}
                    <div class="deal">
                        <b class="brand">{d.brand}</b>
                        <span class="num big">{fmtMoney(d.value)}<span class="muted small"> / year</span></span>
                        <span class="muted small">{d.until <= year ? `Ends after ${d.until}` : `Until the end of ${d.until}`}{d.legacy ? ' · came with the club' : ''}</span>
                        {#if d.goal}
                            <div class="goal" class:ok={now === true}>
                                <Icon name={now ? 'check' : 'target'} size={13} />
                                <span>{d.goal.text}{d.bonus ? ` · ${fmtMoney(d.bonus)} bonus` : ''}</span>
                                <span class="muted tiny">{now ? 'on track' : 'not yet'}</span>
                            </div>
                        {:else}<p class="muted tiny">No goal: a deal the club already had.</p>{/if}
                        <button class="btn btn-sm" on:click={() => drop(d)}>End the deal</button>
                    </div>
                {:else}
                    <p class="muted small">{slot.blurb}</p>
                    {#if offers.length}
                        <div class="offers">
                            {#each offers as o (o.id)}
                                <div class="offer" class:inb={o.inbound}>
                                    <div class="o-top"><b>{o.brand}</b>{#if o.inbound}<span class="chip" style="--c:#fbbf24">They came to you</span>{/if}</div>
                                    <span class="num">{fmtMoney(o.value)} a year · {o.years} year{o.years === 1 ? '' : 's'}</span>
                                    <span class="goal-t"><Icon name="target" size={12} /> {o.goal.text}{o.bonus ? ` · ${fmtMoney(o.bonus)} bonus` : ''}</span>
                                    <div class="o-btns">
                                        <button class="btn btn-sm btn-p" on:click={() => accept(o)}><Icon name="check" size={12} stroke={2.6} /> Sign</button>
                                        <button class="btn btn-sm" on:click={() => decline(o)}>Decline</button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        <p class="muted tiny">Offers stay on the table for two weeks.</p>
                    {:else}
                        <button class="btn btn-p" disabled={left <= 0} on:click={() => pitch(slot.id)}><Icon name="chat" size={14} /> Pitch to brands · {Math.round(pitchChance(s, slot.id) * 100)}% chance</button>
                    {/if}
                {/if}
            </section>
        {/each}
    </div>

    {#if sp.log && sp.log.length}
        <section class="panel">
            <div class="ph"><h3><Icon name="archive" size={15} /> Past years</h3></div>
            <ul class="log">
                {#each sp.log as l, i (i)}
                    <li class:good={l.kind === 'bonus'} class:bad={l.kind === 'left'}><span class="muted num">{l.y}</span><b>{l.brand}</b><span>{l.text}</span></li>
                {/each}
            </ul>
        </section>
    {/if}
    <p class="muted small">Base revenue is {Math.round(SPONSOR_BASE_SHARE * 100)}% of what the club's name is worth on the market; the rest has to be earned from sponsors. The board's wage limit does not depend on the deals you land.</p>
</div>
{:else}
    <div class="panel empty">You need a club to sign sponsors.</div>
{/if}

<style>
    .sps { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
    .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .small { font-size: 12.5px; }
    .tiny { font-size: 11px; }
    .appeal { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
    .ring { flex-shrink: 0; width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--c) calc(var(--p) * 1%), rgba(51, 65, 85, 0.5) 0); }
    .ring b { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: #0b1220; color: #fff; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; }
    .parts { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
    .parts li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 34px; gap: 8px; align-items: center; }
    .bar { height: 6px; border-radius: 4px; background: rgba(51, 65, 85, 0.6); overflow: hidden; }
    .bar i { display: block; height: 100%; background: #fbbf24; }
    .fin { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .fin > div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.4); }
    .slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .slot.filled { border-color: rgba(52, 211, 153, 0.35); }
    .deal { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .brand { font-size: 18px; color: #fff; }
    .big { font-size: 20px; font-weight: 800; color: #fde68a; }
    .goal { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 9px; font-size: 13px; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(251, 191, 36, 0.35); color: #fde68a; }
    .goal.ok { border-color: rgba(52, 211, 153, 0.5); color: #6ee7b7; }
    .offers { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
    .offer { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 11px; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(51, 65, 85, 0.55); }
    .offer.inb { border-color: rgba(251, 191, 36, 0.55); }
    .o-top { display: flex; align-items: center; gap: 8px; color: #fff; }
    .goal-t { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #fde68a; }
    .o-btns { display: flex; gap: 6px; margin-top: 4px; }
    .log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
    .log li { display: flex; gap: 10px; align-items: baseline; }
    .log li.good b { color: #6ee7b7; }
    .log li.bad b { color: #f87171; }
    @media (max-width: 860px) { .grid2, .slots { grid-template-columns: 1fr; } }
</style>
