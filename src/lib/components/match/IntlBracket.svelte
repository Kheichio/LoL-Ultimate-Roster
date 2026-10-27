<script>
    // An international bracket (utils/world.js buildIntlBracket): every round as a column, the
    // rounds not drawn yet as empty slots, your own path lit. Display only — the bracket object
    // is owned by Tournament.svelte and replaced whole by intlRecord().
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';
    import { ME } from '../../utils/league.js';
    import { intlRoundName, intlTeam } from '../../utils/world.js';

    export let bracket;
    export let myName = 'You';
    export let accent = '#f59e0b';

    const safeColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null);
    $: b = bracket && Array.isArray(bracket.rounds) && Array.isArray(bracket.teams) && bracket.size > 1 ? bracket : null;
    $: total = b ? Math.max(b.roundsTotal || 0, b.rounds.length) : 0;
    $: cols = b ? Array.from({ length: total }, (_, r) => {
        const drawn = b.rounds[r];
        return {
            name: drawn ? drawn.name : intlRoundName(b.size, r),
            bo: drawn ? drawn.bo : (r === total - 1 ? 5 : 3),
            ties: drawn ? drawn.ties : Array.from({ length: Math.max(1, b.size / Math.pow(2, r + 1)) }, () => null),
        };
    }) : [];
    const side = (br, id) => {
        const t = id ? intlTeam(br, id) : null;
        return t ? { ...t, name: id === ME ? myName : t.name } : null;
    };
    $: champ = b && b.champion ? side(b, b.champion) : null;
</script>

{#if b}
    <section class="ib" style="--acc: {accent};" aria-label="Tournament bracket">
        <div class="ib-head">
            <span class="ib-title"><Icon name="ranking" size={14} stroke={2.2} /> Bracket</span>
            <span class="ib-note">{b.size} teams · single elimination · only your series is played, the rest are simulated</span>
        </div>
        <div class="ib-scroll">
            <div class="ib-grid" style="--cols: {cols.length};">
                {#each cols as col}
                    <div class="ib-col">
                        <span class="ib-h">{col.name}<em>Bo{col.bo}</em></span>
                        <div class="ib-ties">
                            {#each col.ties as tie}
                                {#if tie}
                                    {@const A = side(b, tie.a)}
                                    {@const B = side(b, tie.b)}
                                    <div class="ib-tie" class:ib-mine={tie.a === ME || tie.b === ME}>
                                        {#each [[A, tie.sa, tie.sb], [B, tie.sb, tie.sa]] as [T, s, o]}
                                            <div class="ib-t" class:ib-win={s !== null && s > o} class:ib-lose={s !== null && s < o} class:ib-me={T && T.id === ME}>
                                                <span class="ib-seed">{T ? T.seed : ''}</span>
                                                <span class="ib-reg" title={T ? T.region : ''}>{#if T}<RegionIcon region={T.region} size={11} mono />{/if}</span>
                                                <span class="ib-name">{#if T && safeColor(T.accent)}<span class="ib-dot" style="--oc: {safeColor(T.accent)};"></span>{/if}{T ? T.name : 'TBD'}{#if T && T.tag === 'BOSS'}<span class="ib-tag ib-boss">Boss</span>{:else if T && T.tag === 'HARD'}<span class="ib-tag ib-hard">Hard</span>{/if}</span>
                                                <span class="ib-s">{s ?? ''}</span>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    <div class="ib-tie ib-tbd"><div class="ib-t"><span class="ib-name">TBD</span></div><div class="ib-t"><span class="ib-name">TBD</span></div></div>
                                {/if}
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
        {#if champ}
            <div class="ib-champ" class:ib-champ-me={champ.id === ME}><Icon name="trophy" size={15} /> {champ.name} {champ.id === ME ? 'are the champions' : 'won the title'}</div>
        {/if}
    </section>
{/if}

<style>
    .ib { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 20px; background: rgba(10,14,26,0.6); border: 1px solid rgba(71,85,105,0.25); min-width: 0; }
    .ib-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .ib-title { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: var(--acc); }
    .ib-note { font-size: 11px; color: #64748b; }
    .ib-scroll { overflow-x: auto; padding-bottom: 4px; }
    .ib-grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(170px, 1fr)); gap: 14px; min-width: calc(var(--cols) * 184px); }
    .ib-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .ib-h { display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; padding: 0 2px; }
    .ib-h em { font-style: normal; color: #475569; letter-spacing: 0.5px; }
    .ib-ties { flex: 1; display: flex; flex-direction: column; justify-content: space-around; gap: 8px; }
    .ib-tie { border-radius: 11px; overflow: hidden; background: rgba(2,6,23,0.55); border: 1px solid rgba(71,85,105,0.3); }
    .ib-mine { border-color: color-mix(in srgb, var(--acc) 65%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 14%, transparent); }
    .ib-tbd { opacity: 0.45; border-style: dashed; }
    .ib-t { display: grid; grid-template-columns: 18px 16px minmax(0, 1fr) 16px; align-items: center; gap: 6px; padding: 6px 8px; font-size: 12px; color: #cbd5e1; }
    .ib-t + .ib-t { border-top: 1px solid rgba(51,65,85,0.45); }
    .ib-tbd .ib-t { grid-template-columns: 1fr; color: #64748b; }
    .ib-seed { font-size: 10px; font-weight: 800; color: #475569; text-align: right; font-variant-numeric: tabular-nums; }
    .ib-reg { display: flex; align-items: center; justify-content: center; color: #64748b; }
    .ib-name { font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ib-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; background: var(--oc); }
    .ib-tag { margin-left: 5px; font-size: 8px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; padding: 1px 5px; border-radius: 5px; vertical-align: 1px; }
    .ib-hard { color: #fbbf24; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); }
    .ib-boss { color: #fca5a5; background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.45); }
    .ib-s { font-weight: 900; text-align: right; font-variant-numeric: tabular-nums; color: #94a3b8; }
    .ib-win .ib-name, .ib-win .ib-s { color: #f1f5f9; }
    .ib-win .ib-s { color: #34d399; }
    .ib-lose { opacity: 0.5; }
    .ib-me { background: color-mix(in srgb, var(--acc) 14%, transparent); }
    .ib-me .ib-name { color: #fff; }
    .ib-champ { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 900; color: #fde68a; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.35); }
    .ib-champ-me { color: #1c1404; background: linear-gradient(135deg, #fde68a, #f59e0b); border-color: transparent; }
</style>
