<script>
    // The year in review, shown once when the offseason step runs.
    import { manager, closeReport } from '../../stores/manager.js';
    import { REGIONS, ROLE_IDS } from '../../manager/data.js';
    import { leagueName } from '../../manager/engine.js';
    import Icon from '../ui/Icon.svelte';
    import RegionIcon from '../ui/RegionIcon.svelte';

    export let report;
    /** The step summary it came with: carries the new-season card for afterwards. */
    export let summary = null;
    $: s = $manager;
    $: h = s.history.find(x => x.year === report.year) || null;
    $: leftWhy = report.leftWhy && report.leftWhy.length ? report.leftWhy : (report.left || []).map(n => ({ name: n, why: 'contract ended' }));
    const name = (id) => (s.teams[id] ? s.teams[id].name : '—');
    function close() { closeReport(summary); }
    function onKey(e) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

<div class="modal-back" on:click|self={close} role="presentation">
    <div class="modal osr" role="dialog" aria-modal="true" aria-label="Season review">
        <button class="modal-x" on:click={close} aria-label="Close"><Icon name="close" size={16} /></button>
        <p class="eyebrow">Season review</p>
        <h2>{report.year} is in the books</h2>

        {#if h}
            <div class="champs">
                <div class="ch gold"><Icon name="crown" size={16} /><span>Worlds</span><b>{name(h.worlds)}</b></div>
                <div class="ch"><Icon name="globe" size={16} /><span>MSI</span><b>{name(h.msi)}</b></div>
            </div>
        {/if}

        {#if report.sacked}
            <div class="verdict bad"><Icon name="alert" size={16} /> The board has sacked you. Pick one of your job offers to carry on.</div>
        {:else if report.owner >= 100}
            <div class="verdict"><b>No board's verdict</b><span class="muted small">{' '}You own the club outright: the year is yours to judge.</span></div>
        {:else if report.objectives.length}
            <div class="verdict">
                <b>The board's verdict</b>
                <ul>
                    {#each report.objectives as o}
                        <li class:good={o.met} class:bad={!o.met}><Icon name={o.met ? 'check' : 'close'} size={13} stroke={2.6} /> {o.text}</li>
                    {/each}
                </ul>
                <span class="muted small">Board confidence is now {Math.round(s.board.confidence)}%.</span>
            </div>
        {/if}

        {#if report.awards}
            <div class="sec">
                <div class="sec-h"><Icon name="medal" size={14} /> Players of the Year</div>
                <div class="awards">
                    {#each REGIONS as r}
                        {@const a = report.awards[r.id]}
                        <div class="aw"><RegionIcon region={r.id} size={12} /> <span class="muted">{r.league}</span> <b>{a && a.mvp ? a.mvp.name : '—'}</b></div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if report.promoted && report.promoted.length}
            <div class="sec">
                <div class="sec-h"><Icon name="upgrade" size={14} /> Promotion and relegation</div>
                <ul class="mv">
                    {#each report.promoted as m}
                        <li><span class="good">↑ {name(m.up)}</span> · <span class="bad">↓ {name(m.down)}</span> <span class="muted">({leagueName(m.region, 1)})</span></li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if leftWhy.length}
            <div class="sec">
                <div class="sec-h"><Icon name="briefcase" size={14} /> Left your club</div>
                <ul class="why">{#each leftWhy as l}<li><b>{l.name}</b> <span class="muted">· {l.why}</span></li>{/each}</ul>
            </div>
        {/if}
        {#if report.retired.length}
            <div class="sec"><div class="sec-h"><Icon name="clock" size={14} /> Retired</div><p>{report.retired.slice(0, 30).join(', ')}{report.retired.length > 30 ? ` and ${report.retired.length - 30} more` : ''}</p></div>
        {/if}
        {#if report.debuts.length}
            <div class="sec"><div class="sec-h"><Icon name="sparkle" size={14} /> Rookies arriving in {report.year + 1}</div><p>{report.debuts.slice(0, 30).join(', ')}{report.debuts.length > 30 ? ` and ${report.debuts.length - 30} more` : ''}</p></div>
        {/if}
        {#if report.offers.length && !report.sacked}
            <div class="sec"><div class="sec-h"><Icon name="briefcase" size={14} /> Job offers</div><p>{report.offers.map(name).join(', ')} want you. See the Club screen.</p></div>
        {/if}

        <div class="btns"><button class="btn btn-p" on:click={close}>{s.jobless ? 'See job offers' : `Into the ${report.year + 1} preseason`} <Icon name="arrow" size={14} stroke={2.4} /></button></div>
    </div>
</div>

<style>
    .osr { max-width: 760px; }
    .eyebrow { font-size: 10px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #34d399; margin: 0 0 4px; }
    h2 { margin: 0 0 14px; font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 26px; color: #f1f5f9; }
    .champs { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .ch { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 12px; background: rgba(2, 6, 23, 0.5); border: 1px solid var(--line); color: #cbd5e1; }
    .ch b { color: #f1f5f9; }
    .ch.gold { color: #fde68a; border-color: rgba(250, 204, 21, 0.4); }
    .verdict { padding: 12px 14px; border-radius: 12px; background: rgba(2, 6, 23, 0.5); border: 1px solid var(--line); margin-bottom: 14px; }
    .verdict.bad { display: flex; align-items: center; gap: 8px; color: #fca5a5; border-color: rgba(239, 68, 68, 0.45); font-weight: 700; }
    .verdict ul { list-style: none; margin: 8px 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font-size: 13.5px; }
    .verdict li { display: flex; align-items: center; gap: 7px; }
    .small { font-size: 12px; }
    .sec { margin-bottom: 12px; }
    .sec-h { display: flex; align-items: center; gap: 7px; font-size: 10.5px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #8aa0c4; margin-bottom: 6px; }
    .sec p { margin: 0; font-size: 13px; line-height: 1.6; color: #cbd5e1; }
    .awards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; }
    .aw { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 6px 9px; border-radius: 9px; background: rgba(2, 6, 23, 0.45); }
    .aw b { color: #f1f5f9; }
    .mv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
    .why { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; color: #e2e8f0; }
    .btns { display: flex; justify-content: flex-end; margin-top: 10px; }
</style>
