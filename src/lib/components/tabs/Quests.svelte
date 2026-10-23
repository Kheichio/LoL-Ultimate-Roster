<script>
    import Icon from '../ui/Icon.svelte';
    import { pressFx } from '../../utils/fx.js';
    import { blueEssence, trackStats, club, squad, academy, rbcState, battlePass, prestige, collectionRegistry, saveGame, weightedTrophies, managerLevel, questsClaimed, questsRepeatableBaselines, questsRepeatableCounts, achievementsClaimed as achievementsClaimedStore, grantBE } from '../../stores/game.js';
    import { showToast } from '../../stores/toasts.js';
    import { achievementProgress } from '../../stores/badges.js';
    import { playSound } from '../../utils/sound.js';
    import { milestoneQuests, repeatableQuests, achievements } from '../../utils/quests.js';
    import { get } from 'svelte/store';

    $: claimed = $questsClaimed;
    $: repeatableBaselines = $questsRepeatableBaselines;
    $: repeatableCounts = $questsRepeatableCounts;
    $: achievementsClaimed = $achievementsClaimedStore;

    function getProgress(stat) { return $trackStats[stat] || 0; }
    function getRepeatableProgress(q) {
        const base = repeatableBaselines[q.id] || 0;
        return Math.max(0, getProgress(q.stat) - base);
    }

    // Live progress, from the same function the nav badge counts with (stores/badges.js).
    $: achCtx = { squad: $squad, academy: $academy, club: $club, reg: $collectionRegistry, trophies: $weightedTrophies, be: $blueEssence, level: $managerLevel, prestige: $prestige, bp: $battlePass, ts: $trackStats, rbc: $rbcState, now: Date.now() };
    function getAchievementProgress(a, ctx = achCtx) { return achievementProgress(a, ctx); }

    // Compact label so six-figure targets (Blue Essence) still fit the progress column.
    function fmt(n) {
        return n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n);
    }

    function claimMilestone(q) {
        if (claimed[q.id] || getProgress(q.stat) < q.target) return;
        questsClaimed.update(c => ({ ...c, [q.id]: true }));
        const { total: qTotal, bonus: qBonus } = grantBE(q.reward);
        playSound('claim');
        showToast(`Quest complete! +${qTotal} BE${qBonus > 0 ? ` (+${qBonus} Wealth)` : ''}`, 'success');
        saveGame();
    }

    function getRepeatableClaimCount(q) {
        return Math.floor(getRepeatableProgress(q) / q.target);
    }

    function claimRepeatable(q) {
        const times = getRepeatableClaimCount(q);
        if (times <= 0) return;
        const base = repeatableBaselines[q.id] || 0;
        const totalReward = q.reward * times;
        questsRepeatableBaselines.update(b => ({ ...b, [q.id]: base + q.target * times }));
        questsRepeatableCounts.update(c => ({ ...c, [q.id]: (c[q.id] || 0) + times }));
        const { total: rTotal, bonus: rBonus } = grantBE(totalReward);
        playSound('claim');
        showToast(`Contract claimed ×${times}! +${rTotal} BE${rBonus > 0 ? ` (+${rBonus} Wealth)` : ''}`, 'success');
        saveGame();
    }

    function claimAchievement(a) {
        if (achievementsClaimed[a.id] || getAchievementProgress(a) < a.target) return;
        achievementsClaimedStore.update(c => ({ ...c, [a.id]: true }));
        const { total: aTotal, bonus: aBonus } = grantBE(a.reward);
        playSound('claim');
        showToast(`Achievement unlocked! +${aTotal} BE${aBonus > 0 ? ` (+${aBonus} Wealth)` : ''}`, 'success');
        saveGame();
    }

    // Everything ready, across all three tabs, in one press. Same per-item rules as the
    // single claims above; the BE is granted in one go so Wealth applies once to the total.
    function claimAll() {
        const ts = get(trackStats);
        const qc = get(questsClaimed);
        const ac = get(achievementsClaimedStore);
        const rb = get(questsRepeatableBaselines);
        let be = 0, n = 0;
        const newQc = {}, newAc = {}, newRb = {}, newRc = {};
        for (const q of milestoneQuests) {
            if (!qc[q.id] && (ts[q.stat] || 0) >= q.target) { newQc[q.id] = true; be += q.reward; n++; }
        }
        for (const q of repeatableQuests) {
            const base = rb[q.id] || 0;
            const times = Math.floor(Math.max(0, (ts[q.stat] || 0) - base) / q.target);
            if (times > 0) { newRb[q.id] = base + q.target * times; newRc[q.id] = times; be += q.reward * times; n += times; }
        }
        for (const a of achievements) {
            if (!ac[a.id] && getAchievementProgress(a) >= a.target) { newAc[a.id] = true; be += a.reward; n++; }
        }
        if (n === 0) { showToast('Nothing ready to claim yet.', 'info'); return; }
        questsClaimed.update(c => ({ ...c, ...newQc }));
        achievementsClaimedStore.update(c => ({ ...c, ...newAc }));
        questsRepeatableBaselines.update(b => ({ ...b, ...newRb }));
        questsRepeatableCounts.update(c => {
            const out = { ...c };
            for (const [id, t] of Object.entries(newRc)) out[id] = (out[id] || 0) + t;
            return out;
        });
        const { total, bonus } = grantBE(be);
        playSound('rare');
        showToast(`Claimed ${n} reward${n === 1 ? '' : 's'}! +${total.toLocaleString()} BE${bonus > 0 ? ` (+${bonus} Wealth)` : ''}`, 'success');
        saveGame();
    }

    let activeSubTab = 'milestones';
    let filter = 'all';    // all | ready | progress | done

    // A category shows its first few rows — ready ones sort to the top, so nothing
    // claimable is ever hidden — and the rest behind "Show more". Competitive alone is 25
    // rows, which used to push everything else a long scroll down the page.
    const ROWS_SHOWN = 6;
    let expanded = {};
    function toggleCat(id) { expanded = { ...expanded, [id]: !expanded[id] }; }

    // One category list drives all three sub-tabs, so a quest, a contract and an
    // achievement about the same system always sit under the same heading, in the
    // same order.
    const questCategories = [
        { id: 'collection',  label: 'Collection',  icon: 'cards',  c: '#60a5fa' },
        { id: 'squad',       label: 'Squad',       icon: 'squad',  c: '#38bdf8' },
        { id: 'economy',     label: 'Economy',     icon: 'coins',  c: '#34d399' },
        { id: 'competitive', label: 'Competitive', icon: 'swords', c: '#fbbf24' },
        { id: 'challenges',  label: 'Challenges',  icon: 'puzzle', c: '#fb7185' },
        { id: 'progression', label: 'Progression', icon: 'trophy', c: '#c084fc' },
    ];
    const catById = Object.fromEntries(questCategories.map(c => [c.id, c]));

    // Categories a list actually uses — an empty section would render as "0/0".
    function catsFor(list) {
        return questCategories.filter(c => list.some(q => q.cat === c.id));
    }
    const milestoneCats = catsFor(milestoneQuests);
    const contractCats = catsFor(repeatableQuests);
    const achievementCats = catsFor(achievements);

    // Each quest's state in one word, so the filter and the row agree.
    function mState(q) { return claimed[q.id] ? 'done' : getProgress(q.stat) >= q.target ? 'ready' : 'progress'; }
    function aState(a) { return achievementsClaimed[a.id] ? 'done' : getAchievementProgress(a) >= a.target ? 'ready' : 'progress'; }
    function cState(q) { return getRepeatableClaimCount(q) > 0 ? 'ready' : 'progress'; }
    const pass = (state, f) => f === 'all' || state === f;

    $: milestoneView = ((_c, _ts, f) => milestoneCats.map(cat => {
        const all = milestoneQuests.filter(q => q.cat === cat.id);
        const done = all.filter(q => claimed[q.id]).length;
        // Ready first, then in progress (nearest first), then claimed.
        const order = { ready: 0, progress: 1, done: 2 };
        const rows = all
            .map(q => ({ q, state: mState(q), pct: Math.min(1, getProgress(q.stat) / q.target) }))
            .filter(r => pass(r.state, f))
            .sort((a, b) => order[a.state] - order[b.state] || b.pct - a.pct);
        return { cat, rows, done, total: all.length };
    }).filter(g => g.rows.length))(claimed, $trackStats, filter);

    $: contractView = ((_b, _ts, f) => contractCats.map(cat => ({
        cat,
        rows: repeatableQuests.filter(q => q.cat === cat.id).filter(q => pass(cState(q), f === 'done' ? 'none' : f)),
    })).filter(g => g.rows.length))(repeatableBaselines, $trackStats, filter);

    $: achievementView = ((_a, _ctx, f) => achievementCats.map(cat => {
        const all = achievements.filter(a => a.cat === cat.id);
        return { cat, rows: all.filter(a => pass(aState(a), f)), done: all.filter(a => achievementsClaimed[a.id]).length, total: all.length };
    }).filter(g => g.rows.length))(achievementsClaimed, achCtx, filter);

    $: doneMilestones = milestoneQuests.filter(q => claimed[q.id]).length;
    $: doneAchievements = achievements.filter(a => achievementsClaimed[a.id]).length;
    $: totalContracts = Object.values(repeatableCounts).reduce((s, n) => s + (Number(n) || 0), 0);

    $: claimableMilestones = ((_c, _ts) => milestoneQuests.filter(q => mState(q) === 'ready').length)(claimed, $trackStats);
    $: claimableContracts = ((_b, _ts) => repeatableQuests.reduce((n, q) => n + getRepeatableClaimCount(q), 0))(repeatableBaselines, $trackStats);
    $: claimableAchievements = ((_a, _ctx) => achievements.filter(a => aState(a) === 'ready').length)(achievementsClaimed, achCtx);
    $: totalClaimable = claimableMilestones + claimableContracts + claimableAchievements;
    $: readyBE = ((_c, _a, _b, _ts, _ctx) =>
        milestoneQuests.filter(q => mState(q) === 'ready').reduce((s, q) => s + q.reward, 0) +
        repeatableQuests.reduce((s, q) => s + q.reward * getRepeatableClaimCount(q), 0) +
        achievements.filter(a => aState(a) === 'ready').reduce((s, a) => s + a.reward, 0)
    )(claimed, achievementsClaimed, repeatableBaselines, $trackStats, achCtx);

    $: overallDone = doneMilestones + doneAchievements;
    $: overallTotal = milestoneQuests.length + achievements.length;
    $: overallPct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0;

    $: TABS = [
        { id: 'milestones',   label: 'Milestones',   icon: 'flag',   c: '#facc15', note: `${doneMilestones}/${milestoneQuests.length} done`, badge: claimableMilestones },
        { id: 'contracts',    label: 'Contracts',    icon: 'trade',  c: '#22d3ee', note: `${totalContracts} completed`, badge: claimableContracts },
        { id: 'achievements', label: 'Achievements', icon: 'star',   c: '#c084fc', note: `${doneAchievements}/${achievements.length} earned`, badge: claimableAchievements },
    ];
    const FILTERS = [
        { id: 'all', label: 'All' }, { id: 'ready', label: 'Ready' },
        { id: 'progress', label: 'In progress' }, { id: 'done', label: 'Claimed' },
    ];
