<script>
    // Cards / Compact switch for match-screen lineups. Writes the matchCardView device preference,
    // so every match screen in every mode follows it.
    import Icon from '../ui/Icon.svelte';
    import { matchCardView } from '../../stores/ui.js';
</script>

<div class="cvt" role="group" aria-label="Lineup view">
    <button class:cvt-on={$matchCardView} aria-pressed={$matchCardView} on:click={() => matchCardView.set(true)} title="Show the full cards"><Icon name="cards" size={12} stroke={2.2} /> Cards</button>
    <button class:cvt-on={!$matchCardView} aria-pressed={!$matchCardView} on:click={() => matchCardView.set(false)} title="Compact player rows"><Icon name="menu" size={12} stroke={2.2} /> Compact</button>
</div>

<style>
    .cvt { display: inline-flex; padding: 2px; border-radius: 10px; background: rgba(2,6,23,0.7); border: 1px solid rgba(71,85,105,0.4); flex-shrink: 0; }
    .cvt button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 8px; border: none; background: none; cursor: pointer; font-size: 10.5px; font-weight: 800; letter-spacing: 0.3px; text-transform: none; color: #64748b; }
    .cvt button:hover { color: #cbd5e1; }
    .cvt .cvt-on { color: #fff; background: rgba(99,102,241,0.35); }
    .cvt button:active { transform: none; }
</style>
