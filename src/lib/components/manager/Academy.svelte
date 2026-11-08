<script>
    // The academy: every prospect the club owns, and everyone out on (or in on) loan.
    import { manager, mutate, mgrScreen } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { myTeam } from '../../manager/engine.js';
    import { ACADEMY_LEVELS, academyLevel, academyIds, academyCost, academyUpkeep, buildAcademy, fromAcademy, releaseAcademy } from '../../manager/academy.js';
    import { windowOpen } from '../../manager/market.js';
    import { ovrOf, ageOf, playStyleOf, persOf } from '../../manager/people.js';
    import { fmtMoney, ovrColor } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';
    import PName from './PName.svelte';
    import TeamBadge from './TeamBadge.svelte';

    $: s = $manager;
    $: team = myTeam(s);
    $: year = s.time.year;
    $: lv = team ? academyLevel(team) : 0;
    $: spec = ACADEMY_LEVELS[lv] || ACADEMY_LEVELS[1];
    $: next = ACADEMY_LEVELS[lv + 1] || null;
    $: players = team ? academyIds(s, team).map(id => s.players[id]).sort((a, b) => ovrOf(b) - ovrOf(a)) : [];
    $: out = team ? Object.values(s.players).filter(p => p.loanFrom === team.id) : [];
    $: inn = team ? team.roster.map(id => s.players[id]).filter(p => p && p.loanFrom) : [];
    $: open = windowOpen(s);
    $: rec = team && team.acaRec && team.acaRec.y === year ? team.acaRec : null;

    function run(fn) {
        const r = mutate(fn);
        if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
    }
</script>

{#if team}
<div class="ac">
    <div class="top">
        <div>
            <h1 class="page-h">Academy</h1>
            <p class="page-sub">Where every prospect at the club lives: a pro who debuts through your organisation, the yearly intake and anyone your scouts bring in. They sit outside the ten-man squad.</p>
        </div>
        <button class="btn" on:click={() => mgrScreen.set('scouting')}><Icon name="search" size={13} /> Find prospects</button>
    </div>

    <div class="grid">
        <section class="panel">
            <div class="ph"><h3><Icon name="academy" size={15} /> {spec.name}</h3><span class="chip" style="--c:#a78bfa">Level {lv}</span></div>
            <div class="kv">
                <div><span class="muted small">Places</span><b class="num">{players.length}/{spec.slots}</b></div>
                <div><span class="muted small">XP a week</span><b class="num">{spec.xp}</b></div>
                <div><span class="muted small">Intake a year</span><b class="num">{spec.intake}</b></div>
                <div><span class="muted small">Upkeep a year</span><b class="num">{fmtMoney(academyUpkeep(s))}</b></div>
                {#if rec}<div><span class="muted small">Academy record</span><b class="num">{rec.w}-{rec.l}</b></div>{/if}
            </div>
            {#if next}
                <button class="btn btn-sm btn-p" disabled={academyCost(s) > s.finance.balance} on:click={() => run(sv => buildAcademy(sv))}><Icon name="upgrade" size={12} /> Upgrade to {next.name} · {fmtMoney(academyCost(s))}</button>
                <p class="muted small">{next.slots} places, {next.xp} XP a week, {next.intake} prospect{next.intake === 1 ? '' : 's'} a year.</p>
            {:else}<span class="chip" style="--c:#34d399">Fully built</span>{/if}
        </section>

        <section class="panel wide">
            <div class="ph"><h3><Icon name="squad" size={15} /> Prospects</h3><span class="chip" style="--c:{open ? '#34d399' : '#fbbf24'}">{open ? 'Window open: you can move players' : 'Moves wait for the next window'}</span></div>
            {#if players.length}
                <div class="tbl-wrap">
                    <table class="tbl">
                        <thead><tr><th>Player</th><th>Style</th><th>Personality</th><th class="c">Age</th><th class="c">OVR</th><th class="c">Potential</th><th></th></tr></thead>
                        <tbody>
                            {#each players as p (p.id)}
                                <tr>
                                    <td><PName {p} /> <span class="dim">{p.role}</span></td>
                                    <td class="dim small">{playStyleOf(p).name}</td>
                                    <td class="dim small">{persOf(p).name}</td>
                                    <td class="c num">{ageOf(p, year)}</td>
                                    <td class="c"><span class="ovr" style="--c:{ovrColor(ovrOf(p))}">{ovrOf(p)}</span></td>
                                    <td class="c num">{p.pot}</td>
                                    <td class="r"><span class="acts"><button class="btn btn-sm btn-p" disabled={!open} on:click={() => run(sv => fromAcademy(sv, p.id))}>Call up</button><button class="btn btn-sm" on:click={() => openConfirmModal(`Release ${p.name} from the academy?`, () => run(sv => releaseAcademy(sv, p.id)))}>Release</button></span></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}<p class="muted small">Empty. A player of 21 or under can be sent down from his profile in a window, and a new intake arrives every year.</p>{/if}
        </section>
    </div>

    {#if out.length || inn.length}
        <section class="panel">
            <div class="ph"><h3><Icon name="trade" size={15} /> Loans</h3></div>
            <ul class="loans">
                {#each out as p (p.id)}<li><span class="chip" style="--c:#38bdf8">Out</span><PName {p} /><span class="muted small">{p.role} at</span>{#if s.teams[p.team]}<span class="trow"><TeamBadge team={s.teams[p.team]} size={18} /> {s.teams[p.team].name}</span>{/if}<span class="muted small">· {p.st ? p.st.g : 0} games · back at the offseason</span></li>{/each}
                {#each inn as p (p.id)}<li><span class="chip" style="--c:#fbbf24">In</span><PName {p} /><span class="muted small">{p.role}, from</span>{#if s.teams[p.loanFrom]}<span class="trow"><TeamBadge team={s.teams[p.loanFrom]} size={18} /> {s.teams[p.loanFrom].name}</span>{/if}<span class="muted small">· goes back at the offseason</span></li>{/each}
            </ul>
        </section>
    {/if}
</div>
{:else}
    <div class="panel empty">You need a club.</div>
{/if}

<style>
    .ac { display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .grid { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(0, 2.4fr); gap: 12px; align-items: start; }
    .small { font-size: 12.5px; }
    .kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-bottom: 10px; }
    .kv div { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .kv b { font-size: 15px; color: #f1f5f9; }
    .acts { display: inline-flex; gap: 6px; }
    .loans { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .loans li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .trow { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #e2e8f0; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
