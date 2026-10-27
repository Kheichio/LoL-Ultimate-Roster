<script>
    // A knockout bracket, rounds left to right. Ties not drawn yet show as TBD.
    import { mgrModal } from '../../stores/manager.js';
    import TeamBadge from './TeamBadge.svelte';
    export let bracket;
    export let teams;
    export let me = null;

    const ROUND_NAMES = { 16: 'Round of 16', 8: 'Quarterfinals', 4: 'Semifinals', 2: 'Final' };
    $: size = bracket ? bracket.teams.length : 0;
    $: rounds = bracket ? Array.from({ length: Math.log2(size || 1) }, (_, i) => ({
        name: ROUND_NAMES[size / Math.pow(2, i)] || `Round ${i + 1}`,
        ties: bracket.rounds[i] || Array.from({ length: size / Math.pow(2, i + 1) }, () => null),
    })) : [];
</script>

{#if bracket}
    <div class="br">
        {#each rounds as r}
            <div class="col">
                <div class="rn">{r.name}</div>
                <div class="ties">
                    {#each r.ties as tie}
                        <div class="tie" class:mine={tie && (tie.a === me || tie.b === me)}>
                            {#each tie ? [tie.a, tie.b] : [null, null] as id, i}
                                {@const t = id ? teams[id] : null}
                                <button class="row" class:win={tie && tie.winner && tie.winner === id} class:lose={tie && tie.winner && tie.winner !== id} on:click={() => t && mgrModal.set({ kind: 'team', id })} disabled={!t}>
                                    <TeamBadge team={t} size={20} />
                                    <span class="nm">{t ? t.name : 'TBD'}</span>
                                    <span class="sc">{tie && tie.score ? tie.score[i] : ''}</span>
                                </button>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
        {#if bracket.champion}
            <div class="col champ-col">
                <div class="rn">Champion</div>
                <div class="champ"><TeamBadge team={teams[bracket.champion]} size={34} /><b>{teams[bracket.champion].name}</b></div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .br { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 6px; }
    .col { display: flex; flex-direction: column; gap: 8px; min-width: 200px; }
    .rn { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
    .ties { flex: 1; display: flex; flex-direction: column; justify-content: space-around; gap: 10px; }
    .tie { display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; border: 1px solid rgba(51, 65, 85, 0.45); background: rgba(2, 6, 23, 0.45); }
    .tie.mine { border-color: #34d399; box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.3); }
    .row { display: flex; align-items: center; gap: 8px; padding: 6px 9px; border: none; background: none; cursor: pointer; font-family: inherit; text-align: left; color: #cbd5e1; }
    .row + .row { border-top: 1px solid rgba(51, 65, 85, 0.35); }
    .row:disabled { cursor: default; }
    .nm { flex: 1; font-size: 12.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sc { font-weight: 900; font-variant-numeric: tabular-nums; color: #e2e8f0; }
    .win .nm, .win .sc { color: #6ee7b7; }
    .lose { opacity: 0.55; }
    .champ-col { min-width: 170px; justify-content: center; }
    .champ { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; background: rgba(250, 204, 21, 0.08); border: 1px solid rgba(250, 204, 21, 0.4); color: #fde68a; }
</style>
