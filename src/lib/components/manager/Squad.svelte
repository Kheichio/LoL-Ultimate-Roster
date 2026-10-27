<script>
    import { manager, mutate, mgrModal } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { myTeam, setLineup, autoLineup, isScouted, undecidedContracts, currentStep } from '../../manager/engine.js';
    import { ROLE_IDS, ROLE_BY_ID, XP_PER_LEVEL, SQUAD_STATUS_BY_ID } from '../../manager/data.js';
    import { lineupOf, teamStrength, OFF_ROLE_PENALTY } from '../../manager/match.js';
    import { ovrOf, ovrAs, ageOf, potentialView } from '../../manager/people.js';
    import { renewalDemand, letContractRun, renewContract, renewAllExpiring, renewalBlock } from '../../manager/market.js';
    import { ovrColor, fmtMoney, moraleWord, formWord, persona, champName, contractWord } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';
    import PName from './PName.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: year = s.time.year;
    $: roster = team ? team.roster.map(id => s.players[id]).filter(Boolean) : [];
    $: expiring = roster.filter(p => p.until <= year);
    $: undecided = team ? undecidedContracts(s) : [];
    $: atDeadline = currentStep(s).kind === 'offseason';
    function letGo(p, v = true) {
        const r = mutate(s => letContractRun(s, p.id, v));
        if (r) showToast(r.msg, 'info', 3500);
    }
    function renew(p) {
        const r = mutate(s => renewContract(s, p.id));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4500);
    }
    function renewAll() {
        const r = mutate(s => renewAllExpiring(s));
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 6000);
    }
    $: lu = team ? lineupOf(team, s.players) : {};
    $: five = new Set(ROLE_IDS.map(r => lu[r] && lu[r].id));
    $: scoutRank = (s.manager.perks || {}).scout || 0;
    let sort = 'role';
    $: sorted = roster.slice().sort((a, b) => {
        if (sort === 'ovr') return ovrOf(b) - ovrOf(a);
        if (sort === 'age') return ageOf(a, year) - ageOf(b, year);
        if (sort === 'pot') return b.pot - a.pot;
        if (sort === 'morale') return (a.mor || 0) - (b.mor || 0);
        return ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role) || ovrOf(b) - ovrOf(a);
    });

    function seat(role, pid) {
        mutate(s => setLineup(s, role, pid));
    }
    function auto() {
        mutate(s => autoLineup(s));
    }
    // The roster is passed in so a signing or a sale refreshes the dropdowns.
    function candidates(role, roster) {
        return roster.slice().sort((a, b) => (b.role === role) - (a.role === role) || ovrAs(b, role) - ovrAs(a, role));
    }
    function seatValue(p, role) {
        return ovrAs(p, role) - (p.roles.includes(role) || p.role === role ? 0 : OFF_ROLE_PENALTY);
    }
</script>

