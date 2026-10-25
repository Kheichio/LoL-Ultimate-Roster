<script>
    // A region's league logo (data/regionIcons.js), used wherever a region or a team's league is
    // shown, in both gamemodes. `size` is the HEIGHT in px; the width follows the logo's own
    // proportions, capped at 1.5x so a very wide wordmark does not dwarf the text next to it.
    //
    //   mono      draw it in the surrounding text colour (a mask) instead of its brand colours —
    //             used on cards and coloured backgrounds. Black artwork (LCK, CBLOL) is always mono.
    //   fallback  shown when a region has no logo (Legacy, the amateur circuit): usually the flag.
    //   label     makes it a labelled image; without one it is decorative, because every caller
    //             prints the league name beside it.
    //
    // The brand-colour form is an <img> on purpose: light mode inverts the page and re-inverts
    // images (global.css), so an <img> keeps its colours while a background-image would not.
    import { regionIconFor } from '../../data/regionIcons.js';

    export let region;
    export let size = 14;
    export let mono = false;
    export let fallback = '';
    export let label = '';

    $: info = regionIconFor(region);
    $: width = info ? Math.round(size * Math.min(info.ratio, 1.5) * 10) / 10 : 0;
    $: maskOnly = !!info && (mono || info.mono);
</script>

{#if info && maskOnly}
    <span
        class="ri ri-mask"
        style="--src: url('{info.src}'); width: {width}px; height: {size}px;"
        role={label ? 'img' : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : 'true'}
        title={label || info.name}
    ></span>
{:else if info}
    <img
        class="ri"
        src={info.src}
        alt={label || ''}
        aria-hidden={label ? undefined : 'true'}
        title={label || info.name}
        style="width: {width}px; height: {size}px;"
        draggable="false"
    >
{:else if fallback}
    <span class="ri-fb" aria-hidden="true">{fallback}</span>
{/if}

<style>
    .ri { display: inline-block; flex-shrink: 0; vertical-align: middle; object-fit: contain; }
    .ri-mask {
        background: currentColor;
        -webkit-mask: var(--src) center / contain no-repeat;
        mask: var(--src) center / contain no-repeat;
    }
    .ri-fb { line-height: 1; }
</style>
