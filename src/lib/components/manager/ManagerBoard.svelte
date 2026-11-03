<script>
    // The public manager board: every signed-in manager's save slots, ranked.
    import { onMount } from 'svelte';
    import { manager, mutate, flushManager } from '../../stores/manager.js';
    import { currentUser } from '../../stores/auth.js';
    import { openSettings } from '../../stores/ui.js';
    import { managerBoardRows, managerBoardState, loadManagerBoard, publishManager } from '../../stores/managerBoard.js';
    import { activeSlot } from '../../utils/storage.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';

    $: s = $manager;
    let field = 'score';
    const SORTS = [['score', 'Overall'], ['worlds', 'Worlds'], ['leagues', 'League titles'], ['level', 'Level']];

    async function refresh() {
        if (s) { flushManager(); await publishManager(s, activeSlot('manager')); }
        await loadManagerBoard(field);
    }
    onMount(() => { if (typeof window !== 'undefined' && window.fbDb) refresh(); });
    function sortBy(f) { field = f; loadManagerBoard(f); }
    function setHidden(v) {
        mutate(sv => { sv.settings = { ...(sv.settings || {}), boardHidden: v }; });
        refresh();
    }
</script>

<div class="mb">
    <div class="top">
        <div>
            <h1 class="page-h">Manager board</h1>
            <p class="page-sub">Every manager who plays signed in is ranked here, one row per save slot: Worlds first, then MSI, league titles, promotions, seasons and level.</p>
        </div>
        <button class="btn" on:click={refresh} disabled={$managerBoardState.loading}><Icon name="trend" size={14} /> {$managerBoardState.loading ? 'Loading…' : 'Refresh'}</button>
    </div>

    <section class="panel me">
        {#if !$currentUser}
            <p><b>You are not signed in</b>, so this save is not on the board. <button class="btn btn-sm btn-p" on:click={() => openSettings('account')}>Sign in</button></p>
        {:else if s}
            <label class="tog"><input type="checkbox" checked={!(s.settings && s.settings.boardHidden)} on:change={(e) => setHidden(!e.currentTarget.checked)} /> <span><b>Show this save on the board</b><br /><span class="muted small">Slot {activeSlot('manager')} as {s.manager.name}. On by default; turn it off to take this save's row down.</span></span></label>
        {/if}
    </section>

    <section class="panel">
        <div class="ph">
            <h3><Icon name="ranking" size={15} /> Ranking</h3>
            <div class="seg">{#each SORTS as [f, l]}<button class:on={field === f} on:click={() => sortBy(f)}>{l}</button>{/each}</div>
        </div>
        {#if $managerBoardState.error}<p class="muted">{$managerBoardState.error}</p>{/if}
        {#if $managerBoardRows.length}
            <div class="tbl-wrap">
                <table class="tbl">
                    <thead><tr><th class="c">#</th><th>Manager</th><th>Club</th><th class="c">Year</th><th class="c">Lv</th><th class="c">Worlds</th><th class="c">MSI</th><th class="c">Leagues</th><th class="c">Up</th><th class="r">Score</th></tr></thead>
                    <tbody>
                        {#each $managerBoardRows as r, i (r.id)}
                            <tr class:mine={r.isMe}>
                                <td class="c num">{i + 1}</td>
                                <td><b>{r.name}</b><span class="muted small"> · {r.displayName}</span></td>
                                <td><span class="club"><span class="sw" style="--c:{r.color}">{r.short}</span>{#if r.region}<RegionIcon region={r.region} size={12} />{/if}{r.team}</span></td>
                                <td class="c num">{r.year}<span class="muted small"> ({r.seasons}y)</span></td>
                                <td class="c num">{r.level}</td>
                                <td class="c num">{r.worlds || '—'}</td>
                                <td class="c num">{r.msi || '—'}</td>
                                <td class="c num">{r.leagues || '—'}</td>
                                <td class="c num">{r.promotions || '—'}</td>
                                <td class="r num"><b>{r.score.toLocaleString()}</b></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else if !$managerBoardState.loading && !$managerBoardState.error}
            <div class="empty">Nobody on the board yet{$currentUser ? '' : ': sign in to be the first'}.</div>
        {/if}
    </section>
</div>

<style>
    .mb { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .small { font-size: 12.5px; }
    .me p { margin: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    tr.mine td { background: rgba(52, 211, 153, 0.08); }
    .club { display: inline-flex; align-items: center; gap: 7px; }
    .sw { display: inline-grid; place-items: center; min-width: 26px; height: 20px; padding: 0 4px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #fff; background: color-mix(in srgb, var(--c) 40%, rgba(15, 23, 42, 0.9)); border: 1px solid color-mix(in srgb, var(--c) 60%, transparent); }
</style>
