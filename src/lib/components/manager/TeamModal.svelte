<script>
    // Any club in the world: its five, its bench, its coach and how it plays.
    import { manager, mgrModal, mgrScreen, mgrHistTeam } from '../../stores/manager.js';
    import { leagueName, scoutReport, isScouted } from '../../manager/engine.js';
    import { ROLE_IDS, TACTIC_BY_ID } from '../../manager/data.js';
    import { lineupOf, teamStrength } from '../../manager/match.js';
    import { ovrOf, ageOf, potentialView } from '../../manager/people.js';
    import { ovrColor, fmtMoney, persona, champName } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    export let id;
    $: s = $manager;
    $: t = s.teams[id];
    $: lu = t ? lineupOf(t, s.players) : {};
    $: five = new Set(ROLE_IDS.map(r => lu[r] && lu[r].id));
    $: bench = t ? t.roster.map(x => s.players[x]).filter(p => p && !five.has(p.id)) : [];
    $: rep = t ? scoutReport(s, t.id) : null;
    $: scoutRank = (s.manager.perks || {}).scout || 0;
    $: mine = t && t.id === s.manager.teamId;

    function close() { mgrModal.set(null); }
    function onKey(e) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

{#if t}
<div class="modal-back" on:click|self={close} role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-label={t.name}>
        <button class="modal-x" on:click={close} aria-label="Close"><Icon name="close" size={16} /></button>
        <div class="tm-top">
            <TeamBadge team={t} size={56} />
            <div>
                <h2>{t.name}{#if mine}<span class="chip" style="--c:#34d399">Your club</span>{/if}{#if !t.real}<span class="chip" style="--c:#fbbf24">Random team</span>{/if}</h2>
                <p class="dim"><RegionIcon region={t.region} size={12} /> {leagueName(t.region, t.tier)} · reputation {t.rep} · coach {t.coach ? `${t.coach.name} (${t.coach.rating})` : 'none'}</p>
            </div>
            <div class="tm-k">
                <span class="muted small">Team OVR</span>
                <span class="ovr big" style="--c:{ovrColor(teamStrength(t, s.players))}">{Math.round(teamStrength(t, s.players))}</span>
            </div>
        </div>
        <button class="btn btn-sm hist" on:click={() => { mgrHistTeam.set(t.id); mgrModal.set(null); mgrScreen.set('history'); }}><Icon name="archive" size={13} /> Club history and legends</button>
        {#if rep && !mine}
            <p class="plan">Usually plays <b style="color:{TACTIC_BY_ID[rep.tactic].color}">{TACTIC_BY_ID[rep.tactic].name}</b>{#if rep.star}{' · '}star player <b>{rep.star.name}</b>{/if}</p>
        {/if}
        <div class="tbl-wrap">
            <table class="tbl">
                <thead><tr><th>Role</th><th>Player</th><th class="c">Age</th><th class="c">OVR</th><th class="c">Pot</th><th>Personality</th><th>Favourites</th><th class="r">Contract</th></tr></thead>
                <tbody>
                    {#each [...ROLE_IDS.map(r => lu[r]).filter(Boolean), ...bench] as p (p.id)}
                        {@const pv = potentialView(p, { scouted: isScouted(s, p), scoutRank })}
                        <tr class="click" on:click={() => mgrModal.set({ kind: 'player', id: p.id })}>
                            <td><span class="rl" class:bench={!five.has(p.id)}>{five.has(p.id) ? ROLE_IDS.find(r => lu[r] && lu[r].id === p.id) : 'SUB'}</span></td>
                            <td><PName {p} /></td>
                            <td class="c num">{ageOf(p, s.time.year)}</td>
                            <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                            <td class="c num dim">{pv.exact ? pv.lo : `${pv.lo}–${pv.hi}`}</td>
                            <td><span class="chip" style="--c:{persona(p).color}">{persona(p).name}</span></td>
                            <td class="dim small">★ {(p.favs || []).map(champName).join(', ')}{#if p.recent && p.recent.length}<span class="rec"> · last {p.recent.slice(0, 2).map(champName).join(', ')}</span>{/if}</td>
                            <td class="r num dim">{fmtMoney(p.wage)} · {p.until}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
</div>
{/if}

<style>
    .tm-top { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; padding-right: 40px; }
    .tm-top > div:nth-child(2) { flex: 1; min-width: 200px; }
    .tm-top h2 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 4px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 22px; color: #f1f5f9; }
    .tm-top p { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12.5px; }
    .tm-k { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .big { min-width: 44px; height: 32px; font-size: 17px; }
    .small { font-size: 12px; }
    .plan { font-size: 13px; color: #cbd5e1; margin: 0 0 12px; }
    .rl { font-size: 10px; font-weight: 900; color: #6ee7b7; }
    .rl.bench { color: #64748b; }
    .rec { color: #7dd3fc; }
    .hist { margin-bottom: 12px; }
</style>
