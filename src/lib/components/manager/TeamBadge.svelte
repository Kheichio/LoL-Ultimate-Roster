<script>
    // A team's colour square with its tag. `size` is the height in px.
    export let team;
    export let size = 28;
    // Card tags are usually 2-4 letters, but a few are whole words ("Vitality",
    // "SANDBOX"); those show as three capitals so the badge stays a badge.
    $: label = team ? (String(team.short).length <= 5 ? team.short : String(team.short).slice(0, 3).toUpperCase()) : '';
</script>

{#if team}
    <span class="tb" class:tb-rand={!team.real} style="--c:{team.color}; --s:{size}px; font-size:{Math.max(8, Math.round(size * 0.34))}px" title="{team.name}{team.real ? '' : ' (random team)'}">{label}</span>
{:else}
    <span class="tb tb-none" style="--c:#475569; --s:{size}px; font-size:{Math.max(8, Math.round(size * 0.34))}px">—</span>
{/if}

<style>
    .tb {
        flex-shrink: 0;
        display: inline-grid; place-items: center;
        min-width: var(--s); height: var(--s); padding: 0 4px;
        border-radius: calc(var(--s) * 0.28);
        font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-weight: 700; letter-spacing: -0.02em;
        color: #f8fafc;
        background: color-mix(in srgb, var(--c) 34%, rgba(15, 23, 42, 0.92));
        border: 1px solid color-mix(in srgb, var(--c) 60%, transparent);
        white-space: nowrap; overflow: hidden;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .tb-rand { border-style: dashed; }
</style>
