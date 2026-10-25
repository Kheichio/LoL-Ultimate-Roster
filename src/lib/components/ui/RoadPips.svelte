<script>
    // The Golden Road as six pips, one per title of the year in order (utils/league.js GR_STEPS):
    // won steps lit gold, the step a broken road fell at marked red, the rest dim.
    import { GR_STEPS } from '../../utils/league.js';

    export let done = 0;
    export let broken = false;
    export let known = true;   // false: no road data published yet — every pip stays dim
    export let size = 9;

    $: n = Math.max(0, Math.min(GR_STEPS.length, Number(done) || 0));
    $: label = !known ? 'No Golden Road data yet'
        : n >= GR_STEPS.length ? 'Golden Road complete'
        : broken ? `Golden Road broken at ${GR_STEPS[n].label}`
        : `Golden Road ${n}/${GR_STEPS.length} — next: ${GR_STEPS[n].label}`;
</script>

<span class="pips" class:pips-full={known && n >= GR_STEPS.length} role="img" aria-label={label} title={label} style="--s: {size}px;">
    {#each GR_STEPS as step, i (step.key)}
        <span class="pip" class:pip-won={known && i < n} class:pip-lost={known && broken && i === n}></span>
    {/each}
</span>

<style>
    .pips { display: inline-flex; align-items: center; gap: 3px; vertical-align: middle; }
    .pip { width: var(--s); height: var(--s); border-radius: 50%; background: rgba(71,85,105,0.55); border: 1px solid rgba(148,163,184,0.25); flex-shrink: 0; }
    .pip-won { background: #facc15; border-color: #fde68a; box-shadow: 0 0 6px rgba(250,204,21,0.55); }
    .pip-lost { background: #ef4444; border-color: #fca5a5; }
    .pips-full .pip-won { background: linear-gradient(135deg, #fde68a, #f59e0b); }
</style>
