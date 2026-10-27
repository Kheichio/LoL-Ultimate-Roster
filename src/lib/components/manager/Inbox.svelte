<script>
    import { manager, mutate, mgrModal, mgrScreen } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { answerEvent } from '../../manager/engine.js';
    import { CALENDAR } from '../../manager/data.js';
    import { msgKind } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';

    $: s = $manager;
    let selId = null;
    let filter = 'all';
    const FILTERS = [
        ['all', 'All', null],
        ['decide', 'Decisions', (m) => m.options && !m.answered],
        ['unread', 'Unread', (m) => !m.read],
        ['squad', 'Squad & contracts', (m) => ['squad', 'contract', 'prospect'].includes(m.kind)],
        ['offer', 'Transfers', (m) => m.kind === 'offer'],
        ['board', 'Board', (m) => ['board', 'job', 'level'].includes(m.kind)],
        ['wins', 'Titles & achievements', (m) => ['title', 'achievement'].includes(m.kind)],
    ];
    $: pending = s.inbox.filter(m => m.options && !m.answered);
    $: fn = (FILTERS.find(f => f[0] === filter) || FILTERS[0])[2];
    // Decisions waiting always sit at the top.
    $: list = [...pending, ...s.inbox.filter(m => !(m.options && !m.answered))].filter(m => !fn || fn(m));
    $: sel = list.find(m => m.id === selId) || list[0] || null;
    $: if (sel && !sel.read) markRead(sel.id);
    $: count = (f) => (f[2] ? s.inbox.filter(f[2]).length : s.inbox.length);

    function markRead(id) {
        mutate(s => { const m = s.inbox.find(x => x.id === id); if (m) m.read = true; });
    }
    function answer(opt) {
        const r = mutate(s => answerEvent(s, sel.id, opt));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 3500);
    }
    function readAll() {
        mutate(s => { for (const m of s.inbox) m.read = true; });
    }
</script>

