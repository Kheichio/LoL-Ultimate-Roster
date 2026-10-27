<script>
    // The trophy cabinet: every title the manager has won, by kind, and every
    // achievement with how many times it was done and when.
    import { manager } from '../../stores/manager.js';
    import { myTeam } from '../../manager/engine.js';
    import { ACHIEVEMENTS } from '../../manager/data.js';
    import { TROPHY_META } from '../../manager/ui.js';
    import Icon from '../ui/Icon.svelte';

    $: s = $manager;
    $: m = s.manager;
    $: team = myTeam(s);
    $: trophies = (m.trophies || []).slice().reverse();
    $: byKind = ['worlds', 'msi', 'league', 'tier2', 'promotion'].map(k => ({ k, meta: TROPHY_META[k], list: trophies.filter(t => t.kind === k) }));
    $: ach = m.ach || {};
    $: unlocked = ACHIEVEMENTS.filter(a => ach[a.id]).length;
    $: seasons = Math.max(1, s.time.year - s.time.startYear + (s.time.step > 0 ? 1 : 0));
    $: winRate = m.wins + m.losses ? Math.round((m.wins / (m.wins + m.losses)) * 100) : 0;
    $: clubs = new Set([...(m.history || []).map(h => h.teamId), ...(team ? [team.id] : [])]).size;
    $: bestWorlds = (s.history || []).filter(h => h.me && h.me.worlds).map(h => h.me.worlds).sort((a, b) => a - b)[0] || null;

    /** Progress toward a counted achievement, for the bar on its card. */
    function progress(a) {
        if (a.id === 'dynasty') return { cur: (m.trophies || []).filter(t => t.kind === 'worlds').length, max: 3 };
        if (a.id === 'centurion') return { cur: m.wins || 0, max: 100 };
        if (a.id === 'loyal') return { cur: team ? s.time.year - (m.joined || s.time.year) + 1 : 0, max: 5 };
        return null;
    }
    const placeWord = (p) => (p === 1 ? 'Champions' : p === 2 ? 'Final' : p <= 4 ? 'Semifinal' : p <= 8 ? 'Quarterfinal' : 'Round of 16');
</script>