</script>

<section class="qp">
    <!-- Hero -->
    <header class="qh">
        <div class="qh-ring" style="--pct: {overallPct};">
            <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="ring-bg" cx="60" cy="60" r="52" />
                <circle class="ring-fg" cx="60" cy="60" r="52" style="stroke-dasharray: {overallPct * 3.267} 999;" />
            </svg>
            <span class="qh-pct">{overallPct}%</span>
            <span class="qh-pct-lbl">complete</span>
        </div>
        <div class="qh-text">
            <span class="qh-eyebrow"><Icon name="quests" size={12} stroke={2.2} /> Quests</span>
            <h2 class="qh-title">Quests & Achievements</h2>
            <p class="qh-sub">{overallDone} of {overallTotal} milestones and achievements done · {totalContracts} contracts completed</p>
        </div>
        <div class="qh-claim" class:qh-claim-on={totalClaimable > 0}>
            {#if totalClaimable > 0}
                <span class="qc-label">Ready to claim</span>
                <span class="qc-val"><Icon name="gem" size={16} stroke={2.2} /> {readyBE.toLocaleString()} BE</span>
                <button class="qc-btn" on:click={claimAll} use:pressFx={{ color: 'rgba(255,255,255,0.45)' }}>Claim all · {totalClaimable}</button>
            {:else}
                <span class="qc-label">Nothing ready</span>
                <span class="qc-none">Finish a quest to claim it here</span>
            {/if}
        </div>
    </header>

    <!-- Tabs -->
    <div class="qtabs" role="tablist">
        {#each TABS as t (t.id)}
            <button class="qtab" class:qtab-on={activeSubTab === t.id} style="--c: {t.c};" role="tab" aria-selected={activeSubTab === t.id} on:click={() => { activeSubTab = t.id; if (t.id === 'contracts' && filter === 'done') filter = 'all'; }}>
                <span class="qt-ico"><Icon name={t.icon} size={18} /></span>
                <span class="qt-text"><span class="qt-label">{t.label}</span><span class="qt-note">{t.note}</span></span>
                {#if t.badge > 0}<span class="qt-badge">{t.badge}</span>{/if}
            </button>
        {/each}
    </div>

    <div class="qfilters">
        {#each FILTERS as f}
            {#if !(activeSubTab === 'contracts' && f.id === 'done')}
                <button class="qf" class:qf-on={filter === f.id} on:click={() => filter = f.id}>{f.label}</button>
            {/if}
        {/each}
        {#if activeSubTab === 'contracts'}<span class="qf-hint">Contracts repeat — progress resets after every claim.</span>{/if}
        {#if activeSubTab === 'achievements'}<span class="qf-hint">Live checks — progress follows your current squad, club and stats.</span>{/if}
    </div>

    <!-- MILESTONES -->
    {#if activeSubTab === 'milestones'}
        {#if milestoneView.length === 0}<div class="q-empty">Nothing here for this filter.</div>{/if}
        <div class="cat-grid">
            {#each milestoneView as g (g.cat.id)}
                {@const readyN = g.rows.filter(r => r.state === 'ready').length}
                {@const shownN = expanded[g.cat.id] ? g.rows.length : Math.max(ROWS_SHOWN, readyN)}
                <section class="cat" style="--c: {g.cat.c};">
                    <div class="cat-head">
                        <span class="cat-ico"><Icon name={g.cat.icon} size={17} /></span>
                        <span class="cat-name">{g.cat.label}</span>
                        <span class="cat-count">{g.done}/{g.total}</span>
                        <div class="cat-bar"><div class="cat-fill" style="width: {(g.done / g.total) * 100}%;"></div></div>
                    </div>
                    <div class="rows">
                        {#each g.rows.slice(0, shownN) as r (r.q.id)}
                            {@const progress = getProgress(r.q.stat)}
                            <div class="row row-{r.state}">
                                <span class="row-dot">{#if r.state === 'done'}<Icon name="check" size={12} stroke={3} />{/if}</span>
                                <div class="row-body">
                                    <div class="row-desc">{r.q.desc}</div>
                                    {#if r.state === 'progress'}
                                        <div class="row-bar"><div class="row-fill" style="width: {r.pct * 100}%;"></div></div>
                                    {/if}
                                </div>
                                {#if r.state === 'ready'}
                                    <button class="claim" on:click={() => claimMilestone(r.q)}>Claim <Icon name="gem" size={11} stroke={2.4} /> {r.q.reward.toLocaleString()}</button>
                                {:else if r.state === 'done'}
                                    <span class="row-meta">Claimed</span>
                                {:else}
                                    <span class="row-meta"><b>{fmt(Math.min(progress, r.q.target))}</b>/{fmt(r.q.target)} · <Icon name="gem" size={10} /> {r.q.reward.toLocaleString()}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    {#if g.rows.length > shownN || expanded[g.cat.id]}
                        <button class="more-rows" on:click={() => toggleCat(g.cat.id)}>
                            {expanded[g.cat.id] ? 'Show less' : `Show ${g.rows.length - shownN} more`}
                        </button>
                    {/if}
                </section>
            {/each}
        </div>

    <!-- CONTRACTS -->
    {:else if activeSubTab === 'contracts'}
        {#if contractView.length === 0}<div class="q-empty">Nothing here for this filter.</div>{/if}
        {#each contractView as g (g.cat.id)}
            <div class="group-head" style="--c: {g.cat.c};"><Icon name={g.cat.icon} size={15} /> {g.cat.label}</div>
            <div class="contracts">
                {#each g.rows as q (q.id)}
                    {@const ready = getRepeatableClaimCount(q)}
                    {@const inCycle = getRepeatableProgress(q) - ready * q.target}
                    {@const pct = ready > 0 ? 100 : Math.min(100, (inCycle / q.target) * 100)}
                    {@const times = repeatableCounts[q.id] || 0}
                    <div class="contract" class:contract-ready={ready > 0} style="--c: {g.cat.c};">
                        <div class="ct-ring" style="--p: {pct};">
                            <span class="ct-ring-in">{#if ready > 0}<Icon name="check" size={18} stroke={2.6} />{:else}{Math.round(pct)}%{/if}</span>
                        </div>
                        <div class="ct-body">
                            <div class="ct-desc">{q.desc}</div>
                            <div class="ct-meta">
                                <span><Icon name="gem" size={10} /> {q.reward.toLocaleString()} each</span>
                                {#if times > 0}<span class="ct-times">×{times} done</span>{/if}
                                {#if ready === 0}<span>{fmt(inCycle)}/{fmt(q.target)}</span>{/if}
                            </div>
                        </div>
                        {#if ready > 0}
                            <button class="claim claim-cyan" on:click={() => claimRepeatable(q)}>Claim ×{ready} · {(q.reward * ready).toLocaleString()}</button>
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}

    <!-- ACHIEVEMENTS -->
    {:else if activeSubTab === 'achievements'}
        {#if achievementView.length === 0}<div class="q-empty">Nothing here for this filter.</div>{/if}
        {#each achievementView as g (g.cat.id)}
            <div class="group-head" style="--c: {g.cat.c};"><Icon name={g.cat.icon} size={15} /> {g.cat.label} <span class="gh-count">{g.done}/{g.total}</span></div>
            <div class="medals">
                {#each g.rows as a (a.id)}
                    {@const progress = getAchievementProgress(a)}
                    {@const state = aState(a)}
                    <div class="medal medal-{state}" style="--c: {g.cat.c};">
                        <div class="md-badge">
                            <span class="md-hex"><Icon name={state === 'done' ? 'check' : catById[a.cat]?.icon || 'star'} size={22} stroke={state === 'done' ? 2.8 : 1.9} /></span>
                        </div>
                        <div class="md-desc">{a.desc}</div>
                        {#if state === 'ready'}
                            <button class="claim claim-purple" on:click={() => claimAchievement(a)}>Claim <Icon name="gem" size={11} stroke={2.4} /> {a.reward.toLocaleString()}</button>
                        {:else if state === 'done'}
                            <span class="md-earned">Earned · {a.reward.toLocaleString()} BE</span>
                        {:else}
                            <div class="md-bar"><div class="md-fill" style="width: {Math.min(100, (progress / a.target) * 100)}%;"></div></div>
                            <span class="md-meta">{fmt(Math.min(progress, a.target))}/{fmt(a.target)} · <Icon name="gem" size={10} /> {a.reward.toLocaleString()}</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}
    {/if}
</section>

<style>
    .qp { max-width: 1180px; margin: 0 auto; padding-bottom: 40px; display: flex; flex-direction: column; gap: 18px; }

    /* Hero */
    .qh {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
        padding: 22px 26px; border-radius: 24px;
        background: radial-gradient(60% 140% at 0% 50%, rgba(250,204,21,0.16), transparent 65%), linear-gradient(120deg, #15130a, #0b0e1a 60%);
        border: 1px solid rgba(250,204,21,0.25);
    }
    .qh-ring { position: relative; width: 108px; height: 108px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .qh-ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring-bg { fill: none; stroke: rgba(51,65,85,0.6); stroke-width: 10; }
    .ring-fg { fill: none; stroke: #facc15; stroke-width: 10; stroke-linecap: round; filter: drop-shadow(0 0 6px rgba(250,204,21,0.6)); transition: stroke-dasharray 0.6s ease; }
    .qh-pct { position: relative; font-size: 24px; font-weight: 900; color: #fef9c3; line-height: 1; }
    .qh-pct-lbl { position: relative; font-size: 9px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #a1a1aa; }
    .qh-text { flex: 1; min-width: 220px; }
    .qh-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; color: #facc15; }
    .qh-title { font-size: clamp(24px, 3vw, 34px); font-weight: 900; color: #fff; letter-spacing: -0.4px; margin-top: 6px; }
    .qh-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .qh-claim { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding: 14px 18px; border-radius: 18px; background: rgba(2,6,23,0.5); border: 1px solid rgba(148,163,184,0.15); min-width: 220px; }
    .qh-claim-on { border-color: rgba(52,211,153,0.4); background: radial-gradient(circle at 100% 0%, rgba(52,211,153,0.18), transparent 70%), rgba(2,6,23,0.5); }
    .qc-label { font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #64748b; }
    .qh-claim-on .qc-label { color: #34d399; }
    .qc-val { display: inline-flex; align-items: center; gap: 6px; font-size: 22px; font-weight: 900; color: #ecfdf5; }
    .qc-none { font-size: 12px; color: #64748b; }
    .qc-btn { position: relative; overflow: hidden; margin-top: 4px; padding: 11px 20px; border-radius: 13px; border: none; cursor: pointer; font-size: 13px; font-weight: 900; color: #052e16; background: linear-gradient(135deg, #6ee7b7, #10b981); box-shadow: 0 6px 20px rgba(16,185,129,0.4); animation: qcPulse 2.2s ease-in-out infinite; }
    .qc-btn:hover { transform: translateY(-1px); }
    @keyframes qcPulse { 50% { box-shadow: 0 6px 28px rgba(16,185,129,0.7); } }

    /* Tabs */
    .qtabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .qtab {
        position: relative; display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer;
        padding: 13px 16px; border-radius: 16px;
        background: rgba(12,16,28,0.6); border: 1px solid rgba(71,85,105,0.25);
    }
    .qtab:hover { border-color: color-mix(in srgb, var(--c) 45%, transparent); }
    .qtab-on { background: linear-gradient(140deg, color-mix(in srgb, var(--c) 18%, transparent), rgba(12,16,28,0.7)); border-color: color-mix(in srgb, var(--c) 60%, transparent); box-shadow: 0 8px 24px color-mix(in srgb, var(--c) 15%, transparent); }
    .qt-ico { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); flex-shrink: 0; }
    .qt-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .qt-label { font-size: 14px; font-weight: 900; color: #e2e8f0; }
    .qtab-on .qt-label { color: #fff; }
    .qt-note { font-size: 11px; color: #64748b; }
    .qt-badge { margin-left: auto; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 100px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff; background: #ef4444; box-shadow: 0 2px 8px rgba(239,68,68,0.45); }

    .qfilters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .qf { padding: 6px 14px; border-radius: 100px; cursor: pointer; font-size: 12px; font-weight: 800; color: #94a3b8; background: rgba(15,23,42,0.6); border: 1px solid rgba(71,85,105,0.3); }
    .qf:hover { color: #e2e8f0; }
    .qf-on { color: #0b1020; background: #e2e8f0; border-color: #e2e8f0; }
    .qf-hint { margin-left: 8px; font-size: 11px; color: #64748b; }
    .q-empty { padding: 30px; text-align: center; font-size: 13px; color: #64748b; font-style: italic; border-radius: 16px; border: 1px dashed rgba(71,85,105,0.35); }

    /* Milestone categories */
    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(520px, 100%), 1fr)); gap: 14px; align-items: start; }
    .cat { border-radius: 20px; padding: 16px; background: linear-gradient(170deg, color-mix(in srgb, var(--c) 8%, rgba(12,16,28,0.8)), rgba(10,13,24,0.8) 50%); border: 1px solid color-mix(in srgb, var(--c) 20%, rgba(71,85,105,0.2)); }
    .cat-head { display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto auto; column-gap: 10px; row-gap: 8px; align-items: center; margin-bottom: 12px; }
    .cat-ico { grid-row: 1 / span 2; width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
    .cat-name { font-size: 14px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: var(--c); }
    .cat-count { font-size: 12px; font-weight: 900; color: #94a3b8; font-variant-numeric: tabular-nums; }
    .cat-bar { grid-column: 2 / span 2; height: 5px; border-radius: 5px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .cat-fill { height: 100%; border-radius: 5px; background: var(--c); transition: width 0.5s; }

    .rows { display: flex; flex-direction: column; gap: 5px; }
    .row { display: flex; align-items: center; gap: 11px; padding: 9px 11px; border-radius: 12px; background: rgba(15,23,42,0.55); border: 1px solid rgba(51,65,85,0.3); }
    .row-dot { width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(100,116,139,0.45); color: #0b1020; }
    .row-body { flex: 1; min-width: 0; }
    .row-desc { font-size: 12.5px; font-weight: 700; color: #e2e8f0; }
    .row-bar { height: 4px; border-radius: 4px; background: rgba(30,41,59,0.9); overflow: hidden; margin-top: 6px; }
    .row-fill { height: 100%; border-radius: 4px; background: var(--c); }
    .row-meta { flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; color: #64748b; font-variant-numeric: tabular-nums; }
    .row-meta b { color: #cbd5e1; }
    .row-ready { background: color-mix(in srgb, var(--c) 10%, rgba(15,23,42,0.6)); border-color: color-mix(in srgb, var(--c) 45%, transparent); box-shadow: inset 3px 0 0 var(--c); }
    .row-ready .row-dot { border-color: var(--c); background: color-mix(in srgb, var(--c) 30%, transparent); animation: dotPulse 1.6s ease-in-out infinite; }
    @keyframes dotPulse { 50% { box-shadow: 0 0 10px var(--c); } }
    .row-done { opacity: 0.5; }
    .row-done .row-dot { background: #34d399; border-color: #34d399; }
    .row-done .row-desc { text-decoration: line-through; color: #64748b; }
    .more-rows { width: 100%; margin-top: 8px; padding: 8px; border-radius: 10px; cursor: pointer; font-size: 11.5px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 6%, transparent); border: 1px dashed color-mix(in srgb, var(--c) 30%, transparent); }
    .more-rows:hover { background: color-mix(in srgb, var(--c) 12%, transparent); }

    .claim {
        flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;
        padding: 7px 13px; border-radius: 10px; border: none; cursor: pointer;
        font-size: 11px; font-weight: 900; color: #0b1020;
        background: linear-gradient(180deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c));
        box-shadow: 0 4px 14px color-mix(in srgb, var(--c) 40%, transparent);
    }
    .claim:hover { transform: translateY(-1px); box-shadow: 0 6px 20px color-mix(in srgb, var(--c) 60%, transparent); }
    .claim-cyan { --c: #22d3ee; }
    .claim-purple { --c: #c084fc; }

    .group-head { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: var(--c); }
    .gh-count { margin-left: auto; font-size: 11px; color: #64748b; letter-spacing: 0; }

    /* Contracts */
    .contracts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 10px; }
    .contract { display: flex; align-items: center; gap: 14px; padding: 13px 15px; border-radius: 16px; background: rgba(12,16,28,0.65); border: 1px solid rgba(71,85,105,0.25); }
    .contract-ready { border-color: rgba(34,211,238,0.5); background: radial-gradient(circle at 0% 50%, rgba(34,211,238,0.12), transparent 60%), rgba(12,16,28,0.65); }
    .ct-ring { --p: 0; width: 48px; height: 48px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: conic-gradient(var(--c) calc(var(--p) * 1%), rgba(51,65,85,0.55) 0); }
    .contract-ready .ct-ring { background: conic-gradient(#22d3ee 100%, transparent 0); box-shadow: 0 0 14px rgba(34,211,238,0.45); }
    .ct-ring-in { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #0b1020; font-size: 10px; font-weight: 900; color: #cbd5e1; }
    .contract-ready .ct-ring-in { color: #22d3ee; }
    .ct-body { flex: 1; min-width: 0; }
    .ct-desc { font-size: 13px; font-weight: 800; color: #e2e8f0; }
    .ct-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; font-size: 11px; font-weight: 700; color: #64748b; }
    .ct-meta span { display: inline-flex; align-items: center; gap: 3px; }
    .ct-times { color: #22d3ee; }

    /* Achievements as medals */
    .medals { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .medal {
        display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;
        padding: 18px 14px 14px; border-radius: 18px;
        background: radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--c) 10%, transparent), transparent 70%), rgba(12,16,28,0.65);
        border: 1px solid rgba(71,85,105,0.25);
    }
    .md-badge { position: relative; width: 62px; height: 68px; display: flex; align-items: center; justify-content: center; }
    .md-hex {
        width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
        clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
        background: linear-gradient(160deg, #273248, #141b2c); color: #64748b;
    }
    .md-desc { font-size: 12px; font-weight: 800; color: #cbd5e1; line-height: 1.35; min-height: 32px; }
    .md-bar { width: 100%; height: 5px; border-radius: 5px; background: rgba(30,41,59,0.9); overflow: hidden; }
    .md-fill { height: 100%; border-radius: 5px; background: var(--c); }
    .md-meta { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; color: #64748b; font-variant-numeric: tabular-nums; }
    .md-earned { font-size: 11px; font-weight: 800; color: #fcd34d; }
    .medal-progress .md-hex { color: color-mix(in srgb, var(--c) 55%, #64748b); }
    .medal-ready { border-color: color-mix(in srgb, var(--c) 55%, transparent); box-shadow: 0 0 24px color-mix(in srgb, var(--c) 18%, transparent); }
    .medal-ready .md-hex { color: #fff; background: linear-gradient(160deg, color-mix(in srgb, var(--c) 85%, #fff), color-mix(in srgb, var(--c) 60%, #000)); animation: medalGlow 2s ease-in-out infinite; }
    @keyframes medalGlow { 50% { filter: brightness(1.25); } }
    .medal-done { border-color: rgba(251,191,36,0.35); }
    .medal-done .md-hex { color: #3b2a05; background: linear-gradient(160deg, #fde68a, #f59e0b 55%, #b45309); }
    .medal-done .md-badge { filter: drop-shadow(0 0 10px rgba(251,191,36,0.4)); }

    @media (max-width: 760px) {
        .qtabs { grid-template-columns: 1fr; }
        .qh { padding: 18px; }
        .qh-claim { align-items: flex-start; width: 100%; }
        .medals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
</style>