<div class="ib">
    <div class="top">
        <div>
            <h1 class="page-h">Inbox</h1>
            <p class="page-sub">The board, your players, other clubs. Decisions stay at the top until you answer them, and the calendar waits for them.</p>
        </div>
        <button class="btn btn-sm" on:click={readAll}><Icon name="check" size={13} /> Mark all read</button>
    </div>
    <div class="filters">
        {#each FILTERS as f}
            {@const n = count(f)}
            <button class:on={filter === f[0]} class:hot={f[0] === 'decide' && n > 0} on:click={() => { filter = f[0]; selId = null; }}>{f[1]}{#if f[0] !== 'all' && n}<span class="fn">{n}</span>{/if}</button>
        {/each}
    </div>
    <div class="split">
        <ul class="list panel">
            {#each list as m (m.id)}
                {@const k = msgKind(m.kind)}
                <li>
                    <button class="it" class:on={sel && sel.id === m.id} class:unread={!m.read} class:decide={m.options && !m.answered} style="--k:{k.color}" on:click={() => (selId = m.id)}>
                        <span class="it-ico"><Icon name={k.icon} size={16} /></span>
                        <span class="it-t">{m.title}</span>
                        {#if m.options && !m.answered}<span class="chip" style="--c:#f472b6">Decide</span>{:else if !m.read}<span class="dot"></span>{/if}
                        <span class="it-w">{k.label} · {m.y} · {(CALENDAR[m.s] || {}).short || ''}</span>
                    </button>
                </li>
            {:else}
                <li class="empty">Nothing here.</li>
            {/each}
        </ul>
        <div class="read panel" style="--k:{sel ? msgKind(sel.kind).color : '#94a3b8'}">
            {#if sel}
                {@const k = msgKind(sel.kind)}
                <div class="r-h">
                    <span class="r-k"><span class="r-ico"><Icon name={k.icon} size={18} /></span> {k.label}</span>
                    <h2>{sel.title}</h2>
                    <span class="muted small">{sel.y} · {(CALENDAR[sel.s] || {}).name || ''}</span>
                </div>
                <p class="body">{sel.body}</p>
                {#if sel.options}
                    {#if sel.answered}
                        <p class="done"><Icon name="check" size={15} /> You chose: {sel.options.find(o => o.id === sel.answered)?.label}</p>
                    {:else}
                        <div class="opts">
                            {#each sel.options as o}
                                <button class="opt" on:click={() => answer(o.id)}>
                                    <b>{o.label}</b>
                                    {#if o.hint}<span class="small">{o.hint}</span>{/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                {/if}
                <div class="links">
                    {#if sel.pid && s.players[sel.pid]}
                        <button class="btn" on:click={() => mgrModal.set({ kind: 'player', id: sel.pid })}><Icon name="user" size={14} /> View {s.players[sel.pid].name}</button>
                    {/if}
                    {#if sel.kind === 'offer'}
                        <button class="btn" on:click={() => mgrScreen.set('transfers')}><Icon name="trade" size={14} /> Go to Transfers</button>
                    {/if}
                    {#if sel.kind === 'contract'}
                        <button class="btn" on:click={() => mgrScreen.set('squad')}><Icon name="quests" size={14} /> Decide contracts</button>
                    {/if}
                    {#if sel.kind === 'job' || sel.kind === 'level' || (sel.kind === 'achievement' && /perk point/.test(sel.body))}
                        <button class="btn" on:click={() => mgrScreen.set('club')}><Icon name="briefcase" size={14} /> Go to the Club screen</button>
                    {/if}
                    {#if sel.kind === 'achievement' || sel.kind === 'title'}
                        <button class="btn" on:click={() => mgrScreen.set('trophies')}><Icon name="trophy" size={14} /> Trophy cabinet</button>
                    {/if}
                </div>
            {:else}
                <div class="empty">No messages.</div>
            {/if}
        </div>
    </div>
</div>

<style>
    .ib { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .filters button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 700; color: #a5b4cf; background: rgba(15, 23, 42, 0.65); border: 1px solid var(--line); cursor: pointer; }
    .filters button.on { color: #022c1c; background: #34d399; border-color: #34d399; }
    .filters button.hot:not(.on) { color: #fbcfe8; border-color: #f472b6; }
    .fn { font-size: 10.5px; font-weight: 900; padding: 1px 6px; border-radius: 999px; color: #0b1120; background: #fbbf24; }
    .split { display: grid; grid-template-columns: minmax(270px, 400px) minmax(0, 1fr); gap: 14px; align-items: start; }
    .list { list-style: none; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 3px; max-height: 72vh; overflow-y: auto; }
    .it { width: 100%; display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto auto; column-gap: 10px; row-gap: 2px; align-items: center; padding: 10px; border-radius: 11px; border: 1px solid transparent; background: none; cursor: pointer; text-align: left; font-family: inherit; color: #a5b4cf; }
    .it-ico { grid-row: 1 / span 2; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; color: var(--k); background: color-mix(in srgb, var(--k) 13%, transparent); }
    .it-t { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .it-w { grid-column: 2 / span 2; font-size: 11px; color: #64748b; }
    .it.unread { color: #fff; font-weight: 700; background: color-mix(in srgb, var(--k) 7%, transparent); }
    .it.decide { border-color: rgba(244, 114, 182, 0.45); }
    .it.on { background: rgba(16, 185, 129, 0.12); border-color: rgba(52, 211, 153, 0.45); }
    .it:hover:not(.on) { background: rgba(51, 65, 85, 0.3); }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--k); }
    .read { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; border-top: 4px solid var(--k); }
    .r-h { display: flex; flex-direction: column; gap: 6px; }
    .r-k { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--k); }
    .r-ico { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; color: #0b1120; background: var(--k); }
    .r-h h2 { margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 23px; color: #fff; }
    .small { font-size: 12.5px; }
    .body { white-space: pre-line; font-size: 15px; line-height: 1.7; color: #e2e8f0; margin: 0; }
    .opts { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .opt { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 13px 15px; border-radius: 12px; cursor: pointer; font-family: inherit; text-align: left; color: #fff; background: rgba(2, 6, 23, 0.55); border: 1px solid rgba(71, 85, 105, 0.55); }
    .opt b { font-size: 14.5px; }
    .opt span { color: #a5b4cf; }
    .opt:hover { border-color: #34d399; background: rgba(16, 185, 129, 0.08); }
    .done { display: flex; align-items: center; gap: 7px; color: #6ee7b7; font-weight: 700; margin: 0; }
    .links { display: flex; gap: 8px; flex-wrap: wrap; }
    @media (max-width: 800px) { .split { grid-template-columns: 1fr; } .list { max-height: 320px; } }
</style>