{#if team}
<div class="sq">
    <div class="top">
        <div>
            <h1 class="page-h">Squad</h1>
            <p class="page-sub">Pick the five who play. A player out of his role plays {OFF_ROLE_PENALTY} under his rating; changing the lineup costs a little chemistry, keeping it builds it.</p>
        </div>
        <div class="top-r">
            <div class="str"><span class="muted">Team OVR</span><span class="ovr" style="--c:{ovrColor(teamStrength(team, s.players))}">{Math.round(teamStrength(team, s.players))}</span></div>
            <div class="str"><span class="muted">Chemistry</span><b class="num">{Math.round(team.chem)}</b></div>
            <button class="btn" on:click={auto}><Icon name="sparkle" size={14} /> Best five</button>
        </div>
    </div>

    {#if expiring.length}
        <section class="panel contracts" class:urgent={atDeadline && undecided.length}>
            <div class="ph">
                <h3><Icon name="quests" size={15} /> Contracts ending after {year}</h3>
                <span class="small" class:warn={undecided.length} class:good={!undecided.length}>{undecided.length ? `${undecided.length} to decide${atDeadline ? ': the offseason waits for you' : ' before the offseason'}` : 'All decided'}</span>
                {#if undecided.length > 1}<button class="btn btn-sm btn-p" on:click={renewAll}><Icon name="check" size={12} stroke={2.6} /> Renew all at their asks</button>{/if}
            </div>
            <div class="c-list">
                {#each expiring as p (p.id)}
                    <div class="c-row">
                        <span class="rl">{p.role}</span>
                        <PName {p} />
                        <span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span>
                        <span class="muted small">age {ageOf(p, year)} · {fmtMoney(p.wage)}/yr now</span>
                        {#if p.retiring === year}
                            <span class="chip" style="--c:#f87171">Retiring after {year}</span>
                        {:else if p.leaving === year}
                            <span class="chip" style="--c:#f87171">Leaving after {year}</span>
                            <button class="btn btn-sm" on:click={() => letGo(p, false)}>Undo</button>
                        {:else}
                            {@const blk = renewalBlock(s, p)}
                            <span class="c-ask small">asks ~{fmtMoney(renewalDemand(s, p, 2, p.status || 'regular'))}/yr for 2 years</span>
                            {#if blk}<span class="chip" style="--c:#f87171" title={blk}>Won't talk</span>{:else}<button class="btn btn-sm btn-p" on:click={() => renew(p)}><Icon name="check" size={12} stroke={2.6} /> Renew</button>{/if}
                            <button class="btn btn-sm" on:click={() => mgrModal.set({ kind: 'player', id: p.id })}>Negotiate</button>
                            <button class="btn btn-sm btn-danger" on:click={() => letGo(p)}>Let go</button>
                        {/if}
                    </div>
                {/each}
            </div>
            <p class="muted small">A player you do not renew leaves as a free agent when the year ends. The offseason will not start until every one of these is decided, so nobody leaves without you knowing.</p>
        </section>
    {/if}

    <div class="seats">
        {#each ROLE_IDS as role}
            {@const p = lu[role]}
            <div class="seat" style="--rc:{ROLE_BY_ID[role].accent}">
                <div class="seat-h">
                    <img class="role-ico" src={ROLE_BY_ID[role].icon} alt="" />
                    <span>{ROLE_BY_ID[role].name}</span>
                </div>
                {#if p}
                    <button class="seat-p" on:click={() => mgrModal.set({ kind: 'player', id: p.id })}>
                        <span class="ovr big-ovr" style="--c:{ovrColor(seatValue(p, role))}">{seatValue(p, role)}</span>
                        <span class="seat-n">{p.name}</span>
                        {#if !p.real}<span class="chip" style="--c:#fbbf24">Random</span>{/if}
                        {#if p.role !== role && !p.roles.includes(role)}<span class="chip" style="--c:#f87171">Off-role</span>{/if}
                        <span class="seat-meta">
                            <span style="color:{moraleWord(p.mor).color}">{moraleWord(p.mor).word}</span>
                            <span style="color:{formWord(p.form).color}">{formWord(p.form).arrow} form</span>
                        </span>
                        <span class="seat-favs"><span class="star">★</span> {(p.favs || []).map(champName).join(' · ')}</span>
                        {#if p.recent && p.recent.length}<span class="seat-rec">Last: {p.recent.slice(0, 3).map(champName).join(', ')}</span>{/if}
                    </button>
                {:else}
                    <div class="seat-empty">Empty seat</div>
                {/if}
                <select class="sel" value={p ? p.id : ''} on:change={(e) => seat(role, e.currentTarget.value)}>
                    {#if !p}<option value="" disabled>Choose…</option>{/if}
                    {#each candidates(role, roster) as c (c.id)}
                        <option value={c.id}>{c.name} · {c.role} · {seatValue(c, role)}{five.has(c.id) && c.id !== (p && p.id) ? ' (starting elsewhere)' : ''}</option>
                    {/each}
                </select>
            </div>
        {/each}
    </div>

    <section class="panel">
        <div class="ph">
            <h3><Icon name="squad" size={15} /> Roster · {roster.length} players</h3>
            <div class="seg">
                {#each [['role', 'Role'], ['ovr', 'OVR'], ['pot', 'Potential'], ['age', 'Age'], ['morale', 'Morale']] as [id, lbl]}
                    <button class:on={sort === id} on:click={() => (sort = id)}>{lbl}</button>
                {/each}
            </div>
        </div>
        <div class="tbl-wrap">
            <table class="tbl">
                <thead>
                    <tr><th>Role</th><th>Player</th><th class="c">Age</th><th class="c">OVR</th><th class="c">Pot</th><th>Level</th><th>Personality</th><th>Morale</th><th>Form</th><th>Contract</th><th></th></tr>
                </thead>
                <tbody>
                    {#each sorted as p (p.id)}
                        {@const pv = potentialView(p, { scouted: true, scoutRank })}
                        {@const cw = contractWord(p, year)}
                        <tr class="click" on:click={() => mgrModal.set({ kind: 'player', id: p.id })}>
                            <td><span class="rl">{p.role}</span></td>
                            <td><PName {p} /></td>
                            <td class="c num">{ageOf(p, year)}</td>
                            <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                            <td class="c num dim">{pv.lo}</td>
                            <td><span class="lv">Lv {p.lv}<span class="bar lvbar"><i style="width:{(p.xp / XP_PER_LEVEL) * 100}%"></i></span></span></td>
                            <td><span class="chip" style="--c:{persona(p).color}">{persona(p).name}</span></td>
                            <td style="color:{moraleWord(p.mor).color}">{moraleWord(p.mor).word}</td>
                            <td style="color:{formWord(p.form).color}">{formWord(p.form).arrow}</td>
                            <td class="num"><span class="cwage">{fmtMoney(p.wage)}</span><span class="cw cw-{cw.tone}">{cw.text}</span></td>
                            <td><span class="sts">{#if five.has(p.id)}<span class="chip" style="--c:#34d399">Starter</span>{:else}<span class="chip">Bench</span>{/if}{#if p.status && SQUAD_STATUS_BY_ID[p.status]}<span class="chip" style="--c:#60a5fa">{SQUAD_STATUS_BY_ID[p.status].name}</span>{/if}{#if p.listed}<span class="chip" style="--c:#fbbf24">Listed</span>{/if}{#if p.retiring === year}<span class="chip" style="--c:#f87171">Retiring</span>{/if}</span></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <p class="muted small">Contracts run to the end of the year shown. Renew from a player's profile, or decide to let him go: the offseason waits until every expiring contract is decided.</p>
    </section>
</div>
{:else}
    <div class="panel empty">You have no club right now. Pick one of your job offers on the Club screen.</div>
{/if}

<style>
    .sq { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .top-r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .str { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 11px; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--line); font-size: 12px; }
    .str b { font-size: 15px; color: #e2e8f0; }
    .seats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .seat { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 15px; background: radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--rc) 14%, transparent), transparent 70%), rgba(15, 23, 42, 0.65); border: 1px solid color-mix(in srgb, var(--rc) 30%, var(--line)); min-width: 0; }
    .seat-h { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: var(--rc); }
    .seat-p { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 0; border: none; background: none; cursor: pointer; text-align: left; font-family: inherit; min-width: 0; }
    .big-ovr { min-width: 44px; height: 34px; font-size: 18px; border-radius: 10px; }
    .seat-n { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 17px; font-weight: 700; color: #f1f5f9; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .seat-p:hover .seat-n { color: #6ee7b7; }
    .seat-meta { display: flex; gap: 10px; font-size: 11.5px; font-weight: 700; }
    .seat-favs { font-size: 11px; color: #8aa0c4; line-height: 1.4; }
    .seat-empty { padding: 20px 0; text-align: center; color: #f87171; font-weight: 700; font-size: 13px; }
    .seat .sel { width: 100%; margin-top: auto; }
    .rl { font-size: 10px; font-weight: 900; color: #8aa0c4; }
    .lv { display: inline-flex; flex-direction: column; gap: 3px; font-size: 12px; font-weight: 700; color: #e2e8f0; min-width: 58px; }
    .lvbar { height: 4px; }
    .small { font-size: 12.5px; margin: 10px 0 0; }
    .star { color: #fbbf24; }
    .seat-rec { font-size: 11px; color: #7dd3fc; line-height: 1.35; }
    .cwage { display: block; color: #f1f5f9; }
    .cw { display: block; font-size: 11px; font-weight: 700; color: #a5b4cf; white-space: nowrap; }
    .cw-good { color: #6ee7b7; }
    .cw-warn { color: #fbbf24; }
    .cw-bad { color: #fca5a5; }
    .sts { display: inline-flex; gap: 4px; flex-wrap: wrap; }
    .contracts { border-color: rgba(251, 146, 60, 0.5); background: linear-gradient(180deg, rgba(251, 146, 60, 0.07), var(--card)); }
    .contracts.urgent { border-color: #fb923c; box-shadow: 0 0 22px rgba(251, 146, 60, 0.18); }
    .contracts .ph .small { margin: 0; font-weight: 800; }
    .c-list { display: flex; flex-direction: column; gap: 5px; }
    .c-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border-radius: 10px; background: rgba(2, 6, 23, 0.45); }
    .c-row .small { margin: 0; }
    .c-ask { margin-left: auto !important; color: #fde68a; font-weight: 700; }
    .c-row .rl { width: 32px; }
    @media (max-width: 1100px) { .seats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .seats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
