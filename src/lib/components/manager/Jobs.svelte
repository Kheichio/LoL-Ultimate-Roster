<script>
    // The job market: your reputation, the offers on the table, and every club looking
    // for a manager. Apply once per opening; a yes becomes an offer you can take.
    import { manager, mutate, mgrScreen } from '../../stores/manager.js';
    import { showToast } from '../../stores/toasts.js';
    import { openConfirmModal } from '../../stores/ui.js';
    import { myTeam, acceptJob, leagueName, ownerStake } from '../../manager/engine.js';
    import { vacancies, weeksLeft, applyChance, applyForJob } from '../../manager/jobs.js';
    import { teamStrength } from '../../manager/match.js';
    import Icon from '../ui/Icon.svelte';
    import TeamBadge from './TeamBadge.svelte';

    $: s = $manager;
    $: m = s.manager;
    $: team = myTeam(s);
    $: offers = (s.jobOffers || []).map(id => s.teams[id]).filter(Boolean);
    $: open = vacancies(s);
    $: owner = team ? ownerStake(s) : 0;
    $: repWord = m.rep >= 80 ? ['World-class', '#facc15'] : m.rep >= 60 ? ['Highly rated', '#34d399'] : m.rep >= 40 ? ['Respected', '#38bdf8'] : m.rep >= 20 ? ['Unproven', '#cbd5e1'] : ['Unknown', '#94a3b8'];

    function take(id) {
        const t = s.teams[id];
        openConfirmModal(`Take the job at ${t.name}? You leave ${team ? team.name : 'nothing'} behind${team ? ' at once' : ''}.`, () => {
            const r = mutate(sv => acceptJob(sv, id));
            if (r) showToast(r.msg, r.ok ? 'success' : 'error', 4000);
        });
    }
    function apply(id) {
        const r = mutate(sv => applyForJob(sv, id));
        if (r) showToast(r.msg, r.ok ? (r.offered ? 'success' : 'info') : 'error', 5000);
    }
    const pct = (x) => `${Math.round(x * 100)}%`;
</script>

<div class="jobs">
    <div>
        <h1 class="page-h">Job market</h1>
        <p class="page-sub">Clubs part with their managers after a bad season, a poor spring, or simply when it is not working. Apply to an opening: the better your reputation against the club's, the likelier a yes. A yes is an offer you can take while the opening lasts.</p>
    </div>

    <div class="grid2">
        <section class="panel">
            <div class="ph"><h3><Icon name="star" size={15} /> Your reputation</h3><span class="chip" style="--c:{repWord[1]}">{repWord[0]}</span></div>
            <div class="rep"><span class="rep-t"><i style="width:{m.rep}%; background:{repWord[1]}"></i></span><b class="num">{Math.round(m.rep)}</b></div>
            <p class="muted small">{m.titles || 0} title{m.titles === 1 ? '' : 's'} · sacked {m.sacked || 0} time{m.sacked === 1 ? '' : 's'}{team ? ` · now at ${team.name}` : ' · out of work'}. Titles, promotions and All-Star picks raise it; a sacking costs 15.</p>
            {#if owner >= 50}<p class="muted small">You own {team.name}: sell your majority stake before you can apply elsewhere, or leave the club from your Profile and keep your share of its profits.</p>{/if}
            <button class="btn btn-sm" on:click={() => mgrScreen.set('profile')}><Icon name="sparkle" size={12} /> Found a club of your own</button>
        </section>
        <section class="panel">
            <div class="ph"><h3><Icon name="briefcase" size={15} /> Offers</h3></div>
            {#if offers.length}
                <ul class="list">{#each offers as t (t.id)}
                    <li><TeamBadge team={t} size={22} /><span class="nm"><b>{t.name}</b><span class="muted small">{leagueName(t.region, t.tier)} · rep {Math.round(t.rep || 0)}</span></span><button class="btn btn-sm btn-p" on:click={() => take(t.id)}>Take the job</button></li>
                {/each}</ul>
            {:else}<p class="muted small">No offers right now. Apply below, or win something and the phone will ring.</p>{/if}
        </section>
    </div>

    <section class="panel">
        <div class="ph"><h3><Icon name="search" size={15} /> Openings</h3><span class="muted small">{open.length} club{open.length === 1 ? '' : 's'} looking</span></div>
        {#if open.length}
            <div class="tbl">
                <div class="tr th"><span>Club</span><span>League</span><span class="c">Rep</span><span class="c">Squad</span><span>Why</span><span class="c">Closes</span><span class="c">Chance</span><span></span></div>
                {#each open as v (v.teamId)}
                    {@const t = s.teams[v.teamId]}
                    <div class="tr">
                        <span class="nm"><TeamBadge team={t} size={20} /><b>{t.name}</b></span>
                        <span class="muted small">{leagueName(t.region, t.tier)}</span>
                        <span class="c num">{Math.round(t.rep || 0)}</span>
                        <span class="c num">{t.roster.length >= 5 ? teamStrength(t, s.players).toFixed(0) : '—'}</span>
                        <span class="muted small">{v.why}</span>
                        <span class="c num">{weeksLeft(s, v)}w</span>
                        <span class="c num">{pct(applyChance(s, v.teamId))}</span>
                        <span class="c">{#if v.offered}<span class="chip" style="--c:#34d399">Offered</span>{:else if v.applied}<span class="chip" style="--c:#94a3b8">Turned down</span>{:else}<button class="btn btn-sm" disabled={owner >= 50} on:click={() => apply(v.teamId)}>Apply</button>{/if}</span>
                    </div>
                {/each}
            </div>
        {:else}<p class="muted small">Nobody is hiring at the moment. Openings appear after the spring, at the end of the season, and now and then mid-split.</p>{/if}
    </section>
</div>

<style>
    .jobs { display: flex; flex-direction: column; gap: 14px; }
    .small { font-size: 12.5px; }
    .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .rep { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .rep-t { flex: 1; height: 8px; border-radius: 5px; background: rgba(51, 65, 85, 0.6); overflow: hidden; }
    .rep-t i { display: block; height: 100%; }
    .rep b { color: #fff; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .list li { display: flex; align-items: center; gap: 10px; }
    .nm { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
    .list .nm { flex-direction: column; align-items: flex-start; gap: 0; }
    .tbl { display: flex; flex-direction: column; gap: 2px; overflow-x: auto; }
    .tr { display: grid; grid-template-columns: minmax(150px, 1.6fr) minmax(110px, 1fr) 50px 60px minmax(120px, 1.2fr) 60px 64px 110px; gap: 8px; align-items: center; padding: 7px 8px; border-radius: 8px; min-width: 760px; }
    .tr:not(.th):hover { background: rgba(30, 41, 59, 0.6); }
    .th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    .c { text-align: center; justify-self: center; }
    @media (max-width: 960px) { .grid2 { grid-template-columns: 1fr; } }
</style>
