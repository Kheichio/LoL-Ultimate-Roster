<script>
    // A player's name, flag and -- for a generated player -- the "Random" chip.
    // Every list in the mode draws names through this, so a random player is
    // never mistaken for a real pro.
    import { mgrModal } from '../../stores/manager.js';
    export let p;
    export let link = true;
    export let chip = true;

    function open(e) {
        if (!link || !p) return;
        e.stopPropagation();
        mgrModal.set({ kind: 'player', id: p.id });
    }
</script>

{#if p}
    <span class="pn">
        {#if link}
            <button class="pn-name" on:click={open}>{p.name}</button>
        {:else}
            <span class="pn-name pn-plain">{p.name}</span>
        {/if}
        {#if p.flag}<span class="pn-flag" aria-hidden="true">{p.flag}</span>{/if}
        {#if chip && !p.real}<span class="pn-rand" title="Random player: generated for this save, not a real pro">Random</span>{/if}
    </span>
{:else}
    <span class="pn pn-gone">—</span>
{/if}

<style>
    .pn { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
    .pn-name {
        font: inherit; font-weight: 700; color: #e8eefb;
        background: none; border: none; padding: 0; cursor: pointer;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    button.pn-name:hover { color: #6ee7b7; text-decoration: underline; text-underline-offset: 2px; }
    .pn-plain { cursor: default; }
    .pn-flag { font-size: 0.95em; line-height: 1; }
    .pn-rand {
        flex-shrink: 0;
        font-size: 9px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;
        padding: 2px 6px; border-radius: 5px;
        color: #fcd34d; background: rgba(251, 191, 36, 0.1); border: 1px dashed rgba(251, 191, 36, 0.45);
    }
    .pn-gone { color: #64748b; }
</style>