<div class="tr">
    <div class="top">
        <div>
            <h1 class="page-h">Trophy cabinet</h1>
            <p class="page-sub">Everything {m.name} has won since {s.time.startYear}, and every achievement along the way. Many achievements give a perk point the first time.</p>
        </div>
    </div>

    <section class="totals">
        <div class="tt big"><Icon name="trophy" size={26} /><b class="num">{m.trophies ? m.trophies.filter(t => t.kind !== 'promotion').length : 0}</b><span>Titles</span></div>
        {#each byKind as g}
            <div class="tt" style="--c:{g.meta.color}"><Icon name={g.meta.icon} size={20} /><b class="num">{g.list.length}</b><span>{g.meta.short}</span></div>
        {/each}
        <div class="tt" style="--c:#a78bfa"><Icon name="medal" size={20} /><b class="num">{unlocked}/{ACHIEVEMENTS.length}</b><span>Achievements</span></div>
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="trophy" size={15} /> The shelf</h3><span class="muted small">{trophies.length} item{trophies.length === 1 ? '' : 's'}</span></div>
        {#if trophies.length}
            <div class="shelf">
                {#each trophies as t, i (i)}
                    {@const meta = TROPHY_META[t.kind] || TROPHY_META.league}
                    <div class="cup" style="--c:{meta.color}">
                        <span class="cup-ico"><Icon name={meta.icon} size={30} stroke={1.7} /></span>
                        <b>{t.name}</b>
                        <span class="cup-s">{t.teamName || ''}{t.teamName ? ' · ' : ''}{t.year}</span>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="empty-shelf">
                <Icon name="trophy" size={40} stroke={1.4} />
                <p>The cabinet is empty. Win a split, an MSI or a Worlds and it goes here.</p>
            </div>
        {/if}
    </section>

    <section class="panel">
        <div class="ph"><h3><Icon name="medal" size={15} /> Achievements</h3><span class="muted small">{unlocked} of {ACHIEVEMENTS.length} unlocked</span></div>
        <div class="achs">
            {#each ACHIEVEMENTS as a (a.id)}
                {@const got = ach[a.id]}
                {@const pr = progress(a)}
                <div class="ach" class:got={!!got}>
                    <span class="a-ico"><Icon name={a.icon} size={20} stroke={2} /></span>
                    <div class="a-t">
                        <span class="a-n">{a.name}{#if got && got.n > 1}<span class="a-x">×{got.n}</span>{/if}</span>
                        <span class="a-d">{a.desc}</span>
                        {#if got}
                            <span class="a-w">First in {got.first}{got.n > 1 ? ` · last in ${got.years[got.years.length - 1]}` : ''}{#if got.last}{' · '}{got.last}{/if}</span>
                        {:else if pr}
                            <span class="a-p"><span class="bar"><i style="width:{Math.min(100, (pr.cur / pr.max) * 100)}%; --c:#a78bfa"></i></span><span class="num">{Math.min(pr.cur, pr.max)}/{pr.max}</span></span>
                        {/if}
                    </div>
                    {#if a.point}<span class="a-pt" class:spent={!!got} title="Worth a perk point the first time">+1</span>{/if}
                </div>
            {/each}
        </div>
    </section>

    <div class="two">
        <section class="panel">
            <div class="ph"><h3><Icon name="ranking" size={15} /> Records</h3></div>
            <div class="recs">
                <div><span class="muted small">Series record</span><b class="num">{m.wins}–{m.losses}</b></div>
                <div><span class="muted small">Win rate</span><b class="num">{winRate}%</b></div>
                <div><span class="muted small">Seasons</span><b class="num">{seasons}</b></div>
                <div><span class="muted small">Clubs managed</span><b class="num">{clubs}</b></div>
                <div><span class="muted small">Best Worlds</span><b>{bestWorlds ? placeWord(bestWorlds) : '—'}</b></div>
                <div><span class="muted small">Sackings</span><b class="num">{m.sacked}</b></div>
            </div>
        </section>
        <section class="panel">
            <div class="ph"><h3><Icon name="archive" size={15} /> Season by season</h3></div>
            {#if (s.history || []).some(h => h.me)}
                <ul class="seasons">
                    {#each s.history.slice().reverse().filter(h => h.me) as h (h.year)}
                        <li>
                            <span class="sy num">{h.year}</span>
                            <span class="sn">{h.me.teamName}</span>
                            <span class="muted small">{h.me.spring ? `Spring ${h.me.spring}` : ''}{h.me.summer ? ` · Summer ${h.me.summer}` : ''}{h.me.msi ? ` · MSI ${placeWord(h.me.msi)}` : ''}{h.me.worlds ? ` · Worlds ${placeWord(h.me.worlds)}` : ''}</span>
                        </li>
                    {/each}
                </ul>
            {:else}<div class="empty">No season finished yet.</div>{/if}
        </section>
    </div>
</div>

<style>
    .tr { display: flex; flex-direction: column; gap: 14px; }
    .top { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .small { font-size: 12.5px; }
    .totals { display: grid; grid-template-columns: 1.3fr repeat(6, minmax(0, 1fr)); gap: 10px; }
    .tt { --c: #fbbf24; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px; border-radius: 15px; text-align: center; background: radial-gradient(90% 80% at 50% 0%, color-mix(in srgb, var(--c) 16%, transparent), transparent 70%), rgba(15, 23, 42, 0.7); border: 1px solid color-mix(in srgb, var(--c) 35%, var(--line)); color: var(--c); }
    .tt b { font-family: 'Space Grotesk', 'Quicksand', sans-serif; font-size: 26px; color: #fff; line-height: 1; }
    .tt span { font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #a5b4cf; }
    .tt.big { --c: #facc15; }
    .tt.big b { font-size: 36px; }
    .shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
    .cup { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 10px 14px; border-radius: 14px; text-align: center; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 14%, rgba(2, 6, 23, 0.6)), rgba(2, 6, 23, 0.6)); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--c) 40%, transparent); }
    .cup-ico { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 50%; color: var(--c); background: radial-gradient(circle, color-mix(in srgb, var(--c) 30%, transparent), transparent 70%); filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c) 50%, transparent)); }
    .cup b { font-size: 13.5px; color: #fff; line-height: 1.3; }
    .cup-s { font-size: 11.5px; color: #a5b4cf; }
    .empty-shelf { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px; color: #475569; text-align: center; }
    .empty-shelf p { margin: 0; color: #8193ad; font-size: 13.5px; }
    .achs { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
    .ach { position: relative; display: flex; gap: 11px; padding: 12px; border-radius: 13px; background: rgba(2, 6, 23, 0.45); border: 1px solid rgba(51, 65, 85, 0.45); opacity: 0.7; }
    .ach.got { opacity: 1; background: linear-gradient(135deg, rgba(167, 139, 250, 0.14), rgba(2, 6, 23, 0.5)); border-color: rgba(167, 139, 250, 0.55); }
    .a-ico { width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; border-radius: 12px; color: #64748b; background: rgba(51, 65, 85, 0.4); }
    .got .a-ico { color: #1e1033; background: #c4b5fd; box-shadow: 0 0 14px rgba(196, 181, 253, 0.4); }
    .a-t { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .a-n { display: flex; align-items: center; gap: 7px; font-weight: 800; color: #fff; font-size: 14px; }
    .a-x { font-size: 12px; padding: 1px 7px; border-radius: 999px; color: #1e1033; background: #c4b5fd; }
    .a-d { font-size: 12.5px; color: #a5b4cf; line-height: 1.45; }
    .a-w { font-size: 11.5px; color: #c4b5fd; }
    .a-p { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #a5b4cf; }
    .a-p .bar { flex: 1; }
    .a-pt { position: absolute; top: 10px; right: 10px; font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 6px; color: #052e1f; background: #34d399; }
    .a-pt.spent { color: #a5b4cf; background: rgba(148, 163, 184, 0.18); }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 14px; align-items: start; }
    .recs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .recs div { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 11px; background: rgba(2, 6, 23, 0.45); }
    .recs b { font-size: 17px; color: #fff; }
    .seasons { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; max-height: 360px; overflow-y: auto; }
    .seasons li { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 7px 10px; border-radius: 9px; background: rgba(2, 6, 23, 0.4); }
    .sy { font-weight: 900; color: #fde68a; }
    .sn { font-weight: 700; color: #fff; }
    @media (max-width: 1000px) { .totals { grid-template-columns: repeat(4, minmax(0, 1fr)); } .two { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .totals { grid-template-columns: repeat(2, minmax(0, 1fr)); } .recs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
