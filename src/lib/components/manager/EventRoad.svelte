<script>
    // The year's competitions as the manager stands in them. `compact` is the strip on
    // Home; the full version on Competitions adds how to get in and what each one pays.
    import { manager, mgrScreen } from '../../stores/manager.js';
    import { eventRoad } from '../../manager/engine.js';
    import { fmtMoney } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';

    export let compact = false;

    const LOOK = {
        upcoming: { c: '#64748b', icon: 'clock', word: 'To come' },
        live: { c: '#34d399', icon: 'play', word: 'Now' },
        won: { c: '#fbbf24', icon: 'trophy', word: 'Won' },
        done: { c: '#94a3b8', icon: 'check', word: 'Finished' },
        out: { c: '#f87171', icon: 'close', word: 'Out' },
        missed: { c: '#475569', icon: 'close', word: 'Not in it' },
    };
    $: road = eventRoad($manager);
</script>

{#if compact}
    <button class="strip" on:click={() => mgrScreen.set('league')} title="See every competition of the year">
        {#each road as e (e.id)}
            <span class="st" class:now={e.status === 'live'} style="--c:{LOOK[e.status].c}" title="{e.name}: {e.detail}">
                <i><Icon name={LOOK[e.status].icon} size={11} stroke={2.6} /></i>
                <span class="st-t"><b>{e.short || e.name}</b><span>{e.detail}</span></span>
            </span>
        {/each}
    </button>
{:else}
    <div class="road">
        {#each road as e (e.id)}
            <section class="ev" class:now={e.status === 'live'} style="--c:{LOOK[e.status].c}">
                <div class="ev-h">
                    <span class="ev-i"><Icon name={LOOK[e.status].icon} size={13} stroke={2.6} /></span>
                    <h4>{e.name}</h4>
                    <span class="chip" style="--c:{LOOK[e.status].c}">{LOOK[e.status].word}</span>
                </div>
                <p class="ev-d">{e.detail}</p>
                {#if e.leads && e.leads !== e.detail}<p class="ev-l">{e.leads}</p>{/if}
                {#if e.prizes.length}
                    <ul class="ev-p">
                        {#each e.prizes as [label, money], i (label)}
                            <li class:top={i === 0}><span>{label}</span><b class="num">{fmtMoney(money)}</b></li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/each}
    </div>
{/if}

<style>
    .strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 6px; width: 100%; padding: 0; background: none; border: none; font: inherit; text-align: left; cursor: pointer; }
    .st { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 7px 9px; border-radius: 10px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(71, 85, 105, 0.4); }
    .st.now { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, rgba(15, 23, 42, 0.8)); }
    .st i { flex-shrink: 0; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 6px; font-style: normal; color: #0b1120; background: var(--c); }
    .st-t { display: flex; flex-direction: column; min-width: 0; }
    .st-t b { font-size: 12px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-t span { font-size: 10.5px; color: #a5b4cf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .road { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
    .ev { display: flex; flex-direction: column; gap: 5px; padding: 11px 12px; border-radius: 12px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(71, 85, 105, 0.45); }
    .ev.now { border-color: var(--c); background: color-mix(in srgb, var(--c) 9%, rgba(15, 23, 42, 0.8)); }
    .ev-h { display: flex; align-items: center; gap: 8px; }
    .ev-h h4 { flex: 1; min-width: 0; margin: 0; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 14px; color: #fff; }
    .ev-i { flex-shrink: 0; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; color: #0b1120; background: var(--c); }
    .ev-d { margin: 0; font-size: 13px; font-weight: 600; color: #e2e8f0; }
    .ev-l { margin: 0; font-size: 11.5px; line-height: 1.4; color: #a5b4cf; }
    .ev-p { list-style: none; margin: 4px 0 0; padding: 6px 0 0; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid rgba(71, 85, 105, 0.35); }
    .ev-p li { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: #a5b4cf; }
    .ev-p li.top { color: #fde68a; font-weight: 700; }
    .ev-p b { color: inherit; }
</style>
