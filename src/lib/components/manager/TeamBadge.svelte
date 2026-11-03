<script>
    // A team's colour square with its tag, or its emblem. `size` is the height in px.
    // Random teams always show an emblem (stable per team id); a founded club shows
    // the one the manager picked; real orgs show their tag until real logos exist.
    import { TEAM_EMBLEMS, TEAM_EMBLEM_BY_ID } from '../../manager/data.js';
    export let team;
    export let size = 28;
    // Card tags are usually 2-4 letters, but a few are whole words ("Vitality",
    // "SANDBOX"); those show as three capitals so the badge stays a badge.
    $: label = team ? (String(team.short).length <= 5 ? team.short : String(team.short).slice(0, 3).toUpperCase()) : '';
    $: emblem = team ? emblemOf(team) : null;
    function emblemOf(t) {
        if (t.emblem && TEAM_EMBLEM_BY_ID[t.emblem]) return TEAM_EMBLEM_BY_ID[t.emblem];
        if (t.real || t.custom || !t.id) return null;
        let h = 0;
        for (const ch of String(t.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return TEAM_EMBLEMS[h % TEAM_EMBLEMS.length];
    }
</script>

{#if team}
    <span class="tb" class:tb-rand={!team.real} class:tb-em={!!emblem} style="--c:{team.color}; --s:{size}px; font-size:{Math.max(8, Math.round(size * 0.34))}px" title="{team.name}{team.real ? '' : ' (random team)'}">
        {#if emblem}<svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} aria-hidden="true"><path d={emblem.d} fill="currentColor" fill-rule="evenodd" /></svg>{:else}{label}{/if}
    </span>
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
    .tb-em { padding: 0; width: var(--s); color: color-mix(in srgb, var(--c) 55%, #ffffff); }
    .tb-em svg { display: block; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45)); }
    .tb-rand { border-style: dashed; }
</style>
