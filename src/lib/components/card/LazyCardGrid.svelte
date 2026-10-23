<script>
    // A card grid that mounts its items in chunks, each one only once it scrolls near the
    // viewport. The Archive used to mount every card in a category at once — 813 Card
    // components for LCK alone, each with its own animated box-shadow — which is what made
    // the tab hitch on open. Chunks render straight into ONE grid (no wrapper element), so a
    // revealed chunk flows into the row the previous chunk left half-filled and the layout is
    // identical to a plain {#each}. Only an unrevealed chunk breaks the flow, as a full-width
    // placeholder sized to roughly the rows it will become, and those are always further
    // down the page than anything already on screen.
    //
    // Revealed chunks stay mounted for the life of the component; scrolling back up never
    // re-mounts anything.
    import { onMount } from 'svelte';

    export let items = [];
    export let key = (item) => item.id;
    export let rowsPerChunk = 3;
    /** Chunks mounted synchronously on first render, before any observer has fired. */
    export let eager = 0;
    export let minCol = 170;
    export let gap = 10;
    export let rowHeight = 262;

    let width = 0;
    // Before the grid has been measured, guess a desktop row rather than one card per row —
    // a 1-wide guess would make the first chunk a handful of cards and leave a gap.
    $: perRow = width > 0 ? Math.max(1, Math.floor((width + gap) / (minCol + gap))) : 6;
    $: size = perRow * rowsPerChunk;
    $: chunks = chunkList(items, size);

    let revealed = new Set();
    for (let i = 0; i < eager; i++) revealed.add(i);

    function chunkList(list, n) {
        const out = [];
        for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
        return out;
    }

    function reveal(i) {
        if (revealed.has(i)) return;
        revealed.add(i);
        revealed = revealed;
    }

    // One observer per grid. Each placeholder registers itself with its chunk index.
    let io = null;
    const pending = new Map();
    onMount(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                const i = pending.get(e.target);
                io.unobserve(e.target);
                pending.delete(e.target);
                if (i !== undefined) reveal(i);
            }
        }, { rootMargin: '900px 0px' });
        for (const node of pending.keys()) io.observe(node);
        return () => { io.disconnect(); io = null; };
    });

    function placeholder(node, i) {
        // No IntersectionObserver (SSR harness, ancient browser): just render everything.
        if (typeof IntersectionObserver === 'undefined') { reveal(i); return {}; }
        pending.set(node, i);
        if (io) io.observe(node);
        return {
            update(next) { pending.set(node, next); },
            destroy() { pending.delete(node); if (io) io.unobserve(node); },
        };
    }
</script>

<div class="lazy-grid" bind:clientWidth={width} style="--min-col: {minCol}px; --gap: {gap}px;">
    {#each chunks as chunk, i}
        {#if revealed.has(i)}
            {#each chunk as item (key(item))}
                <slot {item} />
            {/each}
        {:else}
            <div class="lg-ph" style="height: {Math.ceil(chunk.length / perRow) * (rowHeight + gap) - gap}px;" use:placeholder={i}></div>
        {/if}
    {/each}
</div>

<style>
    .lazy-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(var(--min-col), 1fr));
        gap: var(--gap);
        justify-items: center;
    }
    .lg-ph {
        grid-column: 1 / -1;
        width: 100%;
        border-radius: 12px;
        background: repeating-linear-gradient(90deg, rgba(30,41,59,0.18) 0 170px, transparent 170px 180px);
    }
</style>
